import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Copy, X, Share2 } from 'lucide-react';

function findUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const direct = new URL(trimmed);
    if (direct.protocol === 'http:' || direct.protocol === 'https:') return direct.href;
  } catch {
    // Shared text may contain a URL alongside other words.
  }
  const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return '';
  try {
    const parsed = new URL(match[0].replace(/[),.;!?]+$/, ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export default function SharedLinkHandler() {
  const [sharedUrl, setSharedUrl] = useState('');
  const [sharedTitle, setSharedTitle] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('share_target') !== '1') return;

    const incoming = params.get('url') || params.get('text') || '';
    setSharedUrl(findUrl(incoming));
    setSharedTitle(params.get('title') || 'Shared link');

    // Keep the shared URL in component state, not in the visible address bar.
    params.delete('share_target');
    params.delete('url');
    params.delete('text');
    params.delete('title');
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
  }, []);

  if (!sharedUrl) return null;

  const close = () => setSharedUrl('');
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(sharedUrl);
      setCopied(true);
    } catch {
      window.prompt('Copy this link', sharedUrl);
    }
  };

  return (
    <div className="shared-link-backdrop" role="presentation">
      <section className="shared-link-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-link-title">
        <div className="shared-link-heading">
          <span className="shared-link-icon"><Share2 size={20} /></span>
          <div>
            <p className="shared-link-eyebrow">SHARED TO ADVERSE</p>
            <h2 id="shared-link-title">Bring this link into your workflow</h2>
          </div>
          <button type="button" className="shared-link-close" onClick={close} aria-label="Close shared link"><X size={18} /></button>
        </div>
        <p className="shared-link-title-text">{sharedTitle}</p>
        <p className="shared-link-url">{sharedUrl}</p>
        <p className="shared-link-note">The link is now handed to ADVERSE. Open the source to read it, or copy its address to use in your investigation.</p>
        <div className="shared-link-actions">
          <button type="button" className="shared-link-primary" onClick={() => window.open(sharedUrl, '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={16} /> Open source
          </button>
          <button type="button" className="shared-link-secondary" onClick={copyLink}>
            <Copy size={16} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="shared-link-secondary" onClick={close}>
            <Link2 size={16} /> Continue in ADVERSE
          </button>
        </div>
      </section>
    </div>
  );
}
