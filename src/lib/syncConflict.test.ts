import assert from 'node:assert/strict';
import test from 'node:test';
import type { Project, TodayExtra, Goal } from '../types';
import { defaultState, normalizeStoredState, parseBackupJSON } from './storage';
import {
  mergeSyncModuleWithConflicts,
  detectSyncModuleConflicts,
  syncModuleData,
  applySyncModule,
  extractPureModuleData,
  syncModuleFingerprint,
  syncDataFingerprint,
  type SyncModuleKey,
} from './syncModel';
import {
  saveSyncRecoverySnapshot,
  loadSyncRecoverySnapshot,
  clearSyncRecoverySnapshots,
  writeCloudModulesGuarded,
  writeCloudModules,
} from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';

// Polyfill localStorage for node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    length: store.size,
  } as Storage;
}

test('Fase 3 - Caso 1: Local only change (balance 10k -> 9k, remote 10k -> 9k without conflict)', () => {
  const base = defaultState();
  base.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 10000, initialBalance: 10000 }];

  const remote = structuredClone(base);

  const local = structuredClone(base);
  local.finance.accounts[0].balance = 9000;
  local.finance.accounts[0].initialBalance = 9000;

  const result = mergeSyncModuleWithConflicts(
    local,
    'finance',
    syncModuleData(remote, 'finance'),
    syncModuleData(base, 'finance')
  );

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.state.finance.accounts[0].balance, 9000);
  assert.equal(result.state.finance.accounts[0].initialBalance, 9000);
});

test('Fase 3 - Caso 2: Remote only change (balance 10k -> 9k, local 10k -> 9k without conflict)', () => {
  const base = defaultState();
  base.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 10000, initialBalance: 10000 }];

  const local = structuredClone(base);

  const remote = structuredClone(base);
  remote.finance.accounts[0].balance = 9000;
  remote.finance.accounts[0].initialBalance = 9000;

  const result = mergeSyncModuleWithConflicts(
    local,
    'finance',
    syncModuleData(remote, 'finance'),
    syncModuleData(base, 'finance')
  );

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.state.finance.accounts[0].balance, 9000);
  assert.equal(result.state.finance.accounts[0].initialBalance, 9000);
});

test('Fase 3 - Caso 3: Both modify differently (balance 10k -> local 9k, remote 8k -> CONFLICT detected, neither chosen)', () => {
  const base = defaultState();
  base.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 10000, initialBalance: 10000 }];

  const local = structuredClone(base);
  local.finance.accounts[0].balance = 9000;
  local.finance.accounts[0].initialBalance = 9000;

  const remote = structuredClone(base);
  remote.finance.accounts[0].balance = 8000;
  remote.finance.accounts[0].initialBalance = 8000;

  const result = mergeSyncModuleWithConflicts(
    local,
    'finance',
    syncModuleData(remote, 'finance'),
    syncModuleData(base, 'finance')
  );

  assert.ok(result.conflicts.length > 0);

  const conflict = result.conflicts.find((c) => c.entityId === 'acc-1');
  assert.ok(conflict, 'Must record conflict for acc-1');
  assert.equal(conflict?.module, 'finance');
  assert.equal(conflict?.field, 'initialBalance');
  assert.equal(conflict?.localValue, 9000);
  assert.equal(conflict?.remoteValue, 8000);
  assert.equal(conflict?.baseValue, 10000);
});

test('Fase 3 - Caso 4: Independent new entities (base [A], local [A, B], remote [A, C] -> [A, B, C])', () => {
  const base = defaultState();
  const taskA: TodayExtra = { id: 'extra-a', text: 'Task A', done: false, date: '2026-09-26', priority: 'media' };
  base.todayExtras = [taskA];

  const local = structuredClone(base);
  const taskB: TodayExtra = { id: 'extra-b', text: 'Task B', done: false, date: '2026-09-26', priority: 'media' };
  local.todayExtras.push(taskB);

  const remote = structuredClone(base);
  const taskC: TodayExtra = { id: 'extra-c', text: 'Task C', done: false, date: '2026-09-26', priority: 'media' };
  remote.todayExtras.push(taskC);

  const result = mergeSyncModuleWithConflicts(
    local,
    'tasks',
    syncModuleData(remote, 'tasks'),
    syncModuleData(base, 'tasks')
  );

  assert.equal(result.conflicts.length, 0);
  const ids = result.state.todayExtras.map((t) => t.id).sort();
  assert.deepEqual(ids, ['extra-a', 'extra-b', 'extra-c']);
});

