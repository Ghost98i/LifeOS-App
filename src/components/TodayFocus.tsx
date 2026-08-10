import React, { useState } from 'react';
import type { LifeOSState } from '../types';
import { playSound } from '../lib/audio';
import { todayISO, uid } from '../lib/storage';

interface TodayFocusProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const TodayFocus: React.FC<TodayFocusProps> = ({ state, onUpdateState }) => {
  const [text, setText] = useState('');
  const priorities = state.dailyPriorities.filter((item) => item.date === todayISO()).sort((a, b) => a.rank - b.rank);

  const addPriority = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || priorities.length >= 3) return;
    onUpdateState((draft) => {
      draft.dailyPriorities.push({ id: uid(), date: todayISO(), text: text.trim(), done: false, rank: (priorities.length + 1) as 1 | 2 | 3 });
    });
    setText('');
  };

  const toggle = (id: string) => {
    playSound('success');
    onUpdateState((draft) => {
      const item = draft.dailyPriorities.find((candidate) => candidate.id === id);
      if (item) item.done = !item.done;
    });
  };

  const remove = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = draft.dailyPriorities.filter((item) => item.id !== id);
      draft.dailyPriorities.filter((item) => item.date === todayISO()).sort((a, b) => a.rank - b.rank).forEach((item, index) => { item.rank = (index + 1) as 1 | 2 | 3; });
    });
  };

  return (
    <section className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/10 to-violet-500/5 p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">Las tres de hoy</h2>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">Si estas tres avanzan, el día ya valió.</p>
        </div>
        <span className="rounded-lg bg-[var(--card)] px-2.5 py-1 text-xs font-black text-[var(--blue)]">{priorities.filter((item) => item.done).length}/3</span>
      </div>

      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((index) => {
          const item = priorities[index];
          if (!item) return <div key={index} className="flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-3 text-xs text-[var(--text-faint)]"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--bg)] font-black">{index + 1}</span>Espacio libre</div>;
          return (
            <div key={item.id} className="group flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3">
              <button onClick={() => toggle(item.id)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border-hover)]'}`}>{item.done ? '✓' : item.rank}</button>
              <span className={`flex-1 text-sm font-bold ${item.done ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text)]'}`}>{item.text}</span>
              <button onClick={() => remove(item.id)} className="text-xs text-[var(--text-faint)] opacity-60 hover:text-red-500 group-hover:opacity-100">✕</button>
            </div>
          );
        })}
      </div>

      {priorities.length < 3 && (
        <form onSubmit={addPriority} className="mt-3 flex gap-2">
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Sumar una prioridad…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs outline-none focus:border-[var(--blue)]" />
          <button className="rounded-xl bg-[var(--blue)] px-4 text-xs font-extrabold text-white">Agregar</button>
        </form>
      )}
    </section>
  );
};
