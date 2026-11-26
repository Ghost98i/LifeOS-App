import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Dumbbell,
  Moon,
  Play,
  Zap,
} from 'lucide-react';
import type { ViewType } from '../types';
import type { TodayAgendaEntry } from '../lib/todayOverview';
import type { TodaySpotlight } from '../lib/todayControlCenter';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { GymIcon } from './visual/GymIcon';

export interface TodaySpotlightCardProps {
  spotlight: TodaySpotlight;
  onStartGym: (templateId?: string) => void;
  onStartStudy: (subjectId?: string | null, subjectName?: string | null) => void;
  onToggleEntry: (entry: TodayAgendaEntry) => void;
  onOpenCheckout: () => void;
  onNavigate: (view: ViewType) => void;
  canPlanTomorrow?: boolean;
  planTomorrowView?: ViewType;
}

export const TodaySpotlightCard: React.FC<TodaySpotlightCardProps> = ({
  spotlight,
  onStartGym,
  onStartStudy,
  onToggleEntry,
  onOpenCheckout,
  onNavigate,
  canPlanTomorrow = true,
  planTomorrowView = 'agenda',
}) => {
  if (spotlight.mode === 'free') return null;

  const entry = spotlight.block?.entry;
  const isCalm = Boolean(spotlight.isCalmUpcoming);
  const isCurrent = spotlight.mode === 'current';

  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4338CA] active:scale-[0.98] cursor-pointer whitespace-nowrap outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.98] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] cursor-pointer whitespace-nowrap outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70';

  const renderLeadingVisual = () => {
    if (spotlight.domain === 'gym') {
      return (
        <GymIcon
          icon={spotlight.gymInfo?.routineIcon || 'gym-dumbbell'}
          label={spotlight.gymInfo?.templateName || 'Gimnasio'}
          className="h-9 w-9 shrink-0"
          decorative
        />
      );
    }

    const iconClass = isCurrent
      ? 'h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400'
      : 'h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500';

    if (spotlight.domain === 'study') return <BookOpen className={iconClass} strokeWidth={1.75} aria-hidden="true" />;
    if (spotlight.domain === 'closing') {
      return spotlight.mode === 'day_closed'
        ? <CheckCircle2 className={iconClass} strokeWidth={1.75} aria-hidden="true" />
        : <Moon className={iconClass} strokeWidth={1.75} aria-hidden="true" />;
    }
    return isCurrent
      ? <Zap className={iconClass} strokeWidth={1.75} aria-hidden="true" />
      : <Clock className={iconClass} strokeWidth={1.75} aria-hidden="true" />;
  };

  const renderActions = () => {
    // 1. Gym spotlight
    if (spotlight.domain === 'gym') {
      const gym = spotlight.gymInfo;
      const isActive = Boolean(gym?.hasActiveSession);
      const isTrained = gym?.status === 'trained_today';
      const canStart = Boolean(gym?.templateId && (gym?.exerciseCount ?? 0) > 0);

      if (isCalm && !isActive && !isTrained) {
        return (
          <button
            type="button"
            onClick={() => onNavigate('gimnasio')}
            className={secondaryBtnClass}
          >
            <Dumbbell className="h-4 w-4 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
            <span>Ver rutina</span>
          </button>
        );
      }

      const primaryLabel = isActive
        ? 'Continuar sesión'
        : isTrained
          ? 'Ver entrenamiento'
          : canStart
            ? 'Iniciar entrenamiento'
            : 'Abrir Gimnasio';

      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isActive || isTrained || !canStart) onNavigate('gimnasio');
              else onStartGym(gym?.templateId);
            }}
            className={primaryBtnClass}
          >
            {isTrained
              ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              : <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
            <span>{primaryLabel}</span>
          </button>
          {entry?.completable && !entry.done && (
            <button type="button" onClick={() => onToggleEntry(entry)} className={secondaryBtnClass}>
              <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Marcar hecho</span>
            </button>
          )}
        </div>
      );
    }

    // 2. Study spotlight
    if (spotlight.domain === 'study') {
      const study = spotlight.studyInfo;
      const hasActive = Boolean(study?.hasActiveSession);

      if (isCalm && !hasActive) {
        return (
          <button
            type="button"
            onClick={() => onNavigate('estudios')}
            className={secondaryBtnClass}
          >
            <BookOpen className="h-4 w-4 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
            <span>Preparar bloque</span>
          </button>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (hasActive) onNavigate('estudios');
              else onStartStudy(study?.matchedSubjectId, study?.matchedSubjectName);
            }}
            className={primaryBtnClass}
          >
            {hasActive
              ? <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              : <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
            <span>{hasActive ? 'Ir a sesión activa' : 'Iniciar estudio (25 min)'}</span>
          </button>
          {entry?.completable && !entry.done && (
            <button type="button" onClick={() => onToggleEntry(entry)} className={secondaryBtnClass}>
              <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Completar bloque</span>
            </button>
          )}
        </div>
      );
    }

    // 3. Night / Closing spotlight
    if (spotlight.mode === 'closing') {
      return (
        <button type="button" onClick={onOpenCheckout} className={primaryBtnClass}>
          <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Cerrar el día</span>
        </button>
      );
    }

    if (spotlight.mode === 'day_closed') {
      if (!canPlanTomorrow) return null;
      return (
        <button type="button" onClick={() => onNavigate(planTomorrowView)} className={secondaryBtnClass}>
          <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Planificar mañana</span>
        </button>
      );
    }

    // 4. General active or next block
    if (entry) {
      if (isCalm) {
        return (
          <button
            type="button"
            onClick={() => onNavigate(entry.navigationTarget || 'agenda')}
            className={secondaryBtnClass}
          >
            <span>Ver bloque</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
          </button>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-2">
          {entry.completable && (
            <button type="button" onClick={() => onToggleEntry(entry)} className={primaryBtnClass}>
              <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>{entry.done ? 'Marcar pendiente' : 'Completar bloque'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(entry.navigationTarget || 'agenda')}
            className={secondaryBtnClass}
          >
            <span>Ver en {entry.sourceLabel}</span>
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <SurfaceCard
      as="section"
      data-spotlight-mode={spotlight.mode}
      data-spotlight-domain={spotlight.domain}
      data-spotlight-calm={isCalm ? 'true' : 'false'}
      aria-labelledby="today-spotlight-title"
      className="p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className="mt-0.5 shrink-0">{renderLeadingVisual()}</div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  isCurrent
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {isCurrent && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
                )}
                {spotlight.kicker}
              </span>
              {spotlight.timeLabel && (
                <span className="font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  · {spotlight.timeLabel}
                </span>
              )}
              {spotlight.countdownLabel && (
                <span className="text-slate-400 dark:text-slate-500">
                  · {spotlight.countdownLabel}
                </span>
              )}
            </div>

            <h2
              id="today-spotlight-title"
              className="text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-slate-100 sm:text-xl break-words"
            >
              {spotlight.title}
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              {spotlight.subtitle}
            </p>
          </div>
        </div>

        <div className="shrink-0">{renderActions()}</div>
      </div>
    </SurfaceCard>
  );
};
