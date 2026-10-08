import type {
  Exercise,
  ExerciseEquipment,
  Gym,
  GymSession,
  GymSet,
  MuscleGroup,
  RoutineTemplate,
} from '../types';
import { uid } from './storage';
import { applyHistoryToTemplateExercises, getExerciseGhostValues } from './gymMetrics';
import {
  inferExerciseEquipment,
  inferMuscleGroup,
  normalizeAllGymSessions,
  propagateExerciseConfiguration,
} from './gymMigration';

export function getActiveGymSession(gym: Gym, _referenceDate?: string): GymSession | null {
  return [...(gym.sessions || [])]
    .filter((session) => session.status === 'active')
    .sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.startedAt || '').localeCompare(a.startedAt || '') ||
      a.id.localeCompare(b.id)
    )[0] || null;
}

export function getCompletedGymSets(session: GymSession): GymSet[] {
  return (session.exercises || []).flatMap((exercise) =>
    (exercise.sets || []).filter((set) => set.completed === true)
  );
}

export function hasPerformedGymWork(session: GymSession): boolean {
  return getCompletedGymSets(session).length > 0;
}

export function isPerformedGymSession(session: GymSession): boolean {
  return session.status === 'completed' && hasPerformedGymWork(session);
}

export function getPerformedGymVolume(session: GymSession): number {
  return getCompletedGymSets(session).reduce(
    (total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0),
    0
  );
}

export interface StartGymSessionInput {
  templateId?: string;
  date: string;
  startedAt: string;
  sessionId?: string;
  weekLabel?: string;
}

export function startGymSession(
  gym: Gym,
  input: StartGymSessionInput
): { session: GymSession; created: boolean } {
  const active = getActiveGymSession(gym);
  if (active) return { session: active, created: false };

  const template = input.templateId
    ? gym.routineTemplates.find((candidate) => candidate.id === input.templateId)
    : undefined;
  const session: GymSession = {
    id: input.sessionId || uid(),
    date: input.date,
    weekLabel: input.weekLabel?.trim() || template?.name || undefined,
    status: 'active',
    startedAt: input.startedAt,
    finishedAt: null,
    exercises: template
      ? applyHistoryToTemplateExercises(template.exercises, gym.sessions)
      : [],
  };
  gym.sessions.unshift(session);
  return { session, created: true };
}

export type FinishGymSessionStatus =
  | 'completed'
  | 'already_completed'
  | 'no_completed_sets'
  | 'not_found';

export function finishGymSession(
  gym: Gym,
  sessionId: string,
  input: { finishedAt: string }
): { status: FinishGymSessionStatus; session?: GymSession } {
  const session = gym.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return { status: 'not_found' };
  if (session.status === 'completed') return { status: 'already_completed', session };
  if (!hasPerformedGymWork(session)) return { status: 'no_completed_sets', session };

  session.status = 'completed';
  session.finishedAt = input.finishedAt;
  if (gym.activeTimer?.sessionId === sessionId) gym.activeTimer = null;
  return { status: 'completed', session };
}

export function deleteGymSession(gym: Gym, sessionId: string): boolean {
  const previousLength = gym.sessions.length;
  gym.sessions = gym.sessions.filter((session) => session.id !== sessionId);
  if (gym.activeTimer?.sessionId === sessionId) gym.activeTimer = null;
  return gym.sessions.length !== previousLength;
}

export const discardGymSession = deleteGymSession;

export function updateGymSession(
  gym: Gym,
  sessionId: string,
  updates: Pick<Partial<GymSession>, 'date' | 'weekLabel'>
): boolean {
  const session = gym.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return false;
  if (updates.date !== undefined) session.date = updates.date;
  if (updates.weekLabel !== undefined) session.weekLabel = updates.weekLabel.trim() || undefined;
  return true;
}

export function deleteGymTemplate(gym: Gym, templateId: string): boolean {
  const previousLength = gym.routineTemplates.length;
  gym.routineTemplates = gym.routineTemplates.filter((template) => template.id !== templateId);
  return gym.routineTemplates.length !== previousLength;
}

export function requestGymSessionDeletion(
  session: GymSession,
  confirm: (message: string) => boolean
): boolean {
  const label = session.status === 'completed' ? 'histórica' : 'activa';
  return confirm(`¿Eliminar esta sesión ${label}? Esta acción no se puede deshacer.`);
}

