import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ViewType, LifeOSState } from './types';
import { defaultState, loadRecoveryState, loadStoredState, parseBackupJSON, saveRecoveryState, saveStoredState, todayISO } from './lib/storage';
import {
  isModuleEnabled,
  isModuleHidden,
  isUserPendingOnboarding,
  computeHiddenTabsFromSelection,
} from './lib/moduleVisibility';
import {
  cloudSyncConfigured,
  getLastCloudUserId,
  getOrCreateDeviceId,
  hasMeaningfulData,
  isCloudPaired,
  loadCloudBaselineData,
  loadCloudBaselines,
  loadCloudRevisions,
  markCloudPaired,
  markLastCloudUserId,
  observeCloudUser,
  readLegacyCloudState,
  saveCloudBaselineData,
  saveCloudBaselines,
  saveCloudRevisions,
  saveSyncRecoverySnapshot,
  signInToCloud,
  signOutFromCloud,
  subscribeCloudModules,
  writeCloudModulesGuarded,
  type CloudSyncStatus,
  type CloudUser,
} from './lib/cloudSync';
import {
  SYNC_MODULES,
  applySyncModule,
  buildStateFromModules,
  changedSyncModules,
  classifyInitialModuleChanges,
  equivalentLifeOSState,
  extractPureModuleData,
  mergeSyncModuleWithConflicts,
  syncDataFingerprint,
  syncModuleData,
  syncModuleFingerprint,
  type SyncBaselineMap,
  type SyncConflictItem,
  type SyncModuleKey,
  type SyncRevisionMap,
} from './lib/syncModel';
import {
  detectDeletedEntityIds,
  loadTombstones,
  saveTombstones,
} from './lib/syncMerge';

import { AppIcon } from './components/AppIcon';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

