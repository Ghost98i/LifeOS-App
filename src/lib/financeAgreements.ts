import type {
  AgreementScheduleBreakdown,
  DerivedInstallment,
  FinancingAgreement,
  FinancedAcquisition,
  InstallmentFrequency,
  InstallmentSchedule,
  InstallmentStatus,
  LifeOSState,
  Transaction,
} from '../types';
import { addTransaction } from './financeFlows';
import { diffMoney, roundMoney, sumMoney, todayISO, uid } from './storage';

export interface FinancingAgreementInput {
  id?: string;
  title: string;
  creditorName: string;
  currency?: 'UYU' | 'USD';
  initialRemainingBalance: number;
  initialReferenceDate?: string;
  originalPrincipal?: number | null;
  priorPaidAmount?: number | null;
  notes?: string | null;
  status?: 'active' | 'settled' | 'cancelled';
  linkedLegacyDebtId?: string | null;
  schedule?: InstallmentSchedule | null;
  acquisition?: FinancedAcquisition | null;
}

export interface AgreementPaymentInput {
  agreementId: string;
  amount: number;
  accountId: string;
  date?: string;
  note?: string;
}

/**
 * Validates the arithmetic coherence between originalPrincipal, priorPaidAmount and initialRemainingBalance,
 * and validates the installment schedule if present.
 */
export function validateAgreementCoherence(input: {
  initialRemainingBalance: number;
  originalPrincipal?: number | null;
  priorPaidAmount?: number | null;
  schedule?: InstallmentSchedule | null;
}): { valid: boolean; error?: string } {
  const initBal = roundMoney(input.initialRemainingBalance);
  if (!Number.isFinite(initBal) || initBal <= 0) {
    return { valid: false, error: 'El saldo inicial pendiente debe ser un monto mayor a cero.' };
  }

  const hasOriginal = typeof input.originalPrincipal === 'number' && Number.isFinite(input.originalPrincipal) && input.originalPrincipal > 0;
  const hasPrior = typeof input.priorPaidAmount === 'number' && Number.isFinite(input.priorPaidAmount) && input.priorPaidAmount >= 0;

  if (hasOriginal && hasPrior) {
    const orig = roundMoney(input.originalPrincipal!);
    const prior = roundMoney(input.priorPaidAmount!);
    if (prior > orig) {
      return { valid: false, error: 'Los pagos previos no pueden ser mayores al importe original.' };
    }
    const diff = diffMoney(orig, prior);
    if (Math.abs(diff - initBal) > 0.009) {
      return {
        valid: false,
        error: `Incoherencia aritmética: el importe original ($${orig}) menos los pagos previos ($${prior}) da $${diff}, que no coincide con el saldo inicial pendiente declarado ($${initBal}).`,
      };
    }
  } else if (hasOriginal && !hasPrior) {
    const orig = roundMoney(input.originalPrincipal!);
    if (orig < initBal) {
      return { valid: false, error: 'El importe original no puede ser menor al saldo pendiente actual.' };
    }
  }

  if (input.schedule) {
    if (!Number.isFinite(input.schedule.totalInstallments) || input.schedule.totalInstallments < 1) {
      return { valid: false, error: 'La cantidad total de cuotas debe ser al menos 1.' };
    }
    const instAmt = roundMoney(input.schedule.installmentAmount);
    if (!Number.isFinite(instAmt) || instAmt <= 0) {
      return { valid: false, error: 'El importe por cuota debe ser mayor a cero.' };
    }
    if (!input.schedule.firstDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.schedule.firstDueDate)) {
      return { valid: false, error: 'Ingresá una fecha válida (YYYY-MM-DD) para el primer vencimiento.' };
    }
    const dueDay = input.schedule.dueDay;
    if (typeof dueDay !== 'number' || dueDay < 1 || dueDay > 31) {
      return { valid: false, error: 'El día de vencimiento debe estar entre 1 y 31.' };
    }
  }

  return { valid: true };
}

/**
 * Returns all valid ledger transactions linked to an agreement.
 * Strictly filters out transactions prior to initialReferenceDate, because initialRemainingBalance
 * represents the declared obligation snapshot at that date (prior payments are already contemplated).
 */
