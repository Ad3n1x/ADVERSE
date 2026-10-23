import crypto from 'node:crypto';

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

  const existing = await listFor(Evidence, 'evidence', investigationId);
  const existingUrls = new Set(existing.map(item => String(item.url || '').toLowerCase()));
  const pending = unique.filter(item => !existingUrls.has(item.url.toLowerCase()));
  const scrapeCandidates = pending.slice(0, 12);
  const scraped = await Promise.all(scrapeCandidates.map(async item => {
    try {
      return { item, page: await scrapePublicPage(item.url), error: '' };
    } catch (error) {
      return { item, page: null, error: String(error?.message || 'Page retrieval unavailable').slice(0, 240) };
    }
  }));
  const scrapeByUrl = new Map(scraped.map(result => [result.item.url, result]));
  const saved = [];

  for (const item of pending) {
    const retrieval = scrapeByUrl.get(item.url);
    const page = retrieval?.page;
    const excerpt = String(page?.excerpt || item.excerpt || '').slice(0, 5000);
    const title = String(
      page?.title && page.title !== new URL(item.url).hostname
        ? page.title
        : item.title || 'Untitled public source'
    ).slice(0, 240);
    const publisher = String(item.publisher || item.provider || new URL(item.url).hostname).slice(0, 200);
    const record = {
      id: id(),
      investigationId,
      title,
      url: item.url,
      sourceType: item.sourceType === 'document' ? 'document' : 'web',
      publisher,
      retrievedAt: new Date(page?.retrievedAt || item.retrievedAt || Date.now()),
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      excerpt,
      verificationStatus: 'unverified',
      contentHash: excerpt ? crypto.createHash('sha256').update(excerpt).digest('hex') : '',
      entities: [],
      captureTimestamp: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      saved.push(await saveRecord(Evidence, 'evidence', record));
    } catch (error) {
      logger.error?.('ADVERSE research save failed', String(error?.message || error));
    }
  }

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

  const providers = [...new Set(available.map(item => item.provider).filter(Boolean))];
  return {
    investigationId,
    queryCount: queries.length,
    queries,
    providers,
    discoveredCount: unique.length,
    alreadyStoredCount: unique.length - pending.length,
    savedCount: saved.length,
    graphEntitiesAdded,
    graphRelationshipsAdded,
    scrapeAttempted: scrapeCandidates.length,
    scrapedCount: scraped.filter(item => item.page).length,
    scrapeFailures: scraped
      .filter(item => item.error)
      .map(item => ({ url: item.item.url, reason: item.error }))
      .slice(0, 12),
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

async function enrichSourceProvenance({
  investigationId,
  savedSources,
  Entity,
  Relationship,
  id,
  listFor,
  saveRecord,
  logger,
}) {
  let graphEntitiesAdded = 0;
  let graphRelationshipsAdded = 0;

  try {
    const [knownEntities, knownRelationships] = await Promise.all([
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);
    const entityByUrl = new Map(
      knownEntities
        .filter(entity => entity.canonicalUrl)
        .map(entity => [String(entity.canonicalUrl).toLowerCase(), entity])
    );
    const entityByNameType = new Map(
      knownEntities.map(entity => [
        String(entity.name || '').trim().toLowerCase() + '|' + entity.type,
        entity,
      ])
    );
    const relationshipKeys = new Set(
      knownRelationships.map(item =>
        [String(item.fromEntityId), String(item.toEntityId), item.type].join('|')
      )
    );

    for (const source of savedSources) {
      const evidenceId = String(source.id || source._id || '');
      if (!evidenceId || !source.url) continue;

      let parsed;
      try {
        parsed = new URL(source.url);
      } catch {
        continue;
      }

      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const publisherName = String(source.publisher || host).trim().slice(0, 200) || host;
      const documentName = String(source.title || source.url).trim().slice(0, 200) || source.url;
      let publisher =
        entityByUrl.get(('https://' + host).toLowerCase()) ||
        entityByNameType.get(publisherName.toLowerCase() + '|domain') ||
        entityByNameType.get(publisherName.toLowerCase() + '|organization');

      if (!publisher) {
        try {
          publisher = await saveRecord(Entity, 'entities', {
            id: id(),
            investigationId,
            name: publisherName,
            type: 'domain',
            description: 'Publisher/domain identified from a saved public source URL. This identifies the source host, not its trustworthiness.',
            canonicalUrl: 'https://' + host,
            evidenceIds: [evidenceId],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          entityByUrl.set(('https://' + host).toLowerCase(), publisher);
          entityByNameType.set(publisherName.toLowerCase() + '|domain', publisher);
          graphEntitiesAdded++;
        } catch (error) {
          logger.warn?.('ADVERSE research publisher graph save failed', String(error?.message || error));
          continue;
        }
      }

      let document =
        entityByUrl.get(source.url.toLowerCase()) ||
        entityByNameType.get(documentName.toLowerCase() + '|document');

      if (!document) {
        try {
          document = await saveRecord(Entity, 'entities', {
            id: id(),
            investigationId,
            name: documentName,
            type: 'document',
            description: 'Public page discovered and saved by this research run. Review the original source before relying on its contents.',
            canonicalUrl: source.url,
            evidenceIds: [evidenceId],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          entityByUrl.set(source.url.toLowerCase(), document);
          entityByNameType.set(documentName.toLowerCase() + '|document', document);
          graphEntitiesAdded++;
        } catch (error) {
          logger.warn?.('ADVERSE research document graph save failed', String(error?.message || error));
          continue;
        }
      }

      const from = String(publisher.id || publisher._id || '');
      const to = String(document.id || document._id || '');
      const relationshipKey = [from, to, 'publishes'].join('|');
      if (!from || !to || from === to || relationshipKeys.has(relationshipKey)) continue;

      try {
        await saveRecord(Relationship, 'relationships', {
          id: id(),
          investigationId,
          fromEntityId: from,
          toEntityId: to,
          type: 'publishes',
          evidenceIds: [evidenceId],
          confidence: 'low',
          rationale: 'Publisher/domain and page URL were observed in the same saved source record. This records source provenance only; it does not validate the page or its claims.',
          verificationStatus: 'unverified',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        relationshipKeys.add(relationshipKey);
        graphRelationshipsAdded++;
      } catch (error) {
        logger.warn?.('ADVERSE research provenance link save failed', String(error?.message || error));
      }
    }
  } catch (error) {
    logger.warn?.('ADVERSE research graph enrichment incomplete', String(error?.message || error));
  }

  return { graphEntitiesAdded, graphRelationshipsAdded };
}
