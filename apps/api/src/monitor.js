import { Watch, Alert } from './models.js';
import { waybackCaptures } from './providers.js';

let running = false;

export function hasMaterialArchiveChange(watch, latest) {
  const previousTimestamp=String(watch?.lastCaptureTimestamp||'');
  const nextTimestamp=String(latest?.timestamp||'');
  if(!previousTimestamp||!nextTimestamp||nextTimestamp<=previousTimestamp)return false;
  const previousDigest=String(watch?.lastCaptureDigest||'');
  const nextDigest=String(latest?.digest||'');
  return previousDigest&&nextDigest ? previousDigest!==nextDigest : true;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const emailConfig = () => ({
  apiKey: String(process.env.BREVO_API_KEY || '').trim(),
  from: String(process.env.ALERT_EMAIL_FROM || '').trim(),
  to: String(process.env.ALERT_EMAIL_TO || '').trim()
});

export async function notifyAlertByEmail(alert, watch) {
  const { apiKey, from, to } = emailConfig();
  if (!apiKey || !from || !to) return { sent: false, reason: 'Brevo email configuration is incomplete.' };
  const url = String(watch.url || '');
  const label = String(watch.label || url);
  const body = {
    sender: { email: from, name: 'ADVERSE' },
    to: [{ email: to }],
    subject: 'ADVERSE archive alert: ' + label,
    htmlContent: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><h2>ADVERSE archive observation</h2><p>A newer Internet Archive capture was detected for <strong>' + escapeHtml(label) + '</strong>.</p><p><a href="' + escapeHtml(url) + '">Open watched public URL</a></p><p>' + escapeHtml(alert.message || 'Review the archived source before drawing conclusions.') + '</p><p style="color:#66736d;font-size:12px">This alert reflects archive index availability, not proof of a live-page change or wrongdoing.</p></div>'
  };
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const reason = 'Brevo rejected the email with HTTP ' + response.status + '.';
      console.warn('ADVERSE ' + reason);
      return { sent: false, reason };
    }
    return { sent: true, reason: '' };
  } catch (error) {
    const reason = String(error?.message || 'Network error').slice(0, 250);
    console.warn('ADVERSE Brevo email alert delivery failed:', reason);
    return { sent: false, reason };
  }
}

async function deliverAndRecord(alert, watch) {
  if (!watch) {
    await Alert.updateOne({ _id: alert._id }, { $set: { emailStatus: 'disabled', emailLastError: 'Monitoring rule no longer exists.' } });
    return;
  }
  const result = await notifyAlertByEmail(alert, watch);
  const update = {
    emailStatus: result.sent ? 'sent' : 'pending',
    emailLastError: result.reason,
    emailAttempts: Number(alert.emailAttempts || 0) + 1
  };
  if (result.sent) update.emailSentAt = new Date();
  await Alert.updateOne({ _id: alert._id }, { $set: update });
}

async function retryPendingEmails() {
  const pending = await Alert.find({ emailStatus: 'pending' }).sort({ observedAt: 1 }).limit(5).lean();
  for (const alert of pending) {
    const watch = await Watch.findById(alert.watchId).lean();
    await deliverAndRecord(alert, watch);
  }
  return pending.length;
}

export async function runMonitoringCycle({ watchId = '' } = {}) {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || running) return { checked: 0, retriedEmails: 0, skipped: true };
  running = true;
  let checked = 0;
  let retriedEmails = 0;
  try {
    retriedEmails = await retryPendingEmails();
    const query = watchId ? { _id: watchId, enabled: true } : { enabled: true, nextCheckAt: { $lte: new Date() } };
    const due = await Watch.find(query).sort({ nextCheckAt: 1 }).limit(watchId ? 1 : 5).lean();
    for (const watch of due) {
      const now = new Date();
      const nextCheckAt = new Date(now.getTime() + Number(watch.intervalHours || 24) * 60 * 60 * 1000);
      try {
        const result = await waybackCaptures(watch.url);
        const latest = (result.captures || []).slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
        const latestTimestamp = latest?.timestamp || '';
        const shouldAlert = hasMaterialArchiveChange(watch, latest);
        if (shouldAlert) {
          const hasFingerprint = Boolean(latest?.digest && watch.lastCaptureDigest);
          const alert = await Alert.create({
            investigationId: watch.investigationId,
            watchId: String(watch._id),
            title: hasFingerprint ? 'Archive content fingerprint changed' : 'New archive capture detected',
            message: hasFingerprint
              ? 'A newer Internet Archive capture has a different archive digest from the last recorded observation. Compare the archived versions; digest differences do not establish why a change occurred.'
              : 'The Internet Archive returned a newer capture, but a comparable digest was unavailable. Review the archived source before drawing conclusions.',
            url: watch.url,
            captureTimestamp: latestTimestamp,
            observedAt: now,
            emailStatus: 'pending',
            emailAttempts: 0
          });
          await deliverAndRecord(alert, watch);
        }
        await Watch.updateOne({ _id: watch._id }, { $set: {
          lastCaptureTimestamp: latestTimestamp || watch.lastCaptureTimestamp || '',
          lastCaptureDigest: latest?.digest || watch.lastCaptureDigest || '',
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
    return { checked, retriedEmails, skipped: false };
  } finally {
    running = false;
  }
}

export function startMonitoringWorker() {
  if (globalThis.__ADVERSE_MONGO_READY__ !== true || process.env.MONITORING_ENABLED === 'false') return;
  const run = () => runMonitoringCycle().then(result => {
    if (result.checked || result.retriedEmails) console.log('ADVERSE monitoring cycle completed', result);
  }).catch(error => console.error('ADVERSE monitoring cycle failed:', error?.message || 'unknown error'));
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  setTimeout(run, 15000).unref?.();
}
