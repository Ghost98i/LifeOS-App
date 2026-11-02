import type {
  Account,
  AccountReconciliation,
  ExpectedIncome,
  FinanceTransfer,
  FinancialCommitment,
  LifeOSState,
  Transaction,
} from '../types';
import { advanceCommitmentDueDate, advanceExpectedIncomeDate } from './financialCommitments';
import { syncAgreementStatusOnLedgerChange } from './financeAgreements';
import { deriveCycleIdentity } from './financeMatching';
import { confirmedFinancialCurrency, requireFinancialCurrency } from './financeCurrencyPolicy';
import {
  compareLedgerEvents,
  compareMaterializedBalanceShadow,
  nextFinanceEffectiveOrder,
  reconstructAccountBalance,
  reconstructAccountBalanceBeforeEvent,
} from './financeLedger';
import { createFinanceRevisionOrder, createFinanceRevisionOrderAfter } from './financeRevision';
import { todayISO, uid, roundMoney, diffMoney } from './storage';

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date?: string;
  note?: string;
}

export interface TransactionInput {
  id?: string;
  type: Transaction['type'];
  amount: number;
  category: string;
  fixed?: Transaction['fixed'];
  date?: string;
  operationTime?: string | null;
  note?: string;
  accountId: string | null;
  origin?: Transaction['origin'];
  reviewStatus?: Transaction['reviewStatus'];
  reviewed?: boolean;
  commitmentId?: string | null;
  expectedIncomeId?: string | null;
  matchedCycle?: string | null;
  currency?: string;
  agreementId?: string | null;
}

function affectedAccountIds(accountIds: Array<string | null | undefined>): string[] {
  return [...new Set(accountIds.filter((id): id is string => Boolean(id)))];
}

function assertAccountsCanMaterialize(
  state: LifeOSState,
  accountIds: string[],
  allowAmbiguousReconciliationChange = false,
): void {
  const eventIds = new Set<string>();
  for (const event of [...state.finance.transactions, ...state.finance.transfers, ...state.finance.reconciliations]) {
    if (eventIds.has(event.id)) throw new Error('Hay operaciones financieras con el mismo ID. Conservá los datos y revisá su identidad antes de modificar el libro.');
    eventIds.add(event.id);
  }
  for (const accountId of accountIds) {
    const account = state.finance.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('La cuenta ya no existe.');
    if (!Number.isFinite(account.initialBalance)) {
      throw new Error('La cuenta necesita un saldo inicial conocido antes de reconstruir su saldo.');
    }
    const shadow = compareMaterializedBalanceShadow(
      account,
      state.finance.transactions,
      state.finance.transfers,
      state.finance.reconciliations,
    );
    if (!allowAmbiguousReconciliationChange && shadow.ambiguities.length > 0 && !shadow.matches) {
      throw new Error('La cuenta tiene conciliaciones legacy ambiguas; revisalas antes de materializar un movimiento nuevo.');
    }
  }
}

function materializeAccounts(state: LifeOSState, accountIds: string[]): void {
  for (const accountId of accountIds) {
    const account = state.finance.accounts.find((item) => item.id === accountId);
    if (!account) continue;
    const reconstruction = reconstructAccountBalance(
      account,
      state.finance.transactions,
      state.finance.transfers,
      state.finance.reconciliations,
    );
    if (reconstruction.balance === null) {
      throw new Error('La cuenta necesita un saldo inicial conocido antes de reconstruir su saldo.');
    }
    account.balance = reconstruction.balance;
  }
}

export function addTransaction(state: LifeOSState, input: TransactionInput): Transaction {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
  // Identity belongs to a user operation, never to its name/amount/date. A retry
  // must reuse its ID; a separate legitimate operation must receive a new one.
  if (input.id) {
    const existing = state.finance.transactions.filter((tx) => tx.id === input.id);
    if (existing.length > 1) throw new Error('El ID tiene varios movimientos; conservá los datos y revisá su identidad.');
    if (existing.length === 1) {
      const tx = existing[0];
      const account = state.finance.accounts.find((item) => item.id === tx.accountId);
      const sameOperation = tx.type === input.type && roundMoney(tx.amount) === amount
        && tx.accountId === input.accountId && tx.category === input.category.trim()
        && tx.date === (input.date || tx.date)
        && (tx.note || '') === (input.note?.trim() || '')
        && tx.fixed === (input.fixed || 'variable')
        && (tx.operationTime || null) === (input.operationTime || null)
        && (tx.currency || account?.currency || 'UYU').toUpperCase() === (input.currency || account?.currency || 'UYU').trim().toUpperCase()
        && (input.origin === undefined || tx.origin === input.origin)
        && (tx.commitmentId || null) === (input.commitmentId || null)
        && (tx.expectedIncomeId || null) === (input.expectedIncomeId || null)
        && (tx.matchedCycle || null) === (input.matchedCycle || null)
        && (tx.agreementId || null) === (input.agreementId || null);
      if (!sameOperation) throw new Error('El ID ya pertenece a otro movimiento o fue editado. Volvé a abrir el formulario para registrar una operación independiente.');
      return tx;
    }
    if (state.finance.transfers.some((item) => item.id === input.id)
      || state.finance.reconciliations.some((item) => item.id === input.id)) {
      throw new Error('El ID ya pertenece a otra operación financiera.');
    }
  }
  if (!input.accountId || !state.finance.accounts.some((account) => account.id === input.accountId)) {
    throw new Error('Elegí una cuenta válida.');
  }
  if (!input.category.trim()) throw new Error('Elegí una categoría.');

  const account = state.finance.accounts.find((a) => a.id === input.accountId);
  if (!account) throw new Error('Elegí una cuenta válida.');
  const accountCurrency = (account.currency || 'UYU').trim().toUpperCase();
  const txCurrency = (input.currency || accountCurrency).trim().toUpperCase();
  if (txCurrency !== accountCurrency) {
    throw new Error(`Moneda incompatible: el movimiento (${txCurrency}) no coincide con la moneda de la cuenta (${accountCurrency}).`);
  }

  const date = input.date || todayISO();
  if (input.operationTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.operationTime)) {
    throw new Error('Ingresá una hora válida en formato HH:mm.');
  }
  assertAccountsCanMaterialize(state, [input.accountId]);

  const reviewStatus = input.reviewStatus !== undefined
    ? input.reviewStatus
    : (input.reviewed ? 'reviewed' : 'pending');

  const transaction: Transaction = {
    id: input.id || globalThis.crypto?.randomUUID?.() || uid(),
    createdAt: new Date().toISOString(),
    effectiveOrder: nextFinanceEffectiveOrder(state, date),
    revisionOrder: createFinanceRevisionOrder(),
    type: input.type,
    amount,
    category: input.category.trim(),
    fixed: input.fixed || 'variable',
    date,
    operationTime: input.operationTime || null,
    note: input.note?.trim() || '',
    accountId: input.accountId,
    origin: input.origin || 'manual',
    reviewStatus,
    reviewed: reviewStatus === 'reviewed',
    commitmentId: input.commitmentId || null,
    expectedIncomeId: input.expectedIncomeId || null,
    matchedCycle: input.matchedCycle || null,
    agreementId: input.agreementId || null,
    currency: txCurrency,
  };
  state.finance.transactions.push(transaction);
  materializeAccounts(state, [input.accountId]);
  return transaction;
}

