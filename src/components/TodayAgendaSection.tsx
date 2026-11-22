import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  EyeOff,
  FileText,
  MoreHorizontal,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { TodayAgendaEntry } from '../lib/todayOverview';
import { formatMinutesUntil, type TodayControlBlock } from '../lib/todayControlCenter';
import type { TodayExtra } from '../types';
import { fmtDate, todayISO } from '../lib/storage';
import { CompletionCheck } from './ui/CompletionCheck';
import { focusTargetElement } from '../lib/navigationFocus';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';

interface TodayAgendaSectionProps {
  entries: TodayAgendaEntry[];
  timedBlocks?: TodayControlBlock[];
  untimedTasks?: TodayControlBlock[];
  microHabits?: TodayAgendaEntry[];
  pastPendingTasks?: TodayExtra[];
  futureScheduledTasks?: TodayExtra[];
  selectedExtra?: TodayExtra;
  onToggle: (entry: TodayAgendaEntry) => void;
  onToggleFocus?: (entry: TodayAgendaEntry) => void;
  onOpenAgenda: () => void;
  onOpenCapture?: () => void;
  onOpenEntry: (entry: TodayAgendaEntry) => void;
  onToggleSkipToday?: (entry: TodayAgendaEntry) => void;
  onMoveToTomorrow?: (entry: TodayAgendaEntry) => void;
  onRemoveFromToday?: (entry: TodayAgendaEntry) => void;
  onToggleExtra?: (extraId: string) => void;
  onRescheduleExtra?: (extraId: string, newDate: string) => void;
  onMoveAllPastToToday?: () => void;
  initialFocusId?: string | null;
  focusNonce?: number;
  openLabel?: string | null;
  completionMotion?: { taskId: string; nonce: number } | null;
  className?: string;
  todayIso?: string;
}

function renderEntryIcon(entry: TodayAgendaEntry) {
  const cls = 'h-4 w-4 text-slate-400 dark:text-slate-500';
  if (entry.source === 'calendar') {
    return entry.calendarItem?.type === 'cumpleanos'
      ? <Sparkles className={cls} strokeWidth={1.75} aria-hidden="true" />
      : <CalendarDays className={cls} strokeWidth={1.75} aria-hidden="true" />;
  }
  if (entry.source === 'gym') return <Dumbbell className={cls} strokeWidth={1.75} aria-hidden="true" />;
  if (entry.source === 'proyecto') return <FileText className={cls} strokeWidth={1.75} aria-hidden="true" />;
  if (entry.source === 'trabajo') return <Briefcase className={cls} strokeWidth={1.75} aria-hidden="true" />;
  return <Clock className={cls} strokeWidth={1.75} aria-hidden="true" />;
}

