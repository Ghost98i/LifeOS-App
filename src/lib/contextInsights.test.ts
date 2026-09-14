import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { sleepSummary } from './contextInsights';

test('detecta tres noches cortas consecutivas y calcula el promedio semanal', () => {
  const state = defaultState();
  state.dailyContext = [
    { date: '2026-08-07', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-08-08', sleepHours: 6, energy: 2, mood: null, connection: null },
    { date: '2026-08-09', sleepHours: 6.5, energy: 2, mood: null, connection: null },
    { date: '2026-08-10', sleepHours: 5.5, energy: 1, mood: null, connection: null },
  ];

  const summary = sleepSummary(state, '2026-08-10');
  assert.equal(summary.currentShortStreak, 3);
  assert.equal(summary.shouldAlert, true);
  assert.equal(summary.recordedNights, 4);
  assert.equal(summary.shortNights, 3);
  assert.equal(summary.averageHours, 6.5);
});

test('una noche suficiente corta la alerta y un día sin datos corta la racha', () => {
  const state = defaultState();
  state.dailyContext = [
    { date: '2026-08-07', sleepHours: 5, energy: null, mood: null, connection: null },
    { date: '2026-08-08', sleepHours: 5, energy: null, mood: null, connection: null },
    { date: '2026-08-10', sleepHours: 5, energy: null, mood: null, connection: null },
  ];
  assert.equal(sleepSummary(state, '2026-08-10').currentShortStreak, 1);

  state.dailyContext.push({ date: '2026-08-11', sleepHours: 7, energy: null, mood: null, connection: null });
  assert.equal(sleepSummary(state, '2026-08-11').currentShortStreak, 0);
});
