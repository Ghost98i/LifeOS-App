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
  const sorted = [...priorities].sort((a, b) => (a.rank || 0) - (b.rank || 0)).slice(0, 3);
  const completedCount = sorted.filter((item) => item.done).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sorted.length >= 3) return;
    onAdd(text.trim());
    setText('');
    setAdding(false);
  };

  return (
    <section className="today-open-section space-y-3" aria-labelledby="today-focus-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="today-section-icon today-section-icon-focus">
            <AppIcon name="target" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 id="today-focus-title" className="text-[15px] font-bold tracking-[-0.025em] text-[var(--text)] sm:text-base">
                Foco de hoy
              </h2>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-faint)]">
                {completedCount}/3
              </span>
            </div>
            <p className="truncate text-[10px] font-medium text-[var(--text-faint)] sm:text-[11px]">
              Lo esencial, sin ruido
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {sorted.length < 3 && !adding && (
            <div className="flex items-center gap-1.5">
              {onSmartSuggest && (
                <button
                  type="button"
                  onClick={onSmartSuggest}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                  title="Sugerir según urgencias y vencimientos"
                >
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Sugerir</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-semibold text-[var(--text-soft)] shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-indigo-500/45 hover:text-[var(--text)]"
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
        <form onSubmit={submit} className="relative flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.055] p-2 animate-in fade-in duration-150">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Escribí la prioridad #${sorted.length + 1}...`}
            className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] sm:text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText('');
            }}
            className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)]"
          >
            Cancelar
          </button>
        </form>
      )}

      <div className="divide-y divide-[var(--border)]/65">
        {sorted.map((item, index) => {
          const isRankOne = index === 0;
          return (
            <div key={item.id} className={`group flex items-center gap-3 rounded-lg px-1 py-2 transition-[background-color,opacity] hover:bg-[var(--surface-muted)]/45 ${item.done ? 'opacity-60' : ''}`}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                className={`flex shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold tabular-nums transition active:scale-95 ${
                  isRankOne ? 'h-7 w-7' : 'h-6 w-6'
                } ${item.done
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : isRankOne
                    ? 'border-indigo-500/45 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                    : 'border-[var(--border)] bg-[var(--card-subtle)] text-[var(--text-soft)] hover:border-indigo-500'}`}
              >
                {item.done ? '✓' : String(index + 1).padStart(2, '0')}
              </button>
              <button type="button" onClick={() => onToggle(item)} className="min-w-0 flex-1 select-none text-left">
                <span className={`block leading-snug ${item.done
                  ? 'text-xs font-normal text-[var(--text-faint)] line-through sm:text-[13px]'
                  : isRankOne
                    ? 'text-[13px] font-bold tracking-[-0.01em] text-[var(--text)] sm:text-sm'
                    : 'text-xs font-semibold text-[var(--text)] sm:text-[13px]'}`}>{item.text}</span>
                {item.reasons && item.reasons.length > 0 && <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--text-faint)]">{item.reasons.join(' · ')}</span>}
              </button>
              <button type="button" onClick={() => onRemove(item.id)} title="Quitar de las prioridades" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] transition hover:bg-rose-500/10 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><AppIcon name="x" className="h-3 w-3" /></button>
            </div>
          );
        })}

        {sorted.length === 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-subtle)]/55 px-3 py-2.5 text-left transition hover:border-indigo-500/35 hover:bg-indigo-500/[0.04]">
            <span>
              <span className="block text-xs font-semibold text-[var(--text)]">Definí qué merece tu atención hoy</span>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">Hasta tres prioridades.</span>
            </span>
            <AppIcon name="plus" className="h-4 w-4 text-indigo-500" />
          </button>
        )}

        {sorted.length > 0 && sorted.length < 3 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 px-1 py-2 text-left text-[11px] font-medium text-[var(--text-faint)] transition hover:text-[var(--text-soft)]">
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            Agregar otra prioridad
          </button>
        )}
      </div>
    </section>
  );
};
