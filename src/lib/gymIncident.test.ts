import assert from 'node:assert/strict';
import test from 'node:test';
import type { GymSession, LifeOSState } from '../types';
import { decodeCloudModuleData, encodeCloudModuleData, generateMdek } from './cryptoCore';
import { classifyTransactionalRevisions, loadSyncRecoverySnapshot, saveSyncRecoverySnapshot } from './cloudSync';
import { buildGymHistory } from './gymHistory';
import { addExerciseToGymSession, finishGymSession, startGymSession, updateGymSessionSet } from './gymFlows';
import { getPerformedGymVolume } from './gymMetrics';
import { migrateGym } from './gymMigration';
import { stampGymMutation } from './gymSync';
import { detectGymSessionConflicts } from './syncMerge';
import { applySyncModule, mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { defaultState, loadStoredState, saveStoredState } from './storage';

function session(id: string): GymSession {
  return {
    id, date: '2026-10-20', status: 'completed', startedAt: '08:00', finishedAt: '09:10',
    exercises: ['Press banca', 'Remo', 'Sentadilla', 'Curl'].map((name, exerciseIndex) => ({
      id: `${id}-exercise-${exerciseIndex}`, name,
      sets: [0, 1, 2].map((setIndex) => ({
        id: `${id}-set-${exerciseIndex}-${setIndex}`,
        weight: 40 + exerciseIndex * 10 + setIndex * 2.5,
        reps: 12 - setIndex - exerciseIndex,
        completed: true,
        completedAt: `08:${String(exerciseIndex * 12 + setIndex * 3).padStart(2, '0')}`,
      })),
    })),
  };
}

function stateWith(...sessions: GymSession[]): LifeOSState {
  const state = defaultState();
  state.gym.sessions = structuredClone(sessions);
  return state;
}

function edit(source: LifeOSState, device: string, change: (state: LifeOSState) => void): LifeOSState {
  const next = structuredClone(source);
  change(next);
  stampGymMutation(source.gym, next.gym, device);
  return next;
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, value); },
  };
}

test('A: phone confirmation arrives complete on PC, including history and volume', () => {
  let phone = edit(defaultState(), 'phone', (draft) => {
    startGymSession(draft.gym, { sessionId: 'phone-workout', date: '2026-10-20', startedAt: '08:00' });
  });
  ['Press banca', 'Remo', 'Sentadilla', 'Curl'].forEach((name, exerciseIndex) => {
    phone = edit(phone, 'phone', (draft) => {
      assert.equal(addExerciseToGymSession(draft.gym, 'phone-workout', { name }), true);
    });
    for (let setIndex = 0; setIndex < 3; setIndex++) {
      phone = edit(phone, 'phone', (draft) => {
        const exerciseId = draft.gym.sessions[0].exercises[exerciseIndex].id;
        assert.equal(updateGymSessionSet(draft.gym, 'phone-workout', exerciseId!, setIndex, {
          weight: 40 + exerciseIndex * 10 + setIndex * 2.5,
          reps: 12 - setIndex - exerciseIndex,
          completed: true,
        }, `08:${String(exerciseIndex * 12 + setIndex * 3).padStart(2, '0')}`).updated, true);
      });
    }
  });
  phone = edit(phone, 'phone', (draft) => {
    assert.equal(finishGymSession(draft.gym, 'phone-workout', { finishedAt: '09:10' }).status, 'completed');
  });
  const pc = applySyncModule(defaultState(), 'gym', syncModuleData(phone, 'gym'));
  assert.deepEqual(pc.gym.sessions, migrateGym(phone.gym).sessions);
  assert.equal(pc.gym.sessions[0].exercises.length, 4);
  assert.equal(pc.gym.sessions[0].exercises.every((exercise) => exercise.sets.length === 3), true);
  assert.equal(buildGymHistory(pc.gym.sessions, '2026-10-23').recentWeeks[0].sessions.length, 1);
  assert.equal(getPerformedGymVolume(pc.gym.sessions[0]), getPerformedGymVolume(phone.gym.sessions[0]));
});

test('B and F: stale PC reconstruction keeps the phone session, its sets, and the separate manual entry', () => {
  const base = defaultState();
  const phone = edit(base, 'phone', (draft) => { draft.gym.sessions.push(session('phone-workout')); });
  const pc = edit(base, 'pc', (draft) => { draft.gym.sessions.push(session('manual-reconstruction')); });
  const first = mergeSyncModuleWithConflicts(pc, 'gym', syncModuleData(phone, 'gym'), syncModuleData(base, 'gym'));
  assert.equal(first.conflicts.length, 0);
  assert.deepEqual(first.state.gym.sessions.map((item) => item.id).sort(), ['manual-reconstruction', 'phone-workout']);
  assert.deepEqual(first.state.gym.sessions.find((item) => item.id === 'phone-workout')?.exercises,
    migrateGym(phone.gym).sessions[0].exercises);
  const retry = mergeSyncModuleWithConflicts(first.state, 'gym', syncModuleData(phone, 'gym'), syncModuleData(base, 'gym'));
  assert.equal(retry.state.gym.sessions.length, 2);
  assert.equal(buildGymHistory(retry.state.gym.sessions, '2026-10-23').recentWeeks[0].sessions.length, 2);
});

