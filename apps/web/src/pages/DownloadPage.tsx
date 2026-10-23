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
        <span className="adverse-download-eyebrow">IPHONE INSTALL GUIDE</span>
        <h1>ADVERSE,<br /><em>one tap away.</em></h1>
        <p>Add ADVERSE to your iPhone Home Screen and launch it in its own app-like window. No App Store, account, or file download is required.</p>
        <div className="adverse-download-mark" aria-hidden="true"><Fingerprint size={45} strokeWidth={1.7} /></div>
      </section>

      <section className="adverse-iphone-install-panel" aria-labelledby="adverse-iphone-install-title">
        <div className="adverse-iphone-panel-heading">
          <span className="adverse-download-platform-icon"><Apple size={24} /></span>
          <div>
            <span className="adverse-download-status">IPHONE & IPAD</span>
            <h2 id="adverse-iphone-install-title">Install ADVERSE</h2>
          </div>
        </div>

        <a className="adverse-download-primary adverse-iphone-open" href={HOME_URL}>
          <Globe size={18} /> Open ADVERSE
        </a>
        <p className="adverse-iphone-callout"><ShieldCheck size={17} /> Use Safari for the most reliable setup.</p>

        <ol className="adverse-iphone-steps">
          <li><span className="adverse-iphone-step-number">1</span><div><strong>Open this page in Safari</strong><p>If it opened inside another app or browser, use its Share or menu option to open the link in Safari.</p></div></li>
          <li><span className="adverse-iphone-step-number">2</span><div><strong>Tap Share</strong><p>Use the Share icon in Safari. Depending on your iOS version and toolbar layout, you may need to open the page menu first.</p></div></li>
          <li><span className="adverse-iphone-step-number">3</span><div><strong>Choose “Add to Home Screen”</strong><p>If you cannot see it, scroll to the bottom of the Share actions and choose “Edit Actions” to add it.</p></div></li>
          <li><span className="adverse-iphone-step-number">4</span><div><strong>Tap “Add”</strong><p>If “Open as Web App” appears, leave it enabled. ADVERSE will get an icon on your Home Screen.</p></div></li>
        </ol>

        <div className="adverse-iphone-success">
          <Check size={18} />
          <p><strong>That’s it.</strong> Tap the ADVERSE fingerprint icon on your Home Screen whenever you want to open it.</p>
        </div>
        <small className="adverse-download-note">This Home Screen option is the web app, not the native iOS release. The TestFlight beta will be a separately signed iPhone app when distribution is ready.</small>
      </section>

      <section className="adverse-native-ios-panel" aria-labelledby="adverse-native-ios-title">
        <div className="adverse-iphone-panel-heading">
          <span className="adverse-download-platform-icon"><Apple size={24} /></span>
          <div>
            <span className="adverse-download-status">TESTFLIGHT BETA</span>
            <h2 id="adverse-native-ios-title">ADVERSE for iPhone</h2>
          </div>
        </div>
        <p className="adverse-native-ios-description">The native iOS app is being prepared for Apple TestFlight distribution. The build workflow now supports signing and uploading to App Store Connect once the Apple team and API credentials are configured. No TestFlight install link is available yet.</p>
        <a className="adverse-download-secondary adverse-native-ios-link" href="https://github.com/Ad3n1x/ADVERSE/actions/runs/39969402467" target="_blank" rel="noreferrer">
          View TestFlight build workflow <ExternalLink size={16} />
        </a>
        <p className="adverse-download-note">The beta becomes installable only after a signed build is accepted and processed by App Store Connect. Testers will then receive a TestFlight invitation.</p>
      </section>

      <footer className="adverse-download-footer">
        <span><Check size={16} /> Same ADVERSE service</span>
        <span><Fingerprint size={16} /> Original fingerprint identity</span>
        <a href={HOME_URL}>Go to ADVERSE <ExternalLink size={14} /></a>
      </footer>
    </main>
  );
}
