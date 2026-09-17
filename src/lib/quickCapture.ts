import type { EffortLevel, LifeOSState, Transaction } from '../types';
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
  date = todayISO(),
  effort: EffortLevel = 'medium',
): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí qué querés recordar.');
  const id = uid();
  state.todayExtras.push({ id, text: cleanText, priority, date, done: false, effort });
  return id;
}

export function addQuickNote(state: LifeOSState, text: string, date = todayISO()): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí la nota.');
  const id = uid();
  state.notes.postits.push({ id, text: cleanText, date });
  return id;
}

export function addQuickIdea(state: LifeOSState, text: string): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí la idea.');
  const id = uid();
  state.notes.postits.push({ id, text: `[Idea] ${cleanText}`, date: todayISO() });
  return id;
}

export function addQuickReminder(state: LifeOSState, text: string, date = todayISO(), time?: string): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí el recordatorio.');
  const id = uid();
  const label = time ? `${cleanText} (${time})` : cleanText;
  state.todayExtras.push({ id, text: label, priority: 'alta', date, done: false, effort: 'low' });
  return id;
}

export function addQuickInbox(
  state: LifeOSState,
  text: string,
  source: 'quick-capture' | 'voice' | 'manual' = 'quick-capture'
): string {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Escribí el pendiente o idea.');
  if (!state.inbox) state.inbox = [];
  const id = uid();
  state.inbox.unshift({
    id,
    text: cleanText,
    createdAt: new Date().toISOString(),
    source,
  });
  return id;
}

export function deleteInboxItem(state: LifeOSState, id: string): void {
  if (!state.inbox) return;
  state.inbox = state.inbox.filter((item) => item.id !== id);
}

export function convertInboxItem(
  state: LifeOSState,
  id: string,
  target: 'tarea' | 'nota' | 'recordatorio' | 'proyecto',
  options?: {
    priority?: 'alta' | 'media' | 'baja';
    date?: string;
    reminderTime?: string;
    projectName?: string;
    projectObjective?: string;
  }
): { convertedId: string } {
  if (!state.inbox) state.inbox = [];
  const item = state.inbox.find((x) => x.id === id);
  if (!item) throw new Error('Elemento de bandeja de entrada no encontrado.');

  let convertedId = '';
  if (target === 'tarea') {
    convertedId = addQuickTask(state, item.text, options?.priority || 'media', options?.date || todayISO());
  } else if (target === 'nota') {
    convertedId = addQuickNote(state, item.text, options?.date || todayISO());
  } else if (target === 'recordatorio') {
    convertedId = addQuickReminder(state, item.text, options?.date || todayISO(), options?.reminderTime);
  } else if (target === 'proyecto') {
    if (!state.projects) state.projects = [];
    convertedId = uid();
    state.projects.unshift({
      id: convertedId,
      name: options?.projectName?.trim() || item.text,
      objective: options?.projectObjective?.trim() || item.text,
      status: 'activo',
      nextStep: 'Definir primera acción concreta',
      tasks: [],
      createdAt: todayISO(),
    });
  }

  deleteInboxItem(state, id);
  return { convertedId };
}


