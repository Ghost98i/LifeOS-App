import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, serverTimestamp, setDoc, terminate } from 'firebase/firestore';
import { assertReadableCloudModule, CloudProtocolConflict, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';
import { defaultState } from './storage';

// Protocol 4 is ONLY a compatibility experiment in demo emulators. No application writer enables it.
test('propuesta no activada: Rules contienen downgrade de protocolo pero no certifican el contenido cifrado', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { context.skip('Requiere emuladores locales'); return; }
  assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, 'demo-lifeos');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const db = getFirestoreDb(), app = getApp();
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await signInAnonymously(auth); cryptoSession.setUnlocked(await generateMdek(), user.uid);
    const state = defaultState(); state.finance.commitments = [{ id: 'known', name: 'Sintético', currency: 'USD', amount: 20, active: true, frequency: 'once', nextDueDate: '2026-11-05' }];
    const before = JSON.stringify(state);
    const publication = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'policy-proposal', {}, {});
    await publication.completion;
    const reference = doc(db, 'users', user.uid, 'lifeosModules', 'finance');
    const original = (await getDocFromServer(reference)).data()!;
    assert.equal(original.syncProtocolVersion, 2);
    const proposal = { ...original, syncProtocolVersion: 4, parentRevision: original.revision, revision: 'proposal-v4', updatedAt: serverTimestamp() };
    await setDoc(reference, proposal);
    const head = (await getDocFromServer(reference)).data()!;
    assert.throws(() => assertReadableCloudModule('finance', head), CloudProtocolConflict);
    // Same current parent: the actual deployed Rules reject the obsolete protocol independently of revision freshness.
    await assert.rejects(setDoc(reference, { ...head, syncProtocolVersion: 2, parentRevision: head.revision, revision: 'old-client', updatedAt: serverTimestamp() }), error => (error as { code?: string }).code === 'permission-denied');
    // Claiming protocol 4 alone is accepted; Rules cannot attest which binary produced encrypted data.
    await setDoc(reference, { ...head, parentRevision: head.revision, revision: 'claimed-v4', updatedAt: serverTimestamp() });
    const final = (await getDocFromServer(reference)).data()!;
    assert.equal(final.revision, 'claimed-v4'); assert.deepEqual(final.data, original.data);
    await assert.rejects(async () => {
      const queued = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'current-v2', { finance: final.revision }, {});
      await queued.completion;
    }, CloudProtocolConflict);
    assert.equal(JSON.stringify(state), before, 'El rechazo de compatibilidad no consume ni modifica el trabajo local');
  } finally { cryptoSession.lock(); await terminate(db); await deleteApp(app); }
});
