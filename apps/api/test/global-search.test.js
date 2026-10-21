import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchQueries } from '../src/global-search.js';

test('expands a phrase into exact, natural-language, and individual keyword searches', () => {
  const plan = expandSearchQueries('MovieBox old version', 8);
  const queries = plan.map(item => item.query.toLowerCase());
  assert.ok(queries.some(q => q.includes('moviebox old version')));
  assert.ok(queries.some(q => q === 'moviebox'));
  assert.ok(queries.some(q => q === 'old'));
  assert.ok(queries.some(q => q === 'version'));
  assert.ok(queries.length <= 10);
});

test('adds related wording while keeping expansion bounded and deduplicated', () => {
  const plan = expandSearchQueries('MovieBox old version');
  assert.ok(plan.some(item => item.reason === 'related wording'));
  assert.equal(new Set(plan.map(item => item.query.toLowerCase())).size, plan.length);
  assert.ok(plan.length <= 10);
});

test('handles empty and long input safely', () => {
  assert.deepEqual(expandSearchQueries(''), []);
  assert.ok(expandSearchQueries('x'.repeat(500)).every(item => item.query.length <= 240));
});
