import type { Transaction } from '../types';

const validTime = (value?: string | null): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function registrationDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const localTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function timeWithinOperationDay(transaction: Transaction): number | null {
  if (validTime(transaction.operationTime)) {
    const [hours, minutes] = transaction.operationTime.split(':').map(Number);
    return hours * 60 + minutes;
  }
  const registered = registrationDate(transaction.createdAt);
  if (!registered || localDay(registered) !== transaction.date) return null;
  return registered.getHours() * 60 + registered.getMinutes();
}

/** Fecha comercial primero; después la hora conocida o el orden de registro disponible. */
export function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate) return byDate;

  const aTime = timeWithinOperationDay(a);
  const bTime = timeWithinOperationDay(b);
  if (aTime !== null || bTime !== null) {
    if (aTime === null) return -1;
    if (bTime === null) return 1;
    if (aTime !== bTime) return aTime - bTime;
  }

  const aRegistered = registrationDate(a.createdAt);
  const bRegistered = registrationDate(b.createdAt);
  if (Boolean(aRegistered) !== Boolean(bRegistered)) return aRegistered ? 1 : -1;
  if (aRegistered && bRegistered && aRegistered.getTime() !== bRegistered.getTime())
    return aRegistered.getTime() - bRegistered.getTime();

  if (a.effectiveOrder !== b.effectiveOrder) {
    if (!a.effectiveOrder) return -1;
    if (!b.effectiveOrder) return 1;
    return a.effectiveOrder.localeCompare(b.effectiveOrder);
  }
  return a.id.localeCompare(b.id);
}

export function transactionTimeLabel(transaction: Transaction): string | null {
  if (validTime(transaction.operationTime)) return transaction.operationTime;
  const registered = registrationDate(transaction.createdAt);
  if (!registered) return null;
  const datePrefix = localDay(registered) === transaction.date
    ? ''
    : `${localDay(registered)} · `;
  return `Registrado ${datePrefix}${localTime(registered)}`;
}
