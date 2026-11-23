import React, { useEffect, useRef } from 'react';
import { ViewType, LifeOSState } from '../types';
import { CelestianMark } from './visual/CelestianMark';
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
  { id: 'reventa', icon: 'store', label: 'Mi negocio', optional: true },
  { id: 'estudios', icon: 'graduation', label: 'Estudios', optional: true },
  { id: 'notas', icon: 'note', label: 'Notas', optional: true },
  { id: 'ia', icon: 'ai', label: 'IA', optional: true },
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
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onCloseMobile);
  closeRef.current = onCloseMobile;

  useEffect(() => {
    if (!isOpenMobile || window.matchMedia('(min-width: 1024px)').matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLButtonElement>('[aria-label="Cerrar navegación"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(drawerRef.current?.querySelectorAll('button:not(:disabled)') || []) as HTMLButtonElement[];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => { if (desktop.matches) closeRef.current(); };
    desktop.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onResize);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpenMobile]);

  return (
    <>
      {/* Drawer Overlay for Mobile */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/45 z-[70] lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        ref={drawerRef}
        aria-label="Navegación principal"
        className={`fixed lg:sticky top-0 left-0 h-screen w-[232px] bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col p-4 z-[75] lg:z-50 transition-transform duration-200 ease-in-out shrink-0 shadow-[var(--chrome-shadow)] ${
          isOpenMobile ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-5 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <CelestianMark size={32} className="shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black leading-none tracking-tight text-[var(--text)] truncate">Celestian LifeOS</span>
              <span className="mt-1 text-[10px] font-semibold text-[var(--text-faint)] truncate tracking-wide">Workspace Personal</span>
            </div>
          </div>
        </div>

        <button type="button" onClick={onCloseMobile} aria-label="Cerrar navegación" className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-soft)] lg:hidden">
          <AppIcon name="x" className="h-4 w-4" /> Cerrar
        </button>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item, idx) => {
            const isActive = currentView === item.id;
            const showPrincipalHeader = idx === 0;
            const showOrganizarHeader = item.id === 'agenda';
            const showSistemaHeader = item.id === 'ia' || (item.id === 'config' && !items.some(i => i.id === 'ia'));

            return (
              <React.Fragment key={item.id}>
                {showPrincipalHeader && (
                  <span className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]/75">
                    Principal
                  </span>
                )}
                {showOrganizarHeader && (
                  <span className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]/75">
                    Organización
                  </span>
                )}
                {showSistemaHeader && (
                  <span className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]/75">
                    Sistema
                  </span>
                )}
                <button
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/40 ${
                    isActive
                      ? 'bg-[#4F46E5]/12 dark:bg-[#4F46E5]/20 font-bold text-[var(--text)] ring-1 ring-inset ring-[#4F46E5]/30 dark:ring-[#818CF8]/30 shadow-2xs'
                      : 'font-medium text-[var(--text-soft)] hover:bg-[var(--surface-muted)]/60 hover:text-[var(--text)]'
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <AppIcon
                      name={item.icon}
                      strokeWidth={1.75}
                      className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                        isActive ? 'text-[#4F46E5] dark:text-[#818CF8]' : 'text-[var(--text-soft)] group-hover:text-[var(--text)]'
                      }`}
                    />
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-[var(--border)] mt-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={state.settings.darkMode}
            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-all cursor-pointer shadow-2xs group"
            title={state.settings.darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            <div className="flex items-center gap-2.5">
              <AppIcon
                name={state.settings.darkMode ? 'moon' : 'sun'}
                strokeWidth={1.75}
                className="h-4 w-4 shrink-0 text-[var(--text-soft)] group-hover:text-[#4F46E5] dark:group-hover:text-[#818CF8] transition-colors"
              />
              <span>Modo {state.settings.darkMode ? 'oscuro' : 'claro'}</span>
            </div>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
                state.settings.darkMode
                  ? 'border-[#4F46E5] bg-[#4F46E5] justify-end'
                  : 'border-[var(--border-strong)] bg-[var(--surface-muted)] justify-start'
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full bg-white shadow-2xs transition-transform" />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
