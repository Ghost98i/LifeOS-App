import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { decryptSyncModule, encryptSyncModule, generateMdek } from './cryptoCore';
import { defaultState, todayISO } from './storage';
import { addTransaction, markTransactionReviewed } from './financeFlows';

test('Rules locales aplicadas: revisión padre impide restaurar instantáneas obsoletas', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    context.skip('Requiere Firestore Emulator local');
    return;
  }
  const candidate = readFileSync('firestore.rules', 'utf8');
  const conditional = "module != 'finance' || !userHasCommercialResale(userId) || (";
  assert.equal(candidate.split(conditional).length - 1, 0, 'La protección financiera debe ser incondicional');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  assert.ok(['localhost', '127.0.0.1'].includes(host));
  const environment = await initializeTestEnvironment({ projectId: 'demo-finance-revision', firestore: { host, port: Number(port), rules: candidate } });
  try {
    const uid = 'synthetic-review';
    const db = environment.authenticatedContext(uid).firestore();
    const ref = doc(db, 'users', uid, 'lifeosModules', 'finance');
    const key = await generateMdek();
    const state = defaultState();
    state.finance.accounts = [{ id: 'cash', name: 'Sintética', initialBalance: 1000, balance: 1000 }];
    const payload = async (revision: string, parentRevision: string | null) => ({
      schemaVersion: 2, module: 'finance', revision, parentRevision,
      syncProtocolVersion: 2, isEncrypted: true, deviceId: 'synthetic', clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
      data: await encryptSyncModule({ finance: structuredClone(state.finance) }, key, 'finance', uid),
    });
    await assertSucceeds(setDoc(ref, await payload('initial', null)));
    let parent = 'initial';
    let obsolete: Awaited<ReturnType<typeof payload>> | undefined;
    for (let count = 1; count <= 3; count++) {
      const tx = addTransaction(state, { type: 'gasto', amount: 200, category: 'Comida', accountId: 'cash', date: todayISO(), note: '' });
      markTransactionReviewed(state, tx.id);
      const next = await payload(`r${count}`, parent);
      await assertSucceeds(setDoc(ref, next));
      const persisted = await decryptSyncModule((await getDoc(ref)).data()!.data, key, 'finance', uid) as { finance: typeof state.finance };
      assert.equal(persisted.finance.accounts[0].balance, 1000 - count * 200);
      assert.equal(persisted.finance.transactions.length, count);
      assert.ok(persisted.finance.transactions.every(item => item.note === '' && item.amount === 200));
      if (count === 1) obsolete = next;
      parent = next.revision;
    }
    assert.ok(obsolete);
    await assertFails(setDoc(ref, { ...obsolete, revision: 'obsolete-attempt', updatedAt: serverTimestamp() }));
    const { parentRevision: _omitted, ...withoutParent } = obsolete;
    void _omitted;
    await assertFails(setDoc(ref, { ...withoutParent, revision: 'missing-parent', updatedAt: serverTimestamp() }));
    const final = (await getDoc(ref)).data()!;
    assert.equal(final.revision, 'r3');
    const preserved = await decryptSyncModule(final.data, key, 'finance', uid) as { finance: typeof state.finance };
    assert.equal(preserved.finance.accounts[0].balance, 400);
    assert.equal(preserved.finance.transactions.length, 3);

    // Compatibility: plaintext historical data works with a current parent;
    // a precondition-free finance writer is deliberately rejected.
    const legacyDb = environment.authenticatedContext('synthetic-legacy').firestore();
    const legacyRef = doc(legacyDb, 'users', 'synthetic-legacy', 'lifeosModules', 'finance');
    const plain = { schemaVersion: 2, module: 'finance', revision: 'l0', parentRevision: null, deviceId: 'current', clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(), data: { finance: { transactions: [] } } };
    await assertSucceeds(setDoc(legacyRef, plain));
    await assertSucceeds(setDoc(legacyRef, { ...plain, revision: 'l1', parentRevision: 'l0' }));
    const { parentRevision: _legacyOmitted, ...legacyUnconditional } = plain;
    void _legacyOmitted;
    await assertFails(setDoc(legacyRef, { ...legacyUnconditional, revision: 'old-client' }));
    const notes = doc(legacyDb, 'users', 'synthetic-legacy', 'lifeosModules', 'notes');
    await assertSucceeds(setDoc(notes, { ...legacyUnconditional, module: 'notes', revision: 'n0', data: { notes: {} } }));
  } finally {
    await environment.cleanup();
  }
});
