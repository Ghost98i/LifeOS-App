import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, Gym } from '../types';
import { migrateGym } from './gymMigration';
import { gymSyncPath, stampGymMutation } from './gymSync';
import { detectDeletedEntityIds, mergeGymModule } from './syncMerge';
import { defaultState } from './storage';
import { applySyncModule, mergeSyncModule, syncModuleData } from './syncModel';

function baseGym(): Gym {
  return migrateGym({
    weight: [{ date: '2026-10-01', kg: 80 }],
    measurements: [{ date: '2026-10-01', waist: 90 }],
    restDays: ['2026-10-02'],
    activeTimer: null,
    sessions: [{
      id: 'session-1',
      date: '2026-10-01',
      weekLabel: 'Base',
      status: 'active',
      startedAt: '08:00',
      finishedAt: null,
      exercises: [{
        id: 'exercise-1',
        name: 'Press banca',
        equipment: 'barra',
        weight: 80,
        barWeight: 20,
        muscleGroup: 'Pecho',
        restSeconds: 90,
        timerEnabled: true,
        sets: [{ id: 'set-1', weight: 80, reps: 8, completed: false, completedAt: null }],
      }],
    }, {
      id: 'session-2',
      date: '2026-09-30',
      status: 'active',
      startedAt: '08:00',
      finishedAt: null,
      exercises: [{
        id: 'exercise-2',
        name: 'Remo',
        sets: [{ id: 'set-1', weight: 60, reps: 10, completed: false, completedAt: null }],
      }],
    }],
    routineTemplates: [{
      id: 'template-1',
      name: 'Push',
      days: ['lunes'],
      exercises: [{
        id: 'template-exercise-1',
        name: 'Press banca',
        sets: [{ id: 'template-set-1', weight: 80, reps: 8, completed: false, completedAt: null }],
      }],
    }],
  });
}

function mutate(source: Gym, deviceId: string, mutation: (gym: Gym) => void): Gym {
  const next = structuredClone(source);
  mutation(next);
  const revision = stampGymMutation(source, next, deviceId);
  assert.ok(revision, 'the test mutation must create a revision');
  return next;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function assertSame(actual: unknown, expected: unknown): void {
  assert.deepEqual(canonical(actual), canonical(expected));
}

test('Gym sync is commutative, associative across three devices, and idempotent', () => {
  const base = baseGym();
  const a = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].sets[0].weight = 82.5; });
  const b = mutate(base, 'device-b', (gym) => { gym.sessions[0].exercises[0].sets[0].reps = 10; });
  const c = mutate(base, 'device-c', (gym) => {
    gym.sessions[0].exercises[0].sets.push({ id: 'set-c', weight: 75, reps: 12, completed: false, completedAt: null });
  });

  assertSame(mergeGymModule(a, b, base), mergeGymModule(b, a, base));
  assertSame(
    mergeGymModule(mergeGymModule(a, b, base), c, base),
    mergeGymModule(a, mergeGymModule(b, c, base), base)
  );
  assertSame(mergeGymModule(a, a, base), a);
});

test('Lamport counter remains strictly monotonic after merge, reload and device change', () => {
  const base = baseGym();
  const a = mutate(base, 'device-a', (gym) => { gym.sessions[0].weekLabel = 'A'; });
  const b = mutate(base, 'device-b', (gym) => { gym.sessions[0].date = '2026-10-02'; });
  const merged = mergeGymModule(a, b, base);
  const observedClock = merged._sync?.clock || 0;
  const reloaded = migrateGym(JSON.parse(JSON.stringify(merged)));
  const changedOnNewDevice = structuredClone(reloaded);
  changedOnNewDevice.sessions[0].weekLabel = 'C';
  const revision = stampGymMutation(reloaded, changedOnNewDevice, 'device-c');

  assert.ok(revision);
  assert.equal(revision.counter, observedClock + 1);
  assert.equal(changedOnNewDevice._sync?.clock, revision.counter);
});