test('C: incompatible edits to one session stay separate and enter recovery', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const base = stateWith(session('shared'));
    const phone = edit(base, 'phone', (draft) => { draft.gym.sessions[0].exercises[0].sets[0].weight = 92.5; });
    const pc = edit(base, 'pc', (draft) => { draft.gym.sessions[0].exercises[0].sets[0].reps = 6; });
    const result = mergeSyncModuleWithConflicts(phone, 'gym', syncModuleData(pc, 'gym'), syncModuleData(base, 'gym'));
    assert.equal(result.conflicts.length, 1);
    assert.deepEqual(result.state.gym.sessions, phone.gym.sessions);
    assert.equal(saveSyncRecoverySnapshot('gym-test', 'local', phone), true);
    assert.equal(saveSyncRecoverySnapshot('gym-test', 'remote', pc), true);
    assert.equal(loadSyncRecoverySnapshot('gym-test', 'local')?.gym.sessions[0].exercises[0].sets[0].weight, 92.5);
    assert.equal(loadSyncRecoverySnapshot('gym-test', 'remote')?.gym.sessions[0].exercises[0].sets[0].reps, 6);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('D: disconnected local workout survives reload and reconnect reconciliation', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const base = defaultState();
    const phone = edit(base, 'phone', (draft) => { draft.gym.sessions.push(session('offline-workout')); });
    assert.equal(saveStoredState(phone, 'gym-offline'), true);
    const reloaded = loadStoredState('gym-offline').state;
    const remote = edit(base, 'pc', (draft) => { draft.gym.weight.push({ date: '2026-10-21', kg: 80 }); });
    const merged = mergeSyncModuleWithConflicts(reloaded, 'gym', syncModuleData(remote, 'gym'), syncModuleData(base, 'gym'));
    assert.equal(merged.conflicts.length, 0);
    assert.deepEqual(merged.state.gym.sessions, reloaded.gym.sessions);
    assert.equal(merged.state.gym.weight.length, 1);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('E: legacy workouts and plaintext/encrypted module payloads retain stable sessions', async () => {
  const legacy = migrateGym({ sessions: [{ date: '2026-10-20', exercises: [{ name: 'Press banca', weight: 60, reps: '3x10' }] }] });
  const state = defaultState();
  state.gym = legacy;
  const data = syncModuleData(state, 'gym');
  const plain = await encodeCloudModuleData(data, 'gym', 'gym-test', null);
  assert.equal(plain.isEncrypted, false);
  const decodedPlain = await decodeCloudModuleData(plain.data, 'gym', 'gym-test', null);
  assert.equal(decodedPlain.mode, 'plaintext');
  if (decodedPlain.mode !== 'plaintext') throw new Error('Plaintext decode failed');
  assert.deepEqual(decodedPlain.data, data);
  const key = await generateMdek();
  const encrypted = await encodeCloudModuleData(data, 'gym', 'gym-test', key);
  assert.equal(encrypted.isEncrypted, true);
  const decoded = await decodeCloudModuleData(encrypted.data, 'gym', 'gym-test', key);
  assert.equal(decoded.mode, 'decrypted');
  const hydrated = applySyncModule(defaultState(), 'gym', decoded.data);
  assert.equal(hydrated.gym.sessions[0].id, 'session-0');
  assert.equal(hydrated.gym.sessions[0].exercises[0].sets.length, 3);
});

test('transactional revision check rejects a stale client at commit time', () => {
  const check = classifyTransactionalRevisions(
    [{ module: 'gym', revision: 'old-revision' }],
    [{ revision: 'phone-revision', protocol: 2 }],
  );
  assert.deepEqual(check.diverged, ['gym']);
  assert.deepEqual(classifyTransactionalRevisions(
    [{ module: 'gym', revision: null }], [{ revision: 'phone-revision', protocol: 2 }],
  ).diverged, ['gym']);
});

test('a remote replacement cannot remove a confirmed local workout without an explicit conflict', () => {
  const local = stateWith(session('confirmed'));
  const staleRemote = defaultState();
  assert.equal(detectGymSessionConflicts(local.gym, staleRemote.gym, local.gym, true).length, 1);
  const incomplete = stateWith({ ...session('confirmed'), exercises: session('confirmed').exercises.slice(0, 2) });
  assert.equal(detectGymSessionConflicts(local.gym, incomplete.gym, local.gym, true).length, 1);
  const changedWeights = stateWith(session('confirmed'));
  changedWeights.gym.sessions[0].exercises[0].sets[0].weight = 0;
  assert.equal(detectGymSessionConflicts(local.gym, changedWeights.gym, local.gym).length, 1);
});

test('two new sessions with a legacy ID collision require review instead of merging their sets', () => {
  const phone = stateWith(session('session-0'));
  const pc = stateWith({ ...session('session-0'), date: '2026-10-21' });
  const result = mergeSyncModuleWithConflicts(phone, 'gym', syncModuleData(pc, 'gym'));
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.state.gym.sessions, phone.gym.sessions);
});

test('recovery snapshot failure is visible to callers', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
  try {
    assert.equal(saveSyncRecoverySnapshot('gym-test', 'local', stateWith(session('confirmed'))), false);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
