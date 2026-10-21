import { searchPublic } from './providers.js';
import { searchConfiguredProviders } from './provider-adapters.js';
import { searchPurili, searchTruegle } from './free-search-providers.js';

const clean = (value, max = 1200) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);

const TRACKING_PARAMS = /^(utm_[^=]+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_src|igshid|yclid|vero_id)$/i;

/** Normalize URLs for deduplication without lowercasing case-sensitive paths or dropping meaningful query parameters. */
export function normalizeResultUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP(S) URLs are supported.');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  const pairs = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
    ak.localeCompare(bk) || av.localeCompare(bv)
  );
  url.search = '';
  for (const [key, val] of pairs) url.searchParams.append(key, val);
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  return url.href;
}

/** Re-rank while preventing one host from crowding out every other useful source. */
export function diversifyPublicResults(items, query, { limit = 120, maxPerDomain = 3 } = {}) {
  const ranked = rankPublicResults(items, query);
  const selected = [];
  const deferred = [];
  const counts = new Map();
  for (const item of ranked) {
    let host = '';
    try { host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
    const count = counts.get(host) || 0;
    if (count < maxPerDomain) {
      selected.push(item);
      counts.set(host, count + 1);
    } else deferred.push(item);
  }
  return [...selected, ...deferred].slice(0, Math.max(0, limit));
}
const STOP = new Set(['the','and','for','with','from','into','that','this','what','when','where','who','why','how','are','was','were','old','new','version','latest','best','about','find','search','info','information','history','official','page','site','website']);
const SYNONYMS = new Map([
  ['old', ['older','previous','earlier','legacy','past']],
  ['previous', ['older','earlier','legacy']],
  ['version', ['release','build','edition']],
  ['moviebox', ['movie box','moviebox app']],
  ['apk', ['android app package','application package']],
  ['download', ['download page','release']],
  ['history', ['archive','historical','timeline']],
  ['company', ['organization','business']],
  ['person', ['individual','biography']],
  ['scam', ['fraud','allegation','complaint']],
  ['news', ['report','coverage','press']],
  ['leak', ['disclosure','reported exposure']]
]);

/** Small bounded query planner: exact wording first, then useful variants and individual terms. */
export function expandSearchQueries(input, maxQueries = 5) {
  const raw = clean(input, 200);
  if (!raw) return [];
  const queries = [];
  const seen = new Set();
  const add = (q, reason) => {
    q = clean(q, 240);
    const key = q.toLocaleLowerCase();
    if (q.length >= 2 && !seen.has(key) && queries.length < maxQueries) {
      seen.add(key);
      queries.push({ query: q, reason });
    }
  };
  add('"' + raw.replace(/"/g, '') + '"', 'exact phrase');
  add(raw, 'natural-language query');
  const words = [...new Set((raw.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._+-]*/gu) || []))];
  const meaningful = words.filter(w => !STOP.has(w));
  if (meaningful.length > 1) add(meaningful.join(' '), 'core terms');
  // Prefer useful related wording before broad OR queries and individual tokens.
  for (const word of words) {
    if (queries.length >= maxQueries || queries.some(item => item.reason === 'related wording')) break;
    const variants = SYNONYMS.get(word);
    if (variants) {
      for (const variant of variants) {
        const at = raw.toLocaleLowerCase().indexOf(word);
        add(at >= 0 ? raw.slice(0, at) + variant + raw.slice(at + word.length) : raw + ' ' + variant, 'related wording');
        if (queries.length >= maxQueries) break;
      }
    }
  }
  if (meaningful.length > 1) add(meaningful.join(' OR '), 'broad term match');
  // Spend remaining query slots on individual input tokens.
  for (const word of words) {
    if (queries.length >= maxQueries) break;
    if (word.length >= 2) add(word, 'individual keyword');
  }
  return queries.slice(0, maxQueries);
}

async function getJson(url, timeout = 9000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'ADVERSE-Research/1.0 (public-interest source discovery)', accept: 'application/json' } });
  if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
  return response.json();
}