export interface ConfirmFinancialCommitmentInput {
  commitmentId: string;
  amount?: number;
  accountId?: string | null;
  date?: string;
  updateFutureAmount?: boolean;
  targetCycle?: string | null;
  allowAdvance?: boolean;
}

export function confirmFinancialCommitment(
  state: LifeOSState,
  input: ConfirmFinancialCommitmentInput,
): Transaction {
  const commitment = (state.finance.commitments || []).find((item) => item.id === input.commitmentId);
  if (!commitment) throw new Error('El compromiso ya no existe.');
  const comCurrency = requireFinancialCurrency(commitment.currency, 'compromiso');

  const total = commitment.totalInstallments || commitment.totalOccurrences || null;
  const curInst = commitment.currentInstallment || 1;
  const txDate = input.date || todayISO();
  const currentCommitmentCycle = total
    ? `inst-${curInst}`
    : commitment.frequency === 'once'
      ? 'once'
      : `cycle-${commitment.nextDueDate}`;
  const settlementKey = input.targetCycle || currentCommitmentCycle;
  const deterministicTxId = `settle-${commitment.id}-${settlementKey}`;

  // 1. Idempotency check: strictly scoped to this occurrence / cycle
  const existingTx = state.finance.transactions.find((tx) =>
    tx.id === deterministicTxId ||
    (tx.commitmentId === commitment.id && tx.matchedCycle === settlementKey)
  );
  if (existingTx) {
    return existingTx;
  }
  if (!commitment.active && commitment.status === 'paid') {
    if (commitment.lastSettledTxId) {
      const lastTx = state.finance.transactions.find((tx) => tx.id === commitment.lastSettledTxId);
      if (lastTx) return lastTx;
    }
    throw new Error('El compromiso ya fue pagado y finalizado.');
  }

  // 2. Validación de coherencia del ciclo solicitado:
  // settlementKey debe corresponder al ciclo vigente o a una ocurrencia ya liquidada
  const isSettledCycle = commitment.settledTxIds?.some((id) => {
    const t = state.finance.transactions.find((tx) => tx.id === id);
    return t?.matchedCycle === settlementKey;
  });
  if (settlementKey !== currentCommitmentCycle && !isSettledCycle) {
    throw new Error(`El ciclo especificado (${settlementKey}) no corresponde al ciclo vigente ni a una ocurrencia liquidada.`);
  }

  // 3. Control contable de pago anticipado por fecha (compromisos recurrentes con fecha):
  const isRecurringCycle = commitment.frequency !== 'once' && !total && settlementKey.startsWith('cycle-');
  const cycleDate = isRecurringCycle ? settlementKey.replace('cycle-', '') : null;
  const isAdvance = Boolean(isRecurringCycle && cycleDate && cycleDate > txDate);

  if (isAdvance && !input.allowAdvance) {
    throw new Error(`El pago del ciclo ${settlementKey} vence el ${cycleDate}. Para pagarlo por adelantado en ${txDate}, confirmá explícitamente el pago anticipado.`);
  }

  const amount = input.amount ?? Number(commitment.amount);
  const accountId = input.accountId || commitment.accountId || state.finance.accounts[0]?.id || null;
  if (!accountId) throw new Error('Elegí una cuenta válida.');
  const targetAccount = state.finance.accounts.find((a) => a.id === accountId);
  if (!targetAccount) throw new Error('Elegí una cuenta válida.');

  const accountCurrency = (targetAccount.currency || 'UYU').trim().toUpperCase();
  if (accountCurrency !== comCurrency) {
    throw new Error(`Moneda incompatible: el compromiso (${comCurrency}) no coincide con la moneda de la cuenta de débito (${accountCurrency}).`);
  }

  const advanced = advanceCommitmentDueDate(commitment);
  const installmentLabel = total ? ` (Cuota ${curInst}/${total})` : '';

  const transaction = addTransaction(state, {
    id: deterministicTxId,
    type: 'gasto',
    amount,
    category: commitment.category || 'Varios',
    fixed: 'fijo',
    accountId,
    currency: comCurrency,
    date: txDate,
    note: `Pago de compromiso: ${commitment.name}${installmentLabel}`,
    commitmentId: commitment.id,
    matchedCycle: settlementKey,
    reviewStatus: 'reviewed',
    reviewed: true,
  });

  const settledTxIds = commitment.settledTxIds ? [...commitment.settledTxIds, transaction.id] : [transaction.id];

  Object.assign(commitment, advanced, {
    ...(input.updateFutureAmount ? { amount: Number(amount) } : {}),
    lastSettledTxId: transaction.id,
    settledTxIds,
    updatedAt: new Date().toISOString(),
  });
  return transaction;
}

export interface ConfirmExpectedIncomeInput {
  expectedIncomeId: string;
  accountId?: string | null;
  date?: string;
  amount?: number;
  matchedTransactionId?: string | null;
  targetCycle?: string | null;
  allowAdvance?: boolean;
}

