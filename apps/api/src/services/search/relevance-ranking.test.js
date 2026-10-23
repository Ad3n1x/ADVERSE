import test from 'node:test';
import assert from 'node:assert/strict';
import { improvePublicSearchRanking } from './relevance-ranking.js';

test('provider agreement is a modest relevance hint, not a truth verdict', () => {
  const results = improvePublicSearchRanking([
    { title: 'Python official documentation', url: 'https://docs.python.org/', providers: ['Index A'], _searchScore: 40, _searchOrder: 0 },
    { title: 'Python official documentation guide', url: 'https://python.example.org/guide', providers: ['Index A', 'Index B', 'Index C'], _searchScore: 40, _searchOrder: 1 },
  ], 'Python documentation');

  assert.equal(results[0].url, 'https://python.example.org/guide');
  assert.ok(results[0]._searchScore - 40 <= 12);
});

test('stronger baseline relevance remains ahead of weak incidental matches', () => {
  const results = improvePublicSearchRanking([
    { title: 'Exact subject documentation', providers: ['A'], excerpt: 'A useful preview with enough words to help the reader understand this source before opening it.', _searchScore: 70, _searchOrder: 0 },
    { title: 'Unrelated chat page', providers: ['A', 'B', 'C'], excerpt: 'A useful preview with enough words to help the reader understand this source before opening it.', _searchScore: 45, _searchOrder: 1 },
  ], 'exact subject documentation');

  assert.equal(results[0].title, 'Exact subject documentation');
});

test('ranking handles missing metadata and preserves deterministic order for ties', () => {
  const results = improvePublicSearchRanking([
    { title: 'First', _searchScore: 10, _searchOrder: 0 },
    { title: 'Second', _searchScore: 10, _searchOrder: 1 },
  ], 'a query');

  assert.deepEqual(results.map(item => item.title), ['First', 'Second']);
  assert.ok(results.every(item => Number.isFinite(item._searchScore)));
});

test('freshness helps time-sensitive queries without changing evergreen ranking', () => {
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 500 * 86400000).toISOString();
  const news = improvePublicSearchRanking([
    { title: 'Latest AI news archive', publishedAt: old, _searchScore: 30, _searchOrder: 0 },
    { title: 'Latest AI news report', publishedAt: recent, _searchScore: 30, _searchOrder: 1 },
  ], 'latest AI news');
  assert.equal(news[0].publishedAt, recent);

  const evergreen = improvePublicSearchRanking([
    { title: 'Python documentation archive', publishedAt: old, _searchScore: 30, _searchOrder: 0 },
    { title: 'Python documentation guide', publishedAt: recent, _searchScore: 30, _searchOrder: 1 },
  ], 'Python documentation');
  assert.equal(evergreen[0].publishedAt, old);
});
