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
  onSearch: _onSearch,
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

  const syncLed = (() => {
    if (syncStatus === 'synced') {
      return {
        dotClass: 'bg-emerald-400 dark:bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
        label: 'Sincronizado',
        textColor: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
      };
    }
    if (syncStatus === 'saving' || syncStatus === 'connecting') {
      return {
        dotClass: 'bg-amber-400 dark:bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.7)]',
        label: 'Guardando...',
        textColor: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
      };
    }
    if (syncStatus === 'conflict') {
      return {
        dotClass: 'bg-rose-500 animate-ping',
        label: 'Conflicto',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
      };
    }
    if (syncStatus === 'error') {
      return {
        dotClass: 'bg-rose-500 animate-pulse',
        label: 'Error al subir',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
      };
    }
    return {
      dotClass: 'bg-slate-400 dark:bg-slate-500',
      label: 'Offline (Local)',
      textColor: 'text-[var(--text-soft)] border-[var(--border)] bg-[var(--card)]',
    };
  })();

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--topbar)] px-4 py-3 backdrop-blur-xl lg:px-7">
      <button
        onClick={onOpenMobileNav}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] lg:hidden"
        aria-label="Abrir menú"
      >
        <AppIcon name="menu" className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden sm:flex items-center justify-between w-52 lg:w-72 px-3 py-1.5 text-xs lg:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-muted)] text-[var(--text-faint)] transition-all text-left shadow-2xs group cursor-pointer"
        title="Buscar y Paleta de Comandos (Ctrl + K o ⌘K)"
        aria-label="Abrir Paleta de Comandos"
      >
        <span className="flex items-center gap-2 min-w-0 text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors">
          <AppIcon name="search" className="h-4 w-4 shrink-0 text-[var(--text-faint)] group-hover:text-[var(--text)] transition-colors" />
          <span className="truncate">Buscar o comandos…</span>
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-faint)] shadow-2xs">
          ⌘K
        </kbd>
      </button>

      <div className="flex min-w-0 items-center gap-2 sm:hidden">
        <img src={lifeOSIcon} alt="" className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold tracking-tight text-[var(--text)]"><AppIcon name={currentMeta[currentView].icon} className="h-4 w-4 shrink-0" />{currentMeta[currentView].label}</span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onTogglePrivacy}
          title={state.settings.privacyMode ? "Stream Guard activo (Shift + P) - Clic para mostrar saldos" : "Activar Stream Guard (Shift + P) - Clic para ocultar montos"}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-all cursor-pointer ${
            state.settings.privacyMode
              ? 'border-violet-500/50 bg-violet-500/15 text-violet-600 dark:text-violet-300 shadow-xs'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]'
          }`}
          aria-label={state.settings.privacyMode ? "Desactivar Stream Guard" : "Activar Stream Guard"}
        >
          <AppIcon name={state.settings.privacyMode ? 'eyeOff' : 'eye'} className="h-4 w-4" />
          <span className="hidden xl:inline">
            {state.settings.privacyMode ? 'Stream Guard activo' : 'Stream Guard'}
          </span>
        </button>

        <button onClick={onOpenSearch} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm sm:hidden cursor-pointer" aria-label="Buscar en LifeOS"><AppIcon name="search" className="h-4 w-4"/></button>
        <button onClick={onOpenCapture} title="Capturar (C)" className="hidden sm:flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer"><span className="text-base leading-none">＋</span> Capturar <kbd className="ml-1 rounded bg-white/15 px-1 text-[9px]">C</kbd></button>

        {/* Visual Sync Status with Micro-LED */}
        <div className="relative shrink-0">
          <button
            onClick={() => {
              if (cloudConfigured) {
                if (cloudUser) {
                  setShowCloudMenu((value) => !value);
                } else {
                  onCloudSignIn();
                }
              }
            }}
            className={`flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold transition-all ${syncLed.textColor} ${cloudConfigured ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
            title={
              cloudConfigured
                ? (lastSyncedAt && syncStatus === 'synced' ? `${syncLed.label} · Última confirmación: ${lastSyncedAt}` : syncLed.label)
                : 'Datos guardados en este dispositivo'
            }
          >
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${syncLed.dotClass}`} />
            <span className="hidden sm:inline">{syncLed.label}</span>
          </button>
          {cloudConfigured && cloudUser && showCloudMenu && (
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
              <p className="truncate text-xs font-extrabold text-[var(--text)]">{cloudUser.name || 'Cuenta Google'}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--text-faint)]">{cloudUser.email}</p>
              <p className={`mt-3 flex items-center gap-2 text-xs font-semibold ${syncLed.textColor}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${syncLed.dotClass}`} />
                {syncLed.label}
              </p>
              {lastSyncedAt && <p className="mt-1 text-[10px] text-[var(--text-faint)]">Última confirmación: {lastSyncedAt}</p>}
              <button onClick={() => { setShowCloudMenu(false); onCloudSignOut(); }} className="mt-3 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-soft)] hover:text-red-500 transition-colors">Cerrar sesión</button>
            </div>
          )}
        </div>

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
