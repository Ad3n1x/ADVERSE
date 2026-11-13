import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportIntegrityManifest } from './report-integrity.js';

test('report integrity manifest is deterministic for the same report object', () => {
  const report = { product: 'ADVERSE', evidence: [{ id: 'ev-1', excerpt: 'source excerpt' }] };
  const first = createReportIntegrityManifest(report);
  const second = createReportIntegrityManifest(report);
  assert.equal(first.algorithm, 'SHA-256');
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.sha256.length, 64);
});

test('report integrity manifest changes when exported content changes', () => {
  const first = createReportIntegrityManifest({ evidence: [{ excerpt: 'one' }] });
  const second = createReportIntegrityManifest({ evidence: [{ excerpt: 'two' }] });
  assert.notEqual(first.sha256, second.sha256);
});
