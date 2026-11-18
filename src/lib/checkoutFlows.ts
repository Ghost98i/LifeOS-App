import type { CheckoutLogDay, LifeOSState, Postit } from '../types';
import { fmtDate, roundMoney, sumMoney, todayISO, uid } from './storage';
import {
  isOperationalTransaction,
  resolveTransactionCurrency,
  routineScheduledFor,
  studyMinutesForDate,
} from './calculations';
import { deriveMonthlyBudgetStatus } from './financeBudget';
import { isModuleEnabled } from './moduleVisibility';
import { getTomorrowDateString } from './todayAttention';

export interface DayCheckoutSummary {
  date: string;
  tasks: {
    completed: number;
    pending: number;
    total: number;
    completionPct: number;
    pendingExtrasCount: number;
  };
  study: {
    minutesToday: number;
    plannedMinutes: number | null;
  };
  training: {
    trained: boolean;
    restDay: boolean;
  };
  spending: {
    currency: string;
    spentToday: number;
    /** Prorated daily budget derived from monthly budget (globalLimit or sum of categoryLimits / daysInMonth), or null if no budget configured. */
    dailyLimit: number | null;
  };
  alreadyRolledOver: boolean;
  rolledOverAt?: string;
}

export interface RolloverTaskSnapshot {
  id: string;
  previousDate: string;
  previousDueDate?: string;
}

export interface RolloverExtrasResult {
  movedCount: number;
  alreadyRolledOver: boolean;
  tomorrowIso: string;
  movedSnapshots: RolloverTaskSnapshot[];
}

function resolvePrimarySummaryCurrency(state: LifeOSState): string {
  const accounts = state.finance?.accounts || [];
  const currencies = new Set(accounts.map((a) => (a.currency || 'UYU').toUpperCase()));
  if (currencies.size === 1) return Array.from(currencies)[0];
  return 'UYU';
}

/**
 * Pure, non-persisted daily summary for CheckoutModal.
 * Daily spending cap rule: uses `deriveMonthlyBudgetStatus` for the current month and primary
 * currency (`globalLimit`, or sum of positive `categoryLimits` when `globalLimit` is null),
 * prorated evenly across the days of the month. Returns `dailyLimit: null` when no budget exists.
 */
export function deriveDayCheckoutSummary(
  state: LifeOSState,
  dateIso: string = todayISO(),
): DayCheckoutSummary {
  const extrasToday = (state.todayExtras || []).filter((x) => x.date === dateIso);
  const recurringToday = isModuleEnabled(state, 'agenda')
    ? (state.tasksRecurring || []).filter((t) => routineScheduledFor(state, t, dateIso))
    : [];

  const completedExtras = extrasToday.filter((x) => x.done).length;
  const completedRecurring = recurringToday.filter((t) => Boolean(state.taskLog?.[dateIso]?.[t.id])).length;
  const totalTasks = extrasToday.length + recurringToday.length;
  const completedTasks = completedExtras + completedRecurring;
  const pendingTasks = totalTasks - completedTasks;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const pendingExtrasCount = extrasToday.length - completedExtras;

  const minutesToday = studyMinutesForDate(state, dateIso);
  const activePlanned = state.study?.activeSession?.plannedMinutes;
  const plannedMinutes = typeof activePlanned === 'number' && activePlanned > 0 ? activePlanned : null;

  const trained = (state.gym?.sessions || []).some((s) => s.date === dateIso);
  const restDay = Boolean(state.gym?.restDays?.includes(dateIso) || state.checkoutLog?.[dateIso]?.trainedSkipped);

  const currency = resolvePrimarySummaryCurrency(state);
  const accounts = state.finance?.accounts || [];
  const spentToday = sumMoney(
    (state.finance?.transactions || [])
      .filter(
        (tx) =>
          tx.date === dateIso &&
          tx.type === 'gasto' &&
          isOperationalTransaction(tx) &&
          resolveTransactionCurrency(tx, accounts) === currency,
      )
      .map((tx) => tx.amount),
  );

  const monthIso = dateIso.slice(0, 7);
  const [year, monthNum] = monthIso.split('-').map(Number);
  const daysInMonth = year && monthNum ? new Date(year, monthNum, 0).getDate() : 30;
  const budgetStatus = deriveMonthlyBudgetStatus(state, monthIso, currency);
  let dailyLimit: number | null = null;
  if (budgetStatus.hasBudget) {
    const monthlyCap =
      budgetStatus.globalLimit && budgetStatus.globalLimit > 0
        ? budgetStatus.globalLimit
        : budgetStatus.categories.reduce((sum, c) => sum + (c.limit && c.limit > 0 ? c.limit : 0), 0);
    if (monthlyCap > 0) {
      dailyLimit = roundMoney(monthlyCap / Math.max(1, daysInMonth));
    }
  }

  const rolledOverAt = state.checkoutLog?.[dateIso]?.rolledOverAt;

  return {
    date: dateIso,
    tasks: {
      completed: completedTasks,
      pending: pendingTasks,
      total: totalTasks,
      completionPct,
      pendingExtrasCount,
    },
    study: {
      minutesToday,
      plannedMinutes,
    },
    training: {
      trained,
      restDay,
    },
    spending: {
      currency,
      spentToday,
      dailyLimit,
    },
    alreadyRolledOver: Boolean(rolledOverAt),
    rolledOverAt,
  };
}

