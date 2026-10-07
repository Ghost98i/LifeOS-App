import type {
  Account,
  AccountReconciliation,
  FinanceTransfer,
  LifeOSState,
  Transaction,
} from '../types';

export type LedgerEventKind = 'transaction' | 'transfer' | 'reconciliation';

export interface LedgerEventOrderable {
  kind: LedgerEventKind;
  id: string;
  date: string;
  effectiveOrder?: string;
}

export interface LegacyReconciliationAmbiguity {
  type: 'multiple_legacy_reconciliations_same_date';
  accountId: string;
  date: string;
  reconciliationIds: string[];
}

export interface AccountBalanceReconstruction {
  balance: number | null;
  orderedEventIds: string[];
  excludedAdjustmentIds: string[];
  unlinkedAdjustmentIds: string[];
  ambiguities: LegacyReconciliationAmbiguity[];
  missingInitialBalance: boolean;
}

export interface MaterializedBalanceShadow extends AccountBalanceReconstruction {
  accountId: string;
  materializedBalance: number;
  reconstructedBalance: number | null;
  difference: number | null;
  matches: boolean;
}

type LedgerEvent = LedgerEventOrderable & (
  | { kind: 'transaction'; value: Transaction }
  | { kind: 'transfer'; value: FinanceTransfer }
  | { kind: 'reconciliation'; value: AccountReconciliation }
);

const LEGACY_KIND_RANK: Record<LedgerEventKind, number> = {
  transaction: 0,
  transfer: 1,
  reconciliation: 2,
};

let lastEffectiveMillis = 0;
let effectiveCounter = 0;

function randomOrderToken(): string {
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

/**
 * Creates an offline-safe, timezone-independent and lexically sortable order key.
 * The logical millisecond and counter preserve local creation order; the random
 * token makes collisions across devices negligibly likely and provides a stable tie-break.
 */
export function createEffectiveOrder(nowMs = Date.now(), randomToken = randomOrderToken()): string {
  return createEffectiveOrderAfter(undefined, nowMs, randomToken);
}

function parseEffectiveOrder(order?: string | null): { millis: number; counter: number } | null {
  if (!order) return null;
  const match = /^v1-([0-9a-z]{10})-([0-9a-z]{6})-/.exec(order);
  if (!match) return null;
  const millis = Number.parseInt(match[1], 36);
  const counter = Number.parseInt(match[2], 36);
  return Number.isSafeInteger(millis) && Number.isSafeInteger(counter) ? { millis, counter } : null;
}

/**
 * Creates a key strictly after an already persisted key, even when the process
 * restarted and its physical clock moved backwards.
 */
export function createEffectiveOrderAfter(
  persistedMaximum?: string | null,
  nowMs = Date.now(),
  randomToken = randomOrderToken(),
): string {
  const persisted = parseEffectiveOrder(persistedMaximum);
  const candidateMillis = Math.max(0, Math.floor(nowMs));
  const nextMillis = Math.max(candidateMillis, lastEffectiveMillis, persisted?.millis || 0);
  let nextCounter = nextMillis === lastEffectiveMillis ? effectiveCounter + 1 : 0;
  if (persisted && nextMillis === persisted.millis) {
    nextCounter = Math.max(nextCounter, persisted.counter + 1);
  }

  lastEffectiveMillis = nextMillis;
  effectiveCounter = nextCounter;

  const millisPart = lastEffectiveMillis.toString(36).padStart(10, '0');
  const counterPart = effectiveCounter.toString(36).padStart(6, '0');
  return `v1-${millisPart}-${counterPart}-${randomToken}`;
}

export function nextFinanceEffectiveOrder(
  state: LifeOSState,
  date: string,
  nowMs = Date.now(),
  randomToken = randomOrderToken(),
): string {
  const orders = [
    ...state.finance.transactions.filter((item) => item.date === date).map((item) => item.effectiveOrder),
    ...state.finance.transfers.filter((item) => item.date === date).map((item) => item.effectiveOrder),
    ...state.finance.reconciliations.filter((item) => item.date === date).map((item) => item.effectiveOrder),
  ].filter((order): order is string => Boolean(parseEffectiveOrder(order)));
  const persistedMaximum = orders.sort().at(-1);
  return createEffectiveOrderAfter(persistedMaximum, nowMs, randomToken);
}

/**
 * Canonical accounting order:
 * 1. civil accounting date;
 * 2. legacy block before ordered events;
 * 3. legacy transactions/transfers before legacy reconciliations;
 * 4. effectiveOrder for new events;
 * 5. kind and id as deterministic final tie-breaks.
 */
export function compareLedgerEvents(a: LedgerEventOrderable, b: LedgerEventOrderable): number {
  const dateComparison = a.date.localeCompare(b.date);
  if (dateComparison !== 0) return dateComparison;

  const aIsOrdered = Boolean(a.effectiveOrder);
  const bIsOrdered = Boolean(b.effectiveOrder);
  if (aIsOrdered !== bIsOrdered) return aIsOrdered ? 1 : -1;

  if (aIsOrdered && bIsOrdered) {
    const orderComparison = String(a.effectiveOrder).localeCompare(String(b.effectiveOrder));
    if (orderComparison !== 0) return orderComparison;
  }

  const kindComparison = LEGACY_KIND_RANK[a.kind] - LEGACY_KIND_RANK[b.kind];
  if (kindComparison !== 0) return kindComparison;
  return a.id.localeCompare(b.id);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function legacyReconciliationAmbiguities(
  accountId: string,
  reconciliations: AccountReconciliation[],
): LegacyReconciliationAmbiguity[] {
  const byDate = new Map<string, string[]>();
  for (const reconciliation of reconciliations) {
    if (reconciliation.accountId !== accountId || reconciliation.effectiveOrder) continue;
    const ids = byDate.get(reconciliation.date) || [];
    ids.push(reconciliation.id);
    byDate.set(reconciliation.date, ids);
  }

  return [...byDate.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, ids]) => ({
      type: 'multiple_legacy_reconciliations_same_date' as const,
      accountId,
      date,
      reconciliationIds: [...ids].sort(),
    }));
}

