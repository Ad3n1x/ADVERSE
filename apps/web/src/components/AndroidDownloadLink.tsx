import { useState } from 'react';
import { Download, Fingerprint, Share, X, Smartphone } from 'lucide-react';

const ANDROID_APK_URL =
  'https://github.com/Ad3n1x/ADVERSE/releases/download/android-latest/ADVERSE.apk';
const WEBSITE_URL = 'https://adverse-web.onrender.com';

function isAppleMobile() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function AndroidDownloadLink() {
  const [showIosHelp, setShowIosHelp] = useState(false);
  const appleMobile = isAppleMobile();

  if (appleMobile) {
    return (
      <>
        <button
          className="adverse-android-download"
          type="button"
          onClick={() => setShowIosHelp(true)}
          aria-label="Set up ADVERSE on iPhone or iPad"
          title="Set up ADVERSE on iPhone or iPad"
        >
          <span className="adverse-android-download__icon" aria-hidden="true">
            <Fingerprint size={19} strokeWidth={2.2} />
          </span>
          <span className="adverse-android-download__label">
            <strong>Get ADVERSE</strong>
            <small>iPhone · Add to Home Screen</small>
          </span>
          <Smartphone className="adverse-android-download__arrow" size={18} />
        </button>

        {showIosHelp && (
          <div className="adverse-ios-overlay" role="presentation" onClick={() => setShowIosHelp(false)}>
            <section
              className="adverse-ios-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="adverse-ios-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="adverse-ios-close" type="button" onClick={() => setShowIosHelp(false)} aria-label="Close">
                <X size={19} />
              </button>
              <span className="adverse-ios-mark"><Fingerprint size={28} /></span>
              <h2 id="adverse-ios-title">ADVERSE on your iPhone</h2>
              <p>Install the web app for a home-screen icon and an app-like experience. No App Store download is available yet.</p>
              <ol>
                <li>Open this page in <strong>Safari</strong> (not an in-app browser).</li>
                <li>Tap Safari’s <strong>Share</strong> button <Share size={15} className="adverse-ios-share-icon" />.</li>
                <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>. Launch ADVERSE from the new home-screen icon.</li>
              </ol>
              <a className="adverse-ios-open" href={WEBSITE_URL}>Open ADVERSE in Safari</a>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <a
      className="adverse-android-download"
      href={ANDROID_APK_URL}
      aria-label="Download ADVERSE for Android"
      title="Download ADVERSE for Android"
    >
      <span className="adverse-android-download__icon" aria-hidden="true">
        <Fingerprint size={19} strokeWidth={2.2} />
      </span>
      <span className="adverse-android-download__label">
        <strong>Get ADVERSE</strong>
        <small>Android app · APK</small>
      </span>
      <Download className="adverse-android-download__arrow" size={18} />
    </a>
  );
}
