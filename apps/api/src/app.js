import express from 'express';
import { createHealthRouter } from './routes/health.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { registerInvestigationRoutes } from './routes/investigations.routes.js';
import { assessSourceContext, inspectPublicLink, titleSimilarity } from './services/research/source-assessment.js';
export { assessSourceContext, inspectPublicLink } from './services/research/source-assessment.js';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { timingSafeEqual, createHmac, scryptSync } from 'node:crypto';
import { z } from 'zod';
import { Investigation, Evidence, Entity, Relationship, User, Watch, Alert, CyberAsset, CyberEvent, AdminAuditEvent, SearchMetric, PlatformConfig, Incident, JobRun, LinkCheck } from './models.js';
import { scrapePublicPage, waybackCaptures, publicDns, validatePublicUrl, compareArchivedText, searchOrganizations, validatePublicUrlResolution } from './providers.js';
import { searchAllPublic, rankPublicResults, diversifyPublicResults, normalizeResultUrl } from './global-search.js';
import { searchImages, searchVideos, searchPeople } from './media-search.js';
import { getProviderCatalog } from './provider-adapters.js';
import { runMonitoringCycle } from './monitor.js';
import { runDiscoveryCycle } from './discovery.js';
import { createReportPdf } from './pdf.js';
import { analyzeEvidenceClaims } from './claim-analysis.js';
import { analyzeResearchGaps } from './research-gaps.js';
import { planAgentFollowUps } from './agent-planner.js';
import { isFreshRunningAgentRun } from './agent-run-state.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy:{policy:'cross-origin'} }));
const allowedWebOrigins = () => String(process.env.WEB_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')).split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) { if (!origin || allowedWebOrigins().includes(origin)) return callback(null, true); return callback(null, false); }, credentials: true }));
app.use(express.json({ limit:'256kb' }));
app.use((req,res,next)=>{const started=Date.now();res.on('finish',()=>{if(res.statusCode>=500)console.error(JSON.stringify({event:'request_error',method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started}));});next();});
const id=()=>crypto.randomUUID();
const isDb=()=>globalThis.__ADVERSE_MONGO_READY__===true;
const memory=globalThis.__ADVERSE_STORE__ ||= { investigations:new Map(), evidence:new Map(), entities:new Map(), relationships:new Map(), users:new Map(), watches:new Map(), alerts:new Map(), cyberAssets:new Map(), cyberEvents:new Map() };
const telemetryStartedAt = Symbol('adverseTelemetryStartedAt');
app.use((req,res,next)=>{
  req[telemetryStartedAt]=Date.now();
  res.on('finish',()=>{
    const route=String(req.path||'').split('?')[0].slice(0,160);
    if(!route.startsWith('/api/v1/'))return;
    const isSearch=route==='/api/v1/search'||route==='/api/v1/public-search'||route==='/api/v1/public-search/media';
    // Record route/method/status/latency only; never capture query strings or request bodies.
    const event={kind:isSearch?'search':'request',route,method:req.method,status:res.statusCode,durationMs:Math.max(0,Date.now()-(req[telemetryStartedAt]||Date.now())),userId:String(req.user?.id||'').slice(0,100),resultCount:Number(res.locals.searchResultCount||0),errorCode:res.statusCode>=500?'HTTP_5XX':String(res.locals.searchError||'').slice(0,80)};
    if(isDb())void SearchMetric.create(event).catch(()=>{});
    else {const items=globalThis.__ADVERSE_METRICS__ ||= [];items.push({...event,createdAt:new Date()});if(items.length>2000)items.splice(0,items.length-2000);}
  });
  next();
});
const wrap=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const createInvestigationSchema=z.object({title:z.string().trim().min(1).max(120),question:z.string().trim().max(1000).default('')});
const evidenceSchema=z.object({title:z.string().trim().min(1).max(240),url:z.string().url().max(2048),sourceType:z.enum(['web','archive','organization','document','manual','domain']).default('manual'),publisher:z.string().max(200).default(''),publishedAt:z.string().datetime().nullable().optional(),excerpt:z.string().max(5000).default(''),verificationStatus:z.enum(['unverified','supported','conflicting','insufficient']).default('unverified'),entities:z.array(z.string()).max(50).default([]),captureTimestamp:z.string().max(32).default('')});
const entitySchema=z.object({name:z.string().trim().min(1).max(200),type:z.enum(['organization','domain','product','technology','document','event','claim','person']).default('organization'),description:z.string().max(2000).default(''),canonicalUrl:z.string().max(2048).default(''),evidenceIds:z.array(z.string()).max(100).default([])});
const relationshipSchema=z.object({fromEntityId:z.string().min(1),toEntityId:z.string().min(1),type:z.enum(['owns','operates','publishes','references','uses','acquired','associated','supports','contradicts','documents']),evidenceIds:z.array(z.string()).min(1).max(100),confidence:z.enum(['low','medium','high']).default('low'),rationale:z.string().max(1000).default(''),verificationStatus:z.enum(['unverified','supported','conflicting','insufficient']).default('unverified')});
const sendError=(res,status,code,message,details)=>res.status(status).json({error:{code,message,...(details?{details}: {})}});
const csvCell=(value)=>{const text=String(value??'');const safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';};
const jwtSecret=()=>process.env.JWT_SECRET||(process.env.NODE_ENV==='production'?'': 'adverse-local-development-secret-change-before-deploy');
function tokenFor(user){const secret=jwtSecret();if(!secret)throw new Error('JWT_SECRET must be configured.');const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify({sub:String(user.id||user._id),email:user.email,...(user.role?{role:user.role}:{}),exp:Math.floor(Date.now()/1000)+604800})).toString('base64url');const sig=createHmac('sha256',secret).update(head+'.'+body).digest('base64url');return head+'.'+body+'.'+sig;}
function verifyToken(token){try{const [head,body,sig]=token.split('.');const expected=createHmac('sha256',jwtSecret()).update(head+'.'+body).digest();const supplied=Buffer.from(sig,'base64url');if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return null;const p=JSON.parse(Buffer.from(body,'base64url').toString());if(!p.sub||p.exp<Math.floor(Date.now()/1000))return null;return {id:p.sub,email:p.email,role:p.role||'user'};}catch{return null;}}
function cookieToken(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('adverse_session='));if(!raw)return '';try{return decodeURIComponent(raw.slice('adverse_session='.length));}catch{return '';}}
function setSession(res,token){res.setHeader('Set-Cookie',`adverse_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=${process.env.NODE_ENV==='production'?'None':'Strict'}; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);}
const providerKeyNames=['BRAVE_SEARCH_API_KEY','TAVILY_API_KEY','EXA_API_KEY','GOOGLE_CSE_API_KEY','GOOGLE_CSE_CX','BING_SEARCH_API_KEY','SERPAPI_API_KEY','NEWSAPI_API_KEY','YOUTUBE_API_KEY'];
const aiCredentialNames=['GEMINI_API_KEY','GEMINI_MODEL','AI_PROVIDER_BASE_URL','AI_PROVIDER_API_KEY','AI_PROVIDER_MODEL'];
function providerEncryptionKey(){const secret=jwtSecret();if(!secret)throw new Error('JWT_SECRET must be configured before saving provider credentials.');return crypto.createHash('sha256').update('ADVERSE-provider-credentials-v1:'+secret).digest();}
function encryptProviderKeys(keys){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',providerEncryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(keys),'utf8'),cipher.final()]);return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');}
function decryptProviderKeys(value){if(!value)return {};try{const [iv,tag,data]=String(value).split('.');const decipher=crypto.createDecipheriv('aes-256-gcm',providerEncryptionKey(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8'));}catch{return {};}}
async function getUserProviderKeys(userId){const user=isDb()?await User.findById(userId).select('providerCredentialsEncrypted').lean():memory.users.get(userId);return decryptProviderKeys(user?.providerCredentialsEncrypted||'');}
function requireAuth(req,res,next){
  const cookie = cookieToken(req);
  const unsafeMethod = !['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase());
  const origin = req.get('origin');
  if (cookie && unsafeMethod && origin && !allowedWebOrigins().includes(origin)) return sendError(res,403,'ORIGIN_NOT_ALLOWED','This request origin is not allowed to modify the workspace.');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = verifyToken(cookie || bearer);
  if (!user) return sendError(res,401,'AUTH_REQUIRED','Sign in to access this workspace.');
  Promise.resolve().then(async()=>{
    {
      let status='active';
      if(isDb()){const account=await User.findById(user.id).select('status').lean();if(!account)return sendError(res,401,'ACCOUNT_UNAVAILABLE','This account is no longer available.');status=account.status||'active';}
      else {const account=memory.users.get(user.id);if(!account)return sendError(res,401,'ACCOUNT_UNAVAILABLE','This account is no longer available.');status=account.status||'active';}
      if(status==='suspended')return sendError(res,403,'ACCOUNT_SUSPENDED','This account is suspended. Contact support if you believe this is a mistake.');
    }
    req.user=user;next();
  }).catch(next);
}
function optionalAuth(req,res,next){const token=cookieToken(req)||String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const user=token?verifyToken(token):null;if(user)req.user=user;next();}
const authSchema=z.object({email:z.string().trim().email().max(254),password:z.string().min(12).max(128),displayName:z.string().trim().min(1).max(80).optional()});
const authLimiter=new Map();
const providerLimiter=new Map();
function pruneLimiter(limiter, now) {
  if (limiter.size < 10000) return;
  for (const [key, entry] of limiter) {
    if (now - entry.start > 60000) limiter.delete(key);
  }
  while (limiter.size > 8000) limiter.delete(limiter.keys().next().value);
}
function applyRateLimit(limiter, req, res, next, maximum, label) {
  const ip=req.ip||'unknown',now=Date.now();
  pruneLimiter(limiter, now);
  const old=limiter.get(ip)||{start:now,count:0};
  if(now-old.start>60000){old.start=now;old.count=0;}
  old.count++;limiter.set(ip,old);
  if(old.count>maximum)return sendError(res,429,'RATE_LIMITED',label);
  next();
}
function limitAuth(req,res,next){return applyRateLimit(authLimiter,req,res,next,12,'Too many authentication attempts. Try again in one minute.');}

function limitProvider(req,res,next){return applyRateLimit(providerLimiter,req,res,next,Math.max(1,Math.min(300,Number(globalThis.__ADVERSE_SEARCH_LIMIT__||40))),'Too many provider requests. Try again in one minute.');}

const investigationGet=async(iid,uid)=>{if(isDb())return Investigation.findOne({_id:iid,ownerId:uid}).lean();const record=memory.investigations.get(iid);return record&&record.ownerId===uid?record:null;};
const listFor=async(Model,collection,iid)=>isDb()?Model.find({investigationId:iid}).sort({createdAt:-1}).lean():[...memory[collection].values()].filter(x=>x.investigationId===iid);
const saveRecord=async(Model,collection,record)=>{if(isDb()){const doc=await Model.create(record);return doc.toObject();}memory[collection].set(record.id,record);return record;};
const exists=async(iid,uid)=>Boolean(await investigationGet(iid,uid));
app.use('/api/v1',wrap(async(req,res,next)=>{
  if(req.path.startsWith('/admin/')||req.path==='/admin'||req.path==='/health'||req.path==='/ready'||req.path.startsWith('/internal/'))return next();
  const cfg=await readPlatformConfig().catch(()=>({maintenanceMode:false,featureFlags:{search:true,providerSettings:true,monitoring:true},usageLimits:{searchesPerMinute:40}}));
  globalThis.__ADVERSE_SEARCH_LIMIT__=Number(cfg.usageLimits?.searchesPerMinute)||40;
  if(cfg.maintenanceMode)return sendError(res,503,'MAINTENANCE_MODE','ADVERSE is temporarily in maintenance mode. Please try again soon.');
  if((req.path==='/search'||req.path==='/public-search'||req.path==='/public-search/media')&&cfg.featureFlags?.search===false)return sendError(res,503,'FEATURE_DISABLED','Search is temporarily unavailable.');
  if((req.path.startsWith('/search/provider-credentials')||req.path.startsWith('/search/providers'))&&cfg.featureFlags?.providerSettings===false)return sendError(res,503,'FEATURE_DISABLED','Provider settings are temporarily unavailable.');
  if((req.path.startsWith('/investigations/')&&req.path.includes('/monitoring')||req.path.startsWith('/monitoring/')||req.path.startsWith('/cyber-assets/'))&&cfg.featureFlags?.monitoring===false)return sendError(res,503,'FEATURE_DISABLED','Monitoring is temporarily unavailable.');
  next();
}));
app.use('/api/v1', createHealthRouter({ isDb, mongoose }));

app.post('/api/v1/internal/discovery/run',wrap(async(req,res)=>{
  const expected=String(process.env.DISCOVERY_CRON_SECRET||'');
  const supplied=String(req.get('x-discovery-secret')||'');
  if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Discovery scheduler authentication is required.');
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Discovery scheduler authentication failed.');
  if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled discovery requires MongoDB persistence.');
  const started=Date.now();const job=await JobRun.create({name:'scheduled-discovery-cycle',status:'running',startedAt:new Date()});
  const result=await runDiscoveryCycle();job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Discovery cycle completed.';await job.save();
  res.json({data:result,job:{id:String(job._id),status:job.status,durationMs:job.durationMs},generatedAt:new Date().toISOString()});
}));
app.post('/api/v1/internal/monitoring/run',wrap(async(req,res)=>{const expected=String(process.env.MONITORING_CRON_SECRET||'');const supplied=String(req.get('x-monitoring-secret')||'');if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Monitoring scheduler authentication is required.');const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Monitoring scheduler authentication failed.');if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled monitoring requires MongoDB persistence.');const started=Date.now();const job=await JobRun.create({name:'scheduled-monitoring-cycle',status:'running',startedAt:new Date()});const result=await runMonitoringCycle();job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Monitoring cycle completed.';await job.save();res.json({data:result,job:{id:String(job._id),status:job.status,durationMs:job.durationMs},generatedAt:new Date().toISOString()});}));

// Admin authentication is separate from public registration. Configure ADMIN_EMAIL and
// ADMIN_PASSWORD in the Render service environment.
async function auditAdmin(req,action,targetType='',targetId='',details={}) {
  const event={actorId:String(req.user?.id||'admin'),actorEmail:String(req.user?.email||''),action,targetType,targetId:String(targetId||'').slice(0,160),details,ipHash:crypto.createHash('sha256').update(String(req.ip||'')).digest('hex').slice(0,24),createdAt:new Date()};
  if(isDb())await AdminAuditEvent.create(event);
  else {const items=globalThis.__ADVERSE_AUDIT__ ||= [];items.unshift(event);if(items.length>2000)items.length=2000;}
}
const platformConfigCache=globalThis.__ADVERSE_CONFIG_CACHE__ ||= {value:null,loadedAt:0};
async function readPlatformConfig(){
  if(platformConfigCache.value&&Date.now()-platformConfigCache.loadedAt<5000)return platformConfigCache.value;
  if(isDb()){
    const rows=await PlatformConfig.find({key:{$in:['maintenanceMode','featureFlags','usageLimits','retentionDays']}}).lean();
    const out={maintenanceMode:false,featureFlags:{search:true,providerSettings:true,monitoring:true},usageLimits:{searchesPerMinute:30},retentionDays:90};
    for(const row of rows)out[row.key]=row.value;
    platformConfigCache.value=out;platformConfigCache.loadedAt=Date.now();return out;
  }
  const out=globalThis.__ADVERSE_CONFIG__ ||= {maintenanceMode:false,featureFlags:{search:true,providerSettings:true,monitoring:true},usageLimits:{searchesPerMinute:30},retentionDays:90};
  platformConfigCache.value=out;platformConfigCache.loadedAt=Date.now();return out;
}
async function writePlatformConfig(key,value,actor){
  if(isDb())await PlatformConfig.updateOne({key},{$set:{value,updatedBy:actor,updatedAt:new Date()}},{upsert:true});
  else {const cfg=globalThis.__ADVERSE_CONFIG__ ||= {maintenanceMode:false,featureFlags:{search:true,providerSettings:true,monitoring:true},usageLimits:{searchesPerMinute:30},retentionDays:90};cfg[key]=value;}
  const current=await readPlatformConfig();current[key]=value;platformConfigCache.value=current;platformConfigCache.loadedAt=Date.now();
}
const ownerEmail=()=>String(process.env.ADMIN_EMAIL||'adenix271@gmail.com').trim().toLowerCase();
registerAdminRoutes(app, {
  limitAuth, wrap, sendError, ownerEmail, isDb, User, memory,
  verifyToken, cookieToken, setSession, tokenFor, scryptSync, timingSafeEqual,
  Investigation, Evidence, Entity, Relationship, Watch, Alert, CyberAsset,
  CyberEvent, AdminAuditEvent, SearchMetric, PlatformConfig, Incident, JobRun,
  LinkCheck, id, readPlatformConfig, writePlatformConfig, getProviderCatalog,
  getUserProviderKeys, providerKeyNames, aiCredentialNames, validatePublicUrl,
  inspectPublicLink, assessSourceContext, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, runMonitoringCycle, createReportPdf,
  csvCell, crypto, auditAdmin, validatePublicUrlResolution,
});
registerAuthRoutes(app, {
  limitAuth, wrap, authSchema, sendError, ownerEmail, isDb, User, memory,
  id, setSession, tokenFor, requireAuth, Investigation, Evidence, Entity,
  Relationship, Watch, Alert, CyberAsset, CyberEvent,
});
app.use('/api/v1/investigations',requireAuth);
app.use('/api/v1/evidence',requireAuth);
registerInvestigationRoutes(app, {
  requireAuth, wrap, sendError, isDb, Investigation, Evidence, Entity,
  Relationship, User, Watch, Alert, CyberAsset, CyberEvent, memory, id,
  createInvestigationSchema, evidenceSchema, entitySchema, relationshipSchema,
  investigationGet, listFor, saveRecord, exists, analyzeEvidenceClaims,
  analyzeResearchGaps, diversifyPublicResults, getUserProviderKeys,
  isFreshRunningAgentRun, normalizeResultUrl, planAgentFollowUps,
  scrapePublicPage, searchAllPublic, validatePublicUrl, providerKeyNames,
  aiCredentialNames, getProviderCatalog, decryptProviderKeys, encryptProviderKeys,
  scryptSync, timingSafeEqual,
});
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
app.post('/api/v1/investigations/:id/search/save',requireAuth,wrap(async(req,res)=>{if(!await exists(req.params.id,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const p=z.object({title:z.string().min(1).max(240),url:z.string().url(),excerpt:z.string().max(5000).default(''),publisher:z.string().max(200).default('Wikipedia')}).safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Invalid search result.');let u;try{u=validatePublicUrl(p.data.url);}catch(e){return sendError(res,400,'UNSAFE_URL',e.message);}const data=await saveRecord(Evidence,'evidence',{id:id(),investigationId:req.params.id,...p.data,url:u.href,sourceType:'web',retrievedAt:new Date(),publishedAt:null,verificationStatus:'unverified',entities:[],captureTimestamp:'',contentHash:p.data.excerpt?crypto.createHash('sha256').update(p.data.excerpt).digest('hex'):'',createdAt:new Date(),updatedAt:new Date()});res.status(201).json({data});}));

app.post('/api/v1/investigations/:id/research',requireAuth,limitProvider,wrap(async(req,res)=>{
  const iid=req.params.id;
  const investigation=await investigationGet(iid,req.user.id);
  if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');
  const title=String(investigation.title||'').trim();
  const question=String(investigation.question||'').trim();
  const queries=[title,question,title+' '+question].map(x=>x.trim()).filter((x,i,a)=>x.length>=2&&a.indexOf(x)===i).slice(0,3);
  if(!queries.length)return sendError(res,400,'RESEARCH_QUERY_REQUIRED','Add a case title or research question before discovering sources.');
  const settled=await Promise.allSettled(queries.map(q=>searchAllPublic(q)));
  const available=settled.flatMap((item,index)=>item.status==='fulfilled'?(item.value.results||[]).map(result=>({...result,matchedQuery:queries[index]})):[]);
  if(!available.length)return sendError(res,502,'RESEARCH_UNAVAILABLE','Public search providers returned no results. Try again later.',{queries,providerFailures:settled.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||'provider unavailable'))});
  const seen=new Set();
  const unique=available.filter(item=>{try{const url=validatePublicUrl(item.url).href;const key=url.toLowerCase();if(seen.has(key))return false;seen.add(key);item.url=url;return true;}catch{return false;}}).slice(0,30);
  const existing=await listFor(Evidence,'evidence',iid);
  const existingUrls=new Set(existing.map(item=>String(item.url||'').toLowerCase()));
  const pending=unique.filter(item=>!existingUrls.has(item.url.toLowerCase()));
  const scrapeCandidates=pending.slice(0,12);
  const scraped=await Promise.all(scrapeCandidates.map(async item=>{
    try{return {item,page:await scrapePublicPage(item.url),error:''};}
    catch(error){return {item,page:null,error:String(error?.message||'Page retrieval unavailable').slice(0,240)};}
  }));
  const scrapeByUrl=new Map(scraped.map(result=>[result.item.url,result]));
  const saved=[];
  for(const item of pending){
    const retrieval=scrapeByUrl.get(item.url);
    const page=retrieval?.page;
    const excerpt=String(page?.excerpt||item.excerpt||'').slice(0,5000);
    const titleText=String(page?.title&&page.title!==new URL(item.url).hostname?page.title:item.title||'Untitled public source').slice(0,240);
    const publisher=String(item.publisher||item.provider||new URL(item.url).hostname).slice(0,200);
    const record={
      id:id(),investigationId:iid,title:titleText,url:item.url,
      sourceType:item.sourceType==='document'?'document':'web',
      publisher,retrievedAt:new Date(page?.retrievedAt||item.retrievedAt||Date.now()),
      publishedAt:item.publishedAt?new Date(item.publishedAt):null,
      excerpt,verificationStatus:'unverified',
      contentHash:excerpt?crypto.createHash('sha256').update(excerpt).digest('hex'):'',
      entities:[],captureTimestamp:'',createdAt:new Date(),updatedAt:new Date()
    };
    try{saved.push(await saveRecord(Evidence,'evidence',record));}catch(error){console.error('ADVERSE research save failed',String(error?.message||error));}
  }
  // Add source-provenance nodes and links for records this run actually saved.
  // This graph describes where a page came from, not whether its claims are true.
  let graphEntitiesAdded=0,graphRelationshipsAdded=0;
  try{
    const [knownEntities,knownRelationships]=await Promise.all([listFor(Entity,'entities',iid),listFor(Relationship,'relationships',iid)]);
    const entityByUrl=new Map(knownEntities.filter(x=>x.canonicalUrl).map(x=>[String(x.canonicalUrl).toLowerCase(),x]));
    const entityByNameType=new Map(knownEntities.map(x=>[(String(x.name||'').trim().toLowerCase()+'|'+x.type),x]));
    const relationshipKeys=new Set(knownRelationships.map(x=>[String(x.fromEntityId),String(x.toEntityId),x.type].join('|')));
    for(const source of saved){
      const evidenceId=String(source.id||source._id||'');
      if(!evidenceId||!source.url)continue;
      let parsed;try{parsed=new URL(source.url);}catch{continue;}
      const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
      const publisherName=String(source.publisher||host).trim().slice(0,200)||host;
      const docName=String(source.title||source.url).trim().slice(0,200)||source.url;
      let publisher=entityByUrl.get(('https://'+host).toLowerCase())||entityByNameType.get(publisherName.toLowerCase()+'|domain')||entityByNameType.get(publisherName.toLowerCase()+'|organization');
      if(!publisher){
        try{
          publisher=await saveRecord(Entity,'entities',{id:id(),investigationId:iid,name:publisherName,type:'domain',description:'Publisher/domain identified from a saved public source URL. This identifies the source host, not its trustworthiness.',canonicalUrl:'https://'+host,evidenceIds:[evidenceId],createdAt:new Date(),updatedAt:new Date()});
          entityByUrl.set(('https://'+host).toLowerCase(),publisher);entityByNameType.set(publisherName.toLowerCase()+'|domain',publisher);graphEntitiesAdded++;
        }catch(error){console.warn('ADVERSE research publisher graph save failed',String(error?.message||error));continue;}
      }
      let document=entityByUrl.get(source.url.toLowerCase())||entityByNameType.get(docName.toLowerCase()+'|document');
      if(!document){
        try{
          document=await saveRecord(Entity,'entities',{id:id(),investigationId:iid,name:docName,type:'document',description:'Public page discovered and saved by this research run. Review the original source before relying on its contents.',canonicalUrl:source.url,evidenceIds:[evidenceId],createdAt:new Date(),updatedAt:new Date()});
          entityByUrl.set(source.url.toLowerCase(),document);entityByNameType.set(docName.toLowerCase()+'|document',document);graphEntitiesAdded++;
        }catch(error){console.warn('ADVERSE research document graph save failed',String(error?.message||error));continue;}
      }
      const from=String(publisher.id||publisher._id||''),to=String(document.id||document._id||'');
      const relKey=[from,to,'publishes'].join('|');
      if(from&&to&&from!==to&&!relationshipKeys.has(relKey)){
        try{
          await saveRecord(Relationship,'relationships',{id:id(),investigationId:iid,fromEntityId:from,toEntityId:to,type:'publishes',evidenceIds:[evidenceId],confidence:'low',rationale:'Publisher/domain and page URL were observed in the same saved source record. This records source provenance only; it does not validate the page or its claims.',verificationStatus:'unverified',createdAt:new Date(),updatedAt:new Date()});
          relationshipKeys.add(relKey);graphRelationshipsAdded++;
        }catch(error){console.warn('ADVERSE research provenance link save failed',String(error?.message||error));}
      }
    }
  }catch(error){console.warn('ADVERSE research graph enrichment incomplete',String(error?.message||error));}
  const providers=[...new Set(available.map(item=>item.provider).filter(Boolean))];
  const failures=settled.filter(item=>item.status==='rejected').length;
  res.json({data:{
    investigationId:iid,queryCount:queries.length,queries,providers,
    discoveredCount:unique.length,alreadyStoredCount:unique.length-pending.length,
    savedCount:saved.length,graphEntitiesAdded,graphRelationshipsAdded,scrapeAttempted:scrapeCandidates.length,
    scrapedCount:scraped.filter(item=>item.page).length,
    scrapeFailures:scraped.filter(item=>item.error).map(item=>({url:item.item.url,reason:item.error})).slice(0,12),
    providerFailures:failures,results:saved.map(item=>({id:String(item.id||item._id),title:item.title,url:item.url,publisher:item.publisher,sourceType:item.sourceType,verificationStatus:item.verificationStatus})),
    retrievedAt:new Date().toISOString(),
    coverage:'Automated discovery across Wikipedia, Crossref, and OpenAlex. Up to 12 candidate pages are fetched as bounded public HTML/text; other saved records retain provider-provided snippets or abstracts. This is not exhaustive whole-web crawling.',
    limitations:[
      'Every new record is marked unverified. Retrieval is not proof that a claim is true.',
      'Only publicly reachable HTML/text pages are retrieved; redirects, private-network destinations, unsupported content types, and pages over 1 MB are skipped.',
      'Provider coverage varies. Search results are not exhaustive, and sites may block automated requests or impose access restrictions.',
      'Review original pages, publication dates, provenance, and contradictory evidence before drawing conclusions.'
    ]
  }});
}));

app.get('/api/v1/organizations/search',limitProvider,wrap(async(req,res)=>{const q=String(req.query.q||'').slice(0,200);try{const data=await searchOrganizations(q);res.json({data,meta:{provider:'OpenCorporates API',query:q,retrievedAt:new Date().toISOString(),coverage:'Provider coverage and licensing restrictions apply.'}});}catch(e){sendError(res,process.env.OPENCORPORATES_API_TOKEN?502:503,'ORGANIZATION_PROVIDER_UNAVAILABLE','Organization records are unavailable.',{reason:e.message});}}));
app.get('/api/v1/archives',limitProvider,wrap(async(req,res)=>{const url=String(req.query.url||'');try{res.json({data:await waybackCaptures(url)});}catch(e){sendError(res,502,'ARCHIVE_UNAVAILABLE','Historical captures could not be retrieved.',{reason:e.message});}}));
app.get('/api/v1/archives/compare',limitProvider,wrap(async(req,res)=>{const url=String(req.query.url||'');const from=String(req.query.from||'');const to=String(req.query.to||'');try{const target=validatePublicUrl(url);if(!/^\\d{14}$/.test(from)||!/^\\d{14}$/.test(to))return sendError(res,400,'INVALID_CAPTURE_TIME','Capture timestamps must be 14 digits (YYYYMMDDhhmmss).');const get=async(ts)=>{const snapshot=new URL('https://web.archive.org/web/'+ts+'id_/'+target.href);const r=await fetch(snapshot,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'user-agent':'ADVERSE-Research/0.1'}});if(r.status>=300&&r.status<400)throw new Error('Archive returned a redirect. Open the capture directly in the archive; this comparison does not follow redirects.');if(!r.ok)throw new Error('Archive snapshot returned HTTP '+r.status);const type=r.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('text/plain'))throw new Error('Snapshot is not a text document.');const reader=r.body.getReader();let bytes=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000){await reader.cancel();throw new Error('Snapshot exceeds the 1 MB comparison limit.');}chunks.push(value);}return new TextDecoder().decode(Buffer.concat(chunks));};const [before,after]=await Promise.all([get(from),get(to)]);res.json({data:await compareArchivedText(before,after),meta:{url:target.href,from,to,provider:'Internet Archive Wayback Machine',retrievedAt:new Date().toISOString()}});}catch(e){sendError(res,502,'ARCHIVE_COMPARE_FAILED','Could not compare the requested archived captures.',{reason:e.message});}}));
app.get('/api/v1/domains',limitProvider,wrap(async(req,res)=>{const url=String(req.query.url||'');try{res.json({data:await publicDns(url)});}catch(e){sendError(res,400,'DOMAIN_LOOKUP_FAILED','Public DNS lookup failed.',{reason:e.message});}}));
app.get('/api/v1/investigations/:id/timeline',requireAuth,wrap(async(req,res)=>{if(!await exists(req.params.id,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const evidence=await listFor(Evidence,'evidence',req.params.id);const events=evidence.map(e=>({id:e.id||String(e._id),title:e.title,url:e.url,eventTime:null,publicationTime:e.publishedAt||null,retrievalTime:e.retrievedAt||e.createdAt,captureTime:e.captureTimestamp||null,verificationStatus:e.verificationStatus})).sort((a,b)=>new Date(a.publicationTime||a.captureTime||a.retrievalTime||0)-new Date(b.publicationTime||b.captureTime||b.retrievalTime||0));res.json({data:events,meta:{note:'Event, publication, retrieval and archive-capture times are distinct; no event date is inferred.'}});}));
app.get('/api/v1/investigations/:id/history/graph',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const raw=String(req.query.asOf||'');const asOf=raw?new Date(raw):new Date();if(!Number.isFinite(asOf.getTime()))return sendError(res,400,'INVALID_DATE','Provide a valid asOf date.');const [allEvidence,allEntities,allRelationships]=await Promise.all([listFor(Evidence,'evidence',iid),listFor(Entity,'entities',iid),listFor(Relationship,'relationships',iid)]);const knownAt=e=>{const t=e.retrievedAt||e.createdAt;return t&&new Date(t)<=asOf;};const evidence=allEvidence.filter(knownAt);const evidenceIds=new Set(evidence.map(e=>String(e.id||e._id)));const entities=allEntities.filter(e=>{const created=e.createdAt?new Date(e.createdAt):null;if(created&&created>asOf)return false;return !(e.evidenceIds||[]).length||(e.evidenceIds||[]).some(id=>evidenceIds.has(String(id)));});const entityIds=new Set(entities.map(e=>String(e.id||e._id)));const relationships=allRelationships.filter(r=>entityIds.has(String(r.fromEntityId))&&entityIds.has(String(r.toEntityId))&&(r.evidenceIds||[]).some(id=>evidenceIds.has(String(id))));res.json({data:{asOf:asOf.toISOString(),evidence,entities,relationships},meta:{mode:'known-by-date reconstruction',note:'This view shows records retrievable by the selected date, not proof that a relationship or event objectively existed at that time. Evidence retrieval dates are used; unknown dates are excluded.'}}); }));
app.get('/api/v1/investigations/:id/export',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;const investigation=await investigationGet(iid,req.user.id);if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');const [evidence,entities,relationships]=await Promise.all([listFor(Evidence,'evidence',iid),listFor(Entity,'entities',iid),listFor(Relationship,'relationships',iid)]);const report={product:'ADVERSE',generatedAt:new Date().toISOString(),investigation,summary:{evidenceCount:evidence.length,entityCount:entities.length,relationshipCount:relationships.length},findings:[],evidence,entities,relationships,limitations:['This export includes stored records only. It does not imply independent verification.','Source dates and retrieval dates are preserved separately.']};const format=String(req.query.format||'json');if(format==='pdf'){const pdf=createReportPdf(report);res.type('application/pdf').attachment('adverse-investigation-report.pdf');return res.send(pdf);}if(format==='csv'){res.type('text/csv').attachment('adverse-evidence.csv');const rows=[['title','url','sourceType','publisher','publishedAt','retrievedAt','verificationStatus','excerpt'],...evidence.map(e=>[e.title,e.url,e.sourceType,e.publisher,e.publishedAt||'',e.retrievedAt||'',e.verificationStatus,e.excerpt])];return res.send(rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));}res.type('application/json').attachment('adverse-investigation.json').send(JSON.stringify(report,null,2));}));


const cyberAssetSchema=z.object({url:z.string().url().max(2048),label:z.string().trim().max(160).default(''),intervalHours:z.union([z.literal(1),z.literal(6),z.literal(12),z.literal(24)]).default(6)});
async function runCyberAssetCheck(asset) {
 const now=new Date(),nextCheckAt=new Date(now.getTime()+Number(asset.intervalHours||6)*3600000),db=isDb();
 const assetId=String(asset.id||asset._id);
 const saveAsset=async update=>db?CyberAsset.findByIdAndUpdate(asset._id,{$set:update},{new:true}).lean():Object.assign(memory.cyberAssets.get(assetId),update);
 const recordEvent=async event=>db?CyberEvent.create(event).then(x=>x.toObject()):(()=>{const x={id:id(),...event,createdAt:now,updatedAt:now};memory.cyberEvents.set(x.id,x);return x;})();
 try{
  const parsed=validatePublicUrl(asset.url);
  const [dns,page]=await Promise.all([publicDns(parsed.href),scrapePublicPage(parsed.href)]);
  const stableRecords=Object.fromEntries(Object.entries(dns.records||{}).map(([type,records])=>[type,(records||[]).map(x=>({type:x.type,data:x.data})).sort((a,b)=>(String(a.type)+'|'+String(a.data)).localeCompare(String(b.type)+'|'+String(b.data)))]));
  const dnsFingerprint=crypto.createHash('sha256').update(JSON.stringify(stableRecords)).digest('hex');
  const stableCertificates=(dns.certificateTransparency?.records||[]).map(x=>({id:x.id,names:[...(x.names||[])].sort(),notAfter:x.notAfter,issuer:x.issuer})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const certificateFingerprint=crypto.createHash('sha256').update(JSON.stringify(stableCertificates)).digest('hex');
  const previousHash=String(asset.lastSnapshotHash||''),previousDns=String(asset.lastDnsFingerprint||''),previousCert=String(asset.lastCertificateFingerprint||''),previousStatus=asset.lastHttpStatus==null?null:Number(asset.lastHttpStatus),currentStatus=Number(page.httpStatus||200);
  const events=[];
  if(!previousHash&&!previousDns)events.push({type:'baseline',severity:'info',title:'Initial baseline recorded',message:'Initial public page snapshot, DNS records, and available certificate-transparency observations were recorded. This baseline is not a security verdict.',details:{httpStatus:currentStatus,contentHash:page.contentHash,dnsFingerprint,certificateFingerprint}});
  else{
   if(previousStatus!==null&&previousStatus!==currentStatus)events.push({type:'availability',severity:currentStatus>=400?'medium':'low',title:'HTTP status changed',message:'Observed HTTP response changed from '+previousStatus+' to '+currentStatus+'. Recheck before interpreting this as an outage or incident.',details:{before:previousStatus,after:currentStatus}});
   if(previousHash&&previousHash!==page.contentHash)events.push({type:'content-change',severity:'medium',title:'Public page content changed',message:'The fetched response hash changed. This does not establish whether the change is malicious or meaningful.',details:{before:previousHash,after:page.contentHash}});
   if(previousDns&&previousDns!==dnsFingerprint)events.push({type:'dns-change',severity:'medium',title:'Public DNS records changed',message:'The observed DNS record set changed. DNS changes do not establish ownership, intent, or compromise.',details:{before:previousDns,after:dnsFingerprint,records:dns.records}});
   if(previousCert&&previousCert!==certificateFingerprint)events.push({type:'certificate-observation',severity:'low',title:'Certificate Transparency observations changed',message:'The public certificate-log result set changed. New log entries do not prove misuse or a current TLS failure.',details:{before:previousCert,after:certificateFingerprint}});
  }
  for(const event of events)await recordEvent({investigationId:asset.investigationId,assetId,url:parsed.href,observedAt:now,...event});
  const updated=await saveAsset({url:parsed.href,hostname:parsed.hostname,lastCheckedAt:now,nextCheckAt,lastSnapshotHash:page.contentHash||'',lastDnsFingerprint:dnsFingerprint,lastCertificateFingerprint:certificateFingerprint,lastHttpStatus:currentStatus,lastError:''});
  return {asset:updated,observation:{checkedAt:now.toISOString(),url:parsed.href,hostname:parsed.hostname,httpStatus:currentStatus,title:page.title,contentHash:page.contentHash,dns,capturedMethod:page.method,events,notice:'Public observations only; not packet capture, endpoint surveillance, or proof of compromise.'}};
 }catch(error){
  const message=String(error?.message||'Monitoring check failed').slice(0,500);
  await saveAsset({lastCheckedAt:now,nextCheckAt,lastError:message});
  const event=await recordEvent({investigationId:asset.investigationId,assetId,url:asset.url,observedAt:now,type:'check-failed',severity:'low',title:'Check could not be completed',message:'The public monitoring check failed: '+message+'. A failed check is not proof of an incident.'});
  return {asset:{...asset,lastCheckedAt:now,nextCheckAt,lastError:message},observation:{checkedAt:now.toISOString(),url:asset.url,error:message,events:[event],notice:'Check failure is not proof of an incident.'}};
 }
}

const watchSchema=z.object({url:z.string().url().max(2048),label:z.string().trim().max(160).default(''),intervalHours:z.union([z.literal(6),z.literal(12),z.literal(24)]).default(24)});
app.get('/api/v1/investigations/:id/monitoring',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const watches=await listFor(Watch,'watches',iid);const alerts=isDb()?await Alert.find({investigationId:iid}).sort({observedAt:-1}).limit(50).lean():[...memory.alerts.values()].filter(x=>x.investigationId===iid).sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt)).slice(0,50);res.json({data:{watches:watches.map(x=>({...x,id:String(x.id||x._id)})),alerts:alerts.map(x=>({...x,id:String(x.id||x._id)})),meta:{scheduler:isDb()?'database-backed process worker':'monitoring requires MongoDB in production',scope:'Internet Archive CDX capture checks only; this is not a live-page change detector.'}}});}));
app.post('/api/v1/investigations/:id/monitoring',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const p=watchSchema.safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Provide a public URL and an interval of 6, 12 or 24 hours.',p.error.flatten());let url;try{url=validatePublicUrl(p.data.url).href;}catch(e){return sendError(res,400,'UNSAFE_URL',e.message);}const existing=await listFor(Watch,'watches',iid);if(existing.length>=20)return sendError(res,409,'WATCH_LIMIT','An investigation can have at most 20 monitoring rules.');if(existing.some(x=>x.url===url&&x.enabled))return sendError(res,409,'WATCH_EXISTS','This URL is already being monitored.');const record={id:id(),investigationId:iid,url,label:p.data.label||new URL(url).hostname,intervalHours:p.data.intervalHours,enabled:true,lastCaptureTimestamp:'',lastCheckedAt:null,nextCheckAt:new Date(),lastError:'',createdAt:new Date(),updatedAt:new Date()};const data=await saveRecord(Watch,'watches',record);res.status(201).json({data:{...data,id:String(data.id||data._id)},meta:{scheduler:'Checks run when the API worker is awake; free hosting may sleep.'}});}));
app.post('/api/v1/monitoring/:id/check',requireAuth,wrap(async(req,res)=>{if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Archive checks require the production database.');const watch=await Watch.findById(req.params.id).lean();if(!watch||!await exists(watch.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Monitoring rule not found.');if(!watch.enabled)return sendError(res,409,'WATCH_DISABLED','Enable this monitoring rule before checking it.');await Watch.updateOne({_id:watch._id},{$set:{nextCheckAt:new Date()}});const result=await runMonitoringCycle({watchId:String(watch._id)});res.status(result.skipped?202:200).json({data:{...result,message:result.skipped?'A monitoring cycle is already running; this rule is queued for the next cycle.':'Archive check completed. Review the alert list and email delivery status.'}});}));
app.delete('/api/v1/monitoring/:id',requireAuth,wrap(async(req,res)=>{const watch=isDb()?await Watch.findById(req.params.id).lean():memory.watches.get(req.params.id);if(!watch||!await exists(watch.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Monitoring rule not found.');if(isDb()){await Watch.deleteOne({_id:req.params.id});await Alert.deleteMany({watchId:req.params.id});}else{memory.watches.delete(req.params.id);for(const [k,v] of memory.alerts)if(v.watchId===req.params.id)memory.alerts.delete(k);}res.status(204).end();}));
app.post('/api/v1/alerts/:id/acknowledge',requireAuth,wrap(async(req,res)=>{const alert=isDb()?await Alert.findById(req.params.id).lean():memory.alerts.get(req.params.id);if(!alert||!await exists(alert.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Alert not found.');const acknowledgedAt=new Date();if(isDb())await Alert.updateOne({_id:req.params.id},{$set:{acknowledgedAt}});else memory.alerts.set(req.params.id,{...alert,acknowledgedAt});res.json({data:{id:req.params.id,acknowledgedAt}});}));
app.delete('/api/v1/alerts/:id',requireAuth,wrap(async(req,res)=>{const alert=isDb()?await Alert.findById(req.params.id).lean():memory.alerts.get(req.params.id);if(!alert||!await exists(alert.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Alert not found.');if(isDb())await Alert.deleteOne({_id:req.params.id,investigationId:alert.investigationId});else memory.alerts.delete(req.params.id);res.status(204).end();}));


app.get('/api/v1/investigations/:id/cyber-assets',requireAuth,wrap(async(req,res)=>{
 const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');
 let assets=isDb()?await CyberAsset.find({investigationId:iid}).sort({createdAt:-1}).lean():[...memory.cyberAssets.values()].filter(x=>x.investigationId===iid);
 assets=await Promise.all(assets.map(async asset=>{if(asset.verificationToken)return asset;const token=crypto.randomBytes(18).toString('hex');const update={verificationToken:token,verificationStatus:'pending',enabled:false};if(isDb())return await CyberAsset.findByIdAndUpdate(asset._id,{$set:update},{new:true}).lean();Object.assign(asset,update);return asset;}));
 const events=isDb()?await CyberEvent.find({investigationId:iid}).sort({observedAt:-1}).limit(100).lean():[...memory.cyberEvents.values()].filter(x=>x.investigationId===iid).sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt)).slice(0,100);
 res.json({data:{assets:assets.map(x=>({...x,id:String(x.id||x._id)})),events:events.map(x=>({...x,id:String(x.id||x._id)})),meta:{scope:'Only explicitly authorized public HTTP(S) assets. Checks use public DNS, bounded page retrieval, and Certificate Transparency records; no packet capture or private-device monitoring.',persistence:isDb()?'mongodb':'ephemeral-memory',scheduler:'Recurring checks require a protected external scheduler configured with CYBER_MONITORING_CRON_SECRET; GitHub Actions is supported.'}}});
}));
app.post('/api/v1/investigations/:id/cyber-assets',requireAuth,wrap(async(req,res)=>{
 const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');
 const p=cyberAssetSchema.safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Enter a valid public website and choose a check interval.',p.error.flatten());
 let parsed;try{parsed=validatePublicUrl(p.data.url);}catch(e){return sendError(res,400,'UNSAFE_URL','Only public HTTP(S) targets can be monitored.',{reason:e.message});}
 const existing=isDb()?await CyberAsset.countDocuments({investigationId:iid}):[...memory.cyberAssets.values()].filter(x=>x.investigationId===iid).length;
 if(existing>=25)return sendError(res,409,'ASSET_LIMIT','An investigation can monitor up to 25 authorized assets.');
 const record={id:id(),investigationId:iid,url:parsed.href,hostname:parsed.hostname,label:p.data.label||parsed.hostname,authorizedByUser:false,verificationToken:crypto.randomBytes(18).toString('hex'),verificationStatus:'pending',verifiedAt:null,intervalHours:p.data.intervalHours,enabled:false,lastCheckedAt:null,nextCheckAt:new Date(),lastSnapshotHash:'',lastDnsFingerprint:'',lastCertificateFingerprint:'',lastHttpStatus:null,lastError:'',createdAt:new Date(),updatedAt:new Date()};
 let saved;if(isDb()){const doc=await CyberAsset.create(record);saved={...doc.toObject(),id:String(doc._id)};}else{memory.cyberAssets.set(record.id,record);saved=record;}
 res.status(201).json({data:saved,meta:{notice:'Website added. Verify control of its domain before monitoring can begin.'}});
}));
app.post('/api/v1/cyber-assets/:id/verify-domain',requireAuth,wrap(async(req,res)=>{
 const asset=isDb()?await CyberAsset.findById(req.params.id).lean():memory.cyberAssets.get(req.params.id);
 if(!asset||!await exists(asset.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Website not found.');
 if(asset.verificationStatus==='verified')return res.json({data:{id:String(asset.id||asset._id),verificationStatus:'verified',verifiedAt:asset.verifiedAt||null,message:'Domain control is already verified.'}});
 const hostname=String(asset.hostname||new URL(asset.url).hostname).replace(/^www\./i,'');
 const recordName='_adverse-verification.'+hostname;
 let records=[];try{records=await dns.resolveTxt(recordName);}catch(error){return sendError(res,400,'DOMAIN_NOT_VERIFIED','We could not find the verification record yet. Check the record name and try again after DNS updates.',{recordName,reason:String(error.code||'DNS_LOOKUP_FAILED')});}
 const expected='adverse-verification='+String(asset.verificationToken||'');
 if(!records.some(parts=>parts.join('').trim()===expected))return sendError(res,400,'DOMAIN_NOT_VERIFIED','The TXT record was found, but its value does not match. Copy the value shown below exactly.',{recordName});
 const update={verificationStatus:'verified',verifiedAt:new Date(),enabled:true,authorizedByUser:true,nextCheckAt:new Date()};
 let saved;if(isDb())saved=await CyberAsset.findByIdAndUpdate(asset._id,{$set:update},{new:true}).lean();else{Object.assign(asset,update);saved=asset;}
 res.json({data:{id:String(saved.id||saved._id),verificationStatus:'verified',verifiedAt:saved.verifiedAt,message:'Domain control verified. Website checks are now enabled. This confirms DNS control, not legal ownership or permission on behalf of another person.'}});
}));
app.post('/api/v1/cyber-assets/:id/verify-http',requireAuth,wrap(async(req,res)=>{
 const asset=isDb()?await CyberAsset.findById(req.params.id).lean():memory.cyberAssets.get(req.params.id);
 if(!asset||!await exists(asset.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Website not found.');
 if(asset.verificationStatus==='verified')return res.json({data:{verificationStatus:'verified',verifiedAt:asset.verifiedAt||null,message:'Domain control is already verified.'}});
 let target;try{target=await validatePublicUrlResolution('https://'+String(asset.hostname||new URL(asset.url).hostname)+'/adverse-verify.txt');}catch(error){return sendError(res,400,'UNSAFE_URL','Could not safely check this website. Make sure it uses a public domain and try again.');}
 let response;try{response=await fetch(target.href,{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{'user-agent':'ADVERSE-Domain-Verification/1.0','accept':'text/plain'}});}catch(error){return sendError(res,400,'HTTP_VERIFICATION_NOT_FOUND','We could not reach the verification file yet. Upload it to the exact path shown in ADVERSE and try again.');}
 if(!response.ok||response.status>=300)return sendError(res,400,'HTTP_VERIFICATION_NOT_FOUND','The verification file was not found at the expected path. Make sure it is deployed and publicly accessible.');
 const contentType=String(response.headers.get('content-type')||'').toLowerCase();
 if(contentType && !contentType.includes('text/plain') && !contentType.includes('text/'))return sendError(res,400,'HTTP_VERIFICATION_INVALID_TYPE','The verification file must be served as plain text.');
 const reader=response.body?.getReader();if(!reader)return sendError(res,400,'HTTP_VERIFICATION_NOT_FOUND','The verification file returned no readable content.');
 let total=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>256){await reader.cancel();return sendError(res,400,'HTTP_VERIFICATION_TOO_LARGE','The verification file must contain only the short code shown in ADVERSE.');}chunks.push(Buffer.from(value));}}catch(error){return sendError(res,400,'HTTP_VERIFICATION_NOT_FOUND','The verification file could not be read completely. Please try again.');
 }
 const body=Buffer.concat(chunks).toString('utf8').trim();
 if(body!=='adverse-verification='+String(asset.verificationToken||''))return sendError(res,400,'HTTP_VERIFICATION_MISMATCH','The file is reachable, but its content does not match the code shown in ADVERSE.');
 const update={verificationStatus:'verified',verifiedAt:new Date(),enabled:true,authorizedByUser:true,nextCheckAt:new Date()};
 let saved;if(isDb())saved=await CyberAsset.findByIdAndUpdate(asset._id,{$set:update},{new:true}).lean();else{Object.assign(asset,update);saved=asset;}
 res.json({data:{id:String(saved.id||saved._id),verificationStatus:'verified',verifiedAt:saved.verifiedAt,message:'Website control verified. Checks are now enabled. This confirms the ability to publish the verification file, not legal ownership or permission on behalf of another person.'}});
}));
app.post('/api/v1/cyber-assets/:id/check',requireAuth,limitProvider,wrap(async(req,res)=>{
 const asset=isDb()?await CyberAsset.findById(req.params.id).lean():memory.cyberAssets.get(req.params.id);
 if(!asset||!await exists(asset.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Website not found.');
 if(asset.verificationStatus!=='verified')return sendError(res,403,'DOMAIN_VERIFICATION_REQUIRED','Verify control of this domain before running checks.');
 res.json({data:await runCyberAssetCheck(asset)});
}));
app.delete('/api/v1/cyber-assets/:id',requireAuth,wrap(async(req,res)=>{
 const asset=isDb()?await CyberAsset.findById(req.params.id).lean():memory.cyberAssets.get(req.params.id);
 if(!asset||!await exists(asset.investigationId,req.user.id))return sendError(res,404,'NOT_FOUND','Authorized monitoring asset not found.');
 if(isDb()){await CyberAsset.deleteOne({_id:req.params.id});await CyberEvent.deleteMany({assetId:req.params.id});}else{memory.cyberAssets.delete(req.params.id);for(const [k,v] of memory.cyberEvents)if(v.assetId===req.params.id)memory.cyberEvents.delete(k);}
 res.status(204).end();
}));
app.post('/api/v1/internal/cyber-monitoring/run',wrap(async(req,res)=>{
 const expected=String(process.env.CYBER_MONITORING_CRON_SECRET||''),supplied=String(req.get('x-cyber-monitoring-secret')||'');
 if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Cyber-monitoring scheduler authentication is required.');
 const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Cyber-monitoring scheduler authentication failed.');
 if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled cyber monitoring requires MongoDB persistence.');
 const started=Date.now();const job=await JobRun.create({name:'scheduled-cyber-monitoring-cycle',status:'running',startedAt:new Date()});
 const now=new Date();
 const [enabledAssets,dueCount,due]=await Promise.all([
  CyberAsset.countDocuments({enabled:true}),
  CyberAsset.countDocuments({enabled:true,nextCheckAt:{$lte:now}}),
  CyberAsset.find({enabled:true,nextCheckAt:{$lte:now}}).sort({nextCheckAt:1}).limit(10).lean()
 ]);
 const results=[];
 for(const asset of due)results.push(await runCyberAssetCheck(asset));
 job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Cyber-monitoring cycle completed.';job.metadata={checked:results.length,enabledAssets,dueAssets:dueCount};await job.save();
 res.json({data:{checked:results.length,enabledAssets,dueAssets:dueCount,results:results.map(x=>({assetId:String(x.asset?.id||x.asset?._id||''),events:x.observation?.events?.length||0,error:x.observation?.error||''}))},job:{id:String(job._id),status:job.status,durationMs:job.durationMs}});
}));

app.use((req,res)=>sendError(res,404,'NOT_FOUND',`No route for ${req.method} ${req.path}`));
app.use((err,_req,res,_next)=>{console.error('Request failed:',err?.message||'unknown error');res.status(500).json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed.'}});});
