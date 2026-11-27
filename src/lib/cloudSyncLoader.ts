import type { CloudSyncStatus, CloudUser } from './cloudSync';
import type { SyncModuleKey } from './syncModel';

export type { CloudSyncStatus, CloudUser, SyncModuleKey };

export type CloudSyncModule = typeof import('./cloudSync');
export type CryptoCoreModule = typeof import('./cryptoCore');
export type SyncModelModule = typeof import('./syncModel');
export type SyncMergeModule = typeof import('./syncMerge');
export type DeviceTrustModule = typeof import('./deviceTrust');
export type FinanceSyncReconciliationModule = typeof import('./financeSyncReconciliation');
export type FinanceSnapshotIntegrityModule = typeof import('./financeSnapshotIntegrity');
export type CryptoMigrationModule = typeof import('./cryptoMigration');
export type CryptoPurgeModule = typeof import('./cryptoPurge');

export interface CloudSyncRuntime {
  cloudSync: CloudSyncModule;
  cryptoCore: CryptoCoreModule;
  syncModel: SyncModelModule;
  syncMerge: SyncMergeModule;
  deviceTrust: DeviceTrustModule;
  financeSyncReconciliation: FinanceSyncReconciliationModule;
  financeSnapshotIntegrity: FinanceSnapshotIntegrityModule;
}

const DEVICE_ID_STORAGE_KEY = 'lifeos-device-id-v1';
const LAST_CLOUD_USER_STORAGE_KEY = 'lifeos-cloud-last-user-v2';
const PAIRED_USER_STORAGE_PREFIX = 'lifeos-cloud-paired-user-v2:';
const WRAPPED_MDEK_STORAGE_PREFIX = 'lifeos-wrapped-mdek-v1';
const SCOPED_STATE_PREFIX = 'lifeos-state-v1:';
const DELETED_USER_MARKER_PREFIX = '__deleted__:';
const OAUTH_REDIRECT_SESSION_KEY = 'lifeos-oauth-redirect-pending';

let loadedCloudSync: CloudSyncModule | null = null;
let cloudSyncPromise: Promise<CloudSyncModule> | null = null;

let loadedCloudRuntime: CloudSyncRuntime | null = null;
let cloudRuntimePromise: Promise<CloudSyncRuntime> | null = null;

let loadedCryptoMigration: CryptoMigrationModule | null = null;
let cryptoMigrationPromise: Promise<CryptoMigrationModule> | null = null;

let loadedCryptoPurge: CryptoPurgeModule | null = null;
let cryptoPurgePromise: Promise<CryptoPurgeModule> | null = null;

function readMetaEnv(): Record<string, string | undefined> {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env) {
    return (import.meta as { env: Record<string, string | undefined> }).env;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
}

/**
 * Mirrors cloudSync.ts's `cloudSyncConfigured` without importing Firebase or cloudSync.ts.
 * In web/PWA builds (non-portable), public Firebase web config is always bundled in cloudSync.ts.
 */
export function isCloudSyncConfigured(): boolean {
  const isPortable = typeof __LIFEOS_PORTABLE__ !== 'undefined' && Boolean(__LIFEOS_PORTABLE__);
  return !isPortable;
}

/**
 * Lightweight local device identifier aligned with cloudSync.ts (`lifeos-device-id-v1`).
 */
