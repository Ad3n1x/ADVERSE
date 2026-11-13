import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapePublicPage, validatePublicUrl, validatePublicUrlResolution } from './providers.js';

test('public URL validation rejects loopback, private and link-local IPv4 destinations', () => {
  for (const url of [
    'http://127.0.0.1/',
    'http://10.0.0.8/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/'
  ]) {
    assert.throws(() => validatePublicUrl(url), /private network/i, url);
  }
});

test('public URL validation rejects restricted IPv6 destinations', () => {
  for (const url of ['http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/']) {
    assert.throws(() => validatePublicUrl(url), /private network/i, url);
  }
});

test('public URL validation rejects non-HTTP schemes and credential-bearing URLs', () => {
  assert.throws(() => validatePublicUrl('file:///etc/passwd'), /HTTP\(S\)/i);
  assert.throws(() => validatePublicUrl('https://user:secret@example.com/'), /credentials/i);
});

test('DNS resolution validation rejects private destinations before any page request', async () => {
  await assert.rejects(validatePublicUrlResolution('http://localhost/'), /private network/i);
  await assert.rejects(validatePublicUrlResolution('http://127.0.0.1/'), /private network/i);
});

test('page retrieval refuses literal private-network targets before opening a socket', async () => {
  await assert.rejects(scrapePublicPage('http://127.0.0.1:8080/internal'), /private network/i);
  await assert.rejects(scrapePublicPage('http://[::1]:8080/internal'), /private network/i);
});
