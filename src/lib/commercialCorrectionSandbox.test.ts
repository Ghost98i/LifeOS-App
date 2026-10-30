import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxItem, addSandboxReceipt, emptySandboxInventory } from './commercialInventorySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxSale } from './commercialSaleSandbox';
import { confirmSandboxFinishedWaste, confirmSandboxPreparedSale, confirmSandboxProduction,
  finishedStock, type SandboxProductionSession } from './commercialProductionSandbox';
import { confirmSandboxPreparedSaleCorrection, previewSandboxPreparedSaleCorrection } from './commercialCorrectionSandbox';

function fixture() {
  const inventory = addSandboxItem(emptySandboxInventory(), 'Insumo', 'unit', 9, 360);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Producto', ingredients: [
    { itemId: inventory.items[0].id, quantity: 1, unit: 'unit' },
  ], directCost: 0, salePrice: 100 });
  const session: SandboxProductionSession = { inventory, sales: [], finished: emptySandboxInventory(),
    productions: [], finishedWastes: [], saleCorrections: [] };
  return { session, recipe };
}

function soldTwo() {
  const { session, recipe } = fixture();
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') throw new Error('No se produjo el caso de prueba.');
  const sold = confirmSandboxPreparedSale(produced.session, { id: 'sale-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') throw new Error('No se vendió el caso de prueba.');
  return { session: sold.session, recipe, sale: sold.sale };
}

const correction = (units: number, id = 'correction-1') => ({ id, saleId: 'sale-1', units, confirmedUndelivered: true });

test('corrige una de dos unidades sin tocar la venta original ni los insumos', () => {
  const { session, recipe, sale } = soldTwo();
  const before = structuredClone(session);
  const withoutConsent = previewSandboxPreparedSaleCorrection(session, { ...correction(1), confirmedUndelivered: false });
  assert.equal(withoutConsent.valid, false);
  assert.equal(withoutConsent.currentRevenueCents, 10000);
  const preview = previewSandboxPreparedSaleCorrection(session, correction(1));
  assert.equal(preview.valid, true);
  assert.deepEqual([preview.currentRevenueCents, preview.currentCostCents, preview.currentGrossProfitCents, preview.stockAfter],
    [10000, 4000, 6000, 2]);
  assert.deepEqual(session, before);
  const result = confirmSandboxPreparedSaleCorrection(session, correction(1));
  assert.equal(result.status, 'confirmed');
  if (result.status !== 'confirmed') return;
  assert.equal(result.correction.saleId, sale.id);
  assert.equal(result.correction.unitPriceCents, 10000);
  assert.equal(result.correction.revenueReversalCents, 10000);
  assert.equal(result.correction.costCents, 4000);
  assert.equal(result.correction.grossProfitReversalCents, 6000);
  assert.equal(result.correction.reason, 'registro_erroneo_no_entregado');
  assert.equal(result.session.finished?.operations.at(-1)?.kind, 'receipt');
  assert.equal(finishedStock(result.session, recipe.id).quantity, 2);
  assert.deepEqual(result.session.inventory, before.inventory);
  assert.deepEqual(result.session.sales, before.sales);
  assert.deepEqual(result.session.productions, before.productions);
  assert.equal(result.session.sales[0].revenueCents, 20000);
  assert.equal(result.session.sales[0].totalCostCents, 8000);
  assert.equal(result.session.saleCorrections?.length, 1);
  assert.equal(Object.keys(result.session).includes('finance'), false);
});

test('corrección total y correcciones sucesivas no superan la venta', () => {
  const { session, recipe } = soldTwo();
  const first = confirmSandboxPreparedSaleCorrection(session, correction(1));
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const over = confirmSandboxPreparedSaleCorrection(first.session, correction(2, 'correction-2'));
  assert.equal(over.status, 'blocked');
  assert.strictEqual(over.session, first.session);
  const second = confirmSandboxPreparedSaleCorrection(first.session, correction(1, 'correction-2'));
  assert.equal(second.status, 'confirmed');
  if (second.status !== 'confirmed') return;
  assert.equal(finishedStock(second.session, recipe.id).quantity, 3);
  assert.equal(second.session.saleCorrections?.reduce((sum, item) => sum + item.costCents, 0), 8000);
  assert.equal(second.session.saleCorrections?.reduce((sum, item) => sum + item.revenueReversalCents, 0), 20000);
  assert.equal(previewSandboxPreparedSaleCorrection(second.session, correction(1, 'correction-3')).valid, false);
  const total = confirmSandboxPreparedSaleCorrection(session, correction(2));
  assert.equal(total.status, 'confirmed');
  if (total.status !== 'confirmed') return;
  assert.equal(total.correction.costCents, 8000);
  assert.equal(finishedStock(total.session, recipe.id).quantity, 3);
});

test('reintentos idénticos no restituyen dos veces y el mismo ID no se reutiliza', () => {
  const { session } = soldTwo();
  const first = confirmSandboxPreparedSaleCorrection(session, correction(1));
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const again = confirmSandboxPreparedSaleCorrection(first.session, correction(1));
  assert.equal(again.status, 'already_confirmed');
  assert.strictEqual(again.session, first.session);
  assert.equal(confirmSandboxPreparedSaleCorrection(first.session, correction(2)).status, 'blocked');
  assert.equal(confirmSandboxPreparedSaleCorrection(first.session, { ...correction(1), saleId: 'other' }).status, 'blocked');
});

test('venta al momento, unidad entregada y referencias ausentes no restituyen existencias', () => {
  const { session, recipe } = soldTwo();
  const moment = confirmSandboxSale(session, { id: 'moment-1', recipe, units: 1 });
  assert.equal(moment.status, 'confirmed');
  if (moment.status !== 'confirmed') return;
  const before = structuredClone(moment.session);
  assert.equal(confirmSandboxPreparedSaleCorrection(moment.session, { ...correction(1), confirmedUndelivered: false }).status, 'blocked');
  assert.equal(confirmSandboxPreparedSaleCorrection(moment.session, { ...correction(1), saleId: 'moment-1' }).status, 'blocked');
  assert.equal(confirmSandboxPreparedSaleCorrection(moment.session, { ...correction(1), saleId: 'missing' }).status, 'blocked');
  assert.deepEqual(moment.session, before);
});

test('costos redondeados de correcciones sucesivas suman exactamente el costo histórico', () => {
  const { session, recipe } = fixture();
  const cheap = { ...recipe, directCostCents: 0 };
  const first = confirmSandboxProduction(session, { id: 'production-1', recipe: cheap, units: 3 });
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const withReceipt = { ...first.session, inventory: addSandboxReceipt(first.session.inventory,
    session.inventory.items[0].id, 3, 'unit', 60) };
  const second = confirmSandboxProduction(withReceipt, { id: 'production-2', recipe: cheap, units: 3 });
  assert.equal(second.status, 'confirmed');
  if (second.status !== 'confirmed') return;
  const sale = confirmSandboxPreparedSale(second.session, { id: 'sale-1', recipe, units: 3 });
  assert.equal(sale.status, 'confirmed');
  if (sale.status !== 'confirmed') return;
  let current = sale.session;
  for (let index = 1; index <= 3; index++) {
    const result = confirmSandboxPreparedSaleCorrection(current, correction(1, `correction-${index}`));
    assert.equal(result.status, 'confirmed');
    if (result.status !== 'confirmed') return;
    current = result.session;
  }
  assert.equal(current.saleCorrections?.reduce((sum, item) => sum + item.costCents, 0), sale.sale.totalCostCents);
  assert.equal(current.saleCorrections?.reduce((sum, item) => sum + item.revenueReversalCents, 0), sale.sale.revenueCents);
  assert.equal(finishedStock(current, recipe.id).valueCents, finishedStock(second.session, recipe.id).valueCents);
  assert.equal(current.sales[0].totalCostCents, sale.sale.totalCostCents);
});

test('otras ventas y pérdidas conservan sus valores y la corrección usa el costo histórico vendido', () => {
  const { session, recipe } = fixture();
  const first = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 3 });
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  const sold = confirmSandboxPreparedSale(first.session, { id: 'sale-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const replenished = { ...sold.session, inventory: addSandboxReceipt(sold.session.inventory,
    session.inventory.items[0].id, 3, 'unit', 60) };
  const secondProduction = confirmSandboxProduction(replenished, { id: 'production-2', recipe, units: 3 });
  assert.equal(secondProduction.status, 'confirmed');
  if (secondProduction.status !== 'confirmed') return;
  const otherSale = confirmSandboxPreparedSale(secondProduction.session, { id: 'sale-2', recipe, units: 1 });
  assert.equal(otherSale.status, 'confirmed');
  if (otherSale.status !== 'confirmed') return;
  const waste = confirmSandboxFinishedWaste(otherSale.session, { id: 'waste-1', recipeId: recipe.id,
    recipeName: recipe.name, units: 1 });
  assert.equal(waste.status, 'confirmed');
  if (waste.status !== 'confirmed') return;
  const corrected = confirmSandboxPreparedSaleCorrection(waste.session, correction(1));
  assert.equal(corrected.status, 'confirmed');
  if (corrected.status !== 'confirmed') return;
  assert.equal(corrected.correction.costCents, 4000);
  assert.deepEqual(corrected.session.sales, waste.session.sales);
  assert.deepEqual(corrected.session.finishedWastes, waste.session.finishedWastes);
  assert.deepEqual(corrected.session.productions, waste.session.productions);
  assert.deepEqual(corrected.session.inventory, waste.session.inventory);
});
