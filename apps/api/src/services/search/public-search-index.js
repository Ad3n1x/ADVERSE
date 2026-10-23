import crypto from 'node:crypto';
import { PublicSearchDocument } from '../../models/public-search-document.model.js';

const clean = (value, max = 6000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const dbReady = () => globalThis.__ADVERSE_MONGO_READY__ === true;

export async function findIndexedPublicResults(query, limit = 8) {
  if (!dbReady()) return [];
  const q = clean(query, 180);
  if (q.length < 2) return [];
  try {
    const docs = await PublicSearchDocument.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } },
    ).sort({ score: { $meta: 'textScore' }, lastSeenAt: -1 }).limit(Math.min(12, Math.max(1, limit))).lean();
    return docs.map(doc => ({
      title: doc.title || doc.canonicalUrl,
      url: doc.canonicalUrl,
      excerpt: doc.excerpt || '',
      publisher: doc.publisher || doc.hostname,
      provider: doc.provider || 'ADVERSE indexed source',
      providers: Array.isArray(doc.providers) ? doc.providers : [],
      publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
      retrievedAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : null,
      sourceType: doc.sourceType || 'web',
      matchedQueries: doc.matchedQueries || [],
      indexSignals: {
        indexed: true,
        lastSeenAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : null,
        lastFetchedAt: doc.lastFetchedAt ? new Date(doc.lastFetchedAt).toISOString() : null,
        textScore: Number.isFinite(doc.score) ? doc.score : undefined,
      },
    }));
  } catch (error) {
    // A text index may be building after the first deployment. Keep live search available.
    if (error?.code === 27 || /text index required|index is building/i.test(String(error?.message || ''))) return [];
    throw error;
  }
}

export async function indexPublicSearchResults(items, query, fetchedPages = []) {
  if (!dbReady() || !Array.isArray(items) || !items.length) return { indexed: 0 };
  const pageMap = new Map(fetchedPages.filter(item => item?.url).map(item => [item.url, item.page || null]));
  const now = new Date();
  const operations = [];
  for (const item of items.slice(0, 24)) {
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      const canonicalUrl = item.url;
      const page = pageMap.get(canonicalUrl);
      const title = clean(page?.title || item.title || canonicalUrl, 500);
      const excerpt = clean(page?.excerpt || item.excerpt || '', 6000);
      const publishedAt = item.publishedAt && !Number.isNaN(new Date(item.publishedAt).getTime())
        ? new Date(item.publishedAt) : null;
      operations.push({
        updateOne: {
          filter: { canonicalUrl },
          update: {
            $set: {
              hostname: url.hostname.toLowerCase().replace(/^www\./, ''),
              title,
              excerpt,
              publisher: clean(item.publisher || item.provider || url.hostname, 240),
              provider: clean(item.provider || item.publisher || 'Public source', 160),
              providers: [...new Set([...(item.providers || []), ...(item.provider ? [item.provider] : [])].map(v => clean(v, 160)).filter(Boolean))].slice(0, 12),
              sourceType: clean(item.sourceType || 'web', 40),
              publishedAt,
              lastSeenAt: now,
              lastFetchedAt: page ? now : undefined,
              contentHash: hash(title + '\n' + excerpt),
              $query: clean(query, 180),
            },
            $setOnInsert: { firstSeenAt: now },
            $addToSet: { matchedQueries: clean(query, 180) },
          },
          upsert: true,
        },
      });
    } catch {}
  }
  if (!operations.length) return { indexed: 0 };
  try {
    const result = await PublicSearchDocument.bulkWrite(operations, { ordered: false });
    return { indexed: Number(result.upsertedCount || 0) + Number(result.modifiedCount || 0) };
  } catch (error) {
    console.warn('ADVERSE public index update failed:', clean(error?.message, 180));
    return { indexed: 0, error: 'index_update_failed' };
  }
}
