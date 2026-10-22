import { z } from 'zod';

export function registerSearchRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, isDb, User, memory,
  getUserProviderKeys, getProviderCatalog, encryptProviderKeys, decryptProviderKeys,
  providerKeyNames, aiCredentialNames, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, validatePublicUrl, scrapePublicPage,
  inspectPublicLink, assessSourceContext, titleSimilarity,
}) {
  app.get('/api/v1/ai/status',requireAuth,wrap(async(req,res)=>{const keys=await getUserProviderKeys(req.user.id);const gemini=Boolean(keys.GEMINI_API_KEY||process.env.GEMINI_API_KEY);const compatible=Boolean((keys.AI_PROVIDER_BASE_URL||process.env.AI_PROVIDER_BASE_URL)&&(keys.AI_PROVIDER_API_KEY||process.env.AI_PROVIDER_API_KEY)&&(keys.AI_PROVIDER_MODEL||process.env.AI_PROVIDER_MODEL));res.json({data:{configured:gemini||compatible,providers:[...(gemini?['Google Gemini']:[]),...(compatible?['OpenAI-compatible provider']:[])],userConfigured:aiCredentialNames.filter(k=>Boolean(keys[k])),environmentConfigured:aiCredentialNames.filter(k=>Boolean(process.env[k]))}});}));
  app.get('/api/v1/ai/credentials',requireAuth,wrap(async(req,res)=>{const keys=await getUserProviderKeys(req.user.id);res.json({data:{userConfigured:aiCredentialNames.filter(k=>Boolean(keys[k])),environmentConfigured:aiCredentialNames.filter(k=>Boolean(process.env[k]))}});}));
  app.put('/api/v1/ai/credentials',requireAuth,wrap(async(req,res)=>{const body=req.body||{};const keys=await getUserProviderKeys(req.user.id);for(const name of aiCredentialNames){if(!Object.prototype.hasOwnProperty.call(body,name))continue;const value=String(body[name]||'').trim();if(value.length>2000)return sendError(res,400,'INVALID_AI_SETTING','An AI setting is too long.');if(name==='AI_PROVIDER_BASE_URL'&&value){let u;try{u=new URL(value);}catch{return sendError(res,400,'INVALID_AI_ENDPOINT','Enter a valid HTTPS base URL for your AI provider.');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return sendError(res,400,'INVALID_AI_ENDPOINT','The AI provider base URL must use HTTPS and cannot contain credentials, query parameters, or fragments.');}if(name==='GEMINI_MODEL'&&value&&!/^[a-zA-Z0-9._-]{1,100}$/.test(value))return sendError(res,400,'INVALID_AI_MODEL','Enter a valid Gemini model identifier.');if(value)keys[name]=value;else delete keys[name];}const encrypted=Object.keys(keys).length?encryptProviderKeys(keys):'';if(isDb())await User.updateOne({_id:req.user.id},{$set:{providerCredentialsEncrypted:encrypted}});else{const user=memory.users.get(req.user.id);if(!user)return sendError(res,401,'SESSION_EXPIRED','Please sign in again.');user.providerCredentialsEncrypted=encrypted;memory.users.set(req.user.id,user);}res.json({data:{userConfigured:aiCredentialNames.filter(k=>Boolean(keys[k])),environmentConfigured:aiCredentialNames.filter(k=>Boolean(process.env[k]))},message:'AI provider settings saved securely.'});}));
  app.get('/api/v1/search/providers',requireAuth,wrap(async(req,res)=>{const keys=await getUserProviderKeys(req.user.id);const catalog=getProviderCatalog(keys);res.json({data:catalog.filter(p=>p.configured||p.access==='public'),meta:{configured:catalog.filter(p=>p.configured).length,total:catalog.length,notice:'Only connected providers and public providers are shown. Availability, quota, region, and terms still apply.'}});}));
  app.get('/api/v1/search/provider-credentials',requireAuth,wrap(async(req,res)=>{const keys=await getUserProviderKeys(req.user.id);const catalog=getProviderCatalog(keys);res.json({data:{configured:providerKeyNames.filter(k=>Boolean(keys[k]||process.env[k])),userConfigured:providerKeyNames.filter(k=>Boolean(keys[k])),providers:catalog.filter(p=>p.configured||p.access==='public')}});}));
  app.put('/api/v1/search/provider-credentials',requireAuth,wrap(async(req,res)=>{const body=req.body||{};const keys=await getUserProviderKeys(req.user.id);for(const name of providerKeyNames){if(Object.prototype.hasOwnProperty.call(body,name)){const value=String(body[name]||'').trim();if(value.length>1000)return sendError(res,400,'INVALID_PROVIDER_KEY','A provider credential is too long.');if(value)keys[name]=value;else delete keys[name];}}if(Boolean(keys.GOOGLE_CSE_API_KEY)!==Boolean(keys.GOOGLE_CSE_CX))return sendError(res,400,'GOOGLE_CSE_PAIR_REQUIRED','Google Programmable Search requires both the API key and Search Engine ID (cx).');const encrypted=Object.keys(keys).length?encryptProviderKeys(keys):'';if(isDb()){await User.updateOne({_id:req.user.id},{$set:{providerCredentialsEncrypted:encrypted}});}else{const user=memory.users.get(req.user.id);if(!user)return sendError(res,401,'SESSION_EXPIRED','Please sign in again.');user.providerCredentialsEncrypted=encrypted;memory.users.set(req.user.id,user);}const catalog=getProviderCatalog(keys);res.json({data:{configured:providerKeyNames.filter(k=>Boolean(keys[k]||process.env[k])),userConfigured:providerKeyNames.filter(k=>Boolean(keys[k])),providers:catalog.filter(p=>p.configured||p.access==='public')},message:'Search provider settings saved securely.'});}));
  app.get('/api/v1/search',requireAuth,limitProvider,wrap(async(req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,200);
    if(q.length<2)return sendError(res,400,'QUERY_REQUIRED','Enter at least two characters to search.');
    const terms=[...new Set((q.toLowerCase().match(/[\\p{L}\\p{N}]{2,}/gu)||[]).slice(0,12))];
    const regex=new RegExp(terms.join('|'),'i');
    const investigations=isDb()?await Investigation.find({ownerId:req.user.id}).select('_id').lean():[...memory.investigations.values()].filter(item=>item.ownerId===req.user.id).map(item=>({_id:item.id}));
    const caseIds=investigations.map(item=>String(item._id));
    let indexed=[];
    if(caseIds.length){
      if(isDb()) indexed=await Evidence.find({investigationId:{$in:caseIds},$or:[{title:regex},{excerpt:regex},{publisher:regex},{url:regex}]}).sort({retrievedAt:-1}).limit(60).lean();
      else indexed=[...memory.evidence.values()].filter(item=>caseIds.includes(String(item.investigationId))&&regex.test([item.title,item.excerpt,item.publisher,item.url].join(' '))).slice(0,60);
    }
    const rank=item=>{
      const hay=[item.title,item.excerpt,item.publisher,item.url].join(' ').toLowerCase();
      const hits=terms.reduce((n,term)=>n+(hay.includes(term)?1:0),0);
      const titleHits=terms.reduce((n,term)=>n+(String(item.title||'').toLowerCase().includes(term)?1:0),0);
      const queryHits=(item.matchedQueries||[]).reduce((n,variant)=>n+(hay.includes(String(variant).replace(/"/g,'').toLowerCase())?1:0),0);
      const age=Math.max(0,Date.now()-new Date(item.publishedAt||item.retrievedAt||item.createdAt||0).getTime());
      const freshness=Number.isFinite(age)?Math.max(0,10-age/(1000*60*60*24*30)):0;
      return hits*4+titleHits*5+queryHits*3+Math.min((item.matchedQueries||[]).length,5)*2+freshness;
    };
    const stored=indexed.map(item=>({title:item.title,url:item.url,excerpt:item.excerpt||'',publisher:item.publisher||'Saved source',retrievedAt:item.retrievedAt||item.createdAt||new Date().toISOString(),publishedAt:item.publishedAt||null,sourceType:item.sourceType||'web',provider:'ADVERSE Index',verificationStatus:item.verificationStatus||'unverified',investigationId:String(item.investigationId),rank:rank(item),indexed:true,matchedQueries:[q]}));
    const providerKeys=await getUserProviderKeys(req.user.id);
    const live=await searchAllPublic(q,providerKeys).catch(error=>({results:[],queryPlan:[],meta:{},error:String(error?.message||'Public providers unavailable')}));
    const liveResults=Array.isArray(live.results)?live.results:[];
    const seen=new Set(stored.map(item=>String(item.url||'').toLowerCase()));
    const merged=[...stored,...liveResults.filter(item=>{const key=String(item.url||'').toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).map(item=>({...item,rank:rank(item),indexed:false}))];
    merged.sort((a,b)=>b.rank-a.rank);
    res.locals.searchResultCount=merged.length;
    res.locals.searchError=live.error||(!liveResults.length?'NO_LIVE_PROVIDER_RESULTS':'');
    res.json({data:merged.slice(0,100).map(({rank:_rank,...item})=>item),meta:{
      providers:[...new Set(merged.flatMap(item=>[item.provider,...(item.providers||[])].filter(Boolean)))],
      query:q,queryPlan:live.queryPlan||[],retrievedAt:new Date().toISOString(),indexedCount:stored.length,liveCount:liveResults.length,
      providerUnavailable:!liveResults.length,providerError:live.error||'',
      providerErrors:[...new Set(liveResults.flatMap(item=>item.providerErrors||[]))],
      successfulSearches:live.meta?.successfulSearches||0,failedSearches:live.meta?.failedSearches||0,
      coverage:live.meta?.coverage||'Bounded keyword-expanded public-source search. This is not exhaustive whole-web crawling.'
    }});
  }));
}
