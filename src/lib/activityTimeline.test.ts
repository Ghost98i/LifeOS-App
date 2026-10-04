import assert from 'node:assert/strict';
import test from 'node:test';
import { getActivityTimeline, formatRelativeTime } from './activityTimeline';
import { LifeOSState } from '../types';
import { defaultState } from './storage';

test('getActivityTimeline: aggregates activities across finance, gym, study, tasks, resale, and inbox chronologically', () => {
  const state: LifeOSState = {
    ...defaultState(),
    todayExtras: [
      { id: 't1', text: 'Limpiar escritorio', done: true, date: '2026-09-25T14:00:00Z', priority: 'media' },
      { id: 't2', text: 'Tarea pendiente', done: false, date: '2026-09-25T12:00:00Z', priority: 'media' },
    ],
    finance: {
      transactions: [
        { id: 'f1', date: '2026-09-25T15:30:00Z', amount: -250, category: 'Supermercado', type: 'gasto', note: 'Almuerzo', fixed: 'variable' },
        { id: 'f2', date: '2026-09-24T10:00:00Z', amount: 12000, category: 'Sueldo', type: 'ingreso', fixed: 'variable' },
      ],
      transfers: [],
      reconciliations: [],
      categories: [
        { id: 'Supermercado', name: 'Supermercado', active: true },
        { id: 'Sueldo', name: 'Sueldo', active: true },
      ],
      budgets: {},
      accounts: [],
      debts: [],
      investments: [],
      subscriptions: [],
    },
    gym: {
      weight: [],
      measurements: [],
      sessions: [
        {
          id: 'g1',
          date: '2026-09-25',
          status: 'completed',
          finishedAt: '2026-09-25T16:00:00Z',
          exercises: [{ name: 'Press banca', sets: [] }],
        },
      ],
      routineTemplates: [],
    },
    study: {
      subjects: [{ id: 'sub-1', name: 'Arquitectura' }],
      exams: [],
      studyLog: [
        { id: 's1', date: '2026-09-25T11:00:00Z', minutes: 45, subjectId: 'sub-1' },
      ],
    },
    resale: {
      opportunities: [],
      inventory: [
        {
          id: 'r1',
          item: 'Teclado Mecánico',
          buyPrice: 1500,
          buyDate: '2026-09-20',
          sellPrice: 2800,
          sellDate: '2026-09-25T13:00:00Z',
          status: 'vendido',
        },
      ],
    },
    inbox: [
      { id: 'in-1', text: 'Revisar seguro de auto', createdAt: '2026-09-25T17:00:00Z' },
    ],
  };

  const timeline = getActivityTimeline(state, 10);
  assert.equal(timeline.length, 7);

  // Latest is 17:00 (inbox)
  assert.equal(timeline[0].module, 'inbox');
  assert.equal(timeline[0].title, 'Revisar seguro de auto');

  // Second is 16:00 (gym session)
  assert.equal(timeline[1].module, 'gym');
  assert.equal(timeline[1].title, 'Entrenamiento completado');

  // Third is 15:30 (finance expense)
  assert.equal(timeline[2].module, 'finance');
  assert.ok(timeline[2].title.includes('Supermercado'));

  // Fourth is 14:00 (completed task)
  assert.equal(timeline[3].module, 'task');
  assert.equal(timeline[3].title, 'Limpiar escritorio');

  // Fifth is 13:00 (resale sold)
  assert.equal(timeline[4].module, 'resale');
  assert.equal(timeline[4].title, 'Venta: Teclado Mecánico');

  // Sixth is 11:00 (study log)
  assert.equal(timeline[5].module, 'study');
  assert.equal(timeline[5].title, 'Estudio: 45 min');
  assert.equal(timeline[5].subtitle, 'Arquitectura');
});

test('getActivityTimeline: respects limit parameter', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      transactions: [
        { id: 'f1', date: '2026-09-25T15:30:00Z', amount: -250, category: 'Supermercado', type: 'gasto', fixed: 'variable' },
        { id: 'f2', date: '2026-09-24T10:00:00Z', amount: 12000, category: 'Sueldo', type: 'ingreso', fixed: 'variable' },
      ],
      transfers: [],
      reconciliations: [],
      categories: [
        { id: 'Supermercado', name: 'Supermercado', active: true },
        { id: 'Sueldo', name: 'Sueldo', active: true },
      ],
      budgets: {},
      accounts: [],
      debts: [],
      investments: [],
      subscriptions: [],
    },
  };

  const timeline = getActivityTimeline(state, 1);
  assert.equal(timeline.length, 1);
});

test('formatRelativeTime: formats relative dates accurately without throwing', () => {
  assert.equal(formatRelativeTime(''), '');
  assert.equal(formatRelativeTime('invalid-date'), 'invalid-date');
});
