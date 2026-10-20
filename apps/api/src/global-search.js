import { searchPublic } from './providers.js';

const clean = (value, max = 1200) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);
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
export function expandSearchQueries(input, maxQueries = 10) {
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
  if (meaningful.length > 1) {
    add(meaningful.join(' '), 'core terms');
    add(meaningful.join(' OR '), 'broad term match');
  }
  // Search each meaningful token separately before spending the remaining budget on variants.
  for (const word of meaningful) {
    if (queries.length >= maxQueries) break;
    if (word.length >= 2) add(word, 'individual keyword');
  }
  for (const word of words) {
    if (queries.length >= maxQueries) break;
    const variants = SYNONYMS.get(word);
    if (variants) {
      for (const variant of variants) {
        add(raw + ' ' + variant, 'related wording');
        if (queries.length >= maxQueries) break;
      }
    }
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
    const field = name => clean((block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i')) || [,''])[1], name === 'description' ? 1200 : 500);
    const rawUrl = field('link');
    const date = field('pubDate');
    return { title: field('title'), url: rawUrl, excerpt: clean(field('description'), 1000), publisher: clean(field('source') || 'Google News indexed publisher', 200), retrievedAt: new Date().toISOString(), publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null, sourceType: 'web', provider: 'Google News' };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url || ''));
}

/** Search each provider with a bounded set of query variants; isolate provider/query failures. */
export async function searchAllPublic(input) {
  const queryPlan = Array.isArray(input)
    ? input.slice(0, 8).map(item => typeof item === 'string' ? { query: item, reason: 'planned query' } : item)
    : expandSearchQueries(input);
  const providers = [
    ['Wikipedia / Crossref / OpenAlex', searchPublic],
    ['GDELT Global News', searchGdelt],
    ['Google News', searchGoogleNews],
    ['Wikidata Knowledge Graph', searchWikidata]
  ];
  const settled = await Promise.all(queryPlan.flatMap(plan => providers.map(async ([name, run]) => {
    try {
      const results = await run(plan.query);
      return { name, plan, results: results.map(item => ({ ...item, matchedQueries: [plan.query], queryReasons: [plan.reason] })) };
    } catch {
      return { name, plan, results: [], failure: name + ' unavailable for query variant: ' + plan.query };
    }
  })));
  const merged = new Map();
  const failures = [];
  for (const result of settled) {
    if (result.failure) { failures.push(result.failure); continue; }
    for (const item of result.results) {
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        const normalized = url.href.replace(/#.*$/, '').replace(/[?&](utm_[^=]+|gclid|fbclid)=[^&]*/gi, '').replace(/[?&]$/, '').replace(/\/$/, '').toLowerCase();
        const old = merged.get(normalized);
        if (old) {
          old.matchedQueries = [...new Set([...(old.matchedQueries || []), ...(item.matchedQueries || [])])];
          old.queryReasons = [...new Set([...(old.queryReasons || []), ...(item.queryReasons || [])])];
          old.providers = [...new Set([...(old.providers || [old.provider]).filter(Boolean), item.provider].filter(Boolean))];
          if ((item.excerpt || '').length > (old.excerpt || '').length) old.excerpt = item.excerpt;
        } else merged.set(normalized, { ...item, providers: item.provider ? [item.provider] : [] });
      } catch {}
    }
  }
  const results = [...merged.values()].slice(0, 120).map(item => ({ ...item, providerErrors: failures }));
  return {
    results,
    queryPlan,
    meta: {
      providerNames: providers.map(([name]) => name),
      successfulSearches: settled.filter(item => !item.failure).length,
      failedSearches: failures.length,
      resultCount: results.length,
      coverage: 'Bounded query expansion across Wikipedia, Crossref, OpenAlex, GDELT Global News, Google News and Wikidata when available. This is not exhaustive whole-web crawling.'
    }
  };
}