export function confirmExpectedIncome(
  state: LifeOSState,
  input: ConfirmExpectedIncomeInput,
): Transaction {
  const income = (state.finance.expectedIncomes || []).find((item) => item.id === input.expectedIncomeId);
  if (!income) throw new Error('El ingreso previsto ya no existe.');

  // Camino A: Vincular un cobro existente
  if (input.matchedTransactionId) {
    const res = linkTransactionToExpectedIncome(state, input.matchedTransactionId, income.id, input.targetCycle);
    return res.transaction;
  }

  // Si está pausado (recurrente con active: false), exigir reanudar antes de confirmar
  if (!income.active && income.frequency !== 'once') {
    throw new Error('El ingreso previsto está pausado. Reanudalo antes de confirmar el cobro.');
  }

  const accountId = input.accountId || income.accountId || state.finance.accounts[0]?.id || null;
  if (!accountId) throw new Error('Elegí una cuenta válida.');
  const targetAccount = state.finance.accounts.find((a) => a.id === accountId);
  if (!targetAccount) throw new Error('Elegí una cuenta válida.');

  const accountCurrency = (targetAccount.currency || 'UYU').trim().toUpperCase();
  const incomeCurrency = requireFinancialCurrency(income.currency, 'cobro previsto');
  if (accountCurrency !== incomeCurrency) {
    throw new Error(`Moneda incompatible: la previsión (${incomeCurrency}) no coincide con la moneda de la cuenta de destino (${accountCurrency}).`);
  }

  const txDate = input.date || todayISO();
  const amount = input.amount !== undefined ? Number(input.amount) : Number(income.amount);

  // Clave determinista de ciclo vigente
  const currentIncomeCycle = income.frequency === 'once' ? 'once' : `cycle-${income.startDate}`;
  const targetCycle = input.targetCycle || currentIncomeCycle;
  const deterministicTxId = `settle-inc-${income.id}-${targetCycle}`;

  // 1. Idempotency directa: si este ciclo exacto ya fue liquidado
  const existingTx = state.finance.transactions.find((tx) =>
    tx.id === deterministicTxId ||
    (tx.expectedIncomeId === income.id && tx.matchedCycle === targetCycle)
  );
  if (existingTx) {
    return existingTx;
  }

  // 2. Validación de coherencia del ciclo solicitado:
  // Si targetCycle no es el ciclo vigente ni un ciclo ya liquidado registrado
  const isSettledCycle = income.settledTxIds?.some((id) => {
    const t = state.finance.transactions.find((tx) => tx.id === id);
    return t?.matchedCycle === targetCycle;
  });
  if (targetCycle !== currentIncomeCycle && !isSettledCycle) {
    throw new Error(`El ciclo especificado (${targetCycle}) no corresponde al ciclo vigente ni a un ciclo liquidado.`);
  }

  // 3. Control contable de cobro anticipado por fecha (sin depender de ventanas heurísticas fijas):
  // Para ingresos únicos ('once') no existe ciclo subsiguiente susceptible de adelantarse inadvertidamente.
  const isRecurringCycle = income.frequency !== 'once' && targetCycle.startsWith('cycle-');
  const cycleDate = isRecurringCycle ? targetCycle.replace('cycle-', '') : null;
  const isAdvance = Boolean(isRecurringCycle && cycleDate && cycleDate > txDate);

  if (isAdvance && !input.allowAdvance) {
    throw new Error(`El cobro del ciclo ${targetCycle} vence el ${cycleDate}. Para cobrarlo por adelantado en ${txDate}, confirmá explícitamente la acción de cobro anticipado.`);
  }

  const advanced = advanceExpectedIncomeDate(income);
  const transaction = addTransaction(state, {
    id: deterministicTxId,
    type: 'ingreso',
    amount,
    category: income.category || 'Varios',
    fixed: 'variable',
    accountId,
    currency: incomeCurrency,
    date: txDate,
    note: `Previsión confirmada: ${income.name}`,
    expectedIncomeId: income.id,
    matchedCycle: targetCycle,
    origin: 'manual',
    reviewStatus: 'reviewed',
    reviewed: true,
  });

  const settledTxIds = income.settledTxIds ? [...income.settledTxIds, transaction.id] : [transaction.id];

  Object.assign(income, advanced, {
    lastSettledTxId: transaction.id,
    settledTxIds,
    updatedAt: new Date().toISOString(),
  });

  return transaction;
}

export function isCommercialFinanceTransaction(
  state: Pick<LifeOSState, 'resale'> | undefined | null,
  transactionOrId: Transaction | string,
): boolean {
  const txId = typeof transactionOrId === 'string' ? transactionOrId : transactionOrId.id;
  if (!txId) return false;
  if (txId.startsWith('commercial:')) return true;
  return Boolean(
    state?.resale?.commercial?.business?.financeLinks?.some(
      (link) => link.transactionId === txId
    )
  );
}

export function getTransactionLockReason(state: LifeOSState, transaction: Transaction): string | null {
  if (transaction.origin === 'adjustment' || state.finance.reconciliations.some((item) => item.adjustmentTxId === transaction.id)) {
    return 'Es un ajuste de conciliación. Volvé a conciliar la cuenta para corregir el saldo.';
  }
  if (
    transaction.origin === 'resale_purchase' ||
    transaction.origin === 'resale_sale' ||
    state.resale.inventory.some((item) => [item.purchaseTxId, item.saleTxId, item.feeTxId, item.financeTxId].includes(transaction.id))
  ) {
    return 'Está vinculado a una reventa. Editá o eliminá la operación desde Reventa.';
  }
  if (isCommercialFinanceTransaction(state, transaction)) {
    return 'Este movimiento pertenece a Mi negocio. Para corregirlo, anularlo o registrar una devolución o reembolso, gestioná la operación desde Mi negocio.';
  }
  return null;
}

function transactionDependency(state: LifeOSState, transaction: Transaction): string | null {
  return getTransactionLockReason(state, transaction);
}

export function deleteTransaction(state: LifeOSState, transactionId: string): void {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  const agreementId = transaction.agreementId;
  const expectedIncomeId = transaction.expectedIncomeId;
  const commitmentId = transaction.commitmentId;
  removeTransaction(state, transaction);
  if (agreementId) {
    syncAgreementStatusOnLedgerChange(state, agreementId);
  }
  if (expectedIncomeId) {
    const income = (state.finance.expectedIncomes || []).find((item) => item.id === expectedIncomeId);
    if (income) {
      if (income.settledTxIds) {
        income.settledTxIds = income.settledTxIds.filter((id) => id !== transaction.id);
      }
      if (income.lastSettledTxId === transaction.id) {
        income.lastSettledTxId = income.settledTxIds && income.settledTxIds.length > 0
          ? income.settledTxIds[income.settledTxIds.length - 1]
          : undefined;
      }
      if (income.frequency === 'once' && !income.active) {
        income.active = true;
      }
      income.updatedAt = new Date().toISOString();
    }
  }
  if (commitmentId) {
    const commitment = (state.finance.commitments || []).find((item) => item.id === commitmentId);
    if (commitment) {
      if (commitment.settledTxIds) {
        commitment.settledTxIds = commitment.settledTxIds.filter((id) => id !== transaction.id);
      }
      if (commitment.lastSettledTxId === transaction.id) {
        commitment.lastSettledTxId = commitment.settledTxIds && commitment.settledTxIds.length > 0
          ? commitment.settledTxIds[commitment.settledTxIds.length - 1]
          : undefined;
      }
      if (commitment.frequency === 'once' && !commitment.active) {
        commitment.active = true;
        commitment.status = 'pending';
      }
      commitment.updatedAt = new Date().toISOString();
    }
  }
}

