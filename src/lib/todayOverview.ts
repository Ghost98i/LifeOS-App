import type { EffortLevel, LifeOSState, TodayExtra, ViewType } from '../types';
import { dayKeyFromDate, todayISO } from './storage';
import {
  calcAccountsTotal,
  cashFlow30Days,
  todayGymStatus,
  findNowAndNext,
  currentWeight,
  routineScheduledFor,
  calendarItemsOnDate,
  todayItems,
} from './calculations';
import type { CalendarDisplayItem, TodayItem } from './calculations';
import {
  getUnifiedTaskMap,
  getBlockingTasks,
  getUnblockedCountIfCompleted,
} from './taskDependencies';
import { isModuleEnabled } from './moduleVisibility';

export interface TodayPriorityItem {
  id: string;
  text: string;
  done: boolean;
  rank?: number;
  reasons?: string[];
}

export interface TodayScheduleBlock {
  id: string;
  time: string;
  activity: string;
  done: boolean;
  effort?: EffortLevel;
}

export interface TodayExtraTask {
  id: string;
  text: string;
  done: boolean;
  priority: 'alta' | 'media' | 'baja';
  effort?: EffortLevel;
  dueDate?: string;
  isBlocked?: boolean;
  blockingTaskNames?: string[];
  unblocksCount?: number;
}

export interface TodayRoutineTask {
  id: string;
  text: string;
  done: boolean;
  effort?: EffortLevel;
}

export interface TodayJobFollowup {
  id: string;
  text: string;
  empresa: string;
  done: boolean;
}

export interface TodayUnifiedOverview {
  dateIso: string;
  // 1. Prioridades independientes del día (dailyPriorities)
  priorities: TodayPriorityItem[];
  // 2. Agenda / Horarios (agenda)
  schedule: {
    current: { time: string; activity: string; effort?: EffortLevel } | null;
    next: { time: string; activity: string; effort?: EffortLevel } | null;
    blocks: TodayScheduleBlock[];
  };
  // 3. Tareas y acciones del día (todayExtras, tasksRecurring, job followups)
  tasks: {
    extras: TodayExtraTask[];
    recurring: TodayRoutineTask[];
    followups: TodayJobFollowup[];
    allPendingCount: number;
    allCompletedCount: number;
  };
  // 4. Entrenamiento de hoy (gym)
  workout: {
    hasWorkoutScheduled: boolean;
    scheduledTemplateName?: string;
    scheduledTemplateId?: string;
    status: 'pending_today' | 'trained_today' | 'rest_today';
    streakDays: number;
    completedSetsCount: number;
    totalVolume: number;
    weight?: number | null;
  };
  // 5. Contexto secundario (finanzas y métricas compactas)
  context: {
    realLiquidity: number;
    activeAccountsCount: number;
    committed30d: number;
    realAvailable30d: number;
  };
}

/**
 * Calendar context that belongs in Hoy. Financial forecast entries and task
 * deadlines stay in their native surfaces to avoid duplicating information or
 * turning Hoy into a finance dashboard.
 */
export function getTodayAgendaCalendarItems(
  state: LifeOSState,
  dateIso: string = todayISO()
): CalendarDisplayItem[] {
  const calendarEnabled = isModuleEnabled(state, 'calendario');
  const studyEnabled = isModuleEnabled(state, 'estudios');
  return calendarItemsOnDate(state, dateIso).filter((item) => {
    if (item.id.startsWith('scheduled-extra-') || item.id.startsWith('deadline-extra-') || item.id.startsWith('deadline-task-')) return false;
    if (item.type === 'finanza_compromiso' || item.type === 'finanza_ingreso' || item.type === 'entrega') return false;
    if (item.type === 'examen') return studyEnabled;
    return calendarEnabled;
  });
}

export type TodayAgendaEntrySource = 'priority' | 'agenda' | 'rutina' | 'extra' | 'proyecto' | 'trabajo' | 'calendar' | 'gym';

export interface TodayAgendaEntry {
  key: string;
  id: string;
  label: string;
  time: string | null;
  allDay: boolean;
  done: boolean;
  completable: boolean;
  isFocus: boolean;
  priority: number;
  source: TodayAgendaEntrySource;
  sourceLabel: string;
  todayItem?: TodayItem;
  calendarItem?: CalendarDisplayItem;
  priorityId?: string;
  navigationTarget?: ViewType;
}

function normalizeAgendaLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

function splitAgendaText(item: TodayItem): { label: string; time: string | null } {
  if (item.time) return { label: item.text, time: item.time };
  // Legacy states produced agenda labels with the time appended. Keep reading
  // those records while all new projections use the structured field above.
  if (item.source !== 'agenda') return { label: item.text, time: null };
  const separator = item.text.lastIndexOf(' · ');
  if (separator < 0) return { label: item.text, time: null };
  return { label: item.text.slice(0, separator), time: item.text.slice(separator + 3) || null };
}

function sourceLabel(source: TodayItem['source']): string {
  if (source === 'rutina') return 'Rutina';
  if (source === 'agenda') return 'Agenda';
  if (source === 'trabajo') return 'Trabajo';
  if (source === 'proyecto') return 'Proyecto';
  return 'Tarea';
}

