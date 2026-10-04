import React, { useState } from 'react';
import { ViewType, LifeOSState } from '../types';
import { isSoundEnabled, setSoundEnabled, playSound } from '../lib/audio';
import type { CloudSyncStatus, CloudUser } from '../lib/cloudSync';
import lifeOSIcon from '../assets/lifeos-icon.png';
import { AppIcon, type AppIconName } from './AppIcon';
import { isModuleEnabled } from '../lib/moduleVisibility';

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
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const actions = QUICK_ACTIONS.filter((q) => isModuleEnabled(state, q.view));
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
        dotClass: 'bg-emerald-500 dark:bg-emerald-400',
        label: 'Sincronizado',
        textColor: 'text-[var(--text-soft)] hover:text-[var(--text)] border-transparent bg-transparent hover:bg-[var(--surface-muted)]',
      };
    }
    if (syncStatus === 'saving' || syncStatus === 'connecting') {
      return {
        dotClass: 'bg-amber-400 animate-pulse',
        label: 'Guardando…',
        textColor: 'text-amber-700 dark:text-amber-400 border-amber-500/20 bg-amber-500/10',
      };
    }
    if (syncStatus === 'conflict') {
      return {
        dotClass: 'bg-rose-500 animate-ping',
        label: 'Conflicto pendiente',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/40 bg-rose-500/15 font-bold shadow-xs',
      };
    }
    if (syncStatus === 'error') {
      return {
        dotClass: 'bg-rose-500 animate-pulse',
        label: 'Error al sincronizar',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/40 bg-rose-500/15 font-bold shadow-xs',
      };
    }
    if (cloudConfigured && !cloudUser) {
      return {
        dotClass: 'bg-[var(--blue)]',
        label: 'Conectar Google',
        textColor: 'text-[var(--text-soft)] hover:text-[var(--text)] border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-muted)]',
      };
    }
    return {
      dotClass: 'bg-slate-400 dark:bg-slate-500',
      label: 'Local',
      textColor: 'text-[var(--text-faint)] border-transparent bg-transparent',
    };
  })();

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--topbar)] px-4 py-3 backdrop-blur-xl lg:px-7">
      <button
        onClick={onOpenMobileNav}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] lg:hidden cursor-pointer"
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
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold tracking-tight text-[var(--text)]">
          <AppIcon name={currentMeta[currentView].icon} className="h-4 w-4 shrink-0" />
          {currentMeta[currentView].label}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Stream Guard Button */}
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
            {state.settings.privacyMode ? 'Stream Guard' : 'Privacidad'}
          </span>
        </button>

        <button onClick={onOpenSearch} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm sm:hidden cursor-pointer" aria-label="Buscar en LifeOS">
          <AppIcon name="search" className="h-4 w-4"/>
        </button>

        {/* Quick Action Shortcuts Group */}
        <div className="relative hidden sm:flex items-center gap-1">
          <button
            onClick={onOpenCapture}
            title={(state.inbox || []).length > 0 ? `Capturar / Bandeja (${(state.inbox || []).length} pendientes)` : "Capturar (C)"}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--text)] px-3 text-xs font-bold text-[var(--bg-elevated)] shadow-xs hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            <span>Capturar</span>
            {(state.inbox || []).length > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-900 animate-pulse">
                {(state.inbox || []).length}
              </span>
            ) : (
              <kbd className="ml-0.5 rounded bg-white/20 dark:bg-black/20 px-1 py-0.5 text-[9px] font-mono">C</kbd>
            )}
          </button>

          {actions.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowQuickMenu((v) => !v)}
                title="Acciones y atajos rápidos"
                className={`flex h-9 w-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  showQuickMenu
                    ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]'
                }`}
                aria-label="Más acciones rápidas"
              >
                <AppIcon name="chevronDown" className="h-3.5 w-3.5" />
              </button>

              {showQuickMenu && (
                <div
                  className="absolute right-0 top-11 z-50 w-52 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl animate-in fade-in slide-in-from-top-1"
                  onClick={() => setShowQuickMenu(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Atajos directos
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {actions.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          onQuickAction(q.view, q.focusId, q.txType);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--blue-soft)] hover:text-[var(--blue)] transition-colors cursor-pointer"
                      >
                        <span>{q.label}</span>
                        <span className="text-[10px] text-[var(--text-faint)] uppercase">{q.view}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
                ? (!cloudUser ? 'Conectar con Google para sincronizar PC y celular' : (lastSyncedAt && syncStatus === 'synced' ? `${syncLed.label} · Última confirmación: ${lastSyncedAt}` : syncLed.label))
                : 'Datos guardados en este dispositivo'
            }
          >
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${syncLed.dotClass}`} />
            {cloudConfigured && !cloudUser ? (
              <span className="inline font-bold text-[11px] sm:text-xs">Conectar</span>
            ) : (
              <span className="hidden md:inline">{syncLed.label}</span>
            )}
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

        {/* Sound Toggle Icon Button */}
        <button
          onClick={toggleSound}
          title={soundOn ? 'Sonidos activados (clic para silenciar)' : 'Sonidos silenciados (clic para activar)'}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${
            soundOn
              ? 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]'
              : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-faint)]'
          }`}
          aria-label={soundOn ? 'Desactivar sonido' : 'Activar sonido'}
        >
          <AppIcon name={soundOn ? 'volume' : 'volumeOff'} className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
