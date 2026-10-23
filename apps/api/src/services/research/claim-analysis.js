const STOP = new Set('about after again against also and are because been before being between both but can could did does doing down during each few for from further had has have having here how into its itself just more most not now off once only other our out over own same she should some such than that the their them then there these they this those through too under until very was were what when where which while who will with would you your said says according reported reports'.split(' '));
const NEGATIONS = /\b(?:not|never|no longer|denied|rejects?|disputes?|false|didn't|doesn't|isn't|wasn't|weren't|cannot|can't)\b/i;
const ASSERTION = /\b(?:is|are|was|were|has|have|had|will|announced|confirmed|reported|found|approved|rejected|acquired|owns|operates|launched|resigned|appointed|died|won|lost|increased|decreased|reached|totalled|totaled|cost|caused|denied|charged|convicted|suspended|banned|signed|published|occurred|happened)\b/i;
const clean = (v, max=2000) => String(v || '').replace(/\s+/g,' ').trim().slice(0,max);
const idOf = e => String(e.id || e._id || '');
function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch { return 'unknown source'; } }
function normalize(text) {
  return clean(text, 1400).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}%$.-]+/gu,' ').replace(/\s+/g,' ').trim();
}
function terms(text) { return new Set((normalize(text).match(/[\p{L}\p{N}][\p{L}\p{N}%$.-]{2,}/gu)||[]).filter(t=>!STOP.has(t))); }
function similarity(a,b) {
  const A=terms(a),B=terms(b); if(!A.size||!B.size)return 0;
  let common=0; for(const t of A)if(B.has(t))common++;
  return common/Math.max(1,new Set([...A,...B]).size);
}
function splitSentences(text) {
  return clean(text,5000).replace(/\b(e\.g|i\.e|Mr|Mrs|Dr|Prof|Inc|Ltd)\./gi,'$1<PERIOD>')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])|[\r\n]+/).map(s=>s.replaceAll('<PERIOD>','.').trim())
    .filter(s=>s.length>=35&&s.length<=600);
}
function numbers(text) { return (text.match(/(?:[$€£₦]\s?\d[\d,.]*(?:\s?(?:million|billion|thousand|%|percent))?|\b\d[\d,.]*\s?(?:%|percent|million|billion|thousand|people|votes|years|days|hours|kilometres|kilometers|km|miles|dollars|naira)\b|\b(?:19|20)\d{2}\b|\b\d[\d,.]*\b)/gi)||[]).map(x=>x.toLowerCase().replace(/\s+/g,' ').trim()); }
function oppositePolarity(a,b) { return NEGATIONS.test(a)!==NEGATIONS.test(b); }
function sourceUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch { return String(value || '').trim().toLowerCase(); }
}
function sourceTypeSignal(source) {
  const title = String(source.title || '').toLowerCase();
  const publisher = String(source.publisher || '').toLowerCase();
  let host = '';
  try { host = new URL(source.url).hostname.toLowerCase(); if (host.startsWith('www.')) host = host.slice(4); } catch {}
  const value = [title, publisher, host].join(' ');
  const officialHost = host.endsWith('.gov') || host.includes('.gov.') || host.endsWith('.govt') || host.includes('.govt.');
  const primaryTerms = ['court filing','court judgment','official gazette','statute','legislation','public registry','company registry','annual report','regulatory filing','original dataset','official transcript'];
  if (officialHost || primaryTerms.some(term => value.includes(term))) {
    return { label: 'primary-source candidate', rationale: 'Metadata resembles an official record or primary document; inspect the original source and its authority.' };
  }
  if (['press release','media statement','newsroom','official statement'].some(term => value.includes(term))) {
    return { label: 'first-party statement candidate', rationale: 'This may be a statement from an involved organization; treat it as that party’s account, not independent confirmation.' };
  }
  if (['news','journal','times','post','herald','broadcast','report'].some(term => title.includes(term) || publisher.includes(term))) {
    return { label: 'reporting candidate', rationale: 'Metadata resembles a reporting source; assess the article’s sourcing, author, and links to original material.' };
  }
  return { label: 'source type unclear', rationale: 'Available metadata is insufficient to classify the source type confidently.' };
}
function diversitySignal(sources) {
  const domains = [...new Set(sources.map(s => s.host).filter(host => host && host !== 'unknown source'))];
  if (domains.length <= 1) return { label: 'single-hostname evidence', domainCount: domains.length, hostCount: domains.length, note: 'No cross-hostname corroboration is present in this group.' };
  return { label: 'multiple-hostname evidence; independence unverified', domainCount: domains.length, note: 'Different hostnames do not prove independent reporting or separate source lineages.' };
}

/**
 * Conservative, extractive claim candidates. This is not a truth detector or an NLP model.
 * Only verb-led or number-bearing sentences are surfaced and every item points to its source.
 */
