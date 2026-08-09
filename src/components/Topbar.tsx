import React, { useState } from 'react';
import { ViewType, LifeOSState } from '../types';
import { isSoundEnabled, setSoundEnabled, playSound } from '../lib/audio';

interface TopbarProps {
  state: LifeOSState;
  onOpenMobileNav: () => void;
  onQuickAction: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
  onSearch: (query: string) => void;
}

export const QUICK_ACTIONS: { label: string; view: ViewType; focusId: string; txType?: 'gasto' | 'ingreso' }[] = [
  { label: '+ Gasto', view: 'finanzas', focusId: 'qa-focus-tx', txType: 'gasto' },
  { label: '+ Ingreso', view: 'finanzas', focusId: 'qa-focus-tx', txType: 'ingreso' },
  { label: '+ Peso', view: 'gimnasio', focusId: 'qa-focus-peso' },
  { label: '+ Estudio', view: 'estudios', focusId: 'qa-focus-estudio' },
  { label: '+ Postulación', view: 'trabajo', focusId: 'qa-focus-trabajo' },
  { label: '+ Reventa', view: 'reventa', focusId: 'qa-focus-reventa' },
];

export const Topbar: React.FC<TopbarProps> = ({
  state,
  onOpenMobileNav,
  onQuickAction,
  onSearch,
}) => {
  const [query, setQuery] = useState('');
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const hidden = state.settings.hiddenTabs || [];
  const actions = QUICK_ACTIONS.filter((q) => !hidden.includes(q.view));

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playSound('click');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(query);
      setQuery('');
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--border)] px-4 lg:px-7 py-3 flex items-center gap-3">
      <button
        onClick={onOpenMobileNav}
        className="lg:hidden p-2 text-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
        aria-label="Menu"
      >
        ☰
      </button>

      <div className="relative w-40 sm:w-52 lg:w-72 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar todo en LifeOS (presioná Enter)..."
          className="w-full pl-9 pr-3 py-1.5 text-xs lg:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-hidden transition-all text-[var(--text)] placeholder-[var(--text-faint)]"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)] pointer-events-none">
          🔍
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar ml-auto">
        <button
          onClick={toggleSound}
          title={soundOn ? 'Sonidos activados' : 'Sonidos desactivados'}
          className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-all cursor-pointer shrink-0 shadow-2xs flex items-center gap-1.5"
        >
          <span>{soundOn ? '🔊' : '🔇'}</span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider">{soundOn ? 'Sonido ON' : 'Sonido OFF'}</span>
        </button>

        {actions.map((q) => (
          <button
            key={q.label}
            onClick={() => {
              playSound('click');
              onQuickAction(q.view, q.focusId, q.txType);
            }}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--blue)] hover:border-[var(--blue)] hover:bg-[var(--blue-soft)] transition-all whitespace-nowrap cursor-pointer shrink-0 shadow-2xs"
          >
            {q.label}
          </button>
        ))}
      </div>
    </header>
  );
};
