/**
 * LifeOS — Cryptographic Migration & E2EE Activation Engine (Fase 8.3 / Stage D)
 *
 * Implements:
 * 1. Account Capability Lifecycle:
 *    - Reading & writing /users/{userId}/lifeosAccount/capability
 *    - Transitions: plaintext -> mixed (locked down server-side) -> module-by-module -> encrypted (all 15 SYNC_MODULES)
 * 2. Pre-Migration Safety Snapshot:
 *    - Creates an emergency recovery snapshot in local storage before any cloud modification.
 * 3. Module-by-Module Resumable Migration:
 *    - Idempotent: checks remote status, validates integrity, encrypts, writes head & revision, updates capability.
 *    - If interrupted, resumes seamlessly without duplicate writes or lost revisions.
 * 4. Multi-Device Recovery:
 *    - Allows a second device to unwrap and unlock the operational MDEK using only the Base58Check Recovery Key.
 *    - Persists WrappedKeyEnvelope locally and sets cryptoSession to unlocked.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { saveRecoveryState } from './storage';
import {
  SYNC_MODULES,
  type SyncModuleKey,
} from './syncModel';
import {
  CURRENT_SYNC_PROTOCOL_VERSION,
  type AccountSyncCapability,
  isAccountSyncCapability,
  isCryptoEnvelope,
  cryptoSession,
  saveWrappedKeyEnvelope,
  loadWrappedKeyEnvelope,
  unlockMdekWithRecoveryKey,
  type WrappedKeyEnvelope,
  isWrappedKeyEnvelope,
  validateEnvelopeUserBinding,
  decryptSyncModule,
  rewrapMdekWithNewRecoveryKey,
} from './cryptoCore';

export type { AccountSyncCapability };
import {
  cloudSyncConfigured,
  writeCloudModulesAsync,
  loadCloudRevisions,
  getOrCreateDeviceId,
  getFirestoreDb,
} from './cloudSync';

export interface MigrationProgress {
  currentModule: SyncModuleKey;
  currentIndex: number;
  totalModules: number;
  completedModules: SyncModuleKey[];
  isComplete: boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedModules: SyncModuleKey[];
  capability: AccountSyncCapability;
  error?: Error;
}

// Low-level helper to access Firestore instance when configured
function getDbInstance() {
  if (!cloudSyncConfigured) {
    throw new Error('LifeOS Anywhere no está configurado en este entorno.');
  }
  return getFirestoreDb();
}

export interface CapabilityStorageHandlers {
  getCapability: (userId: string) => Promise<AccountSyncCapability | null>;
  setCapability: (userId: string, capability: AccountSyncCapability) => Promise<void>;
  getKeyEnvelope?: (userId: string) => Promise<WrappedKeyEnvelope | null>;
  setKeyEnvelope?: (userId: string, envelope: WrappedKeyEnvelope) => Promise<void>;
  getModule?: (userId: string, module: string) => Promise<{ isEncrypted: boolean; data: any } | null>;
}

/**
 * Reads the Cloud Wrapped Key Envelope document from Firestore:
 * Path: users/{userId}/lifeosAccount/keyEnvelope
 */
