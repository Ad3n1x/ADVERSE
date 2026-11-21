import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExperienceWorkspaceRoutes } from './experience-workspaces.routes.js';

function makeHarness(users = []) {
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
    User: { findOne(query) { return { select() { return { lean: async () => users.find(user => user.email === query.email && user.status === 'active') || null }; } }; } },
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
    sourceType: 'alternative',
    alternativeFor: 'https://example.net/original-report',
    linkCheck: {
      status: 'reachable',
      checkedAt: new Date().toISOString(),
      httpStatus: 200,
      finalUrl: 'https://www.example.org/report',
      redirects: [{ status: 301, from: 'https://example.org/report', to: 'https://www.example.org/report' }],
      note: 'Readable after one redirect.',
    },
  };
  const saved = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId }, body: { sources: [source, { ...source, url: 'https://example.org/report#duplicate' }] },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.length, 1);
  assert.equal(saved.body.data[0].url, 'https://example.org/report');
  assert.equal(saved.body.data[0].alternativeFor, 'https://example.net/original-report');
  assert.equal(saved.body.data[0].linkCheck.httpStatus, 200);
  assert.equal(saved.body.data[0].linkCheck.finalUrl, 'https://www.example.org/report');
  assert.equal(saved.body.data[0].linkCheck.redirects.length, 1);

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

  const unsafeRedirect = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{
      url: 'https://example.org/public',
      linkCheck: {
        status: 'reachable',
        finalUrl: 'https://example.org/public',
        redirects: [{ status: 302, from: 'https://example.org/public', to: 'http://127.0.0.1/private' }],
      },
    }] },
  });
  assert.equal(unsafeRedirect.statusCode, 400);

  const unsafeAlternative = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{
      url: 'https://example.org/alternative',
      alternativeFor: 'javascript:alert(1)',
    }] },
  });
  assert.equal(unsafeAlternative.statusCode, 400);
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


test('plain-text document ingestion is bounded, deduplicated, hashed, and owner-scoped', async () => {
  const api = makeHarness();
  const owner = 'document-owner-' + randomUUID();
  const other = 'document-other-' + randomUUID();
  const workspaceId = 'workspace-document-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Review a public policy report', kind: 'research', createdAt: Date.now() },
  });

  const payload = { filename: '../report.txt', mediaType: 'text/plain', text: 'Line one.\r\nLine two.' };
  const saved = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: owner }, params: { workspaceId }, body: payload,
  });
  assert.equal(saved.statusCode, 201);
  assert.equal(saved.body.data.filename, '.._report.txt');
  assert.equal(saved.body.data.mediaType, 'text/plain');
  assert.equal(saved.body.data.byteLength, Buffer.byteLength('Line one.\nLine two.'));
  assert.match(saved.body.data.contentHash, /^[a-f0-9]{64}$/);

  const duplicate = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: owner }, params: { workspaceId }, body: { ...payload, filename: 'renamed.txt', text: 'Line one.\nLine two.' },
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.meta.duplicate, true);
  assert.equal(duplicate.body.data.documentId, saved.body.data.documentId);

  const fetched = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/documents/:documentId', {
    user: { id: owner }, params: { workspaceId, documentId: saved.body.data.documentId },
  });
  assert.equal(fetched.body.data.text, 'Line one.\nLine two.');

  const hiddenList = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(hiddenList.statusCode, 404);

  const deleted = await api.call('DELETE', '/api/v1/experience/workspaces/:workspaceId/documents/:documentId', {
    user: { id: owner }, params: { workspaceId, documentId: saved.body.data.documentId },
  });
  assert.equal(deleted.statusCode, 204);
  const missing = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/documents/:documentId', {
    user: { id: owner }, params: { workspaceId, documentId: saved.body.data.documentId },
  });
  assert.equal(missing.statusCode, 404);
});

test('plain-text document ingestion rejects unsupported media, control bytes, and oversized text', async () => {
  const api = makeHarness();
  const owner = 'document-validation-' + randomUUID();
  const workspaceId = 'workspace-document-validation-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Validate document imports', kind: 'research', createdAt: Date.now() },
  });
  const unsupported = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: owner }, params: { workspaceId }, body: { filename: 'report.pdf', mediaType: 'application/pdf', text: 'not parsed' },
  });
  assert.equal(unsupported.statusCode, 400);
  const control = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: owner }, params: { workspaceId }, body: { filename: 'bad.txt', text: 'unsafe\u0000text' },
  });
  assert.equal(control.statusCode, 400);
  const oversized = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/documents', {
    user: { id: owner }, params: { workspaceId }, body: { filename: 'large.txt', text: 'x'.repeat(50001) },
  });
  assert.equal(oversized.statusCode, 400);
});


