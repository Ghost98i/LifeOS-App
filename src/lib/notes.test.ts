import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addNote,
  updateNote,
  deleteNote,
  togglePinNote,
  toggleArchiveNote,
  convertNoteToTask,
  getSortedNotes,
  getDashboardNotes,
  formatRelativeTime,
} from './notesFlows';
import { addQuickNote } from './quickCapture';
import { searchLifeOS } from './search';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { mergeNotesModule } from './syncMerge';
import type { Postit, Notes } from '../types';

test('Notas: addNote crea una nota con título, tags, pinned y timestamps', () => {
  const state = defaultState();
  const note = addNote(state, {
    title: '  Mi Título  ',
    text: '  Contenido importante de la nota  ',
    tags: ['Ideas', 'DEV'],
    pinned: true,
  });

  assert.equal(state.notes.postits.length, 1);
  assert.equal(note.title, 'Mi Título');
  assert.equal(note.text, 'Contenido importante de la nota');
  assert.deepEqual(note.tags, ['ideas', 'dev']);
  assert.equal(note.pinned, true);
  assert.equal(note.archived, undefined);
  assert.ok(note.createdAt);
  assert.ok(note.updatedAt);
  assert.equal(note.date, todayISO());
});

test('Notas: addNote rechaza texto vacío o solo espacios', () => {
  const state = defaultState();
  assert.throws(() => {
    addNote(state, { text: '   ' });
  }, /La nota no puede estar vacía/);
});

test('Notas: updateNote modifica campos y actualiza updatedAt', () => {
  const state = defaultState();
  const note = addNote(state, { text: 'Texto inicial' });
  const originalCreated = note.createdAt;

  const updated = updateNote(state, note.id, {
    title: 'Nuevo título',
    text: 'Texto modificado',
    tags: ['updated'],
    pinned: true,
    archived: true,
  });

  assert.equal(updated.title, 'Nuevo título');
  assert.equal(updated.text, 'Texto modificado');
  assert.deepEqual(updated.tags, ['updated']);
  assert.equal(updated.pinned, true);
  assert.equal(updated.archived, true);
  assert.equal(updated.createdAt, originalCreated);
  assert.ok(updated.updatedAt);

  // Throws if id not found
  assert.throws(() => {
    updateNote(state, 'non-existent-id', { text: 'fail' });
  }, /Nota no encontrada/);
});

test('Notas: deleteNote elimina la nota sin afectar a las demás', () => {
  const state = defaultState();
  const n1 = addNote(state, { text: 'Nota 1' });
  const n2 = addNote(state, { text: 'Nota 2' });

  assert.equal(state.notes.postits.length, 2);
  const deleted = deleteNote(state, n1.id);

  assert.equal(deleted, true);
  assert.equal(state.notes.postits.length, 1);
  assert.equal(state.notes.postits[0].id, n2.id);

  // Deleting again returns false
  assert.equal(deleteNote(state, n1.id), false);
});

test('Notas: togglePinNote alterna entre fijado y no fijado limpiamente', () => {
  const state = defaultState();
  const note = addNote(state, { text: 'Nota para pin' });
  assert.equal(note.pinned, undefined);

  const pinned1 = togglePinNote(state, note.id);
  assert.equal(pinned1, true);
  assert.equal(note.pinned, true);

  const pinned2 = togglePinNote(state, note.id);
  assert.equal(pinned2, false);
  assert.equal(note.pinned, undefined);
});

test('Notas: toggleArchiveNote alterna entre archivado y activo', () => {
  const state = defaultState();
  const note = addNote(state, { text: 'Nota para archivo' });
  assert.equal(note.archived, undefined);

  const archived1 = toggleArchiveNote(state, note.id);
  assert.equal(archived1, true);
  assert.equal(note.archived, true);

  const archived2 = toggleArchiveNote(state, note.id);
  assert.equal(archived2, false);
  assert.equal(note.archived, undefined);
});

test('Notas: convertNoteToTask convierte nota en tarea de Hoy sin destruir ni mutar la nota original', () => {
  const state = defaultState();
  const note = addNote(state, {
    title: 'Comprar repuestos',
    text: 'Filtro de aire\nAceite 5w30\nBujías',
    tags: ['auto'],
  });

  const { taskId, taskText } = convertNoteToTask(state, note.id, todayISO());

  assert.equal(taskText, 'Comprar repuestos');
  assert.equal(state.todayExtras.length, 1);
  const task = state.todayExtras[0];
  assert.equal(task.id, taskId);
  assert.equal(task.text, 'Comprar repuestos');
  assert.equal(task.date, todayISO());
  assert.equal(task.done, false);
  assert.equal(task.linkedId, note.id);

  // The original note is intact and unchanged
  assert.equal(state.notes.postits.length, 1);
  assert.equal(state.notes.postits[0].id, note.id);
  assert.equal(state.notes.postits[0].title, 'Comprar repuestos');
});

