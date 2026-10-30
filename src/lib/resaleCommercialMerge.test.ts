import assert from 'node:assert/strict';
import test from 'node:test';
import type { Resale } from '../types';
import type { CommercialSet } from './commercialContract';
import { mergeModuleData, mergeModuleDataWithConflicts, mergeResaleModule, previewResaleCommercialMerge } from './syncMerge';
import { mergeSyncModuleWithConflicts, syncDataFingerprint, syncModuleData } from './syncModel';
import { defaultState } from './storage';
import { ResaleProtocolConflict, writeCloudModules, writeCloudModulesAsync, writeCloudModulesGuarded } from './cloudSync';

type PreviewResale = Resale & { commercial?: CommercialSet };
const set = (): CommercialSet => ({
  items: [{ id: 'pan', name: 'Pan', unit: 'unit' }],
  operations: [{ id: 'buy', kind: 'receipt', status: 'closed', effectiveOrder: '001' }],
  movements: [{ id: 'in', operationId: 'buy', itemId: 'pan', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 10000 }],
});
const sale = (id: string, quantity: number, costCents: number): CommercialSet => ({
  items: [], operations: [{ id, kind: 'sale', status: 'closed', effectiveOrder: '002' }],
  movements: [{ id: `${id}-out`, operationId: id, itemId: 'pan', kind: 'sale', quantity, unit: 'unit', costCents }],
});
const resale = (commercial?: CommercialSet): PreviewResale => ({ opportunities: [], inventory: [],
  ...(commercial ? { commercial } : {}) });
const merge = (left: Resale, right: Resale) => mergeModuleDataWithConflicts('resale', { resale: left }, { resale: right });

test('Reventa antigua conserva exactamente su mezcla y no produce conflicto comercial', () => {
  const left: Resale = { opportunities: [], inventory: [{ id: 'a', item: 'Artículo', buyPrice: 100, buyDate: '2026-10-22', status: 'comprado' }] };
  const right = resale();
  assert.equal(previewResaleCommercialMerge(left, right), null);
  const result = merge(left, right);
  assert.deepEqual(result, { data: { resale: mergeResaleModule(left, right) }, conflicts: [] });
  assert.deepEqual(mergeModuleData('resale', { resale: left }, { resale: right }), result.data);
});

test('colecciones compatibles e idénticas generan una unión validada en preview, sin habilitar publicación', () => {
  const left = resale(set());
  const right = resale(sale('sell', 4, 4000));
  const preview = previewResaleCommercialMerge(left, right);
  assert.equal(preview?.status, 'combined');
  if (preview?.status === 'combined') assert.deepEqual(preview.combined.operations.map((operation) => operation.id), ['buy', 'sell']);
  const conflict = merge(left, right).conflicts[0];
  assert.equal(conflict.field, 'commercial_publication_disabled');
  assert.deepEqual(conflict.localValue, left);
  assert.deepEqual(conflict.remoteValue, right);
  assert.throws(() => mergeModuleData('resale', { resale: left }, { resale: right }), /bloqueada/);
  assert.equal(previewResaleCommercialMerge(left, structuredClone(left))?.status, 'combined');
  const retry = previewResaleCommercialMerge(left, structuredClone(left));
  if (retry?.status === 'combined') assert.equal(retry.combined.operations.length, 1);
});

test('mismo ID diferente, exceso de stock y costo histórico incorrecto bloquean y conservan ambas versiones', () => {
  const conflicting = structuredClone(set());
  conflicting.movements[0].costCents = 20000;
  const overA = { ...set(), operations: [...set().operations, ...sale('sell-a', 6, 6000).operations],
    movements: [...set().movements, ...sale('sell-a', 6, 6000).movements] };
  const overB = { ...set(), operations: [...set().operations, ...sale('sell-b', 6, 6000).operations],
    movements: [...set().movements, ...sale('sell-b', 6, 6000).movements] };
  const wrongCost = resale(sale('sell', 1, 999));
  for (const [left, right, code] of [
    [resale(set()), resale(conflicting), 'same_id_different_content'],
    [resale(overA), resale(overB), 'insufficient_stock'],
    [resale(set()), wrongCost, 'historical_cost_mismatch'],
  ] as const) {
    const preview = previewResaleCommercialMerge(left, right);
    assert.equal(preview?.status, 'blocked');
    if (preview?.status === 'blocked') assert.ok(preview.issues.some((issue) => issue.code === code));
    const result = merge(left, right);
    assert.equal(result.conflicts[0].field, 'commercial_reconcile_blocked');
    assert.deepEqual(result.conflicts[0].localValue, left);
    assert.deepEqual(result.conflicts[0].remoteValue, right);
  }
});

test('referencias incompletas o forma inválida bloquean sin reparar ni inventar datos', () => {
  const orphan = resale(sale('orphan', 1, 1000));
  const result = previewResaleCommercialMerge(resale(), orphan);
  assert.equal(result?.status, 'blocked');
  if (result?.status === 'blocked') assert.ok(result.issues.some((issue) => issue.code === 'missing_item'));
  const malformed = { opportunities: [], inventory: [], commercial: { operations: 'invalid' } } as unknown as Resale;
  const merged = merge(malformed, resale());
  assert.equal(merged.conflicts[0].field, 'commercial_reconcile_blocked');
  assert.deepEqual(merged.conflicts[0].localValue, malformed);
});

test('conflicto de Mi negocio no se considera resuelto ni modifica otros módulos o Finanzas', () => {
  const state = defaultState();
  state.finance.accounts[0].balance = 1234;
  (state.resale as PreviewResale).commercial = set();
  const before = structuredClone(state);
  const right = resale(sale('sell', 4, 4000));
  const result = mergeSyncModuleWithConflicts(state, 'resale', { resale: right });
  assert.equal(result.conflicts.length, 1);
  assert.strictEqual(result.state, state);
  assert.equal(syncDataFingerprint(result.state.finance), syncDataFingerprint(state.finance));
  assert.deepEqual(state, before);
  assert.throws(() => mergeResaleModule(state.resale, right), /resolución de sincronización/);
  assert.deepEqual(syncModuleData(state, 'finance'), syncModuleData(before, 'finance'));
});

test('ninguna ruta de publicación actual escribe una colección comercial, incluso si está en el estado', async () => {
  const state = defaultState();
  (state.resale as PreviewResale).commercial = set();
  const before = structuredClone(state);
  const args = ['test-user', state, ['resale', 'finance'] as const, 'test-device', {}] as const;
  assert.throws(() => writeCloudModules(args[0], args[1], [...args[2]], args[3], args[4]), ResaleProtocolConflict);
  await assert.rejects(writeCloudModulesAsync(args[0], args[1], [...args[2]], args[3], args[4]), ResaleProtocolConflict);
  await assert.rejects(writeCloudModulesGuarded(args[0], args[1], [...args[2]], args[3], args[4]), ResaleProtocolConflict);
  assert.deepEqual(state, before);
});
