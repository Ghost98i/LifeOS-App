import type { DayKey, GymSession, RoutineTemplate } from '../types';

/** The schedule proposes a plan; it never creates a performed session. */
export function getScheduledGymRoutine(routines: RoutineTemplate[], today: string) {
  const date = new Date(`${today}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const days: DayKey[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = days[(date.getDay() + offset) % 7];
    const routine = routines.find((entry) => entry.exercises.length > 0 && entry.days?.includes(day));
    if (routine) return { routine, day, daysAway: offset };
  }
  return null;
}
import { getCompletedGymSets, getPerformedGymVolume, isPerformedGymSession } from './gymFlows';
import {
  calcDetailedPRs,
  calculateSessionDuration,
  getExerciseGhostValues,
  getPerformedExerciseSets,
  normalizeExerciseName,
  selectBestPerformedSet,
} from './gymMetrics';

export interface GymSessionPresentation {
  completedSetCount: number;
  durationLabel: string | null;
  exerciseCount: number;
  name: string;
  prExerciseCount: number;
  totalSetCount: number;
  volumeKg: number;
  bestSet: {
    exerciseName: string;
    reps: number;
    weight: number;
  } | null;
}

/** Calendar periods use recorded, performed sessions only. */
export function getGymCalendarOverview(sessions: GymSession[], today: string) {
  const current = new Date(`${today}T12:00:00`);
  const monday = new Date(current);
  monday.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const performed = sessions.filter((session) => isPerformedGymSession(session) && session.date <= today);
  return {
    weekCount: performed.filter((session) => session.date >= weekStart).length,
    monthCount: performed.filter((session) => session.date >= monthStart).length,
    latest: [...performed].sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.finishedAt || b.startedAt || '').localeCompare(a.finishedAt || a.startedAt || '')
    )[0] || null,
  };
}

export function formatGymSessionDateTime(session: GymSession): string {
  const date = new Date(`${session.date}T12:00:00`);
  const label = Number.isNaN(date.getTime())
    ? session.date
    : new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  const time = session.startedAt?.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0]
    || session.finishedAt?.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0];
  return time ? `${label} · ${time}` : label;
}

export function getPreviousSessionBestLabel(
  sessions: GymSession[],
  currentSessionId: string,
  exerciseName: string,
  exerciseId?: string
): string | null {
  const best = getExerciseGhostValues(sessions, { exerciseId, exerciseName }, currentSessionId)?.bestSet;
  return best ? `${best.weight} kg × ${best.reps}` : null;
}

export function dedupeVisibleGymRecords<T extends { name: string; weight: number; reps: number }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${normalizeExerciseName(record.name)}|${record.weight}|${record.reps}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildGymSessionPresentation(
  session: GymSession,
  allSessions: GymSession[]
): GymSessionPresentation {
  const completedSets = getCompletedGymSets(session);
  const duration = calculateSessionDuration(session.startedAt, session.finishedAt);
  const latestRecordedDate = (allSessions || []).reduce(
    (latest, candidate) => candidate.date > latest ? candidate.date : latest,
    session.date
  );
  const allTimeRecords = calcDetailedPRs(allSessions, undefined, latestRecordedDate);
  const prExercises = new Set<string>();

  for (const [exerciseName, records] of Object.entries(allTimeRecords)) {
    if (
      records.maxWeight?.sessionId === session.id ||
      records.maxReps?.sessionId === session.id ||
      records.maxE1RM?.sessionId === session.id ||
      records.maxVolume?.sessionId === session.id
    ) {
      prExercises.add(exerciseName);
    }
  }

  const bestSet = (session.exercises || []).reduce<GymSessionPresentation['bestSet']>((best, exercise) => {
    const candidate = selectBestPerformedSet(getPerformedExerciseSets(session, exercise));
    if (!candidate) return best;
    if (!best || candidate.weight > best.weight || (candidate.weight === best.weight && candidate.reps > best.reps)) {
      return { exerciseName: exercise.name, weight: candidate.weight, reps: candidate.reps };
    }
    return best;
  }, null);

  return {
    completedSetCount: completedSets.length,
    durationLabel: duration.minutes > 0 ? duration.formatted : null,
    exerciseCount: session.exercises?.length || 0,
    name: session.weekLabel?.trim() || session.exercises?.[0]?.name?.trim() || 'Entrenamiento',
    prExerciseCount: prExercises.size,
    totalSetCount: (session.exercises || []).reduce(
      (total, exercise) => total + (exercise.sets?.length || 0),
      0
    ),
    volumeKg: getPerformedGymVolume(session),
    bestSet,
  };
}
