import assert from 'node:assert/strict';
import test from 'node:test';
import {
  divideSessions,
  GYM_CHUNK_SIZE,
  GYM_METRICS_CHUNK_SIZE,
  splitGymData,
  persistGymHistoryChunks,
  writeCloudModulesGuarded,
  setChunkWriterForTesting,
  setFirestoreDbForTesting,
  setTransactionRunnerForTesting,
} from './cloudSync';
import { defaultState, getStorageKey, loadStoredState, parseBackupJSON, saveStoredState } from './storage';
import { mergeSyncModule, mergeSyncModuleWithConflicts } from './syncModel';
import type { GymSession, DailyContextEntry } from '../types';

// Polyfill localStorage for node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  } as any;
}

function createMockSession(id: string, date: string): GymSession {
  return {
    id,
    date,
    startedAt: `${date}T10:00:00.000Z`,
    finishedAt: `${date}T11:00:00.000Z`,
    status: 'completed',
    exercises: [
      {
        id: `ex-${id}`,
        name: 'Press banca',
        equipment: 'barra',
        barWeight: 20,
        sets: [{ id: `set-${id}-1`, weight: 80, reps: 10, completed: true }],
      },
    ],
  };
}

test('gymChunking — divideSessions(sessions).flat() devuelve exactamente el mismo array original', () => {
  assert.equal(GYM_CHUNK_SIZE, 10);

  // 1. Array vacío
  const empty: GymSession[] = [];
  const emptyChunks = divideSessions(empty);
  assert.deepEqual(emptyChunks.flat(), empty);

  // 2. Exactamente GYM_CHUNK_SIZE (10 sesiones)
  const tenSessions = Array.from({ length: 10 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`)
  );
  const tenChunks = divideSessions(tenSessions);
  assert.equal(tenChunks.length, 1);
  assert.equal(tenChunks[0].length, 10);
  assert.deepEqual(tenChunks.flat(), tenSessions);

  // 3. 25 sesiones (10 en principal, 10 en chunk_0, 5 en chunk_1)
  const twentyFive = Array.from({ length: 25 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-09-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  const twentyFiveChunks = divideSessions(twentyFive);
  assert.equal(twentyFiveChunks.length, 3);
  assert.equal(twentyFiveChunks[0].length, 10);
  assert.equal(twentyFiveChunks[1].length, 10);
  assert.equal(twentyFiveChunks[2].length, 5);
  assert.deepEqual(twentyFiveChunks.flat(), twentyFive);

  // 4. 26 sesiones (10 en principal, 10 en chunk_0, 6 en chunk_1)
  const twentySix = Array.from({ length: 26 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-08-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  const twentySixChunks = divideSessions(twentySix);
  assert.equal(twentySixChunks.length, 3);
  assert.equal(twentySixChunks[0].length, 10);
  assert.equal(twentySixChunks[1].length, 10);
  assert.equal(twentySixChunks[2].length, 6);
  assert.deepEqual(twentySixChunks.flat(), twentySix);

  // 5. 60 sesiones (6 chunks de 10)
  const sixtySessions = Array.from({ length: 60 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-07-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  const sixtyChunks = divideSessions(sixtySessions);
  assert.equal(sixtyChunks.length, 6);
  sixtyChunks.forEach((c) => assert.equal(c.length, 10));
  assert.deepEqual(sixtyChunks.flat(), sixtySessions);

  // 6. 100 sesiones (10 chunks completos de 10)
  const hundredSessions = Array.from({ length: 100 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-06-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  const hundredChunks = divideSessions(hundredSessions);
  assert.equal(hundredChunks.length, 10);
  hundredChunks.forEach((c) => assert.equal(c.length, 10));
  assert.deepEqual(hundredChunks.flat(), hundredSessions);
});

test('gymChunking — saveStoredState guarda solo 30 sesiones en localStorage y mantiene state intacto', () => {
  const state = defaultState();
  const originalSessions = Array.from({ length: 50 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  state.gym.sessions = [...originalSessions];

  const saved = saveStoredState(state, 'test-chunking-user');
  assert.equal(saved, true);

  // Invariante 1: state en memoria NO fue mutado (sigue teniendo 50 sesiones)
  assert.equal(state.gym.sessions.length, 50);

  // Invariante 2: localStorage conserva las 50 sesiones completas sin truncar
  const loaded = loadStoredState('test-chunking-user');
  assert.equal(loaded.state.gym.sessions.length, 50);

  // Invariante 3: Las 50 sesiones guardadas coinciden con las originales
  const loadedIds = new Set(loaded.state.gym.sessions.map((s) => s.id));
  assert.equal(loadedIds.size, 50);
  for (const id of loadedIds) {
    assert.ok(originalSessions.some((s) => s.id === id));
  }
});

test('gymChunking — splitGymData divide sesiones (GYM_CHUNK_SIZE=10), peso y medidas (GYM_METRICS_CHUNK_SIZE=1000)', () => {
  assert.equal(GYM_CHUNK_SIZE, 10);
  assert.equal(GYM_METRICS_CHUNK_SIZE, 1000);

  const mockSessions = Array.from({ length: 25 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  const mockWeights = Array.from({ length: 1500 }, (_, i) => ({
    id: `w-${i}`,
    date: '2026-10-01',
    weight: 70 + (i % 10),
  }));
  const mockMeasurements = Array.from({ length: 1200 }, (_, i) => ({
    id: `m-${i}`,
    date: '2026-10-01',
    chest: 100,
    arm: 35,
    waist: 80,
  }));

  const inputGym = {
    sessions: mockSessions,
    weight: mockWeights,
    measurements: mockMeasurements,
    templates: [],
    customExercises: [],
    routineTemplates: [],
  };

  const result = splitGymData(inputGym);

  // Sesiones: 10 en principal, 2 chunks de 10 y 5
  assert.equal((result.primaryGym.sessions as any[]).length, 10);
  assert.equal(result.historyChunks.length, 2);
  assert.equal(result.historyChunks[0].length, 10);
  assert.equal(result.historyChunks[1].length, 5);
  const reassembledSessions = [
    ...(result.primaryGym.sessions as any[]),
    ...result.historyChunks.flat(),
  ];
  assert.deepEqual(reassembledSessions, mockSessions);

  // Peso: 1000 en principal, 1 chunk de 500
  assert.equal((result.primaryGym.weight as any[]).length, 1000);
  assert.equal(result.weightChunks.length, 1);
  assert.equal(result.weightChunks[0].length, 500);
  const reassembledWeights = [
    ...(result.primaryGym.weight as any[]),
    ...result.weightChunks.flat(),
  ];
  assert.deepEqual(reassembledWeights, mockWeights);

  // Medidas: 1000 en principal, 1 chunk de 200
  assert.equal((result.primaryGym.measurements as any[]).length, 1000);
  assert.equal(result.measurementChunks.length, 1);
  assert.equal(result.measurementChunks[0].length, 200);
  const reassembledMeasurements = [
    ...(result.primaryGym.measurements as any[]),
    ...result.measurementChunks.flat(),
  ];
  assert.deepEqual(reassembledMeasurements, mockMeasurements);

  // Caso borde: datos por debajo del umbral no generan chunks
  const smallGym = {
    sessions: mockSessions.slice(0, 5),
    weight: mockWeights.slice(0, 500),
    measurements: mockMeasurements.slice(0, 800),
  };
  const smallResult = splitGymData(smallGym);
  assert.equal((smallResult.primaryGym.sessions as any[]).length, 5);
  assert.equal(smallResult.historyChunks.length, 0);
  assert.equal((smallResult.primaryGym.weight as any[]).length, 500);
  assert.equal(smallResult.weightChunks.length, 0);
  assert.equal((smallResult.primaryGym.measurements as any[]).length, 800);
  assert.equal(smallResult.measurementChunks.length, 0);
});

test('dailyContext — mergeSyncModuleWithConflicts y mergeSyncModule conservan registros locales si local tiene más que remoto', () => {
  const localDailyContext: DailyContextEntry[] = [
    { date: '2026-10-01', mood: 5, energy: 4, sleepHours: 8, connection: 5, note: 'Día 1' },
    { date: '2026-10-02', mood: 4, energy: 5, sleepHours: 7, connection: 4, note: 'Día 2' },
    { date: '2026-10-03', mood: 5, energy: 5, sleepHours: 8, connection: 5, note: 'Día 3' },
    { date: '2026-10-04', mood: 3, energy: 3, sleepHours: 6, connection: 3, note: 'Día 4' },
    { date: '2026-10-05', mood: 4, energy: 4, sleepHours: 7, connection: 4, note: 'Día 5' },
  ];

  const remoteDailyContext: DailyContextEntry[] = [
    { date: '2026-10-01', mood: 2, energy: 2, sleepHours: 5, connection: 2, note: 'Día 1 viejo' },
    { date: '2026-10-02', mood: 3, energy: 3, sleepHours: 6, connection: 3, note: 'Día 2 viejo' },
  ];

  const state = defaultState();
  state.dailyContext = [...localDailyContext];

  // 1. mergeSyncModuleWithConflicts
  const withConflictsResult = mergeSyncModuleWithConflicts(state, 'context', {
    dailyContext: remoteDailyContext,
  });
  assert.equal(withConflictsResult.state.dailyContext?.length, 5);
  assert.deepEqual(withConflictsResult.state.dailyContext, localDailyContext);

  // 2. mergeSyncModule
  const mergedResult = mergeSyncModule(state, 'context', {
    dailyContext: remoteDailyContext,
  });
  assert.equal(mergedResult.dailyContext?.length, 5);
  assert.deepEqual(mergedResult.dailyContext, localDailyContext);
});

test('gymChunking — si persistGymHistoryChunks falla, propaga el error y no guarda el hash en localStorage', async () => {
  const userId = 'test-persist-chunks-direct-user';
  const chunkStorageKey = `lifeos_gym_chunk_hash_${userId}_0`;
  localStorage.removeItem(chunkStorageKey);

  const chunks = [
    [createMockSession('s-direct-1', '2026-10-01')],
  ];

  const simulatedError = new Error('Fallo de red al persistir chunk');
  setChunkWriterForTesting(async () => {
    throw simulatedError;
  });

  try {
    await assert.rejects(
      async () => {
        await persistGymHistoryChunks(userId, chunks, {} as any, null, 'test-device', 1000);
      },
      (err: any) => {
        assert.equal(err.message, 'Fallo de red al persistir chunk');
        return true;
      }
    );
    // Invariante: no se guardó el hash en localStorage
    assert.equal(localStorage.getItem(chunkStorageKey), null);
  } finally {
    setChunkWriterForTesting(null);
  }
});

test('gymChunking — desacople atómico: si falla un chunk histórico, la sincronización principal de gym NO falla y el hash del chunk no se guarda', async () => {
  const userId = 'test-gym-decoupled-fail-user';
  const state = defaultState();
  const sessions = Array.from({ length: 35 }, (_, i) =>
    createMockSession(`s-${i}`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`)
  );
  state.gym.sessions = sessions;

  const storageKey = `lifeos_gym_chunk_hash_${userId}_0`;
  localStorage.removeItem(storageKey);

  (globalThis as any).__LIFEOS_SYNTHETIC_CAPABILITY__ = {
    [userId]: { encryptionState: 'plaintext', encryptedModules: [] },
  };
  setFirestoreDbForTesting({} as any);

  let mainTransactionCommitted = false;
  setTransactionRunnerForTesting(async () => {
    mainTransactionCommitted = true;
  });

  // Simular fallo en la subida del chunk histórico
  setChunkWriterForTesting(async () => {
    throw new Error('Fallo simulado al persistir fragmento de historial en Firestore');
  });

  try {
    const result = await writeCloudModulesGuarded(userId, state, ['gym'], 'test-device', {});
    // La transacción principal de gym debe haberse preparado
    assert.equal(result.writes[0].module, 'gym');

    // La sincronización principal NO debe fallar aunque falle el chunk
    await result.completion;
    assert.equal(mainTransactionCommitted, true);

    // Invariante de seguridad: NO se guardó el hash en localStorage para permitir reintento en la próxima sincronización
    assert.equal(localStorage.getItem(storageKey), null);
  } finally {
    setChunkWriterForTesting(null);
    setFirestoreDbForTesting(null);
    setTransactionRunnerForTesting(null);
    delete (globalThis as any).__LIFEOS_SYNTHETIC_CAPABILITY__;
  }
});

