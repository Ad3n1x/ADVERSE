import test from 'node:test';
import assert from 'node:assert/strict';
import { app, inspectPublicLink } from './app.js';
import { validatePublicUrl } from './providers.js';
import { rankPublicResults, expandSearchQueries } from './global-search.js';
async function withServer(fn){const server=app.listen(0);try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
let testClientIp=10;
async function register(base,email='researcher@example.org'){const clientIp='198.51.100.'+(testClientIp++);const r=await fetch(base+'/api/v1/auth/register',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':clientIp},body:JSON.stringify({email,password:'long-enough-password-123',displayName:'Test Researcher'})});const body=await r.json();return {response:r,body,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
test('health route responds with service status without exposing provider configuration',async()=>withServer(async base=>{const r=await fetch(base+'/api/v1/health');assert.equal(r.status,200);const body=await r.json();assert.equal(body.ok,true);assert.equal(body.service,'adverse-api');assert.equal(Object.hasOwn(body,'aiReview'),false);assert.equal(Object.hasOwn(body,'providers'),false);assert.equal(Object.hasOwn(body,'environment'),false);}));
test('investigations require authentication',async()=>withServer(async base=>{const r=await fetch(base+'/api/v1/investigations');assert.equal(r.status,401);}));
test('accepts a valid bearer token for API clients',async()=>withServer(async base=>{
 const auth=await register(base,'bearer-client@example.org');
 const token=decodeURIComponent(auth.cookie.slice('adverse_session='.length));
 const response=await fetch(base+'/api/v1/investigations',{headers:{authorization:'Bearer '+token}});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).data,[]);
}));
test('blocks cross-site cookie-authenticated mutations',async()=>withServer(async base=>{
 const auth=await register(base,'csrf-block@example.org');
 const response=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie,origin:'https://attacker.example'},body:JSON.stringify({title:'Cross-site mutation'})});
 assert.equal(response.status,403);
 assert.equal((await response.json()).error.code,'ORIGIN_NOT_ALLOWED');
}));
test('allows cookie-authenticated mutations from the configured web origin',async()=>withServer(async base=>{
 const auth=await register(base,'csrf-allow@example.org');
 const response=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie,origin:'http://localhost:5173'},body:JSON.stringify({title:'Allowed same-site mutation'})});
 assert.equal(response.status,201);
}));

test('registers a researcher and creates/reads a private investigation',async()=>withServer(async base=>{const auth=await register(base);assert.equal(auth.response.status,201);assert.ok(auth.cookie.includes('adverse_session='));const r=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Test case',question:'Does source A support claim B?'})});assert.equal(r.status,201);const {data}=await r.json();assert.equal(data.title,'Test case');const read=await fetch(base+'/api/v1/investigations/'+data.id,{headers:{cookie:auth.cookie}});assert.equal(read.status,200);assert.equal((await read.json()).data.id,data.id);}));
test('server-side PDF export returns a valid PDF for an owned investigation',async()=>withServer(async base=>{const owner=await register(base,'pdf-export@example.org');const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'PDF report test',question:'Can this source be independently verified?'})});assert.equal(created.status,201);const {data:investigation}=await created.json();const response=await fetch(base+'/api/v1/investigations/'+investigation.id+'/export?format=pdf',{headers:{cookie:owner.cookie}});assert.equal(response.status,200);assert.ok((response.headers.get('content-type')||'').includes('application/pdf'));const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.subarray(0,7).toString().startsWith('%PDF-1.'));assert.ok(bytes.toString('ascii').includes('ADVERSE'));}));
test('historical graph view is owner-scoped and identifies its reconstruction limitation',async()=>withServer(async base=>{const owner=await register(base,'history-graph@example.org');const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'History graph test'})});const {data:investigation}=await created.json();const response=await fetch(base+'/api/v1/investigations/'+investigation.id+'/history/graph?asOf=2026-01-01T00:00:00.000Z',{headers:{cookie:owner.cookie}});assert.equal(response.status,200);const result=await response.json();assert.equal(result.data.asOf,'2026-01-01T00:00:00.000Z');assert.match(result.meta.note,/not proof/i);}));
test('rejects blank investigation titles for authenticated users',async()=>withServer(async base=>{const auth=await register(base,'another@example.org');const r=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'  '})});assert.equal(r.status,400);}));
test('prevents a second user from reading another user’s investigation',async()=>withServer(async base=>{const a=await register(base,'owner@example.org');const b=await register(base,'other@example.org');const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:a.cookie},body:JSON.stringify({title:'Private case'})});const {data}=await created.json();const read=await fetch(base+'/api/v1/investigations/'+data.id,{headers:{cookie:b.cookie}});assert.equal(read.status,404);}));
test('evidence rejects loopback URL destinations',async()=>withServer(async base=>{const auth=await register(base,'evidence@example.org');const c=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Safety case'})});const {data}=await c.json();const r=await fetch(base+'/api/v1/investigations/'+data.id+'/evidence',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Local service',url:'http://127.0.0.1/admin'})});assert.equal(r.status,400);}));
test('URL validation blocks loopback, private hosts and non-HTTP schemes',()=>{assert.throws(()=>validatePublicUrl('http://localhost:8080'));assert.throws(()=>validatePublicUrl('http://10.0.0.1'));assert.throws(()=>validatePublicUrl('file:///etc/passwd'));assert.equal(validatePublicUrl('https://example.org/path').hostname,'example.org');});

