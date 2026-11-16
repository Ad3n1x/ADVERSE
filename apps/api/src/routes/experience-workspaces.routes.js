import { z } from 'zod';

const workspaceSchema = z.object({
  workspaceId: z.string().trim().min(1).max(100),
  intent: z.string().trim().min(1).max(500),
  kind: z.enum(['research', 'plan', 'compare', 'create', 'explore']),
  createdAt: z.number().int().positive().optional(),
});

export function registerExperienceWorkspaceRoutes(app, {
  requireAuth, wrap, sendError, isDb, ExperienceWorkspace,
}) {
  app.get('/api/v1/experience/workspaces', requireAuth, wrap(async (req, res) => {
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
    return res.json({ data: records });
  }));

  app.post('/api/v1/experience/workspaces', requireAuth, wrap(async (req, res) => {
    const parsed = workspaceSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_WORKSPACE', 'Workspace details are invalid.');
    const item = parsed.data;
    const createdAt = new Date(item.createdAt || Date.now());
    if (isDb()) {
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
    records.set(item.workspaceId, { id: item.workspaceId, intent: item.intent, kind: item.kind, createdAt: createdAt.getTime() });
    const sorted = [...records.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    store.set(req.user.id, new Map(sorted.map(row => [row.id, row])));
    return res.status(201).json({ data: { id: item.workspaceId, intent: item.intent, kind: item.kind, createdAt: createdAt.getTime() } });
  }));

  app.delete('/api/v1/experience/workspaces/:workspaceId', requireAuth, wrap(async (req, res) => {
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
