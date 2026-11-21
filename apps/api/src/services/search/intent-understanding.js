import { buildOutcomeSearchQueries, enrichOutcomeIntent } from './outcome-intelligence.js';
const clean = value => String(value ?? '')
  .normalize('NFKC')
  .replace(/<[^>]*>/g, ' ')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 500);

const RULES = [
  { type: 'application', label: 'Find the official application route and explain how to apply', patterns: [/\b(i\s+(?:want|would\s+like)\s+to\s+apply|want\s+to\s+apply|apply\s+(?:to|for)|application\s+(?:for|to)|admission(?:s)?\s+(?:for|to)|register\s+(?:for|at|with)|registration\s+(?:for|at)|enrol(?:l)?\s+(?:at|in|for)|gain\s+admission\s+to|admission\s+(?:portal|application)|how\s+to\s+apply)\b/i], sourcePreference: 'official', subgoals: ['official application portal', 'eligibility and entry requirements', 'deadlines and application dates', 'fees and required documents', 'application steps and next actions'] },
  { type: 'eligibility', label: 'Assess eligibility against stated requirements', patterns: [/\b(am\s+i\s+eligible|do\s+i\s+qualify|can\s+i\s+(?:get\s+in|gain\s+admission|apply)|my\s+(?:grades|results|scores|qualifications)|with\s+my\s+(?:grades|results|scores)|requirements?\s+for\s+me)\b/i], sourcePreference: 'official', subgoals: ['published eligibility criteria', 'compare supplied qualifications with requirements', 'identify missing or uncertain criteria'] },
  { type: 'fees-costs', label: 'Find current fees and costs', patterns: [/\b(how\s+much|tuition|school\s+fees|acceptance\s+fee|application\s+fee|cost\s+of|price\s+of|fees?\s+for)\b/i], sourcePreference: 'official', subgoals: ['official fee schedule', 'additional and one-time charges', 'academic session and programme differences'] },
  { type: 'programme-availability', label: 'Check whether a programme or service is offered', patterns: [/\b(does|do|is|are)\s+.+\s+(offer|offers|offering|have|has|available|provide|provides)\b|\b(is\s+there|available\s+at|courses?\s+offered|programmes?\s+offered|majors?\s+offered)\b/i], sourcePreference: 'official', subgoals: ['official programme catalogue', 'campus and degree type', 'entry requirements and accreditation where relevant'] },
  { type: 'deadline', label: 'Find a deadline or important date', patterns: [/\b(deadline|application\s+deadline|closing\s+date|when\s+does|when\s+is|when\s+will|last\s+day|application\s+closes|registration\s+closes)\b/i], sourcePreference: 'official', subgoals: ['current official date', 'academic session or event it applies to', 'whether dates have changed'] },
  { type: 'scholarship-funding', label: 'Find scholarships and funding options', patterns: [/\b(scholarships?|bursar(?:y|ies)|financial\s+aid|funding|tuition\s+support|fully\s+funded|study\s+grant)\b/i], sourcePreference: 'official', subgoals: ['eligibility and award coverage', 'application process and deadline', 'official sponsor and terms'] },
  { type: 'comparison', label: 'Compare options against the user’s criteria', patterns: [/\b(compare|comparison|versus|\bvs\.?\b|difference\s+between|which\s+is\s+better|pros\s+and\s+cons)\b/i], sourcePreference: 'parallel-sources', subgoals: ['shared comparison criteria', 'material differences', 'trade-offs and source-backed recommendation'] },
  { type: 'verification', label: 'Check a claim against evidence', patterns: [/\b(is\s+it\s+true|is\s+this\s+true|verify|verification|fact\s*check|fact-check|debunk|real\s+or\s+fake|truth\s+about|scam|fraud|legitimate|authenticity|did\s+.*\s+happen)\b/i], sourcePreference: 'primary-and-independent', subgoals: ['original or primary evidence', 'independent corroboration', 'counterevidence and uncertainty'] },
  { type: 'current-events', label: 'Find current news and updates', patterns: [/\b(latest|updates?|today|currently|current|recent|breaking|this\s+week|this\s+month|news|202[5-9])\b/i], sourcePreference: 'recent', subgoals: ['most recent credible reporting', 'official statements', 'publication dates and changes'] },
  { type: 'historical', label: 'Reconstruct history or chronology', patterns: [/\b(history|historical|timeline|chronology|originally|when\s+did|before|previous|former|old\s+version|archive|archived|wayback)\b/i], sourcePreference: 'dated-primary-records', subgoals: ['dated primary records', 'chronological sequence', 'changes and gaps in the record'] },
  { type: 'destination', label: 'Find and check the official or working destination', patterns: [/\b(official\s+(website|site|page|portal)|website|web\s*site|homepage|login\s+page|sign\s*in\s+page|download\s+(page|link)|working\s+link|where\s+can\s+i\s+(find|access|download))\b/i], sourcePreference: 'official', subgoals: ['official domain or destination', 'working page or route', 'redirect and reachability checks'] },
  { type: 'how-to', label: 'Find instructions or troubleshooting guidance', patterns: [/\b(how\s+to|how\s+do\s+i|steps\s+to|guide|tutorial|fix|troubleshoot|not\s+working|error|configure|install|setup|set\s+up)\b/i], sourcePreference: 'documentation', subgoals: ['official instructions', 'prerequisites', 'ordered steps and common failure points'] },
  { type: 'public-entity', label: 'Research a public person or organization', patterns: [/\b(who\s+is|about\s+the\s+person|biography|profile|organization|company|agency|foundation|university|government)\b/i], sourcePreference: 'primary-and-reference', subgoals: ['identity and official profile', 'primary records', 'relevant background and dates'] },
];

