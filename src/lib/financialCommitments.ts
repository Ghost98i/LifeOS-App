import { FinancialCommitment, CashFlowForecastItem, ExpectedIncome } from '../types';

export interface CushionEvaluation {
  status: 'ok' | 'below_current' | 'projected_below' | 'disabled';
  currentBalance: number;
  minProjectedBalance: number;
  minCushion: number | null;
  shortfall: number;
  message: string;
}

const toDate = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Calculates Real Available balance:
 * Saldo actual en cuentas - Dinero comprometido en el horizonte.
 */
export function calculateRealAvailable(currentBalance: number, committedAmount: number): number {
  return Math.round((Number(currentBalance || 0) - Number(committedAmount || 0)) * 100) / 100;
}

/**
 * Evaluates minimum liquidity cushion status against current balance and projected trajectory.
 * Distinguishes:
 * - 'disabled': cushion disabled or null/0
 * - 'below_current': current balance is currently below cushion
 * - 'projected_below': current balance is above cushion, but projected to fall below
 * - 'ok': balance stays above cushion throughout projection
 */
export function evaluateCushionStatus(
  currentBalance: number,
  minProjectedBalance: number,
  minCushion?: number | null,
  cushionEnabled?: boolean
): CushionEvaluation {
  if (cushionEnabled === false || minCushion === null || minCushion === undefined || Number(minCushion) <= 0) {
    return {
      status: 'disabled',
      currentBalance,
      minProjectedBalance,
      minCushion: null,
      shortfall: 0,
      message: 'Colchón financiero desactivado.',
    };
  }

  const cushion = Number(minCushion);
  const curBal = Number(currentBalance || 0);
  const minProj = Number(minProjectedBalance || 0);

  if (curBal < cushion) {
    const shortfall = Math.round((cushion - curBal) * 100) / 100;
    return {
      status: 'below_current',
      currentBalance: curBal,
      minProjectedBalance: minProj,
      minCushion: cushion,
      shortfall,
      message: `Tu saldo actual está $${shortfall.toLocaleString('es-UY')} por debajo de tu colchón mínimo ($${cushion.toLocaleString('es-UY')}).`,
    };
  }

  if (minProj < cushion) {
    const shortfall = Math.round((cushion - minProj) * 100) / 100;
    return {
      status: 'projected_below',
      currentBalance: curBal,
      minProjectedBalance: minProj,
      minCushion: cushion,
      shortfall,
      message: `Tu saldo proyectado cae $${shortfall.toLocaleString('es-UY')} por debajo de tu colchón mínimo ($${cushion.toLocaleString('es-UY')}).`,
    };
  }

  return {
    status: 'ok',
    currentBalance: curBal,
    minProjectedBalance: minProj,
    minCushion: cushion,
    shortfall: 0,
    message: `Tu saldo proyectado se mantiene por encima de tu colchón mínimo ($${cushion.toLocaleString('es-UY')}).`,
  };
}

/**
 * Generates future occurrences of a commitment within a date range [fromIso, horizonIso].
 * Strictly respects:
 * - active status
 * - endDate
 * - remainingOccurrences (finite installments / cuotas stop when exhausted)
 * - overdue items (pending obligations due immediately)
 */
