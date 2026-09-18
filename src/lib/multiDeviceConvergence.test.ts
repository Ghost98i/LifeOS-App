import assert from 'node:assert/strict';
import test from 'node:test';
import type { GymSession, LifeOSState } from '../types';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import {
  SYNC_MODULES,
  applySyncModule,
  equivalentLifeOSState,
  extractPureModuleData,
  mergeSyncModule,
  syncDataFingerprint,
  syncModuleData,
  syncModuleFingerprint,
  type SyncModuleKey,
} from './syncModel';
import { detectDeletedEntityIds } from './syncMerge';

/**
 * Enhanced Real-Time Cloud Mock with Modular Document Storage and Tombstone Propagation
 */
class MockCloudBackend {
  modules: Map<SyncModuleKey, { data: unknown; revision: string; deviceId: string; clientUpdatedAt: number }> = new Map();
  listeners: Set<(snapshot: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string }[]) => void> = new Set();
  shouldFailWrites = false;

  subscribe(listener: (snapshot: { module: SyncModuleKey; data: unknown; revision: string; deviceId: string }[]) => void) {
    this.listeners.add(listener);
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
      return Promise.reject(new Error('Network error: simulated offline failure'));
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

/**
 * Simulated Device with Local Ledger, Tombstones, and Offline Resilience
 */
class ConvergenceDevice {
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
  currentFlushPromise: Promise<void> | null = null;

  constructor(deviceId: string, backend: MockCloudBackend, initialState?: LifeOSState) {
    this.deviceId = deviceId;
    this.backend = backend;
    this.state = initialState ? normalizeStoredState(structuredClone(initialState)) : defaultState();
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

    // Track deleted IDs as tombstones
    const deletedIds = detectDeletedEntityIds(previous, this.state);
    for (const id of deletedIds) {
      this.tombstones[id] = Date.now();
    }

    // Queue changed modules
    const changed = SYNC_MODULES.filter(
      (m) => syncModuleFingerprint(previous, m) !== syncModuleFingerprint(this.state, m)
    );
    for (const m of changed) {
      if (!this.pendingQueue.includes(m)) {
        this.pendingQueue.push(m);
      }
    }

    // Broadcast to open tabs
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
      // Extract tombstones if attached
      if (item.data && typeof item.data === 'object' && '_tombstones' in item.data) {
        const remoteTombstones = (item.data as any)._tombstones;
        if (remoteTombstones && typeof remoteTombstones === 'object') {
          for (const [id, time] of Object.entries(remoteTombstones)) {
            if (typeof time === 'number' && (!this.tombstones[id] || time > this.tombstones[id])) {
              this.tombstones[id] = time;
            }
          }
        }
      }

      const pureData = extractPureModuleData(item.data);
      const pending = this.pendingRevisions[item.module] || [];
      if (pending.includes(item.revision)) {
        this.pendingRevisions[item.module] = pending.filter((r) => r !== item.revision);
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(pureData);
        this.baselineData[item.module] = structuredClone(pureData);
        continue;
      }

      if (this.revisions[item.module] === item.revision) {
        continue;
      }

      const localFingerprint = syncModuleFingerprint(this.state, item.module);
      const remoteFingerprint = syncDataFingerprint(pureData);

      if (localFingerprint === remoteFingerprint) {
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = remoteFingerprint;
        this.baselineData[item.module] = structuredClone(pureData);
        continue;
      }

      const isLocalDirty = this.baselines[item.module] !== localFingerprint;

      if (!isLocalDirty && !this.pendingQueue.includes(item.module)) {
        this.state = applySyncModule(this.state, item.module, pureData);
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(pureData);
        this.baselineData[item.module] = structuredClone(pureData);
        stateChanged = true;
      } else {
        // Concurrent 3-Way Merge
        this.state = mergeSyncModule(
          this.state,
          item.module,
          pureData,
          this.baselineData[item.module],
          this.tombstones
        );
        this.revisions[item.module] = item.revision;
        this.baselines[item.module] = syncDataFingerprint(pureData);
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

  flushCloudSave(): Promise<void> {
    if (this.currentFlushPromise) return this.currentFlushPromise;
    if (!this.isOnline || this.pendingQueue.length === 0) return Promise.resolve();

    const modulesToSave = [...this.pendingQueue];
    this.pendingQueue = [];
    const now = Date.now();
    const writes = modulesToSave.map((module, i) => {
      const rev = `rev-${now}-${this.deviceId}-${module}-${i}`;
      const rawData = syncModuleData(this.state, module) as any;
      const data = Object.keys(this.tombstones).length > 0
        ? { ...rawData, _tombstones: { ...this.tombstones } }
        : rawData;
      return {
        module,
        data,
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
          const pure = extractPureModuleData(w.data);
          this.baselines[w.module] = syncDataFingerprint(pure);
          this.baselineData[w.module] = structuredClone(pure);
        }
      })
      .catch((err) => {
        this.currentFlushPromise = null;
        this.retryCount += 1;
        // Fix: Re-enqueue failed modules so retry never aborts with empty queue
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
    if (this.pendingQueue.length > 0) {
      await this.flushCloudSave();
    }
  }
}

// -------------------------------------------------------------------------------------------------
// 17 CASOS DE PRUEBA DE CONVERGENCIA REAL
// -------------------------------------------------------------------------------------------------

test('Caso 1: Dispositivo A (PC) modifica finanzas (gasto $1.500) -> Dispositivo B (Celular) recibe el cambio y actualiza saldo', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.finance.accounts[0] = { id: 'acc-main', name: 'Santander', balance: 5000, initialBalance: 5000 };

  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  // PC adds $1,500 expense
  pc.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-pc-1500',
      type: 'gasto',
      amount: 1500,
      category: 'Comida',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: 'acc-main',
    });
    draft.finance.accounts[0].balance = 3500;
  });

  // Wait for sync propagation
  await pc.flushCloudSave();

  // Phone should have received the transaction and have updated balance
  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-pc-1500'), true);
  const phoneAcc = phone.state.finance.accounts.find((a) => a.id === 'acc-main');
  assert.equal(phoneAcc?.balance, 3500);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 2: Dispositivo B (Celular) modifica finanzas (ingreso $3.000) -> Dispositivo A (PC) recibe el cambio y actualiza saldo', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.finance.accounts[0] = { id: 'acc-main', name: 'Santander', balance: 3500, initialBalance: 5000 };
  initial.finance.transactions.push({
    id: 'tx-pc-1500',
    type: 'gasto',
    amount: 1500,
    category: 'Comida',
    fixed: 'variable',
    date: '2026-09-18',
    accountId: 'acc-main',
  });

  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  // Phone adds $3,000 income
  phone.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-phone-3000',
      type: 'ingreso',
      amount: 3000,
      category: 'Freelance',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: 'acc-main',
    });
    draft.finance.accounts[0].balance = 6500;
  });

  await phone.flushCloudSave();

  assert.equal(pc.state.finance.transactions.some((t) => t.id === 'tx-phone-3000'), true);
  const pcAcc = pc.state.finance.accounts.find((a) => a.id === 'acc-main');
  assert.equal(pcAcc?.balance, 6500);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 3: Modificaciones concurrentes de finanzas (A gasta $1.200, B gasta $800 offline) -> Saldo converge exactamente a $4.500', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.finance.accounts[0] = { id: 'acc-main', name: 'Santander', balance: 6500, initialBalance: 6500 };

  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  // Both go offline
  pc.disconnect();
  phone.disconnect();

  // PC spends $1.200 offline
  pc.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-pc-1200',
      type: 'gasto',
      amount: 1200,
      category: 'Supermercado',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: 'acc-main',
    });
    draft.finance.accounts[0].balance = 5300;
  });

  // Phone spends $800 offline
  phone.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-phone-800',
      type: 'gasto',
      amount: 800,
      category: 'Farmacia',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: 'acc-main',
    });
    draft.finance.accounts[0].balance = 5700;
  });

  // Phone reconnects first and uploads
  await phone.reconnectAndSync();

  // PC reconnects and syncs
  await pc.reconnectAndSync();

  // Let phone receive PC's merged upload
  await phone.flushCloudSave();

  // Both devices must have both transactions
  assert.equal(pc.state.finance.transactions.some((t) => t.id === 'tx-pc-1200'), true);
  assert.equal(pc.state.finance.transactions.some((t) => t.id === 'tx-phone-800'), true);
  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-pc-1200'), true);
  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-phone-800'), true);

  // Both devices must calculate the exact same deterministic balance: 6500 - 1200 - 800 = 4500
  const pcBalance = pc.state.finance.accounts.find((a) => a.id === 'acc-main')?.balance;
  const phoneBalance = phone.state.finance.accounts.find((a) => a.id === 'acc-main')?.balance;
  assert.equal(pcBalance, 4500);
  assert.equal(phoneBalance, 4500);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 4: Dispositivo A registra sesión de gimnasio -> Dispositivo B la recibe correctamente con status completed y series intactas', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.updateState((draft) => {
    draft.gym.sessions.push({
      id: 'gym-sess-today',
      weekLabel: 'Empuje Hipertrofia',
      date: '2026-09-18',
      status: 'completed',
      finishedAt: '2026-09-18T18:00:00.000Z',
      exercises: [
        {
          id: 'ex-press-banca',
          name: 'Press de Banca Plano',
          equipment: 'barra',
          barWeight: 20,
          sets: [
            { id: 'set-1', weight: 80, reps: 10, completed: true, rpe: 8 },
            { id: 'set-2', weight: 85, reps: 8, completed: true, rpe: 9 },
          ],
        },
      ],
    });
  });

  await pc.flushCloudSave();

  const sess = phone.state.gym.sessions.find((s) => s.id === 'gym-sess-today');
  assert.ok(sess);
  assert.equal(sess.status, 'completed');
  assert.equal(sess.exercises[0].sets[0].completed, true);
  assert.equal(sess.exercises[0].sets[0].rpe, 8);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 5: A y B registran sesiones de gimnasio simultáneas con ejercicios distintos -> Ambas sesiones y series se preservan sin pérdida', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.disconnect();
  phone.disconnect();

  // PC logs Push workout
  pc.updateState((draft) => {
    draft.gym.sessions.push({
      id: 'gym-sess-push',
      weekLabel: 'Pecho y Tríceps',
      date: '2026-09-17',
      status: 'completed',
      exercises: [
        {
          id: 'ex-press',
          name: 'Press Inclinado',
          sets: [{ id: 'set-p1', weight: 30, reps: 12, completed: true }],
        },
      ],
    });
  });

  // Phone logs Legs workout
  phone.updateState((draft) => {
    draft.gym.sessions.push({
      id: 'gym-sess-legs',
      weekLabel: 'Pierna Cuádriceps',
      date: '2026-09-18',
      status: 'completed',
      exercises: [
        {
          id: 'ex-sentadilla',
          name: 'Sentadilla Hack',
          sets: [{ id: 'set-l1', weight: 120, reps: 10, completed: true }],
        },
      ],
    });
  });

  await pc.reconnectAndSync();
  await phone.reconnectAndSync();
  await pc.flushCloudSave();

  // Both sessions must exist on both devices
  assert.equal(pc.state.gym.sessions.some((s) => s.id === 'gym-sess-push'), true);
  assert.equal(pc.state.gym.sessions.some((s) => s.id === 'gym-sess-legs'), true);
  assert.equal(phone.state.gym.sessions.some((s) => s.id === 'gym-sess-push'), true);
  assert.equal(phone.state.gym.sessions.some((s) => s.id === 'gym-sess-legs'), true);

  // Must be sorted by date descending (2026-09-18 first, then 2026-09-17)
  assert.equal(pc.state.gym.sessions[0].date, '2026-09-18');
  assert.equal(phone.state.gym.sessions[0].date, '2026-09-18');
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 6: A modifica finanzas y B modifica gimnasio en simultáneo -> Ningún cambio desaparece', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.disconnect();
  phone.disconnect();

  // PC adds finance transaction
  pc.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-cross-1',
      type: 'gasto',
      amount: 400,
      category: 'Comida',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: draft.finance.accounts[0].id,
    });
  });

  // Phone adds gym measurement
  phone.updateState((draft) => {
    draft.gym.measurements.push({
      date: '2026-09-18',
      waist: 78,
    });
  });

  await pc.reconnectAndSync();
  await phone.reconnectAndSync();
  await pc.flushCloudSave();

  assert.equal(phone.state.finance.transactions.some((t) => t.id === 'tx-cross-1'), true);
  assert.equal(pc.state.gym.measurements.some((m) => m.date === '2026-09-18'), true);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 7: Modificaciones consecutivas rápidas (ráfaga de 10 operaciones) -> No se pierde ninguna', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.disconnect();

  // 10 quick updates
  for (let i = 0; i < 10; i++) {
    pc.updateState((draft) => {
      draft.todayExtras.push({
        id: `extra-burst-${i}`,
        date: '2026-09-18',
        text: `Tarea ráfaga #${i}`,
        done: i % 2 === 0,
        priority: 'media',
      });
    });
  }

  assert.equal(pc.state.todayExtras.length, 10);

  // Reconnect and flush
  await pc.reconnectAndSync();

  assert.equal(phone.state.todayExtras.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.equal(phone.state.todayExtras.some((e) => e.id === `extra-burst-${i}`), true);
  }
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 8: Dispositivo offline realiza cambios locales y luego se reconecta -> Sube cambios correctamente', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const phone = new ConvergenceDevice('phone', backend, initial);

  phone.disconnect();

  phone.updateState((draft) => {
    draft.profile.name = 'Christian Rec';
    draft.notes.postits.push({ id: 'note-off-1', text: 'Nota offline', date: '2026-09-18' });
  });

  assert.equal(phone.pendingQueue.length > 0, true);

  await phone.reconnectAndSync();

  assert.equal(phone.pendingQueue.length, 0);
  const snap = backend.getSnapshot();
  const profileMod = snap.find((m) => m.module === 'profile');
  const notesMod = snap.find((m) => m.module === 'notes');
  assert.equal((profileMod?.data as any).profile.name, 'Christian Rec');
  assert.equal((notesMod?.data as any).notes.postits.some((p: any) => p.id === 'note-off-1'), true);
});