function removeTransaction(state: LifeOSState, transaction: Transaction): void {
  const accountIds = affectedAccountIds([transaction.accountId]);
  assertAccountsCanMaterialize(state, accountIds);
  state.finance.transactions = state.finance.transactions.filter((item) => item.id !== transaction.id);
  materializeAccounts(state, accountIds);
}

export function deleteLinkedTransaction(state: LifeOSState, transactionId?: string | null): void {
  if (!transactionId) return;
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  const isLinked = state.resale.inventory.some((item) => (
    [item.purchaseTxId, item.saleTxId, item.feeTxId, item.financeTxId].includes(transaction.id)
  ));
  if (!isLinked) throw new Error('El movimiento no está vinculado a una operación de origen.');
  removeTransaction(state, transaction);
}

export function updateTransaction(state: LifeOSState, transactionId: string, input: TransactionInput): Transaction {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
  if (!input.accountId || !state.finance.accounts.some((account) => account.id === input.accountId)) throw new Error('Elegí una cuenta válida.');
  if (!input.category.trim()) throw new Error('Elegí una categoría.');

  const targetAccount = state.finance.accounts.find((account) => account.id === input.accountId)!;
  const targetAccCurrency = (targetAccount.currency || 'UYU').trim().toUpperCase();
  const txCurrency = (input.currency || transaction.currency || targetAccCurrency).trim().toUpperCase();
  const originalAccount = state.finance.accounts.find(account => account.id === transaction.accountId);
  const originalCurrency = (transaction.currency || originalAccount?.currency || 'UYU').trim().toUpperCase();
  const changesFinancialFacts = amount !== transaction.amount || input.accountId !== transaction.accountId
    || txCurrency !== originalCurrency || input.type !== transaction.type || (input.date || todayISO()) !== transaction.date;
  if (txCurrency !== targetAccCurrency) {
    throw new Error(`Moneda incompatible: el movimiento (${txCurrency}) no coincide con la moneda de la cuenta (${targetAccCurrency}).`);
  }

  // Protección de movimientos vinculados a previsión de cobro
  if (transaction.expectedIncomeId) {
    if (input.type !== 'ingreso') {
      throw new Error('No podés cambiar el tipo a gasto en un movimiento vinculado a una previsión de cobro. Desvinculá el cobro antes de modificarlo.');
    }
    const income = (state.finance.expectedIncomes || []).find((i) => i.id === transaction.expectedIncomeId);
    if (income) {
      const incCurrency = confirmedFinancialCurrency(income.currency);
      if (!incCurrency && changesFinancialFacts) requireFinancialCurrency(income.currency, 'cobro previsto');
      if (incCurrency && txCurrency !== incCurrency) {
        throw new Error(`Moneda incompatible: no podés cambiar la moneda a ${txCurrency} porque este movimiento está vinculado a una previsión en ${incCurrency}. Desvinculá el cobro primero.`);
      }
    }
  }

  // Protección de movimientos vinculados a compromiso
  if (transaction.commitmentId) {
    if (input.type !== 'gasto') {
      throw new Error('No podés cambiar el tipo a ingreso en un movimiento vinculado a un compromiso. Desvinculá el pago antes de modificarlo.');
    }
    const commitment = (state.finance.commitments || []).find((c) => c.id === transaction.commitmentId);
    if (commitment) {
      const comCurrency = confirmedFinancialCurrency(commitment.currency);
      if (!comCurrency && changesFinancialFacts) requireFinancialCurrency(commitment.currency, 'compromiso');
      if (comCurrency && txCurrency !== comCurrency) {
        throw new Error(`Moneda incompatible: no podés cambiar la moneda a ${txCurrency} porque este movimiento está vinculado a un compromiso en ${comCurrency}. Desvinculá el pago primero.`);
      }
    }
  }

  const previousAccountId = transaction.accountId;
  const previousAgreementId = transaction.agreementId;
  const targetAgreementId = input.agreementId !== undefined ? input.agreementId : transaction.agreementId;
  const date = input.date || todayISO();
  if (input.operationTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.operationTime)) {
    throw new Error('Ingresá una hora válida en formato HH:mm.');
  }

  if (targetAgreementId) {
    const agreement = (state.finance.agreements || []).find((a) => a.id === targetAgreementId);
    if (agreement && agreement.initialReferenceDate && date < agreement.initialReferenceDate) {
      throw new Error(
        `La fecha del movimiento (${date}) no puede ser anterior a la fecha de corte del acuerdo (${agreement.initialReferenceDate}). El saldo inicial declarado ya contempla los pagos anteriores a esa fecha.`
      );
    }
  }

  const accountIds = affectedAccountIds([previousAccountId, input.accountId]);
  assertAccountsCanMaterialize(state, accountIds);
  const effectiveOrder = date === transaction.date && transaction.effectiveOrder
    ? transaction.effectiveOrder
    : nextFinanceEffectiveOrder(state, date);
  const revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  const reviewStatus = input.reviewStatus !== undefined
    ? input.reviewStatus
    : (input.reviewed !== undefined
      ? (input.reviewed ? 'reviewed' : 'pending')
      : transaction.reviewStatus);
  Object.assign(transaction, {
    type: input.type,
    amount,
    category: input.category.trim(),
    fixed: input.fixed !== undefined ? input.fixed : transaction.fixed,
    date,
    operationTime: input.operationTime !== undefined ? input.operationTime : transaction.operationTime,
    effectiveOrder,
    revisionOrder,
    note: input.note?.trim() || '',
    accountId: input.accountId,
    reviewStatus,
    reviewed: reviewStatus === 'reviewed',
    commitmentId: input.commitmentId !== undefined ? input.commitmentId : transaction.commitmentId,
    expectedIncomeId: input.expectedIncomeId !== undefined ? input.expectedIncomeId : transaction.expectedIncomeId,
    matchedCycle: input.matchedCycle !== undefined ? input.matchedCycle : transaction.matchedCycle,
    agreementId: input.agreementId !== undefined ? input.agreementId : transaction.agreementId,
    currency: input.currency !== undefined ? input.currency : transaction.currency,
  });
  materializeAccounts(state, accountIds);
  if (transaction.agreementId) {
    syncAgreementStatusOnLedgerChange(state, transaction.agreementId);
  }
  if (previousAgreementId && previousAgreementId !== transaction.agreementId) {
    syncAgreementStatusOnLedgerChange(state, previousAgreementId);
  }
  return transaction;
}

