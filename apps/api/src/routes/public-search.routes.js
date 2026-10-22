export function registerPublicSearchRoutes(app, {
  limitProvider, wrap, sendError, validatePublicUrl, inspectPublicLink,
  assessSourceContext, titleSimilarity, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, searchImages, searchVideos,
  searchPeople, scrapePublicPage, getUserProviderKeys, optionalAuth,
}) {
  app.post('/api/v1/public-search/visual-match',limitProvider,wrap(async(req,res)=>{
   const body=req.body||{};const dataUrl=String(body.imageDataUrl||'');const mediaType=String(body.mediaType||'image');
   if(!['image','video-frame'].includes(mediaType))return sendError(res,400,'INVALID_MEDIA_TYPE','Unsupported visual media type.');
   const match=dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
   if(!match)return sendError(res,400,'INVALID_IMAGE','Provide a JPEG, PNG, or WebP image.');
   if(match[2].length>210000)return sendError(res,413,'IMAGE_TOO_LARGE','Image too large after compression.');
   const key=String(process.env.GEMINI_API_KEY||'').trim();if(!key)return sendError(res,503,'VISION_NOT_CONFIGURED','Add GEMINI_API_KEY to the API service environment to enable visual search.');
   const model=String(process.env.GEMINI_MODEL||'gemini-2.5-flash').trim();
   const prompt='Describe visible objects, setting, and distinctive details in this image for public visual discovery. Do not identify private people or infer sensitive traits. Return only JSON with description and 3 to 5 search queries.';
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/'+match[1],data:match[2]}}]}],generationConfig:{temperature:0.1,maxOutputTokens:500,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(25000)});
   const raw=await response.text();let payload;try{payload=JSON.parse(raw);}catch{payload=null;}if(!response.ok)return sendError(res,502,'VISION_PROVIDER_FAILED','Visual analysis provider failed. Check the Gemini key, model, and quota.');
   let analysis;try{analysis=JSON.parse((payload?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(''));}catch{return sendError(res,502,'VISION_INVALID_RESPONSE','Could not read the visual analysis. Try another image.');}
   const description=String(analysis.description||'').slice(0,800);const queries=[...new Set((Array.isArray(analysis.queries)?analysis.queries:[]).map(q=>String(q||'').trim().slice(0,160)).filter(q=>q.length>=3))].slice(0,5);if(!queries.length&&description)queries.push(description.slice(0,160));
   const groups=await Promise.all(queries.map(async q=>{const out=await Promise.all([searchImages(q,8).catch(()=>[]),searchVideos(q,6).catch(()=>[])]);return {query:q,items:[...out[0],...out[1]]};}));const found=new Map();for(const group of groups)for(const item of group.items){if(item.url&&!found.has(item.url))found.set(item.url,{...item,matchedQuery:group.query,matchType:'visual-description'});}
   const data=[...found.values()].slice(0,40);res.json({data,meta:{description,queries,resultCount:data.length,matchMethod:'vision-description-search',notice:'These are visually or contextually related candidates from public indexes, not pixel-level reverse-image matches or confirmed identities.'}});
  }));
  app.get('/api/v1/public-search/media',limitProvider,wrap(async(req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,200);
    const type=String(req.query.type||'all').trim().toLowerCase();
    if(q.length<2)return sendError(res,400,'QUERY_REQUIRED','Enter at least two characters to search.');
    if(!['images','videos','people','all'].includes(type))return sendError(res,400,'INVALID_MEDIA_TYPE','Choose images, videos, people, or all.');
    const tasks=[];
    if(type==='images'||type==='all')tasks.push(['images',searchImages]);
    if(type==='videos'||type==='all')tasks.push(['videos',searchVideos]);
    if(type==='people'||type==='all')tasks.push(['people',searchPeople]);
    const settled=await Promise.all(tasks.map(async([name,fn])=>{try{return {name,results:await fn(q),error:null};}catch(error){return {name,results:[],error:'Provider unavailable: '+String(error?.message||'request failed')};}}));
    const results=settled.flatMap(item=>item.results).slice(0,40);
    res.json({data:results,meta:{query:q,type,providers:tasks.map(item=>item[0]),failedProviders:settled.filter(item=>item.error).map(item=>({provider:item.name,error:item.error})),resultCount:results.length,notice:'Results come from public third-party indexes. Image rights, identity matches, accuracy, and content safety are not guaranteed; open the original source and check its terms.'}});
  }));
  app.get('/api/v1/public-search',optionalAuth,limitProvider,wrap(async(req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,200);
    if(q.length<2)return sendError(res,400,'QUERY_REQUIRED','Enter at least two characters to search.');
    const providerKeys=req.user?await getUserProviderKeys(req.user.id):{};
    const live=await searchAllPublic(q,providerKeys).catch(error=>({results:[],queryPlan:[],meta:{},error:String(error?.message||'Public providers unavailable')}));
    const ranked=diversifyPublicResults(Array.isArray(live.results)?live.results:[],q,{limit:30,maxPerDomain:3});
    const candidates=ranked.map(({_searchScore,_searchOrder,...item})=>item);
    const unique=[];const seen=new Set();
    for(const item of candidates){try{const parsed=validatePublicUrl(item.url);const canonical=normalizeResultUrl(parsed.href);const key=canonical;if(seen.has(key))continue;seen.add(key);unique.push({...item,url:canonical,linkSignals:inspectPublicLink(canonical)});}catch{}}
    const checked=await Promise.all(unique.slice(0,8).map(async item=>{
      const checkedAt=new Date().toISOString();
      try{await scrapePublicPage(item.url);return {...item,linkCheck:{status:'reachable',checkedAt,note:'The public page responded with readable text during this check. This does not verify every claim on the page.'}};}
      catch(error){return {...item,linkCheck:{status:'not_confirmed',checkedAt,note:'ADVERSE could not confirm readable page access. The link may redirect, block automated access, or be temporarily unavailable; inspect it directly before relying on it.'}};}
    }));
    const checkedUrls=new Set(checked.map(item=>item.url));
    const rawResults=[...checked,...unique.filter(item=>!checkedUrls.has(item.url)).map(item=>({...item,linkCheck:{status:'not_checked',checkedAt:null,note:'This result was not link-checked in this search.'}}))];
    const results=rawResults.slice(0,24).map(item=>{
      const host=new URL(item.url).hostname.toLowerCase().replace(/^www\./,'');
      const corroborating=[...new Map(rawResults.filter(other=>other.url!==item.url&&new URL(other.url).hostname.toLowerCase().replace(/^www\./,'')!==host&&titleSimilarity(item.title,other.title)>=0.55).map(other=>[new URL(other.url).hostname.toLowerCase().replace(/^www\./,''),other])).values()];
      const corroboratingDomains=corroborating.slice(0,4).map(other=>new URL(other.url).hostname.toLowerCase().replace(/^www\./,''));
      return {...item,sourceContext:assessSourceContext(item.url,item),corroboration:{independentMatches:corroborating.length,domains:corroboratingDomains,method:'Similar result titles from distinct hostnames in this search result set; not independent fact verification.'}};
    });
    res.json({data:results,meta:{query:q,retrievedAt:new Date().toISOString(),queryPlan:live.queryPlan||[],providers:[...new Set(results.flatMap(item=>[item.provider,...(item.providers||[])].filter(Boolean)))],successfulSearches:live.meta?.successfulSearches||0,failedSearches:live.meta?.failedSearches||0,coverage:live.meta?.coverage||'Search across a limited set of public sources; not exhaustive whole-web search.',linkChecks:checked.length,providerError:live.error||'',notice:'Link reachability, hostname categories, and title similarity are advisory signals. They do not prove that a page or its claims are true, safe, current, or endorsed by ADVERSE.'}});
  }));
}
