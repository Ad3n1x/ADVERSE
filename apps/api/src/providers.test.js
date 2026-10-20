import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicUrl } from './providers.js';

test('public URL validation rejects reserved IPv4 ranges', () => {
  for (const url of [
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.1.1',
    'http://169.254.169.254',
    'http://192.0.2.1',
    'http://198.51.100.2',
    'http://203.0.113.5'
  ]) assert.throws(() => validatePublicUrl(url), undefined, url);
});

test('public URL validation rejects IPv6 loopback, link-local, unique-local and mapped private IPv4', () => {
  for (const url of [
    'http://[::]',
    'http://[::1]',
    'http://[fe80::1]',
    'http://[fd00::1]',
    'http://[::ffff:7f00:1]',
    'http://[::ffff:a00:1]',
    'http://[::ffff:c0a8:101]',
    'http://[::ffff:ac10:1]'
  ]) assert.throws(() => validatePublicUrl(url), undefined, url);
});

test('public URL validation accepts a normal HTTPS URL and blocks non-HTTP schemes and embedded credentials', () => {
  assert.equal(validatePublicUrl('https://example.org/research').hostname, 'example.org');
  assert.throws(() => validatePublicUrl('file:///etc/passwd'));
  assert.throws(() => validatePublicUrl('https://user:password@example.org'));
});
