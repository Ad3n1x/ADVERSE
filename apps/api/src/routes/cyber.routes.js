export function registerCyberRoutes(app, {
  requireAuth, limitProvider, wrap, sendError, exists, isDb, memory, id,
  CyberAsset, CyberEvent, cyberAssetSchema, validatePublicUrl,
  validatePublicUrlResolution, runCyberAssetCheck, crypto,
}) {
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
}
