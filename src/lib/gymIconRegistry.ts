import type { ExerciseEquipment, RoutineIconName } from '../types';

export type GymIconFamily = 'routine' | 'equipment' | 'exercise' | 'context';

export type GymIconName =
  | 'gym-abs'
  | 'gym-adjustable-bench'
  | 'gym-barbell'
  | 'gym-bench-press'
  | 'gym-biceps'
  | 'gym-bike'
  | 'gym-cable-machine'
  | 'gym-calves'
  | 'gym-curls'
  | 'gym-deadlift'
  | 'gym-dumbbell'
  | 'gym-hamstrings'
  | 'gym-incline-bench-press'
  | 'gym-lat-pulldown'
  | 'gym-leg-press'
  | 'gym-pec-deck'
  | 'gym-plank'
  | 'gym-power-tower'
  | 'gym-pull-ups'
  | 'gym-pushups'
  | 'gym-rest'
  | 'gym-scale'
  | 'gym-seated-row'
  | 'gym-shoulder-press'
  | 'gym-squat-rack'
  | 'gym-stretching'
  | 'gym-timer'
  | 'gym-torso'
  | 'gym-treadmill'
  | 'gym-triceps'
  | 'gym-water'
  | 'gym-weightlifting'
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
  icon('gym-leg-press', 'Prensa de piernas', 'exercise', 'leg-press.svg', ['Prensa de piernas', 'Piernas', 'Cuádriceps']),
  icon('gym-shoulder-press', 'Press de hombros', 'exercise', 'shoulder-press.svg', ['Press de hombros sentado', 'Hombros']),
  icon('gym-pull-ups', 'Dominadas', 'exercise', 'pull-ups.svg', ['Dominadas', 'Calistenia']),
  icon('gym-power-tower', 'Fondos / paralelas', 'exercise', 'power-tower.svg', ['Fondos', 'Paralelas']),
  icon('gym-deadlift', 'Peso muerto', 'exercise', 'deadlift.svg', ['Peso muerto', 'Peso muerto rumano', 'Cadena posterior']),
  icon('gym-curls', 'Curl con mancuernas', 'exercise', 'curls.svg', ['Curl martillo', 'Curl concentrado', 'Curl con mancuernas']),
  icon('gym-biceps', 'Bíceps', 'exercise', 'biceps.svg', ['Curl predicador', 'Banco Scott', 'Bíceps']),
  icon('gym-triceps', 'Tríceps', 'exercise', 'triceps.svg', ['Press francés', 'Fondos de tríceps', 'Tríceps']),
  icon('gym-pushups', 'Flexiones', 'exercise', 'pushups.svg', ['Flexiones de brazos', 'Lagartijas', 'Push-ups']),
  icon('gym-plank', 'Plancha', 'exercise', 'plank.svg', ['Plancha abdominal', 'Plancha isométrica', 'Core']),
  icon('gym-abs', 'Abdominales', 'exercise', 'abs.svg', ['Crunch abdominal', 'Elevación de piernas', 'Abdomen']),
  icon('gym-stretching', 'Estiramiento', 'exercise', 'stretching.svg', ['Estiramiento', 'Elongación', 'Movilidad']),
  icon('gym-weightlifting', 'Halterofilia', 'exercise', 'weightlifting.svg', ['Arranque', 'Envión', 'Full body']),
  icon('gym-torso', 'Torso', 'routine', 'torso.svg', ['Torso', 'Tren superior', 'Press de pecho en máquina']),
  icon('gym-hamstrings', 'Isquiotibiales', 'exercise', 'hamstrings.svg', ['Curl femoral', 'Isquiotibiales']),
  icon('gym-calves', 'Gemelos', 'exercise', 'calves.svg', ['Elevación de talones', 'Gemelos', 'Pantorrillas']),
  icon('gym-dumbbell', 'Mancuerna', 'equipment', 'dumbbell.svg', ['Curls', 'Elevaciones', 'Presses con mancuernas', 'Brazos']),
  icon('gym-barbell', 'Barra', 'equipment', 'barbell.svg', ['Remo con barra', 'Curls con barra', 'Press militar']),
  icon('gym-cable-machine', 'Polea', 'equipment', 'cable-machine.svg', ['Tríceps en polea', 'Curls en polea', 'Cruces']),
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
  { name: 'gym-dumbbell', icon: 'gym-dumbbell', label: 'Mancuernas' },
  { name: 'gym-shoulder-press', icon: 'gym-shoulder-press', label: 'Hombros' },
  { name: 'gym-yoga-mat', icon: 'gym-yoga-mat', label: 'Colchoneta' },
  { name: 'gym-torso', icon: 'gym-torso', label: 'Torso' },
  { name: 'gym-biceps', icon: 'gym-biceps', label: 'Brazos' },
  { name: 'gym-abs', icon: 'gym-abs', label: 'Abdomen' },
  { name: 'gym-weightlifting', icon: 'gym-weightlifting', label: 'Full body' },
  { name: 'gym-bike', icon: 'gym-bike', label: 'Cardio' },
  { name: 'gym-rest', icon: 'gym-rest', label: 'Descanso' },
] as const;

