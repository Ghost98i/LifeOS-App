import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayKeyFromDate, defaultState, todayISO } from '../lib/storage';
import { addSandboxItem, emptySandboxInventory } from '../lib/commercialInventorySandbox';
import { confirmSandboxMoneyEvent, recordSandboxPurchase, type SandboxMoneySession } from '../lib/commercialMoneySandbox';
import { AgendaView } from './AgendaView';
import { CalendarioView } from './CalendarioView';
import { ReventaView } from './ReventaView';
import { CommercialInventorySandbox } from './CommercialInventorySandbox';
import { CommercialMoneySandbox } from './CommercialMoneySandbox';

test('AgendaView: tira de 7 días sin overflow horizontal, estado vacío accionable y touch targets >= 40px', () => {
  const emptyState = defaultState();
  emptyState.agenda = { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
  emptyState.tasksRecurring = [];
  emptyState.calendarEvents = [];

  const emptyHtml = renderToStaticMarkup(
    <AgendaView state={emptyState} onUpdateState={() => true} />
  );

  assert.match(emptyHtml, /aria-label="Días de la semana"[^>]*class="[^"]*grid grid-cols-7/);
  assert.doesNotMatch(emptyHtml, /min-w-\[4\.25rem\]/, 'La tira semanal debe caber en 389px sin ancho mínimo que oculte días');
  assert.match(emptyHtml, /Sin actividades previstas para/);
  assert.match(emptyHtml, /Usar plantilla sugerida/);
  assert.match(emptyHtml, /Compromiso puntual/);
  assert.doesNotMatch(emptyHtml, /shadow-md ring-2/, 'Sin sombras pesadas ni rings en el lenguaje plano Hoy V3');

  const today = todayISO();
  const todayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));
  const populated = defaultState();
  populated.agenda[todayKey] = [{ id: 'blk-1', time: '09:00', activity: 'Bloque de foco', effort: 'medium' }];
  populated.calendarEvents = [{ id: 'evt-1', name: 'Turno médico', date: today, time: '11:30', type: 'cita', recurring: false }];

  const populatedHtml = renderToStaticMarkup(
    <AgendaView state={populated} onUpdateState={() => true} />
  );

  assert.match(populatedHtml, /id="agenda-block-blk-1"/);
  assert.match(populatedHtml, /id="agenda-event-evt-1"/);
  assert.match(populatedHtml, /aria-label="Editar Bloque de foco"[^>]*class="[^"]*min-h-10 min-w-10/);
  assert.match(populatedHtml, /aria-label="Completar Bloque de foco"[^>]*class="[^"]*min-h-10 min-w-10/);
});

test('CalendarioView: usa AppIcon sin emojis crudos, grilla compacta en móvil y estado vacío plano', () => {
  const emptyState = defaultState();
  emptyState.calendarEvents = [];
  emptyState.finance.commitments = [];
  emptyState.finance.expectedIncomes = [];
  emptyState.study.exams = [];
  emptyState.todayExtras = [];

  const emptyHtml = renderToStaticMarkup(
    <CalendarioView state={emptyState} onUpdateState={() => true} />
  );

  assert.match(emptyHtml, /min-h-\[46px\]/, 'Celdas compactas en móvil 389px');
  assert.match(emptyHtml, /No hay elementos para esta fecha\./);
  assert.match(emptyHtml, /Agregar acontecimiento aquí/);
  assert.doesNotMatch(emptyHtml, /border-dashed/, 'Sin caja punteada anidada dentro del panel del día');

  const today = todayISO();
  const populated = defaultState();
  populated.calendarEvents = [{ id: 'c1', name: 'Cumple de Ana', date: today, type: 'cumpleanos', recurring: true }];
  populated.study.exams = [{ id: 'ex1', subjectId: 's1', title: 'Parcial', date: today, status: 'pendiente' }];
  populated.finance.commitments = [{ id: 'com1', name: 'Alquiler', amount: 15000, currency: 'UYU', frequency: 'once', nextDueDate: today, active: true }];

  const populatedHtml = renderToStaticMarkup(
    <CalendarioView state={populated} onUpdateState={() => true} />
  );

  assert.match(populatedHtml, /Cumple de Ana/);
  assert.match(populatedHtml, /data-app-icon="gift"/);
  assert.match(populatedHtml, /data-app-icon="exam"/);
  assert.match(populatedHtml, /data-app-icon="expense"/);
  assert.doesNotMatch(populatedHtml, /🎂|📝|💳|💰|💼|⏱️|📌/, 'No renderiza emojis crudos en la UI de Calendario');
  assert.doesNotMatch(populatedHtml, /max-h-\[360px\]/, 'Sin scroll vertical anidado incómodo en móvil');
});

test('Mi negocio: elimina el doble estado vacío inicial, unifica acento índigo y asegura touch targets >= 40px', () => {
  const emptyCommercialHtml = renderToStaticMarkup(
    <CommercialInventorySandbox pilotEnabled={false} onClose={() => {}} />
  );

  assert.match(emptyCommercialHtml, /id="commercial-inventory-sandbox"/);
  assert.match(emptyCommercialHtml, /Sin artículos registrados/);
  assert.doesNotMatch(emptyCommercialHtml, /commercial-money-sandbox|Sin compras ni ventas registradas/, 'No muestra doble estado vacío cuando no hay actividad');

  const initial: SandboxMoneySession = {
    inventory: emptySandboxInventory(),
    finished: emptySandboxInventory(),
    sales: [],
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };
  const bought = recordSandboxPurchase(initial, addSandboxItem(initial.inventory, 'Café', 'unit', 2, 500));
  const moneyHtml = renderToStaticMarkup(
    <CommercialMoneySandbox session={bought} onConfirm={(req) => confirmSandboxMoneyEvent(bought, req)} />
  );

  assert.match(moneyHtml, /id="commercial-money-sandbox"/);
  assert.match(moneyHtml, /min-h-10[^>]*>Pagar/);

  const legacyState = defaultState();
  legacyState.resale.inventory = [{
    id: 'item-1',
    item: 'Auriculares',
    buyPrice: 1200,
    buyDate: todayISO(),
    status: 'comprado',
  }];
  const legacyHtml = renderToStaticMarkup(
    <ReventaView state={legacyState} onUpdateState={() => true} />
  );

  assert.match(legacyHtml, /Auriculares/);
  assert.doesNotMatch(legacyHtml, /lifeos-card/, 'Reemplaza .lifeos-card por SurfaceCard plano');
  assert.doesNotMatch(legacyHtml, /bg-emerald-600/, 'Botón primario de venta unificado a índigo #4F46E5');
  assert.match(legacyHtml, /bg-\[#4F46E5\][^>]*>Registrar venta/);
});
