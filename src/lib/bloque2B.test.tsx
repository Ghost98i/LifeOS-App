import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import {
  addStudyProgram,
  createGuidedStudySetup,
  filterExamsByProgram,
  filterSubjectsByProgram,
  GENERAL_PROGRAM_FILTER,
} from './studyPresentation';
import { hasAdvancedJobDetails, saveJobApplication } from './jobApplications';
import { sendProjectNextStepToToday, sendProjectTaskToToday } from './projectFlows';
import { getTodayRadarMilestones } from './todayControlCenter';
import { EstudiosView } from '../components/EstudiosView';
import { TrabajoView } from '../components/TrabajoView';
import { DashboardView } from '../components/DashboardView';
import type { JobApplication, Project } from '../types';

function offsetIso(baseIso: string, deltaDays: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 1. Estudios: StudyProgram + retrocompatibilidad + estado vacío guiado
// ---------------------------------------------------------------------------

test('Estudios: creación guiada de StudyProgram + materias asociadas y retrocompatibilidad con materias sin programId', () => {
  const state = defaultState();
  // Legacy subject without programId
  state.study.subjects.push({ id: 'legacy-1', name: 'Matemática Discreta' });

  let seq = 1;
  const setup = createGuidedStudySetup(
    state,
    {
      kind: 'carrera',
      programName: 'Ingeniería en Sistemas',
      subjectsRaw: 'Álgebra Lineal, Programación I',
    },
    () => `id-${seq++}`
  );

  assert.equal(setup.success, true);
  assert.equal(setup.program?.name, 'Ingeniería en Sistemas');
  assert.equal(setup.program?.kind, 'carrera');
  assert.equal(setup.subjectsCreated.length, 2);
  assert.equal(setup.subjectsCreated[0].programId, setup.program?.id);
  assert.equal(setup.subjectsCreated[1].programId, setup.program?.id);

  // Add a second concurrent program (course)
  const course = addStudyProgram(state, { name: 'Inglés B2', kind: 'curso', institution: 'Anglo' }, () => 'prog-course');
  assert.equal(course.success, true);
  state.study.subjects.push({ id: 'sub-en', name: 'Speaking', programId: 'prog-course' });

  // Filtering by program
  const ingSubjects = filterSubjectsByProgram(state.study.subjects, setup.program!.id, state.study.programs);
  assert.deepEqual(ingSubjects.map((s) => s.name), ['Álgebra Lineal', 'Programación I']);

  // Legacy subjects appear under Generales
  const generalSubjects = filterSubjectsByProgram(state.study.subjects, GENERAL_PROGRAM_FILTER, state.study.programs);
  assert.deepEqual(generalSubjects.map((s) => s.name), ['Matemática Discreta']);

  // Exams filter by program
  state.study.exams.push(
    { id: 'ex-1', title: 'Parcial 1', subjectId: setup.subjectsCreated[0].id, date: todayISO(), status: 'pendiente' },
    { id: 'ex-legacy', title: 'Final Discreta', subjectId: 'legacy-1', date: todayISO(), status: 'pendiente' }
  );
  const ingExams = filterExamsByProgram(state.study.exams, state.study.subjects, setup.program!.id, state.study.programs);
  assert.deepEqual(ingExams.map((e) => e.id), ['ex-1']);
  const genExams = filterExamsByProgram(state.study.exams, state.study.subjects, GENERAL_PROGRAM_FILTER, state.study.programs);
  assert.deepEqual(genExams.map((e) => e.id), ['ex-legacy']);

  // Normalization preserves programs and optional programId without breaking legacy subjects
  const normalized = normalizeStoredState(state);
  assert.equal(normalized.study.programs?.length, 2);
  assert.equal(normalized.study.subjects.find((s) => s.id === 'legacy-1')?.programId, undefined);
  assert.equal(normalized.study.subjects.find((s) => s.id === 'sub-en')?.programId, 'prog-course');
});

test('EstudiosView: estado vacío muestra tarjeta guiada arriba y barra de programas al tener programas', () => {
  const emptyState = defaultState();
  const emptyHtml = renderToStaticMarkup(
    <EstudiosView state={emptyState} onUpdateState={() => true} />
  );
  assert.match(emptyHtml, /Organizá lo que estás estudiando/);
  assert.match(emptyHtml, /Carrera \/ Facultad/);
  assert.match(emptyHtml, /Curso \/ Idioma/);
  assert.match(emptyHtml, /Certificación/);
  assert.match(emptyHtml, /Autoestudio/);
  assert.match(emptyHtml, /Iniciar sesión libre de 25 min/);
  assert.doesNotMatch(emptyHtml, /aria-label="Para estudiar"/);

  const activeState = defaultState();
  activeState.study.programs = [{ id: 'p1', name: 'Licenciatura', kind: 'carrera' }];
  activeState.study.subjects = [
    { id: 's1', name: 'Cálculo', programId: 'p1' },
    { id: 's2', name: 'Lectura libre' },
  ];
  const activeHtml = renderToStaticMarkup(
    <EstudiosView state={activeState} onUpdateState={() => true} />
  );
  assert.match(activeHtml, /aria-label="Filtrar por carrera o curso"/);
  assert.match(activeHtml, />Licenciatura</);
  assert.match(activeHtml, />Generales</);
});

// ---------------------------------------------------------------------------
// 2. Trabajo: source + formulario progresivo + visualización
// ---------------------------------------------------------------------------

test('Trabajo: guarda JobApplication.source, muestra sugerencias y pliega detalles avanzados por defecto', () => {
  const saved = saveJobApplication(
    [],
    {
      tipo: 'convencional',
      empresa: 'PedidosYa',
      puesto: 'Frontend Engineer',
      estado: 'cv_enviado',
      fecha: todayISO(),
      source: '  LinkedIn  ',
    },
    null,
    () => 'app-1'
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.applications[0].source, 'LinkedIn');
  assert.equal(hasAdvancedJobDetails(saved.applications[0]), false);
  assert.equal(hasAdvancedJobDetails({ ...saved.applications[0], reclutador: 'Ana' }), true);

  // Progressive disclosure form open on empty state: shows essential fields & hides advanced block initially
  const emptyState = defaultState();
  const formHtml = renderToStaticMarkup(
    <TrabajoView state={emptyState} onUpdateState={() => true} initialFormOpen={true} initialFormType="convencional" />
  );
  assert.match(formHtml, /Dónde te postulaste/);
  assert.match(formHtml, />LinkedIn</);
  assert.match(formHtml, />BuscoJobs</);
  assert.match(formHtml, /Detalles, notas y fechas clave/);
  assert.doesNotMatch(formHtml, /id="job-form-advanced-details"/);

  // Source badge renders on Kanban card when present
  const stateWithApp = defaultState();
  stateWithApp.jobs.applications = saved.applications as JobApplication[];
  const boardHtml = renderToStaticMarkup(
    <TrabajoView state={stateWithApp} onUpdateState={() => true} />
  );
  assert.match(boardHtml, /PedidosYa/);
  assert.match(boardHtml, /LinkedIn/);
});

// ---------------------------------------------------------------------------
// 3. Notas fijadas en Hoy V3
// ---------------------------------------------------------------------------

test('Hoy V3: tira de notas fijadas aparece solo si hay fijadas y Notas está habilitado', () => {
  const baseState = defaultState();
  const noPinnedHtml = renderToStaticMarkup(
    <DashboardView state={baseState} onUpdateState={() => true} onNavigate={() => {}} onExportJSON={() => {}} />
  );
  assert.doesNotMatch(noPinnedHtml, /today-pinned-notes-title/);

  // Add pinned notes + archived pinned note (archived must not appear)
  baseState.notes.postits.push(
    { id: 'n1', title: 'Checklist viaje', text: 'Pasaporte y cargador', date: todayISO(), pinned: true },
    { id: 'n2', text: 'Idea rápida sin título', date: todayISO(), pinned: true },
    { id: 'n3', title: 'Archivada', text: 'No debería verse', date: todayISO(), pinned: true, archived: true }
  );

  const pinnedHtml = renderToStaticMarkup(
    <DashboardView
      state={baseState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      onOpenQuickNote={() => {}}
      onOpenNote={() => {}}
    />
  );
  assert.match(pinnedHtml, /today-pinned-notes-title/);
  assert.match(pinnedHtml, /Fijadas/);
  assert.match(pinnedHtml, /Checklist viaje/);
  assert.match(pinnedHtml, /Idea rápida sin título/);
  assert.match(pinnedHtml, /Nota rápida/);
  assert.match(pinnedHtml, /Abrir Notas/);
  assert.doesNotMatch(pinnedHtml, /Archivada/);

  // Disabled notas module hides the strip
  baseState.settings.hiddenTabs = ['notas'];
  const hiddenModuleHtml = renderToStaticMarkup(
    <DashboardView state={baseState} onUpdateState={() => true} onNavigate={() => {}} onExportJSON={() => {}} />
  );
  assert.doesNotMatch(hiddenModuleHtml, /today-pinned-notes-title/);
});

// ---------------------------------------------------------------------------
// 4. Proyectos → Hoy (trazabilidad) + Radar (ventana 14 días)
// ---------------------------------------------------------------------------

test('ProjectsManager flows: enviar próximo paso y subtarea a Hoy crea TodayExtra con linkedType=project y linkedId sin duplicar', () => {
  const state = defaultState();
  const today = todayISO();
  const project: Project = {
    id: 'proj-alpha',
    name: 'Lanzamiento V3',
    objective: 'Publicar release estable',
    status: 'activo',
    nextStep: 'Revisar changelog final',
    tasks: [
      { id: 'pt-1', text: 'Preparar capturas', done: false, priority: 'alta' },
      { id: 'pt-2', text: 'Tarea completada', done: true },
    ],
    createdAt: today,
  };

  const firstStep = sendProjectNextStepToToday(state, project, today, () => 'ex-step-1');
  assert.equal(firstStep.added, true);
  assert.equal(firstStep.extra?.linkedType, 'project');
  assert.equal(firstStep.extra?.linkedId, 'proj-alpha');
  assert.equal(firstStep.extra?.text, '[Lanzamiento V3] Revisar changelog final');

  // Duplicate on same day is prevented
  const duplicateStep = sendProjectNextStepToToday(state, project, today, () => 'ex-step-2');
  assert.equal(duplicateStep.added, false);
  assert.equal(duplicateStep.reason, 'duplicate');

  // Subtask send
  const taskRes = sendProjectTaskToToday(state, project, project.tasks[0], today, () => 'ex-task-1');
  assert.equal(taskRes.added, true);
  assert.equal(taskRes.extra?.linkedType, 'project');
  assert.equal(taskRes.extra?.linkedId, 'proj-alpha');

  // Completed task cannot be sent
  const completedRes = sendProjectTaskToToday(state, project, project.tasks[1], today, () => 'ex-task-2');
  assert.equal(completedRes.added, false);
  assert.equal(completedRes.reason, 'completed');
});

test('getTodayRadarMilestones: proyecta revisiones y tareas de proyectos activos en ventana de 14 días + vencidas', () => {
  const today = '2026-08-10';
  const state = defaultState();
  state.projects = [
    {
      id: 'p-active',
      name: 'App Mobile',
      objective: 'Beta',
      status: 'activo',
      nextStep: 'Build',
      reviewDate: offsetIso(today, 5),
      tasks: [
        { id: 't-overdue', text: 'Corregir crash', done: false, dueDate: offsetIso(today, -2) },
        { id: 't-soon', text: 'Subir a TestFlight', done: false, dueDate: offsetIso(today, 14) },
        { id: 't-far', text: 'Hito lejano', done: false, dueDate: offsetIso(today, 20) },
        { id: 't-done', text: 'Ya resuelta', done: true, dueDate: offsetIso(today, 1) },
      ],
      createdAt: today,
    },
    {
      id: 'p-paused',
      name: 'Proyecto en pausa',
      objective: '',
      status: 'en_pausa',
      nextStep: '',
      reviewDate: offsetIso(today, 2),
      tasks: [{ id: 't-paused', text: 'No mostrar', done: false, dueDate: offsetIso(today, 1) }],
      createdAt: today,
    },
  ];

  const milestones = getTodayRadarMilestones(state, today, 10);
  const ids = milestones.map((m) => m.id);
  assert.ok(ids.includes('radar-project-task-t-overdue'));
  assert.ok(ids.includes('radar-project-review-p-active'));
  assert.ok(ids.includes('radar-project-task-t-soon'));
  assert.ok(!ids.includes('radar-project-task-t-far'));
  assert.ok(!ids.includes('radar-project-task-t-done'));
  assert.ok(!ids.includes('radar-project-review-p-paused'));
  assert.ok(!ids.includes('radar-project-task-t-paused'));

  const reviewMilestone = milestones.find((m) => m.id === 'radar-project-review-p-active');
  assert.equal(reviewMilestone?.module, 'proyectos');
  assert.equal(reviewMilestone?.moduleLabel, 'Proyectos');
  assert.equal(reviewMilestone?.targetView, 'notas');
  assert.equal(reviewMilestone?.targetTab, 'proyectos');

  // When notas module is hidden, project milestones are excluded
  state.settings.hiddenTabs = ['notas'];
  const hiddenMilestones = getTodayRadarMilestones(state, today, 10);
  assert.equal(hiddenMilestones.filter((m) => m.module === 'proyectos').length, 0);
});
