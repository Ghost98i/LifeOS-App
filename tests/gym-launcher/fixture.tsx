import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { GimnasioView } from '../../src/components/GimnasioView';
import { ToastViewport } from '../../src/components/ToastViewport';
import { defaultState, todayISO } from '../../src/lib/storage';
import type { DayKey, LifeOSState, RoutineTemplate } from '../../src/types';

const params = new URLSearchParams(location.search);
const scenario = params.get('state') || 'unique';
const dark = params.get('theme') === 'dark';
const state = defaultState();
state.settings.darkMode = dark; state.settings.onboardingCompleted = true; state.settings.hiddenTabs = [];
const today = todayISO();
const day = (['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as DayKey[])[new Date(`${today}T12:00:00`).getDay()];
const routine = (id: string, name: string, days: DayKey[]): RoutineTemplate => ({ id, name, days, exercises: [{ id: `exercise-${id}`, name: `Ejercicio de ${name}`, equipment: 'mancuerna', sets: [{ id: `target-${id}`, weight: 12, reps: 10, completed: false }] }] });
state.gym.routineTemplates = [routine('pecho', 'Pecho', [day]), routine('espalda', 'Espalda', [])];
if (scenario === 'none' || scenario === 'rest') state.gym.routineTemplates[0].days = [];
if (scenario === 'multiple') state.gym.routineTemplates[1].days = [day];
if (scenario === 'rest' || scenario === 'conflict') state.gym.restDays = [today];
if (scenario === 'checkout-rest') state.checkoutLog[today] = { trainedSkipped: true };
if (scenario === 'empty-routine') state.gym.routineTemplates[0].exercises = [];
if (scenario === 'no-routines') state.gym.routineTemplates = [];
state.gym.sessions = [{ id: 'old', date: '2024-01-31', status: 'completed', weekLabel: 'Sesión histórica', exercises: [{ name: 'Remo', sets: [{ id: 'old-set', weight: 20, reps: 8, completed: true }] }] }];
if (scenario === 'completed') state.gym.sessions.push({ id: 'today', date: today, status: 'completed', weekLabel: 'Pecho', startedAt: '09:00', finishedAt: '09:45', exercises: [{ name: 'Press', sets: [{ id: 'today-set', weight: 30, reps: 8, completed: true }] }] });
if (scenario === 'active') state.gym.sessions.push({ id: 'active', date: '2026-10-29', status: 'active', weekLabel: 'Sesión pendiente', startedAt: '18:30', exercises: [{ name: 'Remo', sets: [{ id: 'active-done', weight: 20, reps: 8, completed: true }, { id: 'active-todo', weight: 22, reps: 8, completed: false }] }] });
document.documentElement.classList.toggle('dark', dark); document.documentElement.dataset.theme = dark ? 'dark' : 'light';
function Fixture() {
  const [value, setValue] = useState(state); const [saves, setSaves] = useState(0);
  Object.assign(window, { gymLauncherState: value, gymLauncherSaves: saves, gymLauncherSetState: setValue });
  return <main style={{ maxWidth: 1450, margin: 'auto', padding: '24px 16px' }}>
    <GimnasioView state={value} storageUserId={null} onOpenNote={() => undefined} onUpdateState={updater => {
      if ((window as any).gymLauncherFailSave) return false;
      const next: LifeOSState = structuredClone(value); updater(next); setValue(next); setSaves(count => count + 1); return true;
    }} /><ToastViewport />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
