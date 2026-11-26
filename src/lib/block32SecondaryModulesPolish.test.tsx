import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { AgendaView } from '../components/AgendaView';
import { CalendarioView } from '../components/CalendarioView';
import { TrabajoView } from '../components/TrabajoView';
import { NotasView } from '../components/NotasView';
import { ProjectsManager } from '../components/ProjectsManager';

const noopUpdate = () => true;

const TOUCHED_FILES = [
  'src/components/AgendaView.tsx',
  'src/components/CalendarioView.tsx',
  'src/components/TrabajoView.tsx',
  'src/components/JobKanbanBoard.tsx',
  'src/components/NotasView.tsx',
  'src/components/ProjectsManager.tsx',
];

function assertBottomSheetMarkup(html: string, label: string) {
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/, `${label}: debe renderizar dialog modal accesible`);
  assert.match(html, /items-end/, `${label}: debe anclarse abajo en móvil (items-end)`);
  assert.match(html, /sm:items-center/, `${label}: debe centrarse en desktop (sm:items-center)`);
  assert.match(html, /p-0/, `${label}: debe usar p-0 en móvil`);
  assert.match(html, /sm:p-4/, `${label}: debe usar sm:p-4 en desktop`);
  assert.match(html, /rounded-t-2xl/, `${label}: debe usar rounded-t-2xl`);
  assert.match(html, /sm:rounded-2xl/, `${label}: debe usar sm:rounded-2xl`);
  assert.match(html, /max-h-\[90dvh\]/, `${label}: debe limitar altura a max-h-[90dvh]`);
  assert.match(html, /overscroll-contain/, `${label}: debe usar overscroll-contain`);
  assert.match(html, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/, `${label}: debe respetar safe-area-inset-bottom`);
  assert.match(html, /h-1 w-10 shrink-0 rounded-full[\s\S]*sm:hidden/, `${label}: debe mostrar tirador decorativo en sm:hidden`);
  assert.match(html, /min-h-11 min-w-11/, `${label}: botón de cierre debe medir >= 44px en móvil`);
}

