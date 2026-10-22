import { useEffect, useState } from 'react';
import type { ToastItem, ToastKind } from '../../types/research';

/**
 * Owns transient workspace feedback so feature actions can report outcomes
 * without coupling the workspace component to toast lifecycle management.
 */
export function useWorkspaceNotifications() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = (message: string, kind: ToastKind = 'info') => {
    setToasts((current) => [
      ...current,
      { id: Date.now() + Math.random(), message, kind },
    ].slice(-5));
  };

  useEffect(() => {
    if (!error) return;
    pushToast(error, 'error');
    setError('');
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    pushToast(notice, 'success');
    setNotice('');
  }, [notice]);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(
        () => setToasts((current) => current.filter((item) => item.id !== toast.id)),
        4500,
      ),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [toasts]);

  const notify = (message: string) => {
    setNotice(message);
    setError('');
  };

  return { toasts, setToasts, error, setError, notify };
}
