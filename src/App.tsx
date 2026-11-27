import { validateDurableCommercial } from './lib/commercialDurable';
import { assertCommercialTransition } from './lib/commercialTransition';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { PrivacyProvider } from './components/PrivacyAmount';
import { ViewType, LifeOSState, DailyContextEntry } from './types';
import { commercialHydrationBlock, changesStoredCommercial, defaultState, hasPersistedCommercial, loadRecoveryState, loadStoredState, parseBackupJSON, readStoredCommercial, saveRecoveryState, saveStoredState, todayISO } from './lib/storage';
import {
  isModuleEnabled,
  isModuleHidden,
  isUserPendingOnboarding,
  computeHiddenTabsFromSelection,
} from './lib/moduleVisibility';
import type { CloudSyncStatus, CloudUser } from './lib/cloudSync';
import type {
  SyncBaselineMap,
  SyncConflictItem,
  SyncModuleKey,
  SyncRevisionMap,
} from './lib/syncModel';
import type { WrappedKeyEnvelope } from './lib/cryptoCore';
import {
  clearOAuthRedirectPending,
  getLoadedCloudRuntime,
  getLoadedCloudSync,
  getOrCreateLocalDeviceId,
  hasPendingCloudSessionHint,
  hasWrappedKeyEnvelopeLocal,
  isCloudSyncConfigured,
  loadCloudRuntime,
  markOAuthRedirectPending,
  preloadCloudSync,
  type CloudSyncRuntime,
} from './lib/cloudSyncLoader';
import { nextFinanceDeletionTimestamp } from './lib/financeRevision';
import { stampGymMutation } from './lib/gymSync';

import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

