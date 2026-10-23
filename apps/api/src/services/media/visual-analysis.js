const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Analyse one normalized image frame through Gemini Vision.
 * Keep media validation, OCR, and provider-response parsing out of HTTP routes.
 */
export async function analyzeVisualFrame({
  imageDataUrl,
  mediaType = 'image',
  userQuestion = '',
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  fetchImpl = fetch,
}) {
  if (!['image', 'video-frame'].includes(mediaType)) {
    const error = new Error('Unsupported visual media type.');
    error.code = 'INVALID_MEDIA_TYPE';
    error.status = 400;
    throw error;
  }

  const match = String(imageDataUrl || '').match(IMAGE_DATA_URL);
  if (!match) {
    const error = new Error('Provide a readable JPEG, PNG, or WebP frame.');
    error.code = 'INVALID_IMAGE';
    error.status = 400;
    throw error;
  }
  if (match[2].length > 350000) {
    const error = new Error('Image too large after compression. Try a smaller file.');
    error.code = 'IMAGE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  if (!String(apiKey || '').trim()) {
    const error = new Error('Visual analysis is not configured on the API. Set GEMINI_API_KEY in the Render service environment.');
    error.code = 'VISION_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const prompt = [
    'You are ADVERSE, a public-source visual research assistant.',
    mediaType === 'video-frame'
      ? 'Analyze this sampled frame from a user-provided video.'
      : 'Analyze this user-provided image.',
    'Read and transcribe all clearly visible text (OCR), preserving names, numbers, labels, signs, and timestamps as accurately as possible.',
    'Describe visible objects, scene, context, logos, landmarks, and distinctive non-sensitive visual details.',
    'Do not identify private people or infer sensitive traits. Do not claim a person or object identity is certain.',
    'Generate 3 to 5 concise search queries useful for finding public sources related to the visible content.',
    userQuestion ? 'User question or focus: ' + String(userQuestion).trim().slice(0, 500) + '. Prioritize this question while still reporting visible text accurately.' : '',
    'Return JSON only with keys: description (string), extractedText (string), visualDetails (array of strings), queries (array of strings).',
    'If no text is visible, return an empty extractedText string. Do not invent unreadable text.',
  ].join(' ');

  const response = await fetchImpl(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(String(model).trim()) + ':generateContent',
    {
      method: 'POST',
      headers: { 'x-goog-api-key': String(apiKey).trim(), 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/' + match[1], data: match[2] } },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 900, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(25000),
    },
  );

  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error('Gemini visual analysis failed (HTTP ' + response.status + '). Check the API key, model access, and quota.');
    error.code = 'VISION_PROVIDER_FAILED';
    error.status = 502;
    throw error;
  }

  let analysis;
  try {
    const candidateText = (payload?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
    analysis = JSON.parse(candidateText);
  } catch {
    const error = new Error('The visual analysis provider returned unreadable output. Try another image or video.');
    error.code = 'VISION_INVALID_RESPONSE';
    error.status = 502;
    throw error;
  }

  const description = String(analysis.description || '').trim().slice(0, 1200);
  const extractedText = String(analysis.extractedText || '').trim().slice(0, 5000);
  const visualDetails = [...new Set((Array.isArray(analysis.visualDetails) ? analysis.visualDetails : [])
    .map(value => String(value || '').trim().slice(0, 220)).filter(Boolean))].slice(0, 8);
  const queries = [...new Set((Array.isArray(analysis.queries) ? analysis.queries : [])
    .map(value => String(value || '').trim().slice(0, 160)).filter(value => value.length >= 3))].slice(0, 5);
  if (!queries.length) {
    const fallback = [extractedText, description].filter(Boolean).join(' ').slice(0, 160);
    if (fallback.length >= 3) queries.push(fallback);
  }
  if (!description && !extractedText && !visualDetails.length) {
    const error = new Error('No readable text or visual details were returned. Try a clearer image or a different video frame.');
    error.code = 'VISION_NO_CONTENT';
    error.status = 422;
    throw error;
  }

  return { description, extractedText, visualDetails, queries };
}
