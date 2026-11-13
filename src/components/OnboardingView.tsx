import React, { useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { ONBOARDING_MODULES } from '../lib/moduleVisibility';
import { AppIcon } from './AppIcon';
import lifeosIcon from '../assets/lifeos-icon.png';
import { playSound } from '../lib/audio';

export interface OnboardingCompleteData {
  selectedModuleIds: ViewType[];
  name: string;
  initialContext: {
    sleepHours: number;
    energy: number;
    mood: number;
  };
}

interface OnboardingViewProps {
  state: LifeOSState;
  onComplete: (data: OnboardingCompleteData) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ state, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(state.profile?.name || '');
  const [sleepHours, setSleepHours] = useState<number | string>(7);
  const [energy, setEnergy] = useState<number>(3);
  const [mood, setMood] = useState<number>(3);

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
    onComplete({
      selectedModuleIds: Array.from(selectedIds),
      name: name.trim(),
      initialContext: {
        sleepHours: Number(sleepHours),
        energy,
        mood,
      },
    });
  };

  const selectedCount = selectedIds.size;
  const numSleep = Number(sleepHours);
  const isStep2Valid =
    sleepHours !== '' &&
    !isNaN(numSleep) &&
    numSleep >= 0 &&
    numSleep <= 24 &&
    energy >= 1 &&
    energy <= 5 &&
    mood >= 1 &&
    mood <= 5;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 antialiased selection:bg-blue-500/20 selection:text-blue-500">
      <main
        className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200"
        aria-label="Configuración inicial"
      >
        {/* Header with Step Indicator */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
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
                  {step === 1 && 'Bienvenido a Celestian LifeOS'}
                  {step === 2 && '¿Cómo estás hoy?'}
                  {step === 3 && 'Personalizá tu espacio'}
                </h1>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[11px] font-bold text-[var(--blue)] bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                Paso {step} de 3
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-soft)] leading-relaxed">
            {step === 1 && 'Ingresá tu nombre para que podamos personalizar tu centro de control.'}
            {step === 2 && 'Usamos esto para recomendarte tareas según tu energía real.'}
            {step === 3 && 'Elegí las áreas que querés gestionar. Podés activarlas o cambiarlas desde Configuración.'}
          </p>
        </header>

        {/* PASO 1: Bienvenida */}
        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              playSound('click');
              setStep(2);
            }}
            className="space-y-6 animate-in fade-in duration-150"
          >
            <div className="space-y-2">
              <label htmlFor="onboarding-name" className="block text-xs sm:text-sm font-semibold text-[var(--text)]">
                ¿Cómo te llamás?
              </label>
              <input
                id="onboarding-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ingresá tu nombre o apodo"
                className="w-full px-4 py-3 rounded-2xl bg-[var(--surface-muted)]/60 border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-hidden focus:border-[var(--blue)] focus:ring-2 focus:ring-blue-500/20 text-base font-medium transition-all"
              />
              <p className="text-[11px] text-[var(--text-faint)]">
                Lo usaremos para saludarte y personalizar tu experiencia diaria.
              </p>
            </div>

            <footer className="pt-2">
              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Siguiente</span>
                <AppIcon name="arrowRight" className="h-4 w-4" />
              </button>
            </footer>
          </form>
        )}

        {/* PASO 2: Check-in Inicial */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Horas de sueño */}
            <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="onboarding-sleep" className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                  Horas de sueño
                </label>
                <span className="text-xs font-bold text-[var(--blue)] tabular-nums">
                  {sleepHours !== '' ? `${sleepHours} hs` : 'Sin definir'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {[5, 6, 7, 8, 9].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setSleepHours(h);
                        playSound('click');
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        Number(sleepHours) === h
                          ? 'bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs'
                          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <input
                  id="onboarding-sleep"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={sleepHours}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.max(0, Math.min(24, Number(e.target.value)));
                    setSleepHours(val);
                  }}
                  placeholder="0-24"
                  className="w-20 px-3 py-1.5 text-xs rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden text-center tabular-nums font-semibold"
                />
              </div>
            </div>

            {/* Nivel de energía */}
            <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                  Energía (1 - 5)
                </span>
                <span className="text-xs font-bold text-amber-500 tabular-nums">
                  {energy}/5 · {['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'][energy - 1]}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5] as const).map((lvl) => {
                  const isSelected = energy === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setEnergy(lvl);
                        playSound('click');
                      }}
                      className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-extrabold ring-1 ring-amber-500/30 shadow-xs'
                          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="text-sm font-bold">{lvl}</span>
                      <span className="text-[10px] opacity-80 truncate max-w-full">
                        {['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'][lvl - 1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Estado de ánimo */}
            <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                  Ánimo (1 - 5)
                </span>
                <span className="text-xs font-bold text-[var(--blue)] tabular-nums">
                  {mood}/5 · {['Muy bajo', 'Bajo', 'Estable', 'Bueno', 'Muy bueno'][mood - 1]}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5] as const).map((lvl) => {
                  const isSelected = mood === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setMood(lvl);
                        playSound('click');
                      }}
                      className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-blue-500/15 border-[var(--blue)] text-[var(--blue)] font-extrabold ring-1 ring-blue-500/30 shadow-xs'
                          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="text-sm font-bold">{lvl}</span>
                      <span className="text-[10px] opacity-80 truncate max-w-full">
                        {['Muy bajo', 'Bajo', 'Estable', 'Bueno', 'Muy bueno'][lvl - 1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Step 2 */}
            <footer className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  setStep(1);
                }}
                className="px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 text-[var(--text)] hover:bg-[var(--surface-muted)] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98"
              >
                <AppIcon name="chevronLeft" className="h-4 w-4" />
                <span>Atrás</span>
              </button>
              <button
                type="button"
                disabled={!isStep2Valid}
                onClick={() => {
                  playSound('click');
                  setStep(3);
                }}
                className="flex-1 px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Siguiente</span>
                <AppIcon name="arrowRight" className="h-4 w-4" />
              </button>
            </footer>
          </div>
        )}

        {/* PASO 3: Selección de Módulos */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-150">
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
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[46vh] sm:max-h-none overflow-y-auto pr-0.5"
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setStep(2);
                  }}
                  className="px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 text-[var(--text)] hover:bg-[var(--surface-muted)] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98"
                >
                  <AppIcon name="chevronLeft" className="h-4 w-4" />
                  <span>Atrás</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
                >
                  <span>
                    {selectedCount > 0
                      ? `Comenzar con ${selectedCount} ${selectedCount === 1 ? 'módulo' : 'módulos'}`
                      : 'Comenzar sin módulos opcionales'}
                  </span>
                  <AppIcon name="arrowRight" className="h-4 w-4" />
                </button>
              </div>

              <p className="text-center text-[11px] text-[var(--text-faint)]">
                Las tareas diarias y la captura rápida están siempre disponibles como base del sistema.
              </p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
};
