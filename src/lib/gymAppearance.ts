import { isRoutineIconName, type Exercise, type RoutineAppearance, type RoutineIconName } from '../types';
import {
  GYM_ROUTINE_ICON_OPTIONS,
  resolveRoutineIconAsset,
  type GymIconName,
} from './gymIconRegistry';
import { inferMuscleGroup } from './gymMigration';

export { isRoutineIconName };

export interface RoutineIdentity {
  label: string;
  icon: GymIconName;
  surface: string;
  accent: string;
  isCustomIcon: boolean;
  persistedIcon?: RoutineIconName;
}

export const ROUTINE_ICON_OPTIONS = GYM_ROUTINE_ICON_OPTIONS;

const LEGACY_ROUTINE_ICON_LABELS: Record<string, string> = {
  dumbbell: 'Mancuerna (anterior)',
  zap: 'Fuerza (anterior)',
  flame: 'Intensidad (anterior)',
  activity: 'Cardio (anterior)',
  repeat: 'Circuito (anterior)',
  sparkles: 'Movilidad (anterior)',
  target: 'Foco (anterior)',
  shield: 'Core (anterior)',
  trophy: 'Rendimiento (anterior)',
  scale: 'Carga (anterior)',
};

export const ROUTINE_ICON_LABELS: Record<string, string> = {
  ...LEGACY_ROUTINE_ICON_LABELS,
  ...Object.fromEntries(ROUTINE_ICON_OPTIONS.map((option) => [option.name, option.label])),
};

function identity(
  label: string,
  icon: GymIconName
): Omit<RoutineIdentity, 'isCustomIcon'> {
  return {
    label,
    icon,
    surface: 'from-indigo-500/16 via-violet-500/7 to-transparent',
    accent: 'text-indigo-600 dark:text-indigo-300',
  };
}

export function inferAutomaticRoutineIdentity(
  exercises: Exercise[] = [],
  routineName = ''
): Omit<RoutineIdentity, 'isCustomIcon'> {
  const groups = exercises.reduce<Record<string, number>>((result, exercise) => {
    const group = exercise.muscleGroup || inferMuscleGroup(exercise.name);
    result[group] = (result[group] || 0) + 1;
    return result;
  }, {});
  const nameIdentity = /descanso|recuperacion/i.test(routineName)
    ? 'Descanso'
    : /cardio|correr|bicicleta/i.test(routineName)
      ? 'Cardio'
      : /pecho/i.test(routineName)
        ? 'Pecho'
        : /espalda|dorsal/i.test(routineName)
          ? 'Espalda'
          : /pierna|cuádriceps|isquio|glúteo|pantorrilla/i.test(routineName)
            ? 'Piernas'
            : /hombro|deltoide/i.test(routineName)
              ? 'Hombros'
              : /brazo|bíceps|tríceps/i.test(routineName)
                ? 'Brazos'
                : /core|abdomen/i.test(routineName)
                  ? 'Core'
                  : null;
  const dominant = nameIdentity || Object.entries(groups).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Entrenamiento';
  const normalized = dominant
    .toLocaleLowerCase('es-UY')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/descanso|recuperacion/.test(normalized)) return identity('Descanso', 'gym-rest');
  if (/cardio/.test(normalized)) return identity('Cardio', 'gym-bike');
  if (/pierna|cuádriceps|isquio|glúteo|pantorrilla/.test(normalized)) return identity(dominant, 'gym-leg-press');
  if (/espalda|dorsal/.test(normalized)) return identity(dominant, 'gym-lat-pulldown');
  if (/pecho/.test(normalized)) return identity(dominant, 'gym-bench-press');
  if (/hombro|deltoide/.test(normalized)) return identity(dominant, 'gym-shoulder-press');
  if (/brazo|bíceps|tríceps/.test(normalized)) return identity(dominant, 'gym-dumbbell');
  if (/core|abdomen/.test(normalized)) return identity(dominant, 'gym-yoga-mat');
  return identity(dominant, 'gym-dumbbell');
}

export function getRoutineIdentity(
  exercises: Exercise[] = [],
  routineName = '',
  appearance?: RoutineAppearance | null
): RoutineIdentity {
  const automatic = inferAutomaticRoutineIdentity(exercises, routineName);
  const iconOverride = appearance?.icon;
  if (iconOverride && isRoutineIconName(iconOverride)) {
    return {
      ...automatic,
      icon: resolveRoutineIconAsset(iconOverride),
      isCustomIcon: true,
      persistedIcon: iconOverride,
    };
  }
  return {
    ...automatic,
    isCustomIcon: false,
  };
}

export function resolveRoutineIcon(
  routine: { exercises?: Exercise[]; name?: string; appearance?: RoutineAppearance | null }
): GymIconName {
  return getRoutineIdentity(routine.exercises || [], routine.name || '', routine.appearance).icon;
}

function normalizeStem(text: string): string {
  const norm = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return norm.endsWith('s') ? norm.slice(0, -1) : norm;
}

export function shouldShowRoutineCategory(routineName: string, categoryLabel: string): boolean {
  if (!categoryLabel || !routineName) return false;
  if (categoryLabel.toLowerCase() === 'entrenamiento') return false;
  const normCategory = normalizeStem(categoryLabel);
  if (!normCategory) return false;
  const normName = normalizeStem(routineName);
  if (normName === normCategory) return false;

  const tokens = routineName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .map((token) => (token.endsWith('s') ? token.slice(0, -1) : token))
    .filter(Boolean);

  if (tokens.includes(normCategory)) return false;
  return true;
}
