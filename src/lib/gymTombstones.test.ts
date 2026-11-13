import assert from 'node:assert/strict';
import test from 'node:test';
import type { Gym, GymSession } from '../types';
import { addSetToGymSession, deleteGymSession } from './gymFlows';
import { gymSyncPath } from './gymSync';
import { detectGymSessionConflicts, loadTombstones, mergeGymModule } from './syncMerge';
import { defaultState } from './storage';

function makeSession(id: string, date = '2026-10-20'): GymSession {
  return {
    id,
    date,
    status: 'completed',
    startedAt: '18:00',
    finishedAt: '19:00',
    exercises: [
      {
        id: `${id}-ex-1`,
        name: 'Press banca',
        equipment: 'barra',
        barWeight: 20,
        weight: 60,
        sets: [
          {
            id: `${id}-set-1`,
            weight: 60,
            reps: 10,
            completed: true,
            completedAt: '18:15',
          },
        ],
      },
    ],
  };
}

function makeGymWithSessions(...sessions: GymSession[]): Gym {
  const gym = structuredClone(defaultState().gym);
  gym.sessions = structuredClone(sessions);
  return gym;
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

test('eliminar sesión con tombstone no genera conflicto al sincronizar', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const s1 = makeSession('session-1', '2026-10-20');
    const s2 = makeSession('session-2', '2026-10-21');

    const localGym = makeGymWithSessions(s1, s2);
    const remoteGym = makeGymWithSessions(s1, s2);
    const baselineGym = makeGymWithSessions(s1, s2);

    const removed = deleteGymSession(localGym, 'session-1', 'test-user');
    assert.equal(removed, true);
    assert.equal(localGym.sessions.length, 1);

    const tombstones = loadTombstones('test-user');
    const expectedPath = 'gym/' + gymSyncPath.session('session-1');
    assert.ok(tombstones[expectedPath] > 0, 'Debe existir tombstone con path gym/<sessionPath>');

    const conflictsLocal = detectGymSessionConflicts(localGym, remoteGym, baselineGym, tombstones);
    assert.deepEqual(conflictsLocal, []);

    const conflictsRemote = detectGymSessionConflicts(remoteGym, localGym, baselineGym, tombstones);
    assert.deepEqual(conflictsRemote, []);

    const merged = mergeGymModule(localGym, remoteGym, baselineGym, tombstones);
    assert.deepEqual(
      merged.sessions.map((s) => s.id),
      ['session-2']
    );
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('modificar en A y borrar en B sin tombstone genera conflicto delete_vs_modify', () => {
  const s1 = makeSession('session-1', '2026-10-20');

  const baselineGym = makeGymWithSessions(s1);
  const localGym = makeGymWithSessions(s1);
  const remoteGym = makeGymWithSessions(); // sesión #1 ausente (borrada sin tombstone)

  const addedSet = addSetToGymSession(localGym, 'session-1', 'session-1-ex-1');
  assert.ok(addedSet);

  const conflicts = detectGymSessionConflicts(localGym, remoteGym, baselineGym);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].entityType, 'delete_vs_modify');
  assert.equal(conflicts[0].entityId, 'session-1');
});

test('sesión ausente sin evidencia se conserva', () => {
  const s1 = makeSession('session-1', '2026-10-20');

  const localGym = makeGymWithSessions(s1);
  const remoteGym = makeGymWithSessions();
  const baselineGym = makeGymWithSessions();

  const conflicts = detectGymSessionConflicts(localGym, remoteGym, baselineGym);
  assert.deepEqual(conflicts, []);

  const merged = mergeGymModule(localGym, remoteGym, baselineGym);
  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0].id, 'session-1');
});
