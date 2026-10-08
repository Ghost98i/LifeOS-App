import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GimnasioView } from '../components/GimnasioView';
import { defaultState } from './storage';

function renderActiveGym() {
  const state = defaultState();
  state.gym.sessions = [
    {
      id: 'previous-session',
      date: '2026-10-01',
      status: 'completed',
      exercises: [
        {
          id: 'bench',
          name: 'Press banca plano',
          equipment: 'barra',
          barWeight: 20,
          sets: [
            { id: 'previous-set-1', weight: 70, reps: 8, completed: true },
            { id: 'previous-set-2', weight: 72.5, reps: 6, completed: true },
          ],
        },
      ],
    },
    {
      id: 'active-session',
      date: '2026-10-08',
      weekLabel: 'Torso',
      status: 'active',
      startedAt: '18:30',
      exercises: [
        {
          id: 'bench',
          name: 'Press banca plano',
          equipment: 'barra',
          barWeight: 20,
          sets: [
            { id: 'active-set-1', weight: 70, reps: 8, completed: false },
            { id: 'active-set-2', weight: 70, reps: 8, completed: false },
          ],
        },
        {
          id: 'active-row',
          name: 'Remo con barra',
          equipment: 'barra',
          barWeight: 20,
          sets: [{ id: 'active-row-set-1', weight: 60, reps: 10, completed: false }],
        },
      ],
    },
  ];

  return renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => undefined,
    })
  );
}

function renderEmptyActiveGym() {
  const state = defaultState();
  state.gym.sessions = [
    {
      id: 'empty-active-session',
      date: '2026-10-08',
      status: 'active',
      exercises: [],
    },
  ];

  return renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state,
      onUpdateState: () => undefined,
    })
  );
}

test('la sesión activa usa un único workspace operativo y una única acción de finalizar', () => {
  const html = renderActiveGym();

  assert.match(html, /data-active-workout-view/);
  assert.match(html, /data-active-set-editor/);
  assert.doesNotMatch(html, /data-workout-session-card/);
  assert.equal((html.match(/Finalizar sesión/g) || []).length, 1);
  assert.equal((html.match(/Completar serie/g) || []).length, 1);
});

test('la referencia primaria distingue la última ejecución de la mejor serie', () => {
  const html = renderActiveGym();

  assert.match(html, /Última vez · serie 1/);
  assert.match(html, /Mejor serie de esa sesión/);
  assert.match(html, /Después: Remo con barra/);
});

test('una sesión vacía permite agregar el primer ejercicio sin montar el editor anterior', () => {
  const html = renderEmptyActiveGym();

  assert.match(html, /Sesión sin ejercicios/);
  assert.match(html, /Nombre del primer ejercicio/);
  assert.match(html, /Agregar ejercicio/);
  assert.doesNotMatch(html, /data-workout-session-card/);
  assert.equal((html.match(/Finalizar sesión/g) || []).length, 1);
});

test('los controles de la sesión activa mantienen targets de al menos 44 px', () => {
  const html = renderActiveGym();
  const controls = html.match(/<(?:button|input|select|summary)\b[^>]*>/g) || [];

  assert.ok(controls.length > 0);
  for (const control of controls) {
    assert.match(control, /class="[^"]*(?:h-11|min-h-11|h-12|min-h-12|min-h-14)[^"]*"/);
  }
});
