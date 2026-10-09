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
    <section className="space-y-4 border-y border-[var(--border)] py-5 sm:py-6" aria-labelledby="today-focus-title">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400">
            <AppIcon name="target" className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="today-focus-title" className="text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">
                Foco de hoy
              </h2>
            </div>
            <p className="text-xs font-medium text-[var(--text-soft)]">
              Hasta tres prioridades para orientar el día
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] font-semibold text-[var(--text-soft)] whitespace-nowrap shrink-0">
            {completedCount}/3
          </span>
          {sorted.length < 3 && !adding && (
            <div className="flex items-center gap-1.5">
              {onSmartSuggest && (
                <button
                  type="button"
                  onClick={onSmartSuggest}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                  title="Sugerir según urgencias y vencimientos"
                >
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Sugerir</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] transition hover:border-[var(--border-hover)] hover:text-[var(--text)]"
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
        <form onSubmit={submit} className="relative flex items-center gap-2 border-b border-[var(--border)] py-3 animate-in fade-in duration-150">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Escribí la prioridad #${sorted.length + 1}...`}
            className="min-w-0 flex-1 rounded-xl border border-indigo-500/40 bg-[var(--bg-elevated)] px-3.5 py-2 text-xs text-[var(--text)] outline-none transition focus:border-indigo-500 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-bold transition disabled:opacity-40 cursor-pointer shrink-0 shadow-2xs"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText('');
            }}
            className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)]"
          >
            Cancelar
          </button>
        </form>
      )}

      <div className="divide-y divide-[var(--border)]/70">
        {sorted.map((item, index) => {
          const isRankOne = index === 0;
          return (
            <div key={item.id} className={`group flex items-start gap-3.5 px-1 py-4 transition-colors hover:bg-[var(--surface-muted)]/35 ${item.done ? 'opacity-65' : ''}`}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                className={`mt-0.5 flex shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold transition active:scale-95 ${
                  isRankOne ? 'h-9 w-9' : 'h-8 w-8'
                } ${item.done
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : isRankOne
                    ? 'border-indigo-500/45 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                    : 'border-[var(--border)] bg-[var(--card-subtle)] text-[var(--text-soft)] hover:border-indigo-500'}`}
              >
                {item.done ? '✓' : String(index + 1).padStart(2, '0')}
              </button>
              <button type="button" onClick={() => onToggle(item)} className="min-w-0 flex-1 select-none pt-0.5 text-left">
                <span className={`block leading-snug ${item.done
                  ? 'text-sm font-normal text-[var(--text-faint)] line-through'
                  : isRankOne
                    ? 'text-base font-bold tracking-tight text-[var(--text)] sm:text-lg'
                    : 'text-sm font-semibold text-[var(--text)] sm:text-base'}`}>{item.text}</span>
                {item.reasons && item.reasons.length > 0 && <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--text-faint)]">{item.reasons.join(' · ')}</span>}
              </button>
              <button type="button" onClick={() => onRemove(item.id)} title="Quitar de las prioridades" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs text-[var(--text-faint)] transition hover:bg-rose-500/10 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">✕</button>
            </div>
          );
        })}

        {sorted.length === 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-between rounded-xl bg-[var(--card-subtle)] px-3 py-3 text-left transition hover:bg-[var(--surface-muted)]">
            <span>
              <span className="block text-xs font-semibold text-[var(--text)]">Definí qué merece tu atención hoy</span>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">Podés elegir hasta tres prioridades.</span>
            </span>
            <AppIcon name="plus" className="h-4 w-4 text-indigo-500" />
          </button>
        )}

        {sorted.length > 0 && sorted.length < 3 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 px-1 py-2.5 text-left text-xs font-medium text-[var(--text-faint)] transition hover:text-[var(--text-soft)]">
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            Agregar otra prioridad
          </button>
        )}
      </div>
    </section>
  );
};
