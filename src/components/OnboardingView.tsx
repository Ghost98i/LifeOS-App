import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  Cloud,
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
import type { CloudSyncStatus, CloudUser } from '../lib/cloudSync';
import {
  DEFAULT_ONBOARDING_MODULE_IDS,
  ONBOARDING_MODULES,
} from '../lib/moduleVisibility';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { CompletionCheck } from './ui/CompletionCheck';
import { CelestianMark } from './visual/CelestianMark';
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

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

function blurOnMouseClick(event: React.MouseEvent<HTMLElement>) {
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
}

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
  cloudConfigured?: boolean;
  cloudUser?: CloudUser | null;
  syncStatus?: CloudSyncStatus;
  onCloudSignIn?: () => void | Promise<void>;
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
  cloudConfigured = false,
  cloudUser = null,
  syncStatus = 'signed-out',
  onCloudSignIn,
}) => {
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [name, setName] = useState(state.profile?.name || cloudUser?.name || '');
  const [selectedIds, setSelectedIds] = useState<Set<ViewType>>(
    () => new Set<ViewType>(DEFAULT_ONBOARDING_MODULE_IDS)
  );

  useEffect(() => {
    if (!name.trim() && cloudUser?.name) {
      setName(cloudUser.name);
    }
  }, [cloudUser?.name, name]);

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
  const showGoogleEntry = Boolean(cloudConfigured && onCloudSignIn && !cloudUser);
  const isConnectingGoogle = syncStatus === 'connecting';

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] flex flex-col justify-center items-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8 antialiased selection:bg-[#4F46E5]/15 selection:text-[#4F46E5]">
      <SurfaceCard
        as="main"
        className="w-full max-w-xl p-6 sm:p-8 flex flex-col gap-6 shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:shadow-none"
        aria-label="Configuración inicial"
      >
        {/* Header & Step Progress */}
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CelestianMark size={34} className="shrink-0" />
              <span className="truncate text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-400">
                Celestian LifeOS
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-[#4F46E5]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#818CF8] tabular-nums">
              Paso {step} de 2
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.025em] text-slate-900 dark:text-slate-100 leading-tight">
              {step === 1 ? 'Empecemos por tu espacio' : 'Elegí tus espacios'}
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {step === 1
                ? 'Un entorno sereno para tu día, tus finanzas y tus metas. Empezá en este dispositivo o conectá Google.'
                : 'Activá solo lo que necesitás hoy. Vas a poder ajustar tus módulos en cualquier momento.'}
            </p>
          </div>

          {/* Sober 2-step indigo progress indicator */}
          <div className="grid grid-cols-2 gap-2 pt-0.5" aria-hidden="true">
            <div className="h-1 rounded-full bg-[#4F46E5] dark:bg-[#818CF8]" />
            <div
              className={`h-1 rounded-full transition-colors duration-200 ${
                step === 2
                  ? 'bg-[#4F46E5] dark:bg-[#818CF8]'
                  : 'bg-slate-200/90 dark:bg-white/[0.08]'
              }`}
            />
          </div>
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
            className="space-y-5"
          >
            {cloudUser && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <Cloud size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Conectado con Google como <strong className="font-semibold">{cloudUser.email || cloudUser.name}</strong>
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="onboarding-name"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                ¿Cómo te llamás?
              </label>
              <input
                id="onboarding-name"
                type="text"
                autoFocus
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre o apodo"
                className="celestian-clean-field w-full min-h-11 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 transition-colors dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>

            {/* Balanced Primary & Cloud Entry Actions */}
            <div className="space-y-2.5 pt-0.5">
              <button
                type="submit"
                disabled={!name.trim() || isConnectingGoogle}
                onClick={blurOnMouseClick}
                className={`w-full min-h-11 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${CLEAN_FOCUS}`}
              >
                <span>{showGoogleEntry ? 'Continuar en modo local' : 'Siguiente'}</span>
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>

              {showGoogleEntry && (
                <>
                  <div className="flex items-center gap-3 py-0.5">
                    <span className="h-px flex-1 bg-slate-200/80 dark:bg-white/[0.08]" aria-hidden="true" />
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      o sincronizá tu cuenta
                    </span>
                    <span className="h-px flex-1 bg-slate-200/80 dark:bg-white/[0.08]" aria-hidden="true" />
                  </div>

                  <button
                    type="button"
                    disabled={isConnectingGoogle}
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      playSound('click');
                      void onCloudSignIn?.();
                    }}
                    className={`w-full min-h-11 rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-[#4F46E5]/40 hover:bg-indigo-50/50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:hover:border-[#818CF8]/45 dark:hover:bg-[#4F46E5]/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
                  >
                    <Cloud size={16} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                    <span>{isConnectingGoogle ? 'Conectando con Google…' : 'Conectar con Google en 1 clic'}</span>
                  </button>
                </>
              )}
            </div>

            {/* Bloque compacto de confianza */}
            <section
              aria-label="Tu privacidad en 3 puntos"
              className="border-t border-slate-100 pt-5 dark:border-white/[0.07] space-y-3"
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Tu privacidad en 3 puntos
              </h2>
              <ul className="space-y-3">
                {PRIVACY_POINTS.map(({ icon: Icon, title, detail }) => (
                  <li key={title} className="flex items-start gap-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4F46E5]/[0.08] text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#818CF8]"
                      aria-hidden="true"
                    >
                      <Icon size={14} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <strong className="font-semibold text-slate-900 dark:text-slate-100">
                        {title}
                      </strong>{' '}
                      {detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </form>
        )}

        {/* PASO 2: Elegí tus espacios */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Quick Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-y border-slate-100 py-2 text-[11px] sm:text-xs dark:border-white/[0.07]">
              <span className="font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                {selectedCount === 0
                  ? 'Solo base diaria (Hoy)'
                  : `${selectedCount} de ${ONBOARDING_MODULES.length} seleccionados`}
              </span>
              <div className="flex items-center gap-1 -mr-2">
                <button
                  type="button"
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    handleSelectAll();
                  }}
                  className={`inline-flex min-h-9 items-center rounded-lg px-2 py-1 font-semibold text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/10 dark:text-[#818CF8] dark:hover:bg-[#4F46E5]/15 cursor-pointer ${CLEAN_FOCUS}`}
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    handleSelectEssentials();
                  }}
                  className={`inline-flex min-h-9 items-center rounded-lg px-2 py-1 font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer ${CLEAN_FOCUS}`}
                >
                  Solo lo esencial
                </button>
              </div>
            </div>

            {/* Modules Grid */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[48dvh] sm:max-h-none overflow-y-auto pr-1.5 sm:pr-0"
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
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      toggleModule(mod.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleModule(mod.id);
                      }
                    }}
                    className={`group min-h-[68px] rounded-2xl border p-3.5 text-left transition-all cursor-pointer flex items-start gap-3 select-none ${CLEAN_FOCUS} ${
                      isSelected
                        ? 'border-[#4F46E5] bg-[#4F46E5]/[0.05] dark:border-[#818CF8] dark:bg-[#4F46E5]/[0.14]'
                        : 'border-slate-200/85 bg-white hover:border-indigo-300/80 hover:bg-slate-50/70 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-[#4F46E5] dark:bg-white/[0.06] dark:text-slate-400 dark:group-hover:bg-indigo-500/15 dark:group-hover:text-[#818CF8]'
                      }`}
                      aria-hidden="true"
                    >
                      <ModIcon size={17} strokeWidth={1.75} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <strong
                          className={`text-xs sm:text-[13px] font-semibold leading-tight truncate ${
                            isSelected
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {mod.name}
                        </strong>
                        <CompletionCheck checked={isSelected} size="sm" />
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
            <footer className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={(event) => {
                  blurOnMouseClick(event);
                  playSound('click');
                  setStep(1);
                }}
                className={`min-h-11 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.05] transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${CLEAN_FOCUS}`}
              >
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Atrás</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  blurOnMouseClick(event);
                  handleConfirm();
                }}
                className={`min-h-11 flex-1 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA] transition-colors flex items-center justify-center gap-2 cursor-pointer ${CLEAN_FOCUS}`}
              >
                <span className="truncate">
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
