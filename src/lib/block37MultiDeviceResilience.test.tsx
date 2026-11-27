import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  defaultState,
  getStorageKey,
  loadStoredState,
  normalizeStoredState,
  saveStoredState,
  todayISO,
} from './storage';
import {
  SYNC_MODULES,
  buildStateFromModules,
  equivalentLifeOSState,
  mergeSyncModule,
  mergeSyncModuleWithConflicts,
  syncModuleData,
  syncModuleFingerprint,
  type SyncConflictItem,
  type SyncModuleKey,
} from './syncModel';
import {
  detectDeletedEntityIds,
  pruneTombstones,
} from './syncMerge';
import { addTransaction, deleteTransaction } from './financeFlows';
import { createFinanceRevisionOrderAfter, nextFinanceDeletionTimestamp } from './financeRevision';
import { stampGymMutation } from './gymSync';
import {
  CryptoDecryptionError,
  clearWrappedKeyEnvelope,
  cryptoSession,
  decodeCloudModuleData,
  decryptSyncModule,
  encryptSyncModule,
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  unlockMdekWithVaultPassword,
} from './cryptoCore';
import { _resetDeviceTrustFallbackStore } from './deviceTrust';
import {
  parseCrossTabStorageEvent,
  reconcileCrossTabUpdate,
  resolveOnlineSyncStatus,
} from './crossTabSync';
import { CloudConflictModal, sanitizeConflictSummary } from '../components/CloudConflictModal';
import { UnlockDeviceModal } from '../components/UnlockDeviceModal';
import { PrivacyProvider } from '../components/PrivacyAmount';
import type { LifeOSState } from '../types';

const ROOT = process.cwd();

function installMemoryStorage() {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  return {
    store,
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete (globalThis as Record<string, unknown>).localStorage;
    },
  };
}

function buildSharedBaselineState(): LifeOSState {
  const today = todayISO();
  const base = defaultState();
  base.profile.name = 'Usuario Multi-Dispositivo';
  base.settings.onboardingCompleted = true;

  // Deterministic accounts with initial balances
  base.finance.accounts = [
    { id: 'acc-efectivo', name: 'Efectivo', initialBalance: 10000, balance: 10000, currency: 'UYU' },
    { id: 'acc-banco', name: 'Banco', initialBalance: 50000, balance: 50000, currency: 'UYU' },
  ];
  addTransaction(base, {
    id: 'tx-base-1',
    date: today,
    type: 'gasto',
    amount: 2000,
    category: 'Comida',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'Supermercado base',
    currency: 'UYU',
  });

  // Deterministic recurring task + extra
  base.tasksRecurring = [
    { id: 'rec-agua', name: 'Tomar 2L de agua', freq: 'daily' },
    { id: 'rec-lectura', name: 'Leer 20 minutos', freq: 'daily' },
  ];
  base.todayExtras = [
    { id: 'extra-base-1', date: today, text: 'Revisar facturas', done: false, priority: 'media' },
  ];

  // Shared note
  base.notes.postits = [
    {
      id: 'note-base-1',
      title: 'Lista base',
      text: 'Contenido inicial compartido',
      date: today,
      createdAt: '2026-11-27T08:00:00.000Z',
      updatedAt: '2026-11-27T08:00:00.000Z',
    },
  ];

  // Shared agenda block
  base.agenda.lunes = [
    { id: 'ag-lun-1', time: '09:00', activity: 'Trabajo profundo' },
  ];

  // Shared gym session (active)
  base.gym.sessions = [
    {
      id: 'gym-sess-1',
      date: today,
      weekLabel: 'Semana 1',
      status: 'active',
      exercises: [
        {
          id: 'ex-bench',
          name: 'Press de banca',
          equipment: 'barra',
          weight: 60,
          reps: '8',
          sets: [
            { id: 'set-1', weight: 60, reps: 8, completed: false },
            { id: 'set-2', weight: 60, reps: 8, completed: false },
          ],
        },
      ],
    },
  ];

  return normalizeStoredState(base);
}

