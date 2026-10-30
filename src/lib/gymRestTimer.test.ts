import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  applyGymRestTimerAdjustment,
  completeGymRestTimer,
  deleteGymSession,
  finishGymSession,
  getEffectiveExerciseRestSeconds,
  getGymSettings,
  isExerciseCompleted,
  resolveNextRestTimer,
  skipGymRestTimer,
  setGymRestTimerRemaining,
  updateGymSessionSet,
} from './gymFlows';
import { migrateGym } from './gymMigration';
import { applySyncModule, mergeSyncModule, syncModuleData } from './syncModel';
import type { Gym, GymActiveTimer, GymSession } from '../types';

function createTestGym(): { gym: Gym; session: GymSession } {
  const gym: Gym = {
    weight: [],
    measurements: [],
    sessions: [],
    routineTemplates: [],
    restDays: [],
    activeTimer: null,
    settings: {
      restBetweenSetsSeconds: 120,
      restBetweenExercisesSeconds: 180,
      autoTimerEnabled: true,
    },
  };

  const session: GymSession = {
    id: 'test-session-1',
    date: '2026-10-10',
    status: 'active',
    exercises: [
      {
        id: 'ex-bench',
        name: 'Press banca',
        timerEnabled: true,
        sets: [
          { id: 'set-w1', weight: 40, reps: 10, type: 'warmup', completed: false },
          { id: 'set-e1', weight: 80, reps: 8, type: 'normal', completed: false },
          { id: 'set-e2', weight: 80, reps: 8, type: 'normal', completed: false },
        ],
      },
      {
        id: 'ex-squat',
        name: 'Sentadilla',
        timerEnabled: true,
        sets: [
          { id: 'set-sq1', weight: 100, reps: 5, type: 'normal', completed: false },
        ],
      },
    ],
  };

  gym.sessions.push(session);
  return { gym, session };
}

test('Gym 3.1: completar set efectivo pendiente → inicia timer entre series (120 s por defecto)', () => {
  const { gym, session } = createTestGym();
  const now = 1000000;

  // Complete first effective set (set index 1)
  const res = updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  assert.equal(res.justCompleted, true);

  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 1, now);
  assert.ok(timer !== null);
  assert.equal(timer.kind, 'set');
  assert.equal(timer.durationSeconds, 120);
  assert.equal(timer.endsAt, now + 120000);
  assert.equal(timer.sessionId, session.id);
  assert.equal(timer.exerciseId, 'ex-bench');
  assert.equal(timer.setId, 'set-e1');
  assert.equal(timer.targetExerciseIndex, undefined);
});

test('Gym 3.1: completar warmup → inicia descanso normal y no provoca descanso de fin de ejercicio si quedan efectivas', () => {
  const { gym, session } = createTestGym();
  const now = 2000000;

  // Exercise is NOT completed because effective sets are pending
  assert.equal(isExerciseCompleted(session.exercises[0]), false);

  // Complete warmup set (set index 0)
  const res = updateGymSessionSet(gym, session.id, 'ex-bench', 0, { completed: true });
  assert.equal(res.justCompleted, true);

  // Still not completed
  assert.equal(isExerciseCompleted(session.exercises[0]), false);

  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 0, now);
  assert.ok(timer !== null);
  assert.equal(timer.kind, 'set');
  assert.equal(timer.durationSeconds, 120);
  assert.equal(timer.targetExerciseIndex, undefined);
});

test('Gym 3.1: completar última serie efectiva → inicia descanso de ejercicio (180 s por defecto) con target al siguiente', () => {
  const { gym, session } = createTestGym();
  const now = 3000000;

  // Mark first effective set completed
  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });

  // Complete the last effective set (set index 2)
  updateGymSessionSet(gym, session.id, 'ex-bench', 2, { completed: true });

  // All effective sets are done
  assert.equal(isExerciseCompleted(session.exercises[0]), true);

  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 2, now);
  assert.ok(timer !== null);
  assert.equal(timer.kind, 'exercise');
  assert.equal(timer.durationSeconds, 180);
  assert.equal(timer.endsAt, now + 180000);
  assert.equal(timer.exerciseIndex, 0);
  assert.equal(timer.targetExerciseIndex, 1); // Points to ex-squat (exercise index 1)
});

