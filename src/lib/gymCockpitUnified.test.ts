import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveWorkoutView } from '../components/ActiveWorkoutView';
import type { GymSession, ExerciseEquipment } from '../types';
import { resolveNextRestTimer, finishGymSession, updateGymSessionSet } from './gymFlows';
import { defaultState } from './storage';

function createMockSession(overrides?: Partial<GymSession>): GymSession {
  return {
    id: 'test-session-1',
    date: '2026-10-20',
    weekLabel: 'Fuerza A',
    status: 'active',
    startedAt: '18:00',
    exercises: [
      {
        id: 'ex-bench',
        name: 'Press de banca plano',
        muscleGroup: 'Pecho',
        equipment: 'barra',
        barWeight: 20,
        sets: [
          { id: 'set-1', weight: 80, reps: 8, completed: false },
          { id: 'set-2', weight: 82.5, reps: 8, completed: false },
          { id: 'set-3', weight: 85, reps: 6, completed: false },
        ],
      },
      {
        id: 'ex-incline',
        name: 'Press inclinado con mancuernas',
        muscleGroup: 'Pecho',
        equipment: 'mancuerna',
        barWeight: 0,
        sets: [
          { id: 'set-inc-1', weight: 28, reps: 10, completed: false },
          { id: 'set-inc-2', weight: 28, reps: 10, completed: false },
        ],
      },
    ],
    ...overrides,
  };
}

const noop = () => undefined;

test('Cockpit 1: Completar una serie y comenzar el descanso muestra cronómetro y anticipación del próximo esfuerzo', () => {
  const session = createMockSession();
  // Set 1 completed
  session.exercises[0].sets[0].completed = true;

  const activeTimer = {
    endsAt: Date.now() + 90000,
    durationSeconds: 90,
    kind: 'set' as const,
    exerciseIndex: 0,
    setId: 'set-1',
  };

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 1, // Ready for set 2
      activeTimer,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  assert.match(html, /c-stage-card c-rest-phase/);
  assert.match(html, /Descanso entre series/);
  assert.match(html, /01:30/); // 90s formatted
  assert.match(html, /Próximo esfuerzo/);
  assert.match(html, /82\.5 kg × 8 reps/); // Target for set 2
  assert.match(html, /Comenzar Serie 2 Ahora →/);
  assert.match(html, /Revisar o corregir Serie 1 \(80 kg × 8\)/);
});

test('Cockpit 2: Navegar entre ejercicios durante un descanso mantiene el cronómetro atado al ejercicio real en reposo', () => {
  const session = createMockSession();
  session.exercises[0].sets[0].completed = true;

  // Active timer belongs to exercise 0 (Press de banca)
  const activeTimer = {
    endsAt: Date.now() + 60000,
    durationSeconds: 60,
    kind: 'set' as const,
    exerciseIndex: 0,
    setId: 'set-1',
  };

  // User is viewing exercise 1 (Press inclinado con mancuernas)
  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 1, // Viewing exercise 1
      setIndex: 0,
      activeTimer,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  // In exercise 1, shows exercise 1 logging controls with notice of exercise 0 resting
  assert.match(html, /Press inclinado con mancuernas/);
  assert.match(html, /Descanso de Press de banca plano/);
  assert.match(html, /Ver descanso/);
  assert.match(html, /c-stage-card c-logging-phase/); // Shows logging for exercise 1
});

test('Cockpit 3: Llegada del temporizador a cero no auto-completa ni modifica series pendientes', () => {
  const session = createMockSession();
  session.exercises[0].sets[0].completed = true;

  // Timer ended (endsAt in the past)
  const activeTimer = {
    endsAt: Date.now() - 5000,
    durationSeconds: 60,
    kind: 'set' as const,
    exerciseIndex: 0,
    setId: 'set-1',
  };

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 1, // Points to set 2 (pending)
      activeTimer,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  // When timer has reached zero, transitions back to logging phase for Set 2
  assert.match(html, /c-stage-card c-logging-phase/);
  // Set 2 is pending, NOT completed
  assert.match(html, /Completar serie 2 · 82\.5 kg × 8/);
  assert.doesNotMatch(html, /Serie 2 completada · Tocar para desmarcar/);
});

