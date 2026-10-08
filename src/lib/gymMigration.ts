import type { DayKey, Exercise, ExerciseEquipment, Gym, GymSession, GymSet, MuscleGroup, RoutineTemplate } from '../types';

interface LegacyExercise {
  id?: unknown;
  name?: unknown;
  equipment?: unknown;
  weight?: unknown;
  barWeight?: unknown;
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
export const EXERCISE_EQUIPMENT_LIST: ExerciseEquipment[] = ['barra', 'mancuerna', 'polea', 'maquina', 'corporal'];
export const EXERCISE_EQUIPMENT_OPTIONS: { key: ExerciseEquipment; label: string; icon: string }[] = [
  { key: 'barra', label: '🏋️ Barra', icon: '🏋️' },
  { key: 'mancuerna', label: '💪 Mancuerna', icon: '💪' },
  { key: 'polea', label: '🔗 Polea', icon: '🔗' },
  { key: 'maquina', label: '⚙️ Máquina', icon: '⚙️' },
  { key: 'corporal', label: '🤸 Corporal', icon: '🤸' },
];

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function inferExerciseEquipment(name: string): { equipment: ExerciseEquipment; barWeight: number } {
  const value = normalizedName(name);

  // Palabras clave explícitas de mancuerna / mancuernas
  if (/(?:mancuerna|mancuernas|dumbbell|db|apertura|elevacion(?:es)? lateral|curl martillo|remo unilateral|vuelo)/.test(value)) {
    return { equipment: 'mancuerna', barWeight: 0 };
  }

  // Polea / Cable
  if (/(?:polea|cable|jalon|jalón|cruce|face pull|pulley)/.test(value)) {
    return { equipment: 'polea', barWeight: 0 };
  }

  // Máquina / Prensa / Smith
  if (/(?:maquina|máquina|prensa|hack|sill[oó]n|contractora|chest press|smith|multipower|gemelo en)/.test(value)) {
    return { equipment: 'maquina', barWeight: 0 };
  }

  // Peso corporal / Calistenia
  if (/(?:dominada|dominadas|fondo|fondos|pull[\s-]?up|chin[\s-]?up|dip|dips|plancha|flexion|flexiones|push[\s-]?up|colgado|abdominal)/.test(value)) {
    return { equipment: 'corporal', barWeight: 0 };
  }

  // Barra explícita o ejercicios estándar con barra
  if (/(?:barra|barbell|banca|sentadilla|squat|peso muerto|deadlift|militar|hip thrust|remo con barra)/.test(value)) {
    const isEZorShort = /(?:ez|w|frances|francés|corta)/.test(value);
    return { equipment: 'barra', barWeight: isEZorShort ? 10 : 20 };
  }

  // Si incluye "press" pero no especificó mancuerna, suele ser barra
  if (/press/.test(value)) {
    return { equipment: 'barra', barWeight: 20 };
  }

  // Aislamientos comunes por defecto mancuerna
  return { equipment: 'mancuerna', barWeight: 0 };
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

function normalizeSet(value: unknown, fallbackId: string, defaultCompleted = false): GymSet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const reps = numeric(candidate.reps);
  if (reps <= 0) return null;
  const completed = typeof candidate.completed === 'boolean'
    ? candidate.completed
    : candidate.completedAt
      ? true
      : defaultCompleted;
  return {
    id: stablePart(candidate.id, fallbackId),
    weight: numeric(candidate.weight),
    reps,
    completed,
    completedAt: typeof candidate.completedAt === 'string' ? candidate.completedAt : null,
    rpe: typeof candidate.rpe === 'number' && !Number.isNaN(candidate.rpe) ? candidate.rpe : undefined,
  };
}

export function migrateExercise(
  value: unknown,
  ownerId: string,
  exerciseIndex: number,
  defaultCompleted = false
): Exercise {
  const legacy = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as LegacyExercise;
  const exerciseId = stablePart(legacy.id, `${stablePart(ownerId, 'gym')}-ex-${exerciseIndex}`);
  const existingSets = Array.isArray(legacy.sets)
    ? legacy.sets.flatMap((set, setIndex) => {
      const normalized = normalizeSet(set, stableSetId(ownerId, exerciseIndex, setIndex), defaultCompleted);
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
      completed: defaultCompleted,
    }));
  let muscleGroup = MUSCLE_GROUPS.includes(legacy.muscleGroup as MuscleGroup)
    ? legacy.muscleGroup as MuscleGroup
    : inferMuscleGroup(String(legacy.name || ''));
  const inferredMuscleGroup = inferMuscleGroup(String(legacy.name || ''));
  // Corrige automáticamente datos creados por el clasificador anterior.
  if (muscleGroup === 'Pecho' && inferredMuscleGroup === 'Espalda') muscleGroup = 'Espalda';
  if (muscleGroup === 'Otros' && /elevacion(?:es)? lateral(?:es)?/.test(normalizedName(String(legacy.name || '')))) muscleGroup = 'Hombros';

  const exerciseName = String(legacy.name || '').trim() || 'Ejercicio sin nombre';
  const inferredEq = inferExerciseEquipment(exerciseName);

  let equipment: ExerciseEquipment;
  if (typeof (legacy as any).equipment === 'string' && EXERCISE_EQUIPMENT_LIST.includes((legacy as any).equipment)) {
    equipment = (legacy as any).equipment;
  } else {
    equipment = inferredEq.equipment;
  }

  let barWeight = 0;
  if (equipment === 'barra') {
    if (Number.isFinite(Number((legacy as any).barWeight)) && Number((legacy as any).barWeight) > 0) {
      barWeight = Number((legacy as any).barWeight);
    } else {
      barWeight = inferredEq.barWeight;
    }
  } else {
    barWeight = 0;
  }