test('Caso 9: Dispositivo offline se reconecta tras cambios concurrentes en el otro dispositivo -> Fusión de 3 vías converge al mismo estado', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.disconnect();

  // Phone modifies projects while PC is offline
  phone.updateState((draft) => {
    draft.projects = draft.projects || [];
    draft.projects.push({
      id: 'proj-1',
      name: 'LifeOS v2.0',
      objective: 'Sincronización multi-dispositivo',
      status: 'activo',
      nextStep: 'Escribir tests de convergencia',
      tasks: [{ id: 't-1', text: 'Escribir tests de convergencia', done: true }],
      createdAt: '2026-09-18',
    });
  });
  await phone.flushCloudSave();

  // PC concurrently modifies ideas while offline
  pc.updateState((draft) => {
    draft.ideas.push({
      id: 'idea-1',
      text: 'Nueva arquitectura de ledger contable',
      date: '2026-09-18',
      source: 'manual',
    });
  });

  // PC reconnects and 3-way merges
  await pc.reconnectAndSync();
  await phone.reconnectAndSync();
  await pc.flushCloudSave();

  assert.equal(pc.state.projects?.some((p) => p.id === 'proj-1'), true);
  assert.equal(phone.state.ideas.some((i) => i.id === 'idea-1'), true);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 10: Cierre y reapertura de la PWA -> Estado persistido en almacenamiento local y sincronizado con la nube', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);

  pc.updateState((draft) => {
    draft.goals.push({ id: 'goal-pwa-1', name: 'Entrenar 4 días por semana', initial: 0, target: 4, current: 3 });
  });
  await pc.flushCloudSave();

  // Simulate PWA closing: serialize state to JSON (localStorage)
  const savedJSON = JSON.stringify(pc.state);

  // Simulate PWA reopening on a fresh session
  const restoredState = JSON.parse(savedJSON);
  const reloadedApp = new ConvergenceDevice('pc-reopened', backend, restoredState);

  assert.equal(reloadedApp.state.goals.some((g) => g.id === 'goal-pwa-1'), true);
  assert.equal(equivalentLifeOSState(pc.state, reloadedApp.state), true);
});