test('monitoring rules are private to an investigation and can be removed',async()=>withServer(async base=>{
 const owner=await register(base,'watch-owner@example.org');
 const outsider=await register(base,'watch-outsider@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'Archive watch test'})});
 assert.equal(created.status,201);
 const {data:investigation}=await created.json();
 const add=await fetch(base+'/api/v1/investigations/'+investigation.id+'/monitoring',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({url:'https://example.org/history',label:'Example history',intervalHours:12})});
 assert.equal(add.status,201);
 const {data:watch}=await add.json();
 assert.equal(watch.intervalHours,12);
 const read=await fetch(base+'/api/v1/investigations/'+investigation.id+'/monitoring',{headers:{cookie:owner.cookie}});
 assert.equal(read.status,200);
 assert.equal((await read.json()).data.watches.length,1);
 const forbidden=await fetch(base+'/api/v1/monitoring/'+watch.id,{method:'DELETE',headers:{cookie:outsider.cookie}});
 assert.equal(forbidden.status,404);
 const removed=await fetch(base+'/api/v1/monitoring/'+watch.id,{method:'DELETE',headers:{cookie:owner.cookie}});
 assert.equal(removed.status,204);
}));
test('monitoring rejects unsafe URLs and unsupported intervals',async()=>withServer(async base=>{
 const auth=await register(base,'watch-validation@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Watch validation'})});
 const {data:investigation}=await created.json();
 const unsafe=await fetch(base+'/api/v1/investigations/'+investigation.id+'/monitoring',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({url:'http://127.0.0.1/private',intervalHours:24})});
 assert.equal(unsafe.status,400);
 const interval=await fetch(base+'/api/v1/investigations/'+investigation.id+'/monitoring',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({url:'https://example.org',intervalHours:2})});
 assert.equal(interval.status,400);
}));

test('cross-source review reports lexical overlap and groups publisher domains without declaring truth',async()=>withServer(async base=>{
 const auth=await register(base,'cross-review@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Source comparison'})});
 const {data:investigation}=await created.json();
 const save=async(title,url,excerpt)=>fetch(base+'/api/v1/investigations/'+investigation.id+'/evidence',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title,url,excerpt,publisher:'Test Publisher'})});
 assert.equal((await save('Climate report','https://example.org/report','The climate report documents coastal flooding and rising sea levels across the region.')).status,201);
 assert.equal((await save('Coastal flooding update','https://news.example.net/coast','The coastal flooding update documents rising sea levels across the region.')).status,201);
 const review=await fetch(base+'/api/v1/investigations/'+investigation.id+'/cross-source-review',{headers:{cookie:auth.cookie}});
 assert.equal(review.status,200);
 const {data}=await review.json();
 assert.equal(data.evidenceCount,2);
 assert.equal(data.distinctPublisherDomains,2);
 assert.equal(data.pairs.length,1);
 assert.ok(data.pairs[0].lexicalOverlapPercent>0);
 assert.match(data.pairs[0].interpretation,/vocabulary overlap|manually compare/i);
 assert.ok(data.limitations.some(x=>x.includes('not semantic entailment')));
}));
test('cross-source review cannot expose another user investigation',async()=>withServer(async base=>{
 const owner=await register(base,'cross-owner@example.org');
 const outsider=await register(base,'cross-outsider@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'Private source review'})});
 const {data}=await created.json();
 const response=await fetch(base+'/api/v1/investigations/'+data.id+'/cross-source-review',{headers:{cookie:outsider.cookie}});
 assert.equal(response.status,404);
}));

test('AI review reports an explicit configuration error instead of fabricating analysis',async()=>withServer(async base=>{
 const auth=await register(base,'ai-review@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'AI configuration test'})});
 const {data}=await created.json();
 const response=await fetch(base+'/api/v1/investigations/'+data.id+'/ai-review',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({})});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error.code,'AI_NOT_CONFIGURED');
}));


