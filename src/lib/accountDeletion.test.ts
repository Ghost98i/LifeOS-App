import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase/app';
import { disableNetwork, getFirestore } from 'firebase/firestore';
import {
  clearCloudAccountLocalState,
  CloudSyncSuspendedError,
  deleteCloudAccountData,
  getLastCloudUserId,
  isCloudSyncSuspended,
  persistGymHistoryChunks,
  resumeCloudSync,
  setChunkWriterForTesting,
  setFirestoreDbForTesting,
  setTransactionRunnerForTesting,
  suspendCloudSync,
  writeCloudModulesGuarded,
  type CloudAccountCollection,
} from './cloudSync';
import {
  preserveLocalStateAfterCloudDeletion,
  wipeLocalStateAfterDeletion,
} from './accountDeletion';
import {
  CURRENT_CRYPTO_VERSION,
  CURRENT_KEY_FORMAT_VERSION,
  CRYPTO_ALGORITHM,
  loadWrappedKeyEnvelope,
  saveWrappedKeyEnvelope,
  type WrappedKeyEnvelope,
} from './cryptoCore';
import {
  defaultState,
  getRecoveryKey,
  getStorageKey,
  loadStoredState,
  saveRecoveryState,
  saveStoredState,
} from './storage';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function makeTestEnvelope(userId: string): WrappedKeyEnvelope {
  return {
    keyFormatVersion: CURRENT_KEY_FORMAT_VERSION,
    cryptoVersion: CURRENT_CRYPTO_VERSION,
    algorithm: CRYPTO_ALGORITHM,
    wrappedMdek: { iv: 'aXYtMTItYnl0ZXM=', ciphertext: 'Y2lwaGVydGV4dA==' },
    kdf: { algorithm: 'HKDF-SHA-256', salt: 'c2FsdC0xNi1ieXRlcw==', info: 'test-info' },
    aad: `keyFormatVersion:1|userId:${userId}`,
    createdAt: '2026-11-19T12:00:00.000Z',
  };
}

test('suspendCloudSync: toggles state and aborts persistGymHistoryChunks before writing', async () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  const written: string[] = [];
  setChunkWriterForTesting(async (docId) => {
    written.push(docId);
  });

  try {
    resumeCloudSync();
    assert.equal(isCloudSyncSuspended(), false);

    suspendCloudSync();
    assert.equal(isCloudSyncSuspended(), true);

    await persistGymHistoryChunks(
      'user-suspend-1',
      [[{ id: 's1', date: '2026-11-18' }], [{ id: 's2', date: '2026-11-17' }]],
      {} as never,
      null,
      'dev-1',
      Date.now(),
    );

    assert.deepEqual(written, []);
    assert.equal(localStorage.getItem('lifeos_gym_chunk_hash_user-suspend-1_0'), null);
  } finally {
    resumeCloudSync();
    setChunkWriterForTesting(null);
    globalThis.localStorage = prevStorage;
  }
});

test('suspendCloudSync: aborts in-flight writeCloudModulesGuarded transaction before transaction.set()', async () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  const setCalls: string[] = [];

  const app = initializeApp({ projectId: 'demo-lifeos', apiKey: 'test-key', appId: '1:1:web:test' }, `test-suspend-${Date.now()}`);
  const testDb = getFirestore(app);
  await disableNetwork(testDb);
  setFirestoreDbForTesting(testDb);
  setTransactionRunnerForTesting(async (_db, updateFn) => {
    const fakeTx = {
      get: async () => {
        // Simulate deletion starting while transaction.get() is in flight
        suspendCloudSync();
        return { exists: () => false, data: () => undefined };
      },
      set: (ref: unknown) => {
        setCalls.push(String(ref));
      },
    };
    return updateFn(fakeTx);
  });

  try {
    resumeCloudSync();
    const state = defaultState();
    state.profile.name = 'In-Flight Write';

    const result = await writeCloudModulesGuarded(
      'user-inflight',
      state,
      ['profile'],
      'dev-1',
      {},
    );

    await assert.rejects(result.completion, (err: unknown) => err instanceof CloudSyncSuspendedError);
    assert.deepEqual(setCalls, []);
  } finally {
    resumeCloudSync();
    setTransactionRunnerForTesting(null);
    setFirestoreDbForTesting(null);
    await deleteApp(app);
    globalThis.localStorage = prevStorage;
  }
});