const AgendaBlockRow: React.FC<{
  block: TodayControlBlock;
  isNextUpcoming?: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggle: (entry: TodayAgendaEntry) => void;
  onOpenEntry: (entry: TodayAgendaEntry) => void;
  onToggleSkipToday?: (entry: TodayAgendaEntry) => void;
  onMoveToTomorrow?: (entry: TodayAgendaEntry) => void;
  onRemoveFromToday?: (entry: TodayAgendaEntry) => void;
}> = ({
  block,
  isNextUpcoming,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onToggle,
  onOpenEntry,
  onToggleSkipToday,
  onMoveToTomorrow,
  onRemoveFromToday,
}) => {
  const { entry, temporalStatus, gymFusion, minutesUntil, skipped } = block;
  const rowId = entry.todayItem?.kind === 'toggle-extra-today' ? `today-extra-${entry.id}` : undefined;
  const isSkipped = Boolean(skipped);
  const isCurrent = temporalStatus === 'current' && !entry.done && !isSkipped;
  const isPast = temporalStatus === 'past' && !entry.done && !isSkipped;
  const isMuted = entry.done || isSkipped;
  const mutedMetaClass = isMuted ? 'opacity-70 transition-opacity group-hover/row:opacity-95' : '';

  const canMoveTomorrow = Boolean(onMoveToTomorrow && (entry.source === 'extra' || entry.source === 'priority'));
  const canRemoveToday = Boolean(
    onRemoveFromToday && (entry.source === 'extra' || entry.source === 'priority' || entry.source === 'agenda')
  );

  // Only show sub-label when it adds real domain value (never repetitive "Agenda" / "Tarea")
  const meaningfulSourceLabel =
    entry.source === 'agenda' || entry.source === 'extra' || entry.source === 'gym'
      ? null
      : entry.sourceLabel;

  // Inverted hierarchy:
  // - Done -> neutral gray "Hecho" (no bright green pill)
  // - Skipped -> neutral gray "Omitido"
  // - Current -> high-contrast indigo dot + "En curso"
  // - Upcoming -> subtle remaining time or "Próximo"
  // - Past (uncompleted, not skipped) -> subtle "Pasado"
  const statusDisplay: { label: string; className: string; dot?: boolean } | null = (() => {
    if (isSkipped) {
      return {
        label: 'Omitido',
        className: 'text-slate-500 dark:text-slate-400',
      };
    }
    if (entry.done) {
      return {
        label: 'Hecho',
        className: 'text-slate-500 dark:text-slate-400',
      };
    }
    if (isCurrent) {
      return {
        label: 'En curso',
        className: 'text-indigo-600 dark:text-indigo-400 font-semibold',
        dot: true,
      };
    }
    if (isNextUpcoming) {
      const timeHint =
        typeof minutesUntil === 'number' && minutesUntil > 0
          ? formatMinutesUntil(minutesUntil)
          : 'Próximo';
      return {
        label: timeHint,
        className: 'text-slate-600 dark:text-slate-300 font-medium',
      };
    }
    if (isPast) {
      return {
        label: 'Pasado',
        className: 'text-slate-500 dark:text-slate-400',
      };
    }
    if (temporalStatus === 'upcoming' && typeof minutesUntil === 'number' && minutesUntil > 0) {
      return {
        label: formatMinutesUntil(minutesUntil),
        className: 'text-slate-400 dark:text-slate-400',
      };
    }
    return null;
  })();

  const hasSubRow = Boolean(meaningfulSourceLabel || gymFusion?.templateName || entry.time);

  return (
    <div
      id={rowId}
      data-temporal-status={isSkipped ? 'skipped' : temporalStatus}
      data-skipped={isSkipped ? 'true' : 'false'}
      className={`today-agenda-entry group/row relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3.5 transition-colors sm:grid-cols-[3.75rem_auto_minmax(0,1fr)_auto] ${
        isCurrent
          ? '-mx-2 rounded-xl bg-indigo-50/70 px-2 dark:bg-indigo-500/[0.08]'
          : ''
      }`}
    >
      {/* Time column (desktop) */}
      <div className={`hidden items-center sm:flex ${mutedMetaClass}`}>
        <span
          className={`text-[13px] font-medium tabular-nums ${
            isCurrent
              ? 'font-semibold text-indigo-600 dark:text-indigo-400'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {entry.time || '—'}
        </span>
      </div>

      {/* Completion check or bare domain icon */}
      {entry.completable ? (
        <button
          type="button"
          onClick={() => onToggle(entry)}
          aria-label={entry.done ? `Marcar como pendiente: ${entry.label}` : `Completar: ${entry.label}`}
          aria-pressed={entry.done}
          className={`lifeos-task-check group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 cursor-pointer ${
            entry.done ? 'is-completed' : 'is-pending'
          }`}
        >
          <CompletionCheck checked={entry.done} size="md" />
        </button>
      ) : (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center ${mutedMetaClass}`} title="Evento informativo">
          {renderEntryIcon(entry)}
        </span>
      )}

      {/* Content */}
      <button
        type="button"
        onClick={() => onOpenEntry(entry)}
        className={`min-w-0 text-left cursor-pointer ${mutedMetaClass}`}
      >
        <span
          className={`block text-[14px] leading-snug break-words ${
            isMuted
              ? 'font-normal text-slate-500 line-through decoration-slate-400/70 dark:text-slate-400 dark:decoration-slate-500/80'
              : 'font-semibold text-slate-900 dark:text-slate-100'
          }`}
        >
          {entry.label}
        </span>

        {hasSubRow && (
          <span
            className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 ${
              !meaningfulSourceLabel && !gymFusion?.templateName ? 'sm:hidden' : ''
            }`}
          >
            {entry.time && (
              <span
                className={`font-medium tabular-nums sm:hidden ${
                  isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {entry.time}
              </span>
            )}
            {meaningfulSourceLabel && <span>{meaningfulSourceLabel}</span>}

            {gymFusion?.templateName && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Dumbbell className="h-3 w-3 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {gymFusion.templateName}
                  {gymFusion.status === 'trained_today'
                    ? ' · Hecho'
                    : gymFusion.hasActiveSession
                      ? ' · Activa'
                      : ''}
                </span>
              </span>
            )}
          </span>
        )}
      </button>

      {/* Right-aligned subtle status + contextual menu (•••) */}
      <div className="relative flex shrink-0 items-center gap-1.5">
        {statusDisplay && (
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums ${statusDisplay.className} ${mutedMetaClass}`}
          >
            {statusDisplay.dot && (
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
            )}
            {statusDisplay.label}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
          aria-label={`Más opciones para ${entry.label}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer ${
            menuOpen
              ? 'opacity-100 bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'
              : 'opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100'
          }`}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label={`Opciones de ${entry.label}`}
            className="absolute right-0 top-9 z-30 min-w-[180px] rounded-xl border border-slate-200/90 bg-white p-1 shadow-lg dark:border-white/[0.09] dark:bg-[#131926]"
            onClick={(e) => e.stopPropagation()}
          >
            {onToggleSkipToday && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseMenu();
                  onToggleSkipToday(entry);
                }}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                {isSkipped
                  ? <RotateCcw className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                  : <EyeOff className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />}
                <span>{isSkipped ? 'Restaurar hoy' : 'Omitir hoy'}</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onCloseMenu();
                onOpenEntry(entry);
              }}
              className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
              <span>Abrir en {entry.sourceLabel}</span>
            </button>

            {canMoveTomorrow && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseMenu();
                  onMoveToTomorrow?.(entry);
                }}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <CalendarDays className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.75} aria-hidden="true" />
                <span>Mover a mañana</span>
              </button>
            )}

            {canRemoveToday && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseMenu();
                  onRemoveFromToday?.(entry);
                }}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Quitar de hoy</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TodayAgendaSection: React.FC<TodayAgendaSectionProps> = ({
  entries,
  timedBlocks,
  untimedTasks,
  microHabits = [],
  pastPendingTasks = [],
  futureScheduledTasks = [],
  selectedExtra,
  onToggle,
  onOpenAgenda,
  onOpenCapture,
  onOpenEntry,
  onToggleSkipToday,
  onMoveToTomorrow,
  onRemoveFromToday,
  onToggleExtra,
  onRescheduleExtra,
  onMoveAllPastToToday,
  initialFocusId,
  focusNonce,
  openLabel = 'Abrir Agenda',
  className,
  todayIso,
}) => {
  const [isPastExpanded, setIsPastExpanded] = useState(false);
  const [isFutureExpanded, setIsFutureExpanded] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const currentToday = todayIso || todayISO();

  const resolvedTimed: TodayControlBlock[] = timedBlocks ?? entries
    .filter((entry) => Boolean(entry.time))
    .map((entry) => ({
      entry,
      domain: entry.source === 'gym' ? 'gym' : 'general',
      temporalStatus: 'upcoming',
      startMinutes: null,
      endMinutes: null,
    }));

  const resolvedUntimed: TodayControlBlock[] = untimedTasks ?? entries
    .filter((entry) => !entry.time && entry.source !== 'rutina')
    .map((entry) => ({
      entry,
      domain: entry.source === 'gym' ? 'gym' : 'general',
      temporalStatus: 'untimed',
      startMinutes: null,
      endMinutes: null,
    }));

  const resolvedHabits: TodayAgendaEntry[] =
    timedBlocks || untimedTasks
      ? microHabits
      : entries.filter((entry) => !entry.time && entry.source === 'rutina');

  const firstUpcomingKey = resolvedTimed.find(
    (b) => b.temporalStatus === 'upcoming' && !b.entry.done && !b.skipped
  )?.entry.key;

  const totalMainItems = resolvedTimed.length + resolvedUntimed.length;
  const completedHabitsCount = resolvedHabits.filter((h) => h.done).length;

  useEffect(() => {
    if (!openMenuKey) return;
    const handleOutside = (event: MouseEvent) => {
      if (sectionRef.current && !sectionRef.current.contains(event.target as Node)) {
        setOpenMenuKey(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuKey(null);
    };
    document.addEventListener('click', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openMenuKey]);

  useEffect(() => {
    if (!initialFocusId) return;
    if (initialFocusId.startsWith('today-extra-')) {
      const taskId = initialFocusId.replace('today-extra-', '');
      if (pastPendingTasks.some((t) => t.id === taskId)) {
        setIsPastExpanded(true);
      } else if (futureScheduledTasks.some((t) => t.id === taskId)) {
        setIsFutureExpanded(true);
      }
    }
    return focusTargetElement(initialFocusId);
  }, [initialFocusId, focusNonce, pastPendingTasks, futureScheduledTasks, selectedExtra]);

  return (
    <div ref={sectionRef} className={`flex h-full min-w-0 flex-col ${className || ''}`}>
      {/* Main card: Tu día + Hábitos integrados abajo con divisor 1px */}
      <SurfaceCard as="section" aria-labelledby="today-agenda-title" className="flex h-full flex-col p-5 sm:p-6">
        <SectionHeader
          id="today-agenda-title"
          icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />}
          title="Tu día"
          count={totalMainItems > 0 ? totalMainItems : null}
          action={
            openLabel ? (
              <button
                type="button"
                onClick={onOpenAgenda}
                className="whitespace-nowrap text-xs font-semibold text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
              >
                {openLabel}
              </button>
            ) : null
          }
          className="pb-3"
        />

        <div className="min-h-0 flex-1 space-y-3">
          {selectedExtra && (
            <div
              id={`today-extra-${selectedExtra.id}`}
              className="rounded-xl border border-slate-200/80 px-3.5 py-2.5 dark:border-white/[0.07]"
              aria-label="Tarea original seleccionada"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedExtra.date ? `Tarea del ${fmtDate(selectedExtra.date)}` : 'Tarea sin fecha programada'} ·{' '}
                {selectedExtra.done ? 'Completada' : 'Pendiente'}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedExtra.text}</p>
            </div>
          )}

          {/* Collapsible past pending tasks */}
          {pastPendingTasks.length > 0 && (
            <div className="border-b border-slate-100 pb-3 dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsPastExpanded(!isPastExpanded)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 cursor-pointer"
                  aria-expanded={isPastExpanded}
                >
                  <Clock className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                  <span>Pendientes anteriores ({pastPendingTasks.length})</span>
                  {isPastExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />}
                </button>
                {isPastExpanded && onMoveAllPastToToday && pastPendingTasks.length > 1 && (
                  <button
                    type="button"
                    onClick={onMoveAllPastToToday}
                    className="whitespace-nowrap text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
                  >
                    Mover todas a hoy
                  </button>
                )}
              </div>

              {isPastExpanded && (
                <ListDivider className="mt-2.5">
                  {pastPendingTasks.map((task) => {
                    const isOverdue = Boolean(task.dueDate && task.dueDate < currentToday);
                    return (
                      <div
                        key={task.id}
                        id={`today-extra-${task.id}`}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => onToggleExtra?.(task.id)}
                          className="lifeos-task-check group relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full is-pending cursor-pointer"
                          aria-label={`Completar: ${task.text}`}
                        >
                          <CompletionCheck checked={Boolean(task.done)} size="md" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">{task.text}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                            <span>Programada el {fmtDate(task.date)}</span>
                            {isOverdue && (
                              <span className="font-semibold text-rose-600 dark:text-rose-400">
                                · Venció {fmtDate(task.dueDate!)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onRescheduleExtra?.(task.id, currentToday)}
                            className="rounded-lg border border-slate-200/80 px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-indigo-400 dark:hover:bg-white/[0.04] cursor-pointer"
                            title="Programar para hoy"
                          >
                            Hoy
                          </button>
                          <label className="relative flex min-h-8 items-center justify-center rounded-lg border border-slate-200/80 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04] cursor-pointer">
                            <CalendarDays className="mr-1 h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            <span>Fecha</span>
                            <input
                              type="date"
                              aria-label={`Reprogramar ${task.text}`}
                              defaultValue={task.date}
                              onChange={(e) => {
                                if (e.target.value) onRescheduleExtra?.(task.id, e.target.value);
                              }}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </ListDivider>
              )}
            </div>
          )}

          {/* Single clean empty state (no duplicate spotlight above!) */}
          {totalMainItems === 0 ? (
            <div className="py-5 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Tu día está despejado.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Agregá un bloque horario o una tarea puntual para hoy
                <span className="hidden md:inline"> (también podés usar Ctrl+K en cualquier momento)</span>.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {onOpenCapture && (
                  <button
                    type="button"
                    onClick={onOpenCapture}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Agregar bloque</span>
                  </button>
                )}
                {openLabel && (
                  <button
                    type="button"
                    onClick={onOpenAgenda}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer whitespace-nowrap"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                    <span>{openLabel}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {resolvedTimed.length > 0 && (
                <ListDivider>
                  {resolvedTimed.map((block) => (
                    <AgendaBlockRow
                      key={block.entry.key}
                      block={block}
                      isNextUpcoming={block.entry.key === firstUpcomingKey}
                      menuOpen={openMenuKey === block.entry.key}
                      onToggleMenu={() =>
                        setOpenMenuKey((prev) => (prev === block.entry.key ? null : block.entry.key))
                      }
                      onCloseMenu={() => setOpenMenuKey(null)}
                      onToggle={onToggle}
                      onOpenEntry={onOpenEntry}
                      onToggleSkipToday={onToggleSkipToday}
                      onMoveToTomorrow={onMoveToTomorrow}
                      onRemoveFromToday={onRemoveFromToday}
                    />
                  ))}
                </ListDivider>
              )}

              {resolvedUntimed.length > 0 && (
                <div className={resolvedTimed.length > 0 ? 'border-t border-slate-100 pt-3 dark:border-white/[0.06]' : ''}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Sin horario fijo
                  </div>
                  <ListDivider>
                    {resolvedUntimed.map((block) => (
                      <AgendaBlockRow
                        key={block.entry.key}
                        block={block}
                        menuOpen={openMenuKey === block.entry.key}
                        onToggleMenu={() =>
                          setOpenMenuKey((prev) => (prev === block.entry.key ? null : block.entry.key))
                        }
                        onCloseMenu={() => setOpenMenuKey(null)}
                        onToggle={onToggle}
                        onOpenEntry={onOpenEntry}
                        onToggleSkipToday={onToggleSkipToday}
                        onMoveToTomorrow={onMoveToTomorrow}
                        onRemoveFromToday={onRemoveFromToday}
                      />
                    ))}
                  </ListDivider>
                </div>
              )}
            </div>
          )}

          {/* Collapsible future scheduled tasks */}
          {futureScheduledTasks.length > 0 && (
            <div className="border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsFutureExpanded(!isFutureExpanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                aria-expanded={isFutureExpanded}
              >
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                <span>Próximas programadas ({futureScheduledTasks.length})</span>
                {isFutureExpanded
                  ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                  : <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />}
              </button>

              {isFutureExpanded && (
                <ListDivider className="mt-2.5">
                  {futureScheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      id={`today-extra-${task.id}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleExtra?.(task.id)}
                        className="lifeos-task-check group relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full is-pending cursor-pointer"
                        aria-label={`Completar: ${task.text}`}
                      >
                        <CompletionCheck checked={Boolean(task.done)} size="md" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">{task.text}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          Programada el {fmtDate(task.date)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRescheduleExtra?.(task.id, currentToday)}
                        className="rounded-lg border border-slate-200/80 px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-indigo-400 dark:hover:bg-white/[0.04] cursor-pointer"
                        title="Mover a hoy"
                      >
                        Hoy
                      </button>
                    </div>
                  ))}
                </ListDivider>
              )}
            </div>
          )}
        </div>

        {/* Integrated Micro-Habits bottom section separated by a clean 1px divider */}
        {resolvedHabits.length > 0 && (
          <div
            aria-labelledby="today-habits-title"
            className="mt-5 border-t border-slate-100 pt-4 dark:border-white/[0.06]"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
                <h3
                  id="today-habits-title"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  Hábitos de hoy
                </h3>
              </div>
              {completedHabitsCount > 0 && (
                <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                  {completedHabitsCount === 1 ? '1 hecho' : `${completedHabitsCount} hechos`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {resolvedHabits.map((habit) => (
                <button
                  key={habit.key}
                  type="button"
                  onClick={() => onToggle(habit)}
                  aria-pressed={habit.done}
                  className={`group inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                    habit.done
                      ? 'border-slate-200/70 bg-slate-50 text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.03] dark:text-slate-400'
                      : 'border-slate-200/90 bg-white text-slate-800 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.09] dark:bg-white/[0.02] dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400'
                  }`}
                >
                  <CompletionCheck checked={habit.done} size="sm" />
                  <span className={habit.done ? 'line-through' : ''}>{habit.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};
