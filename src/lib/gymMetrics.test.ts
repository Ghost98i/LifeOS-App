import assert from 'node:assert/strict';
import test from 'node:test';
import type { Exercise, GymSession } from '../types';
import {
  calculate1RM,
  getExerciseGhostValues,
  applyHistoryToTemplateExercises,
  calcDetailedPRs,
  detectSessionPRs,
  getExerciseHistory,
  calculateSessionDuration,
  getExerciseProgressMetrics,
  getGymFrequencyMetrics,
  getGymProgressMetrics,
  normalizeExerciseName,
} from './gymMetrics';

// ── 0. Exercise Name Normalizer ───────────────────────────────────────────

test('normalizeExerciseName: trims, lowercases, removes accents and collapses whitespace', () => {
  assert.equal(normalizeExerciseName('  Press de BANCA plano  '), 'press de banca plano');
  assert.equal(normalizeExerciseName('Sentadilla Con Barra'), 'sentadilla con barra');
  assert.equal(normalizeExerciseName('Extensión   de Cuádriceps'), 'extension de cuadriceps');
});

// ── 1. e1RM (Epley <= 12 reps) ──────────────────────────────────────────────

test('calculate1RM: calculates correct Epley estimate for standard cases', () => {
  // 80kg x 8 reps -> 80 * (1 + 8/30) = 80 * 1.2666... = 101.333 -> 101.3
  assert.equal(calculate1RM(80, 8), 101.3);

  // 100kg x 1 rep -> 100 (direct weight)
  assert.equal(calculate1RM(100, 1), 100);

  // 60kg x 12 reps -> 60 * (1 + 12/30) = 60 * 1.4 = 84
  assert.equal(calculate1RM(60, 12), 84);
});

test('calculate1RM: clamps and rejects reps > 12 to avoid inaccurate cardiovascular estimates', () => {
  // 60kg x 13 reps -> must return 0
  assert.equal(calculate1RM(60, 13), 0);
  assert.equal(calculate1RM(50, 20), 0);
  assert.equal(calculate1RM(40, 50), 0);
});

test('calculate1RM: handles edge cases safely (negative, 0, NaN, Infinity)', () => {
  assert.equal(calculate1RM(0, 10), 0);
  assert.equal(calculate1RM(-50, 10), 0);
  assert.equal(calculate1RM(80, 0), 0);
  assert.equal(calculate1RM(80, -5), 0);
  assert.equal(calculate1RM(NaN, 10), 0);
  assert.equal(calculate1RM(80, NaN), 0);
  assert.equal(calculate1RM(Infinity, 10), 0);
});

// ── 2. Ghost Values ─────────────────────────────────────────────────────────

test('getExerciseGhostValues: finds the correct previous session and ignores current session', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-today',
      date: '2026-09-25',
      exercises: [
        {
          id: 'tmpl-ex-1',
          name: 'Press banca plano',
          sets: [{ id: 's1', weight: 85, reps: 6, completed: true }],
        },
      ],
    },
    {
      id: 'sess-prev',
      date: '2026-09-22',
      exercises: [
        {
          name: 'Press Banca Plano', // Case variation
          sets: [
            { id: 'p1', weight: 80, reps: 8, completed: true },
            { id: 'p2', weight: 80, reps: 8, completed: true },
            { id: 'p3', weight: 82.5, reps: 6, completed: true },
          ],
        },
      ],
    },
    {
      id: 'sess-old',
      date: '2026-09-18',
      exercises: [
        {
          name: 'press banca plano',
          sets: [{ id: 'o1', weight: 75, reps: 10, completed: true }],
        },
      ],
    },
  ];

  // Excluding sess-today should retrieve sess-prev
  const ghost = getExerciseGhostValues(sessions, 'Press banca plano', 'sess-today');
  assert.ok(ghost, 'Ghost values must be found');
  assert.equal(ghost!.previousSessionId, 'sess-prev');
  assert.equal(ghost!.previousSessionDate, '2026-09-22');
  assert.equal(ghost!.sets.length, 3);
  assert.equal(ghost!.sets[0].weight, 80);
  assert.equal(ghost!.sets[0].reps, 8);
  assert.equal(ghost!.sets[1].weight, 80);
  assert.equal(ghost!.sets[1].reps, 8);
  assert.equal(ghost!.sets[2].weight, 82.5);
  assert.equal(ghost!.sets[2].reps, 6);
});