test('Bloque 32.1: Cero azules residuales, cero checkboxes nativos y cero símbolos ASCII en Agenda, Calendario, Trabajo y Notas', () => {
  for (const relPath of TOUCHED_FILES) {
    const src = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.doesNotMatch(
      src,
      /\b(?:bg|text|border|ring|accent|from|to|via|decoration)-(?:blue|sky|cyan)-/,
      `Azul residual detectado en ${relPath}`
    );
    assert.doesNotMatch(src, /var\(--blue/, `var(--blue) residual detectado en ${relPath}`);
    assert.doesNotMatch(src, /type="checkbox"/, `Checkbox nativo sin migrar detectado en ${relPath}`);
    assert.doesNotMatch(src, /[←→✓×▲▼▶▾↗✕]/, `Símbolo ASCII prohibido detectado en ${relPath}`);
    assert.doesNotMatch(src, /\b(?:window\.)?prompt\(/, `Uso de window.prompt nativo detectado en ${relPath}`);
  }
});

test('Bloque 32.2: Todos los modales de Agenda, Calendario, Trabajo, Notas y Proyectos siguen el patrón bottom sheet del Bloque 30', () => {
  const today = todayISO();
  const state = defaultState();
  state.notes.postits = [
    { id: 'n-edit', title: 'Nota de prueba', text: 'Contenido inicial', date: today, pinned: true },
  ];

  // 1. Agenda: modal semanal y modal compromiso puntual
  const agendaWeeklyHtml = renderToStaticMarkup(
    <AgendaView
      state={state}
      onUpdateState={noopUpdate}
      initialWeeklyDraft={{ activity: '', day: 'lunes', time: '09:00' }}
    />
  );
  assertBottomSheetMarkup(agendaWeeklyHtml, 'AgendaView (actividad semanal)');
  assert.match(agendaWeeklyHtml, /celestian-clean-field/);

  const agendaEventHtml = renderToStaticMarkup(
    <AgendaView
      state={state}
      onUpdateState={noopUpdate}
      initialEventDraft={{ name: '', date: today, time: '' }}
    />
  );
  assertBottomSheetMarkup(agendaEventHtml, 'AgendaView (compromiso puntual)');

  // 2. Calendario: modal nuevo acontecimiento
  const calendarioModalHtml = renderToStaticMarkup(
    <CalendarioView state={state} onUpdateState={noopUpdate} initialShowEventModal={true} />
  );
  assertBottomSheetMarkup(calendarioModalHtml, 'CalendarioView (nuevo acontecimiento)');
  assert.match(calendarioModalHtml, /celestian-clean-field/);

  // 3. Trabajo: modal nueva postulación
  const trabajoModalHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialFormOpen={true} />
  );
  assertBottomSheetMarkup(trabajoModalHtml, 'TrabajoView (nueva postulación)');
  assert.match(trabajoModalHtml, /celestian-clean-field/);

  // 4. Notas: modal nueva nota y modal editar nota
  const notasNewHtml = renderToStaticMarkup(
    <NotasView
      state={state}
      onUpdateState={noopUpdate}
      storageUserId={null}
      onOpenGym={() => {}}
      initialShowAddForm={true}
    />
  );
  assertBottomSheetMarkup(notasNewHtml, 'NotasView (nueva nota)');

  const notasEditHtml = renderToStaticMarkup(
    <NotasView
      state={state}
      onUpdateState={noopUpdate}
      storageUserId={null}
      onOpenGym={() => {}}
      initialNoteId="n-edit"
    />
  );
  assertBottomSheetMarkup(notasEditHtml, 'NotasView (editar nota)');

  // 5. Proyectos: modal nuevo proyecto
  const projectsModalHtml = renderToStaticMarkup(
    <ProjectsManager state={state} onUpdateState={noopUpdate} initialShowForm={true} />
  );
  assertBottomSheetMarkup(projectsModalHtml, 'ProjectsManager (nuevo proyecto)');

  // Verificación estática adicional de que ningún type="number" en NotasView carece de inputMode
  const notasSrc = fs.readFileSync(path.resolve('src/components/NotasView.tsx'), 'utf8');
  const numInputs = notasSrc.match(/<input\b[^>]*type="number"[^>]*>/g) || [];
  assert.ok(numInputs.length >= 3, 'NotasView debe verificar sus campos numéricos');
  for (const tag of numInputs) {
    assert.match(tag, /inputMode="decimal"/, `Campo numérico sin inputMode="decimal" en NotasView: ${tag}`);
  }
  const trabajoSrc = fs.readFileSync(path.resolve('src/components/TrabajoView.tsx'), 'utf8');
  assert.match(trabajoSrc, /inputMode="decimal"/, 'TrabajoView debe usar inputMode="decimal" en remuneración esperada');
});

test('Bloque 32.3: Trabajo y Objetivos financieros en Notas respetan privacyMode enmascarando salarios y montos', () => {
  const today = todayISO();
  const baseState = defaultState();
  baseState.jobs.applications = [
    {
      id: 'job-priv-1',
      tipo: 'convencional',
      empresa: 'Fintech UY',
      puesto: 'Product Engineer',
      estado: 'entrevista',
      fecha: today,
      salaryExpectation: 125000,
      salaryCurrency: 'UYU',
      notas: 'Banda estimada $125.000 más bono USD 3500',
      followUpNotes: 'Confirmar oferta de USD 4200',
      nextAction: 'Negociar propuesta USD 4200',
      nextActionDate: today,
    },
  ];
  baseState.goals = [
    { id: 'g-fin', name: 'Fondo de reserva', initial: 0, target: 50000, current: 20000, linked: 'available' },
  ];

  // Sin privacyMode: los montos son visibles
  baseState.settings.privacyMode = false;
  for (const viewMode of ['kanban', 'table'] as const) {
    const visibleHtml = renderToStaticMarkup(
      <TrabajoView state={baseState} onUpdateState={noopUpdate} initialViewMode={viewMode} />
    );
    assert.match(visibleHtml, /125\.000|125,000/, `Debe mostrar remuneración cuando privacyMode=false (${viewMode})`);
    assert.match(visibleHtml, /USD 4200/, `Debe mostrar montos en seguimiento cuando privacyMode=false (${viewMode})`);
  }

  // Con privacyMode=true: salarios y montos en texto quedan enmascarados
  const privateState = structuredClone(baseState);
  privateState.settings.privacyMode = true;
  for (const viewMode of ['kanban', 'table'] as const) {
    const maskedHtml = renderToStaticMarkup(
      <TrabajoView state={privateState} onUpdateState={noopUpdate} initialViewMode={viewMode} />
    );
    assert.doesNotMatch(maskedHtml, /125\.000|125,000/, `No debe filtrar remuneración esperada con privacyMode=true (${viewMode})`);
    assert.doesNotMatch(maskedHtml, /3500|4200/, `No debe filtrar montos económicos en texto con privacyMode=true (${viewMode})`);
    assert.match(maskedHtml, /••••/, `Debe renderizar máscara •••• con privacyMode=true (${viewMode})`);
    assert.match(maskedHtml, /data-private="true"/, `Debe usar PrivacyAmount con data-private="true" (${viewMode})`);
  }

  // NotasView -> Objetivos financieros también respetan privacyMode
  const maskedGoalsHtml = renderToStaticMarkup(
    <NotasView
      state={privateState}
      onUpdateState={noopUpdate}
      storageUserId={null}
      onOpenGym={() => {}}
      initialTab="proyectos"
    />
  );
  assert.doesNotMatch(maskedGoalsHtml, /50\.000|50,000/, 'No debe filtrar meta financiera con privacyMode=true');
  assert.match(maskedGoalsHtml, /data-private="true"[^>]*>••••</);
});

test('Bloque 32.4: Calendario respeta hiddenTabs en grilla y panel de detalle del día seleccionado', () => {
  const today = todayISO();
  const state = defaultState();
  state.settings.hiddenTabs = ['finanzas', 'estudios', 'trabajo', 'notas'];
  state.calendarEvents = [
    { id: 'evt-own', name: 'Cumpleaños de Sofi', date: today, type: 'cumpleanos', recurring: false },
  ];
  state.finance.commitments = [
    {
      id: 'com-hidden',
      name: 'Alquiler oculto',
      amount: 25000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: today,
      active: true,
    },
  ];
  state.study.exams = [
    { id: 'ex-hidden', title: 'Parcial oculto', date: today, status: 'pendiente' },
  ];
  state.jobs.applications = [
    {
      id: 'job-hidden',
      tipo: 'convencional',
      empresa: 'Empresa Oculta',
      puesto: 'Dev',
      estado: 'entrevista',
      fecha: today,
      nextAction: 'Seguimiento oculto',
      nextActionDate: today,
      keyDates: [{ id: 'kd-h', kind: 'entrevista', date: today, time: '11:00' }],
    },
  ];
  state.projects = [
    {
      id: 'proj-hidden',
      name: 'Proyecto Oculto',
      objective: 'Meta',
      status: 'activo',
      nextStep: 'Paso',
      tasks: [{ id: 'pt-hidden', text: 'Entrega oculta', done: false, dueDate: today }],
      createdAt: today,
    },
  ];

  const html = renderToStaticMarkup(
    <CalendarioView state={state} onUpdateState={noopUpdate} onNavigate={() => {}} onNavigateToRecord={() => {}} />
  );

  assert.match(html, /Cumpleaños de Sofi/, 'Debe conservar los eventos propios de Calendario');
  assert.doesNotMatch(html, /Alquiler oculto/, 'No debe mostrar compromisos si Finanzas está oculto');
  assert.doesNotMatch(html, /Parcial oculto/, 'No debe mostrar exámenes si Estudios está oculto');
  assert.doesNotMatch(html, /Empresa Oculta|Seguimiento oculto/, 'No debe mostrar hitos si Trabajo está oculto');
  assert.doesNotMatch(html, /Entrega oculta|Proyecto Oculto/, 'No debe mostrar vencimientos si Notas está oculto');
  assert.match(html, /aria-current="date"/, 'Debe marcar el día de hoy de forma accesible');
});