/**
 * Moves incomplete one-off tasks (`todayExtras`) from `dateIso` to the next day.
 * Idempotent via `checkoutLog[dateIso].rolledOverAt`.
 * Preserves ID, priority, dependsOn, linkedType/linkedId, and taskLog history.
 * Does not touch recurring tasks or already completed tasks.
 */
export function rolloverPendingExtrasToTomorrow(
  draft: LifeOSState,
  dateIso: string = todayISO(),
  nowIso: string = new Date().toISOString(),
): RolloverExtrasResult {
  const tomorrowIso = getTomorrowDateString(dateIso);
  if (!draft.checkoutLog) draft.checkoutLog = {};

  if (draft.checkoutLog[dateIso]?.rolledOverAt) {
    return { movedCount: 0, alreadyRolledOver: true, tomorrowIso, movedSnapshots: [] };
  }

  const movedSnapshots: RolloverTaskSnapshot[] = [];
  for (const extra of draft.todayExtras || []) {
    if (extra.date === dateIso && !extra.done) {
      movedSnapshots.push({
        id: extra.id,
        previousDate: extra.date,
        previousDueDate: extra.dueDate,
      });
      extra.date = tomorrowIso;
      if (extra.dueDate && extra.dueDate <= dateIso) {
        extra.dueDate = tomorrowIso;
      }
    }
  }

  if (movedSnapshots.length > 0) {
    draft.checkoutLog[dateIso] = {
      ...(draft.checkoutLog[dateIso] || {}),
      rolledOverAt: nowIso,
    };
  }

  return {
    movedCount: movedSnapshots.length,
    alreadyRolledOver: false,
    tomorrowIso,
    movedSnapshots,
  };
}

export function undoRolloverPendingExtras(
  draft: LifeOSState,
  dateIso: string,
  snapshots: RolloverTaskSnapshot[],
): void {
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  for (const extra of draft.todayExtras || []) {
    const snap = byId.get(extra.id);
    if (!snap) continue;
    extra.date = snap.previousDate;
    extra.dueDate = snap.previousDueDate;
  }
  if (draft.checkoutLog?.[dateIso]) {
    delete draft.checkoutLog[dateIso].rolledOverAt;
  }
}

