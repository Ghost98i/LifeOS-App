import type { LifeOSState } from '../types';
import { calcCashOutflowMonth, calcTotalAcquisitionsMonth } from './calculations';

/** Compare the same reading, currency and calendar offset as the headline. */
export function financeMonthComparison(state: LifeOSState, offset: number, currency: string, mode: 'cash_flow' | 'acquisitions') {
  const amount = (month: number) => mode === 'cash_flow'
    ? calcCashOutflowMonth(state, month, currency).totalOutflow
    : calcTotalAcquisitionsMonth(state, month, currency).totalAcquired;
  const current = amount(offset);
  const previous = amount(offset - 1);
  const pct = current > 0 && previous > 0 ? Math.abs((current - previous) / previous * 100) : null;
  const dir = pct === null || pct <= 0.5 ? 'flat' : current > previous ? 'up' : 'down';
  return { current, previous, pct, dir } as const;
}
