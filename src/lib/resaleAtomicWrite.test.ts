import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTransactionalRevisions, isFirestorePermissionDenied, ResaleProtocolConflict, writeCloudModulesGuarded } from './cloudSync';
import { defaultState } from './storage';

const group = [
  { module: 'resale' as const, revision: 'base-r' },
  { module: 'finance' as const, revision: 'base-f' },
];

test('revisiones vigentes permiten preparar el grupo completo', () => {
  assert.deepEqual(classifyTransactionalRevisions(group, [
    { revision: 'base-r', protocol: 1 }, { revision: 'base-f', protocol: 1 },
  ]), { diverged: [], incompatible: [] });
});

test('dos clientes de la misma base: el segundo detecta la revisión publicada por el primero', () => {
  assert.deepEqual(classifyTransactionalRevisions(group, [
    { revision: 'new-r', protocol: 1 }, { revision: 'base-f', protocol: 1 },
  ]).diverged, ['resale']);
});

test('cambio entre lectura inicial y publicación bloquea cualquier módulo obsoleto del grupo', () => {
  const result = classifyTransactionalRevisions(group, [
    { revision: 'base-r', protocol: 1 }, { revision: 'new-f', protocol: 1 },
  ]);
  assert.deepEqual(result.diverged, ['finance']);
});

test('revisión ausente y protocolo superior se identifican separadamente', () => {
  const result = classifyTransactionalRevisions(group, [
    { revision: null, protocol: 1 }, { revision: 'base-f', protocol: 999 },
  ]);
  assert.deepEqual(result.diverged, ['resale']);
  assert.deepEqual(result.incompatible, ['finance']);
});

test('el protocolo comercial futuro bloquea resale aunque la revisión sea vigente', () => {
  const result = classifyTransactionalRevisions(group, [
    { revision: 'base-r', protocol: 3 }, { revision: 'base-f', protocol: 1 },
  ]);
  assert.deepEqual(result.diverged, []);
  assert.deepEqual(result.incompatible, ['resale']);
});

test('una revisión vigente no autoriza sobrescribir un protocolo remoto malformado', () => {
  for (const protocol of ['3', 0, -1, 1.5, Number.NaN, undefined]) {
    const result = classifyTransactionalRevisions(group, [
      { revision: 'base-r', protocol }, { revision: 'base-f', protocol: 1 },
    ]);
    assert.deepEqual(result.diverged, []);
    assert.deepEqual(result.incompatible, ['resale']);
  }
  assert.deepEqual(classifyTransactionalRevisions(group, [
    { revision: 'base-r', protocol: 1 }, { revision: 'base-f', protocol: 2 },
  ]), { diverged: [], incompatible: [] });
});

test('un marcador comercial remoto bloquea este cliente aun si declara protocolo legacy', () => {
  const result = classifyTransactionalRevisions(group, [
    { revision: 'base-r', protocol: 1, commercialProtocol: 1 },
    { revision: 'base-f', protocol: 1 },
  ]);
  assert.deepEqual(result.diverged, []);
  assert.deepEqual(result.incompatible, ['resale']);
});

test('un estado local commercial no se publica mientras el productor sigue deshabilitado', async () => {
  const state = defaultState();
  state.resale.commercial = { items: [], operations: [], movements: [] };
  await assert.rejects(
    writeCloudModulesGuarded('test-user', state, ['resale', 'finance'], 'test-device', {}),
    (error: unknown) => error instanceof ResaleProtocolConflict && error.modules.includes('resale'),
  );
  assert.deepEqual(state.resale.commercial, { items: [], operations: [], movements: [] });
});

test('permission-denied se reconoce por código sin atribuirle una causa comercial', () => {
  assert.equal(isFirestorePermissionDenied({ code: 'permission-denied', message: 'rules rejected' }), true);
  assert.equal(isFirestorePermissionDenied({ code: 'firestore/permission-denied' }), true);
  assert.equal(isFirestorePermissionDenied({ code: 'unavailable' }), false);
  assert.equal(isFirestorePermissionDenied(new Error('PERMISSION_DENIED: causa desconocida')), false);
  assert.equal(isFirestorePermissionDenied(new ResaleProtocolConflict(['resale'])), false);
});
