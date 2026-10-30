/**
 * LifeOS — Real Firestore Rules Tests with Firebase Rules Unit Testing & Emulator
 *
 * Covers all required real security boundary specifications:
 * 1. User A cannot read or write User B's documents.
 * 2. Plaintext account accepts valid legacy writes (v1).
 * 3. Mixed account rejects legacy plaintext writes for protected modules.
 * 4. Migrated module rejects plaintext downgrade.
 * 5. Encrypted account rejects all plaintext writes across all modules.
 * 6. Valid ciphertext (CryptoEnvelope) is permitted.
 * 7. Invalid/malformed CryptoEnvelope is rejected.
 * 8. Plaintext revisions are rejected on encrypted/mixed modules.
 * 9. Legacy /lifeos/state rejects new writes once E2EE is active.
 * 10. Plaintext legacy revisions can be purged ONLY when account is encrypted.
 * 11. Encrypted revisions CANNOT be purged.
 * 12. keyEnvelope bound to a different userId is rejected (AAD binding).
 * 13. Malformed/invalid keyEnvelope is rejected.
 * 14. Invalid capability is rejected.
 */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test, { before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocFromServer, setDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';
import { addSandboxItem, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, type SandboxMoneySession } from './commercialMoneySandbox';
import { captureDurableCommercial, recoverDurableCommercial } from './commercialDurable';
import { reconcileCommercialSets } from './commercialReconcile';
import { addRemoteResaleVersion, loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './resaleConflictRecovery';
import { applySyncModule, mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { defaultState, loadStoredState, readStoredCommercial, saveStoredState } from './storage';
import { classifyTransactionalRevisions } from './cloudSync';

const PROJECT_ID = 'demo-lifeos';
const COMMERCIAL_CAPABILITY = { enabled: true, commercialProtocolVersion: 1, minimumSyncProtocolVersion: 3 } as const;
let testEnv: RulesTestEnvironment;

async function setCommercialCapability(value: unknown | null): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), 'systemCapabilities', 'commercial');
    if (value === null) await deleteDoc(ref);
    else await setDoc(ref, value);
  });
}

const validCryptoEnvelope = {
  cryptoVersion: 1,
  algorithm: 'AES-GCM-256',
  iv: 'AQIDBAUGBwgJCgsMDQ4PEA==',
  ciphertext: '5o2+4fK5lH9w...',
  aad: 'module:finance|user:alice|cryptoVersion:1',
  createdAt: '2026-10-04T22:00:00.000Z',
};

const makeValidWrappedKeyEnvelope = (userId: string) => ({
  keyFormatVersion: 1,
  cryptoVersion: 1,
  algorithm: 'AES-GCM-256',
  wrappedMdek: {
    iv: 'AQIDBAUGBwgJCgsMDQ4PEA==',
    ciphertext: 'mdek-ciphertext-base64==',
  },
  kdf: {
    algorithm: 'HKDF-SHA-256',
    salt: '1234567890123456',
    info: 'LifeOS-Recovery-KEK-v1',
  },
  aad: `keyFormatVersion:1|userId:${userId}`,
  createdAt: '2026-10-04T22:00:00.000Z',
});

before(async () => {
  const rulesPath = resolve(process.cwd(), 'firestore.rules');
  const rulesContent = readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
    await setCommercialCapability(COMMERCIAL_CAPABILITY);
  }
});

