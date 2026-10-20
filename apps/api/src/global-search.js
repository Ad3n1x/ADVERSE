import { searchPublic } from './providers.js';

const clean = (value, max = 1200) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);

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
    title: clean(item.title, 240) || 'Untitled news report',
    url: item.url,
    excerpt: clean([item.seendate ? 'Observed by GDELT: ' + item.seendate : '', item.domain ? 'Publisher domain: ' + item.domain : '', item.language ? 'Language: ' + item.language : ''].filter(Boolean).join(' · '), 700),
    publisher: clean(item.domain || item.source || 'News publisher', 200),
    retrievedAt: new Date().toISOString(),
    publishedAt: item.seendate && /^\d{14}$/.test(item.seendate) ? item.seendate.slice(0,4)+'-'+item.seendate.slice(4,6)+'-'+item.seendate.slice(6,8) : null,
    sourceType: 'web',
    provider: 'GDELT Global News'
  })).filter(item => /^https?:\/\//i.test(item.url || ''));
}

async function searchWikidata(query) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', type: 'item', limit: '8', format: 'json' }).toString();
  const data = await getJson(url);
  return (data.search || []).map(item => ({
    title: clean(item.label, 240) || 'Untitled Wikidata entity',
    url: item.concepturi || ('https://www.wikidata.org/wiki/' + item.id),
    excerpt: clean(item.description || 'Structured public knowledge-graph entity. Inspect the item and its references before relying on claims.', 900),
    publisher: 'Wikidata',
    retrievedAt: new Date().toISOString(),
    publishedAt: null,
    sourceType: 'web',
    provider: 'Wikidata Knowledge Graph',
    entityId: item.id
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
    let publisher = '';
    try { publisher = clean((field('source') || '').replace(/<[^>]*>/g, ''), 200); } catch {}
    const date = field('pubDate');
    return { title: field('title'), url: rawUrl, excerpt: clean(field('description'), 1000), publisher: publisher || 'Google News indexed publisher', retrievedAt: new Date().toISOString(), publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null, sourceType: 'web', provider: 'Google News' };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url || ''));
}

/** Federated, best-effort public-source discovery. Provider failures are isolated. */
export async function searchAllPublic(query) {
  const providers = [
    ['Wikipedia / Crossref / OpenAlex', () => searchPublic(query)],
    ['GDELT Global News', () => searchGdelt(query)],
    ['Google News', () => searchGoogleNews(query)],
    ['Wikidata Knowledge Graph', () => searchWikidata(query)]
  ];
  const settled = await Promise.allSettled(providers.map(([, run]) => run()));
  const results = [];
  const failures = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') results.push(...result.value);
    else failures.push(providers[index][0] + ': unavailable');
  });
  if (!results.length) throw new Error('All public search providers failed. Try again shortly.');
  const seen = new Set();
  return results.filter(item => {
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
      const normalized = url.href.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    } catch { return false; }
  }).slice(0, 60).map(item => ({ ...item, providerErrors: failures }));
}
