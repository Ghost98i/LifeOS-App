import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from './storage';
import {
  AI_CONTEXT_DETAIL_LEVELS,
  AI_CONTEXT_TIME_WINDOWS,
  AI_GOALS,
  buildAIContextPrompt,
  buildContextMarkdownFilename,
  getDefaultModulesForGoal,
  getGoalDataIndicator,
  getVisibleContextModules,
} from './aiContextBuilder';
import { AppIcon } from '../components/AppIcon';
import { Sidebar } from '../components/Sidebar';
import { downloadContextMarkdown, IAView } from '../components/IAView';
import type { LifeOSState } from '../types';

const REF_DATE = '2026-11-24';

function createRichState(): LifeOSState {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // Hoy, Agenda y Calendario
  state.dailyContext = [
    { date: REF_DATE, sleepHours: 7.5, energy: 4, mood: 4, connection: null, stress: 'bajo' },
  ];
  state.dailyPriorities = [
    { id: 'dp-1', date: REF_DATE, text: 'Cerrar entrega del proyecto', done: false },
  ];
  state.todayExtras = [
    { id: 'te-1', date: REF_DATE, text: 'Preparar presentación trimestral', done: false, priority: 'alta', dueDate: '2026-11-25' },
    { id: 'te-2', date: REF_DATE, text: 'Ordenar escritorio', done: false, priority: 'baja' },
  ];
  state.agenda.martes = [
    { id: 'ag-1', time: '09:00', activity: 'Bloque profundo de producto' },
    { id: 'ag-2', time: '14:30', activity: 'Reunión con equipo' },
  ];
  state.calendarEvents = [
    { id: 'cal-1', name: 'Dentista control', date: '2026-11-26', time: '11:00', type: 'cita', recurring: false },
  ];

  // Finanzas
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú Sueldo', balance: 84250, currency: 'UYU' },
    { id: 'acc-2', name: 'BROU Ahorro Dólares', balance: 2150, currency: 'USD' },
  ];
  state.finance.transactions = [
    { id: 'tx-1', type: 'ingreso', amount: 95000, category: 'Sueldo', fixed: 'fijo', date: '2026-11-05', currency: 'UYU' },
    { id: 'tx-2', type: 'gasto', amount: 28500, category: 'Vivienda', fixed: 'fijo', date: '2026-11-06', currency: 'UYU' },
    { id: 'tx-3', type: 'gasto', amount: 14250, category: 'Alimentación', fixed: 'variable', date: '2026-11-18', currency: 'UYU' },
    { id: 'tx-4', type: 'gasto', amount: 4750, category: 'Transporte', fixed: 'variable', date: '2026-11-20', currency: 'UYU' },
  ];
  state.finance.commitments = [
    {
      id: 'com-1',
      name: 'Alquiler apartamento',
      amount: 26300,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-12-01',
      active: true,
    },
  ];
  state.finance.subscriptions = [
    { id: 'sub-1', name: 'Gimnasio anual', amount: 1890, dueDay: 10 },
  ];
  state.finance.debts = [
    { id: 'deb-1', name: 'Tarjeta Visa cuotas', amount: 12400, dueDate: '2026-12-05' },
  ];
  state.finance.investments = [
    { id: 'inv-1', name: 'Fondo Centenario', amount: 150000 },
  ];

  // Estudios
  state.study.subjects = [
    {
      id: 'sub-math',
      name: 'Cálculo II',
      topics: [
        { id: 't1', title: 'Integrales dobles', done: true },
        { id: 't2', title: 'Series de Taylor', done: false },
        { id: 't3', title: 'Ecuaciones diferenciales', done: false },
      ],
    },
    {
      id: 'sub-alg',
      name: 'Algoritmos',
      topics: [{ id: 't4', title: 'Grafos y caminos mínimos', done: false }],
    },
  ];
  state.study.exams = [
    { id: 'ex-2', title: 'Parcial Algoritmos', subjectId: 'sub-alg', date: '2026-12-10', status: 'pendiente' },
    { id: 'ex-1', title: 'Parcial Cálculo II', subjectId: 'sub-math', date: '2026-11-29', time: '09:00', status: 'pendiente' },
  ];
  state.study.studyLog = [
    { id: 'sl-1', date: '2026-11-22', minutes: 120, subjectId: 'sub-math' },
  ];

  // Gimnasio
  state.gym.routineTemplates = [
    {
      id: 'rt-1',
      name: 'Torso Fuerza',
      days: ['lunes', 'jueves'],
      exercises: [
        { id: 'e1', name: 'Press banca', muscleGroup: 'Pecho', sets: [{ id: 's0', weight: 80, reps: 8, completed: false }] },
      ],
    },
  ];
  state.gym.sessions = [
    {
      id: 'gs-1',
      date: '2026-11-12',
      weekLabel: 'Torso Fuerza',
      status: 'completed',
      exercises: [
        {
          id: 'e1',
          name: 'Press banca',
          muscleGroup: 'Pecho',
          sets: [{ id: 's1', weight: 75, reps: 8, completed: true }],
        },
      ],
    },
    {
      id: 'gs-2',
      date: '2026-11-22',
      weekLabel: 'Torso Fuerza',
      status: 'completed',
      exercises: [
        {
          id: 'e1',
          name: 'Press banca',
          muscleGroup: 'Pecho',
          sets: [
            { id: 's2', weight: 82.5, reps: 8, completed: true },
            { id: 's3', weight: 82.5, reps: 8, completed: true },
          ],
        },
      ],
    },
  ];
  state.gym.weight = [
    { date: '2026-11-10', kg: 78.4 },
    { date: '2026-11-23', kg: 77.9 },
  ];

  // Trabajo
  state.jobs.applications = [
    {
      id: 'job-1',
      tipo: 'convencional',
      empresa: 'NubeSur',
      puesto: 'Frontend Engineer',
      estado: 'entrevista',
      fecha: '2026-11-15',
      nextAction: 'Preparar prueba técnica',
      nextActionDate: '2026-11-27',
    },
  ];

  // Mi negocio
  state.resale.inventory = [
    {
      id: 'res-1',
      item: 'Teclado mecánico Keychron',
      buyPrice: 3450,
      purchaseCurrency: 'UYU',
      buyDate: '2026-11-10',
      status: 'comprado',
    },
    {
      id: 'res-2',
      item: 'Auriculares Sony XM4',
      buyPrice: 6800,
      sellPrice: 10200,
      purchaseCurrency: 'UYU',
      saleCurrency: 'UYU',
      buyDate: '2026-11-01',
      sellDate: '2026-11-14',
      status: 'vendido',
    },
  ];
  state.resale.commercial = {
    items: [{ id: 'ci-1', name: 'Café grano 1kg', unit: 'unit' }],
    operations: [],
    movements: [],
    business: {
      version: 1,
      currency: 'UYU',
      finished: { items: [], operations: [], movements: [] },
      recipes: [],
      purchases: [{ id: 'cp-1', itemId: 'ci-1', amountCents: 74500, currency: 'UYU' }],
      productions: [],
      sales: [
        {
          id: 'cs-1',
          operationId: 'op-1',
          source: 'direct',
          itemId: 'ci-1',
          recipeId: '',
          recipeName: 'Café grano 1kg',
          recipeSnapshot: null,
          units: 4,
          unitPriceCents: 112000,
          revenueCents: 448000,
          ingredientCostCents: 298000,
          directCostCents: 0,
          totalCostCents: 298000,
          grossProfitCents: 150000,
          grossMarginPercent: 33.48,
          ingredients: [],
          currency: 'UYU',
        },
      ],
      finishedWastes: [],
      saleCorrections: [],
      moneyEvents: [],
      refundSources: [],
      financeLinks: [],
      eventOrder: [],
    },
  };

  // Notas y objetivos
  state.notes.postits = [
    { id: 'n-1', title: 'Checklist viaje', text: 'Renovar pasaporte antes de enero', date: REF_DATE, pinned: true },
  ];
  state.goals = [
    { id: 'g-1', name: 'Fondo de emergencia', initial: 0, target: 250000, current: 125000, linked: 'available' },
  ];

  return state;
}

