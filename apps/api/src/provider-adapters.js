const clean = (v, max = 1200) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);
const timeout = ms => AbortSignal.timeout(ms);
const providers = [];

async function json(url, options = {}) {
  const res = await fetch(url, { signal: timeout(12000), ...options, headers: { 'user-agent': 'ADVERSE-Research/1.0', accept: 'application/json', ...(options.headers || {}) } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function add(name, fn, configured = true) { providers.push({ name, fn, configured }); }
function result(title, url, excerpt, provider, extra = {}) {
  if (!/^https?:\\/\\//i.test(url || '')) return null;
  return { title: clean(title, 240) || 'Untitled result', url, excerpt: clean(excerpt, 1200), publisher: provider, retrievedAt: new Date().toISOString(), publishedAt: extra.publishedAt || null, sourceType: extra.sourceType || 'web', provider, ...extra };
}

// Keys are optional. Each adapter is isolated; missing credentials are reported, never fatal.
add('Brave Search API', async q => {
  const key = process.env.BRAVE_SEARCH_API_KEY; if (!key) throw new Error('BRAVE_SEARCH_API_KEY not configured');
  const d = await json('https://api.search.brave.com/res/v1/web/search?' + new URLSearchParams({q,count:'10'}), {headers:{'X-Subscription-Token':key}});
  return (d.web?.results || []).map(x=>result(x.title,x.url,x.description,'Brave Search API')).filter(Boolean);
}, !!process.env.BRAVE_SEARCH_API_KEY);
add('Tavily Search', async q => {
  const key=process.env.TAVILY_API_KEY;if(!key)throw new Error('TAVILY_API_KEY not configured');
  const d=await json('https://api.tavily.com/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:key,query:q,max_results:8,search_depth:'basic',include_answer:false})});
  return (d.results||[]).map(x=>result(x.title,x.url,x.content,'Tavily Search')).filter(Boolean);
},!!process.env.TAVILY_API_KEY);
add('Exa Search', async q => {
  const key=process.env.EXA_API_KEY;if(!key)throw new Error('EXA_API_KEY not configured');
  const d=await json('https://api.exa.ai/search',{method:'POST',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({query:q,type:'auto',numResults:8,contents:{text:{maxCharacters:1000}}})});
  return (d.results||[]).map(x=>result(x.title,x.url,x.text,'Exa Search',{publishedAt:x.publishedDate||null})).filter(Boolean);
},!!process.env.EXA_API_KEY);
add('Google Programmable Search', async q => {
  const key=process.env.GOOGLE_CSE_API_KEY,cx=process.env.GOOGLE_CSE_CX;if(!key||!cx)throw new Error('Google CSE credentials not configured');
  const d=await json('https://www.googleapis.com/customsearch/v1?'+new URLSearchParams({key,cx,q,num:'10'}));
  return (d.items||[]).map(x=>result(x.title,x.link,x.snippet,'Google Programmable Search')).filter(Boolean);
},!!(process.env.GOOGLE_CSE_API_KEY&&process.env.GOOGLE_CSE_CX));
add('Bing Web Search API', async q => {
  const key=process.env.BING_SEARCH_API_KEY;if(!key)throw new Error('BING_SEARCH_API_KEY not configured');
  const d=await json('https://api.bing.microsoft.com/v7.0/search?'+new URLSearchParams({q,count:'10'}),{headers:{'Ocp-Apim-Subscription-Key':key}});
  return (d.webPages?.value||[]).map(x=>result(x.name,x.url,x.snippet,'Bing Web Search API')).filter(Boolean);
},!!process.env.BING_SEARCH_API_KEY);
add('SerpAPI Google Search', async q => {
  const key=process.env.SERPAPI_API_KEY;if(!key)throw new Error('SERPAPI_API_KEY not configured');
  const d=await json('https://serpapi.com/search.json?'+new URLSearchParams({engine:'google',q,api_key:key,num:'10'}));
  return (d.organic_results||[]).map(x=>result(x.title,x.link,x.snippet,'SerpAPI Google Search')).filter(Boolean);
},!!process.env.SERPAPI_API_KEY);
add('NewsAPI', async q => {
  const key=process.env.NEWSAPI_API_KEY;if(!key)throw new Error('NEWSAPI_API_KEY not configured');
  const d=await json('https://newsapi.org/v2/everything?'+new URLSearchParams({q,pageSize:'10',sortBy:'relevancy',apiKey:key}));
  return (d.articles||[]).map(x=>result(x.title,x.url,x.description,'NewsAPI',{publishedAt:x.publishedAt||null})).filter(Boolean);
},!!process.env.NEWSAPI_API_KEY);
add('Reddit Search', async q => {
  const d=await json('https://www.reddit.com/search.json?'+new URLSearchParams({q,limit:'10',sort:'relevance',type:'link'}),{headers:{'user-agent':'ADVERSEResearch/1.0 (public search)'}});
  return (d.data?.children||[]).map(x=>result(x.data.title,'https://www.reddit.com'+x.data.permalink,x.data.selftext||x.data.url,'Reddit Search',{publishedAt:x.data.created_utc?new Date(x.data.created_utc*1000).toISOString():null})).filter(Boolean);
});
add('YouTube Data API', async q => {
  const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error('YOUTUBE_API_KEY not configured');
  const d=await json('https://www.googleapis.com/youtube/v3/search?'+new URLSearchParams({part:'snippet',q,type:'video',maxResults:'10',key}));
  return (d.items||[]).map(x=>result(x.snippet.title,'https://www.youtube.com/watch?v='+x.id.videoId,x.snippet.description,'YouTube Data API',{publishedAt:x.snippet.publishedAt||null})).filter(Boolean);
},!!process.env.YOUTUBE_API_KEY);

export async function searchConfiguredProviders(query, limit = 8) {
  const selected = providers.filter(p => p.configured || !['Brave Search API','Tavily Search','Exa Search','Google Programmable Search','Bing Web Search API','SerpAPI Google Search','NewsAPI','YouTube Data API'].includes(p.name));
  const outcomes = await Promise.allSettled(selected.map(async p => ({name:p.name,results:await p.fn(query)})));
  const results=[], errors=[];
  outcomes.forEach((outcome,i)=> {
    if(outcome.status==='fulfilled') results.push(...outcome.value.results);
    else errors.push({provider:selected[i].name,error:String(outcome.reason?.message||'Provider unavailable')});
  });
  return {results:results.slice(0,limit*selected.length),errors,providers:selected.map(p=>({name:p.name,configured:p.configured,requiresKey:!p.configured}))};
}
