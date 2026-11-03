import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveWorkoutView, type ActiveWorkoutViewProps } from '../components/ActiveWorkoutView';
import { GymIcon } from '../components/visual/GymIcon';
import { GYM_ICON_DEFINITIONS, resolveExerciseGymIcon, resolveRoutineIconAsset } from './gymIconRegistry';
import { getRoutineIdentity } from './gymAppearance';
import { BodyCompositionCard } from '../components/BodyCompositionCard';
import { PrivacyProvider } from '../components/PrivacyAmount';
import { defaultState } from './storage';

const noop = () => undefined;
function renderEditor(extra: Partial<ActiveWorkoutViewProps> = {}) {
  const props: ActiveWorkoutViewProps = {
    session: { id: 's', date: '2026-11-02', status: 'active', exercises: [{ id: 'e', name: 'Press banca', equipment: 'barra', sets: [{ id: 's1', weight: 40, reps: 10, completed: true }, { id: 's2', weight: 50, reps: 8, completed: false }] }] },
    exerciseIndex: 0, setIndex: 1, exerciseSuggestions: [], onSelectExercise: noop, onSelectSet: noop,
    onAdjustWeight: noop, onAdjustReps: noop, onUpdateCurrentSet: noop, onToggleCurrentSet: noop,
    onAddSet: noop, onDeleteSet: noop, onAddExercise: noop, onDeleteExercise: noop,
    onUpdateEquipment: noop, onUpdateBarWeight: noop, onPropagateExercise: noop, onOpenCalculator: noop,
    onOpenHistory: noop, onOpenHistoryTab: noop, onOpenProgressTab: noop, onFinish: noop,
    onDeleteSession: noop, onSaveAsTemplate: noop, onEditSessionDate: noop, onEditSessionWeek: noop, ...extra,
  };
  const before = structuredClone(props.session);
  const html = renderToStaticMarkup(React.createElement(ActiveWorkoutView, props));
  assert.deepEqual(props.session, before, 'presentation must not mutate performed or planned sets');
  return html;
}

for (const [label, effectiveCompleted, expectedCount, expectedVolume] of [
  ['warmup completed only', false, '1/2', '0'],
  ['warmup and effective completed', true, '2/2', '400'],
] as const) {
  test(`session presentation distinguishes performed sets from effective volume: ${label}`, () => {
    const html = renderEditor({
      session: { id: 'volume-context', date: '2026-11-02', status: 'active', exercises: [
        { id: 'exercise', name: 'Press banca', equipment: 'barra', sets: [
          { id: 'warmup', weight: 40, reps: 10, completed: true, type: 'warmup' },
          { id: 'effective', weight: 50, reps: 8, completed: effectiveCompleted, type: 'normal' },
        ] },
      ] },
    });
    assert.ok(html.includes(`${expectedCount} series realizadas`));
    assert.ok(html.includes(`Volumen efectivo: ${expectedVolume} kg (sin aproximaciones)`));
    assert.doesNotMatch(html, /kg realizados/);
  });
}

