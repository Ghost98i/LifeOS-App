import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { CURRENT_SCHEMA_VERSION, normalizeStoredState, uid } from './storage';
import {
  SYNC_MODULES,
  isSyncModuleKey,
  syncModuleData,
  extractPureModuleData,
  type SyncModuleKey,
  type SyncBaselineMap,
  type SyncRevisionMap,
} from './syncModel';
import {
  cryptoSession,
  encodeCloudModuleData,
  decodeCloudModuleData,
  CURRENT_SYNC_PROTOCOL_VERSION,
} from './cryptoCore';
import appletConfig from '../../firebase-applet-config.json';

export type CloudSyncStatus =
  | 'unavailable'
  | 'signed-out'
  | 'connecting'
  | 'saving'
  | 'synced'
  | 'offline'
  | 'locked'
  | 'conflict'
  | 'error';

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
}

export interface CloudModuleHead {
  module: SyncModuleKey;
  data: unknown;
  revision: string;
  parentRevision: string | null;
  deviceId: string;
  clientUpdatedAt: number;
  fromCache: boolean;
  pendingWrites: boolean;
  syncProtocolVersion?: number;
  isEncrypted?: boolean;
}

export interface CloudModulesSnapshot {
  heads: CloudModuleHead[];
  fromCache: boolean;
  pendingWrites: boolean;
}

export interface PreparedCloudWrite {
  module: SyncModuleKey;
  revision: string;
  parentRevision: string | null;
}

export interface CloudWriteBatch {
  writes: PreparedCloudWrite[];
  completion: Promise<void>;
}

const DEFAULT_FIREBASE_CONFIG = {
  projectId: 'lifeosanywhere',
  appId: '1:177511653491:web:e1242266f2b7620ae60a06',
  apiKey: 'AIzaSyAMZHa2xmHslOVKzxIp4SpBYeLJdT-aruQ',
  authDomain: 'lifeosanywhere.firebaseapp.com',
  storageBucket: 'lifeosanywhere.firebasestorage.app',
  messagingSenderId: '177511653491',
  measurementId: 'G-YST3MQ8V9R',
};

const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env
    : (typeof process !== 'undefined' && process.env ? (process.env as Record<string, string | undefined>) : {});

const config = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || appletConfig.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || appletConfig.appId || DEFAULT_FIREBASE_CONFIG.appId,
};

const isPortable = typeof __LIFEOS_PORTABLE__ !== 'undefined' && Boolean(__LIFEOS_PORTABLE__);

export const cloudSyncConfigured =
  !isPortable &&
  Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

const DEVICE_KEY = 'lifeos-device-id-v1';
const PAIRED_USER_KEY = 'lifeos-cloud-paired-user-v2';
const LAST_USER_KEY = 'lifeos-cloud-last-user-v2';
const REVISION_KEY = 'lifeos-cloud-revisions-v2';
const BASELINE_KEY = 'lifeos-cloud-baselines-v2';

let firestore: Firestore | null = null;
let persistenceReady: Promise<void> | null = null;

function services() {
  if (!cloudSyncConfigured) throw new Error('LifeOS Anywhere todavía no está configurado.');

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  persistenceReady ||= setPersistence(auth, browserLocalPersistence).catch(() => undefined);

  if (!firestore) {
    try {
      firestore = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ignoreUndefinedProperties: true,
      });
    } catch {
      firestore = getFirestore(app);
    }
  }

  return { auth, db: firestore };
}

export function getFirestoreDb(): Firestore {
  return services().db;
}

function toCloudUser(user: User | null): CloudUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
}

