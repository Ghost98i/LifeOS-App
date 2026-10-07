/**
 * LifeOS — Zero-Knowledge Cryptographic Foundation (Fase 8 & 8.1)
 *
 * Implements authenticated encryption (AEAD) primitives, Base58Check Recovery Key encoding,
 * non-extractable session key management, and WrappedKeyEnvelope lifecycle using native Web Crypto API.
 *
 * Standards & Principles:
 * - Cipher: AES-256-GCM with 96-bit random IV and 128-bit authentication tag (NIST SP 800-38D).
 * - KDF (Recovery Key): HKDF with HMAC-SHA-256 (RFC 5869). Tailored for high-entropy random keys (256 bits).
 * - KDF (Passphrase): PBKDF2 with HMAC-SHA-256, 600,000 iterations (OWASP recommendation). Reserved for human passwords.
 * - Recovery Key: LifeOS format based on Base58Check (256 bits CSPRNG entropy + 4 bytes double SHA-256 checksum).
 * - Operational Session Key: imported with `extractable: false`.
 *   NOTE: `extractable: false` prevents `exportKey()`, but does NOT prevent malicious JS on the same origin (XSS)
 *   from invoking crypto operations. It is not a hardware Secure Enclave; CSP and origin integrity remain vital.
 * - Memory & Secrets: LifeOS explicitly overwrites its controlled typed array buffers (`buf.fill(0)`) and does not
 *   persist or retain references to the KEK once operations complete. Note that JavaScript engines, garbage collectors,
 *   or underlying browsers may retain intermediate copies outside direct application control.
 * - Persistence: only `WrappedKeyEnvelope` is saved; plaintext MDEK and Recovery Key are never persisted.
 * - Zero external cryptographic dependencies.
 */

export const CURRENT_CRYPTO_VERSION = 1;
export const CURRENT_KEY_FORMAT_VERSION = 1;
export const CRYPTO_ALGORITHM = 'AES-GCM-256' as const;
export const PBKDF2_RECOMMENDED_ITERATIONS = 600_000;
export const WRAPPED_MDEK_STORAGE_PREFIX = 'lifeos-wrapped-mdek-v1';

import { enrollDevice } from './deviceTrust';

export interface CryptoEnvelope {
  cryptoVersion: number;
  algorithm: typeof CRYPTO_ALGORITHM;
  iv: string; // Base64 encoded 96-bit IV
  ciphertext: string; // Base64 encoded ciphertext + 128-bit GCM tag
  aad?: string; // Optional Additional Authenticated Data string
  createdAt: string; // ISO 8601 timestamp
}

export interface WrappedKeyEnvelope {
  keyFormatVersion: typeof CURRENT_KEY_FORMAT_VERSION;
  cryptoVersion: typeof CURRENT_CRYPTO_VERSION;
  algorithm: typeof CRYPTO_ALGORITHM;
  wrappedMdek: {
    iv: string; // Base64 12 bytes
    ciphertext: string; // Base64 (32 bytes raw MDEK + 16 bytes GCM tag)
  };
  kdf: {
    algorithm: 'HKDF-SHA-256';
    salt: string; // Base64 16 bytes
    info: string;
  };
  aad: string; // Context binding: 'keyFormatVersion:1|userId:...'
  createdAt: string;
}

export class CryptoDecryptionError extends Error {
  constructor(message = 'Fallo de integridad criptográfica: ciphertext modificado, corrupto o clave incorrecta.') {
    super(message);
    this.name = 'CryptoDecryptionError';
  }
}

export class CryptoKeyError extends Error {
  constructor(message = 'Error en el material de claves o formato inválido.') {
    super(message);
    this.name = 'CryptoKeyError';
  }
}

/**
 * Strict type guard for WrappedKeyEnvelope:
 * Validates version, algorithm, wrappedMdek, kdf parameters and aad.
 */