test('entity evidence references must belong to the same investigation', async()=>withServer(async base=>{
 const owner=await register(base,'entity-provenance@example.org');
 const makeCase=async title=>{const r=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title})});return (await r.json()).data;};
 const first=await makeCase('Entity provenance target');
 const second=await makeCase('Entity provenance source');
 const evidenceResponse=await fetch(base+'/api/v1/investigations/'+second.id+'/evidence',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'Source record',url:'https://example.org/source',excerpt:'A public source excerpt.'})});
 assert.equal(evidenceResponse.status,201);
 const evidence=(await evidenceResponse.json()).data;
 const response=await fetch(base+'/api/v1/investigations/'+first.id+'/entities',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({name:'Cross-case entity',evidenceIds:[evidence.id||evidence._id]})});
 assert.equal(response.status,400);
 assert.equal((await response.json()).error.code,'INVALID_EVIDENCE_REFERENCE');
}));

test('CSV export neutralizes spreadsheet formula-leading evidence values', async()=>withServer(async base=>{
 const owner=await register(base,'csv-formula@example.org');
 const created=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'CSV safety test'})});
 const {data:investigation}=await created.json();
 const saved=await fetch(base+'/api/v1/investigations/'+investigation.id+'/evidence',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({title:'Formula test',url:'https://example.org',excerpt:'=HYPERLINK("https://attacker.example","click")'})});
 assert.equal(saved.status,201);
 const exported=await fetch(base+'/api/v1/investigations/'+investigation.id+'/export?format=csv',{headers:{cookie:owner.cookie}});
 assert.equal(exported.status,200);
 const csv=await exported.text();
  assert.ok(csv.includes("'=HYPERLINK("));
  assert.ok(csv.includes('""https://attacker.example""'));
}));


test('Gemini review validates the structured response and persists bounded review history',async()=>withServer(async base=>{
 const originalKey=process.env.GEMINI_API_KEY;
 const originalModel=process.env.GEMINI_MODEL;
 const originalFetch=globalThis.fetch;
 process.env.GEMINI_API_KEY='test-only-gemini-key';
 process.env.GEMINI_MODEL='gemini-2.5-flash';
 globalThis.fetch=async(input,init)=>{
  if(String(input).startsWith('https://generativelanguage.googleapis.com/')){
   const requestBody=JSON.parse(String(init?.body||'{}'));
   assert.equal(requestBody.generationConfig.responseMimeType,'application/json');
   const review={summary:'Two stored sources were compared; verify their original contents.',corroboratedClaims:[],possibleDisagreements:[],gaps:[{question:'Is there an independent primary source? ',whyItMatters:'Independent sourcing has not been established.'}],sourceCautions:[]};
   return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(review)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return originalFetch(input,init);
 };
 try{
  const auth=await register(base,'gemini-review-test@example.org');
  const created=await originalFetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Gemini review persistence test'})});
  assert.equal(created.status,201);
  const {data:investigation}=await created.json();
  for(const [title,url,excerpt] of [
   ['Source one','https://example.org/source-one','A public source reports a dated event.'],
   ['Source two','https://example.net/source-two','A second public source describes the same event.']
  ]){
   const saved=await originalFetch(base+'/api/v1/investigations/'+investigation.id+'/evidence',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title,url,excerpt,publisher:'Test publisher'})});
   assert.equal(saved.status,201);
  }
  const response=await originalFetch(base+'/api/v1/investigations/'+investigation.id+'/ai-review',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:'{}'});
  assert.equal(response.status,200);
  const {data}=await response.json();
  assert.equal(data.provider,'Google Gemini');
  assert.equal(data.evidenceCount,2);
  assert.match(data.summary,/stored sources/i);
  const reread=await originalFetch(base+'/api/v1/investigations/'+investigation.id,{headers:{cookie:auth.cookie}});
  assert.equal(reread.status,200);
  const investigationData=(await reread.json()).data;
  assert.equal(investigationData.aiReviewHistory.length,1);
  assert.deepEqual(investigationData.aiReviewHistory[0].evidenceIds.length,2);
 }finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;
  if(originalModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=originalModel;
 }
}));


test('public Find Anything search validates queries without requiring an account',async()=>withServer(async base=>{
 const response=await fetch(base+'/api/v1/public-search?q=x');
 assert.equal(response.status,400);
 const body=await response.json();
 assert.equal(body.error.code,'QUERY_REQUIRED');
}));

