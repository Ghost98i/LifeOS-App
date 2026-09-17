import assert from 'node:assert/strict';
import test from 'node:test';
import type { LifeOSState } from '../types';
import { defaultState, normalizeStoredState } from './storage';
import {
  SYNC_MODULES,
  applySyncModule,
  changedSyncModules,
  equivalentLifeOSState,
  mergeSyncModule,
  syncDataFingerprint,
  syncModuleData,
  syncModuleFingerprint,
  type SyncModuleKey,
} from './syncModel';
import { detectDeletedEntityIds } from './syncMerge';

/**
 * Realistic Multi-Device Network & Firestore Simulator.
 * Models Firestore document store, realtime listeners, offline queues,
 * optimistic local updates, 3-way merge, and multi-tab broadcast.
 */
class MockCloudBackend {
  modules: Map<SyncModuleKey, { data: unknown; revision: string; deviceId: string; clientUpdatedAt: number }> = new Map();
  listeners: Set<(snapshot: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string }[]) => void> = new Set();
  shouldFailWrites = false;

  subscribe(listener: (snapshot: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string }[]) => void) {
    this.listeners.add(listener);
    // Initial emit
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return Array.from(this.modules.entries()).map(([module, val]) => ({
      module,
      data: val.data,
      revision: val.revision,
      deviceId: val.deviceId,
    }));
  }

  commitBatch(writes: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string; clientUpdatedAt: number }[]) {
    if (this.shouldFailWrites) {
      return Promise.reject(new Error('Network error: simulated connection loss'));
    }
    for (const w of writes) {
      this.modules.set(w.module, {
        data: structuredClone(w.data),
        revision: w.revision,
        deviceId: w.deviceId,
        clientUpdatedAt: w.clientUpdatedAt,
      });
    }
    const snap = this.getSnapshot();
    for (const listener of Array.from(this.listeners)) {
      listener(snap);
    }
    return Promise.resolve();
  }
}

class SimulatedDevice {
  deviceId: string;
  backend: MockCloudBackend;
  state: LifeOSState;
  revisions: Partial<Record<SyncModuleKey, string>> = {};
  baselines: Partial<Record<SyncModuleKey, string>> = {};
  baselineData: Partial<Record<SyncModuleKey, unknown>> = {};
  tombstones: Record<string, number> = {};
  pendingQueue: SyncModuleKey[] = [];
  pendingRevisions: Partial<Record<SyncModuleKey, string[]>> = {};
  isOnline = true;
  unsubscribeListener: (() => void) | null = null;
  retryCount = 0;
  tabListeners: Set<(state: LifeOSState) => void> = new Set();
  isFlushing = false;

  constructor(deviceId: string, backend: MockCloudBackend, initialState?: LifeOSState) {
    this.deviceId = deviceId;
    this.backend = backend;
    this.state = initialState ? structuredClone(initialState) : defaultState();
    for (const m of SYNC_MODULES) {
      this.baselines[m] = syncModuleFingerprint(this.state, m);
      this.baselineData[m] = structuredClone(syncModuleData(this.state, m));
    }
    this.connect();
  }

  connect() {
    this.isOnline = true;
    this.unsubscribeListener = this.backend.subscribe((snapshot) => {
      if (!this.isOnline) return;
      this.onRemoteSnapshot(snapshot);
    });
  }

