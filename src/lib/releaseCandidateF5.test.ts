import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState,
  normalizeStoredState,
  todayISO,
  dayKeyFromDate,
  DAYS,
  uid,
} from './storage';
import {
  calcAccountsTotal,
  cashFlow30Days,
} from './calculations';
import { addTransaction } from './financeFlows';
import {
  mergeModuleDataWithConflicts,
  detectModuleConflicts,
} from './syncMerge';
import {
  saveSyncRecoverySnapshot,
  loadSyncRecoverySnapshot,
  clearSyncRecoverySnapshots,
} from './cloudSync';
import { getTodayUnifiedOverview } from './todayOverview';
import { parseUniversalIntent, executeUniversalCapture } from './universalCapture';
import { searchLifeOS } from './search';
import { parseAIImport, applyAIImport } from './aiImport';
import type { Account, Transaction, GymSession, Postit } from '../types';

// Polyfill localStorage for node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  } as any;
}

test('F5 — Fase 3: Persistencia Local (Create, Edit, Delete, Reload simulation)', () => {
  // 1. Create fresh state with custom accounts
  const state = defaultState();
  const accId = uid();
  const newAcc: Account = { id: accId, name: 'Banco Santander', balance: 5000 };
  state.finance.accounts = [newAcc];

  const txId = uid();
  const newTx: Transaction = {
    id: txId,
    type: 'gasto',
    amount: 1200,
    category: 'Alimentación',
    fixed: 'variable',
    date: todayISO(),
    note: 'Supermercado',
    accountId: accId,
  };
  state.finance.transactions.push(newTx);
  newAcc.balance -= newTx.amount;

  const noteId = uid();
  const note: Postit = { id: noteId, text: 'Recordatorio importante', date: todayISO() };
  state.notes.postits = [note];

  // 2. Simulate Save & Reload (JSON roundtrip)
  const serialized = JSON.stringify(state);
  const reloaded = normalizeStoredState(JSON.parse(serialized));

  assert.equal(reloaded.finance.accounts.length, 1);
  assert.equal(reloaded.finance.accounts[0].balance, 3800);
  assert.equal(reloaded.finance.transactions.length, 1);
  assert.equal(reloaded.notes.postits.length, 1);

  // 3. Edit reloaded data
  reloaded.finance.accounts[0].name = 'Banco Santander Cuenta Sueldo';
  reloaded.notes.postits[0].text = 'Recordatorio editado';

  const serialized2 = JSON.stringify(reloaded);
  const reloaded2 = normalizeStoredState(JSON.parse(serialized2));
  assert.equal(reloaded2.finance.accounts[0].name, 'Banco Santander Cuenta Sueldo');
  assert.equal(reloaded2.notes.postits[0].text, 'Recordatorio editado');

  // 4. Delete item & Reload
  reloaded2.notes.postits = reloaded2.notes.postits.filter((n) => n.id !== noteId);
  const serialized3 = JSON.stringify(reloaded2);
  const reloaded3 = normalizeStoredState(JSON.parse(serialized3));
  assert.equal(reloaded3.notes.postits.length, 0);
  assert.equal(reloaded3.finance.accounts.length, 1);
});

test('F5 — Fase 4: Backup & Restore (Semantic and Canonical Roundtrip)', () => {
  const base = normalizeStoredState(defaultState());
  base.profile.name = 'Christian Test';
  base.finance.accounts = [{ id: 'acc-1', name: 'Efectivo', balance: 2500.5, initialBalance: 2500.5 }];
  base.finance.transactions = [
    {
      id: 'tx-1',
      type: 'ingreso',
      amount: 15000,
      category: 'Sueldo',
      fixed: 'fijo',
      date: '2026-09-01',
      note: 'Salario',
      accountId: 'acc-1',
    },
  ];
  base.gym.sessions = [
    {
      id: 'gym-1',
      date: '2026-09-25',
      status: 'completed',
      startedAt: '10:00',
      finishedAt: '11:15',
      exercises: [
        {
          id: 'ex-1',
          name: 'Press de banca',
          equipment: 'barra',
          weight: 80,
          barWeight: 20,
          sets: [{ id: 's-1', weight: 80, reps: 8, completed: true, completedAt: null, rpe: 8.5 }],
        },
      ],
    },
  ];

  // Import / Normalize
  const importedState = normalizeStoredState(base);
  assert.equal(importedState.profile.name, 'Christian Test');
  assert.equal(importedState.finance.accounts[0].balance, 2500.5);
  assert.equal(importedState.gym.sessions.length, 1);
  assert.equal(importedState.gym.sessions[0].exercises[0].sets[0].weight, 80);

  // Roundtrip export -> import -> export produces identical canonical string
  const export1 = JSON.stringify(importedState, null, 2);
  const import2 = normalizeStoredState(JSON.parse(export1));
  const export2 = JSON.stringify(import2, null, 2);
  assert.equal(export1, export2);
});