test('Bloque 37.1: Ediciones concurrentes sin pérdida (PC + Celular) preservan todos los cambios y saldos exactos', () => {
  const today = todayISO();
  const base = buildSharedBaselineState();

  // Dispositivo A (PC): agrega gasto en Finanzas, completa rutina en Hoy y agrega tarea extra
  const pcState = structuredClone(base);
  addTransaction(pcState, {
    id: 'tx-pc-1',
    date: today,
    type: 'gasto',
    amount: 1250,
    category: 'Transporte',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'Combustible desde PC',
    currency: 'UYU',
  });
  pcState.taskLog[today] = { 'rec-agua': true };
  pcState.todayExtras.push({
    id: 'extra-pc-1',
    date: today,
    text: 'Enviar presupuesto cliente',
    done: false,
    priority: 'alta',
  });
  // Active local timer on PC that must remain untouched by merge
  pcState.gym.activeTimer = {
    sessionId: 'gym-sess-1',
    endsAt: Date.now() + 80_000,
    durationSeconds: 90,
    kind: 'set',
  };

  // Dispositivo B (Celular): crea nota, edita una serie en Gimnasio, modifica bloque en Agenda y registra ingreso/gasto disjuntos
  const mobileState = structuredClone(base);
  mobileState.notes.postits.push({
    id: 'note-mobile-1',
    title: 'Idea móvil',
    text: 'Comprado en el camino',
    date: today,
    createdAt: '2026-11-27T10:05:00.000Z',
    updatedAt: '2026-11-27T10:05:00.000Z',
  });
  mobileState.gym.sessions[0].exercises[0].sets[0] = {
    id: 'set-1',
    weight: 65,
    reps: 10,
    completed: true,
    completedAt: '2026-11-27T10:06:00.000Z',
  };
  stampGymMutation(base.gym, mobileState.gym, 'device-mobile');

  mobileState.agenda.lunes[0] = {
    id: 'ag-lun-1',
    time: '09:30',
    activity: 'Trabajo profundo + revisión',
  };
  mobileState.agenda.martes.push({
    id: 'ag-mar-1',
    time: '18:00',
    activity: 'Entrenamiento fuerza',
  });

  addTransaction(mobileState, {
    id: 'tx-mobile-income',
    date: today,
    type: 'ingreso',
    amount: 5000,
    category: 'Otros',
    fixed: 'variable',
    accountId: 'acc-efectivo',
    note: 'Cobro freelance móvil',
    currency: 'UYU',
  });
  addTransaction(mobileState, {
    id: 'tx-mobile-cafe',
    date: today,
    type: 'gasto',
    amount: 350,
    category: 'Comida',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'Café móvil',
    currency: 'UYU',
  });

  // Merge all modified modules from PC perspective receiving Mobile changes with shared baseline
  const modulesToMerge: SyncModuleKey[] = ['finance', 'tasks', 'notes', 'gym', 'agenda'];
  let merged = structuredClone(pcState);
  const allConflicts: SyncConflictItem[] = [];

  for (const mod of modulesToMerge) {
    const res = mergeSyncModuleWithConflicts(
      merged,
      mod,
      syncModuleData(mobileState, mod),
      syncModuleData(base, mod),
      {}
    );
    merged = res.state;
    allConflicts.push(...res.conflicts);
  }

  assert.equal(allConflicts.length, 0, `No debería haber conflictos en cambios concurrentes disjuntos: ${JSON.stringify(allConflicts)}`);

  // Finanzas: todas las transacciones sin duplicados y saldos exactos
  const txIds = merged.finance.transactions.map((t) => t.id);
  assert.equal(new Set(txIds).size, txIds.length, 'No debe haber IDs duplicados en transacciones');
  for (const expectedId of ['tx-base-1', 'tx-pc-1', 'tx-mobile-income', 'tx-mobile-cafe']) {
    assert.ok(txIds.includes(expectedId), `Falta la transacción ${expectedId} tras el merge`);
  }
  const banco = merged.finance.accounts.find((a) => a.id === 'acc-banco');
  const efectivo = merged.finance.accounts.find((a) => a.id === 'acc-efectivo');
  assert.ok(banco && efectivo);
  assert.equal(banco.balance, 50000 - 2000 - 1250 - 350, 'Saldo Banco debe reflejar ambos dispositivos');
  assert.equal(efectivo.balance, 10000 + 5000, 'Saldo Efectivo debe reflejar el ingreso del celular');
  assert.equal(Number.isNaN(banco.balance), false);
  assert.equal(Number.isNaN(efectivo.balance), false);

  // Hoy / Rutinas
  assert.equal(merged.taskLog[today]?.['rec-agua'], true, 'Rutina completada en PC debe conservarse');
  assert.ok(merged.todayExtras.some((e) => e.id === 'extra-pc-1'), 'Tarea extra de PC debe conservarse');
  assert.ok(merged.todayExtras.some((e) => e.id === 'extra-base-1'), 'Tarea base debe conservarse');

  // Notas
  assert.ok(merged.notes.postits.some((n) => n.id === 'note-base-1'));
  assert.ok(merged.notes.postits.some((n) => n.id === 'note-mobile-1'), 'Nota creada en celular debe conservarse');

  // Gimnasio: serie editada en celular + timer local de PC preservado
  const mergedSet = merged.gym.sessions[0].exercises[0].sets.find((s) => s.id === 'set-1');
  assert.equal(mergedSet?.weight, 65);
  assert.equal(mergedSet?.reps, 10);
  assert.equal(mergedSet?.completed, true);
  assert.ok(merged.gym.activeTimer, 'El timer de descanso local en PC no debe perderse al recibir cambios remotos');

  // Agenda
  assert.equal(merged.agenda.lunes[0]?.time, '09:30');
  assert.equal(merged.agenda.lunes[0]?.activity, 'Trabajo profundo + revisión');
  assert.ok(merged.agenda.martes.some((b) => b.id === 'ag-mar-1'));
});