export interface AddExerciseToSessionInput {
  name: string;
  muscleGroup?: MuscleGroup;
  equipment?: ExerciseEquipment;
  barWeight?: number;
  initialWeight?: number;
  initialReps?: number;
}

export function addExerciseToGymSession(
  gym: Gym,
  sessionId: string,
  input: AddExerciseToSessionInput
): boolean {
  const session = gym.sessions.find((candidate) => candidate.id === sessionId);
  const name = input.name.trim();
  if (!session || !name) return false;

  const inferred = inferExerciseEquipment(name);
  const equipment = input.equipment || inferred.equipment;
  const barWeight = equipment === 'barra'
    ? (input.barWeight ?? inferred.barWeight)
    : 0;
  const ghost = getExerciseGhostValues(gym.sessions, name, sessionId);
  const initialWeight = input.initialWeight ?? 20;
  const initialReps = input.initialReps ?? 10;
  const startWeight = ghost?.sets[0]?.weight ?? initialWeight;
  const startReps = ghost?.sets[0]?.reps ?? initialReps;
  const sets: GymSet[] = ghost?.sets.length
    ? ghost.sets.map((set) => ({ id: uid(), weight: set.weight, reps: set.reps, completed: false }))
    : Array.from({ length: 3 }, () => ({
        id: uid(),
        weight: startWeight,
        reps: startReps,
        completed: false,
      }));

  session.exercises.push({
    id: uid(),
    name,
    equipment,
    muscleGroup: input.muscleGroup || inferMuscleGroup(name),
    barWeight,
    restSeconds: 90,
    timerEnabled: true,
    sets,
    weight: startWeight,
  });
  return true;
}

export function findSessionExercise(
  session: GymSession | undefined,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number }
): { exercise: Exercise; index: number } | null {
  if (!session || !Array.isArray(session.exercises)) return null;

  let targetId: string | undefined;
  let targetIndex: number | undefined;

  if (typeof exerciseTarget === 'string') {
    targetId = exerciseTarget;
  } else if (typeof exerciseTarget === 'number') {
    targetIndex = exerciseTarget;
  } else if (exerciseTarget && typeof exerciseTarget === 'object') {
    targetId = exerciseTarget.exerciseId;
    targetIndex = exerciseTarget.exerciseIndex;
  }

  // 1. Stable identity match: prefer exerciseId when present
  if (targetId) {
    const idx = session.exercises.findIndex((ex) => ex.id === targetId);
    if (idx >= 0) return { exercise: session.exercises[idx], index: idx };
  }

  // 2. Fallback to index if within bounds (backward compatibility for legacy exercises without ID)
  if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < session.exercises.length) {
    return { exercise: session.exercises[targetIndex], index: targetIndex };
  }

  return null;
}

export function addSetToGymSession(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number }
): GymSet | null {
  const session = gym.sessions.find((s) => s.id === sessionId);
  const found = findSessionExercise(session, exerciseTarget);
  if (!found) return null;
  const exercise = found.exercise;
  const previous = exercise.sets[exercise.sets.length - 1];
  const set: GymSet = {
    id: uid(),
    weight: previous?.weight ?? (Number(exercise.weight) || 20),
    reps: previous?.reps ?? 10,
    completed: false,
  };
  exercise.sets.push(set);
  return set;
}

export function updateGymSessionSet(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number },
  setIndex: number,
  updates: Partial<GymSet>,
  completedAt = new Date().toISOString()
): { updated: boolean; justCompleted: boolean } {
  const session = gym.sessions.find((s) => s.id === sessionId);
  const found = findSessionExercise(session, exerciseTarget);
  const exercise = found?.exercise;
  const set = exercise?.sets[setIndex];
  if (!exercise || !set) return { updated: false, justCompleted: false };
  const justCompleted = set.completed !== true && updates.completed === true;
  Object.assign(set, updates);
  if (updates.weight != null) exercise.weight = updates.weight;
  if (justCompleted) set.completedAt = completedAt;
  return { updated: true, justCompleted };
}

export function deleteGymSessionSet(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number },
  setIndex: number
): boolean {
  const session = gym.sessions.find((s) => s.id === sessionId);
  const found = findSessionExercise(session, exerciseTarget);
  const exercise = found?.exercise;
  if (!exercise?.sets[setIndex]) return false;
  exercise.sets.splice(setIndex, 1);
  return true;
}

