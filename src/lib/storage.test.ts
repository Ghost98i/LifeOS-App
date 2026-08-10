import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_SCHEMA_VERSION, normalizeStoredState, parseBackupJSON } from './storage';

test('migra un estado antiguo conservando datos y agregando defaults', () => {
  const migrated = normalizeStoredState({
    finance: { transactions: [], categories: ['Comida'], accounts: [] },
  });

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(migrated.finance.categories.includes('Reventa'));
  assert.deepEqual(migrated.jobs.applications, []);
  assert.deepEqual(migrated.finance.transfers, []);
  assert.deepEqual(migrated.dailyPriorities, []);
  assert.deepEqual(migrated.dailyContext, []);
});

test('rechaza archivos JSON que no pertenecen a LifeOS', () => {
  assert.throws(() => parseBackupJSON('{"hello":"world"}'), /no parece pertenecer/);
});
