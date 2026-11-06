import {
  isRoutineIconName,
  type DayKey,
  type Exercise,
  type ExerciseEquipment,
  type GymExerciseRestMode,
  type Gym,
  type GymSession,
  type GymSet,
  type MuscleGroup,
  type RoutineTemplate,
} from '../types';
import { isGymIconName } from './gymIconRegistry';
import { normalizeGymSyncMetadata } from './gymSync';

interface LegacyExercise {
  id?: unknown;
  name?: unknown;
  equipment?: unknown;
  icon?: unknown;
  weight?: unknown;
  barWeight?: unknown;
  reps?: unknown;
  sets?: unknown;
  muscleGroup?: unknown;
  restSeconds?: unknown;
  restSecondsMode?: unknown;
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
  { key: 'barra', label: 'Barra', icon: '🏋️' },
  { key: 'mancuerna', label: 'Mancuerna', icon: '💪' },
  { key: 'polea', label: 'Polea', icon: '🔗' },
  { key: 'maquina', label: 'Máquina', icon: '⚙️' },
  { key: 'corporal', label: 'Peso corporal', icon: '🤸' },
];

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function inferExerciseEquipment(name: string): { equipment: ExerciseEquipment; barWeight: number } {
  const value = normalizedName(name);

  // Palabras clave explícitas de mancuerna / mancuernas (español e inglés, singular y plural)
  if (/(?:mancuernas?|dumbbells?|\bdbs?\b|aperturas?|martillos?|hammers?|concentrados?|alternos?|zottman|spider|kickbacks?|vuelos?|pajaros?|arnold|goblet|zancadas?|estocadas?|lunges?|bulgaras?|shrugs?|encogimientos?|elevacion(?:es)? (?:lateral|frontal)|lateral raises?|front raises?|patadas? de triceps|remo unilateral|single[\s-]?arm|one[\s-]?arm|chest fly|flies|flyes|\bcurls?\b(?!.*(?:barra|barbell|polea|cable|maquina|scott|predicador|femoral|isquio|nordic)))/.test(value)) {
    return { equipment: 'mancuerna', barWeight: 0 };
  }

  // Polea / Cable
  if (/(?:poleas?|cables?|jalon(?:es)?|lat[\s-]?pulldowns?|pulldowns?|pull[\s-]?downs?|cruces?|crossover|face[\s-]?pulls?|pulleys?|pushdowns?|tricep(?:s)? pushdowns?|gironda|remo sentado|seated rows?)/.test(value)) {
    return { equipment: 'polea', barWeight: 0 };
  }

  // Máquina / Prensa / Smith
  if (/(?:maquinas?|machines?|prensas?|leg[\s-]?press|hack|sillon|camilla|contractor(?:a)?|pec[\s-]?deck|mariposas?|chest press|smith|multipower|gemelos? en|pantorrillas? en|extension(?:es)? de cuadriceps|leg extensions?|curl femoral|leg curls?|isquiotibiales|caminadoras?|treadmills?|bicicletas?|bicis?|spinning|elipticas?)/.test(value)) {
    return { equipment: 'maquina', barWeight: 0 };
  }

  // Peso corporal / Calistenia
  if (/(?:dominadas?|fondos?(?!.*maquina)|pull[\s-]?ups?|chin[\s-]?ups?|muscle[\s-]?ups?|dips?|planchas?|planks?|flexiones|lagartijas|push[\s-]?ups?|colgado|abdominal(?:es)?|\babs\b|crunch(?:es)?|sit[\s-]?ups?|burpees?|estiramientos?|elongacion|stretching|elevacion(?:es)? de piernas|leg raises?|rueda abdominal|ab[\s-]?wheel)/.test(value)) {
    return { equipment: 'corporal', barWeight: 0 };
  }

  // Barra explícita o ejercicios estándar con barra
  if (/(?:barras?|barbells?|\bbbs?\b|banca|bench(?: press)?|incline press|decline press|sentadillas?|squats?|peso muerto|deadlifts?|rdls?|rumano|sumo|militar(?:es)?|military press|overhead press|\bohp\b|hip[\s-]?thrusts?|remo con barra|barbell rows?|pendlay|thrusters?|snatch|arranques?|envion|cargadas?|cleans?|frances|rompecraneos|skull[\s-]?crushers?|predicador|scott)/.test(value)) {
    const isEZorShort = /(?:\bez\b|\bw\b|frances|rompecraneos|skull|predicador|scott|corta)/.test(value);
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
  if (!value.trim()) return 'Otros';

  // 1. Core (se evalúa antes que Piernas/Cardio para capturar "elevación de piernas" y "bicicleta abdominal")
  if (/(?:\b(?:core|abdomen|abdominal(?:es)?|abs|planchas?|planks?|crunch(?:es)?|sit[\s-]?ups?|ab[\s-]?wheel|rueda abdominal|oblicuos?|lumbares?|hiperextension(?:es)?|hollow|dragon flag|woodchop(?:per)?)\b|elevacion(?:es)? de piernas|leg raises?|hanging leg|toes to bar|giros? rusos?|russian twists?)/.test(value)) {
    return 'Core';
  }

  // 2. Cardio
  if (/(?:\b(?:cardio|caminadoras?|treadmills?|bicicletas?|bicis?|spinning|ciclismo|bikes?|air[\s-]?bike|elipticas?|correr|running|trotes?|sprints?|hiit|burpees?|soga|escaladora|stairmaster|ergometro)\b|saltar la cuerda|jump rope|cinta de correr|cinta)/.test(value) && !/cinta elastica/.test(value)) {
    return 'Cardio';
  }

  // 3. Hombros (se evalúa antes que Espalda/Pecho para capturar "face pull", "press militar", "shoulder press", "press de hombros")
  if (/(?:\b(?:hombros?|shoulders?|deltoides?|delts?|militar(?:es)?|military press|overhead press|ohp|shoulder press|arnold press|vuelos?|pajaros?|rear delts?|face[\s-]?pulls?|encogimientos?|shrugs?|trapecios?|traps?)\b|elevacion(?:es)? (?:lateral(?:es)?|frontal(?:es)?|posterior(?:es)?)|lateral raises?|front raises?|press (?:de )?hombros?|remo al menton|upright rows?)/.test(value)) {
    return 'Hombros';
  }

  // 4. Espalda (se evalúa antes que Pecho para capturar "jalón al pecho" o "remo al pecho")
  if (/(?:\b(?:espalda|back|dorsal(?:es)?|lats?|jalon(?:es)?|lat[\s-]?pulldowns?|pulldowns?|pull[\s-]?downs?|remos?|rows?|dominadas?|pull[\s-]?ups?|chin[\s-]?ups?|muscle[\s-]?ups?|pullovers?|rack[\s-]?pulls?|seal rows?|pendlay|t[\s-]?bar|gironda)\b|\bpull\b)/.test(value)) {
    return 'Espalda';
  }

  // 5. Brazos (se evalúa antes que Pecho para capturar "press francés", "press cerrado", "fondos de tríceps", "martillos", "curls")
  if (/(?:\b(?:brazos?|arms?|biceps?|triceps?|curls?|martillos?|hammers?|predicador|scott|concentrados?|zottman|spider|rompecraneos|skull[\s-]?crushers?|kickbacks?|trasnuca|antebrazos?|forearms?)\b|press (?:frances|cerrado)|close[\s-]?grip|patadas? de triceps|extension(?:es)? de triceps|pushdowns?|tricep(?:s)? pushdowns?|fondos? (?:de|para) triceps|fondos? entre bancos)/.test(value)) {
    return 'Brazos';
  }

  // 6. Pecho ("pecho", "bench press", "press banca", "push", "aperturas", "flexiones", "fondos")
  if (/(?:\b(?:pecho|pectoral(?:es)?|chest|bench(?: press)?|banca|incline press|decline press|pec[\s-]?deck|mariposas?|contractor(?:a)?|aperturas?|fly|flies|flyes|cruces?|flexiones|lagartijas|push[\s-]?ups?|dips?|fondos?|svend|guillotina)\b|\bpush\b|press (?:de |en )?(?:banca|pecho)|press (?:inclinad[oa]|declinad[oa]|plan[oa]))/.test(value)) {
    return 'Pecho';
  }

  // 7. Piernas ("leg day", "legs", "piernas", "sentadillas", "squats", "deadlift", "hip thrust", "gemelos")
  if (/(?:\b(?:piernas?|legs?|leg[\s-]?day|lower(?: body)?|sentadillas?|squats?|prensas?|leg[\s-]?press|hack|deadlifts?|rdls?|rumano|sumo|femoral(?:es)?|isquios?|isquiotibiales?|hamstrings?|cuadriceps?|quads?|sillon|camilla|gemelos?|pantorrillas?|calves|calf|gluteos?|glutes?|hip[\s-]?thrusts?|zancadas?|estocadas?|lunges?|bulgaras?|split[\s-]?squats?|step[\s-]?ups?|aduccion(?:es)?|abduccion(?:es)?|aductores?|abductores?|good[\s-]?mornings?|nordic)\b|peso muerto|tren inferior|puente de gluteos?|extension(?:es)? de cuadriceps|elevacion(?:es)? de talones|leg curls?|leg extensions?|buenos dias)/.test(value)) {
    return 'Piernas';
  }

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
  const isWarmup = candidate.isWarmup === true || candidate.type === 'warmup';
  const set: GymSet = {
    id: stablePart(candidate.id, fallbackId),
    weight: numeric(candidate.weight),
    reps,
    completed,
    completedAt: typeof candidate.completedAt === 'string' ? candidate.completedAt : null,
    rpe: typeof candidate.rpe === 'number' && !Number.isNaN(candidate.rpe) ? candidate.rpe : undefined,
  };
  if (isWarmup) {
    set.type = 'warmup';
  }
  return set;
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

  const rawRestSeconds = Number.isFinite(Number(legacy.restSeconds)) && Number(legacy.restSeconds) > 0
    ? Math.min(600, Math.max(15, Math.round(Number(legacy.restSeconds))))
    : undefined;
  const restSecondsMode: GymExerciseRestMode = legacy.restSecondsMode === 'custom' || legacy.restSecondsMode === 'inherit' || legacy.restSecondsMode === 'disabled'
    ? legacy.restSecondsMode
    : rawRestSeconds !== undefined && rawRestSeconds !== 90
      ? 'custom'
      : 'inherit';

  const isExplicitlyDisabled = restSecondsMode === 'disabled' || rawRestSeconds === 0;
  const timerEnabled = isExplicitlyDisabled ? false : legacy.timerEnabled !== false;

  return {
    id: exerciseId,
    name: exerciseName,
    equipment,
    ...(isGymIconName(legacy.icon) ? { icon: legacy.icon } : {}),
    weight: numeric(legacy.weight) || (migratedSets[0]?.weight ?? 0),
    barWeight,
    sets: migratedSets,
    muscleGroup,
    ...(rawRestSeconds !== undefined ? { restSeconds: rawRestSeconds } : {}),
    restSecondsMode,
    timerEnabled,
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

  // Solo sanar sesiones activas si sufrieron el artefacto uniforme de timerEnabled: false.
  // Las sesiones completadas se conservan como registro histórico inmutable sin alterar historiales.
  if (status === 'active' && exercises.length > 0) {
    const allUniformlyFalse = exercises.every((ex) => ex.timerEnabled === false);
    const noneExplicitlyDisabled = exercises.every((ex) => ex.restSecondsMode !== 'disabled' && ex.restSeconds !== 0);
    if (allUniformlyFalse && noneExplicitlyDisabled) {
      for (const ex of exercises) {
        ex.timerEnabled = true;
      }
    }
  }

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

/**
 * AMBIGÜEDAD HISTÓRICA DE `timerEnabled: false`:
 * 
 * Contexto:
 * Antes del commit 8ac97c9, los ejercicios de las rutinas no persistían el campo `timerEnabled` (era `undefined`),
 * por lo que dependían exclusivamente de la preferencia global de la aplicación (`settings.autoTimerEnabled`).
 * Dicho commit introdujo la asignación estricta `timerEnabled: legacy.timerEnabled === true`, lo cual transformó
 * involuntariamente todos los ejercicios sin preferencia explícita en `timerEnabled: false` de manera persistente.
 * 
 * Distinción implementada para no sobrescribir preferencias intencionales:
 * 1. Intencional: El ejercicio tiene `restSecondsMode: 'disabled'`, o `restSeconds: 0`, o existe una configuración
 *    selectiva dentro de la misma rutina (por ejemplo, algunos ejercicios en `true` y otros en `false`).
 * 2. Artefacto heredado del bug: Todos los ejercicios de la plantilla tienen `timerEnabled: false`, ninguno
 *    está en modo `disabled` ni tiene `0s`, y poseen descansos válidos configurados (ej. 90s, 120s).
 * 
 * En el caso de artefacto uniforme, la rutina se auto-sana a `true`. Las desactivaciones explícitas o selectivas
 * se respetan sin excepción, y las sesiones históricas completadas permanecen inmutables.
 */
function migrateTemplate(value: unknown, index: number): RoutineTemplate {
  const legacy = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as LegacySession & {
    name?: unknown;
    days?: unknown;
    appearance?: unknown;
  };
  const id = stablePart(legacy.id, `template-${index}`);
  const rawAppearance = legacy.appearance && typeof legacy.appearance === 'object' && !Array.isArray(legacy.appearance)
    ? legacy.appearance as Record<string, unknown>
    : null;
  const rawIcon = typeof rawAppearance?.icon === 'string' ? rawAppearance.icon.trim() : undefined;
  const icon = isRoutineIconName(rawIcon) ? rawIcon : undefined;
  const rawExercises = Array.isArray(legacy.exercises)
    ? legacy.exercises.map((exercise, exerciseIndex) => migrateExercise(exercise, id, exerciseIndex))
    : [];

  // Recuperación segura de rutinas históricas: si todos los ejercicios de la plantilla tienen timerEnabled: false
  // como artefacto de la versión anterior y ninguno fue desactivado de forma explícita ('disabled' o 0s),
  // se recupera timerEnabled: true. Si el usuario configuró selecciones mixtas, se respetan estrictamente.
  const allUniformlyFalse = rawExercises.length > 0 && rawExercises.every((ex) => ex.timerEnabled === false);
  const noneExplicitlyDisabled = rawExercises.every((ex) => ex.restSecondsMode !== 'disabled' && ex.restSeconds !== 0);
  if (allUniformlyFalse && noneExplicitlyDisabled) {
    for (const ex of rawExercises) {
      ex.timerEnabled = true;
    }
  }

  const template: RoutineTemplate = {
    id,
    name: String(legacy.name || '').trim() || `Rutina ${index + 1}`,
    days: Array.isArray(legacy.days) ? legacy.days.filter((day): day is DayKey => DAYS.includes(day as DayKey)) : [],
    exercises: rawExercises,
  };
  if (icon) {
    template.appearance = { icon };
  }
  return template;
}

export function migrateGym(value: unknown): Gym {
  const gym = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sessions = Array.isArray(gym.sessions) ? gym.sessions.map(migrateSession) : [];
  sessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const timer = gym.activeTimer && typeof gym.activeTimer === 'object' && !Array.isArray(gym.activeTimer)
    ? gym.activeTimer as Record<string, unknown>
    : null;
  const syncMetadata = normalizeGymSyncMetadata(gym._sync);
  const rawSettings = gym.settings && typeof gym.settings === 'object' && !Array.isArray(gym.settings)
    ? gym.settings as Record<string, unknown>
    : null;
  const settings: Gym['settings'] = {
    restBetweenSetsSeconds: typeof rawSettings?.restBetweenSetsSeconds === 'number' && rawSettings.restBetweenSetsSeconds > 0
      ? Math.min(600, Math.max(15, Math.round(rawSettings.restBetweenSetsSeconds)))
      : 120,
    restBetweenExercisesSeconds: typeof rawSettings?.restBetweenExercisesSeconds === 'number' && rawSettings.restBetweenExercisesSeconds > 0
      ? Math.min(600, Math.max(15, Math.round(rawSettings.restBetweenExercisesSeconds)))
      : 180,
    autoTimerEnabled: rawSettings?.autoTimerEnabled !== undefined
      ? Boolean(rawSettings.autoTimerEnabled)
      : true,
    showQuickRestAdjustments: rawSettings?.showQuickRestAdjustments !== undefined
      ? Boolean(rawSettings.showQuickRestAdjustments)
      : true,
    allowManualRestEditing: rawSettings?.allowManualRestEditing !== undefined
      ? Boolean(rawSettings.allowManualRestEditing)
      : false,
  };
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
        kind: timer.kind === 'exercise' ? 'exercise' : 'set',
        exerciseIndex: typeof timer.exerciseIndex === 'number' ? timer.exerciseIndex : undefined,
        targetExerciseIndex: typeof timer.targetExerciseIndex === 'number' ? timer.targetExerciseIndex : undefined,
        minimized: timer.minimized === true,
        ...(typeof timer.pausedAt === 'number' && Number.isFinite(timer.pausedAt) && timer.pausedAt > 0 ? {
          pausedAt: timer.pausedAt,
          ...(typeof timer.remainingSecondsWhenPaused === 'number'
            && Number.isFinite(timer.remainingSecondsWhenPaused) && timer.remainingSecondsWhenPaused >= 0
            ? { remainingSecondsWhenPaused: timer.remainingSecondsWhenPaused } : {}),
        } : {}),
      }
      : null,
    settings,
    ...(syncMetadata ? { _sync: syncMetadata } : {}),
  };
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
