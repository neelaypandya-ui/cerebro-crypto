/* ============================================================
   Toasts — Notification toast renderer
   ============================================================ */

import { useEffect } from 'react';
import useStore from '../../store';
import './Toasts.css';

const TOAST_DURATION = 4000;

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  // Auto-dismiss toasts after duration
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const age = Date.now() - oldest.timestamp;
    const remaining = Math.max(TOAST_DURATION - age, 200);

    const timer = setTimeout(() => {
      removeToast(oldest.id);
    }, remaining);

    return () => clearTimeout(timer);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.slice(0, 5).map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type || 'info'}`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="toast-icon">
            {toast.type === 'success' ? '\u2713' :
             toast.type === 'error' ? '\u2717' :
             toast.type === 'warning' ? '\u26A0' : '\u2139'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
