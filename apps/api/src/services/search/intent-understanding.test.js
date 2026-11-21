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
  for (const query of ['I want to apply for ABUAD', 'I want to apply to ABUAD', 'How do I apply to ABUAD?', 'Where do I register for ABUAD?']) {
    const intent = understandSearchIntent(query);
    assert.equal(intent.type, 'application');
    assert.equal(intent.searchQuery, 'ABUAD');
    assert.deepEqual(intent.secondaryIntents, []);
    const variants = buildIntentQueryVariants(query, intent, 5);
    assert.ok(variants.some(item => /official admissions application portal/i.test(item.query)));
    assert.ok(variants.some(item => /admission requirements eligibility/i.test(item.query)));
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
  const eligibility = understandSearchIntent('Can I get into ABUAD with my grades?');
  assert.equal(eligibility.type, 'eligibility');
  assert.equal(eligibility.searchQuery, 'ABUAD');
  const fees = understandSearchIntent('How much is ABUAD tuition?');
  assert.equal(fees.type, 'fees-costs');
  assert.equal(fees.searchQuery, 'ABUAD');
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


test('includes bounded AI-suggested query leads in the actual search plan', () => {
  const intent = {
    type: 'application', searchQuery: 'ABUAD',
    suggestedQueries: [{ query: 'ABUAD official undergraduate application portal', reason: 'Locate the official application destination' }]
  };
  const variants = buildIntentQueryVariants('I want to apply to ABUAD', intent, 5);
  assert.ok(variants.some(item => item.reason.startsWith('AI:') && /official undergraduate application portal/i.test(item.query)));
});


test('preserves institution-name words when extracting application targets', () => {
  for (const [query, expected] of [
    ['I would like to apply to University of Lagos', 'University of Lagos'],
    ['How do I apply to the University of Ibadan?', 'University of Ibadan'],
    ['I want to apply for ABUAD', 'ABUAD'],
  ]) {
    const intent = understandSearchIntent(query);
    assert.equal(intent.type, 'application');
    assert.equal(intent.searchQuery, expected);
  }
});


test('extracts multiple objectives without swallowing the institution name', () => {
  const query = 'I want to apply to ABUAD and find tuition fees and the admission deadline';
  const intent = understandSearchIntent(query);
  assert.equal(intent.type, 'application');
  assert.equal(intent.searchQuery, 'ABUAD');
  assert.deepEqual(intent.secondaryIntents, ['fees-costs', 'deadline']);
  const variants = buildIntentQueryVariants(query, intent, 12);
  assert.ok(variants.some(item => item.reason === 'secondary intent: fees-costs'));
  assert.ok(variants.some(item => item.reason === 'secondary intent: deadline'));
});


test('turns shorthand ABUAD programme-price requests into an outcome-specific investigation', () => {
  const query = 'abuad price for mechatronics degree';
  const intent = understandSearchIntent(query);
  assert.equal(intent.type, 'fees-costs');
  assert.equal(intent.institution.name, 'Afe Babalola University');
  assert.equal(intent.institution.domain, 'abuad.edu.ng');
  assert.equal(intent.programme, 'Mechatronics Engineering');
  assert.equal(intent.geography, 'Nigeria');
  assert.equal(intent.searchQuery, 'ABUAD Mechatronics Engineering');
  assert.ok(intent.researchTasks.some(task => task.id === 'official-fees'));
  assert.ok(intent.researchTasks.some(task => task.id === 'total-cost'));
  const variants = buildIntentQueryVariants(query, intent, 12);
  assert.ok(variants.some(item => /site:abuad\.edu\.ng.*mechatronics engineering fees/i.test(item.query)));
  assert.ok(variants.some(item => /Afe Babalola University.*Mechatronics Engineering.*tuition fees/i.test(item.query)));
  assert.equal(intent.expectedOutcome.includes('itemized'), true);
});
