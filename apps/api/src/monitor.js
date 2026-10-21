import { Watch, Alert } from './models.js';
import { waybackCaptures, compareArchivedText, validatePublicUrl } from './providers.js';

let running = false;

export function hasMaterialArchiveChange(watch, latest) {
  const previousTimestamp=String(watch?.lastCaptureTimestamp||'');
  const nextTimestamp=String(latest?.timestamp||'');
  if(!previousTimestamp||!nextTimestamp||nextTimestamp<=previousTimestamp)return false;
  const previousDigest=String(watch?.lastCaptureDigest||'');
  const nextDigest=String(latest?.digest||'');
  return previousDigest&&nextDigest ? previousDigest!==nextDigest : true;
}

async function fetchArchivedText(url, timestamp) {
  const target = validatePublicUrl(url);
  if (!/^\d{14}$/.test(String(timestamp || ''))) throw new Error('Invalid archive timestamp.');
  const snapshot = new URL('https://web.archive.org/web/' + timestamp + 'id_/' + target.href);
  const response = await fetch(snapshot, {
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { 'user-agent': 'ADVERSE-Research/0.1 (bounded archive comparison)', accept: 'text/html,text/plain;q=0.9' }
  });
  if (response.status >= 300 && response.status < 400) throw new Error('Archive snapshot redirected; text comparison skipped.');
  if (!response.ok) throw new Error('Archive snapshot returned HTTP ' + response.status + '.');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) throw new Error('Archive snapshot is not text content.');
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > 1000000) throw new Error('Archive snapshot exceeds the 1 MB limit.');
    return text;
  }
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1000000) {
      await reader.cancel();
      throw new Error('Archive snapshot exceeds the 1 MB limit.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function compareArchiveSnapshots(url, from, to) {
  if (!/^\d{14}$/.test(String(from || '')) || !/^\d{14}$/.test(String(to || ''))) {
    throw new Error('Invalid archive timestamp.');
  }
  const [before, after] = await Promise.all([
    fetchArchivedText(url, from),
    fetchArchivedText(url, to)
  ]);
  return compareArchivedText(before, after);
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const emailConfig = () => ({
  apiKey: String(process.env.BREVO_API_KEY || '').trim(),
  from: String(process.env.ALERT_EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim(),
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
  const attempts = Number(alert.emailAttempts || 0) + 1;
  const delayMinutes = Math.min(60, 5 * (2 ** Math.min(attempts - 1, 4)));
  const update = {
    emailStatus: result.sent ? 'sent' : 'pending',
    emailLastError: result.reason,
    emailAttempts: attempts,
    emailNextAttemptAt: result.sent ? null : new Date(Date.now() + delayMinutes * 60 * 1000)
  };
  if (result.sent) update.emailSentAt = new Date();
  await Alert.updateOne({ _id: alert._id }, { $set: update });
}

async function retryPendingEmails() {
  const now = new Date();
  const pending = await Alert.find({ emailStatus: 'pending', $or: [{ emailNextAttemptAt: null }, { emailNextAttemptAt: { $exists: false } }, { emailNextAttemptAt: { $lte: now } }] }).sort({ emailNextAttemptAt: 1, observedAt: 1 }).limit(5).lean();
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
  let enabledWatches = 0;
  let dueWatches = 0;
  try {
    retriedEmails = await retryPendingEmails();
    const now = new Date();
    enabledWatches = await Watch.countDocuments({ enabled: true });
    const query = watchId ? { _id: watchId, enabled: true } : { enabled: true, nextCheckAt: { $lte: now } };
    dueWatches = await Watch.countDocuments(query);
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
          let diffSummary = '';
          if (watch.lastCaptureTimestamp && latestTimestamp > String(watch.lastCaptureTimestamp)) {
            try {
              const diff = await compareArchiveSnapshots(watch.url, String(watch.lastCaptureTimestamp), latestTimestamp);
              diffSummary = ' Heuristic archived-text comparison found ' + diff.added.length + ' added and ' + diff.removed.length + ' removed sentences';
              const examples = [
                ...diff.added.slice(0, 2).map(text => 'Added: ' + text),
                ...diff.removed.slice(0, 2).map(text => 'Removed: ' + text)
              ];
              if (examples.length) diffSummary += '. Examples: ' + examples.join(' | ');
              diffSummary += '. Extraction differences may create noise; review both original captures before drawing conclusions.';
            } catch (error) {
              diffSummary = ' Full text comparison was unavailable (' + String(error?.message || 'archive comparison failed').slice(0, 120) + '); compare the archived captures manually.';
            }
          }
          const alert = await Alert.create({
            investigationId: watch.investigationId,
            watchId: String(watch._id),
            title: hasFingerprint ? 'Archive content fingerprint changed' : 'New archive capture detected',
            message: (hasFingerprint
              ? 'A newer Internet Archive capture has a different archive digest from the last recorded observation.'
              : 'The Internet Archive returned a newer capture, but a comparable digest was unavailable.') + diffSummary + ' A capture difference does not establish why a page changed or imply wrongdoing.',
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
    return { checked, retriedEmails, enabledWatches, dueWatches, skipped: false };
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