test('Gym 3.1: +30 s suma 30 segundos al deadline actual de forma consistente', () => {
  const now = 1000;
  const initialTimer: GymActiveTimer = {
    endsAt: now + 60000,
    durationSeconds: 60,
    sessionId: 'session-1',
    kind: 'set',
  };

  const adjusted = applyGymRestTimerAdjustment(initialTimer, 30, now);
  assert.equal(adjusted.completed, false);
  assert.ok(adjusted.timer !== null);
  assert.equal(adjusted.timer.endsAt, now + 90000);
  assert.equal(adjusted.timer.durationSeconds, 90);
});

test('Gym 3.1: -30 s resta 30 segundos sin producir tiempo negativo', () => {
  const now = 1000;
  const initialTimer: GymActiveTimer = {
    endsAt: now + 50000,
    durationSeconds: 60,
    sessionId: 'session-1',
    kind: 'set',
  };

  const adjusted = applyGymRestTimerAdjustment(initialTimer, -30, now);
  assert.equal(adjusted.completed, false);
  assert.ok(adjusted.timer !== null);
  assert.equal(adjusted.timer.endsAt, now + 20000);
  assert.equal(adjusted.timer.durationSeconds, 30);
});

test('Gym 3.1: -30 s llegando a cero o menos se trata como finalización inmediata del descanso', () => {
  const now = 1000;
  const initialTimer: GymActiveTimer = {
    endsAt: now + 25000, // 25 seconds remaining
    durationSeconds: 60,
    sessionId: 'session-1',
    kind: 'exercise',
    targetExerciseIndex: 1,
  };

  const adjusted = applyGymRestTimerAdjustment(initialTimer, -30, now);
  assert.equal(adjusted.completed, true);
  assert.equal(adjusted.timer, null);
});

test('Gym 3.1: saltar descanso finaliza inmediatamente el timer y preserva autoavance si corresponde', () => {
  const { gym } = createTestGym();

  // Test set rest skip: stays on current
  gym.activeTimer = {
    endsAt: Date.now() + 60000,
    durationSeconds: 60,
    sessionId: 'test-session-1',
    kind: 'set',
    exerciseIndex: 0,
  };
  const setSkipRes = skipGymRestTimer(gym);
  assert.equal(gym.activeTimer, null);
  assert.equal(setSkipRes.autoAdvanced, false);

  // Test exercise rest skip: advances to next exercise
  gym.activeTimer = {
    endsAt: Date.now() + 180000,
    durationSeconds: 180,
    sessionId: 'test-session-1',
    kind: 'exercise',
    exerciseIndex: 0,
    targetExerciseIndex: 1,
  };
  const exSkipRes = skipGymRestTimer(gym);
  assert.equal(gym.activeTimer, null);
  assert.equal(exSkipRes.autoAdvanced, true);
  assert.equal(exSkipRes.nextExerciseIndex, 1);
});

test('Gym 3.1: finalización natural ocurre una sola vez y limpia el timer activo', () => {
  const { gym } = createTestGym();
  const timer: GymActiveTimer = {
    endsAt: Date.now(),
    durationSeconds: 120,
    sessionId: 'test-session-1',
    kind: 'set',
  };
  gym.activeTimer = timer;

  const firstFinish = completeGymRestTimer(gym, timer);
  assert.equal(gym.activeTimer, null);
  assert.equal(firstFinish.autoAdvanced, false);

  // Second call with null timer cannot re-trigger
  const secondSkip = skipGymRestTimer(gym);
  assert.equal(secondSkip.autoAdvanced, false);
});

test('Gym 3.1: siguiente ejercicio automático sólo ocurre en descanso de ejercicio, no en descanso de serie', () => {
  const { gym } = createTestGym();

  const setTimer: GymActiveTimer = {
    endsAt: Date.now(),
    durationSeconds: 120,
    sessionId: 'test-session-1',
    kind: 'set',
    exerciseIndex: 0,
  };
  gym.activeTimer = setTimer;
  const setRes = completeGymRestTimer(gym, setTimer);
  assert.equal(setRes.autoAdvanced, false);
  assert.equal(setRes.nextExerciseIndex, undefined);

  const exerciseTimer: GymActiveTimer = {
    endsAt: Date.now(),
    durationSeconds: 180,
    sessionId: 'test-session-1',
    kind: 'exercise',
    exerciseIndex: 0,
    targetExerciseIndex: 1,
  };
  gym.activeTimer = exerciseTimer;
  const exRes = completeGymRestTimer(gym, exerciseTimer);
  assert.equal(exRes.autoAdvanced, true);
  assert.equal(exRes.nextExerciseIndex, 1);
});

