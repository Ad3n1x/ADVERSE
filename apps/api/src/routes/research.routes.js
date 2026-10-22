import crypto from 'node:crypto';
import { z } from 'zod';

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
  
}