test('getExerciseGhostValues: handles exercise without history and returns null', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-1',
      date: '2026-09-20',
      exercises: [
        {
          name: 'Sentadilla trasera',
          sets: [{ id: 's1', weight: 100, reps: 5 }],
        },
      ],
    },
  ];

  const ghost = getExerciseGhostValues(sessions, 'Press militar');
  assert.equal(ghost, null, 'Must return null for exercise with no history');
});

test('getExerciseGhostValues: ignores future sessions when beforeDate is specified', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-future',
      date: '2026-09-30',
      exercises: [{ name: 'Remo', sets: [{ id: 'f1', weight: 90, reps: 5 }] }],
    },
    {
      id: 'sess-past',
      date: '2026-09-20',
      exercises: [{ name: 'Remo', sets: [{ id: 'p1', weight: 70, reps: 10 }] }],
    },
  ];

  const ghost = getExerciseGhostValues(sessions, 'Remo', undefined, '2026-09-25');
  assert.ok(ghost);
  assert.equal(ghost!.previousSessionId, 'sess-past');
});

// ── 3. Template + Real History ──────────────────────────────────────────────

test('applyHistoryToTemplateExercises: copies historical values when sets count matches', () => {
  const templateExercises: Exercise[] = [
    {
      id: 'tmpl-ex-1',
      name: 'Press banca plano',
      equipment: 'barra',
      barWeight: 20,
      sets: [
        { id: 'ts-1', weight: 60, reps: 10, completed: false },
        { id: 'ts-2', weight: 60, reps: 10, completed: false },
        { id: 'ts-3', weight: 60, reps: 10, completed: false },
      ],
    },
  ];

  const sessions: GymSession[] = [
    {
      id: 'sess-prev',
      date: '2026-09-20',
      exercises: [
        {
          name: 'Press banca plano',
          sets: [
            { id: 's1', weight: 80, reps: 8, completed: true },
            { id: 's2', weight: 80, reps: 8, completed: true },
            { id: 's3', weight: 82.5, reps: 6, completed: true },
          ],
        },
      ],
    },
  ];

  const applied = applyHistoryToTemplateExercises(templateExercises, sessions);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].sets.length, 3);
  assert.equal(applied[0].sets[0].weight, 80);
  assert.equal(applied[0].sets[0].reps, 8);
  assert.equal(applied[0].sets[1].weight, 80);
  assert.equal(applied[0].sets[1].reps, 8);
  assert.equal(applied[0].sets[2].weight, 82.5);
  assert.equal(applied[0].sets[2].reps, 6);
  assert.equal(applied[0].sets[0].completed, false, 'New session sets must start uncompleted');
});

test('applyHistoryToTemplateExercises: template with 4 sets, history with 3 sets -> 3 historical + 1 fallback', () => {
  const templateExercises: Exercise[] = [
    {
      id: 'tmpl-ex-1',
      name: 'Press banca',
      sets: [
        { id: 'ts-1', weight: 50, reps: 10, completed: false },
        { id: 'ts-2', weight: 50, reps: 10, completed: false },
        { id: 'ts-3', weight: 50, reps: 10, completed: false },
        { id: 'ts-4', weight: 50, reps: 10, completed: false },
      ],
    },
  ];

  const sessions: GymSession[] = [
    {
      id: 'sess-prev',
      date: '2026-09-20',
      exercises: [
        {
          id: 'tmpl-ex-1',
          name: 'Press banca',
          sets: [
            { id: 's1', weight: 80, reps: 8 },
            { id: 's2', weight: 80, reps: 8 },
            { id: 's3', weight: 82.5, reps: 6 },
          ],
        },
      ],
    },
  ];

  const applied = applyHistoryToTemplateExercises(templateExercises, sessions);
  assert.equal(applied[0].sets.length, 4, 'Must strictly preserve template 4 sets count');
  assert.equal(applied[0].sets[0].weight, 80);
  assert.equal(applied[0].sets[1].weight, 80);
  assert.equal(applied[0].sets[2].weight, 82.5);
  // Set 4 falls back to last known weight (82.5) or template
  assert.ok(applied[0].sets[3].weight >= 50);
});

