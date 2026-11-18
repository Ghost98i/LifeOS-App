import type { LifeOSState } from '../types';
import { deriveCashflowProjection } from './financeCashflow';
import { confirmedFinancialCurrency } from './financeCurrencyPolicy';
import { todayISO } from './storage';

export type SpendingPacingTone = 'healthy' | 'watch' | 'tight' | 'deficit';

export interface MonthlySpendingPacing {
  currency: string;
  monthIso: string;
  daysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  realBalance: number;
  pendingCommitments: number;
  availableAfterCommitments: number;
  cushionAmount: number;
  freeMarginAfterCushion: number;
  spentThisMonth: number;
  variableSpentThisMonth: number;
  dailySpendRate: number;
  variableDailySpendRate: number;
  dailyAvailableMargin: number;
  usesCushionForMargin: boolean;
  pacingTone: SpendingPacingTone;
  pacingLabel: string;
}

/**
 * Calcula de forma pura y determinista el ritmo de gasto diario del mes en curso
 * y el margen diario real disponible descontando los compromisos pendientes del mes
 * (y respetando el colchón mínimo en UYU cuando está habilitado).
 */
export function deriveMonthlySpendingPacing(
  state: LifeOSState,
  currency = 'UYU',
  referenceIso = todayISO()
): MonthlySpendingPacing {
  const safeCurrency = (currency || 'UYU').toUpperCase();
  const safeIso = /^\d{4}-\d{2}-\d{2}$/.test(referenceIso) ? referenceIso : todayISO();
  const [year, month, day] = safeIso.split('-').map(Number);
  const monthIso = safeIso.slice(0, 7);
  const daysInMonth = new Date(year, month, 0).getDate();
  const elapsedDays = Math.max(1, Math.min(daysInMonth, day));
  const remainingDays = Math.max(1, daysInMonth - elapsedDays + 1);

  const windowProj = deriveCashflowProjection(state, 'month', safeIso);
  const summary = windowProj.summariesByCurrency[safeCurrency] || {
    currency: safeCurrency,
    realBalance: 0,
    committedExpenses: 0,
    availableAfterCommitments: 0,
    expectedIncomes: 0,
    projectedBalance: 0,
  };

  const accountCurrencyById = new Map<string, string>();
  for (const acc of state.finance?.accounts || []) {
    accountCurrencyById.set(acc.id, (acc.currency || 'UYU').toUpperCase());
  }

  let spentThisMonth = 0;
  let variableSpentThisMonth = 0;

  for (const tx of state.finance?.transactions || []) {
    if (tx.type !== 'gasto') continue;
    if (!tx.date || !tx.date.startsWith(monthIso) || tx.date > safeIso) continue;

    const txCurrency = tx.accountId
      ? accountCurrencyById.get(tx.accountId) || confirmedFinancialCurrency(tx.currency) || 'UYU'
      : confirmedFinancialCurrency(tx.currency) || 'UYU';

    if (txCurrency !== safeCurrency) continue;

    const amount = Math.max(0, Number(tx.amount) || 0);
    spentThisMonth += amount;

    const isFixedOrCommitted =
      tx.fixed === 'fijo' ||
      Boolean(tx.commitmentId) ||
      Boolean(tx.agreementId) ||
      tx.origin === 'commitment' ||
      tx.origin === 'debt_payment';

    if (!isFixedOrCommitted) {
      variableSpentThisMonth += amount;
    }
  }

  const realBalance = summary.realBalance;
  const pendingCommitments = summary.committedExpenses;
  const availableAfterCommitments = summary.availableAfterCommitments;

  const cushionEnabled = state.finance?.cushionEnabled !== false;
  const cushionAmount =
    cushionEnabled && safeCurrency === 'UYU'
      ? Math.max(0, Number(state.finance?.minCushion ?? 5000) || 0)
      : 0;

  const freeMarginAfterCushion = availableAfterCommitments - cushionAmount;
  const usesCushionForMargin = cushionAmount > 0 && freeMarginAfterCushion <= 0 && availableAfterCommitments > 0;

  const baseMarginForDays =
    availableAfterCommitments <= 0
      ? 0
      : cushionAmount > 0 && freeMarginAfterCushion > 0
      ? freeMarginAfterCushion
      : availableAfterCommitments;

  const dailyAvailableMargin = Math.round(baseMarginForDays / remainingDays);
  const dailySpendRate = Math.round(spentThisMonth / elapsedDays);
  const variableDailySpendRate = Math.round(variableSpentThisMonth / elapsedDays);

  let pacingTone: SpendingPacingTone = 'healthy';
  let pacingLabel = 'Ritmo sostenible';

  if (availableAfterCommitments <= 0) {
    pacingTone = 'deficit';
    pacingLabel = availableAfterCommitments < 0 ? 'Faltan fondos este mes' : 'Sin margen disponible';
  } else if (usesCushionForMargin) {
    pacingTone = 'tight';
    pacingLabel = 'Operando sobre el colchón';
  } else if (dailyAvailableMargin > 0 && variableDailySpendRate > dailyAvailableMargin * 1.1 && elapsedDays >= 2) {
    pacingTone = 'tight';
    pacingLabel = 'Ritmo supera el margen diario';
  } else if (dailyAvailableMargin > 0 && variableDailySpendRate > dailyAvailableMargin * 0.85 && elapsedDays >= 2) {
    pacingTone = 'watch';
    pacingLabel = 'Cuidar ritmo diario';
  }

  return {
    currency: safeCurrency,
    monthIso,
    daysInMonth,
    elapsedDays,
    remainingDays,
    realBalance,
    pendingCommitments,
    availableAfterCommitments,
    cushionAmount,
    freeMarginAfterCushion,
    spentThisMonth,
    variableSpentThisMonth,
    dailySpendRate,
    variableDailySpendRate,
    dailyAvailableMargin,
    usesCushionForMargin,
    pacingTone,
    pacingLabel,
  };
}
