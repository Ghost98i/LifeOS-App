import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCommercialSet } from './commercialContract';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary, sandboxStockEntries } from './commercialInventorySandbox';

test('panes: entrada, consumo, merma y valoración disponible', () => {
  const empty = emptySandboxInventory();
  const received = addSandboxItem(empty, 'Panes', 'unit', 20, 600);
  const itemId = received.items[0].id;
  assert.deepEqual(sandboxItemSummary(received, itemId), { quantity: 20, unit: 'unit', valueCents: 60000, averageUnitCost: 30, consumed: 0, discarded: 0 });
  const consumed = addSandboxExit(received, itemId, 'consumption', 12, 'unit');
  const discarded = addSandboxExit(consumed, itemId, 'waste', 3, 'unit');
  assert.deepEqual(sandboxItemSummary(discarded, itemId), { quantity: 5, unit: 'unit', valueCents: 15000, averageUnitCost: 30, consumed: 12, discarded: 3 });
  assert.deepEqual(discarded.movements.map((movement) => movement.costCents), [60000, 36000, 9000]);
  assert.equal(validateCommercialSet(discarded).valid, true);
  assert.deepEqual(empty, emptySandboxInventory());
});

test('kg y g: conversión compatible, consumo fraccionario y stock completo', () => {
  const received = addSandboxItem(emptySandboxInventory(), 'Carne', 'kg', 2, 900);
  const itemId = received.items[0].id;
  const consumed = addSandboxExit(received, itemId, 'consumption', 500, 'g');
  assert.deepEqual(sandboxItemSummary(consumed, itemId), { quantity: 1.5, unit: 'kg', valueCents: 67500, averageUnitCost: 450, consumed: 0.5, discarded: 0 });
  const depleted = addSandboxExit(consumed, itemId, 'consumption', 1.5, 'kg');
  assert.equal(sandboxItemSummary(depleted, itemId).quantity, 0);
  assert.equal(sandboxItemSummary(depleted, itemId).valueCents, 0);
  assert.equal(validateCommercialSet(depleted).valid, true);
});

test('promedio móvil conserva costos históricos luego de una nueva entrada', () => {
  const first = addSandboxItem(emptySandboxInventory(), 'Panes', 'unit', 20, 600);
  const itemId = first.items[0].id;
  const used = addSandboxExit(first, itemId, 'consumption', 10, 'unit');
  const later = addSandboxReceipt(used, itemId, 10, 'unit', 400);
  assert.equal(later.movements[1].costCents, 30000);
  assert.deepEqual(sandboxItemSummary(later, itemId), { quantity: 20, unit: 'unit', valueCents: 70000, averageUnitCost: 35, consumed: 10, discarded: 0 });
  const more = addSandboxExit(later, itemId, 'waste', 2, 'unit');
  assert.equal(more.movements[3].costCents, 7000);
  assert.equal(more.movements[1].costCents, 30000);
  assert.equal(validateCommercialSet(more).valid, true);
});

test('rechaza entradas inválidas, unidades incompatibles y stock insuficiente sin mutar', () => {
  const received = addSandboxItem(emptySandboxInventory(), 'Panes', 'unit', 20, 600);
  const snapshot = structuredClone(received);
  const id = received.items[0].id;
  assert.throws(() => addSandboxExit(received, id, 'consumption', 21, 'unit'), /Existencias insuficientes/);
  assert.throws(() => addSandboxExit(received, id, 'waste', 0, 'unit'), /Cantidad inválida/);
  assert.throws(() => addSandboxExit(received, id, 'waste', 1, 'kg'), /Unidad incompatible/);
  assert.throws(() => addSandboxReceipt(received, id, 2, 'unit', NaN), /Costo inválido/);
  assert.throws(() => addSandboxReceipt(received, id, 2, 'unit', -1), /Costo inválido/);
  assert.throws(() => addSandboxItem(received, 'panes', 'unit', 1, 30), /ya existe/);
  assert.deepEqual(received, snapshot);
});

test('reponer un insumo agotado conserva identidad e historial y vuelve al stock activo', () => {
  let inventory = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 10, 150);
  const itemId = inventory.items[0].id;
  inventory = addSandboxExit(inventory, itemId, 'consumption', 10, 'unit');
  assert.deepEqual(sandboxStockEntries(inventory).filter(({ summary }) => summary.quantity > 0).map(({ item }) => item.id), []);
  assert.deepEqual(sandboxStockEntries(inventory).filter(({ summary }) => summary.quantity === 0).map(({ item }) => item.id), [itemId]);
  const restocked = addSandboxReceipt(inventory, itemId, 5, 'unit', 100);
  assert.equal(restocked.items.length, 1);
  assert.equal(restocked.items[0].id, itemId);
  assert.equal(restocked.movements.length, 3);
  assert.deepEqual(sandboxItemSummary(restocked, itemId), { quantity: 5, unit: 'unit', valueCents: 10000, averageUnitCost: 20, consumed: 10, discarded: 0 });
  assert.equal(restocked.movements[1].costCents, 15000);
  assert.deepEqual(sandboxStockEntries(restocked).filter(({ summary }) => summary.quantity > 0).map(({ item }) => item.id), [itemId]);
});
