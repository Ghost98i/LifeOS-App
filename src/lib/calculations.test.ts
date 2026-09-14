import assert from 'node:assert/strict';
import test from 'node:test';
import { routineScheduledFor, todayItems } from './calculations';
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