test('Rules Runtime: 1. Usuario A no puede leer ni escribir datos de Usuario B', async () => {
  const aliceContext = testEnv.authenticatedContext('alice');
  const bobContext = testEnv.authenticatedContext('bob');

  const aliceDb = aliceContext.firestore();
  const bobDb = bobContext.firestore();

  // Alice escribe su propio perfil plaintext inicial
  const aliceProfileRef = doc(aliceDb, 'users', 'alice', 'lifeosModules', 'profile');
  await assertSucceeds(
    setDoc(aliceProfileRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'profile',
      data: { name: 'Alice' },
      revision: 'rev-alice-1',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );

  // Bob intenta leer el documento de Alice -> RECHAZADO
  const bobReadingAliceRef = doc(bobDb, 'users', 'alice', 'lifeosModules', 'profile');
  await assertFails(getDoc(bobReadingAliceRef));

  // Bob intenta escribir en el espacio de Alice -> RECHAZADO
  await assertFails(
    setDoc(bobReadingAliceRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'profile',
      data: { name: 'Bob Hacking' },
      revision: 'rev-bob-hack',
      deviceId: 'dev-bob',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 2. Cuenta plaintext acepta escrituras legacy válidas', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  const profileRef = doc(alice, 'users', 'alice', 'lifeosModules', 'profile');
  await assertSucceeds(
    setDoc(profileRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'profile',
      data: { name: 'Alice Plaintext' },
      revision: 'rev-1',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 3. Capability "mixed" rechaza escrituras legacy en módulos protegidos', async () => {
  // Configurar capability mixed con 'finance' protegido usando adminContext
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'mixed',
      encryptedModules: ['finance'],
      updatedAt: new Date().toISOString(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const financeRef = doc(alice, 'users', 'alice', 'lifeosModules', 'finance');

  // Con capability 'mixed', las escrituras en texto plano v1 quedan BLOQUEADAS en toda la cuenta
  // (Fail-closed: un cliente antiguo v1 no puede escribir nada mientras la cuenta está migrando)
  await assertFails(
    setDoc(financeRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'finance',
      data: { accounts: [] },
      revision: 'rev-f1',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );

  const profileRef = doc(alice, 'users', 'alice', 'lifeosModules', 'profile');
  await assertFails(
    setDoc(profileRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'profile',
      data: { name: 'Alice' },
      revision: 'rev-p1',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );

  // En cambio, una escritura cifrada en profile SÍ es aceptada
  await assertSucceeds(
    setDoc(profileRef, {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'profile',
      data: validCryptoEnvelope,
      revision: 'rev-p-enc',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 4. Módulo ya cifrado rechaza downgrade a plaintext aun sin capability', async () => {
  // Pre-crear módulo finance cifrado
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosModules', 'finance'), {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'finance',
      data: validCryptoEnvelope,
      revision: 'rev-f-enc',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const financeRef = doc(alice, 'users', 'alice', 'lifeosModules', 'finance');

  // Intento de sobrescribir con plaintext -> RECHAZADO (no-downgrade server-side)
  await assertFails(
    setDoc(financeRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'finance',
      data: { accounts: [{ balance: 1000 }] },
      revision: 'rev-downgrade-attempt',
      parentRevision: null,
      deviceId: 'dev-legacy',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 5. Cuenta "encrypted" rechaza todo plaintext en cualquier módulo', async () => {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['profile', 'agenda', 'tasks', 'context', 'finance'],
      updatedAt: new Date().toISOString(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const tasksRef = doc(alice, 'users', 'alice', 'lifeosModules', 'tasks');

  // Intento de escribir plaintext -> RECHAZADO
  await assertFails(
    setDoc(tasksRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'tasks',
      data: { tasks: [] },
      revision: 'rev-t1',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 6. Ciphertext válido (CryptoEnvelope) es aceptado', async () => {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['tasks'],
      updatedAt: new Date().toISOString(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const tasksRef = doc(alice, 'users', 'alice', 'lifeosModules', 'tasks');

  await assertSucceeds(
    setDoc(tasksRef, {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'tasks',
      data: validCryptoEnvelope,
      revision: 'rev-t-enc',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 7. CryptoEnvelope malformado es rechazado', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tasksRef = doc(alice, 'users', 'alice', 'lifeosModules', 'tasks');

  // Envelope con algoritmo adulterado
  const badAlgorithmEnvelope = {
    ...validCryptoEnvelope,
    algorithm: 'AES-CBC-128',
  };

  await assertFails(
    setDoc(tasksRef, {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'tasks',
      data: badAlgorithmEnvelope,
      revision: 'rev-bad-alg',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );

  // Envelope sin IV
  const missingIvEnvelope = {
    cryptoVersion: 1,
    algorithm: 'AES-GCM-256',
    ciphertext: '1234',
    createdAt: '2026-10-04T22:00:00.000Z',
  };

  await assertFails(
    setDoc(tasksRef, {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'tasks',
      data: missingIvEnvelope,
      revision: 'rev-missing-iv',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 8. Revisión en texto plano es rechazada en cuenta cifrada', async () => {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['notes'],
      updatedAt: new Date().toISOString(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const revRef = doc(alice, 'users', 'alice', 'lifeosRevisions', 'rev-notes-plain');

  await assertFails(
    setDoc(revRef, {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'notes',
      data: { notes: [] },
      revision: 'rev-notes-plain',
      parentRevision: null,
      deviceId: 'dev-1',
      clientUpdatedAt: Date.now(),
    })
  );
});

test('Rules Runtime: 9. /lifeos/state no admite nuevas escrituras tras activar E2EE', async () => {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['profile'],
      updatedAt: new Date().toISOString(),
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const stateDocRef = doc(alice, 'users', 'alice', 'lifeos', 'state');

  await assertFails(
    setDoc(stateDocRef, {
      schemaVersion: 2,
      deviceId: 'dev-legacy',
      state: { profile: { name: 'Overwrite' } },
      updatedAt: new Date().toISOString(),
    })
  );
});

test('Rules Runtime: 10. Plaintext revision legacy puede purgarse SOLO en cuenta encrypted', async () => {
  // Pre-cargar revision plaintext
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosRevisions', 'rev-plain-old'), {
      schemaVersion: 2,
      syncProtocolVersion: 1,
      isEncrypted: false,
      module: 'gym',
      data: { routines: [] },
      revision: 'rev-plain-old',
      deviceId: 'dev-old',
      clientUpdatedAt: 1000,
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const revRef = doc(alice, 'users', 'alice', 'lifeosRevisions', 'rev-plain-old');

  // Sin capability encrypted -> DELETE RECHAZADO
  await assertFails(deleteDoc(revRef));

  // Activar capability 'encrypted'
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['gym'],
      updatedAt: new Date().toISOString(),
    });
  });

  // Con capability 'encrypted' -> DELETE PERMITIDO
  await assertSucceeds(deleteDoc(revRef));
});

test('Rules Runtime: 11. Encrypted revision NO puede purgarse (integridad de historial)', async () => {
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosAccount', 'capability'), {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: ['gym'],
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosRevisions', 'rev-gym-enc'), {
      schemaVersion: 2,
      syncProtocolVersion: 2,
      isEncrypted: true,
      module: 'gym',
      data: validCryptoEnvelope,
      revision: 'rev-gym-enc',
      deviceId: 'dev-1',
      clientUpdatedAt: 2000,
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const revRef = doc(alice, 'users', 'alice', 'lifeosRevisions', 'rev-gym-enc');

  // Delete de revisión cifrada legítima -> RECHAZADO SIEMPRE
  await assertFails(deleteDoc(revRef));
});

test('Rules Runtime: 12. keyEnvelope vinculado a otro usuario es rechazado (AAD mismatch)', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const keyEnvRef = doc(alice, 'users', 'alice', 'lifeosAccount', 'keyEnvelope');

  // Bob genera un envelope con su userId y Alice intenta guardarlo en su cuenta
  const bobKeyEnvelope = makeValidWrappedKeyEnvelope('bob');

  await assertFails(setDoc(keyEnvRef, bobKeyEnvelope));

  // En cambio, con su propio userId -> ACEPTADO
  const aliceKeyEnvelope = makeValidWrappedKeyEnvelope('alice');
  await assertSucceeds(setDoc(keyEnvRef, aliceKeyEnvelope));
});

test('Rules Runtime: 13. keyEnvelope con campos extras o KDF corrupto es rechazado', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const keyEnvRef = doc(alice, 'users', 'alice', 'lifeosAccount', 'keyEnvelope');

  const corruptKdfEnvelope = {
    ...makeValidWrappedKeyEnvelope('alice'),
    kdf: {
      algorithm: 'PBKDF2-SHA-1', // Espera HKDF-SHA-256
      salt: '1234',
      info: 'bad',
    },
  };

  await assertFails(setDoc(keyEnvRef, corruptKdfEnvelope));
});

test('Rules Runtime: 14. Capability inválida es rechazada', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const capRef = doc(alice, 'users', 'alice', 'lifeosAccount', 'capability');

  // Estado no permitido ('super-encrypted')
  const badCap = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'super-encrypted',
    updatedAt: new Date().toISOString(),
  };

  await assertFails(setDoc(capRef, badCap));

  // Con estado válido -> ACEPTADO
  const goodCap = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'encrypted',
    encryptedModules: ['profile'],
    updatedAt: new Date().toISOString(),
  };

  await assertSucceeds(setDoc(capRef, goodCap));
});

test('Rules Runtime: 15. REPRODUCCIÓN: Cuenta legacy pre-Fase-8 existente actualiza módulo localmente con Batch Write real', async () => {
  // 1. Simular que en Firestore YA EXISTÍA un documento de módulo antes del deploy de Fase 8
  // (Formato v1 legacy: sin isEncrypted ni syncProtocolVersion, y sin documento de capability)
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'lifeosModules', 'finance'), {
      schemaVersion: 2,
      module: 'finance',
      data: { accounts: [{ id: 'acc-1', name: 'Banco', balance: 5000 }], transactions: [] },
      revision: 'old-rev-legacy-1',
      parentRevision: null,
      deviceId: 'legacy-device',
      clientUpdatedAt: 1728000000000,
      updatedAt: new Date().toISOString(),
    });
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const financeRef = doc(aliceDb, 'users', 'alice', 'lifeosModules', 'finance');
  const revisionRef = doc(aliceDb, 'users', 'alice', 'lifeosRevisions', 'new-rev-2');

  // 2. El cliente moderno ejecuta EXACTAMENTE el batch de producción (writeCloudModules / writeCloudModulesGuarded)
  const payload = {
    schemaVersion: 2,
    syncProtocolVersion: 1,
    isEncrypted: false,
    module: 'finance',
    data: { accounts: [{ id: 'acc-1', name: 'Banco', balance: 4000 }], transactions: [] },
    revision: 'new-rev-2',
    parentRevision: 'old-rev-legacy-1',
    deviceId: 'modern-device',
    clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(aliceDb);
  batch.set(financeRef, payload);
  batch.set(revisionRef, payload);

  await assertSucceeds(batch.commit());
});

test('Rules Runtime: 16. Cuenta legacy: cliente antiguo pre-Fase-8 (sin isEncrypted ni syncProtocolVersion) puede sincronizar', async () => {
  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const notesRef = doc(aliceDb, 'users', 'alice', 'lifeosModules', 'notes');
  const notesRevRef = doc(aliceDb, 'users', 'alice', 'lifeosRevisions', 'rev-notes-legacy-1');

  // Payload generado por un cliente legacy previo a Fase 8
  const legacyPayload = {
    schemaVersion: 2,
    module: 'notes',
    data: { postits: [{ id: 'n-1', text: 'Nota' }], shopping: [] },
    revision: 'rev-notes-legacy-1',
    parentRevision: null,
    deviceId: 'legacy-device',
    clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(aliceDb);
  batch.set(notesRef, legacyPayload);
  batch.set(notesRevRef, legacyPayload);

  await assertSucceeds(batch.commit());
});

const resalePayload = (revision: string, parentRevision: string | null, data: unknown = { resale: { opportunities: [], inventory: [] } }) => ({
  schemaVersion: 2,
  syncProtocolVersion: 1,
  isEncrypted: false,
  module: 'resale',
  data,
  revision,
  parentRevision,
  deviceId: 'rules-test-device',
  clientUpdatedAt: Date.now(),
  updatedAt: serverTimestamp(),
});

test('Rules Runtime: resale exige parentRevision null en la primera creación', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertFails(setDoc(ref, resalePayload('new-bad', 'not-yet-created')));
  const missing = { ...resalePayload('new-missing', null) };
  delete (missing as Partial<typeof missing>).parentRevision;
  await assertFails(setDoc(ref, missing));
  await assertFails(setDoc(ref, { ...resalePayload('new-zero', null), syncProtocolVersion: 0 }));
  await assertSucceeds(setDoc(ref, resalePayload('initial', null)));
  const head = await getDoc(ref);
  assert.equal(head.data()?.revision, 'initial');
});

test('Rules Runtime: resale admite revisión vigente y rechaza revisiones obsoletas o ausentes', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(ref, resalePayload('r1', null)));
  await assertSucceeds(setDoc(ref, resalePayload('r2', 'r1')));
  await assertFails(setDoc(ref, resalePayload('stale', 'r1')));
  await assertFails(setDoc(ref, resalePayload('no-parent', null)));
  const missing = { ...resalePayload('missing-parent', null) };
  delete (missing as Partial<typeof missing>).parentRevision;
  await assertFails(setDoc(ref, missing));
  assert.equal((await getDoc(ref)).data()?.revision, 'r2');
});

test('Rules Runtime: cliente antiguo no puede sobrescribir resale con una revisión anterior', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(ref, resalePayload('current', null)));
  const legacy = {
    schemaVersion: 2, module: 'resale', data: { resale: { opportunities: [], inventory: [] } },
    revision: 'legacy-next', parentRevision: null, deviceId: 'old-client',
    clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(ref, legacy));
  await assertFails(setDoc(ref, { ...legacy, parentRevision: 'outdated' }));
  assert.equal((await getDoc(ref)).data()?.revision, 'current');
});

test('Rules Runtime: un cliente antiguo con revisión vigente sigue admitido antes de activar commercial', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(ref, resalePayload('current', null)));
  const legacy = {
    schemaVersion: 2, module: 'resale', data: { resale: { opportunities: [], inventory: [] } },
    revision: 'legacy-next', parentRevision: 'current', deviceId: 'old-client',
    clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(ref, legacy));
  assert.equal((await getDoc(ref)).data()?.revision, 'legacy-next');
});

test('Rules Runtime: transacción resale y finance confirma ambos documentos o ninguno', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const resaleRef = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const financeRef = doc(db, 'users', 'alice', 'lifeosModules', 'finance');
  await assertSucceeds(setDoc(resaleRef, resalePayload('r1', null)));
  const financePayload = (revision: string) => ({ ...resalePayload(revision, null, { finance: { transactions: [] } }), module: 'finance' });
  await assertSucceeds(setDoc(financeRef, financePayload('f1')));
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const [resaleHead, financeHead] = await Promise.all([transaction.get(resaleRef), transaction.get(financeRef)]);
    const nextResale = resalePayload('r2', resaleHead.data()?.revision, { resale: { opportunities: [], inventory: [
      { id: 'gpu-1', item: 'GPU', buyPrice: 8000, buyDate: '2026-10-22', status: 'comprado', purchaseTxId: 'purchase-1' },
    ] } });
    const nextFinance = { ...financePayload('f2'), parentRevision: financeHead.data()?.revision,
      data: { finance: { transactions: [{ id: 'purchase-1', type: 'gasto', amount: 8000, origin: 'resale_purchase' }] } } };
    transaction.set(resaleRef, nextResale);
    transaction.set(financeRef, nextFinance);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'r2'), nextResale);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'f2'), nextFinance);
  }));
  assert.deepEqual([(await getDoc(resaleRef)).data()?.revision, (await getDoc(financeRef)).data()?.revision], ['r2', 'f2']);
  await assertFails(runTransaction(db, async (transaction) => {
    await Promise.all([transaction.get(resaleRef), transaction.get(financeRef)]);
    const staleResale = resalePayload('stale-r3', 'r1');
    const nextFinance = { ...financePayload('should-not-write'), parentRevision: 'f2' };
    transaction.set(resaleRef, staleResale);
    transaction.set(financeRef, nextFinance);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'stale-r3'), staleResale);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'should-not-write'), nextFinance);
  }));
  assert.deepEqual([(await getDoc(resaleRef)).data()?.revision, (await getDoc(financeRef)).data()?.revision], ['r2', 'f2']);
  assert.equal((await getDoc(doc(db, 'users', 'alice', 'lifeosRevisions', 'stale-r3'))).exists(), false);
});

