import React from 'react';
import type { ViewType } from '../types';
import { AppIcon } from './AppIcon';

interface MobileNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenCapture: () => void;
  onOpenMore: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentView, onNavigate, onOpenCapture, onOpenMore }) => {
  const itemClass = (active: boolean) => `flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[11px] font-semibold ${active ? 'text-[var(--blue)]' : 'text-[var(--text-faint)]'}`;
  const moreActive = !['dashboard', 'gimnasio', 'finanzas'].includes(currentView);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-[var(--border)] bg-[var(--nav-mobile)] px-2 pt-2 pb-[max(.55rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(2,8,23,.08)] backdrop-blur-xl lg:hidden">
      <button onClick={() => onNavigate('dashboard')} className={itemClass(currentView === 'dashboard')} aria-label="Ir a Hoy" aria-current={currentView === 'dashboard' ? 'page' : undefined}><AppIcon name="home" className="h-[21px] w-[21px]"/><span>Hoy</span></button>
      <button onClick={() => onNavigate('gimnasio')} className={itemClass(currentView === 'gimnasio')} aria-label="Ir a Gimnasio" aria-current={currentView === 'gimnasio' ? 'page' : undefined}><AppIcon name="dumbbell" className="h-[21px] w-[21px]"/><span>Gimnasio</span></button>
      <button onClick={onOpenCapture} className="mx-2 -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--blue)] text-white shadow-lg shadow-blue-500/25" aria-label="Captura rápida"><AppIcon name="plus" className="h-7 w-7"/></button>
      <button onClick={() => onNavigate('finanzas')} className={itemClass(currentView === 'finanzas')} aria-label="Ir a Finanzas" aria-current={currentView === 'finanzas' ? 'page' : undefined}><AppIcon name="wallet" className="h-[21px] w-[21px]"/><span>Finanzas</span></button>
      <button onClick={onOpenMore} className={itemClass(moreActive)} aria-label="Abrir más secciones" aria-current={moreActive ? 'page' : undefined}><AppIcon name="more" className="h-[21px] w-[21px]"/><span>Más</span></button>
    </nav>
  );
};