test('Bloque 37.2: Edición offline + borrado (Tombstone vs. Update) no resucita fantasmas y resuelve conflictos de forma determinista', () => {
  const today = todayISO();
  const base = buildSharedBaselineState();
  base.notes.postits.push({
    id: 'note-race-1',
    title: 'Nota en carrera',
    text: 'Versión base',
    date: today,
    createdAt: '2026-11-27T08:00:00.000Z',
    updatedAt: '2026-11-27T08:00:00.000Z',
  });

  // --- Subcaso A: Dispositivo A elimina tarea, nota y transacción mientras B está offline sin tocarlos ---
  const deviceA = structuredClone(base);
  deviceA.todayExtras = deviceA.todayExtras.filter((t) => t.id !== 'extra-base-1');
  deviceA.notes.postits = deviceA.notes.postits.filter((n) => n.id !== 'note-base-1');
  deleteTransaction(deviceA, 'tx-base-1');

  const deletedIds = detectDeletedEntityIds(base, deviceA);
  assert.ok(deletedIds.includes('extra-base-1'));
  assert.ok(deletedIds.includes('note-base-1'));
  assert.ok(deletedIds.includes('tx-base-1'));

  const tombstones: Record<string, number> = {};
  const deleteNow = Date.now();
  for (const id of deletedIds) {
    tombstones[id] = nextFinanceDeletionTimestamp(base, id, deleteNow);
  }

  // Dispositivo B estuvo offline: conserva los 3 sin modificar y agrega 1 nota nueva + 1 gasto nuevo
  const deviceB = structuredClone(base);
  deviceB.notes.postits.push({
    id: 'note-b-offline',
    title: 'Offline B',
    text: 'Escrita sin internet',
    date: today,
    createdAt: '2026-11-27T11:00:00.000Z',
  });
  addTransaction(deviceB, {
    id: 'tx-b-offline',
    date: today,
    type: 'gasto',
    amount: 750,
    category: 'Comida',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'Gasto offline B',
    currency: 'UYU',
  });

  // Merge con baseline y tombstones
  let mergedClean = structuredClone(deviceA);
  const cleanConflicts: SyncConflictItem[] = [];
  for (const mod of ['tasks', 'notes', 'finance'] as SyncModuleKey[]) {
    const res = mergeSyncModuleWithConflicts(
      mergedClean,
      mod,
      syncModuleData(deviceB, mod),
      syncModuleData(base, mod),
      tombstones
    );
    mergedClean = res.state;
    cleanConflicts.push(...res.conflicts);
  }

  assert.equal(cleanConflicts.length, 0);
  assert.equal(mergedClean.todayExtras.some((t) => t.id === 'extra-base-1'), false, 'Tarea borrada no debe resucitar');
  assert.equal(mergedClean.notes.postits.some((n) => n.id === 'note-base-1'), false, 'Nota borrada no debe resucitar');
  assert.equal(mergedClean.finance.transactions.some((tx) => tx.id === 'tx-base-1'), false, 'Transacción borrada no debe resucitar');
  assert.equal(mergedClean.notes.postits.some((n) => n.id === 'note-b-offline'), true, 'Nota nueva offline debe sobrevivir');
  assert.equal(mergedClean.finance.transactions.some((tx) => tx.id === 'tx-b-offline'), true, 'Gasto nuevo offline debe sobrevivir');
  const mergedBanco = mergedClean.finance.accounts.find((a) => a.id === 'acc-banco');
  assert.equal(mergedBanco?.balance, 50000 - 750, 'Saldo Banco debe descontar el gasto offline y reflejar la eliminación de tx-base-1');

  // --- Subcaso B: Dispositivo A elimina note-race-1, pero Dispositivo B la modificó legítimamente offline ---
  const deviceADeletedRace = structuredClone(base);
  deviceADeletedRace.notes.postits = deviceADeletedRace.notes.postits.filter((n) => n.id !== 'note-race-1');
  const deviceBEditedRace = structuredClone(base);
  const editedNote = deviceBEditedRace.notes.postits.find((n) => n.id === 'note-race-1')!;
  editedNote.text = 'Edición valiosa offline en B';
  editedNote.updatedAt = new Date(deleteNow + 5_000).toISOString();

  const raceNotesRes = mergeSyncModuleWithConflicts(
    deviceADeletedRace,
    'notes',
    syncModuleData(deviceBEditedRace, 'notes'),
    syncModuleData(base, 'notes'),
    { 'note-race-1': deleteNow }
  );
  assert.ok(
    raceNotesRes.conflicts.some((c) => c.entityType === 'delete_vs_modify' && c.entityId === 'note-race-1'),
    'Borrar vs. editar debe reportar delete_vs_modify determinísticamente'
  );
  const survivingRaceNote = raceNotesRes.state.notes.postits.find((n) => n.id === 'note-race-1');
  assert.equal(survivingRaceNote?.text, 'Edición valiosa offline en B', 'La edición legítima no debe perderse silenciosamente');

  // --- Subcaso C: Transacción borrada en A vs. editada con revisionOrder más nueva en B ---
  const deviceBEditedTx = structuredClone(base);
  const editedTx = deviceBEditedTx.finance.transactions.find((tx) => tx.id === 'tx-base-1')!;
  const newerRevision = createFinanceRevisionOrderAfter(editedTx.revisionOrder, deleteNow + 10_000);
  editedTx.amount = 2400;
  editedTx.note = 'Importe corregido offline';
  editedTx.revisionOrder = newerRevision;

  const raceFinanceRes = mergeSyncModuleWithConflicts(
    deviceA,
    'finance',
    syncModuleData(deviceBEditedTx, 'finance'),
    syncModuleData(base, 'finance'),
    { 'tx-base-1': deleteNow }
  );
  assert.ok(
    raceFinanceRes.conflicts.some((c) => c.entityType === 'delete_vs_modify' && c.entityId === 'tx-base-1'),
    'Edición financiera más nueva que el tombstone debe disparar conflicto explícito y nunca corromper saldos'
  );
});

