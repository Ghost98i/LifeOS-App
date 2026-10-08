import type { AppIconName } from '../components/AppIcon';
import { isRoutineIconName, type Exercise, type RoutineAppearance, type RoutineIconName } from '../types';
import { inferMuscleGroup } from './gymMigration';

export { isRoutineIconName };

export interface RoutineIdentity {
  label: string;
  icon: AppIconName;
  surface: string;
  accent: string;
  isCustomIcon: boolean;
}

export const ROUTINE_ICON_OPTIONS: Array<{ name: RoutineIconName; label: string }> = [
  { name: 'dumbbell', label: 'Mancuerna' },
  { name: 'zap', label: 'Fuerza' },
  { name: 'flame', label: 'Intensidad' },
  { name: 'activity', label: 'Cardio' },
  { name: 'repeat', label: 'Circuito' },
  { name: 'sparkles', label: 'Movilidad' },
  { name: 'target', label: 'Foco' },
  { name: 'shield', label: 'Core' },
  { name: 'trophy', label: 'Rendimiento' },
  { name: 'scale', label: 'Carga' },
];

export const ROUTINE_ICON_LABELS: Record<string, string> = Object.fromEntries(
  ROUTINE_ICON_OPTIONS.map((opt) => [opt.name, opt.label])
);

export function inferAutomaticRoutineIdentity(
  exercises: Exercise[] = [],
  routineName = ''
): Omit<RoutineIdentity, 'isCustomIcon'> {
  const groups = exercises.reduce<Record<string, number>>((result, exercise) => {
    const group = exercise.muscleGroup || inferMuscleGroup(exercise.name);
    result[group] = (result[group] || 0) + 1;
    return result;
  }, {});
  const nameIdentity = /pecho/i.test(routineName)
    ? 'Pecho'
    : /espalda|dorsal/i.test(routineName)
      ? 'Espalda'
      : /pierna|cuádriceps|isquio|glúteo|pantorrilla/i.test(routineName)
        ? 'Piernas'
        : /core|abdomen/i.test(routineName)
          ? 'Core'
          : null;
  const dominant = nameIdentity || Object.entries(groups).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Entrenamiento';
  const normalized = dominant.toLocaleLowerCase('es-UY');

  if (/pierna|cuádriceps|isquio|glúteo|pantorrilla/.test(normalized)) {
    return {
      label: dominant,
      icon: 'activity',
      surface: 'from-indigo-500/20 via-blue-500/10 to-transparent',
      accent: 'text-indigo-600 dark:text-indigo-300',
    };
  }
  if (/espalda|dorsal/.test(normalized)) {
    return {
      label: dominant,
      icon: 'repeat',
      surface: 'from-sky-500/20 via-blue-500/10 to-transparent',
      accent: 'text-sky-700 dark:text-sky-300',
    };
  }
  if (/pecho/.test(normalized)) {
    return {
      label: dominant,
      icon: 'target',
      surface: 'from-blue-500/22 via-indigo-500/10 to-transparent',
      accent: 'text-blue-700 dark:text-blue-300',
    };
  }
  if (/core|abdomen/.test(normalized)) {
    return {
      label: dominant,
      icon: 'shield',
      surface: 'from-slate-500/20 via-blue-500/8 to-transparent',
      accent: 'text-slate-700 dark:text-slate-300',
    };
  }
  return {
    label: dominant,
    icon: 'dumbbell',
    surface: 'from-violet-500/18 via-blue-500/8 to-transparent',
    accent: 'text-violet-700 dark:text-violet-300',
  };
}

export function getRoutineIdentity(
  exercises: Exercise[] = [],
  routineName = '',
  appearance?: RoutineAppearance | null
): RoutineIdentity {
  const autoIdentity = inferAutomaticRoutineIdentity(exercises, routineName);
  const iconOverride = appearance?.icon;
  if (iconOverride && isRoutineIconName(iconOverride)) {
    return {
      ...autoIdentity,
      icon: iconOverride,
      isCustomIcon: true,
    };
  }
  return {
    ...autoIdentity,
    isCustomIcon: false,
  };
}

export function resolveRoutineIcon(
  routine: { exercises?: Exercise[]; name?: string; appearance?: RoutineAppearance | null }
): AppIconName {
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
    .map((t) => (t.endsWith('s') ? t.slice(0, -1) : t))
    .filter(Boolean);

  if (tokens.includes(normCategory)) return false;

  return true;
}
