import type {
  DayKey,
  Exercise,
  ExerciseEquipment,
  GymSet,
  MuscleGroup,
  RoutineIconName,
  RoutineTemplate,
} from '../types';
import type { GymIconName } from './gymIconRegistry';
import { uid } from './storage';

export type GymStarterPackId = 'full-body-3' | 'torso-pierna-4' | 'split-clasico-5';

interface StarterExerciseSeed {
  name: string;
  equipment: ExerciseEquipment;
  muscleGroup: MuscleGroup;
  icon: GymIconName;
  warmupReps?: number;
  normalSetsCount: number;
  repsRange: string;
  targetReps: number;
  restSeconds: number;
}

interface StarterRoutineSeed {
  name: string;
  days: DayKey[];
  icon: RoutineIconName & GymIconName;
  exercises: readonly StarterExerciseSeed[];
}

export interface GymStarterPackMeta {
  id: GymStarterPackId;
  title: string;
  subtitle: string;
  daysPerWeek: number;
  routinesCount: number;
  totalExercises: number;
  icon: GymIconName;
}

interface StarterPackDefinition {
  id: GymStarterPackId;
  title: string;
  subtitle: string;
  daysPerWeek: number;
  icon: GymIconName;
  routines: readonly StarterRoutineSeed[];
}

