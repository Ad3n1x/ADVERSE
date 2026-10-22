import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAuthController } from './auth.controller.js';

function setup() {
  const memory = { users: new Map(), investigations: new Map(), evidence: new Map(), entities: new Map(), relationships: new Map(), watches: new Map(), alerts: new Map(), cyberAssets: new Map(), cyberEvents: new Map() };
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
    Investigation: {}, Evidence: {}, Entity: {}, Relationship: {}, Watch: {}, Alert: {}, CyberAsset: {}, CyberEvent: {},
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
