import { lookup } from 'node:dns/promises';
import net from 'node:net';

const timeoutFetch = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 9000), headers: { 'user-agent': 'ADVERSE-Research/0.1 (public-source research)', accept: 'application/json,text/plain,text/html;q=0.8', ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response;
};
export async function searchPublic(query) {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('Search query must contain at least 2 characters.');
  const retrievedAt = new Date().toISOString();
  const tasks = [
    (async()=>{const url=new URL('https://en.wikipedia.org/w/api.php');url.search=new URLSearchParams({action:'query',list:'search',srsearch:q,srlimit:'8',format:'json',origin:'*'}).toString();const data=await(await timeoutFetch(url,{headers:{accept:'application/json'}})).json();return(data.query?.search||[]).map(item=>({title:item.title,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(item.title.replaceAll(' ','_')),excerpt:String(item.snippet||'').replace(/<[^>]*>/g,'').replaceAll('&quot;','"').replaceAll('&amp;','&'),sourceType:'web',publisher:'Wikipedia',retrievedAt,publishedAt:null,provider:'Wikipedia'}));})(),
    (async()=>{const url=new URL('https://api.crossref.org/works');url.search=new URLSearchParams({query:q,rows:'8',select:'DOI,title,URL,author,published,container-title,abstract,type'}).toString();const data=await(await timeoutFetch(url,{headers:{accept:'application/json'}})).json();return(data.message?.items||[]).map(item=>({title:String(item.title?.[0]||'Untitled scholarly work'),url:item.URL||('https://doi.org/'+item.DOI),excerpt:String(item.abstract||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200),sourceType:'document',publisher:String(item['container-title']?.[0]||'Crossref'),retrievedAt,publishedAt:item.published?.['date-parts']?.[0]?.join('-')||null,provider:'Crossref',doi:item.DOI||''}));})(),
    (async()=>{const url=new URL('https://api.openalex.org/works');url.search=new URLSearchParams({search:q,per_page:'8',select:'id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,type'}).toString();const data=await(await timeoutFetch(url,{headers:{accept:'application/json'}})).json();return(data.results||[]).map(item=>({title:String(item.title||'Untitled research work'),url:item.doi||item.primary_location?.landing_page_url||item.id,excerpt:abstractFromInvertedIndex(item.abstract_inverted_index),sourceType:'document',publisher:item.primary_location?.source?.display_name||'OpenAlex',retrievedAt,publishedAt:item.publication_year?String(item.publication_year):null,provider:'OpenAlex',doi:item.doi||''}));})()
  ];
  const settled=await Promise.allSettled(tasks);
  const providers=['Wikipedia','Crossref','OpenAlex'];
  const results=settled.flatMap((item,index)=>item.status==='fulfilled'?item.value:[]);
  if(!results.length)throw new Error('All public search providers failed.');
  const seen=new Set();
  const unique=results.filter(item=>{const k=(item.url||item.title).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,24);
  return unique.map(item=>({...item,providerErrors:settled.map((result,index)=>result.status==='rejected'?providers[index]+': unavailable':null).filter(Boolean)}));
}
function abstractFromInvertedIndex(index) {
  if(!index||typeof index!=='object')return '';
  const words=[];
  for(const [word,positions] of Object.entries(index))for(const position of positions||[])words.push([position,word]);
  return words.sort((a,b)=>a[0]-b[0]).slice(0,220).map(x=>x[1]).join(' ').slice(0,1200);
}
export async function waybackCaptures(inputUrl) {
  const parsed = validatePublicUrl(inputUrl);
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are supported.');
  const api = new URL('https://web.archive.org/cdx/search/cdx');
  api.search = new URLSearchParams({ url:parsed.href, output:'json', fl:'timestamp,original,statuscode,mimetype,digest,length', filter:'statuscode:200', collapse:'digest', limit:'100' }).toString();
  const text = await (await timeoutFetch(api, { headers: { accept:'application/json,text/plain' }, timeout:15000 })).text();
  let rows; try { rows=JSON.parse(text); } catch { throw new Error('Wayback Machine returned an unexpected response.'); }
  if (!Array.isArray(rows) || rows.length < 2) return { url:parsed.href, captures:[], coverage:'No matching public captures returned by the archive.' };
  const [headers,...items]=rows;
  return { url:parsed.href, captures:items.map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]]))).map(row=>({...row, archivedUrl:`https://web.archive.org/web/${row.timestamp}/${row.original}`})), coverage:'Captures available in the Internet Archive CDX index; absence is not proof a page never existed.' };
}
function isPrivateIPv4(ip) {
  const a=ip.split('.').map(Number); if(a.length!==4||a.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
  return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127)||(a[0]===192&&(a[1]===0||a[1]===88&&a[2]===99||a[1]===0&&a[2]===2))||(a[0]===198&&(a[1]===18||a[1]===19||a[1]===51&&a[2]===100))||(a[0]===203&&a[1]===0&&a[2]===113)||(a[0]===255);
}
function ipv6Words(ip) {
  let value=String(ip).toLowerCase().replace(/^\[|\]$/g,'');
  if (value.includes('.')) {
    const index=value.lastIndexOf(':');
    const v4=value.slice(index+1);
    const bytes=v4.split('.').map(Number);
    if(bytes.length!==4||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))return null;
    value=value.slice(0,index+1)+((bytes[0]<<8)|bytes[1]).toString(16)+':'+((bytes[2]<<8)|bytes[3]).toString(16);
  }
  if((value.match(/::/g)||[]).length>1)return null;
  const halves=value.split('::');
  const left=halves[0]?halves[0].split(':'):[];
  const right=halves.length===2&&halves[1]?halves[1].split(':'):[];
  if([...left,...right].some(word=>! /^[0-9a-f]{1,4}$/.test(word)))return null;
  const missing=8-left.length-right.length;
  if(halves.length===1&&missing!==0)return null;
  if(halves.length===2&&missing<1)return null;
  return [...left,...Array(Math.max(0,missing)).fill('0'),...right].map(word=>parseInt(word,16));
}
function isPrivateIPv6(ip) {
  const words=ipv6Words(ip);
  if(!words||words.length!==8)return true;
  const [a,b,c,d,e,f,g,h]=words;
  // Reject unspecified, loopback and deprecated IPv4-compatible forms.
  if(words.every(word=>word===0))return true;
  if(words.slice(0,7).every(word=>word===0)&&(h===1||h===0))return true;
  // IPv4-mapped IPv6: ::ffff:w.x.y.z, including expanded spellings.
  if(words.slice(0,5).every(word=>word===0)&&f===0xffff) {
    return isPrivateIPv4(`${g>>8}.${g&255}.${h>>8}.${h&255}`);
  }
  // IPv4-compatible (::/96) is obsolete; reject to avoid ambiguous routing.
  if(words.slice(0,6).every(word=>word===0))return true;
  // Unique-local, link-local, multicast, discard-only and special translation/relay ranges.
  if((a&0xfe00)===0xfc00||(a&0xffc0)===0xfe80||(a&0xff00)===0xff00)return true;
  if(a===0x0100&&b===0)return true; // 100::/64
  if(a===0x0064&&b===0xff9b)return true; // 64:ff9b::/96 NAT64
  if(a===0x2002)return true; // 6to4 can embed an IPv4 destination
  if(a===0x2001&&b===0x0db8)return true; // documentation
  if(a===0x2001&&b===0x0010)return true; // ORCHID
  if(a===0x2001&&b===0x0020)return true; // ORCHIDv2
  return false;
}
export function validatePublicUrl(input) {
  let u; try { u=new URL(input); } catch { throw new Error('Enter a valid public URL.'); }
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Only HTTP(S) URLs are permitted.');
  if (u.username || u.password) throw new Error('URLs containing credentials are not permitted.');
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if (host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')) throw new Error('Private network destinations are blocked.');
  if(net.isIP(host)===4&&isPrivateIPv4(host))throw new Error('Private network destinations are blocked.');
  if(net.isIP(host)===6&&isPrivateIPv6(host))throw new Error('Private network destinations are blocked.');
  return u;
}

/**
 * Validate the resolved destination before server-side fetches. This prevents
 * obvious DNS-to-private-network SSRF targets; callers must still disable redirects.
 */
export async function validatePublicUrlResolution(input) {
  const url = validatePublicUrl(input);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(host);
  if (literalFamily === 4 && isPrivateIPv4(host)) throw new Error('Private network destinations are blocked.');
  if (literalFamily === 6 && isPrivateIPv6(host)) throw new Error('Private network destinations are blocked.');
  if (literalFamily) return url;
  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('The public domain could not be resolved.');
  }
  if (!addresses.length || addresses.some(record =>
    net.isIP(record.address) === 4 ? isPrivateIPv4(record.address) : isPrivateIPv6(record.address)
  )) {
    throw new Error('Private network destinations are blocked.');
  }
  return url;
}
export async function publicDns(inputUrl) {
  const u=validatePublicUrl(inputUrl); let records;
  try { records=await lookup(u.hostname,{all:true,verbatim:true}); } catch { throw new Error('The domain could not be resolved.'); }
  if (!records.length || records.some(r=>net.isIP(r.address)===4?isPrivateIPv4(r.address):isPrivateIPv6(r.address))) throw new Error('The domain resolves to a private or restricted network address.');
  const query=async(type)=>{const endpoint=`https://dns.google/resolve?name=${encodeURIComponent(u.hostname)}&type=${type}`;const data=await(await timeoutFetch(endpoint,{headers:{accept:'application/dns-json'}})).json();return(data.Answer||[]).map(a=>({type:a.type,ttl:a.TTL,data:a.data}));};
  const certificates=(async()=>{const endpoint=new URL('https://crt.sh/');endpoint.searchParams.set('q','%25.'+u.hostname);endpoint.searchParams.set('output','json');const response=await timeoutFetch(endpoint,{headers:{accept:'application/json'},timeout:12000});const data=await response.json();const seen=new Set();return (Array.isArray(data)?data:[]).filter(item=>{const k=String(item.id||item.entry_timestamp||'')+'|'+String(item.name_value||'');if(seen.has(k))return false;seen.add(k);return true;}).slice(0,40).map(item=>({id:item.id,commonName:item.common_name||'',names:String(item.name_value||'').split(/\\n/).slice(0,8),issuer:item.issuer_name||'',notBefore:item.not_before||null,notAfter:item.not_after||null,loggedAt:item.entry_timestamp||null}));})();
  const [a,aaaa,mx,txt,ct]=await Promise.allSettled([query('A'),query('AAAA'),query('MX'),query('TXT'),certificates]);
  return { hostname:u.hostname, retrievedAt:new Date().toISOString(), resolver:'Google Public DNS-over-HTTPS', records:{ A:a.status==='fulfilled'?a.value:[], AAAA:aaaa.status==='fulfilled'?aaaa.value:[], MX:mx.status==='fulfilled'?mx.value:[], TXT:txt.status==='fulfilled'?txt.value:[] }, certificateTransparency:{provider:'crt.sh / Certificate Transparency',records:ct.status==='fulfilled'?ct.value:[],available:ct.status==='fulfilled',note:'Certificate log records can reveal historical certificate issuance and names included in certificates. They do not prove current control or ownership.'}, note:'DNS and certificate records are public observations at retrieval time; they do not establish common ownership or intent.' };
}
export async function compareArchivedText(a,b) {
  const normalize=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const before=normalize(a).split(/(?<=[.!?])\s+/).filter(Boolean), after=normalize(b).split(/(?<=[.!?])\s+/).filter(Boolean);
  const setA=new Set(before),setB=new Set(after);
  return { added:after.filter(x=>!setA.has(x)).slice(0,100), removed:before.filter(x=>!setB.has(x)).slice(0,100), method:'normalized text sentence comparison', limitation:'Heuristic comparison only. Navigation, scripts, layout, and extraction differences may create noise.' };
}

