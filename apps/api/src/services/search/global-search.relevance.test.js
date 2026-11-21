import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchQueries, rankPublicResults } from './global-search.js';

test('query planner is bounded, unique, and starts with exact phrase intent', () => {
  const plan = expandSearchQueries('MovieBox old version download', 5);
  assert.equal(plan[0].reason, 'exact phrase');
  assert.ok(plan.length <= 5);
  assert.equal(new Set(plan.map(item => item.query.toLowerCase())).size, plan.length);
  assert.ok(plan.some(item => item.reason === 'related wording'));
});

test('query planner safely handles empty input and respects custom limits', () => {
  assert.deepEqual(expandSearchQueries('   '), []);
  assert.equal(expandSearchQueries('company history', 2).length, 2);
});

test('relevance ranking favors title subject matches over incidental snippet mentions', () => {
  const results = rankPublicResults([
    { title: 'A discussion forum', url: 'https://example.org/forum', excerpt: 'Python Django deployment is mentioned in a long unrelated conversation.' },
    { title: 'Django deployment guide', url: 'https://docs.example.org/django-deployment', excerpt: 'Steps for deploying a Django application.' },
  ], 'Django deployment');
  assert.equal(results[0].title, 'Django deployment guide');
});

test('ranking remains deterministic when candidates tie', () => {
  const results = rankPublicResults([
    { title: 'First result', url: 'https://example.org/first', excerpt: '' },
    { title: 'Second result', url: 'https://example.org/second', excerpt: '' },
  ], 'unmatched topic');
  assert.deepEqual(results.map(item => item.url), ['https://example.org/first', 'https://example.org/second']);
});

test('application intent ranks admissions routes above incidental mentions of the institution', () => {
  const intent = { type: 'application', sourcePreference: 'official' };
  const results = rankPublicResults([
    { title: 'ABUAD campus news and events', url: 'https://news.example.com/abuad', excerpt: 'Latest updates from the university.' },
    { title: 'ABUAD Undergraduate Admissions Portal', url: 'https://admissions.abuad.edu.ng/apply', excerpt: 'Application steps and entry requirements.' },
    { title: 'ABUAD employment opportunities', url: 'https://jobs.example.com/abuad', excerpt: 'Careers and vacancies.' },
  ], 'ABUAD', intent);
  assert.equal(results[0].title, 'ABUAD Undergraduate Admissions Portal');
  assert.ok(results.findIndex(item => /employment/i.test(item.title)) > 0);
});

test('intent-aware ranking is optional and safely handles missing URLs', () => {
  const results = rankPublicResults([
    { title: 'ABUAD admissions portal' },
    { title: 'ABUAD general overview' },
  ], 'ABUAD', { type: 'application', sourcePreference: 'official' });
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'ABUAD admissions portal');
});


test('application query plan keeps the institution and reserves a slot for AI intent leads', () => {
  const intent = {
    type: 'application',
    subject: 'ABUAD',
    searchQuery: 'ABUAD',
    sourcePreference: 'official',
    suggestedQueries: [
      { query: 'ABUAD official undergraduate admissions application portal', reason: 'Find the institution application destination' },
      { query: 'ABUAD undergraduate entry requirements', reason: 'Identify applicant requirements' },
    ],
  };
  const plan = expandSearchQueries('I want to apply for ABUAD', 6, intent);
  assert.ok(plan.some(item => item.query === 'ABUAD'));
  assert.ok(plan.some(item => item.reason.startsWith('AI:') && /official undergraduate admissions/i.test(item.query)));
  assert.ok(plan.some(item => item.reason === 'intent: application' && /official admissions application portal/i.test(item.query)));
});
