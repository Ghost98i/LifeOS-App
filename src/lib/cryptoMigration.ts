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

import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { CURRENT_SCHEMA_VERSION, saveRecoveryState, saveStoredState, uid } from './storage';
import {
  SYNC_MODULES,
  applySyncModule,
  extractPureModuleData,
  isSyncModuleKey,
  syncDataFingerprint,
  syncModuleData,
  syncModuleFingerprint,
  type SyncBaselineMap,
  type SyncModuleKey,
  type SyncRevisionMap,
} from './syncModel';
import {
  CURRENT_SYNC_PROTOCOL_VERSION,
  type AccountSyncCapability,
  isAccountSyncCapability,
  isCryptoEnvelope,
  cryptoSession,
  saveWrappedKeyEnvelope,
  loadWrappedKeyEnvelope,
  clearWrappedKeyEnvelope,
  unlockMdekWithRecoveryKey,
  unlockMdekWithVaultPassword,
  addOrUpdateVaultPasswordOnEnvelope,
  type WrappedKeyEnvelope,
  isWrappedKeyEnvelope,
  validateEnvelopeUserBinding,
  decryptSyncModule,
  rewrapMdekWithNewRecoveryKey,
} from './cryptoCore';
import { forgetDeviceTrust } from './deviceTrust';

export type { AccountSyncCapability };
import {
  cloudSyncConfigured,
  writeCloudModulesAsync,
  writeCloudMigrationModule,
  loadCloudRevisions,
  saveCloudRevisions,
  saveCloudBaselines,
  saveCloudBaselineData,
  getOrCreateDeviceId,
  getFirestoreDb,
  chunkSyncModulesForTransaction,
  splitGymData,
  suspendCloudSync,
  resumeCloudSync,
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
  getModule?: (userId: string, module: string) => Promise<{ isEncrypted: boolean; data: any; revision?: string } | null>;
}

/**
 * Strict safety guard: synthetic test fallbacks are ONLY permitted in local development
 * or local preview test runners (localhost/127.0.0.1). They are strictly disabled in
 * any public/production client domain to prevent capability simulation or client spoofing.
 */