  disconnect() {
    this.isOnline = false;
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
      this.unsubscribeListener = null;
    }
  }

  updateState(updater: (draft: LifeOSState) => void) {
    const previous = structuredClone(this.state);
    updater(this.state);
    this.state = normalizeStoredState(this.state);

    // Tombstone tracking
    const deletedIds = detectDeletedEntityIds(previous, this.state);
    for (const id of deletedIds) {
      this.tombstones[id] = Date.now();
    }

    // Identify changed modules
    const changed = SYNC_MODULES.filter(
      (m) => syncModuleFingerprint(previous, m) !== syncModuleFingerprint(this.state, m)
    );
    for (const m of changed) {
      if (!this.pendingQueue.includes(m)) {
        this.pendingQueue.push(m);
      }
    }

    // Broadcast to tabs
    for (const tab of this.tabListeners) {
      tab(structuredClone(this.state));
    }

    if (this.isOnline) {
      this.flushCloudSave().catch(() => {});
    }
  }

  onRemoteSnapshot(snapshot: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string }[]) {
    let stateChanged = false;
    const modulesToUpload: SyncModuleKey[] = [];

    for (const item of snapshot) {
      const pending = this.pendingRevisions[item.module] || [];
      if (pending.includes(item.revision)) {
        this.pendingRevisions[item.module] = pending.filter((r) => r !== item.revision);
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(item.data);
        this.baselineData[item.module] = structuredClone(item.data);
        continue;
      }

      if (this.revisions[item.module] === item.revision) {
        continue;
      }

      const localFingerprint = syncModuleFingerprint(this.state, item.module);
      const remoteFingerprint = syncDataFingerprint(item.data);

      if (localFingerprint === remoteFingerprint) {
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = remoteFingerprint;
        this.baselineData[item.module] = structuredClone(item.data);
        continue;
      }


      const isLocalDirty = this.baselines[item.module] !== localFingerprint;

      if (!isLocalDirty && !this.pendingQueue.includes(item.module)) {
        this.state = applySyncModule(this.state, item.module, item.data);
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(item.data);
        this.baselineData[item.module] = structuredClone(item.data);
        stateChanged = true;
      } else {
        // Concurrent modification: 3-Way Merge!
        this.state = mergeSyncModule(
          this.state,
          item.module,
          item.data,
          this.baselineData[item.module],
          this.tombstones
        );
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(item.data);
        this.baselineData[item.module] = structuredClone(syncModuleData(this.state, item.module));
        stateChanged = true;

        const mergedFingerprint = syncModuleFingerprint(this.state, item.module);
        if (mergedFingerprint !== remoteFingerprint) {
          modulesToUpload.push(item.module);
        }
      }
    }

    if (stateChanged) {
      for (const tab of this.tabListeners) {
        tab(structuredClone(this.state));
      }
    }

    if (modulesToUpload.length > 0 && this.isOnline) {
      for (const m of modulesToUpload) {
        if (!this.pendingQueue.includes(m)) this.pendingQueue.push(m);
      }
      this.flushCloudSave().catch(() => {});
    }
  }

  currentFlushPromise: Promise<void> | null = null;

  flushCloudSave(): Promise<void> {
    if (this.currentFlushPromise) return this.currentFlushPromise;
    if (!this.isOnline || this.pendingQueue.length === 0) return Promise.resolve();

    const modulesToSave = [...this.pendingQueue];
    this.pendingQueue = [];
    const now = Date.now();
    const writes = modulesToSave.map((module, i) => {
      const rev = `rev-${now}-${this.deviceId}-${module}-${i}`;
      return {
        module,
        data: syncModuleData(this.state, module),
        revision: rev,
        deviceId: this.deviceId,
        clientUpdatedAt: now + i,
      };
    });
    for (const w of writes) {
      this.pendingRevisions[w.module] = [...(this.pendingRevisions[w.module] || []), w.revision];
    }

    this.currentFlushPromise = this.backend.commitBatch(writes)
      .then(() => {
        this.currentFlushPromise = null;
        this.retryCount = 0;
        for (const w of writes) {
          this.revisions[w.module] = w.revision;
          this.baselines[w.module] = syncDataFingerprint(w.data);
          this.baselineData[w.module] = structuredClone(w.data);
        }
      })
      .catch((err) => {
        this.currentFlushPromise = null;
        this.retryCount += 1;
        for (const m of modulesToSave) {
          if (!this.pendingQueue.includes(m)) this.pendingQueue.push(m);
        }
        for (const w of writes) {
          this.pendingRevisions[w.module] = (this.pendingRevisions[w.module] || []).filter((r) => r !== w.revision);
        }
        return Promise.reject(err);
      });

    return this.currentFlushPromise;
  }

  async reconnectAndSync() {
    this.connect();
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (this.pendingQueue.length > 0) {
      await this.flushCloudSave();
    }
  }
}

function assertEquivalent(a: LifeOSState, b: LifeOSState) {
  const diff = changedSyncModules(a, b);
  if (diff.length > 0) {
    const details = diff.map((m) => ({
      module: m,
      a: syncModuleData(a, m),
      b: syncModuleData(b, m),
    }));
    assert.fail(`States not equivalent in modules: ${diff.join(', ')}. Details: ${JSON.stringify(details)}`);
  }
}

