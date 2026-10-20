import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResearchGaps } from '../src/research-gaps.js';

test('empty investigation returns prioritized collection gaps without truth claims', () => {
  const result = analyzeResearchGaps();
  assert.equal(result.evidenceCount, 0);
  assert.ok(result.gaps.some(g => g.id === 'no-evidence' && g.priority === 'critical'));
  assert.ok(result.limitations.length >= 3);
  assert.match(result.method, /heuristics/i);
});

test('detects missing dates, unverified sources, and publisher concentration', () => {
  const evidence = [
    { id: '1', url: 'https://one.example/a', title: 'A', excerpt: '', verificationStatus: 'unverified' },
    { id: '2', url: 'https://one.example/b', title: 'B', excerpt: 'Excerpt', verificationStatus: 'unverified' },
    { id: '3', url: 'https://one.example/c', title: 'C', excerpt: 'Excerpt', verificationStatus: 'conflicting' },
    { id: '4', url: 'https://two.example/d', title: 'D', excerpt: 'Excerpt', publishedAt: '2025-01-01T00:00:00.000Z', verificationStatus: 'supported' }
  ];
  const result = analyzeResearchGaps({ evidence });
  assert.ok(result.gaps.some(g => g.id === 'missing-publication-dates'));
  assert.ok(result.gaps.some(g => g.id === 'unverified-evidence'));
  assert.ok(result.gaps.some(g => g.id === 'publisher-concentration'));
  assert.equal(result.publisherDomainCount, 2);
});
