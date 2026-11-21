import assert from 'node:assert/strict';
import test from 'node:test';
import { understandSearchIntentWithGroq } from './groq-intent.js';

test('uses deterministic intent when the Groq key is not configured', async () => {
  const intent = await understandSearchIntentWithGroq('Find the official website for QuickCart', { env: {} });
  assert.equal(intent.type, 'destination');
  assert.equal(intent.provider, 'rules-fallback');
  assert.match(intent.aiNote, /not configured/);
});

test('uses Groq structured intent and returns bounded query suggestions', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.headers.authorization, 'Bearer test-key');
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          type: 'verification',
          label: 'Verify the reported policy change',
          subject: 'agency policy change',
          search_query: 'agency policy change',
          source_preference: 'primary-and-independent',
          confidence: 0.93,
          explanation: 'The user wants to test a claim against evidence.',
          ambiguities: [],
          suggested_queries: [
            { query: 'agency official policy notice', reason: 'Find the primary announcement' },
            { query: 'independent reporting agency policy change', reason: 'Check independent coverage' },
            { query: 'agency policy change rebuttal evidence', reason: 'Look for counterevidence' },
            { query: 'extra query should be dropped', reason: 'bounded output' }
          ]
        }) } }]
      })
    };
  };
  try {
    const intent = await understandSearchIntentWithGroq('Is it true that the agency changed its policy?', {
      env: { GROQ_API_KEY: 'test-key', GROQ_INTENT_MODEL: 'openai/gpt-oss-20b' }
    });
    assert.equal(intent.provider, 'groq');
    assert.equal(intent.type, 'verification');
    assert.equal(intent.subject, 'agency policy change');
    assert.equal(intent.suggestedQueries.length, 3);
    assert.equal(requestBody.response_format.json_schema.strict, true);
    assert.equal(requestBody.model, 'openai/gpt-oss-20b');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('uses Gemini as the intent provider when Groq is not configured', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(init.headers['x-goog-api-key'], 'test-gemini-key');
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          type: 'destination',
          label: 'Find the official admissions destination',
          subject: 'ABUAD',
          search_query: 'ABUAD',
          source_preference: 'official',
          confidence: 0.96,
          explanation: 'The user wants to begin a university application.',
          ambiguities: [],
          suggested_queries: [
            { query: 'ABUAD official admissions portal', reason: 'Find the official application destination' }
          ]
        }) }] } }]
      })
    };
  };
  try {
    const intent = await understandSearchIntentWithGroq('I want to apply to ABUAD', {
      env: { GEMINI_API_KEY: 'test-gemini-key', GEMINI_MODEL: 'gemini-2.5-flash' }
    });
    assert.equal(intent.provider, 'gemini');
    assert.equal(intent.type, 'destination');
    assert.equal(intent.subject, 'ABUAD');
    assert.equal(intent.suggestedQueries.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