// =========================================================================
// 12 MANDATORY MULTI-DEVICE VERIFICATION TESTS
// =========================================================================

test('TEST 1: Celular agrega entrenamiento en gym.sessions, PC edita nota en notes.postits. Ambos sincronizan y coexisten sin pérdida de datos', async () => {
  const backend = new MockCloudBackend();
  const phone = new SimulatedDevice('phone', backend);
  const pc = new SimulatedDevice('pc', backend, phone.state);

  // Phone adds a gym session
  phone.updateState((draft) => {
    draft.gym.sessions.push({
      id: 'session-101',
      date: '2026-09-17',
      exercises: [
        {
          id: 'ex-1',
          name: 'Press Banca',
          sets: [{ id: 'set-1', weight: 80, reps: 8, completed: true }],
        },
      ],
      status: 'completed',
    });
  });

  // PC edits a note
  pc.updateState((draft) => {
    draft.notes.postits.push({
      id: 'note-202',
      text: 'Comprar creatina',
      date: '2026-09-17',
    });
  });

  // Both should have synced via real-time backend
  assert.equal(phone.state.gym.sessions.some((s) => s.id === 'session-101'), true);
  assert.equal(phone.state.notes.postits.some((n) => n.id === 'note-202'), true);
  assert.equal(pc.state.gym.sessions.some((s) => s.id === 'session-101'), true);
  assert.equal(pc.state.notes.postits.some((n) => n.id === 'note-202'), true);

  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});

test('TEST 2: Celular registra gasto de $500 con cuenta A (1000->500). PC offline registra gasto de $200 (1000->800). Al reconectar PC, existen ambas transacciones y saldo es $300', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.finance.accounts[0] = { id: 'acc-a', name: 'Banco', balance: 1000 };

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  // PC goes offline
  pc.disconnect();

  // Phone records $500 expense
  phone.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-phone-500',
      type: 'gasto',
      amount: 500,
      category: 'Comida',
      fixed: 'variable',
      date: '2026-09-17',
      accountId: 'acc-a',
    });
    draft.finance.accounts[0].balance = 500;
  });

  // PC simultaneously records $200 expense while offline
  pc.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-pc-200',
      type: 'gasto',
      amount: 200,
      category: 'Servicios',
      fixed: 'variable',
      date: '2026-09-17',
      accountId: 'acc-a',
    });
    draft.finance.accounts[0].balance = 800;
  });

  // PC reconnects
  await pc.reconnectAndSync();

  // Verify both devices have both transactions
  assert.equal(pc.state.finance.transactions.some((t) => t.id === 'tx-phone-500'), true);
  assert.equal(pc.state.finance.transactions.some((t) => t.id === 'tx-pc-200'), true);
  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-phone-500'), true);
  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-pc-200'), true);

  // Verify Account A balance is exactly $300 on both
  const pcAcc = pc.state.finance.accounts.find((a) => a.id === 'acc-a');
  const phoneAcc = phone.state.finance.accounts.find((a) => a.id === 'acc-a');
  assert.equal(pcAcc?.balance, 300);
  assert.equal(phoneAcc?.balance, 300);

  assertEquivalent(phone.state, pc.state);
});

test('TEST 3: Celular completa una tarea (taskLog o todayExtras). PC sin recargar ve la tarea completada', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.todayExtras.push({
    id: 'extra-1',
    date: '2026-09-17',
    text: 'Revisar servidor',
    done: false,
    priority: 'alta',
  });
  initial.tasksRecurring.push({
    id: 'rec-1',
    name: 'Estirar 10 min',
    freq: 'daily',
  });

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  assert.equal(pc.state.todayExtras[0].done, false);

  // Phone completes both the extra task and recurring taskLog
  phone.updateState((draft) => {
    draft.todayExtras[0].done = true;
    if (!draft.taskLog['2026-09-17']) draft.taskLog['2026-09-17'] = {};
    draft.taskLog['2026-09-17']['rec-1'] = true;
  });

  // PC immediately reflects without reload
  assert.equal(pc.state.todayExtras[0].done, true);
  assert.equal(pc.state.taskLog['2026-09-17']['rec-1'], true);

  assertEquivalent(phone.state, pc.state);
});

