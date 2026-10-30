import type {
  DayKey,
  Exercise,
  ExerciseEquipment,
  Gym,
  GymActiveTimer,
  GymSession,
  GymSettings,
  GymSet,
  MuscleGroup,
  RoutineAppearance,
  RoutineTemplate,
} from '../types';
import { isRoutineIconName } from '../types';
import { uid } from './storage';
import {
  applyHistoryToTemplateExercises,
  getExerciseGhostValues,
  getExerciseInitialSuggestion,
  hasPerformedGymWork,
  isLogicalTimeRangeValid,
} from './gymMetrics';
export {
  getCompletedGymSets,
  getExerciseInitialSuggestion,
  getPerformedGymVolume,
  hasPerformedGymWork,
  isLogicalTimeRangeValid,
  isPerformedGymSession,
} from './gymMetrics';
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

  // Recuperación segura de rutinas históricas que quedaron con timerEnabled: false
  // por el comportamiento anterior, sin alterar rutinas con desactivación selectiva o explícita.
  if (template && template.exercises.length > 0) {
    const allUniformlyFalse = template.exercises.every((ex) => ex.timerEnabled === false);
    const noneExplicitlyDisabled = template.exercises.every((ex) => ex.restSecondsMode !== 'disabled' && ex.restSeconds !== 0);
    if (allUniformlyFalse && noneExplicitlyDisabled) {
      for (const ex of template.exercises) {
        ex.timerEnabled = true;
      }
    }
  }
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
  updates: Partial<Pick<GymSession, 'date' | 'weekLabel' | 'startedAt' | 'finishedAt'>>
): boolean {
  const session = gym.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return false;

  const nextStartedAt = updates.startedAt !== undefined ? updates.startedAt : session.startedAt;
  const nextFinishedAt = updates.finishedAt !== undefined ? updates.finishedAt : session.finishedAt;

  if (updates.startedAt !== undefined || updates.finishedAt !== undefined) {
    if (!isLogicalTimeRangeValid(nextStartedAt, nextFinishedAt)) {
      return false;
    }
  }

  if (updates.date !== undefined) session.date = updates.date;
  if (updates.weekLabel !== undefined) session.weekLabel = updates.weekLabel.trim() || undefined;
  if (updates.startedAt !== undefined) session.startedAt = updates.startedAt;
  if (updates.finishedAt !== undefined) session.finishedAt = updates.finishedAt;
  return true;
}

export function deleteGymTemplate(gym: Gym, templateId: string): boolean {
  const previousLength = gym.routineTemplates.length;
  gym.routineTemplates = gym.routineTemplates.filter((template) => template.id !== templateId);
  return gym.routineTemplates.length !== previousLength;
}

export function updateGymTemplate(
  gym: Gym,
  templateId: string,
  updates: { name?: string; days?: DayKey[]; appearance?: RoutineAppearance | null }
): boolean {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  if (!template) return false;
  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) return false;
    template.name = name;
  }
  if (updates.days !== undefined) template.days = [...new Set(updates.days)];
  if (updates.appearance !== undefined) {
    if (updates.appearance && updates.appearance.icon && isRoutineIconName(updates.appearance.icon)) {
      template.appearance = { icon: updates.appearance.icon };
    } else {
      delete template.appearance;
    }
  }
  return true;
}

export function duplicateGymTemplate(
  gym: Gym,
  templateId: string,
  input: { templateId?: string; name?: string } = {}
): RoutineTemplate | null {
  const source = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  if (!source) return null;

  const duplicate: RoutineTemplate = {
    id: input.templateId || uid(),
    name: input.name?.trim() || `${source.name} (copia)`,
    days: source.days ? [...source.days] : undefined,
    appearance: source.appearance ? { ...source.appearance } : undefined,
    exercises: source.exercises.map((exercise) => ({
      ...exercise,
      // Exercise IDs are logical identities shared with history; only legacy entries receive one.
      id: exercise.id || uid(),
      sets: (exercise.sets || []).map((set) => ({
        ...set,
        id: uid(),
        completed: false,
        completedAt: null,
      })),
    })),
  };
  gym.routineTemplates.push(duplicate);
  return duplicate;
}

export type TemplateExerciseTarget = string | { exerciseId?: string; exerciseIndex?: number };

