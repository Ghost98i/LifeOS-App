import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { getSafeJobHref, normalizeJobUrl, saveJobApplication } from './jobApplications';
import { calendarItemsOnDate } from './calculations';
import { getTodayAgendaEntries } from './todayOverview';
import { agendaWeek, parseLocalDateISO } from './agendaWeek';
import { TrabajoView } from '../components/TrabajoView';
import { CalendarioView } from '../components/CalendarioView';
import { DashboardView } from '../components/DashboardView';
import { AgendaView } from '../components/AgendaView';
import type { JobApplication } from '../types';

const noopUpdate = () => true;

test('Bloque 20.1: normalizeJobUrl normaliza dominios sin protocolo, acepta vacíos y rechaza URLs inválidas', () => {
  assert.deepEqual(normalizeJobUrl(''), { url: '', valid: true });
  assert.deepEqual(normalizeJobUrl('   '), { url: '', valid: true });
  assert.deepEqual(normalizeJobUrl('gemini.com'), { url: 'https://gemini.com', valid: true });
  assert.deepEqual(normalizeJobUrl('buscojobs.com.uy/oferta'), {
    url: 'https://buscojobs.com.uy/oferta',
    valid: true,
  });
  assert.deepEqual(normalizeJobUrl('uruguayconcursa.gub.uy/test'), {
    url: 'https://uruguayconcursa.gub.uy/test',
    valid: true,
  });
  assert.deepEqual(normalizeJobUrl('https://ya-valida.com'), {
    url: 'https://ya-valida.com',
    valid: true,
  });
  assert.deepEqual(normalizeJobUrl('HTTP://Ejemplo.com/aviso?id=42'), {
    url: 'http://Ejemplo.com/aviso?id=42',
    valid: true,
  });

  // Inválidas: sin punto, con espacios, o protocolos no web
  assert.equal(normalizeJobUrl('solotexto').valid, false);
  assert.equal(normalizeJobUrl('gemini .com').valid, false);
  assert.equal(normalizeJobUrl('https://con espacio.com').valid, false);
  assert.equal(normalizeJobUrl('javascript:alert(1)').valid, false);
  assert.equal(normalizeJobUrl('foo.').valid, false);

  // getSafeJobHref normaliza datos legacy y descarta inválidos
  assert.equal(getSafeJobHref('uruguayconcursa.gub.uy/llamado-12'), 'https://uruguayconcursa.gub.uy/llamado-12');
  assert.equal(getSafeJobHref('texto invalido'), null);
  assert.equal(getSafeJobHref(''), null);

  // saveJobApplication normaliza al guardar y rechaza URL inválida
  const saved = saveJobApplication(
    [],
    {
      tipo: 'convencional',
      empresa: 'Gemini',
      puesto: 'Product',
      estado: 'cv_enviado',
      fecha: todayISO(),
      link: 'gemini.com/careers',
    },
    null,
    () => 'app-url-1'
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.applications[0].link, 'https://gemini.com/careers');

  const rejected = saveJobApplication(
    [],
    {
      tipo: 'convencional',
      empresa: 'Gemini',
      puesto: 'Product',
      estado: 'cv_enviado',
      fecha: todayISO(),
      link: 'sin punto ni protocolo',
    },
    null,
    () => 'app-url-bad'
  );
  assert.equal(rejected.saved, false);
  assert.equal(rejected.reason, 'invalid_url');
});