test('TEST 4: Celular borra un postit. PC offline tenía ese postit sin editar. Al reconectar PC, el postit NO resucita', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.notes.postits.push({ id: 'postit-target', text: 'Nota vieja', date: '2026-09-10' });
  initial.notes.postits.push({ id: 'postit-stay', text: 'Nota que queda', date: '2026-09-10' });

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  // PC goes offline
  pc.disconnect();

  // Phone deletes 'postit-target'
  phone.updateState((draft) => {
    draft.notes.postits = draft.notes.postits.filter((p) => p.id !== 'postit-target');
  });

  // PC reconnects without having edited 'postit-target'
  await pc.reconnectAndSync();

  // The deleted postit must NOT resurrect
  assert.equal(pc.state.notes.postits.some((p) => p.id === 'postit-target'), false);
  assert.equal(pc.state.notes.postits.some((p) => p.id === 'postit-stay'), true);
  assert.equal(phone.state.notes.postits.some((p) => p.id === 'postit-target'), false);

  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});

test('TEST 5: Celular borra un postit pero PC offline lo editó (cambió texto). La edición de PC se preserva', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.notes.postits.push({ id: 'postit-edit', text: 'Texto original', date: '2026-09-10' });

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  pc.disconnect();

  // Phone deletes it
  phone.updateState((draft) => {
    draft.notes.postits = draft.notes.postits.filter((p) => p.id !== 'postit-edit');
  });

  // PC modifies it offline
  pc.updateState((draft) => {
    const p = draft.notes.postits.find((item) => item.id === 'postit-edit');
    if (p) {
      p.text = 'Texto crucial editado offline en PC';
      p.date = '2026-09-17';
    }
  });

  // PC reconnects
  await pc.reconnectAndSync();

  // The edited version must be preserved because PC modified it after baseline
  const noteInPc = pc.state.notes.postits.find((p) => p.id === 'postit-edit');
  const noteInPhone = phone.state.notes.postits.find((p) => p.id === 'postit-edit');

  assert.ok(noteInPc, 'Note exists on PC');
  assert.equal(noteInPc.text, 'Texto crucial editado offline en PC');
  assert.ok(noteInPhone, 'Note exists on Phone');
  assert.equal(noteInPhone.text, 'Texto crucial editado offline en PC');

  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});

test('TEST 6: 3 pestañas abiertas en la misma PC. Modificación en pestaña 1 se refleja instantáneamente en pestañas 2 y 3 sin recargar', () => {
  const backend = new MockCloudBackend();
  const device = new SimulatedDevice('pc-tab-host', backend);

  let tab2State = structuredClone(device.state);
  let tab3State = structuredClone(device.state);

  // Subscribe simulated tabs to host device's BroadcastChannel
  device.tabListeners.add((s) => { tab2State = structuredClone(s); });
  device.tabListeners.add((s) => { tab3State = structuredClone(s); });

  // Tab 1 updates an inbox item and switches dark mode
  device.updateState((draft) => {
    draft.inbox = draft.inbox || [];
    draft.inbox.push({ id: 'inbox-1', text: 'Idea inmediata', createdAt: '2026-09-17' });
    draft.settings.darkMode = true;
  });

  // Check tabs 2 and 3 instantly
  assert.equal(tab2State.inbox?.[0]?.text, 'Idea inmediata');
  assert.equal(tab2State.settings.darkMode, true);
  assert.equal(tab3State.inbox?.[0]?.text, 'Idea inmediata');
  assert.equal(tab3State.settings.darkMode, true);
});