export function findTemplateExercise(
  template: RoutineTemplate | undefined,
  target: TemplateExerciseTarget
): { exercise: Exercise; index: number } | null {
  if (!template) return null;
  const exerciseId = typeof target === 'string' ? target : target.exerciseId;
  if (exerciseId) {
    const index = template.exercises.findIndex((exercise) => exercise.id === exerciseId);
    return index >= 0 ? { exercise: template.exercises[index], index } : null;
  }
  const legacyIndex = typeof target === 'string' ? undefined : target.exerciseIndex;
  if (legacyIndex === undefined || legacyIndex < 0 || legacyIndex >= template.exercises.length) return null;
  const exercise = template.exercises[legacyIndex];
  return exercise.id ? null : { exercise, index: legacyIndex };
}

export function updateGymTemplateExercise(
  gym: Gym,
  templateId: string,
  target: TemplateExerciseTarget,
  updates: Partial<Exercise>
): boolean {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  const found = findTemplateExercise(template, target);
  if (!found) return false;
  Object.assign(found.exercise, updates);
  if (updates.restSeconds !== undefined && updates.restSecondsMode === undefined) {
    found.exercise.restSecondsMode = 'custom';
  }
  return true;
}

export function configureGymTemplateExercise(
  gym: Gym,
  templateId: string,
  target: TemplateExerciseTarget,
  input: { setsCount: number; reps: number; targetWeight: number; restSeconds?: number }
): boolean {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  const found = findTemplateExercise(template, target);
  if (!found) return false;

  const setsCount = Math.min(20, Math.max(1, Math.round(input.setsCount) || 1));
  const reps = Math.min(1000, Math.max(1, Math.round(input.reps) || 1));
  const targetWeight = Math.max(0, Number(input.targetWeight) || 0);
  found.exercise.sets = Array.from({ length: setsCount }, (_, index) => ({
    id: found.exercise.sets[index]?.id || uid(),
    weight: targetWeight,
    reps,
    completed: false,
    completedAt: null,
  }));
  found.exercise.weight = targetWeight;
  if (input.restSeconds !== undefined) {
    found.exercise.restSeconds = Math.min(600, Math.max(15, Math.round(input.restSeconds) || 90));
    found.exercise.restSecondsMode = 'custom';
  }
  return true;
}

export function reorderGymTemplateExercise(
  gym: Gym,
  templateId: string,
  target: TemplateExerciseTarget,
  toIndex: number
): boolean {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  const found = findTemplateExercise(template, target);
  if (!template || !found || toIndex < 0 || toIndex >= template.exercises.length || toIndex === found.index) return false;
  const [exercise] = template.exercises.splice(found.index, 1);
  template.exercises.splice(toIndex, 0, exercise);
  return true;
}

export function deleteGymTemplateExercise(
  gym: Gym,
  templateId: string,
  target: TemplateExerciseTarget
): boolean {
  const template = gym.routineTemplates.find((candidate) => candidate.id === templateId);
  const found = findTemplateExercise(template, target);
  if (!template || !found) return false;
  template.exercises.splice(found.index, 1);
  return true;
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
  const ghost = getExerciseGhostValues(gym.sessions, { exerciseName: name }, sessionId);
  const suggestion = getExerciseInitialSuggestion(gym.sessions, { exerciseName: name }, { excludeSessionId: sessionId });
  const initialWeight = input.initialWeight ?? 20;
  const initialReps = input.initialReps ?? 10;
  const startWeight = suggestion?.weight ?? ghost?.sets[0]?.weight ?? initialWeight;
  const startReps = suggestion?.reps ?? ghost?.sets[0]?.reps ?? initialReps;
  const sets: GymSet[] = ghost?.sets.length
    ? ghost.sets.map((set) => ({
        id: uid(),
        weight: set.weight,
        reps: set.reps,
        completed: false,
        type: set.type,
      }))
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
    restSecondsMode: 'inherit',
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
    return idx >= 0 ? { exercise: session.exercises[idx], index: idx } : null;
  }

  // 2. Fallback to index only for legacy exercises without an ID.
  if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < session.exercises.length) {
    const exercise = session.exercises[targetIndex];
    return exercise.id ? null : { exercise, index: targetIndex };
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
  if (updates.completed === false) {
    set.completedAt = null;
    if (gym.activeTimer?.sessionId === sessionId && gym.activeTimer?.setId === set.id) {
      gym.activeTimer = null;
    }
  }
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
  const targetSet = exercise?.sets[setIndex];
  if (!targetSet) return false;
  if (gym.activeTimer?.sessionId === sessionId && gym.activeTimer?.setId === targetSet.id) {
    gym.activeTimer = null;
  }
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
  if (gym.activeTimer?.sessionId === sessionId && (gym.activeTimer?.exerciseId === found.exercise.id || gym.activeTimer?.exerciseIndex === found.index)) {
    gym.activeTimer = null;
  }
  session.exercises.splice(found.index, 1);
  return true;
}

