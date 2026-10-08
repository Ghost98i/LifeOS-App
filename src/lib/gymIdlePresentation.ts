import type { GymSession } from '../types';
import { getCompletedGymSets, getPerformedGymVolume } from './gymFlows';
import {
  calcDetailedPRs,
  calculateSessionDuration,
  getPerformedExerciseSets,
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