test('hierarchical edit/edit preserves independent set fields and deterministically breaks same-field ties', () => {
  const base = baseGym();
  const weightEdit = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].sets[0].weight = 85; });
  const repsEdit = mutate(base, 'device-b', (gym) => { gym.sessions[0].exercises[0].sets[0].reps = 11; });
  const merged = mergeGymModule(weightEdit, repsEdit, base);
  assert.equal(merged.sessions[0].exercises[0].sets[0].weight, 85);
  assert.equal(merged.sessions[0].exercises[0].sets[0].reps, 11);

  const lowTie = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].sets[0].weight = 81; });
  const highTie = mutate(base, 'device-z', (gym) => { gym.sessions[0].exercises[0].sets[0].weight = 99; });
  assert.equal(mergeGymModule(lowTie, highTie, base).sessions[0].exercises[0].sets[0].weight, 99);
  assertSame(mergeGymModule(lowTie, highTie, base), mergeGymModule(highTie, lowTie, base));
});

test('edit/delete, delete/unchanged, delete/delete and old snapshots keep deletions', () => {
  const base = baseGym();
  const edited = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].sets[0].reps = 12; });
  const deleted = mutate(base, 'device-b', (gym) => { gym.sessions[0].exercises[0].sets = []; });
  assert.equal(mergeGymModule(edited, deleted, base).sessions[0].exercises[0].sets.length, 0);
  assert.equal(mergeGymModule(base, deleted, base).sessions[0].exercises[0].sets.length, 0);
  assert.equal(mergeGymModule(deleted, deleted, base).sessions[0].exercises[0].sets.length, 0);
  assert.equal(mergeGymModule(deleted, structuredClone(base), base).sessions[0].exercises[0].sets.length, 0);
});

test('deliberate recreation receives a revision above its tombstone and survives merge', () => {
  const base = baseGym();
  const deleted = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises = []; });
  const convergedDeletion = mergeGymModule(deleted, base, base);
  const path = gymSyncPath.sessionExercise('session-1', 'exercise-1');
  const tombstone = convergedDeletion._sync?.tombstones[path];
  assert.ok(tombstone);

  const recreated = mutate(convergedDeletion, 'device-b', (gym) => {
    gym.sessions[0].exercises.push({
      id: 'exercise-1',
      name: 'Press banca recreado',
      sets: [{ id: 'new-set', weight: 82.5, reps: 8, completed: false }],
    });
  });
  const recreation = recreated._sync?.fields[`${path}/$entity`];
  assert.ok(recreation && recreation.counter > tombstone.counter);
  const merged = mergeGymModule(recreated, convergedDeletion, convergedDeletion);
  assert.equal(merged.sessions[0].exercises[0].id, 'exercise-1');
  assert.equal(merged.sessions[0].exercises[0].name, 'Press banca recreado');
});

test('nested tombstones are scoped by session and cannot delete an equal set id elsewhere', () => {
  const base = baseGym();
  const deleted = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].sets = []; });
  const merged = mergeGymModule(deleted, base, base);
  assert.equal(merged.sessions.find((session) => session.id === 'session-1')?.exercises[0].sets.length, 0);
  assert.equal(merged.sessions.find((session) => session.id === 'session-2')?.exercises[0].sets.length, 1);

  const previousState = defaultState();
  previousState.gym = base;
  const nextState = structuredClone(previousState);
  nextState.gym.sessions[0].exercises[0].sets = [];
  assert.deepEqual(detectDeletedEntityIds(previousState, nextState), [
    'gym/session/session-1/exercise/exercise-1/set/set-1',
  ]);
});