export function computeAccountBalance(
  account: Account,
  transactions: Transaction[] = [],
  transfers: FinanceTransfer[] = [],
  reconciliations: AccountReconciliation[] = []
): number {
  const reconstruction = reconstructAccountBalance(account, transactions, transfers, reconciliations);
  if (reconstruction.balance !== null) {
    return reconstruction.balance;
  }

  // Graceful fallback for legacy accounts missing initialBalance
  let totalDelta = 0;
  for (const tx of transactions || []) {
    if (tx.accountId !== account.id) continue;
    const amount = Number(tx.amount || 0);
    if (tx.type === 'ingreso') totalDelta += amount;
    else totalDelta -= amount;
  }
  for (const tr of transfers || []) {
    const amount = Number(tr.amount || 0);
    if (tr.toAccountId === account.id) totalDelta += amount;
    if (tr.fromAccountId === account.id) totalDelta -= amount;
  }

  const inferredInitial = Number(account.balance || 0) - totalDelta;
  const fallback = reconstructAccountBalance(
    { ...account, initialBalance: inferredInitial },
    transactions,
    transfers,
    reconciliations
  );
  if (fallback.balance !== null) {
    return fallback.balance;
  }

  return Math.round(Number(account.balance || 0) * 100) / 100;
}

export function addAccount(
  state: LifeOSState,
  nameInput: string,
  balanceInput: number,
  currencyInput?: string
): Account {
  const name = nameInput.trim();
  const balance = roundMoney(balanceInput);
  if (!name) throw new Error('Escribí un nombre para la cuenta.');
  if (!Number.isFinite(balance)) throw new Error('Ingresá un saldo inicial válido.');
  const normalizedCur = currencyInput?.trim() ? currencyInput.trim().toUpperCase() : 'UYU';
  const account: Account = { id: uid(), name, balance, initialBalance: balance, currency: normalizedCur };
  state.finance.accounts.push(account);
  return account;
}

export function deleteAccount(state: LifeOSState, accountId: string): void {
  const account = state.finance.accounts.find((item) => item.id === accountId);
  if (!account) return;
  if (state.finance.accounts.length <= 1) throw new Error('Celestian LifeOS necesita al menos una cuenta.');

  const hasHistory = state.finance.transactions.some((item) => item.accountId === accountId)
    || state.finance.transfers.some((item) => item.fromAccountId === accountId || item.toAccountId === accountId)
    || state.finance.reconciliations.some((item) => item.accountId === accountId)
    || state.resale.inventory.some((item) => item.purchaseAccountId === accountId || item.saleAccountId === accountId)
    || Boolean(state.resale.commercial?.business?.financeLinks?.some((link) => link.choice.accountId === accountId));
  if (hasHistory) throw new Error('Esta cuenta tiene movimientos vinculados. Conservála para no romper el historial.');
  state.finance.accounts = state.finance.accounts.filter((item) => item.id !== accountId);
}

export function addTransfer(state: LifeOSState, input: TransferInput): FinanceTransfer {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto válido.');
  if (!input.fromAccountId || !input.toAccountId) throw new Error('Elegí las dos cuentas.');
  if (input.fromAccountId === input.toAccountId) throw new Error('Las cuentas deben ser diferentes.');

  const fromAccount = state.finance.accounts.find((account) => account.id === input.fromAccountId);
  const toAccount = state.finance.accounts.find((account) => account.id === input.toAccountId);
  if (!fromAccount) throw new Error('La cuenta de origen ya no existe.');
  if (!toAccount) throw new Error('La cuenta de destino ya no existe.');

  const fromCurrency = (fromAccount.currency || 'UYU').toUpperCase();
  const toCurrency = (toAccount.currency || 'UYU').toUpperCase();
  if (fromCurrency !== toCurrency) {
    throw new Error(`No se permiten transferencias entre monedas distintas (${fromCurrency} → ${toCurrency}) sin tasa de conversión.`);
  }

  const date = input.date || todayISO();
  const accountIds = affectedAccountIds([input.fromAccountId, input.toAccountId]);
  assertAccountsCanMaterialize(state, accountIds);
  const transfer: FinanceTransfer = {
    id: uid(),
    effectiveOrder: nextFinanceEffectiveOrder(state, date),
    revisionOrder: createFinanceRevisionOrder(),
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount,
    date,
    note: input.note?.trim() || '',
  };
  state.finance.transfers.push(transfer);
  materializeAccounts(state, accountIds);
  return transfer;
}

export function deleteTransfer(state: LifeOSState, transferId: string): void {
  const transfer = state.finance.transfers.find((item) => item.id === transferId);
  if (!transfer) return;
  const accountIds = affectedAccountIds([transfer.fromAccountId, transfer.toAccountId]);
  assertAccountsCanMaterialize(state, accountIds);
  state.finance.transfers = state.finance.transfers.filter((item) => item.id !== transferId);
  materializeAccounts(state, accountIds);
}

export interface ReconciliationInput {
  accountId: string;
  actualBalance: number;
  date?: string;
  note?: string;
}

