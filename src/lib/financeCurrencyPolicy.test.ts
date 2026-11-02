import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState, parseBackupJSON } from './storage';
import { cashFlowProjection } from './calculations';
import { deriveCashflowProjection } from './financeCashflow';
import { confirmFinancialCommitment, confirmExpectedIncome, addTransaction, addFinancialCommitment, updateTransaction, linkTransactionToCommitment, linkTransactionToExpectedIncome } from './financeFlows';
import { findMatchCandidates } from './financeMatching';
import { confirmedFinancialCurrency } from './financeCurrencyPolicy';

function fixture(currency?: string) {
  const state = defaultState();
  state.finance.accounts = [{ id: 'uyu', name: 'Cuenta sintética', currency: 'UYU', initialBalance: 1000, balance: 1000 }];
  state.finance.transactions = [];
  state.finance.commitments = [{ id: 'ambiguous-payment', name: 'Pago histórico', amount: 777.77, currency, active: true, frequency: 'once', nextDueDate: '2026-11-05', accountId: 'uyu' },
    ...['UYU', 'USD'].map(currency => ({ id: `known-${currency}`, name: 'Pago conocido', amount: 23.45, currency, active: true, frequency: 'once' as const, nextDueDate: '2026-11-05' }))];
  state.finance.expectedIncomes = [{ id: 'ambiguous-income', name: 'Cobro histórico', amount: 888.88, currency, active: true, frequency: 'once', startDate: '2026-11-05', accountId: 'uyu' }];
  return state;
}

for (const currency of [undefined, '', 'usd', ' UYU ', 'EUR']) {
  test(`proyecciones parciales sin certificar ${JSON.stringify(currency)} como UYU/USD`, () => {
    const state = fixture(currency), before = JSON.stringify(state);
    for (const cur of ['UYU', 'USD']) {
      const p = cashFlowProjection(state, 30, '2026-11-01', cur);
      assert.equal(p.committed, 23.45); assert.equal(p.totalExpectedIncome, 0);
      assert.equal(p.unconfirmedCurrencyItems.length, 2);
      assert.ok(p.unconfirmedCurrencyItems.some(item => item.sourceId === 'ambiguous-payment' && item.amount === 777.77));
    }
    const grouped = deriveCashflowProjection(state, 'month', '2026-11-01');
    assert.equal(grouped.summariesByCurrency.UYU.committedExpenses, 23.45);
    assert.equal(grouped.summariesByCurrency.USD.committedExpenses, 23.45);
    assert.equal(grouped.unconfirmedCurrencyEvents.length, 2);
    assert.equal(JSON.stringify(state), before);
  });
  test(`pago, cobro y vinculación con ${JSON.stringify(currency)} fallan antes de mutar el libro`, () => {
    const state = fixture(currency);
    const expense = addTransaction(state, { id: 'expense', amount: 777.77, type: 'gasto', category: 'Comida', accountId: 'uyu', currency: 'UYU', date: '2026-11-05' });
    const income = addTransaction(state, { id: 'income', amount: 888.88, type: 'ingreso', category: 'Comida', accountId: 'uyu', currency: 'UYU', date: '2026-11-05' });
    const before = JSON.stringify(state);
    assert.equal(findMatchCandidates(expense, state).candidates.length, 0);
    assert.equal(findMatchCandidates(income, state).candidates.length, 0);
    for (const operation of [
      () => confirmFinancialCommitment(state, { commitmentId: 'ambiguous-payment', date: '2026-11-05' }),
      () => confirmExpectedIncome(state, { expectedIncomeId: 'ambiguous-income', date: '2026-11-05' }),
      () => linkTransactionToCommitment(state, expense.id, 'ambiguous-payment'),
      () => linkTransactionToExpectedIncome(state, income.id, 'ambiguous-income'),
    ]) { assert.throws(operation, /moneda.*no.*confirmada/i); assert.equal(JSON.stringify(state), before); }
  });
}

test('históricos ambiguos siguen recuperables sin materializar moneda al cargar/restaurar', () => {
  const state = fixture(), before = JSON.stringify(state);
  for (const loaded of [normalizeStoredState(state), parseBackupJSON(JSON.stringify(state))]) {
    assert.equal(loaded.finance.commitments![0].currency, undefined);
    assert.equal(loaded.finance.commitments![0].amount, 777.77);
    assert.equal(loaded.finance.expectedIncomes![0].currency, undefined);
    assert.equal(loaded.finance.expectedIncomes![0].amount, 888.88);
  }
  assert.equal(JSON.stringify(state), before);
});

test('una nota de movimiento vinculado sigue editable; cambiar sus hechos financieros necesita moneda confirmada', () => {
  const state = fixture();
  const tx = addTransaction(state, { id: 'linked-legacy', type: 'gasto', amount: 100, category: 'Comida', currency: 'UYU', accountId: 'uyu', date: '2026-11-05', commitmentId: 'ambiguous-payment', matchedCycle: 'once' });
  const target = JSON.stringify(state.finance.commitments);
  const input = { type: tx.type, amount: tx.amount, category: tx.category, accountId: tx.accountId, date: tx.date, currency: tx.currency, note: 'Nota corregida' };
  updateTransaction(state, tx.id, input);
  assert.equal(tx.note, 'Nota corregida'); assert.equal(JSON.stringify(state.finance.commitments), target);
  const before = JSON.stringify(state);
  assert.throws(() => confirmFinancialCommitment(state, { commitmentId: 'ambiguous-payment', targetCycle: 'once', date: tx.date }), /moneda.*no.*confirmada/i);
  assert.throws(() => updateTransaction(state, tx.id, { ...input, amount: 101 }), /moneda.*no.*confirmada/i);
  assert.equal(JSON.stringify(state), before);
});

test('creación conserva el default explícito del flujo UYU, pero no convierte códigos inválidos recibidos', () => {
  const state = fixture();
  assert.equal(addFinancialCommitment(state, { name: 'Creación UYU', amount: 1 }).currency, 'UYU');
  for (const currency of ['', 'usd', 'EUR']) {
    const before = JSON.stringify(state);
    assert.throws(() => addFinancialCommitment(state, { name: 'Código inválido', amount: 1, currency }), /moneda.*no.*confirmada/i);
    assert.equal(JSON.stringify(state), before);
  }
});

test('registros inactivos o fuera del horizonte no fabrican una advertencia de proyección parcial', () => {
  const state = fixture();
  state.finance.commitments![0].active = false;
  state.finance.expectedIncomes![0].startDate = '2027-01-01';
  assert.equal(cashFlowProjection(state, 30, '2026-11-01').unconfirmedCurrencyItems.length, 0);
  assert.equal(deriveCashflowProjection(state, 'month', '2026-11-01').unconfirmedCurrencyEvents.length, 0);
});

test('valores no string tampoco certifican moneda ni mutan datos durante una proyección', () => {
  for (const currency of [null, 42, {}, [], true]) {
    assert.equal(confirmedFinancialCurrency(currency), null);
    const state = fixture();
    Object.assign(state.finance.commitments![0], { currency });
    const before = JSON.stringify(state);
    const projection = cashFlowProjection(state, 30, '2026-11-01');
    assert.equal(projection.committed, 23.45);
    assert.equal(projection.unconfirmedCurrencyItems.length, 2);
    assert.equal(JSON.stringify(state), before);
  }
});
