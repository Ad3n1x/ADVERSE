import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeadResponse } from './agent-planner.js';

test('parses lead plans, removes duplicates, and caps output at three', () => {
  const leads = parseLeadResponse(JSON.stringify([
    { query: 'Independent source about the event', reason: 'Check primary reporting' },
    { query: 'Independent source about the event', reason: 'Duplicate' },
    { query: 'Company registry history', reason: 'Find an authoritative record' },
    { query: 'Timeline from official statements', reason: 'Cross-check dates' },
    { query: 'A fourth useful query', reason: 'Must be capped' }
  ]));
  assert.equal(leads.length, 3);
  assert.equal(leads[0].query, 'Independent source about the event');
});

test('rejects malformed output', () => {
  assert.deepEqual(parseLeadResponse('not json'), []);
});