export const GYM_EXERCISE_ICON_OPTIONS: ReadonlyArray<{
  id: GymIconName;
  label: string;
}> = [
  { id: 'gym-bench-press', label: 'Press banca' },
  { id: 'gym-incline-bench-press', label: 'Press inclinado' },
  { id: 'gym-pec-deck', label: 'Pec deck / Aperturas' },
  { id: 'gym-torso', label: 'Torso / Pecho' },
  { id: 'gym-lat-pulldown', label: 'Jalón / Espalda' },
  { id: 'gym-seated-row', label: 'Remo sentado' },
  { id: 'gym-pull-ups', label: 'Dominadas' },
  { id: 'gym-deadlift', label: 'Peso muerto' },
  { id: 'gym-leg-press', label: 'Prensa / Piernas' },
  { id: 'gym-squat-rack', label: 'Sentadilla / Rack' },
  { id: 'gym-hamstrings', label: 'Femorales / Isquios' },
  { id: 'gym-calves', label: 'Gemelos' },
  { id: 'gym-shoulder-press', label: 'Hombros' },
  { id: 'gym-biceps', label: 'Brazos / Bíceps' },
  { id: 'gym-curls', label: 'Curl con mancuernas' },
  { id: 'gym-triceps', label: 'Tríceps' },
  { id: 'gym-power-tower', label: 'Fondos / Paralelas' },
  { id: 'gym-pushups', label: 'Flexiones' },
  { id: 'gym-abs', label: 'Abdomen' },
  { id: 'gym-plank', label: 'Plancha / Core' },
  { id: 'gym-yoga-mat', label: 'Colchoneta' },
  { id: 'gym-dumbbell', label: 'Mancuernas' },
  { id: 'gym-barbell', label: 'Barra' },
  { id: 'gym-cable-machine', label: 'Polea' },
  { id: 'gym-weightlifting', label: 'Full body' },
  { id: 'gym-bike', label: 'Bicicleta / Cardio' },
  { id: 'gym-treadmill', label: 'Caminadora' },
  { id: 'gym-stretching', label: 'Estiramiento' },
] as const;

