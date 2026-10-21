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
  const plan = expandSearchQueries('MovieBox old version', 8);
  assert.ok(plan.some(item => item.reason === 'related wording'));
  assert.equal(new Set(plan.map(item => item.query.toLowerCase())).size, plan.length);
  assert.ok(plan.length <= 10);
});

test('handles empty and long input safely', () => {
  assert.deepEqual(expandSearchQueries(''), []);
  assert.ok(expandSearchQueries('x'.repeat(500)).every(item => item.query.length <= 240));
});


test('normalizes tracking variants without collapsing case-sensitive paths', async () => {
  const { normalizeResultUrl } = await import('../src/global-search.js');
  assert.equal(
    normalizeResultUrl('https://Example.com/News/Story?utm_source=test&b=2&a=1#top'),
    'https://example.com/News/Story?a=1&b=2'
  );
  assert.notEqual(
    normalizeResultUrl('https://example.com/News'),
    normalizeResultUrl('https://example.com/news')
  );
});

test('diversifies a ranked result list across domains without discarding overflow', async () => {
  const { diversifyPublicResults } = await import('../src/global-search.js');
  const items = [
    { title: 'ADVERSE search platform', url: 'https://one.example/a', excerpt: 'ADVERSE search platform' },
    { title: 'ADVERSE search platform guide', url: 'https://one.example/b', excerpt: 'ADVERSE search platform' },
    { title: 'ADVERSE search platform review', url: 'https://one.example/c', excerpt: 'ADVERSE search platform' },
    { title: 'ADVERSE search platform official', url: 'https://one.example/d', excerpt: 'ADVERSE search platform' },
    { title: 'ADVERSE search platform documentation', url: 'https://two.example/docs', excerpt: 'ADVERSE search platform' }
  ];
  const results = diversifyPublicResults(items, 'ADVERSE search platform', { limit: 5, maxPerDomain: 2 });
  assert.equal(results.length, 5);
  assert.equal(results.slice(0, 3).filter(item => new URL(item.url).hostname === 'one.example').length, 2);
  assert.ok(results.some(item => new URL(item.url).hostname === 'two.example'));
});


test('prefers recent dated results when the query asks for current information', async () => {
  const { rankPublicResults } = await import('../src/global-search.js');
  const items = [
    { title: 'ADVERSE release notes', url: 'https://example.com/old', excerpt: 'ADVERSE release', publishedAt: '2020-01-01T00:00:00.000Z' },
    { title: 'ADVERSE release notes', url: 'https://example.org/new', excerpt: 'ADVERSE release', publishedAt: new Date().toISOString() }
  ];
  const ranked = rankPublicResults(items, 'latest ADVERSE release');
  assert.equal(ranked[0].url, 'https://example.org/new');
});
