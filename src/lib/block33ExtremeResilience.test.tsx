import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LifeOSState } from '../types';
import {
  defaultState,
  fmtDate,
  formatMoney,
  inspectBackupJSON,
  parseBackupJSON,
  sameMonth,
  sameYear,
  withinCurrentWeek,
} from './storage';
import { searchLifeOS } from './search';
import { AI_CONTEXT_MODULES, AI_GOALS, buildAIContextPrompt } from './aiContextBuilder';
import {
  getTodayPulse,
  getTodayRadarMilestones,
  partitionTodayAgenda,
  resolveTodaySpotlight,
} from './todayControlCenter';
import { buildGymHistory } from './gymHistory';
import { formatRelativeTime } from './notesFlows';
import { parseQuickFinance } from '../utils/quickFinanceParser';
import { DashboardView } from '../components/DashboardView';
import { TrabajoView } from '../components/TrabajoView';
import { JobKanbanBoard } from '../components/JobKanbanBoard';

const BAD_TOKENS_RE = /\b(NaN|Infinity|undefined|Invalid Date)\b/;

function makeEmptyAccountState(): LifeOSState {
  const base = defaultState();
  return {
    ...base,
    profile: { name: '', height: 170, bodyCompositionSex: null },
    tasksRecurring: [],
    finance: {
      ...base.finance,
      accounts: [],
      categories: [],
      transactions: [],
      transfers: [],
      reconciliations: [],
      commitments: [],
      expectedIncomes: [],
      agreements: [],
      debts: [],
      investments: [],
      subscriptions: [],
      minCushion: 0,
    },
    settings: {
      ...base.settings,
      onboardingCompleted: true,
      hiddenTabs: [],
      darkMode: true,
      privacyMode: false,
    },
  };
}

function makeStressState(privacyMode = false): LifeOSState {
  const base = makeEmptyAccountState();
  const today = '2026-11-27';
  const longNoSpace = (prefix: string) =>
    `${prefix}SinEspaciosExtremadamenteLargoParaProbarDesbordeEnMovil389px_2026`;

  return {
    ...base,
    profile: { name: longNoSpace('UsuarioStress'), height: 180, bodyCompositionSex: 'male' },
    agenda: {
      ...base.agenda,
      viernes: [
        { id: 'ag-1', time: '09:00', activity: `${longNoSpace('Reunion')} por $U 999.999.999,99` },
      ],
    },
    todayExtras: [
      { id: 'te-1', date: today, text: `${longNoSpace('TareaHoy')} pagar US$ 123.456,78`, done: false, priority: 'alta' },
    ],
    finance: {
      ...base.finance,
      categories: [
        { id: 'Comida', name: 'Comida', active: true },
        { id: 'cat-regex', name: 'Auto + Nafta (Personal) [UYU]', active: true },
      ],
      accounts: [
        {
          id: 'acc-1',
          name: 'CuentaBancariaCorporativaInternacionalSinEspacios_2026 (UYU) [Principal]',
          balance: 999999999.99,
          initialBalance: 999999999.99,
          currency: 'UYU',
        },
        {
          id: 'acc-2',
          name: 'CuentaDolaresOffshore_2026 [USD]',
          balance: -123456789.5,
          initialBalance: -123456789.5,
          currency: 'USD',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          date: today,
          type: 'ingreso',
          amount: 999999999.99,
          category: 'Comida',
          note: `${longNoSpace('CobroGigante')} por $U 999.999.999,99`,
          accountId: 'acc-1',
          fixed: 'variable',
        },
        {
          id: 'tx-2',
          date: today,
          type: 'gasto',
          amount: 123456789.5,
          category: 'cat-regex',
          note: 'Pago extraordinario US$ 123.456,78',
          accountId: 'acc-2',
          fixed: 'variable',
        },
      ],
    },
    jobs: {
      opportunities: [
        {
          id: 'jop-1',
          empresa: longNoSpace('EmpresaOportunidad'),
          puesto: 'Principal Engineer US$ 150.000',
          nota: 'Bono anual US$ 45.000',
          fecha: today,
          status: 'nueva',
        },
      ],
      applications: [
        {
          id: 'job-1',
          empresa: `${longNoSpace('CorporacionGlobal')} $U 999.999,99`,
          puesto: 'Senior Staff Engineer sueldo US$ 120.000',
          tipo: 'convencional',
          estado: 'entrevista',
          fecha: today,
          notas: 'Oferta de US$ 120.000 anuales',
          nextAction: 'Negociar paquete US$ 120.000',
          keyDates: [],
        },
      ],
    },
    notes: {
      postits: [
        {
          id: 'n-1',
          title: longNoSpace('NotaFijada'),
          text: `${longNoSpace('ContenidoLargo')} presupuesto $U 543.210,50`,
          date: today,
          pinned: true,
        },
      ],
      shopping: [],
      links: [],
      possessions: [],
    },
    settings: {
      ...base.settings,
      privacyMode,
    },
  };
}

