export const AGENT_RUN_LEASE_MS = 10 * 60 * 1000;

export function isFreshRunningAgentRun(state, now = Date.now()) {
  if (!state || state.status !== 'running') return false;
  const timestamp = Date.parse(state.updatedAt || state.startedAt || '');
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return age >= 0 && age < AGENT_RUN_LEASE_MS;
}

export function interruptedAgentState(state, now = Date.now()) {
  if (!state || state.status !== 'running') return null;
  const timestamp = new Date(now).toISOString();
  const entry = {
    stage: 'interrupted',
    status: 'interrupted',
    detail: 'The API restarted before this investigation finished. Start a new run to continue; completed source records remain saved.',
    at: timestamp
  };
  return {
    ...state,
    status: 'interrupted',
    stage: 'interrupted',
    detail: entry.detail,
    updatedAt: timestamp,
    finishedAt: timestamp,
    trace: [...(Array.isArray(state.trace) ? state.trace : []), entry].slice(-60)
  };
}
