const base=String(process.env.API_URL||'').trim().replace(/\/$/,'');
const secret=String(process.env.MONITORING_CRON_SECRET||'').trim();
if(!base||!secret){console.error('API_URL and MONITORING_CRON_SECRET are required.');process.exit(2);}
const endpoint=new URL('/api/v1/internal/monitoring/run',base);
try{
 const response=await fetch(endpoint,{method:'POST',headers:{'x-monitoring-secret':secret,accept:'application/json'},signal:AbortSignal.timeout(25000)});
 const body=await response.text();
 if(!response.ok){console.error('ADVERSE monitoring scheduler failed with HTTP '+response.status+': '+body.slice(0,500));process.exit(1);}
 console.log('ADVERSE monitoring scheduler completed:',body.slice(0,2000));
}catch(error){console.error('ADVERSE monitoring scheduler request failed:',String(error?.message||error));process.exit(1);}
