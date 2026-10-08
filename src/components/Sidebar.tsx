import React from 'react';
import { ViewType, LifeOSState } from '../types';
import lifeOSIcon from '../assets/lifeos-icon.png';
import { AppIcon, type AppIconName } from './AppIcon';
import { isModuleEnabled } from '../lib/moduleVisibility';

interface SidebarProps {
  currentView: ViewType;
  state: LifeOSState;
  onNavigate: (view: ViewType) => void;
  onToggleTheme: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const NAV_ITEMS: { id: ViewType; icon: AppIconName; label: string; optional?: boolean; primary?: boolean }[] = [
  { id: 'dashboard', icon: 'home', label: 'Hoy', primary: true },
  { id: 'gimnasio', icon: 'dumbbell', label: 'Gimnasio', optional: true, primary: true },
  { id: 'finanzas', icon: 'wallet', label: 'Finanzas', optional: true, primary: true },
  { id: 'agenda', icon: 'calendar', label: 'Agenda', optional: true },
  { id: 'calendario', icon: 'calendarDays', label: 'Calendario', optional: true },
  { id: 'trabajo', icon: 'briefcase', label: 'Trabajo', optional: true },
  { id: 'reventa', icon: 'repeat', label: 'Reventa', optional: true },
  { id: 'estudios', icon: 'book', label: 'Estudios', optional: true },
  { id: 'notas', icon: 'note', label: 'Notas', optional: true },
  { id: 'ia', icon: 'sparkles', label: 'IA', optional: true },
  { id: 'config', icon: 'settings', label: 'Configuración' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  state,
  onNavigate,
  onToggleTheme,
  isOpenMobile,
  onCloseMobile,
}) => {
  const items = NAV_ITEMS.filter((item) => isModuleEnabled(state, item.id));

  return (
    <>
      {/* Drawer Overlay for Mobile */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-[232px] bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col p-4 z-50 transition-transform duration-200 ease-in-out shrink-0 shadow-[var(--chrome-shadow)] ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-5 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative p-0.5 rounded-xl bg-gradient-to-tr from-indigo-500/30 via-blue-500/20 to-transparent shrink-0 shadow-2xs">
              <img src={lifeOSIcon} alt="" className="h-7 w-7 rounded-[10px] object-cover" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black leading-none tracking-tight text-[var(--text)] truncate">LifeOS</span>
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              </div>
              <span className="mt-1 text-[10px] font-semibold text-[var(--text-faint)] truncate tracking-wide">Workspace Personal</span>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item, idx) => {
            const isActive = currentView === item.id;
            const showPrincipalHeader = idx === 0;
            const showOrganizarHeader = item.id === 'agenda';
            const showSistemaHeader = item.id === 'ia' || (item.id === 'config' && !items.some(i => i.id === 'ia'));

            return (
              <React.Fragment key={item.id}>
                {showPrincipalHeader && (
                  <span className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Principal
                  </span>
                )}
                {showOrganizarHeader && (
                  <span className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Organización
                  </span>
                )}
                {showSistemaHeader && (
                  <span className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Sistema
                  </span>
                )}
                <button
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--surface-accent)] font-bold text-[var(--text)] border border-[var(--border)]'
                      : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] border border-transparent'
                  }`}
                >
                  {/* Subtle active left pill indicator */}
                  {isActive && (
                    <span className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-blue-500" />
                  )}
                  <AppIcon
                    name={item.icon}
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-[var(--text-faint)] group-hover:text-[var(--text)]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-[var(--border)] mt-2">
          <button
            onClick={onToggleTheme}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-all cursor-pointer shadow-2xs group"
            title={state.settings.darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text)] group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                <AppIcon name={state.settings.darkMode ? 'sun' : 'moon'} className="h-3.5 w-3.5" />
              </span>
              <span>Modo {state.settings.darkMode ? 'Oscuro' : 'Claro'}</span>
            </div>
            <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--surface-muted)]">
              {state.settings.darkMode ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