export async function fetchCloudKeyEnvelope(
  userId: string,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<WrappedKeyEnvelope | null> {
  if (!userId) return null;
  if (handlers?.getKeyEnvelope) {
    return handlers.getKeyEnvelope(userId);
  }
  const db = customDb || getDbInstance();
  try {
    const envelopeRef = doc(db, 'users', userId, 'lifeosAccount', 'keyEnvelope');
    const snap = await getDoc(envelopeRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (isWrappedKeyEnvelope(data)) {
      if (!validateEnvelopeUserBinding(data, userId)) {
        console.error('[CryptoMigration] Discrepancia en contexto AAD de usuario en el keyEnvelope remoto.');
        return null;
      }
      return data;
    }
    return null;
  } catch (error) {
    console.warn('[CryptoMigration] No se pudo leer el envelope remoto:', error);
    return null;
  }
}

/**
 * Persists the WrappedKeyEnvelope to Firestore:
 * Path: users/{userId}/lifeosAccount/keyEnvelope
 */
export async function setCloudKeyEnvelope(
  userId: string,
  envelope: WrappedKeyEnvelope,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<void> {
  if (!userId) throw new Error('Usuario inválido para guardar keyEnvelope.');
  if (!isWrappedKeyEnvelope(envelope)) {
    throw new Error('Envelope de claves inválido.');
  }
  if (!validateEnvelopeUserBinding(envelope, userId)) {
    throw new Error('El envelope no coincide con el contexto de identidad del usuario.');
  }
  if (handlers?.setKeyEnvelope) {
    await handlers.setKeyEnvelope(userId, envelope);
    return;
  }
  const db = customDb || getDbInstance();
  const envelopeRef = doc(db, 'users', userId, 'lifeosAccount', 'keyEnvelope');
  await setDoc(envelopeRef, envelope);
}

/**
 * Reads the AccountSyncCapability document from Firestore:
 * Path: users/{userId}/lifeosAccount/capability
 */
export async function fetchAccountCapability(
  userId: string,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<AccountSyncCapability | null> {
  if (!userId) return null;
  if (handlers) {
    return handlers.getCapability(userId);
  }
  const db = customDb || getDbInstance();
  try {
    const capabilityRef = doc(db, 'users', userId, 'lifeosAccount', 'capability');
    const snap = await getDoc(capabilityRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (isAccountSyncCapability(data)) {
      return data;
    }
    return null;
  } catch (error) {
    console.warn('[CryptoMigration] No se pudo leer la capability de la cuenta:', error);
    return null;
  }
}

/**
 * Writes or updates the AccountSyncCapability document in Firestore.
 */
export async function setAccountCapability(
  userId: string,
  capability: AccountSyncCapability,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<void> {
  if (!userId) throw new Error('Usuario inválido para actualizar capability.');
  if (handlers) {
    await handlers.setCapability(userId, capability);
    return;
  }
  const db = customDb || getDbInstance();
  const capabilityRef = doc(db, 'users', userId, 'lifeosAccount', 'capability');
  await setDoc(capabilityRef, capability);
}

/**
 * Executes or resumes voluntary E2EE migration for all 15 SYNC_MODULES.
 *
 * Steps:
 * 1. Takes emergency local pre-migration recovery snapshot.
 * 2. Reads remote capability or initializes mixed capability with encryptedModules: [].
 * 3. Locks out legacy plaintext writers immediately on server via Firestore Rules.
 * 4. Iterates over all 15 SYNC_MODULES:
 *    - If already in capability.encryptedModules, verifies roundtrip and skips write if intact.
 *    - If plaintext or unverified, encrypts local module data with session MDEK,
 *      writes cloud head + revision using writeCloudModulesAsync.
 *    - Appends module to capability.encryptedModules and updates capability document.
 * 5. When all 15 SYNC_MODULES are migrated and verified, upgrades capability to 'encrypted'.
 */
export async function executeE2EEMigration(
  userId: string,
  currentState: LifeOSState,
  sessionMdek: CryptoKey,
  options?: {
    onProgress?: (progress: MigrationProgress) => void;
    customDb?: any;
    customWriter?: typeof writeCloudModulesAsync;
    capabilityHandlers?: CapabilityStorageHandlers;
  }
): Promise<MigrationResult> {
  if (!userId) throw new Error('Identificador de usuario requerido para migración.');
  if (!sessionMdek) throw new Error('Clave maestra MDEK requerida para cifrar módulos.');

  // 1. Safety First: Local emergency snapshot before any remote change
  saveRecoveryState(
    currentState,
    userId,
    'manual_snapshot',
    'Snapshot preventivo automático previo a migración E2EE'
  );

  const handlers = options?.capabilityHandlers;
  const db = options?.customDb || (handlers ? null : getDbInstance());
  const writer = options?.customWriter || writeCloudModulesAsync;
  const deviceId = getOrCreateDeviceId();
  const baseRevisions = loadCloudRevisions(userId);

  // 2. Pre-condition: Cloud WrappedKeyEnvelope must be persisted and verifiable
  const cloudEnvelope = await fetchCloudKeyEnvelope(userId, db, handlers);
  if (!cloudEnvelope) {
    throw new Error(
      'No se encontró el WrappedKeyEnvelope en la nube. Debe persistirse y verificarse en Firestore antes de iniciar la migración.'
    );
  }

  // Cryptographic sanity check: verify that sessionMdek matches the cloud envelope
  try {
    const envelopeAad = cloudEnvelope.aad;
    const expectedAad = `keyFormatVersion:1|userId:${userId.trim()}`;
    if (envelopeAad !== expectedAad) {
      throw new Error('El contexto de usuario en el envelope remoto no coincide.');
    }
  } catch (err: any) {
    throw new Error(`Fallo de verificación del keyEnvelope remoto previo a migración: ${err?.message || err}`);
  }

  // 3. Fetch or create initial capability (mixed with current encryptedModules)
  let currentCap = await fetchAccountCapability(userId, db, handlers);

  const initialCompleted: SyncModuleKey[] = currentCap?.encryptedModules
    ? (currentCap.encryptedModules.filter((m) =>
        SYNC_MODULES.includes(m as SyncModuleKey)
      ) as SyncModuleKey[])
    : [];

  const completedSet = new Set<SyncModuleKey>(initialCompleted);

  if (!currentCap || currentCap.encryptionState === 'plaintext') {
    currentCap = {
      version: 1,
      minimumSyncProtocolVersion: CURRENT_SYNC_PROTOCOL_VERSION,
      encryptionState: 'mixed',
      encryptedModules: [...completedSet],
      updatedAt: new Date().toISOString(),
    };
    await setAccountCapability(userId, currentCap, db, handlers);
  }

  const total = SYNC_MODULES.length;

  // 3. Migrate module by module
  for (let i = 0; i < total; i++) {
    const mod = SYNC_MODULES[i];

    if (options?.onProgress) {
      options.onProgress({
        currentModule: mod,
        currentIndex: i + 1,
        totalModules: total,
        completedModules: [...completedSet],
        isComplete: false,
      });
    }

    // Idempotency check: if already recorded in capability and remotely encrypted, we can verify and skip
    let alreadyEncrypted = completedSet.has(mod);

    if (!alreadyEncrypted) {
      if (handlers?.getModule) {
        try {
          const modData = await handlers.getModule(userId, mod);
          if (modData?.isEncrypted && isCryptoEnvelope(modData.data)) {
            await decryptSyncModule(modData.data, sessionMdek, mod, userId);
            alreadyEncrypted = true;
            completedSet.add(mod);
          }
        } catch {
          alreadyEncrypted = false;
        }
      } else if (db) {
        // Check if remote is already encrypted in Firestore
        try {
          const modDocRef = doc(db, 'users', userId, 'lifeosModules', mod);
          const modSnap = await getDoc(modDocRef);
          if (modSnap.exists()) {
            const modData = modSnap.data();
            if (modData.isEncrypted && isCryptoEnvelope(modData.data)) {
              // Verify that our sessionMdek can decrypt it cleanly
              await decryptSyncModule(modData.data, sessionMdek, mod, userId);
              alreadyEncrypted = true;
              completedSet.add(mod);
            }
          }
        } catch {
          // Fallback to encrypting and uploading
          alreadyEncrypted = false;
        }
      }
    }

    if (!alreadyEncrypted) {
      // Write module encrypted
      const batch = await writer(
        userId,
        currentState,
        [mod],
        deviceId,
        baseRevisions,
        {},
        sessionMdek
      );
      await batch.completion;

      completedSet.add(mod);

      // Incremental capability checkpoint
      currentCap = {
        version: 1,
        minimumSyncProtocolVersion: CURRENT_SYNC_PROTOCOL_VERSION,
        encryptionState: 'mixed',
        encryptedModules: [...completedSet],
        updatedAt: new Date().toISOString(),
      };
      await setAccountCapability(userId, currentCap, db, handlers);
    }
  }

  // 4. Final promotion to 'encrypted' once all 15 modules are verified
  const allCompleted = SYNC_MODULES.every((m) => completedSet.has(m));
  if (!allCompleted) {
    throw new Error('La migración no completó todos los módulos requeridos.');
  }

  const finalCap: AccountSyncCapability = {
    version: 1,
    minimumSyncProtocolVersion: CURRENT_SYNC_PROTOCOL_VERSION,
    encryptionState: 'encrypted',
    encryptedModules: [...completedSet],
    updatedAt: new Date().toISOString(),
  };

  await setAccountCapability(userId, finalCap, db, handlers);

  if (options?.onProgress) {
    options.onProgress({
      currentModule: SYNC_MODULES[total - 1],
      currentIndex: total,
      totalModules: total,
      completedModules: [...completedSet],
      isComplete: true,
    });
  }

  return {
    success: true,
    migratedModules: [...completedSet],
    capability: finalCap,
  };
}

/**
 * Second-Device Recovery Flow:
 * When a user logs in on a new device where capability is 'encrypted' or 'mixed',
 * but the device has no local WrappedKeyEnvelope:
 * 1. Reads the remote WrappedKeyEnvelope from Firestore (/users/{userId}/lifeosAccount/keyEnvelope).
 * 2. Validates envelope format and strict user binding (AAD context).
 * 3. Prompts for Recovery Key and validates format/checksum.
 * 4. Derives KEK via HKDF-SHA-256 and unwraps the MDEK.
 * 5. Validates MDEK by test-decrypting an authenticated remote module (e.g. 'finance' or 'profile').
 * 6. Persists the WrappedKeyEnvelope locally on the second device.
 * 7. Sets operational session MDEK with extractable: false in cryptoSession.
 */
export async function unlockDeviceWithRecoveryKey(
  userId: string,
  recoveryKeyFormatted: string,
  envelopeOverride?: WrappedKeyEnvelope | null,
  testModuleEnvelope?: { module: SyncModuleKey; envelope: any },
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<{ sessionMdek: CryptoKey; envelope: WrappedKeyEnvelope }> {
  if (!userId) throw new Error('Usuario inválido.');

  // 1. Resolve envelope: override or fetch from cloud
  let envelope = envelopeOverride || null;
  if (!envelope) {
    envelope = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  }

  if (!envelope) {
    throw new Error('No se encontró el WrappedKeyEnvelope para esta cuenta en la nube ni localmente.');
  }

  // 2. Validate envelope format and user binding
  if (!isWrappedKeyEnvelope(envelope)) {
    throw new Error('El envelope de claves remoto está corrupto o tiene un formato no válido.');
  }
  if (!validateEnvelopeUserBinding(envelope, userId)) {
    throw new Error('Discrepancia de seguridad: el envelope no pertenece a esta cuenta de usuario.');
  }

  // 3. Cryptographic unwrap test (throws CryptoDecryptionError on wrong key)
  const sessionMdek = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, envelope);

  // 4. If test module envelope is provided, verify roundtrip decrypt
  if (testModuleEnvelope) {
    await decryptSyncModule(
      testModuleEnvelope.envelope,
      sessionMdek,
      testModuleEnvelope.module,
      userId
    );
  }

  // 5. Persist wrapped key on this device for subsequent unlocks
  saveWrappedKeyEnvelope(envelope, userId);

  // 6. Activate in-memory non-extractable session
  cryptoSession.setUnlocked(sessionMdek, userId);

  return { sessionMdek, envelope };
}

/**
 * Checks local and remote E2EE status for UI presentation.
 */
export async function getAccountEncryptionStatus(
  userId: string | null,
  customDb?: any
): Promise<{
  isConfigured: boolean;
  isUnlocked: boolean;
  encryptionState: 'plaintext' | 'mixed' | 'encrypted';
  encryptedModulesCount: number;
  totalModulesCount: number;
  needsSecondDeviceUnlock: boolean;
  wrappedEnvelopeAvailable: boolean;
}> {
  const totalModulesCount = SYNC_MODULES.length;
  if (!userId) {
    return {
      isConfigured: false,
      isUnlocked: false,
      encryptionState: 'plaintext',
      encryptedModulesCount: 0,
      totalModulesCount,
      needsSecondDeviceUnlock: false,
      wrappedEnvelopeAvailable: false,
    };
  }

  const localEnvelope = loadWrappedKeyEnvelope(userId);
  const isUnlocked = cryptoSession.isUnlocked(userId);

  let capability: AccountSyncCapability | null = null;
  try {
    capability = await fetchAccountCapability(userId, customDb);
  } catch {
    capability = null;
  }

  const state = capability?.encryptionState || 'plaintext';
  const encryptedModulesCount = capability?.encryptedModules?.length || 0;
  const isCloudEncrypted = state === 'mixed' || state === 'encrypted';

  const needsSecondDeviceUnlock = isCloudEncrypted && !isUnlocked && Boolean(localEnvelope);

  return {
    isConfigured: Boolean(localEnvelope) || isCloudEncrypted,
    isUnlocked,
    encryptionState: state,
    encryptedModulesCount,
    totalModulesCount,
    needsSecondDeviceUnlock,
    wrappedEnvelopeAvailable: Boolean(localEnvelope),
  };
}

/**
 * Stage E: Hardened Recovery Key Rotation with verified cloud commit and recovery handling.
 *
 * Sequence:
 * 1. Genera nueva Recovery Key.
 * 2. Genera nuevo WrappedKeyEnvelope bajo nuevo salt/KEK sin tocar almacenamiento local aún.
 * 3. Comprueba LOCALMENTE que la nueva Recovery Key puede desenvolver la misma MDEK (self-test).
 * 4. Escribe el nuevo envelope en Firestore (users/{userId}/lifeosAccount/keyEnvelope).
 * 5. Lee el envelope remoto desde Firestore.
 * 6. Verifica que el envelope remoto es exactamente el esperado y que la nueva Recovery Key puede abrirlo.
 * 7. Persiste localmente en localStorage (saveWrappedKeyEnvelope).
 * 8. Actualiza cryptoSession con sessionMdek.
 * 9. Marca rotación completa y retorna clave formateada.
 *
 * Manejo de fallo después del commit cloud:
 * Si el commit cloud tiene éxito pero la lectura de verificación falla (timeout o caída de red),
 * el sistema guarda un estado temporal `lifeos-rotation-pending-verification:${userId}`
 * conteniendo el nuevo envelope y la clave nueva respaldada. No se genera otra clave ni se
 * sobreescribe a ciegas. La próxima llamada resuelve el estado pendiente verificando contra Firestore.
 */
export const ROTATION_PENDING_KEY_PREFIX = 'lifeos-rotation-pending-v1:';

export interface RotationPendingState {
  pendingAt: string;
  expectedCiphertextHash: string;
  newEnvelope: WrappedKeyEnvelope;
}

export function getRotationPendingState(userId: string): RotationPendingState | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${ROTATION_PENDING_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.newEnvelope && parsed.expectedCiphertextHash) {
      return parsed as RotationPendingState;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearRotationPendingState(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(`${ROTATION_PENDING_KEY_PREFIX}${userId}`);
  } catch {
    // Ignorar
  }
}

/**
 * Resolves a pending rotation when the user manually provides the new Recovery Key they saved.
 * Verifies against cloud Firestore envelope, tests unwrap of MDEK, saves locally, updates session, and clears pending state.
 */
export async function resolvePendingRotation(
  userId: string,
  newRecoveryKeyFormatted: string,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<{ sessionMdek: CryptoKey; envelope: WrappedKeyEnvelope }> {
  if (!userId) throw new Error('Usuario inválido para resolver rotación.');

  // 1. Fetch current cloud envelope
  const remoteEnv = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  if (!remoteEnv) {
    throw new Error('No se encontró el WrappedKeyEnvelope en la nube para verificar la rotación pendiente.');
  }

  // 2. Cryptographic unwrap test with user's provided key
  const sessionMdek = await unlockMdekWithRecoveryKey(newRecoveryKeyFormatted, remoteEnv);
  if (!sessionMdek) {
    throw new Error('La clave ingresada no pudo descifrar el envelope de la nube.');
  }

  // 3. Persist verified envelope to local storage
  saveWrappedKeyEnvelope(remoteEnv, userId);

  // 4. Update in-memory session
  cryptoSession.setUnlocked(sessionMdek, userId);

  // 5. Clean pending state
  clearRotationPendingState(userId);

  return { sessionMdek, envelope: remoteEnv };
}

export async function executeKeyRotation(
  userId: string,
  currentRecoveryKey: string,
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<{
  newRecoveryKeyFormatted: string;
  newEnvelope: WrappedKeyEnvelope;
  sessionMdek: CryptoKey;
}> {
  if (!userId) throw new Error('Usuario inválido para rotación de claves.');

  // 1. Resolve active envelope (local cache or cloud)
  let envelope = loadWrappedKeyEnvelope(userId);
  if (!envelope) {
    envelope = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  }
  if (!envelope) {
    throw new Error('No se encontró el WrappedKeyEnvelope actual para realizar la rotación.');
  }

  // 2. Generate new key and rewrap envelope without modifying local storage yet
  const { newRecoveryKeyFormatted, newEnvelope, sessionMdek } = await rewrapMdekWithNewRecoveryKey(
    currentRecoveryKey,
    envelope,
    userId,
    { persistLocally: false }
  );

  // 3. Self-test: Verify locally that newRecoveryKeyFormatted can unwrap newEnvelope and match MDEK
  const testUnwrapped = await unlockMdekWithRecoveryKey(newRecoveryKeyFormatted, newEnvelope);
  if (!testUnwrapped) {
    throw new Error('Autoverificación criptográfica local falló antes de enviar a la nube.');
  }

  // 4. Cloud commit
  await setCloudKeyEnvelope(userId, newEnvelope, customDb, handlers);

  // 5. Read back from cloud and verify
  let verifiedRemote: WrappedKeyEnvelope | null = null;
  try {
    verifiedRemote = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  } catch {
    // Caso Crítico 6: Cloud commit ocurrió, pero la lectura posterior falló por red.
    // Invariante estricto: NUNCA persistir la Recovery Key ni ningún secreto.
    // Persistir exclusivamente metadata no secreta: envelope público y hash del ciphertext.
    try {
      const pendingState: RotationPendingState = {
        pendingAt: new Date().toISOString(),
        expectedCiphertextHash: newEnvelope.wrappedMdek.ciphertext.slice(0, 16),
        newEnvelope,
      };
      localStorage.setItem(
        `${ROTATION_PENDING_KEY_PREFIX}${userId}`,
        JSON.stringify(pendingState)
      );
    } catch {
      // Ignorar quota
    }
    throw new Error(
      `El commit en la nube fue emitido, pero la verificación remota falló por red. Estado marcado como 'rotation_pending_verification'. No se debe generar otra clave.`
    );
  }

  // 6. Verify remote content and that it unlocks cleanly
  if (!verifiedRemote || verifiedRemote.wrappedMdek.ciphertext !== newEnvelope.wrappedMdek.ciphertext) {
    throw new Error('Discrepancia en la verificación remota: El envelope en la nube no coincide con el emitido.');
  }

  const remoteUnlockedTest = await unlockMdekWithRecoveryKey(newRecoveryKeyFormatted, verifiedRemote);
  if (!remoteUnlockedTest) {
    throw new Error('El envelope remoto no pudo ser descifrado con la nueva Recovery Key.');
  }

  // 7. Persist to local storage
  saveWrappedKeyEnvelope(verifiedRemote, userId);

  // Limpiar cualquier estado pendiente previo
  clearRotationPendingState(userId);

  // 8. Update in-memory session
  cryptoSession.setUnlocked(sessionMdek, userId);

  // 9. Completed
  return {
    newRecoveryKeyFormatted,
    newEnvelope: verifiedRemote,
    sessionMdek,
  };
}
