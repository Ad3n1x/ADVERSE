import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSourceRelevance, filterRelevantSources } from './relevance-gate.js';

const intent = {
  type: 'fees-costs',
  subject: 'ABUAD Mechatronics Engineering',
  searchQuery: 'ABUAD Mechatronics Engineering degree',
  entities: [
    { text: 'ABUAD', kind: 'institution', role: 'primary-subject' },
    { text: 'Mechatronics Engineering', kind: 'programme', role: 'primary-subject' }
  ]
};

test('rejects incidental economics papers that do not match the institution or programme', () => {
  const result = evaluateSourceRelevance({
    title: 'The Degree of Distortions under Second-Degree Price Discrimination',
    url: 'https://papers.example.org/price-discrimination',
    excerpt: 'An economics paper about market pricing and price discrimination.'
  }, 'abuad price for mechatronics degree', intent);

  assert.equal(result.accepted, false);
  assert.match(result.rejectionReasons.join(' '), /subject terms/i);
});

test('accepts fee pages and programme pages that match the named research subject', () => {
  const results = filterRelevantSources([
    {
      title: 'ABUAD Undergraduate Fees and Charges',
      url: 'https://abuad.edu.ng/fees',
      excerpt: 'Official undergraduate fee schedule and tuition charges.'
    },
    {
      title: 'Mechatronics Engineering Degree Programme',
      url: 'https://university.example.edu/mechatronics',
      excerpt: 'Programme details and degree information.'
    }
  ], 'abuad mechatronics degree', intent);

  assert.equal(results.accepted.length, 2);
  assert.ok(results.accepted.every(item => item.relevance.accepted));
});

test('retains sparse metadata as uncertain instead of rejecting it automatically', () => {
  const result = evaluateSourceRelevance({
    title: 'Untitled',
    url: 'https://example.org/'
  }, 'ABUAD fees', { type: 'fees-costs', searchQuery: 'ABUAD fees' });

  assert.equal(result.accepted, true);
  assert.equal(result.score, 0);
});
