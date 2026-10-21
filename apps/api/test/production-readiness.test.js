import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('liveness endpoint responds without exposing configuration', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'adverse-api');
  assert.equal(Object.hasOwn(body, 'providers'), false);
});

test('readiness endpoint reports a structured status', async () => {
  const response = await fetch(`${baseUrl}/api/v1/ready`);
  const body = await response.json();
  assert.equal(body.service, 'adverse-api');
  assert.equal(typeof body.ok, 'boolean');
  assert.ok(['ready', 'not_ready'].includes(body.status));
  assert.ok(body.checks && typeof body.checks.database === 'string');
});

test('private research routes reject requests without a session', async () => {
  const requests = [
    ['GET', '/api/v1/investigations'],
    ['POST', '/api/v1/investigations', { title: 'Should not be created' }],
    ['POST', '/api/v1/internal/discovery/run', {}, 'CRON_AUTH_REQUIRED'],
    ['POST', '/api/v1/internal/monitoring/run', {}, 'CRON_AUTH_REQUIRED'],
    ['POST', '/api/v1/internal/cyber-monitoring/run', {}, 'CRON_AUTH_REQUIRED'],
    ['GET', '/api/v1/investigations/fake-id/evidence'],
    ['POST', '/api/v1/investigations/fake-id/research', { query: 'test' }],
    ['GET', '/api/v1/investigations/fake-id/monitoring'],
    ['POST', '/api/v1/investigations/fake-id/ai-review', {}],
  ];

  for (const [method, path, payload, expectedCode] of requests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: payload ? { 'content-type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    assert.equal(response.status, 401, `${method} ${path} must require authentication`);
    const body = await response.json();
    assert.equal(body.error?.code, expectedCode || 'AUTH_REQUIRED');
  }
});
