import os from 'node:os';
import crypto from 'node:crypto';
import { ExperienceResearchJob, ExperienceWorkspace } from '../../models.js';
import { searchAllPublic, rankPublicResults } from '../search/global-search.js';
import { understandSearchIntentWithGroq } from '../search/groq-intent.js';
import { understandSearchIntent } from '../search/intent-understanding.js';
import { evaluateAnswerStatus } from './answer-status.js';
import { ResolvedIntentSchema, TypedClaimSchema } from './research-contracts.js';
import { buildResearchWorkflow, finalizeResearchWorkflow } from './workflow-engine.js';
import { buildResearchQueryPlan } from './research-query-plan.js';
import { scrapePublicPage, validatePublicUrl } from '../../providers.js';
import { analyzeEvidenceClaims } from '../../claim-analysis.js';
import { researchJobProgress, researchJobRetryDelayMs, RESEARCH_JOB_LEASE_MS } from './research-job-state.js';

const workerId = (process.env.RENDER_INSTANCE_ID || os.hostname()) + ':' + process.pid + ':' + crypto.randomUUID().slice(0, 8);
const POLL_MS = Math.max(1000, Number(process.env.EXPERIENCE_RESEARCH_POLL_MS || 2000));
let active = false;
let timer = null;

const clean = (value, max = 300) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

async function appendEvent(jobId, stage, message, progress, extra = {}) {
  const now = new Date();
  await ExperienceResearchJob.updateOne({ jobId, leaseOwner: workerId }, {
    $set: { stage, progress, heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + RESEARCH_JOB_LEASE_MS), ...extra },
    $push: { events: { $each: [{ stage, message: clean(message, 240), progress, at: now }], $slice: -30 } },
  });
}

async function finishRequested(job) {
  const latest = await ExperienceResearchJob.findOne({ jobId: job.jobId, leaseOwner: workerId }).lean();
  if (!latest) return true;
  if (latest.cancelRequested) {
    await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
      $set: { status: 'cancelled', stage: 'cancelled', progress: 100, finishedAt: new Date(), leaseOwner: '', leaseExpiresAt: null },
      $unset: { activeKey: 1 },
      $push: { events: { $each: [{ stage: 'cancelled', message: 'Research was cancelled. Evidence already saved remains available.', progress: 100, at: new Date() }], $slice: -30 } },
    });
    return true;
  }
  if (latest.pauseRequested) {
    await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
      $set: { status: 'paused', stage: 'paused', leaseOwner: '', leaseExpiresAt: null, pauseRequested: false },
      $push: { events: { $each: [{ stage: 'paused', message: 'Research paused safely. Resume it whenever you are ready.', progress: latest.progress || 0, at: new Date() }], $slice: -30 } },
    });
    return true;
  }
  return false;
}

async function claimNextJob() {
  const now = new Date();
  await ExperienceResearchJob.updateMany({ status: 'running', leaseExpiresAt: { $lte: now }, attempts: { $gte: 3 } }, {
    $set: { status: 'failed', stage: 'failed', progress: 100, finishedAt: now, leaseOwner: '', leaseExpiresAt: null, errorCode: 'WORKER_INTERRUPTED', errorMessage: 'The worker stopped repeatedly before this job could finish.' },
    $unset: { activeKey: 1 },
    $push: { events: { $each: [{ stage: 'failed', message: 'The worker stopped repeatedly. Start a new research run; saved evidence remains available.', progress: 100, at: now }], $slice: -30 } },
  });
  return ExperienceResearchJob.findOneAndUpdate({
    attempts: { $lt: 3 },
    $or: [
      { status: 'queued', nextRunAt: { $lte: now } },
      { status: 'running', leaseExpiresAt: { $lte: now } },
    ],
  }, {
    $set: {
      status: 'running', leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + RESEARCH_JOB_LEASE_MS),
      heartbeatAt: now, startedAt: now,
    },
    $inc: { attempts: 1 },
  }, { new: true, sort: { createdAt: 1 } }).lean();
}

function toWorkspaceSource(item, checked = null) {
  const url = validatePublicUrl(item.url).href;
  const host = new URL(url).hostname.replace(/^www\./, '');
  const linkCheck = checked || { status: 'not_checked', checkedAt: null, httpStatus: null, finalUrl: null, redirects: [], note: 'This source was not link-checked during this research run.' };
  return {
    url, title: clean(item.title || item.name || host, 500),
    excerpt: clean(item.excerpt || item.description || '', 2000),
    publisher: clean(item.publisher || host, 240),
    provider: clean(item.provider || (item.providers || []).join(', '), 160),
    providers: [...new Set([...(item.providers || []), ...(item.provider ? [item.provider] : [])].map(value => clean(value, 160)).filter(Boolean))].slice(0, 8),
    sourceType: 'web', relevance: item.relevance || undefined, alternativeFor: null, reviewStatus: 'unreviewed', analystNote: '',
    publishedAt: item.publishedAt || null, retrievedAt: new Date().toISOString(),
    linkCheck, savedAt: new Date(),
  };
}