export function isWrappedKeyEnvelope(data: unknown): data is WrappedKeyEnvelope {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const cand = data as Partial<WrappedKeyEnvelope>;
  return (
    cand.keyFormatVersion === CURRENT_KEY_FORMAT_VERSION &&
    cand.cryptoVersion === CURRENT_CRYPTO_VERSION &&
    cand.algorithm === CRYPTO_ALGORITHM &&
    typeof cand.wrappedMdek === 'object' &&
    cand.wrappedMdek !== null &&
    typeof cand.wrappedMdek.iv === 'string' &&
    typeof cand.wrappedMdek.ciphertext === 'string' &&
    typeof cand.kdf === 'object' &&
    cand.kdf !== null &&
    cand.kdf.algorithm === 'HKDF-SHA-256' &&
    typeof cand.kdf.salt === 'string' &&
    typeof cand.kdf.info === 'string' &&
    typeof cand.aad === 'string' &&
    typeof cand.createdAt === 'string'
  );
}

/**
 * Validates that an envelope is bound to the specified userId.
 * Prevents user A's envelope from being injected or used for user B.
 */
export function validateEnvelopeUserBinding(envelope: WrappedKeyEnvelope, userId: string): boolean {
  const expectedAad = `keyFormatVersion:${CURRENT_KEY_FORMAT_VERSION}|userId:${userId.trim()}`;
  return envelope.aad === expectedAad;
}

// ---------------------------------------------------------------------------
// Native Web Crypto API & Base64 Helpers
// ---------------------------------------------------------------------------

function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) no está disponible en este entorno.');
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const digest = await subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  return sha256(await sha256(data));
}

// ---------------------------------------------------------------------------
// Base58 & Base58Check (LifeOS Recovery Key Format based on Base58Check)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, bigint>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], BigInt(i));
}

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let num = 0n;
  for (let i = zeros; i < bytes.length; i++) {
    num = (num << 8n) | BigInt(bytes[i]);
  }

  let str = '';
  while (num > 0n) {
    const rem = num % 58n;
    num = num / 58n;
    str = BASE58_ALPHABET[Number(rem)] + str;
  }

  return '1'.repeat(zeros) + str;
}

export function decodeBase58(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;

  let num = 0n;
  for (let i = zeros; i < str.length; i++) {
    const digit = BASE58_MAP.get(str[i]);
    if (digit === undefined) {
      throw new CryptoKeyError(`Carácter inválido en la clave de recuperación: '${str[i]}'.`);
    }
    num = num * 58n + digit;
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xFFn));
    num = num >> 8n;
  }

  const result = new Uint8Array(zeros + bytes.length);
  result.set(bytes, zeros);
  return result;
}

/**
 * Encodes 32 bytes of raw entropy with a 4-byte double SHA-256 checksum in Base58.
 */
export async function encodeBase58Check(payload: Uint8Array): Promise<string> {
  const checksumFull = await doubleSha256(payload);
  const checksum = checksumFull.slice(0, 4);

  const combined = new Uint8Array(payload.length + 4);
  combined.set(payload, 0);
  combined.set(checksum, payload.length);

  return encodeBase58(combined);
}

/**
 * Decodes a Base58Check string, verifies the 4-byte double SHA-256 checksum,
 * and returns the original 32-byte entropy payload.
 */
