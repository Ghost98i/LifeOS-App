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
  adjustAccountBalance(state, transaction.accountId, transaction.type === 'ingreso' ? amount : -amount);
  return transaction;
}

function transactionDependency(state: LifeOSState, transaction: Transaction): string | null {
  if (transaction.origin === 'adjustment' || state.finance.reconciliations.some((item) => item.adjustmentTxId === transaction.id)) {
    return 'Es un ajuste de conciliación. Volvé a conciliar la cuenta para corregir el saldo.';
  }
  if (state.resale.inventory.some((item) => [item.purchaseTxId, item.saleTxId, item.feeTxId, item.financeTxId].includes(transaction.id))) {
    return 'Está vinculado a una reventa. Editá o eliminá la operación desde Reventa.';
  }
  const account = state.finance.accounts.find((item) => item.id === transaction.accountId);
  if (account?.lastReconciledAt && transaction.date <= account.lastReconciledAt) {
    return `La cuenta fue conciliada el ${account.lastReconciledAt}. Agregá un movimiento de corrección para conservar el historial.`;
  }
  return null;
}

export function deleteTransaction(state: LifeOSState, transactionId: string): void {
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  const dependency = transactionDependency(state, transaction);
  if (dependency) throw new Error(dependency);
  adjustAccountBalance(
    state,
    transaction.accountId,
    transaction.type === 'ingreso' ? -Number(transaction.amount) : Number(transaction.amount),
  );
  state.finance.transactions = state.finance.transactions.filter((item) => item.id !== transactionId);
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
  adjustAccountBalance(state, transfer.fromAccountId, -amount);
  adjustAccountBalance(state, transfer.toAccountId, amount);
  return transfer;
}

export function deleteTransfer(state: LifeOSState, transferId: string): void {
  const transfer = state.finance.transfers.find((item) => item.id === transferId);
  if (!transfer) return;
  adjustAccountBalance(state, transfer.fromAccountId, transfer.amount);
  adjustAccountBalance(state, transfer.toAccountId, -transfer.amount);
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
  let adjustmentTxId: string | null = null;

  if (difference !== 0) {
    const transaction: Transaction = {
      id: uid(),
      type: difference > 0 ? 'ingreso' : 'gasto',
      amount: Math.abs(difference),
      category: 'Ajuste de saldo',
      fixed: 'variable',
      date,
      note: input.note?.trim() || `Conciliación de ${account.name}`,
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
    note: input.note?.trim() || '',
  };
  state.finance.reconciliations.push(reconciliation);
  return reconciliation;
}
