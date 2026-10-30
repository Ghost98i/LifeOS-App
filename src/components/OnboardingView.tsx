import React, { useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { ONBOARDING_MODULES } from '../lib/moduleVisibility';
import { AppIcon } from './AppIcon';
import lifeosIcon from '../assets/lifeos-icon.png';
import { playSound } from '../lib/audio';

interface OnboardingViewProps {
  state: LifeOSState;
  onComplete: (selectedModuleIds: ViewType[]) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  // Start with clean initial selection state (user actively chooses what they need)
  const [selectedIds, setSelectedIds] = useState<Set<ViewType>>(new Set());

  const toggleModule = (id: ViewType) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    playSound('click');
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(ONBOARDING_MODULES.map((m) => m.id)));
    playSound('click');
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    playSound('click');
  };

  const handleConfirm = () => {
    playSound('success');
    onComplete(Array.from(selectedIds));
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 antialiased selection:bg-blue-500/20 selection:text-blue-500">
      <main
        className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200"
        aria-label="Configuración inicial de módulos"
      >
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={lifeosIcon}
              alt=""
              className="h-10 w-10 shrink-0 rounded-2xl shadow-xs"
            />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-faint)]">
                Celestian LifeOS · Primeros pasos
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text)] tracking-tight">
                Personalizá tu espacio
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-soft)] leading-relaxed">
            Elegí las áreas que querés gestionar. Podés activarlas o cambiarlas desde Configuración.
          </p>
        </header>

        {/* Quick Toolbar */}
        <div className="flex items-center justify-between border-y border-[var(--border)] py-2 text-xs">
          <span className="text-[11px] font-medium text-[var(--text-faint)]">
            {selectedCount === 0
              ? 'Sin módulos opcionales (Modo mínimo)'
              : `${selectedCount} de ${ONBOARDING_MODULES.length} seleccionados`}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Seleccionar todos
            </button>
            <span className="text-[var(--border)]">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Desmarcar todos
            </button>
          </div>
        </div>

        {/* Modules Grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
          role="group"
          aria-label="Módulos disponibles"
        >
          {ONBOARDING_MODULES.map((mod) => {
            const isSelected = selectedIds.has(mod.id);

            return (
              <button
                key={mod.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => toggleModule(mod.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggleModule(mod.id);
                  }
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 select-none ${
                  isSelected
                    ? 'bg-[var(--bg-elevated)] border-[var(--blue)] ring-1 ring-[var(--blue)] shadow-xs'
                    : 'bg-[var(--surface-muted)]/50 border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-muted)] text-[var(--text-soft)]'
                }`}
              >
                {/* Icon */}
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isSelected
                      ? 'bg-blue-500/15 text-[var(--blue)]'
                      : 'bg-[var(--card)] text-[var(--text-faint)] border border-[var(--border)]'
                  }`}
                >
                  <AppIcon name={mod.icon} className="h-4 w-4" />
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-1">
                    <strong
                      className={`text-xs font-bold leading-tight ${
                        isSelected ? 'text-[var(--text)]' : 'text-[var(--text-soft)]'
                      }`}
                    >
                      {mod.name}
                    </strong>
                    {/* Checkbox indicator */}
                    <span
                      aria-hidden="true"
                      className={`h-4 w-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? 'border-[var(--blue)] bg-[var(--blue)] text-white'
                          : 'border-[var(--border-hover)] bg-[var(--card)]'
                      }`}
                    >
                      {isSelected && <AppIcon name="check" className="h-3 w-3 stroke-[3]" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-faint)] leading-snug line-clamp-2">
                    {mod.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <footer className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
          >
            <span>
              {selectedCount > 0
                ? `Comenzar con ${selectedCount} ${selectedCount === 1 ? 'módulo' : 'módulos'}`
                : 'Continuar sin módulos opcionales'}
            </span>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>

          <p className="text-center text-[11px] text-[var(--text-faint)]">
            Las tareas diarias y la captura rápida están siempre disponibles como base del sistema.
          </p>
        </footer>
      </main>
    </div>
  );
};
