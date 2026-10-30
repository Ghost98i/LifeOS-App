import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GimnasioView } from '../components/GimnasioView';
import type { GymSession } from '../types';
import { buildGymSessionPresentation, dedupeVisibleGymRecords, formatGymSessionDateTime, getGymCalendarOverview, getPreviousSessionBestLabel } from './gymIdlePresentation';
import { defaultState, todayISO } from './storage';

const session: GymSession = {
  id: 'latest',
  date: '2026-10-08',
  weekLabel: 'Torso',
  status: 'completed',
  startedAt: '18:00',
  finishedAt: '18:48',
  exercises: [
    {
      name: 'Press banca',
      sets: [
        { id: 'a', weight: 60, reps: 10, completed: true },
        { id: 'b', weight: 70, reps: 8, completed: true },
      ],
    },
    {
      name: 'Remo',
      sets: [
        { id: 'c', weight: 50, reps: 10, completed: true },
        { id: 'd', weight: 55, reps: 8, completed: false },
      ],
    },
  ],
};

test('resume una sesión completada con métricas de trabajo real', () => {
  const result = buildGymSessionPresentation(session, [session]);

  assert.equal(result.name, 'Torso');
  assert.equal(result.exerciseCount, 2);
  assert.equal(result.completedSetCount, 3);
  assert.equal(result.totalSetCount, 4);
  assert.equal(result.volumeKg, 1660);
  assert.equal(result.durationLabel, '48 min');
  assert.deepEqual(result.bestSet, { exerciseName: 'Press banca', weight: 70, reps: 8 });
  assert.equal(result.prExerciseCount, 2);
});

test('sólo marca PR si la sesión conserva un récord real frente al historial', () => {
  const strongerSession: GymSession = {
    ...session,
    id: 'stronger',
    date: '2026-10-09',
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, weight: Number(set.weight) + 20 })),
    })),
  };

  assert.equal(buildGymSessionPresentation(session, [session, strongerSession]).prExerciseCount, 0);
});

test('la mejor serie anterior usa el máximo efectivo, no la sugerencia inicial', () => {
  assert.equal(getPreviousSessionBestLabel([session], 'current', 'Press banca'), '70 kg × 8');
});

test('los récords visualmente idénticos se muestran una sola vez aunque tengan IDs distintos', () => {
  const records = [
    { id: 'a', name: 'Press banca plano', weight: 80, reps: 7 },
    { id: 'b', name: 'Press banca plano', weight: 80, reps: 7 },
    { id: 'c', name: 'Press banca plano', weight: 85, reps: 5 },
  ];
  assert.deepEqual(dedupeVisibleGymRecords(records).map((record) => record.id), ['a', 'c']);
  assert.equal(records.length, 3);
});

test('cuenta sesiones realizadas por semana y mes calendario y muestra la hora registrada', () => {
  const older = { ...session, id: 'older', date: '2026-09-30' };
  const monday = { ...session, id: 'monday', date: '2026-10-19', startedAt: '07:30' };
  const recent = { ...session, id: 'recent', date: '2026-10-24', startedAt: '18:00' };
  const active = { ...session, id: 'active', date: '2026-10-24', status: 'active' as const };
  const overview = getGymCalendarOverview([older, monday, recent, active], '2026-10-24');
  assert.equal(overview.weekCount, 2);
  assert.equal(overview.monthCount, 2);
  assert.equal(overview.latest?.id, 'recent');
  assert.match(formatGymSessionDateTime(recent), /24 de octubre de 2026 · 18:00/);
  assert.doesNotMatch(formatGymSessionDateTime({ ...recent, startedAt: 'Cerrada', finishedAt: null }), /Cerrada/);
});

