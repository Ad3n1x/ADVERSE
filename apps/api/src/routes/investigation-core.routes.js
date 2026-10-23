import crypto from 'node:crypto';
import { z } from 'zod';

export function registerInvestigationCoreRoutes(app, deps) {
  const {
    requireAuth, wrap, sendError, isDb, Investigation, Evidence, Entity,
    Relationship, User, Watch, Alert, CyberAsset, CyberEvent, memory, id,
    createInvestigationSchema, evidenceSchema, entitySchema, relationshipSchema,
    investigationGet, listFor, saveRecord, exists, analyzeEvidenceClaims,
    analyzeResearchGaps, diversifyPublicResults, getUserProviderKeys,
    isFreshRunningAgentRun, normalizeResultUrl, planAgentFollowUps,
    scrapePublicPage, searchAllPublic, validatePublicUrl, providerKeyNames,
    aiCredentialNames, getProviderCatalog, decryptProviderKeys, encryptProviderKeys,
    scryptSync, timingSafeEqual,
  } = deps;
  app.get('/api/v1/investigations',requireAuth,wrap(async(req,res)=>{const rows=isDb()?await Investigation.find({ownerId:req.user.id}).sort({updatedAt:-1}).lean():[...memory.investigations.values()].filter(x=>x.ownerId===req.user.id);const data=rows.map(x=>({...x,id:String(x.id||x._id)}));res.json({data,meta:{persistence:isDb()?'mongodb':'ephemeral-memory',count:data.length}});}));
  app.post('/api/v1/investigations',requireAuth,wrap(async(req,res)=>{const p=createInvestigationSchema.safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Provide a title of 1–120 characters.',p.error.flatten());const record={_id:id(),id:'',...p.data,status:'active',notes:'',ownerId:req.user.id,createdAt:new Date(),updatedAt:new Date()};record.id=record._id;if(isDb()){const doc=await Investigation.create({...p.data,ownerId:req.user.id});return res.status(201).json({data:{...doc.toObject(),id:String(doc._id)},meta:{persistence:'mongodb'}});}memory.investigations.set(record.id,record);res.status(201).json({data:record,meta:{persistence:'ephemeral-memory'}});}));
  app.get('/api/v1/investigations/:id',requireAuth,wrap(async(req,res)=>{const data=await investigationGet(req.params.id,req.user.id);if(!data)return sendError(res,404,'NOT_FOUND','Investigation not found.');res.json({data:{...data,id:String(data.id||data._id)}});}));
  app.patch('/api/v1/investigations/:id',requireAuth,wrap(async(req,res)=>{if(!await exists(req.params.id,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const p=z.object({title:z.string().trim().min(1).max(120).optional(),question:z.string().max(1000).optional(),notes:z.string().max(10000).optional(),status:z.enum(['active','paused','archived']).optional()}).strict().safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Invalid investigation update.',p.error.flatten());const data=isDb()?await Investigation.findOneAndUpdate({_id:req.params.id,ownerId:req.user.id},{$set:p.data},{new:true,runValidators:true}).lean():Object.assign(memory.investigations.get(req.params.id),p.data,{updatedAt:new Date().toISOString()});res.json({data});}));
  app.delete('/api/v1/investigations/:id',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');if(isDb()){await Promise.all([Investigation.deleteOne({_id:iid,ownerId:req.user.id}),Evidence.deleteMany({investigationId:iid}),Entity.deleteMany({investigationId:iid}),Relationship.deleteMany({investigationId:iid}),Watch.deleteMany({investigationId:iid}),Alert.deleteMany({investigationId:iid}),CyberAsset.deleteMany({investigationId:iid}),CyberEvent.deleteMany({investigationId:iid})]);}else{memory.investigations.delete(iid);for(const c of ['evidence','entities','relationships','watches','alerts','cyberAssets','cyberEvents'])for(const [k,v] of memory[c])if(v.investigationId===iid)memory[c].delete(k);}res.status(204).end();}));
  app.delete('/api/v1/investigations',requireAuth,wrap(async(req,res)=>{const uid=String(req.user.id);if(isDb()){const owned=await Investigation.find({ownerId:uid}).select('_id').lean();const ids=owned.map(item=>String(item._id));if(ids.length){await Promise.all([Investigation.deleteMany({ownerId:uid}),Evidence.deleteMany({investigationId:{$in:ids}}),Entity.deleteMany({investigationId:{$in:ids}}),Relationship.deleteMany({investigationId:{$in:ids}}),Watch.deleteMany({investigationId:{$in:ids}}),Alert.deleteMany({investigationId:{$in:ids}}),CyberAsset.deleteMany({investigationId:{$in:ids}}),CyberEvent.deleteMany({investigationId:{$in:ids}})]);}return res.json({data:{deletedCount:ids.length},message:'All investigations and their dependent records were deleted.'});}const owned=[...memory.investigations.entries()].filter(([,item])=>String(item.ownerId)===uid);const ids=new Set(owned.map(([iid])=>String(iid)));for(const iid of ids)memory.investigations.delete(iid);for(const collection of ['evidence','entities','relationships','watches','alerts','cyberAssets','cyberEvents'])for(const [rid,record] of memory[collection])if(ids.has(String(record.investigationId)))memory[collection].delete(rid);res.json({data:{deletedCount:ids.size},message:'All investigations and their dependent records were deleted.'});}));
  app.get('/api/v1/investigations/:id/overview',requireAuth,wrap(async(req,res)=>{const iid=req.params.id;if(!await exists(iid,req.user.id))return sendError(res,404,'NOT_FOUND','Investigation not found.');const [evidence,entities,relationships,investigation]=await Promise.all([listFor(Evidence,'evidence',iid),listFor(Entity,'entities',iid),listFor(Relationship,'relationships',iid),investigationGet(iid,req.user.id)]);res.json({data:{evidence,entities,relationships,aiReviewHistory:Array.isArray(investigation?.aiReviewHistory)?investigation.aiReviewHistory:[],timeline:evidence.map(e=>({id:e.id||String(e._id),date:e.publishedAt||e.retrievedAt,title:e.title,type:'evidence',url:e.url,verificationStatus:e.verificationStatus})).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0))}});}));
  app.get('/api/v1/investigations/:id/agent-run-status',requireAuth,wrap(async(req,res)=>{const investigation=await investigationGet(req.params.id,req.user.id);if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');res.json({data:investigation.agentRunState||{status:'idle',stage:'idle',detail:'No active research run.',trace:[]}});}));
  app.post('/api/v1/investigations/:id/agent-run/cancel',requireAuth,wrap(async(req,res)=>{
     const iid=req.params.id;
     const investigation=await investigationGet(iid,req.user.id);
     if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');
     const current=investigation.agentRunState||{};
     if(current.status!=='running')return sendError(res,409,'NO_ACTIVE_AGENT_RUN','There is no active investigation run to cancel.');
     const now=new Date().toISOString();
     const detail='Run cancelled by the user. Source records already saved remain available.';
     const next={...current,status:'cancelled',stage:'cancelled',detail,updatedAt:now,finishedAt:now,trace:[...(Array.isArray(current.trace)?current.trace:[]),{stage:'cancelled',status:'cancelled',detail,at:now}].slice(-60)};
     if(isDb()){
      const updated=await Investigation.findOneAndUpdate({_id:iid,ownerId:req.user.id,'agentRunState.runId':current.runId,'agentRunState.status':'running'},{$set:{agentRunState:next}},{new:true});
      if(!updated)return sendError(res,409,'AGENT_RUN_CHANGED','The run state changed before cancellation. Refresh the investigation.');
     }else{
      const stored=memory.investigations.get(iid);
      if(!stored||stored.agentRunState?.runId!==current.runId||stored.agentRunState?.status!=='running')return sendError(res,409,'AGENT_RUN_CHANGED','The run state changed before cancellation. Refresh the investigation.');
      stored.agentRunState=next;
     }
     res.json({data:next});
    }));
  app.get('/api/v1/investigations/:id/agent-runs',requireAuth,wrap(async(req,res)=>{const investigation=await investigationGet(req.params.id,req.user.id);if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');const runs=Array.isArray(investigation.agentRunHistory)?investigation.agentRunHistory.slice().reverse():[];res.json({data:runs,meta:{count:runs.length,persistence:isDb()?'mongodb':'ephemeral-memory'}});}));
  app.post('/api/v1/investigations/:id/agent-run',requireAuth,wrap(async(req,res)=>{
     const iid=req.params.id;
     const investigation=await investigationGet(iid,req.user.id);
     if(!investigation)return sendError(res,404,'NOT_FOUND','Investigation not found.');
     const title=String(investigation.title||'').trim();
     const question=String(investigation.question||title).trim();
     if(question.length<2)return sendError(res,400,'RESEARCH_QUESTION_REQUIRED','Add a clear investigation question before starting the agent.');
     const currentState=investigation.agentRunState||{};
     if(isFreshRunningAgentRun(currentState))return sendError(res,409,'AGENT_ALREADY_RUNNING','This investigation already has a research run in progress.');
     const runId=id();
     const initialState={runId,status:'running',stage:'starting',detail:'Preparing the investigation and loading known sources.',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),trace:[]};
     if(isDb()){
      const staleBefore=new Date(Date.now()-10*60*1000).toISOString();
      const claimed=await Investigation.findOneAndUpdate(
       {_id:iid,ownerId:req.user.id,$or:[{'agentRunState.status':{$ne:'running'}},{'agentRunState.updatedAt':{$lt:staleBefore}},{'agentRunState.updatedAt':{$exists:false}}]},
       {$set:{agentRunState:initialState}},
       {new:true}
      ).lean();
      if(!claimed)return sendError(res,409,'AGENT_ALREADY_RUNNING','Another request already claimed this investigation. Refresh the workspace before starting another run.');
     }else{
      const stored=memory.investigations.get(iid);
      if(!stored)return sendError(res,404,'NOT_FOUND','Investigation not found.');
      if(isFreshRunningAgentRun(stored.agentRunState||{}))return sendError(res,409,'AGENT_ALREADY_RUNNING','This investigation already has a research run in progress.');
      stored.agentRunState=initialState;
     }
     const providerKeys=await getUserProviderKeys(req.user.id);
     let initialSearch={results:[],meta:{query:question,providers:[],coverage:'Initial search unavailable; the autonomous research agent will continue with configured providers.'}};
     try{
      const live=await searchAllPublic(question,providerKeys);
      const ranked=diversifyPublicResults(Array.isArray(live.results)?live.results:[],question,{limit:24,maxPerDomain:3});
      const seen=new Set();
      initialSearch.results=ranked.map(({_searchScore,_searchOrder,...item})=>item).filter(item=>{
       try{const url=normalizeResultUrl(validatePublicUrl(item.url).href);if(seen.has(url))return false;seen.add(url);item.url=url;return true;}catch{return false;}
      }).slice(0,24);
      initialSearch.meta={query:question,providers:[...new Set(initialSearch.results.flatMap(item=>[item.provider,...(item.providers||[])].filter(Boolean)))],coverage:live.meta?.coverage||'Initial public-source search completed.',successfulSearches:live.meta?.successfulSearches||0,failedSearches:live.meta?.failedSearches||0};
     }catch(error){initialSearch.meta.error=String(error?.message||'Initial search provider unavailable.');}
     res.status(202).json({data:{runId,investigationId:iid,status:'running',message:'Search received. Initial results and autonomous investigation are running as one workflow.',initialSearch}});
     void (async()=>{
     const trace=[];
     const startedAt=Date.now();
     const cleanText=(value,max=240)=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
     const persistAgentState=async state=>{const payload={runId,...state,updatedAt:new Date().toISOString()};if(isDb()){const updated=await Investigation.findOneAndUpdate({_id:iid,ownerId:req.user.id,'agentRunState.runId':runId,'agentRunState.status':'running'},{$set:{agentRunState:payload}});if(!updated)throw new Error('Investigation run lease was lost or cancelled; stopping this worker.');}else{const stored=memory.investigations.get(iid);if(!stored||stored.agentRunState?.runId!==runId||stored.agentRunState?.status!=='running')throw new Error('Investigation run lease was lost or cancelled; stopping this worker.');stored.agentRunState=payload;}return payload;};
     const recordTrace=async entry=>{trace.push(entry);await persistAgentState({status:'running',stage:entry.stage,detail:entry.detail||('Working on '+entry.stage),startedAt:new Date(startedAt).toISOString(),trace:trace.slice(-60)});};
     await persistAgentState({status:'running',stage:'starting',detail:'Preparing the investigation and loading known sources.',startedAt:new Date(startedAt).toISOString(),trace:[]});
     const prior=await listFor(Evidence,'evidence',iid);
     const knownUrls=new Set(prior.map(item=>{try{return normalizeResultUrl(item.url).toLowerCase();}catch{return String(item.url||'').toLowerCase();}}));
     const querySeen=new Set();
     const plan=[];
     let leadPlanningMode='heuristic';
     const addQuery=(value,reason,round)=>{
      const q=cleanText(value,180);
      const k=q.toLowerCase();
      if(q.length<3||querySeen.has(k)||plan.length>=12)return;
      querySeen.add(k);plan.push({query:q,reason,round});
     };
     addQuery(question,'Primary investigation question',1);
     if(title.toLowerCase()!==question.toLowerCase())addQuery(title,'Investigation title cross-check',1);
     const allResults=[];
     let providerFailures=0;
     for(let round=1;round<=4;round++){
      const current=plan.filter(item=>item.round===round);
      if(!current.length)continue;
      await recordTrace({stage:'search',round,status:'running',detail:round===1?'Searching the original mission across available public indexes.':'Following promising leads from round '+(round-1)+' and cross-checking them against additional public sources.'});
      const settled=await Promise.all(current.map(async item=>{
       try{return {plan:item,result:await searchAllPublic(item.query,providerKeys)};}
       catch{return {plan:item,result:{results:[],meta:{failedSearches:1},error:'Provider search failed'}};}
      }));
      for(const item of settled){
       providerFailures+=Number(item.result.meta?.failedSearches||0);
       for(const result of (item.result.results||[]).slice(0,14))allResults.push({...result,agentQuery:item.plan.query,agentReason:item.plan.reason});
      }
      await recordTrace({stage:'search',round,status:'complete',queries:current.map(item=>item.query),resultCount:settled.reduce((sum,item)=>sum+(item.result.results||[]).length,0),providers:[...new Set(settled.flatMap(item=>(item.result.results||[]).flatMap(r=>[r.provider,...(r.providers||[])].filter(Boolean))))]});
      if(round<4){
       await recordTrace({stage:'plan',round,status:'running',detail:'Evaluating round '+round+' findings and planning the next bounded set of independent follow-up searches.'});
       const planned=await planAgentFollowUps({question,results:allResults,providerKeys});
       let candidates=Array.isArray(planned.leads)?planned.leads.slice(0,3):[];
       const aiLeadCount=planned.mode==='ai'?candidates.length:0;
       let planningMode=aiLeadCount?'ai':'heuristic';
       const leadQuestion=cleanText(question,120);
       if(candidates.length<3){
        // Diversify fallback research instead of merely repeating result titles:
        // seek primary records, independent corroboration, counterevidence, and chronology.
        const focusQueries=round===1?[
         {query:leadQuestion+' official primary source',reason:'Seek an official statement or primary record.'},
         {query:leadQuestion+' independent corroboration',reason:'Check whether a separately operated source corroborates the lead.'},
         {query:leadQuestion+' response denial counterevidence',reason:'Look for a response, rebuttal, or evidence that challenges the leading account.'}
        ]:[
         {query:leadQuestion+' timeline dates chronology',reason:'Establish dates and the sequence of reported events.'},
         {query:leadQuestion+' original documents records',reason:'Look for source documents rather than summaries alone.'},
         {query:leadQuestion+' conflicting accounts alternative explanation',reason:'Test alternative explanations and conflicting accounts.'}
        ];
        const candidateKeys=new Set(candidates.map(item=>cleanText(item.query,180).toLowerCase()));
        for(const lead of focusQueries){
         const key=cleanText(lead.query,180).toLowerCase();
         if(candidates.length>=3)break;
         if(key!==question.toLowerCase()&&!candidateKeys.has(key)){candidates.push(lead);candidateKeys.add(key);}
        }
        if(candidates.length<3){
         const seed=allResults.slice().sort((a,b)=>String(b.title||'').length-String(a.title||'').length);
         const seenHosts=new Set();
         for(const result of seed){
          if(candidates.length>=3)break;
          let host='';try{host=new URL(result.url).hostname.replace(/^www\./,'');}catch{}
          if(!host||seenHosts.has(host))continue;
          seenHosts.add(host);
          const candidate=cleanText(result.title,150);
          const key=candidate.toLowerCase();
          if(candidate.length>=12&&key!==question.toLowerCase()&&!candidateKeys.has(key)){candidates.push({query:candidate,reason:'Heuristic fallback lead from '+host});candidateKeys.add(key);}
         }
        }
       }
       for(const lead of candidates)addQuery(lead.query,lead.reason,round+1);
       if(aiLeadCount&&candidates.length>aiLeadCount){planningMode='mixed';leadPlanningMode='mixed';}
       else if(aiLeadCount){leadPlanningMode='ai';}
       const nextLeadCount=plan.filter(item=>item.round===round+1).length;
       const traceMode=planningMode;
       await recordTrace({stage:'plan',round,status:'complete',mode:traceMode,provider:planned.provider,leadCount:nextLeadCount,detail:traceMode==='ai'?'AI-generated follow-up queries are hypotheses to test, not factual conclusions.':traceMode==='mixed'?'AI suggestions were supplemented with deterministic primary-source, counterevidence, or chronology searches.':'AI planning was unavailable or returned no usable leads; bounded primary-source, counterevidence, and chronology searches were used.'});
      }
     }
     const merged=new Map();
     for(const item of allResults){
      try{
       const url=normalizeResultUrl(validatePublicUrl(item.url).href);
       const key=url.toLowerCase();
       const old=merged.get(key);
       if(old){old.providers=[...new Set([...(old.providers||[]),item.provider,...(item.providers||[])].filter(Boolean))];old.matchedQueries=[...new Set([...(old.matchedQueries||[]),item.agentQuery].filter(Boolean))];if(String(item.excerpt||'').length>String(old.excerpt||'').length)old.excerpt=item.excerpt;continue;}
       merged.set(key,{...item,url,providers:[...new Set([item.provider,...(item.providers||[])].filter(Boolean))],matchedQueries:[item.agentQuery].filter(Boolean)});
      }catch{}
     }
     const ranked=diversifyPublicResults([...merged.values()],question,{limit:60,maxPerDomain:2});
     const fresh=ranked.filter(item=>!knownUrls.has(item.url.toLowerCase())).slice(0,14);
     await recordTrace({stage:'triage',status:'complete',candidateCount:ranked.length,newCandidateCount:fresh.length,detail:'Deduplicated public URLs, diversified publishers, and prioritized question-relevant results. Relevance is a heuristic, not a truth verdict.'});
     const scrapeCandidates=fresh.slice(0,5);
     const pageResults=await Promise.all(scrapeCandidates.map(async item=>{try{return {url:item.url,page:await scrapePublicPage(item.url)};}catch(error){return {url:item.url,error:cleanText(error?.message,180),page:null};}}));
     const pageMap=new Map(pageResults.map(item=>[item.url,item]));
     let savedCount=0;
     const sourceRecords=[];
     for(const item of fresh){
      if(savedCount>=14)break;
      const page=pageMap.get(item.url)?.page;
      const excerpt=cleanText(page?.excerpt||item.excerpt,4500);
      const host=new URL(item.url).hostname.replace(/^www\./,'');
      const record={id:id(),investigationId:iid,title:cleanText(page?.title&&page.title!==host?page.title:item.title||host,240),url:item.url,sourceType:item.sourceType==='document'?'document':'web',publisher:cleanText(item.publisher||item.provider||host,200),publishedAt:item.publishedAt&&!Number.isNaN(new Date(item.publishedAt).getTime())?new Date(item.publishedAt):null,retrievedAt:new Date(page?.retrievedAt||item.retrievedAt||Date.now()),excerpt,verificationStatus:'unverified',contentHash:crypto.createHash('sha256').update(excerpt).digest('hex'),entities:[],captureTimestamp:'',createdAt:new Date(),updatedAt:new Date()};
      try{
       const saved=await saveRecord(Evidence,'evidence',record);
       knownUrls.add(item.url.toLowerCase());savedCount++;
       sourceRecords.push({id:String(saved.id||saved._id||record.id),title:record.title,url:record.url,publisher:record.publisher,excerpt:record.excerpt,provider:item.provider||'',providers:item.providers||[],matchedQueries:item.matchedQueries||[],retrieved: Boolean(page),verificationStatus:'unverified'});
      }catch(error){if(error?.code!==11000)console.warn('ADVERSE agent evidence save failed:',cleanText(error?.message,160));}
     }
     const scrapedCount=pageResults.filter(item=>item.page).length;
     const followUpLeads=plan.filter(item=>item.round>1).map(item=>({query:item.query,reason:item.reason,status:'searched',round:item.round}));
     await recordTrace({stage:'retrieve',status:'complete',attempted:scrapeCandidates.length,scraped:scrapedCount,detail:'Retrieved bounded text from selected public pages; failed pages remain linked to their original search results when saved.'});
     await recordTrace({stage:'save',status:'complete',savedCount,detail:'New source records are stored as unverified. No relationship or factual conclusion is inferred solely from search ranking.'});
     await recordTrace({stage:'connect',status:'running',detail:'Connecting repeated claim candidates and source provenance across the saved evidence set; proposed links are navigational, not proof.'});
     const finalEvidence=await listFor(Evidence,'evidence',iid);
     let [finalEntities,finalRelationships]=await Promise.all([listFor(Entity,'entities',iid),listFor(Relationship,'relationships',iid)]);
     const claimAnalysis=analyzeEvidenceClaims(finalEvidence);
     // Turn research into a navigable graph: source nodes, repeated-claim nodes, and explicit low-confidence provenance edges.
     // These edges describe which source excerpt was grouped under a candidate claim; they are not truth judgments.
     const graphSummary={sourceNodesCreated:0,claimNodesCreated:0,provenanceLinksCreated:0,existingNodesReused:0,limitations:['Repeated-claim groups are generated by lexical analysis and may merge similar but different statements.','All automatically generated nodes and links remain unverified until a person reviews the original sources.']};
     const evidenceById=new Map(finalEvidence.map(item=>[String(item.id||item._id),item]));
     const entityByEvidenceId=new Map();
     const entityByUrl=new Map(finalEntities.filter(item=>item.canonicalUrl).map(item=>[String(item.canonicalUrl).toLowerCase(),item]));
     const makeEntityId=item=>String(item.id||item._id||'');
     for(const item of finalEvidence){
      const evidenceId=String(item.id||item._id||'');if(!evidenceId)continue;
      const normalizedUrl=String(item.url||'').toLowerCase();
      let node=entityByUrl.get(normalizedUrl);
      if(!node){
       const record={id:id(),investigationId:iid,name:cleanText(item.title||new URL(item.url).hostname,200),type:'document',description:cleanText(item.excerpt,2000),canonicalUrl:String(item.url||'').slice(0,2048),evidenceIds:[evidenceId],createdAt:new Date(),updatedAt:new Date()};
       try{node=await saveRecord(Entity,'entities',record);finalEntities.push(node);entityByUrl.set(normalizedUrl,node);graphSummary.sourceNodesCreated++;}catch(error){console.warn('ADVERSE graph source-node creation failed:',cleanText(error?.message,160));continue;}
      }else graphSummary.existingNodesReused++;
      entityByEvidenceId.set(evidenceId,node);
     }
     const existingRelationshipKeys=new Set(finalRelationships.map(rel=>String(rel.type)+'|'+String(rel.fromEntityId)+'|'+String(rel.toEntityId)));
     for(const claim of claimAnalysis.claims.filter(item=>Array.isArray(item.sourceIds)&&item.sourceIds.length>=2).slice(0,60)){
      const sourceIds=[...new Set(claim.sourceIds.map(String))].filter(sourceId=>evidenceById.has(sourceId)&&entityByEvidenceId.has(sourceId)).slice(0,12);
      if(sourceIds.length<2)continue;
      const claimName=cleanText(claim.claim||'Repeated claim candidate',200);
      let claimNode=finalEntities.find(item=>item.type==='claim'&&String(item.name||'').toLowerCase()===claimName.toLowerCase());
      if(!claimNode){
       const record={id:id(),investigationId:iid,name:claimName,type:'claim',description:cleanText('Automatically grouped repeated-claim candidate found across '+sourceIds.length+' saved source excerpts. This is a research lead, not a verified fact.',2000),canonicalUrl:'',evidenceIds:sourceIds,createdAt:new Date(),updatedAt:new Date()};
       try{claimNode=await saveRecord(Entity,'entities',record);finalEntities.push(claimNode);graphSummary.claimNodesCreated++;}catch(error){console.warn('ADVERSE graph claim-node creation failed:',cleanText(error?.message,160));continue;}
      }else graphSummary.existingNodesReused++;
      const claimId=makeEntityId(claimNode);if(!claimId)continue;
      for(const sourceId of sourceIds){
       const sourceNode=entityByEvidenceId.get(sourceId);const sourceNodeId=makeEntityId(sourceNode);if(!sourceNodeId||sourceNodeId===claimId)continue;
       const relationshipKey='documents|'+sourceNodeId+'|'+claimId;if(existingRelationshipKeys.has(relationshipKey))continue;
       const record={id:id(),investigationId:iid,fromEntityId:sourceNodeId,toEntityId:claimId,type:'documents',evidenceIds:[sourceId],confidence:'low',rationale:'This source excerpt was grouped under a repeated-claim candidate by automated text analysis. Review the original context; this link does not establish support or truth.',verificationStatus:'unverified',createdAt:new Date(),updatedAt:new Date()};
       try{const saved=await saveRecord(Relationship,'relationships',record);finalRelationships.push(saved);existingRelationshipKeys.add(relationshipKey);graphSummary.provenanceLinksCreated++;}catch(error){console.warn('ADVERSE graph provenance-link creation failed:',cleanText(error?.message,160));}
      }
     }
     const researchGaps=analyzeResearchGaps({evidence:finalEvidence,entities:finalEntities,relationships:finalRelationships,claimMap:claimAnalysis});
     const crossSourceLinks=claimAnalysis.claims.filter(claim=>claim.sourceCount>1||(claim.possibleConflicts||[]).length>0).slice(0,40).map(claim=>({claimId:claim.id,claim:claim.claim,sourceIds:claim.sourceIds,sourceCount:claim.sourceCount,possibleConflicts:claim.possibleConflicts,assessment:claim.assessment}));
     await recordTrace({stage:'connect',status:'complete',links:crossSourceLinks.length,graphSummary,detail:'Built a navigable graph of saved sources and repeated-claim candidates. Source-to-claim edges are provisional provenance links, not verified factual relationships.'});
     await recordTrace({stage:'challenge',status:'complete',claimCandidates:claimAnalysis.claimCandidateCount,claimGroups:claimAnalysis.groupCount,possibleConflicts:claimAnalysis.claims.reduce((sum,claim)=>sum+(claim.possibleConflicts||[]).length,0),gapCount:researchGaps.gapCount,detail:'Checked stored excerpts for repeated claims, possible numeric or negation differences, provenance concentration, and missing research coverage. These are review prompts, not truth judgments.'});
     await recordTrace({stage:'report',status:'running',detail:'Assembling the investigation report with source records, cross-source links, and explicit research gaps.'});
     const durationMs=Date.now()-startedAt;
     const report={investigationId:iid,question,title,agent:'ADVERSE Autonomous Research Agent',status:'complete',rounds:Math.max(1,...plan.map(item=>item.round)),queries:plan,trace,leads:followUpLeads,results:sourceRecords,savedCount,scrapedCount,discoveredCount:ranked.length,alreadyStoredCount:ranked.length-fresh.length,providerFailures,leadPlanningMode,crossSourceLinks,graphSummary,claimAnalysis,researchGaps,coverage:'Bounded multi-hop research across available public indexes, with up to two follow-up rounds and eight total queries. This is not exhaustive web crawling.',limitations:['Search ranking is not proof of truth, identity, intent, or ownership.','Lead queries are generated from source titles and publisher diversity, not a guarantee of relevance.','Retrieved text and source records remain unverified until a person checks the original context.','Cross-source links and claim flags are lexical triage aids; they do not establish support, contradiction, independence, or truth.','Search coverage and freshness depend on available public indexes and any provider credentials you connect.'],durationMs,generatedAt:new Date().toISOString()};
     const runRecord={runId,investigationId:iid,title,question,status:'complete',startedAt:new Date(startedAt).toISOString(),finishedAt:new Date().toISOString(),durationMs,rounds:report.rounds,queries:report.queries,trace:report.trace,leads:report.leads,results:report.results.map(({id,title,url,publisher,provider,providers,matchedQueries,retrieved,verificationStatus})=>({id,title,url,publisher,provider,providers,matchedQueries,retrieved,verificationStatus})),savedCount:report.savedCount,scrapedCount:report.scrapedCount,discoveredCount:report.discoveredCount,alreadyStoredCount:report.alreadyStoredCount,providerFailures:report.providerFailures,leadPlanningMode:report.leadPlanningMode,crossSourceLinks:report.crossSourceLinks,challengeSummary:{claimCandidateCount:report.claimAnalysis.claimCandidateCount,claimGroupCount:report.claimAnalysis.groupCount,possibleConflictCount:report.claimAnalysis.claims.reduce((sum,claim)=>sum+(claim.possibleConflicts||[]).length,0),researchGapCount:report.researchGaps.gapCount},coverage:report.coverage,limitations:report.limitations,generatedAt:report.generatedAt};
     if(isDb())await Investigation.findOneAndUpdate({_id:iid,ownerId:req.user.id},{$push:{agentRunHistory:{$each:[runRecord],$slice:-20}},$set:{updatedAt:new Date()}});
     else {const stored=memory.investigations.get(iid);if(stored){stored.agentRunHistory=Array.isArray(stored.agentRunHistory)?stored.agentRunHistory:[];stored.agentRunHistory.push(runRecord);stored.agentRunHistory=stored.agentRunHistory.slice(-20);stored.updatedAt=new Date().toISOString();}}
     await persistAgentState({status:'complete',stage:'complete',detail:'Investigation completed and the report was saved.',startedAt:new Date(startedAt).toISOString(),finishedAt:new Date().toISOString(),runId:runRecord.runId,report,trace:report.trace.slice(-60)});
     })().catch(async error=>{const failed={runId,status:'failed',stage:'failed',detail:String(error?.message||'Research run failed.').slice(0,300),finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),trace:[]};try{if(isDb())await Investigation.findOneAndUpdate({_id:iid,ownerId:req.user.id,'agentRunState.runId':runId,'agentRunState.status':'running'},{$set:{agentRunState:failed}});else{const stored=memory.investigations.get(iid);if(stored&&stored.agentRunState?.runId===runId&&stored.agentRunState?.status==='running')stored.agentRunState=failed;}}catch{}console.error('ADVERSE autonomous research run failed',String(error?.message||error).slice(0,300));});
    }));
}
