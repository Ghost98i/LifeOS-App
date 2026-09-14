import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addAccount, addTransaction, addTransfer, deleteAccount, deleteReconciliation, deleteTransaction, deleteTransfer, reconcileAccount, updateReconciliation, updateTransaction } from './financeFlows';

test('una transferencia mueve saldo sin crear ingreso ni gasto', () => {
  const state = defaultState();
  state.finance.accounts[0].balance = 1000;
  const transfer = addTransfer(state, {
    fromAccountId: state.finance.accounts[0].id,
    toAccountId: state.finance.accounts[1].id,
    amount: 300,
  });
  assert.equal(state.finance.accounts[0].balance, 700);
  assert.equal(state.finance.accounts[1].balance, 300);
  assert.equal(state.finance.transactions.length, 0);
  deleteTransfer(state, transfer.id);
  assert.equal(state.finance.accounts[0].balance, 1000);
  assert.equal(state.finance.accounts[1].balance, 0);
});

test('conciliar registra la diferencia pero la marca como ajuste', () => {
  const state = defaultState();
  state.finance.accounts[0].balance = 1000;
  const result = reconcileAccount(state, { accountId: state.finance.accounts[0].id, actualBalance: 940 });
  assert.equal(result.difference, -60);
  assert.equal(state.finance.accounts[0].balance, 940);
  assert.equal(state.finance.transactions[0].origin, 'adjustment');
});

test('un movimiento exige monto positivo y una cuenta existente', () => {
  const state = defaultState();
  assert.throws(() => addTransaction(state, { type: 'gasto', amount: -5, category: 'Comida', fixed: 'variable', accountId: state.finance.accounts[0].id }));
  assert.throws(() => addTransaction(state, { type: 'gasto', amount: 5, category: 'Comida', fixed: 'variable', accountId: 'inexistente' }));
});

test('borra movimientos anteriores sin alterar un saldo ya conciliado', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 500;
  const transaction = addTransaction(state, { type: 'gasto', amount: 50, category: 'Comida', fixed: 'variable', date: '2026-08-01', accountId: account.id });
  reconcileAccount(state, { accountId: account.id, actualBalance: account.balance, date: '2026-08-02' });
  const reconciledBalance = account.balance;
  deleteTransaction(state, transaction.id);
  assert.equal(state.finance.transactions.some((item) => item.id === transaction.id), false);
  assert.equal(account.balance, reconciledBalance);
  assert.throws(() => deleteAccount(state, account.id), /movimientos vinculados/);
  const empty = addAccount(state, 'Vacía', 0);
  deleteAccount(state, empty.id);
  assert.equal(state.finance.accounts.some((item) => item.id === empty.id), false);
});

test('no duplica una conciliación idéntica', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 100;
  const first = reconcileAccount(state, { accountId: account.id, actualBalance: 80, date: '2026-09-01', note: 'Control' });
  const second = reconcileAccount(state, { accountId: account.id, actualBalance: 80, date: '2026-09-01', note: 'Control' });
  assert.equal(second.id, first.id);
  assert.equal(state.finance.reconciliations.length, 1);
  assert.equal(state.finance.transactions.filter((item) => item.origin === 'adjustment').length, 1);
});

test('limpia una conciliación y su ajuste sin cambiar el saldo actual', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 100;
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 75, date: '2026-09-01' });
  addTransaction(state, { type: 'gasto', amount: 5, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-02' });
  assert.equal(account.balance, 70);
  deleteReconciliation(state, reconciliation.id);
  assert.equal(account.balance, 70);
  assert.equal(state.finance.transactions.some((item) => item.id === reconciliation.adjustmentTxId), false);
});

test('editar la última conciliación corrige el saldo por la diferencia exacta', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 100;
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 90, date: '2026-09-01' });
  addTransaction(state, { type: 'gasto', amount: 10, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-02' });
  updateReconciliation(state, reconciliation.id, { accountId: account.id, actualBalance: 95, date: '2026-09-01' });
  assert.equal(account.balance, 85);
});

test('cargar o editar un movimiento anterior a la conciliación no reabre el saldo confirmado', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 200;
  reconcileAccount(state, { accountId: account.id, actualBalance: 200, date: '2026-09-02' });
  const transaction = addTransaction(state, { type: 'gasto', amount: 30, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-01' });
  assert.equal(account.balance, 200);
  updateTransaction(state, transaction.id, { type: 'gasto', amount: 50, category: 'Transporte', fixed: 'variable', accountId: account.id, date: '2026-09-01' });
  assert.equal(account.balance, 200);
});

test('editar un movimiento posterior actualiza el saldo sin recrearlo', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 200;
  const transaction = addTransaction(state, { type: 'gasto', amount: 30, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-01' });
  updateTransaction(state, transaction.id, { type: 'gasto', amount: 50, category: 'Transporte', fixed: 'fijo', accountId: account.id, date: '2026-09-01' });
  assert.equal(account.balance, 150);
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(transaction.category, 'Transporte');
});

test('una transferencia histórica respeta saldos ya conciliados', () => {
  const state = defaultState();
  const [from, to] = state.finance.accounts;
  from.balance = 500;
  to.balance = 200;
  reconcileAccount(state, { accountId: from.id, actualBalance: 500, date: '2026-09-02' });
  reconcileAccount(state, { accountId: to.id, actualBalance: 200, date: '2026-09-02' });
  addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: 100, date: '2026-09-01' });
  assert.equal(from.balance, 500);
  assert.equal(to.balance, 200);
});
