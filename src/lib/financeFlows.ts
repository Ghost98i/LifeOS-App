import type { Account, AccountReconciliation, FinanceTransfer, LifeOSState, Transaction } from '../types';
import { adjustAccountBalance } from './calculations';
import { todayISO, uid } from './storage';

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date?: string;
  note?: string;
}

export interface TransactionInput {
  type: Transaction['type'];
  amount: number;
  category: string;
  fixed: Transaction['fixed'];
  date?: string;
  note?: string;
  accountId: string | null;
  origin?: Transaction['origin'];
}

function balanceIsFixedAfter(state: LifeOSState, accountId: string | null | undefined, date: string): boolean {
  if (!accountId) return false;
  return state.finance.reconciliations.some((item) => item.accountId === accountId && item.date >= date);
}

function applyTransactionBalance(state: LifeOSState, transaction: Pick<Transaction, 'accountId' | 'date' | 'type' | 'amount'>, direction = 1): void {
  if (balanceIsFixedAfter(state, transaction.accountId, transaction.date)) return;
  const signed = transaction.type === 'ingreso' ? Number(transaction.amount) : -Number(transaction.amount);
  adjustAccountBalance(state, transaction.accountId, signed * direction);
}

export function addTransaction(state: LifeOSState, input: TransactionInput): Transaction {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto mayor a cero.');
  if (!input.accountId || !state.finance.accounts.some((account) => account.id === input.accountId)) {
    throw new Error('Elegí una cuenta válida.');
  }
  if (!input.category.trim()) throw new Error('Elegí una categoría.');

  const transaction: Transaction = {
    id: uid(),
    type: input.type,
    amount,
    category: input.category.trim(),
    fixed: input.fixed,
    date: input.date || todayISO(),
    note: input.note?.trim() || '',
    accountId: input.accountId,
    origin: input.origin || 'manual',
  };
  state.finance.transactions.push(transaction);
  applyTransactionBalance(state, transaction);
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
  applyTransactionBalance(state, transaction, -1);
  state.finance.transactions = state.finance.transactions.filter((item) => item.id !== transactionId);
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

  applyTransactionBalance(state, transaction, -1);
  Object.assign(transaction, {
    type: input.type,
    amount,
    category: input.category.trim(),
    fixed: input.fixed,
    date: input.date || todayISO(),
    note: input.note?.trim() || '',
    accountId: input.accountId,
  });
  applyTransactionBalance(state, transaction);
  return transaction;
}

export function addAccount(state: LifeOSState, nameInput: string, balanceInput: number): Account {
  const name = nameInput.trim();
  const balance = Number(balanceInput);
  if (!name) throw new Error('Escribí un nombre para la cuenta.');
  if (!Number.isFinite(balance)) throw new Error('Ingresá un saldo inicial válido.');
  const account = { id: uid(), name, balance };
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

  const transfer: FinanceTransfer = {
    id: uid(),
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount,
    date: input.date || todayISO(),
    note: input.note?.trim() || '',
  };
  state.finance.transfers.push(transfer);
  if (!balanceIsFixedAfter(state, transfer.fromAccountId, transfer.date)) adjustAccountBalance(state, transfer.fromAccountId, -amount);
  if (!balanceIsFixedAfter(state, transfer.toAccountId, transfer.date)) adjustAccountBalance(state, transfer.toAccountId, amount);
  return transfer;
}

