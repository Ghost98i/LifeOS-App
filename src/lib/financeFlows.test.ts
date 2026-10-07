import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  addAccount,
  addTransaction,
  addTransfer,
  confirmExpectedIncome,
  confirmFinancialCommitment,
  deleteAccount,
  deleteReconciliation,
  deleteTransaction,
  deleteTransfer,
  reconcileAccount,
  updateReconciliation,
  updateTransaction,
} from './financeFlows';

test('una transacción normal aplica ingreso o gasto exactamente una vez', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;

  const expense = addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', fixed: 'variable', accountId: account.id });
  const income = addTransaction(state, { type: 'ingreso', amount: 300, category: 'Sueldo', fixed: 'variable', accountId: account.id });

  assert.equal(account.balance, 1100);
  assert.equal(state.finance.transactions.length, 2);
  assert.match(expense.effectiveOrder || '', /^v1-/);
  assert.ok((expense.effectiveOrder || '') < (income.effectiveOrder || ''));
});

test('confirmar un compromiso registra un gasto, afecta saldo y avanza la obligación una sola vez', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  state.finance.commitments = [{
    id: 'commitment-1', name: 'Cuota', amount: 200, category: 'Hogar',
    frequency: 'monthly', nextDueDate: '2026-10-20', active: true,
    accountId: account.id, remainingOccurrences: 2, dueDay: 20,
  }];

  const transaction = confirmFinancialCommitment(state, {
    commitmentId: 'commitment-1', date: '2026-10-20',
  });

  assert.equal(transaction.type, 'gasto');
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(account.balance, 800);
  assert.equal(state.finance.commitments[0].nextDueDate, '2026-11-20');
  assert.equal(state.finance.commitments[0].remainingOccurrences, 1);
});

test('confirmar un ingreso esperado registra un ingreso, afecta saldo y actualiza la expectativa una sola vez', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  state.finance.expectedIncomes = [{
    id: 'income-1', name: 'Cobro', amount: 400, startDate: '2026-10-25',
    frequency: 'once', active: true, category: 'Ingresos', accountId: account.id,
  }];

  const transaction = confirmExpectedIncome(state, {
    expectedIncomeId: 'income-1', date: '2026-10-25',
  });

  assert.equal(transaction.type, 'ingreso');
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(account.balance, 1400);
  assert.equal(state.finance.expectedIncomes[0].active, false);
});

test('confirmaciones compuestas preservan la no retroactividad de addTransaction', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  reconcileAccount(state, { accountId: account.id, actualBalance: 1000, date: '2026-10-10' });
  state.finance.commitments = [{
    id: 'commitment-old', name: 'Cuota anterior', amount: 100, category: 'Hogar',
    frequency: 'once', nextDueDate: '2026-10-09', active: true, accountId: account.id,
  }];

  confirmFinancialCommitment(state, { commitmentId: 'commitment-old', date: '2026-10-09' });

  assert.equal(account.balance, 1000);
  assert.equal(state.finance.transactions.filter((item) => item.origin !== 'adjustment').length, 1);
});

test('una confirmación inválida no deja estado parcialmente aplicado', () => {
  const state = defaultState();
  state.finance.commitments = [{
    id: 'commitment-invalid', name: 'Cuota', amount: 100, category: 'Hogar',
    frequency: 'monthly', nextDueDate: '2026-10-20', active: true,
    accountId: 'missing-account', remainingOccurrences: 2, dueDay: 20,
  }];
  state.finance.expectedIncomes = [{
    id: 'income-invalid', name: 'Cobro', amount: 300, startDate: '2026-10-20',
    frequency: 'once', active: true, accountId: 'missing-account',
  }];

  assert.throws(() => confirmFinancialCommitment(state, { commitmentId: 'commitment-invalid' }), /cuenta válida/);
  assert.throws(() => confirmExpectedIncome(state, { expectedIncomeId: 'income-invalid' }), /cuenta válida/);
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(state.finance.commitments[0].nextDueDate, '2026-10-20');
  assert.equal(state.finance.commitments[0].remainingOccurrences, 2);
  assert.equal(state.finance.expectedIncomes[0].active, true);
});

