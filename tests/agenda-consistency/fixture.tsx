import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { defaultState } from '../../src/lib/storage';
import { DashboardView } from '../../src/components/DashboardView';
import { AgendaView } from '../../src/components/AgendaView';
import { CalendarioView } from '../../src/components/CalendarioView';
import type { ViewType } from '../../src/types';

const params = new URLSearchParams(location.search); const state = defaultState();
state.settings.darkMode = params.get('theme') === 'dark'; state.settings.hiddenTabs = []; state.settings.onboardingCompleted = true;
state.profile.name = 'Prueba';
state.todayExtras = [{ id: 'synthetic-medusa-task', text: 'gaste 5000 en la medusa', date: '2026-10-30', done: false, priority: 'media' }];
state.agenda.viernes = [{ id: 'weekly', activity: 'Clases', time: '08:00' }];
state.tasksRecurring = [{ id: 'routine', name: 'Repasar apuntes', freq: 'weekly', days: ['viernes'] }];
document.documentElement.classList.toggle('dark', state.settings.darkMode); document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light';
function Fixture() {
  const [value, setValue] = useState(state); const [view, setView] = useState<ViewType>((params.get('view') as ViewType) || 'dashboard');
  const [focus, setFocus] = useState<string | null>(null); const [date, setDate] = useState<string | null>(null); const [nonce, setNonce] = useState(0); const [saves, setSaves] = useState(0);
  const navigateToRecord = (target: ViewType, options?: { tab?: string; focusId?: string; date?: string }) => { setView(target); setFocus(options?.focusId || null); setDate(options?.date || null); setNonce(n => n + 1); };
  const update = (updater: (draft: typeof state) => void) => { const next = structuredClone(value); updater(next); setValue(next); setSaves(n => n + 1); return true; };
  Object.assign(window, { agendaFixtureState: value, agendaFixtureSetState: setValue, agendaFixtureSaves: saves, agendaFixtureView: view });
  return <main style={{ maxWidth: 1550, margin: 'auto', padding: 20 }}>
    <nav aria-label="Módulos de prueba" style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
      {([['dashboard', 'Hoy'], ['agenda', 'Agenda'], ['calendario', 'Calendario']] as const).map(([target, label]) => <button type="button" key={target} onClick={() => navigateToRecord(target)}>{label}</button>)}
    </nav>
    {view === 'dashboard' && <DashboardView state={value} onExportJSON={() => undefined} onUpdateState={update} onNavigate={setView} onNavigateToRecord={navigateToRecord} initialFocusId={focus} focusNonce={nonce} />}
    {view === 'agenda' && <AgendaView state={value} onUpdateState={update} onNavigateToRecord={navigateToRecord} initialFocusId={focus} initialDate={date} focusNonce={nonce} />}
    {view === 'calendario' && <CalendarioView state={value} onUpdateState={update} onNavigate={setView} onNavigateToRecord={navigateToRecord} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
