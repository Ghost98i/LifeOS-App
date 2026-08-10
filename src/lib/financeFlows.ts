import type { AccountReconciliation, FinanceTransfer, LifeOSState, Transaction } from '../types';
import { adjustAccountBalance } from './calculations';
import { todayISO, uid } from './storage';

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date?: string;
  note?: string;
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