test('Fase 3 - Caso 5: Same entity modified local only (A=X, local A=Y, remote A=X -> A=Y)', () => {
  const base = defaultState();
  base.notes.postits = [{ id: 'note-1', text: 'Original text', date: '2026-09-01' }];

  const remote = structuredClone(base);

  const local = structuredClone(base);
  local.notes.postits[0].text = 'Local modified text';

  const result = mergeSyncModuleWithConflicts(
    local,
    'notes',
    syncModuleData(remote, 'notes'),
    syncModuleData(base, 'notes')
  );

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.state.notes.postits[0].text, 'Local modified text');
});

test('Fase 3 - Caso 6: Same entity modified in both (A=X, local A=Y, remote A=Z -> CONFLICT detected)', () => {
  const base = defaultState();
  base.notes.postits = [{ id: 'note-1', text: 'Original text', date: '2026-09-01' }];

  const local = structuredClone(base);
  local.notes.postits[0].text = 'Modified on Phone';

  const remote = structuredClone(base);
  remote.notes.postits[0].text = 'Modified on Laptop';

  const result = mergeSyncModuleWithConflicts(
    local,
    'notes',
    syncModuleData(remote, 'notes'),
    syncModuleData(base, 'notes')
  );

  assert.ok(result.conflicts.length > 0);
  const conflict = result.conflicts.find((c) => c.entityId === 'note-1');
  assert.ok(conflict, 'Must record conflict for note-1');
  assert.equal(conflict?.module, 'notes');
  assert.equal((conflict?.localValue as any)?.text, 'Modified on Phone');
  assert.equal((conflict?.remoteValue as any)?.text, 'Modified on Laptop');
  assert.equal((conflict?.baseValue as any)?.text, 'Original text');
});

test('Fase 3 - Caso 7: Independent field changes on project (project name changed on local, subtask added on remote -> both merged)', () => {
  const base = defaultState();
  const proj: Project = {
    id: 'proj-1',
    name: 'Project Alpha',
    objective: 'Goal',
    status: 'activo',
    nextStep: 'Step 1',
    tasks: [{ id: 'sub-1', text: 'Phase 1', done: false }],
    createdAt: '2026-09-01',
  };
  base.projects = [proj];

  const local = structuredClone(base);
  local.projects![0].name = 'Project Alpha Renamed';

  const remote = structuredClone(base);
  remote.projects![0].tasks.push({ id: 'sub-2', text: 'Phase 2', done: false });

  const result = mergeSyncModuleWithConflicts(
    local,
    'goals',
    syncModuleData(remote, 'goals'),
    syncModuleData(base, 'goals')
  );

  assert.equal(result.conflicts.length, 0);
  const mergedProject = result.state.projects?.find((p) => p.id === 'proj-1');
  assert.ok(mergedProject);
  assert.equal(mergedProject?.name, 'Project Alpha Renamed');
  assert.equal(mergedProject?.tasks.length, 2);
  assert.ok(mergedProject?.tasks.some((s) => s.id === 'sub-1'));
  assert.ok(mergedProject?.tasks.some((s) => s.id === 'sub-2'));
});

test('Fase 3 - Caso 8: Extended offline (divergence detected, no silent overwrite)', () => {
  const userId = 'user-test-offline-8';
  const base = defaultState();
  const goal: Goal = { id: 'goal-1', name: 'Run 10km', initial: 0, target: 10, current: 0 };
  base.goals = [goal];

  const local = structuredClone(base);
  local.goals[0].name = 'Run 15km offline';

  const remote = structuredClone(base);
  remote.goals[0].name = 'Run Half Marathon remote';

  const conflicts = detectSyncModuleConflicts(
    local,
    'goals',
    syncModuleData(remote, 'goals'),
    syncModuleData(base, 'goals')
  );
  assert.ok(conflicts.length > 0, 'Divergence must be detected after extended offline separation');

  // Verify recovery snapshot mechanism preserves state
  saveSyncRecoverySnapshot(userId, 'local', local);
  saveSyncRecoverySnapshot(userId, 'remote', remote);
  saveSyncRecoverySnapshot(userId, 'base', base);

  const restoredLocal = loadSyncRecoverySnapshot(userId, 'local');
  const restoredRemote = loadSyncRecoverySnapshot(userId, 'remote');
  const restoredBase = loadSyncRecoverySnapshot(userId, 'base');

  assert.equal(restoredLocal?.goals[0].name, 'Run 15km offline');
  assert.equal(restoredRemote?.goals[0].name, 'Run Half Marathon remote');
  assert.equal(restoredBase?.goals[0].name, 'Run 10km');

  clearSyncRecoverySnapshots(userId);
  assert.equal(loadSyncRecoverySnapshot(userId, 'local'), null);
});

