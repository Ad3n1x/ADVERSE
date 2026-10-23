import { ingestEvidence } from './evidence-ingestion.js';
import { enrichSourceProvenance } from './source-provenance.js';
import { linkEvidenceAutomatically } from './evidence-linking.js';

const cleanQuery = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 200);

/**
 * Runs a bounded, two-pass public-source investigation.
 *
 * Pass one gathers seed evidence. Pass two plans and searches follow-up leads,
 * preferring configured AI planning but retaining a transparent heuristic
 * fallback. This improves lead-following without pretending to crawl the web
 * exhaustively or treating retrieved material as verified fact.
 */
export async function runResearchPipeline({
  investigationId,
  queries,
  Evidence,
  Entity,
  Relationship,
  id,
  listFor,
  saveRecord,
  scrapePublicPage,
  searchAllPublic,
  validatePublicUrl,
  planAgentFollowUps,
  providerKeys = {},
  question = '',
  logger = console,
  isDb = () => false,
  memory,
}) {
  const seedQueries = [...new Set((Array.isArray(queries) ? queries : []).map(cleanQuery).filter(Boolean))].slice(0, 3);
  const firstPass = await Promise.allSettled(seedQueries.map(query => searchAllPublic(query)));
  const seedResults = firstPass.flatMap((item, index) =>
    item.status === 'fulfilled'
      ? (item.value.results || []).map(result => ({ ...result, matchedQuery: seedQueries[index] }))
      : []
  );

  if (!seedResults.length) {
    return {
      failure: 'RESEARCH_UNAVAILABLE',
      details: {
        queries: seedQueries,
        providerFailures: firstPass.filter(item => item.status === 'rejected').map(item => String(item.reason?.message || 'provider unavailable')),
        pass: 'seed',
      },
    };
  }

  const investigationQuestion = cleanQuery(question || seedQueries.join(' '));
  let planning = { mode: 'heuristic', provider: null, leads: [] };
  if (typeof planAgentFollowUps === 'function') {
    try {
      const proposed = await planAgentFollowUps({
        question: investigationQuestion,
        results: seedResults.slice(0, 12),
        providerKeys,
      });
      if (proposed && Array.isArray(proposed.leads)) {
        planning = {
          mode: proposed.mode === 'ai' ? 'ai' : 'heuristic',
          provider: proposed.provider || null,
          leads: proposed.leads
            .map(lead => ({ query: cleanQuery(lead?.query), reason: String(lead?.reason || '').replace(/\\s+/g, ' ').trim().slice(0, 240) }))
            .filter(lead => lead.query.length >= 5)
            .slice(0, 3),
        };
      }
    } catch (error) {
      logger.warn?.('ADVERSE follow-up lead planning unavailable; using bounded fallback', String(error?.message || error).slice(0, 180));
    }
  }

  // Deterministic fallback ensures the workflow can still pursue leads when
  // no AI credential is configured. These are search hypotheses, not findings.
  if (!planning.leads.length) {
    const fallbacks = [
      { query: investigationQuestion + ' official source', reason: 'Seek a primary or official record.' },
      { query: investigationQuestion + ' independent reporting', reason: 'Look for reporting from a separately operated publisher.' },
      { query: investigationQuestion + ' timeline evidence', reason: 'Clarify dates and sequence of events.' },
    ];
    const seedKeys = new Set(seedQueries.map(query => query.toLowerCase()));
    planning.leads = fallbacks
      .map(lead => ({ ...lead, query: cleanQuery(lead.query) }))
      .filter(lead => lead.query.length >= 5 && !seedKeys.has(lead.query.toLowerCase()))
      .slice(0, 3);
    planning.mode = 'heuristic';
    planning.provider = null;
  }

  const seenQueries = new Set(seedQueries.map(query => query.toLowerCase()));
  const followUpLeads = planning.leads.filter(lead => {
    const key = lead.query.toLowerCase();
    if (seenQueries.has(key)) return false;
    seenQueries.add(key);
    return true;
  }).slice(0, 3);
  const followUpSettled = await Promise.allSettled(followUpLeads.map(lead => searchAllPublic(lead.query)));
  const followUpResults = followUpSettled.flatMap((item, index) =>
    item.status === 'fulfilled'
      ? (item.value.results || []).map(result => ({
          ...result,
          matchedQuery: followUpLeads[index].query,
          leadReason: followUpLeads[index].reason,
        }))
      : []
  );
  const available = [...seedResults, ...followUpResults];

  const seenUrls = new Set();
  const unique = available.filter(item => {
    try {
      const url = validatePublicUrl(item.url).href;
      const key = url.toLowerCase();
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      item.url = url;
      return true;
    } catch {
      return false;
    }
  }).slice(0, 30);

  const {
    saved,
    alreadyStoredCount,
    scrapeAttempted,
    scrapedCount,
    scrapeFailures,
  } = await ingestEvidence({
    investigationId,
    unique,
    Evidence,
    id,
    listFor,
    saveRecord,
    scrapePublicPage,
    logger,
  });

  const { graphEntitiesAdded, graphRelationshipsAdded } = await enrichSourceProvenance({
    investigationId,
    savedSources: saved,
    Entity,
    Relationship,
    id,
    listFor,
    saveRecord,
    logger,
  });

  const automaticLinks = await linkEvidenceAutomatically({
    investigationId,
    savedSources: saved,
    Evidence,
    Entity,
    Relationship,
    isDb,
    memory,
    id,
    saveRecord,
    listFor,
    logger,
  });

  const providers = [...new Set(available.map(item => item.provider).filter(Boolean))];
  const providerFailures = firstPass.filter(item => item.status === 'rejected').length
    + followUpSettled.filter(item => item.status === 'rejected').length;
  return {
    investigationId,
    queryCount: seedQueries.length + followUpLeads.length,
    queries: seedQueries,
    followUpQueries: followUpLeads,
    leadPlanning: { mode: planning.mode, provider: planning.provider, leadCount: followUpLeads.length },
    searchPasses: 2,
    providers,
    discoveredCount: unique.length,
    alreadyStoredCount,
    savedCount: saved.length,
    graphEntitiesAdded,
    graphRelationshipsAdded,
    ...automaticLinks,
    scrapeAttempted,
    scrapedCount,
    scrapeFailures,
    providerFailures,
    results: saved.map(item => ({
      id: String(item.id || item._id),
      title: item.title,
      url: item.url,
      publisher: item.publisher,
      sourceType: item.sourceType,
      verificationStatus: item.verificationStatus,
    })),
    retrievedAt: new Date().toISOString(),
    coverage: 'Two-pass, bounded public-source discovery: initial searches followed by up to three lead-driven searches. Up to 12 candidate pages are fetched as bounded public HTML/text; other saved records retain provider-provided snippets or abstracts. This is not exhaustive whole-web crawling.',
    limitations: [
      'Every new record is marked unverified. Retrieval is not proof that a claim is true.',
      'Follow-up searches are leads to test, not facts; heuristic leads may be broad when no AI planner is configured.',
      'Only publicly reachable HTML/text pages are retrieved; redirects, private-network destinations, unsupported content types, and pages over 1 MB are skipped.',
      'Provider coverage varies. Search results are not exhaustive, and sites may block automated requests or impose access restrictions.',
      'Review original pages, publication dates, provenance, and contradictory evidence before drawing conclusions.',
    ],
  };
}
