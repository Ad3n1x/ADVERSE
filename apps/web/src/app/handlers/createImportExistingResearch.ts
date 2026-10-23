import type { FormEvent, Dispatch, SetStateAction } from 'react';
import { request } from '../../lib/api';
import { getRecordId as key } from '../../lib/ids';
import type { Evidence, Entity, Investigation, Relationship } from '../../types/research';

interface ImportResearchDependencies {
  cases: Investigation[];
  importDestinationCollectionId: string;
  importEvidenceEnabled: boolean;
  importGraphEnabled: boolean;
  importSourceCollectionId: string;
  loadCaseData: (id: string) => Promise<void>;
  notify: (message: string) => void;
  setCaseId: Dispatch<SetStateAction<string>>;
  setImportFeedback: Dispatch<SetStateAction<string>>;
  setImportResearchBusy: Dispatch<SetStateAction<boolean>>;
  setImportResearchOpen: Dispatch<SetStateAction<boolean>>;
}

export function createImportExistingResearch(deps: ImportResearchDependencies) {
  const {
    cases,
    importDestinationCollectionId,
    importEvidenceEnabled,
    importGraphEnabled,
    importSourceCollectionId,
    loadCaseData,
    notify,
    setCaseId,
    setImportFeedback,
    setImportResearchBusy,
    setImportResearchOpen,
  } = deps;

  return async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();const destinationId=importDestinationCollectionId;if(!destinationId){setImportFeedback('Choose a destination collection before importing.');return;}if(!importSourceCollectionId){setImportFeedback('Choose the source collection you want to import from.');return;}if(importSourceCollectionId===destinationId){setImportFeedback('Choose a different collection from the destination.');return;}if(!importEvidenceEnabled&&!importGraphEnabled){setImportFeedback('Select Saved sources, Graph items and connections, or both.');return;}setImportResearchBusy(true);setImportFeedback('Importing selected research…');try{const source=await request<{data:{evidence:Evidence[];entities:Entity[];relationships:Relationship[]}}>('/investigations/'+encodeURIComponent(importSourceCollectionId)+'/overview');const existing=await request<{data:{evidence:Evidence[];entities:Entity[];relationships:Relationship[]}}>('/investigations/'+encodeURIComponent(destinationId)+'/overview');if(!source?.data||!existing?.data)throw new Error('The selected collection did not return research data. Refresh both collections and try again.');const sourceEvidence=Array.isArray(source.data.evidence)?source.data.evidence:[],sourceEntities=Array.isArray(source.data.entities)?source.data.entities:[],sourceRelationships=Array.isArray(source.data.relationships)?source.data.relationships:[];if((importEvidenceEnabled&&!sourceEvidence.length)&&(!importGraphEnabled||(!sourceEntities.length&&!sourceRelationships.length))){setImportFeedback('There is no saved research of the selected type in that source collection. Choose another collection or import type.');return;}const existingEvidence=existing.data.evidence||[],existingEntities=existing.data.entities||[];const evidenceMap=new Map<string,string>();const targetUrls=new Set(existingEvidence.map(x=>String(x.url||'').trim().toLowerCase()));const failures:string[]=[];let evidenceAdded=0,entitiesAdded=0,relationshipsAdded=0,relationshipsSkipped=0;for(const item of sourceEvidence){const oldId=key(item),url=String(item.url||'').trim();if(!url)continue;const found=existingEvidence.find(x=>String(x.url||'').trim().toLowerCase()===url.toLowerCase());if(found){evidenceMap.set(oldId,key(found));continue;}if(targetUrls.has(url.toLowerCase()))continue;try{const saved=await request<{data:Evidence}>('/investigations/'+encodeURIComponent(destinationId)+'/evidence',{method:'POST',body:JSON.stringify({title:item.title||url,url,sourceType:['web','archive','organization','document','manual','domain'].includes(item.sourceType)?item.sourceType:'manual',publisher:item.publisher||'Imported research',publishedAt:item.publishedAt||null,excerpt:item.excerpt||'',verificationStatus:['unverified','supported','conflicting','insufficient'].includes(item.verificationStatus)?item.verificationStatus:'unverified',captureTimestamp:item.captureTimestamp||''})});evidenceMap.set(oldId,key(saved.data));targetUrls.add(url.toLowerCase());evidenceAdded++;}catch(err){failures.push('A saved link could not be copied: '+(err instanceof Error?err.message:'request failed'));}}const entityMap=new Map<string,string>();for(const item of sourceEntities){const oldId=key(item),url=String(item.canonicalUrl||'').trim().toLowerCase();const found=existingEntities.find(x=>(url&&String(x.canonicalUrl||'').trim().toLowerCase()===url)||((x.name||'').trim().toLowerCase()===(item.name||'').trim().toLowerCase()&&x.type===item.type));if(found){entityMap.set(oldId,key(found));continue;}if(!importGraphEnabled)continue;const mappedEvidence=(item.evidenceIds||[]).map(id=>evidenceMap.get(String(id))).filter((id):id is string=>Boolean(id));try{const created=await request<{data:Entity}>('/investigations/'+encodeURIComponent(destinationId)+'/entities',{method:'POST',body:JSON.stringify({name:item.name,type:['organization','domain','product','technology','document','event','claim','person'].includes(item.type)?item.type:'document',description:item.description||'',canonicalUrl:item.canonicalUrl||'',evidenceIds:mappedEvidence})});entityMap.set(oldId,key(created.data));entitiesAdded++;}catch(err){failures.push('“'+item.name+'” could not be copied: '+(err instanceof Error?err.message:'request failed'));}}if(importGraphEnabled){const relTypes=['owns','operates','publishes','references','uses','acquired','associated','supports','contradicts','documents'];const seenRelations=new Set<string>();for(const rel of sourceRelationships){const from=entityMap.get(String(rel.fromEntityId)),to=entityMap.get(String(rel.toEntityId));const mappedEvidence=(rel.evidenceIds||[]).map(id=>evidenceMap.get(String(id))).filter((id):id is string=>Boolean(id));if(!from||!to||from===to||!mappedEvidence.length||!relTypes.includes(rel.type)){relationshipsSkipped++;continue;}const signature=from+'|'+to+'|'+rel.type;if(seenRelations.has(signature))continue;seenRelations.add(signature);try{await request('/investigations/'+encodeURIComponent(destinationId)+'/relationships',{method:'POST',body:JSON.stringify({fromEntityId:from,toEntityId:to,type:rel.type,evidenceIds:mappedEvidence,confidence:['low','medium','high'].includes(rel.confidence)?rel.confidence:'low',rationale:rel.rationale||'Copied from '+(cases.find(c=>c.id===importSourceCollectionId)?.title||'another collection')+'. Review the original source links.',verificationStatus:['unverified','supported','conflicting','insufficient'].includes(rel.verificationStatus)?rel.verificationStatus:'unverified'})});relationshipsAdded++;}catch(err){failures.push('A connection could not be copied: '+(err instanceof Error?err.message:'request failed'));}}}setCaseId(destinationId);await loadCaseData(destinationId);if(failures.length){setImportFeedback('Partly completed: '+evidenceAdded+' links, '+entitiesAdded+' items and '+relationshipsAdded+' connections copied. '+failures[0]+(failures.length>1?' ('+(failures.length-1)+' more issue(s); try again after fixing the problem.)':''));}else{setImportFeedback('Import complete: '+evidenceAdded+' new saved links copied. Matching links were reused.');notify('Saved links imported.');setImportResearchOpen(false);}}catch(err){setImportFeedback('Import failed: '+(err instanceof Error?err.message:'Could not copy this collection.'));try{setCaseId(destinationId);await loadCaseData(destinationId);}catch{}}finally{setImportResearchBusy(false);}
  };
}