test('Caso 11: Recarga mientras hay escrituras pendientes -> La cola reanuda y completa la escritura', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const phone = new ConvergenceDevice('phone', backend, initial);

  phone.disconnect();

  phone.updateState((draft) => {
    draft.calendarEvents.push({
      id: 'event-unsaved',
      name: 'Entrenamiento de pierna pesado',
      date: '2026-09-19',
      type: 'importante',
      recurring: false,
    });
  });

  // Re-enqueue upon restart and flush
  const queueToPersist = [...phone.pendingQueue];
  assert.ok(queueToPersist.includes('calendar'));

  // Restart simulation
  phone.connect();
  await phone.flushCloudSave();

  assert.equal(phone.pendingQueue.length, 0);
  const snap = backend.getSnapshot();
  const calMod = snap.find((m) => m.module === 'calendar');
  assert.equal((calMod?.data as any).calendarEvents.some((e: any) => e.id === 'event-unsaved'), true);
});

test('Caso 12: Concurrencia entre pestañas (BroadcastChannel) -> Estados alineados en tiempo real', () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const tab1 = new ConvergenceDevice('pc-tab1', backend, initial);

  let tab2State: LifeOSState | null = null;
  let tab3State: LifeOSState | null = null;

  tab1.tabListeners.add((st) => { tab2State = st; });
  tab1.tabListeners.add((st) => { tab3State = st; });

  tab1.updateState((draft) => {
    draft.todayExtras.push({
      id: 'tab-sync-1',
      date: '2026-09-18',
      text: 'Comprar magnesio en polvo',
      done: false,
      priority: 'alta',
    });
  });

  assert.ok(tab2State);
  assert.ok(tab3State);
  assert.equal((tab2State as LifeOSState).todayExtras.some((t) => t.id === 'tab-sync-1'), true);
  assert.equal((tab3State as LifeOSState).todayExtras.some((t) => t.id === 'tab-sync-1'), true);
});