export interface DayCheckoutInput {
  date: string;
  trainedSkipped: boolean;
  trainedSkippedTouched: boolean;
  studiedSkipped: boolean;
  expensesSkipped: boolean;
  sleepHours?: number;
  energyLevel?: number;
  dailyNote: string;
  closedAt: string;
}

export type DayCheckoutStatus = 'ready' | 'unchanged' | 'ambiguous-reflection';

const reflectionText = (date: string, note: string) => `[Cierre del ${fmtDate(date)}] ${note}`;

function findReflection(state: LifeOSState, date: string, log: CheckoutLogDay): { note?: Postit; ambiguous: boolean } {
  const previousText = log.dailyNote?.trim();
  if (!previousText) return { ambiguous: false };
  const linked = state.notes.postits.find((note) => note.id === log.reflectionPostitId && note.date === date);
  if (linked) return { note: linked, ambiguous: false };
  const matches = state.notes.postits.filter((note) => note.date === date && note.text === reflectionText(date, previousText));
  return { note: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
}

export function inspectDayCheckout(state: LifeOSState, input: DayCheckoutInput): DayCheckoutStatus {
  const previous = state.checkoutLog[input.date] || {};
  const nextNote = input.dailyNote.trim();
  const previousNote = previous.dailyNote?.trim() || '';
  if (nextNote !== previousNote && nextNote && findReflection(state, input.date, previous).ambiguous) {
    return 'ambiguous-reflection';
  }
  if (
    previous.closedAt &&
    (!input.trainedSkippedTouched || input.trainedSkipped === Boolean(previous.trainedSkipped)) &&
    input.studiedSkipped === Boolean(previous.studiedSkipped) &&
    input.expensesSkipped === Boolean(previous.expensesSkipped) &&
    input.sleepHours === previous.sleepHours &&
    input.energyLevel === previous.energyLevel &&
    nextNote === previousNote
  ) return 'unchanged';
  return 'ready';
}

export function applyDayCheckout(
  state: LifeOSState,
  input: DayCheckoutInput,
  createId: () => string = uid,
): DayCheckoutStatus {
  const status = inspectDayCheckout(state, input);
  if (status !== 'ready') return status;

  const previous = state.checkoutLog[input.date] || {};
  const nextNote = input.dailyNote.trim();
  const previousNote = previous.dailyNote?.trim() || '';
  let reflectionPostitId = previous.reflectionPostitId;

  if (nextNote !== previousNote) {
    if (nextNote) {
      const linked = findReflection(state, input.date, previous).note;
      if (linked) {
        linked.text = reflectionText(input.date, nextNote);
        reflectionPostitId = linked.id;
      } else {
        reflectionPostitId = createId();
        state.notes.postits.unshift({ id: reflectionPostitId, text: reflectionText(input.date, nextNote), date: input.date });
      }
    } else {
      // Keep the historical note; clearing the checkout field does not delete Notes data.
      reflectionPostitId = undefined;
    }
  }

  const trainedSkipped = input.trainedSkippedTouched
    ? input.trainedSkipped
    : previous.trainedSkipped ?? Boolean(state.gym.restDays?.includes(input.date));
  state.checkoutLog[input.date] = {
    ...previous,
    trainedSkipped,
    studiedSkipped: input.studiedSkipped,
    expensesSkipped: input.expensesSkipped,
    sleepHours: input.sleepHours,
    energyLevel: input.energyLevel,
    dailyNote: nextNote || undefined,
    reflectionPostitId,
    closedAt: previous.closedAt || input.closedAt,
  };

  if (input.trainedSkippedTouched && !state.gym.sessions.some((session) => session.date === input.date)) {
    if (input.trainedSkipped) {
      if (!state.gym.restDays) state.gym.restDays = [];
      if (!state.gym.restDays.includes(input.date)) state.gym.restDays.push(input.date);
    } else if (state.gym.restDays) {
      state.gym.restDays = state.gym.restDays.filter((date) => date !== input.date);
    }
  }

  return 'ready';
}
