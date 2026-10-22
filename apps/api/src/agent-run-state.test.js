import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_RUN_LEASE_MS, isFreshRunningAgentRun, interruptedAgentState } from './agent-run-state.js';

test('only a recently updated running agent holds a fresh lease', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  assert.equal(isFreshRunningAgentRun({ status: 'running', updatedAt: new Date(now - 1000).toISOString() }, now), true);
  assert.equal(isFreshRunningAgentRun({ status: 'complete', updatedAt: new Date(now - 1000).toISOString() }, now), false);
  assert.equal(isFreshRunningAgentRun({ status: 'running', updatedAt: new Date(now - AGENT_RUN_LEASE_MS - 1).toISOString() }, now), false);
  assert.equal(isFreshRunningAgentRun({ status: 'running', updatedAt: 'invalid' }, now), false);
});

test('interrupted recovery preserves run identity and existing trace', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  const prior = { runId: 'run-1', status: 'running', stage: 'search', startedAt: '2026-10-22T11:59:00.000Z', trace: [{ stage: 'search', status: 'complete' }] };
  const result = interruptedAgentState(prior, now);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.stage, 'interrupted');
  assert.equal(result.runId, 'run-1');
  assert.equal(result.trace.length, 2);
  assert.match(result.detail, /API restarted/);
  assert.equal(result.finishedAt, new Date(now).toISOString());
  assert.equal(interruptedAgentState({ status: 'complete' }, now), null);
});

test('interrupted trace stays bounded', () => {
  const trace = Array.from({ length: 70 }, (_, i) => ({ stage: 'stage-' + i }));
  const result = interruptedAgentState({ status: 'running', trace }, Date.now());
  assert.equal(result.trace.length, 60);
  assert.equal(result.trace.at(-1).stage, 'interrupted');
});