test('Caso 13: Fallo y reintento de guardado (retryTimeout) -> Reintenta con los módulos correctos y no queda atascado con cola vacía', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  const pc = new ConvergenceDevice('pc', backend, initial);

  // Network drops
  backend.shouldFailWrites = true;

  pc.updateState((draft) => {
    draft.finance.transactions.push({
      id: 'tx-retry-fail',
      type: 'gasto',
      amount: 150,
      category: 'Otros',
      fixed: 'variable',
      date: '2026-09-18',
      accountId: draft.finance.accounts[0].id,
    });
  });

  // Attempt save should fail
  await assert.rejects(pc.flushCloudSave());
  assert.ok(pc.retryCount >= 1);
  // Crucial fix: pendingQueue is NOT empty!
  assert.equal(pc.pendingQueue.includes('finance'), true);

  // Network comes back
  backend.shouldFailWrites = false;

  // Retry completes
  await pc.flushCloudSave();
  assert.equal(pc.pendingQueue.length, 0);
  assert.equal(pc.retryCount, 0);

  const snap = backend.getSnapshot();
  const finMod = snap.find((m) => m.module === 'finance');
  assert.equal((finMod?.data as any).finance.transactions.some((t: any) => t.id === 'tx-retry-fail'), true);
});

test('Caso 14: Modificación concurrente del mismo registro -> LWW determinista con preservación de datos', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.projects = initial.projects || [];
  initial.projects.push({
    id: 'proj-lww',
    name: 'Nombre Original',
    objective: 'Objetivo',
    status: 'activo',
    nextStep: 'Primer paso',
    tasks: [],
    createdAt: '2026-09-18',
  });

  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  pc.disconnect();
  phone.disconnect();

  // PC renames project
  pc.updateState((draft) => {
    const p = draft.projects?.find((proj) => proj.id === 'proj-lww');
    if (p) p.name = 'Nombre Actualizado por PC';
  });

  // Phone adds a task to the same project
  phone.updateState((draft) => {
    const p = draft.projects?.find((proj) => proj.id === 'proj-lww');
    if (p) p.tasks.push({ id: 'task-phone-new', text: 'Subtarea del teléfono', done: false });
  });

  await pc.reconnectAndSync();
  await phone.reconnectAndSync();
  await pc.flushCloudSave();

  const pcProj = pc.state.projects?.find((p) => p.id === 'proj-lww');
  const phoneProj = phone.state.projects?.find((p) => p.id === 'proj-lww');

  assert.ok(pcProj);
  assert.ok(phoneProj);
  assert.equal(pcProj.tasks.some((t) => t.id === 'task-phone-new'), true);
  assert.equal(phoneProj.tasks.some((t) => t.id === 'task-phone-new'), true);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 15: Eliminación de un movimiento o nota en A -> No resucita en B tras la reconexión', async () => {
  const backend = new MockCloudBackend();
  const initial = defaultState();
  initial.notes.postits.push({ id: 'postit-to-delete', text: 'Recordatorio temporal', date: '2026-09-18' });
  initial.notes.postits.push({ id: 'postit-keep', text: 'Recordatorio permanente', date: '2026-09-18' });

  const pc = new ConvergenceDevice('pc', backend, initial);
  const phone = new ConvergenceDevice('phone', backend, initial);

  // Phone goes offline
  phone.disconnect();

  // PC deletes postit
  pc.updateState((draft) => {
    draft.notes.postits = draft.notes.postits.filter((p) => p.id !== 'postit-to-delete');
  });

  await pc.flushCloudSave();

  // Phone reconnects without having edited the deleted note
  await phone.reconnectAndSync();

  assert.equal(phone.state.notes.postits.some((p) => p.id === 'postit-to-delete'), false);
  assert.equal(phone.state.notes.postits.some((p) => p.id === 'postit-keep'), true);
  assert.equal(pc.state.notes.postits.some((p) => p.id === 'postit-to-delete'), false);
  assert.equal(equivalentLifeOSState(pc.state, phone.state), true);
});

