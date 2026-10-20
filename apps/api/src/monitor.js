import { Watch, Alert } from './models.js';
import { waybackCaptures } from './providers.js';

let running = false;

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
          await Alert.create({
            investigationId: watch.investigationId,
            watchId: String(watch._id),
            title: 'New archive capture detected',
            message: 'The Internet Archive returned a capture newer than the last recorded observation. Review the archived source before drawing conclusions.',
            url: watch.url,
            captureTimestamp: latestTimestamp,
            observedAt: now
          });
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
