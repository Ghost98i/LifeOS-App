import React, { useState } from 'react';
import { ViewType, LifeOSState } from '../types';
import { isSoundEnabled, setSoundEnabled, playSound } from '../lib/audio';
import type { CloudSyncStatus, CloudUser } from '../lib/cloudSync';

interface TopbarProps {
  state: LifeOSState;
  onOpenMobileNav: () => void;
  onQuickAction: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
  onSearch: (query: string) => void;
  onOpenSearch: () => void;
  onOpenCapture: () => void;
  cloudConfigured: boolean;
  cloudUser: CloudUser | null;
  syncStatus: CloudSyncStatus;
  onCloudSignIn: () => void;
  onCloudSignOut: () => void;
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
  onOpenSearch,
  onOpenCapture,
  cloudConfigured,
  cloudUser,
  syncStatus,
  onCloudSignIn,
  onCloudSignOut,
}) => {
  const [query, setQuery] = useState('');
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [showCloudMenu, setShowCloudMenu] = useState(false);
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

  const syncLabel: Record<CloudSyncStatus, string> = {
    unavailable: 'Solo local',
    'signed-out': 'Conectar',
    connecting: 'Conectando',
    saving: 'Guardando',
    synced: 'Sincronizado',
    offline: 'Sin conexión',
    conflict: 'Revisar datos',
    error: 'Error de sync',
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

      <div className="hidden sm:block relative w-52 lg:w-72 shrink-0">
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

      <span className="sm:hidden text-sm font-extrabold tracking-tight text-[var(--text)]">LifeOS</span>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={onOpenSearch} className="sm:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-sm" aria-label="Buscar en LifeOS">⌕</button>
        <button onClick={onOpenCapture} className="hidden sm:flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-extrabold text-white shadow-sm"><span className="text-base leading-none">＋</span> Capturar</button>
        {cloudConfigured && (
          <div className="relative shrink-0">
            <button
              onClick={() => cloudUser ? setShowCloudMenu((value) => !value) : onCloudSignIn()}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-soft)]"
              title={syncLabel[syncStatus]}
            >
              <span className={`h-2 w-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : syncStatus === 'saving' || syncStatus === 'connecting' ? 'bg-amber-500' : syncStatus === 'offline' ? 'bg-slate-400' : syncStatus === 'error' || syncStatus === 'conflict' ? 'bg-rose-500' : 'bg-blue-500'}`} />
              <span className="hidden xs:inline sm:inline">{syncLabel[syncStatus]}</span>
            </button>
            {cloudUser && showCloudMenu && (
              <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
                <p className="truncate text-xs font-extrabold text-[var(--text)]">{cloudUser.name || 'Cuenta Google'}</p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--text-faint)]">{cloudUser.email}</p>
                <p className="mt-3 text-[11px] font-bold text-[var(--text-soft)]">☁️ {syncLabel[syncStatus]}</p>
                <button onClick={() => { setShowCloudMenu(false); onCloudSignOut(); }} className="mt-3 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-soft)]">Cerrar sesión</button>
              </div>
            )}
          </div>
        )}

        <div className="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar">
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
      </div>
    </header>
  );
};