async function searchGdelt(query) {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({ query, mode: 'ArtList', format: 'json', maxrecords: '12', sort: 'HybridRel' }).toString();
  const data = await getJson(url, 11000);
  return (data.articles || []).map(item => ({
    title: clean(item.title, 240) || 'Untitled news report', url: item.url,
    excerpt: clean([item.seendate ? 'Observed by GDELT: ' + item.seendate : '', item.domain ? 'Publisher domain: ' + item.domain : '', item.language ? 'Language: ' + item.language : ''].filter(Boolean).join(' · '), 700),
    publisher: clean(item.domain || item.source || 'News publisher', 200), retrievedAt: new Date().toISOString(),
    publishedAt: item.seendate && /^\d{14}$/.test(item.seendate) ? item.seendate.slice(0,4)+'-'+item.seendate.slice(4,6)+'-'+item.seendate.slice(6,8) : null,
    sourceType: 'web', provider: 'GDELT Global News'
  })).filter(item => /^https?:\/\//i.test(item.url || ''));
}

async function searchWikidata(query) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', type: 'item', limit: '8', format: 'json' }).toString();
  const data = await getJson(url);
  return (data.search || []).map(item => ({
    title: clean(item.label, 240) || 'Untitled Wikidata entity', url: item.concepturi || ('https://www.wikidata.org/wiki/' + item.id),
    excerpt: clean(item.description || 'Structured public knowledge-graph entity. Inspect the item and its references before relying on claims.', 900),
    publisher: 'Wikidata', retrievedAt: new Date().toISOString(), publishedAt: null, sourceType: 'web',
    provider: 'Wikidata Knowledge Graph', entityId: item.id
  })).filter(item => /^https:\/\//i.test(item.url || ''));
}

async function searchGoogleNews(query) {
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'ADVERSE-Research/1.0', accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error('News feed returned HTTP ' + response.status);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).map(match => {
    const block = match[1];
    const field = name => clean((block.match(new RegExp('<' + name + '(?:\s[^>]*)?>([\s\\S]*?)<\\/' + name + '>', 'i')) || [,''])[1], name === 'description' ? 1200 : 500);
    const rawUrl = field('link');
    const date = field('pubDate');
    return { title: field('title'), url: rawUrl, excerpt: clean(field('description'), 1000), publisher: clean(field('source') || 'Google News indexed publisher', 200), retrievedAt: new Date().toISOString(), publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null, sourceType: 'web', provider: 'Google News' };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url || ''));
}

/**
 * Rank results against the whole query using token boundaries and weighted field matches.
 * Exact subject matches in titles/URLs outrank incidental mentions in snippets.
 * The score is only a relevance heuristic; it is not a truth, safety, or source-quality rating.
 */
