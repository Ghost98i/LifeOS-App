import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { decryptSyncModule, encryptSyncModule, generateMdek } from './cryptoCore';
import { defaultState, todayISO } from './storage';
import { addTransaction } from './financeFlows';

test('Rules financieras: estado servidor, concurrencia, rutas alternativas y límites ante metadatos falsos', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { context.skip('Requiere emulador local'); return; }
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  assert.ok(['127.0.0.1', 'localhost'].includes(host));
  const environment = await initializeTestEnvironment({ projectId: 'demo-finance-boundary', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const uid = 'synthetic-finance';
    const db = environment.authenticatedContext(uid).firestore();
    const ref = doc(db, 'users', uid, 'lifeosModules', 'finance');
    const key = await generateMdek();
    const state = defaultState();
    state.finance.accounts = [{ id: 'cash', name: 'Sintética', balance: 1000, initialBalance: 1000 }];
    const payload = async (revision: string, parentRevision: string | null) => ({ schemaVersion: 2, syncProtocolVersion: 2, isEncrypted: true,
      module: 'finance', revision, parentRevision, deviceId: 'synthetic', clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
      data: await encryptSyncModule({ finance: structuredClone(state.finance) }, key, 'finance', uid) });
    const initial = await payload('r0', null);
    await assertSucceeds(setDoc(ref, initial));
    for (let i = 1; i <= 3; i++) {
      addTransaction(state, { id: `independent-${i}`, type: 'gasto', amount: 200, category: 'Comida', accountId: 'cash', date: todayISO(), note: '' });
      await assertSucceeds(setDoc(ref, await payload(`r${i}`, `r${i - 1}`)));
    }
    const current = await payload('candidate', 'r3');
    await context.test('no basta inventar un contador alto; el padre se compara con resource.data.revision', async () => {
      await assertFails(setDoc(ref, { ...initial, parentRevision: '999999999999999999', revision: 'future-counter', clientUpdatedAt: Date.now() + 99999999 }));
      await assertFails(setDoc(ref, { ...initial, parentRevision: null, revision: 'recreate' }));
      await assertFails(setDoc(ref, { ...initial, parentRevision: 'r0', revision: 'old-snapshot' }));
      await assertFails(deleteDoc(ref));
      assert.equal((await getDoc(ref)).data()!.revision, 'r3');
    });
    await context.test('dos escritores desde el mismo padre: solo uno confirma; la revisión de archivo tampoco se filtra del lote rechazado', async () => {
      const writer = async (revision: string) => {
        const batch = writeBatch(db);
        const next = { ...current, revision };
        batch.set(ref, next);
        batch.set(doc(db, 'users', uid, 'lifeosRevisions', revision), next);
        await batch.commit();
      };
      const outcomes = await Promise.allSettled([writer('concurrent-a'), writer('concurrent-b')]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
      const loser = outcomes[0].status === 'rejected' ? 'concurrent-a' : 'concurrent-b';
      assert.equal((await getDoc(doc(db, 'users', uid, 'lifeosRevisions', loser))).exists(), false);
      const read = (await getDoc(ref)).data()!;
      const decoded = await decryptSyncModule(read.data, key, 'finance', uid) as { finance: typeof state.finance };
      assert.equal(decoded.finance.transactions.length, 3);
      assert.equal(decoded.finance.accounts[0].balance, 400);
    });
    await context.test('ninguna ruta allow superpuesta actualiza el head; legado e historial son documentos distintos', async () => {
      const before = (await getDoc(ref)).data()!;
      await assertFails(setDoc(doc(db, 'users', uid, 'finance', 'state'), { finance: { transactions: [] } }));
      await assertFails(setDoc(doc(db, 'users', uid, 'lifeosModules', 'finance', 'nested', 'state'), { data: initial.data }));
      await assertFails(setDoc(doc(environment.authenticatedContext('other-user').firestore(), 'users', uid, 'lifeosModules', 'finance'), current));
      // A standalone archive append is allowed, but does not publish a head.
      await assertSucceeds(setDoc(doc(db, 'users', uid, 'lifeosRevisions', 'archive-only'), { ...initial, revision: 'archive-only' }));
      await assertFails(setDoc(doc(db, 'users', uid, 'lifeosRevisions', 'archive-only'), { ...initial, revision: 'archive-only', data: current.data }));
      // Plaintext legacy route remains available before capability activation.
      const legacy = doc(db, 'users', uid, 'lifeos', 'state');
      await assertSucceeds(setDoc(legacy, { schemaVersion: 2, state: { finance: { transactions: [] } }, deviceId: 'old-client', updatedAt: serverTimestamp() }));
      await assertSucceeds(setDoc(doc(db, 'users', uid, 'lifeosAccount', 'capability'), { version: 1, minimumSyncProtocolVersion: 2, encryptionState: 'encrypted', encryptedModules: ['finance'], updatedAt: new Date().toISOString() }));
      await assertFails(setDoc(legacy, { schemaVersion: 2, state: { finance: { transactions: [] } }, deviceId: 'old-client', updatedAt: serverTimestamp() }));
      assert.equal((await getDoc(ref)).data()!.revision, before.revision);
    });
    await context.test('LÍMITE caracterizado: padre vigente manipulado no demuestra la integridad del ciphertext ni unicidad de revision', async () => {
      // This is intentionally NOT a desired invariant; the two-line patch is a
      // CAS check, not a semantic proof over E2EE or an anti-malicious-owner log.
      await assertSucceeds(runTransaction(db, async transaction => {
        const latest = (await transaction.get(ref)).data()!;
        transaction.set(ref, { ...initial, parentRevision: latest.revision, revision: latest.revision });
      }));
      const result = (await getDoc(ref)).data()!;
      const replay = await decryptSyncModule(result.data, key, 'finance', uid) as { finance: typeof state.finance };
      assert.equal(replay.finance.transactions.length, 0);
      assert.equal(replay.finance.accounts[0].balance, 1000);
      assert.ok(result.revision.startsWith('concurrent-'), 'Reutilizar revision también está permitido por las dos condiciones autorizadas');
    });
  } finally { await environment.cleanup(); }
});