test('Bloque 24.1: genera contexto estructurado en Markdown para los 6 objetivos independientes con datos reales e indicadores', () => {
  const state = createRichState();
  const snapshotBefore = structuredClone(state);

  assert.equal(AI_GOALS.length, 6);
  assert.deepEqual(
    AI_GOALS.map((g) => g.id),
    [
      'organizar_dia',
      'revisar_finanzas',
      'plan_estudio',
      'analizar_entrenamiento',
      'impulsar_negocio',
      'busqueda_laboral',
    ]
  );

  // 1. Organizar mi día y semana
  const dayRes = buildAIContextPrompt(state, {
    goalId: 'organizar_dia',
    selectedModules: getDefaultModulesForGoal('organizar_dia', state),
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(dayRes.text, /# Contexto personal — Organizar mi día y semana/);
  assert.match(dayRes.text, /Preparar presentación trimestral/);
  assert.match(dayRes.text, /Bloque profundo de producto/);
  assert.match(dayRes.text, /Dentista control/);
  assert.match(dayRes.text, /NubeSur/);
  assert.match(getGoalDataIndicator('organizar_dia', state, REF_DATE).label, /tareas/);

  // 2. Revisar mis finanzas (modo normal muestra montos y cuentas)
  const finRes = buildAIContextPrompt(state, {
    goalId: 'revisar_finanzas',
    selectedModules: getDefaultModulesForGoal('revisar_finanzas', state),
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(finRes.text, /# Contexto personal — Revisar mis finanzas/);
  assert.match(finRes.text, /Banco Itaú Sueldo/);
  assert.match(finRes.text, /Vivienda/);
  assert.match(finRes.text, /Alquiler apartamento/);
  assert.match(getGoalDataIndicator('revisar_finanzas', state, REF_DATE).label, /movimientos/);

  // 3. Armar plan de estudio (ordena exámenes por cercanía)
  const studyRes = buildAIContextPrompt(state, {
    goalId: 'plan_estudio',
    selectedModules: getDefaultModulesForGoal('plan_estudio', state),
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(studyRes.text, /Parcial Cálculo II/);
  assert.match(studyRes.text, /Series de Taylor/);
  assert.ok(
    studyRes.text.indexOf('Parcial Cálculo II') < studyRes.text.indexOf('Parcial Algoritmos'),
    'Los exámenes deben ordenarse del más cercano al más lejano'
  );
  assert.equal(getGoalDataIndicator('plan_estudio', state, REF_DATE).label, '2 exámenes · 2 materias');

  // 4. Analizar mi entrenamiento
  const gymRes = buildAIContextPrompt(state, {
    goalId: 'analizar_entrenamiento',
    selectedModules: getDefaultModulesForGoal('analizar_entrenamiento', state),
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(gymRes.text, /Torso Fuerza/);
  assert.match(gymRes.text, /Press banca/);
  assert.match(gymRes.text, /82\.5 kg x 8/);
  assert.equal(getGoalDataIndicator('analizar_entrenamiento', state, REF_DATE).label, '2 sesiones · 1 rutina');

  // 5. Impulsar mi negocio (exclusivo de Mi negocio)
  const bizDefaultModules = getDefaultModulesForGoal('impulsar_negocio', state);
  assert.deepEqual(bizDefaultModules, ['negocio']);
  const bizRes = buildAIContextPrompt(state, {
    goalId: 'impulsar_negocio',
    selectedModules: bizDefaultModules,
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(bizRes.text, /# Contexto personal — Impulsar mi negocio/);
  assert.match(bizRes.text, /### Mi negocio/);
  assert.match(bizRes.text, /Teclado mecánico Keychron/);
  assert.doesNotMatch(bizRes.text, /### Trabajo/);
  assert.doesNotMatch(bizRes.text, /NubeSur/);
  assert.match(getGoalDataIndicator('impulsar_negocio', state, REF_DATE).label, /2 artículos/);

  // 6. Mejorar mi búsqueda laboral (exclusivo de Trabajo)
  const jobDefaultModules = getDefaultModulesForGoal('busqueda_laboral', state);
  assert.deepEqual(jobDefaultModules, ['trabajo']);
  const jobRes = buildAIContextPrompt(state, {
    goalId: 'busqueda_laboral',
    selectedModules: jobDefaultModules,
    hideExactAmounts: false,
    referenceDate: REF_DATE,
  });
  assert.match(jobRes.text, /# Contexto personal — Mejorar mi búsqueda laboral/);
  assert.match(jobRes.text, /### Trabajo/);
  assert.match(jobRes.text, /NubeSur/);
  assert.match(jobRes.text, /Frontend Engineer/);
  assert.doesNotMatch(jobRes.text, /### Mi negocio/);
  assert.doesNotMatch(jobRes.text, /Teclado mecánico Keychron/);
  assert.match(getGoalDataIndicator('busqueda_laboral', state, REF_DATE).label, /1 postulación/);

  // Estado vacío muestra "Sin datos aún" para los 6 objetivos
  const empty = defaultState();
  empty.settings.hiddenTabs = [];
  for (const goal of AI_GOALS) {
    const ind = getGoalDataIndicator(goal.id, empty, REF_DATE);
    assert.equal(ind.hasData, false);
    assert.equal(ind.label, 'Sin datos aún');
  }

  // Motor 100% puro: nunca muta el estado
  assert.deepEqual(state, snapshotBefore);
});

test('Bloque 24.1b: modo Solo mis datos omite ## Objetivo, usa encabezado limpio y respeta módulos libres', () => {
  const state = createRichState();

  const res = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'gimnasio', 'notas'],
    hideExactAmounts: false,
    timeWindowDays: 30,
    customQuestion: 'Compará mi constancia de entrenamiento con mis gastos del mes',
    referenceDate: REF_DATE,
  });

  assert.equal(res.mode, 'data_only');
  assert.equal(res.goal, null);
  assert.deepEqual(res.includedModules, ['finanzas', 'gimnasio', 'notas']);
  assert.match(res.text, /^# Datos personales — Celestian LifeOS/m);
  assert.doesNotMatch(res.text, /^## Objetivo$/m);
  assert.doesNotMatch(res.text, /Actuá como mi/i);
  assert.match(res.text, /## Mi pregunta o consigna/);
  assert.match(res.text, /Compará mi constancia de entrenamiento con mis gastos del mes/);
  assert.match(res.text, /### Finanzas/);
  assert.match(res.text, /### Gimnasio/);
  assert.match(res.text, /### Notas y objetivos/);
  assert.doesNotMatch(res.text, /### Estudios/);

  // Renderizado en IAView en modo Solo mis datos
  const html = renderToStaticMarkup(
    <IAView state={state} onUpdateState={() => true} defaultMode="data_only" defaultPreviewOpen />
  );
  assert.match(html, /data-ia-mode="data_only"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-ia-mode="data_only"/);
  assert.match(html, /# Datos personales — Celestian LifeOS/);
  assert.doesNotMatch(html, /## Objetivo/);
});

test('Bloque 24.1c: ventana de tiempo (7, 30, 90 días) filtra Finanzas, Gimnasio, Estudios y Mi negocio', () => {
  assert.deepEqual(
    AI_CONTEXT_TIME_WINDOWS.map((w) => w.days),
    [7, 30, 90]
  );

  const state = createRichState();

  // Agregar registros en 3 franjas: <=7d (2026-11-22), 8..30d (2026-11-05/12/14), 31..90d (2026-10-01)
  state.finance.transactions.push({
    id: 'tx-60d',
    type: 'gasto',
    amount: 9900,
    category: 'Viajes',
    fixed: 'variable',
    date: '2026-10-01',
    currency: 'UYU',
  });
  state.study.studyLog.push(
    { id: 'sl-20d', date: '2026-11-05', minutes: 180, subjectId: 'sub-alg' },
    { id: 'sl-60d', date: '2026-10-01', minutes: 240, subjectId: 'sub-math' }
  );
  state.gym.sessions.push({
    id: 'gs-60d',
    date: '2026-10-01',
    weekLabel: 'Pierna Octubre',
    status: 'completed',
    exercises: [
      {
        id: 'e-leg',
        name: 'Sentadilla',
        muscleGroup: 'Piernas',
        sets: [{ id: 's-leg', weight: 100, reps: 5, completed: true }],
      },
    ],
  });
  state.resale.inventory.push({
    id: 'res-60d',
    item: 'Cámara vintage',
    buyPrice: 4000,
    sellPrice: 7000,
    purchaseCurrency: 'UYU',
    saleCurrency: 'UYU',
    buyDate: '2026-09-20',
    sellDate: '2026-10-01',
    status: 'vendido',
  });
  state.resale.commercial!.operations = [
    { id: 'op-1', kind: 'sale', status: 'closed', commercialDate: '2026-11-21', effectiveOrder: '2026-11-21T10:00:00Z' },
    { id: 'op-old', kind: 'sale', status: 'closed', commercialDate: '2026-10-01', effectiveOrder: '2026-10-01T10:00:00Z' },
  ];
  state.resale.commercial!.business!.sales.push({
    ...state.resale.commercial!.business!.sales[0],
    id: 'cs-old',
    operationId: 'op-old',
  });
  state.resale.commercial!.business!.eventOrder = [
    { kind: 'sale', id: 'cs-1', effectiveOrder: '2026-11-21T10:00:00Z', commercialDate: '2026-11-21' },
    { kind: 'sale', id: 'cs-old', effectiveOrder: '2026-10-01T10:00:00Z', commercialDate: '2026-10-01' },
    { kind: 'purchase', id: 'cp-1', effectiveOrder: '2026-11-20T10:00:00Z', commercialDate: '2026-11-20' },
  ];

  // 7 días
  const res7 = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'estudios', 'gimnasio', 'negocio'],
    hideExactAmounts: false,
    timeWindowDays: 7,
    referenceDate: REF_DATE,
  });
  assert.equal(res7.timeWindowDays, 7);
  assert.match(res7.text, /Período de datos: últimos 7 días/);
  assert.match(res7.text, /Resumen \(últimos 7 días, UYU\)/);
  assert.doesNotMatch(res7.text, /Vivienda/); // 2026-11-06 está fuera de 7 días
  assert.doesNotMatch(res7.text, /Viajes/); // 2026-10-01 está fuera de 7 días
  assert.match(res7.text, /Estudio reciente \(últimos 7 días\): 2 h en 1 sesión/);
  assert.match(res7.text, /Frecuencia \(últimos 7 días\): 1 sesión/);
  assert.doesNotMatch(res7.text, /Pierna Octubre/);
  assert.match(res7.text, /Inventario de reventa \(últimos 7 días\):.*0 ventas/);
  assert.match(res7.text, /Actividad comercial \(últimos 7 días\):.*1 venta · 1 compra/);

  // 30 días
  const res30 = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'estudios', 'gimnasio', 'negocio'],
    hideExactAmounts: false,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });
  assert.equal(res30.timeWindowDays, 30);
  assert.match(res30.text, /Período de datos: últimos 30 días/);
  assert.match(res30.text, /Vivienda/);
  assert.doesNotMatch(res30.text, /Viajes/);
  assert.match(res30.text, /Estudio reciente \(últimos 30 días\): 5 h en 2 sesiones/);
  assert.match(res30.text, /Frecuencia \(últimos 30 días\): 2 sesiones/);
  assert.doesNotMatch(res30.text, /Pierna Octubre/);
  assert.match(res30.text, /Inventario de reventa \(últimos 30 días\):.*1 venta/);
  assert.match(res30.text, /Actividad comercial \(últimos 30 días\):.*1 venta · 1 compra/);

  // 90 días
  const res90 = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'estudios', 'gimnasio', 'negocio'],
    hideExactAmounts: false,
    timeWindowDays: 90,
    referenceDate: REF_DATE,
  });
  assert.equal(res90.timeWindowDays, 90);
  assert.match(res90.text, /Período de datos: últimos 90 días/);
  assert.match(res90.text, /Viajes/);
  assert.match(res90.text, /Estudio reciente \(últimos 90 días\): 9 h en 3 sesiones/);
  assert.match(res90.text, /Frecuencia \(últimos 90 días\): 3 sesiones/);
  assert.match(res90.text, /Pierna Octubre/);
  assert.match(res90.text, /Inventario de reventa \(últimos 90 días\):.*2 ventas/);
  assert.match(res90.text, /Actividad comercial \(últimos 90 días\):.*2 ventas · 1 compra/);
});

test('Bloque 24.1d: balance financiero negativo usa redacción humana sin porcentajes negativos extremos', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];
  state.finance.transactions = [
    { id: 't-inc', type: 'ingreso', amount: 1000, category: 'Reembolso', fixed: 'variable', date: '2026-11-20', currency: 'UYU' },
    { id: 't-exp', type: 'gasto', amount: 13230, category: 'Hogar', fixed: 'fijo', date: '2026-11-21', currency: 'UYU' },
  ];

  // Modo normal
  const normalRes = buildAIContextPrompt(state, {
    goalId: 'revisar_finanzas',
    selectedModules: ['finanzas'],
    hideExactAmounts: false,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });
  assert.match(normalRes.text, /balance negativo: gastos por encima de los ingresos del período/i);
  assert.doesNotMatch(normalRes.text, /tasa de ahorro -/i);
  assert.doesNotMatch(normalRes.text, /-1223%/);

  // Modo privacidad (Ocultar montos exactos)
  const privateRes = buildAIContextPrompt(state, {
    goalId: 'revisar_finanzas',
    selectedModules: ['finanzas'],
    hideExactAmounts: true,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });
  assert.match(privateRes.text, /balance negativo: gastos por encima de los ingresos del período/i);
  assert.doesNotMatch(privateRes.text, /1323%/);
  assert.doesNotMatch(privateRes.text, /1223%/);
});

test('Bloque 24.1e: botón Descargar .md visible y descarga nativa con Blob + URL.createObjectURL respetando privacidad', async () => {
  const state = createRichState();
  state.settings.privacyMode = true;

  const html = renderToStaticMarkup(
    <IAView state={state} onUpdateState={() => true} />
  );
  assert.match(html, /Descargar \.md/);

  // Verificar nombre de archivo y ejecución real con mock de URL.createObjectURL
  assert.equal(buildContextMarkdownFilename(REF_DATE), 'celestian-contexto-2026-11-24.md');

  const privatePrompt = buildAIContextPrompt(state, {
    goalId: 'revisar_finanzas',
    selectedModules: ['finanzas'],
    hideExactAmounts: true,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalDocument = (globalThis as { document?: unknown }).document;

  let capturedBlob: Blob | null = null;
  let revokedUrl: string | null = null;
  let clicked = false;
  let appended = false;
  let removed = false;
  const fakeAnchor = {
    href: '',
    download: '',
    style: { display: '' },
    click() {
      clicked = true;
    },
  };

  try {
    URL.createObjectURL = ((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:celestian-test-md';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revokedUrl = url;
    }) as typeof URL.revokeObjectURL;
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        assert.equal(tag, 'a');
        return fakeAnchor;
      },
      body: {
        appendChild(node: unknown) {
          assert.equal(node, fakeAnchor);
          appended = true;
        },
        removeChild(node: unknown) {
          assert.equal(node, fakeAnchor);
          removed = true;
        },
      },
    };

    const filename = downloadContextMarkdown(privatePrompt.text, REF_DATE);
    assert.equal(filename, 'celestian-contexto-2026-11-24.md');
    assert.equal(fakeAnchor.download, 'celestian-contexto-2026-11-24.md');
    assert.equal(fakeAnchor.href, 'blob:celestian-test-md');
    assert.equal(appended, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.ok(capturedBlob !== null, 'Debe crear un Blob y pasarlo a URL.createObjectURL');

    const blobText = await (capturedBlob as Blob).text();
    assert.equal(blobText, privatePrompt.text);
    assert.ok(!blobText.includes('Banco Itaú'), 'El archivo .md descargado respeta Ocultar montos exactos');

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(revokedUrl, 'blob:celestian-test-md');
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
  }
});

test('Bloque 24.2: Ocultar montos exactos anonimiza cifras y cuentas en Finanzas, Mi negocio y Objetivos financieros', () => {
  const state = createRichState();

  const privateRes = buildAIContextPrompt(state, {
    goalId: 'revisar_finanzas',
    selectedModules: ['finanzas', 'negocio', 'notas'],
    hideExactAmounts: true,
    referenceDate: REF_DATE,
  });

  // Aviso claro de privacidad activa y presencia de proporciones (%)
  assert.match(privateRes.text, /Privacidad activa/);
  assert.match(privateRes.text, /%/);
  assert.match(privateRes.text, /Alimentación: \d+% del gasto/);
  assert.match(privateRes.text, /Cuenta 1|1 cuenta en UYU/);
  assert.match(privateRes.text, /Fondo de emergencia: 50% de avance/);

  // Ningún monto exacto ni nombre de cuenta bancaria puede filtrarse
  const forbiddenLeaks = [
    'Banco Itaú',
    'BROU Ahorro',
    '84.250',
    '84250',
    '2.150',
    '2150',
    '95.000',
    '95000',
    '28.500',
    '28500',
    '14.250',
    '14250',
    '4.750',
    '4750',
    '26.300',
    '26300',
    '1.890',
    '1890',
    '12.400',
    '12400',
    '150.000',
    '150000',
    '3.450',
    '3450',
    '6.800',
    '6800',
    '10.200',
    '10200',
    '4.480',
    '4480',
    '1.500',
    '250000',
    '125000',
  ];

  for (const secret of forbiddenLeaks) {
    assert.ok(
      !privateRes.text.includes(secret),
      `El modo "Ocultar montos exactos" filtró el valor sensible "${secret}"`
    );
  }
});

test('Bloque 24.3: selección manual de chips de módulos, módulos ocultos y pregunta personalizada', () => {
  const state = createRichState();
  state.settings.hiddenTabs = ['gimnasio'];

  const visibleIds = getVisibleContextModules(state).map((m) => m.id);
  assert.ok(!visibleIds.includes('gimnasio'), 'No ofrece chips de módulos ocultos');
  assert.ok(visibleIds.includes('notas'));

  const customRes = buildAIContextPrompt(state, {
    goalId: 'plan_estudio',
    selectedModules: ['estudios', 'notas', 'gimnasio'],
    hideExactAmounts: false,
    customQuestion: 'Tengo 2 horas libres hoy y quiero priorizar lo más urgente',
    referenceDate: REF_DATE,
  });

  assert.deepEqual(customRes.includedModules, ['estudios', 'notas']);
  assert.match(customRes.text, /## Mi pregunta o restricción adicional/);
  assert.match(customRes.text, /Tengo 2 horas libres hoy y quiero priorizar lo más urgente/);
  assert.match(customRes.text, /### Estudios/);
  assert.match(customRes.text, /### Notas y objetivos/);
  assert.doesNotMatch(customRes.text, /### Gimnasio/);
});

test('Bloque 24.4: retrocompatibilidad de registros anteriores solo aparece si existen y permite eliminarlos', () => {
  const cleanState = defaultState();
  cleanState.ideas = [];
  cleanState.jobs.opportunities = [];
  cleanState.resale.opportunities = [];

  const cleanHtml = renderToStaticMarkup(
    <IAView state={cleanState} onUpdateState={() => true} />
  );
  assert.doesNotMatch(cleanHtml, /Registros anteriores/, 'No muestra sección legacy cuando no hay registros previos');

  const legacyState = defaultState();
  legacyState.ideas = [{ id: 'id-1', text: 'Crear guía interactiva', date: REF_DATE, source: 'manual' }];
  legacyState.jobs.opportunities = [
    { id: 'jo-1', empresa: 'Studio Norte', puesto: 'UI Dev', link: 'https://example.com', fecha: REF_DATE, status: 'nueva' },
  ];
  legacyState.resale.opportunities = [
    { id: 'ro-1', item: 'Monitor 27"', buyPrice: 8000, marketPrice: 12000, fecha: REF_DATE, status: 'nueva' },
  ];

  // Desplegable cerrado por defecto muestra el contador total (3)
  const collapsedHtml = renderToStaticMarkup(
    <IAView state={legacyState} onUpdateState={() => true} />
  );
  assert.match(collapsedHtml, /Registros anteriores \(3\)/);
  assert.doesNotMatch(collapsedHtml, /Crear guía interactiva/);

  // Desplegable abierto muestra los registros con acciones Copy y Trash2
  const expandedHtml = renderToStaticMarkup(
    <IAView state={legacyState} onUpdateState={() => true} defaultLegacyOpen />
  );
  assert.match(expandedHtml, /Crear guía interactiva/);
  assert.match(expandedHtml, /Studio Norte/);
  assert.match(expandedHtml, /Monitor 27&quot;/);
  assert.match(expandedHtml, /aria-label="Copiar idea"[^>]*title="Copiar"/);
  assert.match(expandedHtml, /aria-label="Eliminar idea"[^>]*title="Eliminar"/);
  assert.match(expandedHtml, /aria-label="Eliminar oportunidad Studio Norte"[^>]*title="Eliminar"/);
  assert.match(expandedHtml, /aria-label="Eliminar posible compra Monitor 27&quot;"[^>]*title="Eliminar"/);

  // Simular eliminación de registros anteriores (misma mutación usada por IAView)
  legacyState.ideas = legacyState.ideas.filter((i) => i.id !== 'id-1');
  legacyState.jobs.opportunities[0].status = 'descartada';
  legacyState.resale.opportunities[0].status = 'descartada';

  const afterDeleteHtml = renderToStaticMarkup(
    <IAView state={legacyState} onUpdateState={() => true} defaultLegacyOpen />
  );
  assert.doesNotMatch(afterDeleteHtml, /Registros anteriores/, 'Al eliminar todos los registros previos, desaparece la sección');
});

test('Bloque 24.5: estándar Celestian en IAView y aiContextBuilder (cero azul residual, cero ASCII, cero JSON, switch, clean-field y foco limpio)', () => {
  const iaSrc = fs.readFileSync(path.resolve('src/components/IAView.tsx'), 'utf8');
  const builderSrc = fs.readFileSync(path.resolve('src/lib/aiContextBuilder.ts'), 'utf8');

  for (const [label, src] of [
    ['IAView.tsx', iaSrc],
    ['aiContextBuilder.ts', builderSrc],
  ] as const) {
    assert.doesNotMatch(src, /\b(blue|sky)-\d{2,3}\b/, `${label} no debe tener clases blue-* ni sky-*`);
    assert.doesNotMatch(src, /var\(--blue/, `${label} no debe usar var(--blue)`);
    assert.doesNotMatch(src, /[▲▼▶▾×↗→]/, `${label} no debe contener flechas ni símbolos ASCII prohibidos`);
  }

  assert.doesNotMatch(iaSrc, /type="checkbox"/, 'IAView no usa checkboxes nativos crudos');
  assert.doesNotMatch(iaSrc, /contrato JSON/i, 'IAView elimina el contrato JSON fijo');
  assert.doesNotMatch(iaSrc, /Respuesta de la IA \(JSON\)/i, 'IAView elimina el textarea de respuesta JSON');
  assert.match(iaSrc, /CelestianSwitch/, 'IAView reutiliza CelestianSwitch');
  assert.match(iaSrc, /celestian-clean-field/, 'IAView reutiliza celestian-clean-field');
  assert.match(
    iaSrc,
    /focus:outline-none[^\n]*focus-visible:ring-2 focus-visible:ring-\[#4F46E5\]/,
    'IAView usa foco limpio en índigo Celestian'
  );

  const html = renderToStaticMarkup(
    <IAView state={createRichState()} onUpdateState={() => true} defaultPreviewOpen />
  );
  assert.match(html, /Armá tu contexto real en 1 toque para consultarlo en tu IA favorita\. Celestian no envía tus datos automáticamente\./);
  assert.match(html, /Con guía/);
  assert.match(html, /Solo mis datos/);
  assert.match(html, /Impulsar mi negocio/);
  assert.match(html, /Mejorar mi búsqueda laboral/);
  assert.match(html, /Período de datos/);
  assert.match(html, /7 días/);
  assert.match(html, /30 días/);
  assert.match(html, /90 días/);
  assert.match(html, /Nivel de detalle/);
  assert.match(html, /Resumido/);
  assert.match(html, /Detallado/);
  assert.match(html, /role="switch"[^>]*aria-label="Ocultar montos y datos personales"/);
  assert.match(html, /Copiar contexto/);
  assert.match(html, /Descargar \.md/);
  assert.match(html, /href="https:\/\/gemini\.google\.com\/app"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /Ver exactamente qué se va a copiar/);
  assert.match(html, /aria-label="Vista previa del contexto generado"/);
  assert.doesNotMatch(html, /contrato JSON/i);
});

test('Bloque 24.2a: ícono Bot de lucide-react unificado en AppIcon (ai), Sidebar, GlobalSearchModal e IAView', () => {
  const aiIconHtml = renderToStaticMarkup(<AppIcon name="ai" className="h-5 w-5" />);
  assert.match(aiIconHtml, /lucide-bot/, 'AppIcon name="ai" debe renderizar el ícono Bot');
  assert.doesNotMatch(aiIconHtml, /lucide-sparkles/, 'AppIcon name="ai" no debe renderizar Sparkles');

  const state = createRichState();
  const sidebarHtml = renderToStaticMarkup(
    <Sidebar
      currentView="ia"
      state={state}
      onNavigate={() => {}}
      onToggleTheme={() => {}}
      isOpenMobile={false}
      onCloseMobile={() => {}}
    />
  );
  assert.match(sidebarHtml, /data-app-icon="ai"/);
  assert.match(sidebarHtml, /lucide-bot/);

  const iaHtml = renderToStaticMarkup(<IAView state={state} onUpdateState={() => true} />);
  assert.match(iaHtml, /lucide-bot/, 'IAView debe usar el ícono Bot');
  assert.doesNotMatch(iaHtml, /lucide-sparkles/, 'IAView no debe usar Sparkles');

  const globalSearchSrc = fs.readFileSync(path.resolve('src/components/GlobalSearchModal.tsx'), 'utf8');
  assert.match(
    globalSearchSrc,
    /view:\s*'ia'[^\n]*icon:\s*'ai'/,
    'La paleta de comandos (Ctrl+K) debe usar icon: "ai" (Bot) para el módulo IA'
  );
});

test('Bloque 24.2b: Resumido vs Detallado amplía profundidad, evolución mensual, rutinas, volumen, peso, sueño/cierres, trabajo y notas', () => {
  assert.deepEqual(
    AI_CONTEXT_DETAIL_LEVELS.map((d) => d.id),
    ['summary', 'detailed']
  );

  const state = createRichState();

  // Finanzas: múltiples meses (sep, oct, nov) y 10 gastos individuales + ingreso esperado para proyección 30d
  state.finance.transactions = [
    { id: 'f-inc-sep', type: 'ingreso', amount: 80000, category: 'Sueldo', fixed: 'fijo', date: '2026-09-10', currency: 'UYU' },
    { id: 'f-inc-oct', type: 'ingreso', amount: 85000, category: 'Sueldo', fixed: 'fijo', date: '2026-10-10', currency: 'UYU' },
    { id: 'f-inc-nov', type: 'ingreso', amount: 90000, category: 'Sueldo', fixed: 'fijo', date: '2026-11-10', currency: 'UYU' },
    { id: 'f-e1', type: 'gasto', amount: 28000, category: 'Vivienda', fixed: 'fijo', date: '2026-11-05', currency: 'UYU', note: 'Alquiler noviembre' },
    { id: 'f-e2', type: 'gasto', amount: 15000, category: 'Alimentación', fixed: 'variable', date: '2026-10-20', currency: 'UYU', note: 'Supermercado grande' },
    { id: 'f-e3', type: 'gasto', amount: 12000, category: 'Salud', fixed: 'variable', date: '2026-09-25', currency: 'UYU', note: 'Odontología' },
    { id: 'f-e4', type: 'gasto', amount: 8500, category: 'Transporte', fixed: 'variable', date: '2026-11-12', currency: 'UYU', note: 'Combustible' },
    { id: 'f-e5', type: 'gasto', amount: 6400, category: 'Ocio', fixed: 'variable', date: '2026-11-14', currency: 'UYU', note: 'Concierto' },
    { id: 'f-e6', type: 'gasto', amount: 5300, category: 'Ropa', fixed: 'variable', date: '2026-10-12', currency: 'UYU', note: 'Zapatillas' },
    { id: 'f-e7', type: 'gasto', amount: 4200, category: 'Tecnología', fixed: 'variable', date: '2026-11-16', currency: 'UYU', note: 'Teclado' },
    { id: 'f-e8', type: 'gasto', amount: 3100, category: 'Estudio', fixed: 'variable', date: '2026-11-19', currency: 'UYU', note: 'Libros técnicos' },
    { id: 'f-e9', type: 'gasto', amount: 1500, category: 'Otros', fixed: 'variable', date: '2026-11-21', currency: 'UYU', note: 'Ferretería' },
  ];
  state.finance.expectedIncomes = [
    {
      id: 'ei-1',
      name: 'Sueldo mensual',
      amount: 92000,
      currency: 'UYU',
      startDate: '2026-12-05',
      frequency: 'monthly',
      active: true,
    },
  ];

  // Gimnasio: 18 sesiones en 90 días repartidas en 2 rutinas + 1 rutina con 0 sesiones + 3 pesajes
  state.gym.routineTemplates = [
    { id: 'rt-1', name: 'Pecho/tríceps', days: ['lunes'], exercises: [] },
    { id: 'rt-2', name: 'Espalda/bíceps', days: ['miercoles'], exercises: [] },
    { id: 'rt-3', name: 'Piernas', days: ['viernes'], exercises: [] },
  ];
  state.gym.sessions = Array.from({ length: 18 }, (_, i) => {
    const dayOffset = i * 4;
    const d = new Date('2026-11-23T12:00:00');
    d.setDate(d.getDate() - dayOffset);
    const iso = d.toISOString().slice(0, 10);
    const routine = i % 2 === 0 ? 'Pecho/tríceps' : 'Espalda/bíceps';
    return {
      id: `sess-${i + 1}`,
      date: iso,
      weekLabel: routine,
      status: 'completed' as const,
      exercises: [
        {
          id: `ex-${i}`,
          name: i % 2 === 0 ? 'Press banca' : 'Remo barra',
          muscleGroup: i % 2 === 0 ? ('Pecho' as const) : ('Espalda' as const),
          sets: [{ id: `st-${i}`, weight: 70 + i, reps: 8, completed: true }],
        },
      ],
    };
  });
  state.gym.weight = [
    { date: '2026-09-05', kg: 82.4 },
    { date: '2026-10-15', kg: 80.1 },
    { date: '2026-11-23', kg: 78.6 },
  ];

  // Sueño, energía y cierres del día
  state.dailyContext = [
    { date: '2026-11-10', sleepHours: 6.0, energy: 2, mood: 3, connection: null, stress: 'alto', note: 'Día muy cargado' },
    { date: '2026-11-15', sleepHours: 6.5, energy: 3, mood: 3, connection: null, stress: 'moderado' },
    { date: '2026-11-20', sleepHours: 7.5, energy: 4, mood: 4, connection: null, stress: 'bajo' },
    { date: '2026-11-24', sleepHours: 8.0, energy: 5, mood: 5, connection: null, stress: 'bajo' },
  ];
  state.checkoutLog = {
    '2026-11-22': { closedAt: '2026-11-22T22:15:00Z', dailyNote: 'Cerré la semana con foco y buen ritmo', sleepHours: 7.5, energyLevel: 4 },
    '2026-11-23': { closedAt: '2026-11-23T22:30:00Z', dailyNote: 'Avancé en el informe anual', sleepHours: 8, energyLevel: 5 },
  };

  // Trabajo: procesos cerrados por estado además de activos
  state.jobs.applications.push(
    { id: 'job-c1', tipo: 'convencional', empresa: 'AlphaTech', puesto: 'React Dev', estado: 'rechazado', fecha: '2026-10-10' },
    { id: 'job-c2', tipo: 'convencional', empresa: 'BetaCorp', puesto: 'Fullstack', estado: 'rechazado', fecha: '2026-10-18' },
    { id: 'job-c3', tipo: 'concurso', empresa: 'BPS', puesto: 'Analista', estado: 'no_seleccionado', fecha: '2026-10-28' }
  );

  // Notas largas + posesiones relevantes
  const longNoteBody =
    'Plan trimestral completo: consolidar hábitos de descanso antes de las 23:00, sostener cuatro sesiones semanales con foco en tren inferior y ordenar la reserva de liquidez antes de fin de año con revisiones quincenales de presupuesto y objetivos.';
  state.notes.postits = [
    { id: 'n-long', title: 'Plan Q4', text: longNoteBody, date: REF_DATE, pinned: true },
  ];
  state.notes.possessions = [
    { id: 'pos-1', name: 'Notebook ThinkPad T14', category: 'Tecnología', location: 'Escritorio', note: 'Garantía vigente' },
  ];

  const allModules = ['hoy_agenda', 'finanzas', 'gimnasio', 'trabajo', 'notas'] as const;

  const summaryRes = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: allModules,
    hideExactAmounts: false,
    timeWindowDays: 90,
    detailLevel: 'summary',
    referenceDate: REF_DATE,
  });

  const detailedRes = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: allModules,
    hideExactAmounts: false,
    timeWindowDays: 90,
    detailLevel: 'detailed',
    referenceDate: REF_DATE,
  });

  assert.equal(summaryRes.detailLevel, 'summary');
  assert.equal(detailedRes.detailLevel, 'detailed');
  assert.ok(
    detailedRes.wordCount > summaryRes.wordCount,
    `Detallado (${detailedRes.wordCount}) debe ser más profundo que Resumido (${summaryRes.wordCount})`
  );

  // Finanzas: evolución mes a mes, mayores gastos top 3 vs top 8, balance proyectado 30d
  assert.match(summaryRes.text, /Evolución mes a mes:/);
  assert.match(summaryRes.text, /sep 2026:/);
  assert.match(summaryRes.text, /oct 2026:/);
  assert.match(summaryRes.text, /nov 2026:/);
  assert.match(summaryRes.text, /Mayores gastos individuales \(top 3\):/);
  assert.match(detailedRes.text, /Mayores gastos individuales \(top 8\):/);
  assert.match(detailedRes.text, /Libros técnicos/);
  assert.doesNotMatch(summaryRes.text, /Libros técnicos/);
  assert.match(summaryRes.text, /Balance proyectado \(próximos 30 días, UYU\):/);

  // Gimnasio: subtítulo honesto 6 de 18 vs 15 de 18, distribución de rutinas con Piernas: 0, evolución peso y volumen mensual
  assert.match(summaryRes.text, /Últimas 6 de 18 sesiones \(últimos 90 días\):/);
  assert.match(detailedRes.text, /Últimas 15 de 18 sesiones \(últimos 90 días\):/);
  assert.match(summaryRes.text, /Distribución por rutina \(últimos 90 días\):.*Pecho\/tríceps: 9.*Espalda\/bíceps: 9.*Piernas: 0/);
  assert.match(summaryRes.text, /Evolución de peso corporal \(últimos 90 días, 3 registros\): de 82\.4 kg \(5 sep\) a 78\.6 kg \(23 nov\) \(-3\.8 kg\)/);
  assert.doesNotMatch(summaryRes.text, /Evolución de volumen mensual/);
  assert.match(detailedRes.text, /Evolución de volumen mensual \(últimos 90 días\):/);

  // Sueño, energía y cierres (4 dailyContext + 2 checkoutLog = 6 días: prom. 7.3 h y 3.8/5)
  assert.match(summaryRes.text, /Sueño, energía y cierres \(últimos 90 días\):.*sueño prom\. 7\.3 h \(en suba\).*energía prom\. 3\.8\/5 \(en suba\)/);
  assert.match(summaryRes.text, /2 cierres diarios/);
  assert.match(detailedRes.text, /Cerré la semana con foco y buen ritmo/);
  assert.match(detailedRes.text, /Avancé en el informe anual/);

  // Trabajo: resultados de procesos cerrados por estado
  assert.match(summaryRes.text, /Resultados de procesos cerrados \(3\): Rechazado: 2 · No seleccionado: 1/);
  assert.match(detailedRes.text, /AlphaTech — React Dev \[Rechazado\]/);

  // Notas: cuerpo completo sin truncar agresivamente y posesiones relevantes en Detallado
  assert.match(detailedRes.text, /revisiones quincenales de presupuesto y objetivos/);
  assert.match(detailedRes.text, /Posesiones y objetos relevantes \(1\):/);
  assert.match(detailedRes.text, /Notebook ThinkPad T14/);
  assert.doesNotMatch(summaryRes.text, /Posesiones y objetos relevantes/);

  // IAView renderiza selector Detallado activo
  const detailedHtml = renderToStaticMarkup(
    <IAView state={state} onUpdateState={() => true} defaultDetailLevel="detailed" />
  );
  assert.match(
    detailedHtml,
    /data-ia-detail="detailed"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-ia-detail="detailed"/
  );
});

test('Bloque 24.2c: 6 fixes de higiene de datos (cero cat_*, frecuencias en español, ajuste de saldo separado, notas invisibles, exámenes limpios y objetivos descendentes/miles)', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // 1 & 2 & Ajuste de saldo: categoría válida por ID, categoría huérfana cat_*, ajuste de saldo, frecuencias en inglés
  state.finance.categories = [
    { id: 'cat_valid123', name: 'Salud y Farmacia', active: true },
  ];
  state.finance.transactions = [
    { id: 't1', type: 'gasto', amount: 3000, category: 'cat_valid123', fixed: 'variable', date: '2026-11-20', currency: 'UYU' },
    { id: 't2', type: 'gasto', amount: 2000, category: 'cat_orphan9999', fixed: 'variable', date: '2026-11-21', currency: 'UYU' },
    { id: 't3', type: 'gasto', amount: 45000, category: 'Ajuste de saldo', fixed: 'variable', date: '2026-11-22', currency: 'UYU', origin: 'adjustment' },
  ];
  state.finance.expectedIncomes = [
    { id: 'ei-once', name: 'Bono puntual', amount: 15000, currency: 'UYU', startDate: '2026-12-01', frequency: 'once', active: true },
    { id: 'ei-mon', name: 'Honorarios', amount: 40000, currency: 'UYU', startDate: '2026-12-05', frequency: 'monthly', active: true },
    { id: 'ei-wk', name: 'Clases', amount: 3500, currency: 'UYU', startDate: '2026-11-27', frequency: 'weekly', active: true },
    { id: 'ei-bi', name: 'Consultoría', amount: 12000, currency: 'UYU', startDate: '2026-12-10', frequency: 'biweekly', active: true },
    { id: 'ei-yr', name: 'Aguinaldo anual', amount: 60000, currency: 'UYU', startDate: '2026-12-20', frequency: 'yearly', active: true },
  ];
  state.finance.commitments = [
    { id: 'cm-1', name: 'Seguro anual', amount: 18000, currency: 'UYU', frequency: 'yearly', nextDueDate: '2026-12-15', active: true },
  ];

  // 4. Notas con caracteres invisibles (U+3164 Hangul Filler, U+200B, NBSP)
  state.notes.postits = [
    { id: 'n-title-only', title: 'Recordatorio limpio', text: '\u3164\u200B\u00A0   ', date: REF_DATE },
    { id: 'n-fully-empty', title: '\u3164', text: '\u200B\u00A0', date: REF_DATE },
    { id: 'n-normal', title: 'Lista', text: 'Comprar café', date: REF_DATE },
  ];

  // 5. Exámenes sin prefijo redundante "Examen (Materia)"
  state.study.subjects = [
    { id: 's-fis', name: 'Física I', topics: [] },
    { id: 's-qui', name: 'Química General', topics: [] },
  ];
  state.study.exams = [
    { id: 'ex-fis', title: 'Examen', subjectId: 's-fis', date: '2026-12-02', status: 'pendiente' },
    { id: 'ex-qui', title: 'Examen (Química General)', subjectId: 's-qui', date: '2026-12-08', status: 'pendiente' },
  ];

  // 6. Objetivos descendentes (peso) y formateo correcto de miles (163830 -> 163.830, nunca 163.83)
  state.gym.weight = [
    { date: '2026-10-01', kg: 85 },
    { date: '2026-11-23', kg: 79 },
  ];
  state.goals = [
    { id: 'g-weight', name: 'Bajar a 75 kg', initial: 85, current: 85, target: 75, linked: 'weight' },
    { id: 'g-manual-miles', name: 'Ahorro viaje', initial: 0, current: 163830, target: 250000, linked: null },
  ];

  const res = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'estudios', 'notas'],
    hideExactAmounts: false,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });

  // Cero IDs cat_* crudos; categoría válida resuelta y huérfana a Sin categoría
  assert.doesNotMatch(res.text, /cat_[a-z0-9]+/i, 'Jamás debe imprimir IDs internos cat_*');
  assert.match(res.text, /Salud y Farmacia: \$U 3\.000 \(60%\)/);
  assert.match(res.text, /Sin categoría: \$U 2\.000 \(40%\)/);

  // Ajuste de saldo separado y excluido de gastos reales (gastos reales = 5.000, no 50.000)
  assert.match(res.text, /Resumen \(últimos 30 días, UYU\): ingresos \$U 0 · gastos \$U 5\.000/);
  assert.match(res.text, /Ajustes contables de saldo \(últimos 30 días, UYU, excluidos de gastos reales\): 1 ajuste/);
  assert.doesNotMatch(res.text, /Distribución por categorías:[\s\S]*Ajuste de saldo[\s\S]*Mayores gastos/);

  // 100% en español: frecuencias traducidas
  assert.match(res.text, /Bono puntual: \$U 15\.000 \(único\)/);
  assert.match(res.text, /Honorarios: \$U 40\.000 \(mensual\)/);
  assert.match(res.text, /Clases: \$U 3\.500 \(semanal\)/);
  assert.match(res.text, /Consultoría: \$U 12\.000 \(quincenal\)/);
  assert.match(res.text, /Aguinaldo anual: \$U 60\.000 \(anual\)/);
  assert.doesNotMatch(res.text, /\((?:once|monthly|weekly|biweekly|yearly)\)/);

  // Notas con relleno invisible: sin ":" colgando y nota totalmente invisible excluida
  assert.match(res.text, /Notas recientes \(2\):/);
  assert.match(res.text, /- Recordatorio limpio\n/);
  assert.doesNotMatch(res.text, /Recordatorio limpio:/);
  assert.doesNotMatch(res.text, /\u3164/);

  // Exámenes sin prefijo redundante "Examen (Materia)"
  assert.match(res.text, /- Física I: 2 dic 2026/);
  assert.match(res.text, /- Química General: 8 dic 2026/);
  assert.doesNotMatch(res.text, /Examen \(Física I\)/);
  assert.doesNotMatch(res.text, /Examen \(Química General\)/);

  // Objetivos descendentes (85 -> 79 hacia 75 = 60%) y miles bien formateados (163.830, nunca 163.83)
  assert.match(res.text, /Bajar a 75 kg: 60% de avance \(desde 85 kg, actual 79 kg, meta 75 kg\)/);
  assert.match(res.text, /Ahorro viaje: 66% de avance \(163\.830 \/ 250\.000\)/);
  assert.doesNotMatch(res.text, /163\.83[^\d]/);
});

test('Bloque 24.2d: privacidad ampliada anonimiza nombres propios de forma determinista junto con montos y cuentas', () => {
  const state = createRichState();
  state.finance.expectedIncomes = [
    {
      id: 'ei-p1',
      name: 'Devolución de Martín Gómez',
      amount: 12000,
      currency: 'UYU',
      startDate: '2026-12-02',
      frequency: 'once',
      active: true,
    },
  ];
  state.finance.agreements = [
    {
      id: 'ag-p1',
      title: 'Préstamo a Martín',
      creditorName: 'Martín Gómez',
      currency: 'UYU',
      initialRemainingBalance: 24000,
      initialReferenceDate: '2026-11-01',
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    },
  ];
  state.finance.transactions.push({
    id: 'tx-p1',
    type: 'gasto',
    amount: 18500,
    category: 'Alimentación',
    fixed: 'variable',
    date: '2026-11-22',
    currency: 'UYU',
    note: 'Cena con Lucía Fernández',
  });
  state.notes.postits.push({
    id: 'n-p1',
    title: 'Regalo para Carlos',
    text: 'Coordinar envío con Lucía Fernández y avisar a Martín',
    date: REF_DATE,
  });

  const privateRes = buildAIContextPrompt(state, {
    goalId: null,
    mode: 'data_only',
    selectedModules: ['finanzas', 'notas'],
    hideExactAmounts: true,
    timeWindowDays: 30,
    referenceDate: REF_DATE,
  });

  // Determinismo: Lucía Fernández, Martín y Carlos se anonimizan como Persona 1, Persona 2, Persona 3
  assert.match(privateRes.text, /Persona 1/);
  assert.match(privateRes.text, /Persona 2/);
  assert.match(privateRes.text, /Persona 3/);

  // Ningún nombre propio ni monto sensible puede filtrarse
  for (const leak of ['Martín', 'Gómez', 'Lucía', 'Fernández', 'Carlos', '12.000', '24.000', '18.500']) {
    assert.ok(
      !privateRes.text.includes(leak),
      `Privacidad activa no debe filtrar "${leak}"`
    );
  }

  // Consistencia determinista: la referencia repetida a la misma persona usa siempre el mismo identificador
  const martinMatches = privateRes.text.match(/Devolución de (Persona \d+)/);
  const loanMatches = privateRes.text.match(/Préstamo a (Persona \d+)/);
  const noteMatches = privateRes.text.match(/avisar a (Persona \d+)/);
  assert.ok(martinMatches && loanMatches && noteMatches, 'Todas las menciones deben quedar anonimizadas');
  assert.equal(martinMatches[1], loanMatches[1], 'Martín debe mapear al mismo Persona N en acuerdos e ingresos');
  assert.equal(loanMatches[1], noteMatches[1], 'Martín debe mapear al mismo Persona N en notas');
});
