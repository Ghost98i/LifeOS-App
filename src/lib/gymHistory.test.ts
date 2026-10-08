import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGymHistory, gymWeekMonday } from './gymHistory';
import type { GymSession } from '../types';

const session = (id: string, date: string): GymSession => ({
  id,
  date,
  status: 'completed',
  exercises: [{ name: 'Remo', sets: [{ id: `${id}-set`, weight: 50, reps: 10, completed: true }] }],
});

test('calcula el lunes incluso para una sesión del domingo', () => {
  assert.equal(gymWeekMonday('2026-08-09'), '2026-08-03');
});

test('mantiene cuatro semanas visibles y archiva las anteriores por mes', () => {
  const result = buildGymHistory([
    session('a', '2026-08-10'),
    session('b', '2026-08-03'),
    session('c', '2026-07-27'),
    session('d', '2026-07-20'),
    session('e', '2026-07-13'),
    session('f', '2026-07-14'),
  ], '2026-08-10');

  assert.deepEqual(result.recentWeeks.map((week) => week.key), ['2026-08-10', '2026-08-03', '2026-07-27', '2026-07-20']);
  assert.equal(result.archivedMonths[0].key, '2026-07');
  assert.equal(result.archivedMonths[0].sessionsCount, 2);
  assert.equal(result.archivedMonths[0].weeks.length, 1);
});
