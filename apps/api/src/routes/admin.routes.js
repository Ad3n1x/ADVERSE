import { z } from 'zod';

export function registerAdminRoutes(app, {
  limitAuth, wrap, sendError, ownerEmail, isDb, User, memory,
  verifyToken, cookieToken, setSession, tokenFor, scryptSync, timingSafeEqual,
  Investigation, Evidence, Entity, Relationship, Watch, Alert, CyberAsset,
  CyberEvent, AdminAuditEvent, SearchMetric, PlatformConfig, Incident, JobRun,
  LinkCheck, id, readPlatformConfig, writePlatformConfig, getProviderCatalog,
  getUserProviderKeys, providerKeyNames, aiCredentialNames, validatePublicUrl,
  inspectPublicLink, assessSourceContext, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, runMonitoringCycle, createReportPdf,
  csvCell, crypto,
}) {
  const adminLoginSchema = z.object({ email:z.string().trim().email().max(254), password:z.string().min(1).max(256) });
    function requireAdmin(req,res,next) {
    const user=verifyToken(cookieToken(req));
    if(!user) return sendError(res,403,'ADMIN_REQUIRED','Administrator access is required.');
    Promise.resolve().then(async()=>{
      const email=String(user.email||'').toLowerCase();
      let account=isDb()?await User.findById(user.id).select('email role status').lean():memory.users.get(user.id);
      if(!account || (account.status||'active')==='suspended') return sendError(res,403,'ADMIN_REQUIRED','Administrator access is required.');
      const isOwner=email===ownerEmail() && String(account.email||'').toLowerCase()===ownerEmail() && account.role==='admin' && user.role==='admin';
      const isAdmin=account.role==='admin' && user.role==='admin';
      if(!isOwner && !isAdmin) return sendError(res,403,'ADMIN_REQUIRED','Administrator access is required.');
      req.user={...user,email:account.email,role:isOwner?'owner':'admin',id:String(account._id||account.id)};
      next();
    }).catch(next);
  }
  app.post('/api/v1/admin/login',limitAuth,wrap(async(req,res)=>{
    const p=adminLoginSchema.safeParse(req.body);
    if(!p.success) return sendError(res,400,'VALIDATION_ERROR','Enter the configured administrator email and password.');
    const email=p.data.email.toLowerCase();
    const configuredEmail=ownerEmail();
    const configuredPassword=String(process.env.ADMIN_PASSWORD||'');
    const configuredPasswordHash=String(process.env.ADMIN_PASSWORD_HASH||'').trim();
    if(!configuredEmail || (!configuredPassword && !configuredPasswordHash) || email!==configuredEmail) return sendError(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
    let passwordValid=false;
    if(configuredPasswordHash){
      const match=configuredPasswordHash.match(/^([a-f0-9]{32}):([a-f0-9]{128})$/i);
      if(match){
        const expectedHash=Buffer.from(match[2],'hex');
        const suppliedHash=scryptSync(p.data.password,match[1],expectedHash.length);
        passwordValid=expectedHash.length===suppliedHash.length&&timingSafeEqual(expectedHash,suppliedHash);
      }
    }else{
      const supplied=Buffer.from(p.data.password,'utf8');
      const expected=Buffer.from(configuredPassword,'utf8');
      passwordValid=supplied.length===expected.length&&timingSafeEqual(supplied,expected);
    }
    if(!passwordValid) return sendError(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
    let account=isDb()?await User.findOne({email:configuredEmail}):[...memory.users.values()].find(u=>u.email===configuredEmail);
    if(!account){
      const salt=crypto.randomBytes(16).toString('hex');
      const passwordHash=configuredPasswordHash||salt+':'+scryptSync(configuredPassword,salt,64).toString('hex');
      const displayName='ADVERSE Admin';
      account=isDb()?await User.create({email:configuredEmail,displayName,passwordHash,role:'admin'}):{id:id(),email:configuredEmail,displayName,passwordHash,role:'admin'};
      if(!isDb())memory.users.set(account.id,account);
    }else{
      // The configured owner credential is authoritative; replace any pre-existing password
      // and promote the reserved owner account so an earlier public registration cannot persist.
      const salt=crypto.randomBytes(16).toString('hex');
      const passwordHash=configuredPasswordHash||salt+':'+scryptSync(configuredPassword,salt,64).toString('hex');
      if(isDb())await User.updateOne({_id:account._id},{$set:{passwordHash,role:'admin'}});
      else Object.assign(account,{passwordHash,role:'admin'});
    }
    const safe={id:String(account.id||account._id),email:configuredEmail,displayName:account.displayName||'ADVERSE Admin',role:'admin'};
    setSession(res,tokenFor(safe));
    req.user=safe;
    await auditAdmin(req,'admin.login','admin',configuredEmail,{success:true});
    res.json({data:safe});
  }));
  app.get('/api/v1/admin/overview',requireAdmin,wrap(async(req,res)=>{
    if(!isDb()) return sendError(res,503,'DATABASE_REQUIRED','Admin analytics require MongoDB persistence.');
    const [users,totalInvestigations,recentUsers,investigationCounts]=await Promise.all([
      User.countDocuments({}),
      Investigation.countDocuments({}),
      User.find({}).select('email displayName status role createdAt updatedAt').sort({createdAt:-1}).limit(8).lean(),
      Investigation.aggregate([{$group:{_id:'$ownerId',count:{$sum:1}}}])
    ]);
    const counts=new Map(investigationCounts.map(row=>[String(row._id),row.count]));
    res.json({data:{
      metrics:{totalUsers:users,totalInvestigations,usersCreatedLast7Days:await User.countDocuments({createdAt:{$gte:new Date(Date.now()-7*86400000)}})},
      recentUsers:recentUsers.map(u=>({id:String(u._id),email:u.email,displayName:u.displayName,status:u.status||'active',role:String(u.email||'').toLowerCase()===ownerEmail()?'owner':(u.role||'user'),createdAt:u.createdAt,lastUpdatedAt:u.updatedAt,investigations:counts.get(String(u._id))||0})),
      generatedAt:new Date().toISOString(),
      limitations:['Search-query analytics are not yet recorded, so this view does not claim to show search volume or active users.','Last updated is the account record update timestamp, not a verified last-login time.']
    }});
  }));
  app.get('/api/v1/admin/users',requireAdmin,wrap(async(req,res)=>{
    if(!isDb()) return sendError(res,503,'DATABASE_REQUIRED','User management requires MongoDB persistence.');
    const q=String(req.query.q||'').trim().slice(0,120);
    const page=Math.max(1,Math.min(10000,Number.parseInt(String(req.query.page||'1'),10)||1));
    const limit=Math.max(1,Math.min(50,Number.parseInt(String(req.query.limit||'20'),10)||20));
    const needle=q.toLowerCase();
    const filter=q?{$expr:{$or:[{$gte:[{$indexOfCP:[{$toLower:'$email'},needle]},0]},{$gte:[{$indexOfCP:[{$toLower:'$displayName'},needle]},0]}]}}:{};
    const [total,rows]=await Promise.all([User.countDocuments(filter),User.find(filter).select('email displayName status role createdAt updatedAt').sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean()]);
    const ids=rows.map(u=>String(u._id));
    const groups=ids.length?await Investigation.aggregate([{$match:{ownerId:{$in:ids}}},{$group:{_id:'$ownerId',count:{$sum:1}}} ]):[];
    const counts=new Map(groups.map(row=>[String(row._id),row.count]));
    res.json({data:rows.map(u=>({id:String(u._id),email:u.email,displayName:u.displayName,status:u.status||'active',role:String(u.email||'').toLowerCase()===ownerEmail()?'owner':(u.role||'user'),createdAt:u.createdAt,lastUpdatedAt:u.updatedAt,investigations:counts.get(String(u._id))||0})),meta:{page,limit,total,pages:Math.ceil(total/limit)}});
  }));
  
  app.get('/api/v1/admin/health',requireAdmin,wrap(async(req,res)=>{
    let dbState='unavailable',userCount=null,investigationCount=null;
    if(isDb()){dbState=mongoose.connection.readyState===1?'connected':'disconnected';[userCount,investigationCount]=await Promise.all([User.countDocuments({}),Investigation.countDocuments({})]);}
    const cfg=await readPlatformConfig();
    const backupConfigured=Boolean(process.env.BACKUP_LAST_SUCCESS_AT&&process.env.BACKUP_VERIFICATION_STATUS);
    res.json({data:{api:'ok',database:dbState,uptimeSeconds:Math.round(process.uptime()),nodeVersion:process.version,environment:process.env.NODE_ENV||'development',users:userCount,investigations:investigationCount,maintenanceMode:Boolean(cfg.maintenanceMode),backup:{configured:backupConfigured,lastSuccessAt:process.env.BACKUP_LAST_SUCCESS_AT||null,verificationStatus:backupConfigured?process.env.BACKUP_VERIFICATION_STATUS:'not_configured',note:backupConfigured?'Reported by configured backup integration; restore testing must be verified separately.':'Configure a real backup job and publish BACKUP_LAST_SUCCESS_AT and BACKUP_VERIFICATION_STATUS to expose backup status.'},scheduler:{monitoringConfigured:Boolean(process.env.MONITORING_CRON_SECRET),cyberMonitoringConfigured:Boolean(process.env.CYBER_MONITORING_CRON_SECRET)}}});
  }));
  app.get('/api/v1/admin/metrics',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return res.json({data:{window:String(req.query.window||'24h'),totalRequests:0,searches:0,errors:0,rateLimited:0,averageLatencyMs:0,p95LatencyMs:null,byRoute:[],timeline:[],note:'Persistent metrics require MongoDB; request telemetry is in-memory only in development.'}});
    const windowKey=String(req.query.window||'24h');const duration=windowKey==='30d'?30*86400000:windowKey==='7d'?7*86400000:86400000;const since=new Date(Date.now()-duration);
    const [total,searches,rateLimited,errors,summary,byRoute,timeline,latencies]=await Promise.all([
      SearchMetric.countDocuments({createdAt:{$gte:since}}),
      SearchMetric.countDocuments({kind:'search',createdAt:{$gte:since}}),
      SearchMetric.countDocuments({status:429,createdAt:{$gte:since}}),
      SearchMetric.countDocuments({createdAt:{$gte:since},$or:[{status:{$gte:500}},{errorCode:{$ne:''}}]}),
      SearchMetric.aggregate([{$match:{createdAt:{$gte:since}}},{$group:{_id:null,avg:{$avg:'$durationMs'},max:{$max:'$durationMs'}}}]),
      SearchMetric.aggregate([{$match:{createdAt:{$gte:since}}},{$group:{_id:'$route',count:{$sum:1},errors:{$sum:{$cond:[{$gte:['$status',500]},1,0]}},avgLatency:{$avg:'$durationMs'}}},{$sort:{count:-1}},{$limit:20}]),
      SearchMetric.aggregate([{$match:{createdAt:{$gte:since}}},{$group:{_id:{$dateTrunc:{date:'$createdAt',unit:duration>2*86400000?'day':'hour'}},requests:{$sum:1},errors:{$sum:{$cond:[{$gte:['$status',500]},1,0]}}}},{$sort:{_id:1}},{$limit:750}]),
      SearchMetric.find({createdAt:{$gte:since}}).select('durationMs').sort({durationMs:1}).limit(5000).lean()
    ]);
    const p95=latencies.length?latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))].durationMs:null;
    res.json({data:{window:windowKey,totalRequests:total,searches,errors,rateLimited,averageLatencyMs:Math.round(summary[0]?.avg||0),maxLatencyMs:summary[0]?.max||0,p95LatencyMs:p95,byRoute:byRoute.map(x=>({route:x._id,count:x.count,errors:x.errors,averageLatencyMs:Math.round(x.avgLatency||0)})),timeline:timeline.map(x=>({at:x._id,requests:x.requests,errors:x.errors})),generatedAt:new Date().toISOString()}});
  }));
  app.get('/api/v1/admin/audit',requireAdmin,wrap(async(req,res)=>{
    const limit=Math.max(1,Math.min(100,Number.parseInt(String(req.query.limit||'50'),10)||50));
    const rows=isDb()?await AdminAuditEvent.find({}).sort({createdAt:-1}).limit(limit).lean():(globalThis.__ADVERSE_AUDIT__||[]).slice(0,limit);
    res.json({data:rows.map(x=>({id:String(x._id||x.id||''),actorEmail:x.actorEmail||'',action:x.action,targetType:x.targetType||'',targetId:x.targetId||'',details:x.details||{},createdAt:x.createdAt}))});
  }));
  app.patch('/api/v1/admin/users/:id/role',requireAdmin,wrap(async(req,res)=>{
     const role=String(req.body?.role||'');
     if(!['user','admin'].includes(role))return sendError(res,400,'INVALID_ROLE','Role must be user or admin.');
     const isOwner=req.user.role==='owner' && String(req.user.email||'').toLowerCase()===ownerEmail();
     if(isDb()){
       const target=await User.findById(req.params.id).select('email displayName role').lean();
       if(!target)return sendError(res,404,'USER_NOT_FOUND','User account not found.');
       if(String(target.email||'').toLowerCase()===ownerEmail())return sendError(res,400,'OWNER_ROLE_LOCKED','The owner account cannot be demoted here.');
       if(!isOwner && !(role==='user' && target.role==='admin'))return sendError(res,403,'OWNER_REQUIRED','Only the owner can grant administrator access. Administrators may revoke another administrator.');
       await User.updateOne({_id:req.params.id},{$set:{role}});
       await auditAdmin(req,role==='admin'?'user.admin_granted':'user.admin_revoked','user',req.params.id,{email:target.email,role});
       return res.json({data:{id:String(target._id),email:target.email,role}});
     }
     const target=memory.users.get(req.params.id);
     if(!target)return sendError(res,404,'USER_NOT_FOUND','User account not found.');
     if(String(target.email||'').toLowerCase()===ownerEmail())return sendError(res,400,'OWNER_ROLE_LOCKED','The owner account cannot be demoted here.');
     if(!isOwner && !(role==='user' && target.role==='admin'))return sendError(res,403,'OWNER_REQUIRED','Only the owner can grant administrator access. Administrators may revoke another administrator.');
     target.role=role;memory.users.set(req.params.id,target);
     await auditAdmin(req,role==='admin'?'user.admin_granted':'user.admin_revoked','user',req.params.id,{email:target.email,role});
     res.json({data:{id:String(target.id),email:target.email,role}});
  }));
  app.patch('/api/v1/admin/users/:id/status',requireAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||'');
    if(!['active','suspended'].includes(status))return sendError(res,400,'INVALID_STATUS','Status must be active or suspended.');
    if(String(req.params.id)===String(req.user.id))return sendError(res,400,'SELF_CHANGE_BLOCKED','You cannot suspend your own administrator session.');
    let target;
    if(isDb()){target=await User.findByIdAndUpdate(req.params.id,{$set:{status}},{new:true}).select('email displayName status').lean();}
    else {target=memory.users.get(req.params.id);if(target){target.status=status;memory.users.set(req.params.id,target);}}
    if(!target)return sendError(res,404,'USER_NOT_FOUND','User account not found.');
    await auditAdmin(req,'user.status_changed','user',req.params.id,{status});
    res.json({data:{id:String(target._id||target.id),email:target.email,displayName:target.displayName,status}});
  }));
  app.delete('/api/v1/admin/users/:id',requireAdmin,wrap(async(req,res)=>{
    if(String(req.params.id)===String(req.user.id))return sendError(res,400,'SELF_DELETE_BLOCKED','You cannot delete your own administrator account from this session.');
    let target;
    if(isDb()){
      target=await User.findById(req.params.id).select('email').lean();if(!target)return sendError(res,404,'USER_NOT_FOUND','User account not found.');
      const owned=await Investigation.find({ownerId:String(req.params.id)}).select('_id').lean();const ids=owned.map(x=>String(x._id));
      if(ids.length){await Promise.all([Evidence.deleteMany({investigationId:{$in:ids}}),Entity.deleteMany({investigationId:{$in:ids}}),Relationship.deleteMany({investigationId:{$in:ids}}),Watch.deleteMany({investigationId:{$in:ids}}),Alert.deleteMany({investigationId:{$in:ids}}),CyberAsset.deleteMany({investigationId:{$in:ids}}),CyberEvent.deleteMany({investigationId:{$in:ids}}),Investigation.deleteMany({_id:{$in:ids}})]);}
      await User.deleteOne({_id:req.params.id});
    }else{
      target=memory.users.get(req.params.id);if(!target)return sendError(res,404,'USER_NOT_FOUND','User account not found.');
      const owned=[...memory.investigations.values()].filter(x=>String(x.ownerId)===String(req.params.id));const ids=new Set(owned.map(x=>String(x.id||x._id)));
      for(const [k,v] of memory.investigations)if(ids.has(String(v.id||v._id)))memory.investigations.delete(k);
      for(const map of [memory.evidence,memory.entities,memory.relationships,memory.watches,memory.alerts,memory.cyberAssets,memory.cyberEvents])for(const [k,v] of map)if(ids.has(String(v.investigationId)))map.delete(k);
      memory.users.delete(req.params.id);
    }
    await auditAdmin(req,'user.deleted','user',req.params.id,{email:target.email,deletedOwnedInvestigations:true});
    res.json({data:{deleted:true,id:String(req.params.id)}});
  }));
  app.get('/api/v1/admin/config',requireAdmin,wrap(async(req,res)=>{const cfg=await readPlatformConfig();res.json({data:cfg});}));
  app.put('/api/v1/admin/config',requireAdmin,wrap(async(req,res)=>{
    const body=req.body||{};const allowed=['maintenanceMode','featureFlags','usageLimits','retentionDays'];
    if(Object.keys(body).some(k=>!allowed.includes(k)))return sendError(res,400,'INVALID_SETTING','One or more settings are not editable here.');
    if('maintenanceMode'in body&&typeof body.maintenanceMode!=='boolean')return sendError(res,400,'INVALID_SETTING','maintenanceMode must be boolean.');
    if('featureFlags'in body&&(!body.featureFlags||typeof body.featureFlags!=='object'||Array.isArray(body.featureFlags)||Object.keys(body.featureFlags).some(k=>!['search','providerSettings','monitoring'].includes(k))||Object.values(body.featureFlags).some(v=>typeof v!=='boolean')))return sendError(res,400,'INVALID_SETTING','Feature flags must be booleans for supported features.');
    if('usageLimits'in body&&(!body.usageLimits||typeof body.usageLimits!=='object'||!Number.isInteger(body.usageLimits.searchesPerMinute)||body.usageLimits.searchesPerMinute<1||body.usageLimits.searchesPerMinute>300))return sendError(res,400,'INVALID_SETTING','Searches per minute must be between 1 and 300.');
    if('retentionDays'in body&&(!Number.isInteger(body.retentionDays)||body.retentionDays<7||body.retentionDays>3650))return sendError(res,400,'INVALID_SETTING','Retention must be between 7 and 3650 days.');
    for(const key of Object.keys(body))await writePlatformConfig(key,body[key],req.user.email);
    if(body.usageLimits)globalThis.__ADVERSE_SEARCH_LIMIT__=body.usageLimits.searchesPerMinute;
    await auditAdmin(req,'platform.config_updated','platform','settings',{keys:Object.keys(body)});
    res.json({data:await readPlatformConfig()});
  }));
  app.get('/api/v1/admin/providers',requireAdmin,wrap(async(req,res)=>{
    const keys=await getUserProviderKeys(req.user.id);const catalog=getProviderCatalog(keys);
    res.json({data:catalog.map(p=>({id:p.id||p.key||p.name,name:p.name||p.label||p.id,configured:Boolean(p.configured),access:p.access||'unknown',description:p.description||'',status:p.configured?'configured':p.access==='public'?'public':'not_configured'}))});
  }));
  app.post('/api/v1/admin/providers/test',requireAdmin,wrap(async(req,res)=>{
    const started=Date.now();const keys=await getUserProviderKeys(req.user.id);
    const result=await searchAllPublic('ADVERSE search provider connectivity check',keys).catch(e=>({results:[],queryPlan:[],meta:{},error:String(e?.message||'Provider test failed')}));
    const providers=[...new Set((result.results||[]).flatMap(x=>[x.provider,...(x.providers||[])].filter(Boolean)))];
    const outcome={ok:Boolean((result.results||[]).length),durationMs:Date.now()-started,providers,resultsTested:(result.results||[]).length,queryPlan:result.queryPlan||[],error:result.error||'',testedAt:new Date().toISOString(),note:'This performs a real bounded search through configured providers; providers not selected by the search planner may not be exercised.'};
    if(isDb())await SearchMetric.create({kind:'provider_test',route:'/api/v1/admin/providers/test',method:'POST',status:outcome.ok?200:502,durationMs:outcome.durationMs,userId:req.user.id,provider:providers.join(',').slice(0,250),resultCount:outcome.resultsTested,errorCode:outcome.ok?'':'PROVIDER_TEST_FAILED'});
    await auditAdmin(req,'provider.connectivity_tested','providers','all',{ok:outcome.ok,providers,durationMs:outcome.durationMs});
    res.json({data:outcome});
  }));
  app.get('/api/v1/admin/incidents',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return res.json({data:[],note:'Incident history requires MongoDB persistence.'});
    const rows=await Incident.find({}).sort({createdAt:-1}).limit(100).lean();res.json({data:rows});
  }));
  app.post('/api/v1/admin/incidents',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Incident persistence requires MongoDB.');
    const p=z.object({title:z.string().trim().min(3).max(200),description:z.string().max(4000).default(''),severity:z.enum(['low','medium','high','critical']).default('medium')}).safeParse(req.body);
    if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Provide a title and valid incident severity.');
    const row=await Incident.create({...p.data,status:'open',source:'admin',createdBy:req.user.email});
    await auditAdmin(req,'incident.created','incident',row.id,{severity:row.severity});
    res.status(201).json({data:row});
  }));
  app.patch('/api/v1/admin/incidents/:id',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Incident persistence requires MongoDB.');
    const p=z.object({status:z.enum(['open','investigating','resolved'])}).safeParse(req.body);
    if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Choose open, investigating, or resolved.');
    const row=await Incident.findByIdAndUpdate(req.params.id,{$set:{status:p.data.status,resolvedAt:p.data.status==='resolved'?new Date():null,updatedAt:new Date()}},{new:true});
    if(!row)return sendError(res,404,'INCIDENT_NOT_FOUND','Incident not found.');
    await auditAdmin(req,'incident.status_changed','incident',row.id,{status:row.status});
    res.json({data:row});
  }));
  app.get('/api/v1/admin/jobs',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return res.json({data:[],note:'Job history requires MongoDB persistence.'});
    const rows=await JobRun.find({}).sort({startedAt:-1}).limit(100).lean();res.json({data:rows});
  }));
  app.post('/api/v1/admin/jobs/monitoring/run',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled monitoring requires MongoDB.');
    const started=Date.now();const job=await JobRun.create({name:'manual-monitoring-cycle',status:'running',startedAt:new Date()});
    try{const result=await runMonitoringCycle();job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Monitoring cycle completed.';job.metadata={resultCount:Array.isArray(result)?result.length:undefined};await job.save();await auditAdmin(req,'monitoring.run','job',job.id,{durationMs:job.durationMs});res.json({data:{jobId:String(job._id),status:job.status,durationMs:job.durationMs,result}});}
    catch(e){job.status='failed';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message=String(e?.message||'Monitoring failed').slice(0,1000);await job.save();throw e;}
  }));
  app.get('/api/v1/admin/backup',requireAdmin,wrap(async(req,res)=>{
    const configured=Boolean(process.env.BACKUP_LAST_SUCCESS_AT&&process.env.BACKUP_VERIFICATION_STATUS);
    res.json({data:{configured,lastSuccessAt:process.env.BACKUP_LAST_SUCCESS_AT||null,verificationStatus:configured?process.env.BACKUP_VERIFICATION_STATUS:'not_configured',restoreTested:process.env.BACKUP_RESTORE_TESTED==='true',message:configured?'Status is reported by environment metadata; this API does not itself create or restore database backups.':'No backup integration is configured. Set up automated MongoDB backups and publish verified status before relying on recovery.'}});
  }));
  app.get('/api/v1/admin/export',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Data exports require MongoDB persistence.');
    const format=String(req.query.format||'json');if(!['json','csv'].includes(format))return sendError(res,400,'INVALID_FORMAT','Use json or csv.');
    const [users,investigations,metrics]=await Promise.all([User.find({}).select('email displayName status createdAt updatedAt').lean(),Investigation.find({}).select('title status ownerId createdAt updatedAt').lean(),SearchMetric.countDocuments({})]);
    const data={generatedAt:new Date().toISOString(),users:users.map(x=>({id:String(x._id),email:x.email,displayName:x.displayName,status:x.status||'active',createdAt:x.createdAt})),investigations:investigations.map(x=>({id:String(x._id),title:x.title,status:x.status,ownerId:x.ownerId,createdAt:x.createdAt})),telemetry:{recordCount:metrics}};
    await auditAdmin(req,'data.exported','platform','data',{format,userCount:users.length,investigationCount:investigations.length});
    if(format==='csv'){const rows=[['recordType','id','email','displayName','status','title','ownerId','createdAt'],...data.users.map(x=>['user',x.id,x.email,x.displayName,x.status,'','',x.createdAt||'']),...data.investigations.map(x=>['investigation',x.id,'','','',x.title,x.ownerId,x.createdAt||''])];const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\\r\\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="adverse-admin-export.csv"');return res.send(csv);}
    res.setHeader('Content-Disposition','attachment; filename="adverse-admin-export.json"');res.json({data});
  }));
  app.post('/api/v1/admin/retention/run',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Retention cleanup requires MongoDB persistence.');
    const cfg=await readPlatformConfig();const days=Number(cfg.retentionDays)||90;const before=new Date(Date.now()-days*86400000);
    const result=await SearchMetric.deleteMany({createdAt:{$lt:before}});
    await auditAdmin(req,'retention.cleanup','metrics','search',{days,deleted:result.deletedCount||0});
    res.json({data:{retentionDays:days,deletedMetrics:result.deletedCount||0,cutoff:before.toISOString()}});
  }));
  app.post('/api/v1/admin/links/check',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Link-check history requires MongoDB persistence.');
    const p=z.object({urls:z.array(z.string().url()).min(1).max(20)}).safeParse(req.body);
    if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Provide between 1 and 20 valid HTTP(S) URLs.');
    const results=[];
    for(const raw of p.data.urls){
      const started=Date.now();let status=0,ok=false,error='';
      try{
        const url=await validatePublicUrlResolution(raw);
        const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),7000);
        try{const response=await fetch(url.href,{method:'HEAD',redirect:'manual',signal:controller.signal,headers:{'user-agent':'ADVERSE-LinkMonitor/1.0'}});status=response.status;ok=status>=200&&status<400;if(status===405||status===501){const fallback=await fetch(url.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'user-agent':'ADVERSE-LinkMonitor/1.0','range':'bytes=0-0'}});status=fallback.status;ok=status>=200&&status<400;}}
        finally{clearTimeout(timeout);}
        if(status>=300&&status<400)error='Redirect observed; not followed for safety.';
        else if(!ok)error='HTTP status '+status;
      }catch(e){error=String(e?.message||'Link check failed').slice(0,300);}
      const result={url:raw,normalizedUrl:raw,status,ok,latencyMs:Date.now()-started,checkedAt:new Date(),error};
      await LinkCheck.create(result);results.push(result);
      await SearchMetric.create({kind:'link_check',route:'/api/v1/admin/links/check',method:'POST',status:ok?200:502,durationMs:result.latencyMs,userId:req.user.id,resultCount:ok?1:0,errorCode:ok?'':'LINK_CHECK_FAILED'});
    }
    await auditAdmin(req,'links.checked','link-check','batch',{count:results.length,failed:results.filter(x=>!x.ok).length});
    res.json({data:results});
  }));
  app.get('/api/v1/admin/links',requireAdmin,wrap(async(req,res)=>{
    if(!isDb())return res.json({data:[],note:'Link-check history requires MongoDB persistence.'});
    const rows=await LinkCheck.find({}).sort({checkedAt:-1}).limit(100).lean();res.json({data:rows});
  }));
  app.post('/api/v1/admin/logout',(req,res)=>{res.setHeader('Set-Cookie',`adverse_session=; HttpOnly; Path=/; SameSite=${process.env.NODE_ENV==='production'?'None':'Strict'}; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);res.status(204).end();});
  app.delete('/api/v1/auth/account',requireAuth,wrap(async(req,res)=>{const uid=String(req.user.id);if(isDb()){const owned=await Investigation.find({ownerId:uid}).select('_id').lean();const ids=owned.map(item=>String(item._id));await Promise.all([Investigation.deleteMany({ownerId:uid}),Evidence.deleteMany({investigationId:{$in:ids}}),Entity.deleteMany({investigationId:{$in:ids}}),Relationship.deleteMany({investigationId:{$in:ids}}),Watch.deleteMany({investigationId:{$in:ids}}),Alert.deleteMany({investigationId:{$in:ids}}),CyberAsset.deleteMany({investigationId:{$in:ids}}),CyberEvent.deleteMany({investigationId:{$in:ids}}),User.deleteOne({_id:uid})]);}else{for(const [iid,item] of memory.investigations)if(String(item.ownerId)===uid){memory.investigations.delete(iid);for(const collection of ['evidence','entities','relationships','watches','alerts','cyberAssets','cyberEvents'])for(const [rid,record] of memory[collection])if(String(record.investigationId)===String(iid))memory[collection].delete(rid);}memory.users.delete(uid);}res.setHeader('Set-Cookie',`adverse_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);res.status(204).end();}));
}