export function rankPublicResults(items, query) {
  const normalize = value => clean(value, 2000).toLocaleLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = value => normalize(value).split(/\s+/).filter(Boolean);
  const normalizedQuery = normalize(query);
  const allTerms = [...new Set(tokens(query))];
  const genericTerms = new Set(['the','and','for','with','from','into','that','this','what','when','where','who','why','how','are','was','were','old','new','version','latest','best','about','find','search','info','information','history','official','page','site','website','please','a','an','of','to','app']);
  const subjectTerms = allTerms.filter(term => !genericTerms.has(term));
  const phrase = value => normalizedQuery.length >= 3 && (' ' + normalize(value) + ' ').includes(' ' + normalizedQuery + ' ');
  const hasTerm = (field, term) => (' ' + normalize(field) + ' ').includes(' ' + term + ' ');
  return items.map((item, index) => {
    const title = normalize(item.title);
    const url = normalize(item.url);
    const excerpt = normalize(item.excerpt);
    const publisher = normalize(item.publisher);
    let score = 0;
    if (phrase(item.title)) score += 34;
    else if (normalizedQuery && title.includes(normalizedQuery)) score += 26;
    if (phrase(item.url)) score += 22;
    if (phrase(item.excerpt)) score += 7;
    let titleHits = 0;
    let subjectHits = 0;
    for (const term of allTerms) {
      const isGeneric = genericTerms.has(term);
      const titleMatch = hasTerm(title, term);
      const urlMatch = hasTerm(url, term);
      const excerptMatch = hasTerm(excerpt, term);
      if (titleMatch) score += isGeneric ? 1 : 12;
      else if (urlMatch) score += isGeneric ? 1 : 8;
      else if (excerptMatch) score += isGeneric ? 0 : 2;
      else if (hasTerm(publisher, term)) score += 1;
      if (titleMatch) titleHits++;
      if (!isGeneric && (titleMatch || urlMatch)) subjectHits++;
    }
    if (subjectTerms.length) {
      score += subjectHits * 4;
      score += Math.round((subjectHits / subjectTerms.length) * 12);
      if (subjectHits === 0) score -= 28;
      else if (subjectHits < Math.min(2, subjectTerms.length)) score -= 8;
      if (titleHits === 0) score -= 5;
    }
    if (/\b(chat|chatroom|conversation|forum thread)\b/i.test(title) &&
        !allTerms.some(term => ['chat','chatroom','conversation','forum'].includes(term))) score -= 14;
    if (/\b(404|page not found|not found)\b/i.test(title)) score -= 8;
    // Freshness only affects ranking when the user explicitly asks for current information.
    if (/\b(latest|today|current|recent|newest|this week|this month|breaking|202[4-9])\b/i.test(String(query || '')) && item.publishedAt) {
      const publishedTime = Date.parse(item.publishedAt);
      if (Number.isFinite(publishedTime)) {
        const ageDays = Math.max(0, (Date.now() - publishedTime) / 86400000);
        if (ageDays <= 1) score += 10;
        else if (ageDays <= 7) score += 7;
        else if (ageDays <= 30) score += 4;
        else if (ageDays <= 180) score += 1;
        else score -= Math.min(6, Math.ceil((ageDays - 180) / 90));
      }
    }
    return { ...item, _searchScore: score, _searchOrder: index };
  }).sort((a, b) => b._searchScore - a._searchScore || a._searchOrder - b._searchOrder);
}

/** Search each provider with a bounded set of query variants; isolate provider/query failures. */
async function performSearchAllPublic(input, providerKeys = {}) {
  const queryPlan = Array.isArray(input)
    ? input.slice(0, 5).map(item => typeof item === 'string' ? { query: item, reason: 'planned query' } : item)
    : expandSearchQueries(input);
  const publicProviders = [
    ['Wikipedia / Crossref / OpenAlex', searchPublic],
    ['GDELT Global News', searchGdelt],
    ['Google News', searchGoogleNews],
    ['Wikidata Knowledge Graph', searchWikidata],
    ['Purili Web Search', searchPurili],
    ['Truegle Web Search', searchTruegle]
  ];
  // Public indexes get bounded query variants; user-connected API keys are only
  // called once per search to avoid multiplying quota usage by every variant.
  const publicSettledPromise = Promise.all(queryPlan.flatMap(plan => publicProviders.map(async ([name, run]) => {
    try {
      const results = await run(plan.query);
      return { name, plan, results: results.map(item => ({ ...item, matchedQueries: [plan.query], queryReasons: [plan.reason] })) };
    } catch {
      return { name, plan, results: [], failure: name + ' unavailable for query variant: ' + plan.query };
    }
  })));
  const configuredPlan = queryPlan.find(item => item.reason === 'natural-language query') || queryPlan[0];
  const configuredSettledPromise = (async () => {
    if (!configuredPlan) return { name: 'Additional configured providers', plan: { query: '', reason: 'skipped' }, results: [] };
    try {
      const response = await searchConfiguredProviders(configuredPlan.query, 8, providerKeys);
      return {
        name: 'Additional configured providers',
        plan: configuredPlan,
        results: response.results.map(item => ({ ...item, matchedQueries: [configuredPlan.query], queryReasons: [configuredPlan.reason] })),
        providerFailures: (response.errors || []).map(item => item.provider + ' unavailable: ' + item.error)
      };
    } catch {
      return { name: 'Additional configured providers', plan: configuredPlan, results: [], failure: 'Additional configured providers unavailable for the natural-language query.' };
    }
  })();
  const [publicSettled, configuredSettled] = await Promise.all([publicSettledPromise, configuredSettledPromise]);
  const settled = [...publicSettled, configuredSettled];
  const merged = new Map();
  const failures = [];
  for (const result of settled) {
    if (result.failure) failures.push(result.failure);
    if (result.providerFailures) failures.push(...result.providerFailures);
    for (const item of result.results || []) {
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        const normalized = normalizeResultUrl(url.href);
        const old = merged.get(normalized);
        if (old) {
          old.matchedQueries = [...new Set([...(old.matchedQueries || []), ...(item.matchedQueries || [])])];
          old.queryReasons = [...new Set([...(old.queryReasons || []), ...(item.queryReasons || [])])];
          old.providers = [...new Set([...(old.providers || [old.provider]).filter(Boolean), item.provider].filter(Boolean))];
          if ((item.excerpt || '').length > (old.excerpt || '').length) old.excerpt = item.excerpt;
        } else merged.set(normalized, { ...item, url: normalized, providers: item.provider ? [item.provider] : [] });
      } catch {}
    }
  }
  const originalQuery = typeof input === 'string'
    ? clean(input, 200)
    : clean((queryPlan.find(item => item.reason === 'natural-language query') || queryPlan.find(item => item.reason === 'core terms') || queryPlan[0] || {}).query, 200);
  const rankedResults = diversifyPublicResults([...merged.values()], originalQuery, { limit: 120, maxPerDomain: 3 });
  const results = rankedResults.map(({ _searchScore, _searchOrder, ...item }) => ({ ...item, providerErrors: failures }));
  return {
    results,
    queryPlan,
    meta: {
      providerNames: [...new Set([...publicProviders.map(([name]) => name), 'Additional configured providers'])],
      successfulSearches: settled.filter(item => !item.failure).length,
      failedSearches: failures.length,
      resultCount: results.length,
      providerRequestStrategy: 'Public indexes receive bounded query variants; user-connected API providers receive one natural-language query per search to reduce quota usage.',
      coverage: 'Bounded query expansion across public reference, academic, news, knowledge-graph, Purili, Truegle, and optional connected providers. Search coverage depends on provider availability and indexes; this is not exhaustive whole-web crawling.'
    }
  };
}


