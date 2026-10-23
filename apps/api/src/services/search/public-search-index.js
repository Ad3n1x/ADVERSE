import crypto from 'node:crypto';
import { PublicSearchDocument } from '../../models/public-search-document.model.js';
import { expandSearchQueries } from './global-search.js';

const clean = (value, max = 6000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const dbReady = () => globalThis.__ADVERSE_MONGO_READY__ === true;

export async function suggestIndexedSearches(query, limit = 6) {
  if (!dbReady()) return [];
  const q = clean(query, 120);
  if (q.length < 2) return [];
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, character => '\\' + character);
  try {
    const docs = await PublicSearchDocument.find({
      $or: [
        { title: { $regex: '^' + escaped, $options: 'i' } },
        { matchedQueries: { $regex: '^' + escaped, $options: 'i' } },
      ],
    }).sort({ lastSeenAt: -1 }).select('title matchedQueries lastSeenAt').limit(30).lean();
    const seen = new Set();
    const suggestions = [];
    for (const doc of docs) {
      for (const candidate of [doc.title, ...(doc.matchedQueries || [])]) {
        const value = clean(candidate, 180);
        if (value.length < 2 || !value.toLocaleLowerCase().startsWith(q.toLocaleLowerCase())) continue;
        const key = value.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({ query: value, source: candidate === doc.title ? 'indexed title' : 'previous search' });
        if (suggestions.length >= Math.min(8, Math.max(1, limit))) return suggestions;
      }
    }
    return suggestions;
  } catch (error) {
    if (error?.code === 27 || /index is building/i.test(String(error?.message || ''))) return [];
    throw error;
  }
}

export async function findIndexedPublicResults(query, limit = 8) {
  if (!dbReady()) return [];
  const q = clean(query, 180);
  if (q.length < 2) return [];
  try {
    const variants = expandSearchQueries(q, 4).map(item => item.query);
    const searches = [...new Set([q, ...variants])].slice(0, 4);
    const batches = await Promise.all(searches.map(async searchTerm => {
      try {
        return await PublicSearchDocument.find(
          { $text: { $search: searchTerm } },
          { score: { $meta: 'textScore' } },
        ).sort({ score: { $meta: 'textScore' }, lastSeenAt: -1 }).limit(Math.min(12, Math.max(1, limit))).lean();
      } catch (error) {
        if (error?.code === 27 || /text index required|index is building/i.test(String(error?.message || ''))) return [];
        throw error;
      }
    }));
    const merged = new Map();
    for (const docs of batches) for (const doc of docs) {
      const previous = merged.get(doc.canonicalUrl);
      if (!previous || Number(doc.score || 0) > Number(previous.score || 0)) merged.set(doc.canonicalUrl, doc);
    }
    return [...merged.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)
      || new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime())
      .slice(0, Math.min(12, Math.max(1, limit))).map(doc => ({
        title: doc.title || doc.canonicalUrl,
        url: doc.canonicalUrl,
        excerpt: doc.excerpt || '',
        publisher: doc.publisher || doc.hostname,
        provider: doc.provider || 'ADVERSE indexed source',
        providers: Array.isArray(doc.providers) ? doc.providers : [],
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
        retrievedAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : null,
        sourceType: doc.sourceType || 'web',
        matchedQueries: Array.isArray(doc.matchedQueries) ? doc.matchedQueries.slice(-8) : [],
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
              ...(page ? { lastFetchedAt: now } : {}),
              contentHash: hash(title + '\n' + excerpt),
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
