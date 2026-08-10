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
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(initialQuery); window.setTimeout(() => inputRef.current?.focus(), 50); } }, [open, initialQuery]);
  if (!open) return null;
  const results = searchLifeOS(state, query);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-3 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Buscar en LifeOS" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
          <span className="text-lg">⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && onClose()} placeholder="Buscar movimientos, notas, tareas, empleo, reventa…" className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-[var(--text-faint)]" />
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-faint)]">ESC</button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-3">
          {query.trim().length < 2 ? <p className="py-10 text-center text-xs text-[var(--text-faint)]">Escribí al menos dos letras.</p> : results.length === 0 ? <p className="py-10 text-center text-xs text-[var(--text-faint)]">No encontré nada con “{query}”.</p> : <div className="space-y-1">{results.map((result) => (
            <button key={result.id} onClick={() => { onNavigate(result.view); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--bg)]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg)] text-base">{result.icon}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--text)]">{result.title}</strong><span className="block truncate text-[11px] text-[var(--text-soft)]">{result.subtitle}</span></span><span className="text-xs text-[var(--text-faint)]">→</span>
            </button>
          ))}</div>}
        </div>
      </section>
    </div>
  );
};
