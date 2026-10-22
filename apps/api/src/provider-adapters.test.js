import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderResult } from '../src/provider-adapters.js';

test('provider results normalize whitespace and accept only credential-free HTTP URLs', () => {
  const item = normalizeProviderResult('  Example\n Result ', 'https://example.org/a', '<b>Some   useful\n text</b>', 'Test Provider');
  assert.equal(item.title, 'Example Result');
  assert.equal(item.url, 'https://example.org/a');
  assert.equal(item.excerpt, 'Some useful text');
  assert.equal(normalizeProviderResult('Unsafe', 'httpx://example.org', 'text', 'Test Provider'), null);
  assert.equal(normalizeProviderResult('Unsafe', 'javascript:alert(1)', 'text', 'Test Provider'), null);
  assert.equal(normalizeProviderResult('Unsafe', 'https://user:pass@example.org', 'text', 'Test Provider'), null);
});
