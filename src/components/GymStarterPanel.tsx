import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Dumbbell, Play, Plus, X } from 'lucide-react';
import {
  GYM_STARTER_PACKS,
  type GymStarterPackId,
} from '../lib/gymStarterTemplates';
import { SurfaceCard, SectionHeader } from './ui/SurfacePrimitives';
import { GymIcon } from './visual/GymIcon';

interface GymStarterPanelProps {
  onLoadPack: (packId: GymStarterPackId) => void;
  onCreateCustom?: () => void;
  onStartFreeWorkout?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

const QUICK_GUIDE_POINTS = [
  {
    title: 'Calentamiento:',
    detail: '5 min de cardio suave antes de empezar; las series de aproximación ya vienen separadas y no suman al volumen efectivo.',
  },
  {
    title: 'Esfuerzo controlado (RIR 3–4 en principiantes):',
    detail: 'terminá cada serie sintiendo que podrías hacer 3 o 4 repeticiones más con técnica limpia, sin buscar el fallo.',
  },
  {
    title: 'Cómo progresar:',
    detail: 'completá el techo del rango de repeticiones en las 3 series con buen control y recién en la siguiente sesión subí el mínimo peso disponible.',
  },
  {
    title: 'Seguridad:',
    detail: 'frená ante dolor agudo o mareos; estas plantillas son orientativas para adultos sin lesiones previas.',
  },
] as const;

export const GymStarterPanel: React.FC<GymStarterPanelProps> = ({
  onLoadPack,
  onCreateCustom,
  onStartFreeWorkout,
  onClose,
  compact = false,
}) => {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const closeGuideBtnRef = useRef<HTMLButtonElement>(null);
  const triggerGuideBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isGuideOpen) return;
    closeGuideBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsGuideOpen(false);
        triggerGuideBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isGuideOpen]);

  const handleCloseGuide = () => {
    setIsGuideOpen(false);
    triggerGuideBtnRef.current?.focus();
  };

  return (
    <>
      <SurfaceCard
        data-gym-starter-panel
        className="p-5 sm:p-6 space-y-5"
        aria-label="Plantillas iniciales de Gimnasio"
      >
        <div className="space-y-1.5">
          <SectionHeader
            icon={<Dumbbell size={17} strokeWidth={1.75} />}
            title={compact ? 'Cargar plantilla inicial' : 'Empezá con una rutina lista'}
            action={
              <div className="flex items-center gap-2">
                <button
                  ref={triggerGuideBtnRef}
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#4F46E5]/10 dark:text-indigo-400 dark:hover:bg-[#4F46E5]/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                >
                  <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Guía rápida</span>
                </button>
                {compact && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                  >
                    <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Cerrar</span>
                  </button>
                )}
              </div>
            }
          />
          {!compact && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Registrar tus cargas y descansos es lo que convierte entrenar en progresar.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {GYM_STARTER_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => onLoadPack(pack.id)}
              className="group rounded-xl border border-slate-200/80 bg-transparent p-4 text-left transition-colors hover:border-[#4F46E5] hover:bg-[#4F46E5]/[0.03] dark:border-white/[0.08] dark:hover:border-[#4F46E5] dark:hover:bg-[#4F46E5]/10 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#4F46E5] dark:group-hover:text-indigo-300 transition-colors">
                    {pack.title}
                  </span>
                  <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    {pack.subtitle}
                  </span>
                </div>
                <GymIcon
                  icon={pack.icon}
                  decorative
                  className="h-9 w-9 shrink-0 opacity-85"
                />
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs dark:border-white/[0.06]">
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {pack.routinesCount} {pack.routinesCount === 1 ? 'rutina' : 'rutinas'} · {pack.totalExercises} ejercicios
                </span>
                <span className="font-semibold text-[#4F46E5] dark:text-indigo-400">
                  Cargar
                </span>
              </div>
            </button>
          ))}
        </div>

        {!compact && (onCreateCustom || onStartFreeWorkout) && (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4 dark:border-white/[0.07]">
            {onCreateCustom && (
              <button
                type="button"
                onClick={onCreateCustom}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Crear mi propia rutina</span>
              </button>
            )}
            {onStartFreeWorkout && (
              <button
                type="button"
                onClick={onStartFreeWorkout}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <Play size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Entrenar libre hoy</span>
              </button>
            )}
          </div>
        )}
      </SurfaceCard>

      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={handleCloseGuide}
        >
          <SurfaceCard
            as="div"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gym-quick-guide-title"
            className="w-full max-w-md p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen
                  size={17}
                  strokeWidth={1.75}
                  className="shrink-0 text-[#4F46E5] dark:text-indigo-400"
                  aria-hidden="true"
                />
                <h3
                  id="gym-quick-guide-title"
                  className="text-sm font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100"
                >
                  Guía rápida de entrenamiento
                </h3>
              </div>
              <button
                ref={closeGuideBtnRef}
                type="button"
                onClick={handleCloseGuide}
                aria-label="Cerrar guía rápida"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <ol className="space-y-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
              {QUICK_GUIDE_POINTS.map((point, idx) => (
                <li
                  key={point.title}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400"
                >
                  <span className="mt-0.5 shrink-0 font-semibold tabular-nums text-[#4F46E5] dark:text-indigo-400">
                    {idx + 1}.
                  </span>
                  <span>
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">
                      {point.title}
                    </strong>{' '}
                    {point.detail}
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleCloseGuide}
                className="rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                Entendido
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}
    </>
  );
};
