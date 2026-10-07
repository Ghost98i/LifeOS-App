import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountReconciliation, Finance, FinanceTransfer, Transaction } from '../types';
import { addTransaction, addTransfer, reconcileAccount, updateReconciliation, updateTransaction } from './financeFlows';
import {
  createFinanceRevisionOrder,
  createFinanceRevisionOrderAfter,
  nextFinanceDeletionTimestamp,
} from './financeRevision';
import { defaultState } from './storage';
import { mergeFinanceModule } from './syncMerge';

const effective = (n: number) => `v1-0000000001-${String(n).padStart(6, '0')}-event-${n}`;
const revision = (millis: number, token: string, counter = 0) => (
  `r1-${millis.toString(36).padStart(10, '0')}-${counter.toString(36).padStart(6, '0')}-${token}`
);

function emptyFinance(): Finance {
  const finance = structuredClone(defaultState().finance);
  finance.accounts = [{ id: 'account-1', name: 'Cuenta', balance: 1000, initialBalance: 1000, lastReconciledAt: null }];
  finance.transactions = [];
  finance.transfers = [];
  finance.reconciliations = [];
  finance.categories = [...finance.categories].sort((a, b) => a.id.localeCompare(b.id));
  finance.debts = [];
  finance.investments = [];
  finance.subscriptions = [];
  finance.expectedIncomes = [];
  finance.commitments = [];
  return finance;
}

function transaction(id: string, amount: number, revisionOrder?: string, order = effective(1)): Transaction {
  return {
    id,
    effectiveOrder: order,
    revisionOrder,
    type: 'gasto',
    amount,
    category: 'Otros',
    fixed: 'variable',
    date: '2026-10-07',
    accountId: 'account-1',
    origin: 'manual',
  };
}

function reconciliation(id: string, actualBalance: number, revisionOrder?: string, date = '2026-10-07', order = effective(1)): AccountReconciliation {
  return {
    id,
    effectiveOrder: order,
    revisionOrder,
    accountId: 'account-1',
    actualBalance,
    systemBalance: 1000,
    difference: actualBalance - 1000,
    date,
  };
}

function transfer(id: string, amount: number, revisionOrder?: string, order = effective(1)): FinanceTransfer {
  return {
    id,
    effectiveOrder: order,
    revisionOrder,
    fromAccountId: 'account-1',
    toAccountId: 'account-2',
    amount,
    date: '2026-10-07',
  };
}

test('ediciones concurrentes de la misma conciliación y transacción ganan por revisionOrder', () => {
  const base = emptyFinance();
  base.transactions = [transaction('tx', 100, revision(100, 'base'))];
  base.transfers = [transfer('transfer', 10, revision(100, 'base'))];
  base.reconciliations = [reconciliation('rec', 900, revision(100, 'base'), '2026-10-06')];
  const a = structuredClone(base);
  const b = structuredClone(base);
  a.transactions[0] = transaction('tx', 120, revision(200, 'a'));
  b.transactions[0] = transaction('tx', 140, revision(200, 'b'));
  a.transfers[0] = transfer('transfer', 20, revision(200, 'a'));
  b.transfers[0] = transfer('transfer', 30, revision(200, 'b'));
  a.reconciliations[0] = reconciliation('rec', 850, revision(200, 'a'), '2026-10-06');
  b.reconciliations[0] = reconciliation('rec', 800, revision(200, 'b'), '2026-10-06');

  const ab = mergeFinanceModule(a, b, base);
  const ba = mergeFinanceModule(b, a, base);
  assert.deepEqual(ab, ba);
  assert.equal(ab.transactions[0].amount, 140);
  assert.equal(ab.transfers[0].amount, 30);
  assert.equal(ab.reconciliations[0].actualBalance, 800);
});

