import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicAddressSet, scrapePublicPage, validatePublicUrl, validatePublicUrlResolution } from './providers.js';

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


test('DNS address-set validation rejects mixed public and private A/AAAA answers', () => {
  assert.throws(() => assertPublicAddressSet([
    { address: '8.8.8.8', family: 4 },
    { address: '192.168.10.20', family: 4 }
  ]), /private network/i);
  assert.throws(() => assertPublicAddressSet([
    { address: '2606:4700:4700::1111', family: 6 },
    { address: 'fd00::20', family: 6 }
  ]), /private network/i);
});

test('DNS address-set validation rejects IPv6 transition and translation ranges', () => {
  for (const address of [
    '64:ff9b:1::c0a8:101',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '2002:7f00:1::'
  ]) {
    assert.throws(() => assertPublicAddressSet([{ address, family: 6 }]), /private network/i, address);
  }
});

test('DNS address-set validation rejects malformed and mismatched address families', () => {
  assert.throws(() => assertPublicAddressSet([{ address: 'not-an-ip', family: 4 }]), /private network/i);
  assert.throws(() => assertPublicAddressSet([{ address: '8.8.8.8', family: 6 }]), /private network/i);
  assert.throws(() => assertPublicAddressSet([]), /private network/i);
});

test('DNS address-set validation accepts a complete public IPv4 and IPv6 answer set', () => {
  const records = [
    { address: '8.8.8.8', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 }
  ];
  assert.equal(assertPublicAddressSet(records), records);
});