export function getCommitmentOccurrences(
  commitment: FinancialCommitment,
  fromIso: string,
  horizonIso: string,
  includeOverdue = true
): CashFlowForecastItem[] {
  if (!commitment.active || Number(commitment.amount || 0) <= 0) return [];
  if (commitment.remainingOccurrences !== null && commitment.remainingOccurrences !== undefined && commitment.remainingOccurrences <= 0) {
    return [];
  }

  const items: CashFlowForecastItem[] = [];
  const amount = Number(commitment.amount);
  const startIso = commitment.nextDueDate || fromIso;
  const endIso = commitment.endDate || null;
  const maxRemaining =
    commitment.remainingOccurrences !== null && commitment.remainingOccurrences !== undefined
      ? commitment.remainingOccurrences
      : Infinity;

  let occurrencesGenerated = 0;

  const pushIfValid = (dIso: string, isOverdue = false) => {
    if (occurrencesGenerated >= maxRemaining) return false;
    if (endIso && dIso > endIso) return false;

    // Use dIso for occurrence date, but if overdue and before fromIso, project on fromIso for cash flow
    const effectiveDate = dIso < fromIso ? fromIso : dIso;
    if (effectiveDate > horizonIso) return false;

    items.push({
      id: `com-${commitment.id}-${dIso}`,
      date: effectiveDate,
      label: commitment.name,
      amount,
      type: 'expense',
      category: commitment.category || 'Varios',
      accountId: commitment.accountId || null,
      sourceId: commitment.id,
      isOverdue,
    });
    occurrencesGenerated++;
    return true;
  };

  // 1. One-time commitment
  if (commitment.frequency === 'once') {
    if (!endIso || startIso <= endIso) {
      if (startIso >= fromIso && startIso <= horizonIso) {
        pushIfValid(startIso, false);
      } else if (startIso < fromIso && includeOverdue) {
        // Overdue pending obligation
        pushIfValid(startIso, true);
      }
    }
    return items;
  }

  // 2. Weekly or Biweekly
  if (commitment.frequency === 'weekly' || commitment.frequency === 'biweekly') {
    const stepDays = commitment.frequency === 'weekly' ? 7 : 14;
    const curr = toDate(startIso);
    const fromDate = toDate(fromIso);
    const horizonDate = toDate(horizonIso);

    // If start is before fromDate, catch up
    if (curr.getTime() < fromDate.getTime()) {
      // If there is an unpaid overdue occurrence
      const overdueIso = toIso(curr);
      if (includeOverdue && (!endIso || overdueIso <= endIso)) {
        pushIfValid(overdueIso, true);
      }

      const diffMs = fromDate.getTime() - curr.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const jumps = Math.floor(diffDays / stepDays);
      curr.setDate(curr.getDate() + jumps * stepDays);
      while (toIso(curr) < fromIso) {
        curr.setDate(curr.getDate() + stepDays);
      }
    }

    while (curr.getTime() <= horizonDate.getTime() && occurrencesGenerated < maxRemaining) {
      const iso = toIso(curr);
      if (endIso && iso > endIso) break;
      const pushed = pushIfValid(iso, false);
      if (!pushed && occurrencesGenerated >= maxRemaining) break;
      curr.setDate(curr.getDate() + stepDays);
    }
    return items;
  }

  // 3. Monthly
  if (commitment.frequency === 'monthly') {
    const startObj = toDate(startIso);
    const targetDay = commitment.dueDay || startObj.getDate();
    const fromObj = toDate(fromIso);

    // If overdue
    if (startIso < fromIso && includeOverdue) {
      pushIfValid(startIso, true);
    }

    let curYear = fromObj.getFullYear();
    let curMonth = fromObj.getMonth();

    while (occurrencesGenerated < maxRemaining) {
      const lastDay = new Date(curYear, curMonth + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(curYear, curMonth, actualDay, 12);
      const iso = toIso(d);
      if (iso > horizonIso) break;
      if (endIso && iso > endIso) break;
      // Do not duplicate overdue start date if it fell in the same month
      if (iso >= fromIso && iso >= startIso) {
        pushIfValid(iso, false);
      }
      curMonth++;
      if (curMonth > 11) {
        curYear += Math.floor(curMonth / 12);
        curMonth = curMonth % 12;
      }
    }
    return items;
  }

  // 4. Yearly
  if (commitment.frequency === 'yearly') {
    const startObj = toDate(startIso);
    const targetMonth = startObj.getMonth();
    const targetDay = commitment.dueDay || startObj.getDate();
    const fromObj = toDate(fromIso);

    if (startIso < fromIso && includeOverdue) {
      pushIfValid(startIso, true);
    }

    let yr = fromObj.getFullYear();
    while (occurrencesGenerated < maxRemaining) {
      const lastDay = new Date(yr, targetMonth + 1, 0).getDate();
      const actualDay = Math.min(targetDay, lastDay);
      const d = new Date(yr, targetMonth, actualDay, 12);
      const iso = toIso(d);
      if (iso > horizonIso) break;
      if (endIso && iso > endIso) break;
      if (iso >= fromIso && iso >= startIso) {
        pushIfValid(iso, false);
      }
      yr++;
    }
    return items;
  }

  return items;
}

/**
 * Advances nextDueDate and decrements remainingOccurrences when confirming a payment.
 * Returns updated fields to merge into commitment draft.
 */
export function advanceCommitmentDueDate(commitment: FinancialCommitment): {
  nextDueDate: string;
  remainingOccurrences: number | null;
  active: boolean;
  status: 'pending' | 'paid';
  currentInstallment?: number | null;
  dueDay?: number | null;
} {
  const currentIso = commitment.nextDueDate || toIso(new Date());
  const curDate = toDate(currentIso);
  const anchorDay = commitment.dueDay || curDate.getDate();

  let newRemaining: number | null = null;
  const initialRemaining = commitment.remainingOccurrences ?? (commitment as any).occurrencesLeft ?? null;
  if (initialRemaining !== null && initialRemaining !== undefined) {
    newRemaining = Math.max(0, initialRemaining - 1);
  }

  const total = commitment.totalInstallments || commitment.totalOccurrences || null;
  let nextInstallment: number | null = null;
  if (commitment.currentInstallment !== null && commitment.currentInstallment !== undefined) {
    nextInstallment = total !== null
      ? Math.min(total, commitment.currentInstallment + 1)
      : commitment.currentInstallment + 1;
  } else if (total !== null && newRemaining !== null) {
    nextInstallment = Math.min(total, total - newRemaining + 1);
  }

  // If once or remaining reaches 0, mark inactive and paid
  if (commitment.frequency === 'once' || (newRemaining !== null && newRemaining <= 0)) {
    return {
      nextDueDate: currentIso,
      remainingOccurrences: newRemaining,
      active: false,
      status: 'paid',
      currentInstallment: nextInstallment,
      dueDay: anchorDay,
    };
  }

  let nextDate = new Date(curDate);
  if (commitment.frequency === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (commitment.frequency === 'biweekly') {
    nextDate.setDate(nextDate.getDate() + 14);
  } else if (commitment.frequency === 'monthly') {
    let y = curDate.getFullYear();
    let m = curDate.getMonth() + 1;
    if (m > 11) {
      y += Math.floor(m / 12);
      m = m % 12;
    }
    const lastDay = new Date(y, m + 1, 0).getDate();
    nextDate = new Date(y, m, Math.min(anchorDay, lastDay), 12);
  } else if (commitment.frequency === 'yearly') {
    const targetMonth = curDate.getMonth();
    const y = curDate.getFullYear() + 1;
    const lastDay = new Date(y, targetMonth + 1, 0).getDate();
    nextDate = new Date(y, targetMonth, Math.min(anchorDay, lastDay), 12);
  }

  const nextIso = toIso(nextDate);

  // If passed endDate, deactivate
  if (commitment.endDate && nextIso > commitment.endDate) {
    return {
      nextDueDate: nextIso,
      remainingOccurrences: newRemaining,
      active: false,
      status: 'paid',
      currentInstallment: nextInstallment,
      dueDay: anchorDay,
    };
  }

  return {
    nextDueDate: nextIso,
    remainingOccurrences: newRemaining,
    active: true,
    status: 'pending',
    currentInstallment: nextInstallment,
    dueDay: anchorDay,
  };
}

/**
 * Advances startDate for an ExpectedIncome when confirmed.
 * One-time expected incomes are marked active: false.
 * Recurring incomes advance to the next occurrence date.
 */
export function advanceExpectedIncomeDate(income: ExpectedIncome): {
  startDate: string;
  active: boolean;
} {
  const currentIso = income.startDate || toIso(new Date());
  if (income.frequency === 'once') {
    return {
      startDate: currentIso,
      active: false,
    };
  }

  const curDate = toDate(currentIso);
  let nextDate = new Date(curDate);

  if (income.frequency === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (income.frequency === 'biweekly') {
    nextDate.setDate(nextDate.getDate() + 14);
  } else if (income.frequency === 'monthly') {
    const targetDay = curDate.getDate();
    let y = curDate.getFullYear();
    let m = curDate.getMonth() + 1;
    if (m > 11) {
      y += Math.floor(m / 12);
      m = m % 12;
    }
    const lastDay = new Date(y, m + 1, 0).getDate();
    nextDate = new Date(y, m, Math.min(targetDay, lastDay), 12);
  } else if (income.frequency === 'yearly') {
    const targetDay = curDate.getDate();
    const targetMonth = curDate.getMonth();
    const y = curDate.getFullYear() + 1;
    const lastDay = new Date(y, targetMonth + 1, 0).getDate();
    nextDate = new Date(y, targetMonth, Math.min(targetDay, lastDay), 12);
  }

  const nextIso = toIso(nextDate);
  if (income.endDate && nextIso > income.endDate) {
    return {
      startDate: nextIso,
      active: false,
    };
  }

  return {
    startDate: nextIso,
    active: true,
  };
}

/**
 * Sorts commitments chronologically ascending by nextDueDate.
 * Ties are broken deterministically by name, then by amount.
 */
export function sortCommitmentsChronologically(commitments: FinancialCommitment[]): FinancialCommitment[] {
  return [...commitments].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const dDiff = a.nextDueDate.localeCompare(b.nextDueDate);
    if (dDiff !== 0) return dDiff;
    const nDiff = a.name.localeCompare(b.name);
    if (nDiff !== 0) return nDiff;
    return (Number(b.amount) || 0) - (Number(a.amount) || 0);
  });
}
