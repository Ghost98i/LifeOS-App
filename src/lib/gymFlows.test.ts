import assert from 'node:assert/strict';
import test from 'node:test';
import type { Gym, GymSession, RoutineTemplate } from '../types';
import { calcGymStreakDetails, calcPRs, todayGymStatus } from './calculations';
import {
  addExerciseToGymSession,
  addSetToGymSession,
  deleteGymSessionExercise,
  deleteGymSessionSet,
  deleteGymTemplate,
  deleteGymSession,
  finishGymSession,
  getActiveGymSession,
  getPerformedGymVolume,
  previewNormalizeGymHistory,
  previewTemplateHistoryPropagation,
  requestGymSessionDeletion,
  startGymSession,
  updateGymSessionExercise,
  updateGymSessionSet,
} from './gymFlows';
import { defaultState } from './storage';
import { getExerciseGhostValues } from './gymMetrics';

function emptyGym(overrides: Partial<Gym> = {}): Gym {
  return {
    weight: [],
    measurements: [],
    sessions: [],
    routineTemplates: [],
    restDays: [],
    activeTimer: null,
    ...overrides,
  };
}

function session(overrides: Partial<GymSession> = {}): GymSession {
  return {
    id: 'session-1',
    date: '2026-10-06',
    status: 'active',
    startedAt: '22:30',
    finishedAt: null,
    exercises: [],
    ...overrides,
  };
}

const pushTemplate: RoutineTemplate = {
  id: 'template-push',
  name: 'Empuje',
  days: ['martes'],
  exercises: [
    {
      id: 'template-bench',
      name: 'Press banca',
      equipment: 'barra',
      barWeight: 20,
      restSeconds: 120,
      timerEnabled: true,
      sets: [{ id: 'template-set', weight: 80, reps: 8, completed: false }],
    },
  ],
};

function semanticSession(value: GymSession) {
  return {
    date: value.date,
    weekLabel: value.weekLabel,
    status: value.status,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    exercises: value.exercises.map((exercise) => ({
      name: exercise.name,
      equipment: exercise.equipment,
      barWeight: exercise.barWeight,
      restSeconds: exercise.restSeconds,
      timerEnabled: exercise.timerEnabled,
      sets: exercise.sets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
        completed: set.completed,
      })),
    })),
  };
}

test('Gym y Quick Capture obtienen la misma semántica al iniciar desde la misma plantilla', () => {
  const first = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const second = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });

  const fromGym = startGymSession(first, {
    templateId: pushTemplate.id,
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'gym-route',
  });
  const fromQuickCapture = startGymSession(second, {
    templateId: pushTemplate.id,
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'quick-route',
  });

  assert.deepEqual(semanticSession(fromGym.session), semanticSession(fromQuickCapture.session));
  assert.equal(fromGym.session.weekLabel, pushTemplate.name, 'template name is preserved as weekLabel fallback');
});

test('startGymSession respeta weekLabel explícito sobre el nombre de la plantilla', () => {
  const gym = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const result = startGymSession(gym, {
    templateId: pushTemplate.id,
    weekLabel: 'Semana 1 - Fuerza',
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'explicit-week',
  });
  assert.equal(result.session.weekLabel, 'Semana 1 - Fuerza');
});

test('iniciar no autocompleta una sesión anterior y la devuelve para continuar', () => {
  const previous = session();
  const gym = emptyGym({ sessions: [previous], routineTemplates: [structuredClone(pushTemplate)] });

  const result = startGymSession(gym, {
    templateId: pushTemplate.id,
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'new-session',
  });

  assert.equal(result.created, false);
  assert.equal(result.session.id, previous.id);
  assert.equal(gym.sessions.length, 1);
  assert.equal(gym.sessions[0].status, 'active');
  assert.equal(gym.sessions[0].finishedAt, null);
});