export function reconcileAccount(state: LifeOSState, input: ReconciliationInput): AccountReconciliation {
  const account = state.finance.accounts.find((item) => item.id === input.accountId);
  if (!account) throw new Error('La cuenta ya no existe.');
  const actualBalance = roundMoney(input.actualBalance);
  if (!Number.isFinite(actualBalance)) throw new Error('Ingresá el saldo real.');

  const date = input.date || todayISO();
  const normalizedNote = input.note?.trim() || '';
  const duplicate = state.finance.reconciliations.find((item) => (
    item.accountId === input.accountId
    && item.date === date
    && Number(item.actualBalance) === actualBalance
    && String(item.note || '') === normalizedNote
  ));
  if (duplicate) return duplicate;
  assertAccountsCanMaterialize(state, [account.id], true);

  const reconciliation: AccountReconciliation = {
    id: uid(),
    effectiveOrder: nextFinanceEffectiveOrder(state, date),
    revisionOrder: createFinanceRevisionOrder(),
    accountId: account.id,
    date,
    systemBalance: 0,
    actualBalance,
    difference: 0,
    adjustmentTxId: null,
    note: normalizedNote,
  };
  state.finance.reconciliations.push(reconciliation);
  const systemBalance = reconstructAccountBalanceBeforeEvent(
    account,
    reconciliation.id,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  if (systemBalance === null) throw new Error('La cuenta necesita un saldo inicial conocido antes de reconstruir su saldo.');
  const difference = diffMoney(actualBalance, systemBalance);
  reconciliation.systemBalance = systemBalance;
  reconciliation.difference = difference;

  if (difference !== 0) {
    const transaction: Transaction = {
      id: uid(),
      createdAt: new Date().toISOString(),
      effectiveOrder: nextFinanceEffectiveOrder(state, date),
      revisionOrder: reconciliation.revisionOrder,
      type: difference > 0 ? 'ingreso' : 'gasto',
      amount: Math.abs(difference),
      currency: account.currency || 'UYU',
      category: 'Ajuste de saldo',
      fixed: 'variable',
      date,
      note: normalizedNote || `Conciliación de ${account.name}`,
      accountId: account.id,
      origin: 'adjustment',
    };
    state.finance.transactions.push(transaction);
    reconciliation.adjustmentTxId = transaction.id;
  }

  refreshLastReconciledAt(state, account.id);
  materializeAccounts(state, [account.id]);
  return reconciliation;
}

function refreshLastReconciledAt(state: LifeOSState, accountId: string): void {
  const account = state.finance.accounts.find((item) => item.id === accountId);
  if (!account) return;
  const latest = state.finance.reconciliations
    .filter((item) => item.accountId === accountId)
    .map((item) => ({ kind: 'reconciliation' as const, ...item }))
    .sort(compareLedgerEvents)
    .at(-1);
  account.lastReconciledAt = latest?.date || null;
}

export function deleteReconciliation(state: LifeOSState, reconciliationId: string): void {
  const reconciliation = state.finance.reconciliations.find((item) => item.id === reconciliationId);
  if (!reconciliation) return;
  assertAccountsCanMaterialize(state, [reconciliation.accountId], true);
  if (reconciliation.adjustmentTxId) {
    state.finance.transactions = state.finance.transactions.filter((item) => item.id !== reconciliation.adjustmentTxId);
  }
  state.finance.reconciliations = state.finance.reconciliations.filter((item) => item.id !== reconciliationId);
  refreshLastReconciledAt(state, reconciliation.accountId);
  materializeAccounts(state, [reconciliation.accountId]);
}

export function updateReconciliation(state: LifeOSState, reconciliationId: string, input: ReconciliationInput): AccountReconciliation {
  const reconciliation = state.finance.reconciliations.find((item) => item.id === reconciliationId);
  if (!reconciliation) throw new Error('La conciliación ya no existe.');
  if (input.accountId !== reconciliation.accountId) throw new Error('La cuenta de una conciliación existente no se puede cambiar.');
  const account = state.finance.accounts.find((item) => item.id === input.accountId);
  if (!account) throw new Error('La cuenta ya no existe.');
  const actualBalance = roundMoney(input.actualBalance);
  if (!Number.isFinite(actualBalance)) throw new Error('Ingresá el saldo real.');
  assertAccountsCanMaterialize(state, [account.id], true);
  const nextDate = input.date || reconciliation.date;
  const dateChanged = nextDate !== reconciliation.date;
  const effectiveOrder = !dateChanged && reconciliation.effectiveOrder
    ? reconciliation.effectiveOrder
    : nextFinanceEffectiveOrder(state, nextDate);
  const revisionOrder = createFinanceRevisionOrderAfter(reconciliation.revisionOrder);
  let adjustment = reconciliation.adjustmentTxId
    ? state.finance.transactions.find((item) => item.id === reconciliation.adjustmentTxId)
    : undefined;

  Object.assign(reconciliation, {
    accountId: account.id,
    actualBalance,
    date: nextDate,
    effectiveOrder,
    revisionOrder,
    note: input.note?.trim() || '',
  });
  const systemBalance = reconstructAccountBalanceBeforeEvent(
    account,
    reconciliation.id,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  if (systemBalance === null) throw new Error('La cuenta necesita un saldo inicial conocido antes de reconstruir su saldo.');
  const difference = diffMoney(actualBalance, systemBalance);
  if (difference === 0 && adjustment) {
    state.finance.transactions = state.finance.transactions.filter((item) => item.id !== adjustment?.id);
    adjustment = undefined;
  } else if (difference !== 0) {
    if (!adjustment) {
      adjustment = {
        id: uid(), createdAt: new Date().toISOString(), effectiveOrder: nextFinanceEffectiveOrder(state, nextDate), revisionOrder, type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
        currency: account.currency || 'UYU',
        category: 'Ajuste de saldo', fixed: 'variable', date: nextDate,
        note: input.note?.trim() || `Conciliación de ${account.name}`, accountId: account.id, origin: 'adjustment',
      };
      state.finance.transactions.push(adjustment);
    } else {
      Object.assign(adjustment, {
        type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
        currency: account.currency || 'UYU',
        date: nextDate,
        effectiveOrder: dateChanged || !adjustment.effectiveOrder
          ? nextFinanceEffectiveOrder(state, nextDate)
          : adjustment.effectiveOrder,
        revisionOrder,
        note: input.note?.trim() || `Conciliación de ${account.name}`,
        accountId: account.id,
      });
    }
  }

  reconciliation.systemBalance = systemBalance;
  reconciliation.difference = difference;
  reconciliation.adjustmentTxId = adjustment?.id || null;
  refreshLastReconciledAt(state, reconciliation.accountId);
  materializeAccounts(state, [reconciliation.accountId]);
  return reconciliation;
}

/* =========================================================================
   REVIEW INBOX ACTION LAYER
   ========================================================================= */

export function markTransactionReviewed(state: LifeOSState, transactionId: string): Transaction {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  transaction.reviewStatus = 'reviewed';
  transaction.reviewed = true;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  return transaction;
}

export function markMultipleTransactionsReviewed(state: LifeOSState, transactionIds: string[]): Transaction[] {
  const reviewedTxs: Transaction[] = [];
  for (const id of transactionIds) {
    const tx = state.finance.transactions.find((item) => item.id === id);
    if (tx && !transactionDependency(state, tx)) {
      tx.reviewStatus = 'reviewed';
      tx.reviewed = true;
      tx.revisionOrder = createFinanceRevisionOrderAfter(tx.revisionOrder);
      reviewedTxs.push(tx);
    }
  }
  return reviewedTxs;
}

export function ignoreTransactionReview(state: LifeOSState, transactionId: string): Transaction {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  transaction.reviewStatus = 'ignored';
  transaction.reviewed = false;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  return transaction;
}

export function resolveTransactionDuplicate(state: LifeOSState, duplicateTxId: string, keepTxId?: string): void {
  deleteTransaction(state, duplicateTxId);
  if (keepTxId) {
    const keepTx = state.finance.transactions.find((item) => item.id === keepTxId);
    if (keepTx && !transactionDependency(state, keepTx)) {
      keepTx.reviewStatus = 'reviewed';
      keepTx.reviewed = true;
      keepTx.revisionOrder = createFinanceRevisionOrderAfter(keepTx.revisionOrder);
    }
  }
}

export function linkTransactionToCommitment(
  state: LifeOSState,
  transactionId: string,
  commitmentId: string,
): { transaction: Transaction; commitment: FinancialCommitment } {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  const commitment = (state.finance.commitments || []).find((item) => item.id === commitmentId);
  if (!commitment) throw new Error('El compromiso ya no existe.');

  // Invariante de Dominio: Solo movimientos de gasto
  if (transaction.type !== 'gasto') {
    throw new Error('Solo se pueden vincular movimientos de tipo gasto a un compromiso.');
  }

  // Invariante de Dominio: Moneda compatible
  const txCurrency = (transaction.currency || 'UYU').trim().toUpperCase();
  const comCurrency = requireFinancialCurrency(commitment.currency, 'compromiso');
  if (txCurrency !== comCurrency) {
    throw new Error(`Moneda incompatible: el movimiento (${txCurrency}) no coincide con el compromiso (${comCurrency}).`);
  }

  // Invariante de Dominio: Cuenta válida y compatibilidad de moneda
  const account = state.finance.accounts.find((a) => a.id === transaction.accountId);
  if (!account) {
    throw new Error('La cuenta del movimiento ya no existe.');
  }
  const accCurrency = (account.currency || 'UYU').trim().toUpperCase();
  if (accCurrency !== comCurrency) {
    throw new Error(`Moneda incompatible: la cuenta del movimiento (${accCurrency}) no coincide con el compromiso (${comCurrency}).`);
  }

  // Idempotency: if already linked to this commitment and already settled
  if (
    transaction.commitmentId === commitment.id &&
    (commitment.settledTxIds?.includes(transaction.id) || commitment.lastSettledTxId === transaction.id)
  ) {
    return { transaction, commitment };
  }

  // Guard against reusing a transaction already linked to another commitment
  if (transaction.commitmentId && transaction.commitmentId !== commitment.id) {
    throw new Error('El movimiento ya está vinculado a otro compromiso.');
  }

  // Guard if commitment is already fully paid and finalized
  if (!commitment.active && commitment.status === 'paid') {
    throw new Error('El compromiso ya fue pagado y finalizado.');
  }

  const total = commitment.totalInstallments || commitment.totalOccurrences || null;
  const curInst = commitment.currentInstallment || 1;
  const settlementKey = total
    ? `inst-${curInst}`
    : commitment.frequency === 'once'
      ? 'once'
      : `cycle-${commitment.nextDueDate}`;

  transaction.commitmentId = commitment.id;
  transaction.matchedCycle = settlementKey;
  transaction.reviewStatus = 'reviewed';
  transaction.reviewed = true;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);

  const advanced = advanceCommitmentDueDate(commitment);
  const settledTxIds = commitment.settledTxIds ? [...commitment.settledTxIds, transaction.id] : [transaction.id];
  Object.assign(commitment, advanced, {
    lastSettledTxId: transaction.id,
    settledTxIds,
    updatedAt: new Date().toISOString(),
  });

  return { transaction, commitment };
}

export function linkTransactionToExpectedIncome(
  state: LifeOSState,
  transactionId: string,
  expectedIncomeId: string,
  targetCycle?: string | null,
): { transaction: Transaction; expectedIncome: ExpectedIncome } {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  const income = (state.finance.expectedIncomes || []).find((item) => item.id === expectedIncomeId);
  if (!income) throw new Error('El ingreso previsto ya no existe.');

  // Invariante de Dominio 1: Solo movimientos de ingreso
  if (transaction.type !== 'ingreso') {
    throw new Error('Solo se pueden vincular movimientos de tipo ingreso a una previsión de cobro.');
  }

  // Invariante de Dominio 2: Moneda de la transacción vs previsión
  const txCurrency = (transaction.currency || 'UYU').trim().toUpperCase();
  const incCurrency = requireFinancialCurrency(income.currency, 'cobro previsto');
  if (txCurrency !== incCurrency) {
    throw new Error(`Moneda incompatible: el movimiento (${txCurrency}) no coincide con la previsión (${incCurrency}).`);
  }

  // Invariante de Dominio 3: Cuenta existente y moneda de la cuenta
  const account = state.finance.accounts.find((a) => a.id === transaction.accountId);
  if (!account) {
    throw new Error('La cuenta del movimiento ya no existe.');
  }
  const accCurrency = (account.currency || 'UYU').trim().toUpperCase();
  if (accCurrency !== incCurrency) {
    throw new Error(`Moneda incompatible: la cuenta del movimiento (${accCurrency}) no coincide con la previsión (${incCurrency}).`);
  }

  // Idempotency: if already linked to this income and settled
  if (
    transaction.expectedIncomeId === income.id &&
    (income.settledTxIds?.includes(transaction.id) || income.lastSettledTxId === transaction.id)
  ) {
    return { transaction, expectedIncome: income };
  }

  // Guard against reusing a transaction already linked to another income
  if (transaction.expectedIncomeId && transaction.expectedIncomeId !== income.id) {
    throw new Error('El movimiento ya está vinculado a otra previsión.');
  }

  if (!income.active) {
    throw new Error('El ingreso previsto ya fue finalizado.');
  }

  const currentIncomeCycle = income.frequency === 'once' ? 'once' : `cycle-${income.startDate}`;
  const settlementKey = targetCycle || currentIncomeCycle;

  // Invariante de Dominio 4: Si el ciclo ya está liquidado por otra transacción
  if (income.settledTxIds && income.settledTxIds.length > 0) {
    const conflictingTx = state.finance.transactions.find(
      (t) => t.expectedIncomeId === income.id && t.matchedCycle === settlementKey && t.id !== transaction.id
    );
    if (conflictingTx) {
      throw new Error(`El ciclo ${settlementKey} ya fue liquidado por otro movimiento.`);
    }
  }

  transaction.expectedIncomeId = income.id;
  transaction.matchedCycle = settlementKey;
  transaction.reviewStatus = 'reviewed';
  transaction.reviewed = true;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);

  const advanced = advanceExpectedIncomeDate(income);
  const settledTxIds = income.settledTxIds ? [...income.settledTxIds, transaction.id] : [transaction.id];
  Object.assign(income, advanced, {
    lastSettledTxId: transaction.id,
    settledTxIds,
    updatedAt: new Date().toISOString(),
  });

  return { transaction, expectedIncome: income };
}