export async function decodeBase58Check(encoded: string): Promise<Uint8Array> {
  const decoded = decodeBase58(encoded);
  if (decoded.length < 5) {
    throw new CryptoKeyError('Longitud de clave de recuperación insuficiente.');
  }

  const payload = decoded.slice(0, decoded.length - 4);
  const checksum = decoded.slice(decoded.length - 4);

  const expectedChecksumFull = await doubleSha256(payload);
  const expectedChecksum = expectedChecksumFull.slice(0, 4);

  let match = true;
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      match = false;
      break;
    }
  }

  if (!match) {
    throw new CryptoKeyError('Suma de verificación inválida (checksum mismatch). Verificá que la clave de recuperación esté escrita correctamente.');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Recovery Key Generation, Formatting & Normalization
// ---------------------------------------------------------------------------

/**
 * Generates 32 bytes (256 bits) of CSPRNG entropy for a Recovery Key.
 */
export function generateRecoveryKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Formats 32-byte recovery key entropy as a Base58Check string grouped with hyphens.
 * (e.g. 5 chunks of ~10 characters for readability).
 */
export async function formatRecoveryKey(rawBytes: Uint8Array): Promise<string> {
  if (rawBytes.length !== 32) {
    throw new CryptoKeyError('El material de la clave de recuperación debe ser exactamente de 32 bytes (256 bits).');
  }

  const base58Str = await encodeBase58Check(rawBytes);

  // Group into chunks of 10 characters for readability
  const chunks: string[] = [];
  for (let i = 0; i < base58Str.length; i += 10) {
    chunks.push(base58Str.slice(i, i + 10));
  }
  return chunks.join('-');
}

/**
 * Parses and validates a human-readable recovery key string.
 * Strips hyphens and whitespace, validates alphabet, and verifies checksum.
 */
export async function parseRecoveryKey(formatted: string): Promise<Uint8Array> {
  const cleaned = formatted.replace(/[\s\-_]/g, '');
  if (!cleaned) {
    throw new CryptoKeyError('La clave de recuperación está vacía.');
  }

  const payload = await decodeBase58Check(cleaned);
  if (payload.length !== 32) {
    throw new CryptoKeyError(`Longitud de clave inválida (${payload.length} bytes decodificados, se esperaban 32 bytes).`);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Key Import / Export & Web Crypto Extractability
// ---------------------------------------------------------------------------

/**
 * Generates a fresh random Master Data Encryption Key (MDEK) - 256 bits.
 */
export async function generateMdek(): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable during initial generation (for wrapping)
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to raw 32-byte binary format.
 */
export async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const raw = await subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

/**
 * Imports raw 32-byte binary key into a CryptoKey for AES-GCM.
 * @param extractable If false, browser blocks .exportKey() and .wrapKey() calls.
 */
export async function importRawKey(rawBytes: Uint8Array, extractable = true): Promise<CryptoKey> {
  if (rawBytes.length !== 32) {
    throw new CryptoKeyError(`Longitud de clave inválida (${rawBytes.length} bytes). Se requieren 32 bytes (256 bits).`);
  }
  const subtle = getSubtleCrypto();
  return subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/**
 * Imports raw 32-byte binary key as an unextractable operational session key.
 * During runtime, `crypto.subtle.exportKey` is blocked on this key.
 */
export async function importSessionKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  return importRawKey(rawBytes, false);
}

// ---------------------------------------------------------------------------
// Key Derivation (HKDF & PBKDF2)
// ---------------------------------------------------------------------------

/**
 * Derives a Key Encryption Key (KEK) from a high-entropy Recovery Key using HKDF-SHA-256.
 */
export async function deriveKekFromRecoveryKey(
  recoveryBytes: Uint8Array,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (recoveryBytes.length !== 32) {
    throw new CryptoKeyError('El material para HKDF debe ser de 32 bytes.');
  }
  if (salt.length < 16) {
    throw new CryptoKeyError('El salt para HKDF debe ser de al menos 16 bytes.');
  }
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('LifeOS-Recovery-KEK-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a Key Encryption Key (KEK) from a human-created passphrase using PBKDF2-SHA-256.
 *
 * NOTE: Unlike random 256-bit Recovery Keys (which use HKDF for key expansion/separation),
 * human passwords possess low entropy and require an intentionally computationally expensive KDF
 * (600,000 iterations of PBKDF2-HMAC-SHA-256 per OWASP recommendations) to resist offline brute-force attacks.
 * Parameters must be reviewed independently from Recovery Key KDF.
 */
export async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_RECOMMENDED_ITERATIONS
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 8) {
    throw new CryptoKeyError('La frase de paso debe tener al menos 8 caracteres.');
  }
  if (salt.length < 16) {
    throw new CryptoKeyError('El salt para PBKDF2 debe ser de al menos 16 bytes.');
  }
  const subtle = getSubtleCrypto();
  const passwordKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------------------------------------------------------------------------
// Authenticated Encryption & Decryption (AES-256-GCM)
// ---------------------------------------------------------------------------

/**
 * Encrypts an arbitrary JSON-serializable payload using AES-256-GCM.
 * Generates a fresh 96-bit (12-byte) IV for every call.
 * Authenticates optional AAD (Additional Authenticated Data).
 */
export async function encryptPayload<T>(
  payload: T,
  key: CryptoKey,
  aad?: string
): Promise<CryptoEnvelope> {
  const subtle = getSubtleCrypto();

  const serialized = JSON.stringify(payload);
  const encodedData = new TextEncoder().encode(serialized);

  // Fresh 96-bit IV
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const algorithmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
  };

  if (aad !== undefined) {
    algorithmParams.additionalData = new TextEncoder().encode(aad);
  }

  const encryptedBuffer = await subtle.encrypt(algorithmParams, key, encodedData);
  const ciphertextBytes = new Uint8Array(encryptedBuffer);

  return {
    cryptoVersion: CURRENT_CRYPTO_VERSION,
    algorithm: CRYPTO_ALGORITHM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertextBytes),
    aad,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decrypts a CryptoEnvelope using AES-256-GCM.
 * Verifies authenticity (GCM tag + optional AAD).
 * Throws CryptoDecryptionError if corrupted or tampered with.
 */
export async function decryptPayload<T>(
  envelope: CryptoEnvelope,
  key: CryptoKey,
  expectedAad?: string
): Promise<T> {
  if (!envelope || typeof envelope !== 'object') {
    throw new CryptoDecryptionError('El envelope de cifrado es inválido.');
  }

  if (envelope.cryptoVersion !== CURRENT_CRYPTO_VERSION) {
    throw new CryptoDecryptionError(`Versión de cifrado no soportada: v${envelope.cryptoVersion}.`);
  }

  if (envelope.algorithm !== CRYPTO_ALGORITHM) {
    throw new CryptoDecryptionError(`Algoritmo no soportado: ${envelope.algorithm}.`);
  }

  // Validate AAD if expected
  if (expectedAad !== undefined && envelope.aad !== expectedAad) {
    throw new CryptoDecryptionError('Discrepancia en Additional Authenticated Data (AAD): posible manipulación o desvío de contexto.');
  }

  const subtle = getSubtleCrypto();
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  const algorithmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
  };

  if (envelope.aad !== undefined) {
    algorithmParams.additionalData = new TextEncoder().encode(envelope.aad);
  }

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await subtle.decrypt(algorithmParams, key, ciphertext);
  } catch {
    // Web Crypto throws OperationError on GCM tag verification failure
    throw new CryptoDecryptionError('Fallo de integridad criptográfica: ciphertext modificado, corrupto o clave incorrecta.');
  }

  const decodedString = new TextDecoder().decode(decryptedBuffer);
  try {
    return JSON.parse(decodedString) as T;
  } catch {
    throw new CryptoDecryptionError('Los datos descifrados no son un JSON válido.');
  }
}

// ---------------------------------------------------------------------------
// Wrapping & Unwrapping MDEK
// ---------------------------------------------------------------------------

export async function wrapMdekWithKek(
  rawMdek: Uint8Array,
  kek: CryptoKey,
  aad: string
): Promise<WrappedKeyEnvelope['wrappedMdek']> {
  const subtle = getSubtleCrypto();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const algorithmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
    additionalData: new TextEncoder().encode(aad),
  };

  const encryptedBuffer = await subtle.encrypt(algorithmParams, kek, rawMdek);
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function unwrapMdekWithKek(
  wrappedMdek: WrappedKeyEnvelope['wrappedMdek'],
  kek: CryptoKey,
  aad: string
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const iv = base64ToBytes(wrappedMdek.iv);
  const ciphertext = base64ToBytes(wrappedMdek.ciphertext);

  const algorithmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
    additionalData: new TextEncoder().encode(aad),
  };

  try {
    const decryptedBuffer = await subtle.decrypt(algorithmParams, kek, ciphertext);
    return new Uint8Array(decryptedBuffer);
  } catch {
    throw new CryptoDecryptionError('Fallo al desenvolver la clave maestra: clave de recuperación incorrecta o material de clave corrupto.');
  }
}

// ---------------------------------------------------------------------------
// Provisioning, Unlock & Rewrap Lifecycle Primitives
// ---------------------------------------------------------------------------

function buildKeyAad(userId?: string | null): string {
  const userTag = userId ? userId.trim() : 'local';
  return `keyFormatVersion:${CURRENT_KEY_FORMAT_VERSION}|userId:${userTag}`;
}

export function getWrappedKeyStorageKey(userId?: string | null): string {
  return userId ? `${WRAPPED_MDEK_STORAGE_PREFIX}:${userId}` : WRAPPED_MDEK_STORAGE_PREFIX;
}

export function saveWrappedKeyEnvelope(envelope: WrappedKeyEnvelope, userId?: string | null): void {
  try {
    const key = getWrappedKeyStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch (e) {
    console.error('Error saving wrapped key envelope:', e);
  }
}

export function loadWrappedKeyEnvelope(userId?: string | null): WrappedKeyEnvelope | null {
  try {
    const key = getWrappedKeyStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.keyFormatVersion === CURRENT_KEY_FORMAT_VERSION && parsed.wrappedMdek) {
      return parsed as WrappedKeyEnvelope;
    }
    return null;
  } catch (e) {
    console.error('Error loading wrapped key envelope:', e);
    return null;
  }
}

export function clearWrappedKeyEnvelope(userId?: string | null): void {
  try {
    const key = getWrappedKeyStorageKey(userId);
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Error clearing wrapped key envelope:', e);
  }
}

export function isZeroKnowledgeProvisioned(userId?: string | null): boolean {
  return loadWrappedKeyEnvelope(userId) !== null;
}

/**
 * Initial Zero-Knowledge Provisioning Flow:
 * 1. Generates 32 bytes raw MDEK.
 * 2. Generates 32 bytes raw Recovery Key.
 * 3. Derives KEK via HKDF-SHA-256 with fresh 16-byte salt.
 * 4. Wraps MDEK using KEK with context-binding AAD.
 * 5. Constructs and persists `WrappedKeyEnvelope`.
 * 6. Imports operational `sessionMdek` with `extractable: false`.
 * 7. Zeros raw MDEK memory.
 * 8. Returns formatted Recovery Key and non-extractable session MDEK.
 */
export async function provisionZeroKnowledgeKeys(userId?: string | null): Promise<{
  recoveryKeyFormatted: string;
  sessionMdek: CryptoKey;
  envelope: WrappedKeyEnvelope;
}> {
  const rawMdek = new Uint8Array(32);
  globalThis.crypto.getRandomValues(rawMdek);

  const rawRecoveryKey = generateRecoveryKey();

  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);

  const aad = buildKeyAad(userId);

  try {
    const kek = await deriveKekFromRecoveryKey(rawRecoveryKey, salt);
    const wrappedMdek = await wrapMdekWithKek(rawMdek, kek, aad);

    const envelope: WrappedKeyEnvelope = {
      keyFormatVersion: CURRENT_KEY_FORMAT_VERSION,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      algorithm: CRYPTO_ALGORITHM,
      wrappedMdek,
      kdf: {
        algorithm: 'HKDF-SHA-256',
        salt: bytesToBase64(salt),
        info: 'LifeOS-Recovery-KEK-v1',
      },
      aad,
      createdAt: new Date().toISOString(),
    };

    saveWrappedKeyEnvelope(envelope, userId);

    // Enroll this device/browser automatically so reloads won't require entering the Recovery Key
    try {
      await enrollDevice(userId || 'local', rawMdek);
    } catch (enrollErr) {
      console.warn('[DeviceTrust] No se pudo enrolar automáticamente el dispositivo durante aprovisionamiento:', enrollErr);
    }

    const sessionMdek = await importSessionKey(rawMdek);
    const recoveryKeyFormatted = await formatRecoveryKey(rawRecoveryKey);

    return {
      recoveryKeyFormatted,
      sessionMdek,
      envelope,
    };
  } finally {
    // Explicitly overwrite application-controlled typed array buffers.
    // LifeOS does not retain raw byte references or persist the KEK.
    rawMdek.fill(0);
    rawRecoveryKey.fill(0);
  }
}