export function reconstructAccountBalance(
  account: Account,
  transactions: Transaction[] = [],
  transfers: FinanceTransfer[] = [],
  reconciliations: AccountReconciliation[] = [],
): AccountBalanceReconstruction {
  const linkedAdjustmentIds = new Set(
    reconciliations
      .map((reconciliation) => reconciliation.adjustmentTxId)
      .filter((id): id is string => Boolean(id)),
  );
  const excludedAdjustmentIds: string[] = [];
  const unlinkedAdjustmentIds: string[] = [];
  const events: LedgerEvent[] = [];

  for (const transaction of transactions) {
    if (transaction.accountId !== account.id) continue;
    if (linkedAdjustmentIds.has(transaction.id)) {
      excludedAdjustmentIds.push(transaction.id);
      continue;
    }
    if (transaction.origin === 'adjustment') unlinkedAdjustmentIds.push(transaction.id);
    events.push({
      kind: 'transaction', id: transaction.id, date: transaction.date,
      effectiveOrder: transaction.effectiveOrder, value: transaction,
    });
  }

  for (const transfer of transfers) {
    if (transfer.fromAccountId !== account.id && transfer.toAccountId !== account.id) continue;
    events.push({
      kind: 'transfer', id: transfer.id, date: transfer.date,
      effectiveOrder: transfer.effectiveOrder, value: transfer,
    });
  }

  const accountReconciliations = reconciliations.filter((item) => item.accountId === account.id);
  for (const reconciliation of accountReconciliations) {
    events.push({
      kind: 'reconciliation', id: reconciliation.id, date: reconciliation.date,
      effectiveOrder: reconciliation.effectiveOrder, value: reconciliation,
    });
  }

  events.sort(compareLedgerEvents);
  const missingInitialBalance = !Number.isFinite(account.initialBalance);
  if (missingInitialBalance) {
    return {
      balance: null,
      orderedEventIds: events.map((event) => event.id),
      excludedAdjustmentIds: excludedAdjustmentIds.sort(),
      unlinkedAdjustmentIds: unlinkedAdjustmentIds.sort(),
      ambiguities: legacyReconciliationAmbiguities(account.id, accountReconciliations),
      missingInitialBalance: true,
    };
  }
  let balance = Number(account.initialBalance);

  for (const event of events) {
    if (event.kind === 'transaction') {
      const amount = Number(event.value.amount || 0);
      balance += event.value.type === 'ingreso' ? amount : -amount;
    } else if (event.kind === 'transfer') {
      const amount = Number(event.value.amount || 0);
      if (event.value.fromAccountId === account.id) balance -= amount;
      if (event.value.toAccountId === account.id) balance += amount;
    } else {
      balance = Number(event.value.actualBalance || 0);
    }
  }

  return {
    balance: roundMoney(balance),
    orderedEventIds: events.map((event) => event.id),
    excludedAdjustmentIds: excludedAdjustmentIds.sort(),
    unlinkedAdjustmentIds: unlinkedAdjustmentIds.sort(),
    ambiguities: legacyReconciliationAmbiguities(account.id, accountReconciliations),
    missingInitialBalance: false,
  };
}

