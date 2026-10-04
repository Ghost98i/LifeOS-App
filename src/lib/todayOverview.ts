import type { EffortLevel, LifeOSState } from '../types';
import { dayKeyFromDate, todayISO } from './storage';
import {
  calcAccountsTotal,
  cashFlow30Days,
  todayGymStatus,
  findNowAndNext,
  currentWeight,
  routineScheduledFor,
} from './calculations';
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