test('applyHistoryToTemplateExercises: template with 2 sets, history with 4 sets -> strictly 2 sets', () => {
  const templateExercises: Exercise[] = [
    {
      id: 'tmpl-ex-1',
      name: 'Dominadas',
      sets: [
        { id: 'ts-1', weight: 0, reps: 8, completed: false },
        { id: 'ts-2', weight: 0, reps: 8, completed: false },
      ],
    },
  ];

  const sessions: GymSession[] = [
    {
      id: 'sess-prev',
      date: '2026-09-20',
      exercises: [
        {
          id: 'tmpl-ex-1',
          name: 'Dominadas',
          sets: [
            { id: 's1', weight: 10, reps: 8 },
            { id: 's2', weight: 10, reps: 8 },
            { id: 's3', weight: 10, reps: 7 },
            { id: 's4', weight: 0, reps: 6 },
          ],
        },
      ],
    },
  ];

  const applied = applyHistoryToTemplateExercises(templateExercises, sessions);
  assert.equal(applied[0].sets.length, 2, 'Template set count must NOT be expanded');
  assert.equal(applied[0].sets[0].weight, 10);
  assert.equal(applied[0].sets[1].weight, 10);
});

test('applyHistoryToTemplateExercises: template without history uses template defaults', () => {
  const templateExercises: Exercise[] = [
    {
      id: 'tmpl-ex-1',
      name: 'Ejercicio Nuevo',
      weight: 35,
      sets: [
        { id: 'ts-1', weight: 35, reps: 12, completed: false },
        { id: 'ts-2', weight: 35, reps: 12, completed: false },
      ],
    },
  ];

  const applied = applyHistoryToTemplateExercises(templateExercises, []);
  assert.equal(applied[0].sets.length, 2);
  assert.equal(applied[0].sets[0].weight, 35);
  assert.equal(applied[0].sets[0].reps, 12);
});

// ── 4. Detailed PRs & Session PR Detection ──────────────────────────────────

test('calcDetailedPRs: calculates all 4 dimensions (Weight, Reps, e1RM, Volume)', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-1',
      date: '2026-09-10',
      exercises: [
        {
          name: 'Sentadilla',
          sets: [
            { id: '1', weight: 100, reps: 5 }, // e1rm = 116.7
            { id: '2', weight: 100, reps: 5 },
            { id: '3', weight: 90, reps: 8 },  // e1rm = 114
          ], // vol = 500 + 500 + 720 = 1720
        },
      ],
    },
    {
      id: 'sess-2',
      date: '2026-09-17',
      exercises: [
        {
          name: 'Sentadilla',
          sets: [
            { id: '4', weight: 110, reps: 3 }, // max weight = 110, e1rm = 121
            { id: '5', weight: 70, reps: 12 }, // max reps = 12
          ], // vol = 330 + 840 = 1170
        },
      ],
    },
  ];

  const prs = calcDetailedPRs(sessions);
  const sentadilla = prs['sentadilla'];

  assert.ok(sentadilla);
  assert.equal(sentadilla.maxWeight?.value, 110);
  assert.equal(sentadilla.maxReps?.value, 12);
  assert.equal(sentadilla.maxReps?.weight, 70);
  assert.equal(sentadilla.maxE1RM?.value, 121);
  assert.equal(sentadilla.maxVolume?.value, 1720);
});

test('detectSessionPRs: detects genuine improvements and ignores ties (tie is NOT a PR)', () => {
  const historicalSessions: GymSession[] = [
    {
      id: 'sess-hist',
      date: '2026-09-15',
      exercises: [
        {
          name: 'Press banca',
          sets: [
            { id: 'h1', weight: 80, reps: 8 }, // maxWeight 80, maxReps 8, e1rm 101.3, vol 1280
            { id: 'h2', weight: 80, reps: 8 },
          ],
        },
      ],
    },
  ];

  const historicalPRs = calcDetailedPRs(historicalSessions);

  // Case A: Exact tie -> 0 new PRs
  const tieSession: GymSession = {
    id: 'sess-tie',
    date: '2026-09-22',
    exercises: [
      {
        name: 'Press banca',
        sets: [{ id: 't1', weight: 80, reps: 8 }],
      },
    ],
  };
  const tiePRs = detectSessionPRs(tieSession, historicalPRs);
  assert.equal(tiePRs.length, 0, 'Tie must NOT be declared as a new PR');

  // Case B: Improved weight (82.5 > 80) -> new PR
  const improvedSession: GymSession = {
    id: 'sess-new',
    date: '2026-09-25',
    exercises: [
      {
        name: 'Press banca',
        sets: [{ id: 'n1', weight: 82.5, reps: 8 }], // breaks weight and e1rm
      },
    ],
  };
  const newPRs = detectSessionPRs(improvedSession, historicalPRs);
  assert.ok(newPRs.length > 0, 'Must detect new PR when strictly improved');
  assert.ok(newPRs.some((p) => p.type === 'maxWeight' && p.value === 82.5));
  assert.ok(newPRs.some((p) => p.type === 'maxE1RM'));
});

