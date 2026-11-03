import type { Exercise, ExerciseEquipment, GymSession, GymSet, GymSetType, MuscleGroup } from '../types';
import { inferMuscleGroup, inferExerciseEquipment } from './gymMigration';

/**
 * Normaliza nombres de ejercicios eliminando tildes, convirtiendo a minúsculas
 * y colapsando espacios múltiples para comparaciones estables.
 */
export function normalizeExerciseName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parsea repeticiones de formatos heredados tipo "3x10", "3x8", "12", etc.
 * Extrayendo el número real de repeticiones por serie (p.ej. 8 en "3x8").
 */
export function parseLegacyRepCount(repsVal: unknown): number {
  const str = String(repsVal || '').trim();
  const matchMult = str.match(/\d+\s*[x×]\s*(\d+)/i);
  if (matchMult) return Number(matchMult[1]) || 10;
  const matchSimple = str.match(/\d+/);
  return matchSimple ? Number(matchSimple[0]) : 10;
}

/**
 * Calcula el 1RM estimado utilizando la fórmula de Epley:
 * e1RM = peso * (1 + reps / 30)
 *
 * Restricciones estrictas según directiva:
 * - reps >= 1
 * - reps <= 12 (por encima de 12 reps no se calcula para evitar distorsiones anaeróbicas/resistencia)
 * - peso > 0 y finito
 * - Si reps === 1, retorna el peso directo
 */
export function calculate1RM(weight: number, reps: number): number {
  const w = Number(weight);
  const r = Number(reps);

  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) {
    return 0;
  }

  if (r === 1) {
    return Math.round(w * 10) / 10;
  }

  // Clamped at 12 reps: beyond 12 reps, 1RM is physiologically unreliable
  if (r > 12) {
    return 0;
  }

  const e1rm = w * (1 + r / 30);
  return Math.round(e1rm * 10) / 10;
}

export interface ExerciseMetricTarget {
  exerciseId?: string;
  exerciseName: string;
}

export interface PerformedSetMetric {
  setId: string;
  weight: number;
  reps: number;
  e1RM: number;
}

export interface ExerciseExecutionMetric {
  sessionId: string;
  date: string;
  exerciseId?: string;
  exerciseName: string;
  sets: GymSet[];
  bestSet: PerformedSetMetric | null;
  volume: number;
}

export type ExerciseProgressState = 'improved' | 'stable' | 'insufficient_data';

export interface GymPeriodMetrics {
  startDate: string;
  endDate: string;
  workoutCount: number;
  volume: number;
}

export interface GymFrequencyMetrics {
  last7Days: GymPeriodMetrics;
  previous7Days: GymPeriodMetrics;
  last30Days: GymPeriodMetrics;
  previous30Days: GymPeriodMetrics;
}

export interface ExerciseProgressMetrics {
  key: string;
  exerciseId?: string;
  exerciseName: string;
  lastExecution: ExerciseExecutionMetric | null;
  bestSet: (PerformedSetMetric & { sessionId: string; date: string }) | null;
  recentVolume: number;
  previousVolume: number;
  recentSessionCount: number;
  previousSessionCount: number;
  state: ExerciseProgressState;
}

export interface GymProgressMetrics {
  frequency: GymFrequencyMetrics;
  exercises: ExerciseProgressMetrics[];
}

function metricTarget(target: string | ExerciseMetricTarget): ExerciseMetricTarget {
  return typeof target === 'string' ? { exerciseName: target } : target;
}

/** IDs are authoritative for modern exercises; normalized names are only a legacy fallback. */
export function getExerciseMetricKey(exercise: Pick<Exercise, 'id' | 'name'>): string {
  return exercise.id ? `id:${exercise.id}` : normalizeExerciseName(exercise.name);
}

/** Normalized exercise names are authoritative for cross-session personal records across routines and templates. */
export function getExercisePRKey(exercise: Pick<Exercise, 'id' | 'name'>): string {
  const normalized = normalizeExerciseName(exercise.name);
  if (normalized) return normalized;
  return exercise.id ? `id:${exercise.id}` : '';
}

function exerciseMatchesTarget(exercise: Exercise, target: ExerciseMetricTarget): boolean {
  if (target.exerciseId) {
    if (exercise.id) return exercise.id === target.exerciseId;
    return normalizeExerciseName(exercise.name) === normalizeExerciseName(target.exerciseName);
  }
  return normalizeExerciseName(exercise.name) === normalizeExerciseName(target.exerciseName);
}

export function isWarmupSet(set?: { type?: GymSetType | string } | null): boolean {
  return set?.type === 'warmup';
}

export function isEffectiveSet(set?: { type?: GymSetType | string } | null): boolean {
  return !isWarmupSet(set);
}