test('Bloque 37.3: Idempotencia, conmutatividad del merge y poda acotada de tombstones', () => {
  const today = todayISO();
  const base = buildSharedBaselineState();

  const replicaA = structuredClone(base);
  addTransaction(replicaA, {
    id: 'tx-idem-a',
    date: today,
    type: 'gasto',
    amount: 900,
    category: 'Comida',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'A',
    currency: 'UYU',
  });
  replicaA.notes.postits.push({ id: 'note-idem-a', text: 'Nota A', date: today, createdAt: '2026-11-27T09:00:00.000Z' });
  replicaA.todayExtras.push({ id: 'task-idem-a', date: today, text: 'Tarea A', done: true, priority: 'media' });
  replicaA.agenda.miercoles.push({ id: 'ag-idem-a', time: '11:00', activity: 'Bloque A' });

  const replicaB = structuredClone(base);
  addTransaction(replicaB, {
    id: 'tx-idem-b',
    date: today,
    type: 'ingreso',
    amount: 2500,
    category: 'Otros',
    fixed: 'variable',
    accountId: 'acc-banco',
    note: 'B',
    currency: 'UYU',
  });
  replicaB.notes.postits.push({ id: 'note-idem-b', text: 'Nota B', date: today, createdAt: '2026-11-27T09:05:00.000Z' });
  replicaB.todayExtras.push({ id: 'task-idem-b', date: today, text: 'Tarea B', done: false, priority: 'media' });
  replicaB.agenda.jueves.push({ id: 'ag-idem-b', time: '15:00', activity: 'Bloque B' });

  const checkedModules: SyncModuleKey[] = ['finance', 'tasks', 'notes', 'agenda', 'gym'];

  let mergedAB = structuredClone(replicaA);
  let mergedBA = structuredClone(replicaB);
  for (const mod of checkedModules) {
    mergedAB = mergeSyncModule(mergedAB, mod, syncModuleData(replicaB, mod), syncModuleData(base, mod), {});
    mergedBA = mergeSyncModule(mergedBA, mod, syncModuleData(replicaA, mod), syncModuleData(base, mod), {});
  }

  // Conmutatividad: merge(A, B) === merge(B, A)
  for (const mod of checkedModules) {
    assert.equal(
      syncModuleFingerprint(mergedAB, mod),
      syncModuleFingerprint(mergedBA, mod),
      `El módulo ${mod} debe ser conmutativo: merge(A, B) === merge(B, A)`
    );
  }

  // Idempotencia: aplicar merge repetidamente con A o B no genera drift ni duplicados
  let repeated = structuredClone(mergedAB);
  for (let round = 0; round < 3; round += 1) {
    for (const mod of checkedModules) {
      repeated = mergeSyncModule(repeated, mod, syncModuleData(replicaB, mod), syncModuleData(base, mod), {});
      repeated = mergeSyncModule(repeated, mod, syncModuleData(replicaA, mod), syncModuleData(base, mod), {});
    }
  }
  for (const mod of checkedModules) {
    assert.equal(
      syncModuleFingerprint(repeated, mod),
      syncModuleFingerprint(mergedAB, mod),
      `El módulo ${mod} debe ser idempotente tras múltiples rondas de merge`
    );
  }
  assert.equal(repeated.finance.transactions.length, 3, 'No deben duplicarse movimientos financieros');
  assert.equal(
    repeated.finance.accounts.find((a) => a.id === 'acc-banco')?.balance,
    50000 - 2000 - 900 + 2500
  );

  // Acotamiento de tombstones: pruneTombstones descarta registros vencidos y conserva los recientes
  const now = Date.now();
  const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;
  const recent = now - 1000;
  const pruned = pruneTombstones({
    'old-1': fortyDaysAgo,
    'old-2': fortyDaysAgo - 10_000,
    'fresh-1': recent,
  });
  assert.deepEqual(Object.keys(pruned), ['fresh-1'], 'Tombstones vencidos (>30 días) deben podarse para evitar crecimiento infinito');
});