  return {
    id: exerciseId,
    name: exerciseName,
    equipment,
    weight: numeric(legacy.weight) || (migratedSets[0]?.weight ?? 0),
    barWeight,
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
  const status = legacy.status === 'active' ? 'active' : 'completed';
  const exercises = Array.isArray(legacy.exercises)
    ? legacy.exercises.map((exercise, exerciseIndex) =>
        migrateExercise(exercise, id, exerciseIndex, status === 'completed')
      )
    : [];
  return {
    id,
    date: typeof legacy.date === 'string' ? legacy.date : '',
    weekLabel: typeof legacy.weekLabel === 'string' ? legacy.weekLabel : undefined,
    status,
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
  sessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const timer = gym.activeTimer && typeof gym.activeTimer === 'object' && !Array.isArray(gym.activeTimer)
    ? gym.activeTimer as Record<string, unknown>
    : null;
  return {
    weight: Array.isArray(gym.weight) ? gym.weight as Gym['weight'] : [],
    measurements: Array.isArray(gym.measurements) ? gym.measurements as Gym['measurements'] : [],
    sessions,
    routineTemplates: Array.isArray(gym.routineTemplates) ? gym.routineTemplates.map(migrateTemplate) : [],
    restDays: Array.isArray(gym.restDays) ? (gym.restDays as string[]).filter((d) => typeof d === 'string') : [],
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
  return exercise.sets.reduce(
    (sum, set) => sum + (set.completed === true ? set.weight * set.reps : 0),
    0
  );
}

export function sessionVolume(session: GymSession): number {
  return session.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
}

/**
 * Normaliza todas las sesiones de gimnasio aplicando las definiciones de plantillas
 * y la inferencia inteligente de equipamiento.
 */
export function normalizeAllGymSessions(
  sessions: GymSession[],
  templates: RoutineTemplate[] = []
): { updatedSessions: GymSession[]; affectedCount: number } {
  const templateExerciseMap = new Map<string, { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: string }>();
  for (const t of templates) {
    for (const ex of t.exercises) {
      const key = normalizedName(ex.name);
      if (key && !templateExerciseMap.has(key)) {
        templateExerciseMap.set(key, {
          equipment: ex.equipment || inferExerciseEquipment(ex.name).equipment,
          barWeight: ex.equipment === 'barra' ? (ex.barWeight ?? 20) : 0,
          muscleGroup: ex.muscleGroup,
        });
      }
    }
  }

  let affectedCount = 0;
  const updatedSessions = sessions.map((sess) => {
    let sessionChanged = false;
    const updatedExercises = sess.exercises.map((ex) => {
      const key = normalizedName(ex.name);
      const fromTemplate = templateExerciseMap.get(key);
      const inferred = inferExerciseEquipment(ex.name);
      const targetEquipment = fromTemplate?.equipment ?? ex.equipment ?? inferred.equipment;
      const targetBarWeight = targetEquipment === 'barra'
        ? (fromTemplate?.barWeight ?? (ex.barWeight && ex.barWeight > 0 ? ex.barWeight : inferred.barWeight))
        : 0;
      const targetMuscle = (ex.muscleGroup && ex.muscleGroup !== 'Otros' ? ex.muscleGroup : fromTemplate?.muscleGroup) || ex.muscleGroup;

      if (ex.equipment !== targetEquipment || ex.barWeight !== targetBarWeight) {
        sessionChanged = true;
        affectedCount += 1;
        return {
          ...ex,
          equipment: targetEquipment,
          barWeight: targetBarWeight,
          muscleGroup: targetMuscle,
        };
      }
      return ex;
    });

    if (sessionChanged) {
      return { ...sess, exercises: updatedExercises };
    }
    return sess;
  });

  return { updatedSessions, affectedCount };
}

/**
 * Propaga la configuración de un ejercicio (equipamiento, barra, grupo muscular)
 * a todas las sesiones anteriores y plantillas que contengan ese ejercicio por nombre.
 */
export function propagateExerciseConfiguration(
  sessions: GymSession[],
  templates: RoutineTemplate[],
  exerciseName: string,
  config: { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: MuscleGroup | string }
): { updatedSessions: GymSession[]; updatedTemplates: RoutineTemplate[]; affectedSessions: number } {
  const targetKey = normalizedName(exerciseName);
  if (!targetKey) return { updatedSessions: sessions, updatedTemplates: templates, affectedSessions: 0 };

  let affectedSessions = 0;
  const updatedSessions = sessions.map((sess) => {
    let matched = false;
    const updatedExercises = sess.exercises.map((ex) => {
      if (normalizedName(ex.name) === targetKey) {
        matched = true;
        return {
          ...ex,
          equipment: config.equipment,
          barWeight: config.equipment === 'barra' ? config.barWeight : 0,
          muscleGroup: config.muscleGroup || ex.muscleGroup,
        };
      }
      return ex;
    });
    if (matched) affectedSessions += 1;
    return matched ? { ...sess, exercises: updatedExercises } : sess;
  });

  const updatedTemplates = templates.map((tmpl) => {
    let matched = false;
    const updatedExercises = tmpl.exercises.map((ex) => {
      if (normalizedName(ex.name) === targetKey) {
        matched = true;
        return {
          ...ex,
          equipment: config.equipment,
          barWeight: config.equipment === 'barra' ? config.barWeight : 0,
          muscleGroup: config.muscleGroup || ex.muscleGroup,
        };
      }
      return ex;
    });
    return matched ? { ...tmpl, exercises: updatedExercises } : tmpl;
  });

  return { updatedSessions, updatedTemplates, affectedSessions };
}
