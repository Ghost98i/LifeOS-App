import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommercialSet } from './commercialContract';
import { assertFreshCommercialWriteCapability, CommercialWriteCapabilityUnavailable, ResaleProtocolConflict,
  writeAllCloudModules, writeCloudModules, writeCloudModulesAsync } from './cloudSync';
import { decodeCloudModuleData, encryptSyncModule, generateMdek } from './cryptoCore';
import { addRemoteResaleVersion, loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './resaleConflictRecovery';
import { previewResaleCommercialMerge } from './syncMerge';
import { applySyncModule, buildStateFromModules } from './syncModel';
import { commercialHydrationBlock, changesStoredCommercial, defaultState, getStorageKey, hasPersistedCommercial,
  hasMeaningfulData, inspectBackupJSON, loadRecoveryState, loadStoredState, parseBackupJSON,
  readStoredCommercial, saveRecoveryState, saveStoredState } from './storage';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
} as Storage;

const business = (): CommercialSet => ({
  items: [], operations: [], movements: [],
  business: { version: 1, currency: 'UYU', finished: { items: [], operations: [], movements: [] },
    recipes: [], purchases: [], productions: [], sales: [], finishedWastes: [], saleCorrections: [],
    moneyEvents: [], refundSources: [], financeLinks: [], eventOrder: [] },
});

test('legacy loads without creating business; a valid sidecar hydrates through local, backup and module paths', () => {
  const user = 'commercial-hydration-valid';
  const legacy = defaultState();
  assert.equal(readStoredCommercial(legacy).status, 'absent');
  assert.equal(hasMeaningfulData(legacy), false);
  const state = defaultState();
  state.resale.commercial = business();
  assert.equal(readStoredCommercial(state).status, 'valid');
  assert.equal(hasMeaningfulData(state), true);
  assert.equal(saveStoredState(state, user), true);
  assert.equal(hasPersistedCommercial(user), true);
  const local = loadStoredState(user).state;
  assert.deepEqual(local.resale.commercial, state.resale.commercial);
  assert.ok(readStoredCommercial(local).reconstructed);
  assert.equal(saveRecoveryState(state, user), true);
  assert.deepEqual(loadRecoveryState(user)?.state.resale.commercial, state.resale.commercial);
  const backup = JSON.stringify({ state });
  assert.deepEqual(parseBackupJSON(backup).resale.commercial, state.resale.commercial);
  assert.equal(inspectBackupJSON(backup).warnings.some((warning) => warning.includes('Mi negocio contiene')), false);
  const fromModule = buildStateFromModules({ resale: { resale: state.resale } });
  assert.deepEqual(fromModule.resale.commercial, state.resale.commercial);
  assert.equal(commercialHydrationBlock(legacy, fromModule), null);
  assert.equal(commercialHydrationBlock(local, fromModule), null);
});

test('invalid durable data survives each read path, cannot be reconstructed or replaced by a later save', () => {
  const user = 'commercial-hydration-invalid';
  const state = defaultState();
  const invalid = business();
  invalid.business!.currency = '';
  state.resale.commercial = invalid;
  assert.equal(saveStoredState(state, user), true);
  const loaded = loadStoredState(user).state;
  const read = readStoredCommercial(loaded);
  assert.equal(read.status, 'blocked');
  assert.equal(read.reconstructed, null);
  assert.ok(read.issues.some((issue) => issue.code === 'invalid_version_or_currency'));
  assert.deepEqual(read.original, invalid);
  assert.equal(saveRecoveryState(loaded, user), true);
  assert.deepEqual(loadRecoveryState(user)?.state.resale.commercial, invalid);
  assert.equal(saveRecoveryState(defaultState(), user), false);
  assert.deepEqual(loadRecoveryState(user)?.state.resale.commercial, invalid);
  const backup = JSON.stringify({ state });
  assert.deepEqual(parseBackupJSON(backup).resale.commercial, invalid);
  assert.ok(inspectBackupJSON(backup).warnings.some((warning) => warning.includes('invalid_version_or_currency')));
  const hydrated = applySyncModule(defaultState(), 'resale', { resale: state.resale });
  assert.deepEqual(hydrated.resale.commercial, invalid);
  assert.ok(commercialHydrationBlock(defaultState(), hydrated));
  const unrelated = structuredClone(loaded);
  unrelated.settings.darkMode = !unrelated.settings.darkMode;
  assert.equal(saveStoredState(unrelated, user), true);
  assert.deepEqual(loadStoredState(user).state.resale.commercial, invalid);
  const stripped = structuredClone(unrelated);
  delete stripped.resale.commercial;
  assert.equal(changesStoredCommercial(unrelated, stripped), true);
  assert.equal(saveStoredState(stripped, user), false);
  assert.equal(hasPersistedCommercial(user), true);
  assert.deepEqual(JSON.parse(store.get(getStorageKey(user))!).resale.commercial, invalid);
  assert.ok(commercialHydrationBlock(unrelated, stripped));
});

