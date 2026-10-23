import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeEvidenceClaims } from './claim-analysis.js';

const evidence = (id, url, excerpt, overrides = {}) => ({
  id,
  investigationId: 'case-1',
  title: 'Investigation source record',
  url,
  publisher: new URL(url).hostname,
  excerpt,
  publishedAt: '2026-01-10T00:00:00.000Z',
  retrievedAt: '2026-01-11T00:00:00.000Z',
  verificationStatus: 'unverified',
  ...overrides,
});

test('claim triage preserves source-level provenance and never upgrades verification', () => {
  const result = analyzeEvidenceClaims([
    evidence('ev-1', 'https://registry.example/record', 'The commission approved the public transport plan in 2025 after a detailed public review.'),
    evidence('ev-2', 'https://news.example/report', 'The commission approved the public transport plan in 2025 after a detailed public review.'),
  ]);

  assert.equal(result.evidenceCount, 2);
  assert.ok(result.claims.length >= 1);
  const repeated = result.claims.find(item => item.sourceCount === 2);
  assert.ok(repeated, 'expected the repeated claim candidate to retain both source IDs');
  assert.deepEqual(new Set(repeated.sourceIds), new Set(['ev-1', 'ev-2']));
  assert.equal(repeated.status, 'repeated_claim');
  assert.match(repeated.assessment, /independence.*not been established/i);
  assert.ok(repeated.sources.every(source => source.verificationStatus === 'unverified'));
  assert.ok(result.limitations.some(item => /not a fact-checker/i.test(item)));
});

test('claim triage flags a possible denial conflict without declaring either side false', () => {
  const result = analyzeEvidenceClaims([
    evidence('ev-yes', 'https://a.example/report', 'The commission approved the public transport plan in 2025 after a detailed public review.'),
    evidence('ev-no', 'https://b.example/report', 'The commission did not approve the public transport plan in 2025 after a detailed public review.'),
  ]);

  const flagged = result.claims.find(item => item.possibleConflicts.some(conflict => conflict.kind === 'possible_polarity_conflict'));
  assert.ok(flagged, 'expected opposite-polarity statements to be flagged for review');
  assert.equal(flagged.status, 'needs_review');
  assert.match(flagged.possibleConflicts[0].detail, /confirm they discuss the same proposition/i);
});

test('claim triage flags different numeric details as a review lead, not a proven contradiction', () => {
  const result = analyzeEvidenceClaims([
    evidence('ev-120', 'https://a.example/report', 'The agency approved 120 projects in 2025 following its annual public review.'),
    evidence('ev-150', 'https://b.example/report', 'The agency approved 150 projects in 2025 following its annual public review.'),
  ]);

  const flagged = result.claims.find(item => item.possibleConflicts.some(conflict => conflict.kind === 'different_numeric_details'));
  assert.ok(flagged, 'expected different numeric details to be surfaced');
  assert.match(flagged.possibleConflicts[0].detail, /Check units, dates, context, and source quality/i);
  assert.ok(result.limitations.some(item => /units, dates, definitions, or context/i.test(item)));
});

test('empty or non-claim evidence returns a bounded, explicit empty analysis', () => {
  const result = analyzeEvidenceClaims([
    evidence('ev-empty', 'https://example.com/page', 'Read more. Subscribe now. Cookie policy.'),
  ]);

  assert.equal(result.evidenceCount, 1);
  assert.equal(result.claimCandidateCount, 0);
  assert.deepEqual(result.claims, []);
  assert.ok(result.method.length > 0);
});
