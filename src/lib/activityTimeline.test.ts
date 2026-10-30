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
  assert.equal(timeline[1].title, 'Gimnasio · Entrenamiento completado');

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

test('getActivityTimeline: resolves category ID to human name and never exposes raw cat_* IDs', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      categories: [
        { id: 'cat_d4im18kxm5xy', name: 'Alimentación', active: true },
      ],
      transactions: [
        {
          id: 'tx-1',
          date: '2026-10-04T12:00:00Z',
          amount: 2000,
          type: 'ingreso',
          category: 'cat_d4im18kxm5xy',
          note: 'Cobro',
          fixed: 'variable',
        },
        {
          id: 'tx-2',
          date: '2026-10-04T11:00:00Z',
          amount: -500,
          type: 'gasto',
          category: 'cat_deleted_or_orphan',
          note: 'Gasto antiguo',
          fixed: 'variable',
        },
      ],
    },
  };

  const timeline = getActivityTimeline(state);
  const item1 = timeline.find((i) => i.id === 'fin-tx-1');
  const item2 = timeline.find((i) => i.id === 'fin-tx-2');

  assert.ok(item1);
  assert.equal(item1.title, '+$2.000 · Alimentación');
  assert.ok(!item1.title.includes('cat_d4im18kxm5xy'));

  assert.ok(item2);
  assert.equal(item2.title, '-$500 · Sin categoría');
  assert.ok(!item2.title.includes('cat_deleted_or_orphan'));
});

test('getActivityTimeline: hideAmounts omits currency signs and amounts for privacy in dashboard', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      categories: [
        { id: 'cat_servicios', name: 'Servicios', active: true },
      ],
      transactions: [
        {
          id: 'tx-priv-1',
          date: '2026-10-15T10:00:00Z',
          amount: -1500,
          type: 'gasto',
          category: 'cat_servicios',
          note: 'DirecTV',
          fixed: 'variable',
        },
        {
          id: 'tx-priv-2',
          date: '2026-10-15T09:00:00Z',
          amount: 5000,
          type: 'ingreso',
          category: 'cat_servicios',
          note: 'Arbitraje',
          fixed: 'variable',
        },
      ],
    },
    resale: {
      opportunities: [],
      inventory: [
        {
          id: 'r-priv-1',
          item: 'Monitor',
          buyPrice: 3000,
          buyDate: '2026-10-14',
          sellPrice: 4500,
          sellDate: '2026-10-15T08:00:00Z',
          status: 'vendido',
        },
      ],
    },
  };

  const timeline = getActivityTimeline(state, 5, { hideAmounts: true });
  assert.equal(timeline.length, 3);

  // Expense
  const expense = timeline.find((i) => i.id === 'fin-tx-priv-1');
  assert.ok(expense);
  assert.equal(expense.title, 'Gasto en DirecTV');
  assert.equal(expense.subtitle, 'Servicios');
  assert.ok(!expense.title.includes('$'));
  assert.ok(!expense.title.includes('1500'));

  // Income
  const income = timeline.find((i) => i.id === 'fin-tx-priv-2');
  assert.ok(income);
  assert.equal(income.title, 'Ingreso de Arbitraje');
  assert.equal(income.subtitle, 'Servicios');
  assert.ok(!income.title.includes('$'));
  assert.ok(!income.title.includes('5000'));

  // Resale
  const resale = timeline.find((i) => i.id === 'resale-sold-r-priv-1');
  assert.ok(resale);
  assert.equal(resale.title, 'Venta: Monitor');
  assert.equal(resale.subtitle, 'Artículo vendido');
  assert.ok(!resale.subtitle.includes('$'));
});

test('getActivityTimeline: uses a reliable gym label and only explicit rest days', () => {
  const state = defaultState();
  state.gym.sessions = [{ id: 'gym-custom', date: '2026-10-14', status: 'completed', weekLabel: 'Espalda y bíceps', exercises: [] }];
  state.gym.restDays = ['2026-10-13', '2026-10-13'];

  const timeline = getActivityTimeline(state, 10);
  assert.equal(timeline.find((item) => item.id === 'gym-gym-custom')?.title, 'Gimnasio · Espalda y bíceps');
  assert.equal(timeline.filter((item) => item.id === 'gym-rest-2026-10-13').length, 1);
  assert.equal(timeline.some((item) => item.id === 'gym-rest-2026-10-12'), false);

  const guarded = getActivityTimeline(state, 10, { privacyMode: true });
  assert.equal(guarded.find((item) => item.id === 'gym-gym-custom')?.title, 'Gimnasio · Entrenamiento completado');
});

test('getActivityTimeline: includes job applications and opportunities from Trabajo', () => {
  const state = defaultState();
  state.jobs = {
    applications: [
      {
        id: 'job-1',
        empresa: 'Globant',
        puesto: 'Frontend Engineer',
        estado: 'cv_enviado',
        fecha: '2026-10-23T10:00:00Z',
      },
    ],
    opportunities: [
      {
        id: 'opp-1',
        empresa: 'Mercado Libre',
        puesto: 'React Developer',
        status: 'nueva',
        fecha: '2026-10-22T15:00:00Z',
      },
    ],
  };

  const timeline = getActivityTimeline(state, 5);
  const app = timeline.find((item) => item.id === 'job-app-job-1');
  assert.ok(app);
  assert.equal(app.module, 'jobs');
  assert.equal(app.title, 'Postulación: Globant');
  assert.equal(app.subtitle, 'Frontend Engineer');
  assert.equal(app.iconName, 'briefcase');

  const opp = timeline.find((item) => item.id === 'job-opp-opp-1');
  assert.ok(opp);
  assert.equal(opp.module, 'jobs');
  assert.equal(opp.title, 'Oportunidad: Mercado Libre');

  const guarded = getActivityTimeline(state, 5, { privacyMode: true });
  assert.equal(guarded.find((item) => item.id === 'job-app-job-1')?.title, 'Postulación laboral');
});
