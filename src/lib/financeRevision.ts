import type { LifeOSState } from '../types';

function randomRevisionToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replaceAll('-', '');
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function parseFinanceRevisionOrder(order?: string | null): { millis: number; counter: number } | null {
  if (!order) return null;
  const match = /^r1-([0-9a-z]{10})-([0-9a-z]{6})-/.exec(order);
  if (!match) return null;
  const millis = Number.parseInt(match[1], 36);
  const counter = Number.parseInt(match[2], 36);
  return Number.isSafeInteger(millis) && Number.isSafeInteger(counter) ? { millis, counter } : null;
}

export function createFinanceRevisionOrder(
  nowMs = Date.now(),
  randomToken = randomRevisionToken(),
): string {
  return createFinanceRevisionOrderAfter(undefined, nowMs, randomToken);
}

/** Revision metadata orders versions of one entity; it is not accounting time. */
export function createFinanceRevisionOrderAfter(
  previousOrder?: string | null,
  nowMs = Date.now(),
  randomToken = randomRevisionToken(),
): string {
  const previous = parseFinanceRevisionOrder(previousOrder);
  const physicalMillis = Math.max(0, Math.floor(nowMs));
  const logicalMillis = Math.max(physicalMillis, previous?.millis || 0);
  const counter = previous && logicalMillis === previous.millis ? previous.counter + 1 : 0;
  return `r1-${logicalMillis.toString(36).padStart(10, '0')}-${counter.toString(36).padStart(6, '0')}-${randomToken}`;
}

export function financeRevisionMillis(order?: string | null): number {
  return parseFinanceRevisionOrder(order)?.millis || 0;
}

export function nextFinanceDeletionTimestamp(
  state: LifeOSState,
  entityId: string,
  nowMs = Date.now(),
): number {
  const entity = [
    ...state.finance.transactions,
    ...state.finance.transfers,
    ...state.finance.reconciliations,
  ].find((item) => item.id === entityId);
  const revisionMillis = financeRevisionMillis(entity?.revisionOrder);
  return Math.max(Math.max(0, Math.floor(nowMs)), revisionMillis > 0 ? revisionMillis + 1 : 0);
}
