import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIntentQueryVariants, understandSearchIntent } from './intent-understanding.js';

test('understands official destination intent and extracts the subject', () => {
  const intent = understandSearchIntent('Find the official website for QuickCart');
  assert.equal(intent.type, 'destination');
  assert.equal(intent.searchQuery, 'QuickCart');
  assert.ok(buildIntentQueryVariants('Find the official website for QuickCart', intent).some(item => /official site/i.test(item.query)));
});

test('understands university application intent and isolates the institution', () => {
  for (const query of ['I want to apply for ABUAD', 'I want to apply to ABUAD', 'How do I apply to ABUAD?']) {
    const intent = understandSearchIntent(query);
    assert.equal(intent.type, 'application');
    assert.equal(intent.searchQuery, 'ABUAD');
    const variants = buildIntentQueryVariants(query, intent, 5);
    assert.ok(variants.some(item => /official admissions application portal/i.test(item.query)));
    assert.ok(variants.some(item => /undergraduate admission requirements/i.test(item.query)));
  }
});

test('understands claim verification and prioritizes evidence-oriented variants', () => {
  const query = 'Is it true that the agency changed its policy?';
  const intent = understandSearchIntent(query);
  assert.equal(intent.type, 'verification');
  assert.equal(intent.searchQuery, 'agency changed its policy');
  const variants = buildIntentQueryVariants(query, intent);
  assert.ok(variants.some(item => /primary source evidence/i.test(item.query)));
  assert.ok(variants.some(item => /independent corroboration/i.test(item.query)));
});

test('distinguishes current, historical, comparison and how-to intent', () => {
  assert.equal(understandSearchIntent('What are the latest updates on the project?').type, 'current-events');
  assert.equal(understandSearchIntent('Build a timeline of the company history').type, 'historical');
  assert.equal(understandSearchIntent('Compare React versus Vue').type, 'comparison');
  assert.equal(understandSearchIntent('How do I fix a Django deployment error?').type, 'how-to');
});

test('understands eligibility, costs, programme availability, deadlines and scholarships', () => {
  assert.equal(understandSearchIntent('Can I get into ABUAD with my grades?').type, 'eligibility');
  assert.equal(understandSearchIntent('How much is ABUAD tuition?').type, 'fees-costs');
  assert.equal(understandSearchIntent('Does ABUAD offer mechatronics?').type, 'programme-availability');
  assert.equal(understandSearchIntent('When does ABUAD admission close?').type, 'deadline');
  assert.equal(understandSearchIntent('Find scholarships for mechatronics students').type, 'scholarship-funding');
});

test('does not invent a narrow intent for ambiguous questions', () => {
  const intent = understandSearchIntent('QuickCart');
  assert.equal(intent.type, 'general-research');
  assert.equal(intent.searchQuery, 'QuickCart');
  assert.equal(buildIntentQueryVariants('QuickCart', intent)[0].query, 'QuickCart');
  assert.ok(buildIntentQueryVariants('QuickCart', intent).length <= 3);
});

test('empty input produces an explicit empty interpretation', () => {
  assert.equal(understandSearchIntent('  ').confidence, 0);
  assert.deepEqual(buildIntentQueryVariants('  '), []);
});

test('includes bounded AI-generated intent leads without dropping the original question', () => {
  const query = 'Is it true that the agency changed its policy?';
  const intent = {
    ...understandSearchIntent(query),
    suggestedQueries: [
      { query: 'agency official policy notice', reason: 'primary notice' },
      { query: 'independent agency policy reporting', reason: 'independent check' }
    ]
  };
  const variants = buildIntentQueryVariants(query, intent, 5);
  assert.equal(variants[0].query, query);
  assert.ok(variants.some(item => item.query === 'agency official policy notice'));
  assert.ok(variants.some(item => item.reason.startsWith('AI:')));
});