function validPerformedSet(set: GymSet): boolean {
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  return weight > 0 || reps > 0;
}

/**
 * Selects only work that was actually performed. Explicitly completed sessions require
 * completed=true; raw pre-status legacy sessions retain their historical fallback.
 */
export function getPerformedExerciseSets(session: GymSession, exercise: Exercise): GymSet[] {
  if ((exercise.sets || []).length > 0) {
    return exercise.sets.filter((set) =>
      validPerformedSet(set) && (session.status === undefined ? set.completed !== false : set.completed === true)
    );
  }

  if (session.status === 'active') return [];
  const weight = Number(exercise.weight) || 0;
  const hasLegacyReps = typeof exercise.reps === 'string' && /\d/.test(exercise.reps);
  if (weight <= 0 && !hasLegacyReps) return [];
  const reps = parseLegacyRepCount(exercise.reps);
  return [{ id: `legacy-${session.id}-${normalizeExerciseName(exercise.name)}`, weight, reps, completed: true }];
}

export function getCompletedGymSets(session: GymSession): GymSet[] {
  return (session.exercises || []).flatMap((exercise) => getPerformedExerciseSets(session, exercise));
}

export function hasPerformedGymWork(session: GymSession): boolean {
  return getCompletedGymSets(session).length > 0;
}

export function isPerformedGymSession(session: GymSession): boolean {
  return session.status !== 'active' && hasPerformedGymWork(session);
}

/**
 * Volumen de entrenamiento/progreso = sólo series efectivas.
 */
export function getPerformedGymVolume(session: GymSession): number {
  return getCompletedGymSets(session)
    .filter(isEffectiveSet)
    .reduce(
      (total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0),
      0
    );
}

/**
 * Volumen total derivado explícitamente incluyendo series de aproximación.
 */
export function getTotalGymVolume(session: GymSession): number {
  return getCompletedGymSets(session).reduce(
    (total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0),
    0
  );
}

function comparePerformedSets(a: PerformedSetMetric, b: PerformedSetMetric): number {
  return a.weight - b.weight || a.reps - b.reps;
}

export function selectBestPerformedSet(sets: GymSet[]): PerformedSetMetric | null {
  let best: PerformedSetMetric | null = null;
  for (const set of sets) {
    if (!validPerformedSet(set) || isWarmupSet(set)) continue;
    const candidate = {
      setId: set.id,
      weight: Number(set.weight) || 0,
      reps: Number(set.reps) || 0,
      e1RM: calculate1RM(Number(set.weight) || 0, Number(set.reps) || 0),
    };
    if (!best || comparePerformedSets(candidate, best) > 0) best = candidate;
  }
  return best;
}

function toExecutionMetric(session: GymSession, exercise: Exercise): ExerciseExecutionMetric | null {
  const sets = getPerformedExerciseSets(session, exercise);
  if (sets.length === 0) return null;
  return {
    sessionId: session.id,
    date: session.date,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets,
    bestSet: selectBestPerformedSet(sets),
    volume: sets
      .filter(isEffectiveSet)
      .reduce(
        (total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0),
        0
      ),
  };
}

function dateAtNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function toLocalISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftISO(iso: string, days: number): string {
  const date = dateAtNoon(iso);
  date.setDate(date.getDate() + days);
  return toLocalISO(date);
}

function periodMetrics(sessions: GymSession[], startDate: string, endDate: string): GymPeriodMetrics {
  const performed = sessions.filter((session) =>
    isPerformedGymSession(session) && session.date >= startDate && session.date <= endDate
  );
  return {
    startDate,
    endDate,
    workoutCount: performed.length,
    volume: performed.reduce((total, session) => total + getPerformedGymVolume(session), 0),
  };
}

export function getGymFrequencyMetrics(
  sessions: GymSession[],
  referenceDate = toLocalISO(new Date())
): GymFrequencyMetrics {
  return {
    last7Days: periodMetrics(sessions, shiftISO(referenceDate, -6), referenceDate),
    previous7Days: periodMetrics(sessions, shiftISO(referenceDate, -13), shiftISO(referenceDate, -7)),
    last30Days: periodMetrics(sessions, shiftISO(referenceDate, -29), referenceDate),
    previous30Days: periodMetrics(sessions, shiftISO(referenceDate, -59), shiftISO(referenceDate, -30)),
  };
}

export interface ExerciseGhostSet {
  setIndex: number;
  weight: number;
  reps: number;
  completed?: boolean;
  rpe?: number;
  type?: 'normal' | 'warmup';
}

export interface ExerciseRecommendation {
  weight: number;
  reps: number;
  type?: 'normal' | 'warmup';
}

