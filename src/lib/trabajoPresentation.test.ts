import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrabajoView } from '../components/TrabajoView';
import { defaultState, todayISO } from './storage';
import { JobApplication } from '../types';

function renderTrabajo(applications: JobApplication[] = []): string {
  const state = defaultState();
  state.jobs.applications = applications;
  return renderToStaticMarkup(React.createElement(TrabajoView, { state, onUpdateState: () => undefined }));
}

const application = (id: string, estado: JobApplication['estado']): JobApplication => ({
  id,
  empresa: `Empresa ${id}`,
  puesto: 'Analista',
  estado,
  fecha: todayISO(),
});

test('Trabajo vacío muestra una sola bienvenida, conserva vistas y oculta métricas en cero', () => {
  const html = renderTrabajo();
  assert.match(html, /Tu búsqueda empieza acá/);
  assert.match(html, /Crear primera postulación/);
  assert.match(html, /Lista \/ Tabla/);
  assert.doesNotMatch(html, /Sin postulaciones/);
  assert.doesNotMatch(html, /En etapa CV enviado/);
});

test('Trabajo muestra una postulación en su etapa sin agregar contenido de ejemplo', () => {
  const html = renderTrabajo([application('única', 'entrevista')]);
  assert.match(html, /Empresa única/);
  assert.match(html, /Entrevista/);
  assert.doesNotMatch(html, /Scotiabank/);
  assert.match(html, /aria-label="Etapa del tablero"/);
  assert.match(html, /value="entrevista" selected="">Entrevista \(1\)<\/option>/);
  assert.doesNotMatch(html, /Sin postulaciones en esta etapa/);
  assert.equal((html.match(/Sin postulaciones<\/span>/g) || []).length, 5);
  assert.match(html, /lg:hidden/);
  assert.match(html, /hidden grid-cols-2 gap-2 lg:grid lg:grid-cols-4/);
});

test('Kanban convencional mantiene sus seis etapas en una pista horizontal y las tarjetas antiguas son convencionales', () => {
  const states: JobApplication['estado'][] = ['pendiente', 'cv_enviado', 'entrevista', 'oferta', 'rechazado', 'contratado'];
  const html = renderTrabajo(states.map((estado, index) => application(String(index + 1), estado)));
  for (const label of ['Pendiente', 'CV enviado', 'Entrevista', 'Oferta recibida', 'Rechazado', 'Contratado']) {
    assert.ok(html.includes(label), `Falta la etapa ${label}`);
  }
  assert.match(html, /grid w-full min-w-0 grid-flow-col auto-cols-\[minmax\(240px,1fr\)\]/);
  assert.match(html, /job-kanban-panorama/);
  assert.match(html, /overscroll-x-contain[^"]*touch-pan-x/);
  assert.match(html, /Empleo convencional/);
  assert.doesNotMatch(html, /value="ingreso_confirmado"/);
});

test('Trabajo muestra el Kanban público con etapas propias y sin columnas empresariales', () => {
  const contest = { ...application('llamado', 'lista_prelacion'), tipo: 'concurso' as const, empresa: 'Organismo X' };
  const html = renderTrabajo([contest]);
  assert.match(html, /Concurso público/);
  assert.match(html, /Lista de prelación/);
  assert.match(html, /Ingreso confirmado/);
  assert.doesNotMatch(html, /CV enviados/);
  assert.doesNotMatch(html, /CV enviado/);
  assert.match(html, /grid w-full min-w-0 grid-flow-col auto-cols-\[minmax\(240px,1fr\)\]/);
  assert.match(html, /No seleccionado/);
  assert.match(html, /Sorteo \/ Preselección/);
  assert.match(html, /value="no_seleccionado">No seleccionado \(0\)<\/option>/);
  assert.match(html, /value="lista_prelacion" selected="">Lista de prelación \(1\)<\/option>/);
});

test('métricas móviles priorizan procesos y seguimientos, con métricas secundarias accesibles', () => {
  const html = renderTrabajo([application('métrica', 'pendiente')]);
  assert.match(html, /Postulaciones/);
  assert.match(html, /Seguimientos vencidos o de hoy/);
  assert.match(html, /<summary[^>]*>Ver otras métricas<\/summary>/);
  assert.match(html, /CV enviados/);
  assert.match(html, /Entrevistas/);
  assert.match(html, /Empresas/);
});

test('Trabajo mantiene separado el Kanban cuando existen procesos mixtos', () => {
  const conventional = application('empresa', 'entrevista');
  const contest = { ...application('llamado', 'lista_prelacion'), tipo: 'concurso' as const, empresa: 'Organismo X' };
  const html = renderTrabajo([conventional, contest]);
  assert.match(html, /Empresa empresa/);
  assert.doesNotMatch(html, /Organismo X/);
  assert.match(html, /Todos los procesos \(solo en Lista\)/);
});

test('Trabajo destaca seguimientos próximos sin cambiar su fecha ni descripción', () => {
  const followup = { ...application('seguimiento', 'cv_enviado'), nextAction: 'Consultar por el proceso', nextActionDate: todayISO() };
  const html = renderTrabajo([followup]);
  assert.match(html, /Próximos seguimientos/);
  assert.match(html, /Consultar por el proceso · Empresa seguimiento/);
});