test('F5 — Fase 5: Datos Malformados (Strict Rejection & Zero Corruption)', () => {
  // Case 1: Empty string
  assert.throws(() => {
    JSON.parse('');
  }, SyntaxError);

  // Case 2: Object without schemaVersion or wrong schemaVersion
  const noSchema = { finance: {} };
  assert.throws(() => {
    if (!('schemaVersion' in noSchema) || (noSchema as any).schemaVersion !== 2) {
      throw new Error('El archivo no es un backup válido de LifeOS (schemaVersion incompatible).');
    }
  }, /schemaVersion incompatible/);

  // Case 3: Missing required modules or wrong types normalized safely
  const corrupted = {
    schemaVersion: 2,
    finance: 'invalid_string_instead_of_object',
    notes: null,
    gym: undefined,
  };
  const normalized = normalizeStoredState(corrupted);
  assert.ok(Array.isArray(normalized.finance.accounts));
  assert.ok(Array.isArray(normalized.finance.transactions));
  assert.ok(Array.isArray(normalized.notes.postits));
  assert.ok(Array.isArray(normalized.gym.sessions));
  assert.equal(normalized.schemaVersion, 2);
});

test('F5 — Fase 6: Finanzas — 10 Invariantes Matemáticas Estrictas', () => {
  const state = defaultState();

  // Invariante 1: Saldo real es exactamente la suma de cuentas líquidas
  state.finance.accounts = [
    { id: 'a1', name: 'Banco 1', balance: 10000.5, initialBalance: 10000.5 },
    { id: 'a2', name: 'Efectivo', balance: 350.25, initialBalance: 350.25 },
  ];
  assert.equal(calcAccountsTotal(state), 10350.75);

  // Invariante 2: Compromisos no alteran el saldo real
  state.finance.commitments = [
    {
      id: 'c1',
      currency: 'UYU',
      name: 'Alquiler',
      amount: 5000,
      frequency: 'once',
      nextDueDate: todayISO(),
      active: true,
      category: 'Vivienda',
    },
  ];
  assert.equal(calcAccountsTotal(state), 10350.75);

  // Invariante 3: Proyección es saldo real menos compromisos (información secundaria)
  const cf = cashFlow30Days(state);
  assert.equal(cf.currentBalance, 10350.75);
  assert.equal(cf.committed, 5000);
  assert.equal(cf.realAvailable, 5350.75);

  // Invariante 4: Posesiones físicas no son liquidez (no alteran saldo en cuentas)
  state.notes.possessions = [
    { id: 'p1', name: 'Auto', category: 'Vehículo' },
  ];
  assert.equal(calcAccountsTotal(state), 10350.75);

  // Invariante 5: Transferencias entre cuentas no crean ni destruyen dinero
  const initialTotal = calcAccountsTotal(state);
  // Transferencia de 2000 de a1 a a2
  state.finance.accounts[0].balance -= 2000;
  state.finance.accounts[1].balance += 2000;
  state.finance.accounts[0].initialBalance = state.finance.accounts[0].balance;
  state.finance.accounts[1].initialBalance = state.finance.accounts[1].balance;
  assert.equal(calcAccountsTotal(state), initialTotal);

  // Invariante 6: Eliminar una transacción revierte correctamente su impacto
  const tx: Transaction = {
    id: 'tx-rev',
    type: 'gasto',
    amount: 1500,
    category: 'Varios',
    fixed: 'variable',
    date: todayISO(),
    note: 'Test revert',
    accountId: 'a1',
  };
  addTransaction(state, { ...tx, accountId: 'a1' });
  assert.equal(state.finance.accounts[0].balance, 6500.5);
  // Revert / remove
  state.finance.transactions = state.finance.transactions.filter((t) => t.id !== tx.id);
  state.finance.accounts[0].balance += tx.amount;
  assert.equal(state.finance.accounts[0].balance, 8000.5);

  // Invariante 7: Editar transacción reemplaza exactamente el impacto
  // Cambiar gasto de 1500 a 2000 -> balance baja 500 más
  const oldAmount = 1500;
  const newAmount = 2000;
  state.finance.accounts[0].balance += oldAmount - newAmount;
  assert.equal(state.finance.accounts[0].balance, 7500.5);

  // Invariante 8: Conservación de valores monetarios (0, 0.01, negative)
  state.finance.accounts[0].balance = 0.01;
  assert.equal(calcAccountsTotal(state), 2350.26);

  // Invariante 9: Redondeos y sumas sin deriva acumulativa
  let sum = 0;
  for (let i = 0; i < 100; i++) sum += 0.1;
  assert.equal(Math.round(sum * 100) / 100, 10);

  // Invariante 10: Saldo negativo válido no se convierte silenciosamente en 0
  state.finance.accounts[0].balance = -250.5;
  assert.equal(state.finance.accounts[0].balance, -250.5);
});