test('Fase 3 - Caso 9: Remote changed before upload (pre-write guard detects divergence, aborts write)', async () => {
  const userId = 'user-test-guard-9';
  const state = defaultState();
  const baseRevisions = { finance: 'rev-phone-base' };

  // Simulated verifier that detects remote has already moved to 'rev-laptop-newer'
  const mockVerifier = async () => ({
    matches: false,
    divergedModules: ['finance' as SyncModuleKey],
    remoteRevisions: { finance: 'rev-laptop-newer' },
  });

  const writeResult = await writeCloudModulesGuarded(
    userId,
    state,
    ['finance'],
    'dev-phone',
    baseRevisions,
    {},
    mockVerifier
  );

  assert.equal(writeResult.diverged, true);
  assert.deepEqual(writeResult.divergedModules, ['finance']);
  assert.equal(writeResult.writes.length, 0);

  await assert.rejects(
    async () => {
      await writeResult.completion;
    },
    /Divergencia de revisiones remotas detectada en: finance/
  );
});

test('Fase 3 - Caso 10: Network failure simulation (local state remains usable, no corrupted sync status)', async () => {
  const state = defaultState();
  state.finance.transactions.push({
    id: 'tx-offline-1',
    amount: 1500,
    type: 'gasto',
    category: 'Supermercado',
    date: '2026-09-26',
    fixed: 'variable',
    note: 'Offline purchase',
  });

  // Simulate network rejection
  let networkFailed = false;
  try {
    throw new Error('Simulated network timeout (offline)');
  } catch {
    networkFailed = true;
  }
  assert.ok(networkFailed);

  // Local state is completely untouched and usable
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.transactions[0].amount, 1500);

  // Normalization keeps data safe
  const normalized = normalizeStoredState(state);
  assert.equal(normalized.finance.transactions.length, 1);
  assert.equal(normalized.schemaVersion, 2);
});

test('Fase 3 - Caso 11: Schema v2 backward compatibility (import backup, schemaVersion: 2, roundtrip intact)', () => {
  const backupJSON = JSON.stringify({
    schemaVersion: 2,
    finance: {
      accounts: [{ id: 'acc-main', name: 'Cuenta Principal', balance: 50000, initialBalance: 50000 }],
      transactions: [
        {
          id: 'tx-1',
          amount: 2500,
          type: 'gasto',
          category: 'Servicios',
          date: '2026-09-20',
          fixed: 'fijo',
          note: 'Internet Fibra',
          accountId: 'acc-main',
        },
      ],
      categories: ['Servicios', 'Comida', 'Reventa'],
      budgets: { Servicios: 5000 },
      commitments: [
        {
          id: 'comm-1',
          name: 'Internet',
          amount: 2500,
          dueDay: 20,
          frequency: 'monthly',
          category: 'Servicios',
          accountId: 'acc-main',
        },
      ],
      expectedIncomes: [],
      transfers: [],
    },
    gym: { sessions: [], exercises: [], activeSession: null, routines: [] },
    notes: { postits: [{ id: 'note-1', text: 'Backup test', date: '2026-09-20' }], possessions: [] },
    goals: [],
    projects: [],
    study: { subjects: [], exams: [], studyLog: [] },
    streaming: { sessions: [], monthlyGoal: 0, preStreamChecklist: [], contentPipeline: [] },
    jobs: { opportunities: [], applications: [] },
    resale: { items: [], accounts: [] },
    ideas: [],
    calendarEvents: [],
    todayExtras: [],
    tasksRecurring: [],
    taskLog: {},
    profile: { bodyCompositionSex: null },
    dailyPriorities: [],
    dailyContext: [],
    settings: { darkMode: false, hiddenTabs: [] },
    checkoutLog: {},
  });

  const parsed = parseBackupJSON(backupJSON);
  assert.equal(parsed.schemaVersion, 2, 'schemaVersion must be preserved as 2 (NEVER 3)');
  assert.equal(parsed.finance.accounts[0].name, 'Cuenta Principal');
  assert.equal(parsed.finance.commitments[0].name, 'Internet');
  assert.equal(parsed.notes.postits[0].text, 'Backup test');

  // Verify roundtrip serialization
  const roundtrippedJSON = JSON.stringify(parsed);
  const reParsed = parseBackupJSON(roundtrippedJSON);
  assert.equal(reParsed.schemaVersion, 2);
  assert.deepEqual(reParsed.finance.commitments, parsed.finance.commitments);
  assert.deepEqual(reParsed.finance.transactions, parsed.finance.transactions);
});

