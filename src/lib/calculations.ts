import {
  LifeOSState,
  Transaction,
  AgendaBlock,
  TaskRecurring,
  TodayExtra,
  Goal,
  CalendarEvent,
  ResaleOpportunity,
  EffortLevel,
  GymSession,
  ExpectedIncome,
  FinancialCommitment,
  CashFlowCommitment,
  CashFlowDayPoint,
  CashFlowForecastItem,
} from '../types';
import {
  todayISO,
  sameMonth,
  monthLabel,
  daysBetween,
  withinCurrentWeek,
  dayKeyFromDate,
  isoWeekMonday,
  clamp,
} from './storage';
import {
  getUnifiedTaskMap,
  getBlockingTasks,
  getUnblockedCountIfCompleted,
} from './taskDependencies';
import { isModuleEnabled } from './moduleVisibility';
import { getPerformedGymVolume, isPerformedGymSession } from './gymFlows';
import { calcDetailedPRs } from './gymMetrics';
import {
  calculateRealAvailable,
  evaluateCushionStatus,
  getCommitmentOccurrences,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
  sortCommitmentsChronologically,
  CushionEvaluation,
} from './financialCommitments';

export {
  calculateRealAvailable,
  evaluateCushionStatus,
  getCommitmentOccurrences,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
  sortCommitmentsChronologically,
};
export type { CushionEvaluation };

export {
  deriveCashflowProjection,
  getCommittedEventsForWindow,
  getExpectedIncomeEventsForWindow,
  getRealBalancesByCurrency,
  calculateAvailableAfterCommitments,
  getCivilWindowBounds,
} from './financeCashflow';

export {
  deriveMonthlyBudgetStatus,
  deriveAllMonthlyBudgetStatuses,
  setMonthlyBudget,
  setMonthlyGlobalLimit,
  setMonthlyCategoryLimit,
} from './financeBudget';

export function calcAccountsTotal(state: LifeOSState): number {
  return (state.finance?.accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0);
}

export function defaultAccountId(state: LifeOSState): string | null {
  const accounts = state.finance?.accounts || [];
  return accounts.length ? accounts[0].id : null;
}

export function adjustAccountBalance(state: LifeOSState, accountId: string | null | undefined, delta: number): void {
  if (!accountId) return;
  const acc = (state.finance?.accounts || []).find((a) => a.id === accountId);
  if (acc) {
    acc.balance = Number(acc.balance || 0) + delta;
  }
}

export function calcInvestmentsTotal(state: LifeOSState): number {
  return (state.finance?.investments || []).reduce((s, i) => s + Number(i.amount || 0), 0);
}

export function calcDebtsTotal(state: LifeOSState): number {
  return (state.finance?.debts || []).reduce((s, d) => s + Number(d.amount || 0), 0);
}

export function calcNetWorth(state: LifeOSState): number {
  return calcAccountsTotal(state) + calcInvestmentsTotal(state) - calcDebtsTotal(state);
}

export function calcSubscriptionsTotal(state: LifeOSState): number {
  return (state.finance?.subscriptions || []).reduce((s, x) => s + Number(x.amount || 0), 0);
}

export type { CashFlowCommitment, CashFlowDayPoint, CashFlowForecastItem };

export interface CashFlowProjectionResult {
  currentBalance: number;
  totalExpectedIncome: number;
  committed: number;
  realAvailable: number;
  netCashFlow: number;
  projectedBalance: number;
  minProjectedBalance: number;
  minBalanceDate: string;
  thresholdWarning: boolean;
  isDeficit: boolean;
  minLiquidityReserve: number;
  cushionStatus: 'ok' | 'below_current' | 'projected_below' | 'disabled';
  cushionShortfall: number;
  cushionMessage: string;
  nextIncome?: { label: string; amount: number; date: string } | null;
  nextExpense?: { label: string; amount: number; date: string } | null;
  horizonDays: 30 | 60 | 90;
  horizonIso: string;
  commitments: CashFlowCommitment[];
  forecastItems: CashFlowForecastItem[];
  dailyTrajectory: CashFlowDayPoint[];
}

export function resolveFinancialCommitment(
  state: LifeOSState,
  item: CashFlowCommitment,
): FinancialCommitment | null {
  if (item.kind !== 'commitment') return null;
  return (state.finance?.commitments || []).find((commitment) => commitment.id === item.sourceId) || null;
}