test('edit vs delete compara tombstone con la revisión y no depende del lado', () => {
  const base = emptyFinance();
  base.transactions = [transaction('tx', 100, revision(100, 'base'))];
  const editedBeforeDelete = structuredClone(base);
  editedBeforeDelete.transactions[0] = transaction('tx', 125, revision(200, 'edit'));
  const deleted = structuredClone(base);
  deleted.transactions = [];
  const deletionTime = 300;

  assert.equal(mergeFinanceModule(editedBeforeDelete, deleted, base, { tx: deletionTime }).transactions.length, 0);
  assert.equal(mergeFinanceModule(deleted, editedBeforeDelete, base, { tx: deletionTime }).transactions.length, 0);
  assert.equal(mergeFinanceModule(editedBeforeDelete, deleted, base, { tx: 200 }).transactions.length, 0);

  const editedAfterDelete = structuredClone(base);
  editedAfterDelete.transactions[0] = transaction('tx', 150, revision(400, 'edit'));
  assert.equal(mergeFinanceModule(editedAfterDelete, deleted, base, { tx: deletionTime }).transactions[0].amount, 150);
  assert.equal(mergeFinanceModule(deleted, editedAfterDelete, base, { tx: deletionTime }).transactions[0].amount, 150);
});

test('eventos y conciliaciones distintas concurrentes sobreviven y se ordenan por el ledger', () => {
  const base = emptyFinance();
  const a = structuredClone(base);
  const b = structuredClone(base);
  a.transactions = [transaction('tx-a', 100, revision(200, 'a'), effective(2))];
  b.transactions = [transaction('tx-b', 50, revision(200, 'b'), effective(4))];
  a.reconciliations = [reconciliation('rec-a', 900, revision(200, 'a'), '2026-10-07', effective(1))];
  b.reconciliations = [reconciliation('rec-b', 700, revision(200, 'b'), '2026-10-07', effective(3))];

  const merged = mergeFinanceModule(a, b, base);
  assert.deepEqual(merged.transactions.map((item) => item.id), ['tx-a', 'tx-b']);
  assert.deepEqual(merged.reconciliations.map((item) => item.id), ['rec-a', 'rec-b']);
  assert.equal(merged.accounts[0].balance, 650);
});

test('merge financiero es conmutativo, asociativo e idempotente', () => {
  const base = emptyFinance();
  base.transactions = [transaction('tx', 100, revision(100, 'base'))];
  const a = structuredClone(base);
  const b = structuredClone(base);
  const c = structuredClone(base);
  a.transactions[0] = transaction('tx', 110, revision(200, 'a'));
  b.transactions[0] = transaction('tx', 120, revision(200, 'b'));
  c.transactions[0] = transaction('tx', 130, revision(200, 'c'));
  a.accounts[0].balance = 890;
  b.accounts[0].balance = 880;
  c.accounts[0].balance = 870;

  assert.deepEqual(mergeFinanceModule(a, b, base), mergeFinanceModule(b, a, base));
  const abThenC = mergeFinanceModule(mergeFinanceModule(a, b, base), c, base);
  const aThenBc = mergeFinanceModule(a, mergeFinanceModule(b, c, base), base);
  assert.deepEqual(abThenC, aThenBc);
  assert.deepEqual(mergeFinanceModule(a, a, base), a);
});

test('permutar arrays no cambia el merge', () => {
  const base = emptyFinance();
  const a = structuredClone(base);
  const b = structuredClone(base);
  a.transactions = [transaction('a', 10, revision(200, 'a'), effective(1)), transaction('b', 20, revision(200, 'b'), effective(2))];
  b.transactions = [transaction('c', 30, revision(200, 'c'), effective(3))];
  a.transfers = [transfer('tr-a', 5, revision(200, 'a'), effective(4))];
  b.transfers = [transfer('tr-b', 7, revision(200, 'b'), effective(5))];

  const normal = mergeFinanceModule(a, b, base);
  const permutedA = { ...a, transactions: [...a.transactions].reverse(), transfers: [...a.transfers].reverse() };
  const permutedB = { ...b, transactions: [...b.transactions].reverse(), transfers: [...b.transfers].reverse() };
  assert.deepEqual(mergeFinanceModule(permutedA, permutedB, base), normal);
});

