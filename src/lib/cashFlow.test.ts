import assert from 'node:assert/strict';
import test from 'node:test';
import { cashFlow30Days } from './calculations';
import { defaultState } from './storage';

test('proyecta saldo libre con suscripciones y cuotas dentro de 30 días', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'bank', name: 'Banco', balance: 1000 }];
  state.finance.subscriptions = [{ id: 'sub', name: 'Internet', amount: 50, dueDay: 15 }];
  state.finance.debts = [{ id: 'debt', name: 'Tarjeta', amount: 800, monthlyPayment: 120, dueDate: '2026-08-25' }];
  const result = cashFlow30Days(state, '2026-08-20');
  assert.equal(result.committed, 170);
  assert.equal(result.projectedBalance, 830);
  assert.equal(result.commitments[0].label, 'Tarjeta');
  assert.equal(result.commitments[1].dueDate, '2026-09-15');
});

test('omite cuotas con vencimiento fuera del horizonte', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'bank', name: 'Banco', balance: 1000 }];
  state.finance.debts = [{ id: 'debt', name: 'Tarjeta', amount: 800, monthlyPayment: 120, dueDate: '2026-10-25' }];
  assert.equal(cashFlow30Days(state, '2026-08-20').committed, 0);
});