async function checkTopSources(sources) {
  return Promise.all(sources.map(async source => {
    const checkedAt = new Date().toISOString();
    try {
      const page = await scrapePublicPage(source.url);
      const finalUrl = page?.finalUrl ? validatePublicUrl(page.finalUrl).href : source.url;
      return {
        ...source,
        linkCheck: {
          status: page?.readable === false ? 'not_confirmed' : 'reachable',
          checkedAt, httpStatus: page?.httpStatus || null, finalUrl,
          redirects: Array.isArray(page?.redirects) ? page.redirects.slice(0, 5) : [],
          note: page?.readable === false
            ? clean(page?.note || 'The server responded, but readable page content was unavailable.', 500)
            : finalUrl !== source.url
              ? 'A readable public destination responded after redirects. This confirms access at check time, not factual accuracy.'
              : 'A readable public page responded at check time. This does not verify its claims.',
        },
      };
    } catch {
      return {
        ...source,
        linkCheck: { status: 'not_confirmed', checkedAt, httpStatus: null, finalUrl: null, redirects: [], note: 'ADVERSE could not confirm readable page access. This is not proof that the site is dead.' },
      };
    }
  }));
}

async function saveJobResults(job, sources, live) {
  const workspace = await ExperienceWorkspace.findOne({ ownerId: job.ownerId, workspaceId: job.workspaceId }).lean();
  if (!workspace) throw Object.assign(new Error('The research workspace no longer exists.'), { code: 'WORKSPACE_NOT_FOUND', retryable: false });
  const existing = new Map((workspace.sources || []).map(source => [source.url, source]));
  for (const source of sources) {
    const previous = existing.get(source.url);
    existing.set(source.url, {
      ...source,
      reviewStatus: previous?.reviewStatus || 'unreviewed',
      analystNote: previous?.analystNote || '',
      alternativeFor: previous?.alternativeFor || null,
      savedAt: previous?.savedAt || new Date(),
    });
  }
  const mergedSources = [...existing.values()].slice(0, 24);
  const evidenceForAnalysis = mergedSources.map(source => ({
    id: source.url, title: source.title, url: source.url, publisher: source.publisher,
    excerpt: source.excerpt, publishedAt: source.publishedAt, retrievedAt: source.retrievedAt,
    verificationStatus: 'unverified',
  }));
  const extraction = analyzeEvidenceClaims(evidenceForAnalysis, 40);
  const previousClaims = Array.isArray(workspace.claims) ? workspace.claims : [];
  const claimsById = new Map(previousClaims.map(claim => [claim.claimId, claim]));
  for (const candidate of extraction.claims || []) {
    const evidenceLinks = (candidate.sources || []).slice(0, 12)
      .filter(source => mergedSources.some(saved => saved.url === source.url))
      .map(source => ({ url: source.url, role: 'context' }));
    if (!evidenceLinks.length) continue;
    const normalizedClaim = clean(candidate.claim, 1000).toLocaleLowerCase().replace(/\s+/g, ' ');
    const claimId = 'auto-' + crypto.createHash('sha256').update(normalizedClaim).digest('hex').slice(0, 32);
    const previous = claimsById.get(claimId);
    if (previous) {
      const links = new Map((previous.evidenceLinks || []).map(link => [link.url, link]));
      for (const link of evidenceLinks) if (!links.has(link.url)) links.set(link.url, link);
      claimsById.set(claimId, { ...previous, evidenceLinks: [...links.values()].slice(0, 12), updatedAt: new Date() });
    } else {
      claimsById.set(claimId, {
        claimId,
        text: clean(candidate.claim, 1000),
        assessment: 'unreviewed',
        rationale: clean('Automatically extracted from saved source excerpts. ' + candidate.assessment + ' This is a research lead, not a verified fact. Review the original sources before making a judgement.', 1000),
        evidenceLinks,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  const claims = [...claimsById.values()].slice(0, 50);
  const typedClaimsById = new Map((workspace.typedClaims || []).map(claim => [claim.claimId, claim]));
  for (const candidate of extraction.claims || []) {
    const statement = clean(candidate.claim, 1000);
    const sourceIds = [...new Set((candidate.sources || [])
      .map(source => String(source.url || '').trim())
      .filter(url => mergedSources.some(saved => saved.url === url)))].slice(0, 12);
    if (!statement || !sourceIds.length) continue;
    const claimId = 'typed-' + crypto.createHash('sha256').update(statement.toLocaleLowerCase()).digest('hex').slice(0, 32);
    const parsed = TypedClaimSchema.safeParse({
      claimId,
      type: 'general-fact',
      statement,
      value: { amount: null, currency: null, unit: null, text: statement },
      entityId: null,
      academicSession: null,
      sourceIds,
      assessment: 'unreviewed',
      confidence: 0
    });
    if (parsed.success) typedClaimsById.set(claimId, parsed.data);
  }
  const typedClaims = [...typedClaimsById.values()].slice(0, 80);
  const answerStatus = evaluateAnswerStatus({
    intent: live.meta?.resolvedIntent || { type: 'general-research' },
    claims: typedClaims,
    sourceCount: mergedSources.length,
    searchCompleted: true
  });
  const workflowSeed = live.meta?.workflow || buildResearchWorkflow(
    live.meta?.resolvedIntent || { type: live.meta?.semanticType || 'general-research' },
    job.jobId + '-workflow'
  );
  const workflow = finalizeResearchWorkflow(workflowSeed, {
    entities: live.meta?.resolvedIntent?.entities || [],
    sourceCount: mergedSources.length,
    checkedCount: mergedSources.filter(source => source.linkCheck?.checkedAt).length,
    claimCount: typedClaims.length,
    comparisonCount: 0,
    answerStatus,
    evidenceIds: mergedSources.map(source => source.url)
  });
  const run = {
    runId: job.jobId, query: job.query, plannerKind: job.plannerKind,
    sourceCount: mergedSources.length,
    successfulSearches: Number(live.meta?.successfulSearches || 0),
    providerNames: [...new Set(sources.flatMap(source => [...(source.providers || []), ...(source.provider ? [source.provider] : [])]).filter(Boolean))].slice(0, 8),
    coverage: clean(live.meta?.coverage || 'Bounded public-source discovery; coverage is not exhaustive.', 500),
    recordedAt: new Date(),
  };
  const researchRuns = [...(workspace.researchRuns || []).filter(item => item.runId !== job.jobId), run]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()).slice(-20);
  await ExperienceWorkspace.updateOne({ ownerId: job.ownerId, workspaceId: job.workspaceId }, {
    $set: { sources: mergedSources, claims, typedClaims, resolvedIntent: live.meta?.resolvedIntent || undefined, workflow, answerStatus, pipelineVersion: 'intent-evidence-v1', researchRuns },
  });
  return { sourceCount: mergedSources.length, claimCount: claims.length, typedClaimCount: typedClaims.length, answerStatus, workflow, run };
}

async function executeJob(job, getUserProviderKeys) {
  let candidateSources = Array.isArray(job.candidateSources) ? job.candidateSources : [];
  let searchMeta = job.searchMeta || {};
  if (!job.searchCompleted) {
    await appendEvent(job.jobId, 'planning', 'Preparing your request and provider configuration.', researchJobProgress('planning'));
    if (await finishRequested(job)) return;
    const providerKeys = await getUserProviderKeys(job.ownerId).catch(() => ({}));
    await appendEvent(job.jobId, 'planning', 'Analysing the complete sentence and expanding it into focused sub-questions.', researchJobProgress('planning'));
    let semantic = null;
    try {
      semantic = await understandSearchIntentWithGroq(job.query, { providerKeys: providerKeys || {} });
    } catch {
      // Deterministic intent rules remain available if Groq and Gemini are unavailable.
    }
    const resolved = semantic || understandSearchIntent(job.query);
    const entityKinds = new Set(['institution', 'programme', 'location', 'person', 'organisation', 'product', 'date', 'unknown']);
    const resolvedIntent = ResolvedIntentSchema.parse({
      originalQuery: job.query,
      type: resolved.type || 'general-research',
      goal: clean(resolved.goal || resolved.label || 'Research the requested subject', 300),
      subject: clean(resolved.subject || resolved.searchQuery || job.query, 300),
      entities: (Array.isArray(resolved.entities) ? resolved.entities : []).map(item => ({
        text: clean(typeof item === 'string' ? item : item?.text, 150),
        ...(typeof item === 'object' && item?.matchedText ? { matchedText: clean(item.matchedText, 150) } : {}),
        ...(typeof item === 'object' && item?.country ? { country: clean(item.country, 100) } : {}),
        kind: entityKinds.has(item?.kind) ? item.kind : 'unknown',
        role: clean(item?.role || 'context', 80)
      })).filter(item => typeof item.text === 'string' && item.text.trim()).slice(0, 20),
      constraints: Array.isArray(resolved.constraints) ? resolved.constraints.filter(value => typeof value === 'string').map(value => clean(value, 200)).filter(Boolean).slice(0, 20) : [],
      preferences: { sourcePreference: resolved.sourcePreference || 'balanced', ...(resolved.preferences?.country ? { country: clean(resolved.preferences.country, 100) } : {}), ...(resolved.preferences?.currency ? { currency: clean(resolved.preferences.currency, 8) } : {}) },
      subgoals: Array.isArray(resolved.subgoals) ? resolved.subgoals.filter(value => typeof value === 'string').map(value => clean(value, 200)).filter(Boolean).slice(0, 12) : [],
      clarificationNeeded: Boolean(resolved.clarificationNeeded),
      ambiguities: Array.isArray(resolved.ambiguities) ? resolved.ambiguities.filter(value => typeof value === 'string').map(value => clean(value, 200)).filter(Boolean).slice(0, 10) : [],
      confidence: Math.max(0, Math.min(1, Number(resolved.confidence) || 0))
    });
    const workflow = buildResearchWorkflow(resolvedIntent, job.jobId + '-workflow');
    const queries = buildResearchQueryPlan(job.query, resolved);
    await appendEvent(job.jobId, 'searching', 'Searching the original request and ' + Math.max(0, queries.length - 1) + ' focused sub-questions.', researchJobProgress('searching'));
    const outcomes = await Promise.allSettled(queries.map(query => searchAllPublic(query, providerKeys || {}, { intent: resolved })));
    if (await finishRequested(job)) return;
    const completedSearches = outcomes.filter(item => item.status === 'fulfilled').map(item => item.value);
    if (!completedSearches.length) throw new Error('Public search providers are temporarily unavailable.');
    const combined = new Map();
    for (const result of completedSearches.flatMap(item => Array.isArray(item.results) ? item.results : [])) {
      const rawUrl = String(result.url || '').trim();
      if (!rawUrl) continue;
      const key = rawUrl.toLowerCase().split('#')[0];
      if (!combined.has(key)) combined.set(key, result);
      else {
        const previous = combined.get(key);
        combined.set(key, {
          ...previous,
          providers: [...new Set([...(previous.providers || []), ...(result.providers || []), ...(previous.provider ? [previous.provider] : []), ...(result.provider ? [result.provider] : [])])].slice(0, 8),
        });
      }
    }
    const rankedResults = rankPublicResults([...combined.values()], semantic?.searchQuery || job.query, semantic || {});
    const liveResults = rankedResults.slice(0, 16);
    candidateSources = [];
    for (const item of liveResults) {
      try { candidateSources.push(toWorkspaceSource(item)); } catch {}
    }
    const successfulSearches = completedSearches.reduce((sum, item) => sum + Number(item.meta?.successfulSearches || 0), 0);
    const failedSearches = outcomes.reduce((sum, item) => sum + (item.status === 'rejected' ? 1 : Number(item.value?.meta?.failedSearches || 0)), 0);
    searchMeta = {
      successfulSearches,
      failedSearches,
      queries,
      semanticType: resolved.type || 'general-research',
      intentProvider: semantic?.provider || 'rules-fallback',
      resolvedIntent,
      workflow,
      providerNames: [...new Set(candidateSources.flatMap(source => [...(source.providers || []), ...(source.provider ? [source.provider] : [])]).filter(Boolean))].slice(0, 8),
      coverage: 'Bounded public-source discovery across ' + queries.length + ' intent-focused searches. Provider indexes are not exhaustive.',
    };
    const checkpoint = await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
      $set: { candidateSources, searchMeta, searchCompleted: true, successfulSearches: searchMeta.successfulSearches, providerNames: searchMeta.providerNames, coverage: searchMeta.coverage },
    });
    if (!checkpoint.matchedCount) return;
  } else {
    await appendEvent(job.jobId, 'checking', 'Resuming from the saved source-discovery checkpoint.', researchJobProgress('checking'));
  }
  if (await finishRequested(job)) return;

  let finalSources = Array.isArray(job.checkedSources) ? job.checkedSources : [];
  if (!job.checksCompleted) {
    await appendEvent(job.jobId, 'checking', 'Checking source destinations and organizing the remaining results.', researchJobProgress('checking'));
    const checked = await checkTopSources(candidateSources.slice(0, 8));
    const checkedByUrl = new Map(checked.map(source => [source.url, source]));
    finalSources = candidateSources.map(source => checkedByUrl.get(source.url) || source).slice(0, 16);
    const checkpoint = await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
      $set: { checkedSources: finalSources, checksCompleted: true },
    });
    if (!checkpoint.matchedCount) return;
  }
  if (await finishRequested(job)) return;
  await appendEvent(job.jobId, 'saving', 'Saving sources and the research run to your workspace.', researchJobProgress('saving'));
  const live = { meta: searchMeta };
  const saved = await saveJobResults(job, finalSources, live);
  await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
    $set: {
      status: 'completed', stage: 'completed', progress: 100,
      sourceCount: saved.sourceCount,
      resolvedIntent: searchMeta.resolvedIntent || undefined,
      answerStatus: saved.answerStatus,
      workflow: saved.workflow,
      pipelineVersion: 'intent-evidence-v1',
      successfulSearches: Number(searchMeta.successfulSearches || 0),
      providerNames: saved.run.providerNames, coverage: saved.run.coverage,
      finishedAt: new Date(), leaseOwner: '', leaseExpiresAt: null,
      errorCode: '', errorMessage: '',
    },
    $unset: { activeKey: 1 },
    $push: { events: { $each: [{ stage: 'completed', message: saved.sourceCount + ' sources are now saved in your workspace.', progress: 100, at: new Date() }], $slice: -30 } },
  });
}
async function failJob(job, error) {
  const latest = await ExperienceResearchJob.findOne({ jobId: job.jobId, leaseOwner: workerId }).lean();
  if (!latest) return;
  const retryable = error?.retryable !== false && latest.attempts < latest.maxAttempts;
  const now = new Date();
  if (retryable) {
    const delay = researchJobRetryDelayMs(latest.attempts);
    await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
      $set: {
        status: 'queued', stage: 'queued', nextRunAt: new Date(now.getTime() + delay),
        leaseOwner: '', leaseExpiresAt: null,
        errorCode: 'TEMPORARY_RESEARCH_FAILURE',
        errorMessage: 'A provider or temporary service failed. ADVERSE will retry automatically.',
      },
      $push: { events: { $each: [{ stage: 'queued', message: 'A temporary issue occurred. ADVERSE scheduled an automatic retry.', progress: latest.progress || 0, at: now }], $slice: -30 } },
    });
    return;
  }
  await ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId }, {
    $set: {
      status: 'failed', stage: 'failed', progress: 100, finishedAt: now,
      leaseOwner: '', leaseExpiresAt: null,
      errorCode: clean(error?.code || 'RESEARCH_FAILED', 80),
      errorMessage: error?.retryable === false ? clean(error.message, 300) : 'Research could not be completed after automatic retries.',
    },
    $unset: { activeKey: 1 },
    $push: { events: { $each: [{ stage: 'failed', message: 'Research stopped after the available retry attempts. You can start a new run; saved evidence remains.', progress: 100, at: now }], $slice: -30 } },
  });
}

