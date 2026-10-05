import React, { useState } from 'react';
import type { DailyPriority } from '../types';
import { AppIcon } from './AppIcon';
import { FocusAtmosphere } from './visual';

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
    <section className="relative overflow-hidden rounded-3xl p-5 sm:p-6 transition-all border border-indigo-500/20 bg-gradient-to-br from-[var(--card)] via-[var(--card-subtle)] to-[var(--card)] shadow-xs">
      {/* Signature Abstract Visual Asset: Ascending summits & focal rays */}
      <FocusAtmosphere />

      {/* Header */}
      <div className="relative flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/70">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 font-black text-sm shadow-xs">
            ★
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
              Foco del Día
            </h2>
            <p className="text-[11px] text-[var(--text-soft)] font-medium">
              Tus 3 compromisos absolutos para hoy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-black text-[var(--text)] px-2.5 py-1 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] shadow-2xs">
            {completedCount} / 3
          </span>
          {sorted.length < 3 && !adding && (
            <div className="flex items-center gap-1.5">
              {onSmartSuggest && (
                <button
                  type="button"
                  onClick={onSmartSuggest}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/15 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 transition cursor-pointer shadow-2xs"
                  title="Sugerir según urgencias y vencimientos"
                >
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Sugerir</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] hover:border-indigo-500/40 px-2.5 py-1 text-xs font-bold text-[var(--text)] hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-2xs"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline Form to add priority */}
      {adding && sorted.length < 3 && (
        <form onSubmit={submit} className="relative flex items-center gap-2 py-3 border-b border-[var(--border)] animate-in fade-in duration-150">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Escribí la prioridad #${sorted.length + 1}...`}
            className="min-w-0 flex-1 rounded-xl border border-indigo-500/40 bg-[var(--bg-elevated)] px-3.5 py-2 text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-indigo-500 shadow-2xs transition"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 hover:brightness-110 text-white px-4 py-2 text-xs font-bold transition disabled:opacity-40 cursor-pointer shrink-0 shadow-2xs border border-white/10"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText('');
            }}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] transition cursor-pointer shrink-0"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Linear Expressive Focus Rows */}
      <div className="relative divide-y divide-[var(--border)]/60 pt-1">
        {[1, 2, 3].map((slotRank) => {
          const item = sorted.find((p) => p.rank === slotRank) || (!sorted.some((p) => p.rank === slotRank) ? sorted[slotRank - 1] : undefined);
          const rankStr = String(slotRank).padStart(2, '0');

          if (item) {
            return (
              <div
                key={item.id}
                className={`group flex items-start gap-3.5 py-3.5 transition-all rounded-2xl px-2.5 ${
                  item.done
                    ? 'bg-[var(--surface-muted)]/20 opacity-70'
                    : slotRank === 1
                    ? 'bg-amber-500/5 hover:bg-amber-500/10'
                    : 'hover:bg-[var(--surface-muted)]/40'
                }`}
              >
                {/* Expressive Rank Check Button */}
                <button
                  type="button"
                  onClick={() => onToggle(item)}
                  title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-black transition-all active:scale-95 cursor-pointer mt-0.5 ${
                    item.done
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : slotRank === 1
                      ? 'border-amber-500/60 bg-gradient-to-tr from-amber-500/20 to-amber-500/10 text-amber-800 dark:text-amber-300 shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-2xs'
                  }`}
                >
                  {item.done ? '✓' : rankStr}
                </button>

                {/* Content */}
                <div
                  className="min-w-0 flex-1 cursor-pointer select-none pt-0.5"
                  onClick={() => onToggle(item)}
                >
                  <p
                    className={`text-sm sm:text-base font-bold leading-snug transition-all ${
                      item.done
                        ? 'text-[var(--text-faint)] line-through font-normal'
                        : slotRank === 1
                        ? 'text-[var(--text)] font-black'
                        : 'text-[var(--text)]'
                    }`}
                  >
                    {item.text}
                  </p>
                  {item.reasons && item.reasons.length > 0 && (
                    <p className="text-[10px] sm:text-[11px] text-[var(--text-faint)] mt-0.5 truncate font-medium">
                      {item.reasons.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Remove action */}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Quitar de las 3 prioridades"
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
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
              className="w-full flex items-center gap-3.5 py-3 text-left text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition cursor-pointer group px-2.5 rounded-2xl hover:bg-[var(--surface-muted)]/30"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border)] font-mono text-[11px] font-bold text-[var(--text-faint)] group-hover:border-indigo-500/40 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {rankStr}
              </span>
              <span className="font-semibold text-[11px] sm:text-xs text-[var(--text-faint)] group-hover:text-[var(--text-soft)]">
                + Definir prioridad {slotRank}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
