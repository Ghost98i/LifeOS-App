import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, fetchFreshCloudModules, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction } from './financeFlows';
import { deleteFinanceDuplicate, keepFinanceDuplicateGroup } from './financeDuplicateReview';
import { deriveFinanceReviewInbox } from './financeReview';
import { compareFinanceBalancesShadow } from './financeLedger';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { nextFinanceDeletionTimestamp } from './financeRevision';

test('E2EE + servidor: grupo de tres, revisión entre clientes, eliminación exacta y rechazo obsoleto', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { context.skip('Requiere emuladores locales'); return; }
  assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, 'demo-lifeos');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const db = getFirestoreDb();
  const app = getApp();
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await signInAnonymously(auth);
    cryptoSession.setUnlocked(await generateMdek(), user.uid);
    const state = defaultState();
    state.finance.accounts = [{ id: 'cash', name: 'Grupo sintético', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
    state.finance.transactions = [];
    state.finance.categories = [{ id: 'food', name: 'Comida', active: true }];
    const initial = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'group-a', {});
    await initial.completion;
    let revisions = { finance: initial.writes[0].revision };
    const read = async () => {
      const fresh = await fetchFreshCloudModules(user.uid);
      return { state: normalizeStoredState({ ...state, ...fresh.moduleData.finance as object }), revisions: fresh.remoteRevisions };
    };
    for (let n = 1; n <= 3; n++) {
      addTransaction(state, { id: `group-purchase-${n}`, type: 'gasto', amount: 200, category: 'food', date: todayISO(), note: '', accountId: 'cash' });
      const write = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'group-a', revisions);
      await write.completion;
      const received = await read();
      assert.deepEqual(received.state.finance.transactions, state.finance.transactions);
      assert.equal(received.state.finance.accounts[0].balance, 1000 - 200 * n);
      revisions = { finance: received.revisions.finance! };
    }
    const obsolete = structuredClone(state);
    const obsoleteRevisions = { ...revisions };
    const groups = deriveFinanceReviewInbox(state).duplicateGroups;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].transactions.length, 3);
    keepFinanceDuplicateGroup(state, groups[0].transactions);
    const reviewed = await writeCloudModulesGuarded(user.uid, state, ['finance'], 'group-a', revisions);
    await reviewed.completion;
    const peer = await read();
    assert.equal(deriveFinanceReviewInbox(peer.state).duplicateGroups.length, 0);
    assert.deepEqual(peer.state.finance.transactions, state.finance.transactions);
    assert.equal(peer.state.finance.accounts[0].balance, 400);
    const removed = structuredClone(peer.state.finance.transactions[1]);
    const survivors = structuredClone(peer.state.finance.transactions.filter(tx => tx.id !== removed.id));
    const tombstones = { [removed.id]: nextFinanceDeletionTimestamp(peer.state, removed.id) };
    deleteFinanceDuplicate(peer.state, removed);
    const deletion = await writeCloudModulesGuarded(user.uid, peer.state, ['finance'], 'group-b', peer.revisions, tombstones);
    await deletion.completion;
    const reloaded = await read();
    assert.deepEqual(reloaded.state.finance.transactions, survivors);
    assert.equal(reloaded.state.finance.accounts[0].balance, 600);
    assert.ok(compareFinanceBalancesShadow(reloaded.state).every(item => item.matches));
    assert.equal(deriveFinanceReviewInbox(reloaded.state).duplicateGroups.length, 0);
    const merged = mergeSyncModuleWithConflicts(state, 'finance', syncModuleData(reloaded.state, 'finance'), syncModuleData(state, 'finance'), tombstones);
    assert.equal(merged.conflicts.length, 0);
    assert.deepEqual(merged.state.finance.transactions, survivors);
    assert.equal(merged.state.finance.accounts[0].balance, 600);
    const stale = await writeCloudModulesGuarded(user.uid, obsolete, ['finance'], 'group-obsolete', obsoleteRevisions);
    await assert.rejects(stale.completion, CloudRevisionConflict);
    assert.equal(obsolete.finance.transactions.length, 3, 'El rechazo conserva la copia local');
    const final = await read();
    assert.deepEqual(final.state.finance, reloaded.state.finance);
    console.log(JSON.stringify({ purchases: [800, 600, 400], afterKeep: 400, afterDelete: 600, remainingIds: survivors.map(tx => tx.id), staleRejected: true }));
  } finally {
    cryptoSession.lock();
    await terminate(db);
    await deleteApp(app);
  }
});
