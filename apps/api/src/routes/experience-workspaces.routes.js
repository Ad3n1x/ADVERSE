import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';

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
  reviewStatus: z.enum(['unreviewed', 'useful', 'not_relevant']).optional(),
  analystNote: z.string().max(1000).optional(),
  publishedAt: z.string().max(40).nullable().optional().default(null),
  retrievedAt: z.string().max(40).nullable().optional().default(null),
  linkCheck: z.object({
    status: z.enum(['reachable', 'not_confirmed', 'not_checked']).optional().default('not_checked'),
    checkedAt: z.string().max(40).nullable().optional().default(null),
    note: z.string().max(500).optional().default(''),
  }).optional().default({}),
});

function normalizeSources(input) {
  const parsed = z.array(sourceSchema).max(12).safeParse(input);
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
      sources.push({
        ...item,
        url: canonicalUrl,
        providers: [...new Set(item.providers.map(value => value.trim()).filter(Boolean))].slice(0, 8),
      });
    } catch {
      return null;
    }
  }
  return sources;
}

export function registerExperienceWorkspaceRoutes(app, {
  requireAuth, wrap, sendError, isDb, ExperienceWorkspace,
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
      id: item.workspaceId, intent: item.intent, kind: item.kind,
      createdAt: createdAt.getTime(), sources: previous?.sources || [],
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
    if (!sources) return sendError(res, 400, 'INVALID_SOURCES', 'Provide up to 12 unique public HTTP(S) sources with valid metadata.');
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
