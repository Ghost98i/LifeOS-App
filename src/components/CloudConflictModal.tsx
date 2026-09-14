import React from 'react';
import { SYNC_MODULE_LABELS, type SyncModuleKey } from '../lib/syncModel';

interface CloudConflictModalProps {
  onUseLocal: () => void;
  onUseCloud: () => void;
  modules: SyncModuleKey[];
}

export const CloudConflictModal: React.FC<CloudConflictModalProps> = ({ onUseLocal, onUseCloud, modules }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="cloud-conflict-title" className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
      <div className="mb-4 text-3xl">🛟</div>
      <h2 id="cloud-conflict-title" className="text-lg font-extrabold text-[var(--text)]">Hay cambios distintos en dos dispositivos</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
        Los cambios se cruzaron en {modules.map((module) => SYNC_MODULE_LABELS[module]).join(', ')}. Elegí cuál versión conservar para {modules.length === 1 ? 'ese módulo' : 'esos módulos'}.
      </p>
      <div className="mt-5 grid gap-2">
        <button onClick={onUseLocal} className="rounded-2xl bg-[var(--blue)] px-4 py-3 text-sm font-extrabold text-white">Usar los datos de este dispositivo</button>
        <button onClick={onUseCloud} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-bold text-[var(--text)]">Usar los datos sincronizados</button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">Antes de reemplazar nada, LifeOS guarda la otra versión como copia de recuperación. También podés exportar un backup JSON.</p>
    </section>
  </div>
);
