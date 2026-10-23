/**
 * Retrieves a bounded number of public pages and persists newly discovered
 * evidence records. Provider orchestration and graph enrichment live elsewhere.
 */
export async function ingestEvidence({
  investigationId,
  unique,
  Evidence,
  id,
  listFor,
  saveRecord,
  scrapePublicPage,
  logger = console,
}) {
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

  return {
    saved,
    alreadyStoredCount: unique.length - pending.length,
    scrapeAttempted: scrapeCandidates.length,
    scrapedCount: scraped.filter(item => item.page).length,
    scrapeFailures: scraped
      .filter(item => item.error)
      .map(item => ({ url: item.item.url, reason: item.error }))
      .slice(0, 12),
  };
}

import crypto from 'node:crypto';
