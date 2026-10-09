import assert from 'node:assert/strict';
import test from 'node:test';
import type { Gym, GymSession, RoutineTemplate } from '../types';
import { calcGymStreakDetails, calcPRs, todayGymStatus } from './calculations';
import {
  addExerciseToGymSession,
  addSetToGymSession,
  configureGymTemplateExercise,
  deleteGymSessionExercise,
  deleteGymSessionSet,
  deleteGymTemplateExercise,
  deleteGymTemplate,
  deleteGymSession,
  duplicateGymTemplate,
  finishGymSession,
  getActiveGymSession,
  getPerformedGymVolume,
  previewNormalizeGymHistory,
  previewTemplateHistoryPropagation,
  requestGymSessionDeletion,
  reorderGymTemplateExercise,
  startGymSession,
  updateGymTemplate,
  updateGymTemplateExercise,
  updateGymSessionExercise,
  updateGymSessionSet,
  updateGymSession,
} from './gymFlows';
import { defaultState } from './storage';
import { getExerciseGhostValues, calculateSessionDuration } from './gymMetrics';

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

test('editar nombre, días y objetivos de plantilla no altera sesiones históricas', () => {
  const historical = session({
    id: 'historical',
    status: 'completed',
    exercises: [{
      id: 'template-bench',
      name: 'Press banca',
      restSeconds: 120,
      sets: [{ id: 'historical-set', weight: 80, reps: 8, completed: true }],
    }],
  });
  const gym = emptyGym({
    sessions: [historical],
    routineTemplates: [structuredClone(pushTemplate)],
  });
  const before = structuredClone(historical);

  assert.equal(updateGymTemplate(gym, pushTemplate.id, { name: 'Empuje pesado', days: ['lunes', 'jueves'] }), true);
  assert.equal(configureGymTemplateExercise(gym, pushTemplate.id, 'template-bench', {
    setsCount: 4,
    reps: 6,
    targetWeight: 90,
    restSeconds: 180,
  }), true);

  assert.deepEqual(gym.sessions[0], before);
  assert.equal(gym.routineTemplates[0].name, 'Empuje pesado');
  assert.deepEqual(gym.routineTemplates[0].days, ['lunes', 'jueves']);
  assert.deepEqual(gym.routineTemplates[0].exercises[0].sets.map((set) => [set.weight, set.reps]), [
    [90, 6], [90, 6], [90, 6], [90, 6],
  ]);
  assert.equal(gym.routineTemplates[0].exercises[0].restSeconds, 180);
});

test('eliminar plantilla conserva intacto el historial', () => {
  const historical = session({ id: 'kept-history', status: 'completed' });
  const gym = emptyGym({
    sessions: [historical],
    routineTemplates: [structuredClone(pushTemplate)],
  });
  const before = structuredClone(historical);

  assert.equal(deleteGymTemplate(gym, pushTemplate.id), true);
  assert.deepEqual(gym.sessions, [before]);
});

test('duplicar plantilla crea identidad de plantilla nueva y copia independiente', () => {
  const gym = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const duplicate = duplicateGymTemplate(gym, pushTemplate.id, { templateId: 'template-copy' });

  assert.ok(duplicate);
  assert.equal(duplicate.id, 'template-copy');
  assert.notEqual(duplicate.id, pushTemplate.id);
  assert.equal(duplicate.exercises[0].id, pushTemplate.exercises[0].id, 'el mismo ejercicio conserva identidad e historial');
  assert.notEqual(duplicate.exercises[0], gym.routineTemplates[0].exercises[0]);
  assert.notEqual(duplicate.exercises[0].sets[0].id, pushTemplate.exercises[0].sets[0].id);
  assert.deepEqual(duplicate.days, pushTemplate.days);
  assert.equal(duplicate.exercises[0].sets[0].completed, false);
});

test('reordenar por ID conserva exactamente los ejercicios correctos', () => {
  const template = structuredClone(pushTemplate);
  template.exercises.push({ id: 'template-press', name: 'Press militar', sets: [] });
  template.exercises.push({ id: 'template-dips', name: 'Fondos', sets: [] });
  const gym = emptyGym({ routineTemplates: [template] });

  assert.equal(reorderGymTemplateExercise(gym, template.id, 'template-dips', 0), true);
  assert.deepEqual(template.exercises.map((exercise) => exercise.id), [
    'template-dips', 'template-bench', 'template-press',
  ]);
  assert.deepEqual(template.exercises.map((exercise) => exercise.name), [
    'Fondos', 'Press banca', 'Press militar',
  ]);
});

