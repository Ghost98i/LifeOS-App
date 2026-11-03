import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { GimnasioView } from '../../src/components/GimnasioView';
import { ToastViewport } from '../../src/components/ToastViewport';
import { defaultState } from '../../src/lib/storage';
import { resolveNextRestTimer } from '../../src/lib/gymFlows';
import { PrivacyProvider } from '../../src/components/PrivacyAmount';
import { GymIcon } from '../../src/components/visual/GymIcon';
import { GYM_ICON_DEFINITIONS } from '../../src/lib/gymIconRegistry';
import { cloudSyncConfigured } from '../../src/lib/cloudSync';
import type { LifeOSState } from '../../src/types';

const params = new URLSearchParams(location.search);
const scenario = params.get('state') || 'active';
const dark = params.get('theme') === 'dark';
const state = defaultState();
state.settings.darkMode = dark;
state.settings.onboardingCompleted = true;
state.settings.hiddenTabs = [];
state.settings.privacyMode = params.get('privacy') === 'on';
state.profile.height = 177.3;
state.profile.bodyCompositionSex = 'male';
state.gym.weight = [{ date: '2026-10-20', kg: 83.1 }, { date: '2026-11-01', kg: 82.4 }];
state.gym.measurements = [{ date: '2026-11-01', waist: 91.7 }];
state.gym.settings = { restBetweenSetsSeconds: 90, restBetweenExercisesSeconds: 120, autoTimerEnabled: true, showQuickRestAdjustments: true };
state.gym.routineTemplates = [{
  id: 'torso', name: 'Torso · fuerza y técnica con movimientos controlados', days: ['lunes'],
  exercises: [{ id: 'bench', name: 'Press banca plano con barra', muscleGroup: 'Pecho', equipment: 'barra', barWeight: 20,
    sets: [{ id: 'warmup', weight: 40, reps: 12, type: 'warmup', completed: false }, { id: 'work-1', weight: 72.5, reps: 8, completed: false }, { id: 'work-2', weight: 72.5, reps: 8, completed: false }] },
  { id: 'row', name: 'Remo sentado en polea baja con agarre neutro y pausa', muscleGroup: 'Espalda', equipment: 'polea', sets: [{ id: 'row-1', weight: 45, reps: 10, completed: false }, { id: 'row-2', weight: 45, reps: 10, completed: false }] },
  { id: 'custom', name: 'Movimiento personalizado sin clasificación confiable', muscleGroup: 'Otros', sets: [{ id: 'custom-1', weight: 0, reps: 10, completed: false }] }],
}, { id: 'empty', name: 'Rutina todavía sin ejercicios', exercises: [] }];
state.gym.sessions = Array.from({ length: 12 }, (_, index) => ({
  id: `history-${index}`, date: `2026-10-${String(30 - index * 2).padStart(2, '0')}`, status: 'completed', weekLabel: 'Torso', startedAt: '18:00', finishedAt: '18:50',
  exercises: structuredClone(state.gym.routineTemplates[0].exercises).map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set, weight: set.weight > 0 ? set.weight - 2.5 : 0, completed: true })) })),
}));
if (['active', 'rest', 'paused', 'minimized'].includes(scenario)) {
  const active = { id: 'active', date: '2026-11-02', weekLabel: state.gym.routineTemplates[0].name, status: 'active' as const, startedAt: '18:30', exercises: structuredClone(state.gym.routineTemplates[0].exercises) };
  state.gym.sessions.unshift(active);
  if (scenario !== 'active') {
    active.exercises[0].sets[0].completed = true;
    state.gym.activeTimer = resolveNextRestTimer(state.gym, active.id, 'bench', 0);
    if (scenario === 'paused' && state.gym.activeTimer) { state.gym.activeTimer.pausedAt = Date.now(); state.gym.activeTimer.remainingSecondsWhenPaused = 75; }
    if (scenario === 'minimized' && state.gym.activeTimer) state.gym.activeTimer.minimized = true;
  }
}
if (scenario === 'empty') { state.gym.routineTemplates = []; state.gym.sessions = []; state.gym.weight = []; state.gym.measurements = []; }
document.documentElement.classList.toggle('dark', dark);
document.documentElement.dataset.theme = dark ? 'dark' : 'light';

function Fixture() {
  const [value, setValue] = useState(state);
  const [saves, setSaves] = useState(0);
  React.useEffect(() => { document.documentElement.classList.toggle('privacy-mode', Boolean(value.settings.privacyMode)); }, [value.settings.privacyMode]);
  Object.assign(window, { gymRefinementState: value, gymRefinementSaves: saves, gymRefinementSetState: setValue, gymRefinementCloudConfigured: cloudSyncConfigured });
  return <PrivacyProvider active={Boolean(value.settings.privacyMode)}><main style={{ maxWidth: 1450, margin: 'auto', padding: '24px 16px 96px' }}>
    <GimnasioView state={value} storageUserId={null} onUpdateState={updater => {
      const next: LifeOSState = structuredClone(value); updater(next);
      if ((window as any).gymRefinementFailSave) return false;
      setValue(next); setSaves(count => count + 1); return true;
    }} /><ToastViewport />
    {scenario === 'icons' && <section aria-label="Catálogo de prueba" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 16, marginTop: 24 }}>
      {GYM_ICON_DEFINITIONS.map(item => <div key={item.id}><GymIcon icon={item.id} className="h-12 w-12" /><p>{item.label}</p></div>)}
      <GymIcon icon={'unknown' as any} label="Ícono desconocido" />
    </section>}
  </main></PrivacyProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
