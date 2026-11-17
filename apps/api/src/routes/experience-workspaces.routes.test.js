import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExperienceWorkspaceRoutes } from './experience-workspaces.routes.js';

function makeHarness() {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set('GET ' + path, handlers); },
    post(path, ...handlers) { routes.set('POST ' + path, handlers); },
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
