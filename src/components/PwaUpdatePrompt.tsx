import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppIcon } from './AppIcon';

export const PwaUpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  const [alreadyAcked, setAlreadyAcked] = useState(() => {
    try {
      return localStorage.getItem('lifeos_offline_ready_ack') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
    try {
      localStorage.setItem('lifeos_offline_ready_ack', 'true');
    } catch {}
    setAlreadyAcked(true);
  };

  // El aviso puramente informativo de modo sin conexión se auto-descarta tras 4.5 segundos
  // y se persiste en almacenamiento local para no saturar la pantalla en visitas recurrentes.
  useEffect(() => {
    if (!offlineReady || needRefresh || alreadyAcked) return;
    const timer = window.setTimeout(() => {
      setOfflineReady(false);
      try {
        localStorage.setItem('lifeos_offline_ready_ack', 'true');
      } catch {}
      setAlreadyAcked(true);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [offlineReady, needRefresh, alreadyAcked, setOfflineReady]);

  if (!needRefresh && (!offlineReady || alreadyAcked)) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className={
        needRefresh
          ? "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] inset-x-3 z-50 mx-auto max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md transition-all sm:inset-x-auto sm:bottom-6 sm:right-6 sm:mx-0 sm:max-w-sm"
          : "fixed top-14 sm:top-auto sm:bottom-6 sm:right-6 inset-x-4 sm:inset-x-auto z-40 mx-auto sm:mx-0 max-w-xs sm:max-w-sm rounded-xl border border-emerald-500/30 bg-[var(--card)]/95 px-3.5 py-2 shadow-lg backdrop-blur-md transition-all flex items-center justify-between gap-2.5 text-xs animate-in fade-in"
      }
    >
      {needRefresh ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[var(--text)]">Hay una nueva versión de Celestian LifeOS</p>
              <p className="mt-1 text-xs text-[var(--text-soft)]">Terminá de guardar tus formularios antes de actualizar.</p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 -mr-1 -mt-1 rounded-lg p-1.5 text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition cursor-pointer"
              aria-label="Cerrar aviso"
              title="Cerrar"
            >
              <AppIcon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="rounded-xl bg-[var(--blue)] px-3 py-1.5 text-xs font-extrabold text-white hover:opacity-90 transition cursor-pointer"
            >
              Actualizar ahora
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 px-3 py-1.5 text-xs font-bold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Más tarde
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] shrink-0" />
            <span className="font-semibold text-[var(--text)] truncate">Aplicación lista para uso sin conexión</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11px] font-bold text-[var(--blue)] hover:underline cursor-pointer px-1 py-0.5"
            >
              Entendido
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md p-1 text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition cursor-pointer"
              aria-label="Cerrar aviso"
              title="Cerrar"
            >
              <AppIcon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
