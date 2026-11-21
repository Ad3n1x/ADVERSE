import { z } from 'zod';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { evaluateAnswerStatus } from '../services/research/answer-status.js';

const workspaceRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many workspace requests. Try again in one minute.' } },
});

const workspaceSchema = z.object({
  workspaceId: z.string().trim().min(1).max(100),
  intent: z.string().trim().min(1).max(500),
  kind: z.enum(['research', 'plan', 'compare', 'create', 'explore']),
  createdAt: z.number().int().positive().optional(),
});

const sourceSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(500).optional().default(''),
  excerpt: z.string().max(2000).optional().default(''),
  publisher: z.string().max(240).optional().default(''),
  provider: z.string().max(160).optional().default(''),
  providers: z.array(z.string().max(160)).max(8).optional().default([]),
  sourceType: z.string().max(40).optional().default('web'),
  alternativeFor: z.string().url().max(2048).optional().nullable().default(null),
  reviewStatus: z.enum(['unreviewed', 'useful', 'not_relevant']).optional(),
  analystNote: z.string().max(1000).optional(),
  publishedAt: z.string().max(40).nullable().optional().default(null),
  retrievedAt: z.string().max(40).nullable().optional().default(null),
  linkCheck: z.object({
    status: z.enum(['reachable', 'not_confirmed', 'not_checked']).optional().default('not_checked'),
    checkedAt: z.string().max(40).nullable().optional().default(null),
    httpStatus: z.number().int().min(100).max(599).nullable().optional().default(null),
    finalUrl: z.string().url().max(2048).nullable().optional().default(null),
    redirects: z.array(z.object({
      status: z.number().int().min(300).max(399),
      from: z.string().url().max(2048),
      to: z.string().url().max(2048),
    })).max(5).optional().default([]),
    note: z.string().max(500).optional().default(''),
  }).optional().default({}),
});

const claimSchema = z.object({
  claimId: z.string().trim().min(1).max(100),
  text: z.string().trim().min(5).max(1000),
  assessment: z.enum(['unreviewed', 'supported', 'conflicting', 'insufficient']).optional().default('unreviewed'),
  rationale: z.string().max(1000).optional().default(''),
  evidenceLinks: z.array(z.object({
    url: z.string().url().max(2048),
    role: z.enum(['supports', 'challenges', 'context']),
  })).max(12).optional().default([]),
});
const researchRunSchema = z.object({
  runId: z.string().trim().min(1).max(100),
  query: z.string().trim().min(2).max(500),
  plannerKind: z.enum(['research', 'plan', 'compare', 'create', 'explore']),
  sourceCount: z.number().int().min(0).max(12),
  successfulSearches: z.number().int().min(0).max(20).optional().default(0),
  providerNames: z.array(z.string().trim().min(1).max(160)).max(8).optional().default([]),
  coverage: z.string().max(500).optional().default(''),
});
function canonicalSourceUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  url.hash = '';
  return url.toString();
}
function normalizeClaims(input, allowedSourceUrls) {
  const parsed = z.array(claimSchema).max(50).safeParse(input);
  if (!parsed.success) return null;
  const claimIds = new Set();
  const claims = [];
  for (const item of parsed.data) {
    if (claimIds.has(item.claimId)) return null;
    claimIds.add(item.claimId);
    const seenLinks = new Set();
    const evidenceLinks = [];
    for (const link of item.evidenceLinks) {
      let url;
      try { url = canonicalSourceUrl(link.url); } catch { return null; }
      if (!url || !allowedSourceUrls.has(url) || seenLinks.has(url)) return null;
      seenLinks.add(url);
      evidenceLinks.push({ url, role: link.role });
    }
    claims.push({ ...item, text: item.text.trim(), rationale: item.rationale.trim(), evidenceLinks });
  }
  return claims;
}