test('una sesión activa de ayer sigue activa y reanudable después de cruzar medianoche', () => {
  const previous = session({ date: '2026-10-06' });
  const gym = emptyGym({ sessions: [previous] });

  assert.equal(getActiveGymSession(gym)?.id, previous.id);
  assert.equal(getActiveGymSession(gym, '2026-10-07')?.id, previous.id);
  assert.equal(previous.status, 'active');
});

test('doble inicio local es idempotente y no crea una sesión fantasma', () => {
  const gym = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const input = {
    templateId: pushTemplate.id,
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'only-session',
  };

  const first = startGymSession(gym, input);
  const second = startGymSession(gym, { ...input, sessionId: 'should-not-exist' });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.session.id, first.session.id);
  assert.equal(gym.sessions.length, 1);
  assert.equal(gym.sessions.filter((item) => item.status === 'completed').length, 0);
});

test('finalizar sin series completadas no convierte la sesión en entrenamiento realizado', () => {
  const active = session({
    exercises: [{ name: 'Press banca', sets: [{ id: 'planned', weight: 80, reps: 8, completed: false }] }],
  });
  const gym = emptyGym({ sessions: [active] });

  const result = finishGymSession(gym, active.id, { finishedAt: '19:00' });

  assert.equal(result.status, 'no_completed_sets');
  assert.equal(active.status, 'active');
  assert.equal(active.finishedAt, null);
});

test('finalizar una sesión válida cambia la misma entidad exactamente una vez', () => {
  const active = session({
    exercises: [{ name: 'Press banca', sets: [{ id: 'done', weight: 80, reps: 8, completed: true }] }],
  });
  const gym = emptyGym({ sessions: [active] });

  const first = finishGymSession(gym, active.id, { finishedAt: '19:00' });
  const second = finishGymSession(gym, active.id, { finishedAt: '19:01' });

  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'already_completed');
  assert.equal(gym.sessions.length, 1);
  assert.equal(gym.sessions[0].id, active.id);
  assert.equal(gym.sessions[0].finishedAt, '19:00');
});

test('finalizar o eliminar limpia únicamente el timer asociado a esa sesión', () => {
  const active = session({
    exercises: [{ name: 'Press banca', sets: [{ id: 'done', weight: 80, reps: 8, completed: true }] }],
  });
  const gym = emptyGym({
    sessions: [active],
    activeTimer: { endsAt: 10, durationSeconds: 90, sessionId: active.id, exerciseId: null, setId: null },
  });

  finishGymSession(gym, active.id, { finishedAt: '19:00' });
  assert.equal(gym.activeTimer, null);

  const another = session({ id: 'another' });
  gym.sessions.push(another);
  gym.activeTimer = { endsAt: 20, durationSeconds: 90, sessionId: another.id, exerciseId: null, setId: null };
  assert.equal(deleteGymSession(gym, another.id), true);
  assert.equal(gym.activeTimer, null);
});

test('el snapshot de sesión no cambia al editar o eliminar la plantilla', () => {
  const gym = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const started = startGymSession(gym, {
    templateId: pushTemplate.id,
    date: '2026-10-07',
    startedAt: '18:00',
    sessionId: 'snapshot-session',
  }).session;
  started.exercises[0].sets[0].completed = true;
  assert.equal(finishGymSession(gym, started.id, { finishedAt: '19:00' }).status, 'completed');

  gym.routineTemplates[0].exercises[0].sets[0].weight = 120;
  assert.equal(started.exercises[0].sets[0].weight, 80);

  assert.equal(deleteGymTemplate(gym, pushTemplate.id), true);
  assert.equal(gym.routineTemplates.length, 0);
  assert.equal(gym.sessions.length, 1);
  assert.equal(gym.sessions[0].exercises[0].sets[0].weight, 80);
});

test('agregar ejercicio conserva las reps introducidas en la sesión persistida', () => {
  const active = session();
  const gym = emptyGym({ sessions: [active] });

  addExerciseToGymSession(gym, active.id, {
    name: 'Press inclinado',
    muscleGroup: 'Pecho',
    equipment: 'barra',
    barWeight: 20,
    initialWeight: 62.5,
    initialReps: 7,
  });

  assert.deepEqual(active.exercises[0].sets.map((set) => set.reps), [7, 7, 7]);
});