const PUBLIC_SEARCH_CACHE_TTL_MS = 45_000;
const PUBLIC_SEARCH_CACHE_MAX = 100;
const publicSearchCache = new Map();
const publicSearchInflight = new Map();

function publicSearchCacheKey(input) {
  const normalized = Array.isArray(input)
    ? JSON.stringify(input.slice(0, 5).map(item => typeof item === 'string' ? item : { query: item?.query, reason: item?.reason }))
    : clean(input, 200).normalize('NFKC').toLocaleLowerCase();
  return normalized;
}

/**
 * Short-lived cache for public/default searches. Searches using per-user API
 * credentials bypass it so one user's provider configuration never affects another.
 * Concurrent identical anonymous searches share one provider fan-out.
 */
export async function searchAllPublic(input, providerKeys = {}) {
  if (Object.keys(providerKeys || {}).length > 0) return performSearchAllPublic(input, providerKeys);
  const key = publicSearchCacheKey(input);
  const now = Date.now();
  const cached = publicSearchCache.get(key);
  if (cached && cached.expiresAt > now) return structuredClone(cached.value);
  if (cached) publicSearchCache.delete(key);

  const pending = publicSearchInflight.get(key);
  if (pending) return structuredClone(await pending);

  const task = performSearchAllPublic(input, providerKeys);
  publicSearchInflight.set(key, task);
  try {
    const result = await task;
    // Do not cache total failures; a retry should be able to recover immediately.
    if ((result.results || []).length > 0 || !(result.meta?.failedSearches > 0)) {
      for (const [cacheKey, value] of publicSearchCache) {
        if (value.expiresAt <= Date.now()) publicSearchCache.delete(cacheKey);
      }
      while (publicSearchCache.size >= PUBLIC_SEARCH_CACHE_MAX) {
        const oldest = publicSearchCache.keys().next().value;
        if (oldest === undefined) break;
        publicSearchCache.delete(oldest);
      }
      publicSearchCache.set(key, { expiresAt: Date.now() + PUBLIC_SEARCH_CACHE_TTL_MS, value: result });
    }
    return structuredClone(result);
  } finally {
    publicSearchInflight.delete(key);
  }
}
