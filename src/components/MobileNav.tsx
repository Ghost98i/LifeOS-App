import React from 'react';
import type { ViewType } from '../types';
import type { CloudSyncStatus } from '../lib/cloudSync';
import { AppIcon } from './AppIcon';

interface MobileNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenCapture: () => void;
  onOpenMore: () => void;
  syncStatus?: CloudSyncStatus;
  privacyMode?: boolean;
  onTogglePrivacy?: () => void;
  inboxCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentView,
  onNavigate,
  onOpenCapture,
  onOpenMore,
  syncStatus,
  privacyMode,
  onTogglePrivacy,
  inboxCount = 0,
}) => {
  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[11px] font-semibold ${
      active ? 'text-[var(--blue)]' : 'text-[var(--text-faint)]'
    }`;
  const moreActive = !['dashboard', 'gimnasio', 'finanzas'].includes(currentView);

  const syncLed = (() => {
    if (syncStatus === 'synced') {
      return {
        dotClass: 'bg-emerald-400 dark:bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
        label: 'Sincronizado',
        textColor: 'text-emerald-700 dark:text-emerald-300',
      };
    }
    if (syncStatus === 'saving' || syncStatus === 'connecting') {
      return {
        dotClass: 'bg-amber-400 dark:bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.7)]',
        label: 'Guardando...',
        textColor: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (syncStatus === 'conflict') {
      return {
        dotClass: 'bg-rose-500 animate-ping',
        label: 'Conflicto',
        textColor: 'text-rose-700 dark:text-rose-300',
      };
    }
    if (syncStatus === 'error') {
      return {
        dotClass: 'bg-rose-500 animate-pulse',
        label: 'Error al subir',
        textColor: 'text-rose-700 dark:text-rose-300',
      };
    }
    return {
      dotClass: 'bg-slate-400 dark:bg-slate-500',
      label: 'Offline (Local)',
      textColor: 'text-[var(--text-faint)]',
    };
  })();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-[var(--border)] bg-[var(--nav-mobile)] shadow-[0_-10px_30px_rgba(2,8,23,.08)] backdrop-blur-xl lg:hidden">
      {/* Micro-bar: Sync status LED & Privacy quick toggle */}
      <div className="flex items-center justify-between px-3.5 py-1 border-b border-[var(--border)]/35 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncLed.dotClass}`} />
          <span className={`font-medium ${syncLed.textColor}`}>{syncLed.label}</span>
        </div>
        {onTogglePrivacy && (
          <button
            type="button"
            onClick={onTogglePrivacy}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold transition-all ${
              privacyMode
                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30'
                : 'text-[var(--text-faint)] hover:text-[var(--text)]'
            }`}
            title="Alternar Stream Guard"
          >
            <AppIcon name={privacyMode ? 'eyeOff' : 'eye'} className="h-3 w-3" />
            <span>{privacyMode ? 'Privacidad activa' : 'Stream Guard'}</span>
          </button>
        )}
      </div>

      {/* Main Bottom Tabs */}
      <div className="flex items-end px-2 pt-1 pb-[max(.45rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => onNavigate('dashboard')}
          className={itemClass(currentView === 'dashboard')}
          aria-label="Ir a Hoy"
          aria-current={currentView === 'dashboard' ? 'page' : undefined}
        >
          <AppIcon name="home" className="h-[21px] w-[21px]" />
          <span>Hoy</span>
        </button>
        <button
          onClick={() => onNavigate('gimnasio')}
          className={itemClass(currentView === 'gimnasio')}
          aria-label="Ir a Gimnasio"
          aria-current={currentView === 'gimnasio' ? 'page' : undefined}
        >
          <AppIcon name="dumbbell" className="h-[21px] w-[21px]" />
          <span>Gimnasio</span>
        </button>
        <button
          onClick={onOpenCapture}
          className="relative mx-2 -mt-5 flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-[var(--blue)] text-white shadow-lg shadow-blue-500/25 active:scale-95 transition-transform cursor-pointer"
          aria-label="Captura rápida"
        >
          <AppIcon name="plus" className="h-6 w-6" />
          {inboxCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-900 border-2 border-[var(--card)] animate-pulse">
              {inboxCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onNavigate('finanzas')}
          className={itemClass(currentView === 'finanzas')}
          aria-label="Ir a Finanzas"
          aria-current={currentView === 'finanzas' ? 'page' : undefined}
        >
          <AppIcon name="wallet" className="h-[21px] w-[21px]" />
          <span>Finanzas</span>
        </button>
        <button
          onClick={onOpenMore}
          className={itemClass(moreActive)}
          aria-label="Abrir más secciones"
          aria-current={moreActive ? 'page' : undefined}
        >
          <AppIcon name="more" className="h-[21px] w-[21px]" />
          <span>Más</span>
        </button>
      </div>
    </nav>
  );
};