/**
 * Presentation-only projection for Hoy V1. It keeps each source entity intact,
 * folds legacy daily priorities into a visual focus marker. Distinct entity IDs
 * remain distinct even when their labels and times match.
 */
export function getTodayAgendaEntries(
  state: LifeOSState,
  dateIso: string = todayISO()
): TodayAgendaEntry[] {
  const priorities = (state.dailyPriorities || [])
    .filter((priority) => priority.date === dateIso)
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const priorityByLabel = new Map(priorities.map((priority) => [normalizeAgendaLabel(priority.text), priority]));
  const matchedPriorityIds = new Set<string>();
  const entries: TodayAgendaEntry[] = [];

  for (const item of todayItems(state, dateIso, dateIso === todayISO())) {
    const { label, time } = splitAgendaText(item);
    const normalized = normalizeAgendaLabel(label);
    const focus = priorityByLabel.get(normalized);
    if (focus) matchedPriorityIds.add(focus.id);
    entries.push({
      key: `${item.source}-${item.id}`,
      id: item.id,
      label,
      time,
      allDay: false,
      done: item.done,
      completable: true,
      isFocus: Boolean(focus),
      priority: focus ? 10 - (focus.rank || 3) : item.priority,
      source: item.source,
      sourceLabel: sourceLabel(item.source),
      todayItem: item,
      priorityId: focus?.id,
      navigationTarget: item.source === 'trabajo' ? 'trabajo' : item.source === 'proyecto' ? 'notas' : 'agenda',
    });
  }

  for (const priority of priorities) {
    if (matchedPriorityIds.has(priority.id)) continue;
    entries.push({
      key: `priority-${priority.id}`,
      id: priority.id,
      label: priority.text,
      time: null,
      allDay: false,
      done: Boolean(priority.done),
      completable: true,
      isFocus: true,
      priority: 10 - (priority.rank || 3),
      source: 'priority',
      sourceLabel: 'Prioridad',
      priorityId: priority.id,
    });
  }

  for (const item of getTodayAgendaCalendarItems(state, dateIso)) {
    entries.push({
      key: `calendar-${item.id}`,
      id: item.id,
      label: item.name,
      time: item.time || null,
      allDay: !item.time,
      done: false,
      completable: false,
      isFocus: false,
      priority: item.type === 'importante' || item.type === 'examen' ? 5 : 2,
      source: 'calendar',
      sourceLabel: item.type === 'cumpleanos' ? 'Cumpleaños' : item.type === 'examen' ? 'Examen' : 'Evento',
      calendarItem: item,
      navigationTarget: item.type === 'examen' ? 'estudios' : 'calendario',
    });
  }

  if (isModuleEnabled(state, 'gimnasio')) {
    const dayKey = dayKeyFromDate(new Date(`${dateIso}T12:00:00`));
    const scheduledTemplate = (state.gym?.routineTemplates || []).find((template) => template.days?.includes(dayKey));
    if (scheduledTemplate) {
      const gymStatus = todayGymStatus(state, dateIso);
      entries.push({
        key: `gym-${scheduledTemplate.id}`,
        id: scheduledTemplate.id,
        label: scheduledTemplate.name,
        time: null,
        allDay: false,
        done: gymStatus.status === 'trained_today',
        completable: false,
        isFocus: false,
        priority: 3,
        source: 'gym',
        sourceLabel: 'Gimnasio',
        navigationTarget: 'gimnasio',
      });
    }
  }

  return entries.sort((a, b) => {
    // This is a schedule, not the urgency-ranked suggestion queue. `priority`
    // from todayItems drops when completed and its input order also puts done
    // items last. Neither may decide a row's position, even for equal labels.
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    if (a.time !== b.time) return a.time ? -1 : 1;
    if (a.isFocus !== b.isFocus) return a.isFocus ? -1 : 1;
    return a.label.localeCompare(b.label, 'es') || a.key.localeCompare(b.key);
  });
}

/**
 * Pure presentation-layer selector that groups today's various entities
 * WITHOUT merging their internal schemas or modifying state.
 */
