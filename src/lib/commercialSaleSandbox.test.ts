import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxSale, previewSandboxSale, type SandboxSaleSession } from './commercialSaleSandbox';

function fixture(): { session: SandboxSaleSession; recipe: ReturnType<typeof upsertSandboxRecipe>[number] } {
  let inventory = emptySandboxInventory();
  inventory = addSandboxItem(inventory, 'Pan', 'unit', 8, 120);
  inventory = addSandboxItem(inventory, 'Carne', 'kg', 1.8, 270);
  inventory = addSandboxItem(inventory, 'Tomate', 'g', 400, 40);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Hamburguesa', ingredients: [
    { itemId: inventory.items[0].id, quantity: 1, unit: 'unit' },
    { itemId: inventory.items[1].id, quantity: 100, unit: 'g' },
    { itemId: inventory.items[2].id, quantity: 50, unit: 'g' },
  ], directCost: 20, salePrice: 110 });
  return { session: { inventory, sales: [] }, recipe };
}

test('vista previa informa cantidades y resultados sin modificar el inventario', () => {
  const { session, recipe } = fixture();
  const before = structuredClone(session);
  const preview = previewSandboxSale(session.inventory, { id: 'sale-1', recipe, units: 2 });
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.ingredients.map((item) => [item.quantity, item.unit, item.available, item.remaining, item.historicalCostCents]), [
    [2, 'unit', 8, 6, 3000], [200, 'g', 1800, 1600, 3000], [100, 'g', 400, 300, 1000],
  ]);
  assert.deepEqual(preview.totals, { unitPriceCents: 11000, revenueCents: 22000, ingredientCostCents: 7000,
    directCostCents: 4000, totalCostCents: 11000, grossProfitCents: 11000, grossMarginPercent: 50 });
  assert.deepEqual(session, before);
});

test('confirma una y varias unidades con una sola operación y costos históricos', () => {
  const { session, recipe } = fixture();
  const one = confirmSandboxSale(session, { id: 'sale-1', recipe, units: 1 });
  assert.equal(one.status, 'confirmed');
  if (one.status !== 'confirmed') return;
  assert.equal(one.sale.totalCostCents, 5500);
  assert.equal(one.sale.revenueCents, 11000);
  assert.equal(one.session.sales.length, 1);
  assert.equal(one.session.inventory.operations.length, session.inventory.operations.length + 1);
  const two = confirmSandboxSale(one.session, { id: 'sale-2', recipe, units: 2 });
  assert.equal(two.status, 'confirmed');
  if (two.status !== 'confirmed') return;
  assert.equal(two.sale.totalCostCents, 11000);
  assert.equal(two.sale.grossProfitCents, 11000);
  assert.equal(two.session.sales.length, 2);
  assert.deepEqual(two.session.inventory.movements.slice(-3).map((movement) => movement.costCents), [3000, 3000, 1000]);
});

test('dos hamburguesas dejan 6 panes, 1,6 kg de carne y 300 g de tomate', () => {
  const { session, recipe } = fixture();
  const result = confirmSandboxSale(session, { id: 'sale-1', recipe, units: 2 });
  assert.equal(result.status, 'confirmed');
  if (result.status !== 'confirmed') return;
  assert.equal(sandboxItemSummary(result.session.inventory, session.inventory.items[0].id).quantity, 6);
  assert.equal(sandboxItemSummary(result.session.inventory, session.inventory.items[1].id).quantity, 1.6);
  assert.equal(sandboxItemSummary(result.session.inventory, session.inventory.items[2].id).quantity, 300);
  assert.deepEqual(result.sale.ingredients.map((item) => item.historicalCostCents), [3000, 3000, 1000]);
  assert.equal(result.sale.directCostCents, 4000);
  assert.equal(result.sale.grossMarginPercent, 50);
  assert.equal(result.sale.source, 'made_to_order');
});

test('un insumo insuficiente bloquea todo, aunque otros alcancen', () => {
  const { session: initial, recipe } = fixture();
  const session = { ...initial, inventory: addSandboxExit(initial.inventory, initial.inventory.items[2].id, 'consumption', 350, 'g') };
  const before = structuredClone(session);
  const request = { id: 'sale-1', recipe, units: 2 };
  const preview = previewSandboxSale(session.inventory, request);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) => issue.includes('Tomate')));
  assert.equal(preview.issues.some((issue) => issue.includes('Pan')), false);
  const result = confirmSandboxSale(session, request);
  assert.equal(result.status, 'blocked');
  assert.equal(result.session, session);
  assert.deepEqual(session, before);
  assert.equal(session.sales.length, 0);
  assert.equal(session.inventory.movements.at(-1)?.kind, 'consumption');
});

test('reintento idéntico no duplica y mismo ID con contenido diferente bloquea', () => {
  const { session, recipe } = fixture();
  const request = { id: 'sale-1', recipe, units: 2 };
  const first = confirmSandboxSale(session, request);
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const repeated = confirmSandboxSale(first.session, request);
  assert.equal(repeated.status, 'already_confirmed');
  assert.equal(repeated.session, first.session);
  assert.equal(repeated.session.sales.length, 1);
  assert.equal(repeated.session.inventory.movements.length, first.session.inventory.movements.length);
  const incompatible = confirmSandboxSale(first.session, { ...request, units: 1 });
  assert.equal(incompatible.status, 'blocked');
  assert.equal(incompatible.session, first.session);
});

test('revalida existencias al confirmar y congela resultado ante reposición o edición de receta', () => {
  const { session, recipe } = fixture();
  const request = { id: 'sale-1', recipe, units: 2 };
  assert.equal(previewSandboxSale(session.inventory, request).valid, true);
  const depleted = confirmSandboxSale(session, { id: 'other-sale', recipe, units: 7 });
  assert.equal(depleted.status, 'confirmed');
  if (depleted.status !== 'confirmed') return;
  const blocked = confirmSandboxSale(depleted.session, request);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.session, depleted.session);
  const sold = confirmSandboxSale(session, request);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const oldSale = structuredClone(sold.sale);
  const replenished = addSandboxReceipt(sold.session.inventory, session.inventory.items[0].id, 8, 'unit', 240);
  const [edited] = upsertSandboxRecipe([recipe], replenished, { id: recipe.id, name: recipe.name,
    ingredients: [{ itemId: session.inventory.items[0].id, quantity: 2, unit: 'unit' }], directCost: 0, salePrice: 200 });
  assert.notDeepEqual(edited, recipe);
  assert.deepEqual(sold.session.sales[0], oldSale);
  assert.equal(replenished.movements.find((movement) => movement.operationId === sold.sale.operationId)?.costCents, 3000);
  assert.equal(sold.sale.recipeSnapshot.ingredients.length, 3);
});

test('cantidad y precio inválidos no consumen; el resultado no incluye movimientos financieros', () => {
  const { session, recipe } = fixture();
  assert.equal(confirmSandboxSale(session, { id: 'sale-1', recipe, units: 0 }).status, 'blocked');
  assert.equal(confirmSandboxSale(session, { id: 'sale-1', recipe: { ...recipe, salePriceCents: null }, units: 1 }).status, 'blocked');
  const result = confirmSandboxSale(session, { id: 'sale-1', recipe, units: 1 });
  assert.equal(result.status, 'confirmed');
  if (result.status !== 'confirmed') return;
  assert.equal('finance' in result.session, false);
  assert.equal('saleTxId' in result.sale, false);
  assert.equal('payment' in result.sale, false);
});
