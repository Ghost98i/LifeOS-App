import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_SCHEMA_VERSION, normalizeStoredState, parseBackupJSON } from './storage';

test('migra un estado antiguo conservando datos y agregando defaults', () => {
  const migrated = normalizeStoredState({
    finance: { transactions: [], categories: ['Comida'], accounts: [] },
  });

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(migrated.finance.categories.some((c) => c.name === 'Reventa'));
  assert.deepEqual(migrated.jobs.applications, []);
  assert.deepEqual(migrated.finance.transfers, []);
  assert.deepEqual(migrated.dailyPriorities, []);
  assert.deepEqual(migrated.dailyContext, []);
  assert.equal(migrated.profile.bodyCompositionSex, null);

  const invalidFormula = normalizeStoredState({ profile: { bodyCompositionSex: 'unknown' } });
  assert.equal(invalidFormula.profile.bodyCompositionSex, null);
});

test('agrega Mis cosas a backups anteriores sin perder notas', () => {
  const migrated = normalizeStoredState({ notes: { postits: [{ id: 'p1', text: 'Importante', date: '2026-09-01' }] } });
  assert.equal(migrated.notes.postits[0].text, 'Importante');
  assert.deepEqual(migrated.notes.possessions, []);
  const normalized = normalizeStoredState({ notes: { possessions: [{ id: 'gift', name: 'Campera', category: '', receivedAt: 123 }] } });
  assert.equal(normalized.notes.possessions[0].category, 'Otros');
  assert.equal(normalized.notes.possessions[0].receivedAt, null);
});

test('rechaza archivos JSON que no pertenecen a LifeOS', () => {
  assert.throws(() => parseBackupJSON('{"hello":"world"}'), /no parece pertenecer/);
});

test('normaliza streaming heredado garantizando arrays de checklist y pipeline', () => {
  const migrated = normalizeStoredState({
    streaming: { sessions: [{ id: 's1', date: '2026-09-17', hours: 2 }], monthlyGoal: 10 },
  });
  assert.equal(migrated.streaming.monthlyGoal, 10);
  assert.equal(migrated.streaming.sessions.length, 1);
  assert.deepEqual(migrated.streaming.preStreamChecklist, []);
  assert.deepEqual(migrated.streaming.contentPipeline, []);
});
