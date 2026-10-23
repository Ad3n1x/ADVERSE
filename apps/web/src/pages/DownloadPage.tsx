import { ArrowDownToLine, Apple, Check, ExternalLink, Fingerprint, Globe, Smartphone } from 'lucide-react';
import '../download-page.css';

const ANDROID_APK_URL = 'https://github.com/Ad3n1x/ADVERSE/releases/download/android-latest/ADVERSE.apk';
const IOS_BUILD_URL = 'https://github.com/Ad3n1x/ADVERSE/actions/workflows/build-adverse-ios.yml';
const HOME_URL = 'https://adverse-web.onrender.com/';

export default function DownloadPage() {
  return (
    <main className="adverse-download-page">
      <header className="adverse-download-header">
        <a href={HOME_URL} className="adverse-download-brand" aria-label="ADVERSE home">
          <span className="adverse-download-brand-icon"><Fingerprint size={27} /></span>
          <span>ADVERSE<span className="adverse-download-brand-dot">.</span></span>
        </a>
        <a className="adverse-download-home" href={HOME_URL}>Open workspace <ExternalLink size={15} /></a>
      </header>

      <section className="adverse-download-hero">
        <span className="adverse-download-eyebrow">ONE WORKSPACE. YOUR DEVICE.</span>
        <h1>Take ADVERSE<br /><em>with you.</em></h1>
        <p>Choose the best way to use ADVERSE on your phone. Keep the fingerprint identity and the same public-source research workspace.</p>
        <div className="adverse-download-mark"><Fingerprint size={45} strokeWidth={1.7} /></div>
      </section>

      <section className="adverse-download-options" aria-label="Install options">
        <article className="adverse-download-card">
          <div className="adverse-download-card-top">
            <span className="adverse-download-platform-icon"><Smartphone size={23} /></span>
            <span className="adverse-download-status">ANDROID</span>
          </div>
          <h2>Android app</h2>
          <p>Install the ADVERSE Android companion as an APK. Android may ask you to confirm that you trust the source before installing.</p>
          <a className="adverse-download-primary" href={ANDROID_APK_URL}>
            <ArrowDownToLine size={17} /> Download APK
          </a>
          <small className="adverse-download-note">Direct download · Debug build, not Play Store signed</small>
        </article>

        <article className="adverse-download-card adverse-download-card-featured">
          <div className="adverse-download-card-top">
            <span className="adverse-download-platform-icon"><Apple size={23} /></span>
            <span className="adverse-download-status">IPHONE & IPAD</span>
          </div>
          <h2>iPhone web app</h2>
          <p>Use ADVERSE from your Home Screen with an app-like launch experience. iPhones do not install Android APK files.</p>
          <a className="adverse-download-primary" href={HOME_URL}>
            <Globe size={17} /> Open ADVERSE
          </a>
          <ol className="adverse-download-steps">
            <li>Open this site in <strong>Safari</strong>.</li>
            <li>Tap Safari’s <strong>Share</strong> button.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
          </ol>
          <small className="adverse-download-note">No App Store listing is available yet.</small>
        </article>

        <article className="adverse-download-card">
          <div className="adverse-download-card-top">
            <span className="adverse-download-platform-icon"><Apple size={23} /></span>
            <span className="adverse-download-status">NATIVE IOS</span>
          </div>
          <h2>Native iOS build</h2>
          <p>The Swift iOS app project and automated macOS build workflow are in the repository. A signed, installable release still needs Apple signing and distribution setup.</p>
          <a className="adverse-download-secondary" href={IOS_BUILD_URL}>
            <ExternalLink size={16} /> View iOS build workflow
          </a>
          <small className="adverse-download-note">Unsigned builds are for inspection, not direct installation.</small>
        </article>
      </section>

      <section className="adverse-download-footer">
        <span><Check size={16} /> Same ADVERSE service</span>
        <span><Fingerprint size={16} /> Original fingerprint identity</span>
        <a href={HOME_URL}>Go to ADVERSE <ExternalLink size={14} /></a>
      </section>
    </main>
  );
}
