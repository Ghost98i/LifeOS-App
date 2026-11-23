import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from './storage';
import { addNote } from './notesFlows';
import {
  getExamCardDisplay,
  getStudyThirdOverviewMetric,
  selectStudyExams,
} from './studyPresentation';
import { categorizeExams } from './studyFlows';
import { getStudyWorkspace } from './studyWorkspace';
import {
  isAmbientSessionAttached,
  setAmbientSessionAttached,
  setSoundEnabled,
  shouldKeepAmbientOnUnmount,
  stopAllAmbientNoise,
} from './audio';
import { Sidebar } from '../components/Sidebar';
import { MobileNav } from '../components/MobileNav';
import { StudyActiveOverlay } from '../components/StudyActiveOverlay';
import { StudyAmbientPlayer } from '../components/StudyAmbientPlayer';
import { StudyPracticeSection } from '../components/StudyPracticeSection';
import { EstudiosView } from '../components/EstudiosView';
import type { Exam, Subject } from '../types';

const noop = () => undefined;

function futureIso(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('Bloque 16: Evaluaciones ordena próximas de más cercana a más lejana y usa el nombre de la materia como título principal', () => {
  const subjects: Subject[] = [
    { id: 'sub-web', name: 'Programación Web' },
    { id: 'sub-discreta', name: 'Matemática Discreta' },
  ];
  const nearDate = futureIso(16);
  const farDate = futureIso(18);
  const exams: Exam[] = [
    { id: 'ex-far', title: 'Examen', subjectId: 'sub-discreta', date: farDate, status: 'pendiente' },
    { id: 'ex-near', title: 'Parcial 1', subjectId: 'sub-web', date: nearDate, status: 'pendiente' },
  ];

  // 1. selectStudyExams('all') ordena próximas ascendente (más cercana primero)
  const categorized = categorizeExams(exams);
  const ordered = selectStudyExams('all', exams, categorized, null);
  assert.deepEqual(
    ordered.map((e) => e.id),
    ['ex-near', 'ex-far'],
    'En vista por defecto (Todas), la evaluación más cercana debe aparecer primero'
  );

  // 2. getExamCardDisplay prioriza la materia como título principal y el tipo como subtítulo/chip
  assert.deepEqual(getExamCardDisplay(exams[1], subjects), {
    primaryTitle: 'Programación Web',
    typeLabel: 'Parcial 1',
    subjectName: 'Programación Web',
  });
  assert.deepEqual(getExamCardDisplay({ id: 'ex-legacy', subjectId: 'sub-web', date: nearDate, status: 'pendiente' }, subjects), {
    primaryTitle: 'Programación Web',
    typeLabel: 'Examen',
    subjectName: 'Programación Web',
  });

  // 3. SSR en EstudiosView: ex-near antes que ex-far, nombre de materia como título font-semibold, sin "7d:", acciones alineadas a izquierda
  const state = defaultState();
  state.study.subjects = subjects;
  state.study.exams = exams;
  state.study.studyLog = [
    { id: 'log-1', date: futureIso(0), minutes: 45, subjectId: 'sub-web', subjectName: 'Programación Web', createdAt: Date.now() },
  ];

  const html = renderToStaticMarkup(
    <EstudiosView state={state} onUpdateState={() => true} />
  );

  const nearIndex = html.indexOf('id="exam-ex-near"');
  const farIndex = html.indexOf('id="exam-ex-far"');
  assert.ok(nearIndex > 0 && farIndex > 0, 'Debe renderizar ambas evaluaciones');
  assert.ok(nearIndex < farIndex, 'La evaluación más próxima debe renderizarse antes que la más lejana');

  // El título principal de la tarjeta de ex-near es la materia ("Programación Web") y el tipo ("Parcial 1") es un chip sutil
  assert.match(html, /title="Editar Programación Web"[^>]*class="[^"]*font-semibold[^"]*"[^>]*>Programación Web<\/button>/);
  assert.match(html, />Parcial 1<\/span>/);
  assert.match(html, /whitespace-nowrap[^>]*>En 16 días<\/span>/);
  assert.match(html, /45 min \(últimos 7 d\)/);
  assert.doesNotMatch(html, /7d:\s*45 min/);

  // Controles de acciones de Evaluaciones: barra full-width sin self-end que deje hueco izquierdo en móvil
  const examCardSlice = html.slice(nearIndex, farIndex);
  assert.match(examCardSlice, /Priorizar hoy/);
  assert.doesNotMatch(examCardSlice, /self-end/);
});

test('Bloque 16: Cero clases blue-* / sky-* / var(--blue) en Sidebar, MobileNav (Más activo) y StudyActiveOverlay', () => {
  for (const darkMode of [false, true]) {
    const state = defaultState();
    state.settings.darkMode = darkMode;

    const sidebarHtml = renderToStaticMarkup(
      <Sidebar
        currentView="estudios"
        state={state}
        onNavigate={noop}
        onToggleTheme={noop}
        isOpenMobile={false}
        onCloseMobile={noop}
      />
    );
    assert.match(sidebarHtml, /#4F46E5/, 'Sidebar debe usar índigo Celestian en ítem activo y switch');
    assert.doesNotMatch(sidebarHtml, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
    assert.doesNotMatch(sidebarHtml, /var\(--blue/);

    // MobileNav con vista en Estudios -> botón "Más" activo con pastilla índigo Celestian
    const mobileNavHtml = renderToStaticMarkup(
      <MobileNav
        currentView="estudios"
        onNavigate={noop}
        onOpenCapture={noop}
        onOpenMore={noop}
        privacyMode={true}
        onTogglePrivacy={noop}
        state={state}
      />
    );
    const moreBtnMatch = mobileNavHtml.match(/<button\b[^>]*aria-label="Abrir más secciones"[^>]*>[\s\S]*?<\/button>/);
    assert.ok(moreBtnMatch, 'Debe renderizar el botón Más');
    assert.match(moreBtnMatch[0], /aria-current="page"/, 'El botón Más debe estar activo en la vista Estudios');
    assert.match(moreBtnMatch[0], /bg-\[#4F46E5\]\/12 text-\[#4F46E5\]/, 'El botón Más activo debe usar pastilla e ícono índigo Celestian');
    assert.doesNotMatch(mobileNavHtml, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
    assert.doesNotMatch(mobileNavHtml, /var\(--blue/);
  }

  // StudyActiveOverlay en estado running y paused
  const runningState = defaultState();
  runningState.study.subjects = [{ id: 's1', name: 'Álgebra' }];
  runningState.study.activeSession = {
    id: 'sess-1',
    plannedMinutes: 25,
    targetSubjectId: 's1',
    targetSubjectName: 'Álgebra',
    startedAt: Date.now() - 60_000,
    endsAt: Date.now() + 24 * 60_000,
    remainingSeconds: 24 * 60,
    status: 'running',
    lastTickAt: Date.now(),
    phase: 'focus',
    cycle: 1,
    totalCycles: 4,
  };

  const overlayHtml = renderToStaticMarkup(
    <StudyActiveOverlay
      state={runningState}
      onUpdateState={noop}
      onOpenStudies={noop}
      currentView="notas"
    />
  );
  assert.match(overlayHtml, /Enfoque: Álgebra/);
  assert.match(overlayHtml, /#4F46E5/);
  assert.match(overlayHtml, /bg-emerald-500/, 'Conserva verde semántico en indicador de sesión activa');
  assert.doesNotMatch(overlayHtml, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(overlayHtml, /var\(--blue/);
});

test('Bloque 16: Métrica superior alternativa sin calificadas, Para estudiar compacto, segmented control 389px, Materias nowrap e Historial horizontal', () => {
  // 1. Sin evaluaciones calificadas + con temas -> Temas completados (X / Y)
  const topicsMetric = getStudyThirdOverviewMetric({
    completedExams: [],
    subjects: [
      {
        id: 's1',
        name: 'Física',
        topics: [
          { id: 't1', title: 'Cinemática', done: true },
          { id: 't2', title: 'Dinámica', done: false },
        ],
      },
    ],
    exams: [
      {
        id: 'e1',
        subjectId: 's1',
        date: futureIso(10),
        status: 'pendiente',
        topics: [{ id: 'et1', title: 'Leyes de Newton', done: true }],
      },
    ],
    studyLogs: [],
  });
  assert.equal(topicsMetric.kind, 'topics');
  assert.equal(topicsMetric.label, 'Temas completados');
  assert.equal(topicsMetric.value, '2 / 3');

  // 2. Sin evaluaciones calificadas ni temas -> Sesiones esta semana
  const sessionsMetric = getStudyThirdOverviewMetric({
    completedExams: [],
    subjects: [{ id: 's1', name: 'Física' }],
    exams: [],
    studyLogs: [{ id: 'l1', date: futureIso(0), minutes: 30, subjectId: 's1' }],
  });
  assert.equal(sessionsMetric.kind, 'sessions');
  assert.equal(sessionsMetric.label, 'Sesiones esta semana');
  assert.equal(sessionsMetric.value, '1 sesión');

  // 3. Con al menos una evaluación calificada -> vuelve automáticamente a Aprobación
  const approvalMetric = getStudyThirdOverviewMetric({
    completedExams: [{ id: 'e-done', subjectId: 's1', date: futureIso(-5), status: 'aprobado' }],
    subjects: [{ id: 's1', name: 'Física', topics: [{ id: 't1', title: 'Tema 1', done: true }] }],
    exams: [],
    studyLogs: [],
  });
  assert.equal(approvalMetric.kind, 'approval');
  assert.equal(approvalMetric.label, 'Aprobación');
  assert.equal(approvalMetric.value, '1 de 1 aprobadas');

  // 4. SSR de EstudiosView sin notas vinculadas ni evaluaciones calificadas
  const stateNoNotes = defaultState();
  stateNoNotes.study.subjects = [
    {
      id: 's1',
      name: 'Arquitectura de Computadoras',
      topics: [
        { id: 't1', title: 'Pipeline', done: true },
        { id: 't2', title: 'Memoria caché', done: false },
      ],
    },
  ];
  stateNoNotes.study.exams = [
    { id: 'e1', title: 'Parcial', subjectId: 's1', date: futureIso(12), status: 'pendiente' },
  ];
  stateNoNotes.study.studyLog = [
    { id: 'l1', date: futureIso(0), minutes: 40, subjectId: 's1', subjectName: 'Arquitectura de Computadoras', createdAt: Date.now() },
  ];

  const htmlNoNotes = renderToStaticMarkup(
    <EstudiosView state={stateNoNotes} onUpdateState={() => true} />
  );
  // Segmented control full-width 2 columnas en móvil y foco limpio (sin anillo clavado con mouse)
  assert.match(htmlNoNotes, /role="tablist"[^>]*class="[^"]*grid w-full grid-cols-2/);
  assert.match(
    htmlNoNotes,
    /outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70/
  );
  // Métrica alternativa visible y nada de "Sin evaluaciones calificadas"
  assert.match(htmlNoNotes, /data-study-third-metric="topics"/);
  assert.match(htmlNoNotes, /Temas completados/);
  assert.match(htmlNoNotes, />1 \/ 2</);
  assert.doesNotMatch(htmlNoNotes, /Sin evaluaciones calificadas/);
  // Grilla compacta en móvil (grid-cols-2 sm:grid-cols-3)
  assert.match(htmlNoNotes, /study-overview grid grid-cols-2 sm:grid-cols-3/);
  // Para estudiar con 1 evaluación próxima y 0 notas mantiene el bloque de próximas y colapsa la segunda columna
  const paraEstudiarSection = htmlNoNotes.match(/<section aria-label="Para estudiar"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(paraEstudiarSection, /data-study-workspace-compact="false"/);
  assert.doesNotMatch(paraEstudiarSection, /md:grid-cols-2/, 'Sin notas vinculadas no debe dejar media tarjeta vacía en desktop');
  assert.match(paraEstudiarSection, /Apuntes en Notas:/);
  // Materias: fila horizontal de acciones (Temas + lápiz + tachito en el mismo contenedor flex) y (1 pend.) con whitespace-nowrap
  assert.match(htmlNoNotes, /whitespace-nowrap[^>]*>\(1 pend\.\)<\/span>/);
  const subjectActionsMatch = htmlNoNotes.match(/<div data-subject-actions="true" class="flex items-center gap-1\.5 shrink-0">[\s\S]*?<\/div>/);
  assert.ok(subjectActionsMatch, 'Materias debe agrupar Temas, editar y eliminar en una sola fila horizontal a la derecha');
  assert.match(subjectActionsMatch[0], /Temas \(1\/2\)/);
  assert.match(subjectActionsMatch[0], /aria-label="Renombrar Arquitectura de Computadoras"/);
  assert.match(subjectActionsMatch[0], /aria-label="Eliminar materia Arquitectura de Computadoras"/);
  // Historial de estudio: fila horizontal sin flex-col
  const historySection = htmlNoNotes.match(/<section id="qa-focus-estudio"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(historySection, /flex items-center justify-between gap-2\.5 py-3/);
  assert.doesNotMatch(historySection, /flex-col sm:flex-row sm:items-center justify-between gap-2 py-3/);
  // Sin clases blue-* ni sky-* ni var(--blue)
  assert.doesNotMatch(htmlNoNotes, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(htmlNoNotes, /var\(--blue/);

  // 4b. Para estudiar con 0 evaluaciones próximas y 0 notas vinculadas: colapsa en barra compacta sin dos bloques vacíos apilados
  const stateEmptyWorkspace = defaultState();
  stateEmptyWorkspace.study.subjects = [{ id: 's1', name: 'Física' }];
  stateEmptyWorkspace.study.exams = [
    { id: 'e-ok', title: 'Parcial 1', subjectId: 's1', date: futureIso(-10), status: 'aprobado' },
    { id: 'e-fail', title: 'Recuperatorio', subjectId: 's1', date: futureIso(-3), status: 'desaprobado' },
  ];
  const htmlEmptyWorkspace = renderToStaticMarkup(
    <EstudiosView state={stateEmptyWorkspace} onUpdateState={() => true} />
  );
  const compactWorkspace = htmlEmptyWorkspace.match(/<section aria-label="Para estudiar"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(compactWorkspace, /data-study-workspace-compact="true"/);
  assert.doesNotMatch(compactWorkspace, /Próximas evaluaciones/, 'Cuando está vacío no debe repetir subtítulos ni dos bloques vacíos');
  assert.match(compactWorkspace, /Sin evaluaciones próximas ni apuntes vinculados/);

  // Semántica visual del selector de estado en Evaluaciones (Aprobado emerald, Desaprobado rose) y botón borrar sin ml-auto
  assert.match(htmlEmptyWorkspace, /study-exam-status-approved[^>]*bg-emerald-500\/12 text-emerald-700/);
  assert.match(htmlEmptyWorkspace, /study-exam-status-failed[^>]*bg-rose-500\/12 text-rose-700/);
  const examsSectionHtml = htmlEmptyWorkspace.match(/<section aria-label="Gestión de evaluaciones y exámenes"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(examsSectionHtml, /ml-auto/, 'El botón eliminar no debe aislarse al extremo derecho tras un hueco vacío');

  // 5. Para estudiar en "Todas las materias" con notas etiquetadas de materias: muestra hasta 3 con etiqueta #Materia
  const stateWithNotes = structuredClone(stateNoNotes);
  stateWithNotes.study.subjects.push({ id: 's2', name: 'Álgebra' });
  addNote(stateWithNotes, { title: 'Resumen Álgebra', text: 'Matrices', tags: ['álgebra'] });
  addNote(stateWithNotes, { title: 'Apunte Caché', text: 'L1 y L2', tags: ['Arquitectura de Computadoras'] });
  addNote(stateWithNotes, { title: 'Ejercicios 1', text: 'Guía 1', tags: ['álgebra'] });
  addNote(stateWithNotes, { title: 'Ejercicios 2', text: 'Guía 2', tags: ['álgebra'] });

  const wsAll = getStudyWorkspace(stateWithNotes, null, futureIso(0));
  assert.equal(wsAll.notes.length, 4);
  const htmlWithNotes = renderToStaticMarkup(
    <EstudiosView state={stateWithNotes} onUpdateState={() => true} />
  );
  const paraEstudiarWithNotes = htmlWithNotes.match(/<section aria-label="Para estudiar"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(paraEstudiarWithNotes, /data-study-workspace-compact="false"/);
  assert.match(paraEstudiarWithNotes, /md:grid-cols-2/);
  assert.match(paraEstudiarWithNotes, /#Álgebra/);
  assert.equal((paraEstudiarWithNotes.match(/<button type="button" class="block min-h-11 w-full rounded-xl/g) || []).length, 3, 'Debe mostrar hasta 3 notas recientes en Todas las materias');
});

test('Bloque 16: Repaso destaca + Nueva pregunta como CTA primario vacío, usa switches índigo, íconos en Banco y limita Cantidad al disponible', () => {
  const subjects: Subject[] = [{ id: 's1', name: 'Física' }];
  const emptyState = defaultState();
  emptyState.study.subjects = subjects;
  emptyState.study.questions = [];

  const emptyHtml = renderToStaticMarkup(
    <StudyPracticeSection state={emptyState} subjects={subjects} onUpdateState={() => true} />
  );
  assert.match(emptyHtml, /Todavía no tenés preguntas cargadas/);
  assert.match(
    emptyHtml,
    /<button[^>]*bg-\[#4F46E5\] text-white[^>]*>\+ Nueva pregunta<\/button>/,
    'En estado vacío, + Nueva pregunta debe estilizarse como botón primario índigo Celestian'
  );
  assert.doesNotMatch(emptyHtml, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(emptyHtml, /var\(--blue/);

  const populatedState = defaultState();
  populatedState.study.subjects = subjects;
  populatedState.study.questions = [
    {
      id: 'q1',
      subjectId: 's1',
      prompt: '¿Unidad de fuerza en el SI?',
      options: [
        { id: 'o1', text: 'Newton' },
        { id: 'o2', text: 'Joule' },
      ],
      correctOptionId: 'o1',
      updatedAt: Date.now(),
    },
  ];

  const populatedHtml = renderToStaticMarkup(
    <StudyPracticeSection state={populatedState} subjects={subjects} onUpdateState={() => true} />
  );
  assert.match(
    populatedHtml,
    /<button[^>]*border border-\[var\(--border\)\] bg-\[var\(--bg-elevated\)\][^>]*>\+ Nueva pregunta<\/button>/,
    'Cuando ya hay preguntas, + Nueva pregunta debe volver a estilo secundario'
  );
  assert.match(
    populatedHtml,
    /<button[^>]*bg-\[#4F46E5\][^>]*>Comenzar repaso<\/button>/,
    'Comenzar repaso conserva el rol de CTA primario'
  );
  // Switches sobrios índigo Celestian (sin checkbox nativo ni CompletionCheck)
  assert.match(populatedHtml, /role="switch"[^>]*aria-label="Mostrar feedback inmediato"/);
  assert.match(populatedHtml, /role="switch"[^>]*aria-label="Con temporizador"/);
  assert.doesNotMatch(populatedHtml, /type="checkbox"/, 'Los toggles de Repaso no deben usar checkboxes nativos crudos');
  assert.doesNotMatch(populatedHtml, /data-completion-check/, 'Los toggles de configuración no deben usar CompletionCheck');
  // Cantidad de preguntas limitada al disponible (1 en lugar de 10)
  assert.match(populatedHtml, /Cantidad de preguntas<\/span><input type="number" min="1" max="1"[^>]*value="1"/);
  // Banco de preguntas con botones de ícono lápiz y tachito en vez de links de texto Editar/Eliminar
  const bankSection = populatedHtml.match(/<section aria-label="Banco de preguntas"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(bankSection, /aria-label="Editar pregunta: ¿Unidad de fuerza en el SI\?"/);
  assert.match(bankSection, /aria-label="Eliminar pregunta: ¿Unidad de fuerza en el SI\?"/);
  assert.doesNotMatch(bankSection, />Editar<\/button>/);
  assert.doesNotMatch(bankSection, />Eliminar<\/button>/);
  assert.doesNotMatch(populatedHtml, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(populatedHtml, /var\(--blue/);
});

test('Bloque 16: StudyAmbientPlayer usa botón secundario índigo sutil, slider custom, fila balanceada desktop y continuidad segura', () => {
  const html = renderToStaticMarkup(<StudyAmbientPlayer running={false} />);
  assert.match(html, /Sonidos de concentración/);
  // Botón secundario con borde + tinte suave (nunca botón primario sólido bg-[#4F46E5] text-white)
  assert.match(html, /border-\[#4F46E5\]\/30 bg-\[#4F46E5\]\/8 text-\[#4F46E5\]/);
  assert.doesNotMatch(html, /bg-\[#4F46E5\][^"]*text-white[^>]*>Reproducir/);
  // Fila desktop balanceada con ancho acotado en Ambiente y Volumen
  assert.match(html, /md:flex-row md:items-end/);
  assert.match(html, /md:w-64 lg:w-72/);
  assert.match(html, /md:max-w-\[260px\]/);
  // Track custom sin barra blanca nativa + progreso dinámico en índigo Celestian
  assert.match(html, /class="study-volume-slider w-full"/);
  assert.match(html, /--range-progress:50%/);
  // Nota al pie honesta sobre continuidad con sesión activa
  assert.match(html, /Siguen sonando en otras secciones mientras tu sesión de enfoque esté activa/);
  assert.doesNotMatch(html, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(html, /var\(--blue/);

  // Continuidad de audio ambiental: solo persiste al desmontar cuando hay sesión activa + audio adjunto + sonido habilitado
  stopAllAmbientNoise();
  assert.equal(isAmbientSessionAttached(), false);
  assert.equal(shouldKeepAmbientOnUnmount(true), false, 'Sin audio iniciado no mantiene nada');

  setAmbientSessionAttached(true);
  assert.equal(shouldKeepAmbientOnUnmount(true), true, 'Con sesión activa y audio adjunto continúa al navegar fuera de Estudios');
  assert.equal(shouldKeepAmbientOnUnmount(false), false, 'Sin sesión activa se detiene al desmontar para evitar fugas');

  stopAllAmbientNoise();
  assert.equal(isAmbientSessionAttached(), false, 'Detener audio limpia el vínculo con la sesión');
  assert.equal(shouldKeepAmbientOnUnmount(true), false);

  // Silencio global desactiva continuidad inmediatamente
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  try {
    setSoundEnabled(false);
    setAmbientSessionAttached(true);
    assert.equal(shouldKeepAmbientOnUnmount(true), false, 'Con sonido global silenciado no debe persistir al desmontar');
    setSoundEnabled(true);
    assert.equal(shouldKeepAmbientOnUnmount(true), true);
    stopAllAmbientNoise();
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