test('el idle completado prioriza lectura y mantiene un único CTA de inicio', () => {
  const state = defaultState();
  state.gym.sessions = [{ ...session, date: todayISO() }];
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, { state, onUpdateState: () => undefined })
  );

  assert.match(html, /data-gym-today-status/);
  assert.match(html, /Secciones de Gimnasio/);
  assert.match(html, /Rutinas/);
  assert.match(html, /Sesión de hoy completada/);
  assert.match(html, /Volumen total/);
  assert.match(html, /Mejores marcas/);
  assert.doesNotMatch(html, /data-gym-routines/);
  assert.doesNotMatch(html, /data-latest-session-summary/);
  assert.doesNotMatch(html, /data-latest-session-detail/);
  assert.doesNotMatch(html, /data-historical-session-editor/);
  assert.doesNotMatch(html, /data-workout-session-card/);
  assert.equal((html.match(/Iniciar otro entrenamiento/g) || []).length, 1);
});

test('el historial cerrado reutiliza el resumen de lectura y no expone el editor', () => {
  const state = defaultState();
  state.gym.sessions = [session];
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => undefined,
      initialTab: 'historial',
    })
  );

  assert.match(html, /data-history-session-summary/);
  assert.match(html, /Series realizadas/);
  assert.match(html, /Mejor serie/);
  assert.match(html, /Volumen/);
  assert.match(html, /Cargar una sesión pasada/);
  assert.doesNotMatch(html, /data-workout-session-card/);
  assert.doesNotMatch(html, /data-historical-session-editor/);
});

test('progreso prioriza frecuencia y el nuevo motor omite gráficos con pocos datos', () => {
  const state = defaultState();
  state.gym.sessions = [{ ...session, date: todayISO() }];
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => undefined,
      initialTab: 'progresion',
    })
  );

  assert.match(html, /data-gym-progress-overview/);
  assert.match(html, /Entrenamientos esta semana/);
  assert.match(html, /Última ejecución/);
  assert.match(html, /Mejor serie/);
  assert.ok(html.indexOf('Mejor serie') < html.indexOf('Última ejecución'));
  assert.match(html, /data-gym-progress-low-data/);
  assert.doesNotMatch(html, /Días en el año/);
});

test('rutinas presenta inicio como acción principal y editor explícito', () => {
  const state = defaultState();
  state.gym.routineTemplates = [{
    id: 'torso',
    name: 'Torso A',
    days: ['lunes', 'jueves'],
    exercises: [{
      id: 'press',
      name: 'Press banca',
      muscleGroup: 'Pecho',
      equipment: 'barra',
      restSeconds: 120,
      sets: [{ id: 'set', weight: 70, reps: 8, completed: false }],
    }],
  }];
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => undefined,
      initialEditingTemplateId: 'torso',
    })
  );

  assert.match(html, /data-gym-routines/);
  assert.match(html, /data-gym-routine-editor/);
  assert.match(html, /Planes guardados · las sesiones ejecutadas están en Historial/);
  assert.match(html, /Ejercicios y objetivos/);
  assert.match(html, /1 series · 8 reps · 70 kg/);
  assert.match(html, />Iniciar</);
  assert.match(html, /Objetivo \(kg\)/);
  assert.match(html, /Descanso \(s\)/);
  assert.match(html, /Más acciones para Torso A/);
});

test('una rutina sin ejercicios queda identificada y no ofrece inicio directo', () => {
  const state = defaultState();
  state.gym.routineTemplates = [{ id: 'brazos', name: 'Brazos', exercises: [] }];
  let writes = 0;
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => { writes++; return true; },
      initialTab: 'rutinas',
    })
  );
  const trainingHtml = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => { writes++; return true; },
      initialTab: 'entrenar',
    })
  );
  assert.match(html, /Sin ejercicios · Editá para empezar/);
  assert.match(trainingHtml, /<option[^>]*disabled=""[^>]*>Brazos · sin ejercicios<\/option>/);
  assert.doesNotMatch(html, />Iniciar<\/button>/);
  assert.equal(writes, 0);
});
