import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayKeyFromDate, defaultState, todayISO } from './storage';
import { AgendaView } from '../components/AgendaView';

const noopUpdate = () => true;

test('Bloque 19: Tabs segmentados índigo Celestian con foco limpio, puntito de hoy índigo y cero azules residuales (claro y oscuro)', () => {
  for (const darkMode of [false, true]) {
    const state = defaultState();
    state.settings.darkMode = darkMode;
    const html = renderToStaticMarkup(
      <AgendaView state={state} onUpdateState={noopUpdate} />
    );

    assert.match(html, /role="tablist"[^>]*aria-label="Secciones de Agenda"/);
    assert.match(
      html,
      /role="tab"[^>]*aria-selected="true"[^>]*class="[^"]*outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70[^"]*bg-\[#4F46E5\] text-white/
    );
    assert.match(html, /role="tab"[^>]*aria-selected="false"/);
    assert.doesNotMatch(html, /border-b-2[^>]*border-\[#4F46E5\]/, 'No debe usar pestañas legacy con subrayado inferior');

    assert.match(html, /data-today-dot="true"[^>]*bg-\[#4F46E5\] dark:bg-\[#818CF8\]/);
    assert.doesNotMatch(html, /\b(?:bg|text|border|ring|accent)-(?:blue|sky|cyan)-/);
    assert.doesNotMatch(html, /var\(--blue/);
  }
});

test('Bloque 19: Elimina etiquetas repetitivas Actividad semanal y Rutina en filas diarias, muestra chip Puntual y mantiene CompletionCheck', () => {
  const today = todayISO();
  const todayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));
  const state = defaultState();
  state.agenda = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
  state.agenda[todayKey] = [
    { id: 'blk-home', time: '09:00', activity: 'Tareas del hogar', effort: 'medium' },
  ];
  state.tasksRecurring = [
    { id: 'rut-1', name: 'Estirar 10 min', freq: 'daily', effort: 'low' },
  ];
  state.calendarEvents = [
    { id: 'evt-dentist', name: 'Dentista', date: today, time: '16:30', type: 'otro', recurring: false },
  ];

  const html = renderToStaticMarkup(
    <AgendaView state={state} onUpdateState={noopUpdate} />
  );

  // Extract individual row snippets
  const blockStart = html.indexOf('id="agenda-block-blk-home"');
  const eventStart = html.indexOf('id="agenda-event-evt-dentist"');
  const routineStart = html.indexOf('id="agenda-routine-rut-1"');
  assert.ok(blockStart > 0 && eventStart > 0 && routineStart > 0, 'Debe renderizar bloque, compromiso puntual y rutina');

  const blockRow = html.slice(blockStart, eventStart);
  assert.doesNotMatch(blockRow, /Actividad semanal/, 'No debe repetir la etiqueta Actividad semanal en cada fila');
  assert.match(blockRow, /data-completion-check="true" data-size="md"/, 'Mantiene CompletionCheck unificado');

  const eventRow = html.slice(eventStart, routineStart);
  assert.match(eventRow, />Puntual<\/span>/, 'Debe distinguir compromisos puntuales con un chip sutil');
  assert.doesNotMatch(eventRow, /Evento puntual · informativo/);

  const routineRow = html.slice(routineStart);
  assert.doesNotMatch(routineRow, />Rutina<\/span>/, 'No debe repetir la etiqueta Rutina en cada fila');
  assert.match(routineRow, /data-completion-check="true" data-size="md"/, 'Mantiene CompletionCheck en rutinas del día');
});

test('Bloque 19: Semana (7 días) oculta la tira superior de 7 días y usa bloques legibles con line-clamp-2 sin ruido', () => {
  const today = todayISO();
  const todayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));
  const state = defaultState();
  state.agenda = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
  state.agenda[todayKey] = [
    { id: 'blk-1', time: '10:00', activity: 'Tareas del hogar', effort: 'medium' },
    { id: 'blk-2', time: '18:00', activity: 'Planificación semanal', effort: 'medium' },
  ];
  state.tasksRecurring = [];
  state.calendarEvents = [];

  // En Vista diaria sí muestra la tira superior de 7 días
  const dailyHtml = renderToStaticMarkup(
    <AgendaView state={state} onUpdateState={noopUpdate} initialWeekViewMode="focused" initialWideWeekView={true} />
  );
  assert.match(dailyHtml, /aria-label="Días de la semana"/);

  // En Semana (7 días) desktop oculta la tira superior para no duplicar días
  const gridHtml = renderToStaticMarkup(
    <AgendaView state={state} onUpdateState={noopUpdate} initialWeekViewMode="grid" initialWideWeekView={true} />
  );
  assert.doesNotMatch(gridHtml, /aria-label="Días de la semana"/, 'No debe duplicar la tira de 7 días en Semana (7 días)');
  assert.match(gridHtml, /data-week-grid="true"[^>]*xl:grid-cols-7/);
  assert.match(gridHtml, /data-agenda-grid-entry="true"/);
  assert.match(gridHtml, /line-clamp-2[^>]*>Tareas del hogar<\/span>/);
  assert.match(gridHtml, /line-clamp-2[^>]*>Planificación semanal<\/span>/);

  const gridSlice = gridHtml.slice(gridHtml.indexOf('data-week-grid="true"'));
  assert.doesNotMatch(gridSlice, />Actividad semanal<\/span>/);
  assert.doesNotMatch(gridSlice, />Rutina<\/span>/);
});

test('Bloque 19: Pestaña Rutinas sin encabezado duplicado, acciones solo íconos Pencil/Trash2 y Vaciar horario discreto en reposo', () => {
  const state = defaultState();
  state.tasksRecurring = [
    { id: 'r1', name: 'Meditar 10 min', freq: 'daily', effort: 'low' },
    { id: 'r2', name: 'Revisar semana', freq: 'weekly', days: ['domingo'], effort: 'medium' },
  ];
  state.agenda.lunes = [{ id: 'b1', time: '08:00', activity: 'Foco profundo', effort: 'high' }];

  const html = renderToStaticMarkup(
    <AgendaView state={state} onUpdateState={noopUpdate} initialSection="rutinas" />
  );

  // Un solo encabezado de rutinas con contador, sin "Tus rutinas" duplicado
  assert.match(html, /id="routine-list-title"[^>]*>Rutinas recurrentes<\/h2>/);
  assert.doesNotMatch(html, /Tus rutinas/);
  assert.doesNotMatch(html, /2 total/);

  // Botones de acción icon-only (sin texto "Editar" mezclado) con aria-label y title
  const editBtnMatch = html.match(/<button[^>]*aria-label="Editar Meditar 10 min"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(editBtnMatch, 'Debe existir el botón de editar rutina con aria-label');
  assert.match(editBtnMatch[0], /title="Editar Meditar 10 min"/);
  assert.match(editBtnMatch[0], /lucide-pencil/);
  assert.doesNotMatch(editBtnMatch[0], />Editar</, 'No debe mezclar texto Editar con ícono solo');

  const deleteBtnMatch = html.match(/<button[^>]*aria-label="Eliminar Meditar 10 min"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(deleteBtnMatch, 'Debe existir el botón de eliminar rutina con aria-label');
  assert.match(deleteBtnMatch[0], /title="Eliminar Meditar 10 min"/);
  assert.match(deleteBtnMatch[0], /lucide-trash/);

  // Botón destructivo Vaciar horario recurrente neutro en reposo y rojo recién en hover
  const clearBtnMatch = html.match(/<button[^>]*>[\s\S]*?Vaciar horario recurrente[\s\S]*?<\/button>/);
  assert.ok(clearBtnMatch, 'Debe existir el botón Vaciar horario recurrente');
  assert.doesNotMatch(clearBtnMatch[0], /\bborder-rose-500\/30\b/, 'No debe tener borde rojo permanente en reposo');
  assert.match(clearBtnMatch[0], /border-slate-200\/80/);
  assert.match(clearBtnMatch[0], /hover:border-rose-500\/40/);
  assert.match(clearBtnMatch[0], /hover:text-rose-600/);
});

test('Bloque 19: Modal Nuevo compromiso puntual con botón cerrar X, placeholder útil, grid de 2 columnas y foco sin doble borde', () => {
  const today = todayISO();
  const state = defaultState();

  const html = renderToStaticMarkup(
    <AgendaView
      state={state}
      onUpdateState={noopUpdate}
      initialEventDraft={{ name: '', date: today, time: '' }}
    />
  );

  assert.match(html, /id="agenda-event-title"[^>]*>Nuevo compromiso puntual<\/h2>/);
  assert.match(html, /aria-label="Cerrar modal"[^>]*title="Cerrar"[^>]*>[\s\S]*?lucide-x/);
  assert.match(html, /placeholder="Ej: Dentista, entrega, reunión\.\.\."/);
  assert.match(html, /grid grid-cols-1 gap-3 sm:grid-cols-2[^>]*>[\s\S]*?Fecha[\s\S]*?Hora opcional/);
  assert.match(html, /class="agenda-clean-input[^"]*outline-none focus:outline-none focus-visible:outline-none/);

  // Verificar que product-refinement.css elimina el doble outline en foco
  const css = readFileSync(resolve(process.cwd(), 'src/styles/product-refinement.css'), 'utf8');
  assert.match(css, /\.product-refinement \.agenda-clean-input:focus-visible[\s\S]*?outline:\s*none;/);
});
