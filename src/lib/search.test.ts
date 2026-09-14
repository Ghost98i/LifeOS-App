import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, uid } from './storage';
import { searchLifeOS } from './search';

test('el buscador encuentra datos de módulos diferentes', () => {
  const state = defaultState();
  state.notes.postits.push({ id: uid(), text: 'Comprar cable HDMI', date: '2026-08-10' });
  state.jobs.applications.push({ id: uid(), empresa: 'Empresa de prueba', puesto: 'Soporte', estado: 'pendiente', fecha: '2026-08-10' });
  assert.equal(searchLifeOS(state, 'HDMI')[0].view, 'notas');
  assert.equal(searchLifeOS(state, 'Empresa de prueba')[0].view, 'trabajo');
});

test('el buscador ignora tildes y cubre agenda, rutinas y suscripciones', () => {
  const state = defaultState();
  state.agenda.lunes.push({ id: uid(), time: '09:00', activity: 'Médico' });
  state.tasksRecurring.push({ id: uid(), name: 'Meditación', freq: 'daily' });
  state.finance.subscriptions.push({ id: uid(), name: 'Música Premium', amount: 10 });
  assert.equal(searchLifeOS(state, 'medico')[0].view, 'agenda');
  assert.equal(searchLifeOS(state, 'meditacion')[0].view, 'agenda');
  assert.equal(searchLifeOS(state, 'musica premium')[0].view, 'finanzas');
});