test('Rules Runtime: Reventa convencional y payload cifrado respetan la revisión de resale', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const inventory = [{ id: 'item-1', item: 'GPU', buyPrice: 8000, buyDate: '2026-10-22', status: 'comprado', purchaseTxId: 'tx-1' }];
  await assertSucceeds(setDoc(ref, resalePayload('plain-r1', null, { resale: { opportunities: [], inventory } })));
  await assertSucceeds(setDoc(ref, { ...resalePayload('encrypted-r2', 'plain-r1', {
    ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1',
  }), isEncrypted: true, syncProtocolVersion: 2 }));
  assert.equal((await getDoc(ref)).data()?.revision, 'encrypted-r2');
});

test('Rules Runtime: módulos ajenos conservan su autorización previa sin parentRevision', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'notes');
  const payload = {
    schemaVersion: 2, module: 'notes', data: { postits: [] }, revision: 'n1',
    deviceId: 'legacy-device', clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(ref, payload));
  await assertSucceeds(setDoc(ref, { ...payload, revision: 'n2', data: { postits: [{ id: 'p1' }] } }));
  assert.equal((await getDoc(ref)).data()?.revision, 'n2');
});

const commercialData = {
  resale: {
    opportunities: [], inventory: [],
    commercial: { items: [{ id: 'bread', name: 'Pan', unit: 'unit' }], operations: [], movements: [] },
  },
};
const protectedResalePayload = (revision: string, parentRevision: string | null, data: unknown = commercialData) => ({
  ...resalePayload(revision, parentRevision, data),
  syncProtocolVersion: 3,
  commercialProtocolVersion: 1,
});

