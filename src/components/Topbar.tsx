import React, { useState } from 'react';
import { ViewType, LifeOSState } from '../types';
import { isSoundEnabled, setSoundEnabled, playSound } from '../lib/audio';
import type { CloudSyncStatus, CloudUser } from '../lib/cloudSync';
import lifeOSIcon from '../assets/lifeos-icon.png';
import { AppIcon, type AppIconName } from './AppIcon';

interface TopbarProps {
  currentView: ViewType;
  state: LifeOSState;
  onOpenMobileNav: () => void;
  onQuickAction: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
  onSearch: (query: string) => void;
  onOpenSearch: () => void;
  onOpenCapture: () => void;
  onTogglePrivacy: () => void;
  cloudConfigured: boolean;
  cloudUser: CloudUser | null;
  syncStatus: CloudSyncStatus;
  lastSyncedAt?: string | null;
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
  currentView,
  state,
  onOpenMobileNav,
  onQuickAction,
  onSearch,
  onOpenSearch,
  onOpenCapture,
  onTogglePrivacy,
  cloudConfigured,
  cloudUser,
  syncStatus,
  lastSyncedAt,
  onCloudSignIn,
  onCloudSignOut,
}) => {
  const [query, setQuery] = useState('');
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  const hidden = state.settings.hiddenTabs || [];
  const actions = QUICK_ACTIONS.filter((q) => !hidden.includes(q.view));
  const currentMeta: Record<ViewType, { icon: AppIconName; label: string }> = {
    dashboard: { icon: 'home', label: 'Hoy' }, agenda: { icon: 'calendar', label: 'Agenda' }, calendario: { icon: 'calendarDays', label: 'Calendario' },
    trabajo: { icon: 'briefcase', label: 'Trabajo' }, reventa: { icon: 'repeat', label: 'Reventa' }, finanzas: { icon: 'wallet', label: 'Finanzas' },
    gimnasio: { icon: 'dumbbell', label: 'Gimnasio' }, estudios: { icon: 'book', label: 'Estudios' }, notas: { icon: 'note', label: 'Notas' },
    ia: { icon: 'sparkles', label: 'IA' }, config: { icon: 'settings', label: 'Configuración' }, checkout: { icon: 'moon', label: 'Cerrar día' },
  };

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
    unavailable: 'Solo en este dispositivo',
    'signed-out': 'Conectar dispositivos',
    connecting: 'Comprobando nube',
    saving: 'Subiendo cambios',
    synced: 'Sincronizado',
    offline: 'Guardado en este dispositivo',
    conflict: 'Revisar cambios',
    error: 'No se pudo subir',
  };

  const syncTone: Record<CloudSyncStatus, string> = {
    unavailable: 'text-[var(--text-soft)]',
    'signed-out': 'text-[var(--blue)]',
    connecting: 'text-amber-600 dark:text-amber-300',
    saving: 'text-amber-600 dark:text-amber-300',
    synced: 'text-emerald-600 dark:text-emerald-400',
    offline: 'text-slate-600 dark:text-slate-300',
    conflict: 'text-rose-600 dark:text-rose-300',
    error: 'text-rose-600 dark:text-rose-300',
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--topbar)] px-4 py-3 backdrop-blur-xl lg:px-7">
      <button
        onClick={onOpenMobileNav}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] lg:hidden"
        aria-label="Abrir menú"
      >
        <AppIcon name="menu" className="h-5 w-5" />
      </button>

      <div className="hidden sm:block relative w-52 lg:w-72 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en LifeOS… Ctrl K"
          className="w-full pl-9 pr-3 py-1.5 text-xs lg:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-hidden transition-all text-[var(--text)] placeholder-[var(--text-faint)]"
        />
        <AppIcon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:hidden">
        <img src={lifeOSIcon} alt="" className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold tracking-tight text-[var(--text)]"><AppIcon name={currentMeta[currentView].icon} className="h-4 w-4 shrink-0" />{currentMeta[currentView].label}</span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={onTogglePrivacy} title="Stream Guard (Shift + P)" className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold ${state.settings.privacyMode ? 'border-violet-500/50 bg-violet-500/12 text-violet-600 dark:text-violet-300' : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)]'}`}><AppIcon name="shield" className="h-4 w-4"/><span className="hidden xl:inline">{state.settings.privacyMode ? 'Privacidad activa' : 'Privacidad'}</span></button>
        <button onClick={onOpenSearch} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm sm:hidden" aria-label="Buscar en LifeOS"><AppIcon name="search" className="h-4 w-4"/></button>
        <button onClick={onOpenCapture} title="Capturar (C)" className="hidden sm:flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-extrabold text-white shadow-sm"><span className="text-base leading-none">＋</span> Capturar <kbd className="ml-1 rounded bg-white/15 px-1 text-[9px]">C</kbd></button>
        {cloudConfigured && (
          <div className="relative shrink-0">
            <button
              onClick={() => cloudUser ? setShowCloudMenu((value) => !value) : onCloudSignIn()}
              className={`flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs font-semibold ${syncTone[syncStatus]}`}
              title={lastSyncedAt && syncStatus === 'synced' ? `${syncLabel[syncStatus]} · última confirmación ${lastSyncedAt}` : syncLabel[syncStatus]}
            >
              <AppIcon name={syncStatus === 'synced' ? 'check' : 'cloud'} className="h-4 w-4" />
              <span className="hidden sm:inline">{syncLabel[syncStatus]}</span>
            </button>
            {cloudUser && showCloudMenu && (
              <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
                <p className="truncate text-xs font-extrabold text-[var(--text)]">{cloudUser.name || 'Cuenta Google'}</p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--text-faint)]">{cloudUser.email}</p>
                <p className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${syncTone[syncStatus]}`}><AppIcon name="cloud" className="h-4 w-4" />{syncLabel[syncStatus]}</p>
                {lastSyncedAt && <p className="mt-1 text-[10px] text-[var(--text-faint)]">Última confirmación: {lastSyncedAt}</p>}
                <button onClick={() => { setShowCloudMenu(false); onCloudSignOut(); }} className="mt-3 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-soft)]">Cerrar sesión</button>
              </div>
            )}
          </div>
        )}
        {!cloudConfigured && <span title="Los datos se guardan en este dispositivo" className="hidden h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs font-semibold text-[var(--text-soft)] sm:flex"><AppIcon name="check" className="h-4 w-4"/>Solo en este dispositivo</span>}

        <div className="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={toggleSound}
          title={soundOn ? 'Sonidos activados' : 'Sonidos desactivados'}
          className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-all cursor-pointer shrink-0 shadow-2xs flex items-center gap-1.5"
        >
          <AppIcon name={soundOn ? 'volume' : 'volumeOff'} className="h-4 w-4" />
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
