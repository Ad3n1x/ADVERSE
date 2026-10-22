const clean = (v, max = 1200) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const timeout = ms => AbortSignal.timeout(ms);
const providers = [];

async function json(url, options = {}) {
  const res = await fetch(url, { signal: timeout(12000), ...options, headers: { 'user-agent': 'ADVERSE-Research/1.0', accept: 'application/json', ...(options.headers || {}) } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function add(name, fn, configured = true) { providers.push({ name, fn, configured }); }
export function normalizeProviderResult(title, url, excerpt, provider, extra = {}) {
  let parsedUrl;
  try { parsedUrl = new URL(String(url || '').trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return null;
  return { ...extra, title: clean(title, 240) || 'Untitled result', url: parsedUrl.href, excerpt: clean(excerpt, 1200), publisher: provider, retrievedAt: new Date().toISOString(), publishedAt: extra.publishedAt || null, sourceType: extra.sourceType || 'web', provider };
}

// Keys are optional. Each adapter is isolated; missing credentials are reported, never fatal.
add('Brave Search API', async (q, userKeys = {}) => {
  const key = (userKeys.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY); if (!key) throw new Error('BRAVE_SEARCH_API_KEY not configured');
  const d = await json('https://api.search.brave.com/res/v1/web/search?' + new URLSearchParams({q,count:'10'}), {headers:{'X-Subscription-Token':key}});
  return (d.web?.results || []).map(x=>normalizeProviderResult(x.title,x.url,x.description,'Brave Search API')).filter(Boolean);
}, !!process.env.BRAVE_SEARCH_API_KEY);
add('Tavily Search', async (q, userKeys = {}) => {
  const key=(userKeys.TAVILY_API_KEY || process.env.TAVILY_API_KEY);if(!key)throw new Error('TAVILY_API_KEY not configured');
  const d=await json('https://api.tavily.com/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:key,query:q,max_results:8,search_depth:'basic',include_answer:false})});
  return (d.results||[]).map(x=>normalizeProviderResult(x.title,x.url,x.content,'Tavily Search')).filter(Boolean);
},!!process.env.TAVILY_API_KEY);
add('Exa Search', async (q, userKeys = {}) => {
  const key=(userKeys.EXA_API_KEY || process.env.EXA_API_KEY);if(!key)throw new Error('EXA_API_KEY not configured');
  const d=await json('https://api.exa.ai/search',{method:'POST',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({query:q,type:'auto',numResults:8,contents:{text:{maxCharacters:1000}}})});
  return (d.results||[]).map(x=>normalizeProviderResult(x.title,x.url,x.text,'Exa Search',{publishedAt:x.publishedDate||null})).filter(Boolean);
},!!process.env.EXA_API_KEY);
add('Google Programmable Search', async (q, userKeys = {}) => {
  const key=(userKeys.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_API_KEY),cx=(userKeys.GOOGLE_CSE_CX || process.env.GOOGLE_CSE_CX);if(!key||!cx)throw new Error('Google CSE credentials not configured');
  const d=await json('https://www.googleapis.com/customsearch/v1?'+new URLSearchParams({key,cx,q,num:'10'}));
  return (d.items||[]).map(x=>normalizeProviderResult(x.title,x.link,x.snippet,'Google Programmable Search')).filter(Boolean);
},!!(process.env.GOOGLE_CSE_API_KEY&&process.env.GOOGLE_CSE_CX));
add('Bing Web Search API', async (q, userKeys = {}) => {
  const key=(userKeys.BING_SEARCH_API_KEY || process.env.BING_SEARCH_API_KEY);if(!key)throw new Error('BING_SEARCH_API_KEY not configured');
  const d=await json('https://api.bing.microsoft.com/v7.0/search?'+new URLSearchParams({q,count:'10'}),{headers:{'Ocp-Apim-Subscription-Key':key}});
  return (d.webPages?.value||[]).map(x=>normalizeProviderResult(x.name,x.url,x.snippet,'Bing Web Search API')).filter(Boolean);
},!!process.env.BING_SEARCH_API_KEY);
add('SerpAPI Google Search', async (q, userKeys = {}) => {
  const key=(userKeys.SERPAPI_API_KEY || process.env.SERPAPI_API_KEY);if(!key)throw new Error('SERPAPI_API_KEY not configured');
  const d=await json('https://serpapi.com/search.json?'+new URLSearchParams({engine:'google',q,api_key:key,num:'10'}));
  return (d.organic_results||[]).map(x=>normalizeProviderResult(x.title,x.link,x.snippet,'SerpAPI Google Search')).filter(Boolean);
},!!process.env.SERPAPI_API_KEY);
add('NewsAPI', async (q, userKeys = {}) => {
  const key=(userKeys.NEWSAPI_API_KEY || process.env.NEWSAPI_API_KEY);if(!key)throw new Error('NEWSAPI_API_KEY not configured');
  const d=await json('https://newsapi.org/v2/everything?'+new URLSearchParams({q,pageSize:'10',sortBy:'relevancy',apiKey:key}));
  return (d.articles||[]).map(x=>normalizeProviderResult(x.title,x.url,x.description,'NewsAPI',{publishedAt:x.publishedAt||null})).filter(Boolean);
},!!process.env.NEWSAPI_API_KEY);
add('Reddit Search', async q => {
  const d=await json('https://www.reddit.com/search.json?'+new URLSearchParams({q,limit:'10',sort:'relevance',type:'link'}),{headers:{'user-agent':'ADVERSEResearch/1.0 (public search)'}});
  return (d.data?.children||[]).map(x=>normalizeProviderResult(x.data.title,'https://www.reddit.com'+x.data.permalink,x.data.selftext||x.data.url,'Reddit Search',{publishedAt:x.data.created_utc?new Date(x.data.created_utc*1000).toISOString():null})).filter(Boolean);
});
add('YouTube Data API', async (q, userKeys = {}) => {
  const key=(userKeys.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY);if(!key)throw new Error('YOUTUBE_API_KEY not configured');
  const d=await json('https://www.googleapis.com/youtube/v3/search?'+new URLSearchParams({part:'snippet',q,type:'video',maxResults:'10',key}));
  return (d.items||[]).map(x=>normalizeProviderResult(x.snippet.title,'https://www.youtube.com/watch?v='+x.id.videoId,x.snippet.description,'YouTube Data API',{publishedAt:x.snippet.publishedAt||null})).filter(Boolean);
},!!process.env.YOUTUBE_API_KEY);

export async function searchConfiguredProviders(query, limit = 8, userKeys = {}) {
  const selected = providers.filter(p => {const keyByName={'Brave Search API':['BRAVE_SEARCH_API_KEY'],'Tavily Search':['TAVILY_API_KEY'],'Exa Search':['EXA_API_KEY'],'Google Programmable Search':['GOOGLE_CSE_API_KEY','GOOGLE_CSE_CX'],'Bing Web Search API':['BING_SEARCH_API_KEY'],'SerpAPI Google Search':['SERPAPI_API_KEY'],'NewsAPI':['NEWSAPI_API_KEY'],'YouTube Data API':['YOUTUBE_API_KEY']};const keys=keyByName[p.name];return p.configured||!keys||keys.every(k=>Boolean(String(userKeys[k]||process.env[k]||'').trim()));});
  const outcomes = await Promise.allSettled(selected.map(async p => ({name:p.name,results:await p.fn(query, userKeys)})));
  const results=[], errors=[];
  outcomes.forEach((outcome,i)=> {
    if(outcome.status==='fulfilled') results.push(...outcome.value.results);
    else errors.push({provider:selected[i].name,error:String(outcome.reason?.message||'Provider unavailable')});
  });
  return {results:results.slice(0,limit*selected.length),errors,providers:selected.map(p=>({name:p.name,configured:p.configured,requiresKey:!p.configured}))};
}

export function getProviderCatalog(userKeys = {}) {
  const has = (key, env) => Boolean(String(userKeys[key] || process.env[env] || '').trim());
  const googleCse = has('GOOGLE_CSE_API_KEY','GOOGLE_CSE_API_KEY') && has('GOOGLE_CSE_CX','GOOGLE_CSE_CX');
  return [
    {name:'Wikipedia',category:'reference',configured:true,access:'public'},
    {name:'Crossref',category:'research',configured:true,access:'public'},
    {name:'OpenAlex',category:'research',configured:true,access:'public'},
    {name:'GDELT Global News',category:'news',configured:true,access:'public'},
    {name:'Google News RSS',category:'news',configured:true,access:'public'},
    {name:'Wikidata',category:'knowledge graph',configured:true,access:'public'},
    {name:'Purili Web Search',category:'web search',configured:true,access:'public',requiresKey:false},
    {name:'Truegle Web Search',category:'web search',configured:true,access:'public',requiresKey:false},
    ...providers.map(p=>{const key=p.name==='Brave Search API'?has('BRAVE_SEARCH_API_KEY','BRAVE_SEARCH_API_KEY'):p.name==='Tavily Search'?has('TAVILY_API_KEY','TAVILY_API_KEY'):p.name==='Exa Search'?has('EXA_API_KEY','EXA_API_KEY'):p.name==='Google Programmable Search'?googleCse:p.name==='Bing Web Search API'?has('BING_SEARCH_API_KEY','BING_SEARCH_API_KEY'):p.name==='SerpAPI Google Search'?has('SERPAPI_API_KEY','SERPAPI_API_KEY'):p.name==='NewsAPI'?has('NEWSAPI_API_KEY','NEWSAPI_API_KEY'):p.name==='YouTube Data API'?has('YOUTUBE_API_KEY','YOUTUBE_API_KEY'):p.configured;return {name:p.name,category:p.name.includes('News')||p.name==='NewsAPI'?'news':p.name.includes('YouTube')?'video':p.name==='Reddit Search'?'community':'web search',configured:key,access:key?'enabled':p.name==='Reddit Search'?'public':'requires API key or configuration',requiresKey:!key};})
  ];
}
