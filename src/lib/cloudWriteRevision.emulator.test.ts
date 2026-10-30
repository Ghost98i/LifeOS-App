import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, disableNetwork, enableNetwork, doc, getDocFromServer, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, fetchFreshCloudModules, getFirestoreDb, writeCloudMigrationModule, writeCloudModules, writeCloudModulesAsync, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek, decodeCloudModuleData, provisionZeroKnowledgeKeys } from './cryptoCore';
import { executeE2EEMigration, setCloudKeyEnvelope } from './cryptoMigration';
import { defaultState } from './storage';
import { SYNC_MODULES, syncDataFingerprint, syncModuleData } from './syncModel';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} });

test('E2EE: las revisiones preparadas coinciden con los documentos publicados y descifrables', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    context.skip('Requiere emuladores de Firestore y Auth');
    return;
  }
  const db = getFirestoreDb();
  const app = getApp();
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await signInAnonymously(auth);
    cryptoSession.setUnlocked(await generateMdek(), user.uid);
    const state = defaultState();
    const batch = writeCloudModules(user.uid, state, ['finance', 'tasks'], 'revision-device', {});
    await batch.completion;
    for (const write of batch.writes) {
      const head = (await getDocFromServer(doc(db, 'users', user.uid, 'lifeosModules', write.module))).data()!;
      assert.equal(head.revision, write.revision);
      assert.equal(head.parentRevision, write.parentRevision);
      assert.equal(head.isEncrypted, true);
      assert.ok(write.revision.includes('revision-device'));
      const decoded = await decodeCloudModuleData(head.data, write.module, user.uid, cryptoSession.getKey(user.uid));
      assert.equal(decoded.mode, 'decrypted');
      if (decoded.mode === 'decrypted') assert.deepEqual(decoded.data, syncModuleData(state, write.module));
    }

    // Full production migration path: 15 plaintext modules -> guarded encrypted
    // publication -> second read -> reject a stale migration -> refuse cached reads.
    await signOut(auth);
    const migratedUser = (await signInAnonymously(auth)).user;
    const plain = await writeCloudModulesAsync(migratedUser.uid, state, [...SYNC_MODULES], 'plain-device', {}, {}, null);
    await plain.completion;
    const keys = await provisionZeroKnowledgeKeys(migratedUser.uid);
    await setCloudKeyEnvelope(migratedUser.uid, keys.envelope, db);
    const migration = await executeE2EEMigration(migratedUser.uid, state, keys.sessionMdek, { customDb: db });
    assert.equal(migration.capability.encryptionState, 'encrypted');
    assert.equal(migration.migratedModules.length, 15);
    cryptoSession.setUnlocked(keys.sessionMdek, migratedUser.uid);
    const fresh = await fetchFreshCloudModules(migratedUser.uid);
    assert.equal(Object.keys(fresh.moduleData).length, 15);
    assert.deepEqual(fresh.corruptedModules, []);
    assert.deepEqual(fresh.lockedModules, []);
    for (const module of SYNC_MODULES) {
      assert.equal(syncDataFingerprint(fresh.moduleData[module]), syncDataFingerprint(syncModuleData(state, module)));
      assert.equal((await getDocFromServer(doc(db, 'users', migratedUser.uid, 'lifeosModules', module))).data()?.isEncrypted, true);
    }
    const newer = structuredClone(state);
    newer.profile.name = 'Cambio de otro dispositivo';
    const concurrent = await writeCloudModulesGuarded(migratedUser.uid, newer, ['profile'], 'other-device', fresh.remoteRevisions);
    await concurrent.completion;
    await assert.rejects(async () => {
      const stale = await writeCloudMigrationModule(migratedUser.uid, state, ['profile'], 'stale-device', fresh.remoteRevisions, {}, keys.sessionMdek);
      await stale.completion;
    }, CloudRevisionConflict);
    const afterStale = await fetchFreshCloudModules(migratedUser.uid);
    assert.equal((afterStale.moduleData.profile as { profile: { name: string } }).profile.name, newer.profile.name);

    const malformed = await fetch(`http://127.0.0.1:8080/v1/projects/demo-lifeos/databases/(default)/documents/users/${migratedUser.uid}/lifeosModules/notes?updateMask.fieldPaths=syncProtocolVersion`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { syncProtocolVersion: { integerValue: '99' } } }),
    });
    assert.equal(malformed.ok, true);
    const future = await fetchFreshCloudModules(migratedUser.uid);
    assert.deepEqual(future.corruptedModules, ['notes']);
    assert.equal(future.moduleData.notes, undefined);
    await disableNetwork(db);
    await assert.rejects(fetchFreshCloudModules(migratedUser.uid));
    await enableNetwork(db);
  } finally {
    cryptoSession.lock();
    await terminate(db);
    await deleteApp(app);
  }
});
