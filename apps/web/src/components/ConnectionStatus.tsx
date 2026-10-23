import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

export default function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let restoreTimeout: ReturnType<typeof setTimeout> | undefined;
    const onOffline = () => {
      if (restoreTimeout) clearTimeout(restoreTimeout);
      setOnline(false);
      setShowRestored(false);
    };
    const onOnline = () => {
      setOnline(true);
      setShowRestored(true);
      restoreTimeout = setTimeout(() => setShowRestored(false), 3500);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (restoreTimeout) clearTimeout(restoreTimeout);
    };
  }, []);

  if (online && !showRestored) return null;

  return (
    <div className={online ? 'connection-status connection-status-online' : 'connection-status'} role="status" aria-live="polite">
      {online ? <Wifi size={15} /> : <CloudOff size={15} />}
      <span>{online ? 'Connection restored' : 'You’re offline · Saved app content may still be available'}</span>
    </div>
  );
}