/**
 * Unlocks the MDEK from a `WrappedKeyEnvelope` using the user's Recovery Key.
 * Validates checksum, derives KEK, unwraps raw MDEK, and imports operational
 * non-extractable session key.
 */
export async function unlockMdekWithRecoveryKey(
  recoveryKeyFormatted: string,
  envelope: WrappedKeyEnvelope,
  userId?: string | null
): Promise<CryptoKey> {
  if (!envelope || envelope.keyFormatVersion !== CURRENT_KEY_FORMAT_VERSION) {
    throw new CryptoKeyError('El envelope de claves no es válido o tiene una versión no soportada.');
  }

  const rawRecovery = await parseRecoveryKey(recoveryKeyFormatted);
  const salt = base64ToBytes(envelope.kdf.salt);

  try {
    const kek = await deriveKekFromRecoveryKey(rawRecovery, salt);
    const rawMdek = await unwrapMdekWithKek(envelope.wrappedMdek, kek, envelope.aad);

    try {
      if (userId) {
        try {
          await enrollDevice(userId, rawMdek);
        } catch (enrollErr) {
          console.warn('[DeviceTrust] No se pudo enrolar el dispositivo al desbloquear con Recovery Key:', enrollErr);
        }
      }
      return await importSessionKey(rawMdek);
    } finally {
      rawMdek.fill(0);
    }
  } finally {
    rawRecovery.fill(0);
  }
}

