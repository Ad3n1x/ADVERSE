import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText } from './normalize-search-text.js';

test('normalizes compatibility characters and removes invisible formatting controls', () => {
  const value = 'ＡＢＵＡＤ\u200B price\u2060 for mechatronics\uFEFF';
  assert.equal(normalizeSearchText(value), 'ABUAD price for mechatronics');
});

test('removes control characters without collapsing meaningful joined emoji', () => {
  assert.equal(normalizeSearchText('ABUAD\u0000 fees'), 'ABUAD fees');
  assert.equal(normalizeSearchText('family 👨‍👩‍👧‍👦'), 'family 👨‍👩‍👧‍👦');
});

test('bounds normalized input after whitespace cleanup', () => {
  assert.equal(normalizeSearchText('  one   two  ', 7), 'one two');
});