test('Bloque 20.1: TrabajoView usa input text+inputMode=url y normaliza href legacy en Tablero y Lista', () => {
  const state = defaultState();
  const legacyApp: JobApplication = {
    id: 'legacy-url',
    tipo: 'convencional',
    empresa: 'PedidosYa',
    puesto: 'Frontend',
    estado: 'cv_enviado',
    fecha: todayISO(),
    link: 'buscojobs.com.uy/oferta-123',
  };
  state.jobs.applications = [legacyApp];

  const formHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialFormOpen={true} />
  );
  assert.match(formHtml, /type="text"[^>]*inputMode="url"/);
  assert.doesNotMatch(formHtml, /type="url"/, 'No debe usar input type="url" para evitar tooltip nativo del navegador');

  // Href normalizado con https:// en Tablero y Lista aunque el registro guardado no tuviera protocolo
  assert.match(formHtml, /href="https:\/\/buscojobs\.com\.uy\/oferta-123"/);

  const listHtml = renderToStaticMarkup(
    <TrabajoView state={state} onUpdateState={noopUpdate} initialViewMode="table" />
  );
  assert.match(listHtml, /href="https:\/\/buscojobs\.com\.uy\/oferta-123"/);
});

test('Bloque 20.1: Fechas de Trabajo (seguimiento + fecha clave) se proyectan en Calendario sin duplicar estado', () => {
  const today = todayISO();
  const state = defaultState();
  state.settings.hiddenTabs = state.settings.hiddenTabs.filter((t) => t !== 'trabajo');
  state.jobs.applications = [
    {
      id: 'app-cal',
      tipo: 'convencional',
      empresa: 'Mercado Libre',
      puesto: 'UI Engineer',
      estado: 'entrevista',
      fecha: today,
      nextAction: 'Enviar portfolio actualizado',
      nextActionDate: today,
      keyDates: [{ id: 'kd-ent', kind: 'entrevista', date: today, time: '15:30' }],
    },
    {
      id: 'app-rejected',
      tipo: 'convencional',
      empresa: 'Cerrada SA',
      puesto: 'QA',
      estado: 'rechazado',
      fecha: today,
      nextAction: 'No debería aparecer',
      nextActionDate: today,
      keyDates: [{ id: 'kd-rej', kind: 'prueba', date: today }],
    },
  ];

  const snapshotBefore = JSON.stringify(state);
  const items = calendarItemsOnDate(state, today);
  assert.equal(JSON.stringify(state), snapshotBefore, 'La proyección es read-only y no muta el estado');
  assert.equal(state.calendarEvents.length, 0, 'No crea CalendarEvent duplicados');

  const keyItem = items.find((i) => i.id === 'job:app-cal:kd-ent');
  const followupItem = items.find((i) => i.id === 'job-followup:app-cal');
  assert.ok(keyItem, 'Debe proyectar fecha clave activa en Calendario');
  assert.equal(keyItem.time, '15:30');
  assert.equal(keyItem.isJobFollowup, undefined);

  assert.ok(followupItem, 'Debe proyectar fecha de seguimiento activa en Calendario');
  assert.equal(followupItem.isJobFollowup, true);
  assert.equal(followupItem.jobApplicationId, 'app-cal');
  assert.equal(items.some((i) => i.jobApplicationId === 'app-rejected'), false, 'No proyecta postulaciones cerradas');

  const calHtml = renderToStaticMarkup(
    <CalendarioView
      state={state}
      onUpdateState={noopUpdate}
      onNavigateToRecord={() => {}}
    />
  );
  assert.match(calHtml, /Entrevista · Mercado Libre/);
  assert.match(calHtml, /Trabajo · fecha clave/);
  assert.match(calHtml, /Enviar portfolio actualizado · Mercado Libre/);
  assert.match(calHtml, /Trabajo · seguimiento/);
  assert.match(calHtml, /data-app-icon="briefcase"/);

  // Si Trabajo está oculto, no se proyectan
  state.settings.hiddenTabs = ['trabajo'];
  assert.equal(calendarItemsOnDate(state, today).length, 0);
});

