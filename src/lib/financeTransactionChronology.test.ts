import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '../types';
import { addTransaction, updateTransaction } from './financeFlows';
import { compareTransactionsChronologically, transactionTimeLabel } from './financeTransactionChronology';
import { recordResalePurchase } from './resaleFlows';
import { defaultState, normalizeStoredState } from './storage';
import { mergeFinanceModule } from './syncMerge';

const date = '2026-10-22';
const sortOldest = (items: Transaction[]) => [...items].sort(compareTransactionsChronologically);
const sortNewest = (items: Transaction[]) => [...items].sort((a, b) => compareTransactionsChronologically(b, a));

test('tres movimientos del mismo día conservan el orden de registro en ambos sentidos', () => {
  const state = defaultState();
  const accountId = state.finance.accounts[0].id;
  const items = ['prueba', 'pruebaa', 'prueba 5'].map((note) => addTransaction(state, {
    type: 'gasto', amount: 10, category: 'Otros', date, note, accountId,
  }));
  assert.deepEqual(sortNewest(items).map((item) => item.note), ['prueba 5', 'pruebaa', 'prueba']);
  assert.deepEqual(sortOldest(items).map((item) => item.note), ['prueba', 'pruebaa', 'prueba 5']);
  assert.ok(items.every((item) => Number.isFinite(Date.parse(item.createdAt || ''))));
});

test('fecha, hora de operación y registros históricos tienen un orden estable', () => {
  const base = { type: 'gasto', amount: 1, category: 'Otros', fixed: 'variable' } as const;
  const historyA: Transaction = { ...base, id: 'a', date };
  const historyB: Transaction = { ...base, id: 'b', date };
  const morning: Transaction = { ...base, id: 'morning', date, operationTime: '08:15' };
  const evening: Transaction = { ...base, id: 'evening', date, operationTime: '19:35' };
  const tomorrow: Transaction = { ...base, id: 'tomorrow', date: '2026-10-23' };
  const items = [tomorrow, evening, historyB, morning, historyA];
  assert.deepEqual(sortOldest(items).map((item) => item.id), ['a', 'b', 'morning', 'evening', 'tomorrow']);
  assert.deepEqual(sortNewest(items).map((item) => item.id), ['tomorrow', 'evening', 'morning', 'b', 'a']);
  assert.equal(transactionTimeLabel(historyA), null);
  assert.equal(transactionTimeLabel(evening), '19:35');
});

test('la hora de registro se distingue de la hora real y no se inventa para movimientos antiguos', () => {
  const registered = new Date(2026, 9, 22, 19, 35);
  const item: Transaction = {
    id: 'one', type: 'gasto', amount: 1, category: 'Otros', fixed: 'variable',
    date, createdAt: registered.toISOString(),
  };
  assert.equal(transactionTimeLabel(item), 'Registrado 19:35');
  assert.equal(transactionTimeLabel({ ...item, operationTime: '11:20' }), '11:20');
  assert.equal(transactionTimeLabel({ ...item, createdAt: undefined }), null);
});

test('editar descripción o categoría preserva registro, orden e importe y valida hora', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  const first = addTransaction(state, { type: 'gasto', amount: 30, category: 'Otros', date, note: 'primero', accountId: account.id });
  const second = addTransaction(state, { type: 'gasto', amount: 40, category: 'Otros', date, note: 'segundo', accountId: account.id });
  const beforeBalance = account.balance;
  const originalCreatedAt = first.createdAt;
  const originalOrder = first.effectiveOrder;
  updateTransaction(state, first.id, { type: 'gasto', amount: 30, category: 'Comida', date, note: 'editado', accountId: account.id, operationTime: '09:30' });
  assert.equal(first.createdAt, originalCreatedAt);
  assert.equal(first.effectiveOrder, originalOrder);
  assert.equal(first.operationTime, '09:30');
  assert.equal(account.balance, beforeBalance);
  assert.equal(state.finance.transactions.length, 2);
  assert.throws(() => updateTransaction(state, first.id, { type: 'gasto', amount: 30, category: 'Comida', date, accountId: account.id, operationTime: '25:99' }), /hora válida/);
  assert.equal(first.operationTime, '09:30');
  assert.equal(second.amount, 40);
});

test('restaurar y mezclar conservan metadatos temporales y movimientos de Reventa', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  const item = recordResalePurchase(state, { item: 'GPU', buyPrice: 8000, buyDate: date, accountId: account.id });
  const linked = state.finance.transactions.find((tx) => tx.id === item.purchaseTxId)!;
  const restored = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  const merged = mergeFinanceModule(state.finance, restored.finance);
  assert.equal(restored.finance.transactions[0].createdAt, linked.createdAt);
  assert.equal(restored.finance.transactions[0].effectiveOrder, linked.effectiveOrder);
  assert.equal(merged.transactions[0].createdAt, linked.createdAt);
  assert.equal(merged.transactions[0].amount, 8000);
  assert.equal(merged.transactions.length, 1);
  assert.equal(restored.finance.accounts[0].balance, account.balance);
});