test('Bloque 37.4: Ciclo E2EE multi-dispositivo (Dispositivo A cifra -> Dispositivo B descifra exacto + rechaza contraseña errónea sin corromper datos locales)', async () => {
  const mem = installMemoryStorage();
  _resetDeviceTrustFallbackStore();
  const userId = 'usr-b37-e2ee';
  const vaultPassword = 'ClaveMultiDispositivo#37';

  try {
    // Dispositivo A aprovisiona bóveda y cifra los 15 módulos de un estado real poblado
    const deviceAState = buildSharedBaselineState();
    const { recoveryKeyFormatted, sessionMdek, envelope } = await provisionZeroKnowledgeKeys(userId, {
      vaultPassword,
      pbkdf2Iterations: 100_000,
    });

    const cloudEncryptedModules: Partial<Record<SyncModuleKey, unknown>> = {};
    for (const mod of SYNC_MODULES) {
      cloudEncryptedModules[mod] = await encryptSyncModule(
        syncModuleData(deviceAState, mod),
        sessionMdek,
        mod,
        userId
      );
    }

    // Dispositivo B inicia sesión en limpio con datos locales previos que NO deben corromperse si falla la contraseña
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    const localPreexistingB = defaultState();
    localPreexistingB.profile.name = 'Copia local intacta en B';
    localPreexistingB.notes.postits.push({
      id: 'local-b-safe',
      text: 'Debe permanecer intacta tras intento fallido',
      date: todayISO(),
    });
    assert.equal(saveStoredState(localPreexistingB, userId), true);

    // 1) Sin clave en sesión -> decodeCloudModuleData bloquea (fail-closed)
    const lockedAttempt = await decodeCloudModuleData(cloudEncryptedModules.finance, 'finance', userId, null);
    assert.equal(lockedAttempt.mode, 'locked');

    // 2) Contraseña errónea en Dispositivo B -> rechazo limpio sin corromper datos locales
    await assert.rejects(
      () => unlockMdekWithVaultPassword('PasswordEquivocada!99', envelope, userId),
      CryptoDecryptionError
    );
    assert.equal(cryptoSession.isUnlocked(userId), false);
    const afterFailedAttempt = loadStoredState(userId);
    assert.equal(afterFailedAttempt.state.profile.name, 'Copia local intacta en B');
    assert.equal(afterFailedAttempt.state.notes.postits[0]?.id, 'local-b-safe');

    // 3) Contraseña correcta en Dispositivo B -> descifra los 15 módulos con 100% integridad exacta
    const deviceBKey = await unlockMdekWithVaultPassword(vaultPassword, envelope, userId);
    const decryptedModules: Partial<Record<SyncModuleKey, unknown>> = {};
    for (const mod of SYNC_MODULES) {
      const dec = await decodeCloudModuleData(cloudEncryptedModules[mod], mod, userId, deviceBKey);
      assert.equal(dec.mode, 'decrypted', `El módulo ${mod} debe descifrarse correctamente en Dispositivo B`);
      if (dec.mode === 'decrypted') {
        decryptedModules[mod] = dec.data;
      }
    }
    const reconstructedB = buildStateFromModules(decryptedModules);
    assert.equal(
      equivalentLifeOSState(deviceAState, reconstructedB),
      true,
      'El estado descifrado en Dispositivo B debe coincidir al 100% con el original de Dispositivo A'
    );

    // 4) AAD cruzado (intentar descifrar módulo de otro usuario o módulo equivocado) falla con integridad
    const crossUserAttempt = await decodeCloudModuleData(
      cloudEncryptedModules.finance,
      'finance',
      'otro-usuario-malicioso',
      deviceBKey
    );
    assert.equal(crossUserAttempt.mode, 'corrupted');

    // 5) Clave de recuperación de emergencia también desenvuelve exactamente la misma MDEK
    const recoveryKeyMdek = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, envelope, userId);
    const decryptedFinanceByRecovery = (await decryptSyncModule(
      cloudEncryptedModules.finance as any,
      recoveryKeyMdek,
      'finance',
      userId
    )) as { finance: LifeOSState['finance'] };
    assert.equal(decryptedFinanceByRecovery.finance.transactions[0]?.id, 'tx-base-1');
  } finally {
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    _resetDeviceTrustFallbackStore();
    mem.restore();
  }
});

