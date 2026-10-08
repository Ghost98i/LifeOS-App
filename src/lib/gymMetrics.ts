import type { Exercise, ExerciseEquipment, GymSession, GymSet, MuscleGroup } from '../types';
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

export interface ExerciseGhostSet {
  setIndex: number;
  weight: number;
  reps: number;
  completed?: boolean;
  rpe?: number;
}

export interface ExerciseGhostData {
  previousSessionId: string;
  previousSessionDate: string;
  exerciseName: string;
  sets: ExerciseGhostSet[];
  bestSet?: { weight: number; reps: number; e1RM: number };
  totalVolume: number;
}

/**
 * Encuentra los Ghost Values (valores de la sesión real anterior más reciente)
 * para un ejercicio específico, excluyendo la sesión actual.
 */
export function getExerciseGhostValues(
  sessions: GymSession[],
  exerciseName: string,
  currentSessionId?: string,
  beforeDate?: string
): ExerciseGhostData | null {
  const targetNorm = normalizeExerciseName(exerciseName);
  if (!targetNorm) return null;

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = beforeDate || today;

  // Filtrar sesiones pasadas válidas que contengan el ejercicio con datos reales
  const eligibleSessions = (sessions || [])
    .filter((s) => {
      if (currentSessionId && s.id === currentSessionId) return false;
      if (s.status === 'active') return false;
      if (s.date && s.date > maxDate) return false;
      const ex = (s.exercises || []).find((e) => normalizeExerciseName(e.name) === targetNorm);
      if (!ex) return false;
      const sets = ex.sets || [];
      const hasSetsData = sets.some((st) => Number(st.weight) > 0 || Number(st.reps) > 0);
      return hasSetsData || Number(ex.weight) > 0;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (eligibleSessions.length === 0) return null;

  const prevSession = eligibleSessions[0];
  const prevEx = (prevSession.exercises || []).find(
    (e) => normalizeExerciseName(e.name) === targetNorm
  );

  if (!prevEx) return null;

  let setsToProcess = prevEx.sets || [];
  if (setsToProcess.length === 0 && Number(prevEx.weight) > 0) {
    const r = parseLegacyRepCount(prevEx.reps);
    setsToProcess = [{ id: `legacy-${prevSession.id}`, weight: Number(prevEx.weight), reps: r, completed: true }];
  }

  if (setsToProcess.length === 0) return null;

  const hasAnyCompleted = setsToProcess.some((st) => st.completed === true);
  const candidateSets = setsToProcess.filter((st) => {
    const w = Number(st.weight) || 0;
    const r = Number(st.reps) || 0;
    if (w <= 0 && r <= 0) return false;
    if (hasAnyCompleted) return Boolean(st.completed);
    return st.completed !== false;
  });

  if (candidateSets.length === 0) return null;
  const finalSets = candidateSets;

  const validSets: ExerciseGhostSet[] = finalSets.map((set, idx) => ({
    setIndex: idx,
    weight: Number(set.weight) || 0,
    reps: Number(set.reps) || 0,
    completed: Boolean(set.completed),
    rpe: typeof set.rpe === 'number' ? set.rpe : undefined,
  }));

  // Encontrar el mejor set de esa sesión previa
  let bestSet: { weight: number; reps: number; e1RM: number } | undefined;
  let bestWeight = -1;
  let bestReps = -1;

  for (const s of validSets) {
    if (s.weight > bestWeight || (s.weight === bestWeight && s.reps > bestReps)) {
      bestWeight = s.weight;
      bestReps = s.reps;
      bestSet = {
        weight: s.weight,
        reps: s.reps,
        e1RM: calculate1RM(s.weight, s.reps),
      };
    }
  }

  const vol = validSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  return {
    previousSessionId: prevSession.id,
    previousSessionDate: prevSession.date,
    exerciseName: prevEx.name,
    sets: validSets,
    bestSet,
    totalVolume: vol,
  };
}

/**
 * Aplica el historial real de cada ejercicio a la estructura de una rutina / template,
 * preservando estrictamente la cantidad de series y configuración del template sin modificarlo.
 */
export function applyHistoryToTemplateExercises(
  templateExercises: Exercise[],
  sessions: GymSession[],
  currentSessionId?: string
): Exercise[] {
  return templateExercises.map((templateEx) => {
    const ghost = getExerciseGhostValues(sessions, templateEx.name, currentSessionId);
    const templateSets = templateEx.sets && templateEx.sets.length > 0
      ? templateEx.sets
      : [
          { id: 'def-1', weight: Number(templateEx.weight) || 20, reps: 10, completed: false },
          { id: 'def-2', weight: Number(templateEx.weight) || 20, reps: 10, completed: false },
          { id: 'def-3', weight: Number(templateEx.weight) || 20, reps: 10, completed: false },
        ];

    // Mantener exactamente la cantidad de series que dicta el template
    const mappedSets: GymSet[] = templateSets.map((tSet, idx) => {
      if (ghost && ghost.sets[idx]) {
        const hSet = ghost.sets[idx];
        return {
          id: `set-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          weight: hSet.weight,
          reps: hSet.reps,
          completed: false,
        };
      }

      // Si el template tiene más series que el historial, usar el fallback del template
      // o el último valor conocido del historial
      const fallbackWeight = ghost && ghost.sets.length > 0
        ? ghost.sets[ghost.sets.length - 1].weight
        : Number(tSet.weight) || Number(templateEx.weight) || 20;
      const fallbackReps = ghost && ghost.sets.length > 0
        ? ghost.sets[ghost.sets.length - 1].reps
        : Number(tSet.reps) || 10;

      return {
        id: `set-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        weight: fallbackWeight,
        reps: fallbackReps,
        completed: false,
      };
    });

    return {
      ...templateEx,
      sets: mappedSets,
      weight: mappedSets[0]?.weight ?? (Number(templateEx.weight) || 20),
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
  const today = new Date().toISOString().slice(0, 10);

  const sortedSessions = [...(sessions || [])]
    .filter((s) => {
      if (s.status === 'active') return false;
      if (excludeSessionId && s.id === excludeSessionId) return false;
      if (upToDate && s.date && s.date > upToDate) return false;
      if (!upToDate && s.date && s.date > today) return false;
      return true;
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || '')); // Cronológico para asignar récords ordenados

  for (const session of sortedSessions) {
    for (const ex of session.exercises || []) {
      const norm = normalizeExerciseName(ex.name);
      if (!norm) continue;

      if (!prs[norm]) {
        prs[norm] = {};
      }
      const record = prs[norm];

      let sets = ex.sets || [];
      if (sets.length === 0 && Number(ex.weight) > 0) {
        const r = parseLegacyRepCount(ex.reps);
        sets = [{ id: `legacy-${session.id}`, weight: Number(ex.weight), reps: r, completed: true }];
      }

      const hasAnyCompleted = sets.some((st) => st.completed === true);
      let sessionExVolume = 0;

      for (const set of sets) {
        if (hasAnyCompleted && !set.completed) continue;
        if (!hasAnyCompleted && set.completed === false) continue;

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

  for (const ex of session.exercises || []) {
    const norm = normalizeExerciseName(ex.name);
    if (!norm) continue;

    const oldPR = historicalPRs[norm] || {};
    const sets = ex.sets || [];
    const hasAnyCompleted = sets.some((st) => st.completed === true);

    let sessionMaxWeight = 0;
    let sessionMaxWeightReps = 0;
    let sessionMaxReps = 0;
    let sessionMaxRepsWeight = 0;
    let sessionMaxE1RM = 0;
    let sessionMaxE1RMWeight = 0;
    let sessionMaxE1RMReps = 0;
    let sessionVolumeTotal = 0;

    for (const set of sets) {
      if (hasAnyCompleted && !set.completed) continue;
      if (!hasAnyCompleted && set.completed === false) continue;

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
          exerciseName: ex.name,
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
          exerciseName: ex.name,
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
          exerciseName: ex.name,
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
          exerciseName: ex.name,
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
  exerciseName: string
): ExerciseHistoryDetails {
  const norm = normalizeExerciseName(exerciseName);
  const allPRs = calcDetailedPRs(sessions);
  const prs = allPRs[norm] || {};

  let equipment: ExerciseEquipment | undefined;
  let barWeight: number | undefined;
  let muscleGroup: MuscleGroup | string | undefined;

  const today = new Date().toISOString().slice(0, 10);
  const matchingSessions: ExerciseSessionHistoryPoint[] = [];

  const sortedSessions = [...(sessions || [])]
    .filter((s) => {
      if (s.status === 'active') return false;
      if (s.date && s.date > today) return false;
      return true;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const s of sortedSessions) {
    const ex = (s.exercises || []).find((e) => normalizeExerciseName(e.name) === norm);
    if (!ex) continue;

    if (!equipment && ex.equipment) equipment = ex.equipment;
    if (barWeight === undefined && typeof ex.barWeight === 'number') barWeight = ex.barWeight;
    if (!muscleGroup && ex.muscleGroup) muscleGroup = ex.muscleGroup;

    let sets = ex.sets || [];
    if (sets.length === 0 && Number(ex.weight) > 0) {
      const r = parseLegacyRepCount(ex.reps);
      sets = [{ id: `legacy-${s.id}`, weight: Number(ex.weight), reps: r, completed: true }];
    }

    const hasAnyCompleted = sets.some((st) => st.completed === true);
    const eligibleSets = sets.filter((st) => {
      const w = Number(st.weight) || 0;
      const r = Number(st.reps) || 0;
      if (w <= 0 && r <= 0) return false;
      if (hasAnyCompleted) return Boolean(st.completed);
      return st.completed !== false;
    });

    if (eligibleSets.length === 0) continue;

    let vol = 0;
    let maxW = 0;
    let maxR = 0;
    let maxE1rm = 0;

    for (const set of eligibleSets) {
      const w = Number(set.weight) || 0;
      const r = Number(set.reps) || 0;
      vol += w * r;
      if (w > maxW) maxW = w;
      if (r > maxR) maxR = r;
      if (w > 0 && r >= 1 && r <= 12) {
        const est = calculate1RM(w, r);
        if (est > maxE1rm) maxE1rm = est;
      }
    }

    const [, month, day] = (s.date || '').split('-');
    const shortDate = day && month ? `${day}/${month}` : (s.date || '');

    matchingSessions.push({
      sessionId: s.id,
      date: s.date,
      shortDate,
      sets: eligibleSets,
      volume: vol,
      maxWeight: maxW,
      maxReps: maxR,
      e1rm: maxE1rm,
    });
  }

  if (!equipment) {
    equipment = inferExerciseEquipment(exerciseName).equipment;
  }
  if (!muscleGroup) {
    muscleGroup = inferMuscleGroup(exerciseName);
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
    exerciseName,
    equipment,
    barWeight,
    muscleGroup,
    prs,
    sessions: matchingSessions,
    recent5,
    chartPoints,
  };
}

/**
 * Calcula la duración de una sesión a partir de startedAt y finishedAt.
 * Soporta formatos ISO o formato HH:MM, incluyendo cruce de medianoche y combinaciones mixtas.
 */
export function calculateSessionDuration(
  startedAt?: string | null,
  finishedAt?: string | null
): { minutes: number; formatted: string } {
  if (!startedAt) {
    return { minutes: 0, formatted: '0 min' };
  }

  // Si ambos son ISO completos, la diferencia directa en ms es la más precisa
  if (startedAt.includes('T') && finishedAt && finishedAt.includes('T')) {
    const startMs = new Date(startedAt).getTime();
    const finishMs = new Date(finishedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(finishMs)) {
      const diffMin = Math.max(0, Math.round((finishMs - startMs) / 60000));
      return formatMinutes(diffMin);
    }
  }

  // Convertir cualquier formato a minutos del día en hora local
  const toLocalMinutesOfDay = (val: string): number | null => {
    if (val.includes('T')) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
    }
    const match = val.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return Number(match[1]) * 60 + Number(match[2]);
    }
    return null;
  };

  const startMin = toLocalMinutesOfDay(startedAt);
  const finishMin = finishedAt ? toLocalMinutesOfDay(finishedAt) : null;

  if (startMin != null && finishMin != null) {
    let diff = finishMin - startMin;
    if (diff < 0) diff += 24 * 60; // Cruce de medianoche
    return formatMinutes(diff);
  }

  return { minutes: 0, formatted: '0 min' };
}

function formatMinutes(mins: number): { minutes: number; formatted: string } {
  if (mins < 60) {
    return { minutes: mins, formatted: `${mins} min` };
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { minutes: mins, formatted: m > 0 ? `${h}h ${m}m` : `${h}h` };
}
