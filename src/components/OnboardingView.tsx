import React, { useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  Dumbbell,
  FileText,
  GraduationCap,
  KeyRound,
  Lock,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LifeOSState, ViewType } from '../types';
import {
  DEFAULT_ONBOARDING_MODULE_IDS,
  ONBOARDING_MODULES,
} from '../lib/moduleVisibility';
import { SurfaceCard } from './ui/SurfacePrimitives';
import lifeosIcon from '../assets/lifeos-icon.png';
import { playSound } from '../lib/audio';

const MODULE_ICONS: Partial<Record<ViewType, LucideIcon>> = {
  finanzas: Wallet,
  gimnasio: Dumbbell,
  estudios: GraduationCap,
  trabajo: Briefcase,
  agenda: CalendarClock,
  calendario: CalendarDays,
  notas: FileText,
  reventa: Store,
};

export interface OnboardingCompleteData {
  selectedModuleIds: ViewType[];
  name: string;
  initialContext?: {
    sleepHours: number;
    energy: number;
    mood: number;
  };
}

interface OnboardingViewProps {
  state: LifeOSState;
  onComplete: (data: OnboardingCompleteData) => void;
  initialStep?: 1 | 2;
}

const PRIVACY_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Datos aislados en tu cuenta:',
    detail: 'solo vos accedés a tus registros (con modo local o nube opcional).',
  },
  {
    icon: Lock,
    title: 'Finanzas 100 % privadas y manuales:',
    detail: 'nunca conectamos bancos ni pedimos tarjetas o contraseñas.',
  },
  {
    icon: KeyRound,
    title: 'Control total:',
    detail: 'cifrado de extremo a extremo opcional, exportación completa en JSON y borrado real de cuenta cuando quieras.',
  },
] as const;

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  state,
  onComplete,
  initialStep = 1,
}) => {
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [name, setName] = useState(state.profile?.name || '');
  const [selectedIds, setSelectedIds] = useState<Set<ViewType>>(
    () => new Set<ViewType>(DEFAULT_ONBOARDING_MODULE_IDS)
  );

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

  const handleSelectEssentials = () => {
    setSelectedIds(new Set<ViewType>(DEFAULT_ONBOARDING_MODULE_IDS));
    playSound('click');
  };

  const handleConfirm = () => {
    playSound('success');
    onComplete({
      selectedModuleIds: Array.from(selectedIds),
      name: name.trim(),
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col justify-center items-center p-4 sm:p-6 antialiased selection:bg-[#4F46E5]/15 selection:text-[#4F46E5]">
      <SurfaceCard
        as="aside"
        className="w-full max-w-xl p-6 sm:p-8 flex flex-col gap-6"
        aria-label="Configuración inicial"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={lifeosIcon}
              alt=""
              className="h-9 w-9 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                Celestian LifeOS
              </span>
              <h1 className="truncate text-lg sm:text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                {step === 1 ? 'Empecemos por tu espacio' : 'Elegí tus espacios'}
              </h1>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#4F46E5]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-indigo-300 tabular-nums">
            Paso {step} de 2
          </span>
        </header>

        {/* PASO 1: Identidad y Confianza */}
        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              playSound('click');
              setStep(2);
            }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label
                htmlFor="onboarding-name"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                ¿Cómo te llamás?
              </label>
              <input
                id="onboarding-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre o apodo"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#4F46E5] focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus:ring-2 focus:ring-indigo-500/40 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Bloque compacto de confianza */}
            <section
              aria-label="Tu privacidad en 3 puntos"
              className="border-t border-slate-100 pt-5 dark:border-white/[0.07] space-y-3"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tu privacidad en 3 puntos
              </h2>
              <ul className="space-y-2.5">
                {PRIVACY_POINTS.map(({ icon: Icon, title, detail }) => (
                  <li key={title} className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    <Icon
                      size={16}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-indigo-400"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="font-semibold text-slate-800 dark:text-slate-200">
                        {title}
                      </strong>{' '}
                      {detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <footer className="pt-1">
              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Siguiente</span>
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </footer>
          </form>
        )}

        {/* PASO 2: Elegí tus espacios */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Quick Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-2.5 text-xs dark:border-white/[0.07]">
              <span className="font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedCount === 0
                  ? 'Solo base diaria (Hoy)'
                  : `${selectedCount} de ${ONBOARDING_MODULES.length} seleccionados`}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-semibold text-[#4F46E5] hover:underline dark:text-indigo-400 cursor-pointer"
                >
                  Seleccionar todos
                </button>
                <span className="text-slate-200 dark:text-white/10" aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={handleSelectEssentials}
                  className="font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
                >
                  Solo lo esencial
                </button>
              </div>
            </div>

            {/* Modules Grid */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[48vh] sm:max-h-none overflow-y-auto pr-0.5"
              role="group"
              aria-label="Módulos disponibles"
            >
              {ONBOARDING_MODULES.map((mod) => {
                const isSelected = selectedIds.has(mod.id);
                const ModIcon = MODULE_ICONS[mod.id] || FileText;

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
                    className={`rounded-xl border p-3.5 text-left transition-colors cursor-pointer flex items-start gap-3 select-none ${
                      isSelected
                        ? 'border-[#4F46E5] bg-[#4F46E5]/[0.04] dark:bg-[#4F46E5]/10'
                        : 'border-slate-200/80 bg-transparent hover:border-slate-300 dark:border-white/[0.07] dark:hover:border-white/[0.15]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 transition-colors ${
                        isSelected
                          ? 'text-[#4F46E5] dark:text-indigo-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                      aria-hidden="true"
                    >
                      <ModIcon size={18} strokeWidth={1.75} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <strong
                          className={`text-xs font-semibold leading-tight ${
                            isSelected
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {mod.name}
                        </strong>
                        <span
                          aria-hidden="true"
                          className={`h-4 w-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                              : 'border-slate-300 dark:border-white/20'
                          }`}
                        >
                          {isSelected && <Check size={11} strokeWidth={2.5} />}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                        {mod.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Podés activar o desactivar cualquier módulo después en Configuración sin perder datos.
            </p>

            {/* Footer Actions */}
            <footer className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  setStep(1);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Atrás</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA] transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>
                  {selectedCount > 0
                    ? `Comenzar con ${selectedCount} ${selectedCount === 1 ? 'espacio' : 'espacios'}`
                    : 'Comenzar solo con Hoy'}
                </span>
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </footer>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};
