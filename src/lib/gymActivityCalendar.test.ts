import assert from 'node:assert/strict';
import test from 'node:test';
import type { GymSession } from '../types';
import { defaultState } from './storage';
import { finishGymSession } from './gymFlows';
import { calcGymStreakDetails } from './calculations';
import { migrateGym } from './gymMigration';
import { buildGymActivityIndex, buildGymActivityMonth, gymActivityDateKey, gymActivityKeyboardDate, isGymActivityDate, selectGymActivityMonth, shiftGymActivityMonth } from './gymActivityCalendar';

function session(id: string, date = '2026-10-29'): GymSession {
  return { id, date, status: 'completed', startedAt: '18:00', finishedAt: '19:00', exercises: [{ id: 'press', name: 'Press', sets: [{ id: `set-${id}`, weight: 40, reps: 8, completed: true }] }] };
}

test('actividad: solo finalizadas con trabajo; activas, vacías, abandonadas o series pendientes no marcan asistencia', () => {
  const complete = session('done');
  const active = { ...session('active'), status: 'active' as const };
  const empty = { ...session('empty'), exercises: [] };
  const abandoned = { ...session('abandoned'), status: 'abandoned' } as unknown as GymSession;
  const unchecked = session('unchecked'); unchecked.exercises[0].sets[0].completed = false;
  const index = buildGymActivityIndex([complete, active, empty, abandoned, unchecked], '2026-10-29');
  assert.deepEqual(index.byDate.get('2026-10-29'), [complete]);
  assert.equal(index.weekDays, 1);
});

test('actividad: dos sesiones el mismo día se conservan y suman un solo día entrenado', () => {
  const a = session('a'); a.startedAt = '20:00'; const b = session('b'); b.startedAt = '08:00';
  const data = [a, b, session('monday', '2026-10-26')]; const original = JSON.stringify(data);
  const result = buildGymActivityIndex(data, '2026-10-29');
  assert.equal(result.weekDays, 2); assert.deepEqual(result.byDate.get('2026-10-29')?.map(s => s.id), ['b', 'a']);
  assert.equal(JSON.stringify(data), original);
});

test('actividad: semana de lunes a domingo que cruza dos meses', () => {
  const data = ['2026-10-25', '2026-10-26', '2026-10-30', '2026-11-01', '2026-11-02'].map((date, n) => session(`${n}`, date));
  const result = buildGymActivityIndex(data, '2026-11-01');
  assert.equal(result.monday, '2026-10-26'); assert.equal(result.weekDays, 3); assert.equal(result.futureDateCount, 1);
  assert.equal(buildGymActivityIndex(data, '2026-11-02').weekDays, 1);
});

test('actividad: año nuevo no reinicia una semana que empezó en diciembre', () => {
  const data = ['2026-12-27', '2026-12-28', '2026-12-31', '2027-01-01'].map((date, n) => session(`${n}`, date));
  const result = buildGymActivityIndex(data, '2027-01-01');
  assert.equal(result.monday, '2026-12-28'); assert.equal(result.weekDays, 3);
  assert.equal(shiftGymActivityMonth('2026-12', 1), '2027-01');
});

