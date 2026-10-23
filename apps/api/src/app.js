import express from 'express';
import { createHealthRouter } from './routes/health.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { registerInvestigationRoutes } from './routes/investigations.routes.js';
import { registerPublicSearchRoutes } from './routes/public-search.routes.js';
import { registerSearchRoutes } from './routes/search.routes.js';
import { registerResearchRoutes } from './routes/research.routes.js';
import { registerUtilityRoutes } from './routes/utility.routes.js';
import { registerMonitoringRoutes } from './routes/monitoring.routes.js';
import { registerCyberRoutes } from './routes/cyber.routes.js';
import { registerInternalRoutes } from './routes/internal.routes.js';
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
app.use(express.json({ limit:'512kb' }));
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
registerInternalRoutes(app, {
  wrap, sendError, isDb, JobRun, runDiscoveryCycle, runMonitoringCycle,
  timingSafeEqual, CyberAsset, runCyberAssetCheck,
});

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
registerPublicSearchRoutes(app, {
  limitProvider, wrap, sendError, validatePublicUrl, inspectPublicLink,
  assessSourceContext, titleSimilarity, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, searchImages, searchVideos,
  searchPeople, scrapePublicPage, getUserProviderKeys, optionalAuth,
});
registerSearchRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, isDb, User, memory,
  getUserProviderKeys, getProviderCatalog, encryptProviderKeys, decryptProviderKeys,
  providerKeyNames, aiCredentialNames, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, validatePublicUrl, scrapePublicPage,
  inspectPublicLink, assessSourceContext, titleSimilarity,
});
registerResearchRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, isDb, Investigation, Evidence,
  Entity, Relationship, User, memory, id, exists, investigationGet, listFor,
  saveRecord, scrapePublicPage, searchAllPublic, validatePublicUrl,
  rankPublicResults, diversifyPublicResults, normalizeResultUrl,
  analyzeEvidenceClaims, analyzeResearchGaps, planAgentFollowUps,
  isFreshRunningAgentRun, getUserProviderKeys, getProviderCatalog,
  providerKeyNames, aiCredentialNames, encryptProviderKeys, decryptProviderKeys,
});
registerUtilityRoutes(app, {
  limitProvider, wrap, sendError, searchOrganizations, waybackCaptures,
  validatePublicUrl, compareArchivedText, publicDns, requireAuth, exists,
  Evidence, investigationGet, listFor, isDb, Investigation, Entity, Relationship,
  createReportPdf, csvCell, memory,
});
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
registerMonitoringRoutes(app, {
  requireAuth, wrap, sendError, exists, isDb, listFor, saveRecord, id,
  Watch, Alert, memory, watchSchema, validatePublicUrl, runMonitoringCycle,
});
registerCyberRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, exists, isDb, memory, id,
  CyberAsset, CyberEvent, cyberAssetSchema, validatePublicUrl,
  validatePublicUrlResolution, runCyberAssetCheck, crypto,
});
app.use((req,res)=>sendError(res,404,'NOT_FOUND',`No route for ${req.method} ${req.path}`));
app.use((err,_req,res,_next)=>{console.error('Request failed:',err?.message||'unknown error');res.status(500).json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed.'}});});