test('unknown business version, null business and divergent histories remain blocked', () => {
  const left = defaultState();
  left.resale.commercial = business();
  const right = structuredClone(left);
  right.resale.commercial!.business!.currency = 'USD';
  assert.ok(commercialHydrationBlock(left, right));
  const preview = previewResaleCommercialMerge(left.resale, right.resale);
  assert.equal(preview?.status, 'blocked');
  if (preview?.status === 'blocked') {
    assert.deepEqual(preview.left, left.resale.commercial);
    assert.deepEqual(preview.right, right.resale.commercial);
  }
  const unknown = structuredClone(left);
  (unknown.resale.commercial!.business as { version: number }).version = 2;
  assert.equal(readStoredCommercial(unknown).status, 'blocked');
  const nullBusiness = structuredClone(left);
  (nullBusiness.resale.commercial as unknown as { business: unknown }).business = null;
  assert.equal(readStoredCommercial(nullBusiness).status, 'blocked');
  assert.throws(() => writeCloudModules('isolated', left, ['resale', 'finance'], 'device', {}), ResaleProtocolConflict);
  assert.equal(left.finance.transactions.length, 0);
});

test('direct publication entry points keep resale.commercial blocked before touching Finance', async () => {
  const state = defaultState();
  state.resale.commercial = business();
  const financeBefore = structuredClone(state.finance);

  assert.throws(() => writeCloudModules('commercial-disabled', state, ['resale'], 'device', {}), ResaleProtocolConflict);
  assert.throws(() => writeAllCloudModules('commercial-disabled', state, 'device', {}), ResaleProtocolConflict);
  await assert.rejects(writeCloudModulesAsync('commercial-disabled', state, ['resale'], 'device', {}), ResaleProtocolConflict);
  assert.deepEqual(state.finance, financeBefore);
  assert.equal(readStoredCommercial(state).status, 'valid');
});

test('commercial write capability fails closed on absence, disablement, invalid data, cache or read failure', async () => {
  const enabled = { enabled: true, commercialProtocolVersion: 1, minimumSyncProtocolVersion: 3 };
  await assertFreshCommercialWriteCapability(async () => ({ exists: true, data: enabled, fromCache: false }));
  const blocked = [
    { exists: false, fromCache: false },
    { exists: true, data: { ...enabled, enabled: false }, fromCache: false },
    { exists: true, data: { enabled: true }, fromCache: false },
    { exists: true, data: { ...enabled, minimumSyncProtocolVersion: 2 }, fromCache: false },
    { exists: true, data: enabled, fromCache: true },
  ];
  for (const response of blocked) {
    await assert.rejects(assertFreshCommercialWriteCapability(async () => response), CommercialWriteCapabilityUnavailable);
  }
  await assert.rejects(assertFreshCommercialWriteCapability(async () => { throw new Error('network unavailable'); }),
    CommercialWriteCapabilityUnavailable);
});

test('pending local resale and finance survive a divergent remote revision and reload', () => {
  const user = 'commercial-transition-conflict';
  const local = defaultState();
  local.resale.commercial = business();
  const remote = structuredClone(local);
  remote.resale.commercial!.business!.currency = 'USD';
  assert.equal(saveStoredState(local, user), true);
  assert.ok(commercialHydrationBlock(local, remote));
  const record: ResaleConflictRecord = {
    id: 'commercial-conflict-1', status: 'pending', createdAt: '2026-10-23T12:00:00Z',
    diagnostic: 'Historial comercial divergente', modules: ['resale', 'finance'],
    local: { resale: { resale: local.resale }, finance: { finance: local.finance } },
    base: {}, baseRevisions: { resale: 'base-r', finance: 'base-f' }, remoteVersions: [],
  };
  const pending = addRemoteResaleVersion(record,
    { resale: { resale: remote.resale }, finance: { finance: remote.finance } },
    { resale: 'remote-r', finance: 'remote-f' });
  assert.equal(saveResaleConflict(user, pending), true);
  const reloaded = loadResaleConflict(user);
  assert.equal(reloaded.status, 'loaded');
  if (reloaded.status === 'loaded') {
    assert.deepEqual(reloaded.record.local.resale, record.local.resale);
    assert.deepEqual(reloaded.record.remoteVersions[0].data.resale, { resale: remote.resale });
    assert.deepEqual(reloaded.record.modules, ['resale', 'finance']);
  }
  assert.deepEqual(loadStoredState(user).state.resale.commercial, local.resale.commercial);
  assert.equal(saveStoredState(remote, user), false);
  assert.equal(saveResaleConflict(user, pending, { getItem: () => null, setItem: () => { throw new Error('quota'); } }), false);
  assert.equal(loadResaleConflict(user).status, 'loaded');
});

test('encrypted commercial payload is inspected only after authorized decryption', async () => {
  const user = 'commercial-encrypted-transition';
  const state = defaultState();
  state.resale.commercial = business();
  const key = await generateMdek();
  const envelope = await encryptSyncModule({ resale: state.resale }, key, 'resale', user);
  const locked = await decodeCloudModuleData(envelope, 'resale', user, null);
  assert.equal(locked.mode, 'locked');
  const decoded = await decodeCloudModuleData(envelope, 'resale', user, key);
  assert.equal(decoded.mode, 'decrypted');
  if (decoded.mode === 'decrypted') {
    const hydrated = applySyncModule(defaultState(), 'resale', decoded.data);
    assert.equal(readStoredCommercial(hydrated).status, 'valid');
    assert.deepEqual(hydrated.resale.commercial, state.resale.commercial);
  }
});