test('concurrent distinct set and exercise additions are retained', () => {
  const base = baseGym();
  const a = mutate(base, 'device-a', (gym) => {
    gym.sessions[0].exercises[0].sets.push({ id: 'set-a', weight: 70, reps: 12, completed: false });
    gym.sessions[0].exercises.push({ id: 'exercise-a', name: 'Fondos', sets: [] });
  });
  const b = mutate(base, 'device-b', (gym) => {
    gym.sessions[0].exercises[0].sets.push({ id: 'set-b', weight: 72.5, reps: 10, completed: false });
    gym.sessions[0].exercises.push({ id: 'exercise-b', name: 'Aperturas', sets: [] });
  });
  const session = mergeGymModule(a, b, base).sessions.find((item) => item.id === 'session-1');
  assert.deepEqual(session?.exercises.map((exercise) => exercise.id).sort(), ['exercise-1', 'exercise-a', 'exercise-b']);
  assert.deepEqual(session?.exercises.find((exercise) => exercise.id === 'exercise-1')?.sets.map((set) => set.id).sort(),
    ['set-1', 'set-a', 'set-b']);
});

test('completed can move both directions and unrelated edits do not undo the explicit intent', () => {
  const incomplete = baseGym();
  const completed = mutate(incomplete, 'device-a', (gym) => {
    Object.assign(gym.sessions[0].exercises[0].sets[0], { completed: true, completedAt: '10:00' });
  });
  assert.equal(mergeGymModule(completed, incomplete, incomplete).sessions[0].exercises[0].sets[0].completed, true);

  const uncompleted = mutate(completed, 'device-z', (gym) => {
    Object.assign(gym.sessions[0].exercises[0].sets[0], { completed: false, completedAt: null });
  });
  const unrelated = mutate(completed, 'device-b', (gym) => { gym.sessions[0].exercises[0].sets[0].weight = 90; });
  const result = mergeGymModule(uncompleted, unrelated, completed).sessions[0].exercises[0].sets[0];
  assert.equal(result.completed, false);
  assert.equal(result.completedAt, null);
  assert.equal(result.weight, 90);
});

test('session completion converges with an offline set addition without inventing work', () => {
  const base = baseGym();
  const training = mutate(base, 'device-a', (gym) => {
    gym.sessions[0].exercises[0].sets.push({ id: 'offline-set', weight: 70, reps: 12, completed: false });
  });
  const finished = mutate(base, 'device-b', (gym) => {
    gym.sessions[0].exercises[0].sets[0].completed = true;
    gym.sessions[0].exercises[0].sets[0].completedAt = '09:00';
    gym.sessions[0].status = 'completed';
    gym.sessions[0].finishedAt = '09:05';
  });
  const result = mergeGymModule(training, finished, base).sessions.find((session) => session.id === 'session-1');
  assert.equal(result?.status, 'completed');
  assert.equal(result?.finishedAt, '09:05');
  assert.deepEqual(result?.exercises[0].sets.map((set) => set.id).sort(), ['offline-set', 'set-1']);
  assert.equal(result?.exercises[0].sets.find((set) => set.id === 'offline-set')?.completed, false);
});

test('templates merge concurrent rename/additions, delete wins over edit, and sessions stay isolated', () => {
  const base = baseGym();
  const historical = structuredClone(base.sessions);
  const renamed = mutate(base, 'device-z', (gym) => {
    gym.routineTemplates[0].name = 'Empuje fuerte';
    gym.routineTemplates[0].exercises.push({ id: 'template-ex-a', name: 'Fondos', sets: [] });
  });
  const added = mutate(base, 'device-a', (gym) => {
    gym.routineTemplates[0].name = 'Push A';
    gym.routineTemplates[0].exercises.push({ id: 'template-ex-b', name: 'Aperturas', sets: [] });
  });
  const merged = mergeGymModule(renamed, added, base);
  assert.equal(merged.routineTemplates[0].name, 'Empuje fuerte');
  assert.deepEqual(merged.routineTemplates[0].exercises.map((exercise) => exercise.id).sort(),
    ['template-ex-a', 'template-ex-b', 'template-exercise-1']);
  assertSame(merged.sessions, historical);

  const deleted = mutate(base, 'device-b', (gym) => { gym.routineTemplates = []; });
  assert.equal(mergeGymModule(renamed, deleted, base).routineTemplates.length, 0);
});

