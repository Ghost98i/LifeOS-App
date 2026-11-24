import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { JOB_STAGES } from './jobApplications';
import {
  TrabajoView,
  resolveTrabajoProcessTransition,
  resolveTrabajoViewTransition,
} from '../components/TrabajoView';
import type { JobApplication } from '../types';

const noopUpdate = () => true;

const makeApp = (overrides: Partial<JobApplication> = {}): JobApplication => ({
  id: 'app-1',
  tipo: 'convencional',
  empresa: 'Mercado Libre',
  puesto: 'Frontend Engineer',
  estado: 'cv_enviado',
  fecha: todayISO(),
  source: 'LinkedIn',
  link: 'https://careers-meli.mercadolibre.com',
  ...overrides,
});

test('Bloque 20.1: Segmented Control Tablero / Lista con pastilla índigo #4F46E5, foco limpio y sin estado muerto en Todos', () => {
  for (const darkMode of [false, true]) {
    const state = defaultState();
    state.settings.darkMode = darkMode;
    state.jobs.applications = [makeApp()];

    const kanbanHtml = renderToStaticMarkup(<TrabajoView state={state} onUpdateState={noopUpdate} />);
    assert.match(kanbanHtml, /role="tablist"[^>]*aria-label="Vista de postulaciones"/);
    assert.doesNotMatch(kanbanHtml, /Lista \/ Tabla/, 'Debe renombrar Lista / Tabla a Lista');
    assert.match(kanbanHtml, /role="tab"[^>]*aria-selected="true"[^>]*class="[^"]*bg-\[#4F46E5\] text-white[^"]*">[\s\S]*?<span>Tablero<\/span>/);
    assert.match(kanbanHtml, /role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?<span>Lista<\/span>/);
    assert.match(
      kanbanHtml,
      /outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70/
    );
  }

  // Pasar a Tablero estando en 'todos' cambia automáticamente el filtro a 'convencional'
  const fromTodosToKanban = resolveTrabajoViewTransition('todos', 'kanban');
  assert.equal(fromTodosToKanban.viewMode, 'kanban');
  assert.equal(fromTodosToKanban.processType, 'convencional');
  assert.equal(fromTodosToKanban.autoSwitchedProcess, true);

  // Pasar a Lista estando en 'todos' conserva 'todos'
  const stayTodosInTable = resolveTrabajoViewTransition('todos', 'table');
  assert.equal(stayTodosInTable.viewMode, 'table');
  assert.equal(stayTodosInTable.processType, 'todos');

  // Elegir 'todos' desde el selector estando en Tablero pasa automáticamente a Lista
  const fromKanbanToTodos = resolveTrabajoProcessTransition('kanban', 'todos');
  assert.equal(fromKanbanToTodos.viewMode, 'table');
  assert.equal(fromKanbanToTodos.processType, 'todos');
});

test('Bloque 20.2: Cero azules residuales (blue-*, sky-*, cyan-*, var(--blue)) en etapas, tablero, lista y formulario', () => {
  for (const tipo of ['convencional', 'concurso'] as const) {
    for (const stage of JOB_STAGES[tipo]) {
      const classes = `${stage.colorClass} ${stage.dotColor} ${stage.badgeBg}`;
      assert.doesNotMatch(
        classes,
        /\b(?:bg|text|border|ring)-(?:blue|sky|cyan|teal)-/,
        `Etapa ${stage.id} no debe usar azules/celestes residuales`
      );
    }
  }

  const cvStage = JOB_STAGES.convencional.find((s) => s.id === 'cv_enviado')!;
  assert.match(cvStage.dotColor, /bg-\[#4F46E5\]/);
  assert.match(cvStage.badgeBg, /indigo/);

  const state = defaultState();
  state.jobs.applications = [
    makeApp({ id: 'a1', estado: 'cv_enviado' }),
    makeApp({ id: 'a2', tipo: 'concurso', empresa: 'UTE', puesto: 'Administrativo', estado: 'inscripto' }),
  ];

  for (const viewMode of ['kanban', 'table'] as const) {
    const html = renderToStaticMarkup(
      <TrabajoView
        state={state}
        onUpdateState={noopUpdate}
        initialViewMode={viewMode}
        initialProcessType={viewMode === 'table' ? 'todos' : 'convencional'}
        initialFormOpen={true}
      />
    );
    assert.doesNotMatch(html, /\b(?:bg|text|border|ring|accent)-(?:blue|sky|cyan)-/);
    assert.doesNotMatch(html, /var\(--blue/);
  }
});

test('Bloque 20.3: Íconos 100% lucide-react (sin ASCII ▶, ↗, ×) y acciones unificadas Pencil / Trash2 en todas las vistas', () => {
  const state = defaultState();
  state.jobs.applications = [makeApp()];

  const kanbanHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialViewMode="kanban" />
  );
  // Ver otras métricas usa ChevronRight rotando 90° al abrir, sin triángulo nativo
  assert.match(kanbanHtml, /<summary[^>]*list-none[^>]*>[\s\S]*?lucide-chevron-right[^"]*group-open:rotate-90[\s\S]*?Ver otras métricas/);
  assert.doesNotMatch(kanbanHtml, /[▶↗×]/, 'No debe contener caracteres ASCII de UI en Tablero');

  // Acciones unificadas Pencil y Trash2 tanto en card móvil como en card desktop del Tablero
  const mobileCardStart = kanbanHtml.indexOf('id="job-app-mobile-app-1"');
  const desktopCardStart = kanbanHtml.indexOf('id="job-app-app-1"');
  assert.ok(mobileCardStart > 0 && desktopCardStart > 0);

  for (const cardSlice of [kanbanHtml.slice(mobileCardStart, desktopCardStart), kanbanHtml.slice(desktopCardStart)]) {
    assert.match(cardSlice, /aria-label="Editar postulación de Mercado Libre"[^>]*title="Editar postulación"[^>]*>[\s\S]*?lucide-pencil/);
    assert.match(cardSlice, /aria-label="Eliminar postulación de Mercado Libre"[^>]*title="Eliminar postulación"[^>]*>[\s\S]*?lucide-trash-2/);
    assert.doesNotMatch(cardSlice, />Editar<\/button>/, 'No debe quedar botón de texto Editar en cards del Tablero');
    assert.doesNotMatch(cardSlice, /lucide-x\b/, 'No debe quedar botón × en cards del Tablero');
  }

  const listHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialViewMode="table" />
  );
  assert.doesNotMatch(listHtml, /[▶↗×]/, 'No debe contener caracteres ASCII de UI en Lista');
  assert.match(listHtml, /Ver publicación<\/span><svg[^>]*lucide-external-link/);

  const mobileListStart = listHtml.indexOf('id="job-app-mobile-list-app-1"');
  const desktopRowStart = listHtml.indexOf('id="job-app-app-1"');
  assert.ok(mobileListStart > 0 && desktopRowStart > 0);

  for (const rowSlice of [listHtml.slice(mobileListStart, desktopRowStart), listHtml.slice(desktopRowStart)]) {
    assert.match(rowSlice, /aria-label="Editar postulación de Mercado Libre"[^>]*title="Editar postulación"[^>]*>[\s\S]*?lucide-pencil/);
    assert.match(rowSlice, /aria-label="Eliminar postulación de Mercado Libre"[^>]*title="Eliminar postulación"[^>]*>[\s\S]*?lucide-trash-2/);
    assert.doesNotMatch(rowSlice, />Editar<\/button>/);
    assert.doesNotMatch(rowSlice, />Eliminar<\/button>/);
  }
});

test('Bloque 20.4: Limpieza de foco en inputs/selects sin doble borde, botón cerrar X y chips índigo en Nueva postulación', () => {
  const state = defaultState();
  state.jobs.applications = [makeApp()];

  const formHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialFormOpen={true} initialFormType="convencional" />
  );

  // Botón cerrar formulario solo ícono X con aria-label="Cerrar formulario"
  assert.match(formHtml, /aria-label="Cerrar formulario"[^>]*title="Cerrar formulario"[^>]*>[\s\S]*?lucide-x/);
  assert.doesNotMatch(formHtml, />Cerrar<\/button>/);

  // Chips rápidos de portales con estilo índigo consistente
  for (const portal of ['LinkedIn', 'BuscoJobs', 'Portal empresa', 'Uruguay Concursa', 'Referido']) {
    assert.match(formHtml, new RegExp(`>${portal}<\\/button>`));
  }
  assert.match(formHtml, /hover:border-\[#4F46E5\]\/50 hover:bg-indigo-500\/10 hover:text-\[#4F46E5\]/);

  // Foco limpio en inputs y selects + regla CSS que anula el outline global de index.css
  assert.match(
    formHtml,
    /trabajo-clean-input outline-none focus:outline-none focus-visible:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500\/40/
  );
  const css = readFileSync(resolve(process.cwd(), 'src/styles/product-refinement.css'), 'utf8');
  assert.match(css, /\.product-refinement \.trabajo-clean-input:focus-visible[\s\S]*?outline:\s*none;/);
});

test('Bloque 20.5: Oculta columna/badge Tipo cuando el proceso es específico y alinea KPI cards móviles', () => {
  const state = defaultState();
  state.jobs.applications = [
    makeApp({ id: 'c1', tipo: 'convencional', empresa: 'Globant' }),
    makeApp({ id: 'p1', tipo: 'concurso', empresa: 'BROU', estado: 'inscripto' }),
  ];

  // Con filtro específico (convencional): NO muestra columna Tipo ni badge de tipo en móvil
  const specificListHtml = renderToStaticMarkup(
    <TrabajoView
      state={state}
      onUpdateState={noopUpdate}
      initialViewMode="table"
      initialProcessType="convencional"
    />
  );
  assert.doesNotMatch(specificListHtml, /<th[^>]*>Tipo<\/th>/);
  assert.doesNotMatch(specificListHtml, /data-job-type-badge="true"/);

  // Con filtro 'todos': SÍ muestra columna Tipo y badge de tipo en móvil
  const allListHtml = renderToStaticMarkup(
    <TrabajoView
      state={state}
      onUpdateState={noopUpdate}
      initialViewMode="table"
      initialProcessType="todos"
    />
  );
  assert.match(allListHtml, /<th[^>]*>Tipo<\/th>/);
  assert.match(allListHtml, /data-job-type-badge="true"/);

  // KPI cards móviles alineadas con flex flex-col justify-between y etiqueta compacta Seguimientos hoy
  assert.match(
    specificListHtml,
    /flex flex-col justify-between[^>]*>[\s\S]*?Postulaciones[\s\S]*?flex flex-col justify-between[^>]*>[\s\S]*?Seguimientos hoy/
  );
});
