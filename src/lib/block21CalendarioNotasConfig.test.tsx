import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { CalendarioView } from '../components/CalendarioView';
import { NotasView } from '../components/NotasView';
import { ConfigView } from '../components/ConfigView';
import { PrivacySecuritySection } from '../components/PrivacySecuritySection';

const noopUpdate = () => true;

test('Bloque 21.1: CalendarioView elimina azul residual, checkboxes nativos, flechas ASCII y unifica acciones + layout', () => {
  const src = fs.readFileSync(path.resolve('src/components/CalendarioView.tsx'), 'utf8');
  assert.doesNotMatch(src, /var\(--blue/, 'CalendarioView no debe usar var(--blue)');
  assert.doesNotMatch(src, /type="checkbox"/, 'CalendarioView no debe usar checkbox nativo crudo');
  assert.doesNotMatch(src, /Ir a Finanzas →/, 'Sin flecha ASCII en botones de Calendario');
  assert.match(src, /CelestianSwitch/, 'Usa CelestianSwitch en índigo para recurrencia anual');

  const emptyState = defaultState();
  emptyState.calendarEvents = [];
  emptyState.finance.commitments = [];
  emptyState.finance.expectedIncomes = [];
  emptyState.study.exams = [];
  emptyState.todayExtras = [];

  const emptyHtml = renderToStaticMarkup(
    <CalendarioView state={emptyState} onUpdateState={noopUpdate} />
  );
  assert.doesNotMatch(emptyHtml, /title="Agregar acontecimiento en esta fecha"/, 'No duplica botón + Agregar en estado vacío del panel derecho');
  assert.match(emptyHtml, /Agregar acontecimiento aquí/);
  assert.match(emptyHtml, /sm:text-left/, 'Encabezados de semana alineados con las celdas en Desktop');
  assert.match(emptyHtml, /xl:min-h-\[90px\]/, 'Celdas compactas en Desktop para evitar corte vertical en meses de 6 filas');

  const today = todayISO();
  const populated = defaultState();
  populated.calendarEvents = [
    { id: 'ev-1', name: 'Cumpleaños de Lucas', date: today, type: 'cumpleanos', recurring: true },
  ];
  const populatedHtml = renderToStaticMarkup(
    <CalendarioView state={populated} onUpdateState={noopUpdate} />
  );
  assert.match(populatedHtml, /title="Agregar acontecimiento en esta fecha"/, 'Muestra + Agregar en el header cuando el día ya tiene ítems');
  assert.match(populatedHtml, /Próximos acontecimientos/);
  // En Próximos acontecimientos debe haber botones Editar (edit) y Eliminar (trash)
  const upcomingSection = populatedHtml.slice(populatedHtml.indexOf('Próximos acontecimientos'));
  assert.match(upcomingSection, /aria-label="Editar Cumpleaños de Lucas"/);
  assert.match(upcomingSection, /aria-label="Eliminar Cumpleaños de Lucas"/);
  assert.match(upcomingSection, /data-app-icon="edit"/);
  assert.match(upcomingSection, /data-app-icon="trash"/);
});

test('Bloque 21.2: NotasView elimina checkboxes nativos, usa pastilla activa #4F46E5 y acciones unificadas Pencil/Trash2', () => {
  const src = fs.readFileSync(path.resolve('src/components/NotasView.tsx'), 'utf8');
  assert.doesNotMatch(src, /type="checkbox"/, 'NotasView no debe usar checkboxes nativos crudos');
  assert.match(src, /CelestianSwitch/, 'NotasView usa CelestianSwitch en índigo');

  const state = defaultState();
  state.notes.postits = [
    { id: 'note-1', title: 'Hoja de ruta', text: 'Revisar entregables', date: todayISO(), pinned: true, tags: ['producto'] },
  ];
  const html = renderToStaticMarkup(
    <NotasView state={state} onUpdateState={noopUpdate} storageUserId={null} onOpenGym={() => {}} />
  );

  // Segmented control de filtros y secciones con pastilla activa #4F46E5 text-white y foco limpio
  assert.match(html, /outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70[^"]*bg-\[#4F46E5\] text-white/);
  // Acciones unificadas Pencil y Trash2 con aria-label y title en la card de nota
  assert.match(html, /aria-label="Editar nota Hoja de ruta"[^>]*title="Editar nota"/);
  assert.match(html, /aria-label="Eliminar nota Hoja de ruta"[^>]*title="Eliminar nota"/);
  // Input limpio sin doble borde
  assert.match(html, /celestian-clean-field/);
});

test('Bloque 21.3: ConfigView usa tabs con pastilla activa #4F46E5, switches role="switch" en índigo y sin flechas ASCII', () => {
  const state = defaultState();

  const accountHtml = renderToStaticMarkup(
    <ConfigView state={state} onUpdateState={noopUpdate} onExportJSON={() => {}} />
  );
  assert.match(
    accountHtml,
    /role="tab"[^>]*aria-selected="true"[^>]*class="[^"]*outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70[^"]*bg-\[#4F46E5\] font-semibold text-white/
  );
  assert.doesNotMatch(accountHtml, /→/, 'Sin flechas ASCII residuales en Configuración / Privacidad');

  const prefsHtml = renderToStaticMarkup(
    <ConfigView state={state} onUpdateState={noopUpdate} onExportJSON={() => {}} initialTab="preferencias" />
  );
  assert.match(prefsHtml, /role="switch"[^>]*aria-checked="true"/, 'Módulos visibles usa switches role="switch"');
  assert.match(prefsHtml, /bg-\[#4F46E5\]/, 'Switches activos en índigo Celestian');
  assert.doesNotMatch(prefsHtml, /type="checkbox"/, 'Sin checkboxes nativos crudos en Preferencias');
  assert.match(prefsHtml, /celestian-clean-field/, 'Inputs de perfil usan tratamiento de foco único sin doble borde');

  const privacyHtml = renderToStaticMarkup(
    <PrivacySecuritySection state={state} storageUserId={null} cloudConnected={false} />
  );
  assert.doesNotMatch(privacyHtml, /→/, 'Sin flecha ASCII en enlace de eliminación pública');

  const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(css, /\.celestian-clean-field:focus-visible[\s\S]*?outline:\s*none !important;/);
});
