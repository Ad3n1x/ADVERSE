/** Advisory URL and source-context heuristics: warnings only, never a verdict. */
export function assessSourceContext(input, item = {}) {
  let parsed;
  try { parsed = new URL(input); } catch {
    return { category:'unknown', label:'Unknown source', reason:'The source URL could not be parsed.', signals:[] };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./,'');
  const institutional = /(?:^|\.)(?:gov|gov\.ng|gov\.uk|gov\.au|edu|edu\.ng|ac\.uk|ac\.ng|edu\.au|mil|int)$/.test(host);
  const scholarly = /(?:^|\.)(?:doi\.org|crossref\.org|openalex\.org|arxiv\.org|pubmed\.ncbi\.nlm\.nih\.gov|nature\.com|science\.org|who\.int|un\.org|unesco\.org)$/.test(host);
  const reference = /(?:^|\.)(?:wikipedia\.org|wikidata\.org|britannica\.com)$/.test(host);
  const category = institutional ? 'institutional-domain' : scholarly ? 'scholarly-or-international' : reference ? 'reference-work' : 'publisher-or-website';
  const label = institutional ? 'Institutional domain' : scholarly ? 'Scholarly / international source' : reference ? 'Reference source' : 'Website / publisher';
  const signals = [];
  if (parsed.protocol === 'https:') signals.push('Uses HTTPS');
  else signals.push('Uses unencrypted HTTP');
  if (item.provider) signals.push('Discovered via ' + String(item.provider).slice(0,80));
  if (item.publisher && String(item.publisher).toLowerCase() !== host) signals.push('Publisher label: ' + String(item.publisher).slice(0,100));
  return { host, category, label, reason: institutional ? 'The hostname uses a government, education, military, or international institutional suffix.' : scholarly ? 'The hostname matches a recognized scholarly index, publisher, DOI, or international organization domain.' : reference ? 'The hostname matches a general reference-work domain.' : 'No special publisher category could be inferred from the hostname alone.', signals };
}
function normalizedTitleTokens(title) {
  return new Set(String(title || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(token=>token.length>2));
}
export function titleSimilarity(a,b) {
  const left=normalizedTitleTokens(a), right=normalizedTitleTokens(b);
  if(!left.size||!right.size)return 0;
  let common=0;for(const token of left)if(right.has(token))common++;
  return common/(left.size+right.size-common);
}
export function inspectPublicLink(input) {
  let parsed;
  try { parsed = new URL(input); } catch { return { transport:'unknown', hostname:'', signals:['URL could not be parsed'] }; }
  const hostname = parsed.hostname.toLowerCase();
  const labels = hostname.split('.');
  const signals = [];
  if (parsed.protocol !== 'https:') signals.push('Uses HTTP rather than encrypted HTTPS');
  if (labels.some(label => label.startsWith('xn--'))) signals.push('Contains an internationalized/punycode domain label; check the spelling carefully');
  if (/^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(hostname) || hostname.startsWith('[')) signals.push('Uses an IP address instead of a familiar domain name');
  const shorteners = new Set(['bit.ly','t.co','tinyurl.com','ow.ly','is.gd','rb.gy','buff.ly','cutt.ly','shorturl.at']);
  if (shorteners.has(hostname) || [...shorteners].some(domain => hostname.endsWith('.' + domain))) signals.push('Uses a link-shortening service, so the final destination is not obvious from this URL');
  if (parsed.port && !['80','443'].includes(parsed.port)) signals.push('Uses a non-standard web port');
  return { transport: parsed.protocol === 'https:' ? 'HTTPS' : parsed.protocol === 'http:' ? 'HTTP' : 'unknown', hostname, signals };
}