import { DashboardSkeleton } from './components/DashboardSkeleton';
import type { CaptureKind } from './components/MobileQuickCapture';
import { MobileNav } from './components/MobileNav';
import { ToastViewport } from './components/ToastViewport';
import { CelestianConfirmHost } from './components/CelestianConfirmHost';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { syncDocumentThemeColor } from './lib/pwaRecovery';
import { showToast } from './lib/toast';
import { addRemoteResaleVersion, includeResaleConflictModules, loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './lib/resaleConflictRecovery';
import type { ResaleConflictReconciliationPreview } from './lib/resaleConflictResolution';
import { lazyWithPreload } from './lib/lazyWithPreload';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { isAmbientSessionAttached, isAnyAmbientNoisePlaying, isSoundEnabled, stopAllAmbientNoise } from './lib/audio';

const DashboardView = lazyWithPreload(() => import('./components/DashboardView').then((module) => ({ default: module.DashboardView })));
const MobileQuickCapture = lazyWithPreload(() => import('./components/MobileQuickCapture').then((module) => ({ default: module.MobileQuickCapture })));
const GymRestOverlay = lazyWithPreload(() => import('./components/GymRestOverlay').then((module) => ({ default: module.GymRestOverlay })));
const StudyActiveOverlay = lazyWithPreload(() => import('./components/StudyActiveOverlay').then((module) => ({ default: module.StudyActiveOverlay })));
const AgendaView = lazyWithPreload(() => import('./components/AgendaView').then((module) => ({ default: module.AgendaView })));
const CalendarioView = lazyWithPreload(() => import('./components/CalendarioView').then((module) => ({ default: module.CalendarioView })));
const TrabajoView = lazyWithPreload(() => import('./components/TrabajoView').then((module) => ({ default: module.TrabajoView })));
const ReventaView = lazyWithPreload(() => import('./components/ReventaView').then((module) => ({ default: module.ReventaView })));
const FinanzasView = lazyWithPreload(() => import('./components/FinanzasView').then((module) => ({ default: module.FinanzasView })));
const GimnasioView = lazyWithPreload(() => import('./components/GimnasioView').then((module) => ({ default: module.GimnasioView })));
const EstudiosView = lazyWithPreload(() => import('./components/EstudiosView').then((module) => ({ default: module.EstudiosView })));
const NotasView = lazyWithPreload(() => import('./components/NotasView').then((module) => ({ default: module.NotasView })));
const IAView = lazyWithPreload(() => import('./components/IAView').then((module) => ({ default: module.IAView })));
const ConfigView = lazyWithPreload(() => import('./components/ConfigView').then((module) => ({ default: module.ConfigView })));
const CheckoutModal = lazyWithPreload(() => import('./components/CheckoutModal').then((module) => ({ default: module.CheckoutModal })));
const GlobalSearchModal = lazyWithPreload(() => import('./components/GlobalSearchModal').then((module) => ({ default: module.GlobalSearchModal })));
const CloudConflictModal = lazyWithPreload(() => import('./components/CloudConflictModal').then((module) => ({ default: module.CloudConflictModal })));
const OnboardingView = lazyWithPreload(() => import('./components/OnboardingView').then((module) => ({ default: module.OnboardingView })));
const UnlockDeviceModal = lazyWithPreload(() => import('./components/UnlockDeviceModal').then((module) => ({ default: module.UnlockDeviceModal })));

// Warm the active landing chunk immediately so fresh or returning mobile loads don't stall on a second RTT.
if (typeof window !== 'undefined') {
  try {
    const hasExistingData =
      Boolean(window.localStorage.getItem('lifeos-state-v1')) || hasPendingCloudSessionHint();
    if (hasExistingData) {
      void DashboardView.preload().catch(() => {});
    } else {
      void OnboardingView.preload().catch(() => {});
    }
  } catch {
    // Ignore storage access errors in restricted environments.
  }
}

const PRELOADABLE_VIEWS: Partial<Record<ViewType, () => Promise<unknown>>> = {
  dashboard: DashboardView.preload,
  agenda: AgendaView.preload,
  calendario: CalendarioView.preload,
  trabajo: TrabajoView.preload,
  reventa: ReventaView.preload,
  finanzas: FinanzasView.preload,
  gimnasio: GimnasioView.preload,
  estudios: EstudiosView.preload,
  notas: NotasView.preload,
  ia: IAView.preload,
  config: ConfigView.preload,
  checkout: CheckoutModal.preload,
};

function prefetchViewChunk(view: ViewType): void {
  const loader = PRELOADABLE_VIEWS[view];
  if (loader) {
    void loader().catch(() => {});
  }
}

function prefetchCaptureChunk(): void {
  void MobileQuickCapture.preload().catch(() => {});
}

function prefetchSearchChunk(): void {
  void GlobalSearchModal.preload().catch(() => {});
}

const dialogLoading = (label: string) => (
  <div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 text-sm backdrop-blur-xs">
    <span className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.07] dark:bg-[#0D111A] dark:text-slate-100 dark:shadow-none">
      {label}
    </span>
  </div>
);

export default function App() {
  const [{ state, storageBackend }, setStateObj] = useState(() => {
    const loaded = loadStoredState();
    return { state: loaded.state, storageBackend: loaded.backend };
  });

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [quickTransactionType, setQuickTransactionType] = useState<'gasto' | 'ingreso' | null>(null);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureKind, setQuickCaptureKind] = useState<CaptureKind>('tarea');
  const [quickCaptureInitialText, setQuickCaptureInitialText] = useState('');
  const [initialNoteId, setInitialNoteId] = useState<string | null>(null);
  const [initialFinanceTab, setInitialFinanceTab] = useState<'movimientos' | 'cuentas' | 'analisis' | 'proyeccion' | null>(null);
  const [initialNotesTab, setInitialNotesTab] = useState<'notas' | 'proyectos' | 'streaming' | null>(null);
  const [initialFocusId, setInitialFocusId] = useState<string | null>(null);
  const [initialAgendaDate, setInitialAgendaDate] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const cloudSyncConfigured = isCloudSyncConfigured();
  const [cloudRuntime, setCloudRuntime] = useState<CloudSyncRuntime | null>(() => getLoadedCloudRuntime());
  const [cloudAuthBootRequested, setCloudAuthBootRequested] = useState(false);
  const cloudRuntimeRef = useRef<CloudSyncRuntime | null>(cloudRuntime);
  cloudRuntimeRef.current = cloudRuntime;
  const cloudAuthBootRequestedRef = useRef(cloudAuthBootRequested);
  cloudAuthBootRequestedRef.current = cloudAuthBootRequested;
  const getCloudRuntime = useCallback((): CloudSyncRuntime | null => {
    const current = cloudRuntimeRef.current ?? getLoadedCloudRuntime();
    if (current && !cloudRuntimeRef.current) {
      cloudRuntimeRef.current = current;
    }
    return current;
  }, []);

  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline'
      : !cloudSyncConfigured
        ? 'unavailable'
        : hasPendingCloudSessionHint()
          ? 'connecting'
          : 'signed-out'
  );
  const [failedSyncModules, setFailedSyncModules] = useState<SyncModuleKey[]>([]);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [isCryptoUnlockOpen, setIsCryptoUnlockOpen] = useState(false);
  const [, setCryptoSessionNonce] = useState(0);

  useEffect(() => {
    if (!cloudRuntime) return;
    return cloudRuntime.cryptoCore.cryptoSession.subscribe(() => {
      setCryptoSessionNonce((n) => n + 1);
    });
  }, [cloudRuntime]);

  const effectiveCloudUserId = cloudUser?.uid || storageUserId;
  const loadedCryptoSession = getCloudRuntime()?.cryptoCore.cryptoSession;
  const isCryptoLockError = (syncStatus === 'error' || syncStatus === 'locked') && (
    Boolean(syncErrorMessage && (syncErrorMessage.includes('Desbloqueá la sesión') || syncErrorMessage.toLowerCase().includes('desbloqueá') || syncErrorMessage.toLowerCase().includes('sesión'))) ||
    Boolean(effectiveCloudUserId && !(loadedCryptoSession?.isUnlocked(effectiveCloudUserId) ?? false) && hasWrappedKeyEnvelopeLocal(effectiveCloudUserId))
  );

  const [cloudConflict, setCloudConflict] = useState<{
    remoteState: LifeOSState;
    modules: SyncModuleKey[];
    remoteRevisions: SyncRevisionMap;
    localModules?: SyncModuleKey[];
    needsMigration?: boolean;
    conflicts?: SyncConflictItem[];
    recommendedSide?: 'cloud' | 'local';
  } | null>(null);
  const [isCloudConflictDismissed, setIsCloudConflictDismissed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname || '';
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      const isDev = Boolean(import.meta.env?.DEV);
      if (!isLocalHost && !isDev) {
        // Strictly isolated: prevent exposing synthetic cloud test hook in public production client
        return;
      }
      (window as any).__setSyntheticCloudState = (opts: {
        cloudUser?: CloudUser | null;
        syncStatus?: CloudSyncStatus;
        lastSyncedAt?: string | null;
        e2eeActive?: boolean;
        e2eeUnlocked?: boolean;
        e2eeHasVaultPassword?: boolean;
        openUnlockModal?: boolean;
        openConflictModal?: boolean;
      }) => {
        const uid = opts.cloudUser?.uid ?? (cloudUserRef.current?.uid || 'usr-demo');
        if ('cloudUser' in opts) {
          cloudUserRef.current = opts.cloudUser ?? null;
          storageUserIdRef.current = opts.cloudUser?.uid ?? null;
          setStorageUserId(opts.cloudUser?.uid ?? null);
          setCloudUser(opts.cloudUser ?? null);
        }
        if ('syncStatus' in opts && opts.syncStatus) setSyncStatus(opts.syncStatus);
        if ('lastSyncedAt' in opts) setLastSyncedAt(opts.lastSyncedAt ?? null);
        if (opts.e2eeActive) {
          const applySyntheticE2EE = (runtime: CloudSyncRuntime) => {
            const {
              RECOVERY_KDF_BASE_INFO,
              encodeVaultPasswordInfo,
              CURRENT_KEY_FORMAT_VERSION,
              CURRENT_CRYPTO_VERSION,
              CRYPTO_ALGORITHM,
              saveWrappedKeyEnvelope,
              cryptoSession,
            } = runtime.cryptoCore;
            const info = opts.e2eeHasVaultPassword === false
              ? RECOVERY_KDF_BASE_INFO
              : encodeVaultPasswordInfo({
                  iterations: 600000,
                  salt: 'c3ludGhldGljLXB3LXNhbHQ=',
                  iv: 'c3ludGhldGljLXB3LWl2',
                  ciphertext: 'c3ludGhldGljLXB3LWNpcGhlcnRleHQtZGF0YS1iYXNlNjQ=',
                });
            const envelope: WrappedKeyEnvelope = {
              keyFormatVersion: CURRENT_KEY_FORMAT_VERSION,
              cryptoVersion: CURRENT_CRYPTO_VERSION,
              algorithm: CRYPTO_ALGORITHM,
              wrappedMdek: {
                iv: 'c3ludGhldGljLWl2LTEyYg==',
                ciphertext: 'c3ludGhldGljLWNpcGhlcnRleHQtZGF0YS1iYXNlNjQ=',
              },
              kdf: {
                algorithm: 'HKDF-SHA-256',
                salt: 'c3ludGhldGljLXNhbHQtMTZi',
                info,
              },
              aad: `keyFormatVersion:1|userId:${uid}`,
              createdAt: new Date().toISOString(),
            };
            saveWrappedKeyEnvelope(envelope, uid);
            (window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__ = {
              ...((window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__ || {}),
              [uid]: envelope,
            };
            (window as any).__LIFEOS_SYNTHETIC_CAPABILITY__ = {
              ...((window as any).__LIFEOS_SYNTHETIC_CAPABILITY__ || {}),
              [uid]: {
                version: 1,
                minimumSyncProtocolVersion: 2,
                encryptionState: 'encrypted',
                encryptedModules: [...runtime.syncModel.SYNC_MODULES],
                updatedAt: new Date().toISOString(),
              },
            };
            if (opts.e2eeUnlocked) {
              cryptoSession.setUnlocked({ type: 'secret', extractable: false } as any, uid);
            } else {
              cryptoSession.lock();
            }
          };
          const loaded = getCloudRuntime();
          if (loaded) {
            applySyntheticE2EE(loaded);
          } else {
            void loadCloudRuntime().then((runtime) => {
              setCloudRuntime(runtime);
              applySyntheticE2EE(runtime);
            }).catch(() => {});
          }
        } else if (opts.e2eeActive === false) {
          const loaded = getCloudRuntime();
          if (loaded) {
            loaded.cryptoCore.clearWrappedKeyEnvelope(uid);
            loaded.cryptoCore.cryptoSession.lock();
          } else {
            try { localStorage.removeItem(`lifeos-wrapped-mdek-v1:${uid}`); } catch {}
          }
          if ((window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__) {
            delete (window as any).__LIFEOS_SYNTHETIC_CLOUD_ENVELOPE__[uid];
          }
          (window as any).__LIFEOS_SYNTHETIC_CAPABILITY__ = {
            ...((window as any).__LIFEOS_SYNTHETIC_CAPABILITY__ || {}),
            [uid]: {
              version: 1,
              minimumSyncProtocolVersion: 1,
              encryptionState: 'plaintext',
              encryptedModules: [],
              updatedAt: new Date().toISOString(),
            },
          };
        }
        if (typeof opts.openUnlockModal === 'boolean') {
          setIsCryptoUnlockOpen(opts.openUnlockModal);
        }
        if (opts.openConflictModal === true) {
          const remoteSample = defaultState();
          remoteSample.profile.name = 'Cuenta en la nube';
          remoteSample.notes.postits = [
            { id: 'syn-n1', text: 'Nota guardada en la nube', date: todayISO(), createdAt: new Date().toISOString() },
            { id: 'syn-n2', text: 'Lista de ideas', date: todayISO(), createdAt: new Date().toISOString() },
          ];
          remoteSample.finance.transactions = [
            {
              id: 'syn-t1',
              date: todayISO(),
              type: 'ingreso',
              amount: 15000,
              category: 'Otros',
              fixed: 'variable',
              note: 'Movimiento en la nube',
              currency: 'UYU',
            },
          ];
          setIsCloudConflictDismissed(false);
          setCloudConflict({
            remoteState: remoteSample,
            modules: ['finance', 'notes', 'tasks', 'profile'],
            remoteRevisions: { finance: 'rev-1', notes: 'rev-2', tasks: 'rev-3', profile: 'rev-4' },
            recommendedSide: 'cloud',
          });
          setSyncStatus('conflict');
        } else if (opts.openConflictModal === false) {
          setCloudConflict(null);
          setIsCloudConflictDismissed(false);
        }
      };
    }
  }, [getCloudRuntime]);
  const [resaleRecoveryStatus, setResaleRecoveryStatus] = useState<'none' | 'saved' | 'failed'>('none');
  const [resaleConflictReason, setResaleConflictReason] = useState(() => readStoredCommercial(state).status === 'blocked'
    ? 'Los datos comerciales locales no superan la validación; permanecen guardados en este dispositivo.' : '');
  const [resaleResolutionPending, setResaleResolutionPending] = useState(false);
  const [resaleReconcilePreview, setResaleReconcilePreview] = useState<ResaleConflictReconciliationPreview | null>(null);

  const stateRef = useRef(state);
  const cloudUserRef = useRef<CloudUser | null>(null);
  const cloudSessionEpochRef = useRef(0);
  const storageUserIdRef = useRef<string | null>(null);
  const lastDeletedUserIdRef = useRef<string | null>(null);
  const revisionsRef = useRef<SyncRevisionMap>({});
  const baselinesRef = useRef<SyncBaselineMap>({});
  const baselineDataRef = useRef<Partial<Record<SyncModuleKey, unknown>>>({});
  const tombstonesRef = useRef<Record<string, number>>({});
  const pendingRevisionsRef = useRef<Partial<Record<SyncModuleKey, string[]>>>({});
  const failedSyncModulesRef = useRef<Set<SyncModuleKey>>(new Set());
  const queuedModulesRef = useRef<Set<SyncModuleKey>>(new Set());
  const queuedStateRef = useRef<LifeOSState | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const tabChannelRef = useRef<BroadcastChannel | null>(null);
  const initializedUserRef = useRef<string | null>(null);
  const legacyReadUserRef = useRef<string | null>(null);
  const conflictPendingRef = useRef(false);
  const resaleWriteBlockedRef = useRef(readStoredCommercial(state).status === 'blocked');
  const gymWriteBlockedRef = useRef(false);
  const financeWriteBlockedRef = useRef(false);
  const financePublicationRef = useRef<symbol | null>(null);
  const financeRecoveryAttemptsRef = useRef(0);
  const resaleConflictRecordRef = useRef<ResaleConflictRecord | null>(null);
  const resaleResolutionInProgressRef = useRef(false);
  const consecutiveDivergenceCountRef = useRef<number>(0);
  const deviceIdRef = useRef(getOrCreateLocalDeviceId());
  const isImportingBackupRef = useRef(false);
  const importBackupTimeoutRef = useRef<number | null>(null);

  // Explicit demo-only diagnostics: no production financial payloads are logged.
  const traceFinanceSync = useCallback((event: string, detail: Record<string, unknown> = {}) => {
    if (!import.meta.env.DEV || import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'demo-lifeos' || import.meta.env.VITE_FINANCE_SYNC_TRACE !== '1') return;
    console.info('[FinanceSyncTrace]', JSON.stringify({ event, at: Date.now(),
      localIds: stateRef.current.finance.transactions.map(tx => tx.id),
      baseIds: (baselineDataRef.current.finance as { finance?: LifeOSState['finance'] } | undefined)?.finance?.transactions.map(tx => tx.id),
      revision: revisionsRef.current.finance, pending: pendingRevisionsRef.current.finance,
      queued: [...queuedModulesRef.current], blocked: financeWriteBlockedRef.current,
      ...detail }));
  }, []);

  const blockFinanceConflict = useCallback((remoteState: LifeOSState, remoteRevisions: SyncRevisionMap, conflicts: SyncConflictItem[]) => {
    traceFinanceSync('blocked', { conflicts: conflicts.map(item => item.id), remoteIds: remoteState.finance.transactions.map(tx => tx.id), remoteRevision: remoteRevisions.finance });
    const userId = cloudUserRef.current?.uid;
    financeWriteBlockedRef.current = true;
    conflictPendingRef.current = true;
    queuedModulesRef.current.add('finance');
    const runtime = getCloudRuntime();
    if (userId && runtime) {
      runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'local', stateRef.current);
      runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'remote', remoteState);
      if (baselineDataRef.current.finance) runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'base', runtime.syncModel.buildStateFromModules(baselineDataRef.current));
    }
    setIsCloudConflictDismissed(false);
    setCloudConflict({ remoteState, modules: ['finance'], remoteRevisions, conflicts, recommendedSide: 'local' });
    setSyncStatus('conflict');
    showToast('La versión recibida de Finanzas podría perder movimientos o restaurar datos anteriores. Conservamos la copia local; revisá el conflicto.', 'error');
  }, [getCloudRuntime, traceFinanceSync]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('lifeos-tab-sync');
    tabChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (
        event.data &&
        event.data.type === 'tab-state-update' &&
        event.data.userId === storageUserIdRef.current &&
        event.data.state
      ) {
        if (financeWriteBlockedRef.current) return;
        const runtime = getCloudRuntime();
        if (runtime) {
          const tabTombstones = { ...runtime.syncMerge.loadTombstones(event.data.userId) };
          for (const [id, timestamp] of Object.entries(tombstonesRef.current)) tabTombstones[id] = Math.max(tabTombstones[id] || 0, Number(timestamp));
          const financeConflicts = runtime.financeSnapshotIntegrity.detectFinanceSnapshotRegression(stateRef.current.finance, event.data.state.finance, tabTombstones);
          if (financeConflicts.length) {
            blockFinanceConflict(event.data.state, {}, financeConflicts);
            return;
          }
          tombstonesRef.current = tabTombstones;
        }
        const diagnostic = commercialHydrationBlock(stateRef.current, event.data.state);
        if (diagnostic) {
          setResaleConflictReason(diagnostic);
          resaleWriteBlockedRef.current = true;
          setSyncStatus('conflict');
          return;
        }
        stateRef.current = event.data.state;
        setStateObj({ state: event.data.state, storageBackend: 'localStorage' });
      }
    };
    return () => {
      channel.close();
      tabChannelRef.current = null;
    };
  }, [blockFinanceConflict, getCloudRuntime]);

  const applyRemoteState = (remoteState: LifeOSState, userId = storageUserIdRef.current) => {
    const runtime = getCloudRuntime();
    const diagnostic = commercialHydrationBlock(stateRef.current, remoteState);
    if (diagnostic) {
      blockResaleConflict(['resale'], diagnostic, runtime ? { resale: runtime.syncModel.syncModuleData(remoteState, 'resale') } : undefined, {});
      return false;
    }
    const localTimer = stateRef.current.gym.activeTimer ?? null;
    const nextState = {
      ...remoteState,
      gym: {
        ...remoteState.gym,
        activeTimer: localTimer,
      },
    };
    const saved = saveStoredState(nextState, userId);
    if (!saved && runtime && runtime.syncModel.syncModuleFingerprint(stateRef.current, 'gym') !== runtime.syncModel.syncModuleFingerprint(nextState, 'gym')) {
      setSyncStatus('error');
      showToast('No se pudo guardar la versión recibida de Gimnasio. Se conservó la copia local.', 'error');
      return false;
    }
    if (!saved && runtime && runtime.syncModel.syncModuleFingerprint(stateRef.current, 'finance') !== runtime.syncModel.syncModuleFingerprint(nextState, 'finance')) {
      setSyncStatus('error');
      showToast('No se pudo guardar la versión recibida de Finanzas. Se conservó la copia local.', 'error');
      return false;
    }
    if (!saved && (readStoredCommercial(nextState).status !== 'absent' || readStoredCommercial(stateRef.current).status !== 'absent' || hasPersistedCommercial(userId))) {
      blockResaleConflict(['resale'], 'No se pudo conservar de forma segura el estado remoto en este dispositivo.',
        runtime ? { resale: runtime.syncModel.syncModuleData(remoteState, 'resale') } : undefined, {});
      return false;
    }
    stateRef.current = nextState;
    setStateObj({ state: nextState, storageBackend: saved ? 'localStorage' : 'ninguno' });
    return true;
  };

  const persistRevisionMap = (userId: string, revisions: SyncRevisionMap) => {
    revisionsRef.current = revisions;
    getCloudRuntime()?.cloudSync.saveCloudRevisions(userId, revisions);
  };

  const persistBaselines = (userId: string, baselines: SyncBaselineMap) => {
    baselinesRef.current = baselines;
    getCloudRuntime()?.cloudSync.saveCloudBaselines(userId, baselines);
  };

  const optimisticRevisionMap = (): SyncRevisionMap => {
    const entries = Object.entries(pendingRevisionsRef.current) as [SyncModuleKey, string[] | undefined][];
    const pending = Object.fromEntries(entries.flatMap(([module, revisions]) => {
      const latest = revisions?.at(-1);
      return latest ? [[module, latest]] : [];
    })) as SyncRevisionMap;
    // A transactional Finance writer may only use a confirmed server parent.
    // An offline preparation is not a server revision, even after a safe merge.
    return { ...revisionsRef.current, ...pending, finance: revisionsRef.current.finance };
  };

  const blockResaleConflict = (
    modules: SyncModuleKey[],
    diagnostic: string,
    remoteData?: Partial<Record<SyncModuleKey, unknown>>,
    remoteRevisions?: SyncRevisionMap,
    expectedRevisions: SyncRevisionMap = revisionsRef.current
  ) => {
    const userId = cloudUserRef.current?.uid;
    const runtime = getCloudRuntime();
    const affected = [...new Set<SyncModuleKey>(['resale', ...modules])];
    resaleWriteBlockedRef.current = true;
    affected.forEach((module) => queuedModulesRef.current.add(module));
    if (!userId || !runtime) { setResaleRecoveryStatus('failed'); setSyncStatus('conflict'); return; }
    const localModules = Object.fromEntries(affected.map((module) => [module, runtime.syncModel.syncModuleData(stateRef.current, module)]));
    const baseModules = Object.fromEntries(affected.filter((module) => module in baselineDataRef.current).map((module) => [module, baselineDataRef.current[module]]));
    const baseRevisions = Object.fromEntries(affected.filter((module) => module in expectedRevisions).map((module) => [module, expectedRevisions[module]])) as SyncRevisionMap;
    const record = resaleConflictRecordRef.current
      ? includeResaleConflictModules(resaleConflictRecordRef.current, affected, localModules, baseModules, baseRevisions)
      : {
      id: crypto.randomUUID(),
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      diagnostic,
      modules: affected,
      local: structuredClone(localModules),
      base: structuredClone(baseModules),
      baseRevisions,
      remoteVersions: [],
    };
    const nextRecord = remoteData && remoteRevisions
      ? addRemoteResaleVersion({ ...record, diagnostic }, remoteData, remoteRevisions)
      : { ...record, diagnostic };
    resaleConflictRecordRef.current = nextRecord;
    setResaleConflictReason(diagnostic);
    setResaleRecoveryStatus(saveResaleConflict(userId, nextRecord) ? 'saved' : 'failed');
    setSyncStatus('conflict');
  };

  const blockGymConflict = (remoteState: LifeOSState, remoteRevisions: SyncRevisionMap, conflicts: SyncConflictItem[]) => {
    const userId = cloudUserRef.current?.uid;
    const runtime = getCloudRuntime();
    gymWriteBlockedRef.current = true;
    queuedModulesRef.current.add('gym');
    if (userId && runtime) {
      runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'local', stateRef.current);
      runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'remote', remoteState);
      if (baselineDataRef.current.gym) {
        runtime.cloudSync.saveSyncRecoverySnapshot(userId, 'base', runtime.syncModel.buildStateFromModules({ gym: baselineDataRef.current.gym }));
      }
    }
    setIsCloudConflictDismissed(false);
    setCloudConflict({ remoteState, modules: ['gym'], remoteRevisions, conflicts, recommendedSide: 'local' });
    setSyncStatus('conflict');
  };

  const flushCloudSave = () => {
    const runtime = getCloudRuntime();
    if (!runtime) return;
    const {
      cloudSync: {
        isCloudSyncSuspended,
        writeCloudModulesGuarded,
        CloudSyncSuspendedError,
        CloudRevisionConflict,
        CloudProtocolConflict,
        ResaleRevisionConflict,
        ResaleProtocolConflict,
        isFirestorePermissionDenied,
        fetchFreshCloudModules,
        cloudStatusWithLocalChanges,
        saveCloudBaselineData,
      },
      syncModel: { buildStateFromModules, syncModuleData },
      syncMerge: { saveTombstones },
      financeSyncReconciliation: { reconcileFinancePublication },
    } = runtime;
    if (isCloudSyncSuspended()) {
      queuedModulesRef.current.clear();
      queuedStateRef.current = null;
      syncTimerRef.current = null;
      return;
    }
    const user = cloudUserRef.current;
    const currentState = stateRef.current;
    const modules = [...queuedModulesRef.current];
    if (financeWriteBlockedRef.current && modules.includes('finance')) {
      setSyncStatus('conflict');
      return;
    }
    if (gymWriteBlockedRef.current && modules.includes('gym')) {
      setSyncStatus('conflict');
      return;
    }
    if (resaleWriteBlockedRef.current && modules.includes('resale')) {
      setSyncStatus('conflict');
      return;
    }
    if (modules.includes('finance') && financePublicationRef.current) {
      // Leave the intent queued. Completion/recovery schedules the latest state.
      syncTimerRef.current = null;
      return;
    }
    queuedModulesRef.current.clear();
    queuedStateRef.current = null;
    syncTimerRef.current = null;
    if (!cloudSyncConfigured || !user || modules.length === 0 || storageUserIdRef.current !== user.uid) return;
    const sessionEpoch = cloudSessionEpochRef.current;
    const isCurrentSession = () => sessionEpoch === cloudSessionEpochRef.current
      && cloudUserRef.current?.uid === user.uid && storageUserIdRef.current === user.uid;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');

    const expectedRevisions = optimisticRevisionMap();
    const financePublication = modules.includes('finance') ? Symbol('finance-publication') : null;
    if (financePublication) financePublicationRef.current = financePublication;
    let financeReadyToFlush = false;
    if (modules.includes('finance')) traceFinanceSync('publish-start', { expectedRevision: expectedRevisions.finance });
    void writeCloudModulesGuarded(user.uid, currentState, modules, deviceIdRef.current, expectedRevisions, tombstonesRef.current)
      .then((res) => {
        if (!isCurrentSession()) { void res.completion.catch(() => {}); return; }
        if (res.incompatibleProtocol) {
          if (modules.includes('resale')) {
            blockResaleConflict(modules, 'Mi negocio requiere una versión más reciente de Celestian para sincronizar.', undefined, undefined, expectedRevisions);
            return;
          }
          // Protocolo remoto superior detectado: cliente incompatible, abortar de forma fail-closed
          setSyncStatus('locked');
          res.incompatibleModules?.forEach((mod) => failedSyncModulesRef.current.add(mod));
          setFailedSyncModules([...failedSyncModulesRef.current]);
          return;
        }

        if (res.diverged) {
          if (modules.includes('resale')) {
            blockResaleConflict(modules, 'La revisión remota cambió antes de publicar.', undefined, undefined, expectedRevisions);
            return;
          }
          // Divergencia de versión remota detectada: abortar escritura para no sobreescribir silenciosamente
          (res.divergedModules || modules).forEach((mod) => {
            delete pendingRevisionsRef.current[mod];
          });
          consecutiveDivergenceCountRef.current += 1;
          setSyncStatus('conflict');
          // Fail-safe: si se detectan divergencias repetidas (>= 3), NO reencolar indefinidamente.
          // Esperar a que onSnapshot entregue el estado remoto o el usuario tome una acción.
          if (consecutiveDivergenceCountRef.current < 3) {
            modules.forEach((mod) => queuedModulesRef.current.add(mod));
          } else {
            console.warn('[CloudSync] Divergencia repetida (>=3). Pausando reintentos automáticos de guardado.');
          }
          return;
        }

        consecutiveDivergenceCountRef.current = 0;

        res.writes.forEach((write) => {
          pendingRevisionsRef.current[write.module] = [...(pendingRevisionsRef.current[write.module] || []), write.revision];
        });

        return res.completion
          .then(() => {
            if (isImportingBackupRef.current) {
              isImportingBackupRef.current = false;
              if (importBackupTimeoutRef.current !== null) {
                window.clearTimeout(importBackupTimeoutRef.current);
                importBackupTimeoutRef.current = null;
              }
            }
            if (!isCurrentSession()) return;
            retryAttemptRef.current = 0;
            consecutiveDivergenceCountRef.current = 0;
            setSyncErrorMessage(null);
            if (retryTimeoutRef.current !== null) {
              window.clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = null;
            }
            res.writes.forEach((write) => {
              failedSyncModulesRef.current.delete(write.module);
              if (write.module !== 'finance') baselineDataRef.current[write.module] = syncModuleData(currentState, write.module);
            });
            // Only the corresponding server head establishes the baseline.
            // An older completion must not overwrite a newer listener baseline.
            financeReadyToFlush = true;
            if (financePublication) financeRecoveryAttemptsRef.current = 0;
            if (modules.includes('finance')) traceFinanceSync('publish-complete', { writes: res.writes });
            saveCloudBaselineData(user.uid, baselineDataRef.current);
            setFailedSyncModules([...failedSyncModulesRef.current]);
            if (failedSyncModulesRef.current.size === 0 && !resaleWriteBlockedRef.current) {
              const status = cloudStatusWithLocalChanges(navigator.onLine ? 'synced' : 'offline', {
                queued: queuedModulesRef.current.size > 0,
                pending: Object.keys(pendingRevisionsRef.current).some(module => !!pendingRevisionsRef.current[module as SyncModuleKey]?.length),
                failed: failedSyncModulesRef.current.size > 0,
                blocked: gymWriteBlockedRef.current || resaleWriteBlockedRef.current || financeWriteBlockedRef.current,
              });
              setSyncStatus(status);
              if (status === 'synced') setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
          })
          .catch(async (err) => {
            if (isImportingBackupRef.current) {
              isImportingBackupRef.current = false;
              if (importBackupTimeoutRef.current !== null) {
                window.clearTimeout(importBackupTimeoutRef.current);
                importBackupTimeoutRef.current = null;
              }
            }
            if (!isCurrentSession() || err instanceof CloudSyncSuspendedError || isCloudSyncSuspended()) return;
            if (err instanceof CloudRevisionConflict) {
              traceFinanceSync('publish-stale', { writes: res.writes });
              res.writes.forEach((write) => {
                const remaining = (pendingRevisionsRef.current[write.module] || []).filter((revision) => revision !== write.revision);
                if (remaining.length) pendingRevisionsRef.current[write.module] = remaining;
                else delete pendingRevisionsRef.current[write.module];
                queuedModulesRef.current.add(write.module);
              });
              if (financePublication) {
                setSyncStatus(navigator.onLine ? 'connecting' : 'offline');
                try {
                  const recoveryAttempt = ++financeRecoveryAttemptsRef.current;
                  const observedRevision = revisionsRef.current.finance;
                  const fresh = await fetchFreshCloudModules(user.uid);
                  if (!isCurrentSession() || financeWriteBlockedRef.current) return;
                  if (fresh.lockedModules.includes('finance') || fresh.corruptedModules.includes('finance') || !fresh.moduleData.finance || !fresh.remoteRevisions.finance) {
                    failedSyncModulesRef.current.add('finance');
                    setFailedSyncModules([...failedSyncModulesRef.current]);
                    setSyncStatus(fresh.lockedModules.includes('finance') ? 'locked' : 'error');
                    return;
                  }
                  // A listener may have processed a later commit while this read
                  // was decoding. Never roll its confirmed baseline back.
                  if (recoveryAttempt <= 3 && revisionsRef.current.finance !== observedRevision && revisionsRef.current.finance !== fresh.remoteRevisions.finance) {
                    financeReadyToFlush = true;
                    return;
                  }
                  for (const [id, timestamp] of Object.entries(fresh.tombstones)) {
                    tombstonesRef.current[id] = Math.max(tombstonesRef.current[id] || 0, Number(timestamp));
                  }
                  saveTombstones(user.uid, tombstonesRef.current);
                  const result = reconcileFinancePublication(stateRef.current, fresh.moduleData.finance, fresh.remoteRevisions.finance, baselineDataRef.current.finance, tombstonesRef.current);
                  if (result.conflicts.length) {
                    blockFinanceConflict(buildStateFromModules({ finance: fresh.moduleData.finance }), fresh.remoteRevisions, result.conflicts);
                    return;
                  }
                  if (recoveryAttempt > 3) {
                    blockFinanceConflict(buildStateFromModules({ finance: fresh.moduleData.finance }), fresh.remoteRevisions, [{
                      id: 'conflict-finance-publication-churn', module: 'finance', entityType: 'entity', entityId: 'finance',
                      label: 'Finanzas cambió repetidamente durante la publicación; revisá ambas versiones.',
                      localSummary: 'Cambios locales conservados', remoteSummary: 'Última versión del servidor conservada',
                      localValue: syncModuleData(stateRef.current, 'finance'), remoteValue: fresh.moduleData.finance,
                    }]);
                    return;
                  }
                  if (!applyRemoteState(result.state, user.uid)) return;
                  baselineDataRef.current.finance = result.confirmed.data;
                  persistRevisionMap(user.uid, { ...revisionsRef.current, finance: result.confirmed.revision });
                  persistBaselines(user.uid, { ...baselinesRef.current, finance: result.confirmed.fingerprint });
                  saveCloudBaselineData(user.uid, baselineDataRef.current);
                  failedSyncModulesRef.current.delete('finance');
                  setFailedSyncModules([...failedSyncModulesRef.current]);
                  if (!result.needsUpload) queuedModulesRef.current.delete('finance');
                  traceFinanceSync('stale-reconciled', { remoteRevision: result.confirmed.revision, needsUpload: result.needsUpload });
                  financeReadyToFlush = true;
                  setSyncStatus(cloudStatusWithLocalChanges(navigator.onLine ? 'synced' : 'offline', {
                    queued: queuedModulesRef.current.size > 0, pending: Object.keys(pendingRevisionsRef.current).some(module => Boolean(pendingRevisionsRef.current[module as SyncModuleKey]?.length)),
                    failed: failedSyncModulesRef.current.size > 0, blocked: gymWriteBlockedRef.current || resaleWriteBlockedRef.current || financeWriteBlockedRef.current,
                  }));
                } catch (recoveryError) {
                  if (!isCurrentSession()) return;
                  console.error('[CloudSync] No se pudo reconciliar la publicación financiera rechazada:', recoveryError);
                  failedSyncModulesRef.current.add('finance');
                  setFailedSyncModules([...failedSyncModulesRef.current]);
                  setSyncStatus(navigator.onLine ? 'error' : 'offline');
                }
                return;
              }
              setSyncStatus('conflict');
              return;
            }
            if (err instanceof CloudProtocolConflict) {
              err.modules.forEach((module) => failedSyncModulesRef.current.add(module));
              setFailedSyncModules([...failedSyncModulesRef.current]);
              setSyncStatus('locked');
              return;
            }
            if (err instanceof ResaleRevisionConflict || err instanceof ResaleProtocolConflict) {
              if (cloudUserRef.current?.uid !== user.uid) return;
              res.writes.forEach((write) => {
                const remaining = (pendingRevisionsRef.current[write.module] || []).filter((revision) => revision !== write.revision);
                if (remaining.length) pendingRevisionsRef.current[write.module] = remaining;
                else delete pendingRevisionsRef.current[write.module];
                queuedModulesRef.current.add(write.module);
              });
              blockResaleConflict(res.writes.map((write) => write.module), err.message, undefined, undefined, expectedRevisions);
              return;
            }
            if (isFirestorePermissionDenied(err) && res.writes.some((write) => write.module === 'resale')) {
              res.writes.forEach((write) => {
                const remaining = (pendingRevisionsRef.current[write.module] || []).filter((revision) => revision !== write.revision);
                if (remaining.length) pendingRevisionsRef.current[write.module] = remaining;
                else delete pendingRevisionsRef.current[write.module];
              });
              blockResaleConflict(res.writes.map((write) => write.module), 'Firestore rechazó la publicación. La causa puede ser permisos, reglas o un formato incompatible; se necesita revisar antes de volver a subirla.', undefined, undefined, expectedRevisions);
              return;
            }
            console.error('[CloudSync] Batch commit failed:', err);
            setSyncErrorMessage(err instanceof Error ? err.message : String(err || ''));
            res.writes.forEach((write) => {
              const remaining = (pendingRevisionsRef.current[write.module] || []).filter((revision) => revision !== write.revision);
              if (remaining.length) pendingRevisionsRef.current[write.module] = remaining;
              else delete pendingRevisionsRef.current[write.module];
              failedSyncModulesRef.current.add(write.module);
              queuedModulesRef.current.add(write.module);
            });
            queuedStateRef.current = currentState;
            setFailedSyncModules([...failedSyncModulesRef.current]);
            setSyncStatus(navigator.onLine ? 'error' : 'offline');

            if (retryAttemptRef.current < 5) {
              const delay = Math.min(30000, 1000 * Math.pow(2, retryAttemptRef.current));
              retryAttemptRef.current += 1;
              if (retryTimeoutRef.current !== null) window.clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = window.setTimeout(() => {
                if (queuedModulesRef.current.size > 0 && navigator.onLine) {
                  flushCloudSave();
                }
              }, delay);
            }
          });
      })
      .catch((err) => {
        if (!isCurrentSession() || err instanceof CloudSyncSuspendedError || isCloudSyncSuspended()) return;
        console.error('[CloudSync] Guarded write failed:', err);
        setSyncErrorMessage(err instanceof Error ? err.message : String(err || ''));
        if (err instanceof ResaleProtocolConflict && modules.includes('resale')) {
          blockResaleConflict(modules, err.message, undefined, undefined, expectedRevisions);
          return;
        }
        if (modules.includes('resale') && isFirestorePermissionDenied(err)) {
          blockResaleConflict(modules, 'Firestore rechazó la publicación. La causa puede ser permisos, reglas o un formato incompatible; se necesita revisar antes de volver a subirla.', undefined, undefined, expectedRevisions);
          return;
        }
        if (err && String(err.message).includes('Divergencia')) {
          if (modules.includes('resale')) {
            blockResaleConflict(modules, String(err.message), undefined, undefined, expectedRevisions);
            return;
          }
          modules.forEach((mod) => {
            delete pendingRevisionsRef.current[mod];
          });
          consecutiveDivergenceCountRef.current += 1;
          setSyncStatus('conflict');
          if (consecutiveDivergenceCountRef.current < 3) {
            modules.forEach((mod) => queuedModulesRef.current.add(mod));
          }
          return;
        }
        modules.forEach((mod) => {
          failedSyncModulesRef.current.add(mod);
          queuedModulesRef.current.add(mod);
        });
        queuedStateRef.current = currentState;
        setFailedSyncModules([...failedSyncModulesRef.current]);
        setSyncStatus(navigator.onLine ? 'error' : 'offline');

        if (retryAttemptRef.current < 5) {
          const delay = Math.min(30000, 1000 * Math.pow(2, retryAttemptRef.current));
          retryAttemptRef.current += 1;
          if (retryTimeoutRef.current !== null) window.clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (queuedModulesRef.current.size > 0 && navigator.onLine) {
              flushCloudSave();
            }
          }, delay);
        }
      })
      .finally(() => {
        if (!isCurrentSession() || !financePublication || financePublicationRef.current !== financePublication) return;
        financePublicationRef.current = null;
        if (financeReadyToFlush && queuedModulesRef.current.size > 0 && !financeWriteBlockedRef.current && !resaleWriteBlockedRef.current && !gymWriteBlockedRef.current) {
          queueCloudSave(stateRef.current, [...queuedModulesRef.current]);
        }
      });
  };

  const queueCloudSave = (nextState: LifeOSState, modules: SyncModuleKey[]) => {
    const runtime = getCloudRuntime();
    if (!runtime || runtime.cloudSync.isCloudSyncSuspended()) return;
    const user = cloudUserRef.current;
    if (!cloudSyncConfigured || !user || modules.length === 0 || storageUserIdRef.current !== user.uid) return;
    if (nextState.resale.commercial?.business && modules.some(module => module === 'resale' || module === 'finance')) {
      modules = [...new Set<SyncModuleKey>([...modules, 'resale', 'finance'])];
    }
    modules.forEach((module) => queuedModulesRef.current.add(module));
    queuedStateRef.current = nextState;
    if (financeWriteBlockedRef.current && queuedModulesRef.current.has('finance')) {
      setSyncStatus('conflict');
      return;
    }
    if (gymWriteBlockedRef.current && queuedModulesRef.current.has('gym')) {
      setSyncStatus('conflict');
      return;
    }
    if (resaleWriteBlockedRef.current && queuedModulesRef.current.has('resale')) {
      const record = resaleConflictRecordRef.current;
      if (record && queuedModulesRef.current.has('finance') && !record.modules.includes('finance')) {
        blockResaleConflict([...record.modules, 'finance'], record.diagnostic);
      } else {
        setSyncStatus('conflict');
      }
      return;
    }
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(flushCloudSave, 400);
  };

  // Apply locally first; Celestian remains usable even before the cloud acknowledges the change.
  const updateState = (updater: (draft: LifeOSState) => void, commercialCommand = false) => {
    const previous = stateRef.current;
    const draft = structuredClone(previous) as LifeOSState;
    updater(draft);
    const runtime = getCloudRuntime();
    if (financeWriteBlockedRef.current && runtime && runtime.syncModel.syncModuleFingerprint(previous, 'finance') !== runtime.syncModel.syncModuleFingerprint(draft, 'finance')) {
      showToast('Revisá el conflicto de Finanzas antes de registrar otro movimiento. Conservá el formulario para reintentar.', 'error');
      return false;
    }
    if (commercialCommand) {
      if (!cloudUserRef.current || storageUserIdRef.current !== cloudUserRef.current.uid
        || !runtime?.cryptoCore.cryptoSession.isUnlocked(cloudUserRef.current.uid) || resaleWriteBlockedRef.current)
        throw new Error('Mi negocio requiere una sesión desbloqueada y sin conflictos pendientes.');
      assertCommercialTransition(previous, draft);
    }
    if (!commercialCommand && changesStoredCommercial(previous, draft)) {
      showToast('Mi negocio conserva datos comerciales que requieren revisión; esta acción no puede reemplazarlos.', 'error');
      return false;
    }
    stampGymMutation(previous.gym, draft.gym, deviceIdRef.current);
    if (resaleResolutionInProgressRef.current && runtime && runtime.syncModel.changedSyncModules(previous, draft).some((module) => module === 'resale' || module === 'finance')) {
      showToast('Esperá a que termine la revisión de Mi negocio antes de cambiar sus operaciones o Finanzas.', 'info');
      return false;
    }

    if (!commercialCommand && previous.resale.commercial?.business) {
      const validated = validateDurableCommercial(previous.resale.commercial, { finance: draft.finance, resaleInventory: draft.resale.inventory });
      if (!validated.valid) {
        showToast('Este cambio alteraría una operación comercial vinculada. Revisá Mi negocio antes de modificar Finanzas.', 'error');
        return false;
      }
      const links = previous.resale.commercial.business.financeLinks;
      for (const link of links) {
        if (JSON.stringify(previous.finance.transactions.find(tx => tx.id === link.transactionId)) !==
          JSON.stringify(draft.finance.transactions.find(tx => tx.id === link.transactionId))) {
          showToast('Este movimiento pertenece a Mi negocio. Conservá su historial y corregí la operación desde ese módulo.', 'error');
          return false;
        }
      }
    }
    const saved = saveStoredState(draft, storageUserIdRef.current, commercialCommand ? previous : undefined);
    if (!saved) {
      showToast('No se pudo guardar en este dispositivo. La acción quedó detenida; conservá el contenido y reintentá.', 'error');
      return false;
    }
    if (cloudUserRef.current && runtime) {
      const deletedIds = runtime.syncMerge.detectDeletedEntityIds(previous, draft);
      const restoredIds = runtime.syncMerge.detectRestoredEntityIds(previous, draft);
      if (deletedIds.length > 0 || restoredIds.length > 0) {
        const currentTombstones = tombstonesRef.current;
        let tombstonesChanged = false;
        if (deletedIds.length > 0) {
          const deletionTime = Date.now();
          for (const id of deletedIds) {
            currentTombstones[id] = nextFinanceDeletionTimestamp(previous, id, deletionTime);
          }
          tombstonesChanged = true;
        }
        for (const id of restoredIds) {
          if (id in currentTombstones) {
            delete currentTombstones[id];
            tombstonesChanged = true;
          }
        }
        if (tombstonesChanged) {
          runtime.syncMerge.saveTombstones(cloudUserRef.current.uid, currentTombstones);
        }
      }
    }
    stateRef.current = draft;
    setStateObj(() => ({
      state: draft,
      storageBackend: 'localStorage',
    }));

    if (readStoredCommercial(draft).status === 'blocked') {
      if (cloudUserRef.current) blockResaleConflict(['resale'], 'Los datos comerciales no superan la validación; permanecen guardados localmente.');
      else {
        resaleWriteBlockedRef.current = true;
        setResaleConflictReason('Los datos comerciales no superan la validación; permanecen guardados localmente.');
      }
    }

    if (tabChannelRef.current && storageUserIdRef.current) {
      try {
        tabChannelRef.current.postMessage({
          type: 'tab-state-update',
          userId: storageUserIdRef.current,
          state: draft,
        });
      } catch {
        // ignore broadcast serialization error
      }
    }

    if (cloudUserRef.current && runtime) {
      queueCloudSave(draft, runtime.syncModel.changedSyncModules(previous, draft));
    }
    return saved;
  };
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;

  // A foreground heartbeat distinguishes an uninterrupted study block from a
  // machine that slept or a tab that was closed. The active session stays local.
  const studySessionId = state.study?.activeSession?.id;
  const studySessionStatus = state.study?.activeSession?.status;
  useEffect(() => {
    if (!studySessionId || studySessionStatus !== 'running') return;
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      const current = stateRef.current.study?.activeSession;
      const now = Date.now();
      if (!current || current.id !== studySessionId || current.status !== 'running') return;
      if (now - current.lastTickAt > 90_000 || now >= (current.endsAt ?? 0)) return;
      updateStateRef.current((draft) => {
        if (draft.study?.activeSession?.id === studySessionId) draft.study.activeSession.lastTickAt = now;
      });
    };
    const interval = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(interval);
  }, [studySessionId, studySessionStatus]);

  // Keep ambient study audio playing across view navigation while a focus session
  // is running, and guarantee immediate cleanup if the session pauses, ends,
  // Estudios is hidden, or global sound is muted.
  const isStudyModuleEnabled = isModuleEnabled(state, 'estudios');
  useEffect(() => {
    const isRunningSession = Boolean(studySessionId && studySessionStatus === 'running' && isStudyModuleEnabled);
    if (!isRunningSession && (isAmbientSessionAttached() || (currentView !== 'estudios' && isAnyAmbientNoisePlaying()))) {
      stopAllAmbientNoise();
    }
  }, [studySessionId, studySessionStatus, isStudyModuleEnabled, currentView]);

  useEffect(() => {
    const handleSoundPref = () => {
      if (!isSoundEnabled() && (isAnyAmbientNoisePlaying() || isAmbientSessionAttached())) {
        stopAllAmbientNoise();
      }
    };
    window.addEventListener('lifeos-sound-preference', handleSoundPref);
    return () => window.removeEventListener('lifeos-sound-preference', handleSoundPref);
  }, []);

  // Local-First post-paint cloud activation:
  // - Returning cloud users / OAuth redirects boot Firebase right after the first paint.
  // - First-visit / 100% local users defer chunk preload to post-LCP idle (~3s) and never
  //   initialize Firebase Auth until they interact with "Conectar con Google".
  useEffect(() => {
    if (!cloudSyncConfigured) return;
    let cancelled = false;

    if (hasPendingCloudSessionHint()) {
      let timerId: number | null = null;
      const rafId = window.requestAnimationFrame(() => {
        timerId = window.setTimeout(() => {
          if (cancelled) return;
          setCloudAuthBootRequested(true);
          void loadCloudRuntime()
            .then((runtime) => {
              if (!cancelled) setCloudRuntime(runtime);
            })
            .catch(() => {
              if (!cancelled) {
                setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'signed-out');
              }
            });
        }, 0);
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(rafId);
        if (timerId !== null) window.clearTimeout(timerId);
      };
    }

    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const delayId = window.setTimeout(() => {
      if (cancelled || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      const warm = () => {
        if (!cancelled && (typeof navigator === 'undefined' || navigator.onLine)) {
          void preloadCloudSync();
        }
      };
      if (typeof win.requestIdleCallback === 'function') {
        idleId = win.requestIdleCallback(warm, { timeout: 2000 });
      } else {
        warm();
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(delayId);
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
    };
  }, [cloudSyncConfigured]);

  useEffect(() => {
    if (!cloudSyncConfigured || !cloudAuthBootRequested || !cloudRuntime) return;
    const {
      cloudSync: {
        observeCloudUser,
        getLastCloudUserId,
        loadCloudRevisions,
        loadCloudBaselines,
        loadCloudBaselineData,
        markLastCloudUserId,
      },
      cryptoCore: { cryptoSession },
      deviceTrust: { tryUnlockWithDeviceTrust },
      syncMerge: { loadTombstones },
    } = cloudRuntime;
    setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting');
    return observeCloudUser((user) => {
      clearOAuthRedirectPending();
      const previousUser = cloudUserRef.current;

      // Si el usuario es el mismo (ej. renovación de credenciales o evento interno), solo actualizamos datos y evitamos reiniciar la sincronización
      if (user && previousUser && user.uid === previousUser.uid) {
        cloudUserRef.current = user;
        setCloudUser(user);
        return;
      }

      cloudSessionEpochRef.current += 1;
      const sessionEpoch = cloudSessionEpochRef.current;
      if (previousUser) cryptoSession.lock();
      cloudUserRef.current = user;
      pendingRevisionsRef.current = {};
      financePublicationRef.current = null;
      financeRecoveryAttemptsRef.current = 0;
      failedSyncModulesRef.current.clear();
      setFailedSyncModules([]);
      queuedModulesRef.current.clear();
      queuedStateRef.current = null;
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      if (retryTimeoutRef.current !== null) window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
      retryAttemptRef.current = 0;
      initializedUserRef.current = null;
      legacyReadUserRef.current = null;
      resaleWriteBlockedRef.current = false;
      gymWriteBlockedRef.current = false;
      financeWriteBlockedRef.current = false;
      setCloudConflict(null);
      resaleConflictRecordRef.current = null;
      setResaleRecoveryStatus('none');
      setResaleConflictReason('');

      if (user) {
        const lastUserId = getLastCloudUserId();
        const scoped = loadStoredState(user.uid);
        storageUserIdRef.current = user.uid;
        revisionsRef.current = loadCloudRevisions(user.uid);
        baselinesRef.current = loadCloudBaselines(user.uid);
        baselineDataRef.current = loadCloudBaselineData(user.uid);
        tombstonesRef.current = loadTombstones(user.uid);
        const recoveredConflict = loadResaleConflict(user.uid);
        if (recoveredConflict.status === 'loaded') {
          resaleConflictRecordRef.current = recoveredConflict.record;
          resaleWriteBlockedRef.current = true;
          recoveredConflict.record.modules.forEach((module) => queuedModulesRef.current.add(module));
          setResaleRecoveryStatus('saved');
          setResaleConflictReason(recoveredConflict.record.diagnostic);
        } else if (recoveredConflict.status !== 'none' && recoveredConflict.status !== 'resolved') {
          resaleWriteBlockedRef.current = true;
          setResaleRecoveryStatus('failed');
        }

        if (scoped.backend !== 'ninguno') {
          stateRef.current = scoped.state;
          setStateObj({ state: scoped.state, storageBackend: scoped.backend });
        } else if (!lastUserId || lastUserId === user.uid) {
          saveStoredState(stateRef.current, user.uid);
        } else {
          const cleanState = defaultState();
          saveStoredState(cleanState, user.uid);
          stateRef.current = cleanState;
          setStateObj({ state: cleanState, storageBackend: 'localStorage' });
        }

        if (readStoredCommercial(stateRef.current).status === 'blocked') {
          blockResaleConflict(['resale'], 'Los datos comerciales locales no superan la validación; permanecen guardados en este dispositivo.');
        }

        markLastCloudUserId(user.uid);
        setStorageUserId(user.uid);
        setCloudUser(user);
        setSyncStatus(resaleWriteBlockedRef.current ? 'conflict' : navigator.onLine ? 'connecting' : 'offline');

        // Pre-warm cryptoSession from device trust if enrolled
        if (!cryptoSession.isUnlocked(user.uid)) {
          void tryUnlockWithDeviceTrust(user.uid)
            .then((trustedMdek) => {
              if (trustedMdek && cloudSessionEpochRef.current === sessionEpoch && cloudUserRef.current?.uid === user.uid) {
                cryptoSession.setUnlocked(trustedMdek, user.uid);
              }
            })
            .catch((err) => {
              console.warn('[DeviceTrust] Pre-warm failed:', err);
            });
        }
        return;
      }

      storageUserIdRef.current = null;
      revisionsRef.current = {};
      baselinesRef.current = {};
      baselineDataRef.current = {};
      tombstonesRef.current = {};
      setStorageUserId(null);
      setCloudUser(null);
      setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'signed-out');
      if (previousUser) {
        const local = loadStoredState();
        stateRef.current = local.state;
        setStateObj({ state: local.state, storageBackend: local.backend });
      }
      if (readStoredCommercial(stateRef.current).status === 'blocked') {
        resaleWriteBlockedRef.current = true;
        setResaleConflictReason('Los datos comerciales locales no superan la validación; permanecen guardados en este dispositivo.');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncConfigured, cloudAuthBootRequested, cloudRuntime]);

  useEffect(() => {
    if (!cloudSyncConfigured || !cloudRuntime || !cloudUser || storageUserId !== cloudUser.uid) return;
    const {
      cloudSync: {
        CloudProtocolConflict,
        cloudStatusWithLocalChanges,
        isCloudPaired,
        markCloudPaired,
        readLegacyCloudState,
        saveCloudBaselineData,
        saveSyncRecoverySnapshot,
        subscribeCloudModules,
      },
      cryptoCore: { cryptoSession, decodeCloudModuleData },
      deviceTrust: { tryUnlockWithDeviceTrust },
      syncModel: {
        SYNC_MODULES,
        applySyncModule,
        buildStateFromModules,
        decideInitialSyncAction,
        extractPureModuleData,
        mergeSyncModuleWithConflicts,
        syncDataFingerprint,
        syncModuleData,
        syncModuleFingerprint,
      },
      syncMerge: { detectGymSessionConflicts, saveTombstones },
      financeSyncReconciliation: { reconcileFinancePublication },
      financeSnapshotIntegrity: { detectFinanceSnapshotRegression },
    } = cloudRuntime;
    conflictPendingRef.current = false;

    const storeRevisions = (next: SyncRevisionMap) => persistRevisionMap(cloudUser.uid, next);

    const uploadAll = (nextState: LifeOSState) => {
      queueCloudSave(nextState, [...SYNC_MODULES]);
    };

    const uploadModules = (nextState: LifeOSState, modules: SyncModuleKey[]) => {
      if (modules.length === 0) return;
      queueCloudSave(nextState, modules);
    };

    const reconcileInitialState = (
      remoteState: LifeOSState,
      remoteRevisions: SyncRevisionMap,
      needsMigration = false
    ) => {
      const localState = stateRef.current;
      const commercialDiagnostic = commercialHydrationBlock(localState, remoteState);
      if (commercialDiagnostic) {
        blockResaleConflict(['resale'], commercialDiagnostic,
          { resale: syncModuleData(remoteState, 'resale') }, remoteRevisions);
        return;
      }

      const hasKnownRevisions = Object.keys(revisionsRef.current).length > 0;
      const paired = isCloudPaired(cloudUser.uid) && hasKnownRevisions;
      const decision = decideInitialSyncAction({
        localState,
        remoteState,
        paired,
        knownRevisions: revisionsRef.current,
        baselines: baselinesRef.current,
        remoteRevisions,
        needsMigration,
      });

      if (decision.action === 'conflict_unpaired') {
        const changedModules = decision.changedModules;
        if (changedModules.includes('resale')) {
          const diagnostic =
            changedModules.length > 1
              ? 'Hay cambios distintos entre este dispositivo y la nube.'
              : 'Los datos locales y de la nube en Mi negocio difieren.';
          blockResaleConflict(
            changedModules,
            diagnostic,
            Object.fromEntries(changedModules.map((module) => [module, syncModuleData(remoteState, module)])),
            remoteRevisions
          );
          return;
        }
        if (!conflictPendingRef.current) {
          conflictPendingRef.current = true;
          if (changedModules.includes('gym')) gymWriteBlockedRef.current = true;
          setIsCloudConflictDismissed(false);
          setCloudConflict({
            remoteState,
            modules: changedModules,
            remoteRevisions,
            needsMigration,
            recommendedSide: 'cloud',
          });
          setSyncStatus('conflict');
        }
        return;
      }

      if (decision.action === 'reconcile_paired') {
        const localModules = decision.local;
        const conflictModules = decision.conflicts;
        if (decision.remote.includes('finance')) {
          const financeConflicts = detectFinanceSnapshotRegression(localState.finance, remoteState.finance, tombstonesRef.current);
          if (financeConflicts.length) {
            blockFinanceConflict(remoteState, remoteRevisions, financeConflicts);
            return;
          }
        }
        if (conflictModules.includes('resale')) {
          const diagnostic =
            conflictModules.length > 1
              ? 'Hay cambios distintos entre este dispositivo y la nube.'
              : 'Hay cambios simultáneos en Mi negocio que requieren revisión.';
          blockResaleConflict(
            conflictModules,
            diagnostic,
            Object.fromEntries(conflictModules.map((module) => [module, syncModuleData(remoteState, module)])),
            remoteRevisions
          );
          return;
        }
        const nextRevisions = { ...revisionsRef.current };
        const nextBaselines = { ...baselinesRef.current };
        const nextBaselineData = { ...baselineDataRef.current };
        let mergedState = localState;

        if (decision.remote.includes('gym')) {
          const gymConflicts = detectGymSessionConflicts(localState.gym, remoteState.gym, (baselineDataRef.current.gym as { gym: LifeOSState['gym'] } | undefined)?.gym, true);
          if (gymConflicts.length) {
            blockGymConflict(remoteState, remoteRevisions, gymConflicts);
            return;
          }
        }

        decision.remote.forEach((module) => {
          mergedState = applySyncModule(mergedState, module, syncModuleData(remoteState, module));
          nextRevisions[module] = remoteRevisions[module];
          nextBaselines[module] = syncModuleFingerprint(module === 'finance' ? remoteState : mergedState, module);
          nextBaselineData[module] = syncModuleData(module === 'finance' ? remoteState : mergedState, module);
        });

        const initialConflicts: SyncConflictItem[] = [];
        conflictModules.forEach((module) => {
          const { state: nextMerged, conflicts } = mergeSyncModuleWithConflicts(
            mergedState,
            module,
            syncModuleData(remoteState, module),
            baselineDataRef.current[module],
            tombstonesRef.current
          );
          mergedState = nextMerged;
          if (conflicts.length > 0) {
            initialConflicts.push(...conflicts);
          }
          nextRevisions[module] = remoteRevisions[module];
          nextBaselines[module] = syncModuleFingerprint(remoteState, module);
          nextBaselineData[module] = syncModuleData(remoteState, module);
        });

        if (initialConflicts.length > 0) {
          if (initialConflicts.some((conflict) => conflict.module === 'finance')) financeWriteBlockedRef.current = true;
          if (initialConflicts.some((conflict) => conflict.module === 'gym')) gymWriteBlockedRef.current = true;
          saveSyncRecoverySnapshot(cloudUser.uid, 'local', localState);
          saveSyncRecoverySnapshot(cloudUser.uid, 'remote', remoteState);
          saveSyncRecoverySnapshot(cloudUser.uid, 'base', buildStateFromModules(baselineDataRef.current));
          setIsCloudConflictDismissed(false);
          setCloudConflict({
            remoteState,
            modules: conflictModules,
            remoteRevisions,
            conflicts: initialConflicts,
            recommendedSide: 'local',
          });
          setSyncStatus('conflict');
          return;
        }
        if (!applyRemoteState(mergedState, cloudUser.uid)) return;
        baselineDataRef.current = nextBaselineData;

        storeRevisions(nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
        markCloudPaired(cloudUser.uid);
        initializedUserRef.current = cloudUser.uid;

        const modulesToUpload = [...new Set([...localModules, ...conflictModules])];
        if (modulesToUpload.length > 0) {
          uploadModules(mergedState, modulesToUpload);
        } else {
          setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        }
        return;
      }

      if (decision.action === 'download_remote') {
        if (!decision.cleanDeviceAutoDownload) {
          const financeConflicts = detectFinanceSnapshotRegression(localState.finance, remoteState.finance, tombstonesRef.current);
          if (financeConflicts.length) {
            blockFinanceConflict(remoteState, remoteRevisions, financeConflicts);
            return;
          }
          const gymConflicts = detectGymSessionConflicts(localState.gym, remoteState.gym, (baselineDataRef.current.gym as { gym: LifeOSState['gym'] } | undefined)?.gym, true);
          if (gymConflicts.length) {
            blockGymConflict(remoteState, remoteRevisions, gymConflicts);
            return;
          }
        }
        if (!applyRemoteState(remoteState, cloudUser.uid)) return;
        if (needsMigration) uploadAll(remoteState);
        else setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } else if (decision.action === 'upload_local') {
        uploadAll(localState);
      } else {
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      }

      const baselineState = decision.action === 'upload_local' ? localState : remoteState;
      storeRevisions(remoteRevisions);
      persistBaselines(cloudUser.uid, Object.fromEntries(SYNC_MODULES.map((module) => [module, syncModuleFingerprint(baselineState, module)])) as SyncBaselineMap);
      saveCloudBaselineData(cloudUser.uid, Object.fromEntries(SYNC_MODULES.map((module) => [module, syncModuleData(baselineState, module)])));
      markCloudPaired(cloudUser.uid);
      initializedUserRef.current = cloudUser.uid;
    };

    let snapshotSeq = 0;
    let active = true;
    const sessionEpoch = cloudSessionEpochRef.current;
    const isCurrentSession = () => active && sessionEpoch === cloudSessionEpochRef.current
      && cloudUserRef.current?.uid === cloudUser.uid && storageUserIdRef.current === cloudUser.uid;

    const unsubscribe = subscribeCloudModules(cloudUser.uid, {
      onSnapshot: (snapshot) => {
        if (!isCurrentSession() || isImportingBackupRef.current) return;
        snapshotSeq += 1;
        const currentSeq = snapshotSeq;

        void (async () => {
          const nextStatus: CloudSyncStatus = snapshot.pendingWrites
            ? navigator.onLine ? 'saving' : 'offline'
            : navigator.onLine ? 'synced' : 'offline';

          let sessionKey = cryptoSession.getKey(cloudUser.uid);
          if (!sessionKey) {
            try {
              const trustedMdek = await tryUnlockWithDeviceTrust(cloudUser.uid);
              if (!isCurrentSession() || currentSeq !== snapshotSeq) return;
              if (trustedMdek) {
                cryptoSession.setUnlocked(trustedMdek, cloudUser.uid);
                sessionKey = trustedMdek;
              }
            } catch (trustErr) {
              console.warn('[DeviceTrust] Error al auto-desbloquear con credencial de dispositivo:', trustErr);
            }
          }

          // 1. Decodificar todos los módulos con el adapter dual
          type DecodedHead = {
            module: SyncModuleKey;
            data: unknown;
            revision: string;
            parentRevision: string | null;
            deviceId: string;
            clientUpdatedAt: number;
            fromCache: boolean;
            pendingWrites: boolean;
          };

          const decodedHeads: DecodedHead[] = [];
          let hasLockedModule = false;
          let hasCorruptedModule = false;

          for (const head of snapshot.heads) {
            if (head.module === 'resale' && head.commercialProtocolVersion !== undefined && head.commercialProtocolVersion !== 1) {
              blockResaleConflict(['resale', 'finance'], 'Esta versión de Mi negocio no reconoce el formato remoto. Actualizá la aplicación; la copia local permanece intacta.');
              return;
            }
            const decodeRes = await decodeCloudModuleData(head.data, head.module, cloudUser.uid, sessionKey);
            if (!isCurrentSession() || currentSeq !== snapshotSeq) return;

            if (decodeRes.mode === 'locked') {
              hasLockedModule = true;
              failedSyncModulesRef.current.add(head.module);
              continue;
            }

            if (decodeRes.mode === 'corrupted') {
              // Sanitized logging: log generic reason without leaking ciphertext, keys or plaintexts
              console.error(`[CryptoSync] Error de integridad al decodificar módulo “${head.module}”: ${decodeRes.reasonCode || 'DECRYPT_FAILED'}`);
              hasCorruptedModule = true;
              failedSyncModulesRef.current.add(head.module);
              continue;
            }

            decodedHeads.push({
              module: head.module,
              data: decodeRes.data,
              revision: head.revision,
              parentRevision: head.parentRevision,
              deviceId: head.deviceId,
              clientUpdatedAt: head.clientUpdatedAt,
              fromCache: head.fromCache,
              pendingWrites: head.pendingWrites,
            });
          }

          // Anti-stale / concurrency guard: if a newer snapshot arrived while async decrypt was executing, ignore this stale result
          if (!isCurrentSession() || currentSeq !== snapshotSeq) {
            return;
          }

          if (hasLockedModule) {
            setFailedSyncModules([...failedSyncModulesRef.current]);
            setSyncStatus('locked');
            setSyncErrorMessage('Desbloqueá la sesión para sincronizar módulos protegidos');
            return;
          }

          if (hasCorruptedModule) {
            setFailedSyncModules([...failedSyncModulesRef.current]);
            setSyncStatus('error');
            return;
          }

          if (resaleWriteBlockedRef.current) {
            if (resaleResolutionInProgressRef.current) return;
            const affected = resaleConflictRecordRef.current?.modules ?? ['resale'];
            const relevantHeads = decodedHeads.filter((head) => affected.includes(head.module));
            if (relevantHeads.length > 0) {
              blockResaleConflict(affected, resaleConflictRecordRef.current?.diagnostic ?? 'Conflicto de revisión pendiente de resolución.',
                Object.fromEntries(relevantHeads.map((head) => [head.module, extractPureModuleData(head.data)])),
                Object.fromEntries(relevantHeads.map((head) => [head.module, head.revision])) as SyncRevisionMap);
            } else {
              setSyncStatus('conflict');
            }
            return;
          }

          if (gymWriteBlockedRef.current) {
            setSyncStatus('conflict');
            return;
          }
          if (financeWriteBlockedRef.current) {
            setSyncStatus('conflict');
            return;
          }

          // Initial hydration needs deletion evidence too; it used to discard
          // the encrypted payload's tombstones before deciding to replace data.
          for (const head of decodedHeads) {
            const markers = (head.data as { _tombstones?: Record<string, number> } | null)?._tombstones;
            for (const [id, timestamp] of Object.entries(markers || {})) {
              if (Number.isFinite(timestamp) && timestamp > (tombstonesRef.current[id] || 0)) tombstonesRef.current[id] = timestamp;
            }
          }
          saveTombstones(cloudUser.uid, tombstonesRef.current);

          if (initializedUserRef.current !== cloudUser.uid) {
            if (snapshot.fromCache && navigator.onLine) {
              setSyncStatus('connecting');
              return;
            }

            if (decodedHeads.length === 0) {
              if (legacyReadUserRef.current === cloudUser.uid) return;
              legacyReadUserRef.current = cloudUser.uid;
              void readLegacyCloudState(cloudUser.uid)
                .then((legacyState) => {
                  if (!isCurrentSession()) return;
                  if (legacyState) reconcileInitialState(legacyState, {}, true);
                  else reconcileInitialState(defaultState(), {});
                })
                .catch(() => setSyncStatus(navigator.onLine ? 'error' : 'offline'));
              return;
            }

            const moduleData = Object.fromEntries(decodedHeads.map((head) => [head.module, extractPureModuleData(head.data)]));
            const remoteRevisions = Object.fromEntries(decodedHeads.map((head) => [head.module, head.revision])) as SyncRevisionMap;
            reconcileInitialState(buildStateFromModules(moduleData), remoteRevisions);
            return;
          }

          let nextState = stateRef.current;
          const nextRevisions = { ...revisionsRef.current };
          const nextBaselines = { ...baselinesRef.current };
          const modulesToUpload: SyncModuleKey[] = [];
          let appliedRemote = false;

          for (const head of decodedHeads) {
            if (head.data && typeof head.data === 'object' && '_tombstones' in head.data) {
              const remoteTombstones = (head.data as any)._tombstones as Record<string, number>;
              if (remoteTombstones && typeof remoteTombstones === 'object') {
                let tombChanged = false;
                for (const [id, ts] of Object.entries(remoteTombstones)) {
                  if (typeof ts === 'number' && (!tombstonesRef.current[id] || tombstonesRef.current[id] < ts)) {
                    tombstonesRef.current[id] = ts;
                    tombChanged = true;
                  }
                }
                if (tombChanged && cloudUserRef.current) {
                  saveTombstones(cloudUserRef.current.uid, tombstonesRef.current);
                }
              }
            }

            const pureHeadData = extractPureModuleData(head.data);
            if (head.module === 'finance') traceFinanceSync('snapshot', { remoteRevision: head.revision, remoteIds: (pureHeadData as { finance: LifeOSState['finance'] }).finance.transactions.map(tx => tx.id), fromCache: head.fromCache, pendingWrites: head.pendingWrites });
            const pendingRevisions = pendingRevisionsRef.current[head.module] || [];
            const knownRevision = nextRevisions[head.module] || null;

            const pendingIndex = pendingRevisions.indexOf(head.revision);
            if (pendingIndex >= 0) {
              if (!head.pendingWrites) {
                const remaining = pendingRevisions.slice(pendingIndex + 1);
                if (remaining.length) pendingRevisionsRef.current[head.module] = remaining;
                else delete pendingRevisionsRef.current[head.module];
                nextRevisions[head.module] = head.revision;
                nextBaselines[head.module] = syncDataFingerprint(pureHeadData);
                baselineDataRef.current[head.module] = pureHeadData;
                failedSyncModulesRef.current.delete(head.module);
                setFailedSyncModules([...failedSyncModulesRef.current]);
              }
              continue;
            }

            if (knownRevision === head.revision) {
              if (!nextBaselines[head.module]) {
                nextBaselines[head.module] = syncDataFingerprint(pureHeadData);
                baselineDataRef.current[head.module] = pureHeadData;
              }
              continue;
            }
            if (head.module === 'resale' && pendingRevisions.length > 0) {
              blockResaleConflict([...queuedModulesRef.current, ...Object.keys(pendingRevisionsRef.current) as SyncModuleKey[], 'resale'], 'La revisión remota cambió durante una publicación.',
                { resale: pureHeadData }, { resale: head.revision });
              return;
            }
            // Caso A: Si el contenido local y remoto es semánticamente idéntico,
            // adoptar la revisión remota de inmediato. No hay conflicto real, evita
            // 3-way merges espurios y repara revisiones desfasadas (quiescencia garantizada).
            const localFingerprint = syncModuleFingerprint(nextState, head.module);
            const remoteFingerprint = syncDataFingerprint(pureHeadData);
            if (localFingerprint === remoteFingerprint) {
              nextRevisions[head.module] = head.revision;
              nextBaselines[head.module] = remoteFingerprint;
              baselineDataRef.current[head.module] = pureHeadData;
              failedSyncModulesRef.current.delete(head.module);
              continue;
            }

            // Known heads and our own acknowledgements do not replace local data.
            // Validate commercial hydration only for an actual incoming change;
            // an older acknowledgement may arrive while the next sale is queued.
            if (head.module === 'resale') {
              const incoming = applySyncModule(nextState, 'resale', pureHeadData);
              const diagnostic = commercialHydrationBlock(nextState, incoming);
              if (diagnostic) {
                blockResaleConflict([...queuedModulesRef.current, 'resale'], diagnostic,
                  { resale: pureHeadData }, { resale: head.revision });
                return;
              }
            }

            const localDirty = nextBaselines[head.module]
              ? localFingerprint !== nextBaselines[head.module]
              : false;

            if (pendingRevisions.length === 0 && !localDirty) {
              if (head.module === 'finance') {
                const financeConflicts = detectFinanceSnapshotRegression(nextState.finance, (pureHeadData as { finance: LifeOSState['finance'] }).finance, tombstonesRef.current);
                if (financeConflicts.length) {
                  blockFinanceConflict(buildStateFromModules({ finance: pureHeadData }), { finance: head.revision }, financeConflicts);
                  return;
                }
              }
              if (head.module === 'gym') {
                const gymConflicts = detectGymSessionConflicts(nextState.gym, (pureHeadData as { gym: LifeOSState['gym'] }).gym,
                  (baselineDataRef.current.gym as { gym: LifeOSState['gym'] } | undefined)?.gym, true);
                if (gymConflicts.length) {
                  blockGymConflict(buildStateFromModules({ gym: pureHeadData }), { gym: head.revision }, gymConflicts);
                  return;
                }
              }
              nextState = applySyncModule(nextState, head.module, pureHeadData);
              nextRevisions[head.module] = head.revision;
              nextBaselines[head.module] = remoteFingerprint;
              baselineDataRef.current[head.module] = pureHeadData;
              appliedRemote = true;
              continue;
            }

            // Concurrent modification: perform 3-way merge with conflict detection!
            const { state: mergedWithModule, conflicts: moduleConflicts } = head.module === 'finance'
              ? reconcileFinancePublication(nextState, pureHeadData, head.revision, baselineDataRef.current.finance, tombstonesRef.current)
              : mergeSyncModuleWithConflicts(
              nextState,
              head.module,
              pureHeadData,
              baselineDataRef.current[head.module],
              tombstonesRef.current
            );

            if (moduleConflicts.length > 0) {
              if (head.module === 'finance') {
                blockFinanceConflict(buildStateFromModules({ finance: pureHeadData }), { finance: head.revision }, moduleConflicts);
                return;
              }
              if (head.module === 'resale') {
                blockResaleConflict([...queuedModulesRef.current, 'resale'], 'La mezcla de Mi negocio tiene conflictos.',
                  { resale: pureHeadData }, { resale: head.revision });
                return;
              }
              // Conflicto real detectado: no sobreescribir silenciosamente
              const remoteStateBuilt = buildStateFromModules({ [head.module]: pureHeadData });
              if (head.module === 'gym') {
                blockGymConflict(remoteStateBuilt, { gym: head.revision }, moduleConflicts);
                return;
              }
              const baseStateBuilt = baselineDataRef.current[head.module]
                ? buildStateFromModules({ [head.module]: baselineDataRef.current[head.module] })
                : undefined;

              saveSyncRecoverySnapshot(cloudUser.uid, 'local', stateRef.current);
              saveSyncRecoverySnapshot(cloudUser.uid, 'remote', remoteStateBuilt);
              if (baseStateBuilt) saveSyncRecoverySnapshot(cloudUser.uid, 'base', baseStateBuilt);

              setIsCloudConflictDismissed(false);
              setCloudConflict({
                remoteState: remoteStateBuilt,
                modules: [head.module],
                remoteRevisions: { [head.module]: head.revision },
                conflicts: moduleConflicts,
                recommendedSide: 'local',
              });
              setSyncStatus('conflict');
              return;
            }

            nextState = mergedWithModule;
            nextRevisions[head.module] = head.revision;
            nextBaselines[head.module] = remoteFingerprint;
            baselineDataRef.current[head.module] = head.module === 'finance' ? pureHeadData : syncModuleData(nextState, head.module);
            if (head.module === 'finance') traceFinanceSync('merged', { remoteRevision: head.revision, mergedIds: nextState.finance.transactions.map(tx => tx.id) });
            appliedRemote = true;

            const mergedFingerprint = syncModuleFingerprint(nextState, head.module);
            if (mergedFingerprint !== remoteFingerprint) {
              modulesToUpload.push(head.module);
            }
          }
          if (appliedRemote && !applyRemoteState(nextState, cloudUser.uid)) return;

          storeRevisions(nextRevisions);
          persistBaselines(cloudUser.uid, nextBaselines);
          saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
          markCloudPaired(cloudUser.uid);

          if (modulesToUpload.length > 0) {
            queueCloudSave(nextState, modulesToUpload);
          }

          const statusAfterFailures = cloudStatusWithLocalChanges(nextStatus, {
            queued: queuedModulesRef.current.size > 0,
            pending: Object.keys(pendingRevisionsRef.current).some(module => !!pendingRevisionsRef.current[module as SyncModuleKey]?.length),
            failed: failedSyncModulesRef.current.size > 0,
            blocked: gymWriteBlockedRef.current || resaleWriteBlockedRef.current || financeWriteBlockedRef.current,
          });
          setSyncStatus(statusAfterFailures);
          if (statusAfterFailures === 'synced') {
            setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          }
        })().catch(err => {
          if (!isCurrentSession() || currentSeq !== snapshotSeq) return;
          console.error('[CloudSync] No se pudo procesar la actualización remota:', err);
          setSyncStatus(navigator.onLine ? 'error' : 'offline');
        });
      },
      onError: (err) => {
        if (!isCurrentSession()) return;
        console.error('[CloudSync] Snapshot error:', err);
        setSyncStatus(err instanceof CloudProtocolConflict ? 'locked' : navigator.onLine ? 'error' : 'offline');
      },
    });
    return () => { active = false; snapshotSeq += 1; unsubscribe(); };
  // The upload queue reads current values from refs; resubscribing on every
  // render would duplicate Firestore listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser, storageUserId, cloudRuntime]);

  useEffect(() => {
    const handleOnline = () => {
      if (resaleWriteBlockedRef.current) { setSyncStatus('conflict'); return; }
      setSyncStatus(cloudUserRef.current ? 'connecting' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
      if (cloudUserRef.current && failedSyncModulesRef.current.size > 0) {
        queueCloudSave(stateRef.current, [...failedSyncModulesRef.current]);
      }
      if (!cloudAuthBootRequestedRef.current && cloudSyncConfigured && hasPendingCloudSessionHint()) {
        setCloudAuthBootRequested(true);
        void loadCloudRuntime()
          .then((runtime) => setCloudRuntime(runtime))
          .catch(() => {});
      }
    };
    const handleOffline = () => {
      if (resaleWriteBlockedRef.current) { setSyncStatus('conflict'); return; }
      setSyncStatus('offline');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && cloudUserRef.current && navigator.onLine) {
        if (failedSyncModulesRef.current.size > 0) {
          queueCloudSave(stateRef.current, [...failedSyncModulesRef.current]);
        }
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloudSignIn = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline');
      showToast('Estás sin conexión. Tus datos siguen guardándose en este dispositivo.', 'info');
      return;
    }
    setSyncStatus('connecting');
    markOAuthRedirectPending();
    setCloudAuthBootRequested(true);
    try {
      const preloaded = getLoadedCloudSync();
      if (preloaded) {
        if (!getCloudRuntime()) {
          void loadCloudRuntime()
            .then((runtime) => setCloudRuntime(runtime))
            .catch(() => {});
        }
        // Invoke directly while still inside the user-gesture turn so browsers don't block signInWithPopup.
        await preloaded.signInToCloud();
      } else {
        const runtime = await loadCloudRuntime();
        setCloudRuntime(runtime);
        await runtime.cloudSync.signInToCloud();
      }
      clearOAuthRedirectPending();
    } catch (error) {
      clearOAuthRedirectPending();
      const rawMsg = error instanceof Error ? error.message : String(error || '');
      const isNetworkFailure =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        /network-request-failed|failed to fetch|offline|network error/i.test(rawMsg);
      setSyncStatus(isNetworkFailure ? 'offline' : 'signed-out');
      showToast(
        isNetworkFailure
          ? 'Estás sin conexión. Tus datos siguen guardándose en este dispositivo.'
          : (error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.'),
        isNetworkFailure ? 'info' : 'error'
      );
    }
  };

  const handleCloudSignOut = async () => {
    try {
      const runtime = getCloudRuntime() ?? await loadCloudRuntime();
      await runtime.cloudSync.signOutFromCloud();
    } catch {
      setSyncStatus('error');
    }
  };

  const handleDeleteCloudAccount = async (): Promise<void> => {
    const userId = cloudUserRef.current?.uid ?? storageUserIdRef.current;
    if (!userId) {
      throw new Error('No hay una cuenta de Google conectada en este dispositivo.');
    }
    const runtime = getCloudRuntime() ?? await loadCloudRuntime();
    const { suspendCloudSync, deleteCloudAccountAndAuth, signOutFromCloud, resumeCloudSync } = runtime.cloudSync;
    // Stop every autosave before touching Firestore: a late flush must never
    // recreate the documents we are about to delete.
    suspendCloudSync();
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    queuedModulesRef.current.clear();
    queuedStateRef.current = null;
    try {
      await deleteCloudAccountAndAuth(userId);
      // Remember the deleted uid before signOutFromCloud() resets storageUserIdRef to null,
      // so handleDeleteLocalData can still wipe every scoped key and IndexedDB Device Trust.
      lastDeletedUserIdRef.current = userId;
      // Preserve a single unscoped local copy (if the user chooses to keep local data),
      // remove all scoped keys for userId, and mark LAST_USER_KEY as __deleted__:${userId}
      // so a future re-login starts clean without resurrecting deleted cloud data.
      const { preserveLocalStateAfterCloudDeletion } = await import('./lib/accountDeletion');
      const { preservedLocally } = await preserveLocalStateAfterCloudDeletion(userId, stateRef.current);
      if (!preservedLocally) {
        showToast('La cuenta en la nube fue eliminada, pero no se pudo guardar una copia local en este navegador. Exportá un backup si querés conservar tus datos.', 'error');
      }
      await signOutFromCloud().catch(() => undefined);
    } catch (error) {
      resumeCloudSync();
      throw error;
    }
    resumeCloudSync();
  };

  const handleDeleteLocalData = () => {
    const userId = storageUserIdRef.current ?? lastDeletedUserIdRef.current;
    lastDeletedUserIdRef.current = null;
    void import('./lib/accountDeletion').then(({ wipeLocalStateAfterDeletion }) => {
      const fresh = wipeLocalStateAfterDeletion(userId);
      stateRef.current = fresh;
      setStateObj({ state: fresh, storageBackend: 'localStorage' });
      setSyncStatus(cloudSyncConfigured ? 'signed-out' : 'unavailable');
    });
  };

  const handleExportResaleConflict = () => {
    const record = resaleConflictRecordRef.current;
    const runtime = getCloudRuntime();
    if (!record || !runtime) { showToast('No hay una copia del conflicto disponible para exportar.', 'error'); return; }
    try {
      const currentLocal = Object.fromEntries(record.modules.map((module) => [module, runtime.syncModel.syncModuleData(stateRef.current, module)]));
      const contents = JSON.stringify({ ...record, currentLocal, exportedAt: new Date().toISOString() }, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `mi-negocio-conflicto-${record.id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Copia del conflicto exportada en este dispositivo. No se sincronizó.', 'info');
    } catch {
      showToast('No se pudo exportar la copia del conflicto.', 'error');
    }
  };

  const handleResolveResaleConflict = async () => {
    const user = cloudUserRef.current;
    const record = resaleConflictRecordRef.current;
    if (!user || !record || !resaleWriteBlockedRef.current || resaleResolutionInProgressRef.current) return;
    resaleResolutionInProgressRef.current = true;
    setResaleResolutionPending(true);
    let runtime: CloudSyncRuntime | null = null;
    try {
      runtime = getCloudRuntime() ?? await loadCloudRuntime();
      const {
        cloudSync: { fetchFreshCloudModules, writeCloudModulesGuarded, saveCloudBaselineData, markCloudPaired },
        syncModel: { syncModuleFingerprint, syncModuleData, syncDataFingerprint },
      } = runtime;
      const fresh = await fetchFreshCloudModules(user.uid);
      if (cloudUserRef.current?.uid !== user.uid) return;
      if (fresh.lockedModules.length || fresh.corruptedModules.length) {
        setResaleConflictReason('No se pudo leer con seguridad la versión remota de todos los módulos.');
        return;
      }
      const localSnapshot = stateRef.current;
      const targetModules = [...new Set<SyncModuleKey>(['resale', 'finance', ...record.modules])];
      const relevantRemote = Object.fromEntries(targetModules.filter((module) => module in fresh.moduleData)
        .map((module) => [module, fresh.moduleData[module]]));
      const { confirmMatchingResaleConflict } = await import('./lib/resaleConflictResolution');
      const result = await confirmMatchingResaleConflict(record, localSnapshot, relevantRemote, fresh.remoteRevisions, {
        save: (next) => saveResaleConflict(user.uid, next),
        publish: (modules, revisions) => writeCloudModulesGuarded(user.uid, localSnapshot, modules, deviceIdRef.current, revisions, tombstonesRef.current),
        currentState: () => stateRef.current,
      });
      if (cloudUserRef.current?.uid !== user.uid) return;
      if (result.status === 'blocked') {
        resaleConflictRecordRef.current = result.record;
        setResaleRecoveryStatus(result.durable ? 'saved' : 'failed');
        setResaleConflictReason(result.reason);
        setSyncStatus('conflict');
        return;
      }
      const nextRevisions = { ...revisionsRef.current };
      const nextBaselines = { ...baselinesRef.current };
      result.writes.forEach((write) => {
        nextRevisions[write.module] = write.revision;
        nextBaselines[write.module] = syncModuleFingerprint(localSnapshot, write.module);
        baselineDataRef.current[write.module] = syncModuleData(localSnapshot, write.module);
        delete pendingRevisionsRef.current[write.module];
        queuedModulesRef.current.delete(write.module);
      });
      persistRevisionMap(user.uid, nextRevisions);
      persistBaselines(user.uid, nextBaselines);
      saveCloudBaselineData(user.uid, baselineDataRef.current);
      markCloudPaired(user.uid);
      initializedUserRef.current = user.uid;
      resaleConflictRecordRef.current = null;
      resaleWriteBlockedRef.current = false;
      setResaleReconcilePreview(null);
      setResaleRecoveryStatus('none');
      setResaleConflictReason('');
      if (queuedModulesRef.current.size > 0) queueCloudSave(stateRef.current, [...queuedModulesRef.current]);
      else {
        const otherRemoteDifferences = (Object.keys(fresh.moduleData) as SyncModuleKey[])
          .some((module) => !result.modules.includes(module) && syncModuleFingerprint(stateRef.current, module) !== syncDataFingerprint(fresh.moduleData[module]));
        setSyncStatus(otherRemoteDifferences ? 'connecting' : navigator.onLine ? 'synced' : 'offline');
        if (!otherRemoteDifferences) setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      showToast('Tus datos volvieron a sincronizarse correctamente.', 'success');
    } catch (error) {
      const isRevisionConflict = Boolean(runtime && error instanceof runtime.cloudSync.ResaleRevisionConflict);
      setResaleConflictReason(isRevisionConflict
        ? 'La nube volvió a cambiar mientras confirmábamos. Revisá nuevamente.'
        : 'No se pudo completar la confirmación. Tus datos siguen guardados en este dispositivo.');
      setSyncStatus('conflict');
    } finally {
      resaleResolutionInProgressRef.current = false;
      setResaleResolutionPending(false);
    }
  };

  const handleOpenResaleReconcilePreview = async () => {
    const record = resaleConflictRecordRef.current;
    if (!record) {
      showToast('No hay un registro de conflicto disponible para revisar.', 'error');
      return;
    }
    let activeRecord = record;
    const user = cloudUserRef.current;
    if (user && navigator.onLine) {
      try {
        const runtime = getCloudRuntime() ?? await loadCloudRuntime();
        const fresh = await runtime.cloudSync.fetchFreshCloudModules(user.uid);
        if (cloudUserRef.current?.uid === user.uid && !fresh.lockedModules.length && !fresh.corruptedModules.length) {
          const relevantRemote = Object.fromEntries(
            record.modules
              .filter((module) => module in fresh.moduleData)
              .map((module) => [module, fresh.moduleData[module]])
          );
          if (Object.keys(relevantRemote).length > 0) {
            activeRecord = addRemoteResaleVersion(record, relevantRemote, fresh.remoteRevisions);
            resaleConflictRecordRef.current = activeRecord;
            saveResaleConflict(user.uid, activeRecord);
          }
        }
      } catch {
        // Conserva la vista sobre las versiones remotas ya guardadas.
      }
    }
    const { buildResaleConflictReconciliationPreview } = await import('./lib/resaleConflictResolution');
    const preview = buildResaleConflictReconciliationPreview(activeRecord, stateRef.current);
    setResaleReconcilePreview(preview);
  };

  const handleExportGenericConflict = () => {
    const runtime = getCloudRuntime();
    if (!cloudConflict || !runtime) return;
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        modules: cloudConflict.modules,
        local: Object.fromEntries(cloudConflict.modules.map((mod) => [mod, runtime.syncModel.syncModuleData(stateRef.current, mod)])),
        remote: Object.fromEntries(cloudConflict.modules.map((mod) => [mod, runtime.syncModel.syncModuleData(cloudConflict.remoteState, mod)])),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `celestian-conflicto-${todayISO()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Copia del conflicto exportada en este dispositivo.', 'info');
    } catch {
      showToast('No se pudo exportar la copia del conflicto.', 'error');
    }
  };

  const handleExecuteAuthorizedResaleReconcile = async (
    selectedChoices: Partial<Record<SyncModuleKey, 'local' | 'remote'>>
  ) => {
    const user = cloudUserRef.current;
    const record = resaleConflictRecordRef.current;
    if (!user || !record || !resaleWriteBlockedRef.current || resaleResolutionInProgressRef.current) return;
    resaleResolutionInProgressRef.current = true;
    setResaleResolutionPending(true);
    let runtime: CloudSyncRuntime | null = null;
    try {
      runtime = getCloudRuntime() ?? await loadCloudRuntime();
      const {
        cloudSync: { fetchFreshCloudModules, saveSyncRecoverySnapshot, saveCloudBaselineData, writeCloudModulesGuarded, markCloudPaired },
        syncModel: { syncModuleFingerprint, syncModuleData },
      } = runtime;
      const fresh = await fetchFreshCloudModules(user.uid);
      if (cloudUserRef.current?.uid !== user.uid) return;
      if (fresh.lockedModules.length || fresh.corruptedModules.length) {
        setResaleConflictReason('No se pudo leer con seguridad la versión de la nube en todos los módulos.');
        return;
      }
      const relevantRemote = Object.fromEntries(
        record.modules
          .filter((module) => module in fresh.moduleData)
          .map((module) => [module, fresh.moduleData[module]])
      );
      const { buildResaleConflictReconciliationPreview, executeAuthorizedConflictReconciliation } = await import('./lib/resaleConflictResolution');
      const localSnapshot = stateRef.current;
      const result = await executeAuthorizedConflictReconciliation(
        record,
        localSnapshot,
        {
          authorized: true,
          choices: selectedChoices,
          latestRemoteData: relevantRemote,
          latestRemoteRevisions: fresh.remoteRevisions,
        },
        {
          saveConflict: (next) => saveResaleConflict(user.uid, next),
          saveBackup: (localSnap, remoteSnap) => {
            const savedLocal = saveSyncRecoverySnapshot(user.uid, 'local', localSnap);
            const savedRemote = saveSyncRecoverySnapshot(user.uid, 'remote', remoteSnap);
            const savedRecovery = saveRecoveryState(
              remoteSnap,
              user.uid,
              'cloud_conflict',
              'Respaldo previo a resolución de conflicto'
            );
            return savedLocal && savedRemote && savedRecovery;
          },
          onBatchConfirmed: (batchWrites, completedModules, pendingModules) => {
            const partialRevisions = { ...revisionsRef.current };
            const partialBaselines = { ...baselinesRef.current };
            batchWrites.forEach((write) => {
              partialRevisions[write.module] = write.revision;
              partialBaselines[write.module] = syncModuleFingerprint(localSnapshot, write.module);
              baselineDataRef.current[write.module] = syncModuleData(localSnapshot, write.module);
              delete pendingRevisionsRef.current[write.module];
              queuedModulesRef.current.delete(write.module);
            });
            persistRevisionMap(user.uid, partialRevisions);
            persistBaselines(user.uid, partialBaselines);
            saveCloudBaselineData(user.uid, baselineDataRef.current);
            setResaleConflictReason(
              `Aplicando cambios: ${completedModules.length} de ${record.modules.length} áreas listas (${pendingModules.length} pendientes)…`
            );
          },
          publish: (reconciledState, modules, expectedRevisions) =>
            writeCloudModulesGuarded(user.uid, reconciledState, modules, deviceIdRef.current, expectedRevisions, tombstonesRef.current),
          currentState: () => stateRef.current,
        }
      );
      if (cloudUserRef.current?.uid !== user.uid) return;
      if (result.status === 'blocked') {
        resaleConflictRecordRef.current = result.record;
        setResaleReconcilePreview(buildResaleConflictReconciliationPreview(result.record, stateRef.current));
        setResaleRecoveryStatus(result.durable ? 'saved' : 'failed');
        setResaleConflictReason(result.reason);
        setSyncStatus('conflict');
        showToast(result.reason, 'error');
        return;
      }
      if (!applyRemoteState(result.reconciledState, user.uid)) return;
      const nextRevisions = { ...revisionsRef.current, ...result.adoptedRevisions };
      const nextBaselines = { ...baselinesRef.current };
      record.modules.forEach((module) => {
        nextBaselines[module] = syncModuleFingerprint(result.reconciledState, module);
        baselineDataRef.current[module] = syncModuleData(result.reconciledState, module);
        delete pendingRevisionsRef.current[module];
        queuedModulesRef.current.delete(module);
      });
      persistRevisionMap(user.uid, nextRevisions);
      persistBaselines(user.uid, nextBaselines);
      saveCloudBaselineData(user.uid, baselineDataRef.current);
      markCloudPaired(user.uid);
      initializedUserRef.current = user.uid;
      resaleConflictRecordRef.current = null;
      resaleWriteBlockedRef.current = false;
      setResaleReconcilePreview(null);
      setResaleRecoveryStatus('none');
      setResaleConflictReason('');
      setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      showToast('Listo. Se aplicó tu elección y guardamos un respaldo automático en este dispositivo.', 'success');
    } catch (error) {
      const isRevisionConflict = Boolean(runtime && error instanceof runtime.cloudSync.ResaleRevisionConflict);
      setResaleConflictReason(isRevisionConflict
        ? 'La nube volvió a cambiar mientras aplicábamos tu elección. Intentá nuevamente.'
        : 'No se pudo completar el cambio. Tus datos siguen a salvo en este dispositivo.');
      setSyncStatus('conflict');
    } finally {
      resaleResolutionInProgressRef.current = false;
      setResaleResolutionPending(false);
    }
  };

  const handleForceSync = async () => {
    if (financeWriteBlockedRef.current) {
      setSyncStatus('conflict');
      showToast('Finanzas conserva un conflicto pendiente. Revisá las versiones antes de sincronizar.', 'error');
      return;
    }
    const sessionEpoch = cloudSessionEpochRef.current;
    const isCurrentSession = () => sessionEpoch === cloudSessionEpochRef.current && cloudUserRef.current?.uid === cloudUser?.uid;
    if (resaleWriteBlockedRef.current) {
      setSyncStatus('conflict');
      showToast('Hay cambios pendientes de revisión antes de sincronizar.', 'error');
      return;
    }
    if (!cloudUser) {
      void handleCloudSignIn();
      return;
    }
    showToast('Consultando tus datos en la nube…', 'info');
    try {
      setSyncStatus('connecting');
      const runtime = getCloudRuntime() ?? await loadCloudRuntime();
      const {
        cloudSync: { fetchFreshCloudModules, isCloudPaired, hasMeaningfulData, saveCloudBaselineData, markCloudPaired, saveSyncRecoverySnapshot },
        syncModel: { SYNC_MODULES, buildStateFromModules, syncModuleData, isCleanOrOnboardingOnlyState, syncModuleFingerprint, syncDataFingerprint },
      } = runtime;
      const fresh = await fetchFreshCloudModules(cloudUser.uid);
      if (!isCurrentSession()) return;
      if (fresh.lockedModules.length || fresh.corruptedModules.length) {
        [...fresh.lockedModules, ...fresh.corruptedModules].forEach(module => failedSyncModulesRef.current.add(module));
        setFailedSyncModules([...failedSyncModulesRef.current]);
        setSyncStatus(fresh.corruptedModules.length ? 'error' : 'locked');
        showToast('Desbloqueá tus datos para continuar sincronizando.', 'error');
        return;
      }
      const localState = stateRef.current;
      const remoteState = buildStateFromModules(fresh.moduleData);
      const commercialDiagnostic = commercialHydrationBlock(localState, remoteState);
      if (commercialDiagnostic) {
        blockResaleConflict(['resale'], commercialDiagnostic,
          { resale: syncModuleData(remoteState, 'resale') }, fresh.remoteRevisions);
        return;
      }

      // Dispositivo limpio/nuevo sin emparejar + nube con datos => descargar automáticamente sin conflicto
      const paired = isCloudPaired(cloudUser.uid) && Object.keys(revisionsRef.current).length > 0;
      if (!paired && isCleanOrOnboardingOnlyState(localState) && hasMeaningfulData(remoteState)) {
        if (!applyRemoteState(remoteState, cloudUser.uid)) return;
        const nextRevisions = { ...revisionsRef.current, ...fresh.remoteRevisions };
        const nextBaselines = Object.fromEntries(
          SYNC_MODULES.map((mod) => [mod, syncModuleFingerprint(remoteState, mod)])
        ) as SyncBaselineMap;
        const nextBaselineData = Object.fromEntries(
          SYNC_MODULES.map((mod) => [mod, syncModuleData(remoteState, mod)])
        );
        persistRevisionMap(cloudUser.uid, nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        baselineDataRef.current = nextBaselineData;
        saveCloudBaselineData(cloudUser.uid, nextBaselineData);
        pendingRevisionsRef.current = {};
        failedSyncModulesRef.current.clear();
        setFailedSyncModules([]);
        conflictPendingRef.current = false;
        setCloudConflict(null);
        setIsCloudConflictDismissed(false);
        markCloudPaired(cloudUser.uid);
        initializedUserRef.current = cloudUser.uid;
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        showToast('Datos descargados desde tu cuenta de Google.', 'success');
        return;
      }

      // Detectar qué módulos difieren realmente en contenido entre local y Firestore
      const contentDivergences: SyncModuleKey[] = [];
      const remoteModulesPresent = Object.keys(fresh.moduleData) as SyncModuleKey[];

      for (const mod of remoteModulesPresent) {
        const localFp = syncModuleFingerprint(localState, mod);
        const remoteData = fresh.moduleData[mod];
        const remoteFp = syncDataFingerprint(remoteData);
        if (localFp !== remoteFp) {
          contentDivergences.push(mod);
        }
      }

      if (contentDivergences.length === 0) {
        const nextRevisions = { ...revisionsRef.current, ...fresh.remoteRevisions };
        const nextBaselines = { ...baselinesRef.current };
        for (const mod of remoteModulesPresent) {
          nextBaselines[mod] = syncDataFingerprint(fresh.moduleData[mod]);
          baselineDataRef.current[mod] = fresh.moduleData[mod];
          failedSyncModulesRef.current.delete(mod);
        }
        persistRevisionMap(cloudUser.uid, nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
        pendingRevisionsRef.current = {};
        consecutiveDivergenceCountRef.current = 0;
        conflictPendingRef.current = false;
        gymWriteBlockedRef.current = false;
        setCloudConflict(null);
        setIsCloudConflictDismissed(false);
        setFailedSyncModules([...failedSyncModulesRef.current]);
        markCloudPaired(cloudUser.uid);
        initializedUserRef.current = cloudUser.uid;
        const missingModules = SYNC_MODULES.filter(module => !(module in fresh.moduleData));
        if (missingModules.length) {
          queueCloudSave(localState, missingModules);
          showToast('Subiendo áreas pendientes…', 'info');
        } else {
          setSyncStatus('synced');
          setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          showToast('Tus datos están al día con la nube.', 'success');
        }
      } else {
        saveSyncRecoverySnapshot(cloudUser.uid, 'local', localState);
        saveSyncRecoverySnapshot(cloudUser.uid, 'remote', remoteState);
        const baseBuilt = Object.keys(baselineDataRef.current).length > 0
          ? buildStateFromModules(baselineDataRef.current)
          : undefined;
        if (baseBuilt) {
          saveSyncRecoverySnapshot(cloudUser.uid, 'base', baseBuilt);
        }

        conflictPendingRef.current = true;
        if (contentDivergences.includes('gym')) gymWriteBlockedRef.current = true;
        setIsCloudConflictDismissed(false);
        setCloudConflict({
          remoteState,
          modules: contentDivergences,
          remoteRevisions: fresh.remoteRevisions,
          recommendedSide: paired ? 'local' : 'cloud',
        });
        setSyncStatus('conflict');
        showToast('Hay cambios distintos entre este dispositivo y la nube. Elegí qué versión conservar.', 'info');
      }
    } catch (err) {
      if (!isCurrentSession()) return;
      console.error('[CloudSync] Error durante reconciliación forzada:', err);
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      showToast('Error al conectar con la nube.', 'error');
    }
  };

  const handleRetrySync = () => {
    if (financeWriteBlockedRef.current) { setSyncStatus('conflict'); return; }
    if (resaleWriteBlockedRef.current) { setSyncStatus('conflict'); return; }
    if (gymWriteBlockedRef.current) { setSyncStatus('conflict'); return; }
    const runtime = getCloudRuntime();
    if (!runtime) return;
    setSyncErrorMessage(null);
    retryAttemptRef.current = 0;
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    const modules = failedSyncModules.length ? failedSyncModules : [...runtime.syncModel.SYNC_MODULES];
    queueCloudSave(stateRef.current, modules);
  };

  const handleCryptoUnlocked = () => {
    setSyncErrorMessage(null);
    handleRetrySync();
    if (syncStatus === 'locked' || failedSyncModules.length > 0) {
      void handleForceSync();
    }
  };

  const handleUseLocalState = () => {
    const runtime = getCloudRuntime();
    if (!cloudUser || !cloudConflict || !runtime) return;
    const {
      cloudSync: { saveSyncRecoverySnapshot, saveCloudBaselineData, markCloudPaired },
      syncModel: { SYNC_MODULES, syncModuleFingerprint, syncModuleData },
    } = runtime;
    if (cloudConflict.modules.includes('resale') || resaleWriteBlockedRef.current) return;
    if ((cloudConflict.modules.includes('gym') || cloudConflict.modules.includes('finance')) && !saveSyncRecoverySnapshot(cloudUser.uid, 'remote', cloudConflict.remoteState)) {
      setSyncStatus('conflict');
      showToast('No se pudo guardar la copia remota. La resolución sigue bloqueada.', 'error');
      return;
    }
    resaleWriteBlockedRef.current = false;
    if (!cloudConflict.modules.includes('gym')) saveSyncRecoverySnapshot(cloudUser.uid, 'remote', cloudConflict.remoteState);
    saveRecoveryState(cloudConflict.remoteState, cloudUser.uid, 'cloud_conflict', 'Versión remota descartada al elegir datos locales');
    const baseRevisions = { ...revisionsRef.current, ...cloudConflict.remoteRevisions };
    persistRevisionMap(cloudUser.uid, baseRevisions);
    const nextBaselines = { ...baselinesRef.current };
    cloudConflict.modules.forEach((module) => {
      nextBaselines[module] = syncModuleFingerprint(cloudConflict.remoteState, module);
      baselineDataRef.current[module] = syncModuleData(cloudConflict.remoteState, module);
    });
    persistBaselines(cloudUser.uid, nextBaselines);
    saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
    pendingRevisionsRef.current = {};
    failedSyncModulesRef.current.clear();
    setFailedSyncModules([]);
    markCloudPaired(cloudUser.uid);
    initializedUserRef.current = cloudUser.uid;
    conflictPendingRef.current = false;
    gymWriteBlockedRef.current = false;
    financeWriteBlockedRef.current = false;
    failedSyncModulesRef.current.clear();
    setFailedSyncModules([]);
    setCloudConflict(null);
    setIsCloudConflictDismissed(false);
    queueCloudSave(stateRef.current, [...SYNC_MODULES]);
  };

  const handleUseCloudState = () => {
    const runtime = getCloudRuntime();
    if (!cloudUser || !cloudConflict || !runtime) return;
    const {
      cloudSync: { saveSyncRecoverySnapshot, saveCloudBaselineData, markCloudPaired },
      syncModel: { SYNC_MODULES, applySyncModule, syncModuleFingerprint, syncModuleData },
    } = runtime;
    if (cloudConflict.modules.includes('resale') || resaleWriteBlockedRef.current) return;
    if ((cloudConflict.modules.includes('gym') || cloudConflict.modules.includes('finance')) && !saveSyncRecoverySnapshot(cloudUser.uid, 'local', stateRef.current)) {
      setSyncStatus('conflict');
      showToast('No se pudo guardar la copia local. La resolución sigue bloqueada.', 'error');
      return;
    }
    resaleWriteBlockedRef.current = false;
    if (!cloudConflict.modules.includes('gym')) saveSyncRecoverySnapshot(cloudUser.uid, 'local', stateRef.current);
    saveRecoveryState(stateRef.current, cloudUser.uid, 'cloud_conflict', 'Versión local descartada al elegir datos de la nube');
    // This resolver is limited to non-resale conflicts. Keep the local commercial payload intact.
    let remoteWithLocalResale = stateRef.current;
    cloudConflict.modules.forEach((module) => {
      remoteWithLocalResale = applySyncModule(remoteWithLocalResale, module, syncModuleData(cloudConflict.remoteState, module));
    });
    if (!applyRemoteState(remoteWithLocalResale, cloudUser.uid)) return;
    persistRevisionMap(cloudUser.uid, { ...revisionsRef.current, ...cloudConflict.remoteRevisions });
    const nextBaselines = { ...baselinesRef.current };
    cloudConflict.modules.forEach((module) => {
      nextBaselines[module] = syncModuleFingerprint(cloudConflict.remoteState, module);
      baselineDataRef.current[module] = syncModuleData(cloudConflict.remoteState, module);
    });
    persistBaselines(cloudUser.uid, nextBaselines);
    saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
    markCloudPaired(cloudUser.uid);
    initializedUserRef.current = cloudUser.uid;
    conflictPendingRef.current = false;
    gymWriteBlockedRef.current = false;
    financeWriteBlockedRef.current = false;
    const needsMigration = cloudConflict.needsMigration;
    setCloudConflict(null);
    setIsCloudConflictDismissed(false);
    if (needsMigration) queueCloudSave(remoteWithLocalResale, [...SYNC_MODULES]);
    else if (cloudConflict.localModules?.length) queueCloudSave(remoteWithLocalResale, cloudConflict.localModules);
    else setSyncStatus(navigator.onLine ? 'synced' : 'offline');
  };

  // Sync dark mode class and browser theme-color meta to html document
  useEffect(() => {
    const isDark = Boolean(state.settings.darkMode);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    syncDocumentThemeColor(isDark);
  }, [state.settings.darkMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-mode', Boolean(state.settings.privacyMode));
  }, [state.settings.privacyMode]);

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action');
    if (action === 'capture') {
      setQuickCaptureKind('tarea');
      setIsQuickCaptureOpen(true);
    }
    if (action === 'note' || action === 'nota') {
      setQuickCaptureKind('nota');
      setIsQuickCaptureOpen(true);
    }
    if (action === 'gym') setCurrentView('gimnasio');
    const viewParam = new URLSearchParams(window.location.search).get('view');
    if (viewParam && ['dashboard', 'agenda', 'calendario', 'trabajo', 'reventa', 'finanzas', 'gimnasio', 'estudios', 'notas', 'ia', 'config'].includes(viewParam)) {
      setCurrentView(viewParam as ViewType);
    }
  }, []);

  useKeyboardShortcuts({
    onNavigate: (view) => {
      handleNavigate(view);
      setIsSearchOpen(false);
      setIsQuickCaptureOpen(false);
      setIsOpenMobile(false);
    },
    onOpenQuickCapture: () => {
      setQuickCaptureKind('tarea');
      setIsQuickCaptureOpen(true);
    },
    onOpenQuickNote: () => {
      setQuickCaptureKind('nota');
      setIsQuickCaptureOpen(true);
    },
    onToggleCommandPalette: () => {
      setSearchQuery('');
      setIsSearchOpen((prev) => !prev);
    },
    onTogglePrivacy: () => {
      updateStateRef.current((draft) => {
        draft.settings.privacyMode = !draft.settings.privacyMode;
      });
    },
    onCloseModals: () => {
      setIsSearchOpen(false);
      setIsQuickCaptureOpen(false);
      setIsOpenMobile(false);
      setIsCheckoutOpen(false);
    },
    isModalOpen: isSearchOpen || isQuickCaptureOpen || isOpenMobile || isCheckoutOpen,
  });

  const handleToggleTheme = () => {
    updateState((draft) => {
      draft.settings.darkMode = !draft.settings.darkMode;
    });
  };

  const handleTogglePrivacy = () => updateState((draft) => {
    draft.settings.privacyMode = !draft.settings.privacyMode;
  });

  const handleNavigate = (view: ViewType) => {
    if (view === 'checkout') {
      setIsCheckoutOpen(true);
    } else {
      if (view !== 'notas') setInitialNoteId(null);
      setInitialFinanceTab(null);
      setInitialNotesTab(null);
      setInitialFocusId(null);
      if (view !== 'agenda') setInitialAgendaDate(null);
      const targetView = isModuleHidden(stateRef.current, view) ? 'dashboard' : view;
      setCurrentView(targetView);
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  const handleNavigateToRecord = (view: ViewType, options?: { tab?: string; focusId?: string; date?: string }) => {
    if (isModuleHidden(stateRef.current, view)) {
      handleNavigate('dashboard');
      return;
    }
    if (view === 'finanzas') {
      setInitialFinanceTab((options?.tab as 'movimientos' | 'cuentas' | 'analisis' | 'proyeccion') || null);
      setInitialFocusId(options?.focusId || null);
    } else if (view === 'notas') {
      setInitialNotesTab((options?.tab as 'notas' | 'proyectos' | 'streaming') || null);
      setInitialFocusId(options?.focusId || null);
    } else if (view === 'estudios') {
      setInitialFocusId(options?.focusId || null);
    } else if (view === 'trabajo') {
      setInitialFocusId(options?.focusId || null);
    } else if (view === 'dashboard') {
      setInitialFocusId(options?.focusId || null);
    } else if (view === 'agenda') {
      setInitialFocusId(options?.focusId || null);
      setInitialAgendaDate(options?.date || null);
    }
    setFocusNonce((prev) => prev + 1);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleOpenNote = (noteId: string) => {
    if (isModuleHidden(stateRef.current, 'notas')) return;
    setInitialNoteId(noteId);
    setCurrentView('notas');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    if (isModuleHidden(state.settings, currentView)) {
      setCurrentView('dashboard');
    }
  }, [state.settings, currentView]);

  const handleQuickAction = (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => {
    if (txType) setQuickTransactionType(txType);
    setCurrentView(view);
    setTimeout(() => {
      const el = document.getElementById(focusId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector('input, select');
        if (input && input instanceof HTMLElement) {
          input.focus();
        }
      }
    }, 150);
  };

  const handleSearchNavigate = (view: ViewType, focusId?: string) => {
    if (view === 'notas' && focusId?.startsWith('note-')) handleNavigateToRecord(view, { tab: 'notas', focusId });
    else if (focusId) handleQuickAction(view, focusId);
    else handleNavigate(view);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `celestian_lifeos_backup_${todayISO()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    updateState((draft) => {
      draft.settings.lastBackupAt = todayISO();
    });
  };

  const handleImportState = (imported: LifeOSState, description?: string) => {
    isImportingBackupRef.current = true;
    if (importBackupTimeoutRef.current !== null) {
      window.clearTimeout(importBackupTimeoutRef.current);
    }
    importBackupTimeoutRef.current = window.setTimeout(() => {
      isImportingBackupRef.current = false;
      importBackupTimeoutRef.current = null;
    }, 10000);

    // 1. Eliminar gym._sync antes de saveStoredState manteniendo intactos sessions, weight, measurements, routineTemplates, settings y restDays
    if (imported.gym && '_sync' in imported.gym) {
      delete imported.gym._sync;
    }
    const importedState: LifeOSState = {
      ...imported,
      gym: imported.gym
        ? {
            sessions: imported.gym.sessions,
            weight: imported.gym.weight,
            measurements: imported.gym.measurements,
            routineTemplates: imported.gym.routineTemplates,
            settings: imported.gym.settings,
            restDays: imported.gym.restDays,
            activeTimer: imported.gym.activeTimer ?? null,
          }
        : imported.gym,
    };

    // 2. Si assertCommercialTransition falla por estado legacy, mostrar mensaje específico y NO bloquear la importación (el backup tiene prioridad)
    try {
      assertCommercialTransition(stateRef.current, importedState);
    } catch (commercialError) {
      const legacyDetail = commercialError instanceof Error ? commercialError.message : String(commercialError);
      showToast(`Estado comercial legacy detectado (${legacyDetail}). Se prioriza el backup importado.`, 'info');
    }

    saveRecoveryState(stateRef.current, storageUserIdRef.current, 'import_backup', description || 'Previo a importar backup');

    // 3. Persistir con saveStoredState; si falla, mostrar el mensaje de error exacto en el toast
    try {
      const saved = saveStoredState(importedState, storageUserIdRef.current, undefined, { allowCommercialOverride: true });
      if (!saved) {
        throw new Error('saveStoredState devolvió false: no se pudo confirmar la escritura en localStorage.');
      }
    } catch (saveError) {
      isImportingBackupRef.current = false;
      if (importBackupTimeoutRef.current !== null) {
        window.clearTimeout(importBackupTimeoutRef.current);
        importBackupTimeoutRef.current = null;
      }
      const exactMessage = saveError instanceof Error ? saveError.message : String(saveError);
      showToast(exactMessage, 'error');
      return false;
    }

    stateRef.current = importedState;
    setStateObj(() => ({
      state: importedState,
      storageBackend: 'localStorage',
    }));

    if (tabChannelRef.current && storageUserIdRef.current) {
      try {
        tabChannelRef.current.postMessage({
          type: 'tab-state-update',
          userId: storageUserIdRef.current,
          state: importedState,
        });
      } catch {
        // ignore broadcast serialization error
      }
    }

    if (cloudUserRef.current) {
      const runtime = getCloudRuntime();
      if (runtime) {
        const user = cloudUserRef.current;
        pendingRevisionsRef.current = {};
        failedSyncModulesRef.current.clear();
        setFailedSyncModules([]);
        consecutiveDivergenceCountRef.current = 0;
        const nextBaselines = { ...baselinesRef.current };
        runtime.syncModel.SYNC_MODULES.forEach((mod) => {
          nextBaselines[mod] = runtime.syncModel.syncModuleFingerprint(importedState, mod);
          baselineDataRef.current[mod] = runtime.syncModel.syncModuleData(importedState, mod);
        });
        persistBaselines(user.uid, nextBaselines);
        runtime.cloudSync.saveCloudBaselineData(user.uid, baselineDataRef.current);
        queueCloudSave(importedState, [...runtime.syncModel.SYNC_MODULES]);
      }
    }
    showToast('Backup importado correctamente. Copia anterior guardada en recuperación.', 'success');
    return true;
  };

  const handleResetData = () => {
    if (readStoredCommercial(stateRef.current).status !== 'absent') {
      showToast('Mi negocio contiene datos comerciales. El reinicio requiere una revisión para no perderlos.', 'error');
      return false;
    }
    if (!saveRecoveryState(stateRef.current, storageUserIdRef.current, 'reset_data', 'Previo a reiniciar datos a valores de fábrica')) {
      showToast('No se pudo guardar una copia previa. El reinicio quedó detenido.', 'error');
      return false;
    }
    const def = defaultState();
    if (!updateState((draft) => {
      Object.assign(draft, def);
    })) return false;
    if (cloudUserRef.current) {
      const runtime = getCloudRuntime();
      if (runtime) {
        const user = cloudUserRef.current;
        pendingRevisionsRef.current = {};
        failedSyncModulesRef.current.clear();
        setFailedSyncModules([]);
        consecutiveDivergenceCountRef.current = 0;
        const nextBaselines = { ...baselinesRef.current };
        runtime.syncModel.SYNC_MODULES.forEach((mod) => {
          nextBaselines[mod] = runtime.syncModel.syncModuleFingerprint(def, mod);
        });
        persistBaselines(user.uid, nextBaselines);
        queueCloudSave(def, [...runtime.syncModel.SYNC_MODULES]);
      }
    }
    showToast('Datos reiniciados a los valores por defecto. Copia anterior guardada en recuperación.', 'info');
    return true;
  };

  const handleRestoreRecovery = () => {
    const recovery = loadRecoveryState(storageUserIdRef.current);
    if (!recovery) {
      showToast('No hay ninguna copia de recuperación disponible.', 'error');
      return false;
    }
    if (changesStoredCommercial(stateRef.current, recovery.state)) {
      showToast('La restauración reemplazaría datos comerciales existentes. Se requiere revisión antes de continuar.', 'error');
      return false;
    }
    // Proteger el estado actual antes de sobrescribir
    if (!saveRecoveryState(stateRef.current, storageUserIdRef.current, 'manual_snapshot', 'Previo a restaurar copia de recuperación')) {
      showToast('No se pudo guardar una copia previa. La restauración quedó detenida.', 'error');
      return false;
    }
    if (!updateState((draft) => {
      Object.assign(draft, recovery.state);
    })) return false;
    if (cloudUserRef.current) {
      const runtime = getCloudRuntime();
      if (runtime) {
        const user = cloudUserRef.current;
        const nextBaselines = { ...baselinesRef.current };
        runtime.syncModel.SYNC_MODULES.forEach((mod) => {
          nextBaselines[mod] = runtime.syncModel.syncModuleFingerprint(recovery.state, mod);
        });
        persistBaselines(user.uid, nextBaselines);
        queueCloudSave(recovery.state, [...runtime.syncModel.SYNC_MODULES]);
      }
    }
    showToast('Copia de recuperación restaurada con éxito.', 'success');
    return true;
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = parseBackupJSON(event.target?.result as string);
        handleImportState(imported, `Previo a importar ${file.name}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Error al leer el archivo JSON.', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const isPendingOnboarding = isUserPendingOnboarding(state, storageBackend);

  const handleCompleteOnboarding = (data: {
    selectedModuleIds: ViewType[];
    name: string;
    initialContext?: { sleepHours: number; energy: number; mood: number };
  }) => {
    updateState((draft) => {
      if (!draft.profile) {
        draft.profile = { name: '', height: 170, bodyCompositionSex: null };
      }
      draft.profile.name = data.name.trim();

      if (data.initialContext) {
        const today = todayISO();
        if (!Array.isArray(draft.dailyContext)) {
          draft.dailyContext = [];
        }
        const existingIndex = draft.dailyContext.findIndex((entry) => entry.date === today);
        const nowIso = new Date().toISOString();
        const contextEntry: DailyContextEntry = {
          date: today,
          sleepHours: data.initialContext.sleepHours,
          energy: data.initialContext.energy,
          mood: data.initialContext.mood,
          connection: null,
          recordedAt: nowIso,
          updatedAt: nowIso,
        };

        if (existingIndex >= 0) {
          draft.dailyContext[existingIndex] = {
            ...draft.dailyContext[existingIndex],
            ...contextEntry,
          };
        } else {
          draft.dailyContext.push(contextEntry);
        }
      }

      draft.settings.onboardingCompleted = true;
      draft.settings.hiddenTabs = computeHiddenTabsFromSelection(
        data.selectedModuleIds,
        draft.settings.hiddenTabs
      );
    });
    setCurrentView('dashboard');
    showToast('¡Configuración inicial completada! Bienvenido a Celestian LifeOS.', 'success');
  };

  if (isPendingOnboarding) {
    return (
      <Suspense fallback={dialogLoading('Preparando tu espacio…')}><OnboardingView
        state={state}
        onComplete={handleCompleteOnboarding}
        cloudConfigured={cloudSyncConfigured}
        cloudUser={cloudUser}
        syncStatus={syncStatus}
        onCloudSignIn={handleCloudSignIn}
      /></Suspense>
    );
  }

  const isGymOverlayActive = Boolean(
    isModuleEnabled(state, 'gimnasio') &&
    currentView !== 'gimnasio' &&
    state.gym?.activeTimer
  );

  const isInGymRestActive = Boolean(
    isModuleEnabled(state, 'gimnasio') &&
    currentView === 'gimnasio' &&
    state.gym?.activeTimer
  );

  const isStudyOverlayActive = Boolean(
    isModuleEnabled(state, 'estudios') &&
    currentView !== 'estudios' &&
    state.study?.activeSession
  );

  const mainBottomPadding = (isGymOverlayActive && isStudyOverlayActive)
    ? 'pb-[calc(21rem+env(safe-area-inset-bottom))] md:pb-40 lg:pb-32'
    : (isGymOverlayActive || isStudyOverlayActive)
    ? 'pb-[calc(15.5rem+env(safe-area-inset-bottom))] md:pb-32'
    : isInGymRestActive
    ? 'pb-[calc(11rem+env(safe-area-inset-bottom))] md:pb-12'
    : 'pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-8';

  return (
    <PrivacyProvider active={Boolean(state.settings.privacyMode)}>
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] flex flex-col lg:flex-row antialiased selection:bg-indigo-500/20 selection:text-indigo-500">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        state={state}
        onNavigate={handleNavigate}
        onPrefetchView={prefetchViewChunk}
        onToggleTheme={handleToggleTheme}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          currentView={currentView}
          state={state}
          onOpenMobileNav={() => setIsOpenMobile(true)}
          onQuickAction={handleQuickAction}
          onSearch={(q) => { setSearchQuery(q); setIsSearchOpen(true); }}
          onOpenSearch={() => { setSearchQuery(''); setIsSearchOpen(true); }}
          onOpenCapture={() => { setQuickCaptureKind('tarea'); setIsQuickCaptureOpen(true); }}
          onPrefetchSearch={prefetchSearchChunk}
          onPrefetchCapture={prefetchCaptureChunk}
          onPrefetchView={prefetchViewChunk}
          onTogglePrivacy={handleTogglePrivacy}
          cloudConfigured={cloudSyncConfigured}
          cloudUser={cloudUser}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          onCloudSignIn={handleCloudSignIn}
          onCloudSignOut={handleCloudSignOut}
        />

        <main className={`mx-auto w-full flex-1 space-y-5 sm:space-y-6 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-7 ${mainBottomPadding} max-w-[1360px]`}>
          {(resaleWriteBlockedRef.current || (cloudConflict && isCloudConflictDismissed)) && (
            <div role="alert" className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3.5 text-xs sm:text-sm text-[var(--text)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <strong className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {resaleWriteBlockedRef.current &&
                    (resaleConflictRecordRef.current?.modules?.length ?? 0) === 1 &&
                    resaleConflictRecordRef.current?.modules?.[0] === 'resale'
                      ? 'Revisá los cambios pendientes en Mi negocio.'
                      : 'Hay cambios distintos entre este dispositivo y la nube.'}
                  </strong>
                  <span className="block text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    Tus cambios de este dispositivo están a salvo, pero la sincronización quedó en pausa hasta que elijas qué versión usar.
                  </span>
                  {resaleWriteBlockedRef.current && resaleRecoveryStatus === 'failed' && (
                    <span className="block text-xs font-medium text-amber-800 dark:text-amber-300">
                      No se pudo guardar una copia automática del conflicto. Mantené esta pestaña abierta y exportá un respaldo.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {resaleWriteBlockedRef.current ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleOpenResaleReconcilePreview()}
                        disabled={resaleResolutionPending || !resaleConflictRecordRef.current}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 cursor-pointer"
                      >
                        Elegir qué versión conservar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResolveResaleConflict()}
                        disabled={resaleResolutionPending || !resaleConflictRecordRef.current}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-500/40 bg-transparent px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-500/10 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
                      >
                        {resaleResolutionPending ? 'Verificando…' : 'Verificar si ya coinciden'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCloudConflictDismissed(false)}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer"
                    >
                      Elegir qué versión conservar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {(syncStatus === 'error' || (syncStatus === 'locked' && isCryptoLockError)) && (
            <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300 sm:flex-row sm:items-center">
              <div className="flex-1">
                <strong className="block text-sm">
                  {isCryptoLockError
                    ? 'Tus datos están bloqueados en este dispositivo'
                    : `No se pudo subir ${failedSyncModules.length === 1 && failedSyncModules[0] === 'gym' ? 'Gimnasio' : 'los últimos cambios'}`}
                </strong>
                <span className="mt-0.5 block">
                  {isCryptoLockError
                    ? 'Ingresá tu contraseña de bóveda o código de respaldo para volver a sincronizar.'
                    : 'Siguen guardados en este dispositivo. No vuelvas a cargarlos en otro lado: reintentá la sincronización.'}
                </span>
              </div>
              {isCryptoLockError ? (
                <button
                  type="button"
                  onClick={() => setIsCryptoUnlockOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
                >
                  Desbloquear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
          {storageBackend === 'recovery' && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Celestian recuperó automáticamente la última copia local válida. Exportá un backup antes de seguir cargando datos.
            </div>
          )}
          {storageBackend === 'ninguno' && (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700 dark:text-rose-300">
              Atención: No se pueden guardar cambios localmente en este navegador (almacenamiento bloqueado o cuota excedida). Cualquier cambio nuevo se perderá al recargar. Exportá un backup para no perder datos.
            </div>
          )}
          {/* View Router */}
          <AppErrorBoundary key={currentView} inline fallbackTitle={`Error al cargar la pantalla`}>
            <Suspense fallback={<DashboardSkeleton />}>
              {currentView === 'dashboard' && (
                <DashboardView
                  state={state}
                  onUpdateState={updateState}
                  onNavigate={handleNavigate}
                  onExportJSON={handleExportJSON}
                  onOpenSearch={() => { setSearchQuery(''); setIsSearchOpen(true); }}
                  onOpenCapture={() => { setQuickCaptureKind('tarea'); setIsQuickCaptureOpen(true); }}
                  onOpenQuickNote={() => { setQuickCaptureKind('nota'); setIsQuickCaptureOpen(true); }}
                  onQuickAction={handleQuickAction}
                  onOpenNote={handleOpenNote}
                  onNavigateToRecord={handleNavigateToRecord}
                  initialFocusId={initialFocusId}
                  focusNonce={focusNonce}
                />
              )}

              {currentView === 'agenda' && (
                <AgendaView
                  state={state}
                  onUpdateState={updateState}
                  initialFocusId={initialFocusId}
                  initialDate={initialAgendaDate}
                  focusNonce={focusNonce}
                  onNavigateToRecord={handleNavigateToRecord}
                />
              )}

              {currentView === 'calendario' && (
                <CalendarioView state={state} onUpdateState={updateState} onNavigate={handleNavigate} onNavigateToRecord={handleNavigateToRecord} />
              )}

              {currentView === 'trabajo' && (
                <TrabajoView
                  state={state}
                  onUpdateState={updateState}
                  initialFocusId={initialFocusId}
                  focusNonce={focusNonce}
                />
              )}

              {currentView === 'reventa' && (
                <ReventaView state={state} onUpdateState={updateState} onCommercialUpdate={updater => updateState(updater, true)} commercialUserId={cloudUser?.uid} syncStatus={syncStatus === 'synced' && (['resale', 'finance'] as SyncModuleKey[]).some(module => queuedModulesRef.current.has(module) || pendingRevisionsRef.current[module]?.length || failedSyncModulesRef.current.has(module)) ? 'saving' : syncStatus} />
              )}

              {currentView === 'finanzas' && (
                <FinanzasView
                  state={state}
                  onUpdateState={updateState}
                  onOpenCommercial={() => handleNavigate('reventa')}
                  onOpenSecurityConfig={() => {
                    window.location.hash = '#security-section';
                    handleNavigate('config');
                  }}
                  storageUserId={storageUserId}
                  cloudConnected={Boolean(cloudUser)}
                  initialTransactionType={quickTransactionType}
                  initialTab={initialFinanceTab}
                  initialFocusId={initialFocusId}
                  focusNonce={focusNonce}
                />
              )}

              {currentView === 'gimnasio' && (
                <GimnasioView state={state} onUpdateState={updateState} storageUserId={storageUserId} onOpenNote={handleOpenNote} />
              )}

              {currentView === 'estudios' && (
                <EstudiosView
                  onOpenNote={handleOpenNote}
                  onOpenAgenda={() => handleNavigate('agenda')}
                  state={state}
                  onUpdateState={updateState}
                  initialFocusId={initialFocusId}
                  focusNonce={focusNonce}
                />
              )}

              {currentView === 'notas' && (
                <NotasView
                  state={state}
                  onUpdateState={updateState}
                  storageUserId={storageUserId}
                  onOpenGym={() => handleNavigate('gimnasio')}
                  initialNoteId={initialNoteId}
                  initialTab={initialNotesTab}
                  initialFocusId={initialFocusId}
                  focusNonce={focusNonce}
                />
              )}

              {currentView === 'ia' && (
                <IAView state={state} onUpdateState={updateState} onOpenBusiness={() => handleNavigate('reventa')} />
              )}

              {currentView === 'config' && (
                <ConfigView
                  state={state}
                  onUpdateState={updateState}
                  onExportJSON={handleExportJSON}
                  onImportJSON={handleImportJSON}
                  onImportState={handleImportState}
                  onResetData={handleResetData}
                  onRestoreRecovery={handleRestoreRecovery}
                  storageUserId={storageUserId}
                  cloudConnected={Boolean(cloudUser)}
                  cloudConfigured={cloudSyncConfigured}
                  cloudUser={cloudUser}
                  syncStatus={syncStatus}
                  lastSyncedAt={lastSyncedAt}
                  onCloudSignIn={handleCloudSignIn}
                  onCloudSignOut={handleCloudSignOut}
                  onDeleteCloudAccount={handleDeleteCloudAccount}
                  onDeleteLocalData={handleDeleteLocalData}
                  onForceSync={handleForceSync}
                  onE2EEDisabled={(verifiedState) => {
                    applyRemoteState(verifiedState, storageUserIdRef.current);
                    setSyncStatus(navigator.onLine ? 'synced' : 'offline');
                  }}
                />
              )}
            </Suspense>
          </AppErrorBoundary>
        </main>
      </div>

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <Suspense fallback={dialogLoading('Abriendo cierre del día…')}><CheckoutModal
          state={state}
          onUpdateState={updateState}
          onClose={() => setIsCheckoutOpen(false)}
        /></Suspense>
      )}

      <MobileNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onPrefetchView={prefetchViewChunk}
        onOpenCapture={() => {
          setQuickCaptureKind('tarea');
          setIsQuickCaptureOpen(true);
        }}
        onPrefetchCapture={prefetchCaptureChunk}
        onOpenMore={() => setIsOpenMobile(true)}
        syncStatus={syncStatus}
        privacyMode={state.settings.privacyMode}
        onTogglePrivacy={handleTogglePrivacy}
        inboxCount={(state.inbox || []).length}
        cloudConfigured={cloudSyncConfigured}
        cloudUser={cloudUser}
        onCloudSignIn={handleCloudSignIn}
        state={state}
      />

      {isQuickCaptureOpen && (
        <Suspense fallback={dialogLoading('Abriendo captura rápida…')}>
          <MobileQuickCapture
            state={state}
            open={isQuickCaptureOpen}
            initialKind={quickCaptureKind}
            initialText={quickCaptureInitialText}
            onClose={() => {
              setIsQuickCaptureOpen(false);
              setQuickCaptureInitialText('');
            }}
            onUpdateState={updateState}
            onNavigate={handleNavigate}
          />
        </Suspense>
      )}

      {cloudConflict && !isCloudConflictDismissed && !cloudConflict.modules.includes('resale') && !resaleWriteBlockedRef.current && (
        <Suspense fallback={dialogLoading('Hay un conflicto pendiente. Cargando opciones…')}>
          <CloudConflictModal
            modules={cloudConflict.modules}
            localState={state}
            remoteState={cloudConflict.remoteState}
            conflicts={cloudConflict.conflicts}
            recommendedSide={cloudConflict.recommendedSide ?? 'cloud'}
            onUseLocal={handleUseLocalState}
            onUseCloud={handleUseCloudState}
            onExportConflict={handleExportGenericConflict}
            onClose={() => setIsCloudConflictDismissed(true)}
          />
        </Suspense>
      )}

      {resaleReconcilePreview && (
        <Suspense fallback={dialogLoading('Cargando opciones de sincronización…')}>
          <CloudConflictModal
            modules={resaleReconcilePreview.modules.map((item) => item.module)}
            moduleComparisons={resaleReconcilePreview.modules}
            recommendedSide={
              resaleReconcilePreview.remoteOnlyCount >= resaleReconcilePreview.localOnlyCount
                ? 'cloud'
                : 'local'
            }
            isApplying={resaleResolutionPending}
            errorMessage={resaleConflictReason || null}
            onUseCloud={() =>
              handleExecuteAuthorizedResaleReconcile(
                Object.fromEntries(resaleReconcilePreview.modules.map((item) => [item.module, 'remote']))
              )
            }
            onUseLocal={() =>
              handleExecuteAuthorizedResaleReconcile(
                Object.fromEntries(resaleReconcilePreview.modules.map((item) => [item.module, 'local']))
              )
            }
            onApplyModuleChoices={(choices) => handleExecuteAuthorizedResaleReconcile(choices)}
            onExportConflict={handleExportResaleConflict}
            onClose={() => setResaleReconcilePreview(null)}
          />
        </Suspense>
      )}

      {isSearchOpen && <Suspense fallback={dialogLoading('Abriendo búsqueda…')}><GlobalSearchModal
        state={state}
        open={isSearchOpen}
        initialQuery={searchQuery}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleSearchNavigate}
        onUpdateState={updateState}
        onOpenCapture={(kind = 'tarea', initialText = '') => {
          setQuickCaptureKind(kind);
          setQuickCaptureInitialText(initialText);
          setIsQuickCaptureOpen(true);
        }}
        onToggleTheme={handleToggleTheme}
        onTogglePrivacy={handleTogglePrivacy}
        cloudConnected={Boolean(cloudUser)}
        onForceSync={cloudUser ? () => { void handleForceSync(); } : undefined}
      /></Suspense>}
      <ToastViewport />
      <CelestianConfirmHost />
      {isGymOverlayActive && (
        <Suspense fallback={null}>
          <GymRestOverlay state={state} onUpdateState={updateState} onOpenGym={() => handleNavigate('gimnasio')} />
        </Suspense>
      )}
      {isStudyOverlayActive && (
        <Suspense fallback={null}>
          <StudyActiveOverlay
            state={state}
            onUpdateState={updateState}
            onOpenStudies={() => handleNavigate('estudios')}
            currentView={currentView}
            isCoexisting={isGymOverlayActive}
          />
        </Suspense>
      )}
      {isCryptoUnlockOpen && (
        <Suspense fallback={dialogLoading('Preparando desbloqueo…')}>
          <UnlockDeviceModal
            isOpen={isCryptoUnlockOpen}
            onClose={() => setIsCryptoUnlockOpen(false)}
            userId={cloudUser?.uid || storageUserId || ''}
            userEmail={cloudUser?.email}
            onUnlocked={handleCryptoUnlocked}
            onRequestDisableLock={() => {
              setIsCryptoUnlockOpen(false);
              window.location.hash = '#security-section';
              handleNavigate('config');
            }}
            showToast={showToast}
          />
        </Suspense>
      )}
      {!__LIFEOS_PORTABLE__ && <PwaUpdatePrompt />}
    </div>
    </PrivacyProvider>
  );
}
