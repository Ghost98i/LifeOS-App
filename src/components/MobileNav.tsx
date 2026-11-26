import React from 'react';
import type { LifeOSState, ViewType } from '../types';
import type { CloudSyncStatus } from '../lib/cloudSync';
import { AppIcon } from './AppIcon';
import { getMobileNavSlots } from '../lib/moduleVisibility';

interface MobileNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onPrefetchView?: (view: ViewType) => void;
  onOpenCapture: () => void;
  onPrefetchCapture?: () => void;
  onOpenMore: () => void;
  syncStatus?: CloudSyncStatus;
  privacyMode?: boolean;
  onTogglePrivacy?: () => void;
  inboxCount?: number;
  cloudConfigured?: boolean;
  cloudUser?: unknown | null;
  onCloudSignIn?: () => void;
  state?: LifeOSState;
  hiddenTabs?: string[];
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentView,
  onNavigate,
  onPrefetchView,
  onOpenCapture,
  onPrefetchCapture,
  onOpenMore,
  syncStatus,
  privacyMode,
  onTogglePrivacy,
  inboxCount = 0,
  cloudConfigured = false,
  cloudUser = null,
  onCloudSignIn,
  state,
  hiddenTabs,
}) => {
  const { slot2, slot4 } = getMobileNavSlots(state || (hiddenTabs ? { settings: { hiddenTabs } as any } : undefined));

  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[11px] transition-colors cursor-pointer ${
      active ? 'text-[var(--text)] font-bold' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
    }`;
  const iconPillClass = (active: boolean) =>
    `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
      active
        ? 'bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#818CF8]'
        : ''
    }`;
  const moreActive = !['dashboard', slot2?.id, slot4?.id].filter(Boolean).includes(currentView);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const syncLed = (() => {
    if (!isOnline || syncStatus === 'offline') {
      return {
        dotClass: 'bg-amber-400 dark:bg-amber-400',
        label: 'Sin conexión a internet',
        textColor: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (syncStatus === 'locked') return {
      dotClass: 'bg-amber-500', label: 'Sincronización bloqueada',
      textColor: 'text-amber-700 dark:text-amber-300',
    };
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
        label: 'Error al sincronizar',
        textColor: 'text-rose-700 dark:text-rose-300',
      };
    }
    if (cloudConfigured && !cloudUser) {
      return {
        dotClass: 'bg-slate-400 dark:bg-slate-500',
        label: 'Modo local',
        textColor: 'text-[var(--text-faint)]',
      };
    }
    return {
      dotClass: 'bg-slate-400 dark:bg-slate-500',
      label: 'Modo local',
      textColor: 'text-[var(--text-faint)]',
    };
  })();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-[var(--border)] bg-[var(--nav-mobile)] shadow-[0_-12px_32px_-26px_rgba(15,23,42,.45)] backdrop-blur-xl md:hidden">
      {/* Micro-bar: Sync status LED & Privacy quick toggle */}
      <div className="flex items-center justify-between px-3.5 py-1 border-b border-[var(--border)]/35 text-[11px]">
        {cloudConfigured && !cloudUser && onCloudSignIn ? (
          <button
            type="button"
            onClick={onCloudSignIn}
            className="flex min-h-8 items-center gap-1.5 rounded-full px-1.5 cursor-pointer hover:opacity-90"
            title="Conectar con Google para sincronizar"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncLed.dotClass}`} />
            <span className={syncLed.textColor}>{syncLed.label}</span>
          </button>
        ) : (
          <div className="flex min-h-8 items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncLed.dotClass}`} />
            <span className={`font-medium ${syncLed.textColor}`}>{syncLed.label}</span>
          </div>
        )}
        {onTogglePrivacy && (
          <button
            type="button"
            onClick={onTogglePrivacy}
            className={`flex min-h-8 items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
              privacyMode
                ? 'bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#818CF8] border border-[#4F46E5]/30'
                : 'text-[var(--text-faint)] hover:text-[var(--text)]'
            }`}
            title="Alternar Privacidad"
          >
            <AppIcon name={privacyMode ? 'eyeOff' : 'eye'} className="h-3.5 w-3.5" />
            <span>{privacyMode ? 'Privacidad activa' : 'Privacidad'}</span>
          </button>
        )}
      </div>

      {/* Main Bottom Tabs */}
      <div className="flex items-end px-2 pt-2 pb-[max(.45rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className={itemClass(currentView === 'dashboard')}
          aria-label="Ir a Hoy"
          aria-current={currentView === 'dashboard' ? 'page' : undefined}
        >
          <span className={iconPillClass(currentView === 'dashboard')}>
            <AppIcon name="home" strokeWidth={1.75} className="h-[18px] w-[18px]" />
          </span>
          <span>Hoy</span>
        </button>
        {slot2 ? (
          <button
            type="button"
            onClick={() => onNavigate(slot2.id)}
            onMouseEnter={() => onPrefetchView?.(slot2.id)}
            onFocus={() => onPrefetchView?.(slot2.id)}
            className={itemClass(currentView === slot2.id)}
            aria-label={`Ir a ${slot2.label}`}
            aria-current={currentView === slot2.id ? 'page' : undefined}
          >
            <span className={iconPillClass(currentView === slot2.id)}>
              <AppIcon name={slot2.icon} strokeWidth={1.75} className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate max-w-[68px]">{slot2.label}</span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1" />
        )}
        <button
          type="button"
          onClick={onOpenCapture}
          onMouseEnter={onPrefetchCapture}
          onFocus={onPrefetchCapture}
          className="relative mx-2 -mt-1.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#4F46E5] dark:hover:bg-[#6366F1] text-white shadow-[0_6px_18px_rgba(79,70,229,0.35)] active:scale-95 transition-all cursor-pointer border border-white/15"
          aria-label="Captura rápida"
        >
          <AppIcon name="squarePlus" strokeWidth={1.75} className="h-5 w-5 text-white" />
          {inboxCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-900 border-2 border-[var(--card)]">
              {inboxCount}
            </span>
          )}
        </button>
        {slot4 ? (
          <button
            type="button"
            onClick={() => onNavigate(slot4.id)}
            onMouseEnter={() => onPrefetchView?.(slot4.id)}
            onFocus={() => onPrefetchView?.(slot4.id)}
            className={itemClass(currentView === slot4.id)}
            aria-label={`Ir a ${slot4.label}`}
            aria-current={currentView === slot4.id ? 'page' : undefined}
          >
            <span className={iconPillClass(currentView === slot4.id)}>
              <AppIcon name={slot4.icon} strokeWidth={1.75} className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate max-w-[68px]">{slot4.label}</span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1" />
        )}
        <button
          type="button"
          onClick={onOpenMore}
          className={itemClass(moreActive)}
          aria-label="Abrir más secciones"
          aria-current={moreActive ? 'page' : undefined}
        >
          <span className={iconPillClass(moreActive)}>
            <AppIcon name="more" strokeWidth={1.75} className="h-[18px] w-[18px]" />
          </span>
          <span>Más</span>
        </button>
      </div>
    </nav>
  );
};