test('ambiguous movement words never identify unrelated equipment', () => {
  for (const name of ['Bicicleta abdominal', 'Cinta elástica', 'Extensión de tríceps en polea alta', 'Sentadilla búlgara', 'Fondos entre bancos', 'Press de hombros sentado']) {
    assert.equal(resolveExerciseGymIcon(name), 'gym-fallback', name);
  }
  assert.equal(resolveExerciseGymIcon('Extensión de tríceps en polea alta', 'polea'), 'gym-cable-machine');
  assert.equal(resolveExerciseGymIcon('Remo sentado con mancuerna', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveExerciseGymIcon('Press banca', 'corporal'), 'gym-fallback');
});

test('specific gym icons require compatible structured equipment or a reliable full movement name', () => {
  assert.equal(resolveExerciseGymIcon('Press de banca plano con barra', 'barra'), 'gym-bench-press');
  assert.equal(resolveExerciseGymIcon('Jalón al pecho', 'polea'), 'gym-lat-pulldown');
  assert.equal(resolveExerciseGymIcon('Cinta de correr'), 'gym-treadmill');
  assert.equal(resolveExerciseGymIcon('Sentadilla', 'barra'), 'gym-squat-rack');
  assert.equal(resolveExerciseGymIcon('Sentadilla', 'corporal'), 'gym-fallback');
});

test('automatic routine identity uses structured content over a contradictory title and stays neutral on ties', () => {
  const exercise = { name: 'Personalizado', muscleGroup: 'Espalda', sets: [] };
  assert.equal(getRoutineIdentity([exercise], 'Pecho').icon, 'gym-lat-pulldown');
  assert.equal(getRoutineIdentity([exercise, { ...exercise, muscleGroup: 'Pecho' }], 'Pecho').icon, 'gym-fallback');
  assert.equal(getRoutineIdentity([{ name: 'Sin clasificar', sets: [] }], 'Piernas').icon, 'gym-fallback');
  assert.equal(getRoutineIdentity([{ name: 'Bicicleta abdominal', equipment: 'mancuerna', sets: [] }], 'Cardio').icon, 'gym-fallback');
  assert.equal(getRoutineIdentity([exercise], 'Pecho', { icon: 'gym-rest' }).icon, 'gym-rest');
});

test('unknown and prototype-like icon IDs render the neutral resource without throwing', () => {
  for (const icon of ['missing', '__proto__', 'constructor']) {
    assert.match(renderToStaticMarkup(React.createElement(GymIcon, { icon: icon as any })), /data-gym-icon="gym-fallback"/);
    assert.equal(resolveRoutineIconAsset(icon as any), 'gym-fallback');
  }
});

test('all registered gym SVGs exist locally and retain a usable SVG viewBox', () => {
  for (const definition of GYM_ICON_DEFINITIONS.filter(item => item.src)) {
    const source = fs.readFileSync(`public/${definition.src!.replace(/^\/?/, '')}`, 'utf8');
    assert.match(source, /<svg\b/);
    assert.match(source, /viewBox=/);
  }
});

test('no matching previous set is not falsely described as a first session', () => {
  const html = renderEditor({ previousSet: null, previousSessionBest: '60 kg × 8' });
  assert.match(html, /Sin referencia para esta serie/);
  assert.match(html, /Mejor serie efectiva de esa sesión: 60 kg × 8/);
  assert.doesNotMatch(html, /Primera sesión/);
});

test('set selection announces the selected state without changing completion', () => {
  const html = renderEditor();
  assert.match(html, /aria-label="Serie 2: 50 kilogramos, 8 repeticiones, pendiente" aria-pressed="true"/);
  assert.match(html, /Serie 1: 40 kilogramos, 10 repeticiones, realizada/);
  assert.match(html, /Completar serie 2/);
});

test('the active rest workspace honors the existing quick-adjustment preference', () => {
  const activeTimer = { sessionId: 's', exerciseId: 'e', exerciseIndex: 0, setId: 's1', endsAt: Date.now() + 90000, durationSeconds: 90, kind: 'set' as const };
  const html = renderEditor({ activeTimer, showQuickRestAdjustments: false });
  assert.match(html, /Descanso entre series/);
  assert.doesNotMatch(html, /Sumar 30 segundos|Restar 30 segundos/);
  assert.match(renderEditor({ activeTimer, showQuickRestAdjustments: true }), /Sumar 30 segundos/);
  assert.doesNotMatch(html, /role="timer"[^>]*aria-live/);
});

test('body composition protects recorded and estimated values in DOM while retaining units and context when privacy is off', () => {
  const state = defaultState();
  state.profile.height = 177.3; state.profile.bodyCompositionSex = 'male';
  state.gym.weight = [{ date: '2026-11-01', kg: 82.4 }];
  state.gym.measurements = [{ date: '2026-11-01', waist: 91.7 }];
  const before = structuredClone(state);
  const view = (active: boolean) => renderToStaticMarkup(React.createElement(PrivacyProvider, { active, children: React.createElement(BodyCompositionCard, { state, onUpdateState: noop }) }));
  const hidden = view(true), visible = view(false);
  assert.doesNotMatch(hidden, /82\.4|91\.7/);
  assert.match(hidden, /Revelar importe/);
  assert.match(visible, /82\.4 kg/);
  assert.match(visible, /91\.7 cm cintura/);
  assert.match(visible, /no mediciones clínicas/);
  assert.deepEqual(state, before);
});

test('insufficient body measurements retain the missing-data explanation instead of clinical estimates', () => {
  const html = renderToStaticMarkup(React.createElement(BodyCompositionCard, { state: defaultState(), onUpdateState: noop }));
  assert.match(html, /Para calcular composición falta registrar/);
  assert.doesNotMatch(html, /Grasa · RFM|FFMI/);
});