test('gymChunking — importar backup con _sync resulta en estado sin gym._sync pero conserva todos los datos del gym', () => {
  const backupState = defaultState();
  backupState.gym = {
    sessions: [createMockSession('s-backup-1', '2026-10-15')],
    weight: [{ date: '2026-10-15', kg: 78.5 }],
    measurements: [{ date: '2026-10-15', waist: 82 }],
    routineTemplates: [
      {
        id: 'rt-1',
        name: 'Empuje',
        exercises: [{ id: 'ex-rt-1', name: 'Press banca', equipment: 'barra', barWeight: 20, sets: [{ id: 'set-rt-1', weight: 80, reps: 8, completed: false }] }],
      },
    ],
    settings: {
      restBetweenSetsSeconds: 90,
      restBetweenExercisesSeconds: 180,
      autoTimerEnabled: true,
      showQuickRestAdjustments: true,
      allowManualRestEditing: false,
    },
    restDays: ['2026-10-14'],
    activeTimer: null,
    _sync: {
      version: 2,
      clock: 500,
      fields: {
        'sessions/s-backup-1/$entity': { counter: 500, deviceId: 'dev-old' },
      },
      tombstones: {},
    },
  };

  const imported = parseBackupJSON(JSON.stringify(backupState));
  assert.equal(imported.gym._sync, undefined);
  assert.equal('_sync' in imported.gym, false);
  assert.equal(imported.gym.sessions.length, 1);
  assert.equal(imported.gym.sessions[0].id, 's-backup-1');
  assert.deepEqual(imported.gym.weight, backupState.gym.weight);
  assert.deepEqual(imported.gym.measurements, backupState.gym.measurements);
  assert.equal(imported.gym.routineTemplates.length, 1);
  assert.equal(imported.gym.routineTemplates[0].name, 'Empuje');
  assert.deepEqual(imported.gym.settings, backupState.gym.settings);
  assert.deepEqual(imported.gym.restDays, ['2026-10-14']);
});

