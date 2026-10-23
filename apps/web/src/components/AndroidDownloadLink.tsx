import { useState } from 'react';
import { ArrowUpRight, Fingerprint, X } from 'lucide-react';

const DOWNLOAD_PAGE_URL = 'https://adverse-web.onrender.com/download';
const DISMISSED_KEY = 'adverse-download-confirmed';

const isNativeAndroid = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('ADVERSENativeAndroid/1');

const isInstalledApp = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  // Native Android wrapper identifies itself with this user-agent marker.
  if (isNativeAndroid()) return true;

  // Installed PWAs run in standalone/minimal UI instead of a browser tab.
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches;

  // Safari on iOS exposes navigator.standalone for Home Screen web apps.
  const iosHomeScreenApp = 'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return Boolean(displayMode || iosHomeScreenApp);
};

export default function AndroidDownloadLink() {
  const [dismissed, setDismissed] = useState(() => {
    if (isInstalledApp()) return true;
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === 'yes';
    } catch {
      return false;
    }
  });
  const [asking, setAsking] = useState(true);

  const confirmDownloaded = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'yes');
    } catch {
      // The prompt still dismisses for this session if storage is unavailable.
    }
    setDismissed(true);
  };

  // Download/install reminders belong on the website, never inside the app.
  if (dismissed || isInstalledApp()) return null;

  return (
    <aside className="adverse-download-nudge" aria-label="ADVERSE download">
      {asking && (
        <div className="adverse-download-nudge__question" role="dialog" aria-label="Download confirmation">
          <button className="adverse-download-nudge__close" type="button" aria-label="Close download question" onClick={() => setAsking(false)}>
            <X size={16} />
          </button>
          <strong>Have you downloaded ADVERSE?</strong>
          <span>Already got it? We’ll get this reminder out of your way.</span>
          <div className="adverse-download-nudge__actions">
            <button type="button" onClick={confirmDownloaded}>Yes, I have</button>
            <button type="button" className="is-secondary" onClick={() => window.location.assign(DOWNLOAD_PAGE_URL)}>Not yet</button>
          </div>
        </div>
      )}
      {!asking && (
        <button className="adverse-android-download" type="button" onClick={() => setAsking(true)}>
          <span className="adverse-android-download__icon" aria-hidden="true"><Fingerprint size={19} strokeWidth={2.2} /></span>
          <span className="adverse-android-download__label"><strong>Get ADVERSE</strong><small>Android · iPhone · Web</small></span>
          <ArrowUpRight className="adverse-android-download__arrow" size={18} />
        </button>
      )}
    </aside>
  );
}