export function rejectTransactionMatch(
  state: LifeOSState,
  transactionId: string,
  targetId: string,
  cycleKey?: string,
): Transaction {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error('El movimiento ya no existe.');
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);

  let resolvedCycleKey = cycleKey;
  if (!resolvedCycleKey) {
    const com = state.finance.commitments?.find((c) => c.id === targetId);
    if (com) {
      resolvedCycleKey = deriveCycleIdentity(com, 'commitment').cycleKey;
    } else {
      const inc = state.finance.expectedIncomes?.find((i) => i.id === targetId);
      if (inc) {
        resolvedCycleKey = deriveCycleIdentity(inc, 'expected_income').cycleKey;
      }
    }
  }

  const rejectionScopedId = resolvedCycleKey ? `${targetId}:${resolvedCycleKey}` : targetId;
  const currentRejected = transaction.rejectedMatchIds || [];
  if (!currentRejected.includes(rejectionScopedId)) {
    transaction.rejectedMatchIds = [...currentRejected, rejectionScopedId];
    transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  }
  return transaction;
}

export function confirmTransactionMatch(
  state: LifeOSState,
  transactionId: string,
  targetId: string,
  targetType: 'commitment' | 'expected_income' = 'commitment',
): { transaction: Transaction; target: FinancialCommitment | ExpectedIncome } {
  if (targetType === 'expected_income') {
    const res = linkTransactionToExpectedIncome(state, transactionId, targetId);
    return { transaction: res.transaction, target: res.expectedIncome };
  }
  const res = linkTransactionToCommitment(state, transactionId, targetId);
  return { transaction: res.transaction, target: res.commitment };
}

