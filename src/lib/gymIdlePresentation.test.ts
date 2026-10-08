import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GimnasioView } from '../components/GimnasioView';
import type { GymSession } from '../types';
import { buildGymSessionPresentation } from './gymIdlePresentation';
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

test('el idle completado prioriza lectura y mantiene un único CTA de inicio', () => {
  const state = defaultState();
  state.gym.sessions = [{ ...session, date: todayISO() }];
  const html = renderToStaticMarkup(
    React.createElement(GimnasioView, { state, onUpdateState: () => undefined })
  );

  assert.match(html, /data-gym-today-status/);
  assert.match(html, /data-latest-session-summary/);
  assert.match(html, /Sesión de hoy completada/);
  assert.match(html, /Volumen total/);
  assert.match(html, /Mejores marcas/);
  assert.match(html, /Ver detalle/);
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
  assert.match(html, /Frecuencia reciente/);
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
  assert.match(html, /Tu biblioteca/);
  assert.match(html, />Iniciar</);
  assert.match(html, /Objetivo \(kg\)/);
  assert.match(html, /Descanso \(s\)/);
  assert.match(html, /Más acciones para Torso A/);
});