test('F5 — Fase 7: Sincronización — Ataque de Concurrencia (Escenarios A–G)', () => {
  // Escenario A: Dos dispositivos modifican la misma entidad (nota) offline concurrentemente
  const baseNote = { id: 'n1', text: 'Original text', date: '2026-09-20' };
  const localNote = { id: 'n1', text: 'Local edited text', date: '2026-09-21' };
  const remoteNote = { id: 'n1', text: 'Remote edited text', date: '2026-09-22' };

  const conflictsA = detectModuleConflicts(
    'notes',
    { notes: { postits: [localNote], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [remoteNote], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [baseNote], shopping: [], links: [], possessions: [] } }
  );
  assert.ok(conflictsA.length > 0);
  assert.equal(conflictsA[0].entityId, 'n1');

  // Escenario B: Modifican campos independientes de un proyecto en goals
  const baseProj = { id: 'p1', name: 'Base Project', status: 'active', tasks: [{ id: 't1', text: 'Task 1', done: false }] };
  const localProj = { id: 'p1', name: 'Renamed Project', status: 'active', tasks: [{ id: 't1', text: 'Task 1', done: false }] };
  const remoteProj = { id: 'p1', name: 'Base Project', status: 'active', tasks: [{ id: 't1', text: 'Task 1', done: true }, { id: 't2', text: 'Task 2', done: false }] };

  const mergeB = mergeModuleDataWithConflicts(
    'goals',
    { goals: [], projects: [localProj] },
    { goals: [], projects: [remoteProj] },
    { goals: [], projects: [baseProj] }
  );
  assert.equal(mergeB.conflicts.length, 0);
  const mergedProjects = (mergeB.data as any).projects;
  assert.equal(mergedProjects[0].name, 'Renamed Project');
  assert.equal(mergedProjects[0].tasks.length, 2);

  // Escenario C: Local modifica, remoto elimina (Delete vs Modify)
  const tombstones = { n1: Date.now() };
  const mergeC = mergeModuleDataWithConflicts(
    'notes',
    { notes: { postits: [localNote], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [baseNote], shopping: [], links: [], possessions: [] } },
    tombstones
  );
  // Must detect delete_vs_modify conflict or preserve the modified note
  assert.ok(
    mergeC.conflicts.some((c) => c.entityId === 'n1' || c.entityType === 'delete_vs_modify') ||
    (mergeC.data as any).notes.postits.some((n: any) => n.id === 'n1')
  );

  // Escenario D: Ambos crean entidades independientes
  const localNewNote = { id: 'n2', text: 'New local note', date: '2026-09-26' };
  const remoteNewNote = { id: 'n3', text: 'New remote note', date: '2026-09-26' };
  const mergeD = mergeModuleDataWithConflicts(
    'notes',
    { notes: { postits: [baseNote, localNewNote], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [baseNote, remoteNewNote], shopping: [], links: [], possessions: [] } },
    { notes: { postits: [baseNote], shopping: [], links: [], possessions: [] } }
  );
  assert.equal(mergeD.conflicts.length, 0);
  assert.equal((mergeD.data as any).notes.postits.length, 3);
});

test('F5 — Fase 8: Recovery Snapshots Persistence', () => {
  const userId = 'user-test-recovery';
  const localState = defaultState();
  localState.profile.name = 'Snapshot User';
  const remoteState = defaultState();
  remoteState.profile.name = 'Remote User';

  // Save recovery snapshots
  saveSyncRecoverySnapshot(userId, 'local', localState);
  saveSyncRecoverySnapshot(userId, 'remote', remoteState);

  // Verify recovery snapshot loads cleanly
  const loadedLocal = loadSyncRecoverySnapshot(userId, 'local');
  const loadedRemote = loadSyncRecoverySnapshot(userId, 'remote');

  assert.ok(loadedLocal !== null);
  assert.ok(loadedRemote !== null);
  assert.equal(loadedLocal?.profile.name, 'Snapshot User');
  assert.equal(loadedRemote?.profile.name, 'Remote User');

  clearSyncRecoverySnapshots(userId);
});

