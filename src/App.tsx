import React, { useEffect, useRef, useState } from 'react';
import { ViewType, LifeOSState } from './types';
import { loadStoredState, parseBackupJSON, saveStoredState, todayISO } from './lib/storage';
import {
  cloudSyncConfigured,
  getOrCreateDeviceId,
  hasMeaningfulData,
  isCloudPaired,
  markCloudPaired,
  observeCloudUser,
  signInToCloud,
  signOutFromCloud,
  subscribeCloudState,
  writeCloudState,
  type CloudSyncStatus,
  type CloudUser,
} from './lib/cloudSync';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

import { DashboardView } from './components/DashboardView';
import { AgendaView } from './components/AgendaView';
import { CalendarioView } from './components/CalendarioView';
import { TrabajoView } from './components/TrabajoView';
import { ReventaView } from './components/ReventaView';
import { FinanzasView } from './components/FinanzasView';
import { GimnasioView } from './components/GimnasioView';
import { EstudiosView } from './components/EstudiosView';
import { NotasView } from './components/NotasView';
import { IAView } from './components/IAView';
import { ConfigView } from './components/ConfigView';
import { CheckoutModal } from './components/CheckoutModal';
import { MobileQuickCapture } from './components/MobileQuickCapture';
import { MobileNav } from './components/MobileNav';
import { CloudConflictModal } from './components/CloudConflictModal';