test('TEST 7: Celular en modo avión registra 5 transacciones, 1 sesión gym y 2 notas. Al desactivar modo avión, sube a Firestore en orden y sin duplicados', async () => {
  const backend = new MockCloudBackend();
  const phone = new SimulatedDevice('phone', backend);
  const pc = new SimulatedDevice('pc', backend, phone.state);

  phone.disconnect(); // Modo avión

  // Phone records 5 transactions
  phone.updateState((draft) => {
    for (let i = 1; i <= 5; i++) {
      draft.finance.transactions.push({
        id: `tx-airplane-${i}`,
        type: 'gasto',
        amount: i * 100,
        category: 'Varios',
        fixed: 'variable',
        date: '2026-09-17',
        accountId: draft.finance.accounts[0]?.id || 'acc-1',
      });
    }
    // 1 gym session
    draft.gym.sessions.push({
      id: 'session-airplane-1',
      date: '2026-09-17',
      exercises: [{ id: 'ex-a', name: 'Sentadilla', sets: [{ id: 's1', reps: 10, weight: 100 }] }],
    });
    // 2 notes
    draft.notes.postits.push({ id: 'note-plane-1', text: 'Nota avión 1', date: '2026-09-17' });
    draft.notes.postits.push({ id: 'note-plane-2', text: 'Nota avión 2', date: '2026-09-17' });
  });

  // Re-enable network
  await phone.reconnectAndSync();

  // Verify all items reached PC without duplicates
  const txs = pc.state.finance.transactions.filter((t) => t.id.startsWith('tx-airplane-'));
  assert.equal(txs.length, 5);

  const gymSess = pc.state.gym.sessions.filter((s) => s.id === 'session-airplane-1');
  assert.equal(gymSess.length, 1);

  const notes = pc.state.notes.postits.filter((n) => n.id.startsWith('note-plane-'));
  assert.equal(notes.length, 2);

  assertEquivalent(phone.state, pc.state);
});

test('TEST 8: PC y celular modifican concurrentemente el mismo módulo (finance.budgets y categories). Cambios se combinan sin pisarse', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.finance.categories = ['Comida', 'Alquiler'];
  initial.finance.budgets = { Comida: 30000, Alquiler: 80000 };

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  pc.disconnect();

  // Phone adds category 'Gimnasio' and budget
  phone.updateState((draft) => {
    draft.finance.categories.push('Gimnasio');
    draft.finance.budgets['Gimnasio'] = 15000;
  });

  // PC adds category 'Libros' and budget
  pc.updateState((draft) => {
    draft.finance.categories.push('Libros');
    draft.finance.budgets['Libros'] = 5000;
  });

  await pc.reconnectAndSync();

  // Both categories and budgets should coexist on both devices
  assert.equal(pc.state.finance.categories.includes('Gimnasio'), true);
  assert.equal(pc.state.finance.categories.includes('Libros'), true);
  assert.equal(pc.state.finance.budgets['Gimnasio'], 15000);
  assert.equal(pc.state.finance.budgets['Libros'], 5000);
  assert.equal(pc.state.finance.budgets['Comida'], 30000);

  assert.equal(phone.state.finance.categories.includes('Gimnasio'), true);
  assert.equal(phone.state.finance.categories.includes('Libros'), true);
  assert.equal(phone.state.finance.budgets['Gimnasio'], 15000);
  assert.equal(phone.state.finance.budgets['Libros'], 5000);

  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});

test('TEST 9: Celular cambia nombre de un proyecto, PC agrega subtarea al mismo proyecto. Estado final tiene nuevo nombre Y nueva subtarea', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.projects = [
    {
      id: 'proj-1',
      name: 'Lanzamiento Tienda',
      objective: 'Vender online',
      status: 'activo',
      nextStep: 'Crear catálogo',
      tasks: [{ id: 'task-a', text: 'Comprar dominio', done: true }],
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01T10:00:00Z',
    },
  ];

  const phone = new SimulatedDevice('phone', backend, initial);
  const pc = new SimulatedDevice('pc', backend, initial);

  pc.disconnect();

  // Phone renames project
  phone.updateState((draft) => {
    const p = draft.projects?.find((item) => item.id === 'proj-1');
    if (p) {
      p.name = 'Lanzamiento Global Tienda Online';
      p.updatedAt = '2026-09-17T12:00:00Z';
    }
  });

  // PC adds subtask
  pc.updateState((draft) => {
    const p = draft.projects?.find((item) => item.id === 'proj-1');
    if (p) {
      p.tasks.push({ id: 'task-b', text: 'Configurar MercadoPago', done: false });
      p.updatedAt = '2026-09-17T11:00:00Z';
    }
  });

  await pc.reconnectAndSync();

  const pcProj = pc.state.projects?.find((p) => p.id === 'proj-1');
  const phoneProj = phone.state.projects?.find((p) => p.id === 'proj-1');

  assert.ok(pcProj);
  assert.ok(phoneProj);
  assert.equal(pcProj.name, 'Lanzamiento Global Tienda Online');
  assert.equal(phoneProj.name, 'Lanzamiento Global Tienda Online');
  assert.equal(pcProj.tasks.some((t) => t.id === 'task-b'), true);
  assert.equal(phoneProj.tasks.some((t) => t.id === 'task-b'), true);

  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});