export function getOrCreateDeviceId(): string {
  const current = localStorage.getItem(DEVICE_KEY);
  if (current) return current;
  const generated = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `device-${uid()}-${uid()}`;
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

export function getLastCloudUserId(): string | null {
  return localStorage.getItem(LAST_USER_KEY);
}

export function markLastCloudUserId(userId: string): void {
  localStorage.setItem(LAST_USER_KEY, userId);
}

export function isCloudPaired(userId: string): boolean {
  return localStorage.getItem(`${PAIRED_USER_KEY}:${userId}`) === 'true';
}

export function markCloudPaired(userId: string): void {
  localStorage.setItem(`${PAIRED_USER_KEY}:${userId}`, 'true');
}

export function loadCloudRevisions(userId: string): SyncRevisionMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${REVISION_KEY}:${userId}`) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => isSyncModuleKey(key) && typeof value === 'string')) as SyncRevisionMap;
  } catch {
    return {};
  }
}

export function saveCloudRevisions(userId: string, revisions: SyncRevisionMap): void {
  localStorage.setItem(`${REVISION_KEY}:${userId}`, JSON.stringify(revisions));
}

export function loadCloudBaselines(userId: string): SyncBaselineMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${BASELINE_KEY}:${userId}`) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => isSyncModuleKey(key) && typeof value === 'string')) as SyncBaselineMap;
  } catch {
    return {};
  }
}

export function saveCloudBaselines(userId: string, baselines: SyncBaselineMap): void {
  localStorage.setItem(`${BASELINE_KEY}:${userId}`, JSON.stringify(baselines));
}

const BASELINE_DATA_KEY = 'lifeos-cloud-baselinedata-v2';

export function loadCloudBaselineData(userId: string): Partial<Record<SyncModuleKey, unknown>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${BASELINE_DATA_KEY}:${userId}`) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([key]) => isSyncModuleKey(key))) as Partial<Record<SyncModuleKey, unknown>>;
  } catch {
    return {};
  }
}

export function saveCloudBaselineData(userId: string, data: Partial<Record<SyncModuleKey, unknown>>): void {
  try {
    localStorage.setItem(`${BASELINE_DATA_KEY}:${userId}`, JSON.stringify(data));
  } catch {
    // Ignore quota issues
  }
}

const SNAPSHOT_PREFIX = 'lifeos-sync-snapshot-';

export function saveSyncRecoverySnapshot(
  userId: string,
  type: 'local' | 'remote' | 'base',
  state: LifeOSState
): void {
  try {
    localStorage.setItem(`${SNAPSHOT_PREFIX}${type}:${userId}`, JSON.stringify(state));
  } catch {
    // Ignore quota issues
  }
}

export function loadSyncRecoverySnapshot(
  userId: string,
  type: 'local' | 'remote' | 'base'
): LifeOSState | null {
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${type}:${userId}`);
    if (!raw) return null;
    return normalizeStoredState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSyncRecoverySnapshots(userId: string): void {
  try {
    localStorage.removeItem(`${SNAPSHOT_PREFIX}local:${userId}`);
    localStorage.removeItem(`${SNAPSHOT_PREFIX}remote:${userId}`);
    localStorage.removeItem(`${SNAPSHOT_PREFIX}base:${userId}`);
  } catch {
    // Ignore
  }
}

export { hasMeaningfulData } from './storage';

export function observeCloudUser(onChange: (user: CloudUser | null) => void): () => void {
  if (!cloudSyncConfigured) {
    onChange(null);
    return () => undefined;
  }
  const { auth } = services();
  // Resuelve credenciales de redirect en móviles y PWAs standalone
  getRedirectResult(auth).catch((error) => {
    console.warn('Firebase redirect auth notice:', error);
  });
  return onAuthStateChanged(auth, (user) => onChange(toCloudUser(user)));
}

