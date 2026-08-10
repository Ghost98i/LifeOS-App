import React, { useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { reviewedThisWeek, weeklyReviewExceptions } from '../lib/review';
import { todayISO } from '../lib/storage';

interface WeeklyReviewCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
}

export const WeeklyReviewCard: React.FC<WeeklyReviewCardProps> = ({ state, onUpdateState, onNavigate }) => {
  const exceptions = weeklyReviewExceptions(state);
  const reviewed = reviewedThisWeek(state);
  const [expanded, setExpanded] = useState(!reviewed);
  const toneClass = { urgent: 'bg-rose-500', attention: 'bg-amber-500', info: 'bg-blue-500' } as const;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-xl">↻</span>
        <span className="flex-1"><strong className="block text-sm text-[var(--text)]">Revisión semanal</strong><span className="text-xs text-[var(--text-soft)]">Solo lo que requiere una decisión.</span></span>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-black ${exceptions.length ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{exceptions.length}</span>
        <span className="text-xs text-[var(--text-faint)]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
          {exceptions.length === 0 ? <p className="rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-600">Todo está razonablemente al día. No hay nada que revisar.</p> : exceptions.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.view)} className="flex w-full items-start gap-3 rounded-xl border border-[var(--border)] p-3 text-left hover:border-[var(--blue)]">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass[item.tone]}`} />
              <span className="flex-1"><strong className="block text-xs text-[var(--text)]">{item.title}</strong><span className="mt-0.5 block text-[11px] text-[var(--text-soft)]">{item.detail}</span></span><span className="text-xs text-[var(--text-faint)]">→</span>
            </button>
          ))}
          <button onClick={() => onUpdateState((draft) => { draft.settings.lastWeeklyReviewAt = todayISO(); })} className="mt-2 w-full rounded-xl bg-[var(--text)] py-2.5 text-xs font-extrabold text-[var(--bg-elevated)]">{reviewed ? 'Revisión hecha esta semana ✓' : 'Marcar revisión como hecha'}</button>
        </div>
      )}
    </section>
  );
};
