import React, { useState } from 'react';
import type { DailyPriority } from '../types';
import { AppIcon } from './AppIcon';

interface TodayFocusProps {
  priorities: DailyPriority[];
  onAdd: (text: string) => void;
  onToggle: (priority: DailyPriority) => void;
  onRemove: (id: string) => void;
}

export const TodayFocus: React.FC<TodayFocusProps> = ({ priorities, onAdd, onToggle, onRemove }) => {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const sorted = [...priorities].sort((a, b) => a.rank - b.rank);
  const completedCount = sorted.filter((item) => item.done).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sorted.length >= 3) return;
    onAdd(text.trim());
    setText('');
    setAdding(false);
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--blue-soft)] text-[var(--blue)]">
            <AppIcon name="target" className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--text)] tracking-tight">
                Las 3 Prioridades
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono ${
                  completedCount === 3
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                }`}
              >
                {completedCount}/3 {completedCount === 3 ? 'completadas ✓' : 'listas'}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
              Los 3 resultados indispensables que definen el éxito de tu día.
            </p>
          </div>
        </div>

        {sorted.length < 3 && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] hover:border-[var(--blue)] transition cursor-pointer"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            <span>Agregar</span>
          </button>
        )}
      </div>

      {/* Inline Form to add priority */}
      {adding && sorted.length < 3 && (
        <form onSubmit={submit} className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Escribí la prioridad #${sorted.length + 1}...`}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--blue)] transition"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--blue-hover)] disabled:opacity-40 cursor-pointer"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText('');
            }}
            className="rounded-xl border border-[var(--border)] px-2.5 py-2 text-xs font-medium text-[var(--text-soft)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* 3 Priority Cards / Slots */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[1, 2, 3].map((slotRank) => {
          const item = sorted.find((p) => p.rank === slotRank);

          if (item) {
            return (
              <div
                key={item.id}
                className={`group relative flex items-center gap-2.5 rounded-xl border p-3 transition-all ${
                  item.done
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)]'
                }`}
              >
                {/* Complete checkbox / rank button */}
                <button
                  type="button"
                  onClick={() => onToggle(item)}
                  title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition cursor-pointer ${
                    item.done
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:border-[var(--blue)] hover:text-[var(--blue)]'
                  }`}
                >
                  {item.done ? '✓' : item.rank}
                </button>

                {/* Priority title */}
                <span
                  onClick={() => onToggle(item)}
                  className={`min-w-0 flex-1 truncate text-xs font-semibold cursor-pointer select-none transition ${
                    item.done
                      ? 'text-[var(--text-faint)] line-through'
                      : 'text-[var(--text)] group-hover:text-[var(--text)]'
                  }`}
                  title={item.text}
                >
                  {item.text}
                </span>

                {/* Remove from top 3 */}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Quitar de las 3 prioridades"
                  className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-[11px] text-[var(--text-faint)] hover:text-rose-500 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            );
          }

          {/* Empty slot */}
          return (
            <button
              key={`empty-${slotRank}`}
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-transparent p-3 text-xs text-[var(--text-faint)] hover:border-[var(--blue)] hover:text-[var(--blue)] hover:bg-[var(--blue-soft)]/20 transition cursor-pointer"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-[10px] font-mono">
                {slotRank}
              </span>
              <span>+ Definir prioridad {slotRank}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
