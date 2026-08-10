import React from 'react';
import type { ViewType } from '../types';

interface MobileNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenCapture: () => void;
  onOpenMore: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentView, onNavigate, onOpenCapture, onOpenMore }) => {
  const itemClass = (active: boolean) => `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold ${active ? 'text-[var(--blue)]' : 'text-[var(--text-faint)]'}`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
      <button onClick={() => onNavigate('dashboard')} className={itemClass(currentView === 'dashboard')}><span className="text-xl">🏠</span><span>Hoy</span></button>
      <button onClick={() => onNavigate('agenda')} className={itemClass(currentView === 'agenda' || currentView === 'calendario')}><span className="text-xl">📅</span><span>Agenda</span></button>
      <button onClick={onOpenCapture} className="mx-2 -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--blue)] text-3xl font-light text-white shadow-lg shadow-blue-500/30" aria-label="Captura rápida">+</button>
      <button onClick={() => onNavigate('finanzas')} className={itemClass(currentView === 'finanzas')}><span className="text-xl">💰</span><span>Finanzas</span></button>
      <button onClick={onOpenMore} className={itemClass(false)}><span className="text-xl">•••</span><span>Más</span></button>
    </nav>
  );
};