test('Find Anything ranking prioritizes exact subject and title matches',()=>{
 const results=rankPublicResults([
  {title:'Old version discussion',url:'https://forum.example/old-version',excerpt:'A conversation about old versions',publisher:'Forum'},
  {title:'Python official documentation',url:'https://docs.python.org/3/',excerpt:'Python language docs',publisher:'Python.org'},
  {title:'Learn to code online',url:'https://example.org/courses',excerpt:'Python and JavaScript lessons',publisher:'Learning site'}
 ],'Python');
 assert.equal(results[0].title,'Python official documentation');
 assert.ok(results[0]._searchScore>results[1]._searchScore);
});
test('Find Anything ranking rewards multiple subject terms over incidental snippet mentions',()=>{
 const results=rankPublicResults([
  {title:'MovieBox APK download',url:'https://example.org/moviebox-apk',excerpt:'Download the Android app',publisher:'App site'},
  {title:'Old version help thread',url:'https://forum.example/old',excerpt:'MovieBox mentioned in a long discussion',publisher:'Forum'}
 ],'MovieBox old version APK');
 assert.equal(results[0].title,'MovieBox APK download');
});

test('public query expansion stays bounded and preserves natural language intent',()=>{
 const plan=expandSearchQueries('best free Python courses for beginners');
 assert.ok(plan.length<=5);
 assert.equal(plan[1].query,'best free Python courses for beginners');
 assert.ok(plan.some(item=>item.reason==='core terms'));
});

test('public link safety signals are descriptive and do not label URLs as malicious',()=>{
 const http=inspectPublicLink('http://example.org/page');
 assert.equal(http.transport,'HTTP');
 assert.ok(http.signals.some(signal=>/HTTPS/i.test(signal)));
 const short=inspectPublicLink('https://bit.ly/example');
 assert.ok(short.signals.some(signal=>/shortening service/i.test(signal)));
 const secure=inspectPublicLink('https://example.org/page');
 assert.equal(secure.transport,'HTTPS');
 assert.equal(secure.signals.length,0);
});


test('archive-monitoring scheduler rejects missing or invalid secrets before database access',async()=>withServer(async base=>{
 const previousSecret=process.env.MONITORING_CRON_SECRET;
 const previousDb=globalThis.__ADVERSE_MONGO_READY__;
 process.env.MONITORING_CRON_SECRET='test-monitoring-secret';
 globalThis.__ADVERSE_MONGO_READY__=false;
 try{
  const missing=await fetch(base+'/api/v1/internal/monitoring/run',{method:'POST'});
  assert.equal(missing.status,401);
  assert.equal((await missing.json()).error.code,'CRON_AUTH_REQUIRED');
  const invalid=await fetch(base+'/api/v1/internal/monitoring/run',{method:'POST',headers:{'x-monitoring-secret':'wrong-secret'}});
  assert.equal(invalid.status,401);
  assert.equal((await invalid.json()).error.code,'CRON_AUTH_INVALID');
  const valid=await fetch(base+'/api/v1/internal/monitoring/run',{method:'POST',headers:{'x-monitoring-secret':'test-monitoring-secret'}});
  assert.equal(valid.status,503);
  assert.equal((await valid.json()).error.code,'DATABASE_REQUIRED');
 }finally{
  if(previousSecret===undefined)delete process.env.MONITORING_CRON_SECRET;else process.env.MONITORING_CRON_SECRET=previousSecret;
  if(previousDb===undefined)delete globalThis.__ADVERSE_MONGO_READY__;else globalThis.__ADVERSE_MONGO_READY__=previousDb;
 }
}));

test('discovery scheduler rejects missing or invalid secrets before database access',async()=>withServer(async base=>{
 const previousSecret=process.env.DISCOVERY_CRON_SECRET;
 const previousDb=globalThis.__ADVERSE_MONGO_READY__;
 process.env.DISCOVERY_CRON_SECRET='test-discovery-secret';
 globalThis.__ADVERSE_MONGO_READY__=false;
 try{
  const missing=await fetch(base+'/api/v1/internal/discovery/run',{method:'POST'});
  assert.equal(missing.status,401);
  assert.equal((await missing.json()).error.code,'CRON_AUTH_REQUIRED');
  const invalid=await fetch(base+'/api/v1/internal/discovery/run',{method:'POST',headers:{'x-discovery-secret':'wrong-secret'}});
  assert.equal(invalid.status,401);
  assert.equal((await invalid.json()).error.code,'CRON_AUTH_INVALID');
  const valid=await fetch(base+'/api/v1/internal/discovery/run',{method:'POST',headers:{'x-discovery-secret':'test-discovery-secret'}});
  assert.equal(valid.status,503);
  assert.equal((await valid.json()).error.code,'DATABASE_REQUIRED');
 }finally{
  if(previousSecret===undefined)delete process.env.DISCOVERY_CRON_SECRET;else process.env.DISCOVERY_CRON_SECRET=previousSecret;
  if(previousDb===undefined)delete globalThis.__ADVERSE_MONGO_READY__;else globalThis.__ADVERSE_MONGO_READY__=previousDb;
 }
}));

