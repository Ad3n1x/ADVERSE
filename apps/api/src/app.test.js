import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';

test('health route responds with service status', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
  } finally { server.close(); }
});
