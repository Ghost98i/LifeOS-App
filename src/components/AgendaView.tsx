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
import { SurfaceCard, SectionHeader, ListDivider } from './ui/SurfacePrimitives';
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
  const [wideWeekView, setWideWeekView] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 640px)').matches
      : false
  );
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
        className={`lifeos-task-check agenda-completion-check relative -ml-2 flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer ${completed ? (showMotion ? 'is-completed is-animating' : 'is-completed') : 'is-pending'}`}
      >
        <CompletionCheckMark
          completed={completed}
          animate={showMotion}
          nonce={completionMotion?.nonce || 0}
          size={22}
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
        className="group flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-4"
      >
        {entry.time && (
          <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[#4F46E5] dark:bg-indigo-500/15 dark:text-indigo-300">
            {entry.time}
          </span>
        )}
        {item.date === todayIso && (entry.kind === 'block' || entry.kind === 'routine') ? (
          todayCompletionButton(entry.id, entry.label, completed)
        ) : (
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500"
          >
            <AppIcon
              name={entry.kind === 'task' ? (completed ? 'checkCircle' : 'task') : entry.kind === 'event' ? 'calendarDays' : entry.kind === 'routine' && !entry.time ? 'list' : 'clock'}
              className="h-4 w-4"
            />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span
            className={`break-words [overflow-wrap:anywhere] text-sm font-medium ${
              completed ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text)]'
            }`}
          >
            {entry.label}
          </span>
          <span
            className={`text-xs ${
              entry.kind === 'event'
                ? 'font-semibold text-[#4F46E5] dark:text-indigo-300'
                : 'text-[var(--text-soft)] dark:text-slate-400'
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
        {entry.kind === 'task' && onNavigateToRecord && (
          <button
            type="button"
            aria-label={`Abrir tarea: ${entry.label}`}
            onClick={() => {
              const target = datedTaskDestination(entry.task);
              onNavigateToRecord(target.view, target.options);
            }}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-[#4F46E5] hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:text-indigo-300 dark:hover:bg-indigo-500/15 cursor-pointer"
          >
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        )}
        {entry.kind === 'block' && entry.block.linkedTaskId && (
          <span
            title={
              allUnifiedTasks.find((task) => task.id === entry.block.linkedTaskId)
                ? 'Tarea vinculada'
                : 'Vínculo a tarea que ya no existe'
            }
            className="shrink-0 text-[#4F46E5] dark:text-indigo-300"
          >
            <AppIcon name="link" className="h-4 w-4" />
          </span>
        )}
        {entry.kind === 'block' && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-95 transition-opacity sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100">
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
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:text-slate-400 cursor-pointer"
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBlock(item.day, entry.id)}
              aria-label={`Eliminar ${entry.label}`}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
            >
              <AppIcon name="trash" className="h-4 w-4" />
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
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] opacity-95 transition-opacity hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 dark:text-slate-400 cursor-pointer"
          >
            <AppIcon name="edit" className="h-4 w-4" />
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
      <SurfaceCard
        key={item.date}
        aria-label={`Actividades del ${dayLabel} ${item.date}`}
        className={`flex flex-col overflow-hidden transition-colors ${
          isToday
            ? 'border-[#4F46E5]/60 dark:border-indigo-400/50'
            : ''
        } ${isGrid ? 'min-h-[220px]' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 dark:border-white/[0.06] sm:px-4">
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
              <h3 className="text-sm font-semibold text-[var(--text)] group-hover/title:text-[#4F46E5] dark:group-hover/title:text-indigo-300 transition-colors">
                {dayLabel} <span className="tabular-nums font-bold">{dayDate.getDate()}</span>
              </h3>
              {isToday && (
                <span className="rounded-md bg-[#4F46E5] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  Hoy
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-soft)] truncate">
              {dateFormatted}
            </p>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {count}
            </span>
            <details className="relative">
              <summary
                aria-label={`Agregar para ${dayLabel}`}
                className="flex min-h-10 min-w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200/80 text-[var(--text-soft)] hover:bg-slate-50 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
              >
                <AppIcon name="plus" className="h-4 w-4" />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm dark:border-white/[0.08] dark:bg-[#0D111A]">
                <button
                  type="button"
                  onClick={(e) => {
                    const d = (e.currentTarget.closest('details') as HTMLDetailsElement);
                    d?.removeAttribute('open');
                    openWeeklyBlock(item.day, e.currentTarget);
                  }}
                  className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer"
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
                    className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer"
                  >
                    Evento puntual
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="flex-1 divide-y divide-slate-100 dark:divide-white/[0.06]">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--text-soft)]">
              Sin actividades previstas.
            </p>
          ) : (
            <>
              {timed.length > 0 && (
                <div className="py-1.5">
                  <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Con horario
                  </div>
                  <ListDivider>
                    {timed.map((entry) => renderEntry(entry, item))}
                  </ListDivider>
                </div>
              )}
              {untimedScheduled.length > 0 && (
                <div className="py-1.5">
                  <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Sin horario
                  </div>
                  <ListDivider>
                    {untimedScheduled.map((entry) => renderEntry(entry, item))}
                  </ListDivider>
                </div>
              )}
              {untimedRoutines.length > 0 && (
                <div className="py-1.5">
                  <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Rutinas · {untimedRoutines.length}
                  </div>
                  <ListDivider>
                    {untimedRoutines.map((entry) => renderEntry(entry, item))}
                  </ListDivider>
                </div>
              )}
            </>
          )}
        </div>
      </SurfaceCard>
    );
  };

  const renderFocusedDayView = (item: typeof days[number]) => {
    const { entries, timed, untimedScheduled, untimedRoutines } = getDayEntries(item);
    const count = entries.length;
    const isToday = item.date === todayIso;
    const dayDate = new Date(`${item.date}T12:00:00`);
    const dayLabel = DAY_LABELS[item.day];
    const dayTitle = `${dayLabel} ${dayDate.getDate()} de ${dayDate.toLocaleDateString('es-UY', { month: 'long' }).toLocaleLowerCase('es-UY')}`;

    return (
      <SurfaceCard aria-label={`Detalle de ${dayTitle}`} className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
          <SectionHeader
            icon={<AppIcon name="calendarDays" className="h-4 w-4" />}
            title={dayTitle}
            count={count > 0 ? `${count} ${count === 1 ? 'actividad' : 'actividades'}` : null}
            action={
              isToday ? (
                <span className="rounded-md bg-[#4F46E5] px-2 py-0.5 text-xs font-semibold text-white">
                  Hoy
                </span>
              ) : undefined
            }
          />
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center sm:px-6 sm:py-10">
            <AppIcon name="calendarDays" className="mx-auto h-6 w-6 text-slate-400 dark:text-slate-500" />
            <p className="mt-3 text-sm font-semibold text-[var(--text)]">
              Sin actividades previstas para {dayLabel}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-soft)]">
              {weeklyBlockCount === 0
                ? 'Sumá tu primera actividad semanal o un compromiso puntual para empezar a ordenar la semana.'
                : 'Agregá una actividad semanal o un compromiso puntual para este día.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => openWeeklyBlock(item.day, e.currentTarget)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
              >
                <AppIcon name="plus" className="h-4 w-4" />
                <span>Actividad semanal</span>
              </button>
              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => openNewEvent(item.date)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                >
                  <AppIcon name="plus" className="h-4 w-4" />
                  <span>Compromiso puntual</span>
                </button>
              )}
              {weeklyBlockCount === 0 && (
                <button
                  type="button"
                  onClick={(e) => openTemplateAction('load', e.currentTarget)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#4F46E5] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] dark:text-indigo-300 cursor-pointer"
                >
                  <span>Usar plantilla sugerida</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {timed.length > 0 && (
              <div className="py-2">
                <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
                  <AppIcon name="clock" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Con horario · {timed.length}
                  </h4>
                </div>
                <ListDivider>
                  {timed.map((entry) => renderEntry(entry, item))}
                </ListDivider>
              </div>
            )}

            {untimedScheduled.length > 0 && (
              <div className="py-2">
                <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
                  <AppIcon name="calendar" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Sin horario · {untimedScheduled.length}
                  </h4>
                </div>
                <ListDivider>
                  {untimedScheduled.map((entry) => renderEntry(entry, item))}
                </ListDivider>
              </div>
            )}

            {untimedRoutines.length > 0 ? (
              <div className="py-2">
                <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
                  <AppIcon name="repeat" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Rutinas del día · {untimedRoutines.length}
                  </h4>
                </div>
                <ListDivider>
                  {untimedRoutines.map((entry) => renderEntry(entry, item))}
                </ListDivider>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-[var(--text-soft)] sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <AppIcon name="repeat" className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">Sin rutinas para {dayLabel.toLowerCase()}.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('rutinas')}
                  className="inline-flex min-h-10 shrink-0 items-center px-2 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer"
                >
                  Ver rutinas →
                </button>
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
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
          <SurfaceCard className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-2">
              <AppIcon name="calendarDays" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text)] sm:text-[15px]">
                  Semana del {new Date(`${dates[0]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })} al {new Date(`${dates[6]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-xs text-[var(--text-soft)] tabular-nums">
                  {days.reduce((total, d) => total + d.blocks.length + d.routines.length + d.events.length + d.tasks.length, 0)} actividades en la semana
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, -1))}
                  aria-label="Semana anterior"
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-white hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:hover:bg-white/[0.06] cursor-pointer"
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
                  className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-[var(--text)] hover:bg-white disabled:opacity-40 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, 1))}
                  aria-label="Semana siguiente"
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-white hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <AppIcon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>

              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => openNewEvent(dates[mobileDay])}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-indigo-400 dark:hover:text-indigo-300 sm:flex-none cursor-pointer"
                >
                  <AppIcon name="plus" className="h-4 w-4 text-[#4F46E5] dark:text-indigo-300" />
                  <span>Compromiso puntual</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => openWeeklyBlock(days[mobileDay].day, e.currentTarget)}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] sm:flex-none cursor-pointer"
              >
                <AppIcon name="plus" className="h-4 w-4" />
                <span>Actividad semanal</span>
              </button>

              <div className="hidden items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.03] sm:flex">
                <button
                  type="button"
                  onClick={() => setWeekViewMode('focused')}
                  aria-pressed={weekViewMode === 'focused'}
                  className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                    weekViewMode === 'focused'
                      ? 'bg-white text-[#4F46E5] dark:bg-[#0D111A] dark:text-indigo-300'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Vista diaria
                </button>
                <button
                  type="button"
                  onClick={() => setWeekViewMode('grid')}
                  aria-pressed={weekViewMode === 'grid'}
                  className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                    weekViewMode === 'grid'
                      ? 'bg-white text-[#4F46E5] dark:bg-[#0D111A] dark:text-indigo-300'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Semana (7 días)
                </button>
              </div>
            </div>
          </SurfaceCard>

          {/* Quick 7-Day Navigation Strip (fits 389px without horizontal overflow) */}
          <nav aria-label="Días de la semana" className="grid grid-cols-7 gap-1 sm:gap-2">
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
                  className={`min-h-14 min-w-0 rounded-xl border px-0.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] sm:px-2.5 sm:py-2.5 cursor-pointer ${
                    isSelected
                      ? 'border-[#4F46E5] bg-indigo-50/70 text-[#4F46E5] dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200'
                      : 'border-slate-200/80 bg-white text-[var(--text-soft)] hover:border-slate-300 dark:border-white/[0.07] dark:bg-[#0D111A] dark:hover:border-white/[0.15]'
                  }`}
                >
                  <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                    <span className="block truncate text-[11px] font-semibold sm:text-xs">
                      <span className="sm:hidden">{DAY_LABELS[item.day].slice(0, 2)}</span>
                      <span className="hidden sm:inline">{DAY_LABELS[item.day].slice(0, 3)}</span>
                    </span>
                    {isToday && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4F46E5] dark:bg-indigo-400" title="Hoy" />
                    )}
                  </div>
                  <span className="my-0.5 block text-sm font-bold tabular-nums sm:text-base">
                    {Number(item.date.slice(-2))}
                  </span>
                  <span className="block text-[11px] font-medium tabular-nums sm:text-xs">
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
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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
            className="bg-white dark:bg-[#0D111A] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[90dvh] overflow-y-auto space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <AppIcon name="edit" className="h-4 w-4 text-[#4F46E5] dark:text-indigo-300" />
                <h3 id="edit-agenda-block-title" className="text-sm font-semibold text-[var(--text)]">Editar actividad semanal</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer"
                aria-label="Cerrar modal"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBlock} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Día de la semana
                </label>
                <select
                  value={editingBlock.newDay}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, newDay: e.target.value as DayKey })
                  }
                  className="min-h-11 w-full px-3 py-2 text-sm font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] capitalize focus:border-[#4F46E5] outline-hidden cursor-pointer"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {DAY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">Esfuerzo mental</label>
                <select value={editingBlock.effort} onChange={(e) => setEditingBlock({ ...editingBlock, effort: e.target.value as EffortLevel })} className="min-h-11 w-full px-3 py-2 text-sm font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[#4F46E5] outline-hidden">
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Horario (HH:MM)
                </label>
                <input
                  type="text"
                  value={editingBlock.time}
                  onChange={(e) => setEditingBlock({ ...editingBlock, time: e.target.value })}
                  placeholder="Ej: 09:00"
                  className="min-h-11 w-full px-3 py-2 text-sm tabular-nums font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[#4F46E5] outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Actividad
                </label>
                <input
                  type="text"
                  value={editingBlock.activity}
                  onChange={(e) => setEditingBlock({ ...editingBlock, activity: e.target.value })}
                  placeholder="Ej: Ir al Gimnasio"
                  className="min-h-11 w-full px-3 py-2 text-sm font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[#4F46E5] outline-hidden"
                />
              </div>

              {/* Task Linking Section */}
              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 space-y-2">
                <label className="text-xs font-semibold text-[var(--text-soft)] block">
                  Tarea vinculada
                </label>

                {/* Currently linked task display */}
                {editingBlock.linkedTaskId ? (() => {
                  const linked = allUnifiedTasks.find((t) => t.id === editingBlock.linkedTaskId);
                  return (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-[#4F46E5]/30">
                      <AppIcon name="link" className="h-4 w-4 text-[#4F46E5] dark:text-indigo-300 shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text)] flex-1 truncate">
                        {linked ? linked.text : <span className="text-[var(--text-faint)] italic">Tarea ya no existe</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingBlock({ ...editingBlock, linkedTaskId: undefined, taskSearch: '' })}
                        className="min-h-10 text-xs font-semibold text-rose-600 hover:text-rose-700 px-2.5 rounded-lg hover:bg-rose-500/10 transition cursor-pointer shrink-0 dark:text-rose-400"
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
                  className="min-h-11 w-full px-3 py-2 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[#4F46E5] outline-hidden"
                />
                {filteredTasks.length > 0 && (
                  <div className="space-y-1 max-h-[140px] overflow-y-auto">
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
                          className={`min-h-10 w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-500/15 border border-[#4F46E5]/40 text-[var(--text)]'
                              : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:border-[#4F46E5] hover:text-[var(--text)]'
                          }`}
                        >
                          {isSelected && <AppIcon name="check" className="h-3.5 w-3.5 text-[#4F46E5] dark:text-indigo-300 shrink-0" />}
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="min-h-11 px-4 py-2 text-xs font-semibold rounded-xl bg-transparent text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 px-4 py-2 text-xs font-semibold rounded-xl bg-[#4F46E5] text-white hover:bg-[#4338CA] cursor-pointer"
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
              <h2 className="text-base font-semibold text-[var(--text)] flex items-center gap-2">
                Rutinas recurrentes
                <ContextualHelp label="Rutinas recurrentes">El círculo marca la rutina como completada para ese día. La rutina conserva su frecuencia y vuelve a aparecer cuando corresponda.</ContextualHelp>
                <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                  {(state.tasksRecurring || []).length}
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowRoutineForm((current) => !current)}
              aria-expanded={showRoutineForm}
              aria-controls="new-routine-form"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
            >
              <AppIcon name={showRoutineForm ? 'x' : 'plus'} className="h-4 w-4" />
              <span>{showRoutineForm ? 'Cerrar formulario' : 'Nueva rutina'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* Routines List (shown first on mobile so empty state / routines aren't buried below weekly template) */}
            <div className={`lg:col-span-7 xl:col-span-8 ${showRoutineForm ? 'order-2 lg:order-2' : 'order-1 lg:order-2'}`}>
              <SurfaceCard aria-labelledby="routine-list-title" className="overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
                  <SectionHeader
                    id="routine-list-title"
                    icon={<AppIcon name="repeat" className="h-4 w-4" />}
                    title="Tus rutinas"
                    count={(state.tasksRecurring || []).length > 0 ? `${(state.tasksRecurring || []).length} total` : null}
                  />
                  {(state.tasksRecurring || []).length > 0 && (
                    <p className="mt-1 text-xs text-[var(--text-soft)]">Hacé clic en el círculo para registrar el completado de hoy.</p>
                  )}
                </div>

                {(state.tasksRecurring || []).length === 0 ? (
                  <div className="px-4 py-8 text-center sm:px-6 sm:py-10">
                    <AppIcon name="repeat" className="mx-auto h-6 w-6 text-slate-400 dark:text-slate-500" />
                    <p className="mt-3 text-sm font-semibold text-[var(--text)]">Todavía no hay rutinas registradas.</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-soft)]">
                      Creá hábitos diarios o semanales para llevar seguimiento sin recargar tu agenda.
                    </p>
                    {!showRoutineForm && (
                      <button
                        type="button"
                        onClick={() => setShowRoutineForm(true)}
                        className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                      >
                        <AppIcon name="plus" className="h-4 w-4" />
                        <span>Crear primera rutina</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {(['daily', '2-3x', 'weekly'] as const).map((freq) => {
                      const items = (state.tasksRecurring || []).filter((t) => t.freq === freq);
                      if (items.length === 0) return null;
                      return (
                        <div key={freq} className="py-2">
                          <div className="flex items-center justify-between px-4 py-1.5 sm:px-5">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {FREQ_LABELS[freq]}
                            </h4>
                            <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                              {items.length}
                            </span>
                          </div>
                          <ListDivider>
                            {items.map((t) => {
                              const completedToday = Boolean(state.taskLog?.[todayIso]?.[t.id]);
                              const scheduledToday = routineScheduledFor(state, t, todayIso);
                              return (
                                <div key={t.id} className="flex items-center justify-between gap-2.5 px-4 py-2.5 text-sm text-[var(--text)] transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-5">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    {scheduledToday || completedToday ? (
                                      todayCompletionButton(t.id, t.name, completedToday)
                                    ) : (
                                      <span aria-hidden="true" className="h-6 w-6 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <span className={`break-words font-medium ${completedToday ? 'text-[var(--text-soft)] line-through' : ''}`}>
                                          {t.name}
                                        </span>
                                        {t.time && <span className="text-xs font-semibold tabular-nums text-[#4F46E5] dark:text-indigo-300">{t.time}</span>}
                                        {t.effort === 'low' && <span className="text-xs text-slate-500 dark:text-slate-400">Esfuerzo bajo</span>}
                                        {t.effort === 'high' && <span className="text-xs text-rose-600 dark:text-rose-400">Esfuerzo alto</span>}
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
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditingTask(t)}
                                      className="flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:hover:text-indigo-300 cursor-pointer"
                                      aria-label={`Editar ${t.name}`}
                                    >
                                      <AppIcon name="edit" className="h-4 w-4" />
                                      <span className="hidden sm:inline">Editar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTask(t.id)}
                                      className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
                                      aria-label={`Eliminar ${t.name}`}
                                    >
                                      <AppIcon name="trash" className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </ListDivider>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>
            </div>

            {/* Secondary Column: Form + Weekly Templates */}
            <div className={`lg:col-span-5 xl:col-span-4 space-y-4 ${showRoutineForm ? 'order-1 lg:order-1' : 'order-2 lg:order-1'}`}>
              {showRoutineForm && (
                <SurfaceCard as="div" className="p-4 sm:p-5">
                  <form id="new-routine-form" onSubmit={handleAddTask} className="space-y-4">
                    <SectionHeader
                      icon={<AppIcon name="repeat" className="h-4 w-4" />}
                      title="Nueva rutina"
                      className="border-b border-slate-100 pb-3 dark:border-white/[0.06]"
                    />
                    <div className="space-y-3">
                      <div className="min-w-0">
                        <label htmlFor="new-routine-name" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Nombre de la rutina</label>
                        <input
                          id="new-routine-name"
                          type="text"
                          value={taskName}
                          onChange={(e) => setTaskName(e.target.value)}
                          placeholder="Ej: Meditar 10 min, Estirar, Leer 20 pag..."
                          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
                        />
                      </div>
                      <div>
                        <label htmlFor="new-routine-frequency" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Frecuencia</label>
                        <select
                          id="new-routine-frequency"
                          value={taskFreq}
                          onChange={(e) => setTaskFreq(e.target.value as 'daily' | '2-3x' | 'weekly')}
                          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]"
                        >
                          <option value="daily">Diaria</option>
                          <option value="2-3x">2-3 veces/semana</option>
                          <option value="weekly">Semanal</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="new-routine-effort" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Esfuerzo</label>
                        <select id="new-routine-effort" value={taskEffort} onChange={(e) => setTaskEffort(e.target.value as EffortLevel)} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]">
                          <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="new-routine-time" className="mb-1 block text-xs font-semibold text-[var(--text-soft)]">Hora opcional</label>
                        <input id="new-routine-time" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[#4F46E5]" />
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
                              className={`min-h-10 min-w-10 px-2.5 py-1 text-xs font-semibold rounded-xl border cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#4F46E5] border-[#4F46E5] text-white'
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
                    <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                      <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"><AppIcon name="plus" className="h-4 w-4" />Agregar rutina</button>
                    </div>
                  </form>
                </SurfaceCard>
              )}

              <SurfaceCard aria-labelledby="weekly-template-title" className="p-4 sm:p-5 space-y-3">
                <SectionHeader
                  id="weekly-template-title"
                  icon={<AppIcon name="list" className="h-4 w-4" />}
                  title="Horario semanal habitual"
                  className="border-b border-slate-100 pb-3 dark:border-white/[0.06]"
                />
                <p className="text-xs text-[var(--text-soft)]">
                  Tenés <strong>{weeklyBlockCount} {weeklyBlockCount === 1 ? 'actividad guardada' : 'actividades guardadas'}</strong> en tu horario recurrente semanal.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={(event) => openTemplateAction('load', event.currentTarget)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-[#4F46E5] focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent cursor-pointer"><AppIcon name="list" className="h-4 w-4" />Plantilla sugerida</button>
                  <button type="button" onClick={(event) => openTemplateAction('clear', event.currentTarget)} disabled={weeklyBlockCount === 0} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400 cursor-pointer"><AppIcon name="trash" className="h-4 w-4" />Vaciar horario recurrente</button>
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
