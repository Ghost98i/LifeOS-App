import React, { useEffect, useState } from 'react';
import { LIFEOS_TOAST_EVENT, type LifeOSToast } from '../lib/toast';

export const ToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<LifeOSToast[]>([]);

  useEffect(() => {
    const receive = (event: Event) => {
      const toast = (event as CustomEvent<LifeOSToast>).detail;
      setToasts((current) => [
        ...current.filter((item) => item.message !== toast.message).slice(-2),
        toast,
      ]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3200);
    };
    window.addEventListener(LIFEOS_TOAST_EVENT, receive);
    return () => window.removeEventListener(LIFEOS_TOAST_EVENT, receive);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[120] flex flex-col items-center gap-2 lg:inset-x-auto lg:top-auto lg:bottom-6 lg:right-6 lg:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => dismissToast(toast.id)}
          className={`toast-enter pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl lg:w-96 cursor-pointer select-none transition-transform active:scale-[0.98] ${
            toast.tone === 'error'
              ? 'border-rose-500/30 bg-rose-950/90 text-rose-100 hover:bg-rose-950/95'
              : toast.tone === 'info'
              ? 'border-blue-500/30 bg-slate-900/90 text-blue-100 hover:bg-slate-900/95'
              : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100 hover:bg-emerald-950/95'
          }`}
          title="Toca para descartar"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {toast.tone === 'error' ? '!' : toast.tone === 'info' ? 'i' : '✓'}
            </span>
            <span className="leading-snug break-words">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(toast.id);
            }}
            className="shrink-0 -mr-1 -mt-1 p-1 text-xs opacity-60 hover:opacity-100 rounded-lg transition-opacity"
            aria-label="Descartar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