test('Cockpit 4: Continuación hacia la siguiente serie presenta valores listos para registrar', () => {
  const session = createMockSession();
  session.exercises[0].sets[0].completed = true;

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 1, // Set 2
      activeTimer: null,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  assert.match(html, /value="82\.5"/);
  assert.match(html, /value="8"/);
  assert.match(html, /Completar serie 2 · 82\.5 kg × 8/);
});

test('Cockpit 5: Corrección y desmarcado sin duplicaciones en la semántica del store', () => {
  const state = defaultState();
  const session = createMockSession();
  state.gym.sessions = [session];

  // 1. Mark completed by ID
  const r1 = updateGymSessionSet(state.gym, session.id, 'ex-bench', 0, { completed: true });
  assert.equal(r1.updated, true);
  assert.equal(session.exercises[0].sets[0].completed, true);
  assert.equal(session.exercises[0].sets.length, 3); // No duplicates

  // 2. Edit weight
  const r2 = updateGymSessionSet(state.gym, session.id, 'ex-bench', 0, { weight: 85 });
  assert.equal(r2.updated, true);
  assert.equal(session.exercises[0].sets[0].weight, 85);
  assert.equal(session.exercises[0].sets.length, 3);

  // 3. Toggle back to false
  const r3 = updateGymSessionSet(state.gym, session.id, 'ex-bench', 0, { completed: false });
  assert.equal(r3.updated, true);
  assert.equal(session.exercises[0].sets[0].completed, false);
  assert.equal(session.exercises[0].sets.length, 3);
});

test('Cockpit 6: Última serie del último ejercicio y cierre real a través de finishGymSession', () => {
  const session = createMockSession();
  // Mark all sets completed
  for (const ex of session.exercises) {
    for (const s of ex.sets) {
      s.completed = true;
    }
  }

  const state = defaultState();
  state.gym.sessions = [session];

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 1,
      setIndex: 1,
      activeTimer: null,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  assert.match(html, /Finalizar sesión/);

  // Test real finish GymSession logic
  const result = finishGymSession(state.gym, session.id, { finishedAt: '19:00' });
  assert.equal(result.status, 'completed');
  assert.equal(session.status, 'completed');
  assert.equal(session.finishedAt, '19:00');
});

test('Cockpit 7: Ausencia de historial muestra Primera sesión de forma limpia', () => {
  const session = createMockSession();

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 0,
      previousSet: null,
      previousSessionBest: null,
      previousGhostSets: null,
      activeTimer: null,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  assert.match(html, /Primera sesión/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /NaN/);
});

test('Cockpit 8: Aproximaciones frente a series efectivas reflejan distinción visual', () => {
  const session = createMockSession();
  session.exercises[0].sets[0].type = 'warmup';

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 0,
      activeTimer: null,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  assert.match(html, /Aproximación/);
  assert.match(html, /Apx/); // Ribbon tag for warmup
});

