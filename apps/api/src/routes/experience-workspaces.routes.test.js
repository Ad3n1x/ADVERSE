import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExperienceWorkspaceRoutes } from './experience-workspaces.routes.js';

function makeHarness() {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set('GET ' + path, handlers); },
    post(path, ...handlers) { routes.set('POST ' + path, handlers); },
    put(path, ...handlers) { routes.set('PUT ' + path, handlers); },
    delete(path, ...handlers) { routes.set('DELETE ' + path, handlers); },
  };
  const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });
  registerExperienceWorkspaceRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    wrap: handler => handler,
    sendError,
    isDb: () => false,
    ExperienceWorkspace: null,
  });
  return {
    async call(method, path, req) {
      const handlers = routes.get(method + ' ' + path);
      assert.ok(handlers, 'route should be registered');
      const res = {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; },
      };
      await handlers.at(-1)(req, res, error => { if (error) throw error; });
      return res;
    },
  };
}

test('cloud workspace endpoints isolate records by account and enforce ownership on deletion', async () => {
  const api = makeHarness();
  const owner = 'experience-owner-' + randomUUID();
  const other = 'experience-other-' + randomUUID();
  const item = { workspaceId: 'workspace-' + randomUUID(), intent: 'Research clean energy storage', kind: 'research', createdAt: Date.now() };

  const saved = await api.call('POST', '/api/v1/experience/workspaces', { user: { id: owner }, body: item });
  assert.equal(saved.statusCode, 201);

  const ownerList = await api.call('GET', '/api/v1/experience/workspaces', { user: { id: owner } });
  assert.equal(ownerList.body.data.length, 1);
  assert.equal(ownerList.body.data[0].intent, item.intent);

  const otherList = await api.call('GET', '/api/v1/experience/workspaces', { user: { id: other } });
  assert.equal(otherList.body.data.length, 0);

  const deniedDelete = await api.call('DELETE', '/api/v1/experience/workspaces/:workspaceId', {
    user: { id: other }, params: { workspaceId: item.workspaceId },
  });
  assert.equal(deniedDelete.statusCode, 404);

  const stillOwned = await api.call('GET', '/api/v1/experience/workspaces', { user: { id: owner } });
  assert.equal(stillOwned.body.data.length, 1);

  const deleted = await api.call('DELETE', '/api/v1/experience/workspaces/:workspaceId', {
    user: { id: owner }, params: { workspaceId: item.workspaceId },
  });
  assert.equal(deleted.statusCode, 204);
});

test('saving the same intent replaces the older workspace and caps history at eight', async () => {
  const api = makeHarness();
  const owner = 'experience-cap-' + randomUUID();
  for (let index = 0; index < 10; index++) {
    await api.call('POST', '/api/v1/experience/workspaces', {
      user: { id: owner },
      body: { workspaceId: 'workspace-' + index, intent: 'Intent ' + index, kind: 'explore', createdAt: Date.now() + index },
    });
  }
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId: 'workspace-duplicate', intent: 'Intent 9', kind: 'plan', createdAt: Date.now() + 20 },
  });
  const list = await api.call('GET', '/api/v1/experience/workspaces', { user: { id: owner } });
  assert.equal(list.body.data.length, 8);
  assert.equal(list.body.data.filter(item => item.intent === 'Intent 9').length, 1);
});


test('workspace sources persist, deduplicate, and remain private to their owner', async () => {
  const api = makeHarness();
  const owner = 'experience-sources-owner-' + randomUUID();
  const other = 'experience-sources-other-' + randomUUID();
  const workspaceId = 'workspace-sources-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Research public transport systems', kind: 'research', createdAt: Date.now() },
  });

  const source = {
    url: 'https://example.org/report#section',
    title: 'Public transport report',
    excerpt: 'A short source excerpt.',
    publisher: 'Example Research',
    provider: 'Public Search',
    providers: ['Public Search', 'Secondary Search'],
    sourceType: 'web',
    linkCheck: { status: 'reachable', checkedAt: new Date().toISOString(), note: 'Readable when checked.' },
  };
  const saved = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId }, body: { sources: [source, { ...source, url: 'https://example.org/report#duplicate' }] },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.length, 1);
  assert.equal(saved.body.data[0].url, 'https://example.org/report');

  const loaded = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
  });
  assert.equal(loaded.body.data.length, 1);
  assert.equal(loaded.body.data[0].title, source.title);

  const denied = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(denied.statusCode, 404);
});

test('workspace source persistence rejects unsafe URL schemes and oversized collections', async () => {
  const api = makeHarness();
  const owner = 'experience-sources-validation-' + randomUUID();
  const workspaceId = 'workspace-validation-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Collect public reports', kind: 'research', createdAt: Date.now() },
  });
  const invalid = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ url: 'javascript:alert(1)', title: 'Unsafe' }] },
  });
  assert.equal(invalid.statusCode, 400);
  const withinLimit = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: Array.from({ length: 24 }, (_, index) => ({ url: 'https://example.org/valid/' + index })) },
  });
  assert.equal(withinLimit.statusCode, 200);
  assert.equal(withinLimit.body.data.length, 24);
  const oversized = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: Array.from({ length: 25 }, (_, index) => ({ url: 'https://example.org/' + index })) },
  });
  assert.equal(oversized.statusCode, 400);
});