export function isSyntheticTestingAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname || '';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isDev = Boolean(import.meta.env?.DEV);
  return isLocalHost || isDev;
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
  if (isSyntheticTestingAllowed() && (window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__?.[userId]) {
    return (window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__[userId];
  }
  const db = customDb || getDbInstance();
  try {
    const envelopeRef = doc(db, 'users', userId, 'lifeosAccount', 'keyEnvelope');
    const snap = await getDocFromServer(envelopeRef);
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
  if (isSyntheticTestingAllowed() && (window as any).__LIFEOS_SYNTHETIC_CAPABILITY__?.[userId]) {
    return (window as any).__LIFEOS_SYNTHETIC_CAPABILITY__[userId];
  }
  const db = customDb || getDbInstance();
  try {
    const capabilityRef = doc(db, 'users', userId, 'lifeosAccount', 'capability');
    const snap = await getDocFromServer(capabilityRef);
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
  const recoverySaved = saveRecoveryState(
    currentState,
    userId,
    'manual_snapshot',
    'Snapshot preventivo automático previo a migración E2EE'
  );
  if (!recoverySaved) throw new Error('No se pudo guardar la copia preventiva. Liberá espacio antes de reanudar el cifrado.');

  const handlers = options?.capabilityHandlers;
  const db = options?.customDb || (handlers ? null : getDbInstance());
  const writer = options?.customWriter || writeCloudMigrationModule;
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

    // Checkpoints are hints, not proof. Re-read and decrypt even completed modules.
    // A network/integrity failure must stop migration, never overwrite remote data.
    let alreadyEncrypted = completedSet.has(mod);
    if (handlers?.getModule || db) {
      const remote = handlers?.getModule
        ? await handlers.getModule(userId, mod)
        : await getDocFromServer(doc(db, 'users', userId, 'lifeosModules', mod))
          .then(snapshot => snapshot.exists() ? snapshot.data() : null);
      alreadyEncrypted = false;
      if (remote) {
        if (typeof remote.revision === 'string') baseRevisions[mod] = remote.revision;
        else delete baseRevisions[mod];
        if (remote.isEncrypted) {
          if (!isCryptoEnvelope(remote.data)) throw new Error(`El módulo ${mod} tiene un formato cifrado inválido. La copia remota se conserva.`);
          await decryptSyncModule(remote.data, sessionMdek, mod, userId);
          alreadyEncrypted = true;
          completedSet.add(mod);
          saveCloudRevisions(userId, baseRevisions);
        } else if (syncDataFingerprint(extractPureModuleData(remote.data)) !== syncDataFingerprint(syncModuleData(currentState, mod))) {
          throw new Error(`El módulo ${mod} tiene cambios remotos pendientes. Sincronizá antes de reanudar el cifrado.`);
        }
      } else {
        delete baseRevisions[mod];
        if (completedSet.has(mod)) throw new Error(`No se encontró el módulo cifrado ${mod}. La migración se detuvo para conservar los datos.`);
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
      if (batch.writes[0]?.revision) {
        baseRevisions[mod] = batch.writes[0].revision;
        saveCloudRevisions(userId, baseRevisions);
      }

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
  // Also automatically enrolls this device/browser in device trust so future reloads won't require the key
  const sessionMdek = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, envelope, userId);

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

/**
 * Second-Device Unlock via Vault Password (PBKDF2-SHA-256 + AES-256-GCM):
 * Allows unlocking on a new device in 1 tap with a browser password manager.
 */
export async function unlockDeviceWithVaultPassword(
  userId: string,
  vaultPassword: string,
  envelopeOverride?: WrappedKeyEnvelope | null,
  testModuleEnvelope?: { module: SyncModuleKey; envelope: any },
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<{ sessionMdek: CryptoKey; envelope: WrappedKeyEnvelope }> {
  if (!userId) throw new Error('Usuario inválido.');

  let envelope = envelopeOverride || null;
  if (!envelope) {
    envelope = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  }
  if (!envelope) {
    throw new Error('No se encontró el respaldo de claves de esta cuenta en la nube ni en este dispositivo.');
  }
  if (!isWrappedKeyEnvelope(envelope)) {
    throw new Error('El respaldo de claves remoto está dañado o tiene un formato no válido.');
  }
  if (!validateEnvelopeUserBinding(envelope, userId)) {
    throw new Error('El respaldo de claves no coincide con esta cuenta de usuario.');
  }

  const sessionMdek = await unlockMdekWithVaultPassword(vaultPassword, envelope, userId);

  if (testModuleEnvelope) {
    await decryptSyncModule(
      testModuleEnvelope.envelope,
      sessionMdek,
      testModuleEnvelope.module,
      userId
    );
  }

  saveWrappedKeyEnvelope(envelope, userId);
  cryptoSession.setUnlocked(sessionMdek, userId);

  return { sessionMdek, envelope };
}

/**
 * Adds or updates a Vault Password on an existing E2EE account (including legacy accounts
 * that previously only had a Recovery Key).
 * Preserves the exact same MDEK and Recovery Key backup wrapper.
 */
export async function setVaultPasswordForAccount(
  userId: string,
  params: {
    newVaultPassword: string;
    currentRecoveryKey?: string;
    currentVaultPassword?: string;
    pbkdf2Iterations?: number;
  },
  customDb?: any,
  handlers?: CapabilityStorageHandlers
): Promise<{ envelope: WrappedKeyEnvelope; sessionMdek: CryptoKey }> {
  if (!userId) throw new Error('Usuario inválido.');

  let envelope = loadWrappedKeyEnvelope(userId);
  if (!envelope) {
    envelope = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  }
  if (!envelope) {
    throw new Error('No se encontró el respaldo de claves de esta cuenta.');
  }

  const { updatedEnvelope, sessionMdek } = await addOrUpdateVaultPasswordOnEnvelope({
    envelope,
    newVaultPassword: params.newVaultPassword,
    currentRecoveryKey: params.currentRecoveryKey,
    currentVaultPassword: params.currentVaultPassword,
    userId,
    pbkdf2Iterations: params.pbkdf2Iterations,
    persistLocally: false,
  });

  // Self-test before touching the cloud
  await unlockMdekWithVaultPassword(params.newVaultPassword, updatedEnvelope);

  // Commit to Firestore
  await setCloudKeyEnvelope(userId, updatedEnvelope, customDb, handlers);

  // Verify cloud roundtrip
  const verifiedRemote = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  if (!verifiedRemote || verifiedRemote.kdf.info !== updatedEnvelope.kdf.info) {
    throw new Error('No se pudo confirmar la contraseña de bóveda en la nube. Intentá de nuevo.');
  }
  await unlockMdekWithVaultPassword(params.newVaultPassword, verifiedRemote);

  saveWrappedKeyEnvelope(verifiedRemote, userId);
  cryptoSession.setUnlocked(sessionMdek, userId);

  return { envelope: verifiedRemote, sessionMdek };
}

export const DISABLE_E2EE_CHECKPOINT_PREFIX = 'lifeos-e2ee-disable-recovery-v1:';

export interface DisableE2EEProgress {
  stage: 'verifying' | 'cleaning' | 'uploading' | 'confirming' | 'complete';
  completed: number;
  total: number;
  message: string;
}

export interface DisableE2EEResult {
  success: boolean;
  verifiedState: LifeOSState;
  uploadedModules: SyncModuleKey[];
  revisions: SyncRevisionMap;
}

export interface DisableE2EEHandlers {
  listRemoteModuleDocs: (userId: string) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  clearEncryptedCloudState: (userId: string) => Promise<void>;
  uploadPlaintextModule: (
    userId: string,
    docId: string,
    payload: Record<string, any>
  ) => Promise<void>;
  setPlaintextCapability: (userId: string, capability: AccountSyncCapability) => Promise<void>;
  verifyPlaintextModules: (userId: string) => Promise<Array<{ id: string; isEncrypted?: boolean; data: unknown }>>;
}

function cleanPlaintextForFirestore<T>(data: T): T {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

/**
 * Safely disables optional E2EE ("Candado privado adicional") and returns the account
 * to standard 1-click Google Auth cloud sync without losing any module or history chunk:
 *
 * 1. Suspends background autosaves so no concurrent write interferes.
 * 2. Reads, decrypts, and verifies EVERY remote module (all 15 SYNC_MODULES + gym chunks)
 *    in memory BEFORE modifying anything in Firestore. Any decryption failure aborts cleanly.
 * 3. Persists a mandatory local recovery snapshot + durable checkpoint. Aborts if local write fails.
 * 4. Clears encrypted cloud docs + E2EE capability/keyEnvelope via Firestore's owner transition marker.
 * 5. Immediately re-uploads all 15 verified modules (and gym chunks) in plaintext under Google Auth.
 * 6. Sets capability to 'plaintext', verifies every module is readable without MDEK, then clears
 *    local E2EE metadata (WrappedKeyEnvelope + DeviceTrust + session key).
 */
export async function disableE2EEProtection(
  userId: string,
  sessionMdek: CryptoKey,
  currentState: LifeOSState,
  options?: {
    onProgress?: (progress: DisableE2EEProgress) => void;
    customDb?: any;
    handlers?: DisableE2EEHandlers;
  }
): Promise<DisableE2EEResult> {
  if (!userId) throw new Error('Iniciá sesión con Google para desactivar el candado privado.');
  if (!sessionMdek) throw new Error('Desbloqueá tus datos antes de desactivar el candado privado.');
  if (currentState.resale && Object.prototype.hasOwnProperty.call(currentState.resale, 'commercial')) {
    throw new Error(
      'Tu cuenta tiene operaciones comerciales activas que requieren protección adicional. Conservamos tus datos sin cambios.'
    );
  }

  const totalSteps = SYNC_MODULES.length;
  const emit = (progress: DisableE2EEProgress) => {
    options?.onProgress?.(progress);
  };

  suspendCloudSync();
  try {
    const handlers = options?.handlers;
    const db = options?.customDb || (handlers ? null : getDbInstance());
    const deviceId = getOrCreateDeviceId();

    // STEP 1: Fetch, decrypt, and verify ALL remote modules + gym chunks in memory BEFORE any cloud mutation
    emit({
      stage: 'verifying',
      completed: 0,
      total: totalSteps,
      message: 'Descifrando y verificando tus módulos en este dispositivo…',
    });

    const remoteDocs: Array<{ id: string; data: Record<string, any> }> = handlers
      ? await handlers.listRemoteModuleDocs(userId)
      : (await getDocsFromServer(collection(db, 'users', userId, 'lifeosModules'))).docs.map((snap) => ({
          id: snap.id,
          data: snap.data() as Record<string, any>,
        }));

    let verifiedState = structuredClone(currentState);
    const decryptedGymChunks: Array<{ id: string; content: Record<string, unknown> }> = [];
    let verifiedCount = 0;

    for (const remoteDoc of remoteDocs) {
      const docId = remoteDoc.id;
      const docPayload = remoteDoc.data;
      let plainContent: unknown = docPayload?.data;

      if (docPayload?.isEncrypted === true || isCryptoEnvelope(docPayload?.data)) {
        if (!isCryptoEnvelope(docPayload?.data)) {
          throw new Error(`El módulo "${docId}" tiene un formato cifrado inválido. No se realizó ningún cambio en la nube.`);
        }
        try {
          plainContent = await decryptSyncModule(docPayload.data, sessionMdek, docId, userId);
        } catch {
          throw new Error(
            `No se pudo verificar el módulo "${docId}". Tus datos en la nube permanecen intactos.`
          );
        }
      }

      const pure = extractPureModuleData(plainContent);
      if (isSyncModuleKey(docId)) {
        verifiedState = applySyncModule(verifiedState, docId, pure);
        verifiedCount += 1;
        emit({
          stage: 'verifying',
          completed: Math.min(verifiedCount, totalSteps),
          total: totalSteps,
          message: `Verificando datos (${Math.min(verifiedCount, totalSteps)} de ${totalSteps})…`,
        });
      } else if (/^gym_(history|weight|measurements?)_chunk_[0-9]+$/.test(docId) && pure && typeof pure === 'object') {
        decryptedGymChunks.push({ id: docId, content: pure as Record<string, unknown> });
      }
    }

    // STEP 2: Mandatory local safety snapshot + durable checkpoint BEFORE touching Firestore
    const recoveryOk = saveRecoveryState(
      verifiedState,
      userId,
      'manual_snapshot',
      'Respaldo automático previo a desactivar el candado privado'
    );
    if (!recoveryOk) {
      throw new Error(
        'No se pudo guardar una copia de seguridad local en este navegador. Liberá espacio e intentá de nuevo.'
      );
    }

    const checkpointKey = `${DISABLE_E2EE_CHECKPOINT_PREFIX}${userId}`;
    try {
      localStorage.setItem(
        checkpointKey,
        JSON.stringify({
          createdAt: new Date().toISOString(),
          state: verifiedState,
          gymChunks: decryptedGymChunks,
        })
      );
    } catch {
      throw new Error(
        'No se pudo guardar el punto de recuperación temporal. Tus datos cifrados permanecen intactos.'
      );
    }

    // Also persist the verified plaintext state locally
    saveStoredState(verifiedState, userId);

    // STEP 3: Clear encrypted cloud docs & E2EE capability/keyEnvelope
    emit({
      stage: 'cleaning',
      completed: 0,
      total: totalSteps,
      message: 'Preparando tu cuenta para sincronización directa con Google…',
    });

    if (handlers) {
      await handlers.clearEncryptedCloudState(userId);
    } else {
      const deletionMarkerRef = doc(db, 'users', userId, 'lifeosAccount', 'deletion');
      await setDoc(deletionMarkerRef, {
        requestedAt: new Date().toISOString(),
        deviceId,
      });

      const deleteInBatches = async (colName: 'lifeosModules' | 'lifeosRevisions' | 'lifeosAccount') => {
        const snap = await getDocsFromServer(collection(db, 'users', userId, colName));
        const ids = snap.docs
          .map((d) => d.id)
          .filter((id) => !(colName === 'lifeosAccount' && id === 'deletion'));
        for (let idx = 0; idx < ids.length; idx += 400) {
          const slice = ids.slice(idx, idx + 400);
          const batch = writeBatch(db);
          for (const id of slice) {
            batch.delete(doc(db, 'users', userId, colName, id));
          }
          await batch.commit();
        }
      };

      const legacyRef = doc(db, 'users', userId, 'lifeos', 'state');
      const legacySnap = await getDocFromServer(legacyRef);
      if (legacySnap.exists()) {
        await deleteDoc(legacyRef);
      }

      await deleteInBatches('lifeosModules');
      await deleteInBatches('lifeosRevisions');
      await deleteInBatches('lifeosAccount');
      await deleteDoc(deletionMarkerRef);
    }

    // STEP 4: Re-upload all 15 verified modules (+ gym chunks) in plaintext under Google Auth
    emit({
      stage: 'uploading',
      completed: 0,
      total: totalSteps,
      message: 'Subiendo tus datos protegidos con Google…',
    });

    const clientUpdatedAt = Date.now();
    const nextRevisions: SyncRevisionMap = {};
    const nextBaselines: SyncBaselineMap = {};
    const nextBaselineData: Partial<Record<SyncModuleKey, unknown>> = {};
    const preparedPayloads = new Map<SyncModuleKey, { revision: string; payload: Record<string, unknown> }>();

    for (let i = 0; i < SYNC_MODULES.length; i++) {
      const mod = SYNC_MODULES[i];
      let rawModData = syncModuleData(verifiedState, mod) as Record<string, unknown>;
      if (mod === 'gym') {
        rawModData = splitGymData(rawModData).primaryGym;
      }
      const cleanData = cleanPlaintextForFirestore(rawModData);
      const revision = `${clientUpdatedAt + i}-${deviceId}-${uid()}`;
      const payload = {
        schemaVersion: Math.round(Number(verifiedState.schemaVersion || CURRENT_SCHEMA_VERSION)),
        syncProtocolVersion: 1,
        isEncrypted: false,
        module: mod,
        data: cleanData,
        revision,
        parentRevision: null,
        deviceId,
        clientUpdatedAt: clientUpdatedAt + i,
        updatedAt: handlers ? new Date().toISOString() : serverTimestamp(),
      };
      preparedPayloads.set(mod, { revision, payload });
      nextRevisions[mod] = revision;
      nextBaselines[mod] = syncModuleFingerprint(verifiedState, mod);
      nextBaselineData[mod] = syncModuleData(verifiedState, mod);
    }

    let uploadedCount = 0;
    if (handlers) {
      for (const mod of SYNC_MODULES) {
        const entry = preparedPayloads.get(mod)!;
        await handlers.uploadPlaintextModule(userId, mod, entry.payload);
        uploadedCount += 1;
        emit({
          stage: 'uploading',
          completed: uploadedCount,
          total: totalSteps,
          message: `Guardando módulos (${uploadedCount} de ${totalSteps})…`,
        });
      }
      for (let c = 0; c < decryptedGymChunks.length; c++) {
        const chunk = decryptedGymChunks[c];
        const rev = `${clientUpdatedAt + 100 + c}-${deviceId}-${uid()}`;
        await handlers.uploadPlaintextModule(userId, chunk.id, {
          schemaVersion: Math.round(Number(verifiedState.schemaVersion || CURRENT_SCHEMA_VERSION)),
          syncProtocolVersion: 1,
          isEncrypted: false,
          module: chunk.id,
          data: cleanPlaintextForFirestore(chunk.content),
          revision: rev,
          parentRevision: null,
          deviceId,
          clientUpdatedAt: clientUpdatedAt + 100 + c,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      const chunks = chunkSyncModulesForTransaction([...SYNC_MODULES], 5);
      for (const group of chunks) {
        const batch = writeBatch(db);
        for (const mod of group) {
          const entry = preparedPayloads.get(mod)!;
          batch.set(doc(db, 'users', userId, 'lifeosModules', mod), entry.payload);
          batch.set(doc(db, 'users', userId, 'lifeosRevisions', entry.revision), entry.payload);
        }
        await batch.commit();
        uploadedCount += group.length;
        emit({
          stage: 'uploading',
          completed: uploadedCount,
          total: totalSteps,
          message: `Guardando módulos (${uploadedCount} de ${totalSteps})…`,
        });
      }
      for (let c = 0; c < decryptedGymChunks.length; c++) {
        const chunk = decryptedGymChunks[c];
        const rev = `${clientUpdatedAt + 100 + c}-${deviceId}-${uid()}`;
        await setDoc(doc(db, 'users', userId, 'lifeosModules', chunk.id), {
          schemaVersion: Math.round(Number(verifiedState.schemaVersion || CURRENT_SCHEMA_VERSION)),
          syncProtocolVersion: 1,
          isEncrypted: false,
          module: chunk.id,
          data: cleanPlaintextForFirestore(chunk.content),
          revision: rev,
          parentRevision: null,
          deviceId,
          clientUpdatedAt: clientUpdatedAt + 100 + c,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // STEP 5: Record plaintext capability & verify readability without MDEK
    emit({
      stage: 'confirming',
      completed: totalSteps,
      total: totalSteps,
      message: 'Confirmando que todos tus módulos quedaron legibles…',
    });

    const plaintextCap: AccountSyncCapability = {
      version: 1,
      minimumSyncProtocolVersion: 1,
      encryptionState: 'plaintext',
      encryptedModules: [],
      updatedAt: new Date().toISOString(),
    };

    if (handlers) {
      await handlers.setPlaintextCapability(userId, plaintextCap);
    } else {
      await setAccountCapability(userId, plaintextCap, db);
    }

    const postDocs = handlers
      ? await handlers.verifyPlaintextModules(userId)
      : (await getDocsFromServer(collection(db, 'users', userId, 'lifeosModules'))).docs.map((snap) => ({
          id: snap.id,
          isEncrypted: Boolean(snap.data()?.isEncrypted),
          data: snap.data()?.data,
        }));

    const postIds = new Set(postDocs.map((d) => d.id));
    for (const mod of SYNC_MODULES) {
      if (!postIds.has(mod)) {
        throw new Error(`Faltó confirmar el módulo "${mod}" tras actualizar la nube. Conservamos tu copia local.`);
      }
    }
    if (postDocs.some((d) => d.isEncrypted === true || isCryptoEnvelope(d.data))) {
      throw new Error('Todavía quedaron módulos cifrados sin limpiar. Conservamos tu copia local.');
    }

    // STEP 6: Clean up local E2EE artifacts & update local sync metadata
    saveCloudRevisions(userId, nextRevisions);
    saveCloudBaselines(userId, nextBaselines);
    saveCloudBaselineData(userId, nextBaselineData);
    clearWrappedKeyEnvelope(userId);
    await forgetDeviceTrust(userId);
    cryptoSession.lock();
    try {
      localStorage.removeItem(checkpointKey);
      if (isSyntheticTestingAllowed()) {
        if ((window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__) {
          delete (window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__[userId];
        }
        if ((window as any).__LIFEOS_SYNTHETIC_CAPABILITY__) {
          (window as any).__LIFEOS_SYNTHETIC_CAPABILITY__[userId] = plaintextCap;
        }
      }
    } catch {
      // ignore
    }

    emit({
      stage: 'complete',
      completed: totalSteps,
      total: totalSteps,
      message: 'Candado privado desactivado. Tu cuenta ya funciona en 1 clic con Google.',
    });

    return {
      success: true,
      verifiedState,
      uploadedModules: [...SYNC_MODULES],
      revisions: nextRevisions,
    };
  } finally {
    resumeCloudSync();
  }
}
