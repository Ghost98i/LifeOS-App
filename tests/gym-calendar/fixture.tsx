import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { GimnasioView } from '../../src/components/GimnasioView';
import { ToastViewport } from '../../src/components/ToastViewport';
import { defaultState } from '../../src/lib/storage';
import type { GymSession } from '../../src/types';

const params = new URLSearchParams(location.search);
const scenario = params.get('state') || 'filled';
const dark = params.get('theme') === 'dark';
const state = defaultState();
state.settings.darkMode = dark;
state.settings.onboardingCompleted = true;
state.settings.hiddenTabs = [];
const completed = (id: string, date: string, label = 'Fuerza'): GymSession => ({
  id, date, weekLabel: label, status: 'completed', startedAt: '18:30', finishedAt: '19:10',
  exercises: [{ id: 'press', name: 'Press con mancuernas', equipment: 'mancuerna', sets: [{ id: `set-${id}`, weight: 12, reps: 10, completed: true }] }],
});
state.gym.routineTemplates = [{ id: 'routine', name: 'Fuerza', days: ['lunes', 'miercoles', 'viernes'], exercises: [{ id: 'press', name: 'Press con mancuernas', equipment: 'mancuerna', sets: [{ id: 'target', weight: 12, reps: 10, completed: false }] }] }];
if (scenario !== 'empty') {
  state.gym.sessions = [completed('today-a', '2026-10-29'), completed('today-b', '2026-10-29', 'Movilidad y fuerza'), completed('monday', '2026-10-26'), completed('last-week', '2026-10-23'), completed('month-edge', '2026-09-30'), completed('old', '2024-01-31', 'Sesión histórica')];
  state.gym.sessions.push({ id: 'legacy', date: '2026-10-19', weekLabel: 'Registro anterior', exercises: [{ name: 'Remo', weight: 15, reps: '3x8', sets: [] }] });
  state.gym.sessions.push({ id: 'empty', date: '2026-10-28', status: 'completed', exercises: [] });
  state.gym.restDays = ['2026-10-27'];
}
if (scenario === 'invalid') state.gym.sessions.push(completed('invalid', '2026-02-30'), completed('missing', ''), completed('future', '2026-11-05'));
if (scenario === 'active') state.gym.sessions = [{ ...completed('active', '2026-10-29'), status: 'active', finishedAt: null }];
document.documentElement.classList.toggle('dark', dark);
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
function Fixture() {
  const [value, setValue] = useState(state);
  const [saves, setSaves] = useState(0);
  Object.assign(window, { gymFixtureState: value, gymFixtureSaves: saves, gymFixtureSetState: setValue });
  return <main style={{ maxWidth: 1450, margin: 'auto', padding: '24px 16px' }}>
    <GimnasioView state={value} storageUserId={null} onOpenNote={() => undefined} onUpdateState={updater => {
      if ((window as any).gymFixtureFailSave) return false;
      const next = structuredClone(value); updater(next); setValue(next); setSaves(saves + 1); return true;
    }} />
    <ToastViewport />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
