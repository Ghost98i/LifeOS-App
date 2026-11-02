import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from '../lib/storage';
import { cashFlowProjection } from '../lib/calculations';
import { FinanceHero } from './FinanceHero';

function render(state: ReturnType<typeof defaultState>) {
  return renderToStaticMarkup(<FinanceHero state={state} cashFlow={cashFlowProjection(state, 30)} onOpenNewTx={() => {}} onOpenTransfer={() => {}} onOpenCushionModal={() => {}} />);
}

test('cuenta inicial vacía conserva cero y configuración del colchón sin presentarlo como una obligación', () => {
  const state = defaultState(); state.finance.accounts = [{ id: 'zero', name: 'Sintética', currency: 'UYU', balance: 0, initialBalance: 0 }];
  state.finance.transactions = []; state.finance.commitments = []; state.finance.expectedIncomes = []; state.finance.subscriptions = []; state.finance.debts = []; state.finance.agreements = [];
  const html = render(state);
  assert.match(html, /Saldo real/); assert.match(html, /\$U 0/); assert.match(html, /Colchón mínimo/);
  assert.doesNotMatch(html, /El saldo tras pagos pendientes está por debajo|Faltan .*para los pagos|Bajo el colchón/);
});

test('la compactación conserva advertencias por pagos reales y por moneda no confirmada', () => {
  const state = defaultState(); state.finance.accounts = [{ id: 'zero', name: 'Sintética', currency: 'UYU', balance: 0, initialBalance: 0 }];
  state.finance.transactions = []; state.finance.commitments = [{ id: 'due', name: 'Pago real', currency: 'UYU', amount: 100, frequency: 'once', nextDueDate: todayISO(), active: true }];
  const known = render(state); assert.match(known, /Faltan .*100.*para los pagos pendientes/);
  delete state.finance.commitments[0].currency;
  const before = JSON.stringify(state), ambiguous = render(state);
  assert.match(ambiguous, /Cálculo parcial|moneda sin confirmar|moneda confirmada/);
  assert.doesNotMatch(ambiguous, /Sin pagos pendientes este mes/); assert.equal(JSON.stringify(state), before);
});
