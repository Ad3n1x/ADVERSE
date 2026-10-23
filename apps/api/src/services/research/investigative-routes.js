const clean = (value, max = 220) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const ROUTE_ROUNDS = {
  1: ['primary-records', 'counterevidence'],
  2: ['independent-corroboration', 'chronology-archives'],
};

function route({ id, label, purpose, suffix, lookFor, check, reporterStep = '', family = 'core' }, question) {
  return {
    id,
    label,
    purpose,
    query: clean(question + ' ' + suffix, 230),
    lookFor,
    check,
    reporterStep,
    family,
  };
}

/**
 * Build a transparent, bounded reporting plan from public-interest investigation methods.
 * These are research routes, not findings. Reporter-only actions are never claimed as automated.
 */
export function buildInvestigativeRoutes(question, results = []) {
  const subject = clean(question, 150);
  if (subject.length < 2) return [];

  const context = subject + ' ' + (Array.isArray(results) ? results : []).slice(0, 12)
    .map(item => String((item && item.title) || '') + ' ' + String((item && item.excerpt) || '') + ' ' + String((item && item.publisher) || ''))
    .join(' ');
  const financial = /\b(contract|procurement|tender|budget|spend|spending|payment|funds?|financ(?:e|ial)|audit|loan|grant|company|corporat(?:e|ion)|shareholder|ownership|beneficial owner|asset|revenue|invoice|project cost|deal|bribery|corruption)\b/i.test(subject);
  const media = /\b(video|photo|photograph|image|picture|clip|footage|recording|screenshot|viral|post went viral|visual evidence|deepfake|manipulated media)\b/i.test(context);
  const publicInstitution = /\b(government|ministry|ministers?|agency|commission|council|public sector|public service|election|policy|law|bill|regulation|official|public contract|public spending|state|federal|local authority|university|hospital|police|court|parliament|senate|assembly)\b/i.test(subject);

  const routes = [
    route({
      id: 'primary-records',
      label: 'Original records',
      purpose: 'Find the document or record closest to the underlying event, rather than relying only on summaries.',
      suffix: 'official record original document filing public registry',
      lookFor: 'Court or regulatory records, official notices, full reports, original datasets, filings, contracts or transcripts where relevant.',
      check: 'Confirm the issuing body, version, date, definitions and whether the record directly addresses the question.',
      reporterStep: 'If a relevant public record is not available online, consider a lawful access-to-information request in the relevant jurisdiction. ADVERSE does not submit requests.',
    }, subject),
    route({
      id: 'counterevidence',
      label: 'Counterevidence & response',
      purpose: 'Test the starting assumption and look for denials, corrections, alternative explanations and the subject’s documented response.',
      suffix: 'response rebuttal denial correction alternative explanation',
      lookFor: 'Corrections, official replies, opposing documents, independent explanations and evidence that challenges the initial account.',
      check: 'Compare the exact proposition, date, scope and context. A denial is a relevant response, not proof that the disputed claim is false.',
      reporterStep: 'Before publication of a material allegation, seek a fair, specific response from the relevant party and accurately record any reply or non-response.',
    }, subject),
    route({
      id: 'independent-corroboration',
      label: 'Independent corroboration',
      purpose: 'Check whether other sources independently support the key detail, rather than repeating a single report.',
      suffix: 'independent reporting original sources corroboration source lineage',
      lookFor: 'Separately reported accounts, named primary material, original witnesses or datasets, and links to the earliest available report.',
      check: 'Trace citations and syndication. Different websites or domains do not by themselves establish independent sourcing.',
    }, subject),
    route({
      id: 'chronology-archives',
      label: 'Timeline & archived versions',
      purpose: 'Reconstruct what was published or known when, and look for relevant changes to public pages.',
      suffix: 'timeline dates original publication archived versions history',
      lookFor: 'Dated notices, publication times, archived captures, prior versions and contemporaneous coverage.',
      check: 'Keep event date, publication date, archive-capture time and retrieval time distinct. An archive gap is not proof that content never existed.',
      reporterStep: 'Use the app’s archive lookup for important URLs and retain the original URL and capture timestamp.',
    }, subject),
    route({
      id: 'underlying-data',
      label: 'Underlying data & methods',
      purpose: 'Look for the source material and method behind numerical claims, charts, rankings or conclusions.',
      suffix: 'underlying data dataset methodology raw statistics annual report',
      lookFor: 'Original spreadsheets, methods notes, data dictionaries, sample sizes, baselines, audit reports and reproducible calculations.',
      check: 'Recalculate key totals and check units, time periods, missing data, definitions and whether comparisons are like-for-like.',
    }, subject),
    route({
      id: 'expert-perspectives',
      label: 'Independent scrutiny',
      purpose: 'Find technical context and perspectives that could reveal missing assumptions or overlooked impacts.',
      suffix: 'independent expert analysis technical review affected communities public response',
      lookFor: 'Qualified independent analysis, methods critiques, relevant professional bodies and publicly documented stakeholder responses.',
      check: 'Check expertise, funding or conflicts of interest, and distinguish analysis from firsthand observation.',
      reporterStep: 'Interviews and source conversations require human judgment. Agree on on-record/background rules in advance and keep accurate notes.',
    }, subject),
  ];

  if (financial) {
    routes.push(route({
      id: 'follow-the-money',
      label: 'Money, contracts & ownership',
      purpose: 'Follow public money or commercial claims through records instead of inferring a financial link from names alone.',
      suffix: 'procurement award contract amount tender budget audit payments company filings ownership registry',
      lookFor: 'Award notices, tender documents, audit findings, annual reports, corporate filings and public ownership records in the relevant jurisdiction.',
      check: 'Verify legal entity names, dates, currency, award versus payment, and the document supporting each ownership or transaction link.',
      reporterStep: 'Registry access and disclosure rules differ by jurisdiction. Record the registry and filing date, and do not treat a shared name as confirmed identity.',
      family: 'specialist',
    }, subject));
  }

  if (media) {
    routes.push(route({
      id: 'media-provenance',
      label: 'Image & video verification',
      purpose: 'Test whether media matches the claimed event, context, date or location before drawing conclusions from it.',
      suffix: 'original upload source date location context reverse image search verification',
      lookFor: 'Earliest available upload, source account context, full-length media, contemporaneous reports and independent visual landmarks.',
      check: 'A visual match is a lead, not proof of identity. Check context and provenance; edits, captions or reposts may mislead.',
      reporterStep: 'Use reverse-image and frame-search tools where appropriate, and keep an untouched copy of the submitted original when lawful.',
      family: 'specialist',
    }, subject));
  }

  if (publicInstitution) {
    routes.push(route({
      id: 'public-records-access',
      label: 'Public records & disclosure',
      purpose: 'Identify which public body or record system may hold missing documents relevant to the question.',
      suffix: 'public records disclosure freedom of information request official disclosure register',
      lookFor: 'Records held by the responsible authority, legislative documents, procurement portals, gazettes, budget documents and audit publications.',
      check: 'Confirm the responsible jurisdiction, the document’s legal status and the date range covered.',
      reporterStep: 'If indexes do not surface the record, prepare a focused, lawful records request under the applicable disclosure rules. This route does not file it automatically.',
      family: 'specialist',
    }, subject));
  }

  return routes.map((item, index) => ({ ...item, order: index + 1 }));
}

/** Pick two different methods per follow-up round so the agent does not repeat one search style. */
export function investigativeRoutesForRound(routes, round) {
  const all = Array.isArray(routes) ? routes : [];
  if (ROUTE_ROUNDS[round]) {
    const ids = ROUTE_ROUNDS[round];
    return ids.map(id => all.find(item => item.id === id)).filter(Boolean);
  }
  if (round !== 3) return [];
  const specialist = all.filter(item => item.family === 'specialist');
  const specialistRoute = specialist[0];
  const nextCore = all.find(item => item.id === 'underlying-data')
    || all.find(item => item.id === 'expert-perspectives');
  const secondSpecialist = specialist[1];
  const selected = [specialistRoute || nextCore, secondSpecialist || (specialistRoute ? nextCore : all.find(item => item.id === 'expert-perspectives'))];
  return [...new Map(selected.filter(Boolean).map(item => [item.id, item])).values()].slice(0, 2);
}
