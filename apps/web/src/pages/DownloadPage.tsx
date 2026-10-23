import { Apple, Check, ExternalLink, Fingerprint, Globe, ShieldCheck } from 'lucide-react';
import '../download-page.css';

const HOME_URL = 'https://adverse-web.onrender.com/';

export default function DownloadPage() {
  return (
    <main className="adverse-download-page adverse-iphone-install-page">
      <header className="adverse-download-header">
        <a href={HOME_URL} className="adverse-download-brand" aria-label="ADVERSE home">
          <span className="adverse-download-brand-icon"><Fingerprint size={27} /></span>
          <span>ADVERSE<span className="adverse-download-brand-dot">.</span></span>
        </a>
        <a className="adverse-download-home" href={HOME_URL}>Open workspace <ExternalLink size={15} /></a>
      </header>

      <section className="adverse-download-hero adverse-iphone-hero">
        <span className="adverse-download-eyebrow">IPHONE PWA · HOME SCREEN APP</span>
        <h1>ADVERSE,<br /><em>one tap away.</em></h1>
        <p>Install the ADVERSE web app on your iPhone. It opens from your Home Screen in its own app-like window, using the familiar fingerprint identity — no App Store or separate download needed.</p>
        <div className="adverse-download-mark" aria-hidden="true"><Fingerprint size={45} strokeWidth={1.7} /></div>
      </section>

      <section className="adverse-iphone-install-panel" aria-labelledby="adverse-iphone-install-title">
        <div className="adverse-iphone-panel-heading">
          <span className="adverse-download-platform-icon"><Apple size={24} /></span>
          <div>
            <span className="adverse-download-status">IPHONE & IPAD · PWA</span>
            <h2 id="adverse-iphone-install-title">Add ADVERSE to Home Screen</h2>
          </div>
        </div>

        <a className="adverse-download-primary adverse-iphone-open" href={HOME_URL}>
          <Globe size={18} /> Open ADVERSE in Safari
        </a>
        <p className="adverse-iphone-callout"><ShieldCheck size={17} /> Safari is recommended for adding a web app to iPhone.</p>

        <ol className="adverse-iphone-steps">
          <li><span className="adverse-iphone-step-number">1</span><div><strong>Open ADVERSE in Safari</strong><p>Tap the button above. If this page opened inside another app, open the link in Safari instead.</p></div></li>
          <li><span className="adverse-iphone-step-number">2</span><div><strong>Tap the Share button</strong><p>Find the Share icon in Safari’s toolbar. Depending on your iOS version, it may be inside the page menu.</p></div></li>
          <li><span className="adverse-iphone-step-number">3</span><div><strong>Choose “Add to Home Screen”</strong><p>If it is not visible, scroll through the Share actions or use “Edit Actions” if available.</p></div></li>
          <li><span className="adverse-iphone-step-number">4</span><div><strong>Tap “Add”</strong><p>If “Open as Web App” appears, keep it enabled. The ADVERSE fingerprint icon will appear on your Home Screen.</p></div></li>
        </ol>

        <div className="adverse-iphone-success">
          <Check size={18} />
          <p><strong>Ready.</strong> Launch ADVERSE from the fingerprint icon on your Home Screen whenever you need it.</p>
        </div>
        <small className="adverse-download-note">This is ADVERSE’s installable Progressive Web App (PWA), not an App Store or TestFlight build. It uses the live ADVERSE service and requires an internet connection for live research features.</small>
      </section>

      <footer className="adverse-download-footer">
        <span><Check size={16} /> Same ADVERSE service</span>
        <span><Fingerprint size={16} /> Original fingerprint identity</span>
        <a href={HOME_URL}>Go to ADVERSE <ExternalLink size={14} /></a>
      </footer>
    </main>
  );
}
