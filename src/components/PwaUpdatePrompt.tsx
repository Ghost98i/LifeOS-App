import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PwaUpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <aside role="status" className="fixed bottom-24 left-3 right-3 z-[95] mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl sm:bottom-5">
      <p className="text-sm font-extrabold text-[var(--text)]">{needRefresh ? 'Hay una nueva versión de LifeOS' : 'LifeOS ya funciona sin conexión'}</p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{needRefresh ? 'Actualizá cuando termines lo que estás cargando. Tus datos ya están guardados.' : 'Podés cerrar este aviso y seguir trabajando.'}</p>
      <div className="mt-3 flex gap-2">
        {needRefresh && <button onClick={() => void updateServiceWorker(true)} className="rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-extrabold text-white">Actualizar ahora</button>}
        <button onClick={() => { setNeedRefresh(false); setOfflineReady(false); }} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-soft)]">{needRefresh ? 'Más tarde' : 'Entendido'}</button>
      </div>
    </aside>
  );
};