import { DashboardView, DashboardSkeleton } from './components/DashboardView';
import { CheckoutModal } from './components/CheckoutModal';
import { MobileQuickCapture, type CaptureKind } from './components/MobileQuickCapture';
import { MobileNav } from './components/MobileNav';
import { CloudConflictModal } from './components/CloudConflictModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ToastViewport } from './components/ToastViewport';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { GymRestOverlay } from './components/GymRestOverlay';
import { OnboardingView } from './components/OnboardingView';
import { showToast } from './lib/toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const AgendaView = lazy(() => import('./components/AgendaView').then((module) => ({ default: module.AgendaView })));
const CalendarioView = lazy(() => import('./components/CalendarioView').then((module) => ({ default: module.CalendarioView })));
const TrabajoView = lazy(() => import('./components/TrabajoView').then((module) => ({ default: module.TrabajoView })));
const ReventaView = lazy(() => import('./components/ReventaView').then((module) => ({ default: module.ReventaView })));
const FinanzasView = lazy(() => import('./components/FinanzasView').then((module) => ({ default: module.FinanzasView })));
const GimnasioView = lazy(() => import('./components/GimnasioView').then((module) => ({ default: module.GimnasioView })));
const EstudiosView = lazy(() => import('./components/EstudiosView').then((module) => ({ default: module.EstudiosView })));
const NotasView = lazy(() => import('./components/NotasView').then((module) => ({ default: module.NotasView })));
const IAView = lazy(() => import('./components/IAView').then((module) => ({ default: module.IAView })));
const ConfigView = lazy(() => import('./components/ConfigView').then((module) => ({ default: module.ConfigView })));

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
  const [quickTransactionType, setQuickTransactionType] = useState<'gasto' | 'ingreso'>('gasto');
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureKind, setQuickCaptureKind] = useState<CaptureKind>('tarea');
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(cloudSyncConfigured ? 'connecting' : 'unavailable');
  const [failedSyncModules, setFailedSyncModules] = useState<SyncModuleKey[]>([]);
  const [cloudConflict, setCloudConflict] = useState<{
    remoteState: LifeOSState;
    modules: SyncModuleKey[];
    remoteRevisions: SyncRevisionMap;
    localModules?: SyncModuleKey[];
    needsMigration?: boolean;
    conflicts?: SyncConflictItem[];
  } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [dismissedAnywhereBanner, setDismissedAnywhereBanner] = useState(false);

  const stateRef = useRef(state);
  const cloudUserRef = useRef<CloudUser | null>(null);
  const storageUserIdRef = useRef<string | null>(null);
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
  const deviceIdRef = useRef(getOrCreateDeviceId());

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
        stateRef.current = event.data.state;
        setStateObj({ state: event.data.state, storageBackend: 'localStorage' });
      }
    };
    return () => {
      channel.close();
      tabChannelRef.current = null;
    };
  }, []);

  const applyRemoteState = (remoteState: LifeOSState, userId = storageUserIdRef.current) => {
    const saved = saveStoredState(remoteState, userId);
    stateRef.current = remoteState;
    setStateObj({ state: remoteState, storageBackend: saved ? 'localStorage' : 'ninguno' });
  };

  const persistRevisionMap = (userId: string, revisions: SyncRevisionMap) => {
    revisionsRef.current = revisions;
    saveCloudRevisions(userId, revisions);
  };

  const persistBaselines = (userId: string, baselines: SyncBaselineMap) => {
    baselinesRef.current = baselines;
    saveCloudBaselines(userId, baselines);
  };

  const optimisticRevisionMap = (): SyncRevisionMap => {
    const entries = Object.entries(pendingRevisionsRef.current) as [SyncModuleKey, string[] | undefined][];
    const pending = Object.fromEntries(entries.flatMap(([module, revisions]) => {
      const latest = revisions?.at(-1);
      return latest ? [[module, latest]] : [];
    })) as SyncRevisionMap;
    return { ...revisionsRef.current, ...pending };
  };

  const flushCloudSave = () => {
    const user = cloudUserRef.current;
    const currentState = stateRef.current;
    const modules = [...queuedModulesRef.current];
    queuedModulesRef.current.clear();
    queuedStateRef.current = null;
    syncTimerRef.current = null;
    if (!cloudSyncConfigured || !user || modules.length === 0 || storageUserIdRef.current !== user.uid) return;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');

    void writeCloudModulesGuarded(user.uid, currentState, modules, deviceIdRef.current, optimisticRevisionMap(), tombstonesRef.current)
      .then((res) => {
        if (res.diverged) {
          // Divergencia de versión remota detectada: abortar escritura para no sobreescribir silenciosamente
          setSyncStatus('conflict');
          modules.forEach((mod) => queuedModulesRef.current.add(mod));
          return;
        }

        res.writes.forEach((write) => {
          pendingRevisionsRef.current[write.module] = [...(pendingRevisionsRef.current[write.module] || []), write.revision];
        });

        void res.completion
          .then(() => {
            retryAttemptRef.current = 0;
            if (retryTimeoutRef.current !== null) {
              window.clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = null;
            }
            res.writes.forEach((write) => {
              failedSyncModulesRef.current.delete(write.module);
              baselineDataRef.current[write.module] = syncModuleData(currentState, write.module);
            });
            saveCloudBaselineData(user.uid, baselineDataRef.current);
            setFailedSyncModules([...failedSyncModulesRef.current]);
            if (failedSyncModulesRef.current.size === 0) {
              setSyncStatus(navigator.onLine ? 'synced' : 'offline');
              setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
          })
          .catch((err) => {
            console.error('[CloudSync] Batch commit failed:', err);
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
        console.error('[CloudSync] Guarded write failed:', err);
        if (err && String(err.message).includes('Divergencia')) {
          setSyncStatus('conflict');
          modules.forEach((mod) => queuedModulesRef.current.add(mod));
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
      });
  };

  const queueCloudSave = (nextState: LifeOSState, modules: SyncModuleKey[]) => {
    const user = cloudUserRef.current;
    if (!cloudSyncConfigured || !user || modules.length === 0 || storageUserIdRef.current !== user.uid) return;
    modules.forEach((module) => queuedModulesRef.current.add(module));
    queuedStateRef.current = nextState;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(flushCloudSave, 400);
  };

  // Apply locally first; LifeOS remains usable even before the cloud acknowledges the change.
  const updateState = (updater: (draft: LifeOSState) => void) => {
    const previous = stateRef.current;
    const draft = structuredClone(previous) as LifeOSState;
    updater(draft);

    const deletedIds = detectDeletedEntityIds(previous, draft);
    if (deletedIds.length > 0 && cloudUserRef.current) {
      const currentTombstones = tombstonesRef.current;
      for (const id of deletedIds) {
        currentTombstones[id] = Date.now();
      }
      saveTombstones(cloudUserRef.current.uid, currentTombstones);
    }

    const saved = saveStoredState(draft, storageUserIdRef.current);
    stateRef.current = draft;
    if (!saved) {
      showToast('Error al persistir localmente: espacio lleno o almacenamiento restringido', 'error');
    }
    setStateObj(() => ({
      state: draft,
      storageBackend: saved ? 'localStorage' : 'ninguno',
    }));

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

    queueCloudSave(draft, changedSyncModules(previous, draft));
    return saved;
  };
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;

  useEffect(() => {
    if (!cloudSyncConfigured) return;
    setSyncStatus('connecting');
    return observeCloudUser((user) => {
      const previousUser = cloudUserRef.current;

      // Si el usuario es el mismo (ej. renovación de credenciales o evento interno), solo actualizamos datos y evitamos reiniciar la sincronización
      if (user && previousUser && user.uid === previousUser.uid) {
        cloudUserRef.current = user;
        setCloudUser(user);
        return;
      }

      cloudUserRef.current = user;
      pendingRevisionsRef.current = {};
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

      if (user) {
        const lastUserId = getLastCloudUserId();
        const scoped = loadStoredState(user.uid);
        storageUserIdRef.current = user.uid;
        revisionsRef.current = loadCloudRevisions(user.uid);
        baselinesRef.current = loadCloudBaselines(user.uid);
        baselineDataRef.current = loadCloudBaselineData(user.uid);
        tombstonesRef.current = loadTombstones(user.uid);

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

        markLastCloudUserId(user.uid);
        setStorageUserId(user.uid);
        setCloudUser(user);
        setSyncStatus(navigator.onLine ? 'connecting' : 'offline');
        return;
      }

      storageUserIdRef.current = null;
      revisionsRef.current = {};
      baselinesRef.current = {};
      baselineDataRef.current = {};
      tombstonesRef.current = {};
      setStorageUserId(null);
      setCloudUser(null);
      setSyncStatus('signed-out');
      if (previousUser) {
        const local = loadStoredState();
        stateRef.current = local.state;
        setStateObj({ state: local.state, storageBackend: local.backend });
      }
    });
  }, []);

  useEffect(() => {
    if (!cloudSyncConfigured || !cloudUser || storageUserId !== cloudUser.uid) return;
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
      const statesDiffer = !equivalentLifeOSState(localState, remoteState);
      const localHasData = hasMeaningfulData(localState);
      const remoteHasData = hasMeaningfulData(remoteState);
      const hasKnownRevisions = Object.keys(revisionsRef.current).length > 0;
      const paired = isCloudPaired(cloudUser.uid) && hasKnownRevisions;

      if (statesDiffer && localHasData && remoteHasData && !paired) {
        if (!conflictPendingRef.current) {
          conflictPendingRef.current = true;
          setCloudConflict({
            remoteState,
            modules: changedSyncModules(localState, remoteState),
            remoteRevisions,
            needsMigration,
          });
          setSyncStatus('conflict');
        }
        return;
      }

      if (statesDiffer && paired && !needsMigration) {
        const classification = classifyInitialModuleChanges(localState, remoteState, revisionsRef.current, baselinesRef.current, remoteRevisions);
        const localModules = classification.local;
        const conflictModules = classification.conflicts;
        const nextRevisions = { ...revisionsRef.current };
        const nextBaselines = { ...baselinesRef.current };
        let mergedState = localState;

        classification.remote.forEach((module) => {
          mergedState = applySyncModule(mergedState, module, syncModuleData(remoteState, module));
          nextRevisions[module] = remoteRevisions[module];
          nextBaselines[module] = syncModuleFingerprint(remoteState, module);
          baselineDataRef.current[module] = syncModuleData(remoteState, module);
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
          nextBaselines[module] = syncModuleFingerprint(mergedState, module);
          baselineDataRef.current[module] = syncModuleData(mergedState, module);
        });

        if (initialConflicts.length > 0) {
          saveSyncRecoverySnapshot(cloudUser.uid, 'local', localState);
          saveSyncRecoverySnapshot(cloudUser.uid, 'remote', remoteState);
          saveSyncRecoverySnapshot(cloudUser.uid, 'base', buildStateFromModules(baselineDataRef.current));
          setCloudConflict({
            remoteState,
            modules: conflictModules,
            remoteRevisions,
            conflicts: initialConflicts,
          });
          setSyncStatus('conflict');
          return;
        }

        storeRevisions(nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
        applyRemoteState(mergedState, cloudUser.uid);
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

      storeRevisions(remoteRevisions);
      persistBaselines(cloudUser.uid, Object.fromEntries(SYNC_MODULES.map((module) => [module, syncModuleFingerprint(remoteState, module)])) as SyncBaselineMap);
      saveCloudBaselineData(cloudUser.uid, Object.fromEntries(SYNC_MODULES.map((module) => [module, syncModuleData(remoteState, module)])));
      markCloudPaired(cloudUser.uid);
      initializedUserRef.current = cloudUser.uid;

      if (localHasData && !remoteHasData) {
        uploadAll(localState);
      } else if (remoteHasData) {
        applyRemoteState(remoteState, cloudUser.uid);
        if (needsMigration) uploadAll(remoteState);
        else setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } else {
        uploadAll(localState);
      }
    };

    return subscribeCloudModules(cloudUser.uid, {
      onSnapshot: (snapshot) => {
        const nextStatus: CloudSyncStatus = snapshot.pendingWrites
          ? navigator.onLine ? 'saving' : 'offline'
          : navigator.onLine ? 'synced' : 'offline';

        if (initializedUserRef.current !== cloudUser.uid) {
          if (snapshot.fromCache && navigator.onLine) {
            setSyncStatus('connecting');
            return;
          }

          if (snapshot.heads.length === 0) {
            if (legacyReadUserRef.current === cloudUser.uid) return;
            legacyReadUserRef.current = cloudUser.uid;
            void readLegacyCloudState(cloudUser.uid)
              .then((legacyState) => {
                if (cloudUserRef.current?.uid !== cloudUser.uid) return;
                if (legacyState) reconcileInitialState(legacyState, {}, true);
                else reconcileInitialState(defaultState(), {});
              })
              .catch(() => setSyncStatus(navigator.onLine ? 'error' : 'offline'));
            return;
          }

          const moduleData = Object.fromEntries(snapshot.heads.map((head) => [head.module, extractPureModuleData(head.data)]));
          const remoteRevisions = Object.fromEntries(snapshot.heads.map((head) => [head.module, head.revision])) as SyncRevisionMap;
          reconcileInitialState(buildStateFromModules(moduleData), remoteRevisions);
          return;
        }

        let nextState = stateRef.current;
        const nextRevisions = { ...revisionsRef.current };
        const nextBaselines = { ...baselinesRef.current };
        const modulesToUpload: SyncModuleKey[] = [];
        let appliedRemote = false;

        for (const head of snapshot.heads) {
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
          if (head.fromCache && !knownRevision) continue;

          const localDirty = nextBaselines[head.module]
            ? syncModuleFingerprint(nextState, head.module) !== nextBaselines[head.module]
            : false;

          if (pendingRevisions.length === 0 && !localDirty) {
            nextState = applySyncModule(nextState, head.module, pureHeadData);
            nextRevisions[head.module] = head.revision;
            nextBaselines[head.module] = syncDataFingerprint(pureHeadData);
            baselineDataRef.current[head.module] = pureHeadData;
            appliedRemote = true;
            continue;
          }

          // Concurrent modification: perform 3-way merge with conflict detection!
          const { state: mergedWithModule, conflicts: moduleConflicts } = mergeSyncModuleWithConflicts(
            nextState,
            head.module,
            pureHeadData,
            baselineDataRef.current[head.module],
            tombstonesRef.current
          );

          if (moduleConflicts.length > 0) {
            // Conflicto real detectado: no sobreescribir silenciosamente
            const remoteStateBuilt = buildStateFromModules({ [head.module]: pureHeadData });
            const baseStateBuilt = baselineDataRef.current[head.module]
              ? buildStateFromModules({ [head.module]: baselineDataRef.current[head.module] })
              : undefined;

            saveSyncRecoverySnapshot(cloudUser.uid, 'local', stateRef.current);
            saveSyncRecoverySnapshot(cloudUser.uid, 'remote', remoteStateBuilt);
            if (baseStateBuilt) saveSyncRecoverySnapshot(cloudUser.uid, 'base', baseStateBuilt);

            setCloudConflict({
              remoteState: remoteStateBuilt,
              modules: [head.module],
              remoteRevisions: { [head.module]: head.revision },
              conflicts: moduleConflicts,
            });
            setSyncStatus('conflict');
            return;
          }

          nextState = mergedWithModule;
          nextRevisions[head.module] = head.revision;
          nextBaselines[head.module] = syncDataFingerprint(pureHeadData);
          baselineDataRef.current[head.module] = syncModuleData(nextState, head.module);
          appliedRemote = true;
          modulesToUpload.push(head.module);
        }

        storeRevisions(nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        saveCloudBaselineData(cloudUser.uid, baselineDataRef.current);
        if (appliedRemote) applyRemoteState(nextState, cloudUser.uid);
        markCloudPaired(cloudUser.uid);

        if (modulesToUpload.length > 0) {
          queueCloudSave(nextState, modulesToUpload);
        }

        const statusAfterFailures = failedSyncModulesRef.current.size > 0 && nextStatus === 'synced' ? 'error' : nextStatus;
        setSyncStatus(statusAfterFailures);
        if (statusAfterFailures === 'synced') {
          setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      },
      onError: (err) => {
        console.error('[CloudSync] Snapshot error:', err);
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
      },
    });
  // The upload queue reads current values from refs; resubscribing on every
  // render would duplicate Firestore listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser, storageUserId]);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(cloudUserRef.current ? 'connecting' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
      if (cloudUserRef.current && failedSyncModulesRef.current.size > 0) {
        queueCloudSave(stateRef.current, [...failedSyncModulesRef.current]);
      }
    };
    const handleOffline = () => setSyncStatus(cloudUserRef.current ? 'offline' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
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
    setSyncStatus('connecting');
    try {
      await signInToCloud();
    } catch (error) {
      setSyncStatus('signed-out');
      showToast(error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.', 'error');
    }
  };

  const handleCloudSignOut = async () => {
    try {
      await signOutFromCloud();
    } catch {
      setSyncStatus('error');
    }
  };

  const handleForceSync = () => {
    if (!cloudUser) {
      void handleCloudSignIn();
      return;
    }
    showToast('Sincronizando con la nube...', 'info');
    queueCloudSave(stateRef.current, [...SYNC_MODULES]);
  };

  const handleRetrySync = () => {
    retryAttemptRef.current = 0;
    const modules = failedSyncModules.length ? failedSyncModules : [...SYNC_MODULES];
    queueCloudSave(stateRef.current, modules);
  };

  const handleUseLocalState = () => {
    if (!cloudUser || !cloudConflict) return;
    saveSyncRecoverySnapshot(cloudUser.uid, 'remote', cloudConflict.remoteState);
    saveRecoveryState(cloudConflict.remoteState, cloudUser.uid, 'cloud_conflict', 'Versión remota descartada al elegir datos locales');
    const baseRevisions = { ...revisionsRef.current, ...cloudConflict.remoteRevisions };
    persistRevisionMap(cloudUser.uid, baseRevisions);
    pendingRevisionsRef.current = {};
    failedSyncModulesRef.current.clear();
    setFailedSyncModules([]);
    markCloudPaired(cloudUser.uid);
    initializedUserRef.current = cloudUser.uid;
    conflictPendingRef.current = false;
    failedSyncModulesRef.current.clear();
    setFailedSyncModules([]);
    setCloudConflict(null);
    queueCloudSave(stateRef.current, [...SYNC_MODULES]);
  };

  const handleUseCloudState = () => {
    if (!cloudUser || !cloudConflict) return;
    saveSyncRecoverySnapshot(cloudUser.uid, 'local', stateRef.current);
    saveRecoveryState(stateRef.current, cloudUser.uid, 'cloud_conflict', 'Versión local descartada al elegir datos de la nube');
    applyRemoteState(cloudConflict.remoteState, cloudUser.uid);
    persistRevisionMap(cloudUser.uid, { ...revisionsRef.current, ...cloudConflict.remoteRevisions });
    const nextBaselines = { ...baselinesRef.current };
    cloudConflict.modules.forEach((module) => {
      nextBaselines[module] = syncModuleFingerprint(cloudConflict.remoteState, module);
    });
    persistBaselines(cloudUser.uid, nextBaselines);
    markCloudPaired(cloudUser.uid);
    initializedUserRef.current = cloudUser.uid;
    conflictPendingRef.current = false;
    const needsMigration = cloudConflict.needsMigration;
    setCloudConflict(null);
    if (needsMigration) queueCloudSave(cloudConflict.remoteState, [...SYNC_MODULES]);
    else if (cloudConflict.localModules?.length) queueCloudSave(cloudConflict.remoteState, cloudConflict.localModules);
    else setSyncStatus(navigator.onLine ? 'synced' : 'offline');
  };

  // Sync dark mode class to html document
  useEffect(() => {
    if (state.settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.settings.darkMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-mode', state.settings.privacyMode);
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
    onToggleCommandPalette: () => setIsSearchOpen((prev) => !prev),
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
      const targetView = isModuleHidden(stateRef.current, view) ? 'dashboard' : view;
      setCurrentView(targetView);
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
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
    if (focusId) handleQuickAction(view, focusId);
    else handleNavigate(view);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `lifeos_backup_${todayISO()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    updateState((draft) => {
      draft.settings.lastBackupAt = todayISO();
    });
  };

  const handleImportState = (imported: LifeOSState, description?: string) => {
    saveRecoveryState(stateRef.current, storageUserIdRef.current, 'import_backup', description || 'Previo a importar backup');
    updateState((draft) => {
      Object.assign(draft, imported);
    });
    if (cloudUserRef.current) {
      const user = cloudUserRef.current;
      const nextBaselines = { ...baselinesRef.current };
      SYNC_MODULES.forEach((mod) => {
        nextBaselines[mod] = syncModuleFingerprint(imported, mod);
      });
      persistBaselines(user.uid, nextBaselines);
      queueCloudSave(imported, [...SYNC_MODULES]);
    }
    showToast('Backup importado correctamente. Copia anterior guardada en recuperación.', 'success');
  };

  const handleResetData = () => {
    saveRecoveryState(stateRef.current, storageUserIdRef.current, 'reset_data', 'Previo a reiniciar datos a valores de fábrica');
    const def = defaultState();
    updateState((draft) => {
      Object.assign(draft, def);
    });
    if (cloudUserRef.current) {
      const user = cloudUserRef.current;
      const nextBaselines = { ...baselinesRef.current };
      SYNC_MODULES.forEach((mod) => {
        nextBaselines[mod] = syncModuleFingerprint(def, mod);
      });
      persistBaselines(user.uid, nextBaselines);
      queueCloudSave(def, [...SYNC_MODULES]);
    }
    showToast('Datos reiniciados a los valores por defecto. Copia anterior guardada en recuperación.', 'info');
  };

  const handleRestoreRecovery = () => {
    const recovery = loadRecoveryState(storageUserIdRef.current);
    if (!recovery) {
      showToast('No hay ninguna copia de recuperación disponible.', 'error');
      return;
    }
    // Proteger el estado actual antes de sobrescribir
    saveRecoveryState(stateRef.current, storageUserIdRef.current, 'manual_snapshot', 'Previo a restaurar copia de recuperación');
    updateState((draft) => {
      Object.assign(draft, recovery.state);
    });
    if (cloudUserRef.current) {
      const user = cloudUserRef.current;
      const nextBaselines = { ...baselinesRef.current };
      SYNC_MODULES.forEach((mod) => {
        nextBaselines[mod] = syncModuleFingerprint(recovery.state, mod);
      });
      persistBaselines(user.uid, nextBaselines);
      queueCloudSave(recovery.state, [...SYNC_MODULES]);
    }
    showToast('Copia de recuperación restaurada con éxito.', 'success');
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

  const handleCompleteOnboarding = (selectedModuleIds: ViewType[]) => {
    updateState((draft) => {
      draft.settings.onboardingCompleted = true;
      draft.settings.hiddenTabs = computeHiddenTabsFromSelection(
        selectedModuleIds,
        draft.settings.hiddenTabs
      );
    });
    setCurrentView('dashboard');
    showToast('¡Configuración inicial completada! Bienvenido a LifeOS.', 'success');
  };

  if (isPendingOnboarding) {
    return (
      <OnboardingView
        state={state}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col lg:flex-row antialiased selection:bg-blue-500/20 selection:text-blue-500">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        state={state}
        onNavigate={handleNavigate}
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
          onOpenCapture={() => setIsQuickCaptureOpen(true)}
          onTogglePrivacy={handleTogglePrivacy}
          cloudConfigured={cloudSyncConfigured}
          cloudUser={cloudUser}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          onCloudSignIn={handleCloudSignIn}
          onCloudSignOut={handleCloudSignOut}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">
          {cloudSyncConfigured && !cloudUser && !dismissedAnywhereBanner && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-3 sm:px-4 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-[var(--blue)] font-bold">
                  ☁️
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-[var(--text)] truncate">LifeOS Anywhere</p>
                  <p className="text-[11px] text-[var(--text-soft)] truncate">Conectá Google para sincronizar con tu celular.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCloudSignIn}
                  className="rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer"
                >
                  Conectar con Google
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedAnywhereBanner(true)}
                  className="p-1 text-sm font-bold text-[var(--text-faint)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  title="Descartar aviso"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {syncStatus === 'error' && (
            <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300 sm:flex-row sm:items-center">
              <div className="flex-1"><strong className="block text-sm">No se pudo subir {failedSyncModules.length === 1 && failedSyncModules[0] === 'gym' ? 'Gimnasio' : 'los últimos cambios'}</strong><span className="mt-0.5 block">Siguen guardados en este dispositivo. No vuelvas a cargarlos en la PC: reintentá la sincronización.</span></div>
              <button type="button" onClick={handleRetrySync} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">Reintentar</button>
            </div>
          )}
          {storageBackend === 'recovery' && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs font-semibold text-amber-700 dark:text-amber-300">
              LifeOS recuperó automáticamente la última copia local válida. Exportá un backup antes de seguir cargando datos.
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
                />
              )}

              {currentView === 'agenda' && (
                <AgendaView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'calendario' && (
                <CalendarioView state={state} onUpdateState={updateState} onNavigate={handleNavigate} />
              )}

              {currentView === 'trabajo' && (
                <TrabajoView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'reventa' && (
                <ReventaView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'finanzas' && (
                <FinanzasView
                  state={state}
                  onUpdateState={updateState}
                  initialTransactionType={quickTransactionType}
                />
              )}

              {currentView === 'gimnasio' && (
                <GimnasioView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'estudios' && (
                <EstudiosView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'notas' && (
                <NotasView state={state} onUpdateState={updateState} />
              )}

              {currentView === 'ia' && (
                <IAView state={state} onUpdateState={updateState} />
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
                  onForceSync={handleForceSync}
                />
              )}
            </Suspense>
          </AppErrorBoundary>
        </main>
      </div>

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <CheckoutModal
          state={state}
          onUpdateState={updateState}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}

      <MobileNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenCapture={() => {
          setQuickCaptureKind('tarea');
          setIsQuickCaptureOpen(true);
        }}
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

      <MobileQuickCapture
        state={state}
        open={isQuickCaptureOpen}
        initialKind={quickCaptureKind}
        onClose={() => setIsQuickCaptureOpen(false)}
        onUpdateState={updateState}
        onNavigate={handleNavigate}
      />

      {cloudConflict && (
        <CloudConflictModal
          modules={cloudConflict.modules}
          conflicts={cloudConflict.conflicts}
          onUseLocal={handleUseLocalState}
          onUseCloud={handleUseCloudState}
        />
      )}

      <GlobalSearchModal
        state={state}
        open={isSearchOpen}
        initialQuery={searchQuery}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleSearchNavigate}
        onUpdateState={updateState}
        onOpenCapture={() => {
          setQuickCaptureKind('tarea');
          setIsQuickCaptureOpen(true);
        }}
        onToggleTheme={handleToggleTheme}
        onTogglePrivacy={handleTogglePrivacy}
      />
      <button
        type="button"
        onClick={() => {
          setSearchQuery('');
          setIsSearchOpen(true);
        }}
        className="fixed bottom-20 right-3.5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md transition-all active:scale-95 lg:hidden"
        aria-label="Abrir Paleta de Comandos (Cmd + K)"
        title="Paleta de Comandos (Ctrl + K)"
      >
        <AppIcon name="search" className="h-4 w-4 text-[var(--blue)]" />
      </button>
      <ToastViewport />
      {isModuleEnabled(state, 'gimnasio') && (
        <GymRestOverlay state={state} onUpdateState={updateState} onOpenGym={() => handleNavigate('gimnasio')} />
      )}
      {!__LIFEOS_PORTABLE__ && <PwaUpdatePrompt />}
    </div>
  );
}
