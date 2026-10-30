import React, { useEffect, useState } from 'react';
import type { TodayAgendaEntry } from '../lib/todayOverview';
import type { TodayExtra } from '../types';
import { fmtDate, todayISO } from '../lib/storage';
import { AppIcon, type AppIconName } from './AppIcon';
import { CompletionCheckMark, prewarmCompletionCheckAsset } from './visual/CompletionCheckMark';
import { focusTargetElement } from '../lib/navigationFocus';

interface TodayAgendaSectionProps {
  entries: TodayAgendaEntry[];
  pastPendingTasks?: TodayExtra[];
  futureScheduledTasks?: TodayExtra[];
  selectedExtra?: TodayExtra;
  onToggle: (entry: TodayAgendaEntry) => void;
  onToggleFocus: (entry: TodayAgendaEntry) => void;
  onOpenAgenda: () => void;
  onOpenEntry: (entry: TodayAgendaEntry) => void;
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

function iconFor(entry: TodayAgendaEntry): AppIconName {
  if (entry.source === 'calendar') return entry.calendarItem?.type === 'cumpleanos' ? 'sparkles' : 'calendarDays';
  if (entry.source === 'rutina') return 'repeat';
  if (entry.source === 'gym') return 'dumbbell';
  if (entry.source === 'proyecto') return 'note';
  if (entry.source === 'trabajo') return 'briefcase';
  if (entry.source === 'agenda') return 'clock';
  return entry.isFocus ? 'target' : 'checkCircle';
}

const AgendaEntryRow: React.FC<{
  entry: TodayAgendaEntry;
  onToggle: (entry: TodayAgendaEntry) => void;
  onToggleFocus: (entry: TodayAgendaEntry) => void;
  onOpenEntry: (entry: TodayAgendaEntry) => void;
  completionMotion?: { taskId: string; nonce: number } | null;
}> = ({ entry, onToggle, onToggleFocus, onOpenEntry, completionMotion }) => {
  const animateCompletion = Boolean(entry.done && completionMotion?.taskId === entry.key);
  const rowId = entry.todayItem?.kind === 'toggle-extra-today' ? `today-extra-${entry.id}` : undefined;
  return (
    <div
      id={rowId}
      className="today-agenda-entry group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:grid-cols-[4.25rem_auto_minmax(0,1fr)_auto] sm:px-4 transition-colors"
    >
      <div className="hidden text-[13px] font-semibold tabular-nums text-[var(--text-soft)] sm:block">
        {entry.time || ''}
      </div>

      {entry.completable ? (
        <button
          type="button"
          onClick={() => onToggle(entry)}
          aria-label={entry.done ? `Marcar como pendiente: ${entry.label}` : `Completar: ${entry.label}`}
          aria-pressed={entry.done}
          className={`lifeos-task-check relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] ${entry.done ? 'is-completed' : 'is-pending'}`}
        >
          <CompletionCheckMark
            completed={entry.done}
            animate={animateCompletion}
            nonce={completionMotion?.nonce || 0}
            size={24}
          />
        </button>
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--blue-soft)] text-[var(--blue)]"
          title="Evento informativo, sin control de completitud"
        >
          <AppIcon name={iconFor(entry)} className="h-3.5 w-3.5" />
        </span>
      )}

