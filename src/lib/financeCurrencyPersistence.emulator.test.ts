import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, fetchFreshCloudModules, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';
import { defaultState } from './storage';
import { applySyncModule, syncModuleData } from './syncModel';
import { reconcileFinancePublication } from './financeSyncReconciliation';
import { detectFinanceSnapshotRegression } from './financeSnapshotIntegrity';

test('monedas en módulos cifrados: dos lecturas, revisiones y conflicto con cliente que pierde currency', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { context.skip('Requiere emuladores locales'); return; }
  assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, 'demo-lifeos');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const db = getFirestoreDb(), app = getApp();
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await signInAnonymously(auth);
    cryptoSession.setUnlocked(await generateMdek(), user.uid);
    const state = defaultState();
    state.finance.accounts = []; state.finance.transactions = [];
    state.finance.commitments = ['UYU', 'USD'].map(currency => ({ id: `com-${currency}`, name: 'Compromiso sintético', currency,
      amount: 20.25, frequency: 'once', nextDueDate: '2026-11-05', active: true, updatedAt: '2026-10-20T12:00:00.000Z' }));
    state.finance.expectedIncomes = ['UYU', 'USD'].map(currency => ({ id: `inc-${currency}`, name: 'Cobro sintético', currency,
      amount: 100.75, frequency: 'once', startDate: '2026-11-02', active: true, updatedAt: '2026-10-20T12:00:00.000Z' }));
    const write = async (candidate: typeof state, revision?: string) => {
      const publication = await writeCloudModulesGuarded(user.uid, candidate, ['finance'], 'currency-emulator', { finance: revision }, {});
      await publication.completion; return publication.writes[0].revision;
    };
    const revision = await write(state);
    for (let i = 0; i < 2; i++) {
      const fresh = await fetchFreshCloudModules(user.uid);
      assert.equal(fresh.remoteRevisions.finance, revision);
      assert.deepEqual(fresh.moduleData.finance, syncModuleData(state, 'finance'));
      const loaded = applySyncModule(defaultState(), 'finance', fresh.moduleData.finance);
      assert.deepEqual(loaded.finance.commitments!.map(c => c.currency), ['UYU', 'USD']);
      assert.deepEqual(loaded.finance.expectedIncomes!.map(c => c.currency), ['UYU', 'USD']);
    }
    const nextRevision = await write(state, revision);
    await assert.rejects(write(state, revision), CloudRevisionConflict);
    // An old client with the current parent revision can still publish a lossy encrypted head.
    // The updated client must retain its local evidence and surface the existing conflict.
    const oldClient = structuredClone(state);
    for (const row of [...oldClient.finance.commitments!, ...oldClient.finance.expectedIncomes!]) {
      delete row.currency; row.updatedAt = '2026-10-30T12:00:00.000Z';
    }
    const oldRevision = await write(oldClient, nextRevision);
    const fresh = await fetchFreshCloudModules(user.uid);
    const result = reconcileFinancePublication(state, fresh.moduleData.finance, oldRevision, syncModuleData(state, 'finance'), fresh.tombstones);
    assert.equal(result.conflicts.length, 4); assert.equal(result.needsUpload, false);
    assert.deepEqual(result.state, state);
    const incoming = applySyncModule(defaultState(), 'finance', fresh.moduleData.finance);
    assert.equal(detectFinanceSnapshotRegression(state.finance, incoming.finance).length, 4);
  } finally { cryptoSession.lock(); await terminate(db); await deleteApp(app); }
});
