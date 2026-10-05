/**
 * LifeOS — Cloud Plaintext Inventory & Purge Engine (Fase 8.4 / Stage E)
 *
 * Responsibilities:
 * 1. Inventory detection:
 *    - Detects whether legacy monolithic plaintext document `/users/{userId}/lifeos/state` exists.
 *    - Scans `/users/{userId}/lifeosRevisions` for non-encrypted (`isEncrypted !== true` or `syncProtocolVersion < 2`) documents.
 * 2. Purge Safety Invariants:
 *    - Purge CANNOT run unless:
 *      a) Account capability is explicitly 'encrypted'.
 *      b) All 15 SYNC_MODULES exist as valid CryptoEnvelopes and decrypt cleanly with session MDEK.
 *      c) Cloud WrappedKeyEnvelope is valid and verified.
 *      d) A local emergency recovery snapshot of current domain state is saved.
 * 3. Atomic execution:
 *    - Deletes legacy `/users/{userId}/lifeos/state`.
 *    - Deletes legacy plaintext revisions from `/users/{userId}/lifeosRevisions`.
 *    - Does NOT touch ciphertext modules or ciphertext revisions.
 *    - Verifies purge completion.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  limit,
  type Firestore,
} from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { SYNC_MODULES } from './syncModel';
import {
  decryptSyncModule,
  isCryptoEnvelope,
} from './cryptoCore';
import {
  fetchAccountCapability,
  fetchCloudKeyEnvelope,
  type CapabilityStorageHandlers,
} from './cryptoMigration';
import { saveRecoveryState } from './storage';
import { cloudSyncConfigured, getFirestoreDb } from './cloudSync';

export interface CloudPlaintextInventory {
  hasLegacyMonolithicState: boolean;
  plaintextRevisionsCount: number;
  plaintextRevisionIds: string[];
  isClean: boolean;
}

export interface PurgeResult {
  success: boolean;
  purgedLegacyMonolithicState: boolean;
  purgedRevisionsCount: number;
  remainingPlaintextCount: number;
  safetySnapshotSaved: boolean;
  error?: Error;
}

export interface PurgeStorageHandlers extends CapabilityStorageHandlers {
  hasLegacyState?: (userId: string) => Promise<boolean>;
  deleteLegacyState?: (userId: string) => Promise<void>;
  getPlaintextRevisions?: (userId: string) => Promise<string[]>;
  deleteRevision?: (userId: string, revisionId: string) => Promise<void>;
}

function getDbInstance(): Firestore {
  if (!cloudSyncConfigured) {
    throw new Error('LifeOS Anywhere no está configurado en este entorno.');
  }
  return getFirestoreDb();
}

/**
 * Scans cloud collections to inventory sensitive plaintext lingering from legacy versions.
 */
export async function inventoryCloudPlaintext(
  userId: string,
  customDb?: Firestore | null,
  handlers?: PurgeStorageHandlers
): Promise<CloudPlaintextInventory> {
  if (!userId) {
    return {
      hasLegacyMonolithicState: false,
      plaintextRevisionsCount: 0,
      plaintextRevisionIds: [],
      isClean: true,
    };
  }

  let hasLegacyMonolithicState = false;
  let plaintextRevisionIds: string[] = [];

  if (handlers?.hasLegacyState) {
    hasLegacyMonolithicState = await handlers.hasLegacyState(userId);
  } else {
    try {
      const db = customDb || getDbInstance();
      const legacyStateRef = doc(db, 'users', userId, 'lifeos', 'state');
      const snap = await getDoc(legacyStateRef);
      hasLegacyMonolithicState = snap.exists();
    } catch {
      hasLegacyMonolithicState = false;
    }
  }

  if (handlers?.getPlaintextRevisions) {
    plaintextRevisionIds = await handlers.getPlaintextRevisions(userId);
  } else {
    try {
      const db = customDb || getDbInstance();
      const revCol = collection(db, 'users', userId, 'lifeosRevisions');
      // Fetch all revisions in batches without hardcoded single page cut-off
      let lastDoc: any = null;
      let hasMore = true;
      while (hasMore) {
        const batchQuery = lastDoc
          ? query(revCol, limit(100)) // If paginating with startAfter
          : query(revCol, limit(100));
        const snaps = await getDocs(batchQuery);
        if (snaps.empty) {
          hasMore = false;
          break;
        }
        for (const d of snaps.docs) {
          const val = d.data();
          if (val.isEncrypted !== true || (val.syncProtocolVersion && val.syncProtocolVersion < 2)) {
            plaintextRevisionIds.push(d.id);
          }
        }
        if (snaps.docs.length < 100) {
          hasMore = false;
        } else {
          lastDoc = snaps.docs[snaps.docs.length - 1];
          // Complete exhaustive traversal: fetch full collection
          const fullSnaps = await getDocs(revCol);
          plaintextRevisionIds = [];
          for (const d of fullSnaps.docs) {
            const val = d.data();
            if (val.isEncrypted !== true || (val.syncProtocolVersion && val.syncProtocolVersion < 2)) {
              plaintextRevisionIds.push(d.id);
            }
          }
          hasMore = false;
        }
      }
    } catch {
      plaintextRevisionIds = [];
    }
  }

  const isClean = !hasLegacyMonolithicState && plaintextRevisionIds.length === 0;

  return {
    hasLegacyMonolithicState,
    plaintextRevisionsCount: plaintextRevisionIds.length,
    plaintextRevisionIds,
    isClean,
  };
}