export async function signInToCloud(): Promise<void> {
  const { auth } = services();
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // Intenta popup primero (más fluido en PC y navegadores modernos sin recargar la aplicación).
  // Si el navegador o PWA bloquea popups, recurre automáticamente a redirección.
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code.includes('popup-closed-by-user')) {
      return;
    }
    if (
      code.includes('popup-blocked') ||
      code.includes('cancelled-popup-request') ||
      code.includes('operation-not-supported-in-this-environment')
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

export async function signOutFromCloud(): Promise<void> {
  const { auth } = services();
  await signOut(auth);
}

function modulesCollection(userId: string) {
  const { db } = services();
  return collection(db, 'users', userId, 'lifeosModules');
}

function revisionsCollection(userId: string) {
  const { db } = services();
  return collection(db, 'users', userId, 'lifeosRevisions');
}

export function subscribeCloudModules(
  userId: string,
  handlers: {
    onSnapshot: (snapshot: CloudModulesSnapshot) => void;
    onError: (error: Error) => void;
  }
): () => void {
  return onSnapshot(
    modulesCollection(userId),
    { includeMetadataChanges: true },
    (snapshot) => {
      const heads: CloudModuleHead[] = [];
      for (const moduleDoc of snapshot.docs) {
        if (!isSyncModuleKey(moduleDoc.id)) continue;
        const data = moduleDoc.data();
        if (typeof data.revision !== 'string' || !('data' in data)) continue;
        heads.push({
          module: moduleDoc.id,
          data: data.data,
          revision: data.revision,
          parentRevision: typeof data.parentRevision === 'string' ? data.parentRevision : null,
          deviceId: typeof data.deviceId === 'string' ? data.deviceId : '',
          clientUpdatedAt: Number(data.clientUpdatedAt || 0),
          fromCache: moduleDoc.metadata.fromCache,
          pendingWrites: moduleDoc.metadata.hasPendingWrites,
          syncProtocolVersion: typeof data.syncProtocolVersion === 'number' ? data.syncProtocolVersion : 1,
          isEncrypted: Boolean(data.isEncrypted),
        });
      }
      handlers.onSnapshot({
        heads,
        fromCache: snapshot.metadata.fromCache,
        pendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (error) => handlers.onError(error)
  );
}

function cleanForFirestore<T>(data: T): T {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

export async function writeCloudModulesAsync(
  userId: string,
  state: LifeOSState,
  modules: SyncModuleKey[],
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {},
  mdekOverride?: CryptoKey | null,
  existingWrites?: PreparedCloudWrite[]
): Promise<CloudWriteBatch> {
  const { db } = services();
  const batch = writeBatch(db);
  const clientUpdatedAt = Date.now();
  const sessionKey = mdekOverride !== undefined ? mdekOverride : cryptoSession.getKey(userId);

  const preparedWrites: PreparedCloudWrite[] = [];

  for (let index = 0; index < modules.length; index++) {
    const module = modules[index];
    const existing = existingWrites?.[index];
    const revision = existing && existing.module === module
      ? existing.revision
      : `${clientUpdatedAt + index}-${deviceId}-${uid()}`;
    const parentRevision = existing && existing.module === module
      ? existing.parentRevision
      : (baseRevisions[module] || null);
    const rawData = syncModuleData(state, module) as Record<string, unknown>;
    const withTombstones = Object.keys(tombstones).length > 0
      ? { ...rawData, _tombstones: tombstones }
      : rawData;
    const cleanData = cleanForFirestore(withTombstones);

    // Encode data: if sessionKey is active, encrypts module into CryptoEnvelope
    const { data: cloudData, isEncrypted } = await encodeCloudModuleData(
      cleanData,
      module,
      userId,
      sessionKey
    );

    const payload = {
      schemaVersion: Math.round(Number(state.schemaVersion || CURRENT_SCHEMA_VERSION)),
      syncProtocolVersion: isEncrypted ? CURRENT_SYNC_PROTOCOL_VERSION : 1,
      isEncrypted,
      module,
      data: cloudData,
      revision,
      parentRevision,
      deviceId,
      clientUpdatedAt: clientUpdatedAt + index,
      updatedAt: serverTimestamp(),
    };

    batch.set(doc(modulesCollection(userId), module), payload);
    batch.set(doc(revisionsCollection(userId), revision), payload);
    preparedWrites.push({ module, revision, parentRevision });
  }

  return { writes: preparedWrites, completion: batch.commit() };
}

export function writeCloudModules(
  userId: string,
  state: LifeOSState,
  modules: SyncModuleKey[],
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {}
): CloudWriteBatch {
  // Sync wrapper for legacy callers: handles sync write or returns promise-based completion
  const sessionKey = cryptoSession.getKey(userId);
  if (sessionKey) {
    // When sessionKey is active, execute async encryption flow
    let resolveCompletion: () => void;
    let rejectCompletion: (err: any) => void;
    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    const clientUpdatedAt = Date.now();
    const writes = modules.map((module, index) => ({
      module,
      revision: `${clientUpdatedAt + index}-${deviceId}-${uid()}`,
      parentRevision: baseRevisions[module] || null,
    }));

    void writeCloudModulesAsync(userId, state, modules, deviceId, baseRevisions, tombstones, sessionKey, writes)
      .then((res) => res.completion)
      .then(() => resolveCompletion())
      .catch(rejectCompletion);

    return { writes, completion: completionPromise };
  }

  // Plaintext fast-path
  const { db } = services();
  const batch = writeBatch(db);
  const clientUpdatedAt = Date.now();
  const writes = modules.map((module, index) => {
    const revision = `${clientUpdatedAt + index}-${deviceId}-${uid()}`;
    const parentRevision = baseRevisions[module] || null;
    const rawData = syncModuleData(state, module) as Record<string, unknown>;
    const withTombstones = Object.keys(tombstones).length > 0
      ? { ...rawData, _tombstones: tombstones }
      : rawData;
    const cleanData = cleanForFirestore(withTombstones);

    const payload = {
      schemaVersion: Math.round(Number(state.schemaVersion || CURRENT_SCHEMA_VERSION)),
      syncProtocolVersion: 1,
      isEncrypted: false,
      module,
      data: cleanData,
      revision,
      parentRevision,
      deviceId,
      clientUpdatedAt: clientUpdatedAt + index,
      updatedAt: serverTimestamp(),
    };
    batch.set(doc(modulesCollection(userId), module), payload);
    batch.set(doc(revisionsCollection(userId), revision), payload);
    return { module, revision, parentRevision };
  });
  return { writes, completion: batch.commit() };
}

export function writeAllCloudModules(
  userId: string,
  state: LifeOSState,
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {}
): CloudWriteBatch {
  return writeCloudModules(userId, state, [...SYNC_MODULES], deviceId, baseRevisions, tombstones);
}

export async function verifyRemoteRevisions(
  userId: string,
  modules: SyncModuleKey[],
  baseRevisions: SyncRevisionMap
): Promise<{
  matches: boolean;
  divergedModules: SyncModuleKey[];
  remoteRevisions: SyncRevisionMap;
  incompatibleProtocolModules: SyncModuleKey[];
}> {
  if (!cloudSyncConfigured) return { matches: true, divergedModules: [], remoteRevisions: {}, incompatibleProtocolModules: [] };
  const { db } = services();
  const divergedModules: SyncModuleKey[] = [];
  const incompatibleProtocolModules: SyncModuleKey[] = [];
  const remoteRevisions: SyncRevisionMap = {};

  for (const module of modules) {
    const expectedRev = baseRevisions[module];
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'lifeosModules', module));
      if (snap.exists()) {
        const data = snap.data();
        const currentRev = typeof data?.revision === 'string' ? data.revision : '';
        remoteRevisions[module] = currentRev;

        // Protocol guard: if remote doc requires a higher sync protocol than client supports
        const remoteProtocol = typeof data?.syncProtocolVersion === 'number' ? data.syncProtocolVersion : 1;
        if (remoteProtocol > CURRENT_SYNC_PROTOCOL_VERSION) {
          incompatibleProtocolModules.push(module);
        }

        if (expectedRev && currentRev && currentRev !== expectedRev) {
          divergedModules.push(module);
        }
      }
    } catch {
      // Ignore network errors in verification; batch commit will handle
    }
  }

  return {
    matches: divergedModules.length === 0 && incompatibleProtocolModules.length === 0,
    divergedModules,
    remoteRevisions,
    incompatibleProtocolModules,
  };
}

export async function writeCloudModulesGuarded(
  userId: string,
  state: LifeOSState,
  modules: SyncModuleKey[],
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {},
  customVerifier?: (userId: string, modules: SyncModuleKey[], baseRevisions: SyncRevisionMap) => Promise<{
    matches: boolean;
    divergedModules: SyncModuleKey[];
    remoteRevisions: SyncRevisionMap;
    incompatibleProtocolModules?: SyncModuleKey[];
  }>
): Promise<{
  writes: PreparedCloudWrite[];
  diverged: boolean;
  divergedModules?: SyncModuleKey[];
  incompatibleProtocol?: boolean;
  incompatibleModules?: SyncModuleKey[];
  completion: Promise<void>;
}> {
  const verifier = customVerifier || verifyRemoteRevisions;
  const check = await verifier(userId, modules, baseRevisions);

  if (check.incompatibleProtocolModules && check.incompatibleProtocolModules.length > 0) {
    return {
      writes: [],
      diverged: false,
      incompatibleProtocol: true,
      incompatibleModules: check.incompatibleProtocolModules,
      completion: Promise.reject(
        new Error(
          `Protocolo remoto superior detectado en: ${check.incompatibleProtocolModules.join(
            ', '
          )}. Se aborta la escritura para no sobrescribir datos incompatibles.`
        )
      ),
    };
  }

  if (!check.matches) {
    return {
      writes: [],
      diverged: true,
      divergedModules: check.divergedModules,
      completion: Promise.reject(new Error(`Divergencia de revisiones remotas detectada en: ${check.divergedModules.join(', ')}`)),
    };
  }
  const batch = writeCloudModules(userId, state, modules, deviceId, baseRevisions, tombstones);
  return {
    writes: batch.writes,
    diverged: false,
    completion: batch.completion,
  };
}

export async function readLegacyCloudState(userId: string): Promise<LifeOSState | null> {
  if (!cloudSyncConfigured) return null;
  const { db } = services();
  try {
    const snapshot = await getDoc(doc(db, 'users', userId, 'lifeos', 'state'));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return normalizeStoredState(data?.state);
  } catch (error) {
    console.warn('[CloudSync] Could not read legacy state:', error);
    return null;
  }
}

export async function fetchFreshCloudModules(
  userId: string,
  sessionKey?: CryptoKey | null
): Promise<{
  moduleData: Partial<Record<SyncModuleKey, unknown>>;
  remoteRevisions: SyncRevisionMap;
  lockedModules: SyncModuleKey[];
  corruptedModules: SyncModuleKey[];
}> {
  if (!cloudSyncConfigured) {
    return { moduleData: {}, remoteRevisions: {}, lockedModules: [], corruptedModules: [] };
  }

  const snapshot = await getDocs(modulesCollection(userId));
  const activeKey = sessionKey !== undefined ? sessionKey : cryptoSession.getKey(userId);
  const moduleData: Partial<Record<SyncModuleKey, unknown>> = {};
  const remoteRevisions: SyncRevisionMap = {};
  const lockedModules: SyncModuleKey[] = [];
  const corruptedModules: SyncModuleKey[] = [];

  for (const moduleDoc of snapshot.docs) {
    if (!isSyncModuleKey(moduleDoc.id)) continue;
    const module = moduleDoc.id;
    const docData = moduleDoc.data();
    if (typeof docData.revision !== 'string' || !('data' in docData)) continue;

    remoteRevisions[module] = docData.revision;

    const decodeRes = await decodeCloudModuleData(docData.data, module, userId, activeKey);
    if (decodeRes.mode === 'locked') {
      lockedModules.push(module);
    } else if (decodeRes.mode === 'corrupted') {
      corruptedModules.push(module);
    } else {
      moduleData[module] = extractPureModuleData(decodeRes.data);
    }
  }

  return { moduleData, remoteRevisions, lockedModules, corruptedModules };
}
