import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReview, EVIDENCE_REVIEW_CHECKS } from './evidence-review.js';

const allChecked = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map(key => [key, true]));

test('supported evidence requires all review checks and a rationale', () => {
  const result = buildEvidenceReview({ verificationStatus: 'supported', reviewChecklist: allChecked, reviewRationale: 'Original material supports the stated date and scope.' }, 'reviewer-1');
  assert.equal(result.ok, true);
  assert.equal(result.value.reviewedBy, 'reviewer-1');
  assert.equal(result.value.reviewChecklist.contextChecked, true);
});

test('supported evidence cannot bypass incomplete source review', () => {
  const result = buildEvidenceReview({ verificationStatus: 'supported', reviewChecklist: {}, reviewRationale: 'Looks credible to me.' }, 'reviewer-1');
  assert.equal(result.ok, false);
  assert.match(result.error, /every source-review check/i);
});

test('conflicting evidence requires rationale even when checks are complete', () => {
  const result = buildEvidenceReview({ verificationStatus: 'conflicting', reviewChecklist: allChecked, reviewRationale: 'No' }, 'reviewer-1');
  assert.equal(result.ok, false);
  assert.match(result.error, /rationale/i);
});

test('insufficient status requires an explanation but not a false claim of completed checks', () => {
  const result = buildEvidenceReview({ verificationStatus: 'insufficient', reviewChecklist: {}, reviewRationale: 'The saved excerpt omits the relevant underlying data.' }, 'reviewer-2');
  assert.equal(result.ok, true);
  assert.equal(result.value.reviewChecklist.originalSourceOpened, false);
});

test('unverified status remains available without a completed checklist', () => {
  const result = buildEvidenceReview({ verificationStatus: 'unverified', reviewChecklist: {}, reviewRationale: '' }, 'reviewer-2');
  assert.equal(result.ok, true);
  assert.equal(result.value.verificationStatus, 'unverified');
});
