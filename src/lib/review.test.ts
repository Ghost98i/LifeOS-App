import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, uid } from './storage';
import { weeklyReviewExceptions } from './review';

test('la revisión semanal muestra excepciones y omite actividad normal', () => {
  const state = defaultState();
  state.settings.lastBackupAt = '2026-08-10';
  state.finance.accounts.forEach((account) => { account.lastReconciledAt = '2026-08-10'; });
  state.jobs.applications.push({
    id: uid(), empresa: 'Empresa', puesto: 'Soporte', estado: 'pendiente', fecha: '2026-08-01',
    nextAction: 'Escribir', nextActionDate: '2020-01-01',
  });
  const results = weeklyReviewExceptions(state);
  assert.ok(results.some((item) => item.id === 'job-followups'));
  assert.ok(!results.some((item) => item.id === 'old-stock'));
});

test('la revisión avisa al acumular tres noches cortas consecutivas', () => {
  const state = defaultState();
  const reference = new Date();
  state.dailyContext = [2, 1, 0].map((daysAgo) => {
    const date = new Date(reference);
    date.setDate(date.getDate() - daysAgo);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date: iso, sleepHours: 6, energy: null, mood: null, connection: null };
  });

  const results = weeklyReviewExceptions(state);
  assert.ok(results.some((item) => item.id === 'short-sleep-streak'));
});
