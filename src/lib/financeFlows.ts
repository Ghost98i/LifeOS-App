import type {
  Account,
  AccountReconciliation,
  FinanceTransfer,
  FinancialCommitment,
  LifeOSState,
  Transaction,
} from '../types';
import { advanceCommitmentDueDate, advanceExpectedIncomeDate } from './financialCommitments';
import {
  compareLedgerEvents,
  compareMaterializedBalanceShadow,
  nextFinanceEffectiveOrder,
  reconstructAccountBalance,
  reconstructAccountBalanceBeforeEvent,
} from './financeLedger';
import { createFinanceRevisionOrder, createFinanceRevisionOrderAfter } from './financeRevision';
import { todayISO, uid } from './storage';

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
  note?: string;
  accountId: string | null;
  origin?: Transaction['origin'];
  reviewStatus?: Transaction['reviewStatus'];
  reviewed?: boolean;
  commitmentId?: string | null;
}

function affectedAccountIds(accountIds: Array<string | null | undefined>): string[] {
  return [...new Set(accountIds.filter((id): id is string => Boolean(id)))];
}

function assertAccountsCanMaterialize(
  state: LifeOSState,
  accountIds: string[],
  allowAmbiguousReconciliationChange = false,
): void {
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
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
  if (!input.accountId || !state.finance.accounts.some((account) => account.id === input.accountId)) {
    throw new Error('Elegí una cuenta válida.');
  }
  if (!input.category.trim()) throw new Error('Elegí una categoría.');

  const date = input.date || todayISO();
  assertAccountsCanMaterialize(state, [input.accountId]);

  const reviewStatus = input.reviewStatus !== undefined
    ? input.reviewStatus
    : (input.reviewed ? 'reviewed' : 'pending');

  const transaction: Transaction = {
    id: input.id || uid(),
    effectiveOrder: nextFinanceEffectiveOrder(state, date),
    revisionOrder: createFinanceRevisionOrder(),
    type: input.type,
    amount,
    category: input.category.trim(),
    fixed: input.fixed || 'variable',
    date,
    note: input.note?.trim() || '',
    accountId: input.accountId,
    origin: input.origin || 'manual',
    reviewStatus,
    reviewed: reviewStatus === 'reviewed',
    commitmentId: input.commitmentId || null,
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
}

export function confirmFinancialCommitment(
  state: LifeOSState,
  input: ConfirmFinancialCommitmentInput,
): Transaction {
  const commitment = (state.finance.commitments || []).find((item) => item.id === input.commitmentId);
  if (!commitment) throw new Error('El compromiso ya no existe.');

  const total = commitment.totalInstallments || commitment.totalOccurrences || null;
  const curInst = commitment.currentInstallment || 1;
  const txDate = input.date || todayISO();
  const settlementKey = total
    ? `inst-${curInst}`
    : commitment.frequency === 'once'
      ? 'once'
      : `cycle-${commitment.nextDueDate}`;
  const deterministicTxId = `settle-${commitment.id}-${settlementKey}`;

  // Idempotency check: if already settled by this deterministic id or lastSettledTxId
  const existingTx = state.finance.transactions.find((tx) =>
    tx.id === deterministicTxId ||
    (tx.commitmentId === commitment.id && tx.id === commitment.lastSettledTxId)
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

  const amount = input.amount ?? Number(commitment.amount);
  const accountId = input.accountId || commitment.accountId || state.finance.accounts[0]?.id || null;
  const advanced = advanceCommitmentDueDate(commitment);
  const installmentLabel = total ? ` (Cuota ${curInst}/${total})` : '';

  const transaction = addTransaction(state, {
    id: deterministicTxId,
    type: 'gasto',
    amount,
    category: commitment.category || 'Varios',
    fixed: 'fijo',
    accountId,
    date: txDate,
    note: `Pago de compromiso: ${commitment.name}${installmentLabel}`,
    commitmentId: commitment.id,
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
}

export function confirmExpectedIncome(
  state: LifeOSState,
  input: ConfirmExpectedIncomeInput,
): Transaction {
  const income = (state.finance.expectedIncomes || []).find((item) => item.id === input.expectedIncomeId);
  if (!income) throw new Error('El ingreso previsto ya no existe.');

  const accountId = input.accountId || income.accountId || state.finance.accounts[0]?.id || null;
  const advanced = advanceExpectedIncomeDate(income);
  const transaction = addTransaction(state, {
    type: 'ingreso',
    amount: Number(income.amount),
    category: income.category || 'Varios',
    fixed: 'variable',
    accountId,
    date: input.date || todayISO(),
    note: `Previsión confirmada: ${income.name}`,
  });

  Object.assign(income, advanced, { updatedAt: new Date().toISOString() });
  return transaction;
}

function transactionDependency(state: LifeOSState, transaction: Transaction): string | null {
  if (transaction.origin === 'adjustment' || state.finance.reconciliations.some((item) => item.adjustmentTxId === transaction.id)) {
    return 'Es un ajuste de conciliación. Volvé a conciliar la cuenta para corregir el saldo.';
  }
  if (state.resale.inventory.some((item) => [item.purchaseTxId, item.saleTxId, item.feeTxId, item.financeTxId].includes(transaction.id))) {
    return 'Está vinculado a una reventa. Editá o eliminá la operación desde Reventa.';
  }
  return null;
}

export function deleteTransaction(state: LifeOSState, transactionId: string): void {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  removeTransaction(state, transaction);
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
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
  if (!input.accountId || !state.finance.accounts.some((account) => account.id === input.accountId)) throw new Error('Elegí una cuenta válida.');
  if (!input.category.trim()) throw new Error('Elegí una categoría.');

  const previousAccountId = transaction.accountId;
  const date = input.date || todayISO();
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
    effectiveOrder,
    revisionOrder,
    note: input.note?.trim() || '',
    accountId: input.accountId,
    reviewStatus,
    reviewed: reviewStatus === 'reviewed',
    commitmentId: input.commitmentId !== undefined ? input.commitmentId : transaction.commitmentId,
  });
  materializeAccounts(state, accountIds);
  return transaction;
}

export function computeAccountBalance(
  account: Account,
  transactions: Transaction[] = [],
  transfers: FinanceTransfer[] = [],
  reconciliations: AccountReconciliation[] = []
): number {
  const accountRecons = (reconciliations || [])
    .filter((r) => r.accountId === account.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const latestRecon = accountRecons[0] || null;

  if (latestRecon) {
    let balance = Number(latestRecon.actualBalance || 0);

    for (const tx of transactions || []) {
      if (tx.accountId !== account.id) continue;
      if (latestRecon.adjustmentTxId && tx.id === latestRecon.adjustmentTxId) continue;

      if ((tx.date || '') > (latestRecon.date || '')) {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'ingreso') balance += amount;
        else balance -= amount;
      }
    }

    for (const tr of transfers || []) {
      if ((tr.date || '') > (latestRecon.date || '')) {
        const amount = Number(tr.amount || 0);
        if (tr.toAccountId === account.id) balance += amount;
        if (tr.fromAccountId === account.id) balance -= amount;
      }
    }

    return Math.round(balance * 100) / 100;
  }

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

  const base = typeof account.initialBalance === 'number' && Number.isFinite(account.initialBalance)
    ? account.initialBalance
    : Number(account.balance || 0) - totalDelta;

  return Math.round((base + totalDelta) * 100) / 100;
}

export function addAccount(state: LifeOSState, nameInput: string, balanceInput: number): Account {
  const name = nameInput.trim();
  const balance = Number(balanceInput);
  if (!name) throw new Error('Escribí un nombre para la cuenta.');
  if (!Number.isFinite(balance)) throw new Error('Ingresá un saldo inicial válido.');
  const account: Account = { id: uid(), name, balance, initialBalance: balance };
  state.finance.accounts.push(account);
  return account;
}

export function deleteAccount(state: LifeOSState, accountId: string): void {
  const account = state.finance.accounts.find((item) => item.id === accountId);
  if (!account) return;
  if (state.finance.accounts.length <= 1) throw new Error('LifeOS necesita al menos una cuenta.');

  const hasHistory = state.finance.transactions.some((item) => item.accountId === accountId)
    || state.finance.transfers.some((item) => item.fromAccountId === accountId || item.toAccountId === accountId)
    || state.finance.reconciliations.some((item) => item.accountId === accountId)
    || state.resale.inventory.some((item) => item.purchaseAccountId === accountId || item.saleAccountId === accountId);
  if (hasHistory) throw new Error('Esta cuenta tiene movimientos vinculados. Conservála para no romper el historial.');
  state.finance.accounts = state.finance.accounts.filter((item) => item.id !== accountId);
}

export function addTransfer(state: LifeOSState, input: TransferInput): FinanceTransfer {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto válido.');
  if (!input.fromAccountId || !input.toAccountId) throw new Error('Elegí las dos cuentas.');
  if (input.fromAccountId === input.toAccountId) throw new Error('Las cuentas deben ser diferentes.');
  if (!state.finance.accounts.some((account) => account.id === input.fromAccountId)) throw new Error('La cuenta de origen ya no existe.');
  if (!state.finance.accounts.some((account) => account.id === input.toAccountId)) throw new Error('La cuenta de destino ya no existe.');

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
  const actualBalance = Number(input.actualBalance);
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
  const difference = actualBalance - systemBalance;
  reconciliation.systemBalance = systemBalance;
  reconciliation.difference = difference;

  if (difference !== 0) {
    const transaction: Transaction = {
      id: uid(),
      effectiveOrder: nextFinanceEffectiveOrder(state, date),
      revisionOrder: reconciliation.revisionOrder,
      type: difference > 0 ? 'ingreso' : 'gasto',
      amount: Math.abs(difference),
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
  const actualBalance = Number(input.actualBalance);
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
  const difference = actualBalance - systemBalance;
  if (difference === 0 && adjustment) {
    state.finance.transactions = state.finance.transactions.filter((item) => item.id !== adjustment?.id);
    adjustment = undefined;
  } else if (difference !== 0) {
    if (!adjustment) {
      adjustment = {
        id: uid(), effectiveOrder: nextFinanceEffectiveOrder(state, nextDate), revisionOrder, type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
        category: 'Ajuste de saldo', fixed: 'variable', date: nextDate,
        note: input.note?.trim() || `Conciliación de ${account.name}`, accountId: account.id, origin: 'adjustment',
      };
      state.finance.transactions.push(adjustment);
    } else {
      Object.assign(adjustment, {
        type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
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
  transaction.reviewStatus = 'reviewed';
  transaction.reviewed = true;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  return transaction;
}

export function markMultipleTransactionsReviewed(state: LifeOSState, transactionIds: string[]): Transaction[] {
  const reviewedTxs: Transaction[] = [];
  for (const id of transactionIds) {
    const tx = state.finance.transactions.find((item) => item.id === id);
    if (tx) {
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
  transaction.reviewStatus = 'ignored';
  transaction.reviewed = false;
  transaction.revisionOrder = createFinanceRevisionOrderAfter(transaction.revisionOrder);
  return transaction;
}

export function resolveTransactionDuplicate(state: LifeOSState, duplicateTxId: string, keepTxId?: string): void {
  deleteTransaction(state, duplicateTxId);
  if (keepTxId) {
    const keepTx = state.finance.transactions.find((item) => item.id === keepTxId);
    if (keepTx) {
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
  const commitment = (state.finance.commitments || []).find((item) => item.id === commitmentId);
  if (!commitment) throw new Error('El compromiso ya no existe.');

  transaction.commitmentId = commitment.id;
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

/* =========================================================================
   FINANCIAL COMMITMENT CRUD ACTIONS
   ========================================================================= */

export interface FinancialCommitmentInput {
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
}

export function addFinancialCommitment(
  state: LifeOSState,
  input: FinancialCommitmentInput,
): FinancialCommitment {
  const name = (input.name || input.title || '').trim();
  if (!name) throw new Error('Escribí un nombre para el compromiso.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');

  if (!state.finance.commitments) state.finance.commitments = [];

  const total = input.totalInstallments ?? input.totalOccurrences ?? null;
  const current = input.currentInstallment ?? (total ? 1 : null);
  const remaining = input.remainingOccurrences ?? input.occurrencesLeft ?? (total ? (current ? Math.max(1, total - current + 1) : total) : null);
  const nextDueDate = input.nextDueDate || input.dueDate || todayISO();
  const curDate = new Date(`${nextDueDate}T12:00:00`);
  const dueDay = input.dueDay ?? curDate.getDate();

  const commitment: FinancialCommitment = {
    id: uid(),
    name,
    amount,
    currency: input.currency || 'UYU',
    category: input.category?.trim() || 'Varios',
    frequency: input.frequency || (total && total > 1 ? 'monthly' : 'once'),
    nextDueDate,
    active: true,
    status: 'pending',
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
