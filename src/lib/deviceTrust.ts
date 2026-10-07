/**
 * Device Trust Subsystem (E2EE Device Enrollment & Persistent Trust)
 *
 * Implements browser/device trust via WebCrypto & IndexedDB:
 * - A non-extractable Device Wrapping Key (DWK, AES-GCM 256-bit) is generated per device/browser.
 * - When enrolled (via provisioning, recovery key unlock, or rotation), the MDEK is wrapped
 *   under this DWK with strict user binding AAD and stored in IndexedDB.
 * - On session reload (F5, reopen tab, browser restart, PC restart), LifeOS retrieves the DWK
 *   from IndexedDB, unwraps the MDEK directly into an unextractable session CryptoKey,
 *   and restores operational cryptoSession without asking the user for their Recovery Key.
 * - Forgetting the device or clearing browser storage cleanly revokes the trust.
 * - Transparent fallback store for Node.js test environments.
 */

import { base64ToBytes, bytesToBase64 } from './cryptoCore';

export const DEVICE_TRUST_DB_NAME = 'lifeos-device-keystore';
export const DEVICE_TRUST_STORE_NAME = 'device_keys';
export const DEVICE_TRUST_DB_VERSION = 1;

export interface DeviceTrustRecord {
  userId: string;
  dwk: CryptoKey; // Non-extractable AES-GCM 256 key
  wrappedMdekCiphertext: string; // Base64
  wrappedMdekIv: string; // Base64
  aad: string;
  enrolledAt: string;
  deviceKeyFormatVersion: 1;
}

// In-memory fallback map for non-browser/Node.js testing environments where indexedDB is undefined
const fallbackStore = new Map<string, DeviceTrustRecord>();

/**
 * Checks if IndexedDB is supported and usable in current execution context.
 */
function isIndexedDBAvailable(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined';
}

/**
 * Context-bound AAD string for device-wrapped MDEK
 */
export function buildDeviceTrustAad(userId: string): string {
  const userTag = (userId || 'local').trim();
  return `deviceTrustVersion:1|userId:${userTag}`;
}

/**
 * Opens or initializes the IndexedDB store for device keys.
 */
function openDeviceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB no está disponible en este entorno.'));
      return;
    }

    const request = indexedDB.open(DEVICE_TRUST_DB_NAME, DEVICE_TRUST_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_TRUST_STORE_NAME)) {
        db.createObjectStore(DEVICE_TRUST_STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error al abrir la base de datos de claves de dispositivo.'));
  });
}

/**
 * Stores a DeviceTrustRecord in IndexedDB or fallback store.
 */
