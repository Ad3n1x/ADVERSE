export const RESEARCH_JOB_MAX_ATTEMPTS = 3;
export const RESEARCH_JOB_LEASE_MS = 15 * 60 * 1000;

export const RESEARCH_JOB_TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function researchJobRetryDelayMs(attempts) {
  const count = Math.max(1, Math.min(RESEARCH_JOB_MAX_ATTEMPTS, Number(attempts) || 1));
  return Math.min(5 * 60 * 1000, 5000 * (2 ** (count - 1)));
}

export function researchJobProgress(stage) {
  return ({
    queued: 0,
    planning: 8,
    searching: 28,
    checking: 66,
    saving: 88,
    paused: 0,
    completed: 100,
    failed: 100,
    cancelled: 100,
  })[stage] ?? 0;
}

export function isResearchJobClaimable(job, now = Date.now()) {
  if (!job || Number(job.attempts || 0) >= Number(job.maxAttempts || RESEARCH_JOB_MAX_ATTEMPTS)) return false;
  if (job.status === 'queued') return !job.nextRunAt || new Date(job.nextRunAt).getTime() <= now;
  return job.status === 'running' && job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() <= now;
}