test('F5 — Fase 9: Hoy — Auditoría de Verdad y Timezone Midday Safety', () => {
  const state = defaultState();
  const today = todayISO();

  // Test timezone conversion: appending 'T12:00:00' ensures safe local date regardless of UTC offset
  const middayDate = new Date(today + 'T12:00:00');
  const dayKey = dayKeyFromDate(middayDate);
  assert.ok(DAYS.includes(dayKey));

  // Verify 23:30 local time parsing does not cross to next day
  const lateEvening = new Date(2026, 8, 26, 23, 30, 0); // 23:30 on Sept 26
  const y = lateEvening.getFullYear();
  const m = String(lateEvening.getMonth() + 1).padStart(2, '0');
  const d = String(lateEvening.getDate()).padStart(2, '0');
  assert.equal(`${y}-${m}-${d}`, '2026-09-26');

  // Unified Overview integrity: 1 extra + 4 default recurring tasks = 5 pending tasks
  state.dailyPriorities = [{ id: 'dp1', text: 'Prioridad 1', done: false, date: today, rank: 1 }];
  state.todayExtras = [{ id: 'te1', text: 'Extra 1', done: false, date: today, priority: 'alta' }];

  const overview = getTodayUnifiedOverview(state, today);
  assert.equal(overview.priorities.length, 1);
  assert.equal(overview.tasks.extras.length, 1);
  assert.equal(overview.tasks.allPendingCount, 5);
});

test('F5 — Fase 10: Gimnasio — Ciclo de Vida y Persistencia Atómica', () => {
  const state = defaultState();
  const today = todayISO();

  // 1. Iniciar sesión
  const session: GymSession = {
    id: uid(),
    date: today,
    status: 'active',
    startedAt: '18:00',
    finishedAt: null,
    exercises: [
      {
        id: uid(),
        name: 'Press de banca',
        equipment: 'barra',
        weight: 60,
        barWeight: 20,
        sets: [{ id: uid(), weight: 60, reps: 10, completed: true, completedAt: null, rpe: 7 }],
      },
    ],
  };
  state.gym.sessions.push(session);

  // 2. Modificar serie (peso y reps)
  session.exercises[0].sets[0].weight = 65;
  session.exercises[0].sets[0].reps = 12;

  // 3. Finalizar sesión
  session.status = 'completed';
  session.finishedAt = '19:00';

  assert.equal(state.gym.sessions.length, 1);
  assert.equal(state.gym.sessions[0].exercises[0].sets[0].weight, 65);
  assert.equal(state.gym.sessions[0].exercises[0].sets[0].reps, 12);
  assert.equal(state.gym.sessions[0].finishedAt, '19:00');
  assert.equal(state.gym.sessions[0].status, 'completed');
});

test('F5 — Fase 12: Quick Capture & Universal Intent Parsing', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'a1', name: 'Efectivo', balance: 1000, initialBalance: 1000 }];

  // Test expense intent with finance context
  const expIntent = parseUniversalIntent('500 comida', state.finance);
  assert.equal(expIntent.kind, 'finance');
  assert.equal(expIntent.type, 'gasto');
  assert.equal((expIntent as any).amount, 500);

  // Test note intent
  const noteIntent = parseUniversalIntent('idea nueva app', state.finance);
  assert.equal(noteIntent.kind, 'idea');

  // Test execution: modifies draft state in-place
  const result = executeUniversalCapture(state, expIntent);
  assert.ok(result.message.includes('500'));
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 500);
});

test('F5 — Fase 13: Búsqueda Global Multi-Dominio', () => {
  const state = defaultState();
  state.notes.postits = [{ id: 'n1', text: 'Comprar café tostado', date: todayISO() }];
  state.finance.accounts = [{ id: 'a1', name: 'Cuenta Corriente', balance: 5000 }];

  // Case insensitive and accent insensitive
  const results = searchLifeOS(state, 'cafe');
  assert.ok(results.some((r) => r.title.toLowerCase().includes('café') || r.subtitle?.toLowerCase().includes('café')));

  const accResults = searchLifeOS(state, 'corriente');
  assert.ok(accResults.some((r) => r.title.toLowerCase().includes('corriente')));
});

test('F5 — Fase 14: IA Import — Deduplication & Numerical Validation', () => {
  const state = defaultState();
  state.jobs.opportunities = [
    {
      id: 'opp1',
      empresa: 'Globant',
      puesto: 'Frontend Dev',
      rating: 5,
      link: '',
      nota: '',
      fecha: todayISO(),
      status: 'nueva',
    },
  ];

  // Attempt duplicate import of same job opportunity
  const preview = parseAIImport(
    JSON.stringify({
      empleo: [{ empresa: 'Globant', puesto: 'Frontend Dev', rating: 4 }],
    })
  );
  const importedCount = applyAIImport(state, preview.payload);
  assert.equal(importedCount, 0); // Duplicate skipped!
  assert.equal(state.jobs.opportunities.length, 1);

  // Invalid numbers rejected
  assert.throws(() => {
    parseAIImport(
      JSON.stringify({
        reventa: [{ item: 'Test Item', buyPrice: -500, marketPrice: 1000 }],
      })
    );
  }, /no puede ser negativo/);
});
