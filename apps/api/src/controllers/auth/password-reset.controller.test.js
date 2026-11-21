import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPasswordResetController } from './password-reset.controller.js';

test('password reset increments authVersion and invalidates previous sessions', async () => {
  const rawToken = 'a'.repeat(48);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const user = {
    id: 'user-1',
    email: 'researcher@example.com',
    passwordHash: 'old-password-hash',
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
    authVersion: 4,
  };
  const memory = { users: new Map([[user.id, user]]) };
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const controller = createPasswordResetController({
    isDb: () => false,
    User: {},
    memory,
    sendError(response, status, code, message) {
      response.status(status);
      return response.json({ error: { code, message } });
    },
    sendPasswordResetEmail: async () => {},
  });

  await controller.resetPassword({ body: { token: rawToken, password: 'new-secure-password-123' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(user.authVersion, 5);
  assert.equal(user.passwordResetTokenHash, '');
  assert.equal(user.passwordResetExpiresAt, null);
  assert.notEqual(user.passwordHash, 'old-password-hash');
});
