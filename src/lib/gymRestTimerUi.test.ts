import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GymRestOverlay } from '../components/GymRestOverlay';
import { GymRestTimerBar } from '../components/GymRestTimerBar';
import { defaultState } from './storage';

function timerState(showQuickRestAdjustments: boolean, allowManualRestEditing: boolean) {
  const state = defaultState();
  state.gym.settings = {
    ...state.gym.settings,
    showQuickRestAdjustments,
    allowManualRestEditing,
  };
  state.gym.activeTimer = {
    endsAt: Date.now() + 60000,
    durationSeconds: 60,
    sessionId: 'qa-session',
    kind: 'set',
  };
  return state;
}

const updateState = () => undefined;

test('Gym 3.1 UI: los ajustes rápidos ocupan espacio sólo cuando la preferencia está activa', () => {
  const hidden = renderToStaticMarkup(React.createElement(GymRestTimerBar, {
    state: timerState(false, false),
    onUpdateState: updateState,
  }));
  assert.doesNotMatch(hidden, /−30 s/);
  assert.doesNotMatch(hidden, /\+30 s/);
  assert.doesNotMatch(hidden, /Editar tiempo/);
  assert.match(hidden, /Saltar descanso/);

  const visible = renderToStaticMarkup(React.createElement(GymRestTimerBar, {
    state: timerState(true, false),
    onUpdateState: updateState,
  }));
  assert.match(visible, /−30 s/);
  assert.match(visible, /\+30 s/);
});

test('Gym 3.1 UI: edición manual es independiente de los ajustes rápidos', () => {
  const markup = renderToStaticMarkup(React.createElement(GymRestTimerBar, {
    state: timerState(false, true),
    onUpdateState: updateState,
  }));
  assert.doesNotMatch(markup, /−30 s/);
  assert.match(markup, /Editar tiempo/);
});

test('Gym 3.1 UI: el mini temporizador de otros módulos conserva tiempo y salto sin forzar ajustes', () => {
  const markup = renderToStaticMarkup(React.createElement(GymRestOverlay, {
    state: timerState(false, false),
    onUpdateState: updateState,
    onOpenGym: () => undefined,
  }));
  assert.match(markup, /Temporizador de descanso en segundo plano/);
  assert.match(markup, /Descanso series/);
  assert.match(markup, /Saltar/);
  assert.doesNotMatch(markup, /−30s/);
  assert.doesNotMatch(markup, /\+30s/);
});

test('El descanso pausado permanece visible fuera de Gimnasio aunque su vencimiento original haya pasado', () => {
  const state = timerState(false, false);
  state.gym.activeTimer!.endsAt = Date.now() - 60000;
  state.gym.activeTimer!.pausedAt = Date.now() - 90000;
  state.gym.activeTimer!.remainingSecondsWhenPaused = 37;
  const markup = renderToStaticMarkup(React.createElement(GymRestOverlay, { state, onUpdateState: updateState, onOpenGym: () => {} }));
  assert.match(markup, /00:37/);
  assert.match(markup, /En pausa/);
  assert.match(markup, /Reanudar descanso/);
});
