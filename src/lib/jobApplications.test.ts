import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState } from './storage';
import { mergeJobsModule } from './syncMerge';
import { jobStats, todayItems } from './calculations';
import {
  filterJobApplications,
  getEffectiveJobKeyDates,
  getJobApplicationType,
  getNextJobKeyDate,
  isJobApplicationActive,
  isJobStatusForType,
  JOB_STAGES,
  normalizeJobKeyDates,
  saveJobApplication,
} from './jobApplications';
import { JobApplication } from '../types';
import { JobApplicationDraft } from './jobApplications';

const makeDraft = (tipo: JobApplicationDraft['tipo'], estado: JobApplicationDraft['estado']): JobApplicationDraft => ({
  tipo,
  empresa: tipo === 'concurso' ? 'Organismo X' : 'Empresa X',
  puesto: 'Cargo de prueba',
  estado,
  fecha: '2026-10-22',
  reclutador: 'Contacto',
  notas: 'Nota conservada',
  link: 'https://example.org/convocatoria',
  nextAction: 'Revisar novedades',
  nextActionDate: '2026-10-24',
});

test('registros heredados sin tipo siguen siendo empleo convencional y mantienen sus etapas', () => {
  const legacy: JobApplication = { id: 'legacy', empresa: 'Empresa anterior', puesto: 'Analista', estado: 'oferta', fecha: '2026-01-10' };
  const normalized = normalizeStoredState({ jobs: { opportunities: [], applications: [legacy] } });
  assert.equal(normalized.jobs.applications[0].tipo, undefined);
  assert.equal(getJobApplicationType(normalized.jobs.applications[0]), 'convencional');
  assert.equal(normalized.jobs.applications[0].estado, 'oferta');
  assert.equal(isJobStatusForType('convencional', 'oferta'), true);
});

test('crea ambos tipos y permite saltar directamente a cualquier etapa aplicable', () => {
  const conventional = saveJobApplication([], makeDraft('convencional', 'contratado'), null, () => 'conv-1');
  const contest = saveJobApplication([], makeDraft('concurso', 'prueba_evaluacion'), null, () => 'contest-1');
  assert.equal(conventional.saved, true);
  assert.equal(conventional.applications[0].id, 'conv-1');
  assert.equal(conventional.applications[0].tipo, 'convencional');
  assert.equal(conventional.applications[0].estado, 'contratado');
  assert.equal(contest.saved, true);
  assert.equal(contest.applications[0].estado, 'prueba_evaluacion');
  assert.equal(contest.applications[0].tipo, 'concurso');
  assert.equal(isJobStatusForType('concurso', 'prueba_evaluacion'), true);
  assert.equal(JOB_STAGES.concurso.length, 8);
});

test('edición mantiene ID, origen, campos adicionales y seguimiento; un estado incompatible exige una elección', () => {
  const current = {
    ...makeDraft('convencional', 'oferta'),
    id: 'linked-record',
    sourceOpportunityId: 'opp-7',
    integrationMarker: 'preserve-me',
  } as JobApplication & { integrationMarker: string };
  const incompatible = saveJobApplication([current], makeDraft('concurso', 'oferta'), current.id);
  assert.equal(incompatible.saved, false);
  assert.equal(incompatible.reason, 'invalid_status');
  const edited = saveJobApplication([current], makeDraft('concurso', 'lista_prelacion'), current.id);
  assert.equal(edited.saved, true);
  assert.equal(edited.applications[0].id, 'linked-record');
  assert.equal(edited.applications[0].sourceOpportunityId, 'opp-7');
  assert.equal((edited.applications[0] as typeof current).integrationMarker, 'preserve-me');
  assert.equal(edited.applications[0].nextAction, 'Revisar novedades');
  assert.equal(edited.applications[0].nextActionDate, '2026-10-24');
  assert.equal(edited.applications[0].tipo, 'concurso');
});

test('el filtrado conjunto incluye tipos mixtos y el filtro de Kanban mantiene tipos separados', () => {
  const conventional = { ...makeDraft('convencional', 'cv_enviado'), id: 'c' };
  const contest = { ...makeDraft('concurso', 'lista_prelacion'), id: 'p' };
  const mixed = [conventional, contest];
  assert.deepEqual(filterJobApplications(mixed, 'convencional').map((application) => application.id), ['c']);
  assert.deepEqual(filterJobApplications(mixed, 'concurso').map((application) => application.id), ['p']);
  assert.deepEqual(filterJobApplications(mixed, 'todos').map((application) => application.id), ['c', 'p']);
});

test('tipo y etapas sobreviven a serialización, normalización y merge de sincronización', () => {
  const state = defaultState();
  state.jobs.applications = [
    { ...makeDraft('concurso', 'ingreso_confirmado'), id: 'saved-contest' },
    { ...makeDraft('convencional', 'contratado'), id: 'saved-job' },
  ];
  const reloaded = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.jobs.applications[0].tipo, 'concurso');
  assert.equal(reloaded.jobs.applications[0].estado, 'ingreso_confirmado');
  assert.equal(reloaded.jobs.applications[1].tipo, 'convencional');
  assert.equal(reloaded.jobs.applications[1].estado, 'contratado');

  const merged = mergeJobsModule(
    { opportunities: [], applications: [reloaded.jobs.applications[0]] },
    { opportunities: [], applications: [{ ...reloaded.jobs.applications[0], notas: 'Actualizado en otro dispositivo' }] }
  );
  assert.equal(merged.applications[0].tipo, 'concurso');
  assert.equal(merged.applications[0].estado, 'ingreso_confirmado');
});

