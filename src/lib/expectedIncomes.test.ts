import test from 'node:test';
import assert from 'node:assert/strict';
import { getExpectedIncomeOccurrences } from './calculations';
import { ExpectedIncome } from '../types';

test('getExpectedIncomeOccurrences generates once occurrence within horizon and ignores outside', () => {
  const inc: ExpectedIncome = {
    id: 'inc-once-1',
    name: 'Venta puntual',
    amount: 15000,
    startDate: '2026-09-10',
    frequency: 'once',
    active: true,
  };

  // When within horizon
  const occ1 = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-09-30');
  assert.equal(occ1.length, 1);
  assert.equal(occ1[0].date, '2026-09-10');
  assert.equal(occ1[0].amount, 15000);
  assert.equal(occ1[0].type, 'income');

  // When outside horizon (prior date)
  const occ2 = getExpectedIncomeOccurrences(inc, '2026-09-15', '2026-09-30');
  assert.equal(occ2.length, 0);

  // When outside horizon (future date)
  const occ3 = getExpectedIncomeOccurrences(inc, '2026-08-01', '2026-08-31');
  assert.equal(occ3.length, 0);
});

test('getExpectedIncomeOccurrences respects active: false', () => {
  const inc: ExpectedIncome = {
    id: 'inc-paused',
    name: 'Sueldo pausado',
    amount: 50000,
    startDate: '2026-09-05',
    frequency: 'monthly',
    active: false,
  };

  const occurrences = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-11-30');
  assert.equal(occurrences.length, 0);
});

test('getExpectedIncomeOccurrences handles weekly frequency correctly', () => {
  const inc: ExpectedIncome = {
    id: 'inc-weekly',
    name: 'Honorarios semanales',
    amount: 5000,
    startDate: '2026-09-01',
    frequency: 'weekly',
    active: true,
  };

  // From 2026-09-01 to 2026-09-30 (30 days)
  // Expected dates: 01, 08, 15, 22, 29 (5 occurrences)
  const occ = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-09-30');
  assert.equal(occ.length, 5);
  assert.equal(occ[0].date, '2026-09-01');
  assert.equal(occ[1].date, '2026-09-08');
  assert.equal(occ[2].date, '2026-09-15');
  assert.equal(occ[3].date, '2026-09-22');
  assert.equal(occ[4].date, '2026-09-29');
});

test('getExpectedIncomeOccurrences handles biweekly frequency correctly', () => {
  const inc: ExpectedIncome = {
    id: 'inc-biweekly',
    name: 'Quincena',
    amount: 25000,
    startDate: '2026-09-01',
    frequency: 'biweekly',
    active: true,
  };

  // From 2026-09-01 to 2026-09-30 (30 days)
  // Expected dates: 01, 15, 29 (3 occurrences)
  const occ = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-09-30');
  assert.equal(occ.length, 3);
  assert.equal(occ[0].date, '2026-09-01');
  assert.equal(occ[1].date, '2026-09-15');
  assert.equal(occ[2].date, '2026-09-29');
});

test('getExpectedIncomeOccurrences handles monthly frequency across 30, 60, and 90 days', () => {
  const inc: ExpectedIncome = {
    id: 'inc-monthly',
    name: 'Sueldo mensual',
    amount: 80000,
    startDate: '2026-09-05',
    frequency: 'monthly',
    active: true,
  };

  // 30 days: 2026-09-01 to 2026-10-01 -> 1 occurrence (2026-09-05)
  const occ30 = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-10-01');
  assert.equal(occ30.length, 1);
  assert.equal(occ30[0].date, '2026-09-05');

  // 60 days: 2026-09-01 to 2026-10-31 -> 2 occurrences (2026-09-05, 2026-10-05)
  const occ60 = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-10-31');
  assert.equal(occ60.length, 2);
  assert.equal(occ60[0].date, '2026-09-05');
  assert.equal(occ60[1].date, '2026-10-05');

  // 90 days: 2026-09-01 to 2026-11-30 -> 3 occurrences (2026-09-05, 2026-10-05, 2026-11-05)
  const occ90 = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-11-30');
  assert.equal(occ90.length, 3);
  assert.equal(occ90[0].date, '2026-09-05');
  assert.equal(occ90[1].date, '2026-10-05');
  assert.equal(occ90[2].date, '2026-11-05');
});

test('getExpectedIncomeOccurrences respects endDate boundary', () => {
  const inc: ExpectedIncome = {
    id: 'inc-contract',
    name: 'Contrato temporal',
    amount: 30000,
    startDate: '2026-09-01',
    endDate: '2026-10-15',
    frequency: 'monthly',
    active: true,
  };

  // In a 90 days horizon (up to 2026-11-30), should only fire for September and October, not November
  const occ = getExpectedIncomeOccurrences(inc, '2026-09-01', '2026-11-30');
  assert.equal(occ.length, 2);
  assert.equal(occ[0].date, '2026-09-01');
  assert.equal(occ[1].date, '2026-10-01');
});