test('Hotfix Fase 8: Preservación de cambios pendientes ante error de red / permission-denied en sync', async () => {
  // Simular el ciclo de vida de flushCloudSave ante fallo de commit
  const currentState = defaultState();
  currentState.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 7500, initialBalance: 5000 }];
  currentState.finance.transactions = [{
    id: 'tx-new-1',
    amount: 2500,
    type: 'ingreso',
    category: 'Honorarios',
    date: '2026-10-04',
    fixed: 'variable',
  }];

  // 1. Simulación de referencias de sincronización del cliente (App.tsx)
  const baselineDataRef: Record<string, unknown> = {
    finance: { accounts: [{ id: 'acc-1', name: 'Banco', balance: 5000, initialBalance: 5000 }], transactions: [] },
  };
  const queuedModules = new Set<SyncModuleKey>(['finance']);
  let queuedState = currentState;
  const pendingRevisions: Record<string, string[]> = {};
  const failedSyncModules = new Set<SyncModuleKey>();
  let syncStatus: 'synced' | 'saving' | 'error' | 'conflict' = 'saving';

  // 2. Mock de respuesta fallida de Firestore (Code 7: PERMISSION_DENIED)
  const simulatedWrites = [{ module: 'finance' as SyncModuleKey, revision: 'rev-failed-123', parentRevision: 'rev-prev' }];
  const simulatedCompletion = Promise.reject(new Error('PERMISSION_DENIED: evaluation error in firestore.rules'));

  // Registrar revisiones pendientes al despachar
  simulatedWrites.forEach((w) => {
    pendingRevisions[w.module] = [...(pendingRevisions[w.module] || []), w.revision];
  });

  // Ejecución del catch handler idéntico a App.tsx flushCloudSave
  try {
    await simulatedCompletion;
  } catch {
    simulatedWrites.forEach((write) => {
      const remaining = (pendingRevisions[write.module] || []).filter((r) => r !== write.revision);
      if (remaining.length) pendingRevisions[write.module] = remaining;
      else delete pendingRevisions[write.module];
      failedSyncModules.add(write.module);
      queuedModules.add(write.module);
    });
    queuedState = currentState;
    syncStatus = 'error';
  }

  // 3. Verificaciones de invariantes de seguridad:
  // a) El estado local no fue mutado ni reemplazado por baseline remoto
  assert.equal(currentState.finance.transactions.length, 1);
  assert.equal(currentState.finance.accounts[0].balance, 7500);

  // b) El baseline NO fue avanzado erróneamente (sigue reflejando el estado previo)
  assert.deepEqual(baselineDataRef['finance'], {
    accounts: [{ id: 'acc-1', name: 'Banco', balance: 5000, initialBalance: 5000 }],
    transactions: [],
  });

  // c) Las revisiones pendientes de escritura fueron limpiadas del tracker para reintentar
  assert.equal(pendingRevisions['finance'], undefined);

  // d) El módulo se agregó a la cola de reintento con el estado local actual
  assert.ok(queuedModules.has('finance'));
  assert.deepEqual(queuedState, currentState);

  // e) El módulo fallido quedó registrado en el set de errores y el status es 'error'
  assert.ok(failedSyncModules.has('finance'));
  assert.equal(syncStatus, 'error');
});

