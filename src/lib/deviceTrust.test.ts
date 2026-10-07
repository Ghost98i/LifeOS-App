import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enrollDevice,
  tryUnlockWithDeviceTrust,
  isDeviceEnrolled,
  forgetDeviceTrust,
  _resetDeviceTrustFallbackStore,
  buildDeviceTrustAad,
} from './deviceTrust';
import {
  generateMdek,
  exportRawKey,
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  cryptoSession,
  decryptPayload,
  encryptPayload,
} from './cryptoCore';

// Polyfill localStorage for node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

test('Device Trust: buildDeviceTrustAad generates expected contextual tag', () => {
  const aad1 = buildDeviceTrustAad('user_123');
  assert.equal(aad1, 'deviceTrustVersion:1|userId:user_123');

  const aad2 = buildDeviceTrustAad('');
  assert.equal(aad2, 'deviceTrustVersion:1|userId:local');
});

test('Device Trust: enrollDevice and tryUnlockWithDeviceTrust roundtrip with CryptoKey', async () => {
  _resetDeviceTrustFallbackStore();
  const userId = 'user_test_roundtrip_1';

  // Generate an extractable MDEK for test
  const mdek = await generateMdek();

  // Before enrolling: device is not enrolled, tryUnlock is null
  const isEnrolledBefore = await isDeviceEnrolled(userId);
  assert.equal(isEnrolledBefore, false);
  const beforeUnlock = await tryUnlockWithDeviceTrust(userId);
  assert.equal(beforeUnlock, null);

  // Enroll device
  await enrollDevice(userId, mdek);

  // Verify enrolled
  const isEnrolledAfter = await isDeviceEnrolled(userId);
  assert.equal(isEnrolledAfter, true);

  // Try unlock (simulating reload/reopen)
  const unlockedKey = await tryUnlockWithDeviceTrust(userId);
  assert.ok(unlockedKey, 'Should return CryptoKey');
  assert.equal(unlockedKey.extractable, false, 'Operational session key must be unextractable');
  assert.equal(unlockedKey.algorithm.name, 'AES-GCM');

  // Verify unlocked key can actually encrypt/decrypt payload identically to original MDEK
  const testAad = 'test-aad-roundtrip';
  const ciphertextEnv = await encryptPayload({ secret: 'lifeos-rules' }, mdek, testAad);
  const decrypted = await decryptPayload(ciphertextEnv, unlockedKey, testAad);
  assert.deepEqual(decrypted, { secret: 'lifeos-rules' });
});

test('Device Trust: enrollDevice with raw bytes Uint8Array', async () => {
  _resetDeviceTrustFallbackStore();
  const userId = 'user_test_raw_bytes';

  const mdek = await generateMdek();
  const rawBytes = await exportRawKey(mdek);

  await enrollDevice(userId, rawBytes);

  const unlockedKey = await tryUnlockWithDeviceTrust(userId);
  assert.ok(unlockedKey);

  const testEnv = await encryptPayload({ hello: 'world' }, mdek, 'aad');
  const decrypted = await decryptPayload(testEnv, unlockedKey, 'aad');
  assert.deepEqual(decrypted, { hello: 'world' });
});

test('Device Trust: forgetDeviceTrust cleanly revokes trust and deletes keys', async () => {
  _resetDeviceTrustFallbackStore();
  const userId = 'user_test_forget';

  const mdek = await generateMdek();
  await enrollDevice(userId, mdek);

  assert.equal(await isDeviceEnrolled(userId), true);
  assert.ok(await tryUnlockWithDeviceTrust(userId));

  // Forget device
  await forgetDeviceTrust(userId);

  assert.equal(await isDeviceEnrolled(userId), false);
  const afterForget = await tryUnlockWithDeviceTrust(userId);
  assert.equal(afterForget, null);
});

test('Device Trust: user binding mismatch returns null (cannot unlock for different user)', async () => {
  _resetDeviceTrustFallbackStore();
  const userA = 'user_alice';
  const userB = 'user_bob';

  const mdek = await generateMdek();
  await enrollDevice(userA, mdek);

  // Bob attempts to unlock device using Alice's record
  const bobUnlocked = await tryUnlockWithDeviceTrust(userB);
  assert.equal(bobUnlocked, null);
});

test('Device Trust: provisionZeroKnowledgeKeys automatically enrolls device', async () => {
  _resetDeviceTrustFallbackStore();
  const userId = 'user_provision_auto_enroll';

  const provisioned = await provisionZeroKnowledgeKeys(userId);
  assert.ok(provisioned.sessionMdek);
  assert.ok(provisioned.recoveryKeyFormatted);

  // Verify device was automatically enrolled
  assert.equal(await isDeviceEnrolled(userId), true);

  // Verify tryUnlockWithDeviceTrust works without entering Recovery Key
  const autoUnlockedKey = await tryUnlockWithDeviceTrust(userId);
  assert.ok(autoUnlockedKey);
  assert.equal(autoUnlockedKey.extractable, false);

  // Test encryption/decryption with auto-unlocked key
  const env = await encryptPayload({ balance: 5000 }, provisioned.sessionMdek, 'finance-aad');
  const dec = await decryptPayload(env, autoUnlockedKey, 'finance-aad');
  assert.deepEqual(dec, { balance: 5000 });
});

test('Device Trust: unlockMdekWithRecoveryKey with userId automatically enrolls device', async () => {
  _resetDeviceTrustFallbackStore();
  const userId = 'user_second_device_enroll';

  // 1. Initial provision on Device A
  const provisioned = await provisionZeroKnowledgeKeys(userId);

  // 2. Simulate Device B: clear device trust store (new browser)
  _resetDeviceTrustFallbackStore();
  assert.equal(await isDeviceEnrolled(userId), false);

  // Device B unlocks using Recovery Key and specifies userId
  const unlockedOnDeviceB = await unlockMdekWithRecoveryKey(
    provisioned.recoveryKeyFormatted,
    provisioned.envelope,
    userId
  );
  assert.ok(unlockedOnDeviceB);

  // Device B is now enrolled!
  assert.equal(await isDeviceEnrolled(userId), true);

  // Reload simulation on Device B: does NOT require recovery key
  cryptoSession.lock();
  assert.equal(cryptoSession.isUnlocked(userId), false);

  const reloadedKey = await tryUnlockWithDeviceTrust(userId);
  assert.ok(reloadedKey);
  cryptoSession.setUnlocked(reloadedKey, userId);
  assert.equal(cryptoSession.isUnlocked(userId), true);
});
