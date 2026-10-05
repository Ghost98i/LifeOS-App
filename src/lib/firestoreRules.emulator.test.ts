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
import { resolve } from 'node:path';
import test, { before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const PROJECT_ID = 'lifeos-rules-testing';
let testEnv: RulesTestEnvironment;

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
