import React, { useEffect } from 'react';
import { SYNC_MODULE_LABELS, type SyncModuleKey, type SyncConflictItem } from '../lib/syncModel';

interface CloudConflictModalProps {
  onUseLocal: () => void;
  onUseCloud: () => void;
  onCombine?: () => void;
  modules: SyncModuleKey[];
  conflicts?: SyncConflictItem[];
}

export const CloudConflictModal: React.FC<CloudConflictModalProps> = ({
  onUseLocal,
  onUseCloud,
  onCombine,
  modules,
  conflicts = [],
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // En caso de conflicto no permitimos cierre silencioso sin resolución,
        // pero evitamos propagar la tecla.
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-conflict-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="text-3xl">🛟</div>
          <div>
            <h2 id="cloud-conflict-title" className="text-lg font-extrabold text-[var(--text)]">
              Conflicto de sincronización detectado
            </h2>
            <p className="text-xs text-[var(--text-soft)]">
              {modules.map((m) => SYNC_MODULE_LABELS[m]).join(', ')}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[var(--text-soft)]">
          Se detectaron modificaciones concurrentes en dos dispositivos. Para evitar perder información, revisá las diferencias y elegí cómo continuar:
        </p>

        {conflicts.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs max-h-56 overflow-y-auto">
            <div className="font-bold text-[var(--text)] uppercase tracking-wider text-[10px]">
              Diferencias puntuales ({conflicts.length}):
            </div>
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 space-y-1">
                <div className="font-semibold text-[var(--text)]">{c.label}</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-1.5">
                    <span className="font-bold text-[var(--blue)] block text-[10px] uppercase">Este dispositivo</span>
                    <span className="text-[var(--text)] font-mono">{c.localSummary}</span>
                  </div>
                  <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-1.5">
                    <span className="font-bold text-purple-600 dark:text-purple-400 block text-[10px] uppercase">Otro dispositivo</span>
                    <span className="text-[var(--text)] font-mono">{c.remoteSummary}</span>
                  </div>
                </div>
                {c.baseSummary && (
                  <div className="text-[10px] text-[var(--text-faint)]">
                    Valor base anterior: <span className="font-mono">{c.baseSummary}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-2 pt-2">
          <button
            onClick={onUseLocal}
            className="rounded-2xl bg-[var(--blue)] px-4 py-3 text-sm font-extrabold text-white transition hover:opacity-90 active:scale-[0.99]"
          >
            Conservar datos de este dispositivo
          </button>
          <button
            onClick={onUseCloud}
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-bold text-[var(--text)] transition hover:bg-[var(--surface-hover)] active:scale-[0.99]"
          >
            Conservar datos sincronizados del otro dispositivo
          </button>
          {onCombine && (
            <button
              onClick={onCombine}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Combinar cambios compatibles
            </button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--text-faint)] text-center">
          {modules.includes('gym')
            ? 'Antes de continuar se guardará una copia local de la versión que no elijas. Si ese guardado falla, el conflicto seguirá bloqueado.'
            : 'Antes de elegir, revisá qué versión querés conservar. La versión descartada se guarda como copia de recuperación cuando el almacenamiento local lo permite.'}
        </p>
      </section>
    </div>
  );
};
