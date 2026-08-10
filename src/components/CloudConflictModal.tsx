import React from 'react';

interface CloudConflictModalProps {
  onUseLocal: () => void;
  onUseCloud: () => void;
}

export const CloudConflictModal: React.FC<CloudConflictModalProps> = ({ onUseLocal, onUseCloud }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
    <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
      <div className="mb-4 text-3xl">🛟</div>
      <h2 className="text-lg font-extrabold text-[var(--text)]">Encontré dos versiones de LifeOS</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
        Este dispositivo y la nube contienen datos. Para evitar sobrescribir información sin avisarte, elegí cuál debe quedar como principal.
      </p>
      <div className="mt-5 grid gap-2">
        <button onClick={onUseLocal} className="rounded-2xl bg-[var(--blue)] px-4 py-3 text-sm font-extrabold text-white">Usar los datos de este dispositivo</button>
        <button onClick={onUseCloud} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-bold text-[var(--text)]">Usar los datos sincronizados</button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">La versión reemplazada queda en la copia local de recuperación y también podés exportar backups JSON.</p>
    </section>
  </div>
);