/* =========================================================================
   FINANCIAL COMMITMENT CRUD ACTIONS
   ========================================================================= */

export interface FinancialCommitmentInput {
  id?: string;
  name?: string;
  title?: string;
  amount: number;
  currency?: string;
  frequency?: FinancialCommitment['frequency'];
  nextDueDate?: string;
  dueDate?: string;
  category?: string | null;
  accountId?: string | null;
  endDate?: string | null;
  totalInstallments?: number | null;
  currentInstallment?: number | null;
  totalOccurrences?: number | null;
  remainingOccurrences?: number | null;
  occurrencesLeft?: number | null;
  dueDay?: number | null;
  notes?: string | null;
  active?: boolean;
  status?: FinancialCommitment['status'];
}

export function addFinancialCommitment(
  state: LifeOSState,
  input: FinancialCommitmentInput,
): FinancialCommitment {
  const name = (input.name || input.title || '').trim();
  if (!name) throw new Error('Escribí un nombre para el compromiso.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');

  const currency = input.currency === undefined ? 'UYU' : requireFinancialCurrency(input.currency, 'compromiso');

  if (!state.finance.commitments) state.finance.commitments = [];

  const total = input.totalInstallments ?? input.totalOccurrences ?? null;
  const current = input.currentInstallment ?? (total ? 1 : null);
  const remaining = input.remainingOccurrences ?? input.occurrencesLeft ?? (total ? (current ? Math.max(1, total - current + 1) : total) : null);
  const nextDueDate = input.nextDueDate || input.dueDate || todayISO();
  const curDate = new Date(`${nextDueDate}T12:00:00`);
  const dueDay = input.dueDay ?? curDate.getDate();

  const commitment: FinancialCommitment = {
    id: input.id || uid(),
    name,
    amount,
    currency,
    category: input.category?.trim() || 'Varios',
    frequency: input.frequency || (total && total > 1 ? 'monthly' : 'once'),
    nextDueDate,
    active: input.active !== undefined ? input.active : (remaining !== null ? remaining > 0 : true),
    status: input.status || 'pending',
    accountId: input.accountId || null,
    endDate: input.endDate || null,
    totalOccurrences: total,
    remainingOccurrences: remaining,
    totalInstallments: total,
    currentInstallment: current,
    dueDay,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.finance.commitments.push(commitment);
  return commitment;
}

export function updateFinancialCommitment(
  state: LifeOSState,
  commitmentId: string,
  input: Partial<FinancialCommitmentInput>,
): FinancialCommitment {
  const commitment = (state.finance.commitments || []).find((item) => item.id === commitmentId);
  if (!commitment) throw new Error('El compromiso ya no existe.');

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Escribí un nombre para el compromiso.');
    commitment.name = name;
  }
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
    commitment.amount = amount;
  }
  if (input.currency !== undefined) commitment.currency = input.currency;
  if (input.category !== undefined) commitment.category = input.category?.trim() || 'Varios';
  if (input.frequency !== undefined) commitment.frequency = input.frequency;
  if (input.nextDueDate !== undefined) commitment.nextDueDate = input.nextDueDate;
  if (input.accountId !== undefined) commitment.accountId = input.accountId;
  if (input.endDate !== undefined) commitment.endDate = input.endDate;
  if (input.totalInstallments !== undefined) {
    commitment.totalInstallments = input.totalInstallments;
    commitment.totalOccurrences = input.totalInstallments;
  }
  if (input.currentInstallment !== undefined) commitment.currentInstallment = input.currentInstallment;
  if (input.remainingOccurrences !== undefined) commitment.remainingOccurrences = input.remainingOccurrences;
  if (input.dueDay !== undefined) commitment.dueDay = input.dueDay;
  if (input.notes !== undefined) commitment.notes = input.notes?.trim() || null;

  commitment.updatedAt = new Date().toISOString();
  return commitment;
}

export function deleteFinancialCommitment(state: LifeOSState, commitmentId: string): void {
  if (!state.finance.commitments) return;
  state.finance.commitments = state.finance.commitments.filter((item) => item.id !== commitmentId);
}
