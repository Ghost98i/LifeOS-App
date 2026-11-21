import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from '../lib/storage';
import { CommercialWorkspace } from './CommercialWorkspace';
import { CommercialInventorySandbox } from './CommercialInventorySandbox';
import { AgendaView } from './AgendaView';
import { CalendarioView } from './CalendarioView';
import { GymStarterPanel } from './GymStarterPanel';
import { IAView } from './IAView';
import { NotasView } from './NotasView';
import { ProjectsManager } from './ProjectsManager';
import { ConfigView } from './ConfigView';
import { PrivacySecuritySection } from './PrivacySecuritySection';

test('Micro-pulido 1 y 2: CommercialWorkspace sin sesión envuelve el aviso en SurfaceCard y el CTA vacío tiene disabled:opacity-50', () => {
  const state = defaultState();
  const wsHtml = renderToStaticMarkup(
    <CommercialWorkspace
      state={state}
      userId={undefined}
      syncStatus="signed-out"
      onUpdate={() => true}
    />
  );

  assert.match(wsHtml, /rounded-2xl border border-slate-200\/80[^>]*>[\s\S]*Sesión requerida para operar/);
  assert.match(wsHtml, /role="status"/);
  assert.match(wsHtml, /<fieldset aria-label="Operaciones comerciales" disabled=""/);

  const sandboxHtml = renderToStaticMarkup(
    <CommercialInventorySandbox pilotEnabled={false} onClose={() => {}} />
  );
  assert.match(sandboxHtml, /disabled:opacity-50[^>]*>[\s\S]*Agregar artículo o insumo/);
});

test('Micro-pulido 3: AgendaView diferencia bloques fijos del total de actividades en la semana', () => {
  const state = defaultState();
  state.agenda = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };

  const html = renderToStaticMarkup(<AgendaView state={state} onUpdateState={() => true} />);
  assert.match(html, /0 bloques fijos/);
  assert.doesNotMatch(html, /0 actividades semanales/);
  assert.match(html, /actividades en la semana/);
});

test('Micro-pulido 4: CalendarioView formatea el día seleccionado de forma compacta sin truncar meses largos', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(<CalendarioView state={state} onUpdateState={() => true} />);

  // formatNaturalDate ahora usa mes abreviado (ej. "Sáb 21 nov · Hoy") en lugar de "Sábado 21 de noviembre"
  assert.doesNotMatch(html, /\d+ de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
  assert.match(html, /· Hoy/);
});

test('Micro-pulido 5: GymStarterPanel evita truncamiento en 389px y protege RIR 3–4 con whitespace-nowrap', () => {
  const html = renderToStaticMarkup(
    <GymStarterPanel onLoadPack={() => {}} onCreateCustom={() => {}} onStartFreeWorkout={() => {}} />
  );

  assert.match(html, /Rutinas listas/);
  assert.doesNotMatch(html, /Empezá con una rutina lista/);
  assert.match(html, /<span class="whitespace-nowrap">RIR 3–4<\/span>/);
});

