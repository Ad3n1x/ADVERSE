import { ingestEvidence } from './evidence-ingestion.js';
import { enrichSourceProvenance } from './source-provenance.js';
import { linkEvidenceAutomatically } from './evidence-linking.js';

/**
 * Runs bounded public-source discovery for one investigation.
 *
 * HTTP concerns stay in the route. This service owns the research workflow:
 * provider fan-out, URL validation/deduplication, bounded retrieval, evidence
 * persistence, and source-provenance graph enrichment.
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
  logger = console,
  isDb = () => false,
  memory,
}) {
  const settled = await Promise.allSettled(queries.map(query => searchAllPublic(query)));
  const available = settled.flatMap((item, index) =>
    item.status === 'fulfilled'
      ? (item.value.results || []).map(result => ({ ...result, matchedQuery: queries[index] }))
      : []
  );

  if (!available.length) {
    return {
      failure: 'RESEARCH_UNAVAILABLE',
      details: {
        queries,
        providerFailures: settled
          .filter(item => item.status === 'rejected')
          .map(item => String(item.reason?.message || 'provider unavailable')),
      },
    };
  }

  const seen = new Set();
  const unique = available.filter(item => {
    try {
      const url = validatePublicUrl(item.url).href;
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
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
  return {
    investigationId,
    queryCount: queries.length,
    queries,
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
    providerFailures: settled.filter(item => item.status === 'rejected').length,
    results: saved.map(item => ({
      id: String(item.id || item._id),
      title: item.title,
      url: item.url,
      publisher: item.publisher,
      sourceType: item.sourceType,
      verificationStatus: item.verificationStatus,
    })),
    retrievedAt: new Date().toISOString(),
    coverage: 'Automated discovery across Wikipedia, Crossref, and OpenAlex. Up to 12 candidate pages are fetched as bounded public HTML/text; other saved records retain provider-provided snippets or abstracts. This is not exhaustive whole-web crawling.',
    limitations: [
      'Every new record is marked unverified. Retrieval is not proof that a claim is true.',
      'Only publicly reachable HTML/text pages are retrieved; redirects, private-network destinations, unsupported content types, and pages over 1 MB are skipped.',
      'Provider coverage varies. Search results are not exhaustive, and sites may block automated requests or impose access restrictions.',
      'Review original pages, publication dates, provenance, and contradictory evidence before drawing conclusions.',
    ],
  };
}