export interface ExerciseGhostData {
  previousSessionId: string;
  previousSessionDate: string;
  exerciseName: string;
  sets: ExerciseGhostSet[];
  bestSet?: { weight: number; reps: number; e1RM: number };
  initialSuggestion?: ExerciseRecommendation;
  totalVolume: number;
}

export function getExerciseExecutions(
  sessions: GymSession[],
  targetValue: string | ExerciseMetricTarget,
  options: { excludeSessionId?: string; upToDate?: string } = {}
): ExerciseExecutionMetric[] {
  const target = metricTarget(targetValue);
  if (!normalizeExerciseName(target.exerciseName) && !target.exerciseId) return [];
  const maxDate = options.upToDate || toLocalISO(new Date());

  return (sessions || [])
    .filter((session) =>
      session.id !== options.excludeSessionId &&
      session.date <= maxDate &&
      isPerformedGymSession(session)
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.finishedAt || b.startedAt || '').localeCompare(a.finishedAt || a.startedAt || '') ||
      b.id.localeCompare(a.id)
    )
    .flatMap((session) => (session.exercises || [])
      .filter((exercise) => exerciseMatchesTarget(exercise, target))
      .flatMap((exercise) => {
        const execution = toExecutionMetric(session, exercise);
        return execution ? [execution] : [];
      }));
}

/**
 * Obtiene la sugerencia / recomendación inicial para un ejercicio basándose estrictamente
 * en el PRIMER set efectivo completado de la última sesión realizada de ese ejercicio.
 *
 * Reglas:
 * - Última sesión realmente realizada del ejercicio.
 * - Priorizar el primer set efectivo completado (ignora series de aproximación / warmup).
 * - Identidad moderna por exerciseId; fallback legacy por nombre si falta ID.
 * - Si no hay sets efectivos completados en el historial, retorna null (para que el llamador use fallback).
 */
export function getExerciseInitialSuggestion(
  sessions: GymSession[],
  targetValue: string | ExerciseMetricTarget,
  options: { excludeSessionId?: string; upToDate?: string } = {}
): ExerciseRecommendation | null {
  const executions = getExerciseExecutions(sessions, targetValue, options);
  const previous = executions[0];
  if (!previous) return null;

  // Priorizar el primer set efectivo completado
  const firstEffective = previous.sets.find((set) =>
    (set.completed !== false) && validPerformedSet(set) && isEffectiveSet(set)
  );

  if (firstEffective) {
    return {
      weight: Number(firstEffective.weight) || 0,
      reps: Number(firstEffective.reps) || 0,
      type: 'normal',
    };
  }

  // Fallback si no hay sets marcados explícitamente como efectivos: primer set completado
  const firstCompleted = previous.sets.find((set) =>
    (set.completed !== false) && validPerformedSet(set)
  );
  if (firstCompleted) {
    return {
      weight: Number(firstCompleted.weight) || 0,
      reps: Number(firstCompleted.reps) || 0,
      type: isWarmupSet(firstCompleted) ? 'warmup' : 'normal',
    };
  }

  return null;
}

/**
 * Encuentra los Ghost Values (valores de la sesión real anterior más reciente)
 * para un ejercicio específico, excluyendo la sesión actual.
 */
export function getExerciseGhostValues(
  sessions: GymSession[],
  targetValue: string | ExerciseMetricTarget,
  currentSessionId?: string,
  beforeDate?: string
): ExerciseGhostData | null {
  const previous = getExerciseExecutions(sessions, targetValue, {
    excludeSessionId: currentSessionId,
    upToDate: beforeDate,
  })[0];
  if (!previous) return null;

  const validSets: ExerciseGhostSet[] = previous.sets.map((set, idx) => ({
    setIndex: idx,
    weight: Number(set.weight) || 0,
    reps: Number(set.reps) || 0,
    completed: Boolean(set.completed),
    rpe: typeof set.rpe === 'number' ? set.rpe : undefined,
    type: isWarmupSet(set) ? 'warmup' : 'normal',
  }));

  const initialSuggestion = getExerciseInitialSuggestion(sessions, targetValue, {
    excludeSessionId: currentSessionId,
    upToDate: beforeDate,
  });

  return {
    previousSessionId: previous.sessionId,
    previousSessionDate: previous.date,
    exerciseName: previous.exerciseName,
    sets: validSets,
    bestSet: previous.bestSet ? {
      weight: previous.bestSet.weight,
      reps: previous.bestSet.reps,
      e1RM: previous.bestSet.e1RM,
    } : undefined,
    initialSuggestion: initialSuggestion || undefined,
    totalVolume: previous.volume,
  };
}

/**
 * Aplica el historial real de cada ejercicio a la estructura de una rutina / template,
 * preservando estrictamente la cantidad de series y configuración del template sin modificarlo.
 * Prioriza series efectivas para series regulares del template.
 */