test('Gym 3.1: último ejercicio no intenta navegar a uno inexistente y no finaliza la sesión automáticamente', () => {
  const { gym, session } = createTestGym();
  const now = 5000000;

  // Complete only set of the LAST exercise (exercise index 1: ex-squat)
  updateGymSessionSet(gym, session.id, 'ex-squat', 0, { completed: true });

  const timer = resolveNextRestTimer(gym, session.id, 'ex-squat', 0, now);
  assert.ok(timer !== null);
  assert.equal(timer.kind, 'exercise');
  assert.equal(timer.exerciseIndex, 1);
  // There is no exercise after index 1
  assert.equal(timer.targetExerciseIndex, undefined);

  gym.activeTimer = timer;
  const finishRes = completeGymRestTimer(gym, timer);
  assert.equal(finishRes.autoAdvanced, false);
  assert.equal(finishRes.nextExerciseIndex, undefined);
  assert.equal(session.status, 'active'); // Did NOT automatically close session
});

test('Gym 3.1: finalizar o descartar sesión limpia el timer activo', () => {
  const { gym, session } = createTestGym();

  gym.activeTimer = {
    endsAt: Date.now() + 90000,
    durationSeconds: 90,
    sessionId: session.id,
    kind: 'set',
  };

  // Mark set to make session eligible for finish
  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });

  finishGymSession(gym, session.id, { finishedAt: '18:00' });
  assert.equal(gym.activeTimer, null);

  // Re-arm timer and test discard
  gym.activeTimer = {
    endsAt: Date.now() + 90000,
    durationSeconds: 90,
    sessionId: session.id,
    kind: 'set',
  };
  deleteGymSession(gym, session.id);
  assert.equal(gym.activeTimer, null);
});

test('Gym 3.1: sólo un timer activo a la vez; una nueva serie completada reemplaza el anterior', () => {
  const { gym, session } = createTestGym();
  const t1 = 1000000;
  const t2 = 1010000;

  // Complete set 1
  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  gym.activeTimer = resolveNextRestTimer(gym, session.id, 'ex-bench', 1, t1);
  assert.equal(gym.activeTimer?.setId, 'set-e1');
  assert.equal(gym.activeTimer?.endsAt, t1 + 120000);

  // Complete set 2 (replaces timer)
  updateGymSessionSet(gym, session.id, 'ex-bench', 2, { completed: true });
  gym.activeTimer = resolveNextRestTimer(gym, session.id, 'ex-bench', 2, t2);
  assert.equal(gym.activeTimer?.setId, 'set-e2');
  assert.equal(gym.activeTimer?.kind, 'exercise');
  assert.equal(gym.activeTimer?.endsAt, t2 + 180000);
});

test('Gym 3.1: desmarcar la serie que originó el timer lo cancela de forma determinista', () => {
  const { gym, session } = createTestGym();

  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  gym.activeTimer = {
    endsAt: Date.now() + 120000,
    durationSeconds: 120,
    sessionId: session.id,
    exerciseId: 'ex-bench',
    setId: 'set-e1',
    kind: 'set',
  };

  // Unmark set 1
  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: false });
  assert.equal(gym.activeTimer, null);
});

test('Gym 3.1: snapshots remotos no reemplazan activeTimer (local-only invariante preservado)', () => {
  const state = defaultState();
  const { gym, session } = createTestGym();
  state.gym = gym;
  state.gym.activeTimer = {
    endsAt: 999999999,
    durationSeconds: 180,
    sessionId: session.id,
    kind: 'exercise',
    targetExerciseIndex: 1,
  };

  // Sync payload excludes activeTimer
  const payload = syncModuleData(state, 'gym') as { gym: Gym };
  assert.equal('activeTimer' in payload.gym, false);

  // Merging remote snapshot preserves activeTimer
  const remoteGym = { ...gym, sessions: [{ ...session, weekLabel: 'Remote Week' }], activeTimer: null };
  const mergedState = mergeSyncModule(state, 'gym', { gym: remoteGym }, { gym });
  assert.equal(mergedState.gym.activeTimer?.endsAt, 999999999);
  assert.equal(mergedState.gym.activeTimer?.kind, 'exercise');

  // Applying remote snapshot preserves activeTimer
  const replacedState = applySyncModule(state, 'gym', { gym: remoteGym });
  assert.equal(replacedState.gym.activeTimer?.endsAt, 999999999);
  assert.equal(replacedState.gym.activeTimer?.kind, 'exercise');
});