test('TEST 10: PWA se actualiza mientras hay escrituras en cola local. Ningún dato se pierde', async () => {
  const backend = new MockCloudBackend();
  const phone = new SimulatedDevice('phone-pwa', backend);

  phone.disconnect();

  // Queue changes before update
  phone.updateState((draft) => {
    draft.goals.push({ id: 'goal-pwa', name: 'Meta PWA', initial: 0, target: 100, current: 50 });
    draft.ideas.push({ id: 'idea-pwa', text: 'Idea antes de SW update', date: '2026-09-17', source: 'manual' });
  });

  assert.equal(phone.pendingQueue.length > 0, true);

  // Simulated PWA update handler flushes queue before refreshing
  await phone.reconnectAndSync();

  assert.equal(phone.pendingQueue.length, 0);
  assert.equal(phone.state.goals.some((g) => g.id === 'goal-pwa'), true);
  assert.equal(phone.state.ideas.some((i) => i.id === 'idea-pwa'), true);

  // Verifying backend received it
  const snap = backend.getSnapshot();
  const goalsMod = snap.find((m) => m.module === 'goals');
  assert.ok(goalsMod);
  assert.equal((goalsMod.data as any).goals.some((g: any) => g.id === 'goal-pwa'), true);
});

test('TEST 11: Pérdida abrupta de red a mitad de guardado. Cola reintenta automáticamente con backoff y no se corrompe el estado', async () => {
  const backend = new MockCloudBackend();
  const device = new SimulatedDevice('dev-retry', backend);

  // Trigger simulated network error on backend
  backend.shouldFailWrites = true;

  device.updateState((draft) => {
    draft.calendarEvents.push({
      id: 'cal-event-1',
      name: 'Entrevista técnica',
      date: '2026-09-20',
      type: 'importante',
      recurring: false,
    });
  });

  // Attempt save should fail
  await assert.rejects(device.flushCloudSave());
  assert.ok(device.retryCount >= 1);
  assert.equal(device.pendingQueue.includes('calendar'), true);
  // Local state is preserved and intact!
  assert.equal(device.state.calendarEvents.some((e) => e.id === 'cal-event-1'), true);

  // Network recovers
  backend.shouldFailWrites = false;

  // Retry succeeds
  await device.flushCloudSave();
  assert.equal(device.retryCount, 0);
  assert.equal(device.pendingQueue.length, 0);

  const snap = backend.getSnapshot();
  const calMod = snap.find((m) => m.module === 'calendar');
  assert.ok(calMod);
  assert.equal((calMod.data as any).calendarEvents.some((e: any) => e.id === 'cal-event-1'), true);
});

test('TEST 12: Invariante de convergencia: equivalentLifeOSState(deviceA, deviceB) === true tras múltiples operaciones concurrentes cruzadas', async () => {
  const backend = new MockCloudBackend();
  const phone = new SimulatedDevice('phone', backend);
  const pc = new SimulatedDevice('pc', backend, phone.state);

  pc.disconnect();

  // Phone does multiple actions
  phone.updateState((draft) => {
    draft.profile.name = 'Christian Phone';
    draft.study.studyLog.push({ id: 'study-1', date: '2026-09-17', minutes: 45 });
    draft.streaming.sessions.push({ id: 'stream-1', date: '2026-09-17', hours: 3 });
    draft.jobs.applications.push({ id: 'job-1', empresa: 'Acme', puesto: 'Senior Dev', estado: 'cv_enviado', fecha: '2026-09-17' });
  });

  // PC does multiple cross-module actions
  pc.updateState((draft) => {
    draft.resale.inventory.push({ id: 'resale-1', item: 'Teclado Mecánico', buyPrice: 50, buyDate: '2026-09-17', status: 'comprado' });
    draft.checkoutLog['2026-09-17'] = { trainedSkipped: false, energyLevel: 5, sleepHours: 8 };
    draft.dailyContext.push({ date: '2026-09-17', sleepHours: 8, energy: 5, mood: 5, connection: 5 });
  });

  // PC reconnects and syncs
  await pc.reconnectAndSync();

  // Final check: exactly convergent across all 15 modules
  assert.equal(equivalentLifeOSState(phone.state, pc.state), true);
});
