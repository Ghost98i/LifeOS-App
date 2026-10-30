import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addNote, updateNote, getSortedNotes } from './notesFlows';
import { getStudyWorkspace } from './studyWorkspace';
import { getScheduledGymRoutine } from './gymIdlePresentation';
import type { RoutineTemplate } from '../types';

test('notes: clear title and all tags without changing id or historical date', () => {
  const state = defaultState(); const note = addNote(state, { title: 'Old', text: 'Keep', tags: ['old'] });
  const original = structuredClone(note);
  updateNote(state, note.id, { title: '', tags: [], text: 'Keep' }, original);
  assert.equal(note.title, undefined); assert.deepEqual(note.tags, []); assert.equal(note.id, original.id); assert.equal(note.date, original.date);
});
test('notes: concurrent edit is rejected without modifying either version', () => {
  const state = defaultState(); const note = addNote(state, { text: 'Original' }); const original = structuredClone(note);
  updateNote(state, note.id, { text: 'Remote' }); const before = structuredClone(state);
  assert.throws(() => updateNote(state, note.id, { text: 'Local' }, original), /cambió/); assert.deepEqual(state, before);
});
test('notes: deleted note does not resurrect from an old editor', () => {
  const state = defaultState(); assert.throws(() => updateNote(state, 'missing', { text: 'local' }), /no encontrada/); assert.equal(state.notes.postits.length, 0);
});
test('notes: accent-insensitive search spans fields and recent sort ignores pinning', () => {
  const state = defaultState(); const old = addNote(state, { title: 'Álgebra', text: 'Matrices', tags: ['exámen'], pinned: true });
  old.updatedAt = '2026-10-01T10:00:00Z'; const latest = addNote(state, { text: 'Nuevo' }); latest.updatedAt = '2026-10-26T10:00:00Z';
  assert.deepEqual(getSortedNotes(state.notes.postits, { searchQuery: 'algebra examen' }).map(n => n.id), [old.id]);
  assert.equal(getSortedNotes(state.notes.postits, { order: 'recent' })[0].id, latest.id);
  assert.equal(getSortedNotes(state.notes.postits)[0].id, old.id);
});
test('study: existing subject tasks and explicitly tagged materials, excluding archived/unrelated notes', () => {
  const state = defaultState(); state.study.subjects = [{ id: 'math', name: 'Álgebra' }];
  state.todayExtras = [{ id: 'task', text: 'Repasar', done: false, date: '2026-10-26', priority: 'alta', linkedType: 'study', linkedId: 'math' }];
  addNote(state, { text: 'Material', tags: ['álgebra'] }); addNote(state, { text: 'Álgebra mencionada sin etiqueta' }); addNote(state, { text: 'Archivada', tags: ['álgebra'], archived: true });
  const view = getStudyWorkspace(state, 'math', '2026-10-26'); assert.equal(view.tasks.length, 1); assert.equal(view.notes.length, 1);
  assert.equal(getStudyWorkspace(state, 'other', '2026-10-26').tasks.length, 0);
});
test('study: past pending evaluations are awaiting results, never upcoming', () => {
  const state = defaultState(); state.study.exams = [{ id: 'old', status: 'pendiente', date: '2026-10-25' }, { id: 'next', status: 'pendiente', date: '2026-10-27' }];
  const view = getStudyWorkspace(state, null, '2026-10-26'); assert.equal(view.upcoming[0].id, 'next'); assert.equal(view.pendingResults[0].id, 'old');
});
test('study: legacy exams without status match the overview and retain historical data', () => {
  const state = defaultState();
  state.study.exams = JSON.parse('[{"id":"legacy-next","date":"2026-10-28","time":"10:00"},{"id":"legacy-old","date":"2026-10-25"},{"id":"completed","date":"2026-10-28","status":"aprobado"}]');
  const before = structuredClone(state.study.exams);
  const view = getStudyWorkspace(state, null, '2026-10-26');
  assert.deepEqual(view.upcoming.map(exam => exam.id), ['legacy-next']);
  assert.deepEqual(view.pendingResults.map(exam => exam.id), ['legacy-old']);
  assert.deepEqual(state.study.exams, before);
});
test('gym: scheduled suggestion skips empty routines, wraps week and never changes plans', () => {
  const routines = [{ id: 'empty', name: 'Empty', exercises: [], days: ['lunes'] }, { id: 'next', name: 'Piernas', exercises: [{ id: 'squat', name: 'Sentadilla', sets: [] }], days: ['martes'] }] as RoutineTemplate[];
  const before = structuredClone(routines); assert.equal(getScheduledGymRoutine(routines, '2026-10-26')?.daysAway, 1);
  assert.equal(getScheduledGymRoutine(routines, '2026-10-27')?.daysAway, 0); assert.deepEqual(routines, before);
  assert.equal(getScheduledGymRoutine(routines, '2026-10-28')?.daysAway, 6);
  assert.equal(getScheduledGymRoutine([], '2026-10-26'), null);
});