test('Bloque 37.5: Cross-Tab (storage event) absorbe cambios sin pisar datos más nuevos, sin loops y preserva sesiones activas + recuperación online', () => {
  const today = todayISO();
  const base = buildSharedBaselineState();

  // Pestaña B tiene un timer de gimnasio y una sesión de estudio corriendo en memoria
  const tabBState = structuredClone(base);
  tabBState.gym.activeTimer = {
    sessionId: 'gym-sess-1',
    endsAt: Date.now() + 55_000,
    durationSeconds: 60,
    kind: 'set',
  };
  tabBState.study.activeSession = {
    id: 'study-run-1',
    targetSubjectId: 'sub-1',
    plannedMinutes: 25,
    status: 'running',
    startedAt: Date.now() - 60_000,
    endsAt: Date.now() + 1_400_000,
    lastTickAt: Date.now(),
    remainingSeconds: 1440,
  };

  // Pestaña A guarda una tarea nueva y una nota nueva en localStorage (modo local: userId = null)
  const tabAState = structuredClone(base);
  tabAState.todayExtras.push({
    id: 'extra-tab-a',
    date: today,
    text: 'Creada en Pestaña 1',
    done: false,
    priority: 'alta',
  });
  tabAState.notes.postits.push({
    id: 'note-tab-a',
    title: 'Nota Pestaña 1',
    text: 'Sincronizada al instante',
    date: today,
  });
  const serializedA = JSON.stringify(tabAState);

  // Evento storage de clave ajena debe ignorarse
  assert.equal(
    parseCrossTabStorageEvent({ key: 'otra-clave', newValue: serializedA }, null),
    null
  );
  // Evento storage de clave de usuario cloud diferente debe ignorarse
  assert.equal(
    parseCrossTabStorageEvent({ key: getStorageKey('usr-otro'), newValue: serializedA }, null),
    null
  );

  // Evento storage de la misma clave local se parsea y se absorbe
  const parsed = parseCrossTabStorageEvent({ key: getStorageKey(null), newValue: serializedA }, null);
  assert.ok(parsed);

  const firstPass = reconcileCrossTabUpdate({
    currentState: tabBState,
    incomingState: parsed.state,
    incomingSerialized: parsed.serialized,
    lastKnownSerialized: JSON.stringify(base),
  });
  assert.equal(firstPass.action, 'apply');
  if (firstPass.action === 'apply') {
    assert.ok(firstPass.state.todayExtras.some((t) => t.id === 'extra-tab-a'), 'Pestaña B debe reflejar la tarea de Pestaña A');
    assert.ok(firstPass.state.notes.postits.some((n) => n.id === 'note-tab-a'), 'Pestaña B debe reflejar la nota de Pestaña A');
    assert.equal(firstPass.state.gym.activeTimer?.durationSeconds, 60, 'Pestaña B no debe perder su timer de descanso activo');
    assert.equal(firstPass.state.study.activeSession?.id, 'study-run-1', 'Pestaña B no debe perder su sesión de estudio activa');

    // Repetir el mismo evento (ej. BroadcastChannel + storage event duplicado) -> ignore sin ping-pong
    const duplicatePass = reconcileCrossTabUpdate({
      currentState: firstPass.state,
      incomingState: parsed.state,
      incomingSerialized: parsed.serialized,
      lastKnownSerialized: firstPass.serialized,
    });
    assert.deepEqual(duplicatePass, { action: 'ignore', reason: 'already_applied' });

    // Interacción posterior en Pestaña B conserva los datos de Pestaña A (cero stale overwrite)
    const tabBEdited = structuredClone(firstPass.state);
    tabBEdited.notes.postits.push({
      id: 'note-tab-b',
      title: 'Nota Pestaña 2',
      text: 'Agregada después sin pisar Pestaña 1',
      date: today,
    });
    assert.ok(tabBEdited.todayExtras.some((t) => t.id === 'extra-tab-a'));
    assert.ok(tabBEdited.notes.postits.some((n) => n.id === 'note-tab-a'));
    assert.ok(tabBEdited.notes.postits.some((n) => n.id === 'note-tab-b'));
  }

  // Recuperación limpia de estado en Topbar (online / offline / visibilitychange)
  assert.equal(
    resolveOnlineSyncStatus({
      isOnline: false,
      cloudSyncConfigured: true,
      hasCloudUser: true,
      isInitializedForUser: true,
      hasBlockedConflict: false,
      isVaultLocked: false,
      hasModulesToFlush: false,
      hasPendingRevisions: false,
      hasFailedModules: false,
    }),
    'offline'
  );
  assert.equal(
    resolveOnlineSyncStatus({
      isOnline: true,
      cloudSyncConfigured: true,
      hasCloudUser: true,
      isInitializedForUser: true,
      hasBlockedConflict: false,
      isVaultLocked: false,
      hasModulesToFlush: false,
      hasPendingRevisions: false,
      hasFailedModules: false,
    }),
    'synced',
    'Al volver online ya inicializado sin cola pendiente, Topbar NO debe quedar clavado en Sincronizando… ni Sin conexión'
  );
  assert.equal(
    resolveOnlineSyncStatus({
      isOnline: true,
      cloudSyncConfigured: true,
      hasCloudUser: true,
      isInitializedForUser: true,
      hasBlockedConflict: false,
      isVaultLocked: false,
      hasModulesToFlush: true,
      hasPendingRevisions: false,
      hasFailedModules: false,
    }),
    'saving'
  );
  assert.equal(
    resolveOnlineSyncStatus({
      isOnline: true,
      cloudSyncConfigured: true,
      hasCloudUser: false,
      isInitializedForUser: false,
      hasBlockedConflict: false,
      isVaultLocked: false,
      hasModulesToFlush: false,
      hasPendingRevisions: false,
      hasFailedModules: false,
    }),
    'signed-out'
  );
});

