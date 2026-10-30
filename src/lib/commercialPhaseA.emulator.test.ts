import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

test('Problem 1 resolution: a legacy encrypted Finance-only write is rejected when commercial state is protected', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { context.skip('Requires Firestore Emulator'); return; }
  const rules = readFileSync('firestore.rules', 'utf8');
  const env = await initializeTestEnvironment({ projectId: 'demo-lifeos', firestore: { host: '127.0.0.1', port: 8080, rules } });
  const user = 'phase-a-finance-compatibility-only';
  const nonCommercialUser = 'non-commercial-user';
  const envelope = { cryptoVersion: 1, algorithm: 'AES-GCM-256', iv: 'test-iv', ciphertext: 'test-ciphertext', createdAt: '2026-10-27T00:00:00Z' };
  const payload = (module: string, revision: string, protocol = module === 'resale' ? 3 : 2) => ({
    module, schemaVersion: 1, syncProtocolVersion: protocol,
    isEncrypted: true, data: envelope, revision, parentRevision: null, deviceId: 'test', clientUpdatedAt: 1,
  });

  try {
    // Setup 1: User with commercial data in resale and initial finance
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users', user, 'lifeosModules', 'resale'), {
        ...payload('resale', 'r1', 3), commercialProtocolVersion: 1,
      });
      await setDoc(doc(ctx.firestore(), 'users', user, 'lifeosModules', 'finance'), {
        ...payload('finance', 'f1', 3), commercialProtocolVersion: 1,
      });

      // Setup 2: Non-commercial user with standard finance
      await setDoc(doc(ctx.firestore(), 'users', nonCommercialUser, 'lifeosModules', 'finance'), payload('finance', 'f1', 2));

      // Commercial capability enabled
      await setDoc(doc(ctx.firestore(), 'systemCapabilities', 'commercial'), {
        enabled: true, commercialProtocolVersion: 1, minimumSyncProtocolVersion: 3,
      });
    });

    const db = env.authenticatedContext(user).firestore();
    const nonCommercialDb = env.authenticatedContext(nonCommercialUser).firestore();

    // 1. REJECTED: Legacy client (syncProtocolVersion: 2, no commercial marker) writes to finance on commercial account
    await assertFails(setDoc(doc(db, 'users', user, 'lifeosModules', 'finance'), {
      ...payload('finance', 'f2', 2), parentRevision: 'f1', data: { ...envelope, ciphertext: 'older-client-finance' },
    }));

    // Verify financial and resale state were NOT modified or degraded
    assert.equal((await getDoc(doc(db, 'users', user, 'lifeosModules', 'resale'))).data()?.revision, 'r1');
    assert.equal((await getDoc(doc(db, 'users', user, 'lifeosModules', 'finance'))).data()?.revision, 'f1');

    // 2. SUCCEEDS: Non-commercial user can perform standard finance writes with legacy protocol
    await assertSucceeds(setDoc(doc(nonCommercialDb, 'users', nonCommercialUser, 'lifeosModules', 'finance'), {
      ...payload('finance', 'f2', 2), parentRevision: 'f1', data: { ...envelope, ciphertext: 'normal-user-finance' },
    }));
    assert.equal((await getDoc(doc(nonCommercialDb, 'users', nonCommercialUser, 'lifeosModules', 'finance'))).data()?.revision, 'f2');

    // 3. SUCCEEDS: Compatible client writes to finance on commercial account (syncProtocolVersion: 3, commercialProtocolVersion: 1)
    await assertSucceeds(setDoc(doc(db, 'users', user, 'lifeosModules', 'finance'), {
      ...payload('finance', 'f2', 3), commercialProtocolVersion: 1, parentRevision: 'f1',
      data: { ...envelope, ciphertext: 'compatible-client-finance' },
    }));
    assert.equal((await getDoc(doc(db, 'users', user, 'lifeosModules', 'finance'))).data()?.revision, 'f2');
  } finally { await env.cleanup(); }
});