export const DEFAULT_GYM_SETTINGS: Required<GymSettings> = {
  restBetweenSetsSeconds: 120,
  restBetweenExercisesSeconds: 180,
  autoTimerEnabled: true,
  showQuickRestAdjustments: true,
  allowManualRestEditing: false,
};

export function getGymSettings(gym?: Gym | null): Required<GymSettings> {
  const settings = gym?.settings;
  return {
    restBetweenSetsSeconds: typeof settings?.restBetweenSetsSeconds === 'number' && settings.restBetweenSetsSeconds > 0
      ? settings.restBetweenSetsSeconds
      : DEFAULT_GYM_SETTINGS.restBetweenSetsSeconds,
    restBetweenExercisesSeconds: typeof settings?.restBetweenExercisesSeconds === 'number' && settings.restBetweenExercisesSeconds > 0
      ? settings.restBetweenExercisesSeconds
      : DEFAULT_GYM_SETTINGS.restBetweenExercisesSeconds,
    autoTimerEnabled: settings?.autoTimerEnabled !== undefined
      ? Boolean(settings.autoTimerEnabled)
      : DEFAULT_GYM_SETTINGS.autoTimerEnabled,
    showQuickRestAdjustments: settings?.showQuickRestAdjustments !== undefined
      ? Boolean(settings.showQuickRestAdjustments)
      : DEFAULT_GYM_SETTINGS.showQuickRestAdjustments,
    allowManualRestEditing: settings?.allowManualRestEditing !== undefined
      ? Boolean(settings.allowManualRestEditing)
      : DEFAULT_GYM_SETTINGS.allowManualRestEditing,
  };
}

const LEGACY_EXERCISE_REST_DEFAULT_SECONDS = 90;

/**
 * Resolves the effective between-set rest without letting an old template default
 * silently shadow the user's global setting. Unmarked legacy values other than the
 * historical 90-second default are retained as likely user customizations.
 */
export function getEffectiveExerciseRestSeconds(exercise: Exercise, settings: Required<GymSettings>): number {
  const stored = typeof exercise.restSeconds === 'number' && exercise.restSeconds > 0
    ? Math.min(600, Math.max(15, Math.round(exercise.restSeconds)))
    : null;
  const hasExplicitOverride = exercise.restSecondsMode === 'custom'
    || (exercise.restSecondsMode === undefined && stored !== null && stored !== LEGACY_EXERCISE_REST_DEFAULT_SECONDS);
  return hasExplicitOverride && stored !== null ? stored : settings.restBetweenSetsSeconds;
}

export function isExerciseCompleted(exercise: Exercise): boolean {
  if (!exercise || !Array.isArray(exercise.sets) || exercise.sets.length === 0) return false;
  const effectiveSets = exercise.sets.filter((s) => s.type !== 'warmup');
  if (effectiveSets.length > 0) {
    return effectiveSets.every((s) => s.completed === true);
  }
  return exercise.sets.every((s) => s.completed === true);
}

export function resolveNextRestTimer(
  gym: Gym,
  sessionId: string,
  exerciseTarget: number | string | { exerciseId?: string; exerciseIndex?: number },
  completedSetIndex: number,
  now = Date.now()
): GymActiveTimer | null {
  const session = gym.sessions.find((s) => s.id === sessionId);
  if (!session || session.status === 'completed') return null;

  const found = findSessionExercise(session, exerciseTarget);
  const exercise = found?.exercise;
  if (!exercise) return null;

  const settings = getGymSettings(gym);
  if (!settings.autoTimerEnabled || exercise.timerEnabled === false || exercise.restSecondsMode === 'disabled' || exercise.restSeconds === 0) {
    return null;
  }

  const completedSet = exercise.sets[completedSetIndex];
  const exerciseDone = isExerciseCompleted(exercise);
  const exerciseIndex = found.index;

  if (exerciseDone) {
    // Si todos los ejercicios de la sesión ya están completados, no requiere timer de descanso
    const hasRemainingIncomplete = session.exercises.some((ex, idx) => idx !== exerciseIndex && !isExerciseCompleted(ex));
    if (!hasRemainingIncomplete) {
      return null;
    }
    const durationSeconds = settings.restBetweenExercisesSeconds;
    const targetExerciseIndex = exerciseIndex + 1 < session.exercises.length ? exerciseIndex + 1 : undefined;
    return {
      endsAt: now + durationSeconds * 1000,
      durationSeconds,
      sessionId,
      exerciseId: exercise.id || null,
      setId: completedSet?.id || null,
      kind: 'exercise',
      exerciseIndex,
      targetExerciseIndex,
    };
  }

  const durationSeconds = getEffectiveExerciseRestSeconds(exercise, settings);

  return {
    endsAt: now + durationSeconds * 1000,
    durationSeconds,
    sessionId,
    exerciseId: exercise.id || null,
    setId: completedSet?.id || null,
    kind: 'set',
    exerciseIndex,
  };
}

