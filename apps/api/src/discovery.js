import crypto from 'node:crypto';
import { Investigation, Evidence, Entity } from './models.js';
import { scrapePublicPage, validatePublicUrl } from './providers.js';
import { searchAllPublic } from './global-search.js';

let running = false;
const MAX_CASES_PER_CYCLE = 3;
const MAX_NEW_PER_CASE = 6;
const MAX_FETCH_PER_CASE = 4;
const intervalMs = Math.max(15, Number(process.env.DISCOVERY_INTERVAL_MINUTES || 30)) * 60 * 1000;

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
function queriesFor(investigation, recentEvidence, entities) {
  const candidates = [
    investigation.title,
    investigation.question,
    investigation.title && investigation.question ? investigation.title + ' ' + investigation.question : '',
    ...entities.slice(0, 2).map(entity => entity.name),
    ...recentEvidence.slice(0, 2).map(item => clean(item.title, 160))
  ];
  const seen = new Set();
  return candidates.map(value => clean(value, 200)).filter(value => {
    const key = value.toLowerCase();
    if (key.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

async function researchInvestigation(investigation) {
  const iid = String(investigation._id);
  const [existing, entities] = await Promise.all([
    Evidence.find({ investigationId: iid }).select('url title retrievedAt').sort({ retrievedAt: -1 }).limit(500).lean(),
    Entity.find({ investigationId: iid }).select('name').sort({ updatedAt: -1 }).limit(20).lean()
  ]);
  const queries = queriesFor(investigation, existing.slice(0, 20), entities);
  if (!queries.length) return { caseId: iid, discovered: 0, saved: 0, scraped: 0 };
  const settled = await Promise.allSettled(queries.map(query => searchAllPublic(query)));
  const discovered = settled.flatMap((result, index) => result.status === 'fulfilled'
    ? (result.value.results || []).map(item => ({ ...item, matchedQuery: queries[index] })) : []);
  const existingUrls = new Set(existing.map(item => String(item.url || '').toLowerCase()));
  const seen = new Set();
  const fresh = discovered.filter(item => {
    try {
      const url = validatePublicUrl(item.url).href;
      const key = url.toLowerCase();
      if (existingUrls.has(key) || seen.has(key)) return false;
      seen.add(key);
      item.url = url;
      return true;
    } catch { return false; }
  }).slice(0, MAX_NEW_PER_CASE);
  const toFetch = fresh.slice(0, MAX_FETCH_PER_CASE);
  const pages = await Promise.all(toFetch.map(async item => {
    try { return { url: item.url, page: await scrapePublicPage(item.url) }; }
    catch (error) { return { url: item.url, page: null, error: clean(error?.message, 200) }; }
  }));
  const pageMap = new Map(pages.map(item => [item.url, item]));
  let saved = 0;
  for (const item of fresh) {
    const page = pageMap.get(item.url)?.page;
    const excerpt = clean(page?.excerpt || item.excerpt, 5000);
    const title = clean(page?.title && page.title !== new URL(item.url).hostname ? page.title : item.title || 'Untitled public source', 240);
    const publisher = clean(item.publisher || item.provider || new URL(item.url).hostname, 200);
    try {
      await Evidence.create({
        investigationId: iid, title, url: item.url,
        sourceType: item.sourceType === 'document' ? 'document' : 'web',
        publisher, retrievedAt: new Date(page?.retrievedAt || item.retrievedAt || Date.now()),
        publishedAt: item.publishedAt && !Number.isNaN(new Date(item.publishedAt).getTime()) ? new Date(item.publishedAt) : null,
        excerpt, verificationStatus: 'unverified',
        contentHash: fingerprint(excerpt), entities: [], captureTimestamp: ''
      });
      saved++;
    } catch (error) {
      if (error?.code !== 11000) console.warn('ADVERSE discovery save failed:', clean(error?.message, 180));
    }
  }
  return { caseId: iid, queryCount: queries.length, discovered: discovered.length, saved, scraped: pages.filter(item => item.page).length, providerFailures: settled.filter(item => item.status === 'rejected').length };
}

export async function runDiscoveryCycle() {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || running) return { skipped: true, processed: 0, saved: 0 };
  running = true;
  try {
    const cases = await Investigation.find({ status: 'active' }).sort({ updatedAt: 1 }).limit(MAX_CASES_PER_CYCLE).lean();
    const results = [];
    for (const item of cases) {
      try { results.push(await researchInvestigation(item)); }
      catch (error) {
        console.warn('ADVERSE discovery case failed:', String(item._id), clean(error?.message, 180));
        results.push({ caseId: String(item._id), saved: 0, error: clean(error?.message, 180) });
      }
    }
    return { skipped: false, processed: results.length, saved: results.reduce((sum, item) => sum + Number(item.saved || 0), 0), results, generatedAt: new Date().toISOString() };
  } finally { running = false; }
}

export function startDiscoveryWorker() {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || process.env.DISCOVERY_ENABLED === 'false') return;
  const run = () => runDiscoveryCycle().then(result => {
    if (result.processed || result.saved) console.log('ADVERSE automated discovery cycle completed', JSON.stringify(result));
  }).catch(error => console.error('ADVERSE automated discovery cycle failed:', clean(error?.message, 200)));
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  setTimeout(run, 45000).unref?.();
}
