import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotasView } from '../components/NotasView';
import { defaultState } from './storage';

test('Notas limita el DOM inicial y conserva el contador del historial completo', () => {
  const state = defaultState();
  state.notes.postits = Array.from({ length: 500 }, (_, index) => ({ id: `note-${index}`, title: `Apunte ${index}`, text: 'Contenido', date: '2026-10-29' }));
  const render = (initialNoteId?: string) => renderToStaticMarkup(React.createElement(NotasView, { state, onUpdateState: () => true, storageUserId: null, onOpenGym: () => {}, initialNoteId }));
  const html = render();
  assert.equal((html.match(/aria-label="Abrir nota /g) || []).length, 50);
  assert.match(html.replace(/<[^>]+>/g, ''), /Mostrando 50 de 500 notas/);
  assert.match(html, /Cargar 50 más/);
  assert.match(html, /Ver todas/);
  // A direct link opens a note outside the first batch without altering its data.
  const original = structuredClone(state);
  assert.match(render('note-499'), /value="Apunte 499"/);
  assert.deepEqual(state, original);
});