export async function searchOrganizations(query) {
  const q=query.trim(); if(q.length<2)throw new Error('Organization search requires at least two characters.');
  const token=process.env.OPENCORPORATES_API_TOKEN; if(!token)throw new Error('OPENCORPORATES_API_TOKEN is not configured. Obtain an API token and confirm the applicable licence and usage limits.');
  const url=new URL('https://api.opencorporates.com/v0.4/companies/search');url.searchParams.set('q',q);url.searchParams.set('per_page','10');
  const data=await(await timeoutFetch(url,{headers:{'X-API-TOKEN':token,accept:'application/json'},timeout:10000})).json();
  return (data.results?.companies||[]).map(({company})=>({name:company.name,companyNumber:company.company_number,jurisdiction:company.jurisdiction_code,companyType:company.company_type||'',status:company.current_status||'',incorporationDate:company.incorporation_date||null,sourceUrl:company.opencorporates_url,source:'OpenCorporates',retrievedAt:new Date().toISOString()}));
}


/**
 * Fetch a bounded amount of readable text from a public web page.
 * This is deliberately conservative: only public DNS destinations, no redirects,
 * no private network targets, no non-text payloads, and a 1 MB response ceiling.
 */
export async function scrapePublicPage(inputUrl) {
  const original = validatePublicUrl(inputUrl);
  let current = original;
  const redirects = [];
  let response;
  // Follow a small, bounded redirect chain, validating every destination before fetching it.
  for (let hop = 0; hop <= 5; hop += 1) {
    let addresses;
    try { addresses = await lookup(current.hostname, { all: true, verbatim: true }); }
    catch { throw new Error('The source domain could not be resolved.'); }
    if (!addresses.length || addresses.some(record => net.isIP(record.address) === 4 ? isPrivateIPv4(record.address) : isPrivateIPv6(record.address))) {
      throw new Error('The source or redirect resolves to a private or restricted network address.');
    }
    response = await fetch(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'user-agent': 'ADVERSE-Research/0.3 (+public-interest research; bounded text retrieval)',
        accept: 'text/html, text/plain;q=0.9'
      }
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location) throw new Error('The source returned a redirect without a destination.');
    if (hop === 5) throw new Error('The source exceeded the five-redirect safety limit.');
    let next;
    try { next = validatePublicUrl(new URL(location, current).href); }
    catch { throw new Error('The source redirected to an invalid or restricted destination.'); }
    redirects.push({ status: response.status, from: current.href, to: next.href });
    current = next;
  }
  if (!response || response.status >= 300 && response.status < 400) throw new Error('The redirect chain could not be confirmed.');
  if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml')) {
    throw new Error('Source is not an HTML or plain-text page.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Source response had no readable body.');
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 1000000) {
      await reader.cancel();
      throw new Error('Source exceeds the 1 MB retrieval limit.');
    }
    chunks.push(Buffer.from(value));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const decode = value => String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => { const cp = Number(n); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''; })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const cp = parseInt(n, 16); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''; });
  const title = decode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 240);
  const descriptionMatch = raw.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
    || raw.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  const description = decode(descriptionMatch?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  const text = decode(raw
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|article|section|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()).slice(0, 3500);
  return {
    url: original.href,
    finalUrl: current.href,
    redirects,
    httpStatus: response.status,
    title: title || parsed.hostname,
    description,
    excerpt: [description, text].filter(Boolean).join('\n\n').slice(0, 4500),
    retrievedAt: new Date().toISOString(),
    contentType,
    httpStatus: response.status,
    contentHash: (await import('node:crypto')).createHash('sha256').update(raw).digest('hex'),
    method: 'bounded public HTML/text retrieval',
    note: 'Page text is a retrieval snapshot, not independent verification. Source terms, access restrictions, and robots policies still apply.'
  };
}
