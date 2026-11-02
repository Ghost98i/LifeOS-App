import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyAmount, PrivacyInput, PrivacyProvider, PrivateFinancialText } from '../components/PrivacyAmount';
import { maskFinancialText } from './financialPrivacy';
import { financeMonthComparison } from './financeMonthComparison';
import { defaultState } from './storage';
import { addTransaction } from './financeFlows';
import { createFinancingAgreement, addAgreementPayment } from './financeAgreements';
import { FinanceFutureView } from '../components/FinanceFutureView';
import { cashFlowProjection } from './calculations';

test('Stream Guard omits actual amounts, accessible names, custom titles and input values from initial HTML', () => {
  const html = renderToStaticMarkup(<PrivacyProvider active>
    <PrivacyAmount title="$U 67530.88">$U 67.530,88</PrivacyAmount>
    <PrivacyInput value="67530.88" readOnly />
    <PrivateFinancialText>Cuenta 2026 · vence 2026-11-05 · ID tx-1234 · mismo importe ($8765.43)</PrivateFinancialText>
  </PrivacyProvider>);
  assert.doesNotMatch(html, /67530|67\.530|8765/);
  assert.match(html, /aria-label="Revelar importe"/);
  assert.match(html, /2026-11-05/);
  assert.match(html, /tx-1234/);
  assert.match(html, /Cuenta 2026/);
});

test('Privacy disabled preserves values and text without fake reveal controls', () => {
  const html = renderToStaticMarkup(<PrivacyProvider active={false}>
    <PrivacyAmount>$U 67.530,88</PrivacyAmount><PrivacyInput value="67530.88" readOnly />
  </PrivacyProvider>);
  assert.match(html, /67\.530,88/);
  assert.match(html, /value="67530.88"/);
  assert.doesNotMatch(html, /role="button"|aria-pressed/);
});

test('financial text masking preserves dates, IDs and counts and covers both currency positions', () => {
  assert.equal(maskFinancialText('USD 123.45 / US$ 99,50 / $U 88 / $77 / 66,10 UYU · 2026-10-31 · 3 cuotas · id-99', true),
    'USD •••• / US$ •••• / $U •••• / $•••• / •••• UYU · 2026-10-31 · 3 cuotas · id-99');
  assert.equal(maskFinancialText('USD 123.45', false), 'USD 123.45');
});

for (const day of [1, 28, 29, 30, 31]) test(`comparison follows selected month, currency and year from October ${day}`, context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, day, 12).getTime() });
  context.after(() => context.mock.timers.reset());
  const state = defaultState();
  state.finance.accounts = [{ id: 'u', name: 'UYU', balance: 20000, initialBalance: 20000, currency: 'UYU' }, { id: 'd', name: 'USD', balance: 10000, initialBalance: 10000, currency: 'USD' }];
  for (const [id, date, amount, accountId] of [
    ['aug', '2026-08-20', 500, 'u'], ['sep', '2026-09-20', 1500, 'u'], ['oct', '2026-10-20', 3000, 'u'],
    ['aug-usd', '2026-08-20', 200, 'd'], ['sep-usd', '2026-09-20', 100, 'd'],
    ['dec', '2025-12-20', 100, 'u'], ['jan', '2026-01-20', 300, 'u'],
  ] as const) addTransaction(state, { id, type: 'gasto', category: 'Comida', date, amount, accountId });
  const before = JSON.stringify(state);
  assert.equal(financeMonthComparison(state, -1, 'UYU', 'cash_flow').pct, 200);
  assert.equal(financeMonthComparison(state, 0, 'UYU', 'cash_flow').pct, 100);
  assert.equal(financeMonthComparison(state, -1, 'USD', 'cash_flow').pct, 50);
  assert.equal(financeMonthComparison(state, -1, 'USD', 'cash_flow').dir, 'down');
  assert.equal(financeMonthComparison(state, -9, 'UYU', 'cash_flow').pct, 200);
  assert.equal(financeMonthComparison(state, -2, 'UYU', 'cash_flow').pct, null, 'zero comparison base');
  assert.equal(financeMonthComparison(state, -3, 'UYU', 'cash_flow').pct, null, 'empty months');
  assert.equal(financeMonthComparison(state, 1, 'UYU', 'cash_flow').pct, null, 'no activity in selected month');
  assert.equal(JSON.stringify(state), before);
});

