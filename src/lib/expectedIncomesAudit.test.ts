import test from 'node:test';
import assert from 'node:assert/strict';
import { LifeOSState } from '../types';
import { getExpectedIncomeOccurrences, cashFlowProjection } from './calculations';
import { confirmExpectedIncome } from './financeFlows';
import { defaultState } from './storage';

function createMockState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }];
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.categories = [{ id: 'cat-sueldo', name: 'Sueldo', active: true }];
  state.finance.budgets = {};
  state.finance.subscriptions = [];
  state.finance.debts = [];
  state.finance.investments = [];
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: '2026-11-03',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    },
    {
      id: 'inc-changa',
      name: 'Changuita Extra',
      amount: 3000,
      currency: 'UYU',
      startDate: '2026-10-22',
      frequency: 'once',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: false, // Pausado
    },
  ];
  state.finance.commitments = [];
  state.finance.agreements = [];
  state.finance.reconciliations = [];
  state.finance.minCushion = 5000;
  state.finance.cushionEnabled = true;
  return state;
}

test('1. Paused expected income is 100% excluded from projection', () => {
  const state = createMockState();
  const changa = state.finance.expectedIncomes.find((i) => i.id === 'inc-changa')!;
  assert.equal(changa.active, false);

  const occurrences = getExpectedIncomeOccurrences(changa, '2026-10-21', '2026-11-20');
  assert.equal(occurrences.length, 0, 'No occurrences must be generated for paused income');

  const proj = cashFlowProjection(state, 30, '2026-10-21', 'UYU');
  const changaInProj = proj.forecastItems.filter((f) => f.label === 'Changuita Extra');
  assert.equal(changaInProj.length, 0, 'Paused income must not appear in forecastItems');
});

test('2. Resuming expected income reactivates its projection', () => {
  const state = createMockState();
  const changa = state.finance.expectedIncomes.find((i) => i.id === 'inc-changa')!;
  changa.active = true;

  const occurrences = getExpectedIncomeOccurrences(changa, '2026-10-21', '2026-11-20');
  assert.equal(occurrences.length, 1, 'Active once income within horizon must generate 1 occurrence');
  assert.equal(occurrences[0].date, '2026-10-22');
  assert.equal(occurrences[0].amount, 3000);
});

test('3. Confirming recurring expected income advances date and updates real balance without double-counting', () => {
  const state = createMockState();
  const sueldo = state.finance.expectedIncomes.find((i) => i.id === 'inc-sueldo')!;

  // Initial balance is 10000
  assert.equal(state.finance.accounts[0].balance, 10000);

  // Before confirmation: projection on 2026-11-03 expects 15000
  const projBefore = cashFlowProjection(state, 30, '2026-10-21', 'UYU');
  const nov3PtBefore = projBefore.dailyTrajectory.find((pt) => pt.date === '2026-11-03')!;
  assert.equal(nov3PtBefore.expectedIncome, 15000);
  assert.equal(nov3PtBefore.endingBalance, 25000); // 10000 initial + 15000 expected

  // Now confirm payment of Sueldo
  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: '2026-11-03',
  });

  // 1. Transaction was added to ledger
  assert.equal(tx.amount, 15000);
  assert.equal(tx.type, 'ingreso');
  assert.equal(state.finance.transactions.length, 1);

  // 2. Real account balance immediately reflects the confirmed income
  assert.equal(state.finance.accounts[0].balance, 25000);

  // 3. ExpectedIncome startDate advanced to next month (2026-12-03)
  assert.equal(sueldo.startDate, '2026-12-03');
  assert.equal(sueldo.active, true);

  // 4. In a new 30-day projection starting from 2026-11-03:
  // Initial balance is now 25000. Nov 3 does NOT add another 15000!
  const projAfter = cashFlowProjection(state, 30, '2026-11-03', 'UYU');
  const day0Pt = projAfter.dailyTrajectory[0];
  assert.equal(day0Pt.endingBalance, 25000, 'Starting balance reflects the real money');
  assert.equal(day0Pt.expectedIncome, 0, 'No duplicate synthetic inflow on the confirmed date');
});

test('4. Confirming a once-off income deactivates it completely', () => {
  const state = createMockState();
  const changa = state.finance.expectedIncomes.find((i) => i.id === 'inc-changa')!;
  changa.active = true;

  confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-changa',
    accountId: 'acc-1',
    date: '2026-10-22',
  });

  assert.equal(changa.active, false, 'Once-off income must deactivate after confirmation');
  assert.equal(state.finance.accounts[0].balance, 13000); // 10000 + 3000
});

test('5. Deleting expected income removes future forecast while keeping historical transactions intact', () => {
  const state = createMockState();
  confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: '2026-11-03',
  });

  // Delete from expectedIncomes
  state.finance.expectedIncomes = state.finance.expectedIncomes.filter((i) => i.id !== 'inc-sueldo');

  // Ledger transaction remains
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000);

  // Future projection has 0 expected income
  const proj = cashFlowProjection(state, 60, '2026-11-03', 'UYU');
  assert.equal(proj.forecastItems.length, 0);
});
