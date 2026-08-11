import React, { useEffect, useRef, useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { searchLifeOS } from '../lib/search';

interface GlobalSearchModalProps {
  state: LifeOSState;
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ state, open, initialQuery = '', onClose, onNavigate }) => {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchLifeOS(state, query);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setSelected(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, initialQuery]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  const choose = (index: number) => {
    const result = results[index];
    if (!result) return;
    onNavigate(result.view);
    onClose();
  };

  const handleKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setSelected((value) => (value + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setSelected((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      choose(selected);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-3 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Buscar en LifeOS" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
          <span className="text-lg">⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeys} placeholder="Buscar movimientos, notas, tareas, empleo, reventa…" className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-[var(--text-faint)]" />
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-faint)]">ESC</button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-3">
          {query.trim().length < 2 ? <div className="py-10 text-center"><p className="text-xs text-[var(--text-faint)]">Escribí al menos dos letras.</p><p className="mt-2 text-[10px] text-[var(--text-faint)]">Usá ↑ ↓ y Enter para moverte sin el mouse.</p></div> : results.length === 0 ? <p className="py-10 text-center text-xs text-[var(--text-faint)]">No encontré nada con “{query}”.</p> : <div className="space-y-1">{results.map((result, index) => (
            <button key={result.id} onMouseEnter={() => setSelected(index)} onClick={() => choose(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${selected === index ? 'bg-[var(--blue-soft)] ring-1 ring-blue-500/20' : 'hover:bg-[var(--bg)]'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg)] text-base">{result.icon}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--text)]">{result.title}</strong><span className="block truncate text-[11px] text-[var(--text-soft)]">{result.subtitle}</span></span><span className="text-xs text-[var(--text-faint)]">→</span>
            </button>
          ))}</div>}
        </div>
      </section>
    </div>
  );
};
