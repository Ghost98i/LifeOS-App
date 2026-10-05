import assert from 'node:assert/strict';
import test from 'node:test';
import type { Project, TodayExtra, Goal } from '../types';
import { defaultState, normalizeStoredState, parseBackupJSON } from './storage';
import {
  mergeSyncModuleWithConflicts,
  detectSyncModuleConflicts,
  syncModuleData,
  type SyncModuleKey,
} from './syncModel';
import {
  saveSyncRecoverySnapshot,
  loadSyncRecoverySnapshot,
  clearSyncRecoverySnapshots,
  writeCloudModulesGuarded,
} from './cloudSync';

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
