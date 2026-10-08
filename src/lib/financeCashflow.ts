import {
  CashflowCurrencySummary,
  CashflowEventItem,
  CashflowWindow,
  CashflowWindowProjection,
  LifeOSState,
} from '../types';
import { getCommitmentOccurrences } from './financialCommitments';
import { getExpectedIncomeOccurrences } from './calculations';
import { todayISO } from './storage';

export function parseCivilDate(iso: string): { year: number; month: number; day: number } {
  const parts = iso.split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDaysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getMonthEndIso(fromIso: string): string {
  const { year, month } = parseCivilDate(fromIso);
  const lastDay = getDaysInCivilMonth(year, month);
  return formatCivilDate(year, month, lastDay);
}

export function addDaysCivilIso(fromIso: string, days: number): string {
  const { year, month, day } = parseCivilDate(fromIso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatCivilDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function getCivilWindowBounds(
  window: CashflowWindow,
  fromIso = todayISO(),
): { fromIso: string; horizonIso: string } {
  if (window === '7d') {
    return { fromIso, horizonIso: addDaysCivilIso(fromIso, 7) };
  }
  if (window === 'month') {
    return { fromIso, horizonIso: getMonthEndIso(fromIso) };
  }
  return { fromIso, horizonIso: addDaysCivilIso(fromIso, 30) };
}

function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Derives current real balance exclusively from account balances (ledger-backed).
 * Grouped strictly by currency, never summing different currencies together.
 */
export function getRealBalancesByCurrency(state: LifeOSState): Record<string, number> {
  const result: Record<string, number> = {};
  const accounts = state.finance?.accounts || [];
  for (const account of accounts) {
    const cur = (account.currency || 'UYU').toUpperCase();
    result[cur] = roundMoney((result[cur] || 0) + Number(account.balance || 0));
  }
  if (Object.keys(result).length === 0) {
    result['UYU'] = 0;
  }
  return result;
}

/**
 * Returns pending committed future obligations within the specified window.
 * Strictly respects:
 * - One-time commitments, current cuota / installment (not future installments!), recurring commitments
 * - Subscriptions & Debts
 * - Window boundaries (7d, rest of current month, 30d)
 * - Currencies
 * - Active / pending status only (no paid or cancelled obligations)
 */
export function getCommittedEventsForWindow(
  state: LifeOSState,
  window: CashflowWindow,
  fromIso = todayISO(),
): CashflowEventItem[] {
  const { horizonIso } = getCivilWindowBounds(window, fromIso);
  const events: CashflowEventItem[] = [];

  // 1. Commitments
  const commitments = state.finance?.commitments || [];
  for (const com of commitments) {
    if (!com.active || com.status === 'paid' || com.status === 'cancelled' || Number(com.amount || 0) <= 0) {
      continue;
    }
    const occurrences = getCommitmentOccurrences(com, fromIso, horizonIso, true);
    const cur = (com.currency || 'UYU').toUpperCase();
    for (const occ of occurrences) {
      events.push({
        id: occ.id,
        date: occ.date,
        label: occ.label,
        amount: occ.amount,
        currency: cur,
        type: 'committed_expense',
        category: occ.category,
        accountId: occ.accountId,
        sourceId: occ.sourceId,
        isOverdue: occ.isOverdue,
        kind: 'commitment',
      });
    }
  }

  // 2. Subscriptions
  const subscriptions = state.finance?.subscriptions || [];
  const fromDate = new Date(`${fromIso}T12:00:00`);
  for (const sub of subscriptions) {
    const amount = Number(sub.amount || 0);
    if (amount <= 0 || !sub.dueDay) continue;
    const targetDay = Math.max(1, Math.min(31, sub.dueDay));
    const cur = ((sub as any).currency || 'UYU').toUpperCase();

    // Scan up to 2 months from fromDate to cover any 30d or rest-of-month window
    for (let m = 0; m <= 2; m++) {
      const y = fromDate.getFullYear();
      const month = fromDate.getMonth() + m;
      const lastDay = new Date(y, month + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(y, month, actualDay, 12);
      const iso = formatCivilDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (iso > horizonIso) break;
      if (iso >= fromIso) {
        events.push({
          id: `sub-${sub.id}-${iso}`,
          date: iso,
          label: sub.name,
          amount,
          currency: cur,
          type: 'committed_expense',
          sourceId: sub.id,
          kind: 'subscription',
        });
      }
    }
  }

  // 3. Debts
  const debts = state.finance?.debts || [];
  for (const debt of debts) {
    const payment = Number(debt.monthlyPayment || 0);
    if (payment <= 0) continue;
    const cur = ((debt as any).currency || 'UYU').toUpperCase();
    const startIso = debt.dueDate || fromIso;
    if (debt.dueDate && debt.dueDate > horizonIso) continue;

    const start = new Date(`${startIso}T12:00:00`);
    const targetDay = start.getDate();

    for (let m = 0; m <= 2; m++) {
      const y = fromDate.getFullYear();
      const month = fromDate.getMonth() + m;
      const lastDay = new Date(y, month + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(y, month, actualDay, 12);
      const iso = formatCivilDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (iso > horizonIso) break;
      if (iso >= fromIso && iso >= startIso) {
        events.push({
          id: `debt-${debt.id}-${iso}`,
          date: iso,
          label: debt.name,
          amount: payment,
          currency: cur,
          type: 'committed_expense',
          sourceId: debt.id,
          kind: 'debt',
        });
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Returns expected future incomes within the specified window.
 */
export function getExpectedIncomeEventsForWindow(
  state: LifeOSState,
  window: CashflowWindow,
  fromIso = todayISO(),
): CashflowEventItem[] {
  const { horizonIso } = getCivilWindowBounds(window, fromIso);
  const events: CashflowEventItem[] = [];

  const expectedIncomes = state.finance?.expectedIncomes || [];
  for (const inc of expectedIncomes) {
    if (!inc.active || Number(inc.amount || 0) <= 0) continue;
    const occurrences = getExpectedIncomeOccurrences(inc, fromIso, horizonIso);
    const cur = (inc.currency || 'UYU').toUpperCase();
    for (const occ of occurrences) {
      events.push({
        id: occ.id,
        date: occ.date,
        label: occ.label,
        amount: occ.amount,
        currency: cur,
        type: 'expected_income',
        category: occ.category,
        accountId: occ.accountId,
        sourceId: occ.sourceId,
        kind: 'expected_income',
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculates available funds after deducting committed obligations:
 * realBalance - committedExpenses
 * Explicitly DOES NOT include future expected incomes.
 */
export function calculateAvailableAfterCommitments(realBalance: number, committedExpenses: number): number {
  return roundMoney(Number(realBalance || 0) - Number(committedExpenses || 0));
}

/**
 * Core Cashflow Projection Engine:
 * Answers:
 * 1. Saldo Real (dinero que existe ahora)
 * 2. Comprometido (pagos pendientes de la ventana)
 * 3. Disponible después de compromisos (saldo real - comprometido de la ventana, sin ingresos futuros)
 * 4. Saldo Proyectado (saldo real + ingresos esperados - egresos comprometidos, claramente proyectado)
 * Grouped strictly by currency.
 */
export function deriveCashflowProjection(
  state: LifeOSState,
  window: CashflowWindow = 'month',
  fromIso = todayISO(),
): CashflowWindowProjection {
  const { horizonIso } = getCivilWindowBounds(window, fromIso);
  const realBalances = getRealBalancesByCurrency(state);
  const committedEvents = getCommittedEventsForWindow(state, window, fromIso);
  const incomeEvents = getExpectedIncomeEventsForWindow(state, window, fromIso);

  const committedTotals: Record<string, number> = {};
  for (const event of committedEvents) {
    committedTotals[event.currency] = roundMoney((committedTotals[event.currency] || 0) + event.amount);
  }

  const incomeTotals: Record<string, number> = {};
  for (const event of incomeEvents) {
    incomeTotals[event.currency] = roundMoney((incomeTotals[event.currency] || 0) + event.amount);
  }

  const allCurrencies = new Set([
    ...Object.keys(realBalances),
    ...Object.keys(committedTotals),
    ...Object.keys(incomeTotals),
  ]);
  if (allCurrencies.size === 0) allCurrencies.add('UYU');

  const summariesByCurrency: Record<string, CashflowCurrencySummary> = {};
  for (const cur of allCurrencies) {
    const realBalance = realBalances[cur] || 0;
    const committedExpenses = committedTotals[cur] || 0;
    const expectedIncomes = incomeTotals[cur] || 0;
    const availableAfterCommitments = calculateAvailableAfterCommitments(realBalance, committedExpenses);
    const projectedBalance = roundMoney(realBalance + expectedIncomes - committedExpenses);

    summariesByCurrency[cur] = {
      currency: cur,
      realBalance,
      committedExpenses,
      availableAfterCommitments,
      expectedIncomes,
      projectedBalance,
    };
  }

  const allEvents = [...committedEvents, ...incomeEvents].sort((a, b) => a.date.localeCompare(b.date));

  return {
    window,
    fromIso,
    horizonIso,
    summariesByCurrency,
    events: allEvents,
  };
}
