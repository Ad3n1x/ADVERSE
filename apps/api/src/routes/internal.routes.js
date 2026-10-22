export function registerInternalRoutes(app, {
  wrap, sendError, isDb, JobRun, runDiscoveryCycle, runMonitoringCycle,
  timingSafeEqual, CyberAsset, runCyberAssetCheck,
}) {
  app.post('/api/v1/internal/discovery/run',wrap(async(req,res)=>{
    const expected=String(process.env.DISCOVERY_CRON_SECRET||'');
    const supplied=String(req.get('x-discovery-secret')||'');
    if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Discovery scheduler authentication is required.');
    const a=Buffer.from(expected),b=Buffer.from(supplied);
    if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Discovery scheduler authentication failed.');
    if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled discovery requires MongoDB persistence.');
    const started=Date.now();const job=await JobRun.create({name:'scheduled-discovery-cycle',status:'running',startedAt:new Date()});
    const result=await runDiscoveryCycle();job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Discovery cycle completed.';await job.save();
    res.json({data:result,job:{id:String(job._id),status:job.status,durationMs:job.durationMs},generatedAt:new Date().toISOString()});
  }));
  app.post('/api/v1/internal/monitoring/run',wrap(async(req,res)=>{const expected=String(process.env.MONITORING_CRON_SECRET||'');const supplied=String(req.get('x-monitoring-secret')||'');if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Monitoring scheduler authentication is required.');const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Monitoring scheduler authentication failed.');if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled monitoring requires MongoDB persistence.');const started=Date.now();const job=await JobRun.create({name:'scheduled-monitoring-cycle',status:'running',startedAt:new Date()});const result=await runMonitoringCycle();job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Monitoring cycle completed.';await job.save();res.json({data:result,job:{id:String(job._id),status:job.status,durationMs:job.durationMs},generatedAt:new Date().toISOString()});}));
  
  // Admin authentication is separate from public registration. Configure ADMIN_EMAIL and
  // ADMIN_PASSWORD in the Render service environment.
  app.post('/api/v1/internal/cyber-monitoring/run',wrap(async(req,res)=>{
   const expected=String(process.env.CYBER_MONITORING_CRON_SECRET||''),supplied=String(req.get('x-cyber-monitoring-secret')||'');
   if(!expected||!supplied)return sendError(res,401,'CRON_AUTH_REQUIRED','Cyber-monitoring scheduler authentication is required.');
   const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!timingSafeEqual(a,b))return sendError(res,401,'CRON_AUTH_INVALID','Cyber-monitoring scheduler authentication failed.');
   if(!isDb())return sendError(res,503,'DATABASE_REQUIRED','Scheduled cyber monitoring requires MongoDB persistence.');
   const started=Date.now();const job=await JobRun.create({name:'scheduled-cyber-monitoring-cycle',status:'running',startedAt:new Date()});
   const now=new Date();
   const [enabledAssets,dueCount,due]=await Promise.all([
    CyberAsset.countDocuments({enabled:true}),
    CyberAsset.countDocuments({enabled:true,nextCheckAt:{$lte:now}}),
    CyberAsset.find({enabled:true,nextCheckAt:{$lte:now}}).sort({nextCheckAt:1}).limit(10).lean()
   ]);
   const results=[];
   for(const asset of due)results.push(await runCyberAssetCheck(asset));
   job.status='success';job.finishedAt=new Date();job.durationMs=Date.now()-started;job.message='Cyber-monitoring cycle completed.';job.metadata={checked:results.length,enabledAssets,dueAssets:dueCount};await job.save();
   res.json({data:{checked:results.length,enabledAssets,dueAssets:dueCount,results:results.map(x=>({assetId:String(x.asset?.id||x.asset?._id||''),events:x.observation?.events?.length||0,error:x.observation?.error||''}))},job:{id:String(job._id),status:job.status,durationMs:job.durationMs}});
  }));
  
}