test('Rules Runtime: la capacidad comercial se lee pero solo el contexto privilegiado puede cambiarla', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'systemCapabilities', 'commercial');
  const capability = await getDocFromServer(ref);
  assert.equal(capability.exists(), true);
  assert.equal(capability.metadata.fromCache, false);
  assert.deepEqual(capability.data(), COMMERCIAL_CAPABILITY);
  await assertFails(setDoc(ref, { ...COMMERCIAL_CAPABILITY, enabled: false }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db, 'systemCapabilities', 'other'), COMMERCIAL_CAPABILITY));
});

test('Rules Runtime: capacidad ausente, deshabilitada o inválida bloquea commercial pero preserva Reventa legacy', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const resaleRef = doc(db, 'users', 'alice', 'lifeosModules', 'resale');

  await setCommercialCapability(null);
  await assertFails(setDoc(resaleRef, protectedResalePayload('blocked-missing', null)));
  await assertSucceeds(setDoc(resaleRef, resalePayload('legacy-r1', null)));

  await setCommercialCapability({ ...COMMERCIAL_CAPABILITY, enabled: false });
  await assertFails(setDoc(resaleRef, protectedResalePayload('blocked-disabled', 'legacy-r1')));
  await assertSucceeds(setDoc(resaleRef, resalePayload('legacy-r2', 'legacy-r1')));

  await setCommercialCapability({ enabled: true, commercialProtocolVersion: 1 });
  await assertFails(setDoc(resaleRef, protectedResalePayload('blocked-invalid', 'legacy-r2')));
  await assertSucceeds(setDoc(resaleRef, resalePayload('legacy-r3', 'legacy-r2')));
  assert.equal((await getDoc(resaleRef)).data()?.revision, 'legacy-r3');
});