export function reconstructAccountBalanceBeforeEvent(
  account: Account,
  eventId: string,
  transactions: Transaction[] = [],
  transfers: FinanceTransfer[] = [],
  reconciliations: AccountReconciliation[] = [],
): number | null {
  const target = [
    ...transactions.map((value) => ({ kind: 'transaction' as const, id: value.id, date: value.date, effectiveOrder: value.effectiveOrder })),
    ...transfers.map((value) => ({ kind: 'transfer' as const, id: value.id, date: value.date, effectiveOrder: value.effectiveOrder })),
    ...reconciliations.map((value) => ({ kind: 'reconciliation' as const, id: value.id, date: value.date, effectiveOrder: value.effectiveOrder })),
  ].find((event) => event.id === eventId);
  if (!target) return null;
  const targetAdjustmentId = target.kind === 'reconciliation'
    ? reconciliations.find((item) => item.id === eventId)?.adjustmentTxId
    : null;

  const precedingTransactions = transactions.filter((value) => (
    value.id !== targetAdjustmentId
    && compareLedgerEvents(
      { kind: 'transaction', id: value.id, date: value.date, effectiveOrder: value.effectiveOrder }, target,
    ) < 0
  ));
  const precedingTransfers = transfers.filter((value) => compareLedgerEvents(
    { kind: 'transfer', id: value.id, date: value.date, effectiveOrder: value.effectiveOrder }, target,
  ) < 0);
  const precedingReconciliations = reconciliations.filter((value) => compareLedgerEvents(
    { kind: 'reconciliation', id: value.id, date: value.date, effectiveOrder: value.effectiveOrder }, target,
  ) < 0);
  return reconstructAccountBalance(account, precedingTransactions, precedingTransfers, precedingReconciliations).balance;
}

export function compareMaterializedBalanceShadow(
  account: Account,
  transactions: Transaction[] = [],
  transfers: FinanceTransfer[] = [],
  reconciliations: AccountReconciliation[] = [],
): MaterializedBalanceShadow {
  const reconstruction = reconstructAccountBalance(account, transactions, transfers, reconciliations);
  const materializedBalance = roundMoney(Number(account.balance || 0));
  const difference = reconstruction.balance === null
    ? null
    : roundMoney(reconstruction.balance - materializedBalance);
  return {
    ...reconstruction,
    accountId: account.id,
    materializedBalance,
    reconstructedBalance: reconstruction.balance,
    difference,
    matches: difference === 0 && reconstruction.balance !== null,
  };
}

export function compareFinanceBalancesShadow(state: LifeOSState): MaterializedBalanceShadow[] {
  return state.finance.accounts.map((account) => compareMaterializedBalanceShadow(
    account,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  ));
}