test('Notas: convertNoteToTask utiliza la primera línea de texto si no tiene título', () => {
  const state = defaultState();
  const note = addNote(state, {
    text: 'Revisar presupuesto mensual\nDetalle adicional...',
  });

  const { taskText } = convertNoteToTask(state, note.id);
  assert.equal(taskText, 'Revisar presupuesto mensual');
});

test('Notas: getSortedNotes ubica las notas fijadas primero y luego las más recientes', () => {
  const n1: Postit = { id: '1', text: 'Nota normal vieja', date: '2026-09-01' };
  const n2: Postit = { id: '2', text: 'Nota normal nueva', date: '2026-09-20' };
  const n3: Postit = { id: '3', text: 'Nota fijada', date: '2026-09-05', pinned: true };
  const n4: Postit = { id: '4', text: 'Nota archivada', date: '2026-09-25', archived: true };

  // By default, only active notes, pinned first, then newest
  const activeSorted = getSortedNotes([n1, n2, n3, n4], { filter: 'active' });
  assert.deepEqual(activeSorted.map((n) => n.id), ['3', '2', '1']);

  // Archived filter
  const archived = getSortedNotes([n1, n2, n3, n4], { filter: 'archived' });
  assert.deepEqual(archived.map((n) => n.id), ['4']);

  // All notes
  const all = getSortedNotes([n1, n2, n3, n4], { filter: 'all' });
  assert.equal(all.length, 4);
  assert.equal(all[0].id, '3'); // pinned first
});

test('Notas: getSortedNotes filtra por texto, título y tags', () => {
  const n1: Postit = { id: '1', title: 'Viaje a Rocha', text: 'Llevar carpa', date: '2026-09-10' };
  const n2: Postit = { id: '2', text: 'Reunión de desarrollo', tags: ['programacion', 'lifeos'], date: '2026-09-12' };
  const n3: Postit = { id: '3', text: 'Comprar leche y pan', date: '2026-09-15' };

  const byTitle = getSortedNotes([n1, n2, n3], { searchQuery: 'rocha' });
  assert.deepEqual(byTitle.map((n) => n.id), ['1']);

  const byTag = getSortedNotes([n1, n2, n3], { searchQuery: 'lifeos' });
  assert.deepEqual(byTag.map((n) => n.id), ['2']);

  const byContent = getSortedNotes([n1, n2, n3], { searchQuery: 'leche' });
  assert.deepEqual(byContent.map((n) => n.id), ['3']);
});

test('Notas: getDashboardNotes separa fijadas estables y recientes sin duplicados', () => {
  const notes: Postit[] = [
    { id: 'pin-first', text: 'Primera fijada', date: '2026-09-01', pinned: true, updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'recent-created', text: 'Creada recientemente', date: '2026-08-01', createdAt: '2026-10-06T10:00:00Z' },
    { id: 'pin-second', text: 'Segunda fijada', date: '2026-10-07', pinned: true, updatedAt: '2026-10-07T10:00:00Z' },
    { id: 'recent-updated', text: 'Modificada más recientemente', date: '2026-08-01', updatedAt: '2026-10-07T11:00:00Z' },
    { id: 'archived', text: 'Archivada', date: '2026-10-07', archived: true },
  ];

  const dashboard = getDashboardNotes(notes);

  assert.deepEqual(dashboard.pinned.map((note) => note.id), ['pin-first', 'pin-second']);
  assert.deepEqual(dashboard.recent.map((note) => note.id), ['recent-updated', 'recent-created']);
  assert.equal(dashboard.recent.some((note) => note.pinned), false);
});

test('Notas: getDashboardNotes limita ambos niveles a tres notas', () => {
  const pinned = Array.from({ length: 4 }, (_, index): Postit => ({
    id: `pin-${index}`,
    text: `Fijada ${index}`,
    date: `2026-09-0${index + 1}`,
    pinned: true,
  }));
  const recent = Array.from({ length: 4 }, (_, index): Postit => ({
    id: `recent-${index}`,
    text: `Reciente ${index}`,
    date: `2026-10-0${index + 1}`,
  }));

  const dashboard = getDashboardNotes([...pinned, ...recent]);

  assert.equal(dashboard.pinned.length, 3);
  assert.deepEqual(dashboard.pinned.map((note) => note.id), ['pin-0', 'pin-1', 'pin-2']);
  assert.deepEqual(dashboard.recent.map((note) => note.id), ['recent-3', 'recent-2', 'recent-1']);
});