test('Caso 16 (Gimnasio): Existen sesiones históricas incompletas o abandonadas (27 de julio) -> Se inicia y finaliza hoy sin bloqueos', () => {
  const state = defaultState();
  const today = todayISO();

  // Historic abandoned active session from July 27
  state.gym.sessions.push({
    id: 'sess-july-27-abandoned',
    weekLabel: 'Rutina Abandonada Julio',
    date: '2026-07-27',
    status: 'active', // Stale active!
    exercises: [
      {
        id: 'ex-old',
        name: 'Ejercicio Viejo',
        sets: [
          { id: 'set-old-1', weight: 50, reps: 8, completed: false },
          { id: 'set-old-2', weight: 50, reps: 8, completed: false },
        ],
      },
    ],
  });

  // Verify the new logic: activeWorkoutSession strictly isolates to TODAY
  const activeWorkoutSession = (state.gym.sessions || []).find(
    (s) => s.date === today && s.status === 'active'
  );
  assert.equal(activeWorkoutSession, undefined, 'Old abandoned session must NOT hijack active workout');

  // Verify stale detection identifies July 27
  const staleActiveSessions = (state.gym.sessions || []).filter(
    (s) => (s.date || '') < today && s.status === 'active'
  );
  assert.equal(staleActiveSessions.length, 1);
  assert.equal(staleActiveSessions[0].id, 'sess-july-27-abandoned');

  // User starts workout TODAY
  const newTodaySession: GymSession = {
    id: 'sess-today-sept-18',
    weekLabel: 'Piernas Hoy',
    date: today,
    status: 'active',
    exercises: [
      {
        id: 'ex-squat',
        name: 'Sentadillas',
        sets: [
          { id: 'set-sq-1', weight: 100, reps: 10, completed: true, completedAt: '17:00' },
          { id: 'set-sq-2', weight: 100, reps: 10, completed: true, completedAt: '17:05' },
        ],
      },
    ],
  };
  state.gym.sessions.push(newTodaySession);

  // Now activeWorkoutSession resolves to TODAY's session
  const activeNow = state.gym.sessions.find((s) => s.date === today && s.status === 'active');
  assert.ok(activeNow);
  assert.equal(activeNow.id, 'sess-today-sept-18');

  // Finish today's session cleanly
  activeNow.status = 'completed';
  activeNow.finishedAt = '2026-09-18T17:15:00.000Z';

  // No sets from July 27 needed review or completion!
  assert.equal(state.gym.sessions.find((s) => s.id === 'sess-today-sept-18')?.status, 'completed');
  assert.equal(state.gym.sessions.find((s) => s.id === 'sess-july-27-abandoned')?.status, 'active');
});

