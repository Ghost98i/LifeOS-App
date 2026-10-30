import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LifeOSState, DayKey, EffortLevel, TaskRecurring, ViewType } from '../types';
import {
  DAYS,
  DAY_LABELS,
  FREQ_LABELS,
  TEMPLATE_ESTUDIANTE,
  todayISO,
  uid,
} from '../lib/storage';
import { getUnifiedTaskList } from '../lib/taskDependencies';
import { routineScheduledFor } from '../lib/calculations';
import { shouldPlayCompletionMotion } from '../lib/motion';
import { playSound } from '../lib/audio';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';
import { CompletionCheckMark } from './visual/CompletionCheckMark';
import { agendaWeek, editedWeeklyBlockTime, isCurrentWeek, parseLocalDateISO, shiftWeek, validatePunctualEvent, validateWeeklyBlock, weekDates } from '../lib/agendaWeek';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { focusTargetElement } from '../lib/navigationFocus';
import { agendaTaskFocusId, datedTaskDestination } from '../lib/datedAgendaTasks';

interface AgendaViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  initialFocusId?: string | null;
  initialDate?: string | null;
  focusNonce?: number;
  onNavigateToRecord?: (view: ViewType, options?: { tab?: string; focusId?: string; date?: string }) => void;
}

const recurrenceHint = (freq: TaskRecurring['freq'], days: DayKey[] = []) => {
  if (days.length > 0) return 'Los días elegidos determinan cuándo aparece; la frecuencia no limita esos días.';
  if (freq === 'daily') return 'Sin días fijos, aparece todos los días.';
  return `Sin días fijos, puede aparecer cada día hasta ${freq === 'weekly' ? 'un completado' : 'tres completados'} en la semana.`;
};