function normalizeSources(input) {
  const parsed = z.array(sourceSchema).max(24).safeParse(input);
  if (!parsed.success) return null;
  const seen = new Set();
  const sources = [];
  for (const item of parsed.data) {
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      url.hash = '';
      const canonicalUrl = url.toString();
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);

      const alternativeFor = item.alternativeFor ? canonicalSourceUrl(item.alternativeFor) : null;
      if (item.alternativeFor && !alternativeFor) return null;

      const linkCheck = item.linkCheck || {};
      const rawRedirects = Array.isArray(linkCheck.redirects) ? linkCheck.redirects : [];
      const finalUrl = linkCheck.finalUrl ? canonicalSourceUrl(linkCheck.finalUrl) : null;
      if (linkCheck.finalUrl && !finalUrl) return null;
      const redirects = [];
      let expectedFrom = canonicalUrl;
      for (const redirect of rawRedirects) {
        const from = canonicalSourceUrl(redirect.from);
        const to = canonicalSourceUrl(redirect.to);
        if (!from || !to || from !== expectedFrom) return null;
        redirects.push({ status: redirect.status, from, to });
        expectedFrom = to;
      }
      if (finalUrl && redirects.length && expectedFrom !== finalUrl) return null;
      if (finalUrl && !redirects.length && finalUrl !== canonicalUrl) return null;

      sources.push({
        ...item,
        url: canonicalUrl,
        alternativeFor,
        linkCheck: {
          status: linkCheck.status || 'not_checked',
          checkedAt: linkCheck.checkedAt || null,
          httpStatus: linkCheck.httpStatus ?? null,
          finalUrl,
          redirects,
          note: linkCheck.note || '',
        },
        providers: [...new Set((item.providers || []).map(value => value.trim()).filter(Boolean))].slice(0, 8),
      });
    } catch {
      return null;
    }
  }
  return sources;
}

