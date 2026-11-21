import crypto from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';

const jobsRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many research-job requests. Try again shortly.' } },
});

const createSchema = z.object({
  workspaceId: z.string().trim().min(1).max(100),
  query: z.string().trim().min(2).max(500),
  plannerKind: z.enum(['research', 'plan', 'compare', 'create', 'explore']),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

function serialize(job) {
  return {
    id: job.jobId,
    workspaceId: job.workspaceId,
    query: job.query,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    events: (job.events || []).slice(-20).map(event => ({
      stage: event.stage, message: event.message, progress: event.progress,
      at: event.at instanceof Date ? event.at.toISOString() : event.at,
    })),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    sourceCount: job.sourceCount,
    successfulSearches: job.successfulSearches,
    providerNames: job.providerNames || [],
    coverage: job.coverage || '',
    errorCode: job.errorCode || '',
    errorMessage: job.errorMessage || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

export function registerExperienceResearchJobRoutes(app, {
  requireAuth, wrap, sendError, isDb, ExperienceWorkspace, ExperienceResearchJob,
}) {
  app.post('/api/v1/experience/jobs', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    if (!isDb()) return sendError(res, 503, 'PERSISTENT_JOBS_UNAVAILABLE', 'Background research requires the persistent database. Try again when cloud storage is available.');
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, 'INVALID_RESEARCH_JOB', 'Provide a workspace, research request, and valid task type.');
    const input = parsed.data;
    const workspace = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId: input.workspaceId }).select('_id').lean();
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Save this workspace before starting background research.');
    const idempotencyKey = input.idempotencyKey || crypto.randomUUID();
    const existing = await ExperienceResearchJob.findOne({ ownerId: req.user.id, idempotencyKey }).lean();
    if (existing) return res.status(200).json({ data: serialize(existing), meta: { reused: true } });
    const activeKey = String(req.user.id) + ':' + input.workspaceId;
    const active = await ExperienceResearchJob.findOne({ activeKey }).lean();
    if (active && active.query === input.query) return res.status(200).json({ data: serialize(active), meta: { reused: true } });
    if (active) return res.status(409).json({ error: { code: 'RESEARCH_ALREADY_RUNNING', message: 'This workspace already has a different active research job.', details: { jobId: active.jobId } } });
    const jobId = crypto.randomUUID();
    const now = new Date();
    try {
      const job = await ExperienceResearchJob.create({
        jobId, ownerId: req.user.id, workspaceId: input.workspaceId,
        idempotencyKey, activeKey, query: input.query,
        plannerKind: input.plannerKind, status: 'queued', stage: 'queued',
        progress: 0, nextRunAt: now,
        events: [{ stage: 'queued', message: 'Your investigation is safely queued for research.', progress: 0, at: now }],
      });
      return res.status(202).json({ data: serialize(job), meta: { reused: false } });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await ExperienceResearchJob.findOne({ ownerId: req.user.id, idempotencyKey }).lean();
        if (duplicate) return res.status(200).json({ data: serialize(duplicate), meta: { reused: true } });
        const running = await ExperienceResearchJob.findOne({ activeKey }).lean();
        if (running) return sendError(res, 409, 'RESEARCH_ALREADY_RUNNING', 'This workspace already has an active research job.');
      }
      throw error;
    }
  }));

  app.get('/api/v1/experience/jobs/:jobId', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    const job = await ExperienceResearchJob.findOne({ ownerId: req.user.id, jobId: String(req.params.jobId || '').slice(0, 100) }).lean();
    if (!job) return sendError(res, 404, 'RESEARCH_JOB_NOT_FOUND', 'Research job not found.');
    return res.json({ data: serialize(job) });
  }));

  app.get('/api/v1/experience/workspaces/:workspaceId/jobs', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    const workspaceId = String(req.params.workspaceId || '').slice(0, 100);
    const workspace = await ExperienceWorkspace.findOne({ ownerId: req.user.id, workspaceId }).select('_id').lean();
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const jobs = await ExperienceResearchJob.find({ ownerId: req.user.id, workspaceId })
      .sort({ createdAt: -1 }).limit(10).lean();
    return res.json({ data: jobs.map(serialize) });
  }));

  app.post('/api/v1/experience/jobs/:jobId/pause', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    const filter = { ownerId: req.user.id, jobId: String(req.params.jobId || '').slice(0, 100), status: { $in: ['queued', 'running'] } };
    const job = await ExperienceResearchJob.findOne(filter).lean();
    if (!job) return sendError(res, 409, 'JOB_NOT_PAUSABLE', 'This research job cannot be paused in its current state.');
    if (job.status === 'queued') {
      await ExperienceResearchJob.updateOne(filter, { $set: { status: 'paused', stage: 'paused', pauseRequested: false, leaseOwner: '', leaseExpiresAt: null } });
    } else {
      await ExperienceResearchJob.updateOne(filter, { $set: { pauseRequested: true } });
    }
    const updated = await ExperienceResearchJob.findOne({ ownerId: req.user.id, jobId: job.jobId }).lean();
    return res.json({ data: serialize(updated) });
  }));

  app.post('/api/v1/experience/jobs/:jobId/resume', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    const job = await ExperienceResearchJob.findOneAndUpdate(
      { ownerId: req.user.id, jobId: String(req.params.jobId || '').slice(0, 100), status: 'paused' },
      { $set: { status: 'queued', stage: 'queued', progress: 0, pauseRequested: false, cancelRequested: false, nextRunAt: new Date(), leaseOwner: '', leaseExpiresAt: null, errorCode: '', errorMessage: '' }, $push: { events: { $each: [{ stage: 'queued', message: 'Research resumed. ADVERSE will continue from the saved workspace evidence.', progress: 0, at: new Date() }], $slice: -30 } } },
      { new: true },
    ).lean();
    if (!job) return sendError(res, 409, 'JOB_NOT_RESUMABLE', 'This research job is not paused.');
    return res.status(202).json({ data: serialize(job) });
  }));

  app.post('/api/v1/experience/jobs/:jobId/cancel', jobsRateLimit, requireAuth, wrap(async (req, res) => {
    const jobId = String(req.params.jobId || '').slice(0, 100);
    const job = await ExperienceResearchJob.findOne({ ownerId: req.user.id, jobId }).lean();
    if (!job) return sendError(res, 404, 'RESEARCH_JOB_NOT_FOUND', 'Research job not found.');
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return res.json({ data: serialize(job) });
    if (job.status === 'running') {
      await ExperienceResearchJob.updateOne({ ownerId: req.user.id, jobId, status: 'running' }, { $set: { cancelRequested: true } });
    } else {
      await ExperienceResearchJob.updateOne({ ownerId: req.user.id, jobId, status: { $in: ['queued', 'paused'] } }, {
        $set: { status: 'cancelled', stage: 'cancelled', finishedAt: new Date(), leaseOwner: '', leaseExpiresAt: null },
        $unset: { activeKey: 1 },
        $push: { events: { $each: [{ stage: 'cancelled', message: 'Research was cancelled. Saved workspace evidence was kept.', progress: 100, at: new Date() }], $slice: -30 } },
      });
    }
    const updated = await ExperienceResearchJob.findOne({ ownerId: req.user.id, jobId }).lean();
    return res.json({ data: serialize(updated) });
  }));
}