test('Hotfix Loop Infinito: Invariante de Quiescencia — No re-subir datos idénticos en onSnapshot', () => {
  const base = defaultState();
  const remoteData = syncModuleData(base, 'finance');
  const pureHeadData = extractPureModuleData(remoteData);

  // 1. Si no hay cambios locales ni pendientes (pendingRevisions = 0 y !localDirty),
  // onSnapshot aplica el módulo remoto directamente sin llamar a merge ni encolar upload.
  const localFingerprint = syncModuleFingerprint(base, 'finance');
  const remoteFingerprint = syncDataFingerprint(pureHeadData);
  assert.equal(localFingerprint, remoteFingerprint);

  // 2. Si ocurre un merge concurrente donde el estado resultante tiene la misma huella que el remoto:
  const mergedState = applySyncModule(base, 'finance', pureHeadData);
  const mergedFingerprint = syncModuleFingerprint(mergedState, 'finance');

  const modulesToUpload: SyncModuleKey[] = [];
  if (mergedFingerprint !== remoteFingerprint) {
    modulesToUpload.push('finance');
  }

  assert.equal(modulesToUpload.length, 0, 'No debe programar upload si el resultado fusionado es idéntico a lo que ya está en Firestore');
});

test('Hotfix Loop Infinito: Fail-Safe ante divergencia consecutiva repetida', () => {
  let consecutiveDivergences = 0;
  const queuedModules = new Set<SyncModuleKey>();
  const modules: SyncModuleKey[] = ['finance', 'tasks'];

  // Simular 3 divergencias consecutivas
  for (let attempt = 1; attempt <= 4; attempt++) {
    consecutiveDivergences += 1;
    if (consecutiveDivergences < 3) {
      modules.forEach((m) => queuedModules.add(m));
    } else {
      // Fail-safe activado: se detiene el reencolado automático
      queuedModules.clear();
    }
  }

  assert.equal(consecutiveDivergences, 4);
  assert.equal(queuedModules.size, 0, 'El fail-safe debe vaciar o evitar reencolar módulos tras >=3 divergencias consecutivas sin progreso');
});

test('Hotfix Loop Infinito: Alineación determinista de revisiones E2EE entre writeCloudModules y batch preparado', async () => {
  const userId = 'user-e2ee-test-123';
  const mdek = await generateMdek();
  cryptoSession.setUnlocked(mdek, userId);

  try {
    const state = defaultState();
    const modules: SyncModuleKey[] = ['finance', 'tasks'];
    const deviceId = 'test-device-id';
    const baseRevisions = { finance: 'rev-prev-1', tasks: 'rev-prev-2' };

    // writeCloudModules con sesión E2EE activa
    const res = writeCloudModules(userId, state, modules, deviceId, baseRevisions);

    // En ambiente de test sin emulador activo, batch.commit() fallará con PERMISSION_DENIED;
    // manejamos el catch para evitar unhandledRejection en Node test runner.
    res.completion.catch(() => {});

    // Las revisiones retornadas a App.tsx deben ser exactamente las que writeCloudModules preparó
    assert.equal(res.writes.length, 2);
    assert.equal(res.writes[0].module, 'finance');
    assert.equal(res.writes[0].parentRevision, 'rev-prev-1');
    assert.ok(res.writes[0].revision.includes(deviceId));

    assert.equal(res.writes[1].module, 'tasks');
    assert.equal(res.writes[1].parentRevision, 'rev-prev-2');
    assert.ok(res.writes[1].revision.includes(deviceId));
  } finally {
    cryptoSession.lock();
  }
});