test('dos dispositivos en el mismo milisegundo generan revisiones únicas con desempate estable', () => {
  const a = createFinanceRevisionOrder(1_800_000_000_000, 'device-a');
  const b = createFinanceRevisionOrder(1_800_000_000_000, 'device-b');
  assert.notEqual(a, b);
  assert.deepEqual([a, b].sort(), [a, b]);
  const afterRestartWithRollback = createFinanceRevisionOrderAfter(b, 1, 'after-restart');
  assert.ok(afterRestartWithRollback > b);

  const state = defaultState();
  state.finance.transactions = [transaction('future-tx', 10, revision(2_000, 'future'))];
  assert.equal(nextFinanceDeletionTimestamp(state, 'future-tx', 1), 2_001);
});

test('saldo y lastReconciledAt se derivan del ledger fusionado', () => {
  const base = emptyFinance();
  const a = structuredClone(base);
  const b = structuredClone(base);
  a.accounts[0].balance = 99999;
  a.accounts[0].lastReconciledAt = '1900-01-01';
  b.accounts[0].balance = -99999;
  b.accounts[0].lastReconciledAt = '2100-01-01';
  a.reconciliations = [reconciliation('rec', 800, revision(200, 'rec'), '2026-10-07', effective(1))];
  b.transactions = [transaction('income', 50, revision(200, 'income'), effective(2))];
  b.transactions[0].type = 'ingreso';

  const merged = mergeFinanceModule(a, b, base);
  assert.equal(merged.accounts[0].balance, 850);
  assert.equal(merged.accounts[0].lastReconciledAt, '2026-10-07');
});

test('legacy usa fallback determinista y una versión moderna gana sin migración masiva', () => {
  const base = emptyFinance();
  base.transactions = [transaction('tx', 100)];
  const legacy = structuredClone(base);
  legacy.transactions[0] = transaction('tx', 125);
  const modern = structuredClone(base);
  modern.transactions[0] = transaction('tx', 150, revision(200, 'modern'));

  assert.deepEqual(mergeFinanceModule(legacy, modern, base), mergeFinanceModule(modern, legacy, base));
  assert.equal(mergeFinanceModule(legacy, modern, base).transactions[0].amount, 150);

  const deleted = structuredClone(base);
  deleted.transactions = [];
  assert.equal(mergeFinanceModule(legacy, deleted, base, { tx: 300 }).transactions.length, 0);
  modern.transactions[0].revisionOrder = revision(400, 'modern');
  assert.equal(mergeFinanceModule(modern, deleted, base, { tx: 300 }).transactions.length, 1);
});

test('operaciones locales crean y avanzan revisionOrder sin alterar effectiveOrder por una edición ordinaria', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  const tx = addTransaction(state, { type: 'gasto', amount: 100, category: 'Varios', fixed: 'variable', accountId: account.id });
  const txEffective = tx.effectiveOrder;
  const txRevision = tx.revisionOrder;
  updateTransaction(state, tx.id, { type: 'gasto', amount: 120, category: 'Varios', fixed: 'variable', accountId: account.id, date: tx.date });
  assert.equal(tx.effectiveOrder, txEffective);
  assert.ok((tx.revisionOrder || '') > (txRevision || ''));

  const tr = addTransfer(state, { fromAccountId: state.finance.accounts[0].id, toAccountId: state.finance.accounts[1].id, amount: 10 });
  assert.match(tr.revisionOrder || '', /^r1-/);
  const rec = reconcileAccount(state, { accountId: account.id, actualBalance: account.balance });
  const recEffective = rec.effectiveOrder;
  const recRevision = rec.revisionOrder;
  updateReconciliation(state, rec.id, { accountId: account.id, actualBalance: account.balance - 5, date: rec.date });
  assert.equal(rec.effectiveOrder, recEffective);
  assert.ok((rec.revisionOrder || '') > (recRevision || ''));
  const adjustment = state.finance.transactions.find((item) => item.id === rec.adjustmentTxId);
  assert.equal(adjustment?.revisionOrder, rec.revisionOrder);
});
