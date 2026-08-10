import React, { useState } from 'react';
import type { DailyPriority } from '../types';

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
  const complete = sorted.filter((item) => item.done).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sorted.length >= 3) return;
    onAdd(text.trim());
    setText('');
    setAdding(false);
  };

  return (
    <section className="rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/8 to-violet-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-[var(--text)]">Las tres de hoy</h3>
            <span className="rounded-lg bg-[var(--card)] px-2 py-0.5 text-[10px] font-black text-[var(--blue)]">{complete}/{sorted.length || 3}</span>
          </div>
          <p className="text-[11px] text-[var(--text-soft)]">Tus tres resultados clave. Elegilos con ☆ en la lista o escribí uno nuevo.</p>
        </div>
        {sorted.length < 3 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--blue)]">＋ Elegir</button>
        )}
      </div>

      {sorted.length === 0 ? (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-soft)]">
          <span>Todavía no elegiste prioridades.</span><strong className="text-[var(--blue)]">Elegir</strong>
        </button>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3">
          {sorted.map((item) => (
            <div key={item.id} className="group flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
              <button type="button" onClick={() => onToggle(item)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-[10px] font-black ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border-hover)] text-[var(--text-soft)]'}`}>{item.done ? '✓' : item.rank}</button>
              <span className={`min-w-0 flex-1 truncate text-xs font-bold ${item.done ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text)]'}`} title={item.text}>{item.text}</span>
              <button type="button" onClick={() => onRemove(item.id)} title="Quitar de las tres, sin borrar la tarea" className="text-[10px] text-[var(--text-faint)] opacity-50 hover:text-red-500 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      )}

      {adding && sorted.length < 3 && (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Ej: Enviar propuesta" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs outline-none focus:border-[var(--blue)]" />
          <button className="rounded-lg bg-[var(--blue)] px-3 text-xs font-extrabold text-white">Agregar</button>
          <button type="button" onClick={() => { setAdding(false); setText(''); }} className="rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-soft)]">Cancelar</button>
        </form>
      )}
    </section>
  );
};
