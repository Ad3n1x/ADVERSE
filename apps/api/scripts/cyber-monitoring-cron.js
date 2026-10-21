import 'dotenv/config';

const base=String(process.env.API_URL||'').trim().replace(/\/$/,'');
const secret=String(process.env.CYBER_MONITORING_CRON_SECRET||'').trim();
if(!base||!secret){console.error('API_URL and CYBER_MONITORING_CRON_SECRET are required.');process.exit(2);}
let endpoint;
try{endpoint=new URL('/api/v1/internal/cyber-monitoring/run',base);if(endpoint.protocol!=='https:')throw new Error('HTTPS is required');}
catch(error){console.error('A valid HTTPS API_URL is required:',String(error?.message||error));process.exit(2);}
try{
 const response=await fetch(endpoint,{method:'POST',headers:{'x-cyber-monitoring-secret':secret,accept:'application/json'},signal:AbortSignal.timeout(55000)});
 const body=await response.text();
 if(!response.ok){console.error('ADVERSE cyber-monitoring scheduler failed with HTTP '+response.status+': '+body.slice(0,500));process.exit(1);}
 console.log('ADVERSE cyber-monitoring scheduler completed:',body.slice(0,2000));
}catch(error){console.error('ADVERSE cyber-monitoring scheduler request failed:',String(error?.message||error));process.exit(1);}