test('Bloque 20.1: Fechas de Trabajo (seguimiento vencido/hoy + fecha clave hoy) se proyectan en Hoy sin duplicarse', () => {
  const today = todayISO();
  const state = defaultState();
  state.settings.hiddenTabs = state.settings.hiddenTabs.filter((t) => t !== 'trabajo');
  state.jobs.applications = [
    {
      id: 'app-hoy',
      tipo: 'concurso',
      empresa: 'BROU',
      puesto: 'Administrativo',
      estado: 'prueba_evaluacion',
      fecha: today,
      nextAction: 'Consultar tribunal',
      nextActionDate: today,
      keyDates: [{ id: 'kd-prueba', kind: 'prueba', date: today, time: '10:00' }],
    },
  ];

  const entries = getTodayAgendaEntries(state, today);
  const jobEntries = entries.filter((e) => e.source === 'trabajo');
  // Exactamente 2 ítems: 1 seguimiento completable (de todayItems) + 1 fecha clave (de calendarItemsOnDate), sin duplicar el seguimiento
  assert.equal(jobEntries.length, 2);

  const followup = jobEntries.find((e) => e.todayItem?.kind === 'complete-followup');
  const keyDate = jobEntries.find((e) => e.calendarItem?.id === 'job:app-hoy:kd-prueba');
  assert.ok(followup, 'Debe incluir el seguimiento de hoy como ítem accionable');
  assert.equal(followup.navigationTarget, 'trabajo');
  assert.ok(keyDate, 'Debe incluir la fecha clave de hoy en Tu día');
  assert.equal(keyDate.time, '10:00');
  assert.equal(keyDate.navigationTarget, 'trabajo');

  const dashHtml = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={noopUpdate}
      onNavigate={() => {}}
      onNavigateToRecord={() => {}}
      onExportJSON={() => {}}
    />
  );
  assert.match(dashHtml, /Prueba · BROU \(Administrativo\)/);
  assert.match(dashHtml, /Consultar tribunal — BROU/);
  assert.match(dashHtml, /lucide-briefcase/);
});

test('Bloque 20.1: Fechas de Trabajo (clave con hora + seguimiento) se proyectan en Agenda sin mezclarse con Rutinas', () => {
  const today = todayISO();
  const state = defaultState();
  state.settings.hiddenTabs = state.settings.hiddenTabs.filter((t) => t !== 'trabajo');
  state.tasksRecurring = [{ id: 'rut-1', name: 'Tomar agua', freq: 'daily' }];
  state.jobs.applications = [
    {
      id: 'app-ag',
      tipo: 'convencional',
      empresa: 'Globant',
      puesto: 'Tech Lead',
      estado: 'entrevista',
      fecha: today,
      nextAction: 'Escribir a recruiter',
      nextActionDate: today,
      keyDates: [{ id: 'kd-ag', kind: 'entrevista', date: today, time: '14:00' }],
    },
  ];

  const week = agendaWeek(state, parseLocalDateISO(today)!);
  const todayDay = week.find((d) => d.date === today)!;
  assert.equal(todayDay.routines.length, 1, 'Las rutinas no deben contaminarse con ítems de Trabajo');
  assert.equal(todayDay.events.some((e) => e.id === 'job:app-ag:kd-ag' && e.time === '14:00'), true);
  assert.equal(todayDay.events.some((e) => e.id === 'job-followup:app-ag' && e.isJobFollowup), true);

  const agendaHtml = renderToStaticMarkup(
    <AgendaView
      state={state}
      onUpdateState={noopUpdate}
      onNavigateToRecord={() => {}}
    />
  );
  assert.match(agendaHtml, /Entrevista · Globant \(Tech Lead\)/);
  assert.match(agendaHtml, />14:00</);
  assert.match(agendaHtml, />Trabajo<\/span>/);
  assert.match(agendaHtml, /Escribir a recruiter · Globant/);
  assert.match(agendaHtml, />Trabajo · seguimiento<\/span>/);
  assert.match(agendaHtml, /aria-label="Abrir en Trabajo: Entrevista · Globant \(Tech Lead\)"/);
  assert.match(agendaHtml, /data-app-icon="briefcase"/);
});
