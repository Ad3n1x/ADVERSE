import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLeadResponse, planAgentFollowUps } from './agent-planner.js';

test('lead planner accepts structured JSON and limits results to three unique searches', () => {
  const leads = parseLeadResponse(JSON.stringify([
    { query: 'official public record', reason: 'Find a primary source.' },
    { query: 'official public record', reason: 'Duplicate should be dropped.' },
    { query: 'independent reporting', reason: 'Seek corroboration.' },
    { query: 'counterevidence search', reason: 'Test a competing explanation.' },
    { query: 'chronology timeline', reason: 'A fourth lead should be bounded out.' },
  ]));

  assert.equal(leads.length, 3);
  assert.deepEqual(leads.map(item => item.query), [
    'official public record',
    'independent reporting',
    'counterevidence search',
  ]);
});

test('lead planner accepts fenced JSON but rejects malformed or underspecified leads', () => {
  assert.deepEqual(parseLeadResponse('```json\n[{"query":"abc","reason":"too short"},{"query":"valid source query","reason":"Useful"}]\n```'), [
    { query: 'valid source query', reason: 'Useful' },
  ]);
  assert.deepEqual(parseLeadResponse('not json'), []);
  assert.deepEqual(parseLeadResponse('{"leads":"not an array"}'), []);
});

test('planner falls back safely when no provider key is configured', async () => {
  const result = await planAgentFollowUps({
    question: 'Investigate a public policy decision',
    results: [{ title: 'Policy notice', url: 'https://agency.example/notice', excerpt: 'A public notice.' }],
    providerKeys: {},
    env: {},
  });

  assert.deepEqual(result, { leads: [], mode: 'heuristic', provider: null });
});
