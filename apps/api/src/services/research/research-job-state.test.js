import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isResearchJobClaimable, researchJobProgress, researchJobRetryDelayMs,
  RESEARCH_JOB_MAX_ATTEMPTS, RESEARCH_JOB_LEASE_MS,
} from './research-job-state.js';

test('research jobs can be claimed when queued and due', () => {
  const now = Date.now();
  assert.equal(isResearchJobClaimable({ status: 'queued', nextRunAt: new Date(now - 1), attempts: 0, maxAttempts: 3 }, now), true);
  assert.equal(isResearchJobClaimable({ status: 'queued', nextRunAt: new Date(now + 1000), attempts: 0, maxAttempts: 3 }, now), false);
});

test('expired running leases are reclaimable but fresh leases are not', () => {
  const now = Date.now();
  assert.equal(isResearchJobClaimable({ status: 'running', leaseExpiresAt: new Date(now - 1), attempts: 1, maxAttempts: 3 }, now), true);
  assert.equal(isResearchJobClaimable({ status: 'running', leaseExpiresAt: new Date(now + 1000), attempts: 1, maxAttempts: 3 }, now), false);
});

test('terminal, paused, and exhausted jobs are never claimed', () => {
  const now = Date.now();
  for (const status of ['paused', 'completed', 'failed', 'cancelled']) {
    assert.equal(isResearchJobClaimable({ status, attempts: 0, maxAttempts: 3 }, now), false);
  }
  assert.equal(isResearchJobClaimable({ status: 'queued', attempts: 3, maxAttempts: 3 }, now), false);
  assert.equal(RESEARCH_JOB_MAX_ATTEMPTS, 3);
  assert.equal(RESEARCH_JOB_LEASE_MS, 15 * 60 * 1000);
});

test('retry delays back off and cap', () => {
  assert.deepEqual([1, 2, 3].map(researchJobRetryDelayMs), [5000, 10000, 20000]);
  assert.equal(researchJobRetryDelayMs(99), 20000);
});

test('progress stages are monotonic for the normal research path', () => {
  assert.deepEqual(['queued', 'planning', 'searching', 'checking', 'saving', 'completed'].map(researchJobProgress), [0, 8, 28, 66, 88, 100]);
});