async function saveDeviceRecord(record: DeviceTrustRecord): Promise<void> {
  if (!isIndexedDBAvailable()) {
    fallbackStore.set(record.userId, record);
    return;
  }

  const db = await openDeviceDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(DEVICE_TRUST_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DEVICE_TRUST_STORE_NAME);
      const putReq = store.put(record);

      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error || new Error('Error al guardar credencial de dispositivo.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Retrieves a DeviceTrustRecord for a specific user from IndexedDB or fallback store.
 */
async function loadDeviceRecord(userId: string): Promise<DeviceTrustRecord | null> {
  if (!isIndexedDBAvailable()) {
    return fallbackStore.get(userId) || null;
  }

  try {
    const db = await openDeviceDatabase();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(DEVICE_TRUST_STORE_NAME, 'readonly');
        const store = tx.objectStore(DEVICE_TRUST_STORE_NAME);
        const getReq = store.get(userId);

        getReq.onsuccess = () => {
          const res = getReq.result as DeviceTrustRecord | undefined;
          resolve(res || null);
        };
        getReq.onerror = () => reject(getReq.error || new Error('Error al consultar credencial de dispositivo.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  } catch (e) {
    console.warn('[DeviceTrust] Error accediendo a IndexedDB:', e);
    return null;
  }
}

/**
 * Deletes a DeviceTrustRecord for a specific user from IndexedDB or fallback store.
 */
async function deleteDeviceRecord(userId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    fallbackStore.delete(userId);
    return;
  }

  try {
    const db = await openDeviceDatabase();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(DEVICE_TRUST_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DEVICE_TRUST_STORE_NAME);
        const delReq = store.delete(userId);

        delReq.onsuccess = () => resolve();
        delReq.onerror = () => reject(delReq.error || new Error('Error al eliminar credencial de dispositivo.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  } catch (e) {
    console.warn('[DeviceTrust] Error eliminando de IndexedDB:', e);
  }
}

/**
 * Generates a non-extractable Device Wrapping Key (DWK).
 * AES-GCM 256 bits, extractable: false.
 * WebCrypto blocks exporting this key from JS memory.
 */
async function generateDeviceWrappingKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API no disponible.');
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Enrolls the current device/browser for the given user:
 * 1. Generates a fresh non-extractable Device Wrapping Key (DWK).
 * 2. Wraps the provided session MDEK under the DWK using AES-GCM with context AAD.
 * 3. Saves the DWK and wrapped MDEK in IndexedDB bound to userId.
 *
 * NOTE: The input `mdek` must be wrapKey-permitted or raw-compatible. If `mdek` is already
 * imported as non-extractable, we can also wrap it if it has 'wrapKey' or if provided as
 * an exportable key during unlock/provisioning.
 */
export async function enrollDevice(
  userId: string,
  rawMdekBytesOrKey: Uint8Array | CryptoKey
): Promise<void> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API no disponible.');
  const targetUser = (userId || 'local').trim();

  const dwk = await generateDeviceWrappingKey();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const aad = buildDeviceTrustAad(targetUser);

  let wrappedBuffer: ArrayBuffer;

  if (rawMdekBytesOrKey instanceof Uint8Array) {
    // If raw bytes are passed (e.g. during provisioning or right after derivation before zeroing),
    // import as transient wrap-target key and wrap, or encrypt directly
    const transientKey = await subtle.importKey(
      'raw',
      rawMdekBytesOrKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    wrappedBuffer = await subtle.wrapKey(
      'raw',
      transientKey,
      dwk,
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(aad),
      }
    );
  } else {
    // If CryptoKey is passed
    wrappedBuffer = await subtle.wrapKey(
      'raw',
      rawMdekBytesOrKey,
      dwk,
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(aad),
      }
    );
  }

  const record: DeviceTrustRecord = {
    userId: targetUser,
    dwk,
    wrappedMdekCiphertext: bytesToBase64(new Uint8Array(wrappedBuffer)),
    wrappedMdekIv: bytesToBase64(iv),
    aad,
    enrolledAt: new Date().toISOString(),
    deviceKeyFormatVersion: 1,
  };

  await saveDeviceRecord(record);
}

/**
 * Attempts to unlock the MDEK using trusted device credentials:
 * 1. Reads the DeviceTrustRecord from IndexedDB for the given user.
 * 2. Unwraps the MDEK with the stored DWK into an unextractable session CryptoKey (extractable: false).
 * 3. Returns the operational session MDEK, or null if not enrolled, corrupt, or user mismatch.
 */
export async function tryUnlockWithDeviceTrust(
  userId: string
): Promise<CryptoKey | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const targetUser = (userId || 'local').trim();

  const record = await loadDeviceRecord(targetUser);
  if (!record) return null;

  // Security check: verify AAD user binding matches requested user
  const expectedAad = buildDeviceTrustAad(targetUser);
  if (record.aad !== expectedAad || record.userId !== targetUser) {
    console.warn('[DeviceTrust] AAD mismatch o usuario incorrecto en credencial de dispositivo.');
    return null;
  }

  try {
    const iv = base64ToBytes(record.wrappedMdekIv);
    const ciphertext = base64ToBytes(record.wrappedMdekCiphertext);

    // Unwrap into non-extractable session key with AES-GCM usage ['encrypt', 'decrypt']
    const sessionMdek = await subtle.unwrapKey(
      'raw',
      ciphertext,
      record.dwk,
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(expectedAad),
      },
      { name: 'AES-GCM', length: 256 },
      false, // extractable: false (unextractable session key)
      ['encrypt', 'decrypt']
    );

    return sessionMdek;
  } catch (err) {
    console.warn('[DeviceTrust] Fallo al desenvolver clave con confianza de dispositivo:', err);
    return null;
  }
}

/**
 * Checks if the current browser/device is enrolled for the user.
 */
export async function isDeviceEnrolled(userId: string): Promise<boolean> {
  const targetUser = (userId || 'local').trim();
  const record = await loadDeviceRecord(targetUser);
  return Boolean(record);
}

/**
 * Revokes device trust for the given user:
 * Deletes the DWK and wrapped MDEK from IndexedDB.
 */
export async function forgetDeviceTrust(userId: string): Promise<void> {
  const targetUser = (userId || 'local').trim();
  await deleteDeviceRecord(targetUser);
}

/**
 * Resets fallback store (useful in automated tests)
 */
export function _resetDeviceTrustFallbackStore(): void {
  fallbackStore.clear();
}