export function applyHistoryToTemplateExercises(
  templateExercises: Exercise[],
  sessions: GymSession[],
  currentSessionId?: string
): Exercise[] {
  return templateExercises.map((templateEx) => {
    const templateWeight = Number.isFinite(Number(templateEx.weight ?? NaN)) ? Number(templateEx.weight) : 20;
    const ghost = getExerciseGhostValues(sessions, {
      exerciseId: templateEx.id,
      exerciseName: templateEx.name,
    }, currentSessionId);
    const templateSets = templateEx.sets && templateEx.sets.length > 0
      ? templateEx.sets
      : [
          { id: 'def-1', weight: templateWeight, reps: 10, completed: false },
          { id: 'def-2', weight: templateWeight, reps: 10, completed: false },
          { id: 'def-3', weight: templateWeight, reps: 10, completed: false },
        ];

    const ghostEffectiveSets = ghost ? ghost.sets.filter(isEffectiveSet) : [];
    const ghostWarmupSets = ghost ? ghost.sets.filter(isWarmupSet) : [];

    let effectiveIndex = 0;
    let warmupIndex = 0;

    // Mantener exactamente la cantidad de series que dicta el template
    const mappedSets: GymSet[] = templateSets.map((tSet, idx) => {
      const isWarmup = isWarmupSet(tSet);
      let matchedGhostSet: ExerciseGhostSet | undefined;

      if (isWarmup) {
        matchedGhostSet = ghostWarmupSets[warmupIndex++];
      } else {
        matchedGhostSet = ghostEffectiveSets[effectiveIndex++];
      }

      if (!matchedGhostSet && ghost && ghost.sets[idx] && isWarmupSet(ghost.sets[idx]) === isWarmup) {
        matchedGhostSet = ghost.sets[idx];
      }

      if (matchedGhostSet) {
        return {
          id: `set-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          weight: matchedGhostSet.weight,
          reps: matchedGhostSet.reps,
          completed: false,
          type: (isWarmup || isWarmupSet(matchedGhostSet)) ? 'warmup' : 'normal',
        };
      }

      // Si el template tiene más series que el historial, usar sugerencia inicial,
      // el último valor conocido del historial, o fallback del template
      const fallbackWeight = ghost?.initialSuggestion?.weight
        ?? (ghost && ghost.sets.length > 0 ? ghost.sets[ghost.sets.length - 1].weight : (Number.isFinite(Number(tSet.weight ?? NaN)) ? Number(tSet.weight) : templateWeight));
      const fallbackReps = ghost?.initialSuggestion?.reps
        ?? (ghost && ghost.sets.length > 0 ? ghost.sets[ghost.sets.length - 1].reps : (Number(tSet.reps) || 10));

      return {
        id: `set-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        weight: fallbackWeight,
        reps: fallbackReps,
        completed: false,
        type: isWarmup ? 'warmup' : 'normal',
      };
    });

    const initialWeight = ghost?.initialSuggestion?.weight
      ?? mappedSets.find(isEffectiveSet)?.weight
      ?? mappedSets[0]?.weight
      ?? templateWeight;

    return {
      ...templateEx,
      sets: mappedSets,
      weight: initialWeight,
    };
  });
}

export interface MetricRecord {
  value: number;
  weight?: number;
  reps?: number;
  date: string;
  sessionId: string;
}

export interface ExercisePRs {
  exerciseId?: string;
  exerciseName?: string;
  maxWeight?: MetricRecord;
  maxReps?: MetricRecord;
  maxE1RM?: MetricRecord;
  maxVolume?: MetricRecord;
}

/**
 * Calcula las 4 dimensiones de récords personales (PR) para cada ejercicio
 * sobre las sesiones proporcionadas:
 * 1. Max Weight (mayor peso levantado)
 * 2. Max Reps (mayor cantidad de reps registradas, guardando el peso asociado)
 * 3. Max e1RM (mayor 1RM estimado mediante Epley con reps <= 12)
 * 4. Max Volume (mayor volumen en una sola sesión para ese ejercicio)
 */
export function calcDetailedPRs(
  sessions: GymSession[],
  excludeSessionId?: string,
  upToDate?: string
): Record<string, ExercisePRs> {
  const prs: Record<string, ExercisePRs> = {};
  const today = toLocalISO(new Date());

  const sortedSessions = [...(sessions || [])]
    .filter((s) => {
      if (!isPerformedGymSession(s)) return false;
      if (excludeSessionId && s.id === excludeSessionId) return false;
      if (upToDate && s.date && s.date > upToDate) return false;
      if (!upToDate && s.date && s.date > today) return false;
      return true;
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || '')); // Cronológico para asignar récords ordenados

  for (const session of sortedSessions) {
    for (const ex of session.exercises || []) {
      const key = getExercisePRKey(ex);
      if (!key) continue;

      if (!prs[key]) {
        prs[key] = { exerciseId: ex.id, exerciseName: ex.name };
      }
      const record = prs[key];
      const sets = getPerformedExerciseSets(session, ex);
      let sessionExVolume = 0;

      for (const set of sets) {
        if (isWarmupSet(set)) continue;
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;

        // Solo computar sets válidos con peso o reps positivos
        if (w <= 0 && r <= 0) continue;

        // 1. Max Weight
        if (w > 0) {
          if (!record.maxWeight || w > record.maxWeight.value || (w === record.maxWeight.value && r > (record.maxWeight.reps || 0))) {
            record.maxWeight = {
              value: w,
              weight: w,
              reps: r,
              date: session.date,
              sessionId: session.id,
            };
          }
        }

        // 2. Max Reps
        if (r > 0) {
          if (!record.maxReps || r > record.maxReps.value || (r === record.maxReps.value && w > (record.maxReps.weight || 0))) {
            record.maxReps = {
              value: r,
              reps: r,
              weight: w,
              date: session.date,
              sessionId: session.id,
            };
          }
        }

        // 3. Max e1RM (Epley <= 12 reps)
        if (w > 0 && r >= 1 && r <= 12) {
          const e1rm = calculate1RM(w, r);
          if (e1rm > 0) {
            if (!record.maxE1RM || e1rm > record.maxE1RM.value) {
              record.maxE1RM = {
                value: e1rm,
                weight: w,
                reps: r,
                date: session.date,
                sessionId: session.id,
              };
            }
          }
        }

        sessionExVolume += w * r;
      }

      // 4. Max Volume de sesión para el ejercicio
      if (sessionExVolume > 0) {
        if (!record.maxVolume || sessionExVolume > record.maxVolume.value) {
          record.maxVolume = {
            value: sessionExVolume,
            date: session.date,
            sessionId: session.id,
          };
        }
      }
    }
  }

  return prs;
}

export interface NewPRRecord {
  exerciseName: string;
  type: 'maxWeight' | 'maxReps' | 'maxE1RM' | 'maxVolume';
  typeLabel: string;
  label: string;
  value: number;
  previousValue?: number;
  weight?: number;
  reps?: number;
}

/**
 * Detecta si una sesión logró NUEVOS récords personales frente a los PRs históricos previos.
 * REGLA ESTRICTA: Un empate NO es un nuevo PR (debe superar estrictamente al anterior).
 */
export function detectSessionPRs(
  session: GymSession,
  historicalPRs: Record<string, ExercisePRs>
): NewPRRecord[] {
  const newPRs: NewPRRecord[] = [];
  if (!isPerformedGymSession(session)) return newPRs;

  // Agrupar todas las series realizadas por clave de ejercicio métrico para evitar duplicados en la misma sesión
  const exercisesByKey = new Map<string, { exerciseName: string; sets: GymSet[] }>();
  for (const ex of session.exercises || []) {
    const key = getExercisePRKey(ex);
    if (!key) continue;
    const sets = getPerformedExerciseSets(session, ex);
    if (sets.length === 0) continue;
    const existing = exercisesByKey.get(key);
    if (!existing) {
      exercisesByKey.set(key, { exerciseName: ex.name, sets: [...sets] });
    } else {
      existing.sets.push(...sets);
    }
  }

  for (const [key, { exerciseName, sets }] of exercisesByKey.entries()) {
    const oldPR = historicalPRs[key] || {};

    let sessionMaxWeight = 0;
    let sessionMaxWeightReps = 0;
    let sessionMaxReps = 0;
    let sessionMaxRepsWeight = 0;
    let sessionMaxE1RM = 0;
    let sessionMaxE1RMWeight = 0;
    let sessionMaxE1RMReps = 0;
    let sessionVolumeTotal = 0;

    for (const set of sets) {
      if (isWarmupSet(set)) continue;
      const w = Number(set.weight) || 0;
      const r = Number(set.reps) || 0;
      if (w <= 0 && r <= 0) continue;

      if (w > sessionMaxWeight) {
        sessionMaxWeight = w;
        sessionMaxWeightReps = r;
      }

      if (r > sessionMaxReps) {
        sessionMaxReps = r;
        sessionMaxRepsWeight = w;
      }

      if (w > 0 && r >= 1 && r <= 12) {
        const e1rm = calculate1RM(w, r);
        if (e1rm > sessionMaxE1RM) {
          sessionMaxE1RM = e1rm;
          sessionMaxE1RMWeight = w;
          sessionMaxE1RMReps = r;
        }
      }

      sessionVolumeTotal += w * r;
    }

    // 1. Max Weight (estrictamente superior)
    if (sessionMaxWeight > 0) {
      const prev = oldPR.maxWeight?.value;
      if (prev === undefined || sessionMaxWeight > prev) {
        newPRs.push({
          exerciseName,
          type: 'maxWeight',
          typeLabel: 'Peso Máximo',
          label: `${sessionMaxWeight} kg (× ${sessionMaxWeightReps})`,
          value: sessionMaxWeight,
          previousValue: prev,
          weight: sessionMaxWeight,
          reps: sessionMaxWeightReps,
        });
      }
    }

    // 2. Max Reps (estrictamente superior)
    if (sessionMaxReps > 0) {
      const prev = oldPR.maxReps?.value;
      if (prev === undefined || sessionMaxReps > prev) {
        newPRs.push({
          exerciseName,
          type: 'maxReps',
          typeLabel: 'Reps Máximas',
          label: `${sessionMaxReps} reps (@ ${sessionMaxRepsWeight} kg)`,
          value: sessionMaxReps,
          previousValue: prev,
          reps: sessionMaxReps,
          weight: sessionMaxRepsWeight,
        });
      }
    }

    // 3. Max e1RM (estrictamente superior)
    if (sessionMaxE1RM > 0) {
      const prev = oldPR.maxE1RM?.value;
      if (prev === undefined || sessionMaxE1RM > prev) {
        newPRs.push({
          exerciseName,
          type: 'maxE1RM',
          typeLabel: '1RM Estimado',
          label: `~${sessionMaxE1RM} kg (${sessionMaxE1RMWeight}k × ${sessionMaxE1RMReps})`,
          value: sessionMaxE1RM,
          previousValue: prev,
          weight: sessionMaxE1RMWeight,
          reps: sessionMaxE1RMReps,
        });
      }
    }

    // 4. Max Volume (estrictamente superior)
    if (sessionVolumeTotal > 0) {
      const prev = oldPR.maxVolume?.value;
      if (prev === undefined || sessionVolumeTotal > prev) {
        newPRs.push({
          exerciseName,
          type: 'maxVolume',
          typeLabel: 'Volumen Máximo',
          label: `${sessionVolumeTotal.toLocaleString('es-UY')} kg en sesión`,
          value: sessionVolumeTotal,
          previousValue: prev,
        });
      }
    }
  }

  return newPRs;
}

export interface ExerciseSessionHistoryPoint {
  sessionId: string;
  date: string;
  shortDate: string;
  sets: GymSet[];
  volume: number;
  maxWeight: number;
  maxReps: number;
  e1rm: number;
}

export interface ExerciseHistoryDetails {
  exerciseName: string;
  equipment?: ExerciseEquipment;
  barWeight?: number;
  muscleGroup?: MuscleGroup | string;
  prs: ExercisePRs;
  sessions: ExerciseSessionHistoryPoint[];
  recent5: ExerciseSessionHistoryPoint[];
  chartPoints: Array<{ sessionId: string; date: string; shortDate: string; maxWeight: number; e1rm: number; volume: number }>;
}

/**
 * Obtiene el historial individual completo de un ejercicio:
 * - Últimas sesiones con sets y volumen
 * - Récords en las 4 dimensiones
 * - Puntos de tendencia para gráfico
 */
export function getExerciseHistory(
  sessions: GymSession[],
  targetValue: string | ExerciseMetricTarget
): ExerciseHistoryDetails {
  const target = metricTarget(targetValue);
  const allPRs = calcDetailedPRs(sessions);
  const normKey = normalizeExerciseName(target.exerciseName);
  const idKey = target.exerciseId ? `id:${target.exerciseId}` : '';
  const prs = (normKey ? allPRs[normKey] : undefined) || (idKey ? allPRs[idKey] : undefined) || {};

  let equipment: ExerciseEquipment | undefined;
  let barWeight: number | undefined;
  let muscleGroup: MuscleGroup | string | undefined;

  const matchingSessions: ExerciseSessionHistoryPoint[] = [];
  const executions = getExerciseExecutions(sessions, target);

  for (const execution of executions) {
    const sourceExercise = sessions
      .find((session) => session.id === execution.sessionId)
      ?.exercises.find((exercise) =>
        exercise.id === execution.exerciseId && exercise.name === execution.exerciseName
      );
    if (!equipment && sourceExercise?.equipment) equipment = sourceExercise.equipment;
    if (barWeight === undefined && typeof sourceExercise?.barWeight === 'number') barWeight = sourceExercise.barWeight;
    if (!muscleGroup && sourceExercise?.muscleGroup) muscleGroup = sourceExercise.muscleGroup;

    let maxR = 0;
    let maxE1rm = 0;
    for (const set of execution.sets) {
      if (isWarmupSet(set)) continue;
      const w = Number(set.weight) || 0;
      const r = Number(set.reps) || 0;
      if (r > maxR) maxR = r;
      if (w > 0 && r >= 1 && r <= 12) {
        const est = calculate1RM(w, r);
        if (est > maxE1rm) maxE1rm = est;
      }
    }

    const [, month, day] = (execution.date || '').split('-');
    const shortDate = day && month ? `${day}/${month}` : (execution.date || '');

    matchingSessions.push({
      sessionId: execution.sessionId,
      date: execution.date,
      shortDate,
      sets: execution.sets,
      volume: execution.volume,
      maxWeight: execution.bestSet?.weight || 0,
      maxReps: maxR,
      e1rm: maxE1rm,
    });
  }

  if (!equipment) {
    equipment = inferExerciseEquipment(target.exerciseName).equipment;
  }
  if (!muscleGroup) {
    muscleGroup = inferMuscleGroup(target.exerciseName);
  }

  const recent5 = matchingSessions.slice(0, 5);

  // chartPoints ordenados cronológicamente (antiguo -> nuevo) para Recharts
  const chartPoints = [...matchingSessions]
    .reverse()
    .map((p) => ({
      sessionId: p.sessionId,
      date: p.date,
      shortDate: p.shortDate,
      maxWeight: p.maxWeight,
      e1rm: p.e1rm,
      volume: p.volume,
    }));

  return {
    exerciseName: target.exerciseName,
    equipment,
    barWeight,
    muscleGroup,
    prs,
    sessions: matchingSessions,
    recent5,
    chartPoints,
  };
}

function bestSetAcrossExecutions(
  executions: ExerciseExecutionMetric[]
): (PerformedSetMetric & { sessionId: string; date: string }) | null {
  let best: (PerformedSetMetric & { sessionId: string; date: string }) | null = null;
  for (const execution of executions) {
    if (!execution.bestSet) continue;
    const candidate = {
      ...execution.bestSet,
      sessionId: execution.sessionId,
      date: execution.date,
    };
    if (!best || comparePerformedSets(candidate, best) > 0) best = candidate;
  }
  return best;
}

export function getExerciseProgressMetrics(
  sessions: GymSession[],
  targetValue: string | ExerciseMetricTarget,
  referenceDate = toLocalISO(new Date())
): ExerciseProgressMetrics {
  const target = metricTarget(targetValue);
  const executions = getExerciseExecutions(sessions, target, { upToDate: referenceDate });
  const recentStart = shiftISO(referenceDate, -29);
  const previousStart = shiftISO(referenceDate, -59);
  const previousEnd = shiftISO(referenceDate, -30);
  const recent = executions.filter((execution) => execution.date >= recentStart);
  const previous = executions.filter((execution) =>
    execution.date >= previousStart && execution.date <= previousEnd
  );
  const recentBest = bestSetAcrossExecutions(recent);
  const previousBest = bestSetAcrossExecutions(previous);

  let state: ExerciseProgressState = 'insufficient_data';
  if (recent.length > 0 && previous.length > 0 && recentBest && previousBest) {
    state = comparePerformedSets(recentBest, previousBest) > 0 ? 'improved' : 'stable';
  }

  return {
    key: target.exerciseId ? `id:${target.exerciseId}` : normalizeExerciseName(target.exerciseName),
    exerciseId: target.exerciseId,
    exerciseName: target.exerciseName,
    lastExecution: executions[0] || null,
    bestSet: bestSetAcrossExecutions(executions),
    recentVolume: recent.reduce((total, execution) => total + execution.volume, 0),
    previousVolume: previous.reduce((total, execution) => total + execution.volume, 0),
    recentSessionCount: new Set(recent.map((execution) => execution.sessionId)).size,
    previousSessionCount: new Set(previous.map((execution) => execution.sessionId)).size,
    state,
  };
}

export function getGymProgressMetrics(
  sessions: GymSession[],
  referenceDate = toLocalISO(new Date())
): GymProgressMetrics {
  const targets = new Map<string, ExerciseMetricTarget>();
  [...(sessions || [])]
    .filter((session) => session.date <= referenceDate && isPerformedGymSession(session))
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((session) => {
      for (const exercise of session.exercises || []) {
        if (getPerformedExerciseSets(session, exercise).length === 0) continue;
        const key = getExerciseMetricKey(exercise);
        if (!key) continue;
        targets.set(key, { exerciseId: exercise.id, exerciseName: exercise.name });
      }
    });

  return {
    frequency: getGymFrequencyMetrics(sessions, referenceDate),
    exercises: [...targets.values()].map((target) =>
      getExerciseProgressMetrics(sessions, target, referenceDate)
    ),
  };
}

/**
 * Valida si un rango horario startedAt -> finishedAt es lógicamente válido.
 * Regla: finishedAt no puede ser anterior a startedAt, salvo cruces legítimos de medianoche.
 */
/**
 * Parsea un string horario a minutos transcurridos desde las 00:00 del día.
 * Soporta formato ISO completo, 24 horas (HH:mm) y 12 horas con AM/PM (incluyendo a. m. / p. m. y espacios finos).
 */
export function parseLocalMinutesOfDay(val?: string | null): number | null {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim();
  if (!clean) return null;

  if (clean.includes('T')) {
    const d = new Date(clean);
    if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }

  // Normalizar espacios no separables y espacios finos habituales de toLocaleTimeString
  const normalized = clean.replace(/[\u202F\u00A0\s]+/g, ' ');
  const isPM = /p\.?\s*m\.?|pm/i.test(normalized);
  const isAM = /a\.?\s*m\.?|am/i.test(normalized);
  const match = normalized.match(/(\d{1,2}):(\d{2})/);

  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes < 0 || minutes >= 60) return null;

    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Valida si un rango horario startedAt -> finishedAt es lógicamente válido.
 * Regla: finishedAt no puede ser anterior a startedAt, salvo cruces legítimos de medianoche.
 */
export function isLogicalTimeRangeValid(
  startedAt?: string | null,
  finishedAt?: string | null
): boolean {
  if (!startedAt || !finishedAt) return true;

  if (startedAt.includes('T') && finishedAt.includes('T')) {
    const s = new Date(startedAt).getTime();
    const f = new Date(finishedAt).getTime();
    if (Number.isFinite(s) && Number.isFinite(f)) {
      return f >= s;
    }
  }

  const startMin = parseLocalMinutesOfDay(startedAt);
  const finishMin = parseLocalMinutesOfDay(finishedAt);

  if (startMin !== null && finishMin !== null) {
    if (finishMin < startMin) {
      return startMin >= 18 * 60 && finishMin <= 6 * 60;
    }
    return true;
  }

  return true;
}

/**
 * Calcula la duración de una sesión a partir de startedAt y finishedAt.
 * Soporta formatos ISO o formato HH:MM (24h y 12h con AM/PM / a. m. / p. m.),
 * cruces legítimos de medianoche, y fallback automático a las marcas temporales
 * reales de las series completadas si los campos de sesión faltan o no son válidos.
 */
export function calculateSessionDuration(
  startedAt?: string | null,
  finishedAt?: string | null,
  session?: GymSession | null
): { minutes: number; formatted: string } {
  // 1. Si ambos son ISO completos, la diferencia directa en ms es la más precisa
  if (startedAt && finishedAt && startedAt.includes('T') && finishedAt.includes('T')) {
    const startMs = new Date(startedAt).getTime();
    const finishMs = new Date(finishedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(finishMs)) {
      if (finishMs < startMs) {
        return { minutes: 0, formatted: '0 min' };
      }
      const diffMin = Math.round((finishMs - startMs) / 60000);
      return formatMinutes(diffMin);
    }
  }

  // 2. Parser robusto de minutos del día (24h y 12h con a. m. / p. m.)
  if (startedAt && finishedAt) {
    const startMin = parseLocalMinutesOfDay(startedAt);
    const finishMin = parseLocalMinutesOfDay(finishedAt);

    if (startMin != null && finishMin != null) {
      let diff = finishMin - startMin;
      if (diff < 0) {
        if (startMin >= 18 * 60 && finishMin <= 6 * 60) {
          diff += 24 * 60; // Cruce de medianoche
        } else {
          return { minutes: 0, formatted: '0 min' };
        }
      }
      return formatMinutes(diff);
    }
  }

  // 3. Fallback inteligente: si faltan los horarios de cabecera pero la sesión tiene series
  // con completedAt registrados, computar la duración real a partir de sus timestamps
  if (session && Array.isArray(session.exercises)) {
    const timestamps: number[] = [];
    for (const ex of session.exercises) {
      for (const set of ex.sets || []) {
        if (set.completed && set.completedAt) {
          const t = new Date(set.completedAt).getTime();
          if (Number.isFinite(t)) timestamps.push(t);
        }
      }
    }
    if (timestamps.length >= 2) {
      timestamps.sort((a, b) => a - b);
      const first = timestamps[0];
      const last = timestamps[timestamps.length - 1];
      const diffMin = Math.round((last - first) / 60000);
      if (diffMin > 0) {
        return formatMinutes(diffMin);
      }
    }
  }

  return { minutes: 0, formatted: '0 min' };
}

function formatMinutes(mins: number): { minutes: number; formatted: string } {
  if (mins < 60) {
    return { minutes: mins, formatted: `${mins} min` };
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    minutes: mins,
    formatted: m > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`,
  };
}

export function nowTimeHHmm(date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