test('Gym 3.1: reload y restore local preserva activeTimer con campos extendidos (kind, targets, minimized)', () => {
  const migrated = migrateGym({
    sessions: [{ id: 's-1', date: '2026-10-10', exercises: [] }],
    activeTimer: {
      endsAt: 12345678,
      durationSeconds: 180,
      sessionId: 's-1',
      kind: 'exercise',
      exerciseIndex: 0,
      targetExerciseIndex: 1,
      minimized: true,
    },
    settings: {
      restBetweenSetsSeconds: 90,
      restBetweenExercisesSeconds: 240,
      autoTimerEnabled: true,
    },
  });

  assert.ok(migrated.activeTimer !== null);
  assert.equal(migrated.activeTimer.endsAt, 12345678);
  assert.equal(migrated.activeTimer.durationSeconds, 180);
  assert.equal(migrated.activeTimer.kind, 'exercise');
  assert.equal(migrated.activeTimer.exerciseIndex, 0);
  assert.equal(migrated.activeTimer.targetExerciseIndex, 1);
  assert.equal(migrated.activeTimer.minimized, true);
  assert.equal(migrated.settings?.restBetweenSetsSeconds, 90);
  assert.equal(migrated.settings?.restBetweenExercisesSeconds, 240);
});

test('Gym 3.1: auto timer desactivado → completar serie no crea timer', () => {
  const { gym, session } = createTestGym();
  gym.settings = { ...getGymSettings(gym), autoTimerEnabled: false };

  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 1);
  assert.equal(timer, null);
});

test('Gym 3.1: exercise.timerEnabled = false no crea timer para ese ejercicio específico', () => {
  const { gym, session } = createTestGym();
  session.exercises[0].timerEnabled = false;

  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 1);
  assert.equal(timer, null);
});

test('Gym 3.1: la configuración global produce descansos nuevos de 60/90/180/600 segundos', () => {
  for (const seconds of [60, 90, 180, 600]) {
    const { gym, session } = createTestGym();
    gym.settings = { ...gym.settings, restBetweenSetsSeconds: seconds };
    const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 0, 1000);
    assert.ok(timer);
    assert.equal(timer.kind, 'set');
    assert.equal(timer.durationSeconds, seconds);
    assert.equal(timer.endsAt, 1000 + seconds * 1000);
  }
});

test('Gym 3.1: sólo un override explícito de ejercicio reemplaza la configuración global', () => {
  const { gym, session } = createTestGym();
  gym.settings = { ...gym.settings, restBetweenSetsSeconds: 60 };
  const exercise = session.exercises[0];

  exercise.restSeconds = 180;
  exercise.restSecondsMode = 'inherit';
  assert.equal(getEffectiveExerciseRestSeconds(exercise, getGymSettings(gym)), 60);

  exercise.restSecondsMode = 'custom';
  assert.equal(getEffectiveExerciseRestSeconds(exercise, getGymSettings(gym)), 180);
  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 0, 2000);
  assert.equal(timer?.durationSeconds, 180);
});

test('Gym 3.1: el default legacy de 90 s hereda global; un valor legacy no-default se preserva', () => {
  const settings = getGymSettings({ ...createTestGym().gym, settings: { restBetweenSetsSeconds: 600 } });
  assert.equal(getEffectiveExerciseRestSeconds({ name: 'Legacy', sets: [], restSeconds: 90 }, settings), 600);
  assert.equal(getEffectiveExerciseRestSeconds({ name: 'Legacy custom', sets: [], restSeconds: 75 }, settings), 75);

  const migrated = migrateGym({
    sessions: [{
      id: 'legacy',
      date: '2026-10-10',
      status: 'active',
      exercises: [
        { name: 'Default antiguo', restSeconds: 90, timerEnabled: true, sets: [] },
        { name: 'Personalizado antiguo', restSeconds: 75, timerEnabled: true, sets: [] },
      ],
    }],
  });
  assert.equal(migrated.sessions[0].exercises[0].restSecondsMode, 'inherit');
  assert.equal(migrated.sessions[0].exercises[1].restSecondsMode, 'custom');
});

