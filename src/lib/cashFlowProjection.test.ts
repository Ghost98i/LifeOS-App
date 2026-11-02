import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import { cashFlowProjection, resolveFinancialCommitment } from './calculations';

test('cashFlowProjection projects across 30, 60, and 90 days combining income, subscriptions, and debts', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc1', name: 'Banco', balance: 50000 }];

  // Expected income: 40.000 monthly on day 5
  state.finance.expectedIncomes = [
    {
      id: 'inc-1',
      currency: 'UYU', // This scenario explicitly models UYU, not an ambiguous historical record.
      name: 'Salario',
      amount: 40000,
      startDate: '2026-09-05',
      frequency: 'monthly',
      active: true,
    },
  ];

  // Subscription: 5.000 on day 10
  state.finance.subscriptions = [
    {
      id: 'sub-1',
      name: 'Servicios',
      amount: 5000,
      dueDay: 10,
    },
  ];

  // Debt: 10.000 monthly on day 20
  state.finance.debts = [
    {
      id: 'debt-1',
      name: 'Préstamo auto',
      amount: 100000,
      monthlyPayment: 10000,
      dueDate: '2026-09-20',
    },
  ];

  // 30 days projection from 2026-09-01
  const proj30 = cashFlowProjection(state, 30, '2026-09-01');
  assert.equal(proj30.currentBalance, 50000);
  assert.equal(proj30.totalExpectedIncome, 40000);
  assert.equal(proj30.committed, 15000); // 5000 sub + 10000 debt
  assert.equal(proj30.netCashFlow, 25000);
  assert.equal(proj30.projectedBalance, 75000);
  assert.equal(proj30.horizonDays, 30);
  assert.equal(proj30.isDeficit, false);
  assert.equal(proj30.thresholdWarning, false);

  // 60 days projection from 2026-09-01
  const proj60 = cashFlowProjection(state, 60, '2026-09-01');
  assert.equal(proj60.currentBalance, 50000);
  assert.equal(proj60.totalExpectedIncome, 80000); // 2 months
  assert.equal(proj60.committed, 30000); // 2 months
  assert.equal(proj60.projectedBalance, 100000);
  assert.equal(proj60.horizonDays, 60);

  // 90 days projection from 2026-09-01
  const proj90 = cashFlowProjection(state, 90, '2026-09-01');
  assert.equal(proj90.currentBalance, 50000);
  assert.equal(proj90.totalExpectedIncome, 120000); // 3 months
  assert.equal(proj90.committed, 45000); // 3 months
  assert.equal(proj90.projectedBalance, 125000);
  assert.equal(proj90.horizonDays, 90);
});

test('cashFlowProjection preserves source identity and only resolves persisted financial commitments', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc1', name: 'Banco', balance: 50000 }];
  state.finance.subscriptions = [{ id: 'sub-1', name: 'Streaming', amount: 500, dueDay: 10 }];
  state.finance.debts = [{ id: 'debt-1', name: 'Préstamo', amount: 10000, monthlyPayment: 1000, dueDate: '2026-10-12' }];
  state.finance.commitments = [{
    id: 'commitment-1',
    currency: 'UYU',
    name: 'Alquiler',
    amount: 15000,
    category: 'Admin/Hogar',
    frequency: 'monthly',
    nextDueDate: '2026-10-15',
    active: true,
    accountId: 'acc1',
    dueDay: 15,
  }];

  const projection = cashFlowProjection(state, 30, '2026-10-01');
  const subscription = projection.commitments.find((item) => item.kind === 'subscription');
  const debt = projection.commitments.find((item) => item.kind === 'debt');
  const commitment = projection.commitments.find((item) => item.kind === 'commitment');

  assert.equal(subscription?.sourceId, 'sub-1');
  assert.equal(debt?.sourceId, 'debt-1');
  assert.equal(commitment?.sourceId, 'commitment-1');
  assert.equal(resolveFinancialCommitment(state, subscription!), null);
  assert.equal(resolveFinancialCommitment(state, debt!), null);
  assert.equal(resolveFinancialCommitment(state, commitment!), state.finance.commitments[0]);
});

