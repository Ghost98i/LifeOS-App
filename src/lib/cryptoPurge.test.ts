import assert from 'node:assert/strict';
import test from 'node:test';
import {
  provisionZeroKnowledgeKeys,
  encryptSyncModule,
} from './cryptoCore';
import {
  inventoryCloudPlaintext,
  executeCloudPlaintextPurge,
  type PurgeStorageHandlers,
} from './cryptoPurge';
import { defaultState, loadRecoveryState } from './storage';
import { SYNC_MODULES, syncModuleData } from './syncModel';

// Ensure in-memory localStorage is active for Node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  } as any;
}

test('Fase 8.4: Plaintext Inventory — Detecta estado monolítico v1 y revisiones en texto plano', async () => {
  const userId = 'user-inventory-test';

  let hasLegacy = true;
  let revisions = ['rev-plaintext-1', 'rev-plaintext-2'];

  const handlers: PurgeStorageHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    hasLegacyState: async () => hasLegacy,
    getPlaintextRevisions: async () => revisions,
  };

  const inventory = await inventoryCloudPlaintext(userId, null, handlers);
  assert.equal(inventory.hasLegacyMonolithicState, true);
  assert.equal(inventory.plaintextRevisionsCount, 2);
  assert.equal(inventory.isClean, false);

  // Simular limpieza
  hasLegacy = false;
  revisions = [];
  const cleanInventory = await inventoryCloudPlaintext(userId, null, handlers);
  assert.equal(cleanInventory.isClean, true);
});

test('Fase 8.4: Cloud Plaintext Purge — Deniega purga si la cuenta no está en estado "encrypted"', async () => {
  const userId = 'user-purge-denied-capability';
  const { sessionMdek } = await provisionZeroKnowledgeKeys(userId);
  const state = defaultState();

  const handlers: PurgeStorageHandlers = {
    getCapability: async () => ({
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'mixed', // No es 'encrypted'
      encryptedModules: ['profile'],
      updatedAt: new Date().toISOString(),
    }),
    setCapability: async () => {},
  };

  await assert.rejects(
    async () => {
      await executeCloudPlaintextPurge(userId, sessionMdek, state, null, handlers);
    },
    /Purga denegada por seguridad: La cuenta no está completamente en estado 'encrypted'/
  );
});

test('Fase 8.4: Cloud Plaintext Purge — Deniega purga si algún módulo en la nube falla al descifrarse', async () => {
  const userId = 'user-purge-denied-decrypt';
  const { sessionMdek } = await provisionZeroKnowledgeKeys(userId);
  const state = defaultState();

  // Provisionar una segunda clave distinta para corromper/mismatch el cifrado de un módulo
  const { sessionMdek: wrongMdek } = await provisionZeroKnowledgeKeys('other-user');

  const cloudModules = new Map<string, any>();
  for (const mod of SYNC_MODULES) {
    const data = syncModuleData(state, mod);
    // Cifrar 'gym' con wrongMdek
    const keyToUse = mod === 'gym' ? wrongMdek : sessionMdek;
    const envelope = await encryptSyncModule(data, keyToUse, mod, userId);
    cloudModules.set(mod, { isEncrypted: true, data: envelope });
  }

  const { envelope: keyEnv } = await provisionZeroKnowledgeKeys(userId);

  const handlers: PurgeStorageHandlers = {
    getCapability: async () => ({
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: [...SYNC_MODULES],
      updatedAt: new Date().toISOString(),
    }),
    setCapability: async () => {},
    getKeyEnvelope: async () => keyEnv,
    getModule: async (_u, m) => cloudModules.get(m) || null,
  };

  await assert.rejects(
    async () => {
      await executeCloudPlaintextPurge(userId, sessionMdek, state, null, handlers);
    },
    /falló al descifrarse/
  );
});

test('Fase 8.4: Cloud Plaintext Purge — Flujo exitoso: Snapshot local, purga v1, purga revisiones, estado limpio', async () => {
  const userId = 'user-purge-success';
  const { sessionMdek } = await provisionZeroKnowledgeKeys(userId);
  const state = defaultState();
  state.profile.name = 'Usuario Seguro LifeOS';

  // Preparar los 15 módulos correctamente cifrados
  const cloudModules = new Map<string, any>();
  for (const mod of SYNC_MODULES) {
    const data = syncModuleData(state, mod);
    const envelope = await encryptSyncModule(data, sessionMdek, mod, userId);
    cloudModules.set(mod, { isEncrypted: true, data: envelope });
  }

  const { envelope: keyEnv } = await provisionZeroKnowledgeKeys(userId);

  let hasLegacy = true;
  let revisions = ['rev-plaintext-1', 'rev-plaintext-2'];

  const handlers: PurgeStorageHandlers = {
    getCapability: async () => ({
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: [...SYNC_MODULES],
      updatedAt: new Date().toISOString(),
    }),
    setCapability: async () => {},
    getKeyEnvelope: async () => keyEnv,
    getModule: async (_u, m) => cloudModules.get(m) || null,
    hasLegacyState: async () => hasLegacy,
    deleteLegacyState: async () => {
      hasLegacy = false;
    },
    getPlaintextRevisions: async () => revisions,
    deleteRevision: async (_u, revId) => {
      revisions = revisions.filter((r) => r !== revId);
    },
  };

  const result = await executeCloudPlaintextPurge(userId, sessionMdek, state, null, handlers);

  assert.equal(result.success, true);
  assert.equal(result.purgedLegacyMonolithicState, true);
  assert.equal(result.purgedRevisionsCount, 2);
  assert.equal(result.remainingPlaintextCount, 0);
  assert.equal(result.safetySnapshotSaved, true);

  // Verificar snapshot de seguridad local guardado
  const rec = loadRecoveryState(userId);
  assert.ok(rec !== null);
  assert.equal(rec.state.profile.name, 'Usuario Seguro LifeOS');
  assert.ok(rec.meta.description.includes('purga de plaintext'));
});