test('Gym 3.1: el descanso entre ejercicios es independiente del descanso entre series', () => {
  const { gym, session } = createTestGym();
  gym.settings = {
    ...gym.settings,
    restBetweenSetsSeconds: 600,
    restBetweenExercisesSeconds: 180,
  };
  updateGymSessionSet(gym, session.id, 'ex-bench', 1, { completed: true });
  updateGymSessionSet(gym, session.id, 'ex-bench', 2, { completed: true });
  const timer = resolveNextRestTimer(gym, session.id, 'ex-bench', 2, 3000);
  assert.equal(timer?.kind, 'exercise');
  assert.equal(timer?.durationSeconds, 180);
  assert.equal(timer?.endsAt, 183000);
});

test('Gym 3.1: cambiar preferencias no reescribe un countdown activo', () => {
  const { gym } = createTestGym();
  gym.activeTimer = {
    endsAt: 999000,
    durationSeconds: 90,
    sessionId: 'test-session-1',
    kind: 'set',
  };
  const before = { ...gym.activeTimer };
  gym.settings = {
    ...gym.settings,
    restBetweenSetsSeconds: 600,
    showQuickRestAdjustments: false,
    allowManualRestEditing: true,
  };
  assert.deepEqual(gym.activeTimer, before);
});

test('Gym 3.1: edición manual explícita reemplaza el deadline real sin aceptar negativos', () => {
  const timer: GymActiveTimer = {
    endsAt: 61000,
    durationSeconds: 60,
    sessionId: 'session-1',
    kind: 'set',
  };
  const edited = setGymRestTimerRemaining(timer, 180, 1000);
  assert.equal(edited.endsAt, 181000);
  assert.equal(edited.durationSeconds, 180);
  const clamped = setGymRestTimerRemaining(timer, -30, 1000);
  assert.equal(clamped.endsAt, 2000);
  assert.equal(clamped.durationSeconds, 1);
});

test('Gym 3.1: migración conserva preferencias nuevas y defaults compatibles', () => {
  const defaults = migrateGym({});
  assert.equal(defaults.settings?.showQuickRestAdjustments, true);
  assert.equal(defaults.settings?.allowManualRestEditing, false);

  const configured = migrateGym({
    settings: {
      restBetweenSetsSeconds: 600,
      restBetweenExercisesSeconds: 180,
      showQuickRestAdjustments: false,
      allowManualRestEditing: true,
    },
  });
  assert.equal(configured.settings?.restBetweenSetsSeconds, 600);
  assert.equal(configured.settings?.showQuickRestAdjustments, false);
  assert.equal(configured.settings?.allowManualRestEditing, true);
});

test('Gym 3.1: preferencias y override explícito persisten y sincronizan sin incluir activeTimer', () => {
  const state = defaultState();
  state.gym.settings = {
    ...state.gym.settings,
    restBetweenSetsSeconds: 600,
    showQuickRestAdjustments: false,
    allowManualRestEditing: true,
  };
  state.gym.routineTemplates = [{
    id: 'template-qa',
    name: 'QA',
    exercises: [{
      id: 'exercise-qa',
      name: 'Press QA',
      sets: [],
      restSeconds: 180,
      restSecondsMode: 'custom',
    }],
  }];
  state.gym.activeTimer = {
    endsAt: 999999,
    durationSeconds: 60,
    sessionId: 'qa-session',
    kind: 'set',
  };

  const payload = syncModuleData(state, 'gym') as { gym: Gym };
  assert.equal(payload.gym.settings?.showQuickRestAdjustments, false);
  assert.equal(payload.gym.settings?.allowManualRestEditing, true);
  assert.equal(payload.gym.routineTemplates[0].exercises[0].restSecondsMode, 'custom');
  assert.equal('activeTimer' in payload.gym, false);

  const restored = migrateGym(JSON.parse(JSON.stringify(payload.gym)));
  assert.equal(restored.settings?.restBetweenSetsSeconds, 600);
  assert.equal(restored.settings?.showQuickRestAdjustments, false);
  assert.equal(restored.settings?.allowManualRestEditing, true);
  assert.equal(restored.routineTemplates[0].exercises[0].restSecondsMode, 'custom');
  assert.equal(restored.routineTemplates[0].exercises[0].restSeconds, 180);
});