test('IAView: SurfaceCard plano, touch targets >= 40px, acento índigo y estados vacíos limpios', () => {
  const emptyState = defaultState();
  emptyState.jobs.opportunities = [];
  emptyState.resale.opportunities = [];
  emptyState.ideas = [];

  const emptyHtml = renderToStaticMarkup(<IAView state={emptyState} onUpdateState={() => true} />);
  assert.match(emptyHtml, /rounded-2xl border border-slate-200\/80/);
  assert.match(emptyHtml, /No hay oportunidades pendientes\./);
  assert.match(emptyHtml, /No hay ideas guardadas\./);
  assert.doesNotMatch(emptyHtml, /max-h-\[60vh\]/);

  const populated = defaultState();
  populated.jobs.opportunities = [
    { id: 'j1', empresa: 'Acme', puesto: 'Soporte', rating: 4, link: 'https://example.com', nota: '', fecha: todayISO(), status: 'nueva' },
  ];
  populated.resale.opportunities = [
    { id: 'r1', item: 'Monitor', buyPrice: 100, marketPrice: 200, nota: '', fecha: todayISO(), status: 'nueva' },
  ];
  populated.ideas = [{ id: 'i1', text: 'Beca técnica', date: todayISO(), source: 'manual' }];

  const populatedHtml = renderToStaticMarkup(
    <IAView state={populated} onUpdateState={() => true} onOpenBusiness={() => {}} />
  );
  assert.match(populatedHtml, /min-h-10[^>]*bg-\[#4F46E5\][^>]*>Crear postulación/);
  assert.match(populatedHtml, /min-h-10[^>]*bg-\[#4F46E5\][^>]*>Registrar en Mi negocio/);
  assert.match(populatedHtml, /aria-label="Eliminar idea"[^>]*class="[^"]*min-h-10 min-w-10/);
});

test('NotasView y ProjectsManager: lenguaje plano sin card-ception, sin emojis decorativos y filtros seguros en 389px', () => {
  const state = defaultState();
  state.notes.postits = [
    { id: 'n1', title: 'Idea clave', text: 'Texto de prueba', date: todayISO(), pinned: true, tags: ['foco'] },
  ];

  const notesHtml = renderToStaticMarkup(
    <NotasView state={state} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} />
  );
  assert.doesNotMatch(notesHtml, /shadow-\[0_8px_24px/, 'Sin sombras pesadas en notas');
  assert.doesNotMatch(notesHtml, /📌/, 'Sin emojis decorativos en Notas');
  assert.match(notesHtml, /id="notes-grid"/);
  assert.match(notesHtml, /id="note-n1"/);

  const streamingState = defaultState();
  streamingState.settings.streamingEnabled = true;
  const toolsHtml = renderToStaticMarkup(
    <NotasView state={streamingState} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} initialTab="streaming" />
  );
  assert.match(toolsHtml, /aria-label="Herramientas personales"[^>]*overflow-x-auto/);
  assert.doesNotMatch(toolsHtml, /bg-amber-500/, 'Streaming unificado a índigo #4F46E5');

  const projHtml = renderToStaticMarkup(
    <ProjectsManager state={state} onUpdateState={() => true} />
  );
  assert.match(projHtml, /overflow-x-auto[^>]*>[\s\S]*Activos/);
  assert.doesNotMatch(projHtml, /🚀|🎯|💬/, 'Sin emojis decorativos en Proyectos');
});

test('ConfigView y PrivacySecuritySection: preserva IDs/deep-links, elimina glows y mejora ergonomía 389px', () => {
  const state = defaultState();

  const accountHtml = renderToStaticMarkup(
    <ConfigView
      state={state}
      onUpdateState={() => true}
      onExportJSON={() => {}}
      cloudUser={{ uid: 'u1', name: 'Ana', email: 'ana@example.com', photoURL: '' }}
      syncStatus="synced"
      lastSyncedAt="2026-11-21 15:00"
    />
  );
  assert.match(accountHtml, /id="config-account"/);
  assert.match(accountHtml, /id="security-section"/);
  assert.match(accountHtml, /h-10 w-10/);
  assert.doesNotMatch(accountHtml, /shadow-\[0_0_6px/, 'Sin glows en indicadores de estado');

  const prefsHtml = renderToStaticMarkup(
    <ConfigView state={state} onUpdateState={() => true} onExportJSON={() => {}} initialTab="preferencias" />
  );
  assert.match(prefsHtml, /id="config-preferences"/);
  assert.match(prefsHtml, /grid-cols-1 gap-2[^>]*sm:grid-cols-2/, 'Módulos visibles usa 1 columna en 389px para evitar wrap en Visible/Oculto');

  const privacyHtml = renderToStaticMarkup(
    <PrivacySecuritySection state={state} storageUserId={null} cloudConnected={false} />
  );
  assert.match(privacyHtml, /Cifrado en la nube sin verificar/);
  assert.match(privacyHtml, /min-h-10/);
});
