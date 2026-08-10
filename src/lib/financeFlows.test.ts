import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addTransfer, deleteTransfer, reconcileAccount } from './financeFlows';

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
