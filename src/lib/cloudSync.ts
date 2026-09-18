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
import { defaultState, normalizeStoredState, uid } from './storage';
import {
  SYNC_MODULES,
  isSyncModuleKey,
  syncModuleData,
  type SyncModuleKey,
  type SyncBaselineMap,
  type SyncRevisionMap,
} from './syncModel';
import appletConfig from '../../firebase-applet-config.json';

export type CloudSyncStatus =
  | 'unavailable'
  | 'signed-out'
  | 'connecting'
  | 'saving'
  | 'synced'
  | 'offline'
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
      });
    } catch {
      firestore = getFirestore(app);
    }
  }

  return { auth, db: firestore };
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
  const generated = uid();
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

export function hasMeaningfulData(state: LifeOSState): boolean {
  const def = defaultState();
  const agendaHasData = Object.values(state.agenda).some((blocks) => blocks.length > 0);
  const recurringSignature = (items: LifeOSState['tasksRecurring']) => items.map(({ name, freq, days }) => ({ name, freq, days: days || [] }));
  const defaultAccounts = state.finance.accounts.length === 2
    && state.finance.accounts[0]?.name === 'Efectivo'
    && state.finance.accounts[1]?.name === 'Banco'
    && state.finance.accounts.every((account) => Number(account.balance) === 0);
  const collections = [
    state.todayExtras, state.dailyPriorities, state.dailyContext,
    state.finance.transactions, state.finance.transfers, state.finance.reconciliations,
    state.finance.debts, state.finance.investments, state.finance.subscriptions,
    state.gym.weight, state.gym.measurements, state.gym.sessions, state.gym.routineTemplates,
    state.study.subjects, state.study.exams, state.study.studyLog,
    state.streaming.sessions, state.jobs.opportunities, state.jobs.applications,
    state.resale.opportunities, state.resale.inventory, state.ideas, state.calendarEvents,
    state.goals, state.notes.postits, state.notes.shopping, state.notes.links, state.notes.possessions,
  ];

  return Boolean(
    state.profile.name.trim()
      || state.profile.height !== def.profile.height
      || state.profile.bodyCompositionSex
      || agendaHasData
      || JSON.stringify(recurringSignature(state.tasksRecurring)) !== JSON.stringify(recurringSignature(def.tasksRecurring))
      || !defaultAccounts
      || Object.keys(state.finance.budgets).some((key) => Number(state.finance.budgets[key]) !== 0)
      || state.streaming.monthlyGoal !== def.streaming.monthlyGoal
      || state.settings.darkMode
      || state.settings.hiddenTabs.length > 0
      || collections.some((items) => items.length > 0)
      || Object.keys(state.checkoutLog).length > 0
      || Object.keys(state.taskLog).length > 0
  );
}

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

export function writeCloudModules(
  userId: string,
  state: LifeOSState,
  modules: SyncModuleKey[],
  deviceId: string,
  baseRevisions: SyncRevisionMap,
  tombstones: Record<string, number> = {}
): CloudWriteBatch {
  const { db } = services();
  const batch = writeBatch(db);
  const clientUpdatedAt = Date.now();
  const writes = modules.map((module, index) => {
    const revision = `${clientUpdatedAt + index}-${deviceId}-${uid()}`;
    const parentRevision = baseRevisions[module] || null;
    const rawData = syncModuleData(state, module) as Record<string, unknown>;
    const payloadData = Object.keys(tombstones).length > 0
      ? { ...rawData, _tombstones: tombstones }
      : rawData;

    const payload = {
      schemaVersion: state.schemaVersion,
      module,
      data: payloadData,
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

export async function readLegacyCloudState(userId: string): Promise<LifeOSState | null> {
  const { db } = services();
  const snapshot = await getDoc(doc(db, 'users', userId, 'lifeos', 'state'));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return normalizeStoredState(data.state);
}