export const AgendaView: React.FC<AgendaViewProps> = ({
  state,
  onUpdateState,
  initialFocusId,
  initialDate,
  focusNonce,
  onNavigateToRecord,
}) => {
  const [taskName, setTaskName] = useState('');
  const [taskFreq, setTaskFreq] = useState<'daily' | '2-3x' | 'weekly'>('daily');
  const [taskDays, setTaskDays] = useState<DayKey[]>([]);
  const [taskEffort, setTaskEffort] = useState<EffortLevel>('medium');
  const [taskTime, setTaskTime] = useState('');
  const [weekReference, setWeekReference] = useState(() => new Date());
  const [mobileDay, setMobileDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [weekViewMode, setWeekViewMode] = useState<'grid' | 'focused'>('focused');
  const [wideWeekView, setWideWeekView] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  const [activeSection, setActiveSection] = useState<'semana' | 'rutinas'>('semana');
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [templateAction, setTemplateAction] = useState<'load' | 'clear' | null>(null);
  const [eventDraft, setEventDraft] = useState<{ id?: string; name: string; date: string; time: string } | null>(null);
  const [eventError, setEventError] = useState('');
  const [weeklyDraft, setWeeklyDraft] = useState<{ activity: string; day: DayKey; time: string } | null>(null);
  const [weeklyErrors, setWeeklyErrors] = useState<ReturnType<typeof validateWeeklyBlock>>({});
  const weeklySubmitting = useRef(false);
  const weeklyTrigger = useRef<HTMLElement | null>(null);
  const templateTrigger = useRef<HTMLButtonElement | null>(null);
  const [completionMotion, setCompletionMotion] = useState<{ taskId: string; nonce: number } | null>(null);
  const [todayIso, setTodayIso] = useState(todayISO);
  const days = useMemo(() => agendaWeek(state, weekReference), [state, weekReference]);
  const dates = useMemo(() => weekDates(weekReference), [weekReference]);
  const calendarEnabled = isModuleEnabled(state, 'calendario');
  const weeklyBlockCount = DAYS.reduce((total, day) => total + (state.agenda?.[day]?.length || 0), 0);
  const suggestedBlockCount = DAYS.reduce((total, day) => total + TEMPLATE_ESTUDIANTE[day].length, 0);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setWideWeekView(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const refreshDate = () => setTodayIso(todayISO());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDate);
    };
  }, []);

  useEffect(() => {
    if (!initialFocusId) return;
    setActiveSection('semana');
    let targetDate = initialDate;
    if (initialFocusId.startsWith('agenda-event-')) {
      const eventId = initialFocusId.replace('agenda-event-', '');
      const ev = state.calendarEvents?.find((e) => e.id === eventId);
      if (ev?.date) {
        targetDate = ev.date;
      }
    }
    if (targetDate) {
      const parsed = parseLocalDateISO(targetDate);
      if (parsed) {
        setWeekReference(parsed);
        setMobileDay((parsed.getDay() + 6) % 7);
      }
    }
    return focusTargetElement(initialFocusId);
  }, [initialFocusId, initialDate, focusNonce, state.calendarEvents]);

  const openNewEvent = (date = dates[mobileDay]) => {
    setEventError('');
    setEventDraft({ name: '', date, time: '' });
  };

  const openWeeklyBlock = (day: DayKey, trigger: HTMLElement) => {
    weeklyTrigger.current = trigger;
    weeklySubmitting.current = false;
    setWeeklyErrors({});
    setWeeklyDraft({ activity: '', day, time: '09:00' });
  };

  const closeWeeklyBlock = () => {
    setWeeklyDraft(null);
    const trigger = weeklyTrigger.current;
    window.setTimeout(() => trigger?.focus(), 0);
  };

  const saveWeeklyBlock = (event: React.FormEvent) => {
    event.preventDefault();
    if (!weeklyDraft || weeklySubmitting.current) return;
    const errors = validateWeeklyBlock(weeklyDraft.activity, weeklyDraft.day, weeklyDraft.time);
    setWeeklyErrors(errors);
    if (Object.keys(errors).length > 0) return;
    weeklySubmitting.current = true;
    const saved = onUpdateState((draft) => {
      draft.agenda[weeklyDraft.day].push({
        id: uid(),
        time: weeklyDraft.time,
        activity: weeklyDraft.activity.trim(),
        effort: 'medium',
      });
    });
    if (saved) closeWeeklyBlock();
    else weeklySubmitting.current = false;
  };

  const saveEvent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventDraft || !calendarEnabled) return;
    const name = eventDraft.name.trim();
    const validationError = validatePunctualEvent(name, eventDraft.date, eventDraft.time);
    if (validationError) { setEventError(validationError); return; }
    const saved = onUpdateState((draft) => {
      if (eventDraft.id) {
        const existing = draft.calendarEvents.find((item) => item.id === eventDraft.id && !item.recurring);
        if (existing) {
          existing.name = name;
          existing.date = eventDraft.date;
          existing.time = eventDraft.time || undefined;
        }
      } else {
        draft.calendarEvents.push({ id: uid(), name, date: eventDraft.date, time: eventDraft.time || undefined, type: 'otro', recurring: false });
      }
    });
    if (!saved) return;
    const destination = new Date(`${eventDraft.date}T12:00:00`);
    setWeekReference(destination);
    setMobileDay((destination.getDay() + 6) % 7);
    setEventDraft(null);
  };

  const deleteEvent = (id: string) => {
    if (!calendarEnabled || !window.confirm('¿Eliminar este compromiso?')) return;
    onUpdateState((draft) => {
      draft.calendarEvents = draft.calendarEvents.filter((item) => item.id !== id);
    });
    setEventDraft(null);
  };

  useEffect(() => {
    if (!completionMotion) return;
    const timeout = window.setTimeout(() => setCompletionMotion(null), 1100);
    return () => window.clearTimeout(timeout);
  }, [completionMotion]);

  // Editing state for Agenda Block
  const [editingBlock, setEditingBlock] = useState<{
    id: string;
    currentDay: DayKey;
    newDay: DayKey;
    time: string;
    activity: string;
    effort: EffortLevel;
    /** ID of the linked UnifiedTask — persisted to AgendaBlock.linkedTaskId */
    linkedTaskId?: string;
    /** Transient search filter for the task selector — not persisted */
    taskSearch: string;
  } | null>(null);

  // All unified tasks for the task selector (memoized per state change)
  const allUnifiedTasks = useMemo(() => getUnifiedTaskList(state).filter((t) => !t.done), [state]);

  const filteredTasks = useMemo(() => {
    if (!editingBlock) return [];
    const q = editingBlock.taskSearch.trim().toLowerCase();
    if (!q) return allUnifiedTasks.slice(0, 8); // show up to 8 when no query
    return allUnifiedTasks.filter((t) => t.text.toLowerCase().includes(q)).slice(0, 8);
  }, [allUnifiedTasks, editingBlock]);

  // Editing state for Recurring Task
  const [editingTask, setEditingTask] = useState<TaskRecurring | null>(null);

  useEffect(() => {
    if (!editingBlock && !editingTask) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setEditingBlock(null);
        setEditingTask(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingBlock, editingTask]);

  useEffect(() => {
    if (!eventDraft) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEventDraft(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [eventDraft]);

  useEffect(() => {
    if (!weeklyDraft) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWeeklyBlock();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [weeklyDraft]);

  const handleLoadTemplate = () => {
    return onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      DAYS.forEach((d) => {
        draft.agenda[d] = TEMPLATE_ESTUDIANTE[d].map((b) => ({
          id: uid(),
          time: b.time,
          activity: b.activity,
          effort: 'medium',
        }));
      });
    });
  };

  const handleClearAgenda = () => {
    return onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      DAYS.forEach((d) => {
        draft.agenda[d] = [];
      });
    });
  };

  const openTemplateAction = (action: 'load' | 'clear', trigger: HTMLButtonElement) => {
    templateTrigger.current = trigger;
    setTemplateAction(action);
  };

  const closeTemplateAction = () => {
    setTemplateAction(null);
    const trigger = templateTrigger.current;
    window.setTimeout(() => trigger?.focus(), 0);
  };

  const confirmTemplateAction = () => {
    const saved = templateAction === 'load' ? handleLoadTemplate() : handleClearAgenda();
    if (saved) closeTemplateAction();
  };

  useEffect(() => {
    if (!templateAction) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTemplateAction();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [templateAction]);

  const handleDeleteBlock = (day: DayKey, id: string) => {
    onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[day]) draft.agenda[day] = [];
      draft.agenda[day] = draft.agenda[day].filter((b) => b.id !== id);
    });
  };

  const handleSaveEditedBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock || !editingBlock.activity.trim()) return;
    const { id, currentDay, newDay, time, activity, effort, linkedTaskId } = editingBlock;

    const saved = onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[currentDay]) draft.agenda[currentDay] = [];
      if (!draft.agenda[newDay]) draft.agenda[newDay] = [];
      // Remove from current day
      draft.agenda[currentDay] = draft.agenda[currentDay].filter((b) => b.id !== id);
      // Add to new day (with optional linkedTaskId)
      draft.agenda[newDay].push({
        id,
        time: editedWeeklyBlockTime(time),
        activity: activity.trim(),
        effort,
        ...(linkedTaskId ? { linkedTaskId } : {}),
      });
    });

    if (saved) setEditingBlock(null);
  };

  const toggleDaySelection = (day: DayKey, list: DayKey[], setList: (d: DayKey[]) => void) => {
    if (list.includes(day)) {
      setList(list.filter((d) => d !== day));
    } else {
      setList([...list, day]);
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    const saved = onUpdateState((draft) => {
      if (!draft.tasksRecurring) draft.tasksRecurring = [];
      draft.tasksRecurring.push({
        id: uid(),
        name: taskName.trim(),
        freq: taskFreq,
        days: taskDays.length > 0 ? taskDays : undefined,
        effort: taskEffort,
        time: taskTime || undefined,
      });
    });
    if (!saved) return;
    setTaskName('');
    setTaskDays([]);
    setTaskEffort('medium');
    setTaskTime('');
    setShowRoutineForm(false);
  };

  const handleSaveEditedTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.name.trim()) return;

    const saved = onUpdateState((draft) => {
      if (!draft.tasksRecurring) draft.tasksRecurring = [];
      const idx = draft.tasksRecurring.findIndex((t) => t.id === editingTask.id);
      if (idx !== -1) {
        draft.tasksRecurring[idx] = {
          ...editingTask,
          name: editingTask.name.trim(),
        };
      }
    });

    if (saved) setEditingTask(null);
  };

  const handleDeleteTask = (id: string) => {
    onUpdateState((draft) => {
      draft.tasksRecurring = (draft.tasksRecurring || []).filter((t) => t.id !== id);
    });
  };

  const handleToggleTodayTask = (taskId: string) => {
    const wasCompleted = Boolean(state.taskLog?.[todayIso]?.[taskId]);
    const nextCompleted = !wasCompleted;
    const saved = onUpdateState((draft) => {
      if (!draft.taskLog) draft.taskLog = {};
      if (!draft.taskLog[todayIso]) draft.taskLog[todayIso] = {};
      draft.taskLog[todayIso][taskId] = nextCompleted;
    });

    if (saved && shouldPlayCompletionMotion(wasCompleted, nextCompleted)) {
      playSound('success');
      setCompletionMotion((current) => ({ taskId, nonce: (current?.nonce || 0) + 1 }));
    }
  };

  const todayCompletionButton = (taskId: string, taskName: string, completed: boolean) => {
    const showMotion = Boolean(completed && completionMotion?.taskId === taskId);
    return (
      <button
        type="button"
        onClick={() => handleToggleTodayTask(taskId)}
        aria-label={completed ? `Reabrir ${taskName}` : `Completar ${taskName}`}
        aria-pressed={completed}
        title={completed ? 'Reabrir para hoy' : 'Completar para hoy'}
        className={`lifeos-task-check agenda-completion-check relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] ${completed ? (showMotion ? 'is-completed is-animating' : 'is-completed') : 'is-pending'}`}
      >
        <CompletionCheckMark
          completed={completed}
          animate={showMotion}
          nonce={completionMotion?.nonce || 0}
          size={24}
        />
      </button>
    );
  };

  const getDayEntries = (item: typeof days[number]) => {
    const entries = [
      ...item.blocks.map((block) => ({ key: `block-${block.id}`, id: block.id, label: block.activity, time: block.time, kind: 'block' as const, block })),
      ...item.routines.map((routine) => ({ key: `routine-${routine.id}`, id: routine.id, label: routine.name, time: routine.time, kind: 'routine' as const, routine })),
      ...item.events.map((event) => ({ key: `event-${event.id}`, id: event.id, label: event.name, time: event.time, kind: 'event' as const, event })),
      ...item.tasks.map((task) => ({ key: `task-${task.key}`, id: task.id, label: task.name, time: task.time, kind: 'task' as const, task })),
    ];
    const timed = entries.filter((entry) => entry.time).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const untimedScheduled = entries.filter((entry) => !entry.time && entry.kind !== 'routine');
    const untimedRoutines = entries.filter((entry) => !entry.time && entry.kind === 'routine');
    return { entries, timed, untimedScheduled, untimedRoutines };
  };

  const renderEntry = (entry: ReturnType<typeof getDayEntries>['entries'][number], item: typeof days[number]) => {
    const canEditEvent = entry.kind === 'event' && calendarEnabled && state.calendarEvents.some((event) => event.id === entry.id && !event.recurring);
    const completed = entry.kind === 'task' ? entry.task.done : item.date === todayIso && entry.kind !== 'event' && Boolean(state.taskLog?.[todayIso]?.[entry.id]);
    const domId = entry.kind === 'task' ? agendaTaskFocusId(entry.task, item.date) : entry.kind === 'event' ? `agenda-event-${entry.id}` : `agenda-${entry.key}`;
    return (
      <div
        key={entry.key}
        id={domId}
        className="group flex min-w-0 items-start gap-2.5 rounded-xl border border-transparent p-2 hover:border-[var(--border)] hover:bg-[var(--surface-muted)] transition-all sm:items-center sm:px-3"
      >
        {entry.time && (
          <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[var(--blue)]">
            {entry.time}
          </span>
        )}
        {item.date === todayIso && (entry.kind === 'block' || entry.kind === 'routine') ? (
          todayCompletionButton(entry.id, entry.label, completed)
        ) : (
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-soft)]"
          >
            <AppIcon
              name={entry.kind === 'task' ? (completed ? 'checkCircle' : 'task') : entry.kind === 'event' ? 'calendarDays' : entry.kind === 'routine' && !entry.time ? 'list' : 'clock'}
              className="h-3.5 w-3.5"
            />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span
            className={`break-words [overflow-wrap:anywhere] text-xs sm:text-sm font-medium ${
              completed ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text)]'
            }`}
          >
            {entry.label}
          </span>
          <span
            className={`text-xs sm:text-xs ${
              entry.kind === 'event'
                ? 'font-semibold text-[#4F46E5] dark:text-indigo-300'
                : 'text-[var(--text-soft)] dark:text-slate-300'
            }`}
          >
            {entry.kind === 'block'
              ? 'Actividad semanal'
              : entry.kind === 'routine'
              ? 'Rutina'
              : entry.kind === 'task'
              ? `${entry.task.source === 'project_task' ? 'Tarea de proyecto' : 'Tarea'}${entry.task.isDeadline ? ' · vencimiento' : ''}`
              : entry.event.type === 'examen'
              ? 'Examen · informativo'
              : state.calendarEvents.some((event) => event.id === entry.id && event.recurring)
              ? 'Anual · informativo'
              : 'Evento puntual · informativo'}
          </span>
        </div>
        {entry.kind === 'task' && onNavigateToRecord && <button type="button" aria-label={`Abrir tarea: ${entry.label}`} onClick={() => {
          const target = datedTaskDestination(entry.task); onNavigateToRecord(target.view, target.options);
        }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--blue)] hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]">
          <AppIcon name="arrowRight" className="h-4 w-4" />
        </button>}
        {entry.kind === 'block' && entry.block.linkedTaskId && (
          <span
            title={
              allUnifiedTasks.find((task) => task.id === entry.block.linkedTaskId)
                ? 'Tarea vinculada'
                : 'Vínculo a tarea que ya no existe'
            }
            className="text-[var(--blue)] shrink-0"
          >
            <AppIcon name="link" className="h-3.5 w-3.5" />
          </span>
        )}
        {entry.kind === 'block' && (
          <div className="flex shrink-0 gap-0.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() =>
                setEditingBlock({
                  id: entry.block.id,
                  currentDay: item.day,
                  newDay: item.day,
                  time: entry.block.time,
                  activity: entry.block.activity,
                  effort: entry.block.effort || 'medium',
                  linkedTaskId: entry.block.linkedTaskId,
                  taskSearch: '',
                })
              }
              aria-label={`Editar ${entry.label}`}
              className="rounded p-1 text-[var(--text-soft)] dark:text-slate-300 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
            >
              <AppIcon name="edit" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBlock(item.day, entry.id)}
              aria-label={`Eliminar ${entry.label}`}
              className="rounded p-1 text-[var(--text-soft)] dark:text-slate-300 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {canEditEvent && (
          <button
            type="button"
            onClick={() => {
              const event = state.calendarEvents.find((candidate) => candidate.id === entry.id)!;
              setEventError('');
              setEventDraft({
                id: event.id,
                name: event.name,
                date: event.date,
                time: event.time || '',
              });
            }}
            aria-label={`Editar ${entry.label}`}
            className="rounded p-1 text-[var(--text-soft)] dark:text-slate-300 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <AppIcon name="edit" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const renderDayCard = (item: typeof days[number], isGrid: boolean) => {
    const { entries, timed, untimedScheduled, untimedRoutines } = getDayEntries(item);
    const count = entries.length;
    const isToday = item.date === todayIso;
    const dayDate = new Date(`${item.date}T12:00:00`);
    const dayLabel = DAY_LABELS[item.day];
    const dateFormatted = dayDate.toLocaleDateString('es-UY', { day: 'numeric', month: 'long' });
    const dayIndex = days.indexOf(item);

    return (
      <section
        key={item.date}
        aria-label={`Actividades del ${dayLabel} ${item.date}`}
        className={`flex flex-col rounded-2xl border transition-all ${
          isToday
            ? 'border-[var(--blue)]/60 bg-[var(--card)] shadow-md ring-2 ring-[var(--blue)]/15'
            : 'border-[var(--border)] bg-[var(--card)] shadow-2xs hover:border-[var(--border-hover)]'
        } ${isGrid ? 'min-h-[220px]' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-3 sm:px-4">
          <button
            type="button"
            onClick={() => {
              if (isGrid) {
                setMobileDay(dayIndex);
                setWeekViewMode('focused');
              }
            }}
            title={isGrid ? 'Ver detalle de este día' : undefined}
            className={`min-w-0 text-left cursor-pointer group/title ${isGrid ? 'hover:opacity-80 transition-opacity' : ''}`}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text)] group-hover/title:text-[var(--blue)] transition-colors">
                {dayLabel} <span className="tabular-nums font-extrabold">{dayDate.getDate()}</span>
              </h3>
              {isToday && (
                <span className="rounded-md bg-[var(--blue)] px-1.5 py-0.5 text-xs font-extrabold text-white">
                  Hoy
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-soft)] truncate">
              {dateFormatted}
            </p>
          </button>

          <div className="flex items-center gap-1">
            <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-soft)]">
              {count}
            </span>
            <details className="relative">
              <summary
                aria-label={`Agregar para ${dayLabel}`}
                className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg">
                <button
                  type="button"
                  onClick={(e) => {
                    const d = (e.currentTarget.closest('details') as HTMLDetailsElement);
                    d?.removeAttribute('open');
                    openWeeklyBlock(item.day, e.currentTarget);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  Actividad semanal
                </button>
                {calendarEnabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      const d = (e.currentTarget.closest('details') as HTMLDetailsElement);
                      d?.removeAttribute('open');
                      openNewEvent(item.date);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                  >
                    Evento puntual
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="flex-1 p-2 sm:p-3 space-y-2">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--text-soft)] dark:text-slate-300">
              Sin actividades previstas.
            </p>
          ) : (
            <>
              {timed.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-xs font-bold text-[var(--text-faint)]">
                    Con horario
                  </div>
                  <div className="space-y-0.5">
                    {timed.map((entry) => renderEntry(entry, item))}
                  </div>
                </div>
              )}
              {untimedScheduled.length > 0 && (
                <div className={timed.length > 0 ? 'border-t border-[var(--border)]/50 pt-1.5' : ''}>
                  <div className="px-2 pb-1 text-xs font-bold text-[var(--text-faint)]">
                    Sin horario
                  </div>
                  <div className="space-y-0.5">
                    {untimedScheduled.map((entry) => renderEntry(entry, item))}
                  </div>
                </div>
              )}
              {untimedRoutines.length > 0 && (
                <div className={timed.length > 0 || untimedScheduled.length > 0 ? 'border-t border-[var(--border)]/50 pt-1.5' : ''}>
                  <div className="px-2 pb-1 text-xs font-bold text-[var(--text-faint)]">
                    Rutinas · {untimedRoutines.length}
                  </div>
                  <div className="space-y-0.5">
                    {untimedRoutines.map((entry) => renderEntry(entry, item))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  };

  const renderFocusedDayView = (item: typeof days[number]) => {
    const { entries, timed, untimedScheduled, untimedRoutines } = getDayEntries(item);
    const count = entries.length;
    const isToday = item.date === todayIso;
    const dayDate = new Date(`${item.date}T12:00:00`);
    const dayLabel = DAY_LABELS[item.day];

    return (
      <div className="space-y-4">
        {/* Selected Day Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-[var(--text)] capitalize">
                {dayLabel} {dayDate.getDate()} de {dayDate.toLocaleDateString('es-UY', { month: 'long' })}
              </h3>
              {isToday && (
                <span className="rounded-md bg-[var(--blue)] px-2 py-0.5 text-xs font-extrabold text-white">
                  Hoy
                </span>
              )}
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-soft)]">
                {count} {count === 1 ? 'actividad' : 'actividades'}
              </span>
            </div>
          </div>


        </div>

        {/* Selected Day Content: Responsive Desktop Layout */}
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 sm:p-12 text-center space-y-3 shadow-2xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--text-faint)]">
              <AppIcon name="calendarDays" className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text)]">Sin actividades previstas para {dayLabel}</p>
              <p className="text-xs text-[var(--text-soft)] max-w-sm mx-auto">
                Agregá una actividad semanal o un compromiso para este día.
              </p>
            </div>
          </div>
        ) : untimedRoutines.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Main Column (8 cols): Horarios & Compromisos */}
            <div className="lg:col-span-8 space-y-4">
              {timed.length > 0 && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <AppIcon name="clock" className="h-4 w-4 text-[var(--blue)]" />
                      <h4 className="text-xs font-bold text-[var(--text)]">
                        Actividades con horario ({timed.length})
                      </h4>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {timed.map((entry) => renderEntry(entry, item))}
                  </div>
                </div>
              )}

              {untimedScheduled.length > 0 && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <AppIcon name="calendar" className="h-4 w-4 text-indigo-500" />
                      <h4 className="text-xs font-bold text-[var(--text)]">
                        Sin horario ({untimedScheduled.length})
                      </h4>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {untimedScheduled.map((entry) => renderEntry(entry, item))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (4 cols): Rutinas del Día */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <AppIcon name="repeat" className="h-4 w-4 text-[var(--blue)]" />
                    <h4 className="text-xs font-bold text-[var(--text)]">
                      Rutinas de {dayLabel}
                    </h4>
                  </div>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--text-soft)]">
                    {untimedRoutines.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {untimedRoutines.map((entry) => renderEntry(entry, item))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Cuando no hay rutinas en el día: la línea temporal gana amplitud y se muestra una barra discreta al pie */
          <div className="space-y-4">
            {timed.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <AppIcon name="clock" className="h-4 w-4 text-[var(--blue)]" />
                    <h4 className="text-xs font-bold text-[var(--text)]">
                      Actividades con horario ({timed.length})
                    </h4>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {timed.map((entry) => renderEntry(entry, item))}
                </div>
              </div>
            )}

            {untimedScheduled.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <AppIcon name="calendar" className="h-4 w-4 text-indigo-500" />
                    <h4 className="text-xs font-bold text-[var(--text)]">
                      Sin horario ({untimedScheduled.length})
                    </h4>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {untimedScheduled.map((entry) => renderEntry(entry, item))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--text-soft)] shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <AppIcon name="repeat" className="h-4 w-4 text-[var(--text-faint)] shrink-0" />
                <span className="truncate">Sin rutinas para {dayLabel.toLowerCase()}.</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('rutinas')}
                className="shrink-0 text-xs font-semibold text-[var(--blue)] hover:text-[var(--blue-hover)] transition-colors cursor-pointer"
              >
                Ver rutinas →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="product-refinement space-y-5 sm:space-y-6">
      <PageHeader
        title="Agenda y rutinas"
        badge={
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)]">
            {weeklyBlockCount} {weeklyBlockCount === 1 ? 'actividad semanal' : 'actividades semanales'}
          </span>
        }
      />

      <nav aria-label="Secciones de Agenda" className="flex gap-2 border-b border-[var(--border)] pb-px">
        {(['semana', 'rutinas'] as const).map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            aria-pressed={activeSection === section}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer ${
              activeSection === section
                ? 'border-[#4F46E5] text-[#4F46E5] dark:text-indigo-300'
                : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            <AppIcon name={section === 'semana' ? 'calendarDays' : 'repeat'} className="h-4 w-4" />
            <span>{section === 'semana' ? 'Semana' : 'Rutinas'}</span>
            {section === 'rutinas' && (
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.2 text-xs font-bold text-[var(--text-soft)]">
                {(state.tasksRecurring || []).length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {activeSection === 'semana' && (
        <section className="space-y-4">
          {/* Week Navigation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:px-4 sm:py-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--blue)]">
                <AppIcon name="calendarDays" className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[var(--text)]">
                  Semana del {new Date(`${dates[0]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })} al {new Date(`${dates[6]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-xs text-[var(--text-soft)]">
                  {days.reduce((total, d) => total + d.blocks.length + d.routines.length + d.events.length + d.tasks.length, 0)} actividades en la semana
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, -1))}
                  aria-label="Semana anterior"
                  className="rounded-lg p-1.5 text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                >
                  <AppIcon name="chevronLeft" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekReference(new Date());
                    setMobileDay((new Date().getDay() + 6) % 7);
                  }}
                  disabled={isCurrentWeek(weekReference)}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-muted)] disabled:opacity-40 cursor-pointer"
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, 1))}
                  aria-label="Semana siguiente"
                  className="rounded-lg p-1.5 text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                >
                  <AppIcon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>

              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => openNewEvent(dates[mobileDay])}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-bold text-[var(--text)] hover:border-[var(--blue)] hover:text-[var(--blue)] transition-colors cursor-pointer"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5 text-[var(--blue)]" />
                  <span>Compromiso puntual</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => openWeeklyBlock(days[mobileDay].day, e.currentTarget)}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3.5 py-2 text-xs font-bold text-white hover:bg-[var(--blue-hover)] transition-all shadow-2xs cursor-pointer"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
                <span>Actividad semanal</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  onClick={() => setWeekViewMode('focused')}
                  aria-pressed={weekViewMode === 'focused'}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    weekViewMode === 'focused'
                      ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs font-bold'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Vista diaria
                </button>
                <button
                  type="button"
                  onClick={() => setWeekViewMode('grid')}
                  aria-pressed={weekViewMode === 'grid'}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    weekViewMode === 'grid'
                      ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs font-bold'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Semana (7 días)
                </button>
              </div>
            </div>
          </div>

          {/* Quick 7-Day Navigation Strip */}
          <nav aria-label="Días de la semana" className="flex sm:grid sm:grid-cols-7 gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {days.map((item, index) => {
              const count = item.blocks.length + item.routines.length + item.events.length + item.tasks.length;
              const isSelected = mobileDay === index;
              const isToday = item.date === todayIso;
              return (
                <button
                  key={item.date}
                  type="button"
                  onClick={() => {
                    setMobileDay(index);
                  }}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${DAY_LABELS[item.day]} ${new Date(`${item.date}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })}: ${count} ${count === 1 ? 'actividad' : 'actividades'}`}
                  className={`min-w-[4.25rem] sm:min-w-0 flex-1 rounded-xl border px-2 py-2 text-center transition-all sm:px-2.5 sm:py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer ${
                    isSelected
                      ? 'border-[#4F46E5] bg-[var(--blue-soft)] text-[var(--blue)] dark:text-indigo-200 shadow-2xs ring-1 ring-[#4F46E5]/40'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="block truncate text-xs font-semibold sm:text-xs">
                      <span className="sm:hidden">{DAY_LABELS[item.day].slice(0, 2)}</span>
                      <span className="hidden sm:inline">{DAY_LABELS[item.day].slice(0, 3)}</span>
                    </span>
                    {isToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" title="Hoy" />
                    )}
                  </div>
                  <span className="block text-base font-bold tabular-nums sm:text-lg my-0.5">
                    {Number(item.date.slice(-2))}
                  </span>
                  <span className="block text-xs font-semibold tabular-nums sm:text-xs">
                    {count === 0 ? '—' : count}{' '}
                    <span className="hidden lg:inline">{count === 1 ? 'actividad' : 'actividades'}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Day Display: Focused Day (Default & Mobile) vs 7-Day Grid (Desktop Alternative) */}
          {weekViewMode === 'grid' && wideWeekView ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3.5 items-start">
              {days.map((item) => renderDayCard(item, true))}
            </div>
          ) : (
            <div className="min-w-0">
              {renderFocusedDayView(days[mobileDay])}
            </div>
          )}
        </section>
      )}

      {weeklyDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeWeeklyBlock}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-weekly-title"
            aria-describedby="agenda-weekly-hint"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="agenda-weekly-title" className="text-base font-bold text-[var(--text)]">Nueva actividad semanal</h2>
            <p id="agenda-weekly-hint" className="mt-1 text-xs text-[var(--text-soft)]">Se repetirá todas las semanas en el día seleccionado.</p>
            <form onSubmit={saveWeeklyBlock} noValidate className="mt-4 space-y-3">
              <div>
                <label htmlFor="agenda-weekly-activity" className="block text-xs font-semibold text-[var(--text)]">Nombre de actividad</label>
                <input
                  id="agenda-weekly-activity"
                  autoFocus
                  type="text"
                  maxLength={200}
                  value={weeklyDraft.activity}
                  onChange={(event) => {
                    setWeeklyDraft({ ...weeklyDraft, activity: event.target.value });
                    setWeeklyErrors((current) => ({ ...current, activity: undefined }));
                  }}
                  aria-invalid={Boolean(weeklyErrors.activity)}
                  aria-describedby={weeklyErrors.activity ? 'agenda-weekly-activity-error' : undefined}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
                />
                {weeklyErrors.activity && <p id="agenda-weekly-activity-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{weeklyErrors.activity}</p>}
              </div>
              <div>
                <label htmlFor="agenda-weekly-day" className="block text-xs font-semibold text-[var(--text)]">Día de la semana</label>
                <select
                  id="agenda-weekly-day"
                  value={weeklyDraft.day}
                  onChange={(event) => {
                    setWeeklyDraft({ ...weeklyDraft, day: event.target.value as DayKey });
                    setWeeklyErrors((current) => ({ ...current, day: undefined }));
                  }}
                  aria-invalid={Boolean(weeklyErrors.day)}
                  aria-describedby={weeklyErrors.day ? 'agenda-weekly-day-error' : undefined}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
                >
                  {DAYS.map((day) => <option key={day} value={day}>{DAY_LABELS[day]}</option>)}
                </select>
                {weeklyErrors.day && <p id="agenda-weekly-day-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{weeklyErrors.day}</p>}
              </div>
              <div>
                <label htmlFor="agenda-weekly-time" className="block text-xs font-semibold text-[var(--text)]">Hora</label>
                <input
                  id="agenda-weekly-time"
                  type="time"
                  step={60}
                  value={weeklyDraft.time}
                  onChange={(event) => {
                    setWeeklyDraft({ ...weeklyDraft, time: event.target.value });
                    setWeeklyErrors((current) => ({ ...current, time: undefined }));
                  }}
                  aria-invalid={Boolean(weeklyErrors.time)}
                  aria-describedby={weeklyErrors.time ? 'agenda-weekly-time-error' : undefined}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
                />
                {weeklyErrors.time && <p id="agenda-weekly-time-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{weeklyErrors.time}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeWeeklyBlock} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)]">Cancelar</button>
                <button type="submit" className="rounded-lg bg-[var(--blue)] px-3 py-2 text-xs font-semibold text-white">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {eventDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEventDraft(null)}><div role="dialog" aria-modal="true" aria-labelledby="agenda-event-title" className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5" onClick={(event) => event.stopPropagation()}><h2 id="agenda-event-title" className="mb-4 text-base font-bold text-[var(--text)]">{eventDraft.id ? 'Editar compromiso' : 'Nuevo compromiso puntual'}</h2><form onSubmit={saveEvent} className="space-y-3"><label className="block text-xs font-semibold text-[var(--text)]">Título<input autoFocus type="text" required maxLength={200} value={eventDraft.name} onChange={(event) => setEventDraft({ ...eventDraft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)]" /></label><label className="block text-xs font-semibold text-[var(--text)]">Fecha<input type="date" required value={eventDraft.date} onChange={(event) => setEventDraft({ ...eventDraft, date: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)]" /></label><label className="block text-xs font-semibold text-[var(--text)]">Hora opcional<input type="time" value={eventDraft.time} onChange={(event) => setEventDraft({ ...eventDraft, time: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)]" /></label>{eventError && <p role="alert" className="text-xs text-red-600">{eventError}</p>}<div className="flex items-center justify-end gap-2 pt-2">{eventDraft.id && <button type="button" onClick={() => deleteEvent(eventDraft.id!)} className="mr-auto text-xs font-semibold text-red-600">Eliminar</button>}<button type="button" onClick={() => setEventDraft(null)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text)]">Cancelar</button><button type="submit" className="rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white">Guardar</button></div></form></div></div>}

      {templateAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeTemplateAction}>
          <div role="dialog" aria-modal="true" aria-labelledby="agenda-template-title" className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4" onClick={event => event.stopPropagation()}>
            <h2 id="agenda-template-title" className="text-base font-bold text-[var(--text)]">{templateAction === 'load' ? 'Aplicar plantilla sugerida' : 'Vaciar horario recurrente'}</h2>
            <p className="text-sm text-[var(--text-soft)]">
              {templateAction === 'load'
                ? `La plantilla contiene ${suggestedBlockCount} actividades y reemplazará las ${weeklyBlockCount} actividades de tu horario semanal.`
                : `Se eliminarán las ${weeklyBlockCount} actividades de tu horario semanal.`}
              {' '}Tus rutinas y compromisos puntuales se conservan.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={closeTemplateAction} className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text)]">Cancelar</button>
              <button type="button" onClick={confirmTemplateAction} className="min-h-11 rounded-lg bg-[var(--blue)] px-3 text-sm font-semibold text-white">{templateAction === 'load' ? 'Aplicar plantilla' : 'Vaciar horario'}</button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingTask(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="agenda-edit-routine-title" className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5" onClick={event => event.stopPropagation()}>
            <h2 id="agenda-edit-routine-title" className="mb-4 text-base font-bold text-[var(--text)]">Editar rutina</h2>
            <form onSubmit={handleSaveEditedTask} className="space-y-3">
              <label className="block text-sm text-[var(--text)]">Nombre
                <input autoFocus required maxLength={200} value={editingTask.name} onChange={event => setEditingTask({ ...editingTask, name: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm" />
              </label>
              <label className="block text-sm text-[var(--text)]">Frecuencia
                <select value={editingTask.freq} onChange={event => setEditingTask({ ...editingTask, freq: event.target.value as TaskRecurring['freq'] })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm">
                  <option value="daily">Diaria</option><option value="2-3x">2–3 veces por semana</option><option value="weekly">Semanal</option>
                </select>
              </label>
              <fieldset>
                <legend className="text-sm text-[var(--text)]">Días de la semana</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DAYS.map(day => <button key={day} type="button" aria-label={DAY_LABELS[day]} aria-pressed={editingTask.days?.includes(day) || false} onClick={() => toggleDaySelection(day, editingTask.days || [], days => setEditingTask({ ...editingTask, days: days.length ? days : undefined }))} className={`min-h-11 rounded-lg border px-2 text-xs ${editingTask.days?.includes(day) ? 'border-[var(--blue)] bg-[var(--blue)] text-white' : 'border-[var(--border)] text-[var(--text)]'}`}>{DAY_LABELS[day].slice(0, 3)}</button>)}
                </div>
                <p className="mt-2 text-xs text-[var(--text-soft)]">{recurrenceHint(editingTask.freq, editingTask.days)}</p>
              </fieldset>
              <label className="block text-sm text-[var(--text)]">Hora opcional
                <input type="time" value={editingTask.time || ''} onChange={event => setEditingTask({ ...editingTask, time: event.target.value || undefined })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm" />
              </label>
              <label className="block text-sm text-[var(--text)]">Esfuerzo mental
                <select value={editingTask.effort || 'medium'} onChange={event => setEditingTask({ ...editingTask, effort: event.target.value as EffortLevel })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm">
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingTask(null)} className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text)]">Cancelar</button>
                <button type="submit" className="min-h-11 rounded-lg bg-[var(--blue)] px-3 text-sm font-semibold text-white">Guardar rutina</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Drawer for editing agenda block */}
      {editingBlock && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={() => setEditingBlock(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-agenda-block-title"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <AppIcon name="edit" className="h-4 w-4 text-[var(--blue)]" />
                <h3 id="edit-agenda-block-title" className="text-sm font-extrabold text-[var(--text)]">Editar actividad semanal</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded hover:bg-[var(--surface-muted)] cursor-pointer"
                aria-label="Cerrar modal"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBlock} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-faint)] block mb-1">
                  Día de la semana
                </label>
                <select
                  value={editingBlock.newDay}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, newDay: e.target.value as DayKey })
                  }
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] capitalize focus:border-[var(--blue)] outline-hidden cursor-pointer"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {DAY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-faint)] block mb-1">Esfuerzo mental</label>
                <select value={editingBlock.effort} onChange={(e) => setEditingBlock({ ...editingBlock, effort: e.target.value as EffortLevel })} className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]">
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-faint)] block mb-1">
                  Horario (HH:MM)
                </label>
                <input
                  type="text"
                  value={editingBlock.time}
                  onChange={(e) => setEditingBlock({ ...editingBlock, time: e.target.value })}
                  placeholder="Ej: 09:00"
                  className="w-full px-3 py-2 text-xs tabular-nums font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-faint)] block mb-1">
                  Actividad
                </label>
                <input
                  type="text"
                  value={editingBlock.activity}
                  onChange={(e) => setEditingBlock({ ...editingBlock, activity: e.target.value })}
                  placeholder="Ej: Ir al Gimnasio"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                />
              </div>

              {/* Task Linking Section */}
              <div className="border-t border-[var(--border)] pt-3 space-y-2">
                <label className="text-xs font-bold text-[var(--text-faint)] block">
                  Tarea vinculada
                </label>

                {/* Currently linked task display */}
                {editingBlock.linkedTaskId ? (() => {
                  const linked = allUnifiedTasks.find((t) => t.id === editingBlock.linkedTaskId);
                  return (
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--blue-soft)]/20 border border-[var(--blue)]/30">
                      <AppIcon name="link" className="h-3.5 w-3.5 text-[var(--blue)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text)] flex-1 truncate">
                        {linked ? linked.text : <span className="text-[var(--text-faint)] italic">Tarea ya no existe</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingBlock({ ...editingBlock, linkedTaskId: undefined, taskSearch: '' })}
                        className="text-xs font-bold text-rose-500 hover:text-rose-600 px-2 py-0.5 rounded-lg hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                        title="Quitar vínculo"
                      >
                        Quitar
                      </button>
                    </div>
                  );
                })() : (
                  <p className="text-xs text-[var(--text-faint)]">Sin tarea vinculada.</p>
                )}

                {/* Task search + selector */}
                <input
                  type="text"
                  value={editingBlock.taskSearch}
                  onChange={(e) => setEditingBlock({ ...editingBlock, taskSearch: e.target.value })}
                  placeholder="Buscar tarea para vincular..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--blue)] outline-hidden"
                />
                {filteredTasks.length > 0 && (
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {filteredTasks.map((t) => {
                      const isSelected = editingBlock.linkedTaskId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditingBlock({
                            ...editingBlock,
                            linkedTaskId: isSelected ? undefined : t.id,
                            taskSearch: '',
                          })}
                          className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'bg-[var(--blue)]/15 border border-[var(--blue)]/40 text-[var(--text)]'
                              : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--blue)] hover:text-[var(--text)]'
                          }`}
                        >
                          {isSelected && <AppIcon name="check" className="h-3 w-3 text-[var(--blue)] shrink-0" />}
                          <span className="truncate">{t.projectName ? `[${t.projectName}] ${t.text}` : t.text}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {filteredTasks.length === 0 && editingBlock.taskSearch.trim() !== '' && (
                  <p className="text-xs text-[var(--text-faint)] text-center py-1">Sin resultados para "{editingBlock.taskSearch}"</p>
                )}
                {filteredTasks.length === 0 && editingBlock.taskSearch.trim() === '' && allUnifiedTasks.length === 0 && (
                  <p className="text-xs text-[var(--text-faint)] text-center py-1">No hay tareas pendientes.</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--bg)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] cursor-pointer shadow-xs"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurring Tasks */}
      {activeSection === 'rutinas' && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                Rutinas recurrentes
                <ContextualHelp label="Rutinas recurrentes">El círculo marca la rutina como completada para ese día. La rutina conserva su frecuencia y vuelve a aparecer cuando corresponda.</ContextualHelp>
                <span className="text-xs font-semibold text-[var(--text-faint)] bg-[var(--surface-muted)] px-2.5 py-0.5 rounded-md border border-[var(--border)]">
                  {(state.tasksRecurring || []).length}
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowRoutineForm((current) => !current)}
              aria-expanded={showRoutineForm}
              aria-controls="new-routine-form"
              className="flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
            >
              <AppIcon name={showRoutineForm ? 'x' : 'plus'} className="h-3.5 w-3.5" />
              <span>{showRoutineForm ? 'Cerrar formulario' : 'Nueva rutina'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Left Column: Form + Templates */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4">
              {showRoutineForm && (
                <form id="new-routine-form" onSubmit={handleAddTask} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                    <AppIcon name="repeat" className="h-4 w-4 text-[var(--blue)]" />
                    <h3 className="text-sm font-bold text-[var(--text)]">Nueva rutina</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <label htmlFor="new-routine-name" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Nombre de la rutina</label>
                      <input
                        id="new-routine-name"
                        type="text"
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        placeholder="Ej: Meditar 10 min, Estirar, Leer 20 pag..."
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
                      />
                    </div>
                    <div>
                      <label htmlFor="new-routine-frequency" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Frecuencia</label>
                      <select
                        id="new-routine-frequency"
                        value={taskFreq}
                        onChange={(e) => setTaskFreq(e.target.value as 'daily' | '2-3x' | 'weekly')}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
                      >
                        <option value="daily">Diaria</option>
                        <option value="2-3x">2-3 veces/semana</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="new-routine-effort" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Esfuerzo</label>
                      <select id="new-routine-effort" value={taskEffort} onChange={(e) => setTaskEffort(e.target.value as EffortLevel)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]">
                        <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="new-routine-time" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Hora opcional</label>
                      <input id="new-routine-time" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]" />
                    </div>
                  </div>

                  <fieldset>
                    <legend className="mb-1.5 text-xs font-semibold text-[var(--text-soft)]">Días específicos (opcional)</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map((d) => {
                        const isSelected = taskDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDaySelection(d, taskDays, setTaskDays)}
                            aria-label={DAY_LABELS[d]}
                            aria-pressed={isSelected}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[var(--blue)] border-[var(--blue)] text-white'
                                : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                            }`}
                          >
                            {DAY_LABELS[d].slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-soft)]" aria-live="polite">{recurrenceHint(taskFreq, taskDays)}</p>
                  </fieldset>
                  <div className="flex justify-end border-t border-[var(--border)] pt-3">
                    <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"><AppIcon name="plus" className="h-3.5 w-3.5" />Agregar rutina</button>
                  </div>
                </form>
              )}

              <section aria-labelledby="weekly-template-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                  <AppIcon name="list" className="h-4 w-4 text-[var(--blue)]" />
                  <h3 id="weekly-template-title" className="text-sm font-bold text-[var(--text)]">Horario semanal habitual</h3>
                </div>
                <p className="text-xs text-[var(--text-soft)]">
                  Tenés <strong>{weeklyBlockCount} {weeklyBlockCount === 1 ? 'actividad guardada' : 'actividades guardadas'}</strong> en tu horario recurrente semanal.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={(event) => openTemplateAction('load', event.currentTarget)} className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-[#4F46E5] focus-visible:outline-2 focus-visible:outline-[#4F46E5] cursor-pointer"><AppIcon name="list" className="h-3.5 w-3.5" />Plantilla sugerida</button>
                  <button type="button" onClick={(event) => openTemplateAction('clear', event.currentTarget)} disabled={weeklyBlockCount === 0} className="flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 cursor-pointer"><AppIcon name="trash" className="h-3.5 w-3.5" />Vaciar horario recurrente</button>
                </div>
              </section>
            </div>

            {/* Right Column: Routines List */}
            <div className="lg:col-span-7 xl:col-span-8">
              <section aria-labelledby="routine-list-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 id="routine-list-title" className="text-sm font-bold text-[var(--text)]">Tus rutinas</h3>
                    <p className="text-xs text-[var(--text-soft)]">Hacé clic en el círculo para registrar el completado del día de hoy.</p>
                  </div>
                  <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)]">
                    {(state.tasksRecurring || []).length} total
                  </span>
                </div>

                {(state.tasksRecurring || []).length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--text-soft)]">Todavía no hay rutinas registradas.</p>
                )}

                {(['daily', '2-3x', 'weekly'] as const).map((freq) => {
                  const items = (state.tasksRecurring || []).filter((t) => t.freq === freq);
                  if (items.length === 0) return null;
                  return (
                    <div key={freq} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[var(--text-soft)]">
                          {FREQ_LABELS[freq]}
                        </h4>
                        <span className="text-xs font-semibold text-[var(--text-faint)]">
                          {items.length}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
                        {items.map((t) => {
                          const completedToday = Boolean(state.taskLog?.[todayIso]?.[t.id]);
                          const scheduledToday = routineScheduledFor(state, t, todayIso);
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors">
                              <div className="flex min-w-0 items-start gap-2.5">
                                {scheduledToday || completedToday ? (
                                  todayCompletionButton(t.id, t.name, completedToday)
                                ) : (
                                  <span aria-hidden="true" className="h-6 w-6 shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className={`break-words font-semibold ${completedToday ? 'text-[var(--text-soft)] line-through' : ''}`}>
                                      {t.name}
                                    </span>
                                    {t.time && <span className="text-xs font-semibold tabular-nums text-[#4F46E5] dark:text-indigo-300">{t.time}</span>}
                                    {t.effort === 'low' && <span className="text-xs text-emerald-700 dark:text-emerald-400">Esfuerzo bajo</span>}
                                    {t.effort === 'high' && <span className="text-xs text-rose-700 dark:text-rose-400">Esfuerzo alto</span>}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[var(--text-soft)]">
                                    {t.days && t.days.length > 0 && <span>{t.days.map((day) => DAY_LABELS[day].slice(0, 3)).join(' · ')}</span>}
                                    {(scheduledToday || completedToday) && (
                                      <span className={completedToday ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>
                                        {completedToday ? 'Completada hoy' : 'Pendiente hoy'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="ml-2 flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingTask(t)}
                                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--text-soft)] hover:text-[#4F46E5] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:hover:text-indigo-300 cursor-pointer"
                                  aria-label={`Editar ${t.name}`}
                                >
                                  <AppIcon name="edit" className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Editar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(t.id)}
                                  className="rounded-lg p-1.5 text-[var(--text-soft)] hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-500 dark:hover:text-red-400 cursor-pointer"
                                  aria-label={`Eliminar ${t.name}`}
                                >
                                  <AppIcon name="trash" className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
