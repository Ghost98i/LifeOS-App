import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addQuickTransaction, suggestedQuickAccountId } from './quickCapture';

test('captura un ingreso y actualiza la cuenta elegida', () => {
  const state = defaultState();
  const account = state.finance.accounts[1];
  const transaction = addQuickTransaction(state, {
    type: 'ingreso',
    amount: 13728,
    accountId: account.id,
    category: 'Otros',
    note: 'Beca UTEC',
    date: '2026-08-10',
  });

  assert.equal(transaction.type, 'ingreso');
  assert.equal(transaction.note, 'Beca UTEC');
  assert.equal(account.balance, 13728);
});

test('rechaza montos vacíos o negativos', () => {
  const state = defaultState();
  assert.throws(() => addQuickTransaction(state, { type: 'gasto', amount: 0 }), /monto válido/);
  assert.throws(() => addQuickTransaction(state, { type: 'ingreso', amount: -100 }), /monto válido/);
});

test('sugiere el banco y luego recuerda la última cuenta usada para ese tipo', () => {
  const state = defaultState();
  const cash = state.finance.accounts[0];
  const bank = state.finance.accounts[1];
  assert.equal(suggestedQuickAccountId(state, 'ingreso'), bank.id);

  addQuickTransaction(state, { type: 'ingreso', amount: 500, accountId: cash.id });
  assert.equal(suggestedQuickAccountId(state, 'ingreso'), cash.id);
});
