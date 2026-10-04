import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import { goalProgressPct, goalCurrentValue } from './calculations';
import { Goal } from '../types';

test('goalProgressPct calculates ascending goals accurately', () => {
  const goal: Goal = {
    id: 'g-asc',
    name: 'Ahorro Fondo',
    target: 100000,
    current: 50000,
    initial: 0,
    linked: 'available',
  };

  assert.equal(goalProgressPct(goal, 50000), 50);

  // Exceeded target clamps to 100
  assert.equal(goalProgressPct(goal, 150000), 100);

  // Below initial clamps to 0
  assert.equal(goalProgressPct(goal, -1000), 0);
});

test('goalProgressPct calculates descending goals (e.g. weight loss) accurately', () => {
  const weightGoal: Goal = {
    id: 'g-desc',
    name: 'Bajar de peso',
    initial: 90,
    target: 80,
    current: 85,
    linked: 'weight',
  };

  // Halfway from 90 to 80 is 85 -> 50%
  assert.equal(goalProgressPct(weightGoal, 85), 50);

  // At or below target (80kg or 78kg) is 100%
  assert.equal(goalProgressPct(weightGoal, 80), 100);
  assert.equal(goalProgressPct(weightGoal, 75), 100);

  // Higher than initial weight (92kg) is 0%
  assert.equal(goalProgressPct(weightGoal, 92), 0);
});

test('goalProgressPct handles edge cases: division by zero, NaN, negative values', () => {
  // Target equals initial (avoid division by 0)
  const zeroSpanGoal: Goal = {
    id: 'g-zero',
    name: 'Meta estática',
    initial: 50,
    target: 50,
    current: 50,
  };
  assert.equal(goalProgressPct(zeroSpanGoal, 50), 100);
  assert.equal(goalProgressPct(zeroSpanGoal, 40), 0);

  // Negative values (e.g. recovering from negative net worth)
  const debtRecoveryGoal: Goal = {
    id: 'g-neg',
    name: 'Salir de deudas',
    initial: -20000,
    target: 0,
    current: -10000,
    linked: 'net_worth',
  };
  assert.equal(goalProgressPct(debtRecoveryGoal, -10000), 50);
});

test('goalCurrentValue reads dynamically from all 6 automatic sources', () => {
  const state = defaultState();

  // 1. weight
  state.gym.weight = [
    { date: '2026-08-01', kg: 82.5 },
    { date: '2026-08-10', kg: 81.0 },
  ];
  const weightGoal: Goal = { id: 'g1', name: 'Peso', target: 75, current: 85, initial: 90, linked: 'weight' };
  assert.equal(goalCurrentValue(state, weightGoal), 81.0);

  // 2. available
  state.finance.accounts = [
    { id: 'a1', name: 'Banco', balance: 45000 },
    { id: 'a2', name: 'Efectivo', balance: 5000 },
  ];
  const availGoal: Goal = { id: 'g2', name: 'Disponible', target: 100000, current: 0, initial: 0, linked: 'available' };
  assert.equal(goalCurrentValue(state, availGoal), 50000);

  // 3. net_worth
  state.finance.investments = [{ id: 'i1', name: 'Plazo fijo', amount: 30000 }];
  state.finance.debts = [{ id: 'd1', name: 'Préstamo', amount: 10000, monthlyPayment: 1000 }];
  // Net worth = 50000 (accounts) + 30000 (inv) - 10000 (debt) = 70000
  const nwGoal: Goal = { id: 'g3', name: 'Patrimonio', target: 100000, current: 0, initial: 0, linked: 'net_worth' };
  assert.equal(goalCurrentValue(state, nwGoal), 70000);

  // 4. gym_sessions
  state.gym.sessions = [
    { id: 's1', date: '2026-08-01', status: 'completed', exercises: [] },
    { id: 's2', date: '2026-08-03', status: 'completed', exercises: [] },
    { id: 's3', date: '2026-08-05', status: 'completed', exercises: [] },
  ];
  const gymGoal: Goal = { id: 'g4', name: 'Entrenamientos', target: 50, current: 0, initial: 0, linked: 'gym_sessions' };
  assert.equal(goalCurrentValue(state, gymGoal), 3);

  // 5. study_hours
  state.study.studyLog = [
    { id: 'st1', date: '2026-08-01', minutes: 120, subjectId: 'subj1' },
    { id: 'st2', date: '2026-08-02', minutes: 60, subjectId: 'subj1' },
  ];
  const studyGoal: Goal = { id: 'g5', name: 'Horas de estudio', target: 100, current: 0, initial: 0, linked: 'study_hours' };
  assert.equal(goalCurrentValue(state, studyGoal), 3); // (120+60)/60 = 3h

  // 6. resale_profit
  state.resale = {
    inventory: [
      {
        id: 'r1',
        item: 'Artículo 1',
        buyPrice: 1000,
        sellPrice: 2500,
        fees: 200,
        status: 'vendido',
        buyDate: '2026-08-01',
        sellDate: '2026-08-05',
      },
    ],
    opportunities: [],
  };
  const resaleGoal: Goal = { id: 'g6', name: 'Ganancia reventa', target: 10000, current: 0, initial: 0, linked: 'resale_profit' };
  assert.equal(goalCurrentValue(state, resaleGoal), 1300); // 2500 - 1000 - 200 = 1300
});