test('Bloque 37.6: UnlockDeviceModal y CloudConflictModal cumplen bottom-sheet móvil, háptica, estética Celestian y estricto privacyMode', () => {
  const localState = buildSharedBaselineState();
  const remoteState = buildSharedBaselineState();
  remoteState.finance.accounts[1].balance = 125000;
  remoteState.notes.postits.push({
    id: 'remote-n1',
    text: 'Nota remota',
    date: todayISO(),
  });

  const sensitiveConflicts: SyncConflictItem[] = [
    {
      id: 'conflict-account-acc-banco',
      module: 'finance',
      entityType: 'account',
      entityId: 'acc-banco',
      label: 'Cuenta: Banco',
      localSummary: 'Saldo: $48000',
      remoteSummary: 'Saldo: $125000',
      localValue: 48000,
      remoteValue: 125000,
    },
    {
      id: 'conflict-budget-comida',
      module: 'finance',
      entityType: 'budget',
      entityId: 'Comida',
      label: 'Presupuesto: Comida',
      localSummary: '$U 18.500',
      remoteSummary: 'US$ 1.250',
      localValue: 18500,
      remoteValue: 1250,
    },
  ];

  // 1) CloudConflictModal con Modo Privacidad activo: ZERO montos filtrados
  const privateConflictHtml = renderToStaticMarkup(
    <PrivacyProvider active={true}>
      <CloudConflictModal
        modules={['finance', 'notes']}
        localState={localState}
        remoteState={remoteState}
        conflicts={sensitiveConflicts}
        recommendedSide="cloud"
        onUseCloud={() => {}}
        onUseLocal={() => {}}
        onCombine={() => {}}
        onClose={() => {}}
      />
    </PrivacyProvider>
  );

  assert.match(privateConflictHtml, /celestian-modal-backdrop/);
  assert.match(privateConflictHtml, /celestian-modal-panel/);
  assert.match(privateConflictHtml, /items-end/);
  assert.match(privateConflictHtml, /sm:items-center/);
  assert.match(privateConflictHtml, /rounded-t-2xl/);
  assert.match(privateConflictHtml, /overscroll-contain/);
  assert.match(privateConflictHtml, /min-h-\[44px\]/);
  assert.match(privateConflictHtml, /Modo Privacidad activo: los importes financieros se mantienen ocultos\./);
  assert.match(privateConflictHtml, /Conserva tu copia guardada en la nube y reemplaza/);
  assert.match(privateConflictHtml, /Conserva exactamente lo que tenés acá y reemplaza/);
  assert.match(privateConflictHtml, /Fusionar cambios compatibles/);
  assert.match(privateConflictHtml, /••••/);

  // Ningún monto financiero puede filtrarse en el HTML cuando privacyMode está activo
  assert.doesNotMatch(privateConflictHtml, /48000|125000|18\.500|1\.250/);
  assert.doesNotMatch(privateConflictHtml, /\b(?:bg|text|border|ring)-(?:blue|sky)-|var\(--blue\)/);
  assert.doesNotMatch(privateConflictHtml, /[←→✓×▲▼▶▾↗]/);

  // Verificar helper directo de sanitización
  assert.equal(sanitizeConflictSummary('Saldo: $125000', true, true), 'Saldo: $••••');
  assert.equal(sanitizeConflictSummary('US$ 1.250', true, true), 'US$ ••••');
  assert.equal(sanitizeConflictSummary('Saldo: $125000', false, true), 'Saldo: $125000');

  // 2) UnlockDeviceModal: bottom-sheet móvil, toggle Eye/EyeOff >= 44px, .celestian-clean-field, háptica y cero azules
  const unlockHtml = renderToStaticMarkup(
    <UnlockDeviceModal
      isOpen={true}
      onClose={() => {}}
      userId="usr-b37-ui"
      userEmail="demo@celestian.app"
      envelopeOverride={{
        keyFormatVersion: 1,
        cryptoVersion: 1,
        algorithm: 'AES-GCM-256',
        wrappedMdek: { iv: 'abc', ciphertext: 'def' },
        kdf: {
          algorithm: 'HKDF-SHA-256',
          salt: 'salt16bytesbase64==',
          info: 'LifeOS-Recovery-KEK-v1|pw1:600000:c2FsdA==:aXY=:Y2lwaGVy',
        },
        aad: 'keyFormatVersion:1|userId:usr-b37-ui',
        createdAt: '2026-11-27T00:00:00.000Z',
      }}
    />
  );

  assert.match(unlockHtml, /celestian-modal-backdrop/);
  assert.match(unlockHtml, /celestian-modal-panel/);
  assert.match(unlockHtml, /items-end/);
  assert.match(unlockHtml, /sm:items-center/);
  assert.match(unlockHtml, /rounded-t-2xl/);
  assert.match(unlockHtml, /overscroll-contain/);
  assert.match(unlockHtml, /aria-label="Mostrar contraseña"/);
  assert.match(unlockHtml, /min-h-\[44px\] min-w-\[44px\]/);
  assert.match(unlockHtml, /celestian-clean-field/);
  assert.doesNotMatch(unlockHtml, /\b(?:bg|text|border|ring)-(?:blue|sky)-|var\(--blue\)/);
  assert.doesNotMatch(unlockHtml, /[←→✓×▲▼▶▾↗]/);

  // Verificar háptica warning/success en UnlockDeviceModal y storage listener en App.tsx
  const unlockSrc = fs.readFileSync(path.join(ROOT, 'src/components/UnlockDeviceModal.tsx'), 'utf8');
  assert.match(unlockSrc, /triggerHaptic\('warning'\)/);
  assert.match(unlockSrc, /triggerHaptic\('success'\)/);

  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /window\.addEventListener\('storage',\s*handleStorageEvent\)/);
  assert.match(appSrc, /resolveOnlineSyncStatus\(/);
});
