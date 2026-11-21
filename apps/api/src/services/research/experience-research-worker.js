import os from 'node:os';
import crypto from 'node:crypto';
import { ExperienceResearchJob, ExperienceWorkspace } from '../../models.js';
import { searchAllPublic } from '../search/global-search.js';
import { scrapePublicPage, validatePublicUrl } from '../../providers.js';
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
    sourceType: 'web', alternativeFor: null, reviewStatus: 'unreviewed', analystNote: '',
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
  const run = {
    runId: job.jobId, query: job.query, plannerKind: job.plannerKind,
    sourceCount: mergedSources.length,
    successfulSearches: Number(live.meta?.successfulSearches || 0),
    providerNames: [...new Set([...(live.meta?.providerNames || []), ...sources.flatMap(source => source.providers || [])].filter(Boolean))].slice(0, 8),
    coverage: clean(live.meta?.coverage || 'Bounded public-source discovery; coverage is not exhaustive.', 500),
    recordedAt: new Date(),
  };
  const researchRuns = [...(workspace.researchRuns || []).filter(item => item.runId !== job.jobId), run]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()).slice(-20);
  await ExperienceWorkspace.updateOne({ ownerId: job.ownerId, workspaceId: job.workspaceId }, {
    $set: { sources: mergedSources, researchRuns },
  });
  return { sourceCount: mergedSources.length, run };
}

async function executeJob(job, getUserProviderKeys) {
  let candidateSources = Array.isArray(job.candidateSources) ? job.candidateSources : [];
  let searchMeta = job.searchMeta || {};
  if (!job.searchCompleted) {
    await appendEvent(job.jobId, 'planning', 'Preparing your request and provider configuration.', researchJobProgress('planning'));
    if (await finishRequested(job)) return;
    const providerKeys = await getUserProviderKeys(job.ownerId).catch(() => ({}));
    await appendEvent(job.jobId, 'searching', 'Searching public sources against your complete request.', researchJobProgress('searching'));
    const live = await searchAllPublic(job.query, providerKeys || {});
    if (await finishRequested(job)) return;
    if (!(live.results || []).length && Number(live.meta?.failedSearches || 0) > 0) {
      throw new Error('Public search providers are temporarily unavailable.');
    }
    candidateSources = [];
    for (const item of (Array.isArray(live.results) ? live.results : []).slice(0, 16)) {
      try { candidateSources.push(toWorkspaceSource(item)); } catch {}
    }
    searchMeta = {
      successfulSearches: Number(live.meta?.successfulSearches || 0),
      failedSearches: Number(live.meta?.failedSearches || 0),
      providerNames: [...new Set([...(live.meta?.providerNames || []), ...candidateSources.flatMap(source => source.providers || [])].filter(Boolean))].slice(0, 8),
      coverage: clean(live.meta?.coverage || 'Bounded public-source discovery; coverage is not exhaustive.', 500),
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
      await failJob(job, error);
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
