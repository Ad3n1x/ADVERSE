import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { registerInternalRoutes } from './internal.routes.js';

function createHarness({ databaseReady = true, runDiscoveryCycle = async () => ({ processed: 1, saved: 2 }) } = {}) {
  let discoveryHandler;
  const jobs = [];
  const app = { post(path, handler) { if (path === '/api/v1/internal/discovery/run') discoveryHandler = handler; } };
  const JobRun = {
    async create(data) {
      const job = {
        ...data,
        _id: 'test-discovery-job',
        async save() { job.saveCount = (job.saveCount || 0) + 1; }
      };
      jobs.push(job);
      return job;
    }
  };
  registerInternalRoutes(app, {
    wrap: handler => (req, res) => Promise.resolve(handler(req, res)),
    sendError: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
    isDb: () => databaseReady,
    JobRun,
    runDiscoveryCycle,
    runMonitoringCycle: async () => ({}),
    timingSafeEqual,
    CyberAsset: {},
    runCyberAssetCheck: async () => ({})
  });
  return {
    jobs,
    async call(secret) {
      const result = { status: 200, body: null };
      const req = { get(name) { return name === 'x-discovery-secret' ? secret || '' : ''; } };
      const res = {
        status(status) { result.status = status; return this; },
        json(body) { result.body = body; return this; }
      };
      await discoveryHandler(req, res);
      return result;
    }
  };
}

function withSecret(value, fn) {
  const previous = process.env.DISCOVERY_CRON_SECRET;
  process.env.DISCOVERY_CRON_SECRET = value;
  return Promise.resolve().then(fn).finally(() => {
    if (previous === undefined) delete process.env.DISCOVERY_CRON_SECRET;
    else process.env.DISCOVERY_CRON_SECRET = previous;
  });
}

test('scheduled discovery rejects missing and invalid scheduler credentials', async () => {
  await withSecret('expected-secret', async () => {
    const harness = createHarness();
    const missing = await harness.call('');
    const invalid = await harness.call('wrong-secret');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, 'CRON_AUTH_REQUIRED');
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, 'CRON_AUTH_INVALID');
    assert.equal(harness.jobs.length, 0);
  });
});

test('scheduled discovery requires persistent database storage', async () => {
  await withSecret('expected-secret', async () => {
    const harness = createHarness({ databaseReady: false });
    const response = await harness.call('expected-secret');
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DATABASE_REQUIRED');
    assert.equal(harness.jobs.length, 0);
  });
});

test('scheduled discovery acknowledges immediately and persists its background result', async () => {
  await withSecret('expected-secret', async () => {
    let finishDiscovery;
    let started = false;
    const harness = createHarness({
      runDiscoveryCycle: () => {
        started = true;
        return new Promise(resolve => { finishDiscovery = resolve; });
      }
    });
    const response = await harness.call('expected-secret');
    assert.equal(response.status, 202);
    assert.equal(response.body.job.status, 'accepted');
    assert.equal(response.body.job.id, 'test-discovery-job');
    assert.equal(started, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, true);
    finishDiscovery({ processed: 3, saved: 5 });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.jobs[0].status, 'success');
    assert.equal(harness.jobs[0].metadata.processed, 3);
    assert.equal(harness.jobs[0].metadata.saved, 5);
    assert.equal(harness.jobs[0].saveCount, 1);
  });
});

test('scheduled discovery records background failures without failing the accepted request', async () => {
  await withSecret('expected-secret', async () => {
    const harness = createHarness({ runDiscoveryCycle: async () => { throw new Error('provider timeout'); } });
    const response = await harness.call('expected-secret');
    assert.equal(response.status, 202);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.jobs[0].status, 'failed');
    assert.equal(harness.jobs[0].message, 'Discovery cycle failed. Check API logs for details.');
  });
});
