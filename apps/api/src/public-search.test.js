import test from 'node:test';
import assert from 'node:assert/strict';
import { app, inspectPublicLink, assessSourceContext } from './app.js';

async function withServer(fn) {
  const server = app.listen(0);
  try { await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

let sequence = 40;

test('source context classifies domain patterns as hints, not verification', () => {
  const institutional = assessSourceContext('https://data.gov.ng/report', { provider:'Test provider' });
  assert.equal(institutional.category, 'institutional-domain');
  assert.match(institutional.reason, /hostname/);
  const unknown = assessSourceContext('https://example.com/page');
  assert.equal(unknown.category, 'publisher-or-website');
  assert.doesNotMatch(unknown.label, /verified|trusted/i);
});

async function register(base, label) {
  const response = await fetch(base + '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.' + sequence++ },
    body: JSON.stringify({
      email: label + '@example.org',
      password: 'strong-test-password-123',
      displayName: 'ADVERSE Test'
    })
  });
  assert.equal(response.status, 201);
  return (response.headers.get('set-cookie') || '').split(';')[0];
}
async function createInvestigation(base, cookie, title) {
  const response = await fetch(base + '/api/v1/investigations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title })
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}
async function createEvidence(base, cookie, investigationId, title) {
  const response = await fetch(base + '/api/v1/investigations/' + investigationId + '/evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title, url: 'https://example.org/' + encodeURIComponent(title), excerpt: 'Test evidence excerpt' })
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}
async function createEntity(base, cookie, investigationId, name, evidenceIds = []) {
  const response = await fetch(base + '/api/v1/investigations/' + investigationId + '/entities', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, evidenceIds })
  });
  return response;
}

test('public search rejects short queries without calling external providers', async () => withServer(async base => {
  const response = await fetch(base + '/api/v1/public-search?q=%20');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'QUERY_REQUIRED');
}));

test('public media search rejects unsupported media types', async () => withServer(async base => {
  const response = await fetch(base + '/api/v1/public-search/media?q=weather&type=podcasts');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_MEDIA_TYPE');
}));

test('link safety signals explain technical indicators without declaring a site malicious', () => {
  const http = inspectPublicLink('http://example.org/path');
  assert.equal(http.transport, 'HTTP');
  assert.ok(http.signals.some(signal => /HTTP rather than encrypted HTTPS/.test(signal)));
  const short = inspectPublicLink('https://bit.ly/abc123');
  assert.ok(short.signals.some(signal => /link-shortening service/.test(signal)));
  assert.ok(!short.signals.some(signal => /malicious|scam|fake/i.test(signal)));
});

test('entity and relationship mutations reject evidence owned by another investigation', async () => withServer(async base => {
  const ownerCookie = await register(base, 'owner');
  const otherCookie = await register(base, 'other');
  const ownerCase = await createInvestigation(base, ownerCookie, 'Owner evidence');
  const otherCase = await createInvestigation(base, otherCookie, 'Other case');
  const foreignEvidence = await createEvidence(base, ownerCookie, ownerCase.id || ownerCase._id, 'Private source');

  const otherCaseId = otherCase.id || otherCase._id;
  const invalidEntity = await createEntity(base, otherCookie, otherCaseId, 'Foreign reference', [foreignEvidence.id || foreignEvidence._id]);
  assert.equal(invalidEntity.status, 400);
  assert.equal((await invalidEntity.json()).error.code, 'INVALID_EVIDENCE_REFERENCE');

  const first = await createEntity(base, otherCookie, otherCaseId, 'Entity One');
  const second = await createEntity(base, otherCookie, otherCaseId, 'Entity Two');
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const a = (await first.json()).data;
  const b = (await second.json()).data;
  const relationship = await fetch(base + '/api/v1/investigations/' + otherCaseId + '/relationships', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: otherCookie },
    body: JSON.stringify({
      fromEntityId: a.id || a._id,
      toEntityId: b.id || b._id,
      type: 'references',
      evidenceIds: [foreignEvidence.id || foreignEvidence._id]
    })
  });
  assert.equal(relationship.status, 400);
  assert.equal((await relationship.json()).error.code, 'INVALID_EVIDENCE_REFERENCE');
}));