test('comparison uses actual cash outflows or acquired consumption consistently, without double counting', context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 12).getTime() });
  context.after(() => context.mock.timers.reset());
  const state = defaultState();
  state.finance.accounts = [{ id: 'u', name: 'UYU', balance: 20000, initialBalance: 20000, currency: 'UYU' }];
  for (const [id, date, amount] of [['sep', '2026-09-01', 500], ['oct', '2026-10-01', 1000]] as const)
    addTransaction(state, { id, type: 'gasto', amount, date, accountId: 'u', category: 'Comida' });
  const agreement = createFinancingAgreement(state, { title: 'Compra', creditorName: 'Prueba', currency: 'UYU', initialRemainingBalance: 6000, originalPrincipal: 6000,
    initialReferenceDate: '2026-10-01', acquisition: { totalPurchaseAmount: 6000, category: 'Comida', acquisitionDate: '2026-10-01' },
    schedule: { totalInstallments: 3, installmentAmount: 2000, firstDueDate: '2026-10-10', dueDay: 10, frequency: 'monthly' } });
  addAgreementPayment(state, { agreementId: agreement.id, accountId: 'u', amount: 2000, date: '2026-10-10' });
  const before = JSON.stringify(state);
  assert.deepEqual(financeMonthComparison(state, 0, 'UYU', 'cash_flow'), { current: 3000, previous: 500, pct: 500, dir: 'up' });
  assert.deepEqual(financeMonthComparison(state, 0, 'UYU', 'acquisitions'), { current: 7000, previous: 500, pct: 1300, dir: 'up' });
  assert.equal(JSON.stringify(state), before);
});

for (const currency of ['UYU', 'USD'] as const) test(`Futuro ${currency}: overdue and upcoming installments retain partial payment and original currency`, context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 12).getTime() });
  context.after(() => context.mock.timers.reset());
  const state = defaultState();
  state.finance.accounts = [{ id: 'a', name: 'Prueba', currency, balance: 2345.67, initialBalance: 2345.67 }];
  const agreement = createFinancingAgreement(state, { title: `Compra ${currency}`, creditorName: 'Prueba', currency,
    initialRemainingBalance: 1200, originalPrincipal: 1200, initialReferenceDate: '2026-10-01',
    schedule: { totalInstallments: 3, installmentAmount: 400, firstDueDate: '2026-10-10', dueDay: 10, frequency: 'monthly' } });
  addAgreementPayment(state, { agreementId: agreement.id, amount: 100, accountId: 'a', date: '2026-10-20' });
  const before = JSON.stringify(state);
  const projection = cashFlowProjection(state, 30, '2026-10-31', currency);
  const noop = () => {};
  const html = renderToStaticMarkup(<PrivacyProvider active={false}><FinanceFutureView state={state} projection={projection} projHorizon={30}
    onSetProjHorizon={noop} onOpenCommitmentModal={noop} onOpenIncomeModal={noop} onOpenCushionModal={noop}
    onPayCommitment={noop} onEditCommitment={noop} onToggleCommitment={noop} onDeleteCommitment={noop}
    onConfirmIncomeReal={noop} onEditIncome={noop} onToggleIncome={noop} onDeleteIncome={noop} /></PrivacyProvider>);
  assert.equal(projection.committed, 700);
  assert.equal(projection.forecastItems.length, 2);
  assert.equal(new Set(projection.forecastItems.map(item => item.id)).size, 2);
  assert.match(html, currency === 'USD' ? /US\$ 300/ : /\$U 300/);
  assert.match(html, currency === 'USD' ? /US\$ 400/ : /\$U 400/);
  if (currency === 'USD') assert.doesNotMatch(html, /colchón previsto|Por debajo de la reserva/);
  assert.equal(JSON.stringify(state), before);
});
