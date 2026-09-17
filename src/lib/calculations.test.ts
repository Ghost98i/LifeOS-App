import assert from 'node:assert/strict';
import test from 'node:test';
import { routineScheduledFor, todayItems, calcPRs, findNowAndNext, todayGymStatus } from './calculations';
import { defaultState } from './storage';

test('una rutina con días elegidos sólo aparece esos días', () => {
  const state = defaultState();
  const task = { id: 'dias', name: 'Gimnasio', freq: '2-3x' as const, days: ['lunes', 'viernes'] as const };
  state.tasksRecurring = [{ ...task, days: [...task.days] }];
  assert.equal(routineScheduledFor(state, state.tasksRecurring[0], '2026-08-10'), true);
  assert.equal(routineScheduledFor(state, state.tasksRecurring[0], '2026-08-11'), false);
  assert.equal(todayItems(state, '2026-08-11', false).some((item) => item.id === task.id), false);
});

test('una rutina semanal deja de insistir al completarse', () => {
  const state = defaultState();
  const task = { id: 'semanal', name: 'Llamar', freq: 'weekly' as const };
  state.tasksRecurring = [task];
  state.taskLog['2026-08-10'] = { [task.id]: true };
  assert.equal(routineScheduledFor(state, task, '2026-08-10'), true);
  assert.equal(routineScheduledFor(state, task, '2026-08-13'), false);
  assert.equal(routineScheduledFor(state, task, '2026-08-17'), true);
});

test('calcPRs calcula récords por series y previene cuelgues con datos heredados', () => {
  const state = defaultState();
  state.gym.sessions = [
    {
      id: 's1',
      date: '2026-09-01',
      status: 'completed',
      exercises: [
        {
          name: 'Press banca plano',
          sets: [
            { id: '1', weight: 60, reps: 10, completed: true },
            { id: '2', weight: 80, reps: 5, completed: true },
          ],
        },
        {
          name: 'Sentadilla',
          weight: 100,
          reps: '3x5',
          sets: [],
        },
      ],
    },
  ];

  const prs = calcPRs(state);
  assert.equal(prs['Press banca plano'].weight, 80);
  assert.equal(prs['Press banca plano'].reps, 5);
  assert.equal(prs['Sentadilla'].weight, 100);
});

test('findNowAndNext expira actividades pasadas hace más de 90 minutos', () => {
  const state = defaultState();
  state.agenda.lunes = [
    { id: 'b1', time: '08:00', activity: 'Desayuno' },
    { id: 'b2', time: '14:00', activity: 'Almuerzo' },
  ];

  // At 08:30 on Monday, Breakfast is current
  const at830 = new Date('2026-08-10T08:30:00'); // 2026-08-10 is Monday
  const res830 = findNowAndNext(state, at830);
  assert.equal(res830.current?.activity, 'Desayuno');
  assert.equal(res830.next?.activity, 'Almuerzo');

  // At 22:00 on Monday, lunch was 8 hours ago, so current should be null
  const at2200 = new Date('2026-08-10T22:00:00');
  const res2200 = findNowAndNext(state, at2200);
  assert.equal(res2200.current, null);
  assert.equal(res2200.next, null);
});

test('todayGymStatus reporta fielmente entrenado, descanso o pendiente', () => {
  const state = defaultState();
  assert.equal(todayGymStatus(state, '2026-09-17').status, 'pending_today');

  state.gym.restDays = ['2026-09-17'];
  assert.equal(todayGymStatus(state, '2026-09-17').status, 'rest_today');

  state.gym.sessions = [
    {
      id: 'today-sess',
      date: '2026-09-17',
      status: 'completed',
      exercises: [
        {
          name: 'Press banca',
          sets: [{ id: '1', weight: 80, reps: 5, completed: true }],
        },
      ],
    },
  ];
  const gymSt = todayGymStatus(state, '2026-09-17');
  assert.equal(gymSt.status, 'trained_today');
  assert.equal(gymSt.totalVolume, 400);
  assert.equal(gymSt.completedSetsCount, 1);
});

