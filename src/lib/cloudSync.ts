import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  serverTimestamp,
  writeBatch,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { CURRENT_SCHEMA_VERSION, defaultState, normalizeStoredState, uid } from './storage';
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
  loadWrappedKeyEnvelope,
  isCryptoEnvelope,
} from './cryptoCore';
import appletConfig from '../../firebase-applet-config.json';
import { captureDurableCommercial, recoverDurableCommercial, validateDurableCommercial } from './commercialDurable';
import type { CommercialPilotSnapshot } from './commercialPilot';
import { connectFirestoreEmulator } from 'firebase/firestore';

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

/** A remote acknowledgement cannot confirm newer local work still waiting to upload. */
export function cloudStatusWithLocalChanges(remote: CloudSyncStatus, local: {
  queued: boolean; pending: boolean; failed: boolean; blocked: boolean;
}): CloudSyncStatus {
  if (local.blocked) return 'conflict';
  if (remote !== 'synced') return remote;
  if (local.failed) return 'error';
  return local.queued || local.pending ? 'saving' : 'synced';
}

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
  commercialProtocolVersion?: unknown;
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

export class ResaleRevisionConflict extends Error {
  constructor(readonly modules: SyncModuleKey[]) { super(`Divergencia transaccional: ${modules.join(', ')}`); }
}
export class ResaleProtocolConflict extends Error {
  constructor(readonly modules: SyncModuleKey[]) {
    super(`Mi negocio requiere una versión más reciente de Celestian para sincronizar. Los cambios locales siguen pendientes (${modules.join(', ')}).`);
  }
}
export class CloudRevisionConflict extends Error {
  constructor(readonly modules: SyncModuleKey[]) { super(`Divergencia transaccional: ${modules.join(', ')}`); }
}
export class CloudProtocolConflict extends Error {
  constructor(readonly modules: SyncModuleKey[]) { super(`Protocolo remoto incompatible: ${modules.join(', ')}`); }
}

/** Reject unsupported or damaged heads before they can be normalized into empty data. */
export function assertReadableCloudModule(module: SyncModuleKey, payload: Record<string, unknown>): void {
  const protocol = payload.syncProtocolVersion ?? 1;
  const commercial = payload.commercialProtocolVersion;
  const supportedProtocol = Number.isSafeInteger(protocol) && Number(protocol) >= 1
    && (Number(protocol) <= CURRENT_SYNC_PROTOCOL_VERSION
      || (protocol === 3 && commercial === 1 && (module === 'resale' || module === 'finance')));
  if (!supportedProtocol || (commercial !== undefined && (commercial !== 1 || !['resale', 'finance'].includes(module)))
    || typeof payload.revision !== 'string' || !payload.revision || !('data' in payload)
    || (payload.isEncrypted === true && !isCryptoEnvelope(payload.data))
    || (Number(protocol) >= 2 && payload.isEncrypted !== true)) {
    throw new CloudProtocolConflict([module]);
  }
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'permission-denied' || error.code === 'firestore/permission-denied';
}

export function classifyTransactionalRevisions(
  expected: Array<{ module: SyncModuleKey; revision: string | null }>,
  actual: Array<{ revision: string | null; protocol: unknown; commercialProtocol?: unknown }>,
): { diverged: SyncModuleKey[]; incompatible: SyncModuleKey[] } {
  return {
    diverged: expected.filter((entry, index) => entry.revision !== actual[index]?.revision).map((entry) => entry.module),
    incompatible: expected.filter((_, index) => {
      const protocol = actual[index]?.protocol;
      return typeof protocol !== 'number' || !Number.isSafeInteger(protocol) ||
        protocol < 1 || protocol > CURRENT_SYNC_PROTOCOL_VERSION ||
        actual[index]?.commercialProtocol !== undefined;
    }).map((entry) => entry.module),
  };
}

/**
 * Splits large module lists into transactional chunks (default max 5 modules) so
 * Firestore Security Rules never exceed the 20 exists()/get() service-call limit
 * or the 1000-expression evaluation limit when updating existing module documents.
 * Always keeps 'resale' and 'finance' in the same chunk to preserve atomic commercial/finance writes.
 */
