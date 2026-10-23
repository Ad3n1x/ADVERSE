import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const dismissedKey = 'adverse-pwa-install-dismissed-until';

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    setInstalled(isStandalone());
    try {
      const dismissedUntil = Number(window.localStorage.getItem(dismissedKey) || 0);
      setDismissed(dismissedUntil > Date.now());
    } catch {
      // Storage can be unavailable in private browsing; the prompt still works.
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setHelpOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const install = async () => {
    if (!installEvent) {
      setHelpOpen((open) => !open);
      return;
    }

    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setHelpOpen(false);
      }
      setInstallEvent(null);
    } catch {
      setHelpOpen(true);
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    setHelpOpen(false);
    try {
      window.localStorage.setItem(dismissedKey, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // Dismiss for this session if storage is unavailable.
    }
  };

  return (
    <aside className="pwa-install-root" aria-label="Install ADVERSE">
      {helpOpen && (
        <section className="pwa-install-card" role="dialog" aria-labelledby="pwa-install-title">
          <div className="pwa-install-card-head">
            <span className="pwa-install-icon"><Smartphone size={19} /></span>
            <div>
              <strong id="pwa-install-title">Take ADVERSE with you</strong>
              <p>Install it for an app-like experience from your home screen.</p>
            </div>
            <button className="pwa-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close install help">
              <X size={17} />
            </button>
          </div>
          {installEvent ? (
            <p>Tap <strong>Install app</strong> to open your browser’s installation prompt.</p>
          ) : (
            <div className="pwa-install-steps">
              <p><strong>Android (Chrome)</strong><br />Open the browser menu (⋮), then choose <em>Install app</em> or <em>Add to Home screen</em>.</p>
              <p><strong>iPhone / iPad (Safari)</strong><br />Tap Share, then <em>Add to Home Screen</em>.</p>
              <p><strong>Desktop</strong><br />Look for the install icon in your browser’s address bar or open its menu.</p>
            </div>
          )}
          <button className="pwa-install-primary" type="button" onClick={install} disabled={!installEvent || installing}>
            <Download size={16} /> {installing ? 'Opening installer…' : 'Install app'}
          </button>
        </section>
      )}
      <div className="pwa-install-actions">
        <button className="pwa-install-trigger" type="button" onClick={install} aria-expanded={helpOpen}>
          <Download size={16} />
          <span>{installEvent ? 'Install ADVERSE' : 'Install app'}</span>
        </button>
        <button className="pwa-dismiss" type="button" onClick={dismiss} aria-label="Hide install prompt for a week" title="Hide for a week">
          <X size={15} />
        </button>
      </div>
    </aside>
  );
}