export function deleteTransfer(state: LifeOSState, transferId: string): void {
  const transfer = state.finance.transfers.find((item) => item.id === transferId);
  if (!transfer) return;
  if (!balanceIsFixedAfter(state, transfer.fromAccountId, transfer.date)) adjustAccountBalance(state, transfer.fromAccountId, transfer.amount);
  if (!balanceIsFixedAfter(state, transfer.toAccountId, transfer.date)) adjustAccountBalance(state, transfer.toAccountId, -transfer.amount);
  state.finance.transfers = state.finance.transfers.filter((item) => item.id !== transferId);
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

  const systemBalance = Number(account.balance || 0);
  const difference = actualBalance - systemBalance;
  const date = input.date || todayISO();
  const normalizedNote = input.note?.trim() || '';
  const duplicate = state.finance.reconciliations.find((item) => (
    item.accountId === input.accountId
    && item.date === date
    && Number(item.actualBalance) === actualBalance
    && String(item.note || '') === normalizedNote
  ));
  if (duplicate) return duplicate;
  let adjustmentTxId: string | null = null;

  if (difference !== 0) {
    const transaction: Transaction = {
      id: uid(),
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
    adjustmentTxId = transaction.id;
  }

  account.balance = actualBalance;
  account.lastReconciledAt = date;
  const reconciliation: AccountReconciliation = {
    id: uid(),
    accountId: account.id,
    date,
    systemBalance,
    actualBalance,
    difference,
    adjustmentTxId,
    note: normalizedNote,
  };
  state.finance.reconciliations.push(reconciliation);
  return reconciliation;
}

function refreshLastReconciledAt(state: LifeOSState, accountId: string): void {
  const account = state.finance.accounts.find((item) => item.id === accountId);
  if (!account) return;
  account.lastReconciledAt = state.finance.reconciliations
    .filter((item) => item.accountId === accountId)
    .map((item) => item.date)
    .sort()
    .at(-1) || null;
}

export function deleteReconciliation(state: LifeOSState, reconciliationId: string): void {
  const reconciliation = state.finance.reconciliations.find((item) => item.id === reconciliationId);
  if (!reconciliation) return;
  // Conciliar declara un saldo observado. Al limpiar el registro no se debe
  // volver a mover el dinero actual ni deshacer movimientos posteriores.
  if (reconciliation.adjustmentTxId) {
    state.finance.transactions = state.finance.transactions.filter((item) => item.id !== reconciliation.adjustmentTxId);
  }
  state.finance.reconciliations = state.finance.reconciliations.filter((item) => item.id !== reconciliationId);
  refreshLastReconciledAt(state, reconciliation.accountId);
}

export function updateReconciliation(state: LifeOSState, reconciliationId: string, input: ReconciliationInput): AccountReconciliation {
  const reconciliation = state.finance.reconciliations.find((item) => item.id === reconciliationId);
  if (!reconciliation) throw new Error('La conciliación ya no existe.');
  if (input.accountId !== reconciliation.accountId) throw new Error('La cuenta de una conciliación existente no se puede cambiar.');
  const account = state.finance.accounts.find((item) => item.id === input.accountId);
  if (!account) throw new Error('La cuenta ya no existe.');
  const actualBalance = Number(input.actualBalance);
  if (!Number.isFinite(actualBalance)) throw new Error('Ingresá el saldo real.');

  const wasLatest = reconciliation.date === state.finance.reconciliations
    .filter((item) => item.accountId === reconciliation.accountId)
    .map((item) => item.date)
    .sort()
    .at(-1);
  if (wasLatest && reconciliation.accountId === input.accountId) {
    account.balance += actualBalance - Number(reconciliation.actualBalance || 0);
  }

  const difference = actualBalance - Number(reconciliation.systemBalance || 0);
  let adjustment = reconciliation.adjustmentTxId
    ? state.finance.transactions.find((item) => item.id === reconciliation.adjustmentTxId)
    : undefined;
  if (difference === 0 && adjustment) {
    state.finance.transactions = state.finance.transactions.filter((item) => item.id !== adjustment?.id);
    adjustment = undefined;
  } else if (difference !== 0) {
    if (!adjustment) {
      adjustment = {
        id: uid(), type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
        category: 'Ajuste de saldo', fixed: 'variable', date: input.date || reconciliation.date,
        note: input.note?.trim() || `Conciliación de ${account.name}`, accountId: account.id, origin: 'adjustment',
      };
      state.finance.transactions.push(adjustment);
    } else {
      Object.assign(adjustment, {
        type: difference > 0 ? 'ingreso' : 'gasto', amount: Math.abs(difference),
        date: input.date || reconciliation.date, note: input.note?.trim() || `Conciliación de ${account.name}`,
        accountId: account.id,
      });
    }
  }

  reconciliation.accountId = account.id;
  reconciliation.actualBalance = actualBalance;
  reconciliation.difference = difference;
  reconciliation.date = input.date || reconciliation.date;
  reconciliation.note = input.note?.trim() || '';
  reconciliation.adjustmentTxId = adjustment?.id || null;
  refreshLastReconciledAt(state, reconciliation.accountId);
  return reconciliation;
}