export default function App() {
  const [{ state, storageBackend }, setStateObj] = useState(() => {
    const loaded = loadStoredState();
    return { state: loaded.state, storageBackend: loaded.backend };
  });

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickTransactionType, setQuickTransactionType] = useState<'gasto' | 'ingreso'>('gasto');
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(cloudSyncConfigured ? 'connecting' : 'unavailable');
  const [cloudConflict, setCloudConflict] = useState<LifeOSState | null>(null);

  const stateRef = useRef(state);
  const cloudUserRef = useRef<CloudUser | null>(null);
  const conflictPendingRef = useRef(false);
  const preferLocalUploadRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const deviceIdRef = useRef(getOrCreateDeviceId());

  const applyRemoteState = (remoteState: LifeOSState) => {
    const saved = saveStoredState(remoteState);
    stateRef.current = remoteState;
    setStateObj({ state: remoteState, storageBackend: saved ? 'localStorage' : 'ninguno' });
  };

  const queueCloudSave = (nextState: LifeOSState, immediate = false) => {
    const user = cloudUserRef.current;
    if (!cloudSyncConfigured || !user) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');

    syncTimerRef.current = window.setTimeout(() => {
      void writeCloudState(user.uid, nextState, deviceIdRef.current).catch(() => setSyncStatus('error'));
    }, immediate ? 0 : 600);
  };

  // Apply locally first; LifeOS remains usable even before the cloud acknowledges the change.
  const updateState = (updater: (draft: LifeOSState) => void) => {
    const draft = JSON.parse(JSON.stringify(stateRef.current)) as LifeOSState;
    updater(draft);
    const saved = saveStoredState(draft);
    stateRef.current = draft;
    setStateObj(({ storageBackend: currentBackend }) => ({
      state: draft,
      storageBackend: saved ? 'localStorage' : currentBackend,
    }));
    queueCloudSave(draft);
  };

  useEffect(() => {
    if (!cloudSyncConfigured) return;
    setSyncStatus('connecting');
    return observeCloudUser((user) => {
      cloudUserRef.current = user;
      setCloudUser(user);
      setSyncStatus(user ? (navigator.onLine ? 'connecting' : 'offline') : 'signed-out');
    });
  }, []);

  useEffect(() => {
    if (!cloudSyncConfigured || !cloudUser) return;
    conflictPendingRef.current = false;

    return subscribeCloudState(cloudUser.uid, {
      onMissing: () => {
        markCloudPaired(cloudUser.uid);
        queueCloudSave(stateRef.current, true);
      },
      onState: (snapshot) => {
        const nextStatus: CloudSyncStatus = snapshot.pendingWrites
          ? navigator.onLine ? 'saving' : 'offline'
          : navigator.onLine ? 'synced' : 'offline';

        if (snapshot.deviceId === deviceIdRef.current) {
          preferLocalUploadRef.current = false;
          markCloudPaired(cloudUser.uid);
          setSyncStatus(nextStatus);
          return;
        }

        if (preferLocalUploadRef.current) {
          setSyncStatus(navigator.onLine ? 'saving' : 'offline');
          return;
        }

        const localState = stateRef.current;
        const alreadyPaired = isCloudPaired(cloudUser.uid);
        const statesDiffer = JSON.stringify(localState) !== JSON.stringify(snapshot.state);

        if (!alreadyPaired && statesDiffer && hasMeaningfulData(localState) && hasMeaningfulData(snapshot.state)) {
          if (!conflictPendingRef.current) {
            conflictPendingRef.current = true;
            setCloudConflict(snapshot.state);
            setSyncStatus('conflict');
          }
          return;
        }

        if (!alreadyPaired && hasMeaningfulData(localState) && !hasMeaningfulData(snapshot.state)) {
          markCloudPaired(cloudUser.uid);
          queueCloudSave(localState, true);
          return;
        }

        applyRemoteState(snapshot.state);
        markCloudPaired(cloudUser.uid);
        setSyncStatus(nextStatus);
      },
      onError: () => setSyncStatus(navigator.onLine ? 'error' : 'offline'),
    });
  }, [cloudUser?.uid]);

  useEffect(() => {
    const handleOnline = () => setSyncStatus(cloudUserRef.current ? 'connecting' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
    const handleOffline = () => setSyncStatus(cloudUserRef.current ? 'offline' : cloudSyncConfigured ? 'signed-out' : 'unavailable');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const handleCloudSignIn = async () => {
    setSyncStatus('connecting');
    try {
      await signInToCloud();
    } catch (error) {
      setSyncStatus('signed-out');
      alert(error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.');
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
    if (!cloudUser) return;
    preferLocalUploadRef.current = true;
    markCloudPaired(cloudUser.uid);
    conflictPendingRef.current = false;
    setCloudConflict(null);
    queueCloudSave(stateRef.current, true);
  };

  const handleUseCloudState = () => {
    if (!cloudUser || !cloudConflict) return;
    applyRemoteState(cloudConflict);
    markCloudPaired(cloudUser.uid);
    conflictPendingRef.current = false;
    setCloudConflict(null);
    setSyncStatus(navigator.onLine ? 'synced' : 'offline');
  };

  // Sync dark mode class to html document
  useEffect(() => {
    if (state.settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.settings.darkMode]);

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
        alert('¡Backup validado e importado correctamente!');
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Error al leer el archivo JSON.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Global search filtering
  const searchResults = searchQuery.trim()
    ? {
        transactions: state.finance.transactions.filter(
          (t) =>
            t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.note && t.note.toLowerCase().includes(searchQuery.toLowerCase()))
        ),
        jobs: state.jobs.applications.filter(
          (a) =>
            a.empresa.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.puesto.toLowerCase().includes(searchQuery.toLowerCase())
        ),
        notes: state.notes.postits.filter((p) => p.text.toLowerCase().includes(searchQuery.toLowerCase())),
        subjects: state.study.subjects.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase())),
      }
    : null;

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
          state={state}
          onOpenMobileNav={() => setIsOpenMobile(true)}
          onQuickAction={handleQuickAction}
          onSearch={(q) => setSearchQuery(q)}
          cloudConfigured={cloudSyncConfigured}
          cloudUser={cloudUser}
          syncStatus={syncStatus}
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
          {/* Global Search Results Overlay Banner if search active */}
          {searchResults && (
            <div className="bg-[var(--card)] border border-[var(--blue)] rounded-2xl p-5 space-y-4 shadow-lg relative">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[var(--text)] flex items-center gap-2">
                  ⌕ Resultados para "{searchQuery}"
                </h3>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-[var(--text-faint)] hover:text-red-500"
                >
                  ✕ Cerrar búsqueda
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Transactions */}
                <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                  <span className="font-bold text-[var(--text-soft)] block mb-1">💰 Finanzas ({searchResults.transactions.length})</span>
                  {searchResults.transactions.slice(0, 4).map((t) => (
                    <div key={t.id} className="py-1 flex justify-between">
                      <span className="truncate">{t.category} - {t.note || 'Sin nota'}</span>
                      <span className="font-mono font-bold">${t.amount}</span>
                    </div>
                  ))}
                </div>

                {/* Job Apps */}
                <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                  <span className="font-bold text-[var(--text-soft)] block mb-1">💼 Empleo ({searchResults.jobs.length})</span>
                  {searchResults.jobs.slice(0, 4).map((a) => (
                    <div key={a.id} className="py-1 flex justify-between">
                      <span className="truncate">{a.empresa} - {a.puesto}</span>
                      <span className="font-bold text-blue-500">{a.estado}</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                  <span className="font-bold text-[var(--text-soft)] block mb-1">📝 Post-its ({searchResults.notes.length})</span>
                  {searchResults.notes.slice(0, 4).map((p) => (
                    <div key={p.id} className="py-1 truncate">
                      {p.text}
                    </div>
                  ))}
                </div>

                {/* Subjects */}
                <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                  <span className="font-bold text-[var(--text-soft)] block mb-1">📚 Materias ({searchResults.subjects.length})</span>
                  {searchResults.subjects.slice(0, 4).map((s) => (
                    <div key={s.id} className="py-1 font-bold">
                      {s.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* View Router */}
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
            />
          )}
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
        <CloudConflictModal onUseLocal={handleUseLocalState} onUseCloud={handleUseCloudState} />
      )}
    </div>
  );
}