test('Bloque 33.1: Cuenta 100 % vacía — aiContextBuilder, todayControlCenter, searchLifeOS y vistas renderizan sin NaN/undefined/Invalid Date', () => {
  const empty = makeEmptyAccountState();
  const refDate = '2026-11-27';

  // AI context builder across all goals & modules (summary + detailed)
  const allModules = AI_CONTEXT_MODULES.map((m) => m.id);
  for (const goal of AI_GOALS) {
    for (const detailLevel of ['summary', 'detailed'] as const) {
      const prompt = buildAIContextPrompt(empty, {
        goalId: goal.id,
        selectedModules: allModules,
        hideExactAmounts: false,
        detailLevel,
        referenceDate: refDate,
      });
      assert.equal(prompt.hasAnyData, false);
      assert.doesNotMatch(prompt.text, BAD_TOKENS_RE, `Goal ${goal.id} (${detailLevel}) no debe contener tokens inválidos`);
    }
  }

  // todayControlCenter calculations on empty account
  const refNow = new Date('2026-11-27T12:00:00');
  const partition = partitionTodayAgenda(empty, [], refNow, refDate);
  assert.equal(partition.timedBlocks.length, 0);
  assert.equal(partition.untimedTasks.length, 0);
  const spotlight = resolveTodaySpotlight(empty, [], refNow, refDate);
  assert.ok(spotlight !== undefined);
  const milestones = getTodayRadarMilestones(empty, refDate);
  assert.ok(Array.isArray(milestones));
  const pulse = getTodayPulse(empty, [], refDate, refNow);
  assert.doesNotMatch(JSON.stringify(pulse), BAD_TOKENS_RE);

  // searchLifeOS on empty account
  assert.deepEqual(searchLifeOS(empty, 'finanzas'), []);

  // SSR render of DashboardView & TrabajoView on 100% empty account
  const noop = () => {};
  const dashHtml = renderToStaticMarkup(
    React.createElement(DashboardView, {
      state: empty,
      onUpdateState: noop,
      onNavigate: noop,
      onExportJSON: noop,
    })
  );
  assert.doesNotMatch(dashHtml, BAD_TOKENS_RE, 'DashboardView vacío no debe renderizar NaN/undefined/Invalid Date');

  const trabajoHtml = renderToStaticMarkup(
    React.createElement(TrabajoView, {
      state: empty,
      onUpdateState: noop,
    })
  );
  assert.doesNotMatch(trabajoHtml, BAD_TOKENS_RE, 'TrabajoView vacío no debe renderizar NaN/undefined/Invalid Date');
});

test('Bloque 33.2: Stress de montos gigantes, strings sin espacios y Modo Privacidad sin fugas en Trabajo, Ctrl+K y Dashboard', () => {
  assert.equal(formatMoney(999999999.99, 'UYU'), '$U 999.999.999,99');
  assert.equal(formatMoney(-123456789.5, 'USD'), '−US$ 123.456.789,50');

  const stressPrivate = makeStressState(true);

  // Ctrl+K search must NOT leak any currency figure in jobs.opportunities, jobs.applications, transactions or notes
  for (const query of ['Empresa', 'Corporacion', 'Cobro', 'Nota', 'Reunion']) {
    const hits = searchLifeOS(stressPrivate, query);
    assert.ok(hits.length > 0, `Debe encontrar resultados para "${query}"`);
    const joined = hits.map((h) => `${h.title} ${h.subtitle} ${h.badge || ''}`).join(' | ');
    assert.equal(joined.includes('150.000'), false, `No debe filtrar 150.000 en búsqueda "${query}"`);
    assert.equal(joined.includes('120.000'), false, `No debe filtrar 120.000 en búsqueda "${query}"`);
    assert.equal(joined.includes('999.999.999'), false, `No debe filtrar 999.999.999 en búsqueda "${query}"`);
    assert.equal(joined.includes('543.210'), false, `No debe filtrar 543.210 en búsqueda "${query}"`);
  }

  // TrabajoView & JobKanbanBoard with privacyMode=true must mask salary figures in puesto & empresa
  const noop = () => {};
  const trabajoHtml = renderToStaticMarkup(
    React.createElement(TrabajoView, {
      state: stressPrivate,
      onUpdateState: noop,
    })
  );
  assert.equal(trabajoHtml.includes('120.000'), false, 'TrabajoView no debe filtrar cifras en puesto/notas con Modo Privacidad');
  assert.equal(trabajoHtml.includes('999.999,99'), false, 'TrabajoView no debe filtrar cifras en empresa con Modo Privacidad');

  const kanbanHtml = renderToStaticMarkup(
    React.createElement(JobKanbanBoard, {
      applications: stressPrivate.jobs.applications,
      tipo: 'convencional',
      privacyMode: true,
      onSetEstado: noop,
      onEditApplication: noop,
      onDeleteApplication: noop,
    })
  );
  assert.equal(kanbanHtml.includes('120.000'), false, 'JobKanbanBoard no debe filtrar cifras en puesto con Modo Privacidad');
  assert.equal(kanbanHtml.includes('999.999,99'), false, 'JobKanbanBoard no debe filtrar cifras en empresa con Modo Privacidad');

  // DashboardView hero & pinned notes must include overflow-wrap protection for unbroken strings
  const dashStressHtml = renderToStaticMarkup(
    React.createElement(DashboardView, {
      state: makeStressState(false),
      onUpdateState: noop,
      onNavigate: noop,
      onExportJSON: noop,
    })
  );
  assert.match(dashStressHtml, /\[overflow-wrap:anywhere\]/, 'DashboardView debe proteger títulos/notas largas sin espacios');
  assert.doesNotMatch(dashStressHtml, BAD_TOKENS_RE);

  // AI context builder on overloaded state with privacy enabled
  const aiPrompt = buildAIContextPrompt(stressPrivate, {
    goalId: 'revisar_finanzas',
    selectedModules: AI_CONTEXT_MODULES.map((m) => m.id),
    hideExactAmounts: true,
    detailLevel: 'detailed',
    referenceDate: '2026-11-27',
  });
  assert.doesNotMatch(aiPrompt.text, BAD_TOKENS_RE);
  assert.equal(aiPrompt.text.includes('999.999.999'), false, 'IA con privacidad activa no debe exponer montos exactos');
});