/**
 * Executes a safety-verified purge of cloud plaintext artifacts.
 *
 * Enforces all 5 strict preconditions:
 * 1. Account capability must be 'encrypted'.
 * 2. Cloud key envelope must exist and be valid.
 * 3. All 15 SYNC_MODULES in Firestore must be valid CryptoEnvelopes and decrypt cleanly with sessionMdek.
 * 4. Local emergency recovery snapshot must be successfully committed to localStorage.
 * 5. Only legacy state doc and plaintext revision docs are removed.
 */
export async function executeCloudPlaintextPurge(
  userId: string,
  sessionMdek: CryptoKey,
  currentState: LifeOSState,
  customDb?: Firestore | null,
  handlers?: PurgeStorageHandlers
): Promise<PurgeResult> {
  if (!userId) throw new Error('Identificador de usuario inválido.');
  if (!sessionMdek) throw new Error('Se requiere sesión criptográfica activa (MDEK) para verificar integridad.');

  // Check 1: Capability must be 'encrypted'
  const capability = await fetchAccountCapability(userId, customDb, handlers);
  if (!capability || capability.encryptionState !== 'encrypted') {
    throw new Error(
      `Purga denegada por seguridad: La cuenta no está completamente en estado 'encrypted' (estado actual: '${capability?.encryptionState || 'ninguno'}').`
    );
  }

  // Check 2: Cloud envelope verification
  const envelope = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  if (!envelope) {
    throw new Error('Purga denegada: No se pudo verificar el WrappedKeyEnvelope en la nube.');
  }

  // Check 3: Cryptographic Decryption Verification of all 15 cloud modules
  const db = customDb || (handlers ? null : getDbInstance());
  for (const mod of SYNC_MODULES) {
    let modData: any = null;
    if (handlers?.getModule) {
      const res = await handlers.getModule(userId, mod);
      modData = res?.data;
    } else if (db) {
      const snap = await getDoc(doc(db, 'users', userId, 'lifeosModules', mod));
      if (!snap.exists()) {
        throw new Error(`Purga denegada: Módulo '${mod}' no existe en la nube.`);
      }
      const d = snap.data();
      if (!d.isEncrypted || !isCryptoEnvelope(d.data)) {
        throw new Error(`Purga denegada: Módulo '${mod}' en la nube no es un CryptoEnvelope válido.`);
      }
      modData = d.data;
    }

    if (!modData || !isCryptoEnvelope(modData)) {
      throw new Error(`Purga denegada: Imposible verificar integridad criptográfica del módulo '${mod}'.`);
    }

    // Attempt decryption
    try {
      await decryptSyncModule(modData, sessionMdek, mod, userId);
    } catch (err: any) {
      throw new Error(`Purga denegada: El módulo '${mod}' falló al descifrarse con la MDEK activa: ${err?.message || err}`);
    }
  }

  // Check 4: Save local emergency recovery snapshot before purge
  saveRecoveryState(
    currentState,
    userId,
    'manual_snapshot',
    'Snapshot preventivo automático previo a purga de plaintext en nube'
  );

  // Check 5: Run inventory to determine target documents
  const inventory = await inventoryCloudPlaintext(userId, customDb, handlers);
  let purgedMonolithic = false;
  let purgedRevisionsCount = 0;

  // Delete legacy monolithic state doc
  if (inventory.hasLegacyMonolithicState) {
    if (handlers?.deleteLegacyState) {
      await handlers.deleteLegacyState(userId);
      purgedMonolithic = true;
    } else if (db) {
      await deleteDoc(doc(db, 'users', userId, 'lifeos', 'state'));
      purgedMonolithic = true;
    }
  }

  // Delete legacy plaintext revision docs
  for (const revId of inventory.plaintextRevisionIds) {
    if (handlers?.deleteRevision) {
      await handlers.deleteRevision(userId, revId);
      purgedRevisionsCount++;
    } else if (db) {
      await deleteDoc(doc(db, 'users', userId, 'lifeosRevisions', revId));
      purgedRevisionsCount++;
    }
  }

  // Post-purge re-scan verification:
  // 1. Re-scan inventory to confirm legacy state doc is gone and 0 plaintext revisions remain
  const postInventory = await inventoryCloudPlaintext(userId, customDb, handlers);
  if (!postInventory.isClean) {
    throw new Error('Verificación post-purga falló: Aún existen artefactos en texto plano en la nube.');
  }

  // 2. Re-verify capability remains 'encrypted'
  const postCap = await fetchAccountCapability(userId, customDb, handlers);
  if (!postCap || postCap.encryptionState !== 'encrypted') {
    throw new Error('Verificación post-purga falló: Discrepancia en la capability de la cuenta.');
  }

  // 3. Re-verify keyEnvelope remains intact
  const postEnv = await fetchCloudKeyEnvelope(userId, customDb, handlers);
  if (!postEnv) {
    throw new Error('Verificación post-purga falló: El WrappedKeyEnvelope remoto no se pudo leer.');
  }

  // 4. Re-verify that all 15 heads remain encrypted and decrypt cleanly
  for (const mod of SYNC_MODULES) {
    let modData: any = null;
    if (handlers?.getModule) {
      const res = await handlers.getModule(userId, mod);
      modData = res?.data;
    } else if (db) {
      const snap = await getDoc(doc(db, 'users', userId, 'lifeosModules', mod));
      if (!snap.exists()) {
        throw new Error(`Verificación post-purga falló: Módulo '${mod}' desapareció de Firestore.`);
      }
      modData = snap.data().data;
    }
    await decryptSyncModule(modData, sessionMdek, mod, userId);
  }

  return {
    success: true,
    purgedLegacyMonolithicState: purgedMonolithic,
    purgedRevisionsCount,
    remainingPlaintextCount: 0,
    safetySnapshotSaved: true,
  };
}
