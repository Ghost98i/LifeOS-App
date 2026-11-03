import type { ExerciseEquipment, RoutineIconName } from '../types';

export type GymIconFamily = 'routine' | 'equipment' | 'exercise' | 'context';

export type GymIconName =
  | 'gym-adjustable-bench'
  | 'gym-barbell'
  | 'gym-bench-press'
  | 'gym-bike'
  | 'gym-cable-machine'
  | 'gym-dumbbell'
  | 'gym-incline-bench-press'
  | 'gym-lat-pulldown'
  | 'gym-leg-press'
  | 'gym-pec-deck'
  | 'gym-power-tower'
  | 'gym-pull-ups'
  | 'gym-rest'
  | 'gym-scale'
  | 'gym-seated-row'
  | 'gym-shoulder-press'
  | 'gym-squat-rack'
  | 'gym-timer'
  | 'gym-treadmill'
  | 'gym-water'
  | 'gym-workout-calendar'
  | 'gym-yoga-mat'
  | 'gym-fallback';

export interface GymIconDefinition {
  id: GymIconName;
  label: string;
  family: GymIconFamily;
  src: string | null;
  suggestedUses: readonly string[];
  licenseStatus: 'pending' | 'pending-attribution';
}

const GYM_ICON_BASE = `${import.meta.env?.BASE_URL || '/'}gym-icons/v1/`;

const icon = (
  id: GymIconName,
  label: string,
  family: GymIconFamily,
  fileName: string | null,
  suggestedUses: readonly string[],
  licenseStatus: GymIconDefinition['licenseStatus'] = 'pending'
): GymIconDefinition => ({
  id,
  label,
  family,
  src: fileName ? `${GYM_ICON_BASE}${fileName}` : null,
  suggestedUses,
  licenseStatus,
});

export const GYM_ICON_DEFINITIONS: readonly GymIconDefinition[] = [
  icon('gym-bench-press', 'Press banca', 'exercise', 'bench-press.svg', ['Press banca con barra', 'Pecho']),
  icon('gym-incline-bench-press', 'Press inclinado', 'exercise', 'incline-bench-press.svg', ['Press inclinado con barra']),
  icon('gym-lat-pulldown', 'Jalón al pecho', 'exercise', 'lat-pulldown.svg', ['Jalón al pecho', 'Polea alta', 'Espalda']),
  icon('gym-seated-row', 'Remo sentado', 'exercise', 'seated-row.svg', ['Remo en polea baja']),
  icon('gym-pec-deck', 'Pec deck', 'exercise', 'pec-deck.svg', ['Pec deck', 'Mariposa en máquina']),
  icon('gym-leg-press', 'Prensa de piernas', 'exercise', 'leg-press.svg', ['Prensa de piernas', 'Piernas']),
  icon('gym-shoulder-press', 'Press de hombros', 'exercise', 'shoulder-press.svg', ['Press de hombros sentado', 'Hombros']),
  icon('gym-pull-ups', 'Dominadas', 'exercise', 'pull-ups.svg', ['Dominadas']),
  icon('gym-power-tower', 'Fondos / paralelas', 'exercise', 'power-tower.svg', ['Fondos', 'Paralelas']),
  icon('gym-dumbbell', 'Mancuerna', 'equipment', 'dumbbell.svg', ['Curls', 'Elevaciones', 'Presses con mancuernas', 'Brazos']),
  icon('gym-barbell', 'Barra', 'equipment', 'barbell.svg', ['Peso muerto', 'Remo con barra', 'Curls con barra']),
  icon('gym-cable-machine', 'Polea', 'equipment', 'cable-machine.svg', ['Tríceps', 'Curls en polea', 'Cruces']),
  icon('gym-squat-rack', 'Rack', 'equipment', 'squat-rack.svg', ['Sentadilla', 'Rack', 'Movimientos con barra']),
  icon('gym-adjustable-bench', 'Banco ajustable', 'equipment', 'adjustable-bench.svg', ['Ejercicios con banco'], 'pending-attribution'),
  icon('gym-bike', 'Bicicleta', 'equipment', 'bike.svg', ['Bicicleta', 'Cardio']),
  icon('gym-treadmill', 'Caminadora', 'equipment', 'treadmill.svg', ['Caminata', 'Carrera', 'Cardio']),
  icon('gym-yoga-mat', 'Colchoneta', 'equipment', 'yoga-mat.svg', ['Core', 'Movilidad', 'Trabajo de suelo']),
  icon('gym-timer', 'Temporizador', 'context', 'timer.svg', ['Descansos', 'Intervalos']),
  icon('gym-water', 'Agua', 'context', 'water.svg', ['Hidratación']),
  icon('gym-rest', 'Descanso', 'context', 'rest.svg', ['Día de descanso', 'Recuperación']),
  icon('gym-scale', 'Balanza', 'context', 'scale.svg', ['Peso corporal', 'Progresión']),
  icon('gym-workout-calendar', 'Agenda de entrenamiento', 'context', 'workout-calendar.svg', ['Planificación', 'Rutinas']),
  icon('gym-fallback', 'Ejercicio', 'context', null, ['Ejercicio sin correspondencia fiable']),
] as const;

export const GYM_ICON_REGISTRY = Object.fromEntries(
  GYM_ICON_DEFINITIONS.map((definition) => [definition.id, definition])
) as Record<GymIconName, GymIconDefinition>;