test('Bloque 33.3: Resiliencia ante backups JSON corruptos/inválidos sin mutar estado previo', () => {
  const corruptPayloads = [
    '',
    '   ',
    '{ roto',
    '[]',
    'null',
    '{}',
    JSON.stringify({ state: 'not-an-object' }),
    JSON.stringify({ agenda: { lunes: 'not-an-array' } }),
    JSON.stringify({ finance: { transactions: [{ id: 'bad', amount: 'NOT_A_NUMBER', date: '2026-11-27' }] } }),
    JSON.stringify({ finance: { transfers: [{ id: 'bad', amount: 'abc' }] } }),
    JSON.stringify({ finance: { accounts: [{ id: 'a1', name: 'X', balance: 'NaN' }] } }),
    JSON.stringify({ notes: { postits: ['not-an-object'] } }),
  ];

  for (const payload of corruptPayloads) {
    assert.throws(
      () => parseBackupJSON(payload),
      /Celestian LifeOS|backup|esquema|registros|importes|saldos|fechas/i,
      `Debe rechazar backup corrupto con mensaje humano en español: ${payload.slice(0, 60)}`
    );
    assert.throws(
      () => inspectBackupJSON(payload),
      /Celestian LifeOS|backup|esquema|registros|importes|saldos|fechas/i
    );
  }
});

test('Bloque 33.4: Búsquedas hostiles con RegExp, emojis, 300+ chars y fechas inválidas heredadas sin excepciones ni Invalid Date', () => {
  const stress = makeStressState(false);

  // Hostile queries in searchLifeOS
  const hostileQueries = [
    '[(*+?^$|\\',
    '🔥🚀💰🧪💀',
    '     ',
    'x'.repeat(350),
    '(?:test)+[a-z]*$',
  ];
  for (const q of hostileQueries) {
    const res = searchLifeOS(stress, q);
    assert.ok(Array.isArray(res));
  }

  // Malformed partial state inside searchLifeOS must never throw
  const malformed = {
    ...stress,
    agenda: { ...stress.agenda, lunes: 'corrupto' as unknown as [] },
    gym: {
      ...stress.gym,
      routineTemplates: [{ id: 'rt-bad', name: 'R', exercises: undefined as unknown as [] }],
      sessions: [{ id: 's-bad', date: '2026-11-27', exercises: undefined as unknown as [] }],
    },
    notes: {
      ...stress.notes,
      postits: [{ id: 'p-bad', text: undefined as unknown as string, date: '2026-11-27' }],
    },
  };
  assert.doesNotThrow(() => searchLifeOS(malformed, 'corrupto'));
  assert.doesNotThrow(() => searchLifeOS(malformed, 'rutina'));

  // Regression: quickFinanceParser with RegExp metacharacters in account/category names and hostile input
  assert.doesNotThrow(() => {
    const parsed = parseQuickFinance('gasté $500 en [(*+?^$|\\ con Banco (Personal)', {
      accounts: stress.finance.accounts,
      categories: stress.finance.categories,
    });
    assert.equal(parsed.amount, 500);
  });

  // Invalid legacy dates never render "Invalid Date" or throw
  for (const badDate of ['', 'invalid-date', '2026-02-30', '2026-99-99', 'null']) {
    assert.equal(fmtDate(badDate), '');
    assert.equal(withinCurrentWeek(badDate), false);
    assert.equal(sameMonth(badDate, new Date('2026-11-27T12:00:00')), false);
    assert.equal(sameYear(badDate, new Date('2026-11-27T12:00:00')), false);
    const rel = formatRelativeTime(badDate);
    assert.equal(rel.includes('Invalid Date'), false);
  }

  const gymHistory = buildGymHistory([
    {
      id: 'g-bad',
      date: '2026-99-99',
      status: 'completed',
      exercises: [{ id: 'e1', name: 'Press', sets: [{ id: 's1', weight: 50, reps: 10, completed: true }] }],
    },
  ]);
  assert.doesNotMatch(JSON.stringify(gymHistory), BAD_TOKENS_RE);
});
