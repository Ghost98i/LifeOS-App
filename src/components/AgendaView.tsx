import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
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
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { CompletionCheck } from './ui/CompletionCheck';
import { PrivateFinancialText } from './PrivacyAmount';
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
  initialSection?: 'semana' | 'rutinas';
  initialWeekViewMode?: 'focused' | 'grid';
  initialWideWeekView?: boolean;
  initialEventDraft?: { id?: string; name: string; date: string; time: string } | null;
  initialWeeklyDraft?: { activity: string; day: DayKey; time: string } | null;
}

const AGENDA_TAB_FOCUS =
  'agenda-clean-tab outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

const AGENDA_INPUT_CLASS =
  'agenda-clean-input celestian-clean-field mt-1.5 min-h-11 w-full rounded-xl border border-slate-200/90 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-400 outline-none focus:outline-none focus-visible:outline-none dark:border-white/[0.1] dark:placeholder:text-slate-500';

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
  initialSection = 'semana',
  initialWeekViewMode = 'focused',
  initialWideWeekView,
  initialEventDraft = null,
  initialWeeklyDraft = null,
}) => {
  const [taskName, setTaskName] = useState('');
  const [taskFreq, setTaskFreq] = useState<'daily' | '2-3x' | 'weekly'>('daily');
  const [taskDays, setTaskDays] = useState<DayKey[]>([]);
  const [taskEffort, setTaskEffort] = useState<EffortLevel>('medium');
  const [taskTime, setTaskTime] = useState('');
  const [weekReference, setWeekReference] = useState(() => new Date());
  const [mobileDay, setMobileDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [weekViewMode, setWeekViewMode] = useState<'grid' | 'focused'>(initialWeekViewMode);
  const [wideWeekView, setWideWeekView] = useState(() =>
    typeof initialWideWeekView === 'boolean'
      ? initialWideWeekView
      : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 640px)').matches
      : false
  );
  const [activeSection, setActiveSection] = useState<'semana' | 'rutinas'>(initialSection);
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [templateAction, setTemplateAction] = useState<'load' | 'clear' | null>(null);
  const [eventDraft, setEventDraft] = useState<{ id?: string; name: string; date: string; time: string } | null>(initialEventDraft);
  const [eventError, setEventError] = useState('');
  const [weeklyDraft, setWeeklyDraft] = useState<{ activity: string; day: DayKey; time: string } | null>(initialWeeklyDraft);
  const [weeklyErrors, setWeeklyErrors] = useState<ReturnType<typeof validateWeeklyBlock>>({});
  const weeklySubmitting = useRef(false);
  const weeklyTrigger = useRef<HTMLElement | null>(null);
  const templateTrigger = useRef<HTMLButtonElement | null>(null);
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
    if (!calendarEnabled) return;
    const existing = (state.calendarEvents || []).find((item) => item.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      draft.calendarEvents = draft.calendarEvents.filter((item) => item.id !== id);
    });
    if (!saved) return;
    setEventDraft(null);
    showToast('Compromiso eliminado.', 'info', snapshot ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (onUpdateState((draft) => {
          if (!draft.calendarEvents.some((item) => item.id === snapshot.id)) {
            draft.calendarEvents.push(snapshot);
          }
        })) {
          showToast('Compromiso restaurado.', 'success');
        }
      },
    } : undefined);
  };

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
    const existing = (state.agenda?.[day] || []).find((b) => b.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[day]) draft.agenda[day] = [];
      draft.agenda[day] = draft.agenda[day].filter((b) => b.id !== id);
    });
    if (!saved || !snapshot) return;
    showToast('Bloque semanal eliminado.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (onUpdateState((draft) => {
          if (!draft.agenda) draft.agenda = {} as any;
          if (!draft.agenda[day]) draft.agenda[day] = [];
          if (!draft.agenda[day].some((b) => b.id === snapshot.id)) {
            draft.agenda[day].push(snapshot);
          }
        })) {
          showToast('Bloque semanal restaurado.', 'success');
        }
      },
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
    const existing = (state.tasksRecurring || []).find((t) => t.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      draft.tasksRecurring = (draft.tasksRecurring || []).filter((t) => t.id !== id);
    });
    if (!saved || !snapshot) return;
    showToast('Rutina eliminada.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (onUpdateState((draft) => {
          if (!draft.tasksRecurring) draft.tasksRecurring = [];
          if (!draft.tasksRecurring.some((t) => t.id === snapshot.id)) {
            draft.tasksRecurring.push(snapshot);
          }
        })) {
          showToast('Rutina restaurada.', 'success');
        }
      },
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
    }
  };

  const todayCompletionButton = (taskId: string, taskName: string, completed: boolean) => (
    <button
      type="button"
      onClick={() => handleToggleTodayTask(taskId)}
      aria-label={completed ? `Reabrir ${taskName}` : `Completar ${taskName}`}
      aria-pressed={completed}
      title={completed ? 'Reabrir para hoy' : 'Completar para hoy'}
      className={`lifeos-task-check agenda-completion-check group relative -ml-2 flex min-h-10 min-w-10 max-sm:min-h-11 max-sm:min-w-11 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer ${completed ? 'is-completed' : 'is-pending'}`}
    >
      <CompletionCheck checked={completed} size="md" />
    </button>
  );

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

  const renderEntryChip = (entry: ReturnType<typeof getDayEntries>['entries'][number]) => {
    if (entry.kind === 'event') {
      if (entry.event.type === 'job_deadline') {
        const isFollowup = Boolean(entry.event.isJobFollowup);
        return (
          <span
            className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
              isFollowup
                ? 'border-amber-500/25 bg-amber-50/90 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-300'
                : 'border-indigo-500/20 bg-indigo-50/80 text-[#4F46E5] dark:border-indigo-400/25 dark:bg-indigo-500/15 dark:text-[#818CF8]'
            }`}
          >
            {isFollowup ? 'Trabajo · seguimiento' : 'Trabajo'}
          </span>
        );
      }
      const eventLabel =
        entry.event.type === 'examen'
          ? 'Examen'
          : state.calendarEvents.some((event) => event.id === entry.id && event.recurring)
          ? 'Anual'
          : 'Puntual';
      return (
        <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-500/20 bg-indigo-50/80 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#4F46E5] dark:border-indigo-400/25 dark:bg-indigo-500/15 dark:text-[#818CF8]">
          {eventLabel}
        </span>
      );
    }
    if (entry.kind === 'task') {
      return (
        <span className="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
          {entry.task.source === 'project_task' ? 'Proyecto' : 'Tarea'}
          {entry.task.isDeadline ? ' · vence' : ''}
        </span>
      );
    }
    return null;
  };

  const renderEntry = (entry: ReturnType<typeof getDayEntries>['entries'][number], item: typeof days[number], compact = false) => {
    const canEditEvent = entry.kind === 'event' && calendarEnabled && state.calendarEvents.some((event) => event.id === entry.id && !event.recurring);
    const completed = entry.kind === 'task' ? entry.task.done : item.date === todayIso && entry.kind !== 'event' && Boolean(state.taskLog?.[todayIso]?.[entry.id]);
    const domId = entry.kind === 'task' ? agendaTaskFocusId(entry.task, item.date) : entry.kind === 'event' ? `agenda-event-${entry.id}` : `agenda-${entry.key}`;
    const chip = renderEntryChip(entry);

    if (compact) {
      return (
        <div
          key={entry.key}
          id={domId}
          data-agenda-grid-entry="true"
          className="group flex min-w-0 flex-col gap-1 px-2.5 py-2 transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
        >
          <div className="flex min-w-0 items-center justify-between gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {item.date === todayIso && (entry.kind === 'block' || entry.kind === 'routine') && (
                <div className="-my-1.5">
                  {todayCompletionButton(entry.id, entry.label, completed)}
                </div>
              )}
              {entry.time && (
                <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-[#4F46E5] dark:bg-indigo-500/15 dark:text-[#818CF8]">
                  {entry.time}
                </span>
              )}
              {chip}
              {entry.kind === 'block' && entry.block.linkedTaskId && (
                <span
                  title={
                    allUnifiedTasks.find((task) => task.id === entry.block.linkedTaskId)
                      ? 'Tarea vinculada'
                      : 'Vínculo a tarea que ya no existe'
                  }
                  className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]"
                >
                  <AppIcon name="link" className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {entry.kind === 'task' && onNavigateToRecord && (
                <button
                  type="button"
                  aria-label={`Abrir tarea: ${entry.label}`}
                  title={`Abrir tarea: ${entry.label}`}
                  onClick={() => {
                    const target = datedTaskDestination(entry.task);
                    onNavigateToRecord(target.view, target.options);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[#4F46E5] hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-[#818CF8] dark:hover:bg-indigo-500/15 cursor-pointer"
                >
                  <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
                </button>
              )}
              {entry.kind === 'event' && entry.event.type === 'job_deadline' && entry.event.jobApplicationId && onNavigateToRecord && (
                <button
                  type="button"
                  aria-label={`Abrir en Trabajo: ${entry.label}`}
                  title="Abrir en Trabajo"
                  onClick={() => {
                    onNavigateToRecord('trabajo', { focusId: `job-app-${entry.event.jobApplicationId}` });
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[#4F46E5] hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-[#818CF8] dark:hover:bg-indigo-500/15 cursor-pointer"
                >
                  <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
                </button>
              )}
              {entry.kind === 'block' && (
                <>
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
                    title={`Editar ${entry.label}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(item.day, entry.id)}
                    aria-label={`Eliminar ${entry.label}`}
                    title={`Eliminar ${entry.label}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-soft)] hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </>
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
                  title={`Editar ${entry.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <span
            title={entry.label}
            className={`block line-clamp-2 text-[13px] font-medium leading-snug [overflow-wrap:break-word] ${
              completed ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text)]'
            }`}
          >
            <PrivateFinancialText>{entry.label}</PrivateFinancialText>
          </span>
        </div>
      );
    }

    return (
      <div
        key={entry.key}
        id={domId}
        className="group flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-4"
      >
        {entry.time && (
          <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-[#4F46E5] dark:bg-indigo-500/15 dark:text-[#818CF8]">
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
              name={
                entry.kind === 'task'
                  ? (completed ? 'checkCircle' : 'task')
                  : entry.kind === 'event'
                  ? (entry.event.type === 'job_deadline' ? 'briefcase' : 'calendarDays')
                  : entry.kind === 'routine' && !entry.time
                  ? 'list'
                  : 'clock'
              }
              className={`h-4 w-4 ${
                entry.kind === 'event' && entry.event.type === 'job_deadline'
                  ? (entry.event.isJobFollowup ? 'text-amber-600 dark:text-amber-400' : 'text-[#4F46E5] dark:text-[#818CF8]')
                  : ''
              }`}
            />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-sm font-medium ${
              completed ? 'text-[var(--text-soft)] line-through' : 'text-[var(--text)]'
            }`}
          >
            <PrivateFinancialText>{entry.label}</PrivateFinancialText>
          </span>
          {chip}
        </div>
        {entry.kind === 'task' && onNavigateToRecord && (
          <button
            type="button"
            aria-label={`Abrir tarea: ${entry.label}`}
            title={`Abrir tarea: ${entry.label}`}
            onClick={() => {
              const target = datedTaskDestination(entry.task);
              onNavigateToRecord(target.view, target.options);
            }}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-[#4F46E5] hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-[#818CF8] dark:hover:bg-indigo-500/15 cursor-pointer"
          >
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        )}
        {entry.kind === 'event' && entry.event.type === 'job_deadline' && entry.event.jobApplicationId && onNavigateToRecord && (
          <button
            type="button"
            aria-label={`Abrir en Trabajo: ${entry.label}`}
            title="Abrir en Trabajo"
            onClick={() => {
              onNavigateToRecord('trabajo', { focusId: `job-app-${entry.event.jobApplicationId}` });
            }}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-[#4F46E5] hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-[#818CF8] dark:hover:bg-indigo-500/15 cursor-pointer"
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
            className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]"
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
              title={`Editar ${entry.label}`}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBlock(item.day, entry.id)}
              aria-label={`Eliminar ${entry.label}`}
              title={`Eliminar ${entry.label}`}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
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
            title={`Editar ${entry.label}`}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] opacity-95 transition-opacity hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
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
    const dateFormatted = dayDate.toLocaleDateString(
      'es-UY',
      isGrid ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long' }
    );
    const dayIndex = days.indexOf(item);

    return (
      <SurfaceCard
        key={item.date}
        aria-label={`Actividades del ${dayLabel} ${item.date}`}
        className={`flex flex-col overflow-hidden transition-colors ${
          isToday
            ? 'border-[#4F46E5]/60 dark:border-[#818CF8]/50'
            : ''
        } ${isGrid ? 'min-h-[220px]' : ''}`}
      >
        <div className={`flex items-center justify-between gap-1.5 border-b border-slate-100 dark:border-white/[0.06] ${isGrid ? 'px-2.5 py-2.5' : 'px-3 py-3 sm:px-4'}`}>
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
              <h3 className={`${isGrid ? 'text-[13px]' : 'text-sm'} font-semibold text-[var(--text)] group-hover/title:text-[#4F46E5] dark:group-hover/title:text-[#818CF8] transition-colors`}>
                {isGrid ? dayLabel.slice(0, 3) : dayLabel}{' '}
                <span className="tabular-nums font-bold">{dayDate.getDate()}</span>
              </h3>
              {isToday && (
                <span className="rounded-md bg-[#4F46E5] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  Hoy
                </span>
              )}
            </div>
            <p className={`${isGrid ? 'text-[11px]' : 'text-xs'} text-[var(--text-soft)] truncate`}>
              {dateFormatted}
            </p>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {count}
            </span>
            <details className="relative">
              <summary
                aria-label={`Agregar para ${dayLabel}`}
                className={`flex cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200/80 text-[var(--text-soft)] hover:bg-slate-50 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:border-white/[0.08] dark:hover:bg-white/[0.04] ${
                  isGrid ? 'h-8 w-8' : 'min-h-10 min-w-10 rounded-xl'
                }`}
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
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
                    Compromiso puntual
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="flex-1 divide-y divide-slate-100 dark:divide-white/[0.06]">
          {entries.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[12px] text-[var(--text-soft)]">
              Sin actividades.
            </p>
          ) : (
            <>
              {timed.length > 0 && (
                <div className="py-1">
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Con horario
                  </div>
                  <ListDivider>
                    {timed.map((entry) => renderEntry(entry, item, isGrid))}
                  </ListDivider>
                </div>
              )}
              {untimedScheduled.length > 0 && (
                <div className="py-1">
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Sin horario
                  </div>
                  <ListDivider>
                    {untimedScheduled.map((entry) => renderEntry(entry, item, isGrid))}
                  </ListDivider>
                </div>
              )}
              {untimedRoutines.length > 0 && (
                <div className="py-1">
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Rutinas · {untimedRoutines.length}
                  </div>
                  <ListDivider>
                    {untimedRoutines.map((entry) => renderEntry(entry, item, isGrid))}
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
                className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}
              >
                <AppIcon name="plus" className="h-4 w-4" />
                <span>Actividad semanal</span>
              </button>
              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => openNewEvent(item.date)}
                  className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-indigo-400 dark:hover:text-indigo-300 cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  <AppIcon name="plus" className="h-4 w-4" />
                  <span>Compromiso puntual</span>
                </button>
              )}
              {weeklyBlockCount === 0 && (
                <button
                  type="button"
                  onClick={(e) => openTemplateAction('load', e.currentTarget)}
                  className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer ${AGENDA_TAB_FOCUS}`}
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Con horario · {timed.length}
                  </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Sin horario · {untimedScheduled.length}
                  </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Rutinas del día · {untimedRoutines.length}
                  </h3>
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
                  className={`inline-flex min-h-11 sm:min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  <span>Ver rutinas</span>
                  <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
    );
  };

  const isGridWeekView = weekViewMode === 'grid' && wideWeekView;

  return (
    <div className="product-refinement space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Agenda y rutinas"
          badge={
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)]">
              {weeklyBlockCount} {weeklyBlockCount === 1 ? 'bloque fijo' : 'bloques fijos'}
            </span>
          }
        />

        <div
          role="tablist"
          aria-label="Secciones de Agenda"
          className="grid w-full grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 sm:inline-flex sm:w-auto"
        >
          {(['semana', 'rutinas'] as const).map((section) => {
            const isActive = activeSection === section;
            return (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSection(section)}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-center text-xs font-bold transition cursor-pointer sm:min-h-9 ${AGENDA_TAB_FOCUS} ${
                  isActive
                    ? 'bg-[#4F46E5] text-white shadow-xs'
                    : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                <AppIcon name={section === 'semana' ? 'calendarDays' : 'repeat'} className="h-4 w-4 shrink-0" />
                <span>{section === 'semana' ? 'Semana' : 'Rutinas'}</span>
                {section === 'rutinas' && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums leading-none ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                    }`}
                  >
                    {(state.tasksRecurring || []).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === 'semana' && (
        <section className="space-y-4">
          {/* Week Navigation Toolbar — 2 clean breathable rows on desktop, compact on 389px */}
          <SurfaceCard className="space-y-3 p-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <AppIcon name="calendarDays" className="h-4 w-4 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--text)] sm:text-[15px]">
                    Semana del {new Date(`${dates[0]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })} al {new Date(`${dates[6]}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h2>
                  <p className="text-xs text-[var(--text-soft)] tabular-nums">
                    {days.reduce((total, d) => total + d.blocks.length + d.routines.length + d.events.length + d.tasks.length, 0)} actividades en la semana
                  </p>
                </div>
              </div>

              <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.03] sm:inline-flex sm:w-auto">
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, -1))}
                  aria-label="Semana anterior"
                  title="Semana anterior"
                  className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-white hover:text-[var(--text)] dark:hover:bg-white/[0.06] sm:min-h-9 sm:min-w-9 cursor-pointer ${AGENDA_TAB_FOCUS}`}
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
                  className={`min-h-10 rounded-lg px-3 text-xs font-semibold text-[var(--text)] hover:bg-white disabled:opacity-40 dark:hover:bg-white/[0.06] sm:min-h-9 cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => setWeekReference(shiftWeek(weekReference, 1))}
                  aria-label="Semana siguiente"
                  title="Semana siguiente"
                  className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-white hover:text-[var(--text)] dark:hover:bg-white/[0.06] sm:min-h-9 sm:min-w-9 cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  <AppIcon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
              <div className={calendarEnabled ? 'grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center' : 'flex items-center'}>
                <button
                  type="button"
                  onClick={(e) => openWeeklyBlock(days[mobileDay].day, e.currentTarget)}
                  className={`inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-2.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4338CA] sm:px-3.5 sm:text-xs cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  <span className="truncate">Actividad semanal</span>
                </button>

                {calendarEnabled && (
                  <button
                    type="button"
                    onClick={() => openNewEvent(dates[mobileDay])}
                    className={`inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 text-[12px] font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-[#818CF8] dark:hover:text-[#818CF8] sm:px-3.5 sm:text-xs cursor-pointer ${AGENDA_TAB_FOCUS}`}
                  >
                    <AppIcon name="plus" className="h-3.5 w-3.5 shrink-0 text-[#4F46E5] dark:text-[#818CF8] sm:h-4 sm:w-4" />
                    <span className="truncate">Compromiso puntual</span>
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Modo de vista semanal"
                className="hidden items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.03] sm:inline-flex"
              >
                <button
                  type="button"
                  onClick={() => setWeekViewMode('focused')}
                  aria-pressed={weekViewMode === 'focused'}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer ${AGENDA_TAB_FOCUS} ${
                    weekViewMode === 'focused'
                      ? 'bg-white text-[#4F46E5] shadow-xs dark:bg-[#151C2C] dark:text-[#818CF8]'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Vista diaria
                </button>
                <button
                  type="button"
                  onClick={() => setWeekViewMode('grid')}
                  aria-pressed={weekViewMode === 'grid'}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer ${AGENDA_TAB_FOCUS} ${
                    weekViewMode === 'grid'
                      ? 'bg-white text-[#4F46E5] shadow-xs dark:bg-[#151C2C] dark:text-[#818CF8]'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Semana (7 días)
                </button>
              </div>
            </div>
          </SurfaceCard>

          {/* Quick 7-Day Navigation Strip — shown only in Vista diaria & mobile (hidden in 7-day grid to avoid duplicating days) */}
          {!isGridWeekView && (
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
                    title={`${DAY_LABELS[item.day]} ${new Date(`${item.date}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })}: ${count} ${count === 1 ? 'actividad' : 'actividades'}`}
                    className={`min-h-14 min-w-0 rounded-xl border px-0.5 py-2 text-center transition-colors sm:px-2.5 sm:py-2.5 cursor-pointer ${AGENDA_TAB_FOCUS} ${
                      isSelected
                        ? 'border-[#4F46E5] bg-indigo-50/70 text-[#4F46E5] dark:border-[#818CF8] dark:bg-indigo-500/15 dark:text-indigo-200'
                        : 'border-slate-200/80 bg-white text-[var(--text-soft)] hover:border-slate-300 dark:border-white/[0.07] dark:bg-[#0D111A] dark:hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                      <span className="block truncate text-[11px] font-semibold sm:text-xs">
                        <span className="sm:hidden">{DAY_LABELS[item.day].slice(0, 2)}</span>
                        <span className="hidden sm:inline">{DAY_LABELS[item.day].slice(0, 3)}</span>
                      </span>
                      {isToday && (
                        <span
                          data-today-dot="true"
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4F46E5] dark:bg-[#818CF8]"
                          title="Hoy"
                        />
                      )}
                    </div>
                    <span className="my-0.5 block text-sm font-bold tabular-nums sm:text-base">
                      {Number(item.date.slice(-2))}
                    </span>
                    <span className="block text-[11px] font-medium tabular-nums sm:text-xs">
                      <span aria-hidden={count === 0 ? 'true' : undefined}>{count === 0 ? '—' : count}</span>
                      {count === 0 ? (
                        <span className="sr-only">0 actividades</span>
                      ) : (
                        <>
                          {' '}
                          <span className="hidden lg:inline">{count === 1 ? 'actividad' : 'actividades'}</span>
                          <span className="sr-only lg:hidden">{count === 1 ? 'actividad' : 'actividades'}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Day Display: Focused Day (Default & Mobile) vs 7-Day Grid (Desktop Alternative) */}
          {isGridWeekView ? (
            <div data-week-grid="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 items-start">
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
        <div className="celestian-modal-backdrop fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4" onClick={closeWeeklyBlock}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-weekly-title"
            aria-describedby="agenda-weekly-hint"
            className="celestian-modal-panel max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl dark:border-white/[0.08] dark:bg-[#0D111A]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
              <div>
                <h2 id="agenda-weekly-title" className="text-base font-bold text-[var(--text)]">Nueva actividad semanal</h2>
                <p id="agenda-weekly-hint" className="mt-0.5 text-xs text-[var(--text-soft)]">Se repetirá todas las semanas en el día seleccionado.</p>
              </div>
              <button
                type="button"
                onClick={closeWeeklyBlock}
                aria-label="Cerrar modal"
                title="Cerrar"
                className={`flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-slate-100 hover:text-[var(--text)] dark:hover:bg-white/[0.06] cursor-pointer ${AGENDA_TAB_FOCUS}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveWeeklyBlock} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="agenda-weekly-activity" className="block text-xs font-semibold text-[var(--text)]">Nombre de actividad</label>
                <input
                  id="agenda-weekly-activity"
                  autoFocus
                  type="text"
                  maxLength={200}
                  placeholder="Ej.: Gimnasio, inglés, planificación..."
                  value={weeklyDraft.activity}
                  onChange={(event) => {
                    setWeeklyDraft({ ...weeklyDraft, activity: event.target.value });
                    setWeeklyErrors((current) => ({ ...current, activity: undefined }));
                  }}
                  aria-invalid={Boolean(weeklyErrors.activity)}
                  aria-describedby={weeklyErrors.activity ? 'agenda-weekly-activity-error' : undefined}
                  className={AGENDA_INPUT_CLASS}
                />
                {weeklyErrors.activity && <p id="agenda-weekly-activity-error" role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{weeklyErrors.activity}</p>}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    className={AGENDA_INPUT_CLASS}
                  >
                    {DAYS.map((day) => <option key={day} value={day}>{DAY_LABELS[day]}</option>)}
                  </select>
                  {weeklyErrors.day && <p id="agenda-weekly-day-error" role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{weeklyErrors.day}</p>}
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
                    className={AGENDA_INPUT_CLASS}
                  />
                  {weeklyErrors.time && <p id="agenda-weekly-time-error" role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{weeklyErrors.time}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                <button type="button" onClick={closeWeeklyBlock} className={`min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 px-4 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer ${AGENDA_TAB_FOCUS}`}>Cancelar</button>
                <button type="submit" className={`min-h-11 sm:min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {eventDraft && (
        <div className="celestian-modal-backdrop fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4" onClick={() => setEventDraft(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-event-title"
            className="celestian-modal-panel max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl dark:border-white/[0.08] dark:bg-[#0D111A]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
              <h2 id="agenda-event-title" className="text-base font-bold text-[var(--text)]">
                {eventDraft.id ? 'Editar compromiso' : 'Nuevo compromiso puntual'}
              </h2>
              <button
                type="button"
                onClick={() => setEventDraft(null)}
                aria-label="Cerrar modal"
                title="Cerrar"
                className={`flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-slate-100 hover:text-[var(--text)] dark:hover:bg-white/[0.06] cursor-pointer ${AGENDA_TAB_FOCUS}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveEvent} className="mt-4 space-y-4">
              <div>
                <label htmlFor="agenda-event-name" className="block text-xs font-semibold text-[var(--text)]">
                  Título
                </label>
                <input
                  id="agenda-event-name"
                  autoFocus
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Ej: Dentista, entrega, reunión..."
                  value={eventDraft.name}
                  onChange={(event) => setEventDraft({ ...eventDraft, name: event.target.value })}
                  className={AGENDA_INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="agenda-event-date" className="block text-xs font-semibold text-[var(--text)]">
                    Fecha
                  </label>
                  <input
                    id="agenda-event-date"
                    type="date"
                    required
                    value={eventDraft.date}
                    onChange={(event) => setEventDraft({ ...eventDraft, date: event.target.value })}
                    className={AGENDA_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="agenda-event-time" className="block text-xs font-semibold text-[var(--text)]">
                    Hora opcional
                  </label>
                  <input
                    id="agenda-event-time"
                    type="time"
                    value={eventDraft.time}
                    onChange={(event) => setEventDraft({ ...eventDraft, time: event.target.value })}
                    className={AGENDA_INPUT_CLASS}
                  />
                </div>
              </div>
              {eventError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{eventError}</p>}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                {eventDraft.id && (
                  <button
                    type="button"
                    onClick={() => deleteEvent(eventDraft.id!)}
                    className={`mr-auto min-h-11 sm:min-h-10 rounded-xl px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 cursor-pointer ${AGENDA_TAB_FOCUS}`}
                  >
                    Eliminar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEventDraft(null)}
                  className={`min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 px-4 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-11 sm:min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {templateAction && (
        <div className="celestian-modal-backdrop fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4" onClick={closeTemplateAction}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-template-title"
            className="celestian-modal-panel w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 shadow-xl dark:border-white/[0.08] dark:bg-[#0D111A]"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
              <h2 id="agenda-template-title" className="text-base font-bold text-[var(--text)]">
                {templateAction === 'load' ? 'Aplicar plantilla sugerida' : 'Vaciar horario recurrente'}
              </h2>
              <button
                type="button"
                onClick={closeTemplateAction}
                aria-label="Cerrar modal"
                title="Cerrar"
                className={`flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-slate-100 hover:text-[var(--text)] dark:hover:bg-white/[0.06] cursor-pointer ${AGENDA_TAB_FOCUS}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-soft)]">
              {templateAction === 'load'
                ? `La plantilla contiene ${suggestedBlockCount} actividades y reemplazará las ${weeklyBlockCount} actividades de tu horario semanal.`
                : `Se eliminarán las ${weeklyBlockCount} actividades de tu horario semanal.`}
              {' '}Tus rutinas y compromisos puntuales se conservan.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" autoFocus onClick={closeTemplateAction} className={`min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 px-4 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer ${AGENDA_TAB_FOCUS}`}>Cancelar</button>
              <button
                type="button"
                onClick={confirmTemplateAction}
                className={`min-h-11 sm:min-h-10 rounded-xl px-4 text-xs font-semibold text-white transition-colors cursor-pointer ${AGENDA_TAB_FOCUS} ${
                  templateAction === 'clear'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#4F46E5] hover:bg-[#4338CA]'
                }`}
              >
                {templateAction === 'load' ? 'Aplicar plantilla' : 'Vaciar horario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="celestian-modal-backdrop fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4" onClick={() => setEditingTask(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agenda-edit-routine-title"
            className="celestian-modal-panel w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl dark:border-white/[0.08] dark:bg-[#0D111A]"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
              <h2 id="agenda-edit-routine-title" className="text-base font-bold text-[var(--text)]">Editar rutina</h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                aria-label="Cerrar modal"
                title="Cerrar"
                className={`flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-slate-100 hover:text-[var(--text)] dark:hover:bg-white/[0.06] cursor-pointer ${AGENDA_TAB_FOCUS}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSaveEditedTask} className="mt-4 space-y-4">
              <div>
                <label htmlFor="agenda-edit-routine-name" className="block text-xs font-semibold text-[var(--text)]">Nombre</label>
                <input id="agenda-edit-routine-name" autoFocus required maxLength={200} value={editingTask.name} onChange={event => setEditingTask({ ...editingTask, name: event.target.value })} className={AGENDA_INPUT_CLASS} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="agenda-edit-routine-freq" className="block text-xs font-semibold text-[var(--text)]">Frecuencia</label>
                  <select id="agenda-edit-routine-freq" value={editingTask.freq} onChange={event => setEditingTask({ ...editingTask, freq: event.target.value as TaskRecurring['freq'] })} className={AGENDA_INPUT_CLASS}>
                    <option value="daily">Diaria</option><option value="2-3x">2–3 veces por semana</option><option value="weekly">Semanal</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="agenda-edit-routine-time" className="block text-xs font-semibold text-[var(--text)]">Hora opcional</label>
                  <input id="agenda-edit-routine-time" type="time" value={editingTask.time || ''} onChange={event => setEditingTask({ ...editingTask, time: event.target.value || undefined })} className={AGENDA_INPUT_CLASS} />
                </div>
              </div>
              <fieldset>
                <legend className="text-xs font-semibold text-[var(--text)]">Días de la semana</legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      aria-label={DAY_LABELS[day]}
                      aria-pressed={editingTask.days?.includes(day) || false}
                      onClick={() => toggleDaySelection(day, editingTask.days || [], days => setEditingTask({ ...editingTask, days: days.length ? days : undefined }))}
                      className={`min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 rounded-xl border px-2.5 text-xs font-semibold transition-colors cursor-pointer ${AGENDA_TAB_FOCUS} ${
                        editingTask.days?.includes(day)
                          ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                          : 'border-slate-200/80 text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08]'
                      }`}
                    >
                      {DAY_LABELS[day].slice(0, 3)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--text-soft)]">{recurrenceHint(editingTask.freq, editingTask.days)}</p>
              </fieldset>
              <div>
                <label htmlFor="agenda-edit-routine-effort" className="block text-xs font-semibold text-[var(--text)]">Esfuerzo mental</label>
                <select id="agenda-edit-routine-effort" value={editingTask.effort || 'medium'} onChange={event => setEditingTask({ ...editingTask, effort: event.target.value as EffortLevel })} className={AGENDA_INPUT_CLASS}>
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                <button type="button" onClick={() => setEditingTask(null)} className={`min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 px-4 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer ${AGENDA_TAB_FOCUS}`}>Cancelar</button>
                <button type="submit" className={`min-h-11 sm:min-h-10 rounded-xl bg-[#4F46E5] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}>Guardar rutina</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Drawer for editing agenda block */}
      {editingBlock && (
        <div
          className="celestian-modal-backdrop fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setEditingBlock(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-agenda-block-title"
            className="celestian-modal-panel w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 shadow-xl dark:border-white/[0.08] dark:bg-[#0D111A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                <h3 id="edit-agenda-block-title" className="text-sm font-semibold text-[var(--text)]">Editar actividad semanal</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className={`flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-slate-100 hover:text-[var(--text)] dark:hover:bg-white/[0.06] cursor-pointer ${AGENDA_TAB_FOCUS}`}
                aria-label="Cerrar modal"
                title="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBlock} className="space-y-3">
              <div>
                <label htmlFor="agenda-edit-block-activity" className="text-xs font-semibold text-[var(--text-soft)] block">
                  Actividad
                </label>
                <input
                  id="agenda-edit-block-activity"
                  type="text"
                  value={editingBlock.activity}
                  onChange={(e) => setEditingBlock({ ...editingBlock, activity: e.target.value })}
                  placeholder="Ej.: Ir al gimnasio"
                  className={`${AGENDA_INPUT_CLASS} font-medium`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="agenda-edit-block-day" className="text-xs font-semibold text-[var(--text-soft)] block">
                    Día de la semana
                  </label>
                  <select
                    id="agenda-edit-block-day"
                    value={editingBlock.newDay}
                    onChange={(e) =>
                      setEditingBlock({ ...editingBlock, newDay: e.target.value as DayKey })
                    }
                    className={`${AGENDA_INPUT_CLASS} font-medium capitalize cursor-pointer`}
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="agenda-edit-block-time" className="text-xs font-semibold text-[var(--text-soft)] block">
                    Hora opcional
                  </label>
                  <input
                    id="agenda-edit-block-time"
                    type="time"
                    value={editingBlock.time}
                    onChange={(e) => setEditingBlock({ ...editingBlock, time: e.target.value })}
                    className={`${AGENDA_INPUT_CLASS} tabular-nums font-medium`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="agenda-edit-block-effort" className="text-xs font-semibold text-[var(--text-soft)] block">Esfuerzo mental</label>
                <select id="agenda-edit-block-effort" value={editingBlock.effort} onChange={(e) => setEditingBlock({ ...editingBlock, effort: e.target.value as EffortLevel })} className={`${AGENDA_INPUT_CLASS} font-medium`}>
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </div>

              {/* Task Linking Section */}
              <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 space-y-2">
                <label htmlFor="agenda-edit-block-task-search" className="text-xs font-semibold text-[var(--text-soft)] block">
                  Tarea vinculada
                </label>

                {/* Currently linked task display */}
                {editingBlock.linkedTaskId ? (() => {
                  const linked = allUnifiedTasks.find((t) => t.id === editingBlock.linkedTaskId);
                  return (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-[#4F46E5]/30">
                      <AppIcon name="link" className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text)] flex-1 truncate">
                        {linked ? linked.text : <span className="text-[var(--text-faint)] italic">Tarea ya no existe</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingBlock({ ...editingBlock, linkedTaskId: undefined, taskSearch: '' })}
                        className={`min-h-11 sm:min-h-10 text-xs font-semibold text-rose-600 hover:text-rose-700 px-2.5 rounded-lg hover:bg-rose-500/10 transition cursor-pointer shrink-0 dark:text-rose-400 ${AGENDA_TAB_FOCUS}`}
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
                  id="agenda-edit-block-task-search"
                  type="text"
                  value={editingBlock.taskSearch}
                  onChange={(e) => setEditingBlock({ ...editingBlock, taskSearch: e.target.value })}
                  placeholder="Buscar tarea para vincular..."
                  className={AGENDA_INPUT_CLASS}
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
                          className={`min-h-11 sm:min-h-10 w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-2 ${AGENDA_TAB_FOCUS} ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-500/15 border border-[#4F46E5]/40 text-[var(--text)]'
                              : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:border-[#4F46E5] hover:text-[var(--text)]'
                          }`}
                        >
                          {isSelected && <AppIcon name="check" className="h-3.5 w-3.5 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />}
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
                  className={`min-h-11 sm:min-h-10 px-4 py-2 text-xs font-semibold rounded-xl bg-transparent text-[var(--text-soft)] hover:text-[var(--text)] border border-slate-200/80 dark:border-white/[0.08] cursor-pointer ${AGENDA_TAB_FOCUS}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-11 sm:min-h-10 px-4 py-2 text-xs font-semibold rounded-xl bg-[#4F46E5] text-white hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}
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
            <div className="flex items-center gap-2.5">
              <AppIcon name="repeat" className="h-4 w-4 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" />
              <h2 id="routine-list-title" className="text-base font-semibold text-[var(--text)]">
                Rutinas recurrentes
              </h2>
              <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--text-soft)]">
                {(state.tasksRecurring || []).length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowRoutineForm((current) => !current)}
              aria-expanded={showRoutineForm}
              aria-controls="new-routine-form"
              className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}
            >
              {showRoutineForm ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <AppIcon name="plus" className="h-4 w-4" />
              )}
              <span>{showRoutineForm ? 'Cerrar formulario' : 'Nueva rutina'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* Routines List (shown first on mobile so empty state / routines aren't buried below weekly template) */}
            <div className={`lg:col-span-7 xl:col-span-8 ${showRoutineForm ? 'order-2 lg:order-2' : 'order-1 lg:order-2'}`}>
              <SurfaceCard aria-labelledby="routine-list-title" className="overflow-hidden">
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
                        className={`mt-4 inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}
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
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {FREQ_LABELS[freq]}
                            </h3>
                            <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                              {items.length}
                            </span>
                          </div>
                          <ListDivider>
                            {items.map((t) => {
                              const completedToday = Boolean(state.taskLog?.[todayIso]?.[t.id]);
                              const scheduledToday = routineScheduledFor(state, t, todayIso);
                              return (
                                <div key={t.id} className="flex min-w-0 items-center justify-between gap-2.5 px-4 py-2.5 text-sm text-[var(--text)] transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-5">
                                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    {scheduledToday || completedToday ? (
                                      todayCompletionButton(t.id, t.name, completedToday)
                                    ) : (
                                      <span aria-hidden="true" className="h-6 w-6 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <span className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-medium ${completedToday ? 'text-[var(--text-soft)] line-through' : ''}`}>
                                          {t.name}
                                        </span>
                                        {t.time && <span className="text-xs font-semibold tabular-nums text-[#4F46E5] dark:text-[#818CF8]">{t.time}</span>}
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
                                      aria-label={`Editar ${t.name}`}
                                      title={`Editar ${t.name}`}
                                      className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-indigo-50 hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:hover:bg-indigo-500/15 dark:hover:text-[#818CF8] cursor-pointer"
                                    >
                                      <Pencil className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTask(t.id)}
                                      aria-label={`Eliminar ${t.name}`}
                                      title={`Eliminar ${t.name}`}
                                      className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                        <label htmlFor="new-routine-name" className="block text-xs font-semibold text-[var(--text-soft)]">Nombre de la rutina</label>
                        <input
                          id="new-routine-name"
                          type="text"
                          value={taskName}
                          onChange={(e) => setTaskName(e.target.value)}
                          placeholder="Ej.: Meditar 10 min, estirar, leer 20 pág..."
                          className={AGENDA_INPUT_CLASS}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="new-routine-frequency" className="block text-xs font-semibold text-[var(--text-soft)]">Frecuencia</label>
                          <select
                            id="new-routine-frequency"
                            value={taskFreq}
                            onChange={(e) => setTaskFreq(e.target.value as 'daily' | '2-3x' | 'weekly')}
                            className={AGENDA_INPUT_CLASS}
                          >
                            <option value="daily">Diaria</option>
                            <option value="2-3x">2–3 veces por semana</option>
                            <option value="weekly">Semanal</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="new-routine-time" className="block text-xs font-semibold text-[var(--text-soft)]">Hora opcional</label>
                          <input id="new-routine-time" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} className={AGENDA_INPUT_CLASS} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="new-routine-effort" className="block text-xs font-semibold text-[var(--text-soft)]">Esfuerzo mental</label>
                        <select id="new-routine-effort" value={taskEffort} onChange={(e) => setTaskEffort(e.target.value as EffortLevel)} className={AGENDA_INPUT_CLASS}>
                          <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                        </select>
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
                              className={`min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 px-2.5 py-1 text-xs font-semibold rounded-xl border cursor-pointer transition-colors ${AGENDA_TAB_FOCUS} ${
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
                      <button type="submit" className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${AGENDA_TAB_FOCUS}`}><AppIcon name="plus" className="h-4 w-4" />Agregar rutina</button>
                    </div>
                  </form>
                </SurfaceCard>
              )}

              <SurfaceCard aria-labelledby="weekly-template-title" className="p-4 sm:p-5 space-y-3">
                <SectionHeader
                  id="weekly-template-title"
                  icon={<AppIcon name="list" className="h-4 w-4" />}
                  title="Horario semanal habitual"
                  count={weeklyBlockCount}
                  className="border-b border-slate-100 pb-3 dark:border-white/[0.06]"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={(event) => openTemplateAction('load', event.currentTarget)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 dark:border-white/[0.08] dark:bg-transparent dark:hover:border-[#818CF8] dark:hover:text-[#818CF8] cursor-pointer"
                  >
                    <AppIcon name="list" className="h-4 w-4" />
                    <span>Plantilla sugerida</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => openTemplateAction('clear', event.currentTarget)}
                    disabled={weeklyBlockCount === 0}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3 py-2 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-rose-500/40 hover:bg-rose-50/70 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.08] dark:text-slate-400 dark:hover:border-rose-400/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>Vaciar horario recurrente</span>
                  </button>
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
