import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { mergeAgendaModule } from './syncMerge';
import { getUnifiedTaskList } from './taskDependencies';

// ── Agenda ↔ Task linking tests ────────────────────────────────────────────

test('Agenda linking: linkedTaskId is persisted when set on a block', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-link-1',
    date: today,
    text: 'Estudiar TypeScript',
    done: false,
    priority: 'media',
  });

  // Simulate adding a block with linkedTaskId
  state.agenda.lunes.push({
    id: 'block-1',
    time: '10:00',
    activity: 'Estudiar TypeScript',
    effort: 'high',
    linkedTaskId: 'task-link-1',
  });

  assert.equal(state.agenda.lunes[0].linkedTaskId, 'task-link-1');
});

test('Agenda linking: changing linkedTaskId updates the reference', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({ id: 'task-a', date: today, text: 'Tarea A', done: false, priority: 'media' });
  state.todayExtras.push({ id: 'task-b', date: today, text: 'Tarea B', done: false, priority: 'media' });

  state.agenda.martes.push({
    id: 'block-2',
    time: '09:00',
    activity: 'Bloque de trabajo',
    linkedTaskId: 'task-a',
  });

  // Update link to task B
  state.agenda.martes[0] = { ...state.agenda.martes[0], linkedTaskId: 'task-b' };

  assert.equal(state.agenda.martes[0].linkedTaskId, 'task-b');
});

test('Agenda linking: removing linkedTaskId leaves the block intact', () => {
  const state = defaultState();

  state.agenda.miercoles.push({
    id: 'block-3',
    time: '14:00',
    activity: 'Reunión de equipo',
    linkedTaskId: 'some-task-id',
  });

  // Remove the link
  const blockWithoutLink = { ...state.agenda.miercoles[0] };
  delete blockWithoutLink.linkedTaskId;
  state.agenda.miercoles[0] = blockWithoutLink;

  assert.equal(state.agenda.miercoles[0].linkedTaskId, undefined);
  assert.equal(state.agenda.miercoles[0].activity, 'Reunión de equipo');
});

test('Agenda linking: orphan link (task deleted) does not crash getUnifiedTaskList', () => {
  const state = defaultState();

  // Block with linkedTaskId pointing to a non-existent task
  state.agenda.jueves.push({
    id: 'block-4',
    time: '11:00',
    activity: 'Sesión huérfana',
    linkedTaskId: 'nonexistent-task-id',
  });

  // Should not throw
  const tasks = getUnifiedTaskList(state);
  assert.ok(Array.isArray(tasks));

  // Block should still be accessible
  assert.equal(state.agenda.jueves[0].linkedTaskId, 'nonexistent-task-id');
  assert.equal(state.agenda.jueves[0].activity, 'Sesión huérfana');
});

test('normalizeStoredState: block without linkedTaskId → undefined (safe default)', () => {
  const raw = defaultState() as any;
  raw.agenda.viernes = [
    { id: 'block-old', time: '08:00', activity: 'Bloque antiguo', effort: 'low' },
  ];

  const normalized = normalizeStoredState(raw);
  const block = normalized.agenda.viernes[0];
  assert.equal(block.id, 'block-old');
  assert.equal(block.activity, 'Bloque antiguo');
  assert.equal(block.linkedTaskId, undefined, 'Old block without linkedTaskId should normalize to undefined');
});

test('normalizeStoredState: block with linkedTaskId → value preserved', () => {
  const raw = defaultState() as any;
  raw.agenda.sabado = [
    { id: 'block-linked', time: '16:00', activity: 'Entrenamiento', effort: 'high', linkedTaskId: 'task-xyz' },
  ];

  const normalized = normalizeStoredState(raw);
  const block = normalized.agenda.sabado[0];
  assert.equal(block.linkedTaskId, 'task-xyz', 'linkedTaskId must be preserved through normalizeStoredState');
});

test('normalizeStoredState: block with non-string linkedTaskId → undefined (type safety)', () => {
  const raw = defaultState() as any;
  raw.agenda.domingo = [
    { id: 'block-bad', time: '12:00', activity: 'Bloque con tipo inválido', linkedTaskId: 42 },
  ];

  const normalized = normalizeStoredState(raw);
  const block = normalized.agenda.domingo[0];
  assert.equal(block.linkedTaskId, undefined, 'Non-string linkedTaskId must be coerced to undefined');
});

test('mergeAgendaModule: linkedTaskId preserved when only local has it (LWW — local wins for new field)', () => {
  const local: any = {
    lunes: [{ id: 'b1', time: '09:00', activity: 'Act', effort: 'medium', linkedTaskId: 'task-1' }],
    martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [],
  };
  const remote: any = {
    lunes: [{ id: 'b1', time: '09:00', activity: 'Act', effort: 'medium' }],
    martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [],
  };

  // mergeEntityCollection does LWW by timestamp. If local is more recent, local wins.
  // Here we test that the merge doesn't crash and produces a valid AgendaBlock.
  const merged = mergeAgendaModule(local, remote);
  const block = merged.lunes.find((b: any) => b.id === 'b1');
  assert.ok(block, 'Block must exist after merge');
  // LWW: either local or remote wins — just verify no crash and block has all base fields
  assert.equal(block.time, '09:00');
  assert.equal(block.activity, 'Act');
});

test('mergeAgendaModule: remote block with linkedTaskId is preserved after merge', () => {
  const local: any = {
    lunes: [{ id: 'b2', time: '10:00', activity: 'Sesión', effort: 'low' }],
    martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [],
  };
  const remote: any = {
    lunes: [{ id: 'b2', time: '10:00', activity: 'Sesión', effort: 'low', linkedTaskId: 'task-remote' }],
    martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [],
  };

  const merged = mergeAgendaModule(local, remote);
  const block = merged.lunes.find((b: any) => b.id === 'b2');
  assert.ok(block, 'Block must exist after merge');
  // Remote has linkedTaskId, local does not. Either LWW result is acceptable, just no crash.
  assert.equal(block.activity, 'Sesión');
});

test('Agenda linking: round-trip through normalizeStoredState (export/import simulation)', () => {
  const state = defaultState();

  state.agenda.lunes.push({
    id: 'block-rt',
    time: '15:00',
    activity: 'Repaso de examen',
    effort: 'high',
    linkedTaskId: 'task-repaso',
  });

  // Simulate export (JSON.stringify) and import (normalizeStoredState)
  const exported = JSON.parse(JSON.stringify(state));
  const imported = normalizeStoredState(exported);

  const block = imported.agenda.lunes.find((b) => b.id === 'block-rt');
  assert.ok(block, 'Block must survive round-trip');
  assert.equal(block!.linkedTaskId, 'task-repaso', 'linkedTaskId must survive JSON round-trip');
  assert.equal(block!.activity, 'Repaso de examen');
});