test('métricas distinguen CVs, inscripciones y cierres sin inferir estados entre tipos', () => {
  const state = defaultState();
  state.jobs.applications = [
    { ...makeDraft('convencional', 'cv_enviado'), id: 'cv' },
    { ...makeDraft('convencional', 'entrevista'), id: 'interview' },
    { ...makeDraft('convencional', 'contratado'), id: 'hired' },
    { ...makeDraft('concurso', 'inscripto'), id: 'registered' },
    { ...makeDraft('concurso', 'no_seleccionado'), id: 'not-selected' },
    { ...makeDraft('concurso', 'ingreso_confirmado'), id: 'public-hire' },
  ];
  const all = jobStats(state, 'todos');
  assert.equal(all.cvEnviados, 1);
  assert.equal(all.entrevistas, 1);
  assert.equal(all.inscripciones, 3);
  assert.equal(all.contratados, 1);
  assert.equal(all.ingresosConfirmados, 1);
  assert.equal(jobStats(state, 'concurso').cvEnviados, 0);
  assert.equal(jobStats(state, 'concurso').entrevistas, 0);
});

test('seguimientos de concursos siguen llegando a Hoy con la integración existente', () => {
  const state = defaultState();
  state.settings.hiddenTabs = state.settings.hiddenTabs.filter((tab) => tab !== 'trabajo');
  state.jobs.applications = [{
    ...makeDraft('concurso', 'lista_prelacion'),
    id: 'public-followup',
    nextActionDate: '2026-10-20',
  }];
  const followups = todayItems(state, '2026-10-22', true).filter((item) => item.source === 'trabajo');
  assert.equal(followups.length, 1);
  assert.match(followups[0].text, /Organismo X/);
  assert.equal(followups[0].kind, 'complete-followup');
});

test('fechas clave: normalización descarta entradas inválidas, nextActionDate se muestra como otro sin duplicar y fechas vencidas no se ocultan', () => {
  const cleaned = normalizeJobKeyDates([
    { id: 'kd-1', kind: 'prueba', date: '2026-11-20', time: '09:30', note: 'Teórica' },
    { id: 'bad-date', kind: 'entrevista', date: 'no-iso' },
    { id: 'bad-kind', kind: 'desconocido', date: '2026-11-22' },
    null,
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].id, 'kd-1');
  assert.equal(cleaned[0].time, '09:30');

  const appWithLegacyNext: JobApplication = {
    id: 'app-1',
    empresa: 'Organismo Y',
    puesto: 'Técnico',
    estado: 'inscripto',
    fecha: '2026-11-01',
    nextAction: 'Consultar lista',
    nextActionDate: '2026-11-25',
    keyDates: [{ id: 'kd-past', kind: 'inscripcion', date: '2026-11-10', note: 'Vencida' }],
  };
  const effective = getEffectiveJobKeyDates(appWithLegacyNext);
  assert.equal(effective.length, 2);
  assert.equal(effective[1].kind, 'otro');
  assert.equal(effective[1].isLegacyNextAction, true);

  // Fechas pasadas aparecen como vencidas en getNextJobKeyDate, no se ocultan
  const next = getNextJobKeyDate(appWithLegacyNext, '2026-11-18');
  assert.ok(next);
  assert.equal(next.proximity, 'overdue');
  assert.equal(next.keyDate.id, 'kd-past');

  assert.equal(isJobApplicationActive({ estado: 'entrevista' }), true);
  assert.equal(isJobApplicationActive({ estado: 'rechazado' }), false);
  assert.equal(isJobApplicationActive({ estado: 'no_seleccionado' }), false);
  assert.equal(isJobApplicationActive({ estado: 'contratado' }), false);
  assert.equal(isJobApplicationActive({ estado: 'ingreso_confirmado' }), false);
});

test('mergeJobsModule conserva keyDates con tombstones y followUpNotes entre dispositivos', () => {
  const baseApp: JobApplication = {
    id: 'app-sync',
    empresa: 'Acme',
    puesto: 'Dev',
    estado: 'entrevista',
    fecha: '2026-11-01',
    keyDates: [
      { id: 'kd-base', kind: 'inscripcion', date: '2026-11-05' },
      { id: 'kd-del', kind: 'otro', date: '2026-11-08' },
    ],
  };
  const localApp: JobApplication = {
    ...baseApp,
    followUpNotes: 'Contactar el lunes',
    keyDates: [
      baseApp.keyDates![0],
      { id: 'kd-local', kind: 'entrevista', date: '2026-11-20', time: '14:00' },
    ],
  };
  const remoteApp: JobApplication = {
    ...baseApp,
    notas: 'Postulación prioritaria',
    keyDates: [
      ...baseApp.keyDates!,
      { id: 'kd-remote', kind: 'prueba', date: '2026-11-22' },
    ],
  };
  const merged = mergeJobsModule(
    { opportunities: [], applications: [localApp] },
    { opportunities: [], applications: [remoteApp] },
    { opportunities: [], applications: [baseApp] },
    { 'kd-del': 5000 },
  );
  assert.equal(merged.applications.length, 1);
  const mergedApp = merged.applications[0];
  assert.equal(mergedApp.followUpNotes, 'Contactar el lunes');
  assert.equal(mergedApp.notas, 'Postulación prioritaria');
  assert.equal(mergedApp.keyDates?.some((k) => k.id === 'kd-del'), false);
  assert.equal(mergedApp.keyDates?.some((k) => k.id === 'kd-local'), true);
  assert.equal(mergedApp.keyDates?.some((k) => k.id === 'kd-remote'), true);
});
