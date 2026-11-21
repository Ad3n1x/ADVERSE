import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswerStatus } from './answer-status.js';

const claim = (type, extra = {}) => ({
  claimId: type,
  type,
  statement: 'Evidence-backed test claim',
  value: { amount: null, currency: null, unit: null, text: null },
  academicSession: null,
  sourceIds: ['source-1'],
  assessment: 'supported',
  confidence: 0.9,
  ...extra
});

test('marks fee research answered only when every required field has supported evidence', () => {
  const result = evaluateAnswerStatus({
    intent: { type: 'fees-costs' },
    searchCompleted: true,
    sourceCount: 3,
    claims: [
      claim('institution'),
      claim('programme'),
      claim('tuition', { value: { amount: 2500000, currency: 'NGN', unit: 'academic year', text: null } }),
      claim('academic-session', { academicSession: '2026/2027' })
    ]
  });

  assert.equal(result.status, 'answered');
  assert.equal(result.completionRatio, 1);
  assert.deepEqual(result.unresolvedQuestions, []);
});

test('does not let a conflicting claim produce an answered result', () => {
  const result = evaluateAnswerStatus({
    intent: { type: 'fees-costs' },
    searchCompleted: true,
    sourceCount: 2,
    claims: [
      claim('institution'),
      claim('programme'),
      claim('tuition', { value: { amount: 2500000, currency: 'NGN', unit: null, text: null }, assessment: 'conflicting' })
    ]
  });

  assert.equal(result.status, 'conflicting');
  assert.ok(result.conflictCount > 0);
});

test('distinguishes a completed empty search from a search with insufficient evidence', () => {
  assert.equal(evaluateAnswerStatus({
    intent: { type: 'destination' }, searchCompleted: true, sourceCount: 0, claims: []
  }).status, 'not_found');

  assert.equal(evaluateAnswerStatus({
    intent: { type: 'destination' }, searchCompleted: true, sourceCount: 2, claims: []
  }).status, 'insufficient_evidence');
});

test('asks for clarification when the resolved intent says a missing detail is material', () => {
  const result = evaluateAnswerStatus({
    intent: { type: 'fees-costs', clarificationNeeded: true },
    searchCompleted: true,
    sourceCount: 1,
    claims: []
  });
  assert.equal(result.status, 'needs_clarification');
});
