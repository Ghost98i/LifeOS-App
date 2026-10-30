import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReadableCloudModule, CloudProtocolConflict, cloudStatusWithLocalChanges } from './cloudSync';
import { generateMdek, encryptSyncModule } from './cryptoCore';

test('La confirmación remota no oculta publicaciones nuevas, errores ni conflictos locales', () => {
  const idle = { queued: false, pending: false, failed: false, blocked: false };
  assert.equal(cloudStatusWithLocalChanges('synced', idle), 'synced');
  for (const key of ['queued', 'pending'] as const) {
    assert.equal(cloudStatusWithLocalChanges('synced', { ...idle, [key]: true }), 'saving');
  }
  assert.equal(cloudStatusWithLocalChanges('synced', { ...idle, queued: true, failed: true }), 'error');
  assert.equal(cloudStatusWithLocalChanges('synced', { ...idle, failed: true, blocked: true }), 'conflict');
  assert.equal(cloudStatusWithLocalChanges('offline', { ...idle, queued: true }), 'offline');
  assert.equal(cloudStatusWithLocalChanges('locked', { ...idle, queued: true }), 'locked');
});

test('Lecturas cloud rechazan protocolos futuros, metadatos inválidos y ciphertext malformado', () => {
  const head = { revision: 'revision-a', data: { notes: {} }, syncProtocolVersion: 1, isEncrypted: false };
  assert.doesNotThrow(() => assertReadableCloudModule('notes', head));
  for (const changed of [
    { syncProtocolVersion: 9 }, { syncProtocolVersion: '2' }, { syncProtocolVersion: 0 },
    { revision: '' }, { revision: null }, { isEncrypted: true }, { syncProtocolVersion: 2 },
    { commercialProtocolVersion: 1 },
  ]) assert.throws(() => assertReadableCloudModule('notes', { ...head, ...changed }), CloudProtocolConflict);
});

test('Lecturas cloud aceptan E2EE 2 y limitan protocolo comercial 3 a resale/finance', async () => {
  const data = await encryptSyncModule({ finance: {} }, await generateMdek(), 'finance', 'synthetic');
  const encrypted = { revision: 'revision-a', data, syncProtocolVersion: 2, isEncrypted: true };
  assert.doesNotThrow(() => assertReadableCloudModule('finance', encrypted));
  const commercial = { ...encrypted, syncProtocolVersion: 3, commercialProtocolVersion: 1 };
  assert.doesNotThrow(() => assertReadableCloudModule('resale', commercial));
  assert.doesNotThrow(() => assertReadableCloudModule('finance', commercial));
  assert.throws(() => assertReadableCloudModule('gym', commercial), CloudProtocolConflict);
  assert.throws(() => assertReadableCloudModule('finance', { ...commercial, data: { ciphertext: 'incompleto' } }), CloudProtocolConflict);
});
