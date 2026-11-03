import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateGym } from './gymMigration';
import { resumeGymRestTimer } from './gymFlows';
import { defaultState, loadStoredState, normalizeStoredState, parseBackupJSON, saveStoredState } from './storage';
import { syncModuleData } from './syncModel';

function pausedState(remaining = 37) {
  const state = defaultState();
  state.gym.sessions = [{ id: 'paused-session', date: '2026-11-02', status: 'active', exercises: [{ id: 'press', name: 'Press banca', sets: [{ id: 'set', weight: 0, reps: 8, completed: true }] }] }];
  state.gym.activeTimer = { sessionId: 'paused-session', exerciseId: 'press', exerciseIndex: 0, targetExerciseIndex: undefined, setId: 'set', kind: 'set', endsAt: 1793655300000 + remaining * 1000, durationSeconds: 90, pausedAt: 1793655300000, remainingSecondsWhenPaused: remaining, minimized: true };
  return state;
}

test('paused rest retains its existing pause fields through repeated normalization and backup restore', () => {
  for (const remaining of [0, 37]) {
    const state = pausedState(remaining);
    const normalized = normalizeStoredState(normalizeStoredState(state));
    const restored = parseBackupJSON(JSON.stringify({ state: normalized }));
    assert.deepEqual(restored.gym.activeTimer, state.gym.activeTimer);
    assert.deepEqual(restored.gym.sessions, normalized.gym.sessions);
    const resumed = resumeGymRestTimer(restored.gym.activeTimer!, 1793741700000);
    assert.equal(resumed.endsAt, 1793741700000 + remaining * 1000);
    assert.equal(resumed.pausedAt, null);
    assert.equal('activeTimer' in (syncModuleData(restored, 'gym') as { gym: object }).gym, false);
  }
});

test('two local reloads preserve paused rest and performed zero load without extending the clock', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  try {
    const state = pausedState();
    assert.equal(saveStoredState(state), true);
    const first = loadStoredState().state;
    assert.deepEqual(first.gym.activeTimer, state.gym.activeTimer);
    assert.equal(saveStoredState(first), true);
    const second = loadStoredState().state;
    assert.deepEqual(second.gym.activeTimer, state.gym.activeTimer);
    assert.equal(second.gym.sessions[0].exercises[0].sets[0].weight, 0);
    assert.equal(second.gym.sessions[0].exercises[0].sets[0].completed, true);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('legacy running timers stay running and malformed pause values do not create a pause', () => {
  for (const value of [undefined, null, -1, 0, Infinity, '1793655300000']) {
    const state = pausedState();
    const timer = { ...state.gym.activeTimer, pausedAt: value };
    const migrated = migrateGym({ ...state.gym, activeTimer: timer });
    assert.equal(migrated.activeTimer?.pausedAt, undefined);
    assert.equal(migrated.activeTimer?.remainingSecondsWhenPaused, undefined);
    assert.equal(migrated.activeTimer?.endsAt, timer.endsAt);
  }
});
