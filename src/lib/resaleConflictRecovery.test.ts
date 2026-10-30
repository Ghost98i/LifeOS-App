import assert from 'node:assert/strict';
import test from 'node:test';
import { addRemoteResaleVersion, includeResaleConflictModules, loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './resaleConflictRecovery';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

const conflict: ResaleConflictRecord = {
  id: 'conflict-1', status: 'pending', createdAt: '2026-10-22T00:00:00.000Z',
  diagnostic: 'Revisión obsoleta', modules: ['resale', 'finance'],
  local: { resale: { inventory: [{ id: 'local-item' }] }, finance: { transactions: [{ id: 'local-tx' }] } },
  base: { resale: { inventory: [] } }, baseRevisions: { resale: 'base-1', finance: 'base-2' },
  remoteVersions: [{ data: { resale: { inventory: [{ id: 'remote-item' }] }, finance: { transactions: [{ id: 'remote-tx' }] } }, revisions: { resale: 'remote-1', finance: 'remote-2' } }],
};

test('guarda y recupera el conflicto completo después de una recarga simulada', () => {
  const storage = memoryStorage();
  assert.equal(saveResaleConflict('user-1', conflict, storage), true);
  assert.deepEqual(loadResaleConflict('user-1', storage), { status: 'loaded', record: conflict });
  assert.equal(loadResaleConflict('user-2', storage).status, 'none');
});

test('preserva ambas versiones y todas las revisiones remotas sin duplicar un reintento', () => {
  const second = addRemoteResaleVersion(conflict, { resale: { inventory: [{ id: 'remote-item-2' }] } }, { resale: 'remote-3' });
  assert.equal(second.remoteVersions.length, 2);
  assert.deepEqual(second.remoteVersions[0], conflict.remoteVersions[0]);
  assert.equal(addRemoteResaleVersion(second, second.remoteVersions[1].data, second.remoteVersions[1].revisions), second);
  assert.equal(conflict.remoteVersions.length, 1);
  assert.equal(conflict.local.finance && (conflict.local.finance as { transactions: unknown[] }).transactions.length, 1);
});

test('una escritura fallida o no verificable nunca se declara conservada', () => {
  const storage = memoryStorage();
  const quota = { getItem: storage.getItem, setItem: () => { throw new Error('quota'); } };
  assert.equal(saveResaleConflict('user', conflict, quota), false);
  const noWrite = { getItem: storage.getItem, setItem: () => undefined };
  assert.equal(saveResaleConflict('user', conflict, noWrite), false);
  assert.equal(loadResaleConflict('user', storage).status, 'none');
  assert.equal(loadResaleConflict('user', { getItem: () => { throw new Error('denied'); } }).status, 'unavailable');
  assert.equal(loadResaleConflict('user', { getItem: () => '{broken' }).status, 'unavailable');
});

test('el respaldo confirmado permanece recuperable sin reactivar el bloqueo', () => {
  const storage = memoryStorage();
  const resolved: ResaleConflictRecord = { ...conflict, status: 'resolved', resolvedAt: '2026-10-22T01:00:00.000Z' };
  assert.equal(saveResaleConflict('user', resolved, storage), true);
  assert.deepEqual(loadResaleConflict('user', storage), { status: 'resolved', record: resolved });
});

test('un módulo finance añadido durante el bloqueo permanece en el mismo grupo tras recargar', () => {
  const initial: ResaleConflictRecord = { ...conflict, modules: ['resale'], local: { resale: conflict.local.resale }, baseRevisions: { resale: 'base-1' } };
  const finance = { transactions: [{ id: 'purchase-2', amount: 8000 }] };
  const extended = includeResaleConflictModules(initial, ['resale', 'finance'], { finance }, { finance: { transactions: [] } }, { finance: 'base-f' });
  assert.equal(extended.id, initial.id);
  assert.deepEqual(extended.modules, ['resale', 'finance']);
  assert.deepEqual(extended.local.resale, initial.local.resale);
  assert.deepEqual(extended.local.finance, finance);
  assert.equal(extended.baseRevisions.finance, 'base-f');
  assert.deepEqual(initial.modules, ['resale']);
  finance.transactions[0].amount = 1;
  assert.equal((extended.local.finance as typeof finance).transactions[0].amount, 8000);
  assert.equal(includeResaleConflictModules(extended, ['finance'], {}, {}, {}), extended);
  const storage = memoryStorage();
  assert.equal(saveResaleConflict('user-1', extended, storage), true);
  assert.deepEqual(loadResaleConflict('user-1', storage), { status: 'loaded', record: extended });
});
