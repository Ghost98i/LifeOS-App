import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { SYNC_MODULES, syncModuleData, type SyncModuleKey, type SyncRevisionMap } from './syncModel';
import type { ResaleConflictRecord } from './resaleConflictRecovery';
import {
  assessResaleConflictResolution,
  buildResaleConflictReconciliationPreview,
  confirmMatchingResaleConflict,
  executeAuthorizedConflictReconciliation,
} from './resaleConflictResolution';
import { chunkSyncModulesForTransaction } from './cloudSync';

function fixture(linked = false) {
  const state = defaultState();
  if (linked) {
    const accountId = state.finance.accounts[0].id;
    state.finance.transactions.push({ id: 'purchase-1', type: 'gasto', amount: 8000, category: 'Reventa', fixed: 'variable', date: '2026-10-22', accountId, origin: 'resale_purchase' });
    state.finance.transactions.push({ id: 'sale-1', type: 'ingreso', amount: 11000, category: 'Reventa', fixed: 'variable', date: '2026-10-22', accountId, origin: 'resale_sale' });
    state.finance.transactions.push({ id: 'fee-1', type: 'gasto', amount: 500, category: 'Reventa', fixed: 'variable', date: '2026-10-22', accountId, origin: 'resale_sale' });
    state.resale.inventory.push({ id: 'item-1', item: 'Tarjeta gráfica', buyPrice: 8000, buyDate: '2026-10-22', sellPrice: 11000, sellDate: '2026-10-22', status: 'vendido', purchaseTxId: 'purchase-1', saleTxId: 'sale-1', feeTxId: 'fee-1', purchaseAccountId: accountId, saleAccountId: accountId, fees: 500 });
  }
  const local = structuredClone({ resale: syncModuleData(state, 'resale'), finance: syncModuleData(state, 'finance') });
  const revisions = { resale: 'remote-resale', finance: 'remote-finance' };
  const record: ResaleConflictRecord = {
    id: 'conflict-1', status: 'pending', createdAt: '2026-10-22T00:00:00.000Z', diagnostic: 'stale',
    modules: linked ? ['resale', 'finance'] : ['resale'], local, base: {}, baseRevisions: {},
    remoteVersions: [{ data: structuredClone(local), revisions }],
  };
  return { state, local, revisions, record };
}

test('solo permite cierre de módulos idénticos y no cambia otras categorías', () => {
  const { state, local, revisions, record } = fixture();
  state.settings.darkMode = !state.settings.darkMode;
  const before = structuredClone(state);
  assert.deepEqual(assessResaleConflictResolution(record, state, local, revisions), { status: 'ready', modules: ['resale'] });
  assert.deepEqual(state, before);
});

test('vínculos financieros válidos requieren publicación conjunta; vínculos ausentes bloquean', () => {
  const { state, local, revisions, record } = fixture(true);
  assert.deepEqual(assessResaleConflictResolution(record, state, local, revisions), { status: 'ready', modules: ['resale', 'finance'] });
  state.finance.transactions = state.finance.transactions.filter((tx) => tx.id !== 'fee-1');
  const remote = { ...local, finance: syncModuleData(state, 'finance') };
  const nextRecord = { ...record, local: remote, remoteVersions: [{ data: remote, revisions }] };
  assert.equal(assessResaleConflictResolution(nextRecord, state, remote, revisions).status, 'blocked');
});

test('bloquea diferencias, revisiones nuevas, cambios locales y grupos ajenos', () => {
  const { state, local, revisions, record } = fixture();
  assert.equal(assessResaleConflictResolution(record, state, { ...local, resale: { resale: { inventory: [{ id: 'other' }], opportunities: [] } } }, revisions).status, 'blocked');
  assert.equal(assessResaleConflictResolution(record, state, local, { ...revisions, resale: 'newer' }).status, 'blocked');
  state.resale.inventory.push({ id: 'new', item: 'Producto', buyPrice: 10, buyDate: '2026-10-22', status: 'comprado' });
  assert.equal(assessResaleConflictResolution(record, state, local, revisions).status, 'blocked');
  assert.equal(assessResaleConflictResolution({ ...record, modules: ['resale', 'study'] }, state, local, revisions).status, 'blocked');
});

