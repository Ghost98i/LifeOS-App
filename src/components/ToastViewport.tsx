import React, { useEffect, useState } from 'react';
import { LIFEOS_TOAST_EVENT, type LifeOSToast } from '../lib/toast';
import { PrivateFinancialText } from './PrivacyAmount';
import { AppIcon } from './AppIcon';

export const ToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<LifeOSToast[]>([]);

  useEffect(() => {
    const receive = (event: Event) => {
      const toast = (event as CustomEvent<LifeOSToast>).detail;
      const ttl = toast.durationMs ?? (toast.onAction ? 6500 : 3200);
      setToasts((current) => [
        ...current.filter((item) => item.message !== toast.message).slice(-2),
        toast,
      ]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), ttl);
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
      className="pointer-events-none fixed inset-x-3 bottom-[calc(7.75rem+env(safe-area-inset-bottom))] z-[120] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => dismissToast(toast.id)}
          className={`toast-enter pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl md:w-96 cursor-pointer select-none transition-transform active:scale-[0.98] ${
            toast.tone === 'error'
              ? 'border-rose-500/30 bg-rose-950/90 text-rose-100 hover:bg-rose-950/95'
              : toast.tone === 'info'
              ? 'border-indigo-500/35 bg-slate-900/95 text-indigo-100 hover:bg-slate-900'
              : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100 hover:bg-emerald-950/95'
          }`}
          title="Toca para descartar"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              <AppIcon
                name={toast.tone === 'error' ? 'alertCircle' : toast.tone === 'info' ? 'bell' : 'check'}
                className="h-4 w-4"
              />
            </span>
            <span className="leading-snug break-words"><PrivateFinancialText>{toast.message}</PrivateFinancialText></span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.id);
                  toast.onAction?.();
                }}
                className="inline-flex min-h-8 items-center justify-center rounded-lg border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/25 cursor-pointer"
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              className="inline-flex min-h-[44px] min-w-[44px] -my-2 -mr-2 sm:min-h-0 sm:min-w-0 sm:my-0 sm:-mr-1 sm:p-1 items-center justify-center shrink-0 text-xs opacity-70 hover:opacity-100 rounded-lg transition-opacity cursor-pointer"
              aria-label="Descartar aviso"
            >
              <AppIcon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
