import assert from 'node:assert/strict';
import test from 'node:test';
import { understandSearchIntentWithGroq } from './groq-intent.js';

test('uses deterministic intent when the Groq key is not configured', async () => {
  const intent = await understandSearchIntentWithGroq('Find the official website for QuickCart', { env: {} });
  assert.equal(intent.type, 'destination');
  assert.equal(intent.provider, 'rules-fallback');
  assert.match(intent.aiNote, /not configured/);
});

test('keeps deterministic university application intent when Groq returns a broad classification', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({
      type: 'general-research', label: 'Research ABUAD', subject: 'ABUAD',
      search_query: 'I want to apply for ABUAD', source_preference: 'balanced',
      confidence: 0.55, explanation: 'Broad research', ambiguities: [], suggested_queries: []
    }) } }] })
  });
  try {
    const intent = await understandSearchIntentWithGroq('I want to apply for ABUAD', {
      env: { GROQ_API_KEY: 'test-key', GROQ_INTENT_MODEL: 'openai/gpt-oss-20b' }
    });
    assert.equal(intent.type, 'application');
    assert.equal(intent.searchQuery, 'ABUAD');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps deterministic ABUAD and Mechatronics resolution when AI returns a broad intent', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({
      type: 'general-research', label: 'Research a university', goal: 'Research a university programme',
      subject: 'ABUAD mechatronics degree', search_query: 'ABUAD mechatronics degree',
      source_preference: 'balanced', confidence: 0.6, explanation: 'Broad research intent.',
      subgoals: [], entities: [{ text: 'ABUAD', kind: 'university', role: 'institution' }],
      constraints: [], ambiguities: [], clarification_needed: false, suggested_queries: []
    }) } }] })
  });
  try {
    const intent = await understandSearchIntentWithGroq('abuad price for mechatronics degree', {
      env: { GROQ_API_KEY: 'test-key' }
    });
    assert.equal(intent.type, 'fees-costs');
    assert.equal(intent.searchQuery, 'ABUAD Mechatronics Engineering');
    assert.equal(intent.preferences.country, 'Nigeria');
    assert.equal(intent.preferences.currency, 'NGN');
    assert.ok(intent.entities.some(entity => entity.text === 'Afe Babalola University' && entity.matchedText === 'ABUAD'));
    assert.ok(intent.entities.some(entity => entity.text === 'Mechatronics Engineering'));
  } finally {
    globalThis.fetch = originalFetch;
  }
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



test('uses previous investigation context to resolve a short follow-up question', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      type: 'deadline', label: 'Find the admission deadline', goal: 'Find the deadline for the current application',
      subject: 'ABUAD', search_query: 'ABUAD deadline', source_preference: 'official',
      confidence: 0.96, explanation: 'The prior investigation identifies ABUAD as the institution.',
      subgoals: ['official application closing date'], entities: [{ text: 'ABUAD', kind: 'university', role: 'institution' }],
      constraints: [], ambiguities: [], clarification_needed: false, suggested_queries: []
    }) } }] }) };
  };
  try {
    const intent = await understandSearchIntentWithGroq('What about the deadline?', {
      env: { GROQ_API_KEY: 'context-test-key' },
      context: 'I want to apply for ABUAD.'
    });
    assert.equal(intent.type, 'deadline');
    assert.equal(intent.subject, 'ABUAD');
    assert.equal(intent.searchQuery, 'ABUAD deadline');
    assert.match(requestBody.messages[1].content, /I want to apply for ABUAD/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses Gemini as an independent intent pillar when Groq is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  let geminiBody;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(init.headers['x-goog-api-key'], 'gemini-test-key');
    geminiBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      type: 'application', label: 'Apply to ABUAD', goal: 'Gain admission to ABUAD',
      subject: 'ABUAD', search_query: 'ABUAD', source_preference: 'official',
      confidence: 0.97, explanation: 'The user wants to begin an admission application.',
      subgoals: ['official portal', 'eligibility', 'deadlines'],
      entities: [{ text: 'ABUAD', kind: 'university', role: 'target institution' }],
      constraints: ['undergraduate'], ambiguities: [], clarification_needed: false,
      suggested_queries: [{ query: 'ABUAD official admissions portal', reason: 'Find the official route' }]
    }) }] } }] }) };
  };
  try {
    const intent = await understandSearchIntentWithGroq('I want to apply for ABUAD', {
      env: { GEMINI_API_KEY: 'gemini-test-key', GEMINI_INTENT_MODEL: 'gemini-2.5-flash' }
    });
    assert.equal(intent.type, 'application');
    assert.equal(intent.subject, 'ABUAD');
    assert.equal(intent.provider, 'gemini');
    assert.equal(intent.providers[0].name, 'Gemini');
    assert.equal(geminiBody.generationConfig.responseMimeType, 'application/json');
    assert.ok(intent.subgoals.includes('eligibility'));
    assert.ok(!intent.constraints.includes('undergraduate'), 'AI must not invent an unstated qualification constraint');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses Groq and Gemini together and combines matching interpretations', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const result = {
    type: 'verification', label: 'Verify a public claim', goal: 'Check whether the claim is supported',
    subject: 'agency policy', search_query: 'agency policy', source_preference: 'primary-and-independent',
    confidence: 0.94, explanation: 'Check primary and independent evidence.',
    subgoals: ['official policy notice'], entities: [{ text: 'agency', kind: 'organization', role: 'subject' }],
    constraints: [], ambiguities: [], clarification_needed: false,
    suggested_queries: [{ query: 'agency official policy notice', reason: 'Find primary evidence' }]
  };
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('api.groq.com')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) };
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }) };
  };
  try {
    const intent = await understandSearchIntentWithGroq('Is it true that the agency changed its policy?', {
      env: { GROQ_API_KEY: 'groq-test-key', GEMINI_API_KEY: 'gemini-test-key' }
    });
    assert.equal(calls.length, 2);
    assert.equal(intent.type, 'verification');
    assert.equal(intent.provider, 'groq+gemini-consensus');
    assert.deepEqual(intent.providers.map(provider => provider.name), ['Groq', 'Gemini']);
    assert.ok(intent.suggestedQueries.some(item => item.query === 'agency official policy notice'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('continues with the available AI provider when the other provider fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('api.groq.com')) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      type: 'general-research', label: 'Research ABUAD', goal: 'Understand ABUAD',
      subject: 'ABUAD', search_query: 'ABUAD', source_preference: 'official',
      confidence: 0.82, explanation: 'Research the named institution.',
      subgoals: ['official information'], entities: [], constraints: [], ambiguities: [],
      clarification_needed: false, suggested_queries: []
    }) }] } }] }) };
  };
  try {
    const intent = await understandSearchIntentWithGroq('Tell me about ABUAD', {
      env: { GROQ_API_KEY: 'groq-test-key', GEMINI_API_KEY: 'gemini-test-key' }
    });
    assert.equal(intent.provider, 'gemini');
    assert.equal(intent.providers.length, 2);
    assert.equal(intent.providers.find(provider => provider.name === 'Gemini')?.status, 'success');
    assert.equal(intent.providers.find(provider => provider.name === 'Groq')?.status, 'unavailable');
    assert.equal(intent.type, 'general-research');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
