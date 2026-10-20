import { Watch, Alert } from './models.js';
import { waybackCaptures } from './providers.js';

let running = false;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function notifyAlertByEmail(alert, watch) {
  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.ALERT_EMAIL_FROM||'').trim();
  const to=String(process.env.ALERT_EMAIL_TO||'').trim();
  if(!apiKey||!from||!to)return;
  const id=String(alert.id||alert._id||'');
  const url=String(watch.url||'');
  const label=String(watch.label||url);
  const body={from,to:[to],subject:'ADVERSE archive alert: '+label,html:'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><h2>ADVERSE archive observation</h2><p>A newer Internet Archive capture was detected for <strong>'+escapeHtml(label)+'</strong>.</p><p><a href="'+escapeHtml(url)+'">Open watched public URL</a></p><p>'+escapeHtml(alert.message||'Review the archived source before drawing conclusions.')+'</p><p style="color:#66736d;font-size:12px">This alert reflects archive index availability, not proof of a live-page change or wrongdoing.</p></div>'};
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json','Idempotency-Key':'adverse-archive-alert-'+id},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      if(response.ok)return;
      if(response.status<500&&response.status!==429){console.warn('ADVERSE email alert rejected with HTTP '+response.status);return;}
    }catch(error){if(attempt===2){console.warn('ADVERSE email alert delivery failed:',String(error?.message||'network error').slice(0,160));return;}}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(2**attempt)));
  }
}

export async function runMonitoringCycle() {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || running) return { checked: 0, skipped: true };
  running = true;
  let checked = 0;
  try {
    const due = await Watch.find({ enabled: true, nextCheckAt: { $lte: new Date() } }).sort({ nextCheckAt: 1 }).limit(5).lean();
    for (const watch of due) {
      const now = new Date();
      const nextCheckAt = new Date(now.getTime() + Number(watch.intervalHours || 24) * 60 * 60 * 1000);
      try {
        const result = await waybackCaptures(watch.url);
        const latest = (result.captures || []).slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
        const latestTimestamp = latest?.timestamp || '';
        if (watch.lastCaptureTimestamp && latestTimestamp && latestTimestamp > watch.lastCaptureTimestamp) {
          const alert=await Alert.create({
            investigationId: watch.investigationId,
            watchId: String(watch._id),
            title: 'New archive capture detected',
            message: 'The Internet Archive returned a capture newer than the last recorded observation. Review the archived source before drawing conclusions.',
            url: watch.url,
            captureTimestamp: latestTimestamp,
            observedAt: now
          });
          await notifyAlertByEmail(alert,watch);
        }
        await Watch.updateOne({ _id: watch._id }, { $set: {
          lastCaptureTimestamp: latestTimestamp || watch.lastCaptureTimestamp || '',
          lastCheckedAt: now,
          nextCheckAt,
          lastError: ''
        }});
      } catch (error) {
        await Watch.updateOne({ _id: watch._id }, { $set: {
          lastCheckedAt: now,
          nextCheckAt,
          lastError: String(error?.message || 'Archive provider unavailable').slice(0, 500)
        }});
      }
      checked += 1;
    }
    return { checked, skipped: false };
  } finally {
    running = false;
  }
}

export function startMonitoringWorker() {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || process.env.MONITORING_ENABLED === 'false') return;
  const run = () => runMonitoringCycle().then(result => {
    if (result.checked) console.log('ADVERSE monitoring cycle completed', result);
  }).catch(error => console.error('ADVERSE monitoring cycle failed:', error?.message || 'unknown error'));
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  setTimeout(run, 15000).unref?.();
}
