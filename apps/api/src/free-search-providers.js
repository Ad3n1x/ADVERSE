const clean = (value, max = 1200) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    ...options,
    headers: { accept: 'application/json', 'user-agent': 'ADVERSE-Research/1.0 (+https://github.com/Ad3n1x/ADVERSE)', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function normalize(item, provider) {
  const url = String(item.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title: clean(item.title, 240) || 'Untitled result',
    url,
    excerpt: clean(item.excerpt, 1200),
    publisher: clean(item.publisher || provider, 200),
    retrievedAt: new Date().toISOString(),
    publishedAt: item.publishedAt || null,
    sourceType: 'web',
    provider
  };
}

/** Public search adapters: no API key or account required. */
export async function searchPurili(query) {
  const url = new URL('https://puri.li/api/search');
  url.search = new URLSearchParams({ q: query, page: '1', exact: '0' }).toString();
  const data = await requestJson(url);
  return (data.results || []).map(item => normalize({
    title: item.title,
    url: item.url,
    excerpt: item.description || item.snippet || item.content || '',
    publisher: item.displayUrl || (() => { try { return new URL(item.url).hostname; } catch { return 'Purili index'; } })()
  }, 'Purili Web Search')).filter(Boolean);
}

export async function searchTruegle(query) {
  const data = await requestJson('https://api.truegle.info/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Truegle-Client': 'ADVERSE-Research' },
    body: JSON.stringify({ query: String(query).slice(0, 300), mode: 'blue-pill' })
  });
  return (data.results || []).map(item => normalize({
    title: item.title,
    url: item.url,
    excerpt: item.snippet || '',
    publisher: item.source || 'Truegle',
    publishedAt: item.date || null
  }, 'Truegle Web Search')).filter(Boolean);
}
