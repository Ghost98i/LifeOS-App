import React from 'react';
import { ViewType, LifeOSState } from '../types';
import lifeOSIcon from '../assets/lifeos-icon.png';

interface SidebarProps {
  currentView: ViewType;
  state: LifeOSState;
  onNavigate: (view: ViewType) => void;
  onToggleTheme: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const NAV_ITEMS: { id: ViewType; icon: string; label: string; optional?: boolean }[] = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'agenda', icon: '📅', label: 'Agenda', optional: true },
  { id: 'calendario', icon: '🗓️', label: 'Calendario', optional: true },
  { id: 'trabajo', icon: '💼', label: 'Trabajo', optional: true },
  { id: 'reventa', icon: '🔁', label: 'Reventa', optional: true },
  { id: 'finanzas', icon: '💰', label: 'Finanzas', optional: true },
  { id: 'gimnasio', icon: '🏋️', label: 'Gimnasio', optional: true },
  { id: 'estudios', icon: '📚', label: 'Estudios', optional: true },
  { id: 'notas', icon: '📝', label: 'Notas', optional: true },
  { id: 'ia', icon: '🤖', label: 'IA', optional: true },
  { id: 'config', icon: '⚙️', label: 'Configuración' },
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
        className={`fixed lg:sticky top-0 left-0 h-screen w-60 bg-[var(--bg-elevated)] border-r border-[var(--border)] flex flex-col p-5 z-50 transition-transform duration-200 ease-in-out shrink-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 pb-5 px-2">
          <img src={lifeOSIcon} alt="" className="h-9 w-9 shrink-0 rounded-xl shadow-md shadow-blue-500/20" />
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-[var(--text)] leading-none">LifeOS</span>
            <span className="text-[10px] font-semibold text-[var(--text-faint)] tracking-wider uppercase mt-1">Tu centro personal</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-[var(--blue-soft)] text-[var(--blue)] font-bold shadow-xs'
                    : 'text-[var(--text-soft)] hover:bg-[var(--bg)] hover:text-[var(--text)]'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--blue)] rounded-r-full" />
                )}
                <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-[var(--border)] mt-2 flex items-center justify-between">
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
          >
            <span>{state.settings.darkMode ? '☀️' : '🌙'}</span>
            <span>{state.settings.darkMode ? 'Claro' : 'Oscuro'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
