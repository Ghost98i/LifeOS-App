import React from 'react';
import { ViewType, LifeOSState } from '../types';
import lifeOSIcon from '../assets/lifeos-icon.png';
import { AppIcon, type AppIconName } from './AppIcon';

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
  const hidden = state.settings.hiddenTabs || [];
  const items = NAV_ITEMS.filter((item) => !hidden.includes(item.id));

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
        className={`fixed lg:sticky top-0 left-0 h-screen w-[232px] bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col p-4 z-50 transition-transform duration-200 ease-in-out shrink-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-2 pb-5 pt-1">
          <img src={lifeOSIcon} alt="" className="h-9 w-9 shrink-0 rounded-xl shadow-sm" />
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-none tracking-tight text-[var(--text)]">LifeOS</span>
            <span className="mt-1 text-xs text-[var(--text-faint)]">Tu centro personal</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const isActive = currentView === item.id;
            return (
              <React.Fragment key={item.id}>
                {item.id === 'agenda' && <span className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Organizar</span>}
                <button
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                    isActive
                      ? 'bg-[var(--blue-soft)] font-semibold text-[var(--blue)]'
                      : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <AppIcon name={item.icon} className="h-[19px] w-[19px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-[var(--border)] mt-2 flex items-center justify-between">
          <button
            onClick={onToggleTheme}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <AppIcon name={state.settings.darkMode ? 'sun' : 'moon'} className="h-[19px] w-[19px]" />
            <span>{state.settings.darkMode ? 'Claro' : 'Oscuro'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