test('una transferencia mueve saldo sin crear ingreso ni gasto', () => {
  const state = defaultState();
  state.finance.accounts[0].balance = 1000;
  state.finance.accounts[0].initialBalance = 1000;
  const transfer = addTransfer(state, {
    fromAccountId: state.finance.accounts[0].id,
    toAccountId: state.finance.accounts[1].id,
    amount: 300,
  });
  assert.equal(state.finance.accounts[0].balance, 700);
  assert.equal(state.finance.accounts[1].balance, 300);
  assert.equal(state.finance.transactions.length, 0);
  assert.match(transfer.effectiveOrder || '', /^v1-/);
  deleteTransfer(state, transfer.id);
  assert.equal(state.finance.accounts[0].balance, 1000);
  assert.equal(state.finance.accounts[1].balance, 0);
});

test('conciliar registra la diferencia pero la marca como ajuste', () => {
  const state = defaultState();
  state.finance.accounts[0].balance = 1000;
  state.finance.accounts[0].initialBalance = 1000;
  const result = reconcileAccount(state, { accountId: state.finance.accounts[0].id, actualBalance: 940 });
  assert.equal(result.difference, -60);
  assert.equal(state.finance.accounts[0].balance, 940);
  assert.equal(state.finance.transactions[0].origin, 'adjustment');
  assert.match(result.effectiveOrder || '', /^v1-/);
  assert.match(state.finance.transactions[0].effectiveOrder || '', /^v1-/);
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
  account.initialBalance = 500;
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
  account.initialBalance = 100;
  const first = reconcileAccount(state, { accountId: account.id, actualBalance: 80, date: '2026-09-01', note: 'Control' });
  const second = reconcileAccount(state, { accountId: account.id, actualBalance: 80, date: '2026-09-01', note: 'Control' });
  assert.equal(second.id, first.id);
  assert.equal(state.finance.reconciliations.length, 1);
  assert.equal(state.finance.transactions.filter((item) => item.origin === 'adjustment').length, 1);
});

test('limpia una conciliación y reconstruye el saldo sin su ancla ni ajuste', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 100;
  account.initialBalance = 100;
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 75, date: '2026-09-01' });
  addTransaction(state, { type: 'gasto', amount: 5, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-02' });
  assert.equal(account.balance, 70);
  deleteReconciliation(state, reconciliation.id);
  assert.equal(account.balance, 95);
  assert.equal(state.finance.transactions.some((item) => item.id === reconciliation.adjustmentTxId), false);
});

test('editar la última conciliación corrige el saldo por la diferencia exacta', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 100;
  account.initialBalance = 100;
  const reconciliation = reconcileAccount(state, { accountId: account.id, actualBalance: 90, date: '2026-09-01' });
  addTransaction(state, { type: 'gasto', amount: 10, category: 'Comida', fixed: 'variable', accountId: account.id, date: '2026-09-02' });
  updateReconciliation(state, reconciliation.id, { accountId: account.id, actualBalance: 95, date: '2026-09-01' });
  assert.equal(account.balance, 85);
});

test('cargar o editar un movimiento anterior a la conciliación no reabre el saldo confirmado', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 200;
  account.initialBalance = 200;
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
  account.initialBalance = 200;
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
  from.initialBalance = 500;
  to.balance = 200;
  to.initialBalance = 200;
  reconcileAccount(state, { accountId: from.id, actualBalance: 500, date: '2026-09-02' });
  reconcileAccount(state, { accountId: to.id, actualBalance: 200, date: '2026-09-02' });
  addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: 100, date: '2026-09-01' });
  assert.equal(from.balance, 500);
  assert.equal(to.balance, 200);
});