      <button type="button" onClick={() => onOpenEntry(entry)} className="min-w-0 text-left">
        <span className={`block text-sm font-semibold leading-5 break-words ${entry.done ? 'text-[var(--text-soft)]' : 'text-[var(--text)]'}`}>
          {entry.label}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--text-soft)]">
          {entry.time && <span className="font-semibold tabular-nums text-[var(--blue)] sm:hidden">{entry.time}</span>}
          <span>{entry.sourceLabel}</span>
          {entry.isFocus && <span className={entry.done ? 'text-[var(--text-faint)]' : 'font-semibold text-amber-700 dark:text-amber-300'}>Prioridad</span>}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {entry.completable ? (
          <button
            type="button"
            onClick={() => onToggleFocus(entry)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${entry.isFocus ? 'bg-amber-500/12 text-amber-600 dark:text-amber-300' : 'text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-amber-600'}`}
            aria-label={entry.isFocus ? `Quitar prioridad: ${entry.label}` : `Marcar como prioridad: ${entry.label}`}
            title={entry.isFocus ? 'Quitar prioridad' : 'Marcar como prioridad'}
          >
            <AppIcon name="target" className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => onOpenEntry(entry)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--blue)]" aria-label={`Abrir ${entry.sourceLabel}: ${entry.label}`}>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export const TodayAgendaSection: React.FC<TodayAgendaSectionProps> = ({
  entries,
  pastPendingTasks = [],
  futureScheduledTasks = [],
  selectedExtra,
  onToggle,
  onToggleFocus,
  onOpenAgenda,
  onOpenEntry,
  onToggleExtra,
  onRescheduleExtra,
  onMoveAllPastToToday,
  initialFocusId,
  focusNonce,
  openLabel = 'Abrir Agenda',
  completionMotion,
  className,
  todayIso,
}) => {
  const [isPastExpanded, setIsPastExpanded] = useState(false);
  const [isFutureExpanded, setIsFutureExpanded] = useState(false);
  const currentToday = todayIso || todayISO();

  useEffect(() => {
    if (
      entries.some((entry) => entry.completable) ||
      pastPendingTasks.length > 0 ||
      futureScheduledTasks.length > 0
    ) {
      prewarmCompletionCheckAsset();
    }
  }, [entries, pastPendingTasks, futureScheduledTasks]);

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

  const timed = entries.filter((entry) => Boolean(entry.time));
  const untimed = entries.filter((entry) => !entry.time);

  return (
    <section
      className={`today-agenda-surface flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] shadow-[var(--card-shadow)] ${className || ''}`}
      aria-labelledby="today-agenda-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-3.5 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="today-section-icon today-section-icon-agenda"><AppIcon name="calendarDays" className="h-4 w-4" /></span>
          <h2 id="today-agenda-title" className="text-base font-bold tracking-[-0.025em] text-[var(--text)]">Agenda de hoy</h2>
          <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[13px] font-medium text-[var(--text-soft)]">{entries.length}</span>
        </div>
        {openLabel && <button type="button" onClick={onOpenAgenda} className="rounded-lg px-2 py-1.5 text-[13px] font-bold text-[var(--blue)] hover:bg-[var(--blue-soft)]">{openLabel}</button>}
      </div>

      <div className="min-h-0 border-t border-[var(--border)] xl:overflow-y-auto overscroll-contain today-agenda-scroller">
        {selectedExtra && <div id={`today-extra-${selectedExtra.id}`} className="border-b border-[var(--border)] px-4 py-3" aria-label="Tarea original seleccionada">
          <p className="text-xs text-[var(--text-soft)]">{selectedExtra.date ? `Tarea del ${fmtDate(selectedExtra.date)}` : 'Tarea sin fecha programada'} · {selectedExtra.done ? 'Completada' : 'Pendiente'}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text)]">{selectedExtra.text}</p>
          {selectedExtra.dueDate && <p className="mt-1 text-xs text-[var(--text-soft)]">Vencimiento: {fmtDate(selectedExtra.dueDate)}</p>}
        </div>}
        {/* Franja compacta y colapsable de pendientes anteriores */}
        {pastPendingTasks.length > 0 && (
          <div className="border-b border-[var(--border)] bg-amber-500/[0.04]">
            <div className="flex items-center justify-between px-3.5 py-2">
              <button
                type="button"
                onClick={() => setIsPastExpanded(!isPastExpanded)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:opacity-80 transition cursor-pointer"
                aria-expanded={isPastExpanded}
              >
                <AppIcon name="clock" className="h-3.5 w-3.5" />
                <span>Pendientes anteriores ({pastPendingTasks.length})</span>
                <AppIcon name={isPastExpanded ? 'chevronUp' : 'chevronDown'} className="h-3.5 w-3.5 ml-0.5" />
              </button>
              {isPastExpanded && onMoveAllPastToToday && pastPendingTasks.length > 1 && (
                <button
                  type="button"
                  onClick={onMoveAllPastToToday}
                  className="rounded px-2 py-0.5 text-[11px] font-bold text-[var(--blue)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                >
                  Mover todas a hoy
                </button>
              )}
            </div>

            {isPastExpanded && (
              <div className="border-t border-amber-500/15 divide-y divide-[var(--border)]/70">
                {pastPendingTasks.map((task) => {
                  const isOverdue = Boolean(task.dueDate && task.dueDate < currentToday);
                  const isDueToday = Boolean(task.dueDate && task.dueDate === currentToday);
                  return (
                    <div
                      key={task.id}
                      id={`today-extra-${task.id}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 hover:bg-[var(--card-subtle)] transition"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleExtra?.(task.id)}
                        className="lifeos-task-check relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all is-pending"
                        aria-label={`Completar: ${task.text}`}
                      >
                        <CompletionCheckMark completed={false} size={20} />
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text)] truncate">
                          {task.text}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                          <span>Prog: {fmtDate(task.date)}</span>
                          {isOverdue && (
                            <span className="rounded bg-rose-500/10 px-1 py-0.2 font-semibold text-rose-600 dark:text-rose-400">
                              Venció {fmtDate(task.dueDate!)}
                            </span>
                          )}
                          {isDueToday && (
                            <span className="rounded bg-amber-500/10 px-1 py-0.2 font-semibold text-amber-600 dark:text-amber-400">
                              Vence hoy
                            </span>
                          )}
                          {task.dueDate && !isOverdue && !isDueToday && (
                            <span className="rounded bg-blue-500/10 px-1 py-0.2 font-semibold text-blue-600 dark:text-blue-400">
                              Vence {fmtDate(task.dueDate)}
                            </span>
                          )}
                          {!task.dueDate && (
                            <span className="text-[var(--text-faint)]">Sin plazo</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRescheduleExtra?.(task.id, currentToday)}
                          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                          title="Programar para hoy"
                        >
                          Hoy
                        </button>
                        <label className="relative flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] cursor-pointer">
                          <AppIcon name="calendarDays" className="h-3 w-3 mr-1" />
                          <span>Fecha</span>
                          <input
                            type="date"
                            aria-label={`Reprogramar ${task.text}`}
                            defaultValue={task.date}
                            onChange={(e) => {
                              if (e.target.value) {
                                onRescheduleExtra?.(task.id, e.target.value);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Franja compacta y colapsable de próximas tareas programadas */}
        {futureScheduledTasks.length > 0 && (
          <div className="border-b border-[var(--border)] bg-blue-500/[0.02]">
            <div className="flex items-center justify-between px-3.5 py-2">
              <button
                type="button"
                onClick={() => setIsFutureExpanded(!isFutureExpanded)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--blue)] hover:opacity-80 transition cursor-pointer"
                aria-expanded={isFutureExpanded}
              >
                <AppIcon name="calendarDays" className="h-3.5 w-3.5" />
                <span>Próximas programadas ({futureScheduledTasks.length})</span>
                <AppIcon name={isFutureExpanded ? 'chevronUp' : 'chevronDown'} className="h-3.5 w-3.5 ml-0.5" />
              </button>
            </div>

            {isFutureExpanded && (
              <div className="border-t border-blue-500/10 divide-y divide-[var(--border)]/70">
                {futureScheduledTasks.map((task) => {
                  const isOverdue = Boolean(task.dueDate && task.dueDate < currentToday);
                  const isDueToday = Boolean(task.dueDate && task.dueDate === currentToday);
                  return (
                    <div
                      key={task.id}
                      id={`today-extra-${task.id}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 hover:bg-[var(--card-subtle)] transition"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleExtra?.(task.id)}
                        className="lifeos-task-check relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all is-pending"
                        aria-label={`Completar: ${task.text}`}
                      >
                        <CompletionCheckMark completed={false} size={20} />
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text)] truncate">
                          {task.text}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                          <span>Prog: {fmtDate(task.date)}</span>
                          {isOverdue && (
                            <span className="rounded bg-rose-500/10 px-1 py-0.2 font-semibold text-rose-600 dark:text-rose-400">
                              Venció {fmtDate(task.dueDate!)}
                            </span>
                          )}
                          {isDueToday && (
                            <span className="rounded bg-amber-500/10 px-1 py-0.2 font-semibold text-amber-600 dark:text-amber-400">
                              Vence hoy
                            </span>
                          )}
                          {task.dueDate && !isOverdue && !isDueToday && (
                            <span className="rounded bg-blue-500/10 px-1 py-0.2 font-semibold text-blue-600 dark:text-blue-400">
                              Vence {fmtDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRescheduleExtra?.(task.id, currentToday)}
                          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                          title="Mover a hoy"
                        >
                          Hoy
                        </button>
                        <label className="relative flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] cursor-pointer">
                          <AppIcon name="calendarDays" className="h-3 w-3 mr-1" />
                          <span>Fecha</span>
                          <input
                            type="date"
                            aria-label={`Reprogramar ${task.text}`}
                            defaultValue={task.date}
                            onChange={(e) => {
                              if (e.target.value) {
                                onRescheduleExtra?.(task.id, e.target.value);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="p-3.5 pt-3 sm:px-4">
            <button
              type="button"
              onClick={onOpenAgenda}
              disabled={!openLabel}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-subtle)] px-3.5 py-3 text-left enabled:hover:border-[var(--blue)] disabled:cursor-default"
            >
              <span className="text-sm font-medium text-[var(--text-soft)]">Tu día está libre.</span>
              <AppIcon name="plus" className="h-4 w-4 text-[var(--blue)]" />
            </button>
          </div>
        ) : (
          <div>
            {timed.length > 0 && (
              <div className="divide-y divide-[var(--border)]/70">
                {timed.map((entry) => (
                  <AgendaEntryRow
                    key={entry.key}
                    entry={entry}
                    onToggle={onToggle}
                    onToggleFocus={onToggleFocus}
                    onOpenEntry={onOpenEntry}
                    completionMotion={completionMotion}
                  />
                ))}
              </div>
            )}
            {untimed.length > 0 && (
              <div className={timed.length > 0 ? 'border-t border-[var(--border)]' : ''}>
                <div className="bg-[var(--card-subtle)] px-4 py-1.5 text-[12px] font-semibold text-[var(--text-soft)]">
                  Sin horario
                </div>
                <div className="divide-y divide-[var(--border)]/70">
                  {untimed.map((entry) => (
                    <AgendaEntryRow
                      key={entry.key}
                      entry={entry}
                      onToggle={onToggle}
                      onToggleFocus={onToggleFocus}
                      onOpenEntry={onOpenEntry}
                      completionMotion={completionMotion}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
