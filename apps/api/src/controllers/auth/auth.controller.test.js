import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAuthController } from './auth.controller.js';

function setup() {
  const memory = { users: new Map(), investigations: new Map(), evidence: new Map(), entities: new Map(), relationships: new Map(), watches: new Map(), alerts: new Map(), cyberAssets: new Map(), cyberEvents: new Map() };
  globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__ = new Map();
  globalThis.__ADVERSE_METRICS__ = [];
  let nextId = 0;
  let sessionToken = '';
  const authSchema = z.object({
    email: z.string().email(),
    password: z.string().min(12),
    displayName: z.string().optional(),
  });
  const res = {
    statusCode: 200, body: undefined, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; return this; },
  };
  const controller = createAuthController({
    authSchema,
    sendError(response, status, code, message, details) {
      response.status(status);
      return response.json({ error: { code, message, ...(details ? { details } : {}) } });
    },
    ownerEmail: () => 'owner@example.com',
    isDb: () => false,
    User: {},
    memory,
    id: () => `user-${++nextId}`,
    setSession: (_response, token) => { sessionToken = token; },
    tokenFor: (user) => `session:${user.id}`,
    Investigation: {}, Evidence: {}, Entity: {}, Relationship: {}, Watch: {}, Alert: {}, CyberAsset: {}, CyberEvent: {}, ExperienceWorkspace: {}, SearchMetric: {},
  });
  return { controller, memory, res, getSessionToken: () => sessionToken };
}

test('register stores a salted password hash and returns a safe user', async () => {
  const { controller, memory, res, getSessionToken } = setup();
  await controller.register({ body: { email: 'person@example.com', password: 'correct-horse-battery', displayName: 'Researcher' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.email, 'person@example.com');
  assert.equal(res.body.data.displayName, 'Researcher');
  assert.equal('passwordHash' in res.body.data, false);
  const stored = memory.users.get(res.body.data.id);
  assert.match(stored.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(getSessionToken(), `session:${res.body.data.id}`);
});

test('login rejects an incorrect password and accepts the correct password', async () => {
  const { controller, res } = setup();
  await controller.register({ body: { email: 'person@example.com', password: 'correct-horse-battery' } }, res);

  const wrong = { ...res, statusCode: 200, body: undefined, status: res.status, json: res.json };
  await controller.login({ body: { email: 'person@example.com', password: 'wrong-password-123' } }, wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');

  const right = { ...res, statusCode: 200, body: undefined, status: res.status, json: res.json };
  await controller.login({ body: { email: 'person@example.com', password: 'correct-horse-battery' } }, right);
  assert.equal(right.statusCode, 200);
  assert.equal(right.body.data.email, 'person@example.com');
});

test('registration blocks the reserved owner address', async () => {
  const { controller, res } = setup();
  await controller.register({ body: { email: 'owner@example.com', password: 'correct-horse-battery' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'OWNER_EMAIL_RESERVED');
});


test('account deletion also removes private experience workspaces and user-linked telemetry', async () => {
  const { controller, memory, res } = setup();
  const ownerId = 'delete-owner';
  const otherId = 'keep-other';
  memory.users.set(ownerId, { id: ownerId, email: 'owner@example.test' });
  memory.investigations.set('case-owned', { id: 'case-owned', ownerId });
  memory.investigations.set('case-other', { id: 'case-other', ownerId: otherId });
  memory.evidence.set('evidence-owned', { id: 'evidence-owned', investigationId: 'case-owned' });
  memory.evidence.set('evidence-other', { id: 'evidence-other', investigationId: 'case-other' });
  globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__.set(ownerId, new Map([['private-workspace', { workspaceId: 'private-workspace' }]]));
  globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__.set(otherId, new Map([['other-workspace', { workspaceId: 'other-workspace', members: [{ userId: ownerId, email: 'owner@example.test', role: 'viewer' }] }]]));
  globalThis.__ADVERSE_METRICS__ = [
    { userId: ownerId, route: '/api/v1/search' },
    { userId: otherId, route: '/api/v1/search' },
    { userId: '', route: '/api/v1/health' },
  ];

  await controller.deleteAccount({ user: { id: ownerId } }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(memory.users.has(ownerId), false);
  assert.equal(memory.investigations.has('case-owned'), false);
  assert.equal(memory.evidence.has('evidence-owned'), false);
  assert.equal(memory.investigations.has('case-other'), true);
  assert.equal(memory.evidence.has('evidence-other'), true);
  assert.equal(globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__.has(ownerId), false);
  assert.equal(globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__.has(otherId), true);
  const sharedWorkspace = globalThis.__ADVERSE_EXPERIENCE_WORKSPACES__.get(otherId).get('other-workspace');
  assert.equal(sharedWorkspace.members.length, 0);
  assert.equal(sharedWorkspace.sharingEvents[0].action, 'revoked');
  assert.equal(sharedWorkspace.sharingEvents[0].userId, ownerId);
  assert.deepEqual(globalThis.__ADVERSE_METRICS__.map(item => item.userId), [otherId, '']);
});


test('database account deletion removes owned research jobs without touching another account', async () => {
  const deleted = [];
  const ownedInvestigations = { select() { return this; }, lean: async () => [{ _id: 'case-owned' }] };
  const deleteModel = (name) => ({
    deleteMany: async (filter) => { deleted.push({ name, filter }); return { deletedCount: 1 }; },
  });
  const experienceWorkspace = {
    ...deleteModel('ExperienceWorkspace'),
    updateMany: async (filter, update) => { deleted.push({ name: 'ExperienceWorkspace.updateMany', filter, update }); return { modifiedCount: 1 }; },
  };
  const investigation = {
    find: () => ownedInvestigations,
    ...deleteModel('Investigation'),
  };
  const memory = { users: new Map() };
  let clearedCookie = false;
  const res = {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; if (name === 'Set-Cookie') clearedCookie = true; },
    end() { this.ended = true; return this; },
  };
  const controller = createAuthController({
    authSchema: z.object({}), sendError: () => res, ownerEmail: () => 'owner@example.com',
    isDb: () => true, User: deleteModel('User'), memory, id: () => 'unused',
    setSession: () => {}, tokenFor: () => 'unused',
    Investigation: investigation, Evidence: deleteModel('Evidence'), Entity: deleteModel('Entity'),
    Relationship: deleteModel('Relationship'), Watch: deleteModel('Watch'), Alert: deleteModel('Alert'),
    CyberAsset: deleteModel('CyberAsset'), CyberEvent: deleteModel('CyberEvent'),
    ExperienceWorkspace: experienceWorkspace, ExperienceResearchJob: deleteModel('ExperienceResearchJob'),
    SearchMetric: deleteModel('SearchMetric'),
  });

  await controller.deleteAccount({ user: { id: 'account-to-delete' } }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(clearedCookie, true);
  assert.ok(deleted.some(item => item.name === 'ExperienceResearchJob'
    && item.filter.ownerId === 'account-to-delete'));
});
