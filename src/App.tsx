import React, { useState, useEffect } from 'react';
import { ViewType, LifeOSState } from './types';
import { loadStoredState, saveStoredState, todayISO } from './lib/storage';

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

export default function App() {
  const [{ state }, setStateObj] = useState(() => {
    const loaded = loadStoredState();
    return { state: loaded.state };
  });

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync state mutations to state and localStorage
  const updateState = (updater: (draft: LifeOSState) => void) => {
    setStateObj(({ state: oldState }) => {
      // Deep clone draft for immutability
      const draft = JSON.parse(JSON.stringify(oldState)) as LifeOSState;
      updater(draft);
      saveStoredState(draft);
      return { state: draft };
    });
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
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          updateState((draft) => {
            Object.assign(draft, parsed);
          });
          alert('¡Backup importado correctamente!');
        } else {
          alert('El archivo no tiene un formato válido.');
        }
      } catch (err) {
        alert('Error al leer el archivo JSON.');
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
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
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
            <FinanzasView state={state} onUpdateState={updateState} />
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
    </div>
  );
}