export const GYM_ROUTINE_ICON_OPTIONS: ReadonlyArray<{
  name: RoutineIconName;
  icon: GymIconName;
  label: string;
}> = [
  { name: 'gym-bench-press', icon: 'gym-bench-press', label: 'Pecho' },
  { name: 'gym-lat-pulldown', icon: 'gym-lat-pulldown', label: 'Espalda' },
  { name: 'gym-leg-press', icon: 'gym-leg-press', label: 'Piernas' },
  { name: 'gym-dumbbell', icon: 'gym-dumbbell', label: 'Brazos' },
  { name: 'gym-shoulder-press', icon: 'gym-shoulder-press', label: 'Hombros' },
  { name: 'gym-yoga-mat', icon: 'gym-yoga-mat', label: 'Core' },
  { name: 'gym-bike', icon: 'gym-bike', label: 'Cardio' },
  { name: 'gym-rest', icon: 'gym-rest', label: 'Descanso' },
] as const;

export const LEGACY_ROUTINE_ICON_MAP: Readonly<Record<string, GymIconName>> = {
  dumbbell: 'gym-dumbbell',
  zap: 'gym-squat-rack',
  flame: 'gym-bike',
  activity: 'gym-bike',
  repeat: 'gym-cable-machine',
  sparkles: 'gym-yoga-mat',
  target: 'gym-bench-press',
  shield: 'gym-yoga-mat',
  trophy: 'gym-squat-rack',
  scale: 'gym-barbell',
};

export function resolveRoutineIconAsset(iconName: RoutineIconName): GymIconName {
  if (Object.hasOwn(GYM_ICON_REGISTRY, iconName)) return iconName as GymIconName;
  return Object.hasOwn(LEGACY_ROUTINE_ICON_MAP, iconName) ? LEGACY_ROUTINE_ICON_MAP[iconName] : 'gym-fallback';
}

function normalizedName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('es-UY')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Deliberately small resolver: exact equipment/movement matches first, structured
 * equipment next, and a neutral fallback when neither is trustworthy.
 */
export function resolveExerciseGymIcon(
  name: string,
  equipment?: ExerciseEquipment
): GymIconName {
  const normalized = normalizedName(name);

  if (equipment === 'mancuerna') return 'gym-dumbbell';

  if (/^(?:press (?:de |en )?banca inclinad[oa]|press inclinado(?: (?:de |en )?banca)?)(?: con barra)?$/.test(normalized) && (!equipment || equipment === 'barra')) {
    return 'gym-incline-bench-press';
  }
  if (/^(?:press (?:de |en )?banca(?: plan[oa])?|banca plan[oa])(?: con barra)?$/.test(normalized) && (!equipment || equipment === 'barra')) {
    return 'gym-bench-press';
  }
  if (/^remo (?:sentado(?: en polea(?: baja)?)?|en polea baja)(?: con agarre (?:neutro|estrecho|ancho)(?: y pausa)?)?$/.test(normalized) && (!equipment || equipment === 'polea')) {
    return 'gym-seated-row';
  }
  if (/^jalon al pecho(?: en polea(?: alta)?)?(?: con agarre (?:neutro|estrecho|ancho))?$/.test(normalized) && (!equipment || equipment === 'polea')) {
    return 'gym-lat-pulldown';
  }
  if (/^(?:pec[ -]?deck|mariposa(?: en maquina)?|contractor de pecho)$/.test(normalized) && (!equipment || equipment === 'maquina')) {
    return 'gym-pec-deck';
  }
  if (/^(?:prensa de piernas|leg[ -]?press)(?: inclinada| horizontal)?$/.test(normalized) && (!equipment || equipment === 'maquina')) {
    return 'gym-leg-press';
  }
  if (/^press (?:militar|de hombros)(?: sentado)?(?: en maquina| con barra)?$/.test(normalized)) {
    if (equipment === 'barra' || (!equipment && /militar|con barra/.test(normalized))) return 'gym-barbell';
    if (equipment === 'maquina' || (!equipment && /en maquina/.test(normalized))) return 'gym-shoulder-press';
  }
  if (/^(?:dominadas?|pull[ -]?ups?)$/.test(normalized) && (!equipment || equipment === 'corporal')) {
    return 'gym-pull-ups';
  }
  if (/^fondos(?: en paralelas)?$/.test(normalized) && (!equipment || equipment === 'corporal')) {
    return 'gym-power-tower';
  }
  if (/^(?:bicicleta(?: estatica| fija| reclinada)?|ciclismo)$/.test(normalized) && (!equipment || equipment === 'maquina')) {
    return 'gym-bike';
  }
  if (/^(?:caminadora|cinta de correr|treadmill)$/.test(normalized) && (!equipment || equipment === 'maquina')) {
    return 'gym-treadmill';
  }
  if (/^sentadilla(?: con barra| trasera| frontal)?$/.test(normalized) && equipment === 'barra') {
    return 'gym-squat-rack';
  }

  if (equipment === 'barra') return 'gym-barbell';
  if (equipment === 'polea') return 'gym-cable-machine';
  if (equipment === 'corporal') return 'gym-fallback';
  if (equipment === 'maquina') return 'gym-fallback';
  return 'gym-fallback';
}