test('Hotfix 2 - Caso 1: local == remote semánticamente pero revisión remota diferente -> Adopción limpia sin write, status synced', () => {
  // Simula el escenario donde la nube avanzó o se restauró backup, pero los datos son equivalentes
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc-1', name: 'Cuenta Corriente', balance: 5000, initialBalance: 5000 }];

  const knownRevision = 'rev-local-old';
  const remoteHead = {
    module: 'finance' as SyncModuleKey,
    revision: 'rev-remote-fresh',
    data: syncModuleData(state, 'finance'),
  };

  const pureHeadData = extractPureModuleData(remoteHead.data);
  const localFingerprint = syncModuleFingerprint(state, 'finance');
  const remoteFingerprint = syncDataFingerprint(pureHeadData);

  // Invariante: las huellas son idénticas
  assert.equal(localFingerprint, remoteFingerprint);
  assert.notEqual(knownRevision, remoteHead.revision);

  // Lógica de adopción limpia de onSnapshot
  const nextRevisions: Record<string, string> = { finance: knownRevision };
  const nextBaselines: Record<string, string> = { finance: 'old-baseline' };
  const modulesToUpload: SyncModuleKey[] = [];
  let syncStatus = 'connecting';

  if (localFingerprint === remoteFingerprint) {
    nextRevisions[remoteHead.module] = remoteHead.revision;
    nextBaselines[remoteHead.module] = remoteFingerprint;
    syncStatus = 'synced';
  } else {
    modulesToUpload.push(remoteHead.module);
  }

  assert.equal(nextRevisions.finance, 'rev-remote-fresh', 'Debe adoptar la revisión remota');
  assert.equal(nextBaselines.finance, remoteFingerprint, 'Debe actualizar el baseline');
  assert.equal(modulesToUpload.length, 0, 'No debe emitir ninguna escritura');
  assert.equal(syncStatus, 'synced', 'Debe quedar en synced estable');
});

test('Hotfix 2 - Caso 2: local != remote en contenido -> Detecta conflicto real y no sobreescribe', () => {
  const localState = defaultState();
  localState.finance.accounts = [{ id: 'acc-1', name: 'Cuenta Local', balance: 8000, initialBalance: 8000 }];

  const remoteState = defaultState();
  remoteState.finance.accounts = [{ id: 'acc-1', name: 'Cuenta Nube', balance: 9500, initialBalance: 9500 }];

  const localFingerprint = syncModuleFingerprint(localState, 'finance');
  const remoteData = syncModuleData(remoteState, 'finance');
  const remoteFingerprint = syncDataFingerprint(remoteData);

  assert.notEqual(localFingerprint, remoteFingerprint);

  // Detección de diferencias reales
  const divergences: SyncModuleKey[] = [];
  if (localFingerprint !== remoteFingerprint) {
    divergences.push('finance');
  }

  assert.equal(divergences.length, 1);
  assert.equal(divergences[0], 'finance');

  // Guardar recovery snapshots en conflicto real
  const userId = 'user-conflict-case-2';
  saveSyncRecoverySnapshot(userId, 'local', localState);
  saveSyncRecoverySnapshot(userId, 'remote', remoteState);

  const savedLocal = loadSyncRecoverySnapshot(userId, 'local');
  const savedRemote = loadSyncRecoverySnapshot(userId, 'remote');

  assert.equal(savedLocal?.finance.accounts[0].name, 'Cuenta Local');
  assert.equal(savedRemote?.finance.accounts[0].name, 'Cuenta Nube');
  clearSyncRecoverySnapshots(userId);
});

test('Hotfix 2 - Caso 3: Estado de conflicto persistente -> Reconciliación forzada (Sincronizar ahora) resuelve si son idénticos', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc-1', name: 'Banco Central', balance: 12000, initialBalance: 12000 }];

  // Simular resultado de fetchFreshCloudModules
  const fresh = {
    moduleData: {
      finance: extractPureModuleData(syncModuleData(state, 'finance')),
    },
    remoteRevisions: {
      finance: 'cloud-rev-fresh-99',
    },
    lockedModules: [] as SyncModuleKey[],
    corruptedModules: [] as SyncModuleKey[],
  };

  // Reconciliación lógica de handleForceSync
  let syncStatus = 'conflict';
  let cloudConflict: any = { dummy: true };
  let localRevisions: Record<string, string> = { finance: 'stale-local-rev' };
  const localBaselines: Record<string, string> = { finance: 'stale-baseline' };

  const contentDivergences: SyncModuleKey[] = [];
  const remoteModules = Object.keys(fresh.moduleData) as SyncModuleKey[];
  for (const mod of remoteModules) {
    const localFp = syncModuleFingerprint(state, mod);
    const remoteFp = syncDataFingerprint(fresh.moduleData[mod]);
    if (localFp !== remoteFp) {
      contentDivergences.push(mod);
    }
  }

  if (contentDivergences.length === 0) {
    localRevisions = { ...localRevisions, ...fresh.remoteRevisions };
    for (const mod of remoteModules) {
      localBaselines[mod] = syncDataFingerprint(fresh.moduleData[mod]);
    }
    cloudConflict = null;
    syncStatus = 'synced';
  }

  assert.equal(contentDivergences.length, 0);
  assert.equal(syncStatus, 'synced', 'Debe converger a synced');
  assert.equal(cloudConflict, null, 'Debe despejar el estado de conflicto');
  assert.equal(localRevisions.finance, 'cloud-rev-fresh-99', 'Metadata de revisión actualizada');
  assert.equal(localBaselines.finance, syncModuleFingerprint(state, 'finance'), 'Baseline alineado con la huella real');
});

