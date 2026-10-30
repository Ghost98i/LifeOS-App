import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxSale } from './commercialSaleSandbox';
import { confirmSandboxFinishedWaste, confirmSandboxPreparedSale, confirmSandboxProduction, finishedStock, previewSandboxFinishedWaste, previewSandboxPreparedSale,
  previewSandboxProduction, type SandboxProductionSession } from './commercialProductionSandbox';

function fixture() {
  let inventory = emptySandboxInventory();
  inventory = addSandboxItem(inventory, 'Pan', 'unit', 9, 90);
  inventory = addSandboxItem(inventory, 'Carne', 'kg', 1.8, 90);
  inventory = addSandboxItem(inventory, 'Tomate', 'kg', 0.9, 45);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Hamburguesa', ingredients: [
    { itemId: inventory.items[0].id, quantity: 1, unit: 'unit' },
    { itemId: inventory.items[1].id, quantity: 200, unit: 'g' },
    { itemId: inventory.items[2].id, quantity: 100, unit: 'g' },
  ], directCost: 12, salePrice: 100 });
  const session: SandboxProductionSession = { inventory, finished: emptySandboxInventory(), productions: [], sales: [] };
  return { session, recipe };
}

test('vista previa es pura y el circuito del ejemplo no consume ingredientes dos veces', () => {
  const { session, recipe } = fixture();
  const before = structuredClone(session);
  const preview = previewSandboxProduction(session.inventory, { id: 'production-1', recipe, units: 3 });
  assert.equal(preview.totalCostCents, 11100);
  assert.deepEqual(session, before);
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  assert.deepEqual(produced.session.inventory.items.map((item) => sandboxItemSummary(produced.session.inventory, item.id).quantity), [6, 1.2, 0.6]);
  assert.deepEqual(finishedStock(produced.session, recipe.id), { quantity: 3, unit: 'unit', valueCents: 11100, averageUnitCost: 37 });
  const beforeSaleIngredients = structuredClone(produced.session.inventory);
  const salePreview = previewSandboxPreparedSale(produced.session, { id: 'prepared-1', recipe, units: 2 });
  assert.equal(salePreview.totals?.totalCostCents, 7400);
  assert.equal(finishedStock(produced.session, recipe.id).quantity, 3);
  const sold = confirmSandboxPreparedSale(produced.session, { id: 'prepared-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.deepEqual(sold.session.inventory, beforeSaleIngredients);
  assert.equal(finishedStock(sold.session, recipe.id).quantity, 1);
  assert.equal(sold.sale.revenueCents, 20000);
  assert.equal(sold.sale.totalCostCents, 7400);
  assert.equal(sold.sale.grossProfitCents, 12600);
  assert.equal(sold.sale.grossMarginPercent, 63);
  assert.equal(sold.sale.source, 'prepared');
  assert.equal(sold.session.sales.length, 1);
  assert.equal(Object.keys(sold.session).some((key) => key === 'finance'), false);
});

test('insuficiencia de un ingrediente bloquea toda la producción', () => {
  const { session, recipe } = fixture();
  const before = structuredClone(session);
  const result = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 10 });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.session, before);
  assert.deepEqual(session, before);
});

test('repetir producción o venta no duplica unidades ni movimientos', () => {
  const { session, recipe } = fixture();
  const request = { id: 'production-1', recipe, units: 3 };
  const produced = confirmSandboxProduction(session, request);
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const repeated = confirmSandboxProduction(produced.session, request);
  assert.equal(repeated.status, 'already_confirmed');
  assert.strictEqual(repeated.session, produced.session);
  const saleRequest = { id: 'prepared-1', recipe, units: 2 };
  const sold = confirmSandboxPreparedSale(produced.session, saleRequest);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const again = confirmSandboxPreparedSale(sold.session, saleRequest);
  assert.equal(again.status, 'already_confirmed');
  assert.strictEqual(again.session, sold.session);
  assert.equal(confirmSandboxPreparedSale(sold.session, { ...saleRequest, units: 1 }).status, 'blocked');
});