test('Rules Runtime: Reventa anterior sigue escribiendo antes de activar commercial', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(ref, resalePayload('legacy-r1', null)));
  const legacy = {
    schemaVersion: 2, module: 'resale', data: { resale: { opportunities: [], inventory: [{ id: 'old-item' }] } },
    revision: 'legacy-r2', parentRevision: 'legacy-r1', deviceId: 'old-client',
    clientUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(ref, legacy));
  assert.equal((await getDoc(ref)).data()?.revision, 'legacy-r2');
});

test('Rules Runtime: activar commercial exige datos visibles, marcador y protocolo compatible', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertFails(setDoc(ref, resalePayload('missing-marker', null, commercialData)));
  await assertFails(setDoc(ref, { ...protectedResalePayload('missing-data', null), data: { resale: { opportunities: [], inventory: [] } } }));
  await assertFails(setDoc(ref, { ...protectedResalePayload('old-protocol', null), syncProtocolVersion: 2 }));
  await assertSucceeds(setDoc(ref, protectedResalePayload('commercial-r1', null)));
  assert.deepEqual((await getDoc(ref)).data()?.data.resale.commercial, commercialData.resale.commercial);
});

test('Rules Runtime: cliente antiguo vigente u obsoleto no elimina commercial; cliente compatible lo conserva', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(ref, resalePayload('old-r1', null)));
  await assertSucceeds(setDoc(ref, protectedResalePayload('commercial-r2', 'old-r1')));
  await assertFails(setDoc(ref, resalePayload('old-current', 'commercial-r2')));
  await assertFails(setDoc(ref, resalePayload('old-stale', 'old-r1')));
  await assertFails(setDoc(ref, { ...protectedResalePayload('marked-no-data', 'commercial-r2'), data: { resale: { opportunities: [], inventory: [] } } }));
  await assertFails(setDoc(ref, { ...protectedResalePayload('marked-old-protocol', 'commercial-r2'), syncProtocolVersion: 2 }));
  const expanded = {
    resale: { ...commercialData.resale, inventory: [{ id: 'legacy-purchase' }] },
  };
  await assertSucceeds(setDoc(ref, protectedResalePayload('commercial-r3', 'commercial-r2', expanded)));
  const head = (await getDoc(ref)).data();
  assert.equal(head?.revision, 'commercial-r3');
  assert.deepEqual(head?.data.resale.commercial, commercialData.resale.commercial);
});

test('Rules Runtime: datos commercial preexistentes sin marcador tampoco pueden desaparecer', async () => {
  const path = doc(testEnv.authenticatedContext('alice').firestore(), 'users', 'alice', 'lifeosModules', 'resale');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'lifeosModules', 'resale'), resalePayload('unmarked-r1', null, commercialData));
  });
  await assertFails(setDoc(path, resalePayload('lost-r2', 'unmarked-r1')));
  await assertSucceeds(setDoc(path, protectedResalePayload('protected-r2', 'unmarked-r1')));
  assert.deepEqual((await getDoc(path)).data()?.data.resale.commercial, commercialData.resale.commercial);
});

test('Rules Runtime: marcador comercial permanece en payload cifrado, aunque las reglas no pueden validar su interior', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const envelope = { ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1' };
  await assertSucceeds(setDoc(ref, { ...protectedResalePayload('encrypted-r1', null, envelope), isEncrypted: true }));
  await assertFails(setDoc(ref, { ...resalePayload('old-encrypted-r2', 'encrypted-r1', envelope), isEncrypted: true, syncProtocolVersion: 2 }));
  await assertSucceeds(setDoc(ref, { ...protectedResalePayload('encrypted-r2', 'encrypted-r1', envelope), isEncrypted: true }));
  assert.equal((await getDoc(ref)).data()?.commercialProtocolVersion, 1);
});

test('Rules Runtime: rechazo comercial aborta también finance y ambos documentos de revisión', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const resaleRef = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const financeRef = doc(db, 'users', 'alice', 'lifeosModules', 'finance');
  await assertSucceeds(setDoc(resaleRef, protectedResalePayload('protected-r1', null)));
  const finance = { ...resalePayload('finance-r1', null, { finance: { transactions: [] } }), module: 'finance' };
  await assertSucceeds(setDoc(financeRef, finance));
  const oldResale = resalePayload('old-r2', 'protected-r1');
  const nextFinance = { ...finance, revision: 'finance-r2', parentRevision: 'finance-r1' };
  await assertFails(runTransaction(db, async (transaction) => {
    await Promise.all([transaction.get(resaleRef), transaction.get(financeRef)]);
    transaction.set(resaleRef, oldResale);
    transaction.set(financeRef, nextFinance);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'old-r2'), oldResale);
    transaction.set(doc(db, 'users', 'alice', 'lifeosRevisions', 'finance-r2'), nextFinance);
  }));
  assert.equal((await getDoc(resaleRef)).data()?.revision, 'protected-r1');
  assert.equal((await getDoc(financeRef)).data()?.revision, 'finance-r1');
  assert.equal((await getDoc(doc(db, 'users', 'alice', 'lifeosRevisions', 'old-r2'))).exists(), false);
  assert.equal((await getDoc(doc(db, 'users', 'alice', 'lifeosRevisions', 'finance-r2'))).exists(), false);
});

