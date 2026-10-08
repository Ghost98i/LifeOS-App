import assert from 'node:assert/strict';
import test from 'node:test';
import { inferMuscleGroup, migrateGym, parseLegacyReps } from './gymMigration';
import { getPerformedGymVolume } from './gymMetrics';

test('clasifica jalones y remos al pecho como espalda', () => {
  assert.equal(inferMuscleGroup('Jalón al pecho'), 'Espalda');
  assert.equal(inferMuscleGroup('Remo al pecho'), 'Espalda');
  assert.equal(inferMuscleGroup('Press banca'), 'Pecho');
  const migrated = migrateGym({
    sessions: [],
    routineTemplates: [{ id: 'back', name: 'Espalda', exercises: [{ name: 'Jalón al pecho', muscleGroup: 'Pecho', reps: '3x10', weight: 55 }] }],
  });
  assert.equal(migrated.routineTemplates[0].exercises[0].muscleGroup, 'Espalda');
});

test('clasifica y corrige elevaciones laterales como hombros', () => {
  assert.equal(inferMuscleGroup('Elevación lateral con mancuerna'), 'Hombros');
  assert.equal(inferMuscleGroup('Elevaciones laterales con mancuernas'), 'Hombros');
  const migrated = migrateGym({
    sessions: [],
    routineTemplates: [{ id: 'shoulders', name: 'Hombros', exercises: [{ name: 'Elevaciones laterales con mancuernas', muscleGroup: 'Otros', reps: '3x12', weight: 8 }] }],
  });
  assert.equal(migrated.routineTemplates[0].exercises[0].muscleGroup, 'Hombros');
});

test('interpreta formatos heredados de series sin inventar datos ambiguos', () => {
  assert.deepEqual(parseLegacyReps('3x10'), { reps: [10, 10, 10], legacyReps: null });
  assert.deepEqual(parseLegacyReps('3 × 8'), { reps: [8, 8, 8], legacyReps: null });
  assert.deepEqual(parseLegacyReps('8/8/7'), { reps: [8, 8, 7], legacyReps: null });
  assert.deepEqual(parseLegacyReps('10'), { reps: [10], legacyReps: null });
  assert.deepEqual(parseLegacyReps('3x8-10'), { reps: [], legacyReps: '3x8-10' });
});

test('migra sesiones v6 con ids deterministas y calcula volumen', () => {
  const legacy = {
    sessions: [{ id: 's1', date: '2026-08-20', exercises: [{ name: 'Press banca', weight: 50, reps: '3x10' }] }],
    routineTemplates: [], weight: [], measurements: [],
  };
  const first = migrateGym(legacy);
  const second = migrateGym(legacy);
  assert.deepEqual(first, second);
  assert.equal(first.sessions[0].status, 'completed');
  assert.deepEqual(first.sessions[0].exercises[0].sets.map((set) => set.reps), [10, 10, 10]);
  assert.equal(getPerformedGymVolume(first.sessions[0]), 1500);
});

test('la migración v7 es idempotente y conserva texto no interpretable', () => {
  const first = migrateGym({
    sessions: [{ id: 's2', date: '2026-08-20', exercises: [{ name: 'Curl', weight: 20, reps: 'a fallo' }] }],
    routineTemplates: [], weight: [], measurements: [],
  });
  const second = migrateGym(first);
  assert.deepEqual(second, first);
  assert.equal(second.sessions[0].exercises[0].legacyReps, 'a fallo');
});

test('conserva sesiones activas legacy sin convertirlas en historial realizado', () => {
  const gym = migrateGym({
    sessions: [
      { id: 'a', date: '2026-08-20', status: 'active', exercises: [] },
      { id: 'b', date: '2026-08-20', status: 'active', exercises: [] },
    ],
  });
  assert.deepEqual(gym.sessions.map((session) => session.status), ['active', 'active']);
});

test('una sesión activa de un día anterior sobrevive a migración y reapertura', () => {
  const first = migrateGym({
    sessions: [{ id: 'overnight', date: '2026-10-06', status: 'active', exercises: [] }],
  });
  const reopened = migrateGym(first);
  assert.equal(reopened.sessions[0].id, 'overnight');
  assert.equal(reopened.sessions[0].date, '2026-10-06');
  assert.equal(reopened.sessions[0].status, 'active');
  assert.equal(reopened.sessions[0].finishedAt, null);
});

test('sesiones completadas legacy conservan su volumen, pero planes activos no cuentan como realizados', () => {
  const gym = migrateGym({
    sessions: [
      { id: 'done', date: '2026-08-20', status: 'completed', exercises: [{ name: 'Curl', weight: 20, reps: '3x10' }] },
      { id: 'planned', date: '2026-08-21', status: 'active', exercises: [{ name: 'Curl', weight: 20, reps: '3x10' }] },
    ],
  });
  assert.equal(getPerformedGymVolume(gym.sessions.find((session) => session.id === 'done')!), 600);
  assert.equal(getPerformedGymVolume(gym.sessions.find((session) => session.id === 'planned')!), 0);
});

test('el temporizador queda opt-in al migrar ejercicios', () => {
  const migrated = migrateGym({ sessions: [{ id: 'a', date: '2026-09-01', exercises: [{ name: 'Curl', reps: '3x10' }] }] });
  assert.equal(migrated.sessions[0].exercises[0].timerEnabled, false);
  const enabled = migrateGym({ sessions: [{ id: 'b', date: '2026-09-01', exercises: [{ name: 'Curl', reps: '3x10', timerEnabled: true }] }] });
  assert.equal(enabled.sessions[0].exercises[0].timerEnabled, true);
});