test('workspace sharing grants read-only access to an existing account and supports revocation', async () => {
  const member = { _id: 'shared-user-' + randomUUID(), email: 'analyst@example.org', status: 'active' };
  const owner = 'sharing-owner-' + randomUUID();
  const api = makeHarness([member]);
  const workspaceId = 'workspace-sharing-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Review public infrastructure evidence', kind: 'research', createdAt: Date.now() },
  });
  await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ url: 'https://example.org/record', title: 'Public record' }] },
  });
  const shared = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/members', {
    user: { id: owner }, params: { workspaceId }, body: { email: member.email },
  });
  assert.equal(shared.statusCode, 201);
  assert.equal(shared.body.meta.access, 'read-only');

  const list = await api.call('GET', '/api/v1/experience/shared-workspaces', { user: { id: member._id } });
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].role, 'viewer');

  const detail = await api.call('GET', '/api/v1/experience/shared-workspaces/:workspaceId', {
    user: { id: member._id }, params: { workspaceId },
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.data.sources.length, 1);
  assert.equal(detail.body.data.role, 'viewer');

  const members = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/members', {
    user: { id: owner }, params: { workspaceId },
  });
  assert.equal(members.body.data[0].userId, member._id);
  assert.equal(members.body.audit[0].action, 'shared');

  const revoke = await api.call('DELETE', '/api/v1/experience/workspaces/:workspaceId/members/:memberId', {
    user: { id: owner }, params: { workspaceId, memberId: member._id },
  });
  assert.equal(revoke.statusCode, 204);
  const afterRevoke = await api.call('GET', '/api/v1/experience/shared-workspaces/:workspaceId', {
    user: { id: member._id }, params: { workspaceId },
  });
  assert.equal(afterRevoke.statusCode, 404);
});

test('workspace sharing cannot target the owner or an unknown account', async () => {
  const owner = 'sharing-owner-' + randomUUID();
  const api = makeHarness();
  const workspaceId = 'workspace-sharing-validation-' + randomUUID();
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Validate workspace sharing', kind: 'research', createdAt: Date.now() },
  });
  const unknown = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/members', {
    user: { id: owner }, params: { workspaceId }, body: { email: 'missing@example.org' },
  });
  assert.equal(unknown.statusCode, 404);
  const invalid = await api.call('POST', '/api/v1/experience/workspaces/:workspaceId/members', {
    user: { id: owner }, params: { workspaceId }, body: { email: 'not-an-email' },
  });
  assert.equal(invalid.statusCode, 400);
});


test('guided task progress persists, is restricted to workspace sources, and stays owner-scoped', async () => {
  const api = makeHarness();
  const owner = 'experience-task-owner-' + randomUUID();
  const other = 'experience-task-other-' + randomUUID();
  const workspaceId = 'workspace-task-' + randomUUID();
  const sourceUrl = 'https://abuad.edu.ng/admissions/fees';
  await api.call('POST', '/api/v1/experience/workspaces', {
    user: { id: owner },
    body: { workspaceId, intent: 'Find ABUAD Mechatronics fees and application steps', kind: 'plan', createdAt: Date.now() },
  });
  await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/sources', {
    user: { id: owner }, params: { workspaceId },
    body: { sources: [{ url: sourceUrl, title: 'ABUAD Official Admissions and Fees' }] },
  });
  const task = {
    title: 'Your application pathway',
    summary: 'Follow official instructions and verify fees before proceeding.',
    steps: [
      { id: 'step-1', title: 'Open official admissions', instruction: 'Check that the page belongs to ABUAD.', sourceUrl, sourceTitle: 'ABUAD Official Admissions and Fees', status: 'in_progress' },
      { id: 'step-2', title: 'Confirm programme fees', instruction: 'Check the current academic session.', sourceUrl: 'https://untrusted.example.org/fake-fees', status: 'next' },
    ],
  };
  const saved = await api.call('PUT', '/api/v1/experience/workspaces/:workspaceId/task', {
    user: { id: owner }, params: { workspaceId }, body: task,
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.data.steps[0].sourceUrl, sourceUrl);
  assert.equal(saved.body.data.steps[1].sourceUrl, null);

  const loaded = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/task', {
    user: { id: owner }, params: { workspaceId },
  });
  assert.equal(loaded.body.data.title, task.title);
  assert.equal(loaded.body.data.steps[0].status, 'in_progress');

  const denied = await api.call('GET', '/api/v1/experience/workspaces/:workspaceId/task', {
    user: { id: other }, params: { workspaceId },
  });
  assert.equal(denied.statusCode, 404);
});