const PREFIXES = [
  /^(?:i\s+(?:want|would\s+like|need)\s+to\s+apply\s+(?:to|for)|want\s+to\s+apply\s+(?:to|for)|how\s+do\s+i\s+apply\s+(?:to|for)|apply\s+(?:to|for)|application\s+(?:for|to)|admissions?\s+(?:for|to)|where\s+do\s+i\s+register\s+(?:for|at))\s+/i,
  /^(?:please\s+)?(?:find|search\s+for|look\s+up|research|investigate|show\s+me|tell\s+me\s+about|explain|check)\s+/i,
  /^(?:what\s+is|what\s+are|who\s+is|who\s+are|where\s+is|when\s+did|when\s+is|why\s+did|how\s+does|how\s+do\s+i|how\s+much\s+(?:is|are)|can\s+i\s+get\s+into)\s+/i,
  /^(?:is\s+it\s+true\s+that|is\s+this\s+true\s+that|build\s+a\s+timeline\s+of|create\s+a\s+timeline\s+of|compare)\s+/i,
  /^(?:the\s+)?(?:official\s+)?(?:website|web\s*site|site|homepage)\s+(?:for|of)\s+/i,
];

function extractSubject(query, type) {
  let subject = query;
  for (const pattern of PREFIXES) subject = subject.replace(pattern, '');
  if (type === 'application') {
    // The action prefix is removed above. Preserve institution-name components such as
    // "University of Lagos" and "College of Medicine" as part of the target entity.
    subject = subject.replace(/^the\s+/i, '')
      .replace(/\s+(?:and|also|plus)\s+(?=(?:find|check|tell|show|what|how|when|whether|compare|verify|look|search)\b).*/i, '');
  } else {
    subject = subject
      .replace(/\b(please|how|much|when|does|do|is|are|can|could|would|what|where|i|get|into|with|my|grades|results|scores|qualifications|close|closing|students|scholarships?|bursar(?:y|ies)|financial\s+aid|funding|tuition|fees?|cost|offer|offers|offering|available|programme|program|course|courses|admission|admissions|want|would|like|the\s+latest|latest|today|currently|right\s+now|official\s+website|official\s+site|website|web\s*site|homepage|login\s+page|download\s+link|working\s+link|fact\s*check|verify|verification|is\s+it\s+true|real\s+or\s+fake|timeline|chronology|history|historical|compare|comparison|versus|vs\.?)\b/gi, ' ')
      .replace(/\b(?:the|a|an|for|of|on|about|that|what|are|is|it|this|me|to|do|does|did)\b/gi, ' ');
  }
  return subject.replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim() || query;
}