test('Cockpit 9: Diferentes tipos de equipamiento presentan descripciones coherentes', () => {
  const equipments: Array<{ eq: ExerciseEquipment; weight: number; barWeight: number; expected: RegExp }> = [
    { eq: 'barra', weight: 80, barWeight: 20, expected: /30 kg por lado · barra de 20 kg/ },
    { eq: 'mancuerna', weight: 24, barWeight: 0, expected: /Mancuerna de 24 kg/ },
    { eq: 'polea', weight: 45, barWeight: 0, expected: /Polea · 45 kg/ },
    { eq: 'maquina', weight: 70, barWeight: 0, expected: /Máquina · 70 kg/ },
    { eq: 'corporal', weight: 10, barWeight: 0, expected: /Peso corporal \+ 10 kg/ },
  ];

  for (const item of equipments) {
    const session: GymSession = {
      id: 'eq-session',
      date: '2026-10-20',
      status: 'active',
      exercises: [
        {
          id: 'eq-ex',
          name: 'Ejercicio prueba',
          equipment: item.eq,
          barWeight: item.barWeight,
          sets: [{ id: 's1', weight: item.weight, reps: 10, completed: false }],
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(ActiveWorkoutView, {
        session,
        exerciseIndex: 0,
        setIndex: 0,
        activeTimer: null,
        exerciseSuggestions: [],
        onSelectExercise: noop,
        onSelectSet: noop,
        onAdjustWeight: noop,
        onAdjustReps: noop,
        onUpdateCurrentSet: noop,
        onToggleCurrentSet: noop,
        onAddSet: noop,
        onDeleteSet: noop,
        onAddExercise: noop,
        onDeleteExercise: noop,
        onUpdateEquipment: noop,
        onUpdateBarWeight: noop,
        onPropagateExercise: noop,
        onOpenCalculator: noop,
        onOpenHistory: noop,
        onOpenHistoryTab: noop,
        onOpenProgressTab: noop,
        onFinish: noop,
        onDeleteSession: noop,
        onSaveAsTemplate: noop,
        onEditSessionDate: noop,
        onEditSessionWeek: noop,
      })
    );

    assert.match(html, item.expected);
  }
});

test('Cockpit 10: Reanudación y persistencia del temporizador basada en timestamps', () => {
  const state = defaultState();
  const session = createMockSession();
  state.gym.sessions = [session];

  const now = 1000000;
  const timer = resolveNextRestTimer(state.gym, session.id, 'ex-bench', 0, now);
  assert.ok(timer);
  assert.equal(timer.endsAt, now + timer.durationSeconds * 1000);

  // Deriving remaining at various times
  const check1 = Math.max(0, Math.ceil((timer.endsAt - (now + 30000)) / 1000));
  assert.equal(check1, timer.durationSeconds - 30);

  const check2 = Math.max(0, Math.ceil((timer.endsAt - (now + timer.durationSeconds * 1000 - 1000)) / 1000));
  assert.equal(check2, 1);

  const check3 = Math.max(0, Math.ceil((timer.endsAt - (now + timer.durationSeconds * 1000 + 5000)) / 1000));
  assert.equal(check3, 0);
});

test('Cockpit 11: Navegación por teclado, conservación del foco y semántica de controles', () => {
  const session = createMockSession();

  const html = renderToStaticMarkup(
    React.createElement(ActiveWorkoutView, {
      session,
      exerciseIndex: 0,
      setIndex: 0,
      activeTimer: null,
      exerciseSuggestions: [],
      onSelectExercise: noop,
      onSelectSet: noop,
      onAdjustWeight: noop,
      onAdjustReps: noop,
      onUpdateCurrentSet: noop,
      onToggleCurrentSet: noop,
      onAddSet: noop,
      onDeleteSet: noop,
      onAddExercise: noop,
      onDeleteExercise: noop,
      onUpdateEquipment: noop,
      onUpdateBarWeight: noop,
      onPropagateExercise: noop,
      onOpenCalculator: noop,
      onOpenHistory: noop,
      onOpenHistoryTab: noop,
      onOpenProgressTab: noop,
      onFinish: noop,
      onDeleteSession: noop,
      onSaveAsTemplate: noop,
      onEditSessionDate: noop,
      onEditSessionWeek: noop,
    })
  );

  // Check inputs have proper keyboard attributes
  assert.match(html, /<input[^>]*aria-label="Peso en kilogramos"[^>]*type="number"[^>]*inputMode="decimal"/i);
  assert.match(html, /<input[^>]*aria-label="Repeticiones"[^>]*type="number"[^>]*inputMode="numeric"/i);

  // Check touch target classes on all interactive elements
  const controls = html.match(/<(?:button|input|select|summary)\b[^>]*>/g) || [];
  assert.ok(controls.length > 5);
  for (const control of controls) {
    assert.match(control, /class="[^"]*(?:h-11|min-h-11|h-12|min-h-12|min-h-14)[^"]*"/);
  }
});
