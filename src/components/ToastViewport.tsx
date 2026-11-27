import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LIFEOS_TOAST_EVENT, type LifeOSToast } from '../lib/toast';
import { triggerHaptic } from '../lib/haptics';
import { PrivateFinancialText } from './PrivacyAmount';
import { AppIcon } from './AppIcon';

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80';

export const ToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<LifeOSToast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const handledActionIdsRef = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    const receive = (event: Event) => {
      const toast = (event as CustomEvent<LifeOSToast>).detail;
      const ttl = toast.durationMs ?? (toast.onAction ? 6800 : 3200);
      setToasts((current) => [
        ...current.filter((item) => item.message !== toast.message).slice(-2),
        toast,
      ]);
      const timer = window.setTimeout(() => {
        timers.delete(toast.id);
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, ttl);
      timers.set(toast.id, timer);
    };
    window.addEventListener(LIFEOS_TOAST_EVENT, receive);
    return () => {
      window.removeEventListener(LIFEOS_TOAST_EVENT, receive);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const runToastAction = (toast: LifeOSToast) => {
    if (handledActionIdsRef.current.has(toast.id)) return;
    handledActionIdsRef.current.add(toast.id);
    dismissToast(toast.id);
    triggerHaptic('success');
    toast.onAction?.();
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
          className={`toast-enter pointer-events-auto flex w-full max-w-sm items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur-xl md:w-96 cursor-pointer select-none transition-transform active:scale-[0.98] ${
            toast.tone === 'error'
              ? 'border-rose-500/35 bg-rose-950/95 text-rose-50 hover:bg-rose-950'
              : toast.tone === 'info'
              ? 'border-indigo-400/35 bg-slate-900/95 text-slate-50 hover:bg-slate-900'
              : 'border-emerald-500/35 bg-emerald-950/95 text-emerald-50 hover:bg-emerald-950'
          }`}
          title="Toca para descartar"
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1 py-0.5">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              <AppIcon
                name={toast.tone === 'error' ? 'alertCircle' : toast.tone === 'info' ? 'bell' : 'check'}
                className={`h-4 w-4 ${
                  toast.tone === 'error'
                    ? 'text-rose-300'
                    : toast.tone === 'info'
                    ? 'text-indigo-300'
                    : 'text-emerald-300'
                }`}
              />
            </span>
            <span className="leading-snug break-words"><PrivateFinancialText>{toast.message}</PrivateFinancialText></span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  runToastAction(toast);
                }}
                className={`inline-flex min-h-[40px] sm:min-h-[34px] items-center justify-center rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  toast.tone === 'info'
                    ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                    : 'bg-white text-slate-950 hover:bg-slate-100'
                } ${CLEAN_FOCUS}`}
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
              className={`inline-flex min-h-[44px] min-w-[44px] -my-2 -mr-1.5 sm:min-h-8 sm:min-w-8 sm:my-0 sm:-mr-0.5 items-center justify-center shrink-0 text-xs opacity-75 hover:opacity-100 rounded-xl transition-opacity cursor-pointer ${CLEAN_FOCUS}`}
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
