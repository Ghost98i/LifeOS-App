import assert from 'node:assert/strict';
import test from 'node:test';
import { applySyncModule, buildStateFromModules, changedSyncModules, classifyInitialModuleChanges, syncDataFingerprint, syncModuleData, syncModuleFingerprint } from './syncModel';
import { defaultState } from './storage';

test('sincroniza únicamente los módulos que cambiaron', () => {
  const before = defaultState();
  const after = structuredClone(before);
  after.profile.name = 'Christian';
  after.finance.accounts[0].balance = 1234;

  assert.deepEqual(changedSyncModules(before, after), ['profile', 'finance']);
});

test('la huella de sincronización no depende del orden de las claves', () => {
  assert.equal(syncDataFingerprint({ a: 1, b: { c: 2 } }), syncDataFingerprint({ b: { c: 2 }, a: 1 }));
  assert.notEqual(syncDataFingerprint({ a: 1 }), syncDataFingerprint({ a: 2 }));
});

test('al reabrir distingue cambios locales, remotos y simultáneos', () => {
  const baselineState = defaultState();
  const known = { finance: 'rev-1', notes: 'rev-1', tasks: 'rev-1' };
  const baselines = {
    finance: syncModuleFingerprint(baselineState, 'finance'),
    notes: syncModuleFingerprint(baselineState, 'notes'),
    tasks: syncModuleFingerprint(baselineState, 'tasks'),
  };
  const local = structuredClone(baselineState);
  local.finance.accounts[0].balance = 20;
  local.todayExtras.push({ id: 'local-task', date: '2026-08-13', text: 'Local', done: false, priority: 'media' });
  const remote = structuredClone(baselineState);
  remote.notes.postits.push({ id: 'remote-note', text: 'Remota', date: '2026-08-13' });
  remote.todayExtras.push({ id: 'remote-task', date: '2026-08-13', text: 'Remota', done: false, priority: 'media' });

  const result = classifyInitialModuleChanges(local, remote, known, baselines, { finance: 'rev-1', notes: 'rev-2', tasks: 'rev-2' });
  assert.deepEqual(result.local, ['finance']);
  assert.deepEqual(result.remote, ['notes']);
  assert.deepEqual(result.conflicts, ['tasks']);
});

test('aplica un módulo remoto sin reemplazar los demás', () => {
  const local = defaultState();
  local.profile.name = 'Local';
  const remote = defaultState();
  remote.finance.accounts[0].balance = 900;

  const merged = applySyncModule(local, 'finance', syncModuleData(remote, 'finance'));
  assert.equal(merged.profile.name, 'Local');
  assert.equal(merged.finance.accounts[0].balance, 900);
});

test('reconstruye un estado remoto modular con valores por defecto', () => {
  const source = defaultState();
  source.profile.name = 'Christian';
  const rebuilt = buildStateFromModules({ profile: syncModuleData(source, 'profile') });

  assert.equal(rebuilt.profile.name, 'Christian');
  assert.equal(rebuilt.finance.accounts.length, 2);
});
