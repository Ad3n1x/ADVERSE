import { lookup } from 'node:dns/promises';
import net from 'node:net';

const timeoutFetch = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 9000), headers: { 'user-agent': 'ADVERSE-Research/0.1 (public-source research)', accept: 'application/json,text/plain,text/html;q=0.8', ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response;
};
export async function searchPublic(query) {
  const q = query.trim();
  if (q.length < 2) throw new Error('Search query must contain at least 2 characters.');
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action:'query', list:'search', srsearch:q, srlimit:'8', format:'json', origin:'*' }).toString();
  const data = await (await timeoutFetch(url, { headers: { accept: 'application/json' } })).json();
  return (data.query?.search || []).map((item) => ({ title:item.title, url:'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replaceAll(' ','_')), excerpt:String(item.snippet || '').replace(/<[^>]*>/g,'').replaceAll('&quot;','"').replaceAll('&amp;','&'), sourceType:'web', publisher:'Wikipedia', retrievedAt:new Date().toISOString(), publishedAt:null, provider:'Wikipedia Search' }));
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
function mappedIPv4(ip) {
  const x=ip.toLowerCase();
  if (!x.startsWith('::ffff:')) return null;
  const tail=x.slice(7);
  if (tail.includes('.')) return tail;
  const groups=tail.split(':');
  if (groups.length!==2 || groups.some(group=>! /^[0-9a-f]{1,4}$/.test(group))) return null;
  const high=parseInt(groups[0],16), low=parseInt(groups[1],16);
  return `${high>>8}.${high&255}.${low>>8}.${low&255}`;
}
function isPrivateIPv6(ip) {
  const x=ip.toLowerCase();
  const mapped=mappedIPv4(x);
  if (mapped) return isPrivateIPv4(mapped);
  return x==='::'||x==='::1'||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('ff')||x.startsWith('2001:db8:')||x.startsWith('2001:10:')||x.startsWith('2001:20:');
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
export async function publicDns(inputUrl) {
  const u=validatePublicUrl(inputUrl); let records;
  try { records=await lookup(u.hostname,{all:true,verbatim:true}); } catch { throw new Error('The domain could not be resolved.'); }
  if (!records.length || records.some(r=>net.isIP(r.address)===4?isPrivateIPv4(r.address):isPrivateIPv6(r.address))) throw new Error('The domain resolves to a private or restricted network address.');
  const query=async(type)=>{const endpoint=`https://dns.google/resolve?name=${encodeURIComponent(u.hostname)}&type=${type}`;const data=await(await timeoutFetch(endpoint,{headers:{accept:'application/dns-json'}})).json();return(data.Answer||[]).map(a=>({type:a.type,ttl:a.TTL,data:a.data}));};
  const [a,aaaa,mx,txt]=await Promise.allSettled([query('A'),query('AAAA'),query('MX'),query('TXT')]);
  return { hostname:u.hostname, retrievedAt:new Date().toISOString(), resolver:'Google Public DNS-over-HTTPS', records:{ A:a.status==='fulfilled'?a.value:[], AAAA:aaaa.status==='fulfilled'?aaaa.value:[], MX:mx.status==='fulfilled'?mx.value:[], TXT:txt.status==='fulfilled'?txt.value:[] }, note:'DNS records are observations at retrieval time; they do not establish common ownership or intent.' };
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