// ── 5. Individual Exercise History ──────────────────────────────────────────

test('getExerciseHistory: extracts chronological sessions and limits recent to 5', () => {
  const sessions: GymSession[] = [];
  for (let i = 1; i <= 8; i++) {
    sessions.push({
      id: `sess-${i}`,
      date: `2026-09-0${i}`,
      exercises: [
        {
          name: 'Press militar',
          sets: [{ id: `s-${i}`, weight: 40 + i, reps: 8, completed: true }],
        },
      ],
    });
  }

  const history = getExerciseHistory(sessions, 'Press militar');
  assert.equal(history.sessions.length, 8, 'All matching sessions should be parsed');
  assert.equal(history.recent5.length, 5, 'recent5 must contain at most 5 items');
  // First item in recent5 should be the most recent session
  assert.equal(history.recent5[0].sessionId, 'sess-8');
  assert.equal(history.chartPoints.length, 8);
  // Chart points must be chronological (oldest to newest)
  assert.equal(history.chartPoints[0].sessionId, 'sess-1');
  assert.equal(history.chartPoints[0].date, '2026-09-01');
  assert.equal(history.chartPoints[7].date, '2026-09-08');
});

// ── 6. Session Duration Calculation ─────────────────────────────────────────

test('calculateSessionDuration: handles HH:MM same day and midnight crossings', () => {
  // Same day: 18:30 to 19:45 -> 75 min (1h 15m)
  assert.deepEqual(calculateSessionDuration('18:30', '19:45'), {
    minutes: 75,
    formatted: '1h 15m',
  });

  // Exactly 60 min -> 1h
  assert.deepEqual(calculateSessionDuration('10:00', '11:00'), {
    minutes: 60,
    formatted: '1h',
  });

  // Less than 60 min
  assert.deepEqual(calculateSessionDuration('09:15', '09:45'), {
    minutes: 30,
    formatted: '30 min',
  });

  // Midnight crossing: 23:45 to 00:30 -> 45 min
  assert.deepEqual(calculateSessionDuration('23:45', '00:30'), {
    minutes: 45,
    formatted: '45 min',
  });

  // Missing values
  assert.deepEqual(calculateSessionDuration(null, null), {
    minutes: 0,
    formatted: '0 min',
  });

  // Cross-format: ISO startedAt with local HH:MM finishedAt
  const isoStart = new Date();
  isoStart.setHours(14, 0, 0, 0);
  assert.deepEqual(calculateSessionDuration(isoStart.toISOString(), '15:15'), {
    minutes: 75,
    formatted: '1h 15m',
  });
});

// ── 7. Exhaustive Audit Edge Cases ──────────────────────────────────────────

test('getExerciseGhostValues: excludes active sessions, future dates, and abandoned 0-kg sets', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-future',
      date: '2099-01-01',
      exercises: [{ name: 'Press banca', sets: [{ id: 'f1', weight: 150, reps: 10, completed: true }] }],
    },
    {
      id: 'sess-active-now',
      date: '2026-09-25',
      status: 'active',
      exercises: [{ name: 'Press banca', sets: [{ id: 'a1', weight: 120, reps: 5, completed: true }] }],
    },
    {
      id: 'sess-abandoned',
      date: '2026-09-24',
      status: 'completed',
      exercises: [{ name: 'Press banca', sets: [{ id: 'ab1', weight: 0, reps: 0, completed: false }] }],
    },
    {
      id: 'sess-real-completed',
      date: '2026-09-20',
      status: 'completed',
      exercises: [{ name: 'Press banca', sets: [{ id: 'r1', weight: 85, reps: 6, completed: true }] }],
    },
  ];

  const ghost = getExerciseGhostValues(sessions, 'Press banca', 'sess-active-now');
  assert.ok(ghost !== null);
  assert.equal(ghost.previousSessionId, 'sess-real-completed');
  assert.equal(ghost.sets[0].weight, 85);
  assert.equal(ghost.sets[0].reps, 6);
});