const STARTER_PACK_DEFINITIONS: readonly StarterPackDefinition[] = [
  {
    id: 'full-body-3',
    title: 'Full Body · 3 días',
    subtitle: 'Principiante · Lun, Mié y Vie · 45–55 min · RIR 3–4',
    daysPerWeek: 3,
    icon: 'gym-weightlifting',
    routines: [
      {
        name: 'Full Body A',
        days: ['lunes', 'viernes'],
        icon: 'gym-weightlifting',
        exercises: [
          { name: 'Prensa de piernas', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-press', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Press de pecho en máquina', equipment: 'maquina', muscleGroup: 'Pecho', icon: 'gym-torso', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Jalón al pecho', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-lat-pulldown', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Curl femoral sentado', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-seated-leg-curl', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 75 },
          { name: 'Elevaciones laterales', equipment: 'mancuerna', muscleGroup: 'Hombros', icon: 'gym-dumbbell', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
          { name: 'Extensión de tríceps en polea', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-tricep-pushdown', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
        ],
      },
      {
        name: 'Full Body B',
        days: ['miercoles'],
        icon: 'gym-weightlifting',
        exercises: [
          { name: 'Sentadilla goblet', equipment: 'mancuerna', muscleGroup: 'Piernas', icon: 'gym-dumbbell', warmupReps: 10, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Remo sentado en polea', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-seated-row', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Press inclinado en máquina', equipment: 'maquina', muscleGroup: 'Pecho', icon: 'gym-incline-bench-press', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Peso muerto rumano con mancuernas', equipment: 'mancuerna', muscleGroup: 'Piernas', icon: 'gym-deadlift', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Curl de bíceps con mancuernas', equipment: 'mancuerna', muscleGroup: 'Brazos', icon: 'gym-curls', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
          { name: 'Crunch en polea', equipment: 'polea', muscleGroup: 'Core', icon: 'gym-abs', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'torso-pierna-4',
    title: 'Torso / Pierna · 4 días',
    subtitle: 'Principiante+ · Lun, Mar, Jue y Vie · 45–55 min · RIR 3–4',
    daysPerWeek: 4,
    icon: 'gym-leg-press',
    routines: [
      {
        name: 'Torso A',
        days: ['lunes'],
        icon: 'gym-torso',
        exercises: [
          { name: 'Press de pecho en máquina', equipment: 'maquina', muscleGroup: 'Pecho', icon: 'gym-torso', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Jalón al pecho', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-lat-pulldown', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Remo sentado en polea', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-seated-row', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Elevaciones laterales', equipment: 'mancuerna', muscleGroup: 'Hombros', icon: 'gym-dumbbell', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
          { name: 'Curl de bíceps con mancuernas', equipment: 'mancuerna', muscleGroup: 'Brazos', icon: 'gym-curls', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
          { name: 'Extensión de tríceps en polea', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-tricep-pushdown', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
        ],
      },
      {
        name: 'Piernas A',
        days: ['martes'],
        icon: 'gym-leg-press',
        exercises: [
          { name: 'Prensa de piernas', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-press', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Curl femoral sentado', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-seated-leg-curl', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Extensión de cuádriceps', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-extension', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 75 },
          { name: 'Elevación de gemelos en máquina', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-calves', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
          { name: 'Crunch en polea', equipment: 'polea', muscleGroup: 'Core', icon: 'gym-abs', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
        ],
      },
      {
        name: 'Torso B',
        days: ['jueves'],
        icon: 'gym-torso',
        exercises: [
          { name: 'Press inclinado en máquina', equipment: 'maquina', muscleGroup: 'Pecho', icon: 'gym-incline-bench-press', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Remo con mancuerna', equipment: 'mancuerna', muscleGroup: 'Espalda', icon: 'gym-dumbbell', warmupReps: 12, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Jalón al pecho con agarre neutro', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-lat-pulldown', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Press de hombros en máquina', equipment: 'maquina', muscleGroup: 'Hombros', icon: 'gym-shoulder-press', warmupReps: 10, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 90 },
          { name: 'Curl martillo con mancuernas', equipment: 'mancuerna', muscleGroup: 'Brazos', icon: 'gym-curls', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
          { name: 'Extensión de tríceps con cuerda', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-tricep-pushdown', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 60 },
        ],
      },
      {
        name: 'Piernas B',
        days: ['viernes'],
        icon: 'gym-hamstrings',
        exercises: [
          { name: 'Sentadilla goblet', equipment: 'mancuerna', muscleGroup: 'Piernas', icon: 'gym-dumbbell', warmupReps: 10, normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Peso muerto rumano con mancuernas', equipment: 'mancuerna', muscleGroup: 'Piernas', icon: 'gym-deadlift', normalSetsCount: 3, repsRange: '10-12', targetReps: 12, restSeconds: 120 },
          { name: 'Curl femoral sentado', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-seated-leg-curl', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 75 },
          { name: 'Abducción de cadera en máquina', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-press', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
          { name: 'Elevación de gemelos en máquina', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-calves', normalSetsCount: 3, repsRange: '12-15', targetReps: 15, restSeconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'split-clasico-5',
    title: 'Split 5 días',
    subtitle: 'Intermedio · Lun a Vie · Espalda/Bíceps · Pecho/Tríceps · Piernas',
    daysPerWeek: 5,
    icon: 'gym-bench-press',
    routines: [
      {
        name: 'Espalda / Bíceps',
        days: ['lunes', 'jueves'],
        icon: 'gym-lat-pulldown',
        exercises: [
          { name: 'Jalón al pecho', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-lat-pulldown', warmupReps: 12, normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Remo en polea baja', equipment: 'polea', muscleGroup: 'Espalda', icon: 'gym-seated-row', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Remo en polea para deltoides', equipment: 'polea', muscleGroup: 'Hombros', icon: 'gym-cable-machine', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Curl de bíceps en polea', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-cable-machine', normalSetsCount: 3, repsRange: '8', targetReps: 8, restSeconds: 180 },
          { name: 'Curl martillo con mancuernas', equipment: 'mancuerna', muscleGroup: 'Brazos', icon: 'gym-curls', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Elevaciones laterales con mancuernas', equipment: 'mancuerna', muscleGroup: 'Hombros', icon: 'gym-dumbbell', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
        ],
      },
      {
        name: 'Pecho / Tríceps',
        days: ['martes', 'viernes'],
        icon: 'gym-bench-press',
        exercises: [
          { name: 'Press banca', equipment: 'barra', muscleGroup: 'Pecho', icon: 'gym-bench-press', warmupReps: 12, normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Press banca inclinado', equipment: 'barra', muscleGroup: 'Pecho', icon: 'gym-incline-bench-press', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Pec deck', equipment: 'maquina', muscleGroup: 'Pecho', icon: 'gym-pec-deck', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Press militar', equipment: 'barra', muscleGroup: 'Hombros', icon: 'gym-barbell', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Extensión de tríceps', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-tricep-pushdown', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Tríceps trasnuca', equipment: 'polea', muscleGroup: 'Brazos', icon: 'gym-triceps', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
        ],
      },
      {
        name: 'Piernas',
        days: ['miercoles'],
        icon: 'gym-leg-press',
        exercises: [
          { name: 'Aducción', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-press', normalSetsCount: 3, repsRange: '12', targetReps: 12, restSeconds: 180 },
          { name: 'Abducción', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-press', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Curl femoral acostado', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-hamstrings', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
          { name: 'Hack squat', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-hack-squat', warmupReps: 10, normalSetsCount: 3, repsRange: '9', targetReps: 9, restSeconds: 180 },
          { name: 'Elevación de gemelos', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-calves', normalSetsCount: 3, repsRange: '12', targetReps: 12, restSeconds: 180 },
          { name: 'Extensión de cuádriceps', equipment: 'maquina', muscleGroup: 'Piernas', icon: 'gym-leg-extension', normalSetsCount: 3, repsRange: '10', targetReps: 10, restSeconds: 180 },
        ],
      },
    ],
  },
];

export const GYM_STARTER_PACKS: readonly GymStarterPackMeta[] = STARTER_PACK_DEFINITIONS.map((pack) => ({
  id: pack.id,
  title: pack.title,
  subtitle: pack.subtitle,
  daysPerWeek: pack.daysPerWeek,
  routinesCount: pack.routines.length,
  totalExercises: pack.routines.reduce((sum, r) => sum + r.exercises.length, 0),
  icon: pack.icon,
}));

function buildStarterSets(seed: StarterExerciseSeed): GymSet[] {
  const sets: GymSet[] = [];
  if (typeof seed.warmupReps === 'number' && seed.warmupReps > 0) {
    sets.push({
      id: uid(),
      weight: 0,
      reps: seed.warmupReps,
      completed: false,
      type: 'warmup',
    });
  }
  for (let i = 0; i < seed.normalSetsCount; i += 1) {
    sets.push({
      id: uid(),
      weight: 0,
      reps: seed.targetReps,
      completed: false,
      type: 'normal',
    });
  }
  return sets;
}

function buildStarterExercise(seed: StarterExerciseSeed): Exercise {
  return {
    id: uid(),
    name: seed.name,
    equipment: seed.equipment,
    muscleGroup: seed.muscleGroup,
    icon: seed.icon,
    reps: seed.repsRange,
    barWeight: seed.equipment === 'barra' ? 20 : 0,
    restSeconds: seed.restSeconds,
    restSecondsMode: 'custom',
    timerEnabled: true,
    sets: buildStarterSets(seed),
  };
}

/**
 * Pure factory that instantiates a fresh set of RoutineTemplate objects with unique IDs.
 */
export function buildGymStarterTemplates(packId: GymStarterPackId): RoutineTemplate[] {
  const pack = STARTER_PACK_DEFINITIONS.find((item) => item.id === packId);
  if (!pack) return [];

  return pack.routines.map((routine) => ({
    id: uid(),
    name: routine.name,
    days: [...routine.days],
    appearance: { icon: routine.icon },
    exercises: routine.exercises.map(buildStarterExercise),
  }));
}
