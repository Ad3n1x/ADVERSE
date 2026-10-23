import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeVisualFrame } from './visual-analysis.js';

const imageDataUrl = 'data:image/jpeg;base64,' + Buffer.from('sample-frame').toString('base64');

test('requires a configured vision provider and returns an actionable configuration error', async () => {
  await assert.rejects(
    analyzeVisualFrame({ imageDataUrl, apiKey: '' }),
    error => error.code === 'VISION_NOT_CONFIGURED' && /GEMINI_API_KEY/.test(error.message),
  );
});

test('extracts visible text and details from image/video frames', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          description: 'A street sign in a city.',
          extractedText: 'KING STREET 24',
          visualDetails: ['Blue street sign', 'Road intersection'],
          queries: ['King Street sign', 'city road intersection'],
        }) }] } }],
      }),
    };
  };

  const result = await analyzeVisualFrame({
    imageDataUrl,
    mediaType: 'video-frame',
    apiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(result.extractedText, 'KING STREET 24');
  assert.equal(result.visualDetails.length, 2);
  assert.equal(result.queries.length, 2);
  assert.match(requestBody.contents[0].parts[0].text, /transcribe all clearly visible text/i);
  assert.equal(requestBody.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
});

test('rejects malformed media payloads before contacting the provider', async () => {
  let called = false;
  await assert.rejects(
    analyzeVisualFrame({ imageDataUrl: 'not-an-image', apiKey: 'test-key', fetchImpl: async () => { called = true; } }),
    error => error.code === 'INVALID_IMAGE',
  );
  assert.equal(called, false);
});