test('cyber-monitoring scheduler requires the configured secret and persistent storage',async()=>withServer(async base=>{
 const previousSecret=process.env.CYBER_MONITORING_CRON_SECRET;
 const previousDb=globalThis.__ADVERSE_MONGO_READY__;
 process.env.CYBER_MONITORING_CRON_SECRET='test-scheduler-secret';
 globalThis.__ADVERSE_MONGO_READY__=false;
 try{
  const missing=await fetch(base+'/api/v1/internal/cyber-monitoring/run',{method:'POST'});
  assert.equal(missing.status,401);
  assert.equal((await missing.json()).error.code,'CRON_AUTH_REQUIRED');
  const invalid=await fetch(base+'/api/v1/internal/cyber-monitoring/run',{method:'POST',headers:{'x-cyber-monitoring-secret':'wrong-secret'}});
  assert.equal(invalid.status,401);
  assert.equal((await invalid.json()).error.code,'CRON_AUTH_INVALID');
  const valid=await fetch(base+'/api/v1/internal/cyber-monitoring/run',{method:'POST',headers:{'x-cyber-monitoring-secret':'test-scheduler-secret'}});
  assert.equal(valid.status,503);
  assert.equal((await valid.json()).error.code,'DATABASE_REQUIRED');
 }finally{
  if(previousSecret===undefined)delete process.env.CYBER_MONITORING_CRON_SECRET;else process.env.CYBER_MONITORING_CRON_SECRET=previousSecret;
  if(previousDb===undefined)delete globalThis.__ADVERSE_MONGO_READY__;else globalThis.__ADVERSE_MONGO_READY__=previousDb;
 }
}));

test('public Find Anything search uses per-user provider keys with Bearer authentication',async()=>withServer(async base=>{
 const originalFetch=globalThis.fetch;
 const auth=await register(base,'public-bearer-provider@example.org');
 const token=decodeURIComponent(auth.cookie.slice('adverse_session='.length));
 const saved=await originalFetch(base+'/api/v1/search/provider-credentials',{method:'PUT',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({TAVILY_API_KEY:'test-user-tavily-key'})});
 assert.equal(saved.status,200);
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://api.tavily.com/search'){
   const request=JSON.parse(String(init?.body||'{}'));
   assert.equal(request.api_key,'test-user-tavily-key');
   return new Response(JSON.stringify({results:[{title:'Personalized provider result',url:'https://results.example/tavily',content:'Returned by the user-configured search provider.'}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('provider unavailable',{status:503,headers:{'content-type':'text/plain'}});
 };
 try{
  const response=await originalFetch(base+'/api/v1/public-search?q=public%20bearer%20provider%20test',{headers:{authorization:'Bearer '+token}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.ok(body.data.some(item=>item.provider==='Tavily Search'&&item.url==='https://results.example/tavily'));
 }finally{
  globalThis.fetch=originalFetch;
 }
}));

test('provider credentials never leak between authenticated users',async()=>withServer(async base=>{
 const originalFetch=globalThis.fetch;
 const owner=await register(base,'credential-owner@example.org');
 const other=await register(base,'credential-other@example.org');
 const saved=await originalFetch(base+'/api/v1/search/provider-credentials',{method:'PUT',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({TAVILY_API_KEY:'owner-only-secret-key'})});
 assert.equal(saved.status,200);
 const otherToken=decodeURIComponent(other.cookie.slice('adverse_session='.length));
 let tavilyCalls=0;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://api.tavily.com/search'){
   tavilyCalls++;
   const request=JSON.parse(String(init?.body||'{}'));
   assert.notEqual(request.api_key,'owner-only-secret-key','a different account must never use this provider key');
   return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('provider unavailable',{status:503,headers:{'content-type':'text/plain'}});
 };
 try{
  const response=await originalFetch(base+'/api/v1/public-search?q=credential%20isolation',{headers:{authorization:'Bearer '+otherToken}});
  assert.equal(response.status,200);
  assert.equal(tavilyCalls,0,'a user without a Tavily key must not call Tavily with another user\'s key');
 }finally{
  globalThis.fetch=originalFetch;
 }
}));