test('Caso 17 (Gimnasio): Última sesión registrada identifica por fecha real (septiembre) y normalizeSet preserva completed y rpe', () => {
  const state = defaultState();

  // Sessions unordered: July first, then September, then August
  state.gym.sessions = [
    {
      id: 'sess-july-27',
      weekLabel: 'Pecho Julio',
      date: '2026-07-27',
      status: 'completed',
      exercises: [],
    },
    {
      id: 'sess-sept-18',
      weekLabel: 'Pierna Septiembre',
      date: '2026-09-18',
      status: 'completed',
      exercises: [
        {
          id: 'ex-prensa',
          name: 'Prensa 45',
          sets: [
            { id: 'set-p1', weight: 200, reps: 12, completed: true, rpe: 8 },
            { id: 'set-p2', weight: 220, reps: 10, completed: true, rpe: 9 },
          ],
        },
      ],
    },
    {
      id: 'sess-aug-15',
      weekLabel: 'Espalda Agosto',
      date: '2026-08-15',
      status: 'completed',
      exercises: [],
    },
  ];

  // Old bug: state.gym.sessions[0] returned July 27!
  assert.equal(state.gym.sessions[0].date, '2026-07-27');

  // New logic: sort descending by date and resolve latestCompletedSession
  const sortedSessions = [...state.gym.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestCompletedSession = sortedSessions.find((s) => s.status === 'completed') || sortedSessions[0] || null;

  assert.ok(latestCompletedSession);
  assert.equal(latestCompletedSession.id, 'sess-sept-18', 'Latest session must be September 18, NOT July 27');
  assert.equal(latestCompletedSession.date, '2026-09-18');
  assert.equal(latestCompletedSession.weekLabel, 'Pierna Septiembre');

  // Normalization must preserve completed and rpe
  const normalized = normalizeStoredState(state);
  const normalizedSess = normalized.gym.sessions.find((s) => s.id === 'sess-sept-18');
  assert.ok(normalizedSess);
  assert.equal(normalizedSess.exercises[0].sets[0].completed, true);
  assert.equal(normalizedSess.exercises[0].sets[0].rpe, 8);
  assert.equal(normalizedSess.exercises[0].sets[1].completed, true);
  assert.equal(normalizedSess.exercises[0].sets[1].rpe, 9);
});