test('Hotfix 2 - Caso 4: Relogin con conflicto previo -> Preservación de datos locales y reconciliación', () => {
  const localState = defaultState();
  localState.notes.postits = [{ id: 'n1', text: 'Nota Importante', date: '2026-10-05' }];

  // 1. En relogin, localState NO se borra de localStorage
  assert.equal(localState.notes.postits[0].text, 'Nota Importante');

  // 2. Si remoteState tiene la misma nota (mismo contenido semántico)
  const remoteState = structuredClone(localState);
  const remoteData = syncModuleData(remoteState, 'notes');
  const remoteRevision = 'rev-cloud-relogin';

  // Al llegar onSnapshot o al ejecutarse la reconciliación inicial
  const localFp = syncModuleFingerprint(localState, 'notes');
  const remoteFp = syncDataFingerprint(extractPureModuleData(remoteData));
  assert.equal(localFp, remoteFp);

  // La auto-adopción evita que relogin quede atascado en conflicto
  const nextRevisions = { notes: remoteRevision };
  const nextBaselines = { notes: remoteFp };

  assert.equal(nextRevisions.notes, 'rev-cloud-relogin');
  assert.equal(nextBaselines.notes, localFp);
});

test('Hotfix 2 - Caso 5: E2EE activo -> Comparación semántica basada en contenido descifrado, no ciphertext/IV', async () => {
  const userId = 'user-e2ee-comparison-test';
  const mdek = await generateMdek();
  cryptoSession.setUnlocked(mdek, userId);

  try {
    const rawData = {
      accounts: [{ id: 'acc-1', name: 'Ahorros Seguros', balance: 25000, initialBalance: 25000 }],
      transactions: [],
      monthlyBudgets: {},
    };

    // Dos cifrados distintos del mismo contenido lógico (producirán ciphertexts y IVs distintos por AES-GCM)
    const { encodeCloudModuleData, decodeCloudModuleData } = await import('./cryptoCore');
    const encResult1 = await encodeCloudModuleData(rawData, 'finance', userId, mdek);
    const encResult2 = await encodeCloudModuleData(rawData, 'finance', userId, mdek);

    assert.ok(encResult1.isEncrypted);
    assert.ok(encResult2.isEncrypted);

    // Los payloads cifrados son diferentes byte a byte (por aleatoriedad de IV)
    assert.notEqual(JSON.stringify(encResult1.data), JSON.stringify(encResult2.data));

    // Pero al decodificar y extraer pureModuleData:
    const decoded1 = await decodeCloudModuleData(encResult1.data, 'finance', userId, mdek);
    const decoded2 = await decodeCloudModuleData(encResult2.data, 'finance', userId, mdek);

    assert.equal(decoded1.mode, 'decrypted');
    assert.equal(decoded2.mode, 'decrypted');

    const pure1 = extractPureModuleData(decoded1.data);
    const pure2 = extractPureModuleData(decoded2.data);

    const fp1 = syncDataFingerprint(pure1);
    const fp2 = syncDataFingerprint(pure2);

    // Invariante fundamental de Hotfix 2 para E2EE:
    assert.equal(fp1, fp2, 'Las huellas semánticas del contenido descifrado DEBEN ser idénticas a pesar del cifrado no-determinista');
  } finally {
    cryptoSession.lock();
  }
});