export async function processNextExperienceResearchJob({ getUserProviderKeys = async () => ({}) } = {}) {
  if (active || globalThis.__ADVERSE_MONGO_READY__ !== true) return false;
  active = true;
  try {
    const job = await claimNextJob();
    if (!job) return false;
    const heartbeat = setInterval(() => {
      const now = new Date();
      void ExperienceResearchJob.updateOne({ jobId: job.jobId, leaseOwner: workerId, status: 'running' }, {
        $set: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + RESEARCH_JOB_LEASE_MS) },
      }).catch(() => {});
    }, 30_000);
    heartbeat.unref?.();
    try {
      await executeJob(job, getUserProviderKeys);
    } catch (error) {
      console.warn('ADVERSE experience research job failed:', clean(error?.message || 'unknown error', 180));
      if (!(await finishRequested(job))) await failJob(job, error);
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  } finally {
    active = false;
  }
}

export function startExperienceResearchWorker(options = {}) {
  if (timer || globalThis.__ADVERSE_MONGO_READY__ !== true) return;
  const poll = () => { void processNextExperienceResearchJob(options).catch(error => console.warn('ADVERSE research worker cycle failed:', clean(error?.message || 'worker failure', 180))); };
  timer = setInterval(poll, POLL_MS);
  timer.unref?.();
  poll();
}