export function isGymIconName(value: unknown): value is GymIconName {
  return typeof value === 'string' && value !== 'gym-fallback' && Object.hasOwn(GYM_ICON_REGISTRY, value);
}

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

  if (
    /^(?:press (?:de |en )?banca inclinad[oa]|press inclinad[oa](?: (?:de |en )?banca)?|incline (?:barbell )?bench(?: press)?|incline press)(?: con barra)?$/.test(normalized)
    && (!equipment || equipment === 'barra')
  ) {
    return 'gym-incline-bench-press';
  }
  if (
    /^(?:press (?:de |en )?banca(?: plan[oa])?|banca(?: plan[oa])?|bench(?: press)?|flat bench(?: press)?|chest press con barra|pecho|chest|push(?: day)?)(?: con barra)?$/.test(normalized)
    && (!equipment || equipment === 'barra')
  ) {
    return 'gym-bench-press';
  }
  if (
    /^(?:remos?(?: sentado(?: en polea(?: baja)?)?| en polea(?: baja)?| gironda)?|seated (?:cable )?rows?|cable rows?|low rows?)(?: con agarre (?:neutro|estrecho|ancho)(?: y pausa)?)?$/.test(normalized)
    && (!equipment || equipment === 'polea')
  ) {
    return 'gym-seated-row';
  }
  if (
    /^(?:jalon(?:es)?(?: al pecho| dorsal)?(?: en polea(?: alta)?)?|polea alta|lat[\s-]?pulldowns?|pulldowns?|pull[\s-]?downs?|espalda|back|dorsal(?:es)?|pull(?: days?)?)(?: con agarre (?:neutro|estrecho|ancho|prono|supino))?$/.test(normalized)
    && (!equipment || equipment === 'polea' || equipment === 'maquina')
  ) {
    return 'gym-lat-pulldown';
  }
  if (
    /^(?:pec[ -]?deck|mariposas?(?: en maquina)?|contractor(?:a)?(?: de pecho)?|aperturas? en maquina|machine (?:chest )?fly|chest flies|pec fly)$/.test(normalized)
    && (!equipment || equipment === 'maquina')
  ) {
    return 'gym-pec-deck';
  }
  if (
    /^(?:chest press(?: en maquina)?|press de pecho(?: en maquina)?|machine chest press|torso|tren superior|upper(?: body)?)$/.test(normalized)
    && (!equipment || equipment === 'maquina')
  ) {
    return 'gym-torso';
  }
  if (
    /^(?:prensas?(?: de piernas?)?|leg[ -]?press|hack(?: squat)?|sentadilla hack|piernas?|legs?|leg[ -]?days?|cuadriceps|quads?)(?: inclinada| horizontal| 45)?$/.test(normalized)
    && (!equipment || equipment === 'maquina' || equipment === 'barra')
  ) {
    return 'gym-leg-press';
  }
  if (
    /^(?:extension(?:es)? de cuadriceps(?: en maquina)?|sillon de cuadriceps|leg extensions?)$/.test(normalized)
    && (!equipment || equipment === 'maquina' || equipment === 'mancuerna')
  ) {
    return 'gym-leg-press';
  }
  if (
    /^(?:curls? femoral(?:es)?(?: acostado| sentado| de pie)?|femorales?|isquios?|isquiotibiales?(?: en maquina)?|camilla femoral|sillon femoral|nordic curls?|curls? nordicos?|leg curls?|seated leg curls?|lying leg curls?|hamstrings?)$/.test(normalized)
    && (!equipment || equipment === 'maquina' || equipment === 'mancuerna' || equipment === 'corporal')
  ) {
    return 'gym-hamstrings';
  }
  if (
    /^(?:elevacion(?:es)? de talones?(?: de pie| sentado| en prensa| en maquina)?|gemelos?(?: de pie| sentado| en maquina| en prensa)?|pantorrillas?(?: de pie| sentado| en maquina)?|calf|calves|calf raises?|standing calf raises?|seated calf raises?)$/.test(normalized)
    && (!equipment || equipment === 'maquina' || equipment === 'mancuerna' || equipment === 'barra' || equipment === 'corporal')
  ) {
    return 'gym-calves';
  }
  if (
    /^(?:peso muerto(?: rumano| sumo| convencional| con barra| piernas rigidas)?|deadlifts?|romanian deadlifts?|rdls?|sumo deadlifts?|stiff[ -]?leg deadlifts?)$/.test(normalized)
    && (!equipment || equipment === 'barra' || equipment === 'mancuerna')
  ) {
    return 'gym-deadlift';
  }
  if (
    /^(?:clean and jerk|snatch|arranques?|envion(?:es)?|cargadas?(?: de potencia| y envion)?|power cleans?|hang cleans?|thrusters?|halterofilia|full[ -]?body|cuerpo completo)$/.test(normalized)
    && (!equipment || equipment === 'barra')
  ) {
    return 'gym-weightlifting';
  }
  if (
    /^(?:curls?|martillos?|curls? (?:martillos?|concentrados?|alternos?|inclinados?|spider|zottman)|hammers?|hammer curls?|concentration curls?|dumbbell curls?|bicep curls?|curls? (?:de biceps )?con mancuernas?)(?: sentado| de pie)?$/.test(normalized)
    && (!equipment || equipment === 'mancuerna')
  ) {
    return 'gym-curls';
  }
  if (
    /^(?:curls? (?:predicador|en banco scott|scott)|predicador|banco scott|preacher curls?|biceps?(?: en maquina)?|brazos?|arms?)$/.test(normalized)
    && (!equipment || equipment === 'barra' || equipment === 'maquina' || equipment === 'mancuerna')
  ) {
    return 'gym-biceps';
  }
  if (
    /^(?:press frances|rompecraneos|skull[ -]?crushers?|patadas? de triceps|kickbacks?(?: de triceps)?|extension(?:es)? de triceps (?:trasnuca|sobre cabeza|acostado)|overhead triceps?(?: extensions?)?|fondos? de triceps|triceps?)$/.test(normalized)
    && (!equipment || equipment === 'barra' || equipment === 'mancuerna' || equipment === 'corporal')
  ) {
    return 'gym-triceps';
  }
  if (/^press (?:militar|de hombros)(?: sentado)?(?: en maquina| con barra)?$/.test(normalized)) {
    if (equipment === 'barra' || (!equipment && /militar|con barra/.test(normalized))) return 'gym-barbell';
    if (equipment === 'maquina' || (!equipment && /en maquina/.test(normalized))) return 'gym-shoulder-press';
  }
  if (
    /^(?:hombros?|shoulders?|deltoides?|delts?|shoulder press|overhead press|ohp|arnold press|elevacion(?:es)? lateral(?:es)?|lateral raises?|vuelos?(?: laterales?)?)$/.test(normalized)
    && (!equipment || equipment === 'maquina' || equipment === 'mancuerna' || equipment === 'barra')
  ) {
    return 'gym-shoulder-press';
  }
  if (
    /^(?:dominadas?(?: pronas| supinas| neutras| con lastre)?|pull[ -]?ups?|chin[ -]?ups?|muscle[ -]?ups?)$/.test(normalized)
    && (!equipment || equipment === 'corporal')
  ) {
    return 'gym-pull-ups';
  }
  if (/^(?:fondos?(?: en paralelas)?|paralelas|dips?|chest dips?|tricep dips?)$/.test(normalized) && (!equipment || equipment === 'corporal')) {
    return 'gym-power-tower';
  }
  if (
    /^(?:flexiones?(?: de brazos| de pecho| diamante| inclinadas| declinadas)?|lagartijas?|push[ -]?ups?)$/.test(normalized)
    && (!equipment || equipment === 'corporal')
  ) {
    return 'gym-pushups';
  }
  if (/^(?:planchas?(?: abdominal(?:es)?| lateral(?:es)?| isometricas?)?|planks?|side planks?|core)$/.test(normalized) && (!equipment || equipment === 'corporal')) {
    return 'gym-plank';
  }
  if (
    /^(?:abdominales?(?: cortos| inferiores| oblicuos| en colchoneta)?|abdomen|abs|crunch(?:es)?(?: abdominal(?:es)?| inversos?| oblicuos?)?|elevacion(?:es)? de piernas?(?: colgado| en suelo)?|leg raises?|hanging leg raises?|rueda abdominal|ab[ -]?wheel|sit[ -]?ups?)$/.test(normalized)
    && (!equipment || equipment === 'corporal' || equipment === 'maquina')
  ) {
    return 'gym-abs';
  }
  if (
    /^(?:estiramientos?(?: generales| de tren superior| de tren inferior| dinamicos)?|elongacion(?:es)?|stretching|movilidad|mobility)$/.test(normalized)
    && (!equipment || equipment === 'corporal')
  ) {
    return 'gym-stretching';
  }
  if (/^(?:bicicletas?(?: estatica| fija| reclinada)?|bicis?|ciclismo|spinning|stationary bike|air[ -]?bike|cardio)$/.test(normalized) && (!equipment || equipment === 'maquina')) {
    return 'gym-bike';
  }
  if (/^(?:caminadoras?|cinta de correr|treadmills?|correr|running|trotes?|sprints?)$/.test(normalized) && (!equipment || equipment === 'maquina' || equipment === 'corporal')) {
    return 'gym-treadmill';
  }
  if (/^(?:sentadillas?(?: con barra| traseras?| frontales?| libres?)?|squats?|back squats?|front squats?|barbell squats?)$/.test(normalized) && (equipment === 'barra' || (!equipment && /(?:con barra|squats?|sentadillas)/.test(normalized)))) {
    return 'gym-squat-rack';
  }

  if (equipment === 'mancuerna') return 'gym-dumbbell';
  if (equipment === 'barra') return 'gym-barbell';
  if (equipment === 'polea') return 'gym-cable-machine';
  if (equipment === 'corporal') return 'gym-fallback';
  if (equipment === 'maquina') return 'gym-fallback';
  return 'gym-fallback';
}