test('clearCloudAccountLocalState: removes all scoped sync, tombstone, rotation, resale, placement and gym chunk hash keys', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();

  try {
    const uid = 'alice/special+id';
    const encodedUid = encodeURIComponent(uid);
    const otherUid = 'bob-user';

    const targetKeys = [
      `lifeos-cloud-revisions-v2:${uid}`,
      `lifeos-cloud-baselines-v2:${uid}`,
      `lifeos-cloud-baselinedata-v2:${uid}`,
      `lifeos-sync-snapshot-local:${uid}`,
      `lifeos-sync-snapshot-remote:${uid}`,
      `lifeos-sync-snapshot-base:${uid}`,
      `lifeos-cloud-paired-user-v2:${uid}`,
      `lifeos-cloud-tombstones-v2:${uid}`,
      `lifeos-rotation-pending-v1:${uid}`,
      `lifeos-resale-conflict-v1:${uid}`,
      `celestea-note-placements-v1:${encodedUid}`,
      `lifeos_gym_chunk_hash_${uid}_0`,
      `lifeos_gym_chunk_hash_${uid}_1`,
      `lifeos_gym_weight_chunk_hash_${uid}_0`,
      `lifeos_gym_measurements_chunk_hash_${uid}_0`,
      'lifeos-cloud-last-user-v2',
    ];
    for (const key of targetKeys) {
      localStorage.setItem(key, 'value');
    }

    // Other user's keys must survive
    localStorage.setItem(`lifeos-cloud-tombstones-v2:${otherUid}`, 'keep');
    localStorage.setItem(`lifeos_gym_chunk_hash_${otherUid}_0`, 'keep');

    clearCloudAccountLocalState(uid);

    for (const key of targetKeys) {
      assert.equal(localStorage.getItem(key), null, `Expected ${key} to be removed`);
    }
    assert.equal(localStorage.getItem(`lifeos-cloud-tombstones-v2:${otherUid}`), 'keep');
    assert.equal(localStorage.getItem(`lifeos_gym_chunk_hash_${otherUid}_0`), 'keep');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('deleteCloudAccountData: creates marker first, deletes legacy state, batches by 400, runs second verification pass, and deletes marker last', async () => {
  const events: string[] = [];
  const batchSizes: Array<{ collection: CloudAccountCollection; size: number }> = [];
  let legacyExists = true;
  let markerExists = false;
  let passCount = 0;

  const collections: Record<CloudAccountCollection, Set<string>> = {
    lifeosModules: new Set(['profile', 'finance', 'gym']),
    lifeosRevisions: new Set(Array.from({ length: 405 }, (_, i) => `rev-${i}`)),
    lifeosAccount: new Set(['capability', 'keyEnvelope']),
  };

  const result = await deleteCloudAccountData('alice', undefined, {
    createMarker: async (_uid, payload) => {
      assert.ok(payload.requestedAt.length > 0);
      markerExists = true;
      collections.lifeosAccount.add('deletion');
      events.push('create-marker');
    },
    deleteMarker: async () => {
      assert.equal(markerExists, true);
      markerExists = false;
      collections.lifeosAccount.delete('deletion');
      events.push('delete-marker');
    },
    hasLegacyState: async () => {
      passCount += 1;
      events.push(`check-legacy-pass-${passCount}`);
      return legacyExists;
    },
    deleteLegacyState: async () => {
      assert.equal(markerExists, true, 'Marker must exist when deleting legacy state');
      legacyExists = false;
      events.push('delete-legacy');
    },
    listCollectionDocIds: async (_uid, name) => {
      // Simulate a straggler arriving right before pass 2 checks lifeosModules
      if (passCount === 2 && name === 'lifeosModules' && !collections.lifeosModules.has('straggler')) {
        collections.lifeosModules.add('straggler');
      }
      return Array.from(collections[name]);
    },
    deleteCollectionBatch: async (_uid, name, docIds) => {
      assert.equal(markerExists, true, 'Marker must remain active during batch deletes');
      assert.ok(docIds.length <= 400, 'Batch size must not exceed 400');
      assert.ok(!docIds.includes('deletion'), 'Deletion marker must never be deleted inside collection batches');
      batchSizes.push({ collection: name, size: docIds.length });
      for (const id of docIds) {
        collections[name].delete(id);
      }
    },
  });

  assert.equal(events[0], 'create-marker');
  assert.equal(events[events.length - 1], 'delete-marker');
  assert.equal(events.includes('check-legacy-pass-1'), true);
  assert.equal(events.includes('check-legacy-pass-2'), true);
  assert.equal(result.legacyStateDeleted, true);
  assert.equal(result.collections.lifeosModules, 4); // 3 initial + 1 straggler on pass 2
  assert.equal(result.collections.lifeosRevisions, 405);
  assert.equal(result.collections.lifeosAccount, 2); // capability + keyEnvelope (deletion excluded)
  assert.equal(result.deleted, 1 + 4 + 405 + 2);

  const revisionBatches = batchSizes.filter((b) => b.collection === 'lifeosRevisions').map((b) => b.size);
  assert.deepEqual(revisionBatches, [400, 5]);
  assert.equal(markerExists, false);
  assert.equal(collections.lifeosModules.size, 0);
  assert.equal(collections.lifeosRevisions.size, 0);
  assert.equal(collections.lifeosAccount.size, 0);
});

test('preserveLocalStateAfterCloudDeletion: keeps single unscoped copy, cleans scoped keys/trust, and prevents resurrection via __deleted__:uid', async () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  const forgottenUsers: string[] = [];

  try {
    const uid = 'alice-123';
    const state = defaultState();
    state.profile.name = 'Alice Local Copy';
    saveStoredState(state, uid);
    saveRecoveryState(state, uid, 'manual_snapshot', 'Before delete');
    saveWrappedKeyEnvelope(makeTestEnvelope(uid), uid);
    localStorage.setItem(`lifeos-cloud-tombstones-v2:${uid}`, JSON.stringify({ tx1: 123 }));
    localStorage.setItem(`lifeos-rotation-pending-v1:${uid}`, 'pending');
    localStorage.setItem(`lifeos-resale-conflict-v1:${uid}`, 'conflict');
    localStorage.setItem(`celestea-note-placements-v1:${encodeURIComponent(uid)}`, '[]');
    localStorage.setItem(`lifeos_gym_chunk_hash_${uid}_0`, 'abc');

    const { preservedLocally } = await preserveLocalStateAfterCloudDeletion(uid, state, {
      forgetDeviceTrustFn: async (id) => {
        forgottenUsers.push(id);
      },
    });

    assert.equal(preservedLocally, true);
    assert.deepEqual(forgottenUsers, [uid]);

    // Unscoped copy exists with user's data
    const unscoped = loadStoredState(null);
    assert.equal(unscoped.backend, 'localStorage');
    assert.equal(unscoped.state.profile.name, 'Alice Local Copy');

    // Every scoped key is gone
    assert.equal(localStorage.getItem(getStorageKey(uid)), null);
    assert.equal(localStorage.getItem(getRecoveryKey(uid)), null);
    assert.equal(loadWrappedKeyEnvelope(uid), null);
    assert.equal(localStorage.getItem(`lifeos-cloud-tombstones-v2:${uid}`), null);
    assert.equal(localStorage.getItem(`lifeos-rotation-pending-v1:${uid}`), null);
    assert.equal(localStorage.getItem(`lifeos-resale-conflict-v1:${uid}`), null);
    assert.equal(localStorage.getItem(`celestea-note-placements-v1:${encodeURIComponent(uid)}`), null);
    assert.equal(localStorage.getItem(`lifeos_gym_chunk_hash_${uid}_0`), null);

    // LAST_USER_KEY is marked as __deleted__:${uid}
    const lastUserId: string | null = getLastCloudUserId();
    assert.equal(lastUserId, `__deleted__:${uid}`);

    // Simulate future re-login decision in App.tsx:
    // scoped.backend === 'ninguno' AND !(!lastUserId || lastUserId === uid) => boots clean!
    const scopedOnRelogin = loadStoredState(uid);
    assert.equal(scopedOnRelogin.backend, 'ninguno');
    const reloginLastUser: string | null = getLastCloudUserId();
    const wouldCopyUnscopedIntoRelogin = !reloginLastUser || reloginLastUser === uid;
    assert.equal(wouldCopyUnscopedIntoRelogin, false);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('wipeLocalStateAfterDeletion: wipes scoped keys even after sign-out when given remembered uid, and resets unscoped state', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  const forgottenUsers: string[] = [];

  try {
    const uid = 'alice-wipe';
    const state = defaultState();
    state.profile.name = 'Should Be Wiped';
    saveStoredState(state, uid);
    saveStoredState(state, null);
    saveRecoveryState(state, uid, 'manual_snapshot', 'Scoped recovery');
    saveRecoveryState(state, null, 'manual_snapshot', 'Unscoped recovery');
    saveWrappedKeyEnvelope(makeTestEnvelope(uid), uid);
    saveWrappedKeyEnvelope(makeTestEnvelope('local'), null);
    localStorage.setItem(`lifeos-cloud-tombstones-v2:${uid}`, '{"a":1}');
    localStorage.setItem(`lifeos-rotation-pending-v1:${uid}`, 'pending');
    localStorage.setItem(`lifeos-resale-conflict-v1:${uid}`, 'conflict');
    localStorage.setItem(`celestea-note-placements-v1:${encodeURIComponent(uid)}`, '[]');
    localStorage.setItem('celestea-note-placements-v1:local-guest', '[]');
    localStorage.setItem(`lifeos_gym_chunk_hash_${uid}_0`, 'hash0');

    const fresh = wipeLocalStateAfterDeletion(uid, {
      forgetDeviceTrustFn: async (id) => {
        forgottenUsers.push(id);
      },
    });

    assert.equal(fresh.profile.name, '');
    assert.deepEqual(forgottenUsers, [uid]);
    assert.equal(localStorage.getItem(getStorageKey(uid)), null);
    assert.equal(localStorage.getItem(getRecoveryKey(uid)), null);
    assert.equal(localStorage.getItem(getRecoveryKey(null)), null);
    assert.equal(loadWrappedKeyEnvelope(uid), null);
    assert.equal(loadWrappedKeyEnvelope(null), null);
    assert.equal(localStorage.getItem(`lifeos-cloud-tombstones-v2:${uid}`), null);
    assert.equal(localStorage.getItem(`lifeos-rotation-pending-v1:${uid}`), null);
    assert.equal(localStorage.getItem(`lifeos-resale-conflict-v1:${uid}`), null);
    assert.equal(localStorage.getItem(`celestea-note-placements-v1:${encodeURIComponent(uid)}`), null);
    assert.equal(localStorage.getItem('celestea-note-placements-v1:local-guest'), null);
    assert.equal(localStorage.getItem(`lifeos_gym_chunk_hash_${uid}_0`), null);
    assert.equal(getLastCloudUserId(), `__deleted__:${uid}`);

    const reloaded = loadStoredState(null);
    assert.equal(reloaded.state.profile.name, '');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});
