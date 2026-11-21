const CURRENCY_PATTERNS = [
  { currency: 'NGN', pattern: /₦\s*([\d,]+(?:\.\d+)?)/i },
  { currency: 'NGN', pattern: /\bNGN\s*([\d,]+(?:\.\d+)?)/i },
  { currency: 'USD', pattern: /\$\s*([\d,]+(?:\.\d+)?)/i },
  { currency: 'GBP', pattern: /£\s*([\d,]+(?:\.\d+)?)/i },
  { currency: 'EUR', pattern: /€\s*([\d,]+(?:\.\d+)?)/i }
];

export function classifyTypedClaim(statement) {
  const text = String(statement || '').toLocaleLowerCase();
  if (/\b(?:acceptance|accommodation|registration|application|laboratory|medical|development)\s+fee\b/.test(text)) return 'additional-fee';
  if (/\b(?:tuition|school fees?|programme fees?|program fees?|fee schedule)\b/.test(text)) return 'tuition';
  if (/\b(?:application portal|admission portal|apply online|application form)\b/.test(text)) return 'application-route';
  if (/\b(?:scholarship|bursary|financial aid|grant)\b/.test(text)) return 'scholarship';
  if (/\b(?:eligible|eligibility|entry requirements?|admission requirements?|qualifications?)\b/.test(text)) return 'eligibility';
  if (/\b(?:deadline|closing date|last day|application closes)\b/.test(text)) return 'deadline';
  if (/\b(?:20\d{2}\s*[/-]\s*20\d{2}|academic session|academic year)\b/.test(text)) return 'academic-session';
  if (/\b(?:mechatronics|programme|program|degree|course|department|faculty)\b/.test(text)) return 'programme';
  if (/\b(?:university|college|polytechnic|abuad|unilag|uniben|unilorin|futa|oau|unn|unizik|lasu)\b/.test(text)) return 'institution';
  return 'general-fact';
}

function extractValue(statement) {
  for (const item of CURRENCY_PATTERNS) {
    const match = String(statement || '').match(item.pattern);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ''));
      return {
        amount: Number.isFinite(amount) ? amount : null,
        currency: item.currency,
        unit: /per semester/i.test(statement) ? 'semester'
          : /per session|per academic year/i.test(statement) ? 'academic session'
            : null,
        text: null
      };
    }
  }
  return { amount: null, currency: null, unit: null, text: null };
}

export function buildTypedClaim(candidate, sourceIds, claimId) {
  const statement = String(candidate?.claim || candidate?.text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!statement || !Array.isArray(sourceIds) || !sourceIds.length) return null;
  const session = statement.match(/\b(20\d{2})\s*[/-]\s*(20\d{2})\b/);
  const value = extractValue(statement);
  value.text = statement;
  return {
    claimId,
    type: classifyTypedClaim(statement),
    statement,
    value,
    entityId: null,
    academicSession: session ? session[1] + '/' + session[2] : null,
    sourceIds: [...new Set(sourceIds)].slice(0, 20),
    assessment: 'unreviewed',
    confidence: 0
  };
}
