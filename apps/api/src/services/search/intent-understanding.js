const clean = value => String(value ?? '')
  .normalize('NFKC')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 500);

const RULES = [
  { type: 'destination', label: 'Find an official or working destination', patterns: [/\b(official\s+(website|site|page)|website|web\s*site|homepage|login\s+page|sign\s*in\s+page|download\s+(page|link)|working\s+link|where\s+can\s+i\s+(find|access|download))\b/i], confidence: 0.91, sourcePreference: 'official' },
  { type: 'verification', label: 'Check a claim against evidence', patterns: [/\b(is\s+it\s+true|is\s+this\s+true|verify|verification|fact\s*check|fact-check|debunk|real\s+or\s+fake|truth\s+about|scam|fraud|legitimate|authenticity|did\s+.*\s+happen)\b/i], confidence: 0.88, sourcePreference: 'primary-and-independent' },
  { type: 'current-events', label: 'Find current news and updates', patterns: [/\b(latest|updates?|today|currently|current|recent|breaking|this\s+week|this\s+month|updates?|news|202[5-9])\b/i], confidence: 0.9, sourcePreference: 'recent' },
  { type: 'historical', label: 'Reconstruct history or chronology', patterns: [/\b(history|historical|timeline|chronology|originally|when\s+did|before|previous|former|old\s+version|archive|archived|wayback)\b/i], confidence: 0.87, sourcePreference: 'dated-primary-records' },
  { type: 'comparison', label: 'Compare options or competing explanations', patterns: [/\b(compare|comparison|versus|\bvs\.?\b|difference\s+between|which\s+is\s+better|pros\s+and\s+cons)\b/i], confidence: 0.86, sourcePreference: 'parallel-sources' },
  { type: 'how-to', label: 'Find instructions or troubleshooting guidance', patterns: [/\b(how\s+to|how\s+do\s+i|steps\s+to|guide|tutorial|fix|troubleshoot|not\s+working|error|configure|install|setup|set\s+up)\b/i], confidence: 0.85, sourcePreference: 'documentation' },
  { type: 'public-entity', label: 'Research a public person or organization', patterns: [/\b(who\s+is|about\s+the\s+person|biography|profile|organization|company|agency|foundation|university|government)\b/i], confidence: 0.8, sourcePreference: 'primary-and-reference' },
];

const PREFIXES = [
  /^(?:please\s+)?(?:find|search\s+for|look\s+up|research|investigate|show\s+me|tell\s+me\s+about|explain|check)\s+/i,
  /^(?:what\s+is|what\s+are|who\s+is|who\s+are|where\s+is|when\s+did|why\s+did|how\s+does|how\s+do\s+i)\s+/i,
  /^(?:is\s+it\s+true\s+that|is\s+this\s+true\s+that|build\s+a\s+timeline\s+of|create\s+a\s+timeline\s+of|compare)\s+/i,
  /^(?:the\s+)?(?:official\s+)?(?:website|web\s*site|site|homepage)\s+(?:for|of)\s+/i,
  /^(?:find\s+)?(?:the\s+)?(?:official\s+)?(?:website|web\s*site|site|homepage)\s+(?:for|of)\s+/i,
];

function extractSubject(query) {
  let subject = query;
  for (const pattern of PREFIXES) subject = subject.replace(pattern, '');
  subject = subject
    .replace(/\b(please|for\s+me|the\s+latest|latest|today|currently|right\s+now|official\s+website|official\s+site|website|web\s*site|homepage|login\s+page|download\s+link|working\s+link|fact\s*check|verify|verification|is\s+it\s+true|real\s+or\s+fake|timeline|chronology|history|historical|compare|comparison|versus|vs\.?)\b/gi, ' ')
    .replace(/\b(?:the|a|an|for|of|on|about|that|what|are|is|it|this|me|to|do|does|did)\b/gi, ' ')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return subject || query;
}

/** Interpret the user's search goal with transparent, bounded rules and no fabricated certainty. */
export function understandSearchIntent(input) {
  const originalQuery = clean(input);
  if (!originalQuery) return {
    type: 'general-research', label: 'General public-source research', confidence: 0,
    subject: '', searchQuery: '', sourcePreference: 'balanced', matchedSignals: [],
    explanation: 'No search question was supplied.',
  };

  const rule = RULES.find(candidate => candidate.patterns.some(pattern => pattern.test(originalQuery)));
  const selected = rule || {
    type: 'general-research',
    label: 'Explore a topic and discover relevant sources',
    confidence: 0.62,
    sourcePreference: 'balanced',
  };
  const subject = extractSubject(originalQuery);
  const matchedSignals = rule
    ? rule.patterns.filter(pattern => pattern.test(originalQuery)).map(pattern => pattern.source.slice(0, 90))
    : [];

  return {
    type: selected.type,
    label: selected.label,
    confidence: selected.confidence,
    subject,
    searchQuery: subject.length >= 2 ? subject : originalQuery,
    sourcePreference: selected.sourcePreference,
    matchedSignals,
    explanation: rule
      ? 'The wording suggests this research goal. ADVERSE keeps the original question and adds a small number of goal-specific search variants.'
      : 'No strong goal marker was detected, so ADVERSE keeps the wording broad and avoids guessing a narrower task.',
  };
}

/** Keep the original question and add a few goal-specific variants for public-source discovery. */
export function buildIntentQueryVariants(input, intent = understandSearchIntent(input), limit = 3) {
  const original = clean(input);
  if (!original) return [];
  const subject = clean(intent?.searchQuery || original);
  const candidates = [{ query: original, reason: 'original question' }];
  const add = (query, reason) => {
    const value = clean(query);
    if (value.length < 2 || candidates.some(item => item.query.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    candidates.push({ query: value, reason });
  };

  if (subject.length >= 2 && subject.toLocaleLowerCase() !== original.toLocaleLowerCase()) {
    add(subject, 'intent-focused subject');
  }

  const suffixes = {
    destination: ['official site domain'],
    verification: ['primary source evidence', 'independent fact check'],
    'current-events': ['latest reports official statement'],
    historical: ['dated primary records archive'],
    comparison: ['independent comparison review'],
    'how-to': ['official documentation troubleshooting'],
    'public-entity': ['official records background'],
    'general-research': [],
  };
  for (const suffix of suffixes[intent?.type] || []) add([subject, suffix].filter(Boolean).join(' '), 'intent: ' + intent.type);
  return candidates.slice(0, Math.max(1, Math.min(5, Number(limit) || 3)));
}