test('Rules Runtime: bundle publicado index-ExwrnwAV.js conserva su lote plaintext de resale y finance antes de commercial', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const resaleRef = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const financeRef = doc(db, 'users', 'alice', 'lifeosModules', 'finance');
  const revisionRef = (id: string) => doc(db, 'users', 'alice', 'lifeosRevisions', id);
  const publishedPayload = (module: 'resale' | 'finance', revision: string, parentRevision: string | null, data: unknown) => ({
    schemaVersion: 2, syncProtocolVersion: 1, isEncrypted: false, module, data,
    revision, parentRevision, deviceId: 'published-client', clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  const initial = publishedPayload('resale', 'published-r1', null, { resale: { opportunities: [], inventory: [] } });
  const createBatch = writeBatch(db);
  createBatch.set(resaleRef, initial);
  createBatch.set(revisionRef('published-r1'), initial);
  await assertSucceeds(createBatch.commit());

  const resale = publishedPayload('resale', 'published-r2', 'published-r1', {
    resale: { opportunities: [], inventory: [{ id: 'item-1', purchaseTxId: 'purchase-1' }] },
  });
  const finance = publishedPayload('finance', 'published-f1', null, {
    finance: { transactions: [{ id: 'purchase-1', amount: 8000 }] },
  });
  const grouped = writeBatch(db);
  grouped.set(resaleRef, resale);
  grouped.set(revisionRef('published-r2'), resale);
  grouped.set(financeRef, finance);
  grouped.set(revisionRef('published-f1'), finance);
  await assertSucceeds(grouped.commit());
  assert.equal((await getDoc(resaleRef)).data()?.revision, 'published-r2');
  assert.equal((await getDoc(financeRef)).data()?.revision, 'published-f1');

  const staleResale = publishedPayload('resale', 'published-r3', 'published-r1', { resale: { opportunities: [], inventory: [] } });
  const nextFinance = publishedPayload('finance', 'published-f2', 'published-f1', { finance: { transactions: [] } });
  const staleBatch = writeBatch(db);
  staleBatch.set(resaleRef, staleResale);
  staleBatch.set(revisionRef('published-r3'), staleResale);
  staleBatch.set(financeRef, nextFinance);
  staleBatch.set(revisionRef('published-f2'), nextFinance);
  await assertFails(staleBatch.commit());
  assert.equal((await getDoc(resaleRef)).data()?.revision, 'published-r2');
  assert.equal((await getDoc(financeRef)).data()?.revision, 'published-f1');
  assert.equal((await getDoc(revisionRef('published-f2'))).exists(), false);
});

test('Rules Runtime: bundle publicado cifrado usa protocolo 2 y no puede omitir commercial protegido', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const envelope = { ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1' };
  const publishedEncrypted = (revision: string, parentRevision: string | null) => ({
    schemaVersion: 2, syncProtocolVersion: 2, isEncrypted: true, module: 'resale', data: envelope,
    revision, parentRevision, deviceId: 'published-client', clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(setDoc(ref, publishedEncrypted('encrypted-r1', null)));
  await assertSucceeds(setDoc(ref, publishedEncrypted('encrypted-r2', 'encrypted-r1')));
  await assertSucceeds(setDoc(ref, { ...protectedResalePayload('commercial-r3', 'encrypted-r2', envelope), isEncrypted: true }));
  await assertFails(setDoc(ref, publishedEncrypted('published-r4', 'commercial-r3')));
  assert.equal((await getDoc(ref)).data()?.revision, 'commercial-r3');
});

test('Rules Runtime: protocolo cifrado futuro sin marcador no admite downgrade aunque la revisión coincida', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const envelope = { ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1' };
  const future = { ...resalePayload('future-r1', null, envelope), isEncrypted: true, syncProtocolVersion: 4 };
  await assertSucceeds(setDoc(ref, future));
  const oldClient = { ...resalePayload('old-r2', 'future-r1', envelope), isEncrypted: true, syncProtocolVersion: 2 };
  await assertFails(setDoc(ref, oldClient));
  await assertFails(setDoc(ref, { ...oldClient, revision: 'stale-r2', parentRevision: 'older' }));
  const head = (await getDoc(ref)).data();
  assert.equal(head?.syncProtocolVersion, 4);
  assert.equal(head?.revision, 'future-r1');
  assert.deepEqual(head?.data, envelope);
});

test('Rules Runtime: legacy sin versión sigue operativo, pero no puede omitirla tras una versión superior', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const legacy = { ...resalePayload('legacy-r1', null) };
  delete (legacy as Partial<typeof legacy>).syncProtocolVersion;
  await assertSucceeds(setDoc(ref, legacy));
  await assertSucceeds(setDoc(ref, { ...legacy, revision: 'legacy-r2', parentRevision: 'legacy-r1' }));
  await assertSucceeds(setDoc(ref, { ...resalePayload('future-r3', 'legacy-r2'), syncProtocolVersion: 4 }));
  await assertFails(setDoc(ref, { ...legacy, revision: 'omitted-r4', parentRevision: 'future-r3' }));
  await assertFails(setDoc(ref, { ...resalePayload('zero-r4', 'future-r3'), syncProtocolVersion: 0 }));
  const head = (await getDoc(ref)).data();
  assert.equal(head?.revision, 'future-r3');
  assert.equal(head?.syncProtocolVersion, 4);
});

test('Rules Runtime: el marcador comercial protegido no puede reducirse ni quedar inválido', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const first = protectedResalePayload('commercial-r1', null);
  await assertSucceeds(setDoc(ref, first));
  const second = { ...protectedResalePayload('commercial-r2', 'commercial-r1'), commercialProtocolVersion: 2 };
  await assertSucceeds(setDoc(ref, second));
  await assertFails(setDoc(ref, protectedResalePayload('lower-r3', 'commercial-r2')));
  await assertFails(setDoc(ref, { ...second, revision: 'invalid-r3', parentRevision: 'commercial-r2', commercialProtocolVersion: '2' }));
  const head = (await getDoc(ref)).data();
  assert.equal(head?.revision, 'commercial-r2');
  assert.equal(head?.commercialProtocolVersion, 2);
});

test('Rules Runtime: un marcador comercial previo malformado no se elimina por omisión', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const envelope = { ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1' };
  const malformed = { ...protectedResalePayload('malformed-r1', null, envelope),
    isEncrypted: true, commercialProtocolVersion: 'unknown' };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'lifeosModules', 'resale'), malformed);
  });
  await assertFails(setDoc(ref, { ...resalePayload('stripped-r2', 'malformed-r1', envelope),
    isEncrypted: true, syncProtocolVersion: 3 }));
  assert.equal((await getDoc(ref)).data()?.revision, 'malformed-r1');
});

