import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, fetchFreshCloudModules, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction, deleteTransaction, updateTransaction } from './financeFlows';
import { reconcileFinancePublication } from './financeSyncReconciliation';
import { syncModuleData } from './syncModel';
import { nextFinanceDeletionTimestamp } from './financeRevision';
import { compareFinanceBalancesShadow } from './financeLedger';

test('reconexión transaccional cifrada: rechazo, unión, head repetido, edición incompatible y borrado explícito', async context => {
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
    const input = (id: string, amount = 200) => ({ id, amount, type: 'gasto' as const, category: 'Comida', date: todayISO(), note: '', accountId: 'cash' });
    const base = defaultState();
    base.finance.accounts = [{ id: 'cash', name: 'Sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
    base.finance.transactions = [];
    for (let n = 1; n <= 3; n++) addTransaction(base, input(`shared-${n}`));
    const write = async (state: typeof base, revision?: string, markers: Record<string, number> = {}) => {
      const publication = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'reconnect-emulator', { finance: revision }, markers);
      await publication.completion;
      return publication.writes[0].revision;
    };
    const read = async () => {
      const fresh = await fetchFreshCloudModules(user.uid);
      return { ...fresh, state: normalizeStoredState({ ...base, ...fresh.moduleData.finance as object }) };
    };
    const initialRevision = await write(base);
    const a = structuredClone(base), b = structuredClone(base);
    addTransaction(a, input('offline-a'));
    addTransaction(b, input('online-b'));
    const revisionB = await write(b, initialRevision);
    await assert.rejects(write(a, initialRevision), CloudRevisionConflict);
    const remote = await read();
    assert.equal(remote.remoteRevisions.finance, revisionB);
    const merged = reconcileFinancePublication(a, remote.moduleData.finance, revisionB, syncModuleData(base, 'finance'), remote.tombstones);
    assert.equal(merged.conflicts.length, 0);
    assert.equal(merged.state.finance.transactions.length, 5);
    assert.equal(merged.state.finance.accounts[0].balance, 0);
    assert.deepEqual(merged.confirmed.data, remote.moduleData.finance);
    const repeatRevision = await write(b, revisionB);
    const repeat = await read();
    const repeated = reconcileFinancePublication(merged.state, repeat.moduleData.finance, repeatRevision, merged.confirmed.data, repeat.tombstones);
    assert.equal(repeated.conflicts.length, 0);
    assert.equal(repeated.needsUpload, true);
    const fiveRevision = await write(repeated.state, repeatRevision);
    const five = await read();
    assert.equal(five.remoteRevisions.finance, fiveRevision);
    assert.equal(five.state.finance.accounts[0].balance, 0);
    assert.deepEqual(five.state.finance.transactions.map(tx => tx.id).sort(), ['offline-a', 'online-b', 'shared-1', 'shared-2', 'shared-3']);

    // Incompatible edits retain the actual conflict; no automatic winner.
    const editA = structuredClone(five.state), editB = structuredClone(five.state);
    updateTransaction(editA, 'shared-1', input('shared-1', 250));
    updateTransaction(editB, 'shared-1', input('shared-1', 300));
    const editedRevision = await write(editB, fiveRevision);
    await assert.rejects(write(editA, fiveRevision), CloudRevisionConflict);
    const edited = await read();
    const conflict = reconcileFinancePublication(editA, edited.moduleData.finance, editedRevision, syncModuleData(five.state, 'finance'), edited.tombstones);
    assert.ok(conflict.conflicts.some(item => item.entityId === 'shared-1'));
    assert.deepEqual(conflict.state.finance, editA.finance);
    assert.equal(conflict.needsUpload, false);
    assert.equal(edited.state.finance.transactions.find(tx => tx.id === 'shared-1')?.amount, 300);

    // Fresh reads carry encrypted deletion evidence even before a listener can.
    const offline = structuredClone(edited.state), deleting = structuredClone(edited.state);
    addTransaction(offline, input('offline-c'));
    const tombstones = { 'shared-2': nextFinanceDeletionTimestamp(deleting, 'shared-2') };
    deleteTransaction(deleting, 'shared-2');
    const deletedRevision = await write(deleting, editedRevision, tombstones);
    await assert.rejects(write(offline, editedRevision), CloudRevisionConflict);
    const deleted = await read();
    assert.equal(deleted.tombstones['shared-2'], tombstones['shared-2']);
    const resolved = reconcileFinancePublication(offline, deleted.moduleData.finance, deletedRevision, syncModuleData(edited.state, 'finance'), deleted.tombstones);
    assert.equal(resolved.conflicts.length, 0);
    assert.ok(resolved.state.finance.transactions.some(tx => tx.id === 'offline-c'));
    assert.ok(!resolved.state.finance.transactions.some(tx => tx.id === 'shared-2'));
    await write(resolved.state, deletedRevision, deleted.tombstones);
    const final = await read();
    assert.deepEqual(final.state.finance.transactions, resolved.state.finance.transactions);
    assert.equal(final.state.finance.accounts[0].balance, -100);
    assert.ok(compareFinanceBalancesShadow(final.state).every(account => account.matches));
  } finally { cryptoSession.lock(); await terminate(db); await deleteApp(app); }
});
