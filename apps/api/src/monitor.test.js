import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyAlertByEmail } from './monitor.js';

const originalFetch = globalThis.fetch;
const envKeys = ['BREVO_API_KEY', 'ALERT_EMAIL_FROM', 'ALERT_EMAIL_TO'];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

function setEmailEnv() {
  process.env.BREVO_API_KEY = 'test-key';
  process.env.ALERT_EMAIL_FROM = 'alerts@example.org';
  process.env.ALERT_EMAIL_TO = 'researcher@example.org';
}

test('Brevo alert email returns success when provider accepts the message', async () => {
  setEmailEnv();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  try {
    const result = await notifyAlertByEmail(
      { message: 'Review this archived source.' },
      { url: 'https://example.org/page', label: '<source & page>' }
    );
    assert.deepEqual(result, { sent: true, reason: '' });
    assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(request.options.headers['api-key'], 'test-key');
    const body = JSON.parse(request.options.body);
    assert.equal(body.to[0].email, 'researcher@example.org');
    assert.match(body.htmlContent, /&lt;source &amp; page&gt;/);
    assert.doesNotMatch(body.htmlContent, /<strong><source/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Brevo alert email remains pending when provider rejects the message', async () => {
  setEmailEnv();
  globalThis.fetch = async () => new Response(null, { status: 429 });
  try {
    const result = await notifyAlertByEmail(
      { message: 'Review this archived source.' },
      { url: 'https://example.org/page', label: 'Example' }
    );
    assert.equal(result.sent, false);
    assert.match(result.reason, /429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Brevo alert email reports missing configuration without attempting a send', async () => {
  for (const key of envKeys) delete process.env[key];
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response(null, { status: 204 }); };
  try {
    const result = await notifyAlertByEmail(
      { message: 'Review this archived source.' },
      { url: 'https://example.org/page', label: 'Example' }
    );
    assert.equal(result.sent, false);
    assert.match(result.reason, /configuration is incomplete/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