test('Notas: formatRelativeTime formatea marcas temporales de forma legible', () => {
  assert.equal(formatRelativeTime(''), '');
  assert.equal(formatRelativeTime(todayISO()), 'Hoy');

  const now = new Date();
  assert.ok(formatRelativeTime(now.toISOString()).length > 0);
});

test('Notas: searchLifeOS indexa notas por título, texto y tags', () => {
  const state = defaultState();
  addNote(state, {
    title: 'Receta de tortafritas',
    text: 'Harina, grasa y agua con sal',
    tags: ['comida', 'cocina'],
  });

  const resultsTitle = searchLifeOS(state, 'tortafritas');
  assert.ok(resultsTitle.some((r) => r.view === 'notas' && r.title.includes('Receta de tortafritas')));

  const resultsTag = searchLifeOS(state, 'cocina');
  assert.ok(resultsTag.some((r) => r.view === 'notas'));

  const resultsContent = searchLifeOS(state, 'harina');
  assert.ok(resultsContent.some((r) => r.view === 'notas'));
});

test('Notas: addQuickNote en Quick Capture soporta título, tags y pinned', () => {
  const state = defaultState();
  const id = addQuickNote(state, 'Idea de producto', {
    title: 'App LifeOS',
    tags: ['startup', 'saas'],
    pinned: true,
  });

  assert.ok(id);
  const note = state.notes.postits.find((n) => n.id === id);
  assert.ok(note);
  assert.equal(note?.title, 'App LifeOS');
  assert.equal(note?.text, 'Idea de producto');
  assert.deepEqual(note?.tags, ['startup', 'saas']);
  assert.equal(note?.pinned, true);
});

test('Notas: normalización en storage.ts preserva compatibilidad con notas heredadas (sin title ni pinned)', () => {
  const legacyData = {
    schemaVersion: 2,
    notes: {
      postits: [
        { id: 'legacy-1', text: 'Nota simple antigua', date: '2026-08-15' },
      ],
      shopping: [],
      links: [],
      possessions: [],
    },
  };

  const normalized = normalizeStoredState(legacyData);
  assert.equal(normalized.notes.postits.length, 1);
  const note = normalized.notes.postits[0];
  assert.equal(note.id, 'legacy-1');
  assert.equal(note.text, 'Nota simple antigua');
  assert.equal(note.date, '2026-08-15');
  assert.equal(note.title, undefined);
  assert.equal(note.pinned, undefined);
  assert.equal(note.archived, undefined);

  // Roundtrip JSON serialization maintains clean JSON identical to legacy
  const json = JSON.stringify(note);
  assert.equal(json, JSON.stringify({ id: 'legacy-1', text: 'Nota simple antigua', date: '2026-08-15' }));
});

test('Notas: sincronización multi-dispositivo detecta y resuelve cambios de notas', () => {
  const baseNotes: Notes = {
    postits: [
      { id: 'p1', text: 'Texto original', date: '2026-09-01' },
      { id: 'p2', text: 'Nota que borra remote', date: '2026-09-01' },
    ],
    shopping: [],
    links: [],
    possessions: [],
  };

  // Local updates text of p1, keeps p2
  const localNotes: Notes = {
    postits: [
      { id: 'p1', text: 'Texto editado por local', date: '2026-09-01' },
      { id: 'p2', text: 'Nota que borra remote', date: '2026-09-01' },
    ],
    shopping: [],
    links: [],
    possessions: [],
  };

  // Remote pins p1 and deletes p2
  const remoteNotes: Notes = {
    postits: [
      { id: 'p1', text: 'Texto original', date: '2026-09-01', pinned: true },
    ],
    shopping: [],
    links: [],
    possessions: [],
  };

  const conflicts: any[] = [];
  const merged = mergeNotesModule(localNotes, remoteNotes, baseNotes, {}, (c) => conflicts.push(c));

  // Zero conflict because local changed text and remote only pinned
  assert.equal(conflicts.length, 0);
  assert.equal(merged.postits.length, 1); // p2 was deleted by remote and untouched by local -> deleted
  assert.equal(merged.postits[0].id, 'p1');
  assert.equal(merged.postits[0].text, 'Texto editado por local');
  assert.equal(merged.postits[0].pinned, true);
});
