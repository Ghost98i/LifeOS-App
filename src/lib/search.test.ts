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
