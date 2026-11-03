import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkoutSummaryModal } from '../components/WorkoutSummaryModal';
import { defaultState, normalizeStoredState, parseBackupJSON } from './storage';
import { applySyncModule, syncModuleData } from './syncModel';
import { addSetToGymSession, configureGymTemplateExercise, startGymSession } from './gymFlows';

test('a warmup-only summary confirms recorded work without claiming effective volume or a record', () => {
  const session = { id: 'finished', date: '2026-11-02', status: 'completed' as const, exercises: [{ id: 'press', name: 'Press', sets: [
    { id: 'warmup', type: 'warmup' as const, weight: 20, reps: 12, completed: true },
    { id: 'pending', weight: 60, reps: 8, completed: false },
  ] }] };
  const original = structuredClone(session);
  const html = renderToStaticMarkup(React.createElement(WorkoutSummaryModal, { session, newPRs: [], onClose: () => undefined }));
  assert.match(html, /Volumen efectivo/);
  assert.match(html, /Tus series realizadas quedaron guardadas/);
  assert.doesNotMatch(html, /acumulando volumen|nuevo PR/);
  assert.deepEqual(session, original);
});

test('routine target edits retain the warmup identity of existing planned sets', () => {
  const gym = defaultState().gym;
  gym.routineTemplates = [{ id: 'plan', name: 'Plan', exercises: [{ id: 'press', name: 'Press', sets: [
    { id: 'warm', type: 'warmup', weight: 20, reps: 12, completed: false },
    { id: 'work', type: 'normal', weight: 80, reps: 8, completed: false },
  ] }] }];
  configureGymTemplateExercise(gym, 'plan', 'press', { setsCount: 3, reps: 10, targetWeight: 50 });
  const sets = gym.routineTemplates[0].exercises[0].sets;
  assert.equal(sets[0].type, 'warmup');
  assert.equal(sets[1].type, 'normal');
  assert.deepEqual(sets.slice(0, 2).map(s => s.id), ['warm', 'work']);
  assert.ok(sets.every(s => !s.completed && s.weight === 50 && s.reps === 10));
});

test('starting a zero-load routine retains zero instead of suggesting twenty kilograms', () => {
  const gym = defaultState().gym;
  gym.sessions = [];
  gym.routineTemplates = [{ id: 'bodyweight', name: 'Sin carga', exercises: [{ id: 'squat', name: 'Sentadilla corporal', equipment: 'corporal', weight: 0, sets: [
    { id: 's', weight: 0, reps: 12, completed: false },
  ] }] }];
  const original = structuredClone(gym.routineTemplates);
  const { session } = startGymSession(gym, { templateId: 'bodyweight', sessionId: 'new', date: '2026-11-02', startedAt: '18:00' });
  assert.equal(session.exercises[0].sets[0].weight, 0);
  assert.equal(session.exercises[0].weight, 0);
  assert.deepEqual(gym.routineTemplates, original);
  assert.equal(session.exercises[0].sets[0].completed, false);
});

test('adding the first set to an existing zero-load exercise retains its planned zero', () => {
  const gym = defaultState().gym;
  gym.sessions = [{ id: 'active', date: '2026-11-02', status: 'active', exercises: [{ id: 'floor', name: 'Ejercicio sin carga', weight: 0, sets: [] }] }];
  const set = addSetToGymSession(gym, 'active', 'floor');
  assert.equal(set?.weight, 0);
  assert.equal(set?.completed, false);
});

test('missing or nonfinite planned loads retain the existing fallback rather than becoming a real zero', () => {
  for (const weight of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    const gym = defaultState().gym;
    gym.sessions = [];
    gym.routineTemplates = [{ id: 'plan', name: 'Plan', exercises: [{ id: 'exercise', name: 'Ejercicio', weight, sets: [] }] }];
    const { session } = startGymSession(gym, { templateId: 'plan', sessionId: 'started', date: '2026-11-02', startedAt: '18:00' });
    assert.ok(session.exercises[0].sets.every(s => s.weight === 20));
    session.exercises[0].sets = [];
    session.exercises[0].weight = weight;
    assert.equal(addSetToGymSession(gym, session.id, 'exercise')?.weight, 20);
  }
});

test('editing a single routine field preserves heterogeneous targets, types and historical snapshots', () => {
  const state = defaultState();
  state.gym.routineTemplates = [{ id: 'plan', name: 'Plan', exercises: [{ id: 'press', name: 'Press', weight: 60, sets: [
    { id: 'warm', type: 'warmup', weight: 20, reps: 12, completed: false },
    { id: 'work', type: 'normal', weight: 60, reps: 8, completed: false },
  ] }] }];
  state.gym.sessions = [{ id: 'history', date: '2026-11-01', status: 'completed', exercises: structuredClone(state.gym.routineTemplates[0].exercises) }];
  const history = structuredClone(state.gym.sessions);
  configureGymTemplateExercise(state.gym, 'plan', 'press', { setsCount: 3 });
  let sets = state.gym.routineTemplates[0].exercises[0].sets;
  assert.deepEqual(sets.slice(0, 2).map(s => [s.id, s.weight, s.reps, s.type]), [['warm', 20, 12, 'warmup'], ['work', 60, 8, 'normal']]);
  configureGymTemplateExercise(state.gym, 'plan', 'press', { reps: 10 });
  sets = state.gym.routineTemplates[0].exercises[0].sets;
  assert.deepEqual(sets.slice(0, 2).map(s => s.weight), [20, 60]);
  assert.ok(sets.every(s => s.reps === 10));
  configureGymTemplateExercise(state.gym, 'plan', 'press', { targetWeight: 0 });
  assert.ok(state.gym.routineTemplates[0].exercises[0].sets.every(s => s.weight === 0 && s.reps === 10));
  assert.deepEqual(state.gym.sessions, history);

  const loaded = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  const restored = parseBackupJSON(JSON.stringify(loaded));
  const synced = applySyncModule(defaultState(), 'gym', syncModuleData(restored, 'gym'));
  const result = synced.gym.routineTemplates[0].exercises[0].sets;
  assert.equal(result[0].type, 'warmup');
  assert.equal(result[0].id, 'warm');
  assert.ok(result.every(s => s.weight === 0 && s.reps === 10 && s.completed === false));
  assert.deepEqual(synced.gym.sessions, restored.gym.sessions);
});