export function analyzeEvidenceClaims(evidence, limit=120) {
  const records = (Array.isArray(evidence)?evidence:[]).slice(0,100).map(e=>({
    id:idOf(e), title:clean(e.title,240), url:clean(e.url,2048), publisher:clean(e.publisher||hostOf(e.url),200),
    host:hostOf(e.url), publishedAt:e.publishedAt||null, retrievedAt:e.retrievedAt||e.createdAt||null,
    verificationStatus:e.verificationStatus||'unverified', excerptLength:clean(e.excerpt,5000).length, sourceTypeSignal:sourceTypeSignal({title:e.title,url:e.url,publisher:e.publisher||hostOf(e.url)}), text:[e.title,e.excerpt].filter(Boolean).join('. ')
  }));
  const candidates=[];
  for(const source of records) {
    for(const sentence of splitSentences(source.text)) {
      if(!ASSERTION.test(sentence)&&numbers(sentence).length===0) continue;
      if(/^(?:click here|read more|subscribe|cookie policy|privacy policy)\b/i.test(sentence))continue;
      const claim={text:sentence,normalized:normalize(sentence),sourceId:source.id,sourceTitle:source.title,url:source.url,publisher:source.publisher,host:source.host,publishedAt:source.publishedAt,retrievedAt:source.retrievedAt,verificationStatus:source.verificationStatus,excerptLength:source.excerptLength,sourceTypeSignal:source.sourceTypeSignal,numbers:numbers(sentence)};
      if(candidates.some(c=>c.sourceId===claim.sourceId&&similarity(c.text,claim.text)>.9))continue;
      candidates.push(claim);
      if(candidates.length>=limit)break;
    }
    if(candidates.length>=limit)break;
  }
  const groups=[];
  for(const claim of candidates) {
    let best=null,bestScore=0;
    for(const group of groups) {
      const score=similarity(group.canonicalText,claim.text);
      if(score>bestScore){best=group;bestScore=score;}
    }
    if(best&&bestScore>=0.62)best.claims.push(claim);
    else groups.push({id:'claim-'+(groups.length+1),canonicalText:claim.text,claims:[claim]});
  }
  const output=groups.map(group=>{
    const sources=[...new Map(group.claims.map(c=>[sourceUrlKey(c.url)||c.sourceId,c])).values()];
    const domains=[...new Set(sources.map(s=>s.host))];
    const pairs=[];
    for(let i=0;i<group.claims.length;i++)for(let j=i+1;j<group.claims.length;j++){
      const a=group.claims[i],b=group.claims[j];
      const urlA=sourceUrlKey(a.url),urlB=sourceUrlKey(b.url);
      if(a.sourceId===b.sourceId||(urlA&&urlA===urlB))continue;
      const numsA=a.numbers,numsB=b.numbers;
      const numericConflict=numsA.length&&numsB.length&&numsA.some(n=>!numsB.includes(n))&&numsB.some(n=>!numsA.includes(n));
      const polarityConflict=oppositePolarity(a.text,b.text)&&similarity(a.text,b.text)>=0.55;
      if(numericConflict||polarityConflict)pairs.push({sourceA:a.sourceId,sourceB:b.sourceId,kind:numericConflict?'different_numeric_details':'possible_polarity_conflict',detail:numericConflict?'Similar statements contain different numeric/date tokens. Check units, dates, context, and source quality.':'Similar statements differ in negation or denial language. Confirm they discuss the same proposition and timeframe.'});
    }
    const independentSources=domains.filter(d=>d!=='unknown source').length;
    return {id:group.id,claim:group.canonicalText,sourceCount:sources.length,distinctPublisherDomains:independentSources,distinctSourceHosts:independentSources,sourceDiversity:diversitySignal(sources),sourceIds:sources.map(s=>s.sourceId),sources:sources.map(({text,...s})=>s),status:pairs.length?'needs_review':sources.length>1?'repeated_claim':'single_source',possibleConflicts:pairs,assessment:sources.length>1?'Repeated wording/topic across records; independence and actual support have not been established.':'Single-source claim candidate; seek independent corroboration.'};
  });
  output.sort((a,b)=>(b.possibleConflicts.length-a.possibleConflicts.length)||(b.sourceCount-a.sourceCount));
  const provenanceClusters=new Map();
  for(const source of records) {
    const host=source.host;
    if(!provenanceClusters.has(host))provenanceClusters.set(host,[]);
    provenanceClusters.get(host).push(source.id);
  }
  return {
    generatedAt:new Date().toISOString(),method:'Extractive sentence candidates, normalized lexical grouping, numeric-token comparison, and conservative negation flags',
    evidenceCount:records.length,claimCandidateCount:candidates.length,groupCount:output.length,
    claims:output,
    provenanceClusters:[...provenanceClusters].map(([host,evidenceIds])=>({host,evidenceIds,count:evidenceIds.length})),
    limitations:[
      'This is a triage aid, not a fact-checker. It does not determine whether a claim is true, false, or legally significant.',
      'Lexical similarity can miss paraphrases and can group unrelated statements. Numeric differences can be legitimate due to units, dates, definitions, or context.',
      'Different publisher domains do not prove independent reporting; shared ownership, wire services, press releases, and citation chains must be inspected.',
      'Only stored titles and excerpts are analyzed, not necessarily the full linked pages. Every candidate needs human review.'
    ]
  };
}
