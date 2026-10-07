import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountReconciliation } from '../types';
import { defaultState } from './storage';
import {
  addTransaction,
  addTransfer,
  deleteReconciliation,
  deleteTransaction,
  deleteTransfer,
  reconcileAccount,
  updateReconciliation,
  updateTransaction,
} from './financeFlows';
import { compareMaterializedBalanceShadow } from './financeLedger';

function freshState() {
  const state = defaultState();
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.reconciliations = [];
  for (const account of state.finance.accounts) {
    account.balance = account.id === state.finance.accounts[0].id ? 1000 : 500;
    account.initialBalance = account.balance;
  }
  return state;
}

function assertMaterializedMatches(state: ReturnType<typeof freshState>, accountId: string) {
  const account = state.finance.accounts.find((item) => item.id === accountId)!;
  const shadow = compareMaterializedBalanceShadow(account, state.finance.transactions, state.finance.transfers, state.finance.reconciliations);
  assert.equal(shadow.matches, true, `materializado=${shadow.materializedBalance}, reconstruido=${shadow.reconstructedBalance}`);
}

test('gasto e ingreso posteriores a una conciliación del mismo día se materializan desde el ledger', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  reconcileAccount(state, { accountId: account.id, actualBalance: 1000, date: '2026-10-07' });
  const expense = addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-07' });
  assert.equal(account.balance, 800);
  assertMaterializedMatches(state, account.id);
  addTransaction(state, { type: 'ingreso', amount: 50, category: 'Ingreso', fixed: 'variable', accountId: account.id, date: '2026-10-07' });
  assert.equal(account.balance, 850);
  assertMaterializedMatches(state, account.id);
  deleteTransaction(state, expense.id);
  assert.equal(account.balance, 1050);
  assertMaterializedMatches(state, account.id);
});

test('evento anterior al ancla no reescribe el saldo conciliado', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-06' });
  reconcileAccount(state, { accountId: account.id, actualBalance: 750, date: '2026-10-07' });
  assert.equal(account.balance, 750);
  assertMaterializedMatches(state, account.id);
});

test('editar monto preserva orden y editar fecha asigna una posición nueva', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  const transaction = addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-06' });
  const originalOrder = transaction.effectiveOrder;
  reconcileAccount(state, { accountId: account.id, actualBalance: 1000, date: '2026-10-07' });

  updateTransaction(state, transaction.id, { type: 'gasto', amount: 300, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-06' });
  assert.equal(transaction.effectiveOrder, originalOrder);
  assert.equal(account.balance, 1000);
  assertMaterializedMatches(state, account.id);

  updateTransaction(state, transaction.id, { type: 'gasto', amount: 300, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-07' });
  assert.notEqual(transaction.effectiveOrder, originalOrder);
  assert.equal(account.balance, 700);
  assertMaterializedMatches(state, account.id);
});

test('transferencia posterior a conciliaciones reconstruye origen y destino', () => {
  const state = freshState();
  const [from, to] = state.finance.accounts;
  reconcileAccount(state, { accountId: from.id, actualBalance: 1000, date: '2026-10-07' });
  reconcileAccount(state, { accountId: to.id, actualBalance: 500, date: '2026-10-07' });
  const transfer = addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: 200, date: '2026-10-07' });
  assert.equal(from.balance, 800);
  assert.equal(to.balance, 700);
  assertMaterializedMatches(state, from.id);
  assertMaterializedMatches(state, to.id);
  deleteTransfer(state, transfer.id);
  assert.equal(from.balance, 1000);
  assert.equal(to.balance, 500);
  assertMaterializedMatches(state, from.id);
  assertMaterializedMatches(state, to.id);
});

test('crear y editar conciliación reconstruye sin deltas incrementales', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  addTransaction(state, { type: 'gasto', amount: 100, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-07' });
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 850, date: '2026-10-07', note: 'Conteo' });
  assert.equal(account.balance, 850);
  assertMaterializedMatches(state, account.id);
  const originalOrder = reconciliation.effectiveOrder;

  updateReconciliation(state, reconciliation.id, { accountId: account.id, actualBalance: 825, date: '2026-10-07', note: 'Corregido' });
  assert.equal(reconciliation.effectiveOrder, originalOrder);
  assert.equal(account.balance, 825);
  assertMaterializedMatches(state, account.id);
});

