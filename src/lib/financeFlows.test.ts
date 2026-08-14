import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addAccount, addTransaction, addTransfer, deleteAccount, deleteTransaction, deleteTransfer, reconcileAccount } from './financeFlows';

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

test('no borra movimientos conciliados ni cuentas con historial', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  const transaction = addTransaction(state, { type: 'gasto', amount: 50, category: 'Comida', fixed: 'variable', date: '2026-08-01', accountId: account.id });
  reconcileAccount(state, { accountId: account.id, actualBalance: account.balance, date: '2026-08-02' });
  assert.throws(() => deleteTransaction(state, transaction.id), /conciliada/);
  assert.throws(() => deleteAccount(state, account.id), /movimientos vinculados/);
  const empty = addAccount(state, 'Vacía', 0);
  deleteAccount(state, empty.id);
  assert.equal(state.finance.accounts.some((item) => item.id === empty.id), false);
});