export function getAgreementPayments(
  agreement: FinancingAgreement,
  transactions: Transaction[] = [],
): Transaction[] {
  const refDate = agreement.initialReferenceDate;
  return transactions
    .filter((t) => {
      if (t.agreementId !== agreement.id || t.type !== 'gasto' || t.origin === 'adjustment') return false;
      if (refDate && t.date < refDate) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Pure derived computation of the current outstanding balance.
 * Formula:
 *   currentRemaining = initialRemainingBalance - sum(valid linked payments in LifeOS)
 * Strictly preserves cents and never returns negative values.
 */
export function calculateAgreementRemainingBalance(
  agreement: FinancingAgreement,
  transactions: Transaction[] = [],
): number {
  const payments = getAgreementPayments(agreement, transactions);
  const totalPaidInLifeOS = sumMoney(payments.map((t) => t.amount));
  const remaining = diffMoney(agreement.initialRemainingBalance, totalPaidInLifeOS);
  return Math.max(0, remaining);
}

/**
 * Calculates civil due date for a specific installment index without timezone drift.
 * Clamps day of month to the maximum available days in target month, preserving anchor dueDay.
 */
export function calculateInstallmentDate(
  firstDueDate: string,
  dueDay: number,
  installmentIndex: number,
  frequency: InstallmentFrequency = 'monthly'
): string {
  if (installmentIndex <= 0) return firstDueDate;
  const [yearStr, monthStr] = firstDueDate.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  if (frequency === 'monthly') {
    month += installmentIndex;
    year += Math.floor((month - 1) / 12);
    month = ((month - 1) % 12) + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(Math.max(1, dueDay), daysInMonth);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const daysToAdd = frequency === 'weekly' ? installmentIndex * 7 : installmentIndex * 14;
  const base = new Date(`${firstDueDate}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return base.toISOString().slice(0, 10);
}

/**
 * Pure derived computation of installment schedule and payment distribution (waterfall / FIFO).
 * Zero dual source of truth: Installment records 1..N are calculated purely from agreement params
 * and ledger transactions.
 */
export function deriveAgreementSchedule(
  agreement: FinancingAgreement,
  transactions: Transaction[] = [],
  todayDate: string = todayISO()
): AgreementScheduleBreakdown | null {
  if (!agreement.schedule) return null;

  const schedule = agreement.schedule;
  const totalInstallments = Math.max(1, Math.floor(schedule.totalInstallments));
  const baseAmount = roundMoney(schedule.installmentAmount);
  const payments = getAgreementPayments(agreement, transactions);
  const totalPaidInLifeOS = sumMoney(payments.map((t) => t.amount));
  const priorPaid = agreement.priorPaidAmount ? roundMoney(agreement.priorPaidAmount) : 0;
  const cumulativePaid = sumMoney([priorPaid, totalPaidInLifeOS]);

  const totalAgreed = agreement.originalPrincipal
    ? roundMoney(agreement.originalPrincipal)
    : roundMoney(totalInstallments * baseAmount);

  const remainingBalance = calculateAgreementRemainingBalance(agreement, transactions);

  let availableToAllocate = cumulativePaid;
  const installments: DerivedInstallment[] = [];
  let completedCount = 0;
  let nextDue: DerivedInstallment | null = null;

  for (let i = 0; i < totalInstallments; i++) {
    const instNum = i + 1;
    const dueDate = calculateInstallmentDate(
      schedule.firstDueDate,
      schedule.dueDay,
      i,
      schedule.frequency
    );

    // Last installment absorbs cent rounding if totalAgreed is explicitly set
    let requiredAmount = baseAmount;
    if (i === totalInstallments - 1) {
      const expectedPriorSum = roundMoney((totalInstallments - 1) * baseAmount);
      const lastAdj = diffMoney(totalAgreed, expectedPriorSum);
      if (lastAdj > 0) {
        requiredAmount = lastAdj;
      }
    }

    const alloc = Math.min(availableToAllocate, requiredAmount);
    availableToAllocate = diffMoney(availableToAllocate, alloc);
    const remDue = diffMoney(requiredAmount, alloc);

    let status: InstallmentStatus = 'pending';
    const isPaid = remDue <= 0.005;
    const isPartial = !isPaid && alloc > 0.005;
    const isOverdue = !isPaid && dueDate < todayDate;

    if (isPaid) {
      status = 'paid';
      completedCount++;
    } else if (isPartial) {
      status = 'partial';
    } else if (isOverdue) {
      status = 'overdue';
    } else {
      status = 'pending';
    }

    const derived: DerivedInstallment = {
      installmentNumber: instNum,
      totalInstallments,
      dueDate,
      requiredAmount,
      allocatedPaid: alloc,
      remainingDue: remDue,
      status,
      isOverdue,
    };

    installments.push(derived);

    if (!nextDue && status !== 'paid') {
      nextDue = derived;
    }
  }

  return {
    agreementId: agreement.id,
    totalAgreed,
    totalPaid: cumulativePaid,
    remainingBalance,
    installments,
    nextDueInstallment: nextDue,
    completedInstallmentsCount: completedCount,
  };
}

/**
 * Returns the next upcoming or overdue unpaid installment of an agreement.
 */
export function getNextDueInstallment(
  agreement: FinancingAgreement,
  transactions: Transaction[] = [],
  todayDate: string = todayISO()
): DerivedInstallment | null {
  const breakdown = deriveAgreementSchedule(agreement, transactions, todayDate);
  return breakdown?.nextDueInstallment || null;
}

/**
 * Creates a new FinancingAgreement.
 * Does NOT alter any bank accounts and does NOT generate retroactive ledger transactions.
 */
export function createFinancingAgreement(
  state: LifeOSState,
  input: FinancingAgreementInput,
): FinancingAgreement {
  const title = input.title?.trim();
  if (!title) throw new Error('Escribí un concepto o título para el acuerdo.');

  const creditorName = input.creditorName?.trim();
  if (!creditorName) throw new Error('Ingresá el nombre del acreedor o contraparte.');

  const validation = validateAgreementCoherence({
    initialRemainingBalance: input.initialRemainingBalance,
    originalPrincipal: input.originalPrincipal,
    priorPaidAmount: input.priorPaidAmount,
    schedule: input.schedule,
  });
  if (!validation.valid) throw new Error(validation.error);

  const initialRemaining = roundMoney(input.initialRemainingBalance);
  const currency: 'UYU' | 'USD' = input.currency === 'USD' ? 'USD' : 'UYU';
  const initialDate = input.initialReferenceDate || todayISO();

  if (!state.finance.agreements) {
    state.finance.agreements = [];
  }

  const agreement: FinancingAgreement = {
    id: input.id || uid(),
    title,
    creditorName,
    currency,
    initialRemainingBalance: initialRemaining,
    initialReferenceDate: initialDate,
    originalPrincipal: input.originalPrincipal ? roundMoney(input.originalPrincipal) : null,
    priorPaidAmount: input.priorPaidAmount ? roundMoney(input.priorPaidAmount) : null,
    notes: input.notes?.trim() || null,
    status: input.status || 'active',
    settledAt: null,
    linkedLegacyDebtId: input.linkedLegacyDebtId || null,
    schedule: input.schedule
      ? {
          totalInstallments: Math.max(1, Math.floor(input.schedule.totalInstallments)),
          installmentAmount: roundMoney(input.schedule.installmentAmount),
          firstDueDate: input.schedule.firstDueDate,
          dueDay: Math.min(31, Math.max(1, input.schedule.dueDay || parseInt(input.schedule.firstDueDate.split('-')[2], 10) || 1)),
          frequency: input.schedule.frequency || 'monthly',
        }
      : null,
    acquisition: input.acquisition
      ? {
          acquisitionDate: input.acquisition.acquisitionDate,
          category: input.acquisition.category?.trim() || 'Varios',
          totalPurchaseAmount: roundMoney(input.acquisition.totalPurchaseAmount),
        }
      : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.finance.agreements.push(agreement);
  return agreement;
}

/**
 * Updates an existing FinancingAgreement.
 */
export function updateFinancingAgreement(
  state: LifeOSState,
  agreementId: string,
  input: Partial<FinancingAgreementInput>,
): FinancingAgreement {
  const agreement = (state.finance.agreements || []).find((a) => a.id === agreementId);
  if (!agreement) throw new Error('El acuerdo no existe.');

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('El concepto no puede estar vacío.');
    agreement.title = t;
  }

  if (input.creditorName !== undefined) {
    const c = input.creditorName.trim();
    if (!c) throw new Error('El acreedor no puede estar vacío.');
    agreement.creditorName = c;
  }

  if (input.initialRemainingBalance !== undefined) {
    const validation = validateAgreementCoherence({
      initialRemainingBalance: input.initialRemainingBalance,
      originalPrincipal: input.originalPrincipal !== undefined ? input.originalPrincipal : agreement.originalPrincipal,
      priorPaidAmount: input.priorPaidAmount !== undefined ? input.priorPaidAmount : agreement.priorPaidAmount,
      schedule: input.schedule !== undefined ? input.schedule : agreement.schedule,
    });
    if (!validation.valid) throw new Error(validation.error);
    agreement.initialRemainingBalance = roundMoney(input.initialRemainingBalance);
  }

  if (input.originalPrincipal !== undefined) {
    agreement.originalPrincipal = input.originalPrincipal ? roundMoney(input.originalPrincipal) : null;
  }

  if (input.priorPaidAmount !== undefined) {
    agreement.priorPaidAmount = input.priorPaidAmount ? roundMoney(input.priorPaidAmount) : null;
  }

  if (input.notes !== undefined) {
    agreement.notes = input.notes?.trim() || null;
  }

  if (input.initialReferenceDate !== undefined) {
    const d = input.initialReferenceDate?.trim();
    if (d) {
      agreement.initialReferenceDate = d;
    }
  }

  if (input.linkedLegacyDebtId !== undefined) {
    agreement.linkedLegacyDebtId = input.linkedLegacyDebtId || null;
  }

  if (input.schedule !== undefined) {
    agreement.schedule = input.schedule
      ? {
          totalInstallments: Math.max(1, Math.floor(input.schedule.totalInstallments)),
          installmentAmount: roundMoney(input.schedule.installmentAmount),
          firstDueDate: input.schedule.firstDueDate,
          dueDay: Math.min(31, Math.max(1, input.schedule.dueDay || parseInt(input.schedule.firstDueDate.split('-')[2], 10) || 1)),
          frequency: input.schedule.frequency || 'monthly',
        }
      : null;
  }

  if (input.acquisition !== undefined) {
    agreement.acquisition = input.acquisition
      ? {
          acquisitionDate: input.acquisition.acquisitionDate,
          category: input.acquisition.category?.trim() || 'Varios',
          totalPurchaseAmount: roundMoney(input.acquisition.totalPurchaseAmount),
        }
      : null;
  }

  agreement.updatedAt = new Date().toISOString();
  syncAgreementStatusOnLedgerChange(state, agreement.id);
  return agreement;
}

/**
 * Deletes a FinancingAgreement.
 * Unlinks any existing transactions associated with it to preserve ledger integrity.
 */
export function deleteFinancingAgreement(state: LifeOSState, agreementId: string): void {
  if (!state.finance.agreements) return;

  // Unlink transactions to avoid dangling pointers
  for (const tx of state.finance.transactions || []) {
    if (tx.agreementId === agreementId) {
      tx.agreementId = null;
    }
  }

  state.finance.agreements = state.finance.agreements.filter((a) => a.id !== agreementId);
}

/**
 * Synchronizes the status ('active' vs 'settled') and settledAt timestamp of an agreement
 * based strictly on the current derived remaining balance from the ledger.
 * This guarantees reversibility: if a payment is deleted or reduced, a settled agreement
 * automatically returns to active.
 */
export function syncAgreementStatusOnLedgerChange(state: LifeOSState, agreementId: string): void {
  const agreement = (state.finance.agreements || []).find((a) => a.id === agreementId);
  if (!agreement) return;

  const currentRemaining = calculateAgreementRemainingBalance(agreement, state.finance.transactions || []);
  if (currentRemaining <= 0) {
    agreement.status = 'settled';
    if (!agreement.settledAt) {
      agreement.settledAt = todayISO();
    }
  } else {
    if (agreement.status === 'settled') {
      agreement.status = 'active';
    }
    agreement.settledAt = null;
  }

  agreement.updatedAt = new Date().toISOString();
}

/**
 * Registers an effective debt amortization payment.
 * Validations:
 * 1. Agreement is not cancelled.
 * 2. Source account exists.
 * 3. Currency match between account and agreement.
 * 4. Payment amount > 0.
 * 5. Payment amount does not exceed current remaining balance.
 * 6. Creates a single ledger transaction with origin: 'debt_payment' and agreementId.
 * 7. Recalculates and materializes account balance and updates agreement status.
 */
export function addAgreementPayment(
  state: LifeOSState,
  input: AgreementPaymentInput,
): Transaction {
  const agreement = (state.finance.agreements || []).find((a) => a.id === input.agreementId);
  if (!agreement) throw new Error('El acuerdo financiero no existe.');

  if (agreement.status === 'cancelled') {
    throw new Error('No se pueden registrar abonos a un acuerdo cancelado.');
  }

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Ingresá un importe mayor a cero.');
  }

  const account = (state.finance.accounts || []).find((a) => a.id === input.accountId);
  if (!account) {
    throw new Error('Elegí una cuenta válida.');
  }

  const accCur = (account.currency || 'UYU').toUpperCase();
  const agrCur = agreement.currency.toUpperCase();
  if (accCur !== agrCur) {
    throw new Error(
      `Moneda incompatible: la deuda está pactada en ${agrCur} pero la cuenta seleccionada (${account.name}) opera en ${accCur}. No se permiten conversiones ficticias.`
    );
  }

  const currentRemaining = calculateAgreementRemainingBalance(agreement, state.finance.transactions || []);
  if (currentRemaining <= 0) {
    throw new Error('El acuerdo ya está completamente saldado.');
  }

  if (amount > currentRemaining) {
    throw new Error(
      `El abono (${amount}) supera el saldo pendiente actual (${currentRemaining}). Si deseás saldar la deuda, ingresá exactamente ${currentRemaining}.`
    );
  }

  const txDate = input.date || todayISO();
  if (agreement.initialReferenceDate && txDate < agreement.initialReferenceDate) {
    throw new Error(
      `La fecha del abono (${txDate}) no puede ser anterior a la fecha de corte del acuerdo (${agreement.initialReferenceDate}). El saldo inicial declarado ya contempla los pagos realizados antes de esa fecha.`
    );
  }
  const note = input.note?.trim() || `Abono a deuda: ${agreement.title} (${agreement.creditorName})`;

  const transaction = addTransaction(state, {
    type: 'gasto',
    amount,
    category: 'Préstamos y deudas',
    fixed: 'fijo',
    accountId: account.id,
    date: txDate,
    note,
    origin: 'debt_payment',
    reviewStatus: 'reviewed',
    reviewed: true,
    currency: agrCur,
  });

  // Explicitly stamp agreementId
  transaction.agreementId = agreement.id;

  // Reactively synchronize agreement status
  syncAgreementStatusOnLedgerChange(state, agreement.id);

  return transaction;
}

/**
 * Links an existing manual ledger transaction to an agreement.
 * Revalidates type, currency, and remaining balance.
 */
export function linkTransactionToAgreement(
  state: LifeOSState,
  transactionId: string,
  agreementId: string,
): { transaction: Transaction; agreement: FinancingAgreement } {
  const transaction = (state.finance.transactions || []).find((t) => t.id === transactionId);
  if (!transaction) throw new Error('El movimiento no existe.');

  if (transaction.type !== 'gasto') {
    throw new Error('Solo movimientos de salida de dinero (gastos) pueden vincularse como abonos a una deuda.');
  }

  if (transaction.agreementId && transaction.agreementId !== agreementId) {
    throw new Error('El movimiento ya está vinculado a otro acuerdo financiero.');
  }

  const agreement = (state.finance.agreements || []).find((a) => a.id === agreementId);
  if (!agreement) throw new Error('El acuerdo financiero no existe.');

  if (agreement.initialReferenceDate && transaction.date < agreement.initialReferenceDate) {
    throw new Error(
      `No se puede vincular el movimiento: su fecha (${transaction.date}) es anterior a la fecha de corte del acuerdo (${agreement.initialReferenceDate}). El saldo inicial declarado ya contempla los pagos anteriores a esa fecha.`
    );
  }

  const txCur = (transaction.currency || (state.finance.accounts.find((a) => a.id === transaction.accountId)?.currency) || 'UYU').toUpperCase();
  if (txCur !== agreement.currency.toUpperCase()) {
    throw new Error(`Moneda incompatible (${txCur} vs ${agreement.currency}).`);
  }

  transaction.agreementId = agreement.id;
  transaction.origin = 'debt_payment';
  transaction.reviewStatus = 'reviewed';
  transaction.reviewed = true;

  syncAgreementStatusOnLedgerChange(state, agreement.id);

  return { transaction, agreement };
}
