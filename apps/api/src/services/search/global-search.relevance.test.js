import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchQueries, rankPublicResults } from './global-search.js';

test('query planner is bounded, unique, and starts with exact phrase intent', () => {
  const plan = expandSearchQueries('MovieBox old version download', 5);
  assert.equal(plan[0].reason, 'exact phrase');
  assert.ok(plan.length <= 5);
  assert.equal(new Set(plan.map(item => item.query.toLowerCase())).size, plan.length);
  assert.ok(plan.some(item => item.reason === 'related wording'));
});

test('query planner safely handles empty input and respects custom limits', () => {
  assert.deepEqual(expandSearchQueries('   '), []);
  assert.equal(expandSearchQueries('company history', 2).length, 2);
});

test('relevance ranking favors title subject matches over incidental snippet mentions', () => {
  const results = rankPublicResults([
    { title: 'A discussion forum', url: 'https://example.org/forum', excerpt: 'Python Django deployment is mentioned in a long unrelated conversation.' },
    { title: 'Django deployment guide', url: 'https://docs.example.org/django-deployment', excerpt: 'Steps for deploying a Django application.' },
  ], 'Django deployment');
  assert.equal(results[0].title, 'Django deployment guide');
});

test('ranking remains deterministic when candidates tie', () => {
  const results = rankPublicResults([
    { title: 'First result', url: 'https://example.org/first', excerpt: '' },
    { title: 'Second result', url: 'https://example.org/second', excerpt: '' },
  ], 'unmatched topic');
  assert.deepEqual(results.map(item => item.url), ['https://example.org/first', 'https://example.org/second']);
});