export function registerExperienceWorkspaceRoutes(app, {
  requireAuth, wrap, sendError, isDb, ExperienceWorkspace, User,
}) {
  app.get('/api/v1/experience/workspaces', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    if (isDb()) {
      const records = await ExperienceWorkspace.find({ ownerId: req.user.id })
        .sort({ updatedAt: -1 }).limit(8).lean();
      return res.json({ data: records.map(item => ({
        id: item.workspaceId,
        intent: item.intent,
        kind: item.kind,
        createdAt: new Date(item.createdAt).getTime(),
      })) });
    }
    const store = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ ||= new Map();
    const records = [...(store.get(req.user.id)?.values() || [])]
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    return res.json({ data: records.map(({ sources, ...item }) => item) });
  }));

  app.post('/api/v1/experience/workspaces', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const parsed = workspaceSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_WORKSPACE', 'Workspace details are invalid.');
    const item = parsed.data;
    const createdAt = new Date(item.createdAt || Date.now());
    if (isDb()) {
      await ExperienceWorkspace.deleteMany({
        ownerId: req.user.id,
        intent: item.intent,
        workspaceId: { $ne: item.workspaceId },
      });
      const record = await ExperienceWorkspace.findOneAndUpdate(
        { ownerId: req.user.id, workspaceId: item.workspaceId },
        {
          $set: { intent: item.intent, kind: item.kind },
          $setOnInsert: { ownerId: req.user.id, workspaceId: item.workspaceId, createdAt },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      await ExperienceWorkspace.deleteMany({ ownerId: req.user.id, workspaceId: { $nin: (
        await ExperienceWorkspace.find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).select('workspaceId').limit(8).lean()
      ).map(row => row.workspaceId) } });
      return res.status(201).json({ data: {
        id: record.workspaceId, intent: record.intent, kind: record.kind,
        createdAt: new Date(record.createdAt).getTime(),
      } });
    }
    const store = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ ||= new Map();
    const records = store.get(req.user.id) || new Map();
    for (const [key, value] of records) {
      if (value.intent.toLowerCase() === item.intent.toLowerCase() && key !== item.workspaceId) records.delete(key);
    }
    const previous = records.get(item.workspaceId);
    records.set(item.workspaceId, {
      id: item.workspaceId, ownerId: req.user.id, intent: item.intent, kind: item.kind,
      createdAt: createdAt.getTime(), sources: previous?.sources || [], claims: previous?.claims || [], researchRuns: previous?.researchRuns || [], documents: previous?.documents || [], members: previous?.members || [], sharingEvents: previous?.sharingEvents || [], taskPlan: previous?.taskPlan || null,
    });
    const sorted = [...records.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    store.set(req.user.id, new Map(sorted.map(row => [row.id, row])));
    return res.status(201).json({ data: { id: item.workspaceId, intent: item.intent, kind: item.kind, createdAt: createdAt.getTime() } });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/sources', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    if (isDb()) {
      const record = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('sources').lean();
      if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
      return res.json({ data: Array.isArray(record.sources) ? record.sources : [] });
    }
    const record = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.json({ data: record.sources || [] });
  }));

  app.put('/api/v1/experience/workspaces/:workspaceId/sources', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    const sources = normalizeSources(req.body?.sources);
    if (!sources) return sendError(res, 400, 'INVALID_SOURCES', 'Provide up to 24 unique public HTTP(S) sources with valid metadata.');
    if (isDb()) {
      const record = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('sources').lean();
      if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
      const previous = new Map((record.sources || []).map(item => [item.url, item]));
      const merged = sources.map(item => {
        const old = previous.get(item.url);
        return {
          ...item,
          reviewStatus: item.reviewStatus || old?.reviewStatus || 'unreviewed',
          analystNote: item.analystNote ?? old?.analystNote ?? '',
          savedAt: old?.savedAt || new Date(),
        };
      });
      await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, { $set: { sources: merged } });
      return res.json({ data: merged, meta: { saved: merged.length } });
    }
    const record = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    record.sources = sources.map(item => ({
      ...item,
      reviewStatus: item.reviewStatus || record.sources?.find(old => old.url === item.url)?.reviewStatus || 'unreviewed',
      analystNote: item.analystNote ?? record.sources?.find(old => old.url === item.url)?.analystNote ?? '',
      savedAt: record.sources?.find(old => old.url === item.url)?.savedAt || new Date().toISOString(),
    }));
    return res.json({ data: record.sources, meta: { saved: record.sources.length } });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/claims', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    if (isDb()) {
      const record = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('claims').lean();
      if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
      return res.json({ data: Array.isArray(record.claims) ? record.claims : [] });
    }
    const record = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.json({ data: record.claims || [] });
  }));

  app.put('/api/v1/experience/workspaces/:workspaceId/claims', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('claims sources typedClaims resolvedIntent').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const allowedSourceUrls = new Set((record.sources || []).map(source => source.url));
    const parsed = normalizeClaims(req.body?.claims, allowedSourceUrls);
    if (!parsed) return sendError(res, 400, 'INVALID_CLAIMS', 'Claims must be valid, unique, and linked only to sources saved in this workspace.');
    const previous = new Map((record.claims || []).map(claim => [claim.claimId, claim]));
    const now = new Date();
    const claims = parsed.map(claim => ({
      ...claim,
      createdAt: previous.get(claim.claimId)?.createdAt || now,
      updatedAt: now,
    }));
    const typedClaims = (record.typedClaims || []).map(typed => {
      const normalized = String(typed.statement || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      const reviewed = claims.find(claim => claim.text.toLocaleLowerCase().replace(/\s+/g, ' ').trim() === normalized);
      return reviewed ? { ...typed, assessment: reviewed.assessment } : typed;
    });
    const answerStatus = evaluateAnswerStatus({
      intent: record.resolvedIntent || {},
      claims: typedClaims,
      sourceCount: (record.sources || []).length,
      searchCompleted: true
    });
    if (isDb()) await ExperienceWorkspace.updateOne(
      { ownerId: req.user.id, workspaceId },
      { $set: { claims, typedClaims, answerStatus } }
    );
    else {
      record.claims = claims.map(claim => ({ ...claim, createdAt: claim.createdAt.toISOString(), updatedAt: claim.updatedAt.toISOString() }));
      record.typedClaims = typedClaims;
      record.answerStatus = answerStatus;
    }
    const data = isDb()
      ? claims.map(claim => ({ ...claim, createdAt: claim.createdAt.toISOString(), updatedAt: claim.updatedAt.toISOString() }))
      : record.claims;
    return res.json({ data, meta: { saved: data.length, answerStatus } });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/runs', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    if (isDb()) {
      const record = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('researchRuns').lean();
      if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
      return res.json({ data: (record.researchRuns || []).slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 20) });
    }
    const record = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.json({ data: (record.researchRuns || []).slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 20) });
  }));

  app.post('/api/v1/experience/workspaces/:workspaceId/runs', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    const parsed = researchRunSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_RESEARCH_RUN', 'Research run details are invalid.');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('researchRuns').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const previous = new Map((record.researchRuns || []).map(run => [run.runId, run]));
    const existing = previous.get(parsed.data.runId);
    const run = { ...parsed.data, providerNames: [...new Set(parsed.data.providerNames)].slice(0, 8), recordedAt: existing?.recordedAt || new Date() };
    const runs = [...(record.researchRuns || []).filter(item => item.runId !== run.runId), run]
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 20);
    if (isDb()) await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, { $set: { researchRuns: runs } });
    else record.researchRuns = runs.map(item => ({ ...item, recordedAt: new Date(item.recordedAt).toISOString() }));
    const data = isDb() ? runs.map(item => ({ ...item, recordedAt: new Date(item.recordedAt).toISOString() })) : record.researchRuns;
    return res.status(201).json({ data, meta: { saved: data.length } });
  }));



  // Workspace sharing is intentionally read-only in this release. Only an owner
  // can grant/revoke access, and recipients must already have an active account.
  app.get('/api/v1/experience/shared-workspaces', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    if (isDb()) {
      const records = await ExperienceWorkspace.find({ 'members.userId': req.user.id })
        .sort({ updatedAt: -1 }).limit(50).select('workspaceId ownerId intent kind updatedAt members').lean();
      return res.json({ data: records.map(record => ({
        id: record.workspaceId, ownerId: record.ownerId, intent: record.intent, kind: record.kind,
        updatedAt: record.updatedAt,
        role: record.members.find(member => member.userId === req.user.id)?.role || 'viewer',
      })) });
    }
    const store = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ ||= new Map();
    const shared = [];
    for (const [ownerId, records] of store.entries()) {
      for (const record of records.values()) {
        const membership = (record.members || []).find(member => member.userId === req.user.id);
        if (membership) shared.push({ id: record.id, ownerId, intent: record.intent, kind: record.kind, updatedAt: record.updatedAt || record.createdAt, role: membership.role });
      }
    }
    return res.json({ data: shared.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 50) });
  }));

  app.get('/api/v1/experience/shared-workspaces/:workspaceId', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ workspaceId, 'members.userId': req.user.id }).lean()
      : (() => {
          const store = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ || new Map();
          for (const records of store.values()) {
            const item = records.get(workspaceId);
            if (item && (item.members || []).some(member => member.userId === req.user.id)) return item;
          }
          return null;
        })();
    if (!record) return sendError(res, 404, 'SHARED_WORKSPACE_NOT_FOUND', 'Shared workspace not found.');
    const membership = (record.members || []).find(member => member.userId === req.user.id);
    return res.json({ data: {
      id: record.workspaceId || record.id, ownerId: record.ownerId, intent: record.intent, kind: record.kind,
      sources: record.sources || [], claims: record.claims || [], researchRuns: record.researchRuns || [],
      documents: (record.documents || []).map(({ text, ...metadata }) => metadata),
      role: membership?.role || 'viewer',
    } });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/members', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('members sharingEvents').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.json({ data: record.members || [], audit: (record.sharingEvents || []).slice(-50).reverse() });
  }));

  app.post('/api/v1/experience/workspaces/:workspaceId/members', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_MEMBER', 'Provide the email address of an existing active ADVERSE account.');
    if (!User?.findOne) return sendError(res, 503, 'SHARING_UNAVAILABLE', 'Account lookup is unavailable.');
    const target = await User.findOne({ email: parsed.data.email.toLowerCase(), status: 'active' }).select('_id email').lean();
    if (!target) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'No active account exists for that email address.');
    const memberId = String(target._id);
    if (memberId === String(req.user.id)) return sendError(res, 400, 'CANNOT_SHARE_WITH_SELF', 'You already own this workspace.');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('members').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    if ((record.members || []).some(member => member.userId === memberId)) {
      return res.json({ data: (record.members || []).filter(member => member.userId === memberId), meta: { alreadyShared: true } });
    }
    if ((record.members || []).length >= 10) return sendError(res, 409, 'MEMBER_LIMIT_REACHED', 'A workspace can be shared with at most 10 accounts.');
    const member = { userId: memberId, email: target.email, role: 'viewer', addedBy: req.user.id, addedAt: new Date() };
    const event = { userId: memberId, email: target.email, action: 'shared', actorId: req.user.id, occurredAt: new Date() };
    if (isDb()) {
      await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, {
        $addToSet: { members: member },
        $push: { sharingEvents: { $each: [event], $slice: -50 } },
      });
    } else {
      record.members ||= [];
      record.sharingEvents ||= [];
      record.members.push(member);
      record.sharingEvents.push(event);
      record.sharingEvents = record.sharingEvents.slice(-50);
    }
    return res.status(201).json({ data: [member], meta: { role: 'viewer', access: 'read-only' } });
  }));

  app.delete('/api/v1/experience/workspaces/:workspaceId/members/:memberId', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const memberId = String(req.params.memberId || '').slice(0, 100);
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('members').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const member = (record.members || []).find(item => item.userId === memberId);
    if (!member) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Workspace member not found.');
    const event = { userId: member.userId, email: member.email, action: 'revoked', actorId: req.user.id, occurredAt: new Date() };
    if (isDb()) {
      await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, {
        $pull: { members: { userId: memberId } },
        $push: { sharingEvents: { $each: [event], $slice: -50 } },
      });
    } else {
      record.members = record.members.filter(item => item.userId !== memberId);
      record.sharingEvents ||= [];
      record.sharingEvents.push(event);
      record.sharingEvents = record.sharingEvents.slice(-50);
    }
    return res.status(204).end();
  }));

  // Deliberately accept plain text only. This avoids executing or parsing untrusted
  // office/PDF formats in the API process; richer parsers require isolated workers.
  app.get('/api/v1/experience/workspaces/:workspaceId/documents', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('documents').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const documents = (record.documents || []).map(({ text, ...metadata }) => metadata);
    return res.json({ data: documents });
  }));

  app.post('/api/v1/experience/workspaces/:workspaceId/documents', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    const parsed = z.object({
      filename: z.string().trim().min(1).max(180),
      mediaType: z.literal('text/plain').default('text/plain'),
      text: z.string().min(1).max(50000),
    }).safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_DOCUMENT', 'Only plain-text documents up to 50 KB are accepted.');
    const filename = parsed.data.filename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
    const normalizedText = parsed.data.text.replace(/\r\n?/g, '\n');
    if (!normalizedText.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalizedText)) {
      return sendError(res, 400, 'INVALID_DOCUMENT_TEXT', 'Document text is empty or contains unsupported control characters.');
    }
    const byteLength = Buffer.byteLength(normalizedText, 'utf8');
    if (byteLength > 50000) return sendError(res, 413, 'DOCUMENT_TOO_LARGE', 'Plain-text documents are limited to 50 KB.');
    const contentHash = crypto.createHash('sha256').update(normalizedText, 'utf8').digest('hex');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('documents').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const existing = (record.documents || []).find(item => item.contentHash === contentHash);
    if (existing) return res.status(200).json({ data: { documentId: existing.documentId, filename: existing.filename, mediaType: existing.mediaType, byteLength: existing.byteLength, contentHash: existing.contentHash, uploadedAt: existing.uploadedAt }, meta: { duplicate: true } });
    if ((record.documents || []).length >= 10) return sendError(res, 409, 'DOCUMENT_LIMIT_REACHED', 'A workspace can contain at most 10 text documents.');
    const document = {
      documentId: crypto.randomUUID(),
      filename,
      mediaType: 'text/plain',
      text: normalizedText,
      byteLength,
      contentHash,
      hashAlgorithm: 'sha256',
      uploadedAt: new Date(),
    };
    if (isDb()) {
      await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, { $push: { documents: document } });
    } else {
      record.documents ||= [];
      record.documents.push(document);
    }
    return res.status(201).json({ data: { documentId: document.documentId, filename, mediaType: document.mediaType, byteLength, contentHash, uploadedAt: document.uploadedAt }, meta: { duplicate: false } });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/documents/:documentId', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const documentId = String(req.params.documentId || '').slice(0, 100);
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('documents').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const document = (record.documents || []).find(item => item.documentId === documentId);
    if (!document) return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
    return res.json({ data: document });
  }));

  app.delete('/api/v1/experience/workspaces/:workspaceId/documents/:documentId', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const documentId = String(req.params.documentId || '').slice(0, 100);
    if (isDb()) {
      const result = await ExperienceWorkspace.updateOne(
        { ownerId: req.user.id, workspaceId, 'documents.documentId': documentId },
        { $pull: { documents: { documentId } } },
      );
      if (!result.modifiedCount) return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      return res.status(204).end();
    }
    const record = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const previousLength = (record.documents || []).length;
    record.documents = (record.documents || []).filter(item => item.documentId !== documentId);
    if (record.documents.length === previousLength) return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
    return res.status(204).end();
  }));


  app.get('/api/v1/experience/workspaces/:workspaceId/task', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('taskPlan').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.json({ data: record.taskPlan || null });
  }));

  app.put('/api/v1/experience/workspaces/:workspaceId/task', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const parsed = z.object({
      title: z.string().trim().min(2).max(180),
      summary: z.string().trim().min(2).max(500),
      steps: z.array(z.object({
        id: z.string().trim().min(1).max(80),
        title: z.string().trim().min(2).max(160),
        instruction: z.string().trim().min(2).max(600),
        sourceUrl: z.string().url().max(2048).nullable().optional(),
        sourceTitle: z.string().trim().max(240).optional(),
        status: z.enum(['next', 'in_progress', 'completed', 'blocked']).default('next'),
      })).min(1).max(10),
    }).safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_TASK_PLAN', 'Provide a valid guided task with up to 10 steps.');
    const record = isDb()
      ? await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('sources').lean()
      : globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__?.get(req.user.id)?.get(workspaceId);
    if (!record) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const knownSources = new Map((record.sources || []).map(source => [source.url, source]));
    const steps = parsed.data.steps.map((step, index) => {
      const source = step.sourceUrl ? knownSources.get(step.sourceUrl) : null;
      return {
        ...step,
        sourceUrl: source ? source.url : null,
        sourceTitle: source ? String(source.title || step.sourceTitle || '').slice(0, 240) : '',
        status: step.status,
        order: index + 1,
      };
    });
    const taskPlan = { title: parsed.data.title, summary: parsed.data.summary, steps, updatedAt: new Date().toISOString() };
    if (isDb()) {
      await ExperienceWorkspace.updateOne({ ownerId: req.user.id, workspaceId }, { $set: { taskPlan } });
    } else {
      record.taskPlan = taskPlan;
    }
    return res.json({ data: taskPlan });
  }));

  app.delete('/api/v1/experience/workspaces/:workspaceId', workspaceRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    if (!workspaceId) return sendError(res, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID is required.');
    if (isDb()) {
      const result = await ExperienceWorkspace.deleteOne({ ownerId: req.user.id, workspaceId });
      if (!result.deletedCount) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
      return res.status(204).end();
    }
    const store = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ ||= new Map();
    const records = store.get(req.user.id);
    if (!records?.delete(workspaceId)) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return res.status(204).end();
  }));
}