export function pauseGymRestTimer(timer: GymActiveTimer, now = Date.now()): GymActiveTimer {
  if (timer.pausedAt) return timer;
  const remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  return {
    ...timer,
    pausedAt: now,
    remainingSecondsWhenPaused: remainingSeconds,
  };
}

export function resumeGymRestTimer(timer: GymActiveTimer, now = Date.now()): GymActiveTimer {
  if (!timer.pausedAt) return timer;
  const remainingSeconds = timer.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timer.endsAt - timer.pausedAt) / 1000));
  return {
    ...timer,
    endsAt: now + remainingSeconds * 1000,
    pausedAt: null,
    remainingSecondsWhenPaused: null,
  };
}

export function toggleGymRestTimerPause(timer: GymActiveTimer, now = Date.now()): GymActiveTimer {
  return timer.pausedAt ? resumeGymRestTimer(timer, now) : pauseGymRestTimer(timer, now);
}

export function applyGymRestTimerAdjustment(
  timer: GymActiveTimer,
  deltaSeconds: number,
  now = Date.now()
): { timer: GymActiveTimer | null; completed: boolean } {
  if (timer.pausedAt) {
    const currentRemaining = timer.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timer.endsAt - timer.pausedAt) / 1000));
    const nextRemaining = currentRemaining + deltaSeconds;
    if (nextRemaining <= 0) {
      return { timer: null, completed: true };
    }
    return {
      timer: {
        ...timer,
        remainingSecondsWhenPaused: nextRemaining,
        durationSeconds: Math.max(1, timer.durationSeconds + deltaSeconds),
        endsAt: timer.pausedAt + nextRemaining * 1000,
      },
      completed: false,
    };
  }

  if (deltaSeconds > 0) {
    return {
      timer: {
        ...timer,
        endsAt: timer.endsAt + deltaSeconds * 1000,
        durationSeconds: timer.durationSeconds + deltaSeconds,
      },
      completed: false,
    };
  }

  const remainingMs = timer.endsAt - now;
  const deltaMs = Math.abs(deltaSeconds) * 1000;

  if (remainingMs <= deltaMs) {
    return {
      timer: null,
      completed: true,
    };
  }

  return {
    timer: {
      ...timer,
      endsAt: timer.endsAt + deltaSeconds * 1000,
      durationSeconds: Math.max(1, timer.durationSeconds + deltaSeconds),
    },
    completed: false,
  };
}

export function setGymRestTimerRemaining(
  timer: GymActiveTimer,
  remainingSeconds: number,
  now = Date.now()
): GymActiveTimer {
  const durationSeconds = Math.max(1, Math.round(remainingSeconds) || 1);
  if (timer.pausedAt) {
    return {
      ...timer,
      endsAt: timer.pausedAt + durationSeconds * 1000,
      durationSeconds,
      remainingSecondsWhenPaused: durationSeconds,
    };
  }
  return {
    ...timer,
    endsAt: now + durationSeconds * 1000,
    durationSeconds,
  };
}

export function completeGymRestTimer(
  gym: Gym,
  timer: GymActiveTimer
): { nextExerciseIndex?: number; autoAdvanced: boolean } {
  gym.activeTimer = null;
  if (timer.kind === 'exercise' && typeof timer.targetExerciseIndex === 'number') {
    const session = gym.sessions.find((s) => s.id === timer.sessionId);
    if (session && timer.targetExerciseIndex < session.exercises.length) {
      return {
        nextExerciseIndex: timer.targetExerciseIndex,
        autoAdvanced: true,
      };
    }
  }
  return { autoAdvanced: false };
}

export function skipGymRestTimer(gym: Gym): { nextExerciseIndex?: number; autoAdvanced: boolean } {
  if (!gym.activeTimer) return { autoAdvanced: false };
  return completeGymRestTimer(gym, gym.activeTimer);
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
