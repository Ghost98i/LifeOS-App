import type { DayKey, Exercise, Gym, GymSession, GymSet, MuscleGroup, RoutineTemplate } from '../types';

interface LegacyExercise {
  id?: unknown;
  name?: unknown;
  weight?: unknown;
  reps?: unknown;
  sets?: unknown;
  muscleGroup?: unknown;
  restSeconds?: unknown;
  timerEnabled?: unknown;
  legacyReps?: unknown;
}

interface LegacySession {
  id?: unknown;
  date?: unknown;
  weekLabel?: unknown;
  status?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
  exercises?: unknown;
}

const MUSCLE_GROUPS: MuscleGroup[] = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'];
const DAYS: DayKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function inferMuscleGroup(name: string): MuscleGroup {
  const value = normalizedName(name);
  // Movimientos como "jalón al pecho" describen el recorrido, no el grupo muscular.
  // Las coincidencias específicas de espalda deben evaluarse antes que la palabra "pecho".
  if (/(jalon|remo|dominada|pullover|espalda)/.test(value)) return 'Espalda';
  if (/(press banca|pecho|pec deck|apertura|fondos)/.test(value)) return 'Pecho';
  if (/(sentadilla|hack|prensa|femoral|cuadriceps|gemelo|aduccion|abduccion|peso muerto)/.test(value)) return 'Piernas';
  if (/(hombro|deltoide|elevacion(?:es)? lateral(?:es)?|press militar|face pull)/.test(value)) return 'Hombros';
  if (/(biceps|triceps|curl|trasnuca)/.test(value)) return 'Brazos';
  if (/(abdominal|core|plancha)/.test(value)) return 'Core';
  if (/(cinta|bicicleta|eliptica|cardio|correr)/.test(value)) return 'Cardio';
  return 'Otros';
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function stablePart(value: unknown, fallback: string): string {
  const text = String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return text || fallback;
}

function stableSetId(ownerId: string, exerciseIndex: number, setIndex: number): string {
  return `${stablePart(ownerId, 'gym')}-ex-${exerciseIndex}-set-${setIndex}`;
}

export interface ParsedLegacyReps {
  reps: number[];
  legacyReps: string | null;
}

export function parseLegacyReps(value: unknown): ParsedLegacyReps {
  const original = String(value ?? '').trim();
  if (!original) return { reps: [], legacyReps: null };
  const normalized = original.toLowerCase().replace(/\s+/g, ' ').trim();

  const repeated = normalized.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (repeated) {
    const setCount = Number(repeated[1]);
    const repetitions = Number(repeated[2]);
    if (setCount > 0 && setCount <= 20 && repetitions > 0 && repetitions <= 1000) {
      return { reps: Array.from({ length: setCount }, () => repetitions), legacyReps: null };
    }
  }

  if (/^\d+(?:\s*[/,]\s*\d+)+$/.test(normalized)) {
    const reps = normalized.split(/[/,]/).map((part) => Number(part.trim()));
    if (reps.every((item) => item > 0 && item <= 1000)) return { reps, legacyReps: null };
  }

  if (/^\d+$/.test(normalized)) {
    const repetitions = Number(normalized);
    if (repetitions > 0 && repetitions <= 1000) return { reps: [repetitions], legacyReps: null };
  }

  return { reps: [], legacyReps: original };
}

function normalizeSet(value: unknown, fallbackId: string): GymSet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const reps = numeric(candidate.reps);
  if (reps <= 0) return null;
  return {
    id: stablePart(candidate.id, fallbackId),
    weight: numeric(candidate.weight),
    reps,
    completedAt: typeof candidate.completedAt === 'string' ? candidate.completedAt : null,
  };
}