test('venta superior al stock terminado bloquea todo', () => {
  const { session, recipe } = fixture();
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const before = structuredClone(produced.session);
  const result = confirmSandboxPreparedSale(produced.session, { id: 'prepared-1', recipe, units: 4 });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.session, before);
});

test('producciones sucesivas aplican promedio móvil sin reescribir historia', () => {
  const { session, recipe } = fixture();
  const first = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const afterReceipt = { ...first.session, inventory: addSandboxReceipt(first.session.inventory, session.inventory.items[0].id, 3, 'unit', 60) };
  const second = confirmSandboxProduction(afterReceipt, { id: 'production-2', recipe, units: 3 });
  assert.equal(second.status, 'confirmed');
  if (second.status !== 'confirmed') return;
  assert.equal(second.session.productions?.[0].totalCostCents, 11100);
  assert.notEqual(second.production.totalCostCents, 11100);
  const sold = confirmSandboxPreparedSale(second.session, { id: 'prepared-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const expected = Math.round((second.session.productions![0].totalCostCents + second.production.totalCostCents) / 3);
  assert.equal(sold.sale.totalCostCents, expected);
  assert.equal(sold.session.productions?.[0].totalCostCents, 11100);
  assert.equal(sold.session.finished?.movements[0].costCents, 11100);
});

test('edición posterior de receta y venta al momento siguen independientes', () => {
  const { session, recipe } = fixture();
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const changed = { ...recipe, directCostCents: 5000, salePriceCents: 20000 };
  const sold = confirmSandboxPreparedSale(produced.session, { id: 'prepared-1', recipe: changed, units: 1 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.equal(sold.sale.totalCostCents, 3700);
  assert.equal(sold.sale.revenueCents, 20000);
  assert.equal(sold.session.productions?.[0].recipeSnapshot.directCostCents, 1200);
  const atMoment = confirmSandboxSale(sold.session, { id: 'moment-1', recipe, units: 1 });
  assert.equal(atMoment.status, 'confirmed');
  if (atMoment.status !== 'confirmed') return;
  assert.equal(atMoment.sale.source, 'made_to_order');
  assert.equal(finishedStock(atMoment.session, recipe.id).quantity, 2);
});

test('una venta y una pérdida de tres preparadas conservan una unidad sin tocar ingredientes', () => {
  const { session, recipe } = fixture();
  const costSixty = { ...recipe, directCostCents: 3500 };
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe: costSixty, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  assert.equal(produced.production.totalCostCents, 18000);
  const ingredientsAfterProduction = structuredClone(produced.session.inventory);
  const sold = confirmSandboxPreparedSale(produced.session, { id: 'sale-1', recipe: costSixty, units: 1 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const beforePreview = structuredClone(sold.session);
  const preview = previewSandboxFinishedWaste(sold.session, { id: 'waste-1', recipeId: recipe.id,
    recipeName: recipe.name, units: 1 });
  assert.deepEqual([preview.available, preview.remaining, preview.costCents], [2, 1, 6000]);
  assert.deepEqual(sold.session, beforePreview);
  const lost = confirmSandboxFinishedWaste(sold.session, { id: 'waste-1', recipeId: recipe.id,
    recipeName: recipe.name, units: 1 });
  assert.equal(lost.status, 'confirmed');
  if (lost.status !== 'confirmed') return;
  assert.deepEqual(lost.session.inventory, ingredientsAfterProduction);
  assert.equal(lost.session.sales.length, 1);
  assert.equal(lost.session.productions?.length, 1);
  assert.equal(lost.session.finishedWastes?.length, 1);
  assert.equal(lost.session.finished?.operations.at(-1)?.kind, 'waste');
  assert.equal(lost.waste.costCents, 6000);
  assert.equal(finishedStock(lost.session, recipe.id).quantity, 1);
  assert.equal(finishedStock(lost.session, recipe.id).valueCents, 6000);
  assert.equal(sold.sale.revenueCents, 10000);
  assert.equal(sold.sale.totalCostCents, 6000);
  assert.equal(sold.sale.grossProfitCents, 4000);
  assert.equal(sold.sale.grossProfitCents - lost.waste.costCents, -2000);
  assert.equal(Object.keys(lost.session).includes('finance'), false);
});

test('pérdida parcial, total e insuficiente aplican todo o nada', () => {
  const { session, recipe } = fixture();
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const before = structuredClone(produced.session);
  const invalid = confirmSandboxFinishedWaste(produced.session, { id: 'waste-bad', recipeId: recipe.id,
    recipeName: recipe.name, units: 4 });
  assert.equal(invalid.status, 'blocked');
  assert.deepEqual(invalid.session, before);
  assert.equal(confirmSandboxFinishedWaste(produced.session, { id: 'waste-zero', recipeId: recipe.id,
    recipeName: recipe.name, units: 0 }).status, 'blocked');
  const partial = confirmSandboxFinishedWaste(produced.session, { id: 'waste-1', recipeId: recipe.id,
    recipeName: recipe.name, units: 1 });
  assert.equal(partial.status, 'confirmed');
  if (partial.status !== 'confirmed') return;
  assert.equal(finishedStock(partial.session, recipe.id).quantity, 2);
  const total = confirmSandboxFinishedWaste(partial.session, { id: 'waste-2', recipeId: recipe.id,
    recipeName: recipe.name, units: 2 });
  assert.equal(total.status, 'confirmed');
  if (total.status !== 'confirmed') return;
  assert.equal(finishedStock(total.session, recipe.id).quantity, 0);
  assert.equal(finishedStock(total.session, recipe.id).valueCents, 0);
  assert.deepEqual(total.session.inventory, before.inventory);
});

test('reintento idéntico de pérdida no duplica descuento ni historia', () => {
  const { session, recipe } = fixture();
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const request = { id: 'waste-1', recipeId: recipe.id, recipeName: recipe.name, units: 1 };
  const first = confirmSandboxFinishedWaste(produced.session, request);
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const repeated = confirmSandboxFinishedWaste(first.session, request);
  assert.equal(repeated.status, 'already_confirmed');
  assert.strictEqual(repeated.session, first.session);
  assert.equal(first.session.finishedWastes?.length, 1);
  assert.equal(confirmSandboxFinishedWaste(first.session, { ...request, units: 2 }).status, 'blocked');
  assert.equal(confirmSandboxFinishedWaste(first.session, { ...request, recipeName: 'Otra' }).status, 'blocked');
});

test('pérdida posterior a preparaciones de distintos costos usa promedio móvil y congela historia', () => {
  const { session, recipe } = fixture();
  const first = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const replenished = { ...first.session, inventory: addSandboxReceipt(first.session.inventory,
    session.inventory.items[0].id, 3, 'unit', 60) };
  const second = confirmSandboxProduction(replenished, { id: 'production-2', recipe, units: 3 });
  assert.equal(second.status, 'confirmed');
  if (second.status !== 'confirmed') return;
  const stockBefore = finishedStock(second.session, recipe.id);
  const lost = confirmSandboxFinishedWaste(second.session, { id: 'waste-1', recipeId: recipe.id,
    recipeName: recipe.name, units: 2 });
  assert.equal(lost.status, 'confirmed');
  if (lost.status !== 'confirmed') return;
  assert.equal(lost.waste.costCents, Math.round(stockBefore.valueCents * 2 / 6));
  assert.equal(finishedStock(lost.session, recipe.id).valueCents, stockBefore.valueCents - lost.waste.costCents);
  assert.equal(lost.session.productions?.[0].totalCostCents, first.production.totalCostCents);
  assert.equal(lost.session.finished?.movements[0].costCents, first.production.totalCostCents);
  const sale = confirmSandboxPreparedSale(lost.session, { id: 'sale-1', recipe, units: 1 });
  assert.equal(sale.status, 'confirmed');
  if (sale.status !== 'confirmed') return;
  assert.equal(sale.session.finishedWastes?.[0].costCents, lost.waste.costCents);
  assert.equal(sale.session.inventory, lost.session.inventory);
});
