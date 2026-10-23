import crypto from 'node:crypto';
import { z } from 'zod';
import { runResearchPipeline } from '../services/research/research-pipeline.js';

export function registerResearchRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, isDb, Investigation, Evidence,
  Entity, Relationship, User, memory, id, exists, investigationGet, listFor,
  saveRecord, scrapePublicPage, searchAllPublic, validatePublicUrl,
  rankPublicResults, diversifyPublicResults, normalizeResultUrl,
  analyzeEvidenceClaims, analyzeResearchGaps, planAgentFollowUps,
  isFreshRunningAgentRun, getUserProviderKeys, getProviderCatalog,
  providerKeyNames, aiCredentialNames, encryptProviderKeys, decryptProviderKeys,
}) {
  app.post('/api/v1/investigations/:id/search/save',requireAuth,wrap(async(req,res)=>{if(!await exists(req.params.id,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const p=z.object({title:z.string().min(1).max(240),url:z.string().url(),excerpt:z.string().max(5000).default(''),publisher:z.string().max(200).default('Wikipedia')}).safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Invalid search result.');let u;try{u=validatePublicUrl(p.data.url);}catch(e){return sendError(res,400,'UNSAFE_URL',e.message);}const data=await saveRecord(Evidence,'evidence',{id:id(),investigationId:req.params.id,...p.data,url:u.href,sourceType:'web',retrievedAt:new Date(),publishedAt:null,verificationStatus:'unverified',entities:[],captureTimestamp:'',contentHash:p.data.excerpt?crypto.createHash('sha256').update(p.data.excerpt).digest('hex'):'',createdAt:new Date(),updatedAt:new Date()});res.status(201).json({data});}));
  
  app.post('/api/v1/investigations/:id/research',requireAuth,limitProvider,wrap(async(req,res)=>{
    const iid=req.params.id;
    const investigation=await investigationGet(iid,req.user.id);
    if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');
    const title=String(investigation.title||'').trim();
    const question=String(investigation.question||'').trim();
    const queries=[title,question,title+' '+question].map(x=>x.trim()).filter((x,i,a)=>x.length>=2&&a.indexOf(x)===i).slice(0,3);
    if(!queries.length)return sendError(res,400,'RESEARCH_QUERY_REQUIRED','Add a case title or research question before discovering sources.');
    const result = await runResearchPipeline({
      investigationId: iid,
      queries,
      Evidence,
      Entity,
      Relationship,
      id,
      listFor,
      saveRecord,
      scrapePublicPage,
      searchAllPublic,
      validatePublicUrl,
    });
    if (result.failure === 'RESEARCH_UNAVAILABLE') {
      return sendError(
        res,
        502,
        'RESEARCH_UNAVAILABLE',
        'Public search providers returned no results. Try again later.',
        result.details
      );
    }
    res.json({ data: result });
  }));
  
}