test('actividad: fecha local cerca de medianoche y a ambos lados de UTC', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Montevideo';
    const local = gymActivityDateKey(new Date('2026-11-01T02:30:00Z'));
    assert.equal(local, '2026-10-31');
    assert.equal(buildGymActivityIndex([session('night', local)], local).weekDays, 1);
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(gymActivityDateKey(new Date('2026-10-31T12:30:00Z')), '2026-11-01');
    assert.equal(buildGymActivityIndex([session('east', '2026-11-01')], '2026-11-01').monday, '2026-10-26');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('actividad: una sesión que termina después de medianoche conserva la fecha registrada', () => {
  const late = session('late', '2026-10-31'); late.startedAt = '23:50'; late.finishedAt = '00:20';
  const result = buildGymActivityIndex([late], '2026-11-01');
  assert.equal(result.byDate.get('2026-10-31')?.length, 1); assert.equal(result.byDate.has('2026-11-01'), false);
});

test('actividad: mes vacío, año bisiesto y alineación del lunes sin inventar días', () => {
  const empty = buildGymActivityIndex([], '2026-10-29'); assert.equal(empty.weekDays, 0); assert.equal(empty.byDate.size, 0);
  const february = buildGymActivityMonth('2024-02'); const days = february.flat().filter(Boolean);
  assert.equal(days.length, 29); assert.equal(february[0][3], '2024-02-01'); assert.equal(february.at(-1)?.[3], '2024-02-29');
  assert.equal(buildGymActivityMonth('2026-02').flat().filter(Boolean).length, 28);
  assert.deepEqual(buildGymActivityMonth('2026-13'), []);
});

test('actividad: formatos heredados se leen con el criterio canónico, sin migrar ni alterar los registros', () => {
  const legacy: GymSession = { id: 'legacy', date: '2026-10-28', exercises: [{ name: 'Remo', weight: 20, reps: '3x8', sets: [] }] };
  const modern = migrateGym({ sessions: [legacy], routineTemplates: [] });
  const before = JSON.stringify(legacy);
  assert.equal(buildGymActivityIndex([legacy], '2026-10-29').weekDays, 1);
  assert.equal(buildGymActivityIndex(modern.sessions, '2026-10-29').weekDays, 1);
  assert.equal(JSON.stringify(legacy), before);
});

test('actividad: fechas ausentes, imposibles o con timestamp no reciben un día inferido; futuras no cuentan', () => {
  const data = ['', '2026-02-30', '2026-2-03', '2026-10-29T23:00:00-03:00', '2026-10-30'].map((date, n) => session(`${n}`, date));
  const before = JSON.stringify(data); const index = buildGymActivityIndex(data, '2026-10-29');
  assert.equal(index.invalidDateCount, 4); assert.equal(index.futureDateCount, 1); assert.equal(index.byDate.size, 0); assert.equal(JSON.stringify(data), before);
  assert.equal(isGymActivityDate('2024-02-29'), true); assert.equal(isGymActivityDate('2026-02-29'), false);
  assert.throws(() => buildGymActivityIndex([], 'bad'));
});

test('actividad: finalizar por el circuito vigente actualiza la vista, y un cierre sin trabajo no crea una marca', () => {
  const state = defaultState(); const active = { ...session('active'), status: 'active' as const }; state.gym.sessions = [active];
  assert.equal(buildGymActivityIndex(state.gym.sessions, '2026-10-29').weekDays, 0);
  assert.equal(finishGymSession(state.gym, 'active', { finishedAt: '19:00' }).status, 'completed');
  assert.equal(buildGymActivityIndex(state.gym.sessions, '2026-10-29').byDate.get('2026-10-29')?.[0].id, 'active');
  const empty = { ...session('empty'), status: 'active' as const, exercises: [] }; state.gym.sessions.push(empty);
  assert.equal(finishGymSession(state.gym, 'empty', { finishedAt: '19:01' }).status, 'no_completed_sets');
  assert.equal(buildGymActivityIndex(state.gym.sessions, '2026-10-29').weekDays, 1);
});

test('actividad: rutinas y descansos no crean asistencias ni alteran el algoritmo de continuidad', () => {
  const state = defaultState(); state.gym.sessions = ['2026-10-23', '2026-10-26', '2026-10-29'].map((date, n) => session(`${n}`, date));
  state.gym.restDays = ['2026-10-27', '2026-10-28'];
  state.gym.routineTemplates = [{ id: 'plan', name: 'Plan semanal', days: ['martes', 'miercoles', 'viernes'], exercises: state.gym.sessions[0].exercises }];
  const before = JSON.stringify(state); const index = buildGymActivityIndex(state.gym.sessions, '2026-10-29');
  assert.equal(index.weekDays, 2); assert.equal(index.byDate.has('2026-10-27'), false);
  const streak = calcGymStreakDetails(state, new Date('2026-10-29T12:00:00'));
  assert.equal(streak.streakDays, 3); assert.equal(streak.workoutCount, 3); assert.ok(streak.restDaysCount > 0);
  assert.equal(JSON.stringify(state), before);
});

test('actividad: teclado, navegación de meses, fechas antiguas y límites conservan fechas válidas', () => {
  assert.equal(gymActivityKeyboardDate('2027-01-01', 'Home'), '2026-12-28');
  assert.equal(gymActivityKeyboardDate('2027-01-01', 'End'), '2027-01-03');
  assert.equal(gymActivityKeyboardDate('2026-12-31', 'ArrowRight'), '2027-01-01');
  assert.equal(gymActivityKeyboardDate('2024-03-31', 'PageUp'), '2024-02-29');
  assert.equal(selectGymActivityMonth('2026-02', '2026-01-31'), '2026-02-28');
  assert.equal(shiftGymActivityMonth('0001-01', -1), null); assert.equal(shiftGymActivityMonth('9999-12', 1), null);
  assert.equal(gymActivityKeyboardDate('0001-01-01', 'Home'), '0001-01-01');
  assert.equal(gymActivityKeyboardDate('2026-10-29', 'Tab'), null);
});

test('actividad: historial extenso congelado se indexa sin mutaciones y conserva todas las sesiones', () => {
  const data = Array.from({ length: 10000 }, (_, n) => session(`old-${n}`, `2020-${String(n % 12 + 1).padStart(2, '0')}-${String(n % 28 + 1).padStart(2, '0')}`));
  data.forEach(s => { Object.freeze(s.exercises[0].sets[0]); Object.freeze(s.exercises[0].sets); Object.freeze(s.exercises[0]); Object.freeze(s.exercises); Object.freeze(s); }); Object.freeze(data);
  const index = buildGymActivityIndex(data, '2026-10-29');
  assert.equal([...index.byDate.values()].reduce((n, group) => n + group.length, 0), 10000);
  assert.equal(index.weekDays, 0);
});
