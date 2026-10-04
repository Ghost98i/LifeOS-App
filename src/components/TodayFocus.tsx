import React, { useState } from 'react';
import type { DailyPriority } from '../types';
import { AppIcon } from './AppIcon';

interface TodayFocusProps {
  priorities: DailyPriority[];
  onAdd: (text: string) => void;
  onToggle: (priority: DailyPriority) => void;
  onRemove: (id: string) => void;
  onSmartSuggest?: () => void;
}

export const TodayFocus: React.FC<TodayFocusProps> = ({
  priorities,
  onAdd,
  onToggle,
  onRemove,
  onSmartSuggest,
}) => {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const sorted = [...priorities].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const completedCount = sorted.filter((item) => item.done).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sorted.length >= 3) return;
    onAdd(text.trim());
    setText('');
    setAdding(false);
  };

  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold text-[var(--text)] tracking-tight">
            Prioridades del día
          </h2>
          <span className="font-mono text-[11px] font-bold text-[var(--text-soft)] px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]">
            {completedCount}/3
          </span>
        </div>

        {sorted.length < 3 && !adding && (
          <div className="flex items-center gap-1.5">
            {onSmartSuggest && (
              <button
                type="button"
                onClick={onSmartSuggest}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
                title="Sugerir según urgencias y vencimientos"
              >
                <AppIcon name="sparkles" className="h-3.5 w-3.5 text-purple-500" />
                <span className="hidden sm:inline">Sugerir</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Agregar</span>
            </button>
          </div>
        )}
      </div>

      {/* Inline Form to add priority */}
      {adding && sorted.length < 3 && (
        <form onSubmit={submit} className="flex items-center gap-2 pt-1 pb-2 border-b border-[var(--border)]">
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
            className="rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] px-3.5 py-2 text-xs font-bold transition hover:opacity-90 disabled:opacity-40 cursor-pointer shrink-0"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText('');
            }}
            className="rounded-xl border border-[var(--border)] px-2.5 py-2 text-xs font-medium text-[var(--text-soft)] hover:bg-[var(--surface-muted)] transition cursor-pointer shrink-0"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Linear Focus Rows */}
      <div className="divide-y divide-[var(--border)]">
        {[1, 2, 3].map((slotRank) => {
          const item = sorted.find((p) => p.rank === slotRank) || (!sorted.some((p) => p.rank === slotRank) ? sorted[slotRank - 1] : undefined);
          const rankStr = String(slotRank).padStart(2, '0');

          if (item) {
            return (
              <div
                key={item.id}
                className="group flex items-start gap-3 py-2.5 first:pt-1 last:pb-1 transition-colors"
              >
                {/* Discrete rank / check button */}
                <button
                  type="button"
                  onClick={() => onToggle(item)}
                  title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold transition cursor-pointer mt-0.5 ${
                    item.done
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-faint)] hover:border-[var(--blue)] hover:text-[var(--blue)]'
                  }`}
                >
                  {item.done ? '✓' : rankStr}
                </button>

                {/* Content */}
                <div
                  className="min-w-0 flex-1 cursor-pointer select-none"
                  onClick={() => onToggle(item)}
                >
                  <p
                    className={`text-xs sm:text-sm font-semibold leading-snug transition-all ${
                      item.done
                        ? 'text-[var(--text-faint)] line-through'
                        : 'text-[var(--text)]'
                    }`}
                  >
                    {item.text}
                  </p>
                  {item.reasons && item.reasons.length > 0 && (
                    <p className="text-[11px] text-[var(--text-faint)] mt-0.5 truncate">
                      {item.reasons.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Remove action */}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Quitar de las 3 prioridades"
                  className="opacity-0 group-hover:opacity-100 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-[var(--text-faint)] hover:text-rose-500 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            );
          }

          {/* Empty slot row */}
          return (
            <button
              key={`empty-${slotRank}`}
              type="button"
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-3 py-2.5 first:pt-1 last:pb-1 text-left text-xs text-[var(--text-faint)] hover:text-[var(--text-soft)] transition cursor-pointer group"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] font-mono text-[11px] font-bold text-[var(--text-faint)] group-hover:border-[var(--border-hover)]">
                {rankStr}
              </span>
              <span className="font-medium text-[var(--text-faint)] group-hover:text-[var(--text-soft)]">
                + Definir prioridad {slotRank}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
