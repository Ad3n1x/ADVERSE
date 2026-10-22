const clean = (value, max = 1200) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);
async function get(url, timeout = 10000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'ADVERSE-Discovery/1.0 (+https://github.com/Ad3n1x/ADVERSE)', accept: 'application/json, application/atom+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
  return response;
}
const stamp = () => new Date().toISOString();

/** Public, source-linked image discovery via Wikimedia Commons. */
export async function searchImages(query, limit = 20) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action:'query', generator:'search', gsrsearch:query, gsrnamespace:'6', gsrlimit:String(Math.min(limit,30)), prop:'imageinfo', iiprop:'url|extmetadata', iiurlwidth:'640', format:'json', origin:'*' }).toString();
  const data = await (await get(url)).json();
  return Object.values(data.query?.pages || {}).map((page) => {
    const info = page.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    const description = meta.ImageDescription?.value || meta.ObjectName?.value || '';
    const license = clean(meta.LicenseShortName?.value || 'License not supplied', 100);
    return { title: clean(String(page.title || '').replace(/^File:/, ''),240), url: info.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(page.title || '').replace(/ /g,'_'))), imageUrl: info.thumburl || info.url || '', excerpt: clean(description,700), publisher:'Wikimedia Commons', provider:'Wikimedia Commons', sourceType:'image', license, retrievedAt:stamp() };
  }).filter(item => item.imageUrl && /^https:\/\//i.test(item.imageUrl) && /^https:\/\//i.test(item.url)).slice(0,limit);
}

/** Public video discovery through YouTube's public search feed; no API key required. */
export async function searchVideos(query, limit = 15) {
  const url = new URL('https://www.youtube.com/feeds/videos.xml');
  url.search = new URLSearchParams({ search_query: query }).toString();
  const xml = await (await get(url,12000)).text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0,Math.min(limit,20));
  return entries.map(match => {
    const block = match[1];
    const field = name => { const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i')); return clean(m?.[1] || '', 600); };
    const id = field('yt:videoId');
    const title = field('title');
    const author = field('name');
    const publishedAt = field('published');
    return { title, url:'https://www.youtube.com/watch?v=' + encodeURIComponent(id), videoId:id, thumbnailUrl:id?'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg':'', excerpt:'Public YouTube video' + (author?' by ' + author:''), publisher:author || 'YouTube', provider:'YouTube public feed', sourceType:'video', publishedAt:publishedAt || null, retrievedAt:stamp() };
  }).filter(item => item.videoId && item.title && /^https:\/\//i.test(item.url)).slice(0,limit);
}

/** Discover public-knowledge-graph entities; results are not private-person lookups. */
export async function searchPeople(query, limit = 15) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action:'wbsearchentities', search:query, language:'en', uselang:'en', type:'item', limit:String(Math.min(limit,20)), format:'json' }).toString();
  const data = await (await get(url)).json();
  const peopleTerms = /\b(person|politician|actor|actress|musician|athlete|writer|scientist|journalist|entrepreneur|director|singer|footballer|researcher|author|public figure|presenter|minister|president|founder|activist|professor|engineer)\b/i;
  return (data.search || []).filter(item => peopleTerms.test(String(item.description || '')) || /\b(person|human)\b/i.test(String(item.label || ''))).map(item => ({
    title: clean(item.label,240), url:item.concepturi || ('https://www.wikidata.org/wiki/' + item.id), excerpt:clean(item.description || 'Public knowledge-graph entry; verify identity against linked sources.',700), publisher:'Wikidata', provider:'Wikidata public knowledge graph', sourceType:'person', entityId:item.id, retrievedAt:stamp()
  })).slice(0,limit);
}