test('getExerciseGhostValues: handles legacy session with weight/reps but no sets array', () => {
  const sessions: GymSession[] = [
    {
      id: 'sess-legacy',
      date: '2026-07-15',
      status: 'completed',
      exercises: [{ name: 'Sentadilla', weight: 90, reps: '3x8', sets: [] }],
    },
  ];

  const ghost = getExerciseGhostValues(sessions, 'Sentadilla');
  assert.ok(ghost !== null);
  assert.equal(ghost.previousSessionId, 'sess-legacy');
  assert.equal(ghost.sets[0].weight, 90);
  assert.equal(ghost.sets[0].reps, 8);
});

test('detectSessionPRs: does NOT award new PR for uncompleted sets (completed: false)', () => {
  const historicalPRs = calcDetailedPRs([
    {
      id: 'h1',
      date: '2026-09-10',
      exercises: [{ name: 'Peso muerto', sets: [{ id: 's1', weight: 140, reps: 5, completed: true }] }],
    },
  ]);

  const currentSession: GymSession = {
    id: 's-today',
    date: '2026-09-25',
    status: 'completed',
    exercises: [
      {
        name: 'Peso muerto',
        sets: [
          // Set 1 completed: 130kg (below PR)
          { id: 't1', weight: 130, reps: 5, completed: true },
          // Set 2 uncompleted: 160kg (would be PR if completed, but user didn't do it!)
          { id: 't2', weight: 160, reps: 5, completed: false },
        ],
      },
    ],
  };

  const newPRs = detectSessionPRs(currentSession, historicalPRs);
  assert.equal(newPRs.length, 0, 'Uncompleted set must NOT trigger a new PR');
});

test('calcDetailedPRs: processes legacy exercises without sets array', () => {
  const sessions: GymSession[] = [
    {
      id: 'legacy-pr-sess',
      date: '2026-06-01',
      status: 'completed',
      exercises: [{ name: 'Press hombros', weight: 50, reps: '3x10', sets: [] }],
    },
  ];

  const prs = calcDetailedPRs(sessions);
  assert.ok(prs['press hombros']);
  assert.equal(prs['press hombros'].maxWeight?.value, 50);
  assert.equal(prs['press hombros'].maxReps?.value, 10);
});

test('getExerciseHistory: strictly distinguishes similar exercise names without false cross-matching', () => {
  const sessions: GymSession[] = [
    {
      id: 's-flat',
      date: '2026-09-15',
      exercises: [{ name: 'Press banca plano', sets: [{ id: 'p1', weight: 80, reps: 8, completed: true }] }],
    },
    {
      id: 's-incline',
      date: '2026-09-16',
      exercises: [{ name: 'Press banca inclinado', sets: [{ id: 'p2', weight: 60, reps: 10, completed: true }] }],
    },
    {
      id: 's-military',
      date: '2026-09-17',
      exercises: [{ name: 'Press militar con barra', sets: [{ id: 'p3', weight: 45, reps: 8, completed: true }] }],
    },
  ];

  const flatHistory = getExerciseHistory(sessions, 'Press banca plano');
  assert.equal(flatHistory.sessions.length, 1);
  assert.equal(flatHistory.sessions[0].sessionId, 's-flat');
  assert.equal(flatHistory.prs.maxWeight?.value, 80);

  const inclineHistory = getExerciseHistory(sessions, 'Press banca inclinado');
  assert.equal(inclineHistory.sessions.length, 1);
  assert.equal(inclineHistory.sessions[0].sessionId, 's-incline');
  assert.equal(inclineHistory.prs.maxWeight?.value, 60);
});

test('getExerciseHistory: handles zero sessions and single session gracefully without errors', () => {
  const emptyHistory = getExerciseHistory([], 'Dominadas');
  assert.equal(emptyHistory.sessions.length, 0);
  assert.equal(emptyHistory.recent5.length, 0);
  assert.equal(emptyHistory.chartPoints.length, 0);

  const singleSession: GymSession[] = [
    {
      id: 's-single',
      date: '2026-09-20',
      exercises: [{ name: 'Dominadas', sets: [{ id: 'd1', weight: 0, reps: 12, completed: true }] }],
    },
  ];
  const singleHistory = getExerciseHistory(singleSession, 'Dominadas');
  assert.equal(singleHistory.sessions.length, 1);
  assert.equal(singleHistory.chartPoints.length, 1);
});