test('source review state and analyst notes persist across refreshes and stay owner-scoped', async () => {
  const api = makeHarness();
  const owner = 'experience-review-owner-' + randomUUID();
  const other = 'experience-review-other-' + randomUUID();
  const workspaceId = 'workspace-review-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Review public infrastructure sources', kind: 'research', createdAt: Date.now() },
  });

  const source = { url: 'https://example.org/infrastructure', title: 'Infrastructure report', excerpt: 'A report excerpt.' };
  const reviewed = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ ...source, reviewStatus: 'useful', analystNote: 'Check the cited original dataset.' }] },
  });
  assert.equal(reviewed.statusCode, 200);
  assert.equal(reviewed.body.data[0].reviewStatus, 'useful');
  assert.equal(reviewed.body.data[0].analystNote, 'Check the cited original dataset.');

  const refreshed = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ ...source, excerpt: 'Updated provider excerpt.' }] },
  });
  assert.equal(refreshed.body.data[0].reviewStatus, 'useful');
  assert.equal(refreshed.body.data[0].analystNote, 'Check the cited original dataset.');

  const denied = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(denied.statusCode, 404);

  const invalidStatus = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ ...source, reviewStatus: 'verified' }] },
  });
  assert.equal(invalidStatus.statusCode, 400);

  const oversizedNote = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ ...source, analystNote: 'x'.repeat(1001) }] },
  });
  assert.equal(oversizedNote.statusCode, 400);
});


test('claim ledger is owner-scoped and rejects links to sources outside the workspace', async () => {
  const api = makeHarness();
  const owner = 'experience-claims-owner-' + randomUUID();
  const other = 'experience-claims-other-' + randomUUID();
  const workspaceId = 'workspace-claims-' + randomUUID();
  const sourceUrl = 'https://example.org/energy-report';
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner }, body: { workspaceId, intent: 'Review energy storage research', kind: 'research', createdAt: Date.now() },
  });
  await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId }, body: { sources: [{ url: sourceUrl, title: 'Energy report' }] },
  });
  const claim = {
    claimId: 'claim-' + randomUUID(),
    text: 'Grid-scale storage deployment increased during the reporting period.',
    assessment: 'unreviewed',
    rationale: 'Needs comparison with an independent dataset.',
    evidenceLinks: [{ url: sourceUrl, role: 'context' }],
  };
  const saved = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/claims', {
    user: { id: owner }, params: { workspaceId }, body: { claims: [claim] },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.length, 1);
  const loaded = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/claims', {
    user: { id: owner }, params: { workspaceId },
  });
  assert.equal(loaded.body.data[0].evidenceLinks[0].url, sourceUrl);
  const denied = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/claims', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(denied.statusCode, 404);
  const foreignLink = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/claims', {
    user: { id: owner }, params: { workspaceId },
    body: { claims: [{ ...claim, evidenceLinks: [{ url: 'https://other.example/report', role: 'supports' }] }] },
  });
  assert.equal(foreignLink.statusCode, 400);
  const invalidAssessment = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/claims', {
    user: { id: owner }, params: { workspaceId }, body: { claims: [{ ...claim, assessment: 'verified' }] },
  });
  assert.equal(invalidAssessment.statusCode, 400);
});

test('research-run history is idempotent, bounded, and private to the workspace owner', async () => {
  const api = makeHarness();
  const owner = 'experience-runs-owner-' + randomUUID();
  const other = 'experience-runs-other-' + randomUUID();
  const workspaceId = 'workspace-runs-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner }, body: { workspaceId, intent: 'Compare public research sources', kind: 'compare', createdAt: Date.now() },
  });
  const run = {
    runId: 'run-' + randomUUID(), query: 'public energy storage research', plannerKind: 'compare',
    sourceCount: 2, successfulSearches: 3, providerNames: ['Provider A', 'Provider B'], coverage: 'Two sources were returned.',
  };
  const first = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/runs', {
    user: { id: owner }, params: { workspaceId }, body: run,
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.data.length, 1);
  const duplicate = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/runs', {
    user: { id: owner }, params: { workspaceId }, body: { ...run, sourceCount: 1 },
  });
  assert.equal(duplicate.body.data.length, 1);
  assert.equal(duplicate.body.data[0].sourceCount, 1);
  const list = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/runs', {
    user: { id: owner }, params: { workspaceId },
  });
  assert.equal(list.body.data.length, 1);
  const denied = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/runs', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(denied.statusCode, 404);
});
