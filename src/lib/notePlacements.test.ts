import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Postit } from '../types';
import { GymNoteSurface } from '../components/GymNoteSurface';
import {
  addGymPlacement, loadPlacements, moveOrResizePlacement, parsePlacements,
  placementNotePreview, placementStorageKey, placementsForNotes, removePlacement,
  savePlacements,
} from './notePlacements';

function mockStorage() {
  const entries = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  } as Storage;
  return entries;
}

test('creates one local placement per note and account, then reloads without copying content', () => {
  mockStorage();
  const note: Postit = { id: 'n1', title: 'Press banca', text: '80 kg', date: '2026-10-22' };
  const original = structuredClone(note);
  const placed = addGymPlacement([], note.id, 'p1');
  assert.equal(addGymPlacement(placed, note.id, 'p2'), placed);
  assert.equal(savePlacements('user-a', placed), true);
  assert.deepEqual(loadPlacements('user-a'), placed);
  assert.deepEqual(loadPlacements('user-b'), []);
  assert.deepEqual(note, original);
  assert.equal(JSON.stringify(placed).includes('80 kg'), false);
  assert.notEqual(placementStorageKey('user-a'), placementStorageKey('user-b'));
});

test('versioned parsing rejects malformed data and a future version cannot be overwritten', () => {
  const entries = mockStorage();
  assert.deepEqual(parsePlacements('{'), []);
  assert.deepEqual(parsePlacements(JSON.stringify({ version: 2, placements: [] })), []);
  entries.set(placementStorageKey('user-a'), JSON.stringify({ version: 2, placements: [{ id: 'future' }] }));
  assert.equal(savePlacements('user-a', []), false);
  assert.equal(JSON.parse(entries.get(placementStorageKey('user-a'))!).version, 2);
});

test('desktop coordinates survive a container width change and reject overlaps', () => {
  mockStorage();
  const first = addGymPlacement([], 'n1', 'p1')[0];
  const second = addGymPlacement([first], 'n2', 'p2')[1];
  const moved = moveOrResizePlacement(second, 500, 0, 1000, 'move', [first, second]);
  assert.equal(moved.x, 64);
  assert.equal(moved.width, 36);
  assert.equal(moved.x + moved.width <= 100, true);
  assert.equal(moveOrResizePlacement(second, -380, 0, 1000, 'move', [first, second]), second);
  const resized = moveOrResizePlacement(second, 200, 10, 1000, 'resize', [first, second]);
  assert.equal(resized.width, 56);
  assert.equal(resized.height, 190);
  assert.equal(resized.x, 38);
  const bounded = moveOrResizePlacement(first, 0, 500, 1000, 'move', [first], 360);
  assert.equal(bounded.y, 180);
  assert.equal(savePlacements('user-a', [first, resized]), true);
  assert.deepEqual(loadPlacements('user-a')[1], resized);
});

test('archive suspends visibility, restore resumes, orphan stays hidden, removal only affects reference', () => {
  const placement = addGymPlacement([], 'n1', 'p1');
  const ids = new Set(['n1']);
  assert.equal(placementsForNotes(placement, ids, new Set()).length, 1);
  assert.equal(placementsForNotes(placement, ids, new Set(['n1'])).length, 0);
  assert.equal(placementsForNotes(placement, ids, new Set()).length, 1);
  assert.equal(placementsForNotes(placement, new Set(), new Set()).length, 0);
  assert.deepEqual(removePlacement(placement, 'n1'), []);
  assert.equal(placement.length, 1);
});

test('privacy preview reveals no stored title, text or tags', () => {
  const note: Postit = { id: 'n1', title: 'Privado', text: '80 kg', tags: ['fuerza'], date: '2026-10-22' };
  assert.deepEqual(placementNotePreview(note, true), { title: 'Nota privada', text: '', tags: [] });
  assert.deepEqual(placementNotePreview(note, false), { title: 'Privado', text: '80 kg', tags: ['fuerza'] });
});

test('Gym surface reads original note and hides archived or private content without changing records', () => {
  mockStorage();
  const note: Postit = { id: 'n1', title: 'Press banca', text: '80 kg', tags: ['fuerza'], date: '2026-10-22' };
  const notes = [note];
  const gymRecord = { sessions: [{ id: 's1', title: 'Sesión previa' }] };
  const before = structuredClone({ notes, gymRecord });
  savePlacements('user-a', addGymPlacement([], note.id, 'p1'));
  const render = (privacyMode: boolean, input: Postit[]) => renderToStaticMarkup(React.createElement(GymNoteSurface, {
    notes: input, storageUserId: 'user-a', privacyMode, onOpenNote: () => {},
  }));
  assert.match(render(false, notes), /Press banca/);
  assert.match(render(false, notes), /80 kg/);
  assert.doesNotMatch(render(true, notes), /Press banca|80 kg|fuerza/);
  assert.equal(render(false, [{ ...note, archived: true }]), '');
  assert.deepEqual({ notes, gymRecord }, before);
});
