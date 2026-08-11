import React, { useEffect, useState } from 'react';
import { LIFEOS_TOAST_EVENT, type LifeOSToast } from '../lib/toast';

export const ToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<LifeOSToast[]>([]);

  useEffect(() => {
    const receive = (event: Event) => {
      const toast = (event as CustomEvent<LifeOSToast>).detail;
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3200);
    };
    window.addEventListener(LIFEOS_TOAST_EVENT, receive);
    return () => window.removeEventListener(LIFEOS_TOAST_EVENT, receive);
  }, []);

  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[120] flex flex-col items-center gap-2 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:items-end">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-enter flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl lg:w-96 ${toast.tone === 'error' ? 'border-rose-500/30 bg-rose-950/90 text-rose-100' : toast.tone === 'info' ? 'border-blue-500/30 bg-slate-900/90 text-blue-100' : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100'}`}>
          <span className="mt-0.5 shrink-0">{toast.tone === 'error' ? '!' : toast.tone === 'info' ? 'i' : '✓'}</span>
          <span className="leading-snug">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
