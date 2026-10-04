import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_SCHEMA_VERSION,
  defaultState,
  inspectBackupJSON,
  parseBackupJSON,
  saveRecoveryState,
  loadRecoveryState,
  clearRecoveryState,
  getStorageDiagnostics,
  uid,
} from './storage';
import { computeAccountBalance } from './financeFlows';
import type { Account, Transaction } from '../types';

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

test('inspectBackupJSON: extrae resumen fidedigno, entidades y warnings de compatibilidad', () => {
  const sample = defaultState();
  sample.profile.name = 'Carlos Test';
  sample.todayExtras.push({
    id: uid(),
    date: '2026-10-04',
    text: 'Revisar servidor',
    done: false,
    priority: 'alta',
  });
  sample.finance.accounts = [
    { id: 'acc-1', name: 'Banco Central', balance: 15000 },
    { id: 'acc-2', name: 'Billetera', balance: 2500 },
  ];
  sample.finance.transactions.push({
    id: uid(),
    type: 'gasto',
    amount: 1500,
    category: 'Alimentación',
    fixed: 'variable',
    date: '2026-10-04',
    accountId: 'acc-1',
  });
  sample.notes.postits.push({
    id: uid(),
    title: 'Nota de seguridad',
    text: 'No perder las claves',
    date: '2026-10-04',
  });
  sample.gym.sessions.push({
    id: uid(),
    date: '2026-10-04',
    exercises: [],
    status: 'completed',
  });
  sample.schemaVersion = 1; // Schema v1 to test warnings
  delete (sample.finance as any).commitments;

  const json = JSON.stringify(sample);
  const preview = inspectBackupJSON(json);

  assert.equal(preview.schemaVersion, 1);
  assert.equal(preview.profileName, 'Carlos Test');
  assert.equal(preview.accountsCount, 2);
  assert.equal(preview.transactionsCount, 1);
  assert.equal(preview.tasksCount, sample.tasksRecurring.length + 1);
  assert.equal(preview.notesCount, 1);
  assert.equal(preview.gymSessionsCount, 1);
  assert.ok(preview.warnings.some((w) => w.includes('v1')));
  assert.ok(preview.warnings.some((w) => w.includes('compromisos financieros')));
  assert.equal(preview.state.profile.name, 'Carlos Test');
});

test('parseBackupJSON: acepta formatos planos y envueltos (envelopes) con normalización retrocompatible', () => {
  const base = defaultState();
  base.profile.name = 'Ana Backup';

  // Flat JSON
  const flatJson = JSON.stringify(base);
  const parsedFlat = parseBackupJSON(flatJson);
  assert.equal(parsedFlat.profile.name, 'Ana Backup');

  // Enveloped JSON ({ meta: ..., state: ... })
  const envelopeJson = JSON.stringify({
    meta: { exportedAt: '2026-10-04T12:00:00Z', version: 2 },
    state: base,
  });
  const parsedEnvelope = parseBackupJSON(envelopeJson);
  assert.equal(parsedEnvelope.profile.name, 'Ana Backup');

  // Rejection of alien JSON
  assert.throws(() => parseBackupJSON('{"total": 100, "status": "ok"}'), /no parece pertenecer/);
  assert.throws(() => parseBackupJSON('[1, 2, 3]'), /no parece pertenecer/);
});