test('Rules Runtime: conservar metadatos no demuestra equivalencia del contenido cifrado', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(db, 'users', 'alice', 'lifeosModules', 'resale');
  const firstEnvelope = { ...validCryptoEnvelope, aad: 'module:resale|user:alice|cryptoVersion:1' };
  const nextEnvelope = { ...firstEnvelope, ciphertext: 'otro-cifrado-base64==' };
  await assertSucceeds(setDoc(ref, { ...protectedResalePayload('protected-r1', null, firstEnvelope), isEncrypted: true }));
  await assertSucceeds(setDoc(ref, { ...protectedResalePayload('protected-r2', 'protected-r1', nextEnvelope), isEncrypted: true }));
  assert.equal((await getDoc(ref)).data()?.data.ciphertext, nextEnvelope.ciphertext);
});

test('Rules Runtime: dos clientes conservan historiales comerciales divergentes tras rechazo y recarga local', async () => {
  // Two authenticated SDK contexts share only the emulator document, never a Firestore cache or local state.
  const dbA = testEnv.authenticatedContext('alice').firestore();
  const dbB = testEnv.authenticatedContext('alice').firestore();
  assert.notEqual(dbA, dbB);
  const path = ['users', 'alice', 'lifeosModules', 'resale'] as const;
  const refA = doc(dbA, ...path);
  const refB = doc(dbB, ...path);
  let session: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], purchases: [], productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] };
  const purchase = confirmSandboxPurchaseWithPayment(session,
    addSandboxItem(session.inventory, 'Pan', 'unit', 10, 100), { timing: 'later' });
  assert.equal(purchase.status, 'confirmed');
  if (purchase.status !== 'confirmed') throw new Error('Compra de prueba inválida');
  session = purchase.session;
  const purchaseId = session.purchases![0].id;
  const baseHistory = [{ kind: 'purchase' as const, id: purchaseId,
    effectiveOrder: '000000000001', commercialDate: '2026-10-25' }];
  const baseCapture = captureDurableCommercial({ session, recipes: [], currency: 'UYU',
    eventOrder: baseHistory, refundSources: [] });
  assert.equal(baseCapture.status, 'valid');
  if (baseCapture.status !== 'valid') throw new Error('Base comercial inválida');
  const base = defaultState();
  base.resale.commercial = baseCapture.set;
  // Emulator-only fixture: the application still forbids publishing resale.commercial.
  await assertSucceeds(setDoc(refA, protectedResalePayload('base-r', null, syncModuleData(base, 'resale'))));

  const [firstA, firstB] = await Promise.all([getDocFromServer(refA), getDocFromServer(refB)]);
  assert.equal(firstA.data()?.revision, 'base-r');
  assert.equal(firstB.data()?.revision, 'base-r');
  const localA = applySyncModule(defaultState(), 'resale', firstA.data()?.data);
  const localB = applySyncModule(defaultState(), 'resale', firstB.data()?.data);
  assert.notEqual(localA, localB);
  assert.deepEqual(localA.resale.commercial, base.resale.commercial);
  assert.deepEqual(localB.resale.commercial, base.resale.commercial);

  const branch = (state: typeof base, id: string, cents: number) => {
    const recovered = recoverDurableCommercial(JSON.stringify(state.resale.commercial));
    assert.equal(recovered.status, 'valid');
    if (recovered.status !== 'valid') throw new Error('Hidratación comercial inválida');
    const payment = confirmSandboxMoneyEvent(recovered.reconstructed.session,
      { id, purpose: 'purchase_payment', sourceId: purchaseId, amountCents: cents,
        accountRef: 'caja-simulada', finance: { mode: 'new' } });
    assert.equal(payment.status, 'confirmed');
    if (payment.status !== 'confirmed') throw new Error('Pago de prueba inválido');
    const captured = captureDurableCommercial({ session: payment.session, recipes: recovered.reconstructed.recipes,
      currency: 'UYU', refundSources: recovered.reconstructed.refundSources,
      eventOrder: [...recovered.reconstructed.eventOrder, { kind: 'money', id,
        effectiveOrder: '000000000002', commercialDate: '2026-10-25' }] });
    assert.equal(captured.status, 'valid');
    if (captured.status !== 'valid') throw new Error('Rama comercial inválida');
    state.resale.commercial = captured.set;
  };
  branch(localA, 'payment-A', 1000);
  branch(localB, 'payment-B', 2000);
  const savedStorage = globalThis.localStorage;
  const deviceBStorage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => deviceBStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { deviceBStorage.set(key, value); },
    removeItem: (key: string) => { deviceBStorage.delete(key); },
    clear: () => { deviceBStorage.clear(); },
    key: (index: number) => [...deviceBStorage.keys()][index] ?? null,
    get length() { return deviceBStorage.size; },
  } as Storage;
  try {
    assert.equal(saveStoredState(localB, 'emulator-device-B'), true);
    assert.deepEqual(loadStoredState('emulator-device-B').state.resale.commercial, localB.resale.commercial);
    // The future compatible writer's publication shape matches the existing revision transaction.
    // This is test-only and does not enable the app's commercial publisher.
    await assertSucceeds(runTransaction(dbA, async (transaction) => {
      const head = await transaction.get(refA);
      if (head.data()?.revision !== firstA.data()?.revision) throw new Error('Revisión desactualizada');
      const next = protectedResalePayload('device-A-r', 'base-r', syncModuleData(localA, 'resale'));
      transaction.set(refA, next);
      transaction.set(doc(dbA, 'users', 'alice', 'lifeosRevisions', 'device-A-r'), next);
    }));
    // B sends its original parent revision. Firestore Rules reject it even though its data is valid.
    await assertFails(setDoc(refB,
      protectedResalePayload('device-B-r', 'base-r', syncModuleData(localB, 'resale'))));
    const remote = await getDocFromServer(refB);
    assert.equal(remote.data()?.revision, 'device-A-r');
    assert.deepEqual(classifyTransactionalRevisions([{ module: 'resale', revision: firstB.data()?.revision ?? null }],
      [{ revision: remote.data()?.revision ?? null, protocol: remote.data()?.syncProtocolVersion,
        commercialProtocol: remote.data()?.commercialProtocolVersion }]),
    { diverged: ['resale'], incompatible: ['resale'] });
    assert.deepEqual(remote.data()?.data, syncModuleData(localA, 'resale'));
    assert.equal((await getDoc(doc(dbB, 'users', 'alice', 'lifeosRevisions', 'device-B-r'))).exists(), false);
    assert.deepEqual(loadStoredState('emulator-device-B').state.resale.commercial, localB.resale.commercial);
    const divergent = mergeSyncModuleWithConflicts(localB, 'resale', remote.data()?.data,
      firstB.data()?.data);
    assert.ok(divergent.conflicts.some((conflict) => conflict.entityId === 'commercial'));
    assert.deepEqual(divergent.state.resale.commercial, localB.resale.commercial);
    assert.equal(reconcileCommercialSets(localB.resale.commercial!, localA.resale.commercial!).status, 'blocked');

    const record: ResaleConflictRecord = {
      id: 'emulator-conflict-B', status: 'pending', createdAt: '2026-10-25T12:00:00Z',
      diagnostic: 'Historiales comerciales divergentes', modules: ['resale'],
      local: { resale: structuredClone(syncModuleData(localB, 'resale')) },
      base: { resale: structuredClone(firstB.data()?.data) }, baseRevisions: { resale: 'base-r' },
      remoteVersions: [],
    };
    assert.equal(saveResaleConflict('emulator-device-B', addRemoteResaleVersion(record,
      { resale: remote.data()?.data }, { resale: 'device-A-r' })), true);
    const reloaded = loadResaleConflict('emulator-device-B');
    assert.equal(reloaded.status, 'loaded');
    if (reloaded.status !== 'loaded') throw new Error('Conflicto local no recuperado');
    assert.deepEqual(reloaded.record.local.resale, syncModuleData(localB, 'resale'));
    assert.deepEqual(reloaded.record.remoteVersions[0].data.resale, syncModuleData(localA, 'resale'));
    for (const version of [loadStoredState('emulator-device-B').state.resale.commercial,
      applySyncModule(defaultState(), 'resale', reloaded.record.remoteVersions[0].data.resale).resale.commercial]) {
      const result = recoverDurableCommercial(JSON.stringify(version));
      assert.equal(result.status, 'valid');
      if (result.status === 'valid') assert.equal(result.reconstructed.session.moneyEvents?.length, 1);
    }
    assert.equal(readStoredCommercial(loadStoredState('emulator-device-B').state).status, 'valid');
    assert.equal(saveStoredState(localA, 'emulator-device-B'), false);
  } finally {
    if (savedStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
    else globalThis.localStorage = savedStorage;
  }
});

