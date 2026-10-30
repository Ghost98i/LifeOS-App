import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, setDoc, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, fetchFreshCloudModules, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { cryptoSession, generateMdek } from './cryptoCore';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction, deleteTransaction, markTransactionReviewed, updateTransaction } from './financeFlows';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { compareFinanceBalancesShadow } from './financeLedger';
import { calcSpentMonth } from './calculations';

test('Firestore + E2EE: clientes concurrentes, revisión obsoleta, reintento, edición, eliminación y recarga', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    context.skip('Requiere emuladores Firestore y Auth');
    return;
  }
  // All I/O is directed to local emulators with a new anonymous synthetic user.
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const db = getFirestoreDb();
  const app = getApp();
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':');
  try {
    connectFirestoreEmulator(db, host, Number(port));
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    const { user } = await signInAnonymously(auth);
    cryptoSession.setUnlocked(await generateMdek(), user.uid);
    const base = defaultState();
    base.finance.accounts = [{ id: 'synthetic-cash', name: 'Prueba', initialBalance: 10000, balance: 10000, currency: 'UYU' }];
    const input = { type: 'gasto' as const, amount: 500, category: 'Otros', date: todayISO(), note: 'Almuerzo', accountId: 'synthetic-cash' };
    const initial = await writeCloudModulesGuarded(user.uid, base, ['finance'], 'base', {});
    await initial.completion;
    const revisions = { finance: initial.writes[0].revision };
    const phone = structuredClone(base);
    const desktop = structuredClone(base);
    addTransaction(phone, { ...input, id: 'phone-operation' });
    addTransaction(desktop, { ...input, id: 'desktop-operation' });
    const first = await writeCloudModulesGuarded(user.uid, phone, ['finance'], 'phone', revisions);
    await first.completion;
    const stale = await writeCloudModulesGuarded(user.uid, desktop, ['finance'], 'desktop', revisions);
    await assert.rejects(stale.completion, CloudRevisionConflict);
    const fresh = await fetchFreshCloudModules(user.uid);
    const result = mergeSyncModuleWithConflicts(desktop, 'finance', fresh.moduleData.finance, syncModuleData(base, 'finance'));
    assert.equal(result.conflicts.length, 0);
    const merged = result.state;
    assert.equal(merged.finance.accounts[0].balance, 9000);
    assert.equal(merged.finance.transactions.length, 2);
    assert.equal(calcSpentMonth(merged), 1000);
    markTransactionReviewed(merged, 'desktop-operation');
    addTransaction(merged, { ...input, id: 'desktop-operation' });
    assert.equal(merged.finance.accounts[0].balance, 9000);
    const publish = await writeCloudModulesGuarded(user.uid, merged, ['finance'], 'desktop', fresh.remoteRevisions);
    await publish.completion;
    const head = (await getDocFromServer(doc(db, 'users', user.uid, 'lifeosModules', 'finance'))).data()!;
    assert.equal(head.isEncrypted, true);
    assert.equal(JSON.stringify(head.data).includes('Almuerzo'), false);
    const reload = await fetchFreshCloudModules(user.uid);
    const loaded = normalizeStoredState({ ...base, ...reload.moduleData.finance as object });
    assert.deepEqual(loaded.finance.transactions, merged.finance.transactions);
    assert.equal(loaded.finance.accounts[0].balance, 9000);
    assert.ok(compareFinanceBalancesShadow(loaded).every(item => item.matches));

    updateTransaction(loaded, 'phone-operation', { ...input, amount: 700 });
    assert.equal(loaded.finance.accounts[0].balance, 8800);
    assert.equal(loaded.finance.transactions.find(item => item.id === 'desktop-operation')?.amount, 500);
    const edited = await writeCloudModulesGuarded(user.uid, loaded, ['finance'], 'phone', reload.remoteRevisions);
    await edited.completion;
    const editedRemote = await fetchFreshCloudModules(user.uid);
    const tombstones = { 'desktop-operation': Date.now() + 1000 };
    deleteTransaction(loaded, 'desktop-operation');
    assert.equal(loaded.finance.accounts[0].balance, 9300);
    const deleted = await writeCloudModulesGuarded(user.uid, loaded, ['finance'], 'phone', editedRemote.remoteRevisions, tombstones);
    await deleted.completion;
    const final = await fetchFreshCloudModules(user.uid);
    const finalState = normalizeStoredState({ ...base, ...final.moduleData.finance as object });
    assert.equal(finalState.finance.transactions.length, 1);
    assert.equal(finalState.finance.accounts[0].balance, 9300);
    assert.equal(calcSpentMonth(finalState), 700);
    const staleAfterDelete = mergeSyncModuleWithConflicts(finalState, 'finance', syncModuleData(merged, 'finance'), syncModuleData(merged, 'finance'), tombstones);
    assert.equal(staleAfterDelete.state.finance.transactions.length, 1);
    assert.equal(staleAfterDelete.state.finance.accounts[0].balance, 9300);
    assert.ok(compareFinanceBalancesShadow(finalState).every(item => item.matches));
    await context.test('Rules endurecidas rechazan escritor cifrado obsoleto incluso si omite el guard del cliente', async () => {
      await assert.rejects(setDoc(doc(db, 'users', user.uid, 'lifeosModules', 'finance'), {
        ...head, revision: 'synthetic-obsolete-writer', parentRevision: revisions.finance,
      }), (error: { code?: string }) => error.code === 'permission-denied');
      const overwritten = await fetchFreshCloudModules(user.uid);
      const staleState = normalizeStoredState({ ...base, ...overwritten.moduleData.finance as object });
      assert.equal(overwritten.remoteRevisions.finance, final.remoteRevisions.finance);
      assert.equal(staleState.finance.transactions.length, 1);
      assert.equal(staleState.finance.accounts[0].balance, 9300);
      assert.equal(staleState.finance.transactions.find(item => item.id === 'phone-operation')?.amount, 700);
      assert.equal(finalState.finance.transactions[0].amount, 700, 'La copia local previa se conserva intacta');
    });
  } finally {
    cryptoSession.lock();
    await terminate(db);
    await deleteApp(app);
  }
});
