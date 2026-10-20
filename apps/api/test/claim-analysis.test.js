import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidenceClaims } from '../src/claim-analysis.js';

test('returns a clear empty analysis without inventing claims', () => {
  const result = analyzeEvidenceClaims([]);
  assert.equal(result.evidenceCount, 0);
  assert.equal(result.claimCandidateCount, 0);
  assert.deepEqual(result.claims, []);
  assert.ok(result.limitations.length >= 3);
});

test('keeps source provenance and identifies claim candidates', () => {
  const result = analyzeEvidenceClaims([
    { id: 'a', title: 'Agency reports 2024 budget', url: 'https://agency.example/report', publisher: 'Agency', excerpt: 'The agency approved a $20 million budget in 2024 after a public review.' },
    { id: 'b', title: 'Budget approved in 2024', url: 'https://news.example/story', publisher: 'News', excerpt: 'The agency approved a $25 million budget in 2024 after a public review.' }
  ]);
  assert.equal(result.evidenceCount, 2);
  assert.ok(result.claimCandidateCount >= 2);
  assert.equal(result.provenanceClusters.length, 2);
  assert.ok(result.claims.every(claim => Array.isArray(claim.sources) && claim.sources.every(s => s.url)));
  assert.ok(result.claims.every(claim => claim.status !== 'verified'));
  assert.ok(result.claims.some(claim => claim.possibleConflicts.some(conflict => conflict.kind === 'different_numeric_details')));
});