export function getExpectedIncomeOccurrences(
  income: ExpectedIncome,
  fromIso: string,
  horizonIso: string
): CashFlowForecastItem[] {
  if (!income.active || Number(income.amount || 0) <= 0) return [];
  const items: CashFlowForecastItem[] = [];
  const amount = Number(income.amount);
  const startIso = income.startDate || fromIso;
  const endIso = income.endDate || null;

  const pushIfInRange = (dIso: string) => {
    if (dIso >= fromIso && dIso <= horizonIso && (!endIso || dIso <= endIso)) {
      items.push({
        id: `inc-${income.id}-${dIso}`,
        date: dIso,
        label: income.name,
        amount,
        type: 'income',
        category: income.category,
        accountId: income.accountId,
        sourceId: income.id,
      });
    }
  };

  const toDate = (iso: string) => new Date(`${iso}T12:00:00`);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (income.frequency === 'once') {
    pushIfInRange(startIso);
    return items;
  }

  if (income.frequency === 'weekly' || income.frequency === 'biweekly') {
    const stepDays = income.frequency === 'weekly' ? 7 : 14;
    const curr = toDate(startIso);
    const fromDate = toDate(fromIso);
    const horizonDate = toDate(horizonIso);

    // If start is before fromDate, advance by step intervals
    if (curr.getTime() < fromDate.getTime()) {
      const diffMs = fromDate.getTime() - curr.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const jumps = Math.floor(diffDays / stepDays);
      curr.setDate(curr.getDate() + jumps * stepDays);
      while (toIso(curr) < fromIso) {
        curr.setDate(curr.getDate() + stepDays);
      }
    }

    while (curr.getTime() <= horizonDate.getTime()) {
      const iso = toIso(curr);
      if (endIso && iso > endIso) break;
      pushIfInRange(iso);
      curr.setDate(curr.getDate() + stepDays);
    }
    return items;
  }

  if (income.frequency === 'monthly') {
    const startObj = toDate(startIso);
    const targetDay = startObj.getDate();
    const fromObj = toDate(fromIso);

    const y = fromObj.getFullYear();
    const m = fromObj.getMonth();

    for (let i = 0; i < 5; i++) {
      const lastDay = new Date(y, m + i + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(y, m + i, actualDay, 12);
      const iso = toIso(d);
      if (iso > horizonIso) break;
      if (iso >= startIso) {
        pushIfInRange(iso);
      }
    }
    return items;
  }

  if (income.frequency === 'yearly') {
    const startObj = toDate(startIso);
    const targetMonth = startObj.getMonth();
    const targetDay = startObj.getDate();
    const fromObj = toDate(fromIso);

    for (let yr = fromObj.getFullYear(); yr <= fromObj.getFullYear() + 1; yr++) {
      const lastDay = new Date(yr, targetMonth + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(yr, targetMonth, actualDay, 12);
      const iso = toIso(d);
      if (iso >= startIso) {
        pushIfInRange(iso);
      }
    }
    return items;
  }

  return items;
}

export function cashFlowProjection(
  state: LifeOSState,
  days: 30 | 60 | 90 = 30,
  fromIso = todayISO()
): CashFlowProjectionResult {
  const from = new Date(`${fromIso}T12:00:00`);
  const horizon = new Date(from);
  horizon.setDate(horizon.getDate() + days);
  const horizonIso = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`;

  const forecastItems: CashFlowForecastItem[] = [];

  // 1. Expected Incomes
  for (const inc of state.finance?.expectedIncomes || []) {
    forecastItems.push(...getExpectedIncomeOccurrences(inc, fromIso, horizonIso));
  }

  // 2. Subscriptions
  for (const sub of state.finance?.subscriptions || []) {
    const amount = Number(sub.amount || 0);
    if (amount <= 0 || !sub.dueDay) continue;

    const targetDay = Math.max(1, Math.min(31, sub.dueDay));
    const maxMonths = days <= 30 ? 2 : days <= 60 ? 3 : 4;

    for (let m = 0; m < maxMonths; m++) {
      const y = from.getFullYear();
      const month = from.getMonth() + m;
      const lastDay = new Date(y, month + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(y, month, actualDay, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso > horizonIso) break;
      if (iso >= fromIso) {
        forecastItems.push({
          id: `subscription-${sub.id}-${iso}`,
          date: iso,
          label: sub.name,
          amount,
          type: 'expense',
          sourceId: sub.id,
        });
      }
    }
  }

  // 3. Debts
  for (const debt of state.finance?.debts || []) {
    const payment = Number(debt.monthlyPayment || 0);
    if (payment <= 0) continue;

    const startIso = debt.dueDate || fromIso;
    if (debt.dueDate && debt.dueDate > horizonIso) continue;

    const start = new Date(`${startIso}T12:00:00`);
    const targetDay = start.getDate();

    for (let m = 0; ; m++) {
      const y = from.getFullYear();
      const month = from.getMonth() + m;
      const lastDay = new Date(y, month + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(y, month, actualDay, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso > horizonIso) break;
      if (iso >= fromIso && iso >= startIso) {
        forecastItems.push({
          id: `debt-${debt.id}-${iso}`,
          date: iso,
          label: debt.name,
          amount: payment,
          type: 'debt',
          sourceId: debt.id,
        });
      }
    }
  }

  // 4. Financial Commitments
  for (const com of state.finance?.commitments || []) {
    forecastItems.push(...getCommitmentOccurrences(com, fromIso, horizonIso));
  }

  forecastItems.sort((a, b) => a.date.localeCompare(b.date));

  // Map to commitments for backward compatibility
  const commitments: CashFlowCommitment[] = forecastItems
    .filter((f) => f.type === 'expense' || f.type === 'debt')
    .map((f) => ({
      id: f.id,
      sourceId: f.sourceId,
      label: f.label,
      amount: f.amount,
      dueDate: f.date,
      kind: f.id.startsWith('com-') ? 'commitment' : f.type === 'expense' ? 'subscription' : 'debt',
    }));

  const totalExpectedIncome = forecastItems
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + f.amount, 0);

  const committed = commitments.reduce((sum, item) => sum + item.amount, 0);
  const currentBalance = calcAccountsTotal(state);
  const realAvailable = calculateRealAvailable(currentBalance, committed);
  const netCashFlow = totalExpectedIncome - committed;
  const projectedBalance = currentBalance + netCashFlow;

  // Day-by-day trajectory
  const dailyTrajectory: CashFlowDayPoint[] = [];
  let runningBalance = currentBalance;
  let minProjectedBalance = currentBalance;
  let minBalanceDate = fromIso;

  const dayMap = new Map<string, { income: number; expense: number; debt: number }>();
  for (const item of forecastItems) {
    const existing = dayMap.get(item.date) || { income: 0, expense: 0, debt: 0 };
    if (item.type === 'income') existing.income += item.amount;
    else if (item.type === 'expense') existing.expense += item.amount;
    else if (item.type === 'debt') existing.debt += item.amount;
    dayMap.set(item.date, existing);
  }

  const cursor = new Date(from);
  for (let i = 0; i <= days; i++) {
    const dIso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const dayData = dayMap.get(dIso) || { income: 0, expense: 0, debt: 0 };
    const startingBalance = runningBalance;
    const netDayChange = dayData.income - dayData.expense - dayData.debt;
    const endingBalance = startingBalance + netDayChange;

    dailyTrajectory.push({
      date: dIso,
      startingBalance,
      expectedIncome: dayData.income,
      expectedExpenses: dayData.expense,
      debtPayments: dayData.debt,
      endingBalance,
      netDayChange,
    });

    if (endingBalance < minProjectedBalance) {
      minProjectedBalance = endingBalance;
      minBalanceDate = dIso;
    }

    runningBalance = endingBalance;
    cursor.setDate(cursor.getDate() + 1);
  }

  const cushionVal = state.finance?.minCushion !== undefined ? state.finance.minCushion : 5000;
  const cushionEnabled = state.finance?.cushionEnabled !== undefined ? state.finance.cushionEnabled : true;
  const cushionEval = evaluateCushionStatus(
    currentBalance,
    minProjectedBalance,
    cushionVal,
    cushionEnabled
  );
  const minLiquidityReserve = cushionEval.minCushion ?? 0;
  const isDeficit = projectedBalance < 0 || minProjectedBalance < 0;
  const thresholdWarning = isDeficit || cushionEval.status === 'below_current' || cushionEval.status === 'projected_below';

  const upcomingIncomes = forecastItems.filter((f) => f.type === 'income' && f.date >= fromIso);
  const upcomingExpenses = forecastItems.filter((f) => (f.type === 'expense' || f.type === 'debt') && f.date >= fromIso);
  const nextIncome = upcomingIncomes.length > 0 ? { label: upcomingIncomes[0].label, amount: upcomingIncomes[0].amount, date: upcomingIncomes[0].date } : null;
  const nextExpense = upcomingExpenses.length > 0 ? { label: upcomingExpenses[0].label, amount: upcomingExpenses[0].amount, date: upcomingExpenses[0].date } : null;

  return {
    currentBalance,
    totalExpectedIncome,
    committed,
    realAvailable,
    netCashFlow,
    projectedBalance,
    minProjectedBalance,
    minBalanceDate,
    thresholdWarning,
    isDeficit,
    minLiquidityReserve,
    cushionStatus: cushionEval.status,
    cushionShortfall: cushionEval.shortfall,
    cushionMessage: cushionEval.message,
    nextIncome,
    nextExpense,
    horizonDays: days,
    horizonIso,
    commitments,
    forecastItems,
    dailyTrajectory,
  };
}

export function cashFlow30Days(state: LifeOSState, fromIso = todayISO()) {
  const p = cashFlowProjection(state, 30, fromIso);
  return {
    ...p,
  };
}

export function resaleGananciaTotal(state: LifeOSState): number {
  return (state.resale?.inventory || [])
    .filter((i) => i.status === 'vendido')
    .reduce((s, i) => {
      const breakdown = Number(i.shippingCost || 0) + Number(i.platformFees || 0) + Number(i.taxes || 0);
      return s + Number(i.sellPrice || 0) - Number(i.buyPrice || 0) - (breakdown > 0 ? breakdown : Number(i.fees || 0));
    }, 0);
}

function isOperationalTransaction(transaction: Transaction): boolean {
  return transaction.origin !== 'adjustment';
}

export function txInMonth(state: LifeOSState, offset = 0): Transaction[] {
  const ref = monthLabel(offset);
  return (state.finance?.transactions || []).filter((t) => sameMonth(t.date, ref));
}

export function calcSpentMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcIncomeMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'ingreso' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcFixedSpentMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && t.fixed === 'fijo' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcMonthComparison(state: LifeOSState): { pct: number; dir: 'up' | 'down' | 'flat' } {
  const cur = calcSpentMonth(state, 0);
  const prev = calcSpentMonth(state, -1);
  if (prev === 0) {
    return cur === 0 ? { pct: 0, dir: 'flat' } : { pct: 100, dir: 'up' };
  }
  const pct = ((cur - prev) / prev) * 100;
  return { pct: Math.abs(pct), dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

export function calcSpentByCategory(state: LifeOSState, offset = 0): Record<string, number> {
  const map: Record<string, number> = {};
  txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount || 0);
    });
  return map;
}

export function calcSpentByCategoryAllTime(state: LifeOSState): Record<string, number> {
  const map: Record<string, number> = {};
  (state.finance?.transactions || [])
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount || 0);
    });
  return map;
}

export interface MonthTransactionGroup {
  key: string;
  label: string;
  txs: Transaction[];
  totalGasto: number;
  totalIngreso: number;
  isCurrent: boolean;
}

export function groupTransactionsByMonth(state: LifeOSState): MonthTransactionGroup[] {
  const groups: Record<string, Transaction[]> = {};
  (state.finance?.transactions || []).filter(isOperationalTransaction).forEach((t) => {
    const key = t.date.slice(0, 7); // YYYY-MM
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const curKey = todayISO().slice(0, 7);
  return Object.keys(groups)
    .sort((a,b) => b.localeCompare(a))
    .map((key) => {
      const txs = groups[key].sort((a, b) => b.date.localeCompare(a.date));
      const totalGasto = txs.filter((t) => t.type === 'gasto' && isOperationalTransaction(t)).reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalIngreso = txs.filter((t) => t.type === 'ingreso' && isOperationalTransaction(t)).reduce((s, t) => s + Number(t.amount || 0), 0);
      const parts = key.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = new Date(y, m, 1);
      const labelRaw = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
      return { key, label, txs, totalGasto, totalIngreso, isCurrent: key === curKey };
    });
}

export function sortedWeight(state: LifeOSState) {
  return [...(state.gym?.weight || [])].sort((a, b) => a.date.localeCompare(b.date));
}

export function currentWeight(state: LifeOSState): number | null {
  const w = sortedWeight(state);
  return w.length ? w[w.length - 1].kg : null;
}

export function firstWeight(state: LifeOSState): number | null {
  const w = sortedWeight(state);
  return w.length ? w[0].kg : null;
}

export function weightVariation(state: LifeOSState): number | null {
  const c = currentWeight(state);
  const f = firstWeight(state);
  if (c == null || f == null) return null;
  return c - f;
}

export function calcIMC(state: LifeOSState): number | null {
  const weight = currentWeight(state);
  const heightCm = state.profile?.height;
  if (!weight || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return +(weight / (heightM * heightM)).toFixed(1);
}

export function imcCategory(imc: number | null): { label: string; color: 'blue' | 'green' | 'amber' | 'red' } {
  if (imc == null) return { label: 'Sin datos', color: 'blue' };
  if (imc < 18.5) return { label: 'Bajo peso', color: 'blue' };
  if (imc < 25) return { label: 'Normal', color: 'green' };
  if (imc < 30) return { label: 'Sobrepeso', color: 'amber' };
  return { label: 'Obesidad', color: 'red' };
}


export function trainedDatesSet(state: LifeOSState): Set<string> {
  return new Set((state.gym?.sessions || []).filter(isPerformedGymSession).map((s) => s.date));
}

export interface GymStreakDetails {
  streakDays: number;
  workoutCount: number;
  restDaysCount: number;
  weeksStreak: number;
  isTrainedToday: boolean;
  isRestToday: boolean;
  status: 'trained_today' | 'rest_today' | 'pending_today' | 'broken';
  label: string;
}

export function calcGymStreakDetails(state: LifeOSState): GymStreakDetails {
  const sessions = (state.gym.sessions || []).filter(isPerformedGymSession);
  if (sessions.length === 0) {
    return {
      streakDays: 0,
      workoutCount: 0,
      restDaysCount: 0,
      weeksStreak: 0,
      isTrainedToday: false,
      isRestToday: false,
      status: 'broken',
      label: '0 días',
    };
  }

  const trainedDates = new Set(sessions.map((s) => s.date));
  const restDates = new Set([
    ...(state.gym.restDays || []),
    ...Object.entries(state.checkoutLog || {})
      .filter(([_, log]) => log && log.trainedSkipped)
      .map(([date]) => date),
  ]);

  const today = todayISO();
  const isTrainedToday = trainedDates.has(today);
  const isRestToday = restDates.has(today);

  const currentD = new Date();
  let status: GymStreakDetails['status'] = 'pending_today';

  let streakDays = 0;
  let workoutCount = 0;
  let restDaysCount = 0;
  let consecutiveRest = 0;

  if (isTrainedToday) {
    status = 'trained_today';
    streakDays++;
    workoutCount++;
    currentD.setDate(currentD.getDate() - 1);
  } else if (isRestToday) {
    status = 'rest_today';
    streakDays++;
    restDaysCount++;
    currentD.setDate(currentD.getDate() - 1);
  } else {
    // Today hasn't been logged yet: evaluate from yesterday
    status = 'pending_today';
    currentD.setDate(currentD.getDate() - 1);
  }

  // Iterate backwards from previous days
  while (true) {
    const y = currentD.getFullYear();
    const m = String(currentD.getMonth() + 1).padStart(2, '0');
    const day = String(currentD.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${day}`;
    const dayOfWeek = currentD.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (trainedDates.has(iso)) {
      streakDays++;
      workoutCount++;
      consecutiveRest = 0;
      currentD.setDate(currentD.getDate() - 1);
    } else if (restDates.has(iso) || isWeekend) {
      streakDays++;
      restDaysCount++;
      consecutiveRest = 0;
      currentD.setDate(currentD.getDate() - 1);
    } else if (consecutiveRest < 2 && (streakDays > 0 || !isTrainedToday && !isRestToday)) {
      // Natural rest gap of up to 2 days between sessions
      consecutiveRest++;
      streakDays++;
      restDaysCount++;
      currentD.setDate(currentD.getDate() - 1);
    } else {
      break;
    }
  }

  // If no workouts were ever encountered in this sequence, streak is 0
  if (workoutCount === 0) {
    streakDays = 0;
    restDaysCount = 0;
    status = 'broken';
  }

  // Calculate consecutive weeks with at least 1 workout
  let weeksStreak = 0;
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7; // Monday = 0
  const currMon = new Date(now);
  currMon.setDate(now.getDate() - dayIdx);
  currMon.setHours(0, 0, 0, 0);

  const checkWeekMon = new Date(currMon);

  const hasWorkoutInWeek = (monDate: Date) => {
    const sunDate = new Date(monDate);
    sunDate.setDate(monDate.getDate() + 6);
    const monISO = monDate.toISOString().slice(0, 10);
    const sunISO = sunDate.toISOString().slice(0, 10);
    return sessions.some((s) => s.date >= monISO && s.date <= sunISO);
  };

  // If current week has workouts, count it; if not yet, see if last week had workouts
  const iterMon = new Date(checkWeekMon);
  if (!hasWorkoutInWeek(iterMon)) {
    iterMon.setDate(iterMon.getDate() - 7);
  }

  while (hasWorkoutInWeek(iterMon)) {
    weeksStreak++;
    iterMon.setDate(iterMon.getDate() - 7);
  }

  let label = `${streakDays} día${streakDays === 1 ? '' : 's'}`;
  if (status === 'trained_today') {
    label += ' · Entrenado';
  } else if (status === 'rest_today') {
    label += ' · Descanso';
  } else if (status === 'pending_today' && streakDays > 0) {
    label += ' · En curso';
  }

  return {
    streakDays,
    workoutCount,
    restDaysCount,
    weeksStreak,
    isTrainedToday,
    isRestToday,
    status,
    label,
  };
}

export function calcGymStreak(state: LifeOSState): number {
  return calcGymStreakDetails(state).streakDays;
}

export interface PRInfo {
  weight: number;
  reps: number;
  date: string;
}

export function calcPRs(state: LifeOSState): Record<string, PRInfo> {
  const prs: Record<string, PRInfo> = {};
  for (const [key, records] of Object.entries(calcDetailedPRs(state.gym.sessions || []))) {
    if (!records.maxWeight) continue;
    const exerciseName = records.exerciseName?.trim() || key;
    const outputKey = prs[exerciseName] ? `${exerciseName} (${records.exerciseId || key})` : exerciseName;
    prs[outputKey] = {
      weight: records.maxWeight.weight || records.maxWeight.value,
      reps: records.maxWeight.reps || 0,
      date: records.maxWeight.date,
    };
  }
  return prs;
}

export function studyMinutesForDate(state: LifeOSState, iso: string): number {
  return (state.study?.studyLog || []).filter((l) => l.date === iso).reduce((s, l) => s + Number(l.minutes || 0), 0);
}

export function studyMinutesThisWeek(state: LifeOSState): number {
  return (state.study?.studyLog || []).filter((l) => withinCurrentWeek(l.date)).reduce((s, l) => s + Number(l.minutes || 0), 0);
}

export function nextExam(state: LifeOSState) {
  const today = todayISO();
  const pend = (state.study?.exams || [])
    .filter((e) => e.status === 'pendiente' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return pend.length ? pend[0] : null;
}

export function examApprovalPct(state: LifeOSState): number | null {
  const done = (state.study?.exams || []).filter((e) => e.status === 'aprobado' || e.status === 'desaprobado');
  if (done.length === 0) return null;
  const ap = done.filter((e) => e.status === 'aprobado').length;
  return (ap / done.length) * 100;
}

export function streamSessionsInMonth(state: LifeOSState, offset = 0) {
  const ref = monthLabel(offset);
  return (state.streaming?.sessions || []).filter((s) => sameMonth(s.date, ref));
}

export function todayStreamStatus(state: LifeOSState) {
  const iso = todayISO();
  const s = (state.streaming?.sessions || []).find((x) => x.date === iso);
  return s ? { live: true, hours: s.hours } : { live: false, hours: 0 };
}

export const EVENT_TYPE_META = {
  cumpleanos: { label: 'Cumpleaños', icon: '🎂', pill: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  estreno: { label: 'Estreno', icon: '🎬', pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  importante: { label: 'Importante', icon: '⭐', pill: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  otro: { label: 'Otro', icon: '📌', pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
};

export function eventsOnDate(state: LifeOSState, iso: string): CalendarEvent[] {
  const parts = iso.split('-');
  const m = parts[1];
  const d = parts[2];
  return (state.calendarEvents || []).filter((e) => {
    if (e.recurring) {
      const eParts = e.date.split('-');
      return eParts[1] === m && eParts[2] === d;
    }
    return e.date === iso;
  });
}

export interface CalendarDisplayItem {
  id: string;
  name: string;
  date: string;
  type: 'cumpleanos' | 'estreno' | 'importante' | 'otro' | 'entrega' | 'examen' | 'finanza_compromiso' | 'finanza_ingreso';
  icon: string;
  pill: string;
  isDone?: boolean;
  isDeadline?: boolean;
  financialAmount?: number;
  financialType?: 'commitment' | 'income';
  financialId?: string;
  frequency?: string;
  remainingOccurrences?: number | null;
  category?: string | null;
}

export function calendarItemsOnDate(state: LifeOSState, iso: string): CalendarDisplayItem[] {
  const items: CalendarDisplayItem[] = [];

  // 1. Regular Calendar Events
  const baseEvents = eventsOnDate(state, iso);
  for (const e of baseEvents) {
    const meta = EVENT_TYPE_META[e.type] || EVENT_TYPE_META.otro;
    items.push({
      id: e.id,
      name: e.name,
      date: iso,
      type: e.type,
      icon: meta.icon,
      pill: meta.pill,
    });
  }

  // 2. Study Exams
  for (const ex of state.study?.exams || []) {
    if (ex.date === iso) {
      const subject = (state.study?.subjects || []).find((s) => s.id === ex.subjectId);
      const subName = subject?.name || 'Materia';
      items.push({
        id: `exam-${ex.id}`,
        name: `Examen: ${subName}`,
        date: iso,
        type: 'examen',
        icon: '📝',
        pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold',
        isDone: ex.status === 'aprobado',
      });
    }
  }

  // 3. Task deadlines (TodayExtras)
  for (const extra of state.todayExtras || []) {
    if (extra.dueDate === iso) {
      items.push({
        id: `deadline-extra-${extra.id}`,
        name: extra.text,
        date: iso,
        type: 'entrega',
        icon: '⏱️',
        pill: extra.done
          ? 'bg-emerald-50 text-emerald-600 line-through dark:bg-emerald-950/30 dark:text-emerald-400'
          : 'bg-rose-100 text-rose-800 font-bold dark:bg-rose-900/40 dark:text-rose-300',
        isDone: extra.done,
        isDeadline: true,
      });
    }
  }

  // 4. Project tasks deadlines
  for (const p of state.projects || []) {
    for (const t of p.tasks || []) {
      if (t.dueDate === iso) {
        items.push({
          id: `deadline-task-${t.id}`,
          name: `[${p.name}] ${t.text}`,
          date: iso,
          type: 'entrega',
          icon: '⏱️',
          pill: t.done
            ? 'bg-emerald-50 text-emerald-600 line-through dark:bg-emerald-950/30 dark:text-emerald-400'
            : 'bg-rose-100 text-rose-800 font-bold dark:bg-rose-900/40 dark:text-rose-300',
          isDone: t.done,
          isDeadline: true,
        });
      }
    }
  }

  // 5. Financial Commitments
  for (const com of state.finance?.commitments || []) {
    if (!com.active || Number(com.amount || 0) <= 0) continue;
    const occs = getCommitmentOccurrences(com, iso, iso, false);
    if (occs.length > 0) {
      const remainingLabel =
        com.remainingOccurrences !== null && com.remainingOccurrences !== undefined
          ? ` (${com.remainingOccurrences} rest.)`
          : '';
      items.push({
        id: `cal-com-${com.id}-${iso}`,
        name: `${com.name}: -$${com.amount.toLocaleString('es-UY')}${remainingLabel}`,
        date: iso,
        type: 'finanza_compromiso',
        icon: '💳',
        pill: 'bg-rose-100 text-rose-800 font-bold dark:bg-rose-900/40 dark:text-rose-300',
        financialAmount: com.amount,
        financialType: 'commitment',
        financialId: com.id,
        frequency: com.frequency,
        remainingOccurrences: com.remainingOccurrences,
        category: com.category,
      });
    }
  }

  // 6. Expected Incomes
  for (const inc of state.finance?.expectedIncomes || []) {
    if (!inc.active || Number(inc.amount || 0) <= 0) continue;
    const occs = getExpectedIncomeOccurrences(inc, iso, iso);
    if (occs.length > 0) {
      items.push({
        id: `cal-inc-${inc.id}-${iso}`,
        name: `${inc.name}: +$${inc.amount.toLocaleString('es-UY')}`,
        date: iso,
        type: 'finanza_ingreso',
        icon: '💰',
        pill: 'bg-emerald-100 text-emerald-800 font-bold dark:bg-emerald-900/40 dark:text-emerald-300',
        financialAmount: inc.amount,
        financialType: 'income',
        financialId: inc.id,
        frequency: inc.frequency,
        category: inc.category,
      });
    }
  }

  return items;
}

export function nextOccurrence(e: CalendarEvent): string {
  const today = todayISO();
  if (e.recurring) {
    const parts = e.date.split('-');
    const m = parts[1];
    const d = parts[2];
    const y = new Date().getFullYear();
    let candidate = `${y}-${m}-${d}`;
    if (candidate < today) candidate = `${y + 1}-${m}-${d}`;
    return candidate;
  }
  return e.date;
}

export function upcomingEvents(state: LifeOSState, limit = 5) {
  return (state.calendarEvents || [])
    .map((e) => ({ ...e, occursOn: nextOccurrence(e) }))
    .filter((e) => e.recurring || e.date >= todayISO())
    .sort((a, b) => a.occursOn.localeCompare(b.occursOn))
    .slice(0, limit);
}

export function hasGymSessionOn(state: LifeOSState, dateIso: string): boolean {
  return (state.gym?.sessions || []).some((s) => s.date === dateIso);
}

export function hasStudyLogOn(state: LifeOSState, dateIso: string): boolean {
  return (state.study?.studyLog || []).some((l) => l.date === dateIso);
}

export function hasTransactionOn(state: LifeOSState, dateIso: string): boolean {
  return (state.finance?.transactions || []).some((t) => t.date === dateIso);
}

export function checkoutQuestionsFor(state: LifeOSState, dateIso: string) {
  const log = (state.checkoutLog || {})[dateIso] || {};
  return {
    trained: !hasGymSessionOn(state, dateIso) && !log.trainedSkipped,
    studied: !hasStudyLogOn(state, dateIso) && !log.studiedSkipped,
    expenses: !hasTransactionOn(state, dateIso) && !log.expensesSkipped,
  };
}

export function findNowAndNext(state: LifeOSState, referenceDate = new Date()) {
  const dayKey = dayKeyFromDate(referenceDate);
  const blocks = [...(state.agenda[dayKey] || [])].sort((a, b) => a.time.localeCompare(b.time));
  const curMin = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  let current: AgendaBlock | null = null;
  let next: AgendaBlock | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const [h, m] = blocks[i].time.split(':').map(Number);
    const blockMin = h * 60 + m;
    if (blockMin <= curMin) {
      // Determine duration threshold until next block or default 90 min
      const nextBlock = blocks[i + 1];
      let maxDuration = 90;
      if (nextBlock) {
        const [nh, nm] = nextBlock.time.split(':').map(Number);
        maxDuration = Math.min(180, Math.max(30, (nh * 60 + nm) - blockMin));
      }
      if (curMin - blockMin <= maxDuration) {
        current = blocks[i];
      }
    } else {
      next = blocks[i];
      break;
    }
  }
  return { current, next, dayKey };
}

export interface TodayGymStatus {
  status: 'trained_today' | 'rest_today' | 'pending_today';
  todaySession: GymSession | null;
  completedSetsCount: number;
  totalSetsCount: number;
  streakDays: number;
  weeksStreak: number;
  totalVolume: number;
}

export function todayGymStatus(state: LifeOSState, dateIso = todayISO()): TodayGymStatus {
  const streakDetails = calcGymStreakDetails(state);
  const session = state.gym.sessions.find((s) => s.date === dateIso && isPerformedGymSession(s)) || null;
  const isRestDay = (state.gym.restDays || []).includes(dateIso) || Boolean(state.checkoutLog[dateIso]?.trainedSkipped);

  let totalSets = 0;
  let completedSets = 0;
  let totalVolume = 0;

  if (session) {
    (session.exercises || []).forEach((ex) => {
      (ex.sets || []).forEach((set) => {
        totalSets++;
        if (set.completed) completedSets++;
        if (set.completed === true) {
          totalVolume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
        }
      });
    });
  }

  const status: TodayGymStatus['status'] = session
    ? 'trained_today'
    : isRestDay
    ? 'rest_today'
    : 'pending_today';

  return {
    status,
    todaySession: session,
    completedSetsCount: completedSets,
    totalSetsCount: totalSets,
    streakDays: streakDetails.streakDays,
    weeksStreak: streakDetails.weeksStreak,
    totalVolume: session ? getPerformedGymVolume(session) : totalVolume,
  };
}

export function jobStats(state: LifeOSState) {
  const apps = state.jobs?.applications || [];
  const cvEnviados = apps.filter((a) => a.estado !== 'pendiente').length;
  const entrevistas = apps.filter((a) => a.estado === 'entrevista').length;
  const empresas = new Set(apps.map((a) => a.empresa)).size;
  const seguimientosPendientes = apps.filter((a) => a.nextActionDate && a.nextActionDate <= todayISO()).length;
  return {
    cvEnviados,
    entrevistas,
    empresas,
    ofertasNuevas: (state.jobs?.opportunities || []).filter((o) => o.status === 'nueva').length,
    seguimientosPendientes,
  };
}

export function resaleStats(state: LifeOSState) {
  const inv = state.resale?.inventory || [];
  const stock = inv.filter((i) => i.status === 'comprado').length;
  const vendidos = inv.filter((i) => i.status === 'vendido');
  const ventas = vendidos.length;
  const compras = inv.length;
  const netProfit = (item: (typeof vendidos)[number]) => {
    const breakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0);
    return Number(item.sellPrice || 0) - Number(item.buyPrice || 0) - (breakdown > 0 ? breakdown : Number(item.fees || 0));
  };
  const gananciaTotal = vendidos.reduce((s, i) => s + netProfit(i), 0);
  const gananciaPromedio = ventas ? gananciaTotal / ventas : 0;
  const costoTotal = vendidos.reduce((s, i) => {
    const breakdown = Number(i.shippingCost || 0) + Number(i.platformFees || 0) + Number(i.taxes || 0);
    return s + Number(i.buyPrice || 0) + (breakdown > 0 ? breakdown : Number(i.fees || 0));
  }, 0);
  const roi = costoTotal > 0 ? (gananciaTotal / costoTotal) * 100 : 0;
  const tiempos = vendidos
    .filter((i) => i.buyDate && i.sellDate)
    .map((i) => daysBetween(i.buyDate, i.sellDate!));
  const tiempoPromedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;
  const ranking = [...vendidos]
    .sort((a, b) => netProfit(b) - netProfit(a))
    .slice(0, 5);
  return {
    stock,
    ventas,
    compras,
    gananciaTotal,
    gananciaPromedio,
    roi,
    tiempoPromedio,
    ranking,
    oportunidadesNuevas: (state.resale?.opportunities || []).filter((o) => o.status === 'nueva').length,
  };
}

export function goalCurrentValue(state: LifeOSState, g: Goal): number {
  if (g.linked === 'weight') {
    const w = currentWeight(state);
    return w != null ? w : g.current;
  }
  if (g.linked === 'available') {
    return calcAccountsTotal(state);
  }
  if (g.linked === 'net_worth') {
    return calcNetWorth(state);
  }
  if (g.linked === 'gym_sessions') {
    return (state.gym?.sessions || []).filter((s) => s.status === 'completed').length;
  }
  if (g.linked === 'study_hours') {
    const totalMinutes = (state.study?.studyLog || []).reduce((s, l) => s + Number(l.minutes || 0), 0);
    return Math.round((totalMinutes / 60) * 10) / 10;
  }
  if (g.linked === 'resale_profit') {
    return resaleStats(state).gananciaTotal;
  }
  return g.current;
}

export function goalProgressPct(g: Goal, cur: number): number {
  if (cur == null || isNaN(cur)) return 0;
  if (g.target === g.initial) return cur >= g.target ? 100 : 0;
  const rawPct = ((cur - g.initial) / (g.target - g.initial)) * 100;
  if (isNaN(rawPct)) return 0;
  return Math.round(clamp(rawPct, 0, 100));
}

export function computeAgendaPriority(block: AgendaBlock, done: boolean): number {
  if (done) return 1;
  const now = new Date();
  const [h, m] = (block.time || '00:00').split(':').map(Number);
  const blockMin = h * 60 + m;
  const curMin = now.getHours() * 60 + now.getMinutes();
  const diff = blockMin - curMin;
  if (diff < 0) return 5;
  if (diff <= 120) return 4;
  return 3;
}

export function computeRutinaPriority(task: TaskRecurring, done: boolean): number {
  if (done) return 1;
  let base = task.freq === 'daily' ? 4 : task.freq === '2-3x' ? 3 : 2;
  if (new Date().getHours() >= 20) base = Math.min(5, base + 1);
  return base;
}

export function computeExtraPriority(extra: TodayExtra): number {
  if (extra.done) return 1;
  const map: Record<string, number> = { alta: 5, media: 3, baja: 2 };
  return map[extra.priority] || 3;
}

export function computeResaleMarginPct(o: ResaleOpportunity): number {
  const buy = Number(o.buyPrice || 0);
  const market = Number(o.marketPrice || 0);
  if (buy <= 0) return 0;
  return ((market - buy) / buy) * 100;
}

export function computeResalePriority(o: ResaleOpportunity): number {
  const pct = computeResaleMarginPct(o);
  if (pct >= 40) return 5;
  if (pct >= 25) return 4;
  if (pct >= 15) return 3;
  if (pct > 0) return 2;
  return 1;
}

export function computeFollowupPriority(dateStr: string): number {
  if (dateStr < todayISO()) return 5;
  return 4;
}

export interface TodayItem {
  id: string;
  text: string;
  done: boolean;
  source: 'agenda' | 'rutina' | 'extra' | 'trabajo';
  kind: 'toggle-task-today' | 'toggle-extra-today' | 'complete-followup';
  priority: number;
  effort: EffortLevel;
  dueDate?: string;
  isBlocked?: boolean;
  blockingTaskNames?: string[];
  unblocksCount?: number;
}

export function routineScheduledFor(state: LifeOSState, task: TaskRecurring, iso: string): boolean {
  const day = dayKeyFromDate(new Date(`${iso}T00:00:00`));
  if (task.days?.length) return task.days.includes(day);
  if (task.freq === 'daily') return true;
  if (state.taskLog[iso]?.[task.id]) return true;

  const monday = isoWeekMonday(new Date(`${iso}T00:00:00`));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const completedThisWeek = Object.entries(state.taskLog).filter(([date, log]) => {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed >= monday && parsed <= sunday && Boolean(log[task.id]);
  }).length;
  return completedThisWeek < (task.freq === 'weekly' ? 1 : 3);
}

export function todayItems(state: LifeOSState, dateIso?: string, includeFollowups?: boolean): TodayItem[] {
  const iso = dateIso || todayISO();
  if (includeFollowups === undefined) includeFollowups = iso === todayISO();
  const dayKey = dayKeyFromDate(new Date(iso + 'T00:00:00'));
  const log = (state.taskLog || {})[iso] || {};
  const items: TodayItem[] = [];
  const taskMap = getUnifiedTaskMap(state);

  if (isModuleEnabled(state, 'agenda')) {
    [...((state.agenda || {})[dayKey] || [])]
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((b) => {
        const done = Boolean(log[b.id]);
        items.push({
          id: b.id,
          text: `${b.activity} · ${b.time}`,
          done,
          source: 'agenda',
          kind: 'toggle-task-today',
          priority: computeAgendaPriority(b, done),
          effort: b.effort || 'medium',
        });
      });
  }

  (state.tasksRecurring || []).forEach((t) => {
    if (!routineScheduledFor(state, t, iso)) return;
    const done = Boolean(log[t.id]);
    items.push({
      id: t.id,
      text: t.name,
      done,
      source: 'rutina',
      kind: 'toggle-task-today',
      priority: computeRutinaPriority(t, done),
      effort: t.effort || 'medium',
    });
  });

  (state.todayExtras || [])
    .filter((x) => x.date === iso)
    .forEach((x) => {
      const task = taskMap.get(x.id);
      const blockers = task ? getBlockingTasks(task, taskMap) : [];
      const isBlocked = blockers.length > 0;
      const blockingTaskNames = blockers.map((b) => b.text);
      const unblocksCount = task ? getUnblockedCountIfCompleted(task.id, taskMap) : 0;

      items.push({
        id: x.id,
        text: x.text,
        done: Boolean(x.done),
        source: 'extra',
        kind: 'toggle-extra-today',
        priority: computeExtraPriority(x),
        effort: x.effort || 'medium',
        dueDate: x.dueDate,
        isBlocked,
        blockingTaskNames,
        unblocksCount,
      });
    });

  if (includeFollowups && isModuleEnabled(state, 'trabajo')) {
    (state.jobs?.applications || [])
      .filter((a) => a.nextActionDate && a.nextActionDate <= iso)
      .forEach((a) => {
        items.push({
          id: a.id,
          text: `${a.nextAction || 'Seguimiento'} — ${a.empresa}`,
          done: false,
          source: 'trabajo',
          kind: 'complete-followup',
          priority: computeFollowupPriority(a.nextActionDate!),
          effort: 'medium',
        });
      });
  }

  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.priority - a.priority;
  });

  return items;
}

export function pendingTodayCount(state: LifeOSState): number {
  return todayItems(state).filter((i) => !i.done).length;
}