test('mover conciliación antes y después de otra le asigna nuevo orden y reconstruye', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  const first = reconcileAccount(state, { accountId: account.id, actualBalance: 900, date: '2026-10-07', note: 'Primera' });
  const second = reconcileAccount(state, { accountId: account.id, actualBalance: 850, date: '2026-10-08', note: 'Segunda' });
  const originalOrder = second.effectiveOrder;

  updateReconciliation(state, second.id, { accountId: account.id, actualBalance: 850, date: '2026-10-06', note: 'Segunda' });
  assert.notEqual(second.effectiveOrder, originalOrder);
  assert.equal(account.balance, 900);
  assertMaterializedMatches(state, account.id);

  updateReconciliation(state, second.id, { accountId: account.id, actualBalance: 850, date: '2026-10-09', note: 'Segunda' });
  assert.equal(account.balance, 850);
  assertMaterializedMatches(state, account.id);
  assert.equal(account.lastReconciledAt, '2026-10-09');
  assert.ok(first.effectiveOrder);
});

test('eliminar conciliación reconstruye desde saldo inicial y eventos restantes', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-10-06' });
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 750, date: '2026-10-07' });
  addTransaction(state, { type: 'ingreso', amount: 100, category: 'Ingreso', fixed: 'variable', accountId: account.id, date: '2026-10-08' });
  assert.equal(account.balance, 850);
  deleteReconciliation(state, reconciliation.id);
  assert.equal(account.balance, 900);
  assert.equal(account.lastReconciledAt, null);
  assertMaterializedMatches(state, account.id);
});

test('dos conciliaciones nuevas del mismo día respetan effectiveOrder', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  const first = reconcileAccount(state, { accountId: account.id, actualBalance: 900, date: '2026-10-07', note: 'Primera' });
  const second = reconcileAccount(state, { accountId: account.id, actualBalance: 850, date: '2026-10-07', note: 'Segunda' });
  assert.ok((first.effectiveOrder || '') < (second.effectiveOrder || ''));
  assert.equal(account.balance, 850);
  assertMaterializedMatches(state, account.id);
});

test('mezcla legacy y nueva continúa si el saldo ambiguo coincide, pero bloquea reparación silenciosa', () => {
  const safeState = freshState();
  const safeAccount = safeState.finance.accounts[0];
  safeState.finance.reconciliations.push(
    { id: 'legacy-a', accountId: safeAccount.id, actualBalance: 900, systemBalance: 1000, difference: -100, date: '2026-10-07' },
    { id: 'legacy-b', accountId: safeAccount.id, actualBalance: 850, systemBalance: 900, difference: -50, date: '2026-10-07' },
  );
  safeAccount.balance = 850;
  addTransaction(safeState, { type: 'gasto', amount: 50, category: 'Comida', fixed: 'variable', accountId: safeAccount.id, date: '2026-10-07' });
  assert.equal(safeAccount.balance, 800);
  assertMaterializedMatches(safeState, safeAccount.id);

  const blockedState = freshState();
  const blockedAccount = blockedState.finance.accounts[0];
  const legacy: AccountReconciliation[] = [
    { id: 'legacy-a', accountId: blockedAccount.id, actualBalance: 900, systemBalance: 1000, difference: -100, date: '2026-10-07' },
    { id: 'legacy-b', accountId: blockedAccount.id, actualBalance: 850, systemBalance: 900, difference: -50, date: '2026-10-07' },
  ];
  blockedState.finance.reconciliations.push(...legacy);
  blockedAccount.balance = 900;
  assert.throws(
    () => addTransaction(blockedState, { type: 'gasto', amount: 50, category: 'Comida', fixed: 'variable', accountId: blockedAccount.id, date: '2026-10-07' }),
    /conciliaciones legacy ambiguas/,
  );
  assert.equal(blockedState.finance.transactions.length, 0);
  assert.equal(blockedAccount.balance, 900);
});

test('adjustment vinculado no se cuenta dos veces después de materializar', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  reconcileAccount(state, { accountId: account.id, actualBalance: 800, date: '2026-10-07' });
  assert.equal(account.balance, 800);
  assert.equal(state.finance.transactions.filter((item) => item.origin === 'adjustment').length, 1);
  assertMaterializedMatches(state, account.id);
});

test('initialBalance desconocido bloquea materialización en lugar de asumir cero', () => {
  const state = freshState();
  const account = state.finance.accounts[0];
  delete account.initialBalance;
  assert.throws(
    () => addTransaction(state, { type: 'gasto', amount: 50, category: 'Comida', fixed: 'variable', accountId: account.id }),
    /saldo inicial conocido/,
  );
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(account.balance, 1000);
});