test('iniciar desde plantilla crea snapshot y cambios posteriores no lo alteran', () => {
  const gym = emptyGym({ routineTemplates: [structuredClone(pushTemplate)] });
  const started = startGymSession(gym, {
    templateId: pushTemplate.id,
    date: '2026-10-08',
    startedAt: '18:00',
    sessionId: 'independent-snapshot',
  }).session;
  const snapshot = structuredClone(started.exercises);

  assert.notEqual(started.exercises, gym.routineTemplates[0].exercises);
  assert.notEqual(started.exercises[0].sets, gym.routineTemplates[0].exercises[0].sets);
  updateGymTemplateExercise(gym, pushTemplate.id, 'template-bench', { name: 'Press banca pausado' });
  configureGymTemplateExercise(gym, pushTemplate.id, 'template-bench', {
    setsCount: 5,
    reps: 5,
    targetWeight: 100,
    restSeconds: 240,
  });
  deleteGymTemplateExercise(gym, pushTemplate.id, 'template-bench');

  assert.deepEqual(started.exercises, snapshot);
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

  const legacyTemplate: RoutineTemplate = {
    id: 'legacy-template',
    name: 'Legacy',
    exercises: [{ name: 'Remo legacy', sets: [] }],
  };
  gym.routineTemplates = [legacyTemplate];
  assert.equal(updateGymTemplateExercise(gym, legacyTemplate.id, { exerciseIndex: 0 }, { restSeconds: 75 }), true);
  assert.equal(legacyTemplate.exercises[0].restSeconds, 75);
  assert.equal(reorderGymTemplateExercise(gym, legacyTemplate.id, { exerciseIndex: 0 }, 0), false);
});

test('un ID moderno inválido nunca cae por accidente al índice legacy', () => {
  const modern = session({
    id: 'modern-session',
    exercises: [{ id: 'modern-exercise', name: 'Sentadilla', sets: [{ id: 'modern-set', weight: 100, reps: 5 }] }],
  });
  const template = structuredClone(pushTemplate);
  const gym = emptyGym({ sessions: [modern], routineTemplates: [template] });

  assert.equal(updateGymSessionSet(gym, modern.id, { exerciseId: 'missing-id', exerciseIndex: 0 }, 0, { weight: 999 }).updated, false);
  assert.equal(updateGymTemplateExercise(gym, template.id, { exerciseId: 'missing-id', exerciseIndex: 0 }, { name: 'Incorrecto' }), false);
  assert.equal(modern.exercises[0].sets[0].weight, 100);
  assert.equal(template.exercises[0].name, 'Press banca');
});

test('desmarcar una serie limpia completedAt y mantiene coherencia del estado realizado', () => {
  const completedSession = session({
    id: 'uncomplete-session',
    exercises: [{
      id: 'exercise-1',
      name: 'Press banca',
      sets: [{ id: 'set-1', weight: 80, reps: 8, completed: true, completedAt: '2026-10-08T10:00:00.000Z' }],
    }],
  });
  const gym = emptyGym({ sessions: [completedSession] });

  const result = updateGymSessionSet(gym, completedSession.id, 'exercise-1', 0, { completed: false });

  assert.equal(result.updated, true);
  assert.equal(completedSession.exercises[0].sets[0].completed, false);
  assert.equal(completedSession.exercises[0].sets[0].completedAt, null);
});

test('edición manual de hora de inicio y fin recalcula duración correctamente', () => {
  const s = session({
    id: 'edit-times-session',
    startedAt: '10:00',
    finishedAt: '11:00',
  });
  const gym = emptyGym({ sessions: [s] });

  const ok = updateGymSession(gym, s.id, { startedAt: '12:00', finishedAt: '13:07' });
  assert.equal(ok, true);
  assert.equal(s.startedAt, '12:00');
  assert.equal(s.finishedAt, '13:07');

  const dur = calculateSessionDuration(s.startedAt, s.finishedAt);
  assert.equal(dur.minutes, 67);
  assert.equal(dur.formatted, '1 h 07 min');
});

test('rango horario inválido se rechaza y no altera sesión', () => {
  const s = session({
    id: 'invalid-times-session',
    startedAt: '12:00',
    finishedAt: '13:00',
  });
  const gym = emptyGym({ sessions: [s] });

  // 13:00 a 12:00 es inválido en el mismo día
  const ok = updateGymSession(gym, s.id, { startedAt: '13:00', finishedAt: '12:00' });
  assert.equal(ok, false);
  assert.equal(s.startedAt, '12:00');
  assert.equal(s.finishedAt, '13:00');
});

