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
    <section className="relative overflow-hidden rounded-3xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/70 dark:border-slate-800/70 p-5 sm:p-7 transition-all shadow-xs space-y-4">
      {/* Signature Abstract Visual Asset: Ascending summits & focal rays */}
      <FocusAtmosphere />

      {/* Header: Open and Editorial */}
      <div className="relative flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 font-black text-sm shadow-2xs">
            ★
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Foco del Día
              </h2>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                3 Claves
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Tus compromisos prioritarios e innegociables para hoy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs">
            {completedCount} / 3
          </span>
          {sorted.length < 3 && !adding && (
            <div className="flex items-center gap-1.5">
              {onSmartSuggest && (
                <button
                  type="button"
                  onClick={onSmartSuggest}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition cursor-pointer shadow-2xs"
                  title="Sugerir según urgencias y vencimientos"
                >
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Sugerir</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-500/40 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-2xs"
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
        <form onSubmit={submit} className="relative flex items-center gap-2 py-3 border-b border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Escribí la prioridad #${sorted.length + 1}...`}
            className="min-w-0 flex-1 rounded-xl border border-indigo-500/40 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 shadow-2xs transition"
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
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Expressive Editorial Focus Rows */}
      <div className="relative divide-y divide-slate-100 dark:divide-slate-800/60 pt-1">
        {[1, 2, 3].map((slotRank) => {
          const item = sorted.find((p) => p.rank === slotRank) || (!sorted.some((p) => p.rank === slotRank) ? sorted[slotRank - 1] : undefined);
          const rankStr = String(slotRank).padStart(2, '0');

          if (item) {
            const isRankOne = slotRank === 1;
            return (
              <div
                key={item.id}
                className={`group flex items-start gap-3.5 py-3.5 transition-all rounded-2xl px-2.5 ${
                  item.done
                    ? 'opacity-70 line-through'
                    : isRankOne
                    ? 'bg-slate-50/70 dark:bg-slate-800/30'
                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                }`}
              >
                {/* Expressive Rank Check Button */}
                <button
                  type="button"
                  onClick={() => onToggle(item)}
                  title={item.done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`flex shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black transition-all active:scale-95 cursor-pointer mt-0.5 ${
                    isRankOne ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-xs'
                  } ${
                    item.done
                      ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : isRankOne
                      ? 'border border-indigo-500/50 bg-gradient-to-tr from-indigo-500/20 to-blue-500/10 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600'
                  }`}
                >
                  {item.done ? '✓' : isRankOne ? '▲' : rankStr}
                </button>

                {/* Content */}
                <div
                  className="min-w-0 flex-1 cursor-pointer select-none pt-0.5"
                  onClick={() => onToggle(item)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`leading-snug transition-all ${
                        item.done
                          ? 'text-slate-400 dark:text-slate-500 line-through font-normal text-sm'
                          : isRankOne
                          ? 'text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white'
                          : 'text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {item.text}
                    </p>
                  </div>
                  {item.reasons && item.reasons.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">
                      {item.reasons.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Remove action */}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Quitar de las 3 prioridades"
                  className="opacity-0 group-hover:opacity-100 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
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
              className="w-full flex items-center gap-3.5 py-3 text-left text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer group px-2.5 rounded-2xl hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 font-mono text-[11px] font-bold text-slate-400 group-hover:border-indigo-500/40 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {rankStr}
              </span>
              <span className="font-semibold text-xs text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                + Definir prioridad {slotRank}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
