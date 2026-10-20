import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
import { validatePublicUrl } from './providers.js';
async function withServer(fn){const server=app.listen(0);try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
let testClientIp=10;
async function register(base,email='researcher@example.org'){const clientIp='198.51.100.'+(testClientIp++);const r=await fetch(base+'/api/v1/auth/register',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':clientIp},body:JSON.stringify({email,password:'long-enough-password-123',displayName:'Test Researcher'})});const body=await r.json();return {response:r,body,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
test('health route responds with service status without authentication',async()=>withServer(async base=>{const r=await fetch(base+'/api/v1/health');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);}));
test('investigations require authentication',async()=>withServer(async base=>{const r=await fetch(base+'/api/v1/investigations');assert.equal(r.status,401);}));
test('registers a researcher and creates/reads a private investigation',async()=>withServer(async base=>{const auth=await register(base);assert.equal(auth.response.status,201);assert.ok(auth.cookie.includes('adverse_session='));const r=await fetch(base+'/api/v1/investigations',{method:'POST',headers:{'content-type':'application/json',cookie:auth.cookie},body:JSON.stringify({title:'Test case',question:'Does source A support claim B?'})});assert.equal(r.status,201);const {data}=await r.json();assert.equal(data.title,'Test case');const read=await fetch(base+'/api/v1/investigations/'+data.id,{headers:{cookie:auth.cookie}});assert.equal(read.status,200);assert.equal((await read.json()).data.id,data.id);}));
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