export function getTodayUnifiedOverview(
  state: LifeOSState,
  dateIso: string = todayISO()
): TodayUnifiedOverview {
  const dayKey = dayKeyFromDate(new Date(dateIso + 'T12:00:00'));
  const log = (state.taskLog || {})[dateIso] || {};
  const taskMap = getUnifiedTaskMap(state);

  // 1. Prioridades independientes
  const priorities: TodayPriorityItem[] = (state.dailyPriorities || [])
    .filter((p) => p.date === dateIso)
    .sort((a, b) => (a.rank || 0) - (b.rank || 0))
    .map((p) => ({
      id: p.id,
      text: p.text,
      done: Boolean(p.done),
      rank: p.rank,
      reasons: p.reasons,
    }));

  // 2. Agenda (horarios programados)
  const isAgendaOn = isModuleEnabled(state, 'agenda');
  const nowAndNext = isAgendaOn ? findNowAndNext(state) : { current: null, next: null };
  const rawAgenda = isAgendaOn ? (state.agenda || {})[dayKey] || [] : [];
  const scheduleBlocks: TodayScheduleBlock[] = isAgendaOn
    ? [...rawAgenda]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((b) => ({
          id: b.id,
          time: b.time,
          activity: b.activity,
          done: Boolean(log[b.id]),
          effort: b.effort,
        }))
    : [];

  // 3. Tareas: extras espontáneas
  const extras: TodayExtraTask[] = (state.todayExtras || [])
    .filter((x) => x.date === dateIso)
    .map((x) => {
      const task = taskMap.get(x.id);
      const blockers = task ? getBlockingTasks(task, taskMap) : [];
      const isBlocked = blockers.length > 0;
      const blockingTaskNames = blockers.map((b) => b.text);
      const unblocksCount = task ? getUnblockedCountIfCompleted(task.id, taskMap) : 0;
      return {
        id: x.id,
        text: x.text,
        done: Boolean(x.done),
        priority: x.priority,
        effort: x.effort || 'medium',
        dueDate: x.dueDate,
        isBlocked,
        blockingTaskNames,
        unblocksCount,
      };
    });

  // Tareas: rutinas recurrentes programadas para hoy
  const recurring: TodayRoutineTask[] = (state.tasksRecurring || [])
    .filter((t) => routineScheduledFor(state, t, dateIso))
    .map((t) => ({
      id: t.id,
      text: t.name,
      done: Boolean(log[t.id]),
      effort: t.effort || 'medium',
    }));

  // Tareas: seguimientos laborales vencidos o para hoy
  const isJobsOn = isModuleEnabled(state, 'trabajo');
  const followups: TodayJobFollowup[] = isJobsOn
    ? (state.jobs?.applications || [])
        .filter((a) => a.nextActionDate && a.nextActionDate <= dateIso)
        .map((a) => ({
          id: a.id,
          text: `${a.nextAction || 'Seguimiento'} — ${a.empresa}`,
          empresa: a.empresa,
          done: false,
        }))
    : [];

  const allPendingCount =
    extras.filter((e) => !e.done).length +
    recurring.filter((r) => !r.done).length +
    followups.length;

  const allCompletedCount =
    extras.filter((e) => e.done).length +
    recurring.filter((r) => r.done).length;

  // 4. Entrenamiento de hoy
  const isGymOn = isModuleEnabled(state, 'gimnasio');
  const gymStatus = isGymOn
    ? todayGymStatus(state, dateIso)
    : {
        status: 'pending_today' as const,
        streakDays: 0,
        completedSetsCount: 0,
        totalVolume: 0,
      };
  const weight = isGymOn ? currentWeight(state) : null;
  const routineTemplates = isGymOn ? state.gym?.routineTemplates || [] : [];
  const scheduledTemplate = isGymOn
    ? routineTemplates.find((t) => t.days?.includes(dayKey))
    : undefined;

  // 5. Contexto secundario (finanzas líquidas reales)
  const isFinanceOn = isModuleEnabled(state, 'finanzas');
  const realLiquidity = isFinanceOn ? calcAccountsTotal(state) : 0;
  const cashFlow = isFinanceOn
    ? cashFlow30Days(state, dateIso)
    : { committed: 0, realAvailable: 0 };

  return {
    dateIso,
    priorities,
    schedule: {
      current: nowAndNext.current,
      next: nowAndNext.next,
      blocks: scheduleBlocks,
    },
    tasks: {
      extras,
      recurring,
      followups,
      allPendingCount,
      allCompletedCount,
    },
    workout: {
      hasWorkoutScheduled: Boolean(scheduledTemplate),
      scheduledTemplateName: scheduledTemplate?.name,
      scheduledTemplateId: scheduledTemplate?.id,
      status: gymStatus.status,
      streakDays: gymStatus.streakDays,
      completedSetsCount: gymStatus.completedSetsCount,
      totalVolume: gymStatus.totalVolume,
      weight,
    },
    context: {
      realLiquidity,
      activeAccountsCount: (state.finance?.accounts || []).length,
      committed30d: cashFlow.committed,
      realAvailable30d: cashFlow.realAvailable,
    },
  };
}

/**
 * Retrieves pending spontaneous tasks from previous days (date < todayIso).
 * Sorted chronologically (oldest first), then by priority (alta first), then text.
 */
export function getPastPendingExtras(
  state: LifeOSState,
  todayIso: string = todayISO()
): TodayExtra[] {
  return (state.todayExtras || [])
    .filter((task) => !task.done && task.date < todayIso)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const prioOrder: Record<string, number> = { alta: 0, media: 1, baja: 2 };
      const pa = prioOrder[a.priority] ?? 1;
      const pb = prioOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return a.text.localeCompare(b.text);
    });
}

/**
 * Retrieves pending spontaneous tasks scheduled for future dates (date > todayIso).
 * Sorted nearest date first, then by text.
 */
export function getFutureScheduledExtras(
  state: LifeOSState,
  todayIso: string = todayISO()
): TodayExtra[] {
  return (state.todayExtras || [])
    .filter((task) => !task.done && task.date > todayIso)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.text.localeCompare(b.text);
    });
}
