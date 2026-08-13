import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ViewType, LifeOSState } from './types';
import { defaultState, loadStoredState, parseBackupJSON, saveRecoveryState, saveStoredState, todayISO } from './lib/storage';
import {
  cloudSyncConfigured,
  getLastCloudUserId,
  getOrCreateDeviceId,
  hasMeaningfulData,
  isCloudPaired,
  loadCloudBaselines,
  loadCloudRevisions,
  markCloudPaired,
  markLastCloudUserId,
  observeCloudUser,
  readLegacyCloudState,
  saveCloudRevisions,
  saveCloudBaselines,
  signInToCloud,
  signOutFromCloud,
  subscribeCloudModules,
  writeAllCloudModules,
  writeCloudModules,
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
  syncDataFingerprint,
  syncModuleData,
  syncModuleFingerprint,
  type SyncBaselineMap,
  type SyncModuleKey,
  type SyncRevisionMap,
} from './lib/syncModel';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

import { DashboardView } from './components/DashboardView';
import { CheckoutModal } from './components/CheckoutModal';
import { MobileQuickCapture } from './components/MobileQuickCapture';
import { MobileNav } from './components/MobileNav';
import { CloudConflictModal } from './components/CloudConflictModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ToastViewport } from './components/ToastViewport';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { showToast } from './lib/toast';

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
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [storageUserId, setStorageUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(cloudSyncConfigured ? 'connecting' : 'unavailable');
  const [cloudConflict, setCloudConflict] = useState<{
    remoteState: LifeOSState;
    modules: SyncModuleKey[];
    remoteRevisions: SyncRevisionMap;
    localModules?: SyncModuleKey[];
    needsMigration?: boolean;
  } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const stateRef = useRef(state);
  const cloudUserRef = useRef<CloudUser | null>(null);
  const storageUserIdRef = useRef<string | null>(null);
  const revisionsRef = useRef<SyncRevisionMap>({});
  const baselinesRef = useRef<SyncBaselineMap>({});
  const pendingRevisionsRef = useRef<Partial<Record<SyncModuleKey, string>>>({});
  const initializedUserRef = useRef<string | null>(null);
  const legacyReadUserRef = useRef<string | null>(null);
  const conflictPendingRef = useRef(false);
  const deviceIdRef = useRef(getOrCreateDeviceId());

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

  const queueCloudSave = (nextState: LifeOSState, modules: SyncModuleKey[]) => {
    const user = cloudUserRef.current;
    if (!cloudSyncConfigured || !user || modules.length === 0 || storageUserIdRef.current !== user.uid) return;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    const optimisticBase = { ...revisionsRef.current, ...pendingRevisionsRef.current } as SyncRevisionMap;
    const batch = writeCloudModules(user.uid, nextState, modules, deviceIdRef.current, optimisticBase);
    batch.writes.forEach((write) => { pendingRevisionsRef.current[write.module] = write.revision; });
    void batch.completion.catch(() => setSyncStatus(navigator.onLine ? 'error' : 'offline'));
  };

  // Apply locally first; LifeOS remains usable even before the cloud acknowledges the change.
  const updateState = (updater: (draft: LifeOSState) => void) => {
    const previous = stateRef.current;
    const draft = structuredClone(previous) as LifeOSState;
    updater(draft);
    const saved = saveStoredState(draft, storageUserIdRef.current);
    stateRef.current = draft;
    setStateObj(({ storageBackend: currentBackend }) => ({
      state: draft,
      storageBackend: saved ? 'localStorage' : currentBackend,
    }));
    queueCloudSave(draft, changedSyncModules(previous, draft));
  };

  useEffect(() => {
    if (!cloudSyncConfigured) return;
    setSyncStatus('connecting');
    return observeCloudUser((user) => {
      const previousUser = cloudUserRef.current;
      cloudUserRef.current = user;
      pendingRevisionsRef.current = {};
      initializedUserRef.current = null;
      legacyReadUserRef.current = null;

      if (user) {
        const lastUserId = getLastCloudUserId();
        const scoped = loadStoredState(user.uid);
        storageUserIdRef.current = user.uid;
        revisionsRef.current = loadCloudRevisions(user.uid);
        baselinesRef.current = loadCloudBaselines(user.uid);

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
      const optimisticBase = { ...revisionsRef.current, ...pendingRevisionsRef.current } as SyncRevisionMap;
      const batch = writeAllCloudModules(cloudUser.uid, nextState, deviceIdRef.current, optimisticBase);
      batch.writes.forEach((write) => { pendingRevisionsRef.current[write.module] = write.revision; });
      setSyncStatus(navigator.onLine ? 'saving' : 'offline');
      void batch.completion.catch(() => setSyncStatus(navigator.onLine ? 'error' : 'offline'));
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
        const conflictRevisions: SyncRevisionMap = {};
        const nextRevisions = { ...revisionsRef.current };
        const nextBaselines = { ...baselinesRef.current };
        let mergedState = localState;

        conflictModules.forEach((module) => { conflictRevisions[module] = remoteRevisions[module]; });
        classification.remote.forEach((module) => {
          mergedState = applySyncModule(mergedState, module, syncModuleData(remoteState, module));
          nextRevisions[module] = remoteRevisions[module];
          nextBaselines[module] = syncModuleFingerprint(remoteState, module);
        });

        storeRevisions(nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        applyRemoteState(mergedState, cloudUser.uid);
        markCloudPaired(cloudUser.uid);
        initializedUserRef.current = cloudUser.uid;

        if (conflictModules.length > 0) {
          let remoteConflictState = mergedState;
          conflictModules.forEach((module) => {
            remoteConflictState = applySyncModule(remoteConflictState, module, syncModuleData(remoteState, module));
          });
          conflictPendingRef.current = true;
          setCloudConflict({ remoteState: remoteConflictState, modules: conflictModules, remoteRevisions: conflictRevisions, localModules });
          setSyncStatus('conflict');
        } else {
          uploadModules(mergedState, localModules);
          if (localModules.length === 0) setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        }
        return;
      }

      storeRevisions(remoteRevisions);
      persistBaselines(cloudUser.uid, Object.fromEntries(SYNC_MODULES.map((module) => [module, syncModuleFingerprint(remoteState, module)])) as SyncBaselineMap);
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
          if (snapshot.fromCache) {
            setSyncStatus(navigator.onLine ? 'connecting' : 'offline');
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

          const moduleData = Object.fromEntries(snapshot.heads.map((head) => [head.module, head.data]));
          const remoteRevisions = Object.fromEntries(snapshot.heads.map((head) => [head.module, head.revision])) as SyncRevisionMap;
          reconcileInitialState(buildStateFromModules(moduleData), remoteRevisions);
          return;
        }

        let nextState = stateRef.current;
        const nextRevisions = { ...revisionsRef.current };
        const nextBaselines = { ...baselinesRef.current };
        const conflictModules: SyncModuleKey[] = [];
        const conflictRevisions: SyncRevisionMap = {};
        const conflictHeads: typeof snapshot.heads = [];
        let appliedRemote = false;

        for (const head of snapshot.heads) {
          const pendingRevision = pendingRevisionsRef.current[head.module];
          const knownRevision = nextRevisions[head.module] || null;

          if (pendingRevision === head.revision) {
            if (!head.pendingWrites) {
              delete pendingRevisionsRef.current[head.module];
              nextRevisions[head.module] = head.revision;
              nextBaselines[head.module] = syncDataFingerprint(head.data);
            }
            continue;
          }

          if (knownRevision === head.revision) {
            if (!nextBaselines[head.module]) nextBaselines[head.module] = syncDataFingerprint(head.data);
            continue;
          }
          if (head.fromCache && !knownRevision) continue;

          if (!pendingRevision && (!knownRevision || head.parentRevision === knownRevision)) {
            nextState = applySyncModule(nextState, head.module, head.data);
            nextRevisions[head.module] = head.revision;
            nextBaselines[head.module] = syncDataFingerprint(head.data);
            appliedRemote = true;
            continue;
          }

          conflictModules.push(head.module);
          conflictRevisions[head.module] = head.revision;
          conflictHeads.push(head);
        }

        let remoteConflictState = nextState;
        conflictHeads.forEach((head) => {
          remoteConflictState = applySyncModule(remoteConflictState, head.module, head.data);
        });

        storeRevisions(nextRevisions);
        persistBaselines(cloudUser.uid, nextBaselines);
        if (appliedRemote) applyRemoteState(nextState, cloudUser.uid);
        markCloudPaired(cloudUser.uid);

        if (conflictModules.length > 0) {
          if (!conflictPendingRef.current) {
            conflictPendingRef.current = true;
            setCloudConflict({ remoteState: remoteConflictState, modules: conflictModules, remoteRevisions: conflictRevisions });
          }
          setSyncStatus('conflict');
        } else {
          setSyncStatus(nextStatus);
          if (nextStatus === 'synced') setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      },
      onError: () => setSyncStatus(navigator.onLine ? 'error' : 'offline'),
    });
  }, [cloudUser, storageUserId]);

  useEffect(() => {
    const handleOnline = () => setSyncStatus(cloudUserRef.current ? 'connecting' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
    const handleOffline = () => setSyncStatus(cloudUserRef.current ? 'offline' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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

  const handleUseLocalState = () => {
    if (!cloudUser || !cloudConflict) return;
    saveRecoveryState(cloudConflict.remoteState, cloudUser.uid);
    const baseRevisions = { ...revisionsRef.current, ...cloudConflict.remoteRevisions };
    persistRevisionMap(cloudUser.uid, baseRevisions);
    pendingRevisionsRef.current = {};
    markCloudPaired(cloudUser.uid);
    initializedUserRef.current = cloudUser.uid;
    conflictPendingRef.current = false;
    setCloudConflict(null);
    queueCloudSave(stateRef.current, [...SYNC_MODULES]);
  };

  const handleUseCloudState = () => {
    if (!cloudUser || !cloudConflict) return;
    saveRecoveryState(stateRef.current, cloudUser.uid);
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
    const handleShortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
        setIsQuickCaptureOpen(false);
        setIsOpenMobile(false);
        setIsCheckoutOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setIsQuickCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, []);

  const handleToggleTheme = () => {
    updateState((draft) => {
      draft.settings.darkMode = !draft.settings.darkMode;
    });
  };

  const handleNavigate = (view: ViewType) => {
    if (view === 'checkout') {
      setIsCheckoutOpen(true);
    } else {
      setCurrentView(view);
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

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

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = parseBackupJSON(event.target?.result as string);
        updateState((draft) => {
          Object.assign(draft, imported);
        });
        showToast('Backup validado e importado correctamente.');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Error al leer el archivo JSON.', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

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
          cloudConfigured={cloudSyncConfigured}
          cloudUser={cloudUser}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          onCloudSignIn={handleCloudSignIn}
          onCloudSignOut={handleCloudSignOut}
        />

        <main className="flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {cloudSyncConfigured && !cloudUser && (
            <div className="flex flex-col gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-sm font-extrabold text-[var(--text)]">LifeOS Anywhere está listo</p>
                <p className="text-xs text-[var(--text-soft)]">Conectá tu cuenta de Google para compartir estos datos con el celular.</p>
              </div>
              <button onClick={handleCloudSignIn} className="rounded-xl bg-[var(--blue)] px-4 py-2.5 text-xs font-extrabold text-white">Conectar con Google</button>
            </div>
          )}
          {syncStatus === 'error' && (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700 dark:text-rose-300">
              No pude sincronizar ahora. Los cambios siguen guardados en este dispositivo y podés reintentar al recuperar conexión.
            </div>
          )}
          {storageBackend === 'recovery' && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs font-semibold text-amber-700 dark:text-amber-300">
              LifeOS recuperó automáticamente la última copia local válida. Exportá un backup antes de seguir cargando datos.
            </div>
          )}
          {/* View Router */}
          <Suspense fallback={<div role="status" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm font-bold text-[var(--text-soft)]">Abriendo módulo…</div>}>
          {currentView === 'dashboard' && (
            <DashboardView
              state={state}
              onUpdateState={updateState}
              onNavigate={handleNavigate}
              onExportJSON={handleExportJSON}
            />
          )}

          {currentView === 'agenda' && (
            <AgendaView state={state} onUpdateState={updateState} />
          )}

          {currentView === 'calendario' && (
            <CalendarioView state={state} onUpdateState={updateState} />
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
              storageUserId={storageUserId}
              cloudConnected={Boolean(cloudUser)}
            />
          )}
          </Suspense>
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
        onOpenCapture={() => setIsQuickCaptureOpen(true)}
        onOpenMore={() => setIsOpenMobile(true)}
      />

      <MobileQuickCapture
        state={state}
        open={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        onUpdateState={updateState}
      />

      {cloudConflict && (
        <CloudConflictModal modules={cloudConflict.modules} onUseLocal={handleUseLocalState} onUseCloud={handleUseCloudState} />
      )}

      <GlobalSearchModal
        state={state}
        open={isSearchOpen}
        initialQuery={searchQuery}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleSearchNavigate}
      />
      <ToastViewport />
      {!__LIFEOS_PORTABLE__ && <PwaUpdatePrompt />}
    </div>
  );
}
