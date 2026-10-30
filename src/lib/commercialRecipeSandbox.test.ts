import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { estimateSandboxRecipe, suggestedPriceCents, upsertSandboxRecipe } from './commercialRecipeSandbox';

test('hamburguesa de cuatro ingredientes: costo, desglose y margen sin consumir stock', () => {
  let inventory = emptySandboxInventory();
  inventory = addSandboxItem(inventory, 'Pollo', 'kg', 2, 800);
  inventory = addSandboxItem(inventory, 'Pan', 'unit', 20, 300);
  inventory = addSandboxItem(inventory, 'Lechuga', 'kg', 0.6, 120);
  inventory = addSandboxItem(inventory, 'Tomate', 'kg', 0.6, 60);
  const before = structuredClone(inventory);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Hamburguesa de pollo', ingredients: [
    { itemId: inventory.items[0].id, quantity: 100, unit: 'g' },
    { itemId: inventory.items[1].id, quantity: 1, unit: 'unit' },
    { itemId: inventory.items[2].id, quantity: 30, unit: 'g' },
    { itemId: inventory.items[3].id, quantity: 30, unit: 'g' },
  ], directCost: 0, salePrice: 150 });
  const result = estimateSandboxRecipe(inventory, recipe, 12);
  assert.deepEqual(result.estimate?.componentCosts.map((component) => component.costCents), [4000, 1500, 600, 300]);
  assert.equal(result.estimate?.unitCostCents, 6400);
  assert.equal(result.estimate?.marginCents, 8600);
  assert.ok(Math.abs(result.estimate!.marginPercent! - 57.333333333333336) < 1e-8);
  assert.deepEqual(result.insufficientForRequest, []);
  assert.deepEqual(inventory, before);
  assert.equal(inventory.movements.length, 4);
  assert.equal(inventory.movements.some((movement) => movement.kind !== 'receipt'), false);
});

test('editar receta recalcula, pero no registra movimientos; costos nuevos cambian solo estimaciones futuras', () => {
  const first = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 10, 150);
  const id = first.items[0].id;
  const [recipe] = upsertSandboxRecipe([], first, { name: 'Sándwich', ingredients: [{ itemId: id, quantity: 1, unit: 'unit' }], directCost: 2, salePrice: 30 });
  assert.equal(estimateSandboxRecipe(first, recipe, 1).estimate?.unitCostCents, 1700);
  const used = addSandboxExit(first, id, 'consumption', 2, 'unit');
  const pastCost = used.movements[1].costCents;
  const replenished = addSandboxReceipt(used, id, 2, 'unit', 50);
  assert.equal(estimateSandboxRecipe(replenished, recipe, 1).estimate?.unitCostCents, 1900);
  const [edited] = upsertSandboxRecipe([recipe], replenished, { id: recipe.id, name: recipe.name,
    ingredients: [{ itemId: id, quantity: 2, unit: 'unit' }], directCost: 2, salePrice: 45 });
  assert.equal(estimateSandboxRecipe(replenished, edited, 1).estimate?.unitCostCents, 3600);
  assert.equal(replenished.movements[1].costCents, pastCost);
  assert.equal(replenished.movements.length, 3);
});

test('agotado conserva historial y receta; reponer recupera la estimación', () => {
  const received = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 2, 30);
  const id = received.items[0].id;
  const [recipe] = upsertSandboxRecipe([], received, { name: 'Tostado', ingredients: [{ itemId: id, quantity: 1, unit: 'unit' }], directCost: 0, salePrice: null });
  const depleted = addSandboxExit(received, id, 'consumption', 2, 'unit');
  assert.equal(sandboxItemSummary(depleted, id).quantity, 0);
  assert.equal(depleted.items.length, 1);
  assert.equal(depleted.movements.length, 2);
  assert.deepEqual(estimateSandboxRecipe(depleted, recipe, 1).missingForOne, ['Pan']);
  assert.equal(estimateSandboxRecipe(depleted, recipe, 1).estimate, null);
  const restocked = addSandboxReceipt(depleted, id, 5, 'unit', 100);
  assert.equal(estimateSandboxRecipe(restocked, recipe, 1).estimate?.unitCostCents, 2000);
  assert.equal(depleted.movements[1].costCents, 3000);
});

test('existencias insuficientes para cantidad solicitada no bloquean costo por unidad', () => {
  const inventory = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 3, 45);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Tostado', ingredients: [{ itemId: inventory.items[0].id, quantity: 1, unit: 'unit' }], directCost: 0, salePrice: 30 });
  const result = estimateSandboxRecipe(inventory, recipe, 5);
  assert.equal(result.estimate?.unitCostCents, 1500);
  assert.deepEqual(result.missingForOne, []);
  assert.deepEqual(result.insufficientForRequest, ['Pan']);
});

test('rechaza referencias, cantidades, unidades y márgenes inválidos', () => {
  const inventory = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 2, 30);
  const id = inventory.items[0].id;
  const base = { name: 'Tostado', ingredients: [{ itemId: id, quantity: 1, unit: 'unit' as const }], directCost: 0, salePrice: 30 };
  assert.throws(() => upsertSandboxRecipe([], inventory, { ...base, ingredients: [{ itemId: 'missing', quantity: 1, unit: 'unit' }] }), /inexistente/);
  assert.throws(() => upsertSandboxRecipe([], inventory, { ...base, ingredients: [{ itemId: id, quantity: 0, unit: 'unit' }] }), /Cantidad inválida/);
  assert.throws(() => upsertSandboxRecipe([], inventory, { ...base, ingredients: [{ itemId: id, quantity: 1, unit: 'kg' }] }), /Unidad incompatible/);
  assert.throws(() => upsertSandboxRecipe([], inventory, { ...base, ingredients: [base.ingredients[0], base.ingredients[0]] }), /una sola vez/);
  assert.throws(() => upsertSandboxRecipe([], inventory, { ...base, directCost: 0.001 }), /dos decimales/);
  assert.throws(() => suggestedPriceCents(6400, 100), /margen objetivo/);
  assert.throws(() => suggestedPriceCents(6400, -1), /margen objetivo/);
  assert.throws(() => suggestedPriceCents(0, 50), /Costo estimado/);
  assert.throws(() => suggestedPriceCents(6400, 50.001), /dos decimales/);
  assert.equal(suggestedPriceCents(6400, 50), 12800);
  assert.equal(suggestedPriceCents(6400, 57.33), 14999);
});