export function migrateExercise(value: unknown, ownerId: string, exerciseIndex: number): Exercise {
  const legacy = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as LegacyExercise;
  const exerciseId = stablePart(legacy.id, `${stablePart(ownerId, 'gym')}-ex-${exerciseIndex}`);
  const existingSets = Array.isArray(legacy.sets)
    ? legacy.sets.flatMap((set, setIndex) => {
      const normalized = normalizeSet(set, stableSetId(ownerId, exerciseIndex, setIndex));
      return normalized ? [normalized] : [];
    })
    : [];
  const parsed = existingSets.length > 0 ? { reps: [] as number[], legacyReps: null } : parseLegacyReps(legacy.reps);
  const weight = numeric(legacy.weight);
  const migratedSets = existingSets.length > 0
    ? existingSets
    : parsed.reps.map((reps, setIndex) => ({
      id: stableSetId(ownerId, exerciseIndex, setIndex),
      weight,
      reps,
      completedAt: null,
    }));
  let muscleGroup = MUSCLE_GROUPS.includes(legacy.muscleGroup as MuscleGroup)
    ? legacy.muscleGroup as MuscleGroup
    : inferMuscleGroup(String(legacy.name || ''));
  const inferredMuscleGroup = inferMuscleGroup(String(legacy.name || ''));
  // Corrige automáticamente datos creados por el clasificador anterior.
  if (muscleGroup === 'Pecho' && inferredMuscleGroup === 'Espalda') muscleGroup = 'Espalda';
  if (muscleGroup === 'Otros' && /elevacion(?:es)? lateral(?:es)?/.test(normalizedName(String(legacy.name || '')))) muscleGroup = 'Hombros';

  return {
    id: exerciseId,
    name: String(legacy.name || '').trim() || 'Ejercicio sin nombre',
    sets: migratedSets,
    muscleGroup,
    restSeconds: Math.min(600, Math.max(15, numeric(legacy.restSeconds) || 90)),
    timerEnabled: legacy.timerEnabled === true,
    legacyReps: typeof legacy.legacyReps === 'string' ? legacy.legacyReps : parsed.legacyReps,
  };
}

function migrateSession(value: unknown, index: number): GymSession {
  const legacy = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as LegacySession;
  const id = stablePart(legacy.id, `session-${index}`);
  const exercises = Array.isArray(legacy.exercises)
    ? legacy.exercises.map((exercise, exerciseIndex) => migrateExercise(exercise, id, exerciseIndex))
    : [];
  return {
    id,
    date: typeof legacy.date === 'string' ? legacy.date : '',
    weekLabel: typeof legacy.weekLabel === 'string' ? legacy.weekLabel : undefined,
    status: legacy.status === 'active' ? 'active' : 'completed',
    startedAt: typeof legacy.startedAt === 'string' ? legacy.startedAt : null,
    finishedAt: typeof legacy.finishedAt === 'string' ? legacy.finishedAt : null,
    exercises,
  };
}

function migrateTemplate(value: unknown, index: number): RoutineTemplate {
  const legacy = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as LegacySession & { name?: unknown; days?: unknown };
  const id = stablePart(legacy.id, `template-${index}`);
  return {
    id,
    name: String(legacy.name || '').trim() || `Rutina ${index + 1}`,
    days: Array.isArray(legacy.days) ? legacy.days.filter((day): day is DayKey => DAYS.includes(day as DayKey)) : [],
    exercises: Array.isArray(legacy.exercises)
      ? legacy.exercises.map((exercise, exerciseIndex) => migrateExercise(exercise, id, exerciseIndex))
      : [],
  };
}

export function migrateGym(value: unknown): Gym {
  const gym = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sessions = Array.isArray(gym.sessions) ? gym.sessions.map(migrateSession) : [];
  let activeSeen = false;
  sessions.forEach((session) => {
    if (session.status !== 'active') return;
    if (activeSeen) session.status = 'completed';
    activeSeen = true;
  });
  const timer = gym.activeTimer && typeof gym.activeTimer === 'object' && !Array.isArray(gym.activeTimer)
    ? gym.activeTimer as Record<string, unknown>
    : null;
  return {
    weight: Array.isArray(gym.weight) ? gym.weight as Gym['weight'] : [],
    measurements: Array.isArray(gym.measurements) ? gym.measurements as Gym['measurements'] : [],
    sessions,
    routineTemplates: Array.isArray(gym.routineTemplates) ? gym.routineTemplates.map(migrateTemplate) : [],
    activeTimer: timer && numeric(timer.endsAt) > 0 && typeof timer.sessionId === 'string'
      ? {
        endsAt: numeric(timer.endsAt),
        durationSeconds: numeric(timer.durationSeconds),
        sessionId: timer.sessionId,
        exerciseId: typeof timer.exerciseId === 'string' ? timer.exerciseId : null,
        setId: typeof timer.setId === 'string' ? timer.setId : null,
      }
      : null,
  };
}

export function exerciseVolume(exercise: Exercise): number {
  return exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
}

export function sessionVolume(session: GymSession): number {
  return session.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
}