export function chunkSyncModulesForTransaction(
  modules: SyncModuleKey[],
  maxChunkSize = 5,
): SyncModuleKey[][] {
  const unique = [...new Set<SyncModuleKey>(modules)];
  if (unique.length <= maxChunkSize) return unique.length > 0 ? [unique] : [];
  const remaining = [...unique];
  const chunks: SyncModuleKey[][] = [];
  if (remaining.includes('resale') && remaining.includes('finance')) {
    const pair: SyncModuleKey[] = [];
    for (const mod of [...remaining]) {
      if (mod === 'resale' || mod === 'finance') {
        pair.push(mod);
        remaining.splice(remaining.indexOf(mod), 1);
      }
    }
    chunks.push(pair);
  }
  while (remaining.length > 0) {
    chunks.push(remaining.splice(0, maxChunkSize));
  }
  return chunks;
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
let authEmulatorConnected = false;
const useDevelopmentEmulators = metaEnv.DEV && metaEnv.VITE_FIREBASE_EMULATORS === '1';

function services() {
  // Node tests must never fall through to the public Firebase configuration.
  // Emulator suites connect these services explicitly after initialization.
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.env.NODE_TEST_CONTEXT
    && (config.projectId !== 'demo-lifeos'
      || !isExpectedLocalEndpoint(process.env.FIRESTORE_EMULATOR_HOST, 8080)
      || !isExpectedLocalEndpoint(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099))) {
    throw new Error('Las pruebas de Firebase requieren demo-lifeos y los emuladores locales de Auth y Firestore.');
  }
  if (!cloudSyncConfigured) throw new Error('LifeOS Anywhere todavía no está configurado.');

  if (useDevelopmentEmulators && (config.projectId !== 'demo-lifeos'
    || (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname))))
    throw new Error('Los emuladores requieren demo-lifeos en localhost.');
  const app = getApps().some(candidate => candidate.name === '[DEFAULT]') ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  if (useDevelopmentEmulators && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    authEmulatorConnected = true;
  }
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
    if (useDevelopmentEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
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
  state: LifeOSState,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): boolean {
  try {
    const key = `${SNAPSHOT_PREFIX}${type}:${userId}`;
    const serialized = JSON.stringify(state);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function loadSyncRecoverySnapshot(
  userId: string,
  type: 'local' | 'remote' | 'base',
  storage: Pick<Storage, 'getItem'> = localStorage
): LifeOSState | null {
  try {
    const raw = storage.getItem(`${SNAPSHOT_PREFIX}${type}:${userId}`);
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

function modulesCollection(userId: string, database?: Firestore) {
  return collection(database ?? services().db, 'users', userId, 'lifeosModules');
}

function revisionsCollection(userId: string, database?: Firestore) {
  return collection(database ?? services().db, 'users', userId, 'lifeosRevisions');
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
        try { assertReadableCloudModule(moduleDoc.id, data); }
        catch (error) { handlers.onError(error as Error); return; }
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
          commercialProtocolVersion: data.commercialProtocolVersion,
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

function assertCommercialPublicationDisabled(state: LifeOSState, modules: SyncModuleKey[]): void {
  if (modules.includes('resale') && Object.prototype.hasOwnProperty.call(state.resale, 'commercial')) {
    throw new ResaleProtocolConflict(['resale']);
  }
}

export interface CommercialWriteCapability {
  enabled: true;
  commercialProtocolVersion: 1;
  minimumSyncProtocolVersion: 3;
}

export function isCommercialWriteCapabilityEnabled(value: unknown, fromCache = false): value is CommercialWriteCapability {
  if (fromCache || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const capability = value as Record<string, unknown>;
  return Object.keys(capability).length === 3
    && capability.enabled === true
    && capability.commercialProtocolVersion === 1
    && capability.minimumSyncProtocolVersion === 3;
}

export interface CommercialCapabilityServerRead {
  exists: boolean;
  data?: unknown;
  fromCache: boolean;
}

export async function assertFreshCommercialWriteCapability(
  readFromServer: () => Promise<CommercialCapabilityServerRead>,
): Promise<void> {
  let result: CommercialCapabilityServerRead;
  try { result = await readFromServer(); }
  catch { throw new CommercialWriteCapabilityUnavailable(); }
  if (!result.exists || !isCommercialWriteCapabilityEnabled(result.data, result.fromCache))
    throw new CommercialWriteCapabilityUnavailable();
}

export class CommercialWriteCapabilityUnavailable extends Error {
  constructor() {
    super('Función temporalmente no disponible. Tus datos se conservan; reintentá cuando se habiliten las operaciones comerciales.');
  }
}

async function requireCommercialWriteCapability(db: Firestore): Promise<void> {
  await assertFreshCommercialWriteCapability(async () => {
    const capability = await getDocFromServer(doc(db, 'systemCapabilities', 'commercial'));
    return { exists: capability.exists(), data: capability.exists() ? capability.data() : undefined,
      fromCache: capability.metadata.fromCache };
  });
}

function assertDurableCommercialState(state: LifeOSState, modules: SyncModuleKey[]): void {
  if (!modules.includes('resale')) return;
  const commercial = state.resale.commercial;
  if (!commercial || !commercial.business) throw new ResaleProtocolConflict(['resale']);

  // A durable money event is only publishable when the matching Finance transaction
  // is already present in this state and its origin link can be verified. Events
  // that introduce a new transaction must travel in the same guarded publication.
  const business = commercial.business;
  const validation = validateDurableCommercial(commercial, {
    finance: state.finance,
    resaleInventory: state.resale.inventory,
  });
  const hasMissingOrDuplicateLinks = business.moneyEvents.some((event) => {
    const originKey = `commercial:${event.purpose}:${event.id}`;
    return business.financeLinks.filter((link) => link.originKey === originKey).length !== 1;
  });
  const hasUnpublishedFinanceEvents = business.moneyEvents.some((event) =>
    event.finance.mode === 'new' && !modules.includes('finance'));

  if (!validation.valid || hasMissingOrDuplicateLinks || hasUnpublishedFinanceEvents)
    throw new ResaleProtocolConflict(['resale']);
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
  assertCommercialPublicationDisabled(state, modules);
  const { db } = services();
  const clientUpdatedAt = Date.now();
  const sessionKey = mdekOverride !== undefined ? mdekOverride : cryptoSession.getKey(userId);

  const preparedWrites: PreparedCloudWrite[] = [];
  const payloadByModule = new Map<SyncModuleKey, { revision: string; payload: Record<string, unknown> }>();

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

    payloadByModule.set(module, { revision, payload });
    preparedWrites.push({ module, revision, parentRevision });
  }

  const moduleChunks = chunkSyncModulesForTransaction(modules, 5);
  const completion = (async () => {
    for (const chunk of moduleChunks) {
      const batch = writeBatch(db);
      for (const module of chunk) {
        const entry = payloadByModule.get(module);
        if (!entry) continue;
        batch.set(doc(modulesCollection(userId), module), entry.payload);
        batch.set(doc(revisionsCollection(userId), entry.revision), entry.payload);
      }
      await batch.commit();
    }
  })();

  return { writes: preparedWrites, completion };
}

export function writeCloudModules(
  userId: string,
  state: LifeOSState,
  modules: SyncModuleKey[],
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {}
): CloudWriteBatch {
  assertCommercialPublicationDisabled(state, modules);
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
  const clientUpdatedAt = Date.now();
  const payloadByModule = new Map<SyncModuleKey, { revision: string; payload: Record<string, unknown> }>();
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
    payloadByModule.set(module, { revision, payload });
    return { module, revision, parentRevision };
  });
  const moduleChunks = chunkSyncModulesForTransaction(modules, 5);
  const completion = (async () => {
    for (const chunk of moduleChunks) {
      const batch = writeBatch(db);
      for (const module of chunk) {
        const entry = payloadByModule.get(module);
        if (!entry) continue;
        batch.set(doc(modulesCollection(userId), module), entry.payload);
        batch.set(doc(revisionsCollection(userId), entry.revision), entry.payload);
      }
      await batch.commit();
    }
  })();
  return { writes, completion };
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

async function writeCloudModulesGuardedInternal(
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
  }>,
  commercialWriteContext?: { db: Firestore; mode: 'pilot' | 'production' },
  migrationKey?: CryptoKey,
): Promise<{
  writes: PreparedCloudWrite[];
  diverged: boolean;
  divergedModules?: SyncModuleKey[];
  incompatibleProtocol?: boolean;
  incompatibleModules?: SyncModuleKey[];
  completion: Promise<void>;
}> {
  const isCommercialPilot = commercialWriteContext?.mode === 'pilot';
  const isCommercialPublication = commercialWriteContext !== undefined;
  if (isCommercialPublication) {
    if ((isCommercialPilot && (modules.length !== 1 || modules[0] !== 'resale'))
      || !Object.prototype.hasOwnProperty.call(state.resale, 'commercial'))
      throw new ResaleProtocolConflict(['resale']);
    if (!isCommercialPilot) assertDurableCommercialState(state, modules);
  } else assertCommercialPublicationDisabled(state, modules);
  // The revision check and publication must be one atomic Firestore operation.
  // customVerifier is kept for isolated compatibility tests only.
  if (!customVerifier) {
    const db = commercialWriteContext?.db ?? services().db;
    const sessionKey = isCommercialPilot ? null : migrationKey ?? cryptoSession.getKey(userId);
    if (isCommercialPublication && !isCommercialPilot && !sessionKey)
      throw new Error('Desbloqueá el cifrado antes de sincronizar Mi negocio.');
    const clientUpdatedAt = Date.now();
    // Encryption and IDs are prepared once, outside the retryable transaction callback.
    const payloads = await Promise.all(modules.map(async (module, index) => {
      const revision = `${clientUpdatedAt + index}-${deviceId}-${uid()}`;
      const parentRevision = baseRevisions[module] || null;
      const rawData = syncModuleData(state, module) as Record<string, unknown>;
      const withTombstones = Object.keys(tombstones).length > 0 ? { ...rawData, _tombstones: tombstones } : rawData;
      const { data, isEncrypted } = await encodeCloudModuleData(cleanForFirestore(withTombstones), module, userId, sessionKey);
      return { module, revision, parentRevision, payload: {
        schemaVersion: Math.round(Number(state.schemaVersion || CURRENT_SCHEMA_VERSION)),
        syncProtocolVersion: isCommercialPublication && (module === 'resale' || module === 'finance') ? 3 : isEncrypted ? CURRENT_SYNC_PROTOCOL_VERSION : 1,
        isEncrypted, module, data, revision, parentRevision, deviceId,
        ...(isCommercialPublication && (module === 'resale' || module === 'finance') ? { commercialProtocolVersion: 1 } : {}),
        clientUpdatedAt: clientUpdatedAt + index, updatedAt: serverTimestamp(),
      } };
    }));
    const payloadByModule = new Map(payloads.map((entry) => [entry.module, entry]));
    const payloadChunks = chunkSyncModulesForTransaction(modules, 5).map((chunk) =>
      chunk.map((module) => payloadByModule.get(module)!).filter(Boolean),
    );
    const validateGroupSnapshots = (
      group: typeof payloads,
      snapshots: Array<{ exists: () => boolean; data: () => Record<string, any> | undefined }>,
    ) => {
      if (!isCommercialPilot) group.forEach(({ module }, index) => {
        if (snapshots[index].exists()) assertReadableCloudModule(module, snapshots[index].data()!);
      });
      const check = isCommercialPublication ? {
        diverged: group.filter(({ parentRevision }, index) =>
          parentRevision !== (snapshots[index].exists() ? snapshots[index].data()?.revision : null)).map(({ module }) => module),
        incompatible: group.flatMap(({ module }, index) => {
          const snapshot = snapshots[index];
          if (!snapshot.exists()) return [];
          const data = snapshot.data()!;
          const syncProtocol = data.syncProtocolVersion ?? 1;
          const commercialProtocol = data.commercialProtocolVersion;
          const validCommercialProtocol = commercialProtocol === undefined
            || (Number.isSafeInteger(commercialProtocol) && commercialProtocol >= 1 && commercialProtocol <= 1);
          const invalid = module === 'resale' || (isCommercialPublication && module === 'finance')
            ? (isCommercialPilot && data.isEncrypted === true) || !Number.isSafeInteger(syncProtocol)
              || syncProtocol < 1 || syncProtocol > 3 || !validCommercialProtocol
            : !Number.isSafeInteger(syncProtocol) || syncProtocol < 1 || syncProtocol > CURRENT_SYNC_PROTOCOL_VERSION;
          return invalid ? [module] : [];
        }),
      } : classifyTransactionalRevisions(
        group.map(({ module, parentRevision }) => ({ module, revision: parentRevision })),
        snapshots.map((snapshot) => ({ revision: snapshot.exists() ? snapshot.data()?.revision ?? null : null,
          protocol: snapshot.exists() ? snapshot.data()?.syncProtocolVersion ?? 1 : 1,
          commercialProtocol: snapshot.exists() ? snapshot.data()?.commercialProtocolVersion : undefined })),
      );
      const incompatible = check.incompatible;
      if (incompatible.length) throw modules.includes('resale')
        ? new ResaleProtocolConflict(incompatible) : new CloudProtocolConflict(incompatible);
      const diverged = check.diverged;
      if (diverged.length) throw modules.includes('resale')
        ? new ResaleRevisionConflict(diverged) : new CloudRevisionConflict(diverged);
    };
    const runChunkTransaction = (group: typeof payloads) =>
      runTransaction(db, async (transaction) => {
        // Read all documents in the chunk before scheduling writes; the group commits or none does.
        const snapshots = await Promise.all(group.map(({ module }) =>
          transaction.get(doc(modulesCollection(userId, db), module))));
        validateGroupSnapshots(group, snapshots);
        for (const { module, revision, payload } of group) {
          transaction.set(doc(modulesCollection(userId, db), module), payload);
          transaction.set(doc(revisionsCollection(userId, db), revision), payload);
        }
      });
    const completion = payloadChunks.length <= 1
      ? runChunkTransaction(payloadChunks[0] ?? [])
      : (async () => {
          const preSnapshots = await Promise.all(payloads.map(({ module }) =>
            getDoc(doc(modulesCollection(userId, db), module))));
          validateGroupSnapshots(payloads, preSnapshots);
          for (const chunk of payloadChunks) {
            await runChunkTransaction(chunk);
          }
        })();
    return { writes: payloads.map(({ module, revision, parentRevision }) => ({ module, revision, parentRevision })), diverged: false, completion };
  }
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

/** Encrypt a migration module only if its freshly read revision still matches. */
export async function writeCloudMigrationModule(
  userId: string, state: LifeOSState, modules: SyncModuleKey[], deviceId: string,
  baseRevisions: SyncRevisionMap, tombstones: Record<string, number>, sessionKey: CryptoKey,
): Promise<CloudWriteBatch> {
  if (!sessionKey) throw new Error('Desbloqueá el cifrado antes de migrar.');
  return writeCloudModulesGuardedInternal(userId, state, modules, deviceId, baseRevisions,
    tombstones, undefined, undefined, sessionKey);
}

export function diagnoseCommercialAccessBlock(params: {
  requestedUserId?: string;
  authenticatedUserId?: string | null;
  hasUnlockedSessionKey: boolean;
  hasLocalKeyEnvelope: boolean;
}): { code: 'unauthenticated' | 'e2ee_not_configured' | 'e2ee_locked'; status: string; message: string } | null {
  const { requestedUserId, authenticatedUserId, hasUnlockedSessionKey, hasLocalKeyEnvelope } = params;
  if (!requestedUserId || authenticatedUserId !== requestedUserId) {
    return {
      code: 'unauthenticated',
      status: 'Sesión requerida para operar',
      message: 'Iniciá sesión para trabajar con tu negocio.',
    };
  }
  if (!hasUnlockedSessionKey) {
    return hasLocalKeyEnvelope
      ? {
          code: 'e2ee_locked',
          status: 'Cifrado E2EE requerido para operar',
          message: 'Desbloqueá el cifrado E2EE en Configuración → Privacidad y Seguridad para utilizar Mi negocio.',
        }
      : {
          code: 'e2ee_not_configured',
          status: 'Cifrado E2EE requerido para operar',
          message: 'Activá o desbloqueá el cifrado E2EE en Configuración → Privacidad y Seguridad para utilizar Mi negocio.',
        };
  }
  return null;
}

export async function checkCommercialAccess(userId: string): Promise<void> {
  const { auth, db } = services();
  const block = diagnoseCommercialAccessBlock({
    requestedUserId: userId,
    authenticatedUserId: auth.currentUser?.uid ?? null,
    hasUnlockedSessionKey: Boolean(cryptoSession.getKey(userId)),
    hasLocalKeyEnvelope: Boolean(loadWrappedKeyEnvelope(userId)),
  });
  if (block) throw new Error(block.message);
  await requireCommercialWriteCapability(db);
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
) {
  const hasCommercial = Object.prototype.hasOwnProperty.call(state.resale, 'commercial') && Boolean(state.resale.commercial); const commercialPublication = (modules.includes('resale') || (modules.includes('finance') && hasCommercial))
    && hasCommercial;
  if (commercialPublication) {
    if (customVerifier) throw new CommercialWriteCapabilityUnavailable();
    assertDurableCommercialState(state, modules);
    const { db } = services();
    await requireCommercialWriteCapability(db);
    return writeCloudModulesGuardedInternal(userId, state, modules, deviceId, baseRevisions, tombstones,
      undefined, { db, mode: 'production' });
  }
  return writeCloudModulesGuardedInternal(userId, state, modules, deviceId, baseRevisions, tombstones, customVerifier);
}

const COMMERCIAL_PILOT_PROJECT = 'demo-lifeos';
const COMMERCIAL_PILOT_FIRESTORE = { host: '127.0.0.1', port: 8080 };
const COMMERCIAL_PILOT_AUTH = { host: '127.0.0.1', port: 9099 };
const COMMERCIAL_PILOT_PASSWORD = 'demo-lifeos-commercial-pilot-only';
let commercialPilotClientSequence = 0;

export interface CommercialPilotEmulatorClient {
  readonly userId: string;
  readonly appName: string;
  read(): Promise<{ revision: string | null; snapshot: CommercialPilotSnapshot | null }>;
  publish(snapshot: CommercialPilotSnapshot, parentRevision: string | null): Promise<string>;
  close(): Promise<void>;
}

export interface CommercialPilotEmulatorGuardInput {
  dev?: boolean;
  pilotEnabled?: string;
  pilotSyncEnabled?: string;
  nodeEnv?: string;
  testIndicator?: string;
  gcloudProject?: string;
  googleCloudProject?: string;
  firebaseConfig?: string;
  firestoreEmulatorHost?: string;
  authEmulatorHost?: string;
  protocol?: string;
  hostname?: string;
}

function isExpectedLocalEndpoint(value: string | undefined, port: number): boolean {
  return typeof value === 'string' && new Set([
    `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`,
  ]).has(value.toLowerCase());
}

function projectMatchesDemo(input: CommercialPilotEmulatorGuardInput): boolean {
  const projects = [input.gcloudProject, input.googleCloudProject].filter((value): value is string => value !== undefined);
  if (input.firebaseConfig !== undefined) {
    try {
      const config: unknown = JSON.parse(input.firebaseConfig);
      if (!config || typeof config !== 'object' || Array.isArray(config)
        || typeof (config as { projectId?: unknown }).projectId !== 'string') return false;
      projects.push((config as { projectId: string }).projectId);
    } catch { return false; }
  }
  return projects.length > 0 && projects.every((projectId) => projectId === COMMERCIAL_PILOT_PROJECT);
}

/** Pure gate shared by browser setup and emulator tests; host/project checks are mandatory in both. */
export function commercialPilotEmulatorConfigAllowed(
  input: CommercialPilotEmulatorGuardInput,
  context: 'development' | 'test',
): boolean {
  if (!projectMatchesDemo(input)
    || !isExpectedLocalEndpoint(input.firestoreEmulatorHost, COMMERCIAL_PILOT_FIRESTORE.port)
    || !isExpectedLocalEndpoint(input.authEmulatorHost, COMMERCIAL_PILOT_AUTH.port)) return false;
  if (context === 'test') {
    return input.nodeEnv === 'test' && input.testIndicator === '1'
      && (input.pilotEnabled === undefined || input.pilotEnabled === '1')
      && (input.pilotSyncEnabled === undefined || input.pilotSyncEnabled === '1');
  }
  return input.dev === true && input.pilotEnabled === '1' && input.pilotSyncEnabled === '1'
    && input.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(input.hostname || '');
}

function assertCommercialPilotEmulatorEnvironment(): void {
  const vite = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const inBrowser = typeof window !== 'undefined';
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  let firebaseConfig: string | undefined;
  if (processEnv.FIREBASE_CONFIG !== undefined) {
    if (typeof processEnv.FIREBASE_CONFIG !== 'string')
      throw new Error('FIREBASE_CONFIG del emulador no tiene un formato válido.');
    firebaseConfig = processEnv.FIREBASE_CONFIG;
  }
  const input: CommercialPilotEmulatorGuardInput = inBrowser ? {
    dev: vite?.DEV === true,
    pilotEnabled: typeof vite?.VITE_COMMERCIAL_PILOT === 'string' ? vite.VITE_COMMERCIAL_PILOT : undefined,
    pilotSyncEnabled: typeof vite?.VITE_COMMERCIAL_PILOT_SYNC === 'string' ? vite.VITE_COMMERCIAL_PILOT_SYNC : undefined,
    gcloudProject: COMMERCIAL_PILOT_PROJECT,
    firestoreEmulatorHost: `${COMMERCIAL_PILOT_FIRESTORE.host}:${COMMERCIAL_PILOT_FIRESTORE.port}`,
    authEmulatorHost: `${COMMERCIAL_PILOT_AUTH.host}:${COMMERCIAL_PILOT_AUTH.port}`,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
  } : {
    nodeEnv: processEnv.NODE_ENV,
    testIndicator: processEnv.LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST,
    pilotEnabled: processEnv.VITE_COMMERCIAL_PILOT,
    pilotSyncEnabled: processEnv.VITE_COMMERCIAL_PILOT_SYNC,
    gcloudProject: processEnv.GCLOUD_PROJECT,
    googleCloudProject: processEnv.GOOGLE_CLOUD_PROJECT,
    firebaseConfig,
    firestoreEmulatorHost: processEnv.FIRESTORE_EMULATOR_HOST,
    authEmulatorHost: processEnv.FIREBASE_AUTH_EMULATOR_HOST,
  };
  if (!commercialPilotEmulatorConfigAllowed(input, inBrowser ? 'development' : 'test')) {
    throw new Error('El piloto solo permite desarrollo explícito o pruebas en demo-lifeos con Auth y Firestore Emulator locales.');
  }
}

/**
 * Creates a test-only Firebase app. It has a fixed demo project, fixed emulator
 * endpoints, in-memory Auth and no fallback to the app's configured Firebase app.
 */
export async function connectCommercialPilotEmulator(clientName: string): Promise<CommercialPilotEmulatorClient> {
  assertCommercialPilotEmulatorEnvironment();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(clientName)) throw new Error('Nombre de cliente de prueba inválido.');
  const app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${COMMERCIAL_PILOT_PROJECT}.firebaseapp.com`,
    projectId: COMMERCIAL_PILOT_PROJECT,
    appId: '1:1:web:commercial-pilot',
  }, `commercial-pilot-${clientName}-${++commercialPilotClientSequence}`);
  const identityKey = clientName.replace(/-[AB]$/i, '').toLowerCase();
  const testEmail = `commercial-pilot-${identityKey}@demo.invalid`;
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${COMMERCIAL_PILOT_AUTH.host}:${COMMERCIAL_PILOT_AUTH.port}`, { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  try {
    await createUserWithEmailAndPassword(auth, testEmail, COMMERCIAL_PILOT_PASSWORD);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/email-already-in-use') throw error;
    await signInWithEmailAndPassword(auth, testEmail, COMMERCIAL_PILOT_PASSWORD);
  }
  const db = getFirestore(app);
  connectFirestoreEmulator(db, COMMERCIAL_PILOT_FIRESTORE.host, COMMERCIAL_PILOT_FIRESTORE.port);
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('El emulador de autenticación no entregó una identidad de prueba.');
  let closed = false;

  const read = async () => {
    // This first server read confirms the fixed Firestore Emulator endpoint is reachable.
    const snapshot = await getDocFromServer(doc(db, 'users', userId, 'lifeosModules', 'resale'));
    if (!snapshot.exists()) return { revision: null, snapshot: null };
    const remote = snapshot.data();
    if (remote.module !== 'resale' || remote.isEncrypted === true
      || remote.commercialProtocolVersion !== 1 || remote.syncProtocolVersion !== 3
      || typeof remote.revision !== 'string' || !remote.data || typeof remote.data !== 'object') {
      throw new Error('El documento remoto no pertenece al protocolo de prueba legible esperado.');
    }
    const decoded = await decodeCloudModuleData(remote.data, 'resale', userId, null);
    if (decoded.mode !== 'plaintext') throw new Error('El documento comercial no puede leerse de forma segura en el piloto.');
    const data = decoded.data as { resale?: { commercial?: unknown } };
    if (!data?.resale || !Object.prototype.hasOwnProperty.call(data.resale, 'commercial'))
      throw new Error('El documento remoto no contiene la colección comercial protegida.');
    const recovered = recoverDurableCommercial(JSON.stringify(data.resale.commercial));
    if (recovered.status !== 'valid') throw new Error('El historial comercial remoto es inválido y quedó sin adoptar.');
    const business = recovered.reconstructed;
    return {
      revision: remote.revision,
      snapshot: {
        currency: recovered.set.business!.currency,
        session: business.session,
        recipes: business.recipes,
        eventOrder: business.eventOrder,
        refundSources: business.refundSources,
      },
    };
  };

  return {
    userId,
    appName: app.name,
    read,
    publish: async (pilotSnapshot, parentRevision) => {
      assertCommercialPilotEmulatorEnvironment();
      const captured = captureDurableCommercial(pilotSnapshot);
      if (captured.status !== 'valid') throw new Error('El estado comercial de prueba no supera el contrato durable.');
      const state = defaultState();
      state.resale.commercial = captured.set;
      const result = await writeCloudModulesGuardedInternal(userId, state, ['resale'], `pilot-${clientName}`,
        { resale: parentRevision ?? undefined }, {}, undefined, { db, mode: 'pilot' });
      await result.completion;
      const revision = result.writes[0]?.revision;
      if (!revision) throw new Error('Firestore no devolvió una revisión para la publicación.');
      return revision;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await terminate(db);
      await deleteApp(app);
    },
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
  tombstones: Record<string, number>;
}> {
  if (!cloudSyncConfigured) {
    return { moduleData: {}, remoteRevisions: {}, lockedModules: [], corruptedModules: [], tombstones: {} };
  }

  const snapshot = await getDocsFromServer(modulesCollection(userId));
  const activeKey = sessionKey !== undefined ? sessionKey : cryptoSession.getKey(userId);
  const moduleData: Partial<Record<SyncModuleKey, unknown>> = {};
  const remoteRevisions: SyncRevisionMap = {};
  const lockedModules: SyncModuleKey[] = [];
  const corruptedModules: SyncModuleKey[] = [];
  const tombstones: Record<string, number> = {};

  for (const moduleDoc of snapshot.docs) {
    if (!isSyncModuleKey(moduleDoc.id)) continue;
    const module = moduleDoc.id;
    const docData = moduleDoc.data();
    try { assertReadableCloudModule(module, docData); }
    catch { corruptedModules.push(module); continue; }

    remoteRevisions[module] = docData.revision;
    if (module === 'resale' && docData.commercialProtocolVersion !== undefined && docData.commercialProtocolVersion !== 1) {
      corruptedModules.push(module); continue;
    }

    const decodeRes = await decodeCloudModuleData(docData.data, module, userId, activeKey);
    if (decodeRes.mode === 'locked') {
      lockedModules.push(module);
    } else if (decodeRes.mode === 'corrupted') {
      corruptedModules.push(module);
    } else {
      const markers = (decodeRes.data as { _tombstones?: Record<string, number> } | null)?._tombstones;
      for (const [id, timestamp] of Object.entries(markers || {})) {
        if (Number.isFinite(timestamp) && timestamp > (tombstones[id] || 0)) tombstones[id] = timestamp;
      }
      moduleData[module] = extractPureModuleData(decodeRes.data);
    }
  }

  return { moduleData, remoteRevisions, lockedModules, corruptedModules, tombstones };
}