test('template exercise order is revisioned and survives sync without touching sessions', () => {
  const base = baseGym();
  base.routineTemplates[0].exercises.push(
    { id: 'template-exercise-2', name: 'Press militar', sets: [] },
    { id: 'template-exercise-3', name: 'Fondos', sets: [] }
  );
  const historical = structuredClone(base.sessions);
  const reordered = mutate(base, 'device-a', (gym) => {
    const exercises = gym.routineTemplates[0].exercises;
    exercises.unshift(exercises.pop()!);
  });

  const merged = mergeGymModule(reordered, base, base);
  assert.deepEqual(merged.routineTemplates[0].exercises.map((exercise) => exercise.id), [
    'template-exercise-3', 'template-exercise-1', 'template-exercise-2',
  ]);
  assertSame(merged.sessions, historical);
});

test('rest day removal survives offline sync and an old snapshot', () => {
  const base = baseGym();
  const removed = mutate(base, 'device-a', (gym) => { gym.restDays = []; });
  const otherAddition = mutate(base, 'device-b', (gym) => { gym.restDays?.push('2026-10-03'); });
  assert.deepEqual(mergeGymModule(removed, otherAddition, base).restDays, ['2026-10-03']);
  assert.deepEqual(mergeGymModule(removed, base, base).restDays, []);

  const convergedDeletion = mergeGymModule(removed, base, base);
  const addedAgain = mutate(convergedDeletion, 'device-a', (gym) => { gym.restDays?.push('2026-10-02'); });
  assert.deepEqual(mergeGymModule(addedAgain, convergedDeletion, convergedDeletion).restDays, ['2026-10-02']);
});

test('same-day weight and measurement conflicts use revisions, not dates, milliseconds, or wall-clock direction', () => {
  const base = baseGym();
  const deviceA = mutate(base, 'device-a', (gym) => {
    gym.weight[0].kg = 81;
    gym.measurements[0].waist = 89;
  });
  const deviceZ = mutate(base, 'device-z', (gym) => {
    gym.weight[0].kg = 79;
    gym.measurements[0].waist = 91;
  });
  const tied = mergeGymModule(deviceA, deviceZ, base);
  assert.equal(tied.weight[0].kg, 79);
  assert.equal(tied.measurements[0].waist, 91);

  const afterClockRollback = mutate(deviceZ, 'device-z', (gym) => { gym.weight[0].kg = 78; });
  assert.equal(mergeGymModule(deviceA, afterClockRollback, base).weight[0].kg, 78);

  const corruptedClock = structuredClone(afterClockRollback);
  corruptedClock._sync = { version: 2, clock: 0, fields: {}, tombstones: {} };
  corruptedClock.weight[0].kg = 77;
  const recoveredRevision = stampGymMutation(afterClockRollback, corruptedClock, 'device-z');
  assert.ok(recoveredRevision && recoveredRevision.counter > (afterClockRollback._sync?.clock || 0));

  const legacy = structuredClone(base);
  legacy.weight[0].kg = 100;
  assert.equal(mergeGymModule(legacy, deviceZ, base).weight[0].kg, 79);
});

test('legacy/legacy, legacy/modern and modern/modern merge without creating revisions on read', () => {
  const base = baseGym();
  const legacyA = structuredClone(base);
  const legacyB = structuredClone(base);
  legacyA._sync = undefined;
  legacyB._sync = undefined;
  base._sync = undefined;
  legacyA.sessions[0].weekLabel = 'A';
  legacyB.sessions[0].weekLabel = 'Z';
  const legacyMerged = mergeGymModule(legacyA, legacyB, base);
  assert.equal(legacyMerged.sessions[0].weekLabel, 'Z');
  assert.equal(legacyMerged._sync, undefined);

  const modern = mutate(base, 'device-a', (gym) => { gym.sessions[0].weekLabel = 'Modern'; });
  assert.equal(mergeGymModule(legacyB, modern, base).sessions[0].weekLabel, 'Modern');
  assertSame(mergeGymModule(modern, modern, base), modern);
  assert.equal(migrateGym(base)._sync, undefined);
});