/**
 * Regenerates the Recovery Key (Rewrap MDEK):
 * The user authenticates with their current Recovery Key, LifeOS unwraps the MDEK,
 * generates a brand new Recovery Key + fresh salt, rewraps the existing MDEK under the new KEK,
 * and produces a new `WrappedKeyEnvelope`.
 *
 * Security semantics:
 * - The new WrappedKeyEnvelope can only be unlocked with the new Recovery Key.
 * - The old Recovery Key cannot unlock the new WrappedKeyEnvelope.
 * - Existing encrypted data in the cloud is NOT modified because the MDEK remains the same.
 * - Crucial nuance: If an adversary possesses both the old Recovery Key and an old copy
 *   of the previous WrappedKeyEnvelope, that old envelope can still unwrap the same MDEK.
 *   Complete cryptographic revocation in compromise scenarios requires rotating the MDEK
 *   and re-encrypting all 15 cloud modules.
 * - LifeOS explicitly clears memory buffers controlled by application code (.fill(0)).
 *   While the JavaScript runtime / Garbage Collector does not guarantee absolute physical
 *   erasure of all transient copies in memory, LifeOS does not deliberately persist Recovery Key,
 *   KEK nor plaintext MDEK in any of its own stores.
 */
export async function rewrapMdekWithNewRecoveryKey(
  currentRecoveryKeyFormatted: string,
  envelope: WrappedKeyEnvelope,
  userId?: string | null,
  options?: { persistLocally?: boolean }
): Promise<{
  newRecoveryKeyFormatted: string;
  newEnvelope: WrappedKeyEnvelope;
  sessionMdek: CryptoKey;
}> {
  const currentRecovery = await parseRecoveryKey(currentRecoveryKeyFormatted);
  const oldSalt = base64ToBytes(envelope.kdf.salt);

  const rawMdek = new Uint8Array(32);
  const newRecoveryKey = generateRecoveryKey();
  const newSalt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(newSalt);

  const aad = buildKeyAad(userId);

  try {
    const oldKek = await deriveKekFromRecoveryKey(currentRecovery, oldSalt);
    const unwrappedBytes = await unwrapMdekWithKek(envelope.wrappedMdek, oldKek, envelope.aad);
    rawMdek.set(unwrappedBytes);

    const newKek = await deriveKekFromRecoveryKey(newRecoveryKey, newSalt);
    const newWrappedMdek = await wrapMdekWithKek(rawMdek, newKek, aad);

    const newEnvelope: WrappedKeyEnvelope = {
      keyFormatVersion: CURRENT_KEY_FORMAT_VERSION,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      algorithm: CRYPTO_ALGORITHM,
      wrappedMdek: newWrappedMdek,
      kdf: {
        algorithm: 'HKDF-SHA-256',
        salt: bytesToBase64(newSalt),
        info: 'LifeOS-Recovery-KEK-v1',
      },
      aad,
      createdAt: new Date().toISOString(),
    };

    if (options?.persistLocally !== false) {
      saveWrappedKeyEnvelope(newEnvelope, userId);
      try {
        await enrollDevice(userId || 'local', rawMdek);
      } catch (enrollErr) {
        console.warn('[DeviceTrust] No se pudo re-enrolar el dispositivo durante rewrap:', enrollErr);
      }
    }

    const sessionMdek = await importSessionKey(rawMdek);
    const newRecoveryKeyFormatted = await formatRecoveryKey(newRecoveryKey);

    return {
      newRecoveryKeyFormatted,
      newEnvelope,
      sessionMdek,
    };
  } finally {
    // Explicitly overwrite application-controlled buffers.
    // LifeOS does not persist the KEK and drops references once operations complete.
    currentRecovery.fill(0);
    rawMdek.fill(0);
    newRecoveryKey.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Module-level Synchronization Primitives (Dual-Mode Sync Foundation)
// ---------------------------------------------------------------------------

export const CURRENT_SYNC_PROTOCOL_VERSION = 2;

/**
 * Strict type-guard for CryptoEnvelope:
 * Checks cryptoVersion, algorithm ('AES-GCM-256'), iv, and ciphertext.
 * Rejects arbitrary plain JSON objects, null, arrays, and malformed envelopes.
 */
export function isCryptoEnvelope(data: unknown): data is CryptoEnvelope {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const cand = data as Partial<CryptoEnvelope>;
  return (
    typeof cand.cryptoVersion === 'number' &&
    cand.cryptoVersion > 0 &&
    cand.algorithm === CRYPTO_ALGORITHM &&
    typeof cand.iv === 'string' &&
    cand.iv.length > 0 &&
    typeof cand.ciphertext === 'string' &&
    cand.ciphertext.length > 0
  );
}

export function buildModuleAad(
  module: string,
  userId?: string | null,
  cryptoVersion: number = CURRENT_CRYPTO_VERSION
): string {
  const userTag = userId ? userId.trim() : 'local';
  return `module:${module}|user:${userTag}|cryptoVersion:${cryptoVersion}`;
}

export async function encryptSyncModule(
  data: unknown,
  sessionMdek: CryptoKey,
  module: string,
  userId?: string | null
): Promise<CryptoEnvelope> {
  const aad = buildModuleAad(module, userId, CURRENT_CRYPTO_VERSION);
  return encryptPayload(data, sessionMdek, aad);
}

export async function decryptSyncModule(
  envelope: CryptoEnvelope,
  sessionMdek: CryptoKey,
  module: string,
  userId?: string | null
): Promise<unknown> {
  const expectedAad = buildModuleAad(module, userId, envelope.cryptoVersion);
  return decryptPayload(envelope, sessionMdek, expectedAad);
}

// ---------------------------------------------------------------------------
// In-Memory Crypto Session Management
// ---------------------------------------------------------------------------

export type CryptoSessionState = 'locked' | 'unlocked' | 'unconfigured';

class CryptoSessionManager {
  private activeMdek: CryptoKey | null = null;
  private currentUserId: string | null = null;

  getState(userId?: string | null): CryptoSessionState {
    const targetUser = userId || null;
    const isProvisioned = isZeroKnowledgeProvisioned(targetUser);
    if (!isProvisioned) return 'unconfigured';
    if (this.activeMdek && this.currentUserId === targetUser) return 'unlocked';
    return 'locked';
  }

  isUnlocked(userId?: string | null): boolean {
    const targetUser = userId || null;
    return Boolean(this.activeMdek && this.currentUserId === targetUser);
  }

  getKey(userId?: string | null): CryptoKey | null {
    const targetUser = userId || null;
    if (this.activeMdek && this.currentUserId === targetUser) {
      return this.activeMdek;
    }
    return null;
  }

  setUnlocked(key: CryptoKey, userId?: string | null): void {
    this.activeMdek = key;
    this.currentUserId = userId || null;
  }

  lock(): void {
    this.activeMdek = null;
    this.currentUserId = null;
  }
}

export const cryptoSession = new CryptoSessionManager();

// ---------------------------------------------------------------------------
// Cloud Module Data Dual-Mode Adapter
// ---------------------------------------------------------------------------

export type CloudModuleDataDecodeResult =
  | { mode: 'plaintext'; data: unknown }
  | { mode: 'decrypted'; data: unknown; envelope: CryptoEnvelope }
  | { mode: 'locked'; envelope: CryptoEnvelope; reason?: 'mdek_unavailable' | 'session_locked' }
  | { mode: 'corrupted'; envelope: CryptoEnvelope; error: Error; reasonCode?: string };

export interface AccountSyncCapability {
  version: number;
  minimumSyncProtocolVersion: number;
  encryptionState: 'plaintext' | 'mixed' | 'encrypted';
  encryptedModules?: string[];
  updatedAt: string;
}

export function isAccountSyncCapability(data: unknown): data is AccountSyncCapability {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const cand = data as Partial<AccountSyncCapability>;
  return (
    typeof cand.version === 'number' &&
    typeof cand.minimumSyncProtocolVersion === 'number' &&
    ['plaintext', 'mixed', 'encrypted'].includes(String(cand.encryptionState)) &&
    (cand.encryptedModules === undefined ||
      (Array.isArray(cand.encryptedModules) && cand.encryptedModules.every((m) => typeof m === 'string'))) &&
    typeof cand.updatedAt === 'string'
  );
}

export function assertProtocolWritePermitted(
  module: string,
  remoteProtocolVersion: number = 1,
  clientProtocolVersion: number = CURRENT_SYNC_PROTOCOL_VERSION
): void {
  if (remoteProtocolVersion > clientProtocolVersion) {
    throw new Error(
      `[ProtocolGuard] Operación de escritura rechazada para el módulo “${module}”: el servidor remoto requiere protocolo sync v${remoteProtocolVersion}, pero este cliente sólo soporta v${clientProtocolVersion}. Actualizá LifeOS.`
    );
  }
}

/**
 * Decodes cloud module data:
 * - If plaintext, returns directly with mode: 'plaintext'.
 * - If CryptoEnvelope:
 *   - If key provided, decrypts with authenticated AAD: returns mode: 'decrypted'.
 *   - If no key provided, returns mode: 'locked'.
 *   - If decryption fails (tampering/bad tag/bad AAD), returns mode: 'corrupted' with sanitized error.
 *   - If session was locked during async decrypt, aborts decryption result with mode: 'locked'.
 */
export async function decodeCloudModuleData(
  rawCloudData: unknown,
  module: string,
  userId?: string | null,
  sessionMdek?: CryptoKey | null
): Promise<CloudModuleDataDecodeResult> {
  if (!isCryptoEnvelope(rawCloudData)) {
    return { mode: 'plaintext', data: rawCloudData };
  }

  if (!sessionMdek) {
    return { mode: 'locked', envelope: rawCloudData, reason: 'mdek_unavailable' };
  }

  const hadActiveSession = Boolean(sessionMdek && cryptoSession.isUnlocked(userId));

  try {
    const decrypted = await decryptSyncModule(rawCloudData, sessionMdek, module, userId);

    // Fail-closed guard against session lock race:
    // If the session was active and subsequently locked during in-flight decrypt, refuse to return decrypted plaintext
    if (hadActiveSession && !cryptoSession.isUnlocked(userId)) {
      return { mode: 'locked', envelope: rawCloudData, reason: 'session_locked' };
    }

    return { mode: 'decrypted', data: decrypted, envelope: rawCloudData };
  } catch {
    // Sanitized error: never leak raw ciphertext, plaintexts, or keys into error object/message
    return {
      mode: 'corrupted',
      envelope: rawCloudData,
      error: new CryptoDecryptionError('Fallo de integridad criptográfica o AAD en módulo remoto.'),
      reasonCode: 'INTEGRITY_OR_AUTH_FAILURE',
    };
  }
}

/**
 * Encodes module data for Cloud:
 * - If sessionMdek is active and encryption enabled, encrypts data into CryptoEnvelope.
 * - Otherwise returns clean plaintext.
 */
export async function encodeCloudModuleData(
  data: unknown,
  module: string,
  userId?: string | null,
  sessionMdek?: CryptoKey | null
): Promise<{ data: unknown; isEncrypted: boolean }> {
  if (sessionMdek) {
    const envelope = await encryptSyncModule(data, sessionMdek, module, userId);
    return { data: envelope, isEncrypted: true };
  }
  return { data, isEncrypted: false };
}
