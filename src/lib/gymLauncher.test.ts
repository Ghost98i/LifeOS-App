import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DayKey, RoutineTemplate } from '../types';
import { getGymLauncherPlan } from './gymLauncher';
import { defaultState, todayISO } from './storage';
import { getActiveGymSession, startGymSession } from './gymFlows';
import { buildGymActivityIndex } from './gymActivityCalendar';
import { calcGymStreakDetails } from './calculations';
import { GimnasioView } from '../components/GimnasioView';

function routine(id = 'pecho', days: DayKey[] = ['viernes']): RoutineTemplate {
  return { id, name: id === 'pecho' ? 'Pecho' : 'Espalda', days, exercises: [{ id: 'press', name: 'Press banca', sets: [{ id: 'target', weight: 40, reps: 8, completed: false }] }] };
}

const week: DayKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
for (const [offset, day] of week.entries()) {
  const date = `2026-${offset < 6 ? '10' : '11'}-${offset < 6 ? 26 + offset : '01'}`;
  test(`lanzador: ${day}, rutina única preparada sin modificar la planificación`, () => {
    const data = [routine('pecho', [day]), routine('espalda', [])]; const before = JSON.stringify(data);
    const result = getGymLauncherPlan(data, date, false);
    assert.equal(result.day, day); assert.equal(result.templateId, 'pecho'); assert.equal(result.canStart, true); assert.equal(result.manual, false);
    assert.equal(JSON.stringify(data), before);
  });
  test(`lanzador: ${day} sin rutina ofrece libre; nunca presupone descanso`, () => {
    const result = getGymLauncherPlan([routine('pecho', [])], date, false);
    assert.equal(result.templateId, ''); assert.equal(result.explicitRest, false); assert.equal(result.canStart, true);
  });
}

test('lanzador: dos rutinas para hoy requieren elección y no dependen del orden', () => {
  const data = [routine(), routine('espalda', ['viernes'])];
  for (const routines of [data, [...data].reverse()]) {
    const result = getGymLauncherPlan(routines, '2026-10-30', false);
    assert.equal(result.templateId, null); assert.equal(result.canStart, false); assert.equal(result.applicable.length, 2);
  }
});

test('lanzador: descanso explícito permite libre; conflicto con rutina exige una decisión', () => {
  const rest = getGymLauncherPlan([routine('pecho', [])], '2026-10-30', true);
  assert.equal(rest.explicitRest, true); assert.equal(rest.conflict, false); assert.equal(rest.templateId, ''); assert.equal(rest.canStart, true);
  const conflict = getGymLauncherPlan([routine()], '2026-10-30', true);
  assert.equal(conflict.conflict, true); assert.equal(conflict.templateId, null); assert.equal(conflict.canStart, false);
  assert.equal(getGymLauncherPlan([routine()], '2026-10-30', true, { date: '2026-10-30', templateId: 'pecho' }).canStart, true);
});

test('lanzador: la elección manual libre u otra rutina prevalece en rerenders, cambios de plan y descanso', () => {
  for (const templateId of ['', 'espalda']) {
    const choice = { date: '2026-10-30', templateId };
    for (const rest of [false, true]) {
      const result = getGymLauncherPlan([routine(), routine('espalda', [])], '2026-10-30', rest, choice);
      assert.equal(result.templateId, templateId); assert.equal(result.manual, true);
    }
  }
});

test('lanzador: el día local nuevo recibe su propio predeterminado, sin borrar la elección anterior', () => {
  const choice = { date: '2026-10-30', templateId: '' };
  const routines = [routine(), routine('espalda', ['sabado'])];
  assert.equal(getGymLauncherPlan(routines, '2026-10-31', false, choice).templateId, 'espalda');
  assert.equal(choice.date, '2026-10-30'); assert.equal(choice.templateId, '');
});

test('lanzador: elección eliminada y rutina vacía nunca inician libre por accidente', () => {
  const removed = getGymLauncherPlan([routine()], '2026-10-30', false, { date: '2026-10-30', templateId: 'removed' });
  assert.equal(removed.templateId, null); assert.equal(removed.unavailableChoice, true); assert.equal(removed.canStart, false);
  const empty = { ...routine(), exercises: [] };
  assert.equal(getGymLauncherPlan([empty], '2026-10-30', false).canStart, false);
  assert.equal(getGymLauncherPlan([empty, routine('espalda', ['viernes'])], '2026-10-30', false).templateId, null);
});

test('lanzador: la rutina preparada inicia por el circuito real; una sesión activa se conserva íntegra', () => {
  const state = defaultState(); state.gym.routineTemplates = [routine()];
  const plan = getGymLauncherPlan(state.gym.routineTemplates, '2026-10-30', false);
  const started = startGymSession(state.gym, { templateId: plan.templateId || undefined, date: '2026-10-30', startedAt: '18:00', sessionId: 'new' });
  assert.equal(started.created, true); assert.equal(started.session.weekLabel, 'Pecho'); assert.equal(started.session.exercises.length, 1);
  const before = JSON.stringify(state.gym); const resumed = startGymSession(state.gym, { date: '2026-10-31', startedAt: '07:00' });
  assert.equal(resumed.created, false); assert.equal(getActiveGymSession(state.gym)?.id, 'new'); assert.equal(JSON.stringify(state.gym), before);
});

test('lanzador: render inicial prepara la rutina y no escribe ni altera calendario, historial o racha', () => {
  const state = defaultState(); const today = todayISO();
  state.gym.routineTemplates = [routine('pecho', week)];
  state.gym.sessions = [{ id: 'old', date: '2024-01-31', status: 'completed', exercises: [{ name: 'Remo', sets: [{ id: 'set', weight: 20, reps: 8, completed: true }] }] }];
  const before = JSON.stringify(state); const calendar = buildGymActivityIndex(state.gym.sessions, today); const streak = calcGymStreakDetails(state);
  let writes = 0;
  const html = renderToStaticMarkup(React.createElement(GimnasioView, { state, storageUserId: null, onOpenNote: () => undefined, onUpdateState: () => { writes++; return true; } }));
  assert.match(html, /value="routine:pecho" selected=""/); assert.match(html, /Iniciar Pecho/);
  assert.match(html, /optgroup label="Rutinas de hoy"/);
  assert.doesNotMatch(html, /Entrenamiento en blanco|Usar esta rutina|>Descanso hoy</);
  assert.match(html, /Marcar descanso para hoy/); assert.equal(writes, 0); assert.equal(JSON.stringify(state), before);
  assert.deepEqual(buildGymActivityIndex(state.gym.sessions, today), calendar); assert.deepEqual(calcGymStreakDetails(state), streak);
});
