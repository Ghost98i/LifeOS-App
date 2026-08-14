import type { LifeOSState, Transaction } from '../types';
import { adjustAccountBalance, defaultAccountId } from './calculations';
import { todayISO, uid } from './storage';

export interface QuickTransactionInput {
  type: 'gasto' | 'ingreso';
  amount: number;
  accountId?: string | null;
  category?: string;
  note?: string;
  date?: string;
}

export function suggestedQuickAccountId(state: LifeOSState, type: 'gasto' | 'ingreso'): string {
  const recent = [...state.finance.transactions]
    .reverse()
    .find((transaction) => transaction.type === type && transaction.accountId);
  if (recent?.accountId && state.finance.accounts.some((account) => account.id === recent.accountId)) {
    return recent.accountId;
  }

  const bank = state.finance.accounts.find((account) => /banco|brou/i.test(account.name));
  return bank?.id || state.finance.accounts[0]?.id || '';
}

export function addQuickTransaction(state: LifeOSState, input: QuickTransactionInput): Transaction {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto válido.');

  const accountId = input.accountId || defaultAccountId(state);
  const transaction: Transaction = {
    id: uid(),
    type: input.type,
    amount,
    category: input.category?.trim() || 'Otros',
    fixed: 'variable',
    date: input.date || todayISO(),
    note: input.note?.trim() || '',
    accountId,
    origin: 'quick',
  };

  state.finance.transactions.push(transaction);
  adjustAccountBalance(state, accountId, input.type === 'ingreso' ? amount : -amount);
  return transaction;
}

export function addQuickTask(
  state: LifeOSState,
  text: string,
  priority: 'alta' | 'media' | 'baja' = 'media',
  date = todayISO()
): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí qué querés recordar.');
  const id = uid();
  state.todayExtras.push({ id, text: cleanText, priority, date, done: false });
  return id;
}

export function addQuickNote(state: LifeOSState, text: string, date = todayISO()): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí la nota.');
  const id = uid();
  state.notes.postits.push({ id, text: cleanText, date });
  return id;
}
