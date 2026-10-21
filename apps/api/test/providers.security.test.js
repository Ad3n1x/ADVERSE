import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicUrl, validatePublicUrlResolution } from '../src/providers.js';

test('rejects non-web protocols and embedded credentials', () => {
  assert.throws(() => validatePublicUrl('file:///etc/passwd'), /HTTP\(S\)/);
  assert.throws(() => validatePublicUrl('https://user:pass@example.com/'), /credentials/);
});

test('rejects literal private and loopback IPv4 destinations', async () => {
  for (const url of [
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/',
  ]) {
    await assert.rejects(validatePublicUrlResolution(url), /Private network destinations are blocked/);
  }
});

test('rejects literal loopback and unique-local IPv6 destinations', async () => {
  for (const url of [
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[0:0:0:0:0:0:0:0]/',
    'http://[0:0:0:0:0:ffff:c0a8:0101]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[2002:7f00:1::]/',
  ]) {
    await assert.rejects(validatePublicUrlResolution(url), /Private network destinations are blocked/);
  }
});

test('rejects localhost hostnames before attempting network access', async () => {
  await assert.rejects(validatePublicUrlResolution('http://localhost/'), /Private network destinations are blocked/);
  await assert.rejects(validatePublicUrlResolution('http://internal.local/'), /Private network destinations are blocked/);
});
