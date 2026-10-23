import { Android, Apple, Check, Download, ExternalLink, Fingerprint, Globe, ShieldCheck } from 'lucide-react';
import '../download-page.css';

const HOME_URL = 'https://adverse-web.onrender.com/';
const APK_URL = 'https://github.com/Ad3n1x/ADVERSE/releases/download/android-latest/ADVERSE.apk';

export default function DownloadPage() {
  return (
    <main className="adverse-download-page adverse-device-download-page">
      <header className="adverse-download-header">
        <a href={HOME_URL} className="adverse-download-brand" aria-label="ADVERSE home">
          <span className="adverse-download-brand-icon"><Fingerprint size={27} /></span>
          <span>ADVERSE<span className="adverse-download-brand-dot">.</span></span>
        </a>
        <a className="adverse-download-home" href={HOME_URL}>Open workspace <ExternalLink size={15} /></a>
      </header>

      <section className="adverse-download-hero adverse-device-hero">
        <span className="adverse-download-eyebrow">ADVERSE · MOBILE ACCESS</span>
        <h1>Your research.<br /><em>Your device.</em></h1>
        <p>Choose your device to take ADVERSE with you. Android users can download the APK; iPhone and iPad users can add the web app to their Home Screen. Both connect to the same ADVERSE service.</p>
        <div className="adverse-download-mark" aria-hidden="true"><Fingerprint size={45} strokeWidth={1.7} /></div>
      </section>

      <section className="adverse-device-options" aria-label="Choose your device">
        <article className="adverse-download-card adverse-download-card-featured">
          <div className="adverse-download-card-top">
            <span className="adverse-download-platform-icon"><Download size={24} /></span>
            <span className="adverse-download-status">ANDROID · APK</span>
          </div>
          <h2>ADVERSE for Android</h2>
          <p>Download the Android companion app directly to your phone. If Android asks, allow installation from this source for this APK.</p>
          <a className="adverse-download-primary" href={APK_URL}><Download size={17} /> Download Android APK</a>
          <small className="adverse-download-note">Debug build · Not Play Store signed. Only install if you trust this source.</small>
          <a className="adverse-download-secondary adverse-device-secondary" href="https://github.com/Ad3n1x/ADVERSE/releases/tag/android-latest" target="_blank" rel="noreferrer"><ExternalLink size={15} /> View build details</a>
        </article>

        <article className="adverse-download-card adverse-device-iphone-card">
          <div className="adverse-download-card-top">
            <span className="adverse-download-platform-icon"><Apple size={24} /></span>
            <span className="adverse-download-status">IPHONE & IPAD · WEB APP</span>
          </div>
          <h2>Add ADVERSE to Home Screen</h2>
          <p>On iPhone or iPad, open ADVERSE in Safari and add it to your Home Screen. No App Store download is needed.</p>
          <a className="adverse-download-primary" href={HOME_URL}><Globe size={17} /> Open ADVERSE in Safari</a>
          <ol className="adverse-download-steps">
            <li><strong>Open in Safari</strong> — use the button above.</li>
            <li><strong>Tap Share</strong> — find Safari’s Share icon.</li>
            <li><strong>Choose “Add to Home Screen”</strong> — scroll the actions if needed.</li>
            <li><strong>Tap “Add”</strong> — launch ADVERSE from the new Home Screen icon.</li>
          </ol>
          <small className="adverse-download-note">This is the iPhone web app, not a native App Store release. It uses the same ADVERSE service.</small>
        </article>
      </section>

      <footer className="adverse-download-footer">
        <span><Check size={16} /> Same ADVERSE service</span>
        <span><Fingerprint size={16} /> Original fingerprint identity</span>
        <a href={HOME_URL}>Go to ADVERSE <ExternalLink size={14} /></a>
      </footer>
    </main>
  );
}