test('active timer is local-only: it is omitted from sync data and preserved while applying remote Gym', () => {
  const state = defaultState();
  state.gym = baseGym();
  state.gym.activeTimer = { endsAt: 123, durationSeconds: 90, sessionId: 'session-1' };
  const payload = syncModuleData(state, 'gym') as { gym: Gym };
  assert.equal('activeTimer' in payload.gym, false);

  const remoteGym = mutate(baseGym(), 'device-b', (gym) => { gym.sessions[0].weekLabel = 'Remote'; });
  const mergedState = mergeSyncModule(state, 'gym', { gym: remoteGym }, { gym: baseGym() });
  assert.equal(mergedState.gym.activeTimer?.endsAt, state.gym.activeTimer.endsAt);
  assert.equal(mergedState.gym.activeTimer?.sessionId, state.gym.activeTimer.sessionId);
  assert.equal(mergedState.gym.sessions[0].weekLabel, 'Remote');

  const remoteWithoutTheSession = { ...remoteGym, sessions: [], activeTimer: { endsAt: 999, sessionId: 'remote-session' } };
  const replacedState = applySyncModule(state, 'gym', { gym: remoteWithoutTheSession });
  assert.equal(replacedState.gym.activeTimer?.endsAt, 123);
  assert.equal(replacedState.gym.activeTimer?.sessionId, 'session-1');
});

test('legacy exercises without ids match a modern exercise by name while exerciseId remains preferred', () => {
  const base = baseGym();
  const legacy = structuredClone(base);
  delete legacy.sessions[0].exercises[0].id;
  legacy._sync = undefined;
  const modern = mutate(base, 'device-a', (gym) => { gym.sessions[0].exercises[0].barWeight = 15; });
  const exercises: Exercise[] = mergeGymModule(legacy, modern, base).sessions[0].exercises;
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].id, 'exercise-1');
  assert.equal(exercises[0].barWeight, 15);
});

test('modern exercises with the same name and different ids never merge by name', () => {
  const base = baseGym();
  base.sessions[0].exercises = [];
  const a = mutate(base, 'device-a', (gym) => {
    gym.sessions[0].exercises.push({ id: 'curl-a', name: 'Curl', sets: [] });
  });
  const b = mutate(base, 'device-b', (gym) => {
    gym.sessions[0].exercises.push({ id: 'curl-b', name: 'Curl', sets: [] });
  });
  const exercises = mergeGymModule(a, b, base).sessions[0].exercises;
  assert.deepEqual(exercises.map((exercise) => exercise.id).sort(), ['curl-a', 'curl-b']);
});

test('mergeGymModule: sync preserves type field without breaking legacy sets', () => {
  const base = baseGym();
  const modern = mutate(base, 'device-a', (gym) => {
    gym.sessions[0].exercises[0].sets[0].type = 'warmup';
    gym.sessions[0].status = 'completed';
    gym.sessions[0].startedAt = '12:00';
    gym.sessions[0].finishedAt = '13:07';
  });
  const remote = mutate(base, 'device-b', (gym) => {
    gym.sessions[0].exercises[0].sets[0].weight = 85;
  });

  const merged = mergeGymModule(modern, remote, base);
  const set = merged.sessions[0].exercises[0].sets[0];
  assert.equal(set.type, 'warmup');
  assert.equal(set.weight, 85);
  assert.equal(merged.sessions[0].startedAt, '12:00');
  assert.equal(merged.sessions[0].finishedAt, '13:07');
});
