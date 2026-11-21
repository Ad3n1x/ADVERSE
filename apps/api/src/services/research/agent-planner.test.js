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

test('planner uses the configured Groq key before the broken Gemini provider', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit;
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify([
              { query: 'official agency policy record', reason: 'Find the primary decision.' },
              { query: 'independent policy coverage', reason: 'Check outside corroboration.' }
            ])
          }
        }]
      })
    };
  };
  try {
    const result = await planAgentFollowUps({
      question: 'Investigate a public policy decision',
      results: [{ title: 'Policy notice', url: 'https://agency.example/notice', excerpt: 'A public notice.' }],
      providerKeys: {},
      env: { GROQ_API_KEY: 'test-groq-key', GROQ_INTENT_MODEL: 'openai/gpt-oss-20b', GEMINI_API_KEY: 'broken-gemini-key', GEMINI_MODEL: 'invalid-model' },
    });
    assert.equal(requestUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(requestInit.headers.authorization, 'Bearer test-groq-key');
    assert.equal(result.mode, 'ai');
    assert.equal(result.provider, 'Groq');
    assert.equal(result.leads.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
