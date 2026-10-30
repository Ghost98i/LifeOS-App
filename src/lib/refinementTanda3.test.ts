import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from './storage';
import { IAView } from '../components/IAView';
import { NotasView } from '../components/NotasView';
import { EstudiosView } from '../components/EstudiosView';

test('external research is honest and unsafe opportunity URLs never become executable links', () => {
  const state = defaultState();
  state.jobs.opportunities = [{ id: 'unsafe', empresa: '<script>test()</script>', puesto: 'Soporte', link: 'javascript:window.pwned=true', rating: 3, fecha: '2026-10-29', status: 'nueva' }];
  state.resale.opportunities = [{ id: 'buy', item: 'Equipo', buyPrice: 100, marketPrice: 180, fecha: '2026-10-29', status: 'nueva' }];
  const original = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(IAView, { state, onUpdateState: () => { throw Error('Unauthorized write'); } }));
  assert.match(html, /Celestian no le envía tus datos/);
  assert.match(html, /Revisar resultados/);
  assert.match(html, /Crear postulación/);
  assert.match(html.replace(/<[^>]+>/g, ''), /Prioridad: 5\/5/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /<script>/);
  assert.deepEqual(state, original);
});

test('notes retain progressive rendering and historical data while tools get peer navigation', () => {
  const state = defaultState(); const original = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(NotasView, { state, onUpdateState: () => true, storageUserId: null, onOpenGym: () => {}, initialTab: 'proyectos' }));
  assert.match(html, /aria-label="Herramientas personales"/);
  for (const label of ['Streaming y contenido', 'Objetos y regalos', 'Lista de compras', 'Enlaces', 'Objetivos · avance numérico']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Metas Cuantificables/);
  assert.deepEqual(state, original);
});

test('study audio stays opt-in on rendering and never edits academic history', () => {
  const state = defaultState(); const original = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(EstudiosView, { state, onUpdateState: () => { throw Error('Unexpected study write'); } }));
  assert.match(html, /Sonidos de concentración/);
  assert.match(html, /Reproducir/);
  assert.match(html, /En pausa/);
  assert.deepEqual(state, original);
});
