import assert from 'node:assert/strict';
import test from 'node:test';
import { calcGymStreakDetails } from './calculations';
import { defaultState } from './storage';

function trainedState(dates: string[]) {
  const state = defaultState();
  state.gym.sessions = dates.map((date, index) => ({
    id: `session-${index}`, date, status: 'completed', exercises: [{
      id: 'press', name: 'Press', sets: [{ id: `set-${index}`, weight: 40, reps: 8, completed: true }],
    }],
  }));
  return state;
}

test('descansos explícitos y permitidos mantienen continuidad sin sumar asistencia', () => {
  const state = trainedState(['2026-10-23', '2026-10-26', '2026-10-28']);
  state.gym.restDays = ['2026-10-27'];
  const before = JSON.stringify(state);
  const result = calcGymStreakDetails(state, new Date('2026-10-28T12:00:00'));
  assert.equal(result.streakDays, 3);
  assert.equal(result.workoutCount, 3);
  assert.equal(result.restDaysCount, 3);
  assert.equal(result.label, '3 días entrenados · Entrenado');
  assert.equal(JSON.stringify(state), before);
});

test('un descanso hoy no incrementa el progreso y dos sesiones del día suman una asistencia', () => {
  const state = trainedState(['2026-10-26', '2026-10-26']);
  state.gym.restDays = ['2026-10-27'];
  const result = calcGymStreakDetails(state, new Date('2026-10-27T12:00:00'));
  assert.equal(result.streakDays, 1);
  assert.equal(result.status, 'rest_today');
});

test('una cuenta vacía, sesiones futuras y una continuidad interrumpida no inventan progreso', () => {
  const reference = new Date('2026-10-28T12:00:00');
  assert.equal(calcGymStreakDetails(defaultState(), reference).streakDays, 0);
  assert.equal(calcGymStreakDetails(trainedState(['2026-10-29']), reference).weeksStreak, 0);
  const broken = calcGymStreakDetails(trainedState(['2026-10-01']), reference);
  assert.equal(broken.streakDays, 0);
  assert.equal(broken.status, 'broken');
});

test('semanas de entrenamiento usan fechas locales incluso en zonas al este de UTC', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    const state = trainedState(['2026-10-18']); // Sunday belongs to the previous week.
    assert.equal(calcGymStreakDetails(state, new Date('2026-10-21T12:00:00')).weeksStreak, 1);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