test('frecuencia 7/30 días usa sólo sesiones completadas con trabajo real y períodos comparables', () => {
  const completed = (id: string, date: string, completedSet = true): GymSession => ({
    id,
    date,
    status: 'completed',
    exercises: [{
      id: 'press',
      name: 'Press banca',
      sets: [{ id: `${id}-set`, weight: 80, reps: 8, completed: completedSet }],
    }],
  });
  const sessions = [
    completed('today', '2026-10-08'),
    completed('six-days', '2026-10-02'),
    completed('eight-days', '2026-09-30'),
    completed('previous-30', '2026-09-08'),
    { ...completed('active', '2026-10-08'), status: 'active' as const },
    completed('ghost-only', '2026-10-07', false),
  ];

  const result = getGymFrequencyMetrics(sessions, '2026-10-08');
  assert.equal(result.last7Days.workoutCount, 2);
  assert.equal(result.previous7Days.workoutCount, 1);
  assert.equal(result.last30Days.workoutCount, 3);
  assert.equal(result.previous30Days.workoutCount, 1);
  assert.deepEqual(
    [result.last30Days.startDate, result.last30Days.endDate],
    ['2026-09-09', '2026-10-08']
  );
  assert.deepEqual(
    [result.previous30Days.startDate, result.previous30Days.endDate],
    ['2026-08-10', '2026-09-08']
  );
});

test('progreso por ejercicio mantiene IDs homónimos separados y unifica última ejecución y mejor serie', () => {
  const sessions: GymSession[] = [
    {
      id: 'a-old', date: '2026-09-01', status: 'completed',
      exercises: [{ id: 'exercise-a', name: 'Remo', sets: [{ id: 'a1', weight: 80, reps: 8, completed: true }] }],
    },
    {
      id: 'a-new', date: '2026-09-20', status: 'completed',
      exercises: [{ id: 'exercise-a', name: 'Remo', sets: [
        { id: 'a2', weight: 85, reps: 6, completed: true },
        { id: 'a-ghost', weight: 120, reps: 3, completed: false },
      ] }],
    },
    {
      id: 'b-new', date: '2026-09-25', status: 'completed',
      exercises: [{ id: 'exercise-b', name: 'Remo', sets: [{ id: 'b1', weight: 100, reps: 5, completed: true }] }],
    },
    {
      id: 'a-active', date: '2026-10-01', status: 'active',
      exercises: [{ id: 'exercise-a', name: 'Remo', sets: [{ id: 'a3', weight: 130, reps: 2, completed: true }] }],
    },
  ];

  const result = getGymProgressMetrics(sessions, '2026-10-08');
  assert.equal(result.exercises.length, 2);
  const exerciseA = result.exercises.find((exercise) => exercise.exerciseId === 'exercise-a');
  const exerciseB = result.exercises.find((exercise) => exercise.exerciseId === 'exercise-b');
  assert.ok(exerciseA);
  assert.ok(exerciseB);
  assert.equal(exerciseA.lastExecution?.sessionId, 'a-new');
  assert.equal(exerciseA.bestSet?.weight, 85);
  assert.equal(exerciseA.state, 'improved');
  assert.equal(exerciseB.bestSet?.weight, 100);
  assert.equal(exerciseB.state, 'insufficient_data');
});

test('fallback legacy por nombre compara ventanas y deriva stable sin inferir estancamiento', () => {
  const sessions: GymSession[] = [
    {
      id: 'legacy-previous', date: '2026-09-01',
      exercises: [{ name: 'Curl Bíceps', sets: [{ id: 'l1', weight: 20, reps: 10 }] }],
    },
    {
      id: 'legacy-recent', date: '2026-09-20',
      exercises: [{ name: ' curl biceps ', sets: [{ id: 'l2', weight: 20, reps: 10 }] }],
    },
  ];

  const result = getExerciseProgressMetrics(sessions, 'CURL BÍCEPS', '2026-10-08');
  assert.equal(result.lastExecution?.sessionId, 'legacy-recent');
  assert.equal(result.recentVolume, 200);
  assert.equal(result.previousVolume, 200);
  assert.equal(result.state, 'stable');
});

test('comparación reciente queda insufficient_data si falta cualquiera de los dos períodos', () => {
  const sessions: GymSession[] = [{
    id: 'only-recent', date: '2026-10-01', status: 'completed',
    exercises: [{ id: 'squat', name: 'Sentadilla', sets: [{ id: 's1', weight: 100, reps: 5, completed: true }] }],
  }];
  const result = getExerciseProgressMetrics(
    sessions,
    { exerciseId: 'squat', exerciseName: 'Sentadilla' },
    '2026-10-08'
  );
  assert.equal(result.state, 'insufficient_data');
  assert.equal(result.previousSessionCount, 0);
});
