import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTypedClaim, classifyTypedClaim } from './typed-claim-extraction.js';

test('classifies programme, tuition, deadline and application-route claims', () => {
  assert.equal(classifyTypedClaim('Mechatronics Engineering is listed in the programme catalogue.'), 'programme');
  assert.equal(classifyTypedClaim('The tuition fee is ₦2,500,000 for the year.'), 'tuition');
  assert.equal(classifyTypedClaim('The application deadline is 30 June.'), 'deadline');
  assert.equal(classifyTypedClaim('Applicants should use the official admission portal.'), 'application-route');
});

test('extracts currency, amount and academic session without treating the claim as verified', () => {
  const claim = buildTypedClaim({
    claim: 'The tuition fee for the 2026/2027 academic session is ₦2,500,000.'
  }, ['https://example.edu/fees'], 'claim-1');

  assert.equal(claim.type, 'tuition');
  assert.equal(claim.value.amount, 2500000);
  assert.equal(claim.value.currency, 'NGN');
  assert.equal(claim.academicSession, '2026/2027');
  assert.equal(claim.assessment, 'unreviewed');
  assert.equal(claim.confidence, 0);
});

test('does not create claims without attributable source URLs', () => {
  assert.equal(buildTypedClaim({ claim: 'The programme is available.' }, [], 'claim-2'), null);
});