test('publica resale y finance juntos y solo confirma después del commit', async () => {
  const { state, local, revisions, record } = fixture(true);
  const events: string[] = [];
  let finishCommit: (() => void) | undefined;
  const completion = new Promise<void>((resolve) => { finishCommit = resolve; });
  const work = confirmMatchingResaleConflict(record, state, local, revisions, {
    save: (next) => { events.push(`save-${next.status}`); return true; },
    publish: async (modules) => {
      events.push(`publish-${modules.join('+')}`);
      return { writes: modules.map((module) => ({ module, revision: `new-${module}` })), completion };
    },
    currentState: () => state,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['save-pending', 'publish-resale+finance']);
  finishCommit?.();
  const result = await work;
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(events, ['save-pending', 'publish-resale+finance', 'save-resolved']);
});

test('fallo de publicación conserva respaldo pendiente y no confirma', async () => {
  const { state, local, revisions, record } = fixture(true);
  const saved: string[] = [];
  const result = await confirmMatchingResaleConflict(record, state, local, revisions, {
    save: (next) => { saved.push(next.status); return true; },
    publish: async () => ({ writes: [], completion: Promise.reject(new Error('stale')) }),
    currentState: () => state,
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(saved, ['pending', 'pending']);
});

test('sin respaldo verificable no publica; cambios locales durante el commit no desbloquean', async () => {
  const { state, local, revisions, record } = fixture();
  let published = false;
  const failedSave = await confirmMatchingResaleConflict(record, state, local, revisions, {
    save: () => false,
    publish: async () => { published = true; return { writes: [], completion: Promise.resolve() }; },
    currentState: () => state,
  });
  assert.equal(failedSave.status, 'blocked');
  assert.equal(published, false);
  const current = structuredClone(state);
  current.resale.inventory.push({ id: 'later', item: 'Nuevo', buyPrice: 1, buyDate: '2026-10-22', status: 'comprado' });
  const statuses: string[] = [];
  const changed = await confirmMatchingResaleConflict(record, state, local, revisions, {
    save: (next) => { statuses.push(next.status); return true; },
    publish: async () => ({ writes: [{ module: 'resale', revision: 'new' }], completion: Promise.resolve() }),
    currentState: () => current,
  });
  assert.equal(changed.status, 'blocked');
  assert.deepEqual(statuses, ['pending', 'pending']);
});

function buildSynthetic15ModuleConflict() {
  const remoteTemplateState = defaultState();
  remoteTemplateState.settings.onboardingCompleted = true;

  const localRichState = defaultState();
  localRichState.settings.onboardingCompleted = true;
  localRichState.profile.name = 'Usuario Sintético';
  localRichState.agenda.lunes.push({
    id: 'blk-1',
    time: '09:00',
    activity: 'Bloque sintético',
  });
  localRichState.tasksRecurring.push({
    id: 'task-1',
    name: 'Tarea sintética',
    freq: 'daily',
    days: ['lunes'],
  });
  localRichState.dailyContext.push({
    date: '2026-10-25',
    sleepHours: 8,
    sleepQuality: 4,
    mood: 4,
    energy: 4,
    connection: 4,
    note: 'Nota de contexto sintética',
  });
  localRichState.finance.transactions.push({
    id: 'tx-1',
    type: 'gasto',
    amount: 1500,
    category: 'Comida',
    fixed: 'variable',
    date: '2026-10-25',
    accountId: localRichState.finance.accounts[0].id,
    note: 'Movimiento sintético',
  });
  localRichState.gym.sessions.push({
    id: 'gym-1',
    date: '2026-10-25',
    exercises: [],
  });
  localRichState.study.subjects.push({
    id: 'sub-1',
    name: 'Materia sintética',
  });
  localRichState.jobs.applications.push({
    id: 'job-1',
    empresa: 'Empresa Sintética',
    puesto: 'Ingeniero',
    estado: 'cv_enviado',
    fecha: '2026-10-25',
  });
  localRichState.calendarEvents.push({
    id: 'cal-1',
    name: 'Evento sintético',
    date: '2026-10-25',
    type: 'otro',
    recurring: false,
  });
  localRichState.goals.push({
    id: 'goal-1',
    name: 'Meta sintética',
    initial: 0,
    target: 100,
    current: 50,
  });
  localRichState.notes.postits.push({
    id: 'note-1',
    title: 'Nota sintética',
    text: 'Contenido sintético',
    date: '2026-10-25',
  });
  localRichState.checkoutLog['2026-10-25'] = {
    closedAt: '2026-10-25T22:00:00.000Z',
    dailyNote: 'Avance sintético',
    sleepHours: 8,
    energyLevel: 4,
  };

  // Los 3 módulos resale, streaming e ideas permanecen idénticos entre local y remoto
  const modules: SyncModuleKey[] = ['resale', ...SYNC_MODULES.filter((m) => m !== 'resale')];
  const localData = Object.fromEntries(modules.map((m) => [m, syncModuleData(localRichState, m)]));
  const remoteAllData = Object.fromEntries(modules.map((m) => [m, syncModuleData(remoteTemplateState, m)]));
  const remoteTwoData = {
    resale: remoteAllData.resale,
    finance: remoteAllData.finance,
  };

  const baseRevisions: SyncRevisionMap = Object.fromEntries(
    modules.map((m, idx) => [m, `17929575219${String(15 + idx).padStart(2, '0')}-device-sintetico`])
  );

  const originalDiagnostic =
    'Firestore rechazó la publicación. La causa puede ser permisos, reglas o un formato incompatible; se necesita revisar antes de volver a subirla.';

  const record: ResaleConflictRecord = {
    id: 'conflict-15-synthetic',
    status: 'pending',
    createdAt: '2026-10-27T19:08:25.814Z',
    diagnostic: originalDiagnostic,
    modules,
    local: structuredClone(localData),
    base: {},
    baseRevisions: structuredClone(baseRevisions),
    remoteVersions: [
      {
        data: structuredClone(remoteTwoData),
        revisions: structuredClone(baseRevisions),
      },
      {
        data: structuredClone(remoteAllData),
        revisions: structuredClone(baseRevisions),
      },
    ],
  };

  return {
    localRichState,
    remoteTemplateState,
    record,
    baseRevisions,
    originalDiagnostic,
    remoteTwoData,
    remoteAllData,
  };
}

test('chunkSyncModulesForTransaction divide 15 módulos en lotes <= 5 manteniendo resale y finance en su propio lote atómico', () => {
  const all15: SyncModuleKey[] = ['resale', ...SYNC_MODULES.filter((m) => m !== 'resale')];
  const chunks = chunkSyncModulesForTransaction(all15, 5);
  assert.equal(chunks.length, 4);
  assert.ok(chunks.every((chunk) => chunk.length <= 5));
  assert.deepEqual(chunks[0], ['resale', 'finance']);
  assert.deepEqual(chunks.flat().sort(), [...all15].sort());
});

test('confirmMatchingResaleConflict conserva el diagnóstico original cuando el bloqueo abarca 15 módulos', async () => {
  const { localRichState, record, baseRevisions, originalDiagnostic, remoteTwoData } = buildSynthetic15ModuleConflict();
  const result = await confirmMatchingResaleConflict(record, localRichState, remoteTwoData, baseRevisions, {
    save: () => true,
    publish: async () => ({ writes: [], completion: Promise.resolve() }),
    currentState: () => localRichState,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'La publicación incluye otros módulos; no se puede cerrarla desde Mi negocio.');
  assert.equal(result.record.diagnostic, originalDiagnostic);
});

test('buildResaleConflictReconciliationPreview detecta 12 módulos con cambios locales y 3 idénticos sin sobrescribir nada', () => {
  const { localRichState, record } = buildSynthetic15ModuleConflict();
  const snapshotBefore = structuredClone(localRichState);
  const recordBefore = structuredClone(record);

  const preview = buildResaleConflictReconciliationPreview(record, localRichState);

  assert.equal(preview.modules.length, 15);
  assert.equal(preview.identicalCount, 3);
  assert.equal(preview.differingCount, 12);
  assert.equal(preview.allLocalMatchCurrentLocal, true);
  assert.equal(preview.allBaseRevisionsMatchRemote, true);
  assert.equal(preview.baseIsEmpty, true);

  const identicalModules = preview.modules.filter((m) => m.status === 'identical').map((m) => m.module).sort();
  assert.deepEqual(identicalModules, ['ideas', 'resale', 'streaming']);

  const differingModules = preview.modules.filter((m) => m.status !== 'identical');
  assert.equal(differingModules.length, 12);
  assert.ok(differingModules.every((m) => m.status === 'local_only_changes'));
  assert.ok(differingModules.every((m) => m.remoteIsDefaultTemplate === true));
  assert.ok(differingModules.every((m) => m.recommendedChoice === 'local'));

  // La previsualización es de solo lectura: no modifica ni el estado ni el registro del conflicto
  assert.deepEqual(localRichState, snapshotBefore);
  assert.deepEqual(record, recordBefore);
});

test('executeAuthorizedConflictReconciliation exige autorización explícita, respalda ambas versiones y publica solo los 12 módulos con diferencias', async () => {
  const { localRichState, record } = buildSynthetic15ModuleConflict();
  const choices: Partial<Record<SyncModuleKey, 'local' | 'remote'>> = Object.fromEntries(
    record.modules.map((m) => [m, 'local' as const])
  );

  // 1. Sin autorización explícita no publica ni cierra el conflicto
  let publishedCalls = 0;
  const unauthorized = await executeAuthorizedConflictReconciliation(
    record,
    localRichState,
    { authorized: false, choices },
    {
      saveConflict: () => true,
      saveBackup: () => true,
      publish: async () => {
        publishedCalls += 1;
        return { writes: [], completion: Promise.resolve() };
      },
      currentState: () => localRichState,
    }
  );
  assert.equal(unauthorized.status, 'blocked');
  assert.equal(publishedCalls, 0);

  // 2. Elección inconsistente entre resale y finance se bloquea
  const mismatchedChoices = { ...choices, resale: 'local' as const, finance: 'remote' as const };
  const mismatched = await executeAuthorizedConflictReconciliation(
    record,
    localRichState,
    { authorized: true, choices: mismatchedChoices },
    {
      saveConflict: () => true,
      saveBackup: () => true,
      publish: async () => {
        publishedCalls += 1;
        return { writes: [], completion: Promise.resolve() };
      },
      currentState: () => localRichState,
    }
  );
  assert.equal(mismatched.status, 'blocked');
  assert.equal(publishedCalls, 0);

  // 3. Con autorización explícita y respaldo exitoso, publica los 12 módulos que difieren y adopta revisiones en los 3 idénticos
  let backupSaved = false;
  const savedConflictStatuses: string[] = [];
  const publishedModules: SyncModuleKey[] = [];

  const authorized = await executeAuthorizedConflictReconciliation(
    record,
    localRichState,
    { authorized: true, choices },
    {
      saveConflict: (next) => {
        savedConflictStatuses.push(next.status);
        return true;
      },
      saveBackup: (localSnap, remoteSnap) => {
        backupSaved = true;
        assert.equal(localSnap.profile.name, 'Usuario Sintético');
        assert.equal(remoteSnap.profile.name, '');
        return true;
      },
      publish: async (_state, modules, expectedRevisions) => {
        publishedCalls += 1;
        assert.ok(modules.length <= 5);
        publishedModules.push(...modules);
        assert.ok(modules.every((m) => expectedRevisions[m] === record.baseRevisions[m]));
        return {
          writes: modules.map((module) => ({ module, revision: `new-rev-${module}` })),
          completion: Promise.resolve(),
        };
      },
      currentState: () => localRichState,
    }
  );

  assert.equal(authorized.status, 'confirmed');
  assert.equal(backupSaved, true);
  assert.equal(publishedCalls, 3);
  assert.equal(publishedModules.length, 12);
  assert.ok(!publishedModules.includes('resale'));
  assert.ok(!publishedModules.includes('streaming'));
  assert.ok(!publishedModules.includes('ideas'));
  assert.equal(authorized.adoptedRevisions.resale, record.baseRevisions.resale);
  assert.equal(authorized.adoptedRevisions.streaming, record.baseRevisions.streaming);
  assert.equal(authorized.adoptedRevisions.ideas, record.baseRevisions.ideas);
  assert.equal(authorized.adoptedRevisions.finance, 'new-rev-finance');
  assert.equal(savedConflictStatuses.at(-1), 'resolved');
});