test('Rules Runtime: cliente legacy y compatible comparten revisión sin poder degradar un documento protegido', async () => {
  const legacyDb = testEnv.authenticatedContext('alice').firestore();
  const compatibleDb = testEnv.authenticatedContext('alice').firestore();
  assert.notEqual(legacyDb, compatibleDb);
  const legacyRef = doc(legacyDb, 'users', 'alice', 'lifeosModules', 'resale');
  const compatibleRef = doc(compatibleDb, 'users', 'alice', 'lifeosModules', 'resale');
  await assertSucceeds(setDoc(legacyRef, resalePayload('legacy-r1', null)));
  const legacyRead = await getDocFromServer(legacyRef);
  const compatibleRead = await getDocFromServer(compatibleRef);
  assert.equal(legacyRead.data()?.revision, compatibleRead.data()?.revision);
  await assertSucceeds(setDoc(legacyRef, resalePayload('legacy-r2', 'legacy-r1')));
  await assertSucceeds(setDoc(compatibleRef, protectedResalePayload('protected-r3', 'legacy-r2')));
  const protectedHead = (await getDocFromServer(compatibleRef)).data();
  assert.equal(protectedHead?.revision, 'protected-r3');
  await assertFails(setDoc(legacyRef, resalePayload('legacy-current-r4', 'protected-r3')));
  await assertFails(setDoc(legacyRef, resalePayload('legacy-stale-r4', 'legacy-r1')));
  assert.deepEqual((await getDocFromServer(compatibleRef)).data()?.data, protectedHead?.data);
  await assertSucceeds(setDoc(compatibleRef,
    protectedResalePayload('protected-r4', 'protected-r3', protectedHead?.data)));
  const finalHead = (await getDocFromServer(legacyRef)).data();
  assert.equal(finalHead?.revision, 'protected-r4');
  assert.deepEqual(finalHead?.data, protectedHead?.data);
});