test('saveRecoveryState & loadRecoveryState: ciclo completo con metadatos y fallback retrocompatible', () => {
  const testUser = 'user-data-safety-1';
  clearRecoveryState(testUser);

  const state = defaultState();
  state.profile.name = 'Snapshot User';
  state.finance.accounts = [{ id: 'a1', name: 'Efectivo', balance: 5000 }];
  state.finance.transactions = [{
    id: 't1',
    type: 'gasto',
    amount: 1000,
    category: 'Varios',
    fixed: 'variable',
    date: '2026-10-04',
  }];

  // 1. Guardar snapshot con acción 'import_backup'
  const saved = saveRecoveryState(state, testUser, 'import_backup', 'Antes de importar archivo externo');
  assert.ok(saved);

  // 2. Cargar snapshot y verificar integridad
  const recovery = loadRecoveryState(testUser);
  assert.ok(recovery);
  assert.equal(recovery.state.profile.name, 'Snapshot User');
  assert.equal(recovery.meta.action, 'import_backup');
  assert.equal(recovery.meta.description, 'Antes de importar archivo externo');
  assert.equal(recovery.meta.transactionsCount, 1);
  assert.equal(recovery.meta.schemaVersion, CURRENT_SCHEMA_VERSION);

  // 3. Diagnostics
  const diag = getStorageDiagnostics(testUser);
  assert.ok(diag.recoveryAvailable);
  assert.ok(diag.recoveryMeta);
  assert.equal(diag.recoveryMeta?.action, 'import_backup');

  // 4. Backward compatibility: leer snapshot antiguo que guardaba sólo LifeOSState plano sin envelope
  const legacyKey = `lifeos-state-v1:${testUser}:recovery`;
  localStorage.setItem(legacyKey, JSON.stringify(state));

  const legacyLoaded = loadRecoveryState(testUser);
  assert.ok(legacyLoaded);
  assert.equal(legacyLoaded.state.profile.name, 'Snapshot User');
  assert.equal(legacyLoaded.meta.action, 'manual_snapshot');

  clearRecoveryState(testUser);
  assert.equal(loadRecoveryState(testUser), null);
});

test('Operaciones destructivas: preservación de recovery snapshot previo a mutación', () => {
  const testUser = 'user-destructive-test';
  clearRecoveryState(testUser);

  const initial = defaultState();
  initial.profile.name = 'Usuario Original';
  initial.todayExtras = [{ id: 'task-1', date: '2026-10-04', text: 'Tarea importante', done: false, priority: 'alta' }];

  // Simulación: Reset Data
  // Guardamos recovery antes de reiniciar
  saveRecoveryState(initial, testUser, 'reset_data', 'Previo a reiniciar datos a valores de fábrica');
  const blankState = defaultState();
  assert.equal(blankState.profile.name, '');

  // Verificamos que podemos recuperar el estado original intacto
  const recovery = loadRecoveryState(testUser);
  assert.ok(recovery);
  assert.equal(recovery.state.profile.name, 'Usuario Original');
  assert.equal(recovery.state.todayExtras.length, 1);
  assert.equal(recovery.meta.action, 'reset_data');

  clearRecoveryState(testUser);
});

test('Auditoría y reparación de saldos: cálculo de libro mayor y mutación segura', () => {
  const state = defaultState();
  const acc1: Account = { id: 'acc-uyu', name: 'Cuenta Pesos', balance: 10000, initialBalance: 10000 };
  const acc2: Account = { id: 'acc-usd', name: 'Cuenta Ahorro', balance: 5000, initialBalance: 5000 };
  state.finance.accounts = [acc1, acc2];

  // Agregamos transacciones al libro mayor
  // Para acc-uyu: gasto de 2000 -> saldo real libro mayor = 8000 (pero cuenta dice 10000)
  const tx: Transaction = {
    id: 'tx-1',
    type: 'gasto',
    amount: 2000,
    category: 'Compras',
    fixed: 'variable',
    date: '2026-10-04',
    accountId: 'acc-uyu',
  };
  state.finance.transactions = [tx];

  // Cálculo individual
  const computed1 = computeAccountBalance(acc1, state.finance.transactions, state.finance.transfers, state.finance.reconciliations);
  const computed2 = computeAccountBalance(acc2, state.finance.transactions, state.finance.transfers, state.finance.reconciliations);

  assert.equal(computed1, 8000);
  assert.equal(computed2, 5000);

  // Detección de discrepancias
  const diffs = state.finance.accounts.map((acc) => ({
    acc,
    computed: computeAccountBalance(acc, state.finance.transactions, state.finance.transfers, state.finance.reconciliations),
  })).filter((d) => Math.abs(d.acc.balance - d.computed) > 0.001);

  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].acc.id, 'acc-uyu');
  assert.equal(diffs[0].computed, 8000);

  // Reparación: actualiza sólo la cuenta divergente
  diffs.forEach((d) => {
    d.acc.balance = d.computed;
  });

  assert.equal(state.finance.accounts[0].balance, 8000);
  assert.equal(state.finance.accounts[1].balance, 5000);
});
