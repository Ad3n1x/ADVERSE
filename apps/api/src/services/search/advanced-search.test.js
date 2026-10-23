import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAdvancedSearchResults, parseAdvancedSearch } from './advanced-search.js';

test('parses supported operators and preserves ordinary search terms', () => {
  assert.deepEqual(parseAdvancedSearch('climate report site:who.int after:2026-01-01 type:pdf'), {
    query: 'climate report',
    filters: { site: 'who.int', after: '2026-01-01', before: null, type: 'pdf' },
    invalidOperators: [],
  });
});

test('ignores malformed operator values and reports them', () => {
  const parsed = parseAdvancedSearch('health data after:tomorrow type:exe site:bad host');
  assert.equal(parsed.query, 'health data');
  assert.deepEqual(parsed.invalidOperators, ['after:tomorrow', 'type:exe', 'site:bad']);
});

test('rejects reversed date ranges instead of silently applying them', () => {
  const parsed = parseAdvancedSearch('report after:2026-10-20 before:2026-10-01');
  assert.equal(parsed.filters.after, null);
  assert.equal(parsed.filters.before, null);
  assert.equal(parsed.invalidOperators.length, 1);
});

test('filters by exact/subdomain, file extension, and strict date bounds', () => {
  const items = [
    { url: 'https://who.int/reports/health.pdf', publishedAt: '2026-05-10T00:00:00Z' },
    { url: 'https://news.who.int/health.pdf', publishedAt: '2026-05-10T00:00:00Z' },
    { url: 'https://who.int/health.html', publishedAt: '2026-05-10T00:00:00Z' },
    { url: 'https://notwho.int/health.pdf', publishedAt: '2026-05-10T00:00:00Z' },
    { url: 'https://who.int/undated.pdf' },
  ];
  const found = filterAdvancedSearchResults(items, { site: 'who.int', type: 'pdf', after: '2026-01-01', before: '2026-10-01' });
  assert.deepEqual(found.map(item => item.url), ['https://who.int/reports/health.pdf', 'https://news.who.int/health.pdf']);
});