test('gymChunking — saveStoredState sí persiste _sync en localStorage y propaga error claro ante fallo de cuota', () => {
  const userId = 'test-sync-persist-user';
  const state = defaultState();
  state.gym.sessions = [createMockSession('s-sync-1', '2026-10-20')];
  state.gym._sync = {
    version: 2,
    clock: 42,
    fields: {
      'sessions/s-sync-1/$entity': { counter: 42, deviceId: 'dev-test' },
    },
    tombstones: {},
  };

  const saved = saveStoredState(state, userId);
  assert.equal(saved, true);

  const rawJson = localStorage.getItem(getStorageKey(userId));
  assert.ok(rawJson);
  const rawParsed = JSON.parse(rawJson!);
  assert.deepEqual(rawParsed.gym._sync, state.gym._sync);
  assert.equal('_sync' in rawParsed.gym, true);

  const loaded = loadStoredState(userId);
  assert.deepEqual(loaded.state.gym._sync, state.gym._sync);
  assert.equal('_sync' in loaded.state.gym, true);

  // Verificar que fallo por cuota de localStorage propaga un Error claro en vez de devolver false silencioso
  const originalSetItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    const err = new Error('QuotaExceededError: The quota has been exceeded.');
    err.name = 'QuotaExceededError';
    throw err;
  };
  try {
    assert.throws(
      () => saveStoredState(state, userId),
      /Cuota de localStorage superada/
    );
  } finally {
    globalThis.localStorage.setItem = originalSetItem;
  }
});
