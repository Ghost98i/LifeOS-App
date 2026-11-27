import React from 'react';
import {
  Activity,
  BellOff,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Compass,
  Dumbbell,
  FolderKanban,
  Repeat,
  Wallet,
} from 'lucide-react';
import type { ViewType } from '../types';
import type { TodayPulseSummary, TodayRadarMilestone } from '../lib/todayControlCenter';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';

export interface TodayRadarSectionProps {
  milestones: TodayRadarMilestone[];
  pulse: TodayPulseSummary;
  enabledRadarModules: Array<{ view: ViewType; label: string }>;
  notesEnabled?: boolean;
  onOpenMilestone: (milestone: TodayRadarMilestone) => void;
  onDismissMilestone?: (milestone: TodayRadarMilestone) => void;
  dismissedCount?: number;
  onOpenDismissed?: () => void;
  onNavigate: (view: ViewType) => void;
  onOpenActivity?: () => void;
  className?: string;
}

function renderModuleIcon(module: ViewType | TodayRadarMilestone['module'], className: string) {
  if (module === 'estudios') return <BookOpen className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (module === 'trabajo') return <Briefcase className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (module === 'proyectos') return <FolderKanban className={className} strokeWidth={1.75} aria-hidden="true" />;
  return <Wallet className={className} strokeWidth={1.75} aria-hidden="true" />;
}

function formatCompletedCount(count: number): string {
  if (count <= 0) return 'Ninguno aún';
  if (count === 1) return '1 hecho';
  return `${count} hechos`;
}

export const TodayRadarSection: React.FC<TodayRadarSectionProps> = ({
  milestones,
  pulse,
  enabledRadarModules,
  notesEnabled = true,
  onOpenMilestone,
  onDismissMilestone,
  dismissedCount = 0,
  onOpenDismissed,
  onNavigate,
  onOpenActivity,
  className = '',
}) => {
  const showRadarCard = milestones.length > 0 || enabledRadarModules.length > 0 || notesEnabled;

  return (
    <aside className={`flex min-w-0 flex-col gap-5 ${className}`} aria-label="Radar y registro de hoy">
      {/* 1. Radar: Próximos hitos reales */}
      {showRadarCard && (
        <SurfaceCard as="section" aria-labelledby="today-radar-title" className="p-5 sm:p-6">
          <SectionHeader
            id="today-radar-title"
            icon={<Compass className="h-4 w-4" strokeWidth={1.75} />}
            title="Radar"
            count={milestones.length > 0 ? milestones.length : null}
            action={
              dismissedCount > 0 && onOpenDismissed ? (
                <button
                  type="button"
                  onClick={onOpenDismissed}
                  className="whitespace-nowrap text-xs font-medium text-slate-500 transition hover:text-[#4F46E5] dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 rounded-md"
                >
                  Silenciados ({dismissedCount})
                </button>
              ) : null
            }
          />

          <div className="mt-3">
            {milestones.length === 0 ? (
              <div className="space-y-3 pt-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Sin exámenes, entregas ni vencimientos próximos.
                </p>
                {enabledRadarModules.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {enabledRadarModules.map((mod) => (
                      <button
                        key={mod.view}
                        type="button"
                        onClick={() => onNavigate(mod.view)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-[#4F46E5]/45 hover:text-[#4F46E5] dark:border-white/[0.08] dark:text-slate-300 dark:hover:border-[#818CF8]/45 dark:hover:text-[#818CF8] cursor-pointer whitespace-nowrap outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                      >
                        {renderModuleIcon(mod.view, 'h-3.5 w-3.5 text-slate-400 dark:text-slate-500')}
                        <span>{mod.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <ListDivider>
                {milestones.map((item) => {
                  const isOverdue = item.urgency === 'overdue';
                  return (
                    <div
                      key={item.id}
                      data-radar-urgency={item.urgency}
                      className={`group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-xl px-2 py-3 transition first:pt-1 last:pb-0 ${
                        isOverdue
                          ? 'bg-rose-500/[0.05] hover:bg-rose-500/[0.09]'
                          : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenMilestone(item)}
                        title={item.amountTooltip}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-left cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {renderModuleIcon(
                            item.module,
                            `h-4 w-4 shrink-0 ${
                              isOverdue
                                ? 'text-rose-500 dark:text-rose-400'
                                : 'text-slate-400 dark:text-slate-500 group-hover:text-[#4F46E5] dark:group-hover:text-[#818CF8]'
                            }`
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900 group-hover:text-[#4F46E5] dark:text-slate-100 dark:group-hover:text-[#818CF8]">
                              {item.title}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.moduleLabel} · {item.detail}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums ${
                            isOverdue
                              ? 'rounded-full bg-rose-500/12 px-2 py-0.5 text-rose-600 dark:text-rose-400'
                              : item.urgency === 'today'
                                ? 'text-[#4F46E5] dark:text-[#818CF8]'
                                : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.countdownLabel}
                        </span>
                      </button>
                      {onDismissMilestone && item.dismissKey && (
                        <button
                          type="button"
                          onClick={() => onDismissMilestone(item)}
                          aria-label={`Silenciar aviso: ${item.title}`}
                          title="Silenciar aviso"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-200 cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                        >
                          <BellOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </ListDivider>
            )}
          </div>
        </SurfaceCard>
      )}

      {/* 2. Registro de hoy — acceso discreto a Historial y valores alineados en columna */}
      <SurfaceCard as="section" aria-labelledby="today-record-title" className="flex flex-col p-5 sm:p-6">
        <SectionHeader
          id="today-record-title"
          icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
          title="Registro de hoy"
          action={
            onOpenActivity ? (
              <button
                type="button"
                onClick={onOpenActivity}
                className="whitespace-nowrap text-xs font-medium text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 cursor-pointer"
              >
                Historial
              </button>
            ) : null
          }
        />

        <ListDivider className="mt-3">
          {pulse.studyEnabled && (
            <button
              type="button"
              onClick={() => onNavigate('estudios')}
              className="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03] cursor-pointer first:pt-2"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">
                <BookOpen className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">Estudio hoy</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {pulse.studySessionActive && (
                  <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    En curso
                  </span>
                )}
                <span>{pulse.studyMinutesToday > 0 ? pulse.studyFormatted : 'Sin sesiones'}</span>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-slate-600" strokeWidth={1.75} />
                </span>
              </span>
            </button>
          )}

          {pulse.gymEnabled && (
            <button
              type="button"
              onClick={() => onNavigate('gimnasio')}
              className="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03] cursor-pointer"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">
                <Dumbbell className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">Gimnasio</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`truncate text-xs ${
                    pulse.gymStatus === 'active_session' || pulse.gymStatus === 'pending_today'
                      ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                      : pulse.gymStatus === 'trained_today'
                        ? 'font-semibold text-slate-900 dark:text-slate-100'
                        : 'font-medium text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {pulse.gymLabel}
                </span>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-slate-600" strokeWidth={1.75} />
                </span>
              </span>
            </button>
          )}

          <div className="flex items-center justify-between gap-3 py-3">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">Bloques completados</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
              <span>{formatCompletedCount(pulse.blocksCompleted)}</span>
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <Repeat className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">Hábitos</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
              <span>{formatCompletedCount(pulse.habitsCompleted)}</span>
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            </span>
          </div>
        </ListDivider>
      </SurfaceCard>
    </aside>
  );
};