test('ghost values y series precargadas no cuentan como volumen, PR, racha ni entrenamiento de Hoy', () => {
  const state = defaultState();
  state.gym.sessions = [session({
    date: '2026-10-07',
    exercises: [{ name: 'Press banca', sets: [{ id: 'ghost', weight: 100, reps: 10, completed: false }] }],
  })];

  assert.equal(getPerformedGymVolume(state.gym.sessions[0]), 0);
  assert.deepEqual(calcPRs(state), {});
  assert.equal(calcGymStreakDetails(state).workoutCount, 0);
  assert.equal(todayGymStatus(state, '2026-10-07').status, 'pending_today');
  assert.equal(todayGymStatus(state, '2026-10-07').totalVolume, 0);
  const invalidCompleted = session({ ...state.gym.sessions[0], status: 'completed' });
  assert.equal(getExerciseGhostValues([invalidCompleted], 'Press banca'), null);
});

test('borrar una sesión histórica requiere confirmación explícita', () => {
  const completed = session({ id: 'completed', status: 'completed' });
  let prompts = 0;

  assert.equal(requestGymSessionDeletion(completed, () => { prompts += 1; return false; }), false);
  assert.equal(requestGymSessionDeletion(completed, () => { prompts += 1; return true; }), true);
  assert.equal(prompts, 2);
});

test('los previews masivos enumeran sólo sesiones completadas realmente afectadas', () => {
  const completed = session({
    id: 'completed',
    status: 'completed',
    exercises: [{ id: 'old', name: 'Press banca', equipment: 'mancuerna', barWeight: 0, sets: [] }],
  });
  const alreadyCorrect = session({
    id: 'correct',
    status: 'completed',
    exercises: [{ id: 'correct-ex', name: 'Press banca', equipment: 'barra', barWeight: 20, sets: [] }],
  });
  const active = session({
    id: 'active',
    status: 'active',
    exercises: [{ id: 'active-ex', name: 'Press banca', equipment: 'mancuerna', barWeight: 0, sets: [] }],
  });
  const gym = emptyGym({
    sessions: [completed, alreadyCorrect, active],
    routineTemplates: [structuredClone(pushTemplate)],
  });

  const propagate = previewTemplateHistoryPropagation(gym, pushTemplate.id);
  assert.deepEqual(propagate.affectedSessionIds, ['completed']);
  assert.equal(propagate.affectedExerciseCount, 1);
  assert.equal(propagate.updatedSessions.find((item) => item.id === 'active')?.exercises[0].equipment, 'mancuerna');

  const normalize = previewNormalizeGymHistory(gym);
  assert.deepEqual(normalize.affectedSessionIds, ['completed']);
  assert.equal(normalize.affectedExerciseCount, 1);
});