test('cashFlowProjection includes the next debt payment when the current-month due day already passed', () => {
  const state = defaultState();
  state.finance.debts = [{
    id: 'debt-mobile-window',
    name: 'Préstamo',
    amount: 10000,
    monthlyPayment: 1000,
    dueDate: '2026-10-20',
  }];

  const projection = cashFlowProjection(state, 30, '2026-10-25');
  const debtDates = projection.forecastItems
    .filter((item) => item.type === 'debt')
    .map((item) => item.date);

  assert.deepEqual(debtDates, ['2026-11-20']);
});

test('cashFlowProjection generates debt payments by real dates across 30, 60, and 90 day horizons', () => {
  const state = defaultState();
  state.finance.debts = [{
    id: 'debt-real-dates',
    name: 'Cuota',
    amount: 10000,
    monthlyPayment: 1000,
    dueDate: '2026-01-31',
  }];

  const beforeDue = cashFlowProjection(state, 30, '2026-01-20').forecastItems
    .filter((item) => item.type === 'debt')
    .map((item) => item.date);
  const afterDue30 = cashFlowProjection(state, 30, '2026-02-01').forecastItems
    .filter((item) => item.type === 'debt')
    .map((item) => item.date);
  const afterDue60 = cashFlowProjection(state, 60, '2026-02-01').forecastItems
    .filter((item) => item.type === 'debt')
    .map((item) => item.date);
  const afterDue90 = cashFlowProjection(state, 90, '2026-02-01').forecastItems
    .filter((item) => item.type === 'debt')
    .map((item) => item.date);

  assert.deepEqual(beforeDue, ['2026-01-31']);
  assert.deepEqual(afterDue30, ['2026-02-28']);
  assert.deepEqual(afterDue60, ['2026-02-28', '2026-03-31']);
  assert.deepEqual(afterDue90, ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('cashFlowProjection maintains trajectory continuity day by day', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc1', name: 'Efectivo', balance: 20000 }];

  state.finance.expectedIncomes = [
    {
      id: 'inc-1',
      name: 'Cobro',
      amount: 10000,
      startDate: '2026-09-05',
      frequency: 'once',
      active: true,
    },
  ];

  state.finance.subscriptions = [
    {
      id: 'sub-1',
      name: 'Gimnasio',
      amount: 3000,
      dueDay: 15,
    },
  ];

  const proj = cashFlowProjection(state, 30, '2026-09-01');
  const points = proj.dailyTrajectory;

  assert.equal(points.length, 31); // day 0 to day 30 inclusive
  assert.equal(points[0].startingBalance, 20000);

  // Check mathematical continuity
  for (let i = 1; i < points.length; i++) {
    assert.equal(
      points[i].startingBalance,
      points[i - 1].endingBalance,
      `Day ${points[i].date} starting balance must match previous day ending balance`
    );
  }

  // Final ending balance must equal projectedBalance
  assert.equal(points[points.length - 1].endingBalance, proj.projectedBalance);
});

test('cashFlowProjection triggers deficit alert when balance drops below 0', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc1', name: 'Banco', balance: 10000 }];

  // Big payment due on day 10
  state.finance.subscriptions = [
    {
      id: 'sub-caro',
      name: 'Alquiler',
      amount: 25000,
      dueDay: 10,
    },
  ];

  const proj = cashFlowProjection(state, 30, '2026-09-01');
  assert.equal(proj.isDeficit, true);
  assert.equal(proj.thresholdWarning, true);
  assert.equal(proj.minProjectedBalance, -15000);
  assert.equal(proj.minBalanceDate, '2026-09-10');
});

test('cashFlowProjection triggers safety threshold warning when dropping below 5.000 UYU but >= 0', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc1', name: 'Banco', balance: 10000 }];

  // Payment that leaves 3.000 UYU (below 5.000 threshold, but positive)
  state.finance.subscriptions = [
    {
      id: 'sub-mid',
      name: 'Gasto medio',
      amount: 7000,
      dueDay: 12,
    },
  ];

  const proj = cashFlowProjection(state, 30, '2026-09-01');
  assert.equal(proj.isDeficit, false, 'No should not be deficit because balance >= 0');
  assert.equal(proj.thresholdWarning, true, 'Should trigger safety threshold warning (< 5000)');
  assert.equal(proj.minProjectedBalance, 3000);
  assert.equal(proj.minBalanceDate, '2026-09-12');
});