export function getOrCreateLocalDeviceId(): string {
  try {
    if (typeof localStorage === 'undefined') return 'device-ephemeral';
    const current = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (current) return current;
    const generated =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `device-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'device-ephemeral';
  }
}

/**
 * Synchronous check for whether a wrapped E2EE envelope exists locally for `userId`,
 * without importing cryptoCore.ts into the initial boot bundle.
 */
export function hasWrappedKeyEnvelopeLocal(userId: string): boolean {
  if (!userId) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(`${WRAPPED_MDEK_STORAGE_PREFIX}:${userId}`));
  } catch {
    return false;
  }
}

export function markOAuthRedirectPending(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OAUTH_REDIRECT_SESSION_KEY, '1');
    }
  } catch {
    // Ignore storage access issues in restricted contexts.
  }
}

export function clearOAuthRedirectPending(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(OAUTH_REDIRECT_SESSION_KEY);
    }
  } catch {
    // Ignore storage access issues in restricted contexts.
  }
}

/**
 * Pure synchronous check (zero Firebase imports) for any local signal of a prior cloud
 * session, scoped cloud data, dev emulator mode, or an in-progress OAuth redirect.
 */
export function hasPendingCloudSessionHint(): boolean {
  const env = readMetaEnv();
  if (env.DEV && env.VITE_FIREBASE_EMULATORS === '1') {
    return true;
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem(OAUTH_REDIRECT_SESSION_KEY) === '1') {
        return true;
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (
          key &&
          (key.startsWith('firebase:redirectUser:') ||
            key.startsWith('firebase:pendingRedirect:') ||
            key.startsWith('firebase:authUser:'))
        ) {
          return true;
        }
      }
    }
  } catch {
    // Ignore restricted sessionStorage access.
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const lastUser = localStorage.getItem(LAST_CLOUD_USER_STORAGE_KEY);
      if (lastUser && !lastUser.startsWith(DELETED_USER_MARKER_PREFIX)) {
        return true;
      }
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('firebase:authUser:')) return true;
        if (key.startsWith(PAIRED_USER_STORAGE_PREFIX) && localStorage.getItem(key) === 'true') return true;
        if (key.startsWith(SCOPED_STATE_PREFIX) && !key.endsWith(':recovery')) return true;
      }
    }
  } catch {
    // Ignore restricted localStorage access.
  }

  try {
    if (typeof window !== 'undefined' && window.location) {
      const search = window.location.search || '';
      if (search.includes('firebase') || (search.includes('state=') && search.includes('code='))) {
        return true;
      }
    }
  } catch {
    // Ignore location access issues.
  }

  return false;
}

/**
 * Returns the loaded cloudSync module synchronously if it has already resolved, or null.
 */
export function getLoadedCloudSync(): CloudSyncModule | null {
  return loadedCloudSync;
}

/**
 * Deduplicated dynamic loader for `./cloudSync`.
 * Clears the in-flight promise on failure so transient offline/network errors can be retried.
 */
export function loadCloudSync(): Promise<CloudSyncModule> {
  if (loadedCloudSync) {
    return Promise.resolve(loadedCloudSync);
  }
  if (!cloudSyncPromise) {
    cloudSyncPromise = import('./cloudSync')
      .then((mod) => {
        loadedCloudSync = mod;
        return mod;
      })
      .catch((error) => {
        cloudSyncPromise = null;
        throw error;
      });
  }
  return cloudSyncPromise;
}

/**
 * Returns the full sync/crypto runtime bundle synchronously if loaded, or null.
 */
export function getLoadedCloudRuntime(): CloudSyncRuntime | null {
  return loadedCloudRuntime;
}

/**
 * Deduplicated dynamic loader for cloudSync + companion sync/crypto runtime helpers.
 */
export function loadCloudRuntime(): Promise<CloudSyncRuntime> {
  if (loadedCloudRuntime) {
    return Promise.resolve(loadedCloudRuntime);
  }
  if (!cloudRuntimePromise) {
    cloudRuntimePromise = Promise.all([
      loadCloudSync(),
      import('./cryptoCore'),
      import('./syncModel'),
      import('./syncMerge'),
      import('./deviceTrust'),
      import('./financeSyncReconciliation'),
      import('./financeSnapshotIntegrity'),
    ])
      .then(
        ([
          cloudSync,
          cryptoCore,
          syncModel,
          syncMerge,
          deviceTrust,
          financeSyncReconciliation,
          financeSnapshotIntegrity,
        ]) => {
          const runtime: CloudSyncRuntime = {
            cloudSync,
            cryptoCore,
            syncModel,
            syncMerge,
            deviceTrust,
            financeSyncReconciliation,
            financeSnapshotIntegrity,
          };
          loadedCloudRuntime = runtime;
          return runtime;
        }
      )
      .catch((error) => {
        cloudRuntimePromise = null;
        throw error;
      });
  }
  return cloudRuntimePromise;
}

/**
 * Idempotent, never-rejecting preloader for cloudSync + sync runtime chunks.
 * Safe to invoke on hover/focus/touchstart or during post-LCP idle without risking unhandled rejections.
 */
export function preloadCloudSync(): Promise<CloudSyncModule | null> {
  if (loadedCloudSync && loadedCloudRuntime) {
    return Promise.resolve(loadedCloudSync);
  }
  return loadCloudRuntime()
    .then((runtime) => runtime.cloudSync)
    .catch(() => null);
}

export function preloadCloudRuntime(): Promise<CloudSyncRuntime | null> {
  if (loadedCloudRuntime) {
    return Promise.resolve(loadedCloudRuntime);
  }
  return loadCloudRuntime().catch(() => null);
}

/**
 * Deduplicated on-demand loader for `./cryptoMigration`.
 */
export function loadCryptoMigration(): Promise<CryptoMigrationModule> {
  if (loadedCryptoMigration) {
    return Promise.resolve(loadedCryptoMigration);
  }
  if (!cryptoMigrationPromise) {
    cryptoMigrationPromise = import('./cryptoMigration')
      .then((mod) => {
        loadedCryptoMigration = mod;
        return mod;
      })
      .catch((error) => {
        cryptoMigrationPromise = null;
        throw error;
      });
  }
  return cryptoMigrationPromise;
}

/**
 * Deduplicated on-demand loader for `./cryptoPurge`.
 */
export function loadCryptoPurge(): Promise<CryptoPurgeModule> {
  if (loadedCryptoPurge) {
    return Promise.resolve(loadedCryptoPurge);
  }
  if (!cryptoPurgePromise) {
    cryptoPurgePromise = import('./cryptoPurge')
      .then((mod) => {
        loadedCryptoPurge = mod;
        return mod;
      })
      .catch((error) => {
        cryptoPurgePromise = null;
        throw error;
      });
  }
  return cryptoPurgePromise;
}

/** @internal Test-only reset helper for verifying deduplication and failure recovery. */
export function __resetCloudSyncLoaderForTesting(): void {
  loadedCloudSync = null;
  cloudSyncPromise = null;
  loadedCloudRuntime = null;
  cloudRuntimePromise = null;
  loadedCryptoMigration = null;
  cryptoMigrationPromise = null;
  loadedCryptoPurge = null;
  cryptoPurgePromise = null;
}