test('mutaciones de ejercicio priorizan exerciseId estable incluso si el orden del array cambia', () => {
  const exA = {
    id: 'ex-bench',
    name: 'Press banca',
    sets: [
      { id: 's1', weight: 80, reps: 8, completed: false },
      { id: 's2', weight: 80, reps: 8, completed: false },
    ],
  };
  const exB = {
    id: 'ex-squat',
    name: 'Sentadilla',
    sets: [
      { id: 's3', weight: 100, reps: 5, completed: false },
    ],
  };

  // Sesión inicial: [exA, exB]
  const testSession = session({
    id: 'reorder-session',
    exercises: [structuredClone(exA), structuredClone(exB)],
  });
  const gym = emptyGym({ sessions: [testSession] });

  // 1. Reordenar el array en memoria: ahora [exB, exA]
  testSession.exercises.reverse();
  assert.equal(testSession.exercises[0].id, 'ex-squat');
  assert.equal(testSession.exercises[1].id, 'ex-bench');

  // 2. Operación updateGymSessionSet apuntando a 'ex-bench' con exerciseId
  // Aunque antes era índice 0 y ahora es índice 1, debe mutar 'ex-bench', NO 'ex-squat'
  const updateResult = updateGymSessionSet(
    gym,
    'reorder-session',
    { exerciseId: 'ex-bench', exerciseIndex: 0 }, // exerciseIndex intencionalmente desfasado (0 apunta a squat)
    1,
    { weight: 85, completed: true }
  );
  assert.equal(updateResult.updated, true);

  const benchEx = testSession.exercises.find((e) => e.id === 'ex-bench')!;
  const squatEx = testSession.exercises.find((e) => e.id === 'ex-squat')!;
  assert.equal(benchEx.sets[1].weight, 85, 'debe actualizar el ejercicio bench indicado por exerciseId');
  assert.equal(benchEx.sets[1].completed, true);
  assert.equal(squatEx.sets[0].weight, 100, 'squat no debe ser tocado a pesar de estar en índice 0');

  // 3. addSetToGymSession apuntando por exerciseId
  const newSet = addSetToGymSession(gym, 'reorder-session', { exerciseId: 'ex-bench', exerciseIndex: 0 });
  assert.ok(newSet);
  assert.equal(benchEx.sets.length, 3);
  assert.equal(squatEx.sets.length, 1);

  // 4. deleteGymSessionSet apuntando por exerciseId
  const deletedSet = deleteGymSessionSet(gym, 'reorder-session', { exerciseId: 'ex-bench', exerciseIndex: 0 }, 0);
  assert.equal(deletedSet, true);
  assert.equal(benchEx.sets.length, 2);
  assert.equal(squatEx.sets.length, 1);

  // 5. updateGymSessionExercise apuntando por exerciseId
  const updatedEx = updateGymSessionExercise(
    gym,
    'reorder-session',
    { exerciseId: 'ex-bench', exerciseIndex: 0 },
    { equipment: 'barra', barWeight: 20 }
  );
  assert.equal(updatedEx, true);
  assert.equal(benchEx.barWeight, 20);
  assert.equal(squatEx.barWeight, undefined);

  // 6. deleteGymSessionExercise apuntando por exerciseId
  const deletedEx = deleteGymSessionExercise(gym, 'reorder-session', { exerciseId: 'ex-bench', exerciseIndex: 0 });
  assert.equal(deletedEx, true);
  assert.equal(testSession.exercises.length, 1);
  assert.equal(testSession.exercises[0].id, 'ex-squat', 'Sentadilla debe sobrevivir intacta');
});

test('mutaciones de ejercicio conservan fallback por exerciseIndex cuando id está ausente (legacy)', () => {
  const legacyExercise = {
    name: 'Curl bíceps', // Sin ID
    sets: [
      { id: 'l1', weight: 14, reps: 10, completed: false },
    ],
  };

  const testSession = session({
    id: 'legacy-session',
    exercises: [legacyExercise as any],
  });
  const gym = emptyGym({ sessions: [testSession] });

  // Update por índice numérico
  const resUpdate = updateGymSessionSet(gym, 'legacy-session', 0, 0, { reps: 12 });
  assert.equal(resUpdate.updated, true);
  assert.equal(testSession.exercises[0].sets[0].reps, 12);

  // Add set por índice
  const added = addSetToGymSession(gym, 'legacy-session', 0);
  assert.ok(added);
  assert.equal(testSession.exercises[0].sets.length, 2);

  // Delete set por índice
  const deletedSet = deleteGymSessionSet(gym, 'legacy-session', 0, 1);
  assert.equal(deletedSet, true);
  assert.equal(testSession.exercises[0].sets.length, 1);

  // Delete exercise por índice
  const deletedEx = deleteGymSessionExercise(gym, 'legacy-session', 0);
  assert.equal(deletedEx, true);
  assert.equal(testSession.exercises.length, 0);
});

