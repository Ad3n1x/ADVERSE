import { normalizeSearchText } from '../search/normalize-search-text.js';

const STOP_WORDS = new Set([
  'the','and','for','with','from','into','that','this','what','when','where','who','why','how',
  'are','was','were','old','new','version','latest','best','about','find','search','info',
  'information','history','official','page','site','website','please','degree','degrees',
  'programme','program','course','courses','price','prices','fee','fees','tuition','cost','costs',
  'apply','application','admission','admissions','university','school','college'
]);

const INTENT_TERMS = {
  application: ['admissions','application portal','apply','entry requirements'],
  eligibility: ['eligibility','entry requirements','qualifications','admission criteria'],
  'fees-costs': ['tuition','fee schedule','school fees','acceptance fee','charges','accommodation'],
  'programme-availability': ['programme','program','degree','department','offered'],
  deadline: ['deadline','closing date','important dates'],
  'scholarship-funding': ['scholarship','financial aid','bursary','funding','grant'],
  destination: ['official website','official portal','login','homepage'],
  verification: ['official statement','primary source','evidence','corroboration'],
  'current-events': ['latest','news','update','announced','statement'],
  historical: ['archive','historical','timeline','records'],
  comparison: ['comparison','versus','differences','pros and cons'],
  'how-to': ['guide','documentation','instructions','steps','tutorial']
};

function tokenize(value) {
  return [...new Set(
    normalizeSearchText(value, 3000).toLocaleLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .match(/[\p{L}\p{N}][\p{L}\p{N}.-]{1,}/gu) || []
  )].filter(term => !STOP_WORDS.has(term));
}

function entityText(intent) {
  const entities = Array.isArray(intent?.entities) ? intent.entities : [];
  return entities.map(item => typeof item === 'string' ? item : item?.text).filter(Boolean);
}

/**
 * Relevance is a retrieval gate, not a truth or source-trust score.
 * Sparse provider metadata is retained as uncertain rather than rejected.
 */
export function evaluateSourceRelevance(source, query, intent = null, options = {}) {
  const title = normalizeSearchText(source?.title, 500);
  const url = normalizeSearchText(source?.url, 2048);
  const excerpt = normalizeSearchText(source?.excerpt || source?.description, 5000);
  const publisher = normalizeSearchText(source?.publisher, 250);
  const searchable = [title, url, excerpt, publisher].join(' ').toLocaleLowerCase();
  const metadataTerms = tokenize(searchable);
  const subject = intent?.searchQuery || intent?.subject || query;
  const subjectTerms = tokenize(subject);
  const matchedTerms = subjectTerms.filter(term => metadataTerms.includes(term));
  const entities = [...new Set([intent?.subject, ...entityText(intent)].filter(Boolean))];
  const entityMatches = entities.filter(entity => {
    const terms = tokenize(entity);
    return terms.length > 0 && terms.some(term => metadataTerms.includes(term));
  });
  const intentTerms = INTENT_TERMS[intent?.type] || [];
  const intentMatches = intentTerms.filter(term => {
    const normalized = normalizeSearchText(term).toLocaleLowerCase();
    return normalized && searchable.includes(normalized);
  });
  const titleMatches = matchedTerms.filter(term => tokenize(title).includes(term)).length;
  const subjectRatio = subjectTerms.length ? matchedTerms.length / subjectTerms.length : 0;
  const score = Math.max(0, Math.min(100,
    Math.round(subjectRatio * 60 + Math.min(25, intentMatches.length * 8) +
      Math.min(15, titleMatches * 5) + (entityMatches.length ? 10 : 0))
  ));

  const reasons = [];
  const hasUsableMetadata = metadataTerms.length >= 3;
  const hardSubjectMismatch = subjectTerms.length >= 2 && matchedTerms.length === 0 && hasUsableMetadata;
  if (hardSubjectMismatch) reasons.push('No meaningful subject terms match the requested topic.');
  if (intent?.type && intentTerms.length && !intentMatches.length && hasUsableMetadata) {
    reasons.push('No evidence of the requested task or information type appears in the available metadata.');
  }

  const accepted = !hardSubjectMismatch &&
    (!hasUsableMetadata || matchedTerms.length > 0 || intentMatches.length > 0);
  return {
    score,
    matchedTerms,
    intentMatch: intentMatches.length > 0,
    entityMatch: entityMatches.length > 0,
    accepted,
    rejectionReasons: accepted ? [] : (reasons.length ? reasons : ['Insufficient metadata to establish relevance.'])
  };
}

export function filterRelevantSources(items, query, intent = null, options = {}) {
  const candidates = Array.isArray(items) ? items : [];
  const evaluated = candidates.map(item => ({
    ...item,
    relevance: evaluateSourceRelevance(item, query, intent, options)
  }));
  return {
    accepted: evaluated.filter(item => item.relevance.accepted),
    rejected: evaluated.filter(item => !item.relevance.accepted),
    evaluated
  };
}
