import { X } from 'lucide-react';
import type { ToastItem } from '../../types/research';

type ToastViewportProps = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

export default function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          className={'app-toast toast-' + toast.kind}
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-indicator" />
          <p>{toast.message}</p>
          <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
