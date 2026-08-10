import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { LifeOSState } from '../types';
import { normalizeStoredState } from './storage';

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

export interface CloudStateSnapshot {
  state: LifeOSState;
  deviceId: string;
  fromCache: boolean;
  pendingWrites: boolean;
}

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const cloudSyncConfigured =
  !__LIFEOS_PORTABLE__ &&
  Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

const DEVICE_KEY = 'lifeos-device-id-v1';
const PAIRED_USER_KEY = 'lifeos-cloud-paired-user-v1';

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
  const generated = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

export function isCloudPaired(userId: string): boolean {
  return localStorage.getItem(PAIRED_USER_KEY) === userId;
}

export function markCloudPaired(userId: string): void {
  localStorage.setItem(PAIRED_USER_KEY, userId);
}

export function hasMeaningfulData(state: LifeOSState): boolean {
  const hasAccountBalance = state.finance.accounts.some((account) => Number(account.balance) !== 0);
  const collections = [
    state.todayExtras,
    state.finance.transactions,
    state.finance.debts,
    state.finance.investments,
    state.finance.subscriptions,
    state.gym.weight,
    state.gym.measurements,
    state.gym.sessions,
    state.gym.routineTemplates,
    state.study.subjects,
    state.study.exams,
    state.study.studyLog,
    state.streaming.sessions,
    state.jobs.opportunities,
    state.jobs.applications,
    state.resale.opportunities,
    state.resale.inventory,
    state.ideas,
    state.calendarEvents,
    state.goals,
    state.notes.postits,
    state.notes.shopping,
    state.notes.links,
  ];

  return Boolean(
    state.profile.name.trim() ||
      hasAccountBalance ||
      collections.some((collection) => collection.length > 0) ||
      Object.keys(state.checkoutLog).length > 0 ||
      Object.keys(state.taskLog).length > 0
  );
}

export function observeCloudUser(onChange: (user: CloudUser | null) => void): () => void {
  if (!cloudSyncConfigured) {
    onChange(null);
    return () => undefined;
  }
  const { auth } = services();
  return onAuthStateChanged(auth, (user) => onChange(toCloudUser(user)));
}

export async function signInToCloud(): Promise<void> {
  const { auth } = services();
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOutFromCloud(): Promise<void> {
  const { auth } = services();
  await signOut(auth);
}

function stateDocument(userId: string) {
  const { db } = services();
  return doc(db, 'users', userId, 'lifeos', 'state');
}

export function subscribeCloudState(
  userId: string,
  handlers: {
    onState: (snapshot: CloudStateSnapshot) => void;
    onMissing: () => void;
    onError: (error: Error) => void;
  }
): () => void {
  return onSnapshot(
    stateDocument(userId),
    { includeMetadataChanges: true },
    (snapshot) => {
      const fromCache = snapshot.metadata.fromCache;
      if (!snapshot.exists()) {
        if (!fromCache) handlers.onMissing();
        return;
      }

      try {
        const data = snapshot.data();
        handlers.onState({
          state: normalizeStoredState(data.state),
          deviceId: typeof data.deviceId === 'string' ? data.deviceId : '',
          fromCache,
          pendingWrites: snapshot.metadata.hasPendingWrites,
        });
      } catch (error) {
        handlers.onError(error instanceof Error ? error : new Error('No se pudieron validar los datos sincronizados.'));
      }
    },
    (error) => handlers.onError(error)
  );
}

export async function writeCloudState(userId: string, state: LifeOSState, deviceId: string): Promise<void> {
  await setDoc(stateDocument(userId), {
    schemaVersion: state.schemaVersion,
    state,
    deviceId,
    updatedAt: serverTimestamp(),
  });
}