export function deleteGymSessionExercise(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number }
): boolean {
  const session = gym.sessions.find((candidate) => candidate.id === sessionId);
  const found = findSessionExercise(session, exerciseTarget);
  if (!session || !found) return false;
  session.exercises.splice(found.index, 1);
  return true;
}

export function updateGymSessionExercise(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number },
  updates: { equipment?: ExerciseEquipment; barWeight?: number }
): boolean {
  const session = gym.sessions.find((s) => s.id === sessionId);
  const found = findSessionExercise(session, exerciseTarget);
  const exercise = found?.exercise;
  if (!exercise) return false;
  if (updates.equipment) {
    exercise.equipment = updates.equipment;
    exercise.barWeight = updates.equipment === 'barra'
      ? (updates.barWeight ?? (exercise.barWeight && exercise.barWeight > 0 ? exercise.barWeight : 20))
      : 0;
  } else if (updates.barWeight != null) {
    exercise.barWeight = updates.barWeight;
  }
  return true;
}

export interface GymHistoryMutationPreview {
  affectedSessionIds: string[];
  affectedExerciseCount: number;
  updatedSessions: GymSession[];
  updatedTemplates: RoutineTemplate[];
}

function mergeCompletedSessionUpdates(gym: Gym, completedUpdates: GymSession[]): GymSession[] {
  const byId = new Map(completedUpdates.map((session) => [session.id, session]));
  return gym.sessions.map((session) => byId.get(session.id) || session);
}

function changedExerciseCount(before: GymSession, after: GymSession): number {
  return after.exercises.reduce((count, exercise, index) => {
    const previous = before.exercises[index];
    return count + (JSON.stringify(previous) === JSON.stringify(exercise) ? 0 : 1);
  }, 0);
}

function buildPreview(gym: Gym, completedUpdates: GymSession[], updatedTemplates: RoutineTemplate[]): GymHistoryMutationPreview {
  const originalById = new Map(gym.sessions.map((session) => [session.id, session]));
  const changes = completedUpdates.flatMap((session) => {
    const original = originalById.get(session.id);
    if (!original) return [];
    const count = changedExerciseCount(original, session);
    return count > 0 ? [{ id: session.id, count }] : [];
  });
  return {
    affectedSessionIds: changes.map((change) => change.id),
    affectedExerciseCount: changes.reduce((total, change) => total + change.count, 0),
    updatedSessions: mergeCompletedSessionUpdates(gym, completedUpdates),
    updatedTemplates,
  };
}

export function previewTemplateHistoryPropagation(gym: Gym, templateId: string): GymHistoryMutationPreview {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  const completed = gym.sessions.filter((session) => session.status === 'completed');
  if (!template) return buildPreview(gym, completed, gym.routineTemplates);

  let updatedSessions = completed;
  let updatedTemplates = gym.routineTemplates;
  for (const exercise of template.exercises) {
    const equipment = exercise.equipment || inferExerciseEquipment(exercise.name).equipment;
    const result = propagateExerciseConfiguration(updatedSessions, updatedTemplates, exercise.name, {
      equipment,
      barWeight: equipment === 'barra' ? (exercise.barWeight ?? 20) : 0,
      muscleGroup: exercise.muscleGroup,
    });
    updatedSessions = result.updatedSessions;
    updatedTemplates = result.updatedTemplates;
  }
  return buildPreview(gym, updatedSessions, updatedTemplates);
}

export function previewExerciseHistoryPropagation(
  gym: Gym,
  exerciseName: string,
  config: { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: MuscleGroup | string }
): GymHistoryMutationPreview {
  const completed = gym.sessions.filter((session) => session.status === 'completed');
  const result = propagateExerciseConfiguration(
    completed,
    gym.routineTemplates,
    exerciseName,
    config
  );
  return buildPreview(gym, result.updatedSessions, result.updatedTemplates);
}

export function previewNormalizeGymHistory(gym: Gym): GymHistoryMutationPreview {
  const completed = gym.sessions.filter((session) => session.status === 'completed');
  const result = normalizeAllGymSessions(completed, gym.routineTemplates);
  return buildPreview(gym, result.updatedSessions, gym.routineTemplates);
}