/** Deterministic semantic baseline: keeps the original request while extracting a bounded goal and subject. */
export function understandSearchIntent(input) {
  const originalQuery = clean(input);
  if (!originalQuery) return {
    type: 'general-research', label: 'General public-source research', confidence: 0,
    subject: '', searchQuery: '', sourcePreference: 'balanced', matchedSignals: [],
    goal: 'Understand the topic', subgoals: [], entities: [], constraints: [], secondaryIntents: [],
    clarificationNeeded: false, ambiguities: [], explanation: 'No search question was supplied.',
  };

  const rule = RULES.find(candidate => candidate.patterns.some(pattern => pattern.test(originalQuery)));
  const secondaryClauses = originalQuery.split(/\s+(?:and|also|plus)\s+|[,;]+/i).slice(1);
  const secondaryRules = RULES.filter(candidate => candidate !== rule
    && secondaryClauses.some(clause => candidate.patterns.some(pattern => pattern.test(clause))));
  const selected = rule || {
    type: 'general-research', label: 'Understand the request and discover relevant evidence',
    sourcePreference: 'balanced', subgoals: ['identify the main subject', 'find authoritative context', 'check important details'],
  };
  const subject = extractSubject(originalQuery, selected.type);
  const matchedSignals = rule ? rule.patterns.filter(pattern => pattern.test(originalQuery)).map(pattern => pattern.source.slice(0, 120)) : [];
  const baseIntent = {
    type: selected.type,
    label: selected.label,
    confidence: rule ? 0.88 : 0.58,
    subject,
    searchQuery: subject.length >= 2 ? subject : originalQuery,
    sourcePreference: selected.sourcePreference,
    matchedSignals,
    goal: selected.label,
    subgoals: selected.subgoals.slice(0, 5),
    entities: subject ? [{ text: subject, role: 'primary-subject', kind: 'unknown' }] : [],
    constraints: [],
    secondaryIntents: secondaryRules.map(candidate => candidate.type).filter((type, index, rows) => type !== selected.type && rows.indexOf(type) === index).slice(0, 3),
    clarificationNeeded: false,
    ambiguities: [],
    explanation: rule
      ? 'The wording indicates a likely goal. ADVERSE preserves the complete request and builds bounded research tasks around it.'
      : 'No single strong goal marker was detected. ADVERSE preserves the wording and avoids guessing a narrower task.',
  };
  return enrichOutcomeIntent(originalQuery, baseIntent);
}

/** Generate bounded research leads that directly support the user's intended outcome. */
export function buildIntentQueryVariants(input, intent = understandSearchIntent(input), limit = 3) {
  const original = clean(input);
  if (!original) return [];
  const subject = clean(intent?.searchQuery || intent?.subject || original);
  const candidates = [{ query: original, reason: 'original question' }];
  const add = (query, reason) => {
    const value = clean(query);
    if (value.length < 2 || candidates.some(item => item.query.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    candidates.push({ query: value, reason });
  };
  const suffixes = {
    application: ['official admissions application portal', 'admission requirements eligibility', 'application deadline fees required documents next steps'],
    eligibility: ['official eligibility criteria requirements', 'compare qualifications with entry requirements'],
    'fees-costs': ['official fee schedule tuition additional charges', 'current academic session programme fees'],
    'programme-availability': ['official programme catalogue available degrees', 'programme accreditation entry requirements'],
    deadline: ['official current deadline closing date', 'academic session application date changes'],
    'scholarship-funding': ['official scholarship eligibility coverage deadline', 'scholarship application procedure sponsor'],
    destination: ['official site domain working portal'],
    verification: ['primary source evidence', 'independent corroboration counterevidence'],
    'current-events': ['latest credible reports official statement'],
    historical: ['dated primary records archive chronology'],
    comparison: ['independent comparison criteria trade-offs'],
    'how-to': ['official documentation prerequisites step-by-step instructions'],
    'public-entity': ['official records profile background'],
    'general-research': ['authoritative background evidence'],
  };
  for (const item of buildOutcomeSearchQueries(intent)) add(item.query, item.reason);
  for (const item of (Array.isArray(intent?.suggestedQueries) ? intent.suggestedQueries : [])) add(item?.query, 'AI: ' + clean(item?.reason || 'intent-specific research lead'));
  const primarySuffixes = suffixes[intent?.type] || suffixes['general-research'];
  const secondaryTypes = (Array.isArray(intent?.secondaryIntents) ? intent.secondaryIntents : []).slice(0, 3);
  const primaryLeadCount = secondaryTypes.length ? Math.min(2, primarySuffixes.length) : primarySuffixes.length;
  for (const suffix of primarySuffixes.slice(0, primaryLeadCount)) add([subject, suffix].filter(Boolean).join(' '), 'intent: ' + intent.type);
  for (const secondaryType of secondaryTypes) {
    const suffix = (suffixes[secondaryType] || [])[0];
    if (suffix) add([subject, suffix].filter(Boolean).join(' '), 'secondary intent: ' + secondaryType);
  }
  for (const suffix of primarySuffixes.slice(primaryLeadCount)) add([subject, suffix].filter(Boolean).join(' '), 'intent: ' + intent.type);
  if (subject.length >= 2 && subject.toLocaleLowerCase() !== original.toLocaleLowerCase()) add(subject, 'intent-focused subject');
  return candidates.slice(0, Math.max(1, Math.min(12, Number(limit) || 3)));
}
