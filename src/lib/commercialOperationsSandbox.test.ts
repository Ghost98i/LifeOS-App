import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxSale } from './commercialSaleSandbox';
import { confirmSandboxProduction, confirmSandboxPreparedSale, type SandboxProductionSession } from './commercialProductionSandbox';
import { confirmSandboxPreparedSaleCorrection, confirmSandboxSaleAdjustment, previewSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { confirmSandboxDirectSale, parseDirectSaleUnitPrice, previewSandboxDirectSale } from './commercialDirectSaleSandbox';

test('precio decimal de venta directa conserva centavos y rechaza precisión inválida', () => {
  const { session, itemId } = directFixture();
  assert.equal(parseDirectSaleUnitPrice('19,99'), 1999);
  assert.equal(parseDirectSaleUnitPrice('19.99'), 1999);
  const request = { id: 'decimal', itemId, units: 2, unitPriceCents: parseDirectSaleUnitPrice('19,99')! };
  const result = confirmSandboxDirectSale(session, request);
  assert.equal(result.status, 'confirmed');
  if (result.status !== 'confirmed') return;
  assert.equal(result.sale.revenueCents, 3998);
  for (const invalid of ['19,999', '19.999', '-2', '0', 'abc', '']) assert.equal(parseDirectSaleUnitPrice(invalid), null);
});

function directFixture() {
  const inventory = addSandboxItem(emptySandboxInventory(), 'Placa de video', 'unit', 2, 600);
  const session: SandboxProductionSession = { inventory, sales: [], finished: emptySandboxInventory(),
    productions: [], finishedWastes: [], saleCorrections: [] };
  return { session, itemId: inventory.items[0].id };
}

const directRequest = (itemId: string, id = 'direct-1', units = 1) => ({ id, itemId, units, unitPriceCents: 40000 });
const adjustment = (saleId: string, id: string, kind: 'correction' | 'return', disposition: 'restock' | 'discard' | 'retain_consumed', units = 1) =>
  ({ id, saleId, kind, disposition, units, confirmedUndelivered: kind === 'correction' });

test('compra temporal y venta directa descuentan una placa con costo y resultado congelados', () => {
  const { session, itemId } = directFixture();
  const before = structuredClone(session);
  const preview = previewSandboxDirectSale(session, directRequest(itemId));
  assert.equal(preview.totals?.totalCostCents, 30000);
  assert.deepEqual(session, before);
  const sold = confirmSandboxDirectSale(session, directRequest(itemId));
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.deepEqual([sold.sale.revenueCents, sold.sale.totalCostCents, sold.sale.grossProfitCents, sold.sale.grossMarginPercent],
    [40000, 30000, 10000, 25]);
  assert.equal(sold.sale.source, 'direct');
  assert.equal(sold.sale.recipeSnapshot, null);
  assert.equal(sandboxItemSummary(sold.session.inventory, itemId).quantity, 1);
  assert.equal(sold.session.inventory.operations.at(-1)?.kind, 'sale');
  assert.equal(confirmSandboxDirectSale(sold.session, directRequest(itemId)).status, 'already_confirmed');
  assert.equal(Object.keys(sold.session).includes('finance'), false);
});

test('venta directa inválida no aplica cambios y el reintento con otro contenido se bloquea', () => {
  const { session, itemId } = directFixture();
  assert.equal(confirmSandboxDirectSale(session, directRequest(itemId, 'bad', 3)).status, 'blocked');
  assert.equal(confirmSandboxDirectSale(session, { ...directRequest(itemId), unitPriceCents: 0 }).status, 'blocked');
  assert.equal(sandboxItemSummary(session.inventory, itemId).quantity, 2);
  const first = confirmSandboxDirectSale(session, directRequest(itemId));
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  assert.equal(confirmSandboxDirectSale(first.session, { ...directRequest(itemId), unitPriceCents: 50000 }).status, 'blocked');
});

test('corrección parcial y total de venta directa restituyen el costo original sin borrar la venta', () => {
  const { session, itemId } = directFixture();
  const sold = confirmSandboxDirectSale(session, directRequest(itemId, 'direct-1', 2));
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const first = confirmSandboxSaleAdjustment(sold.session, adjustment('direct-1', 'adjust-1', 'correction', 'restock'));
  assert.equal(first.status, 'confirmed');
  if (first.status !== 'confirmed') return;
  assert.equal(first.adjustment.costCents, 30000);
  assert.equal(sandboxItemSummary(first.session.inventory, itemId).quantity, 1);
  assert.equal(first.session.sales[0].revenueCents, 80000);
  assert.equal(confirmSandboxSaleAdjustment(first.session, adjustment('direct-1', 'adjust-1', 'correction', 'restock')).status, 'already_confirmed');
  const second = confirmSandboxSaleAdjustment(first.session, adjustment('direct-1', 'adjust-2', 'correction', 'restock'));
  assert.equal(second.status, 'confirmed');
  if (second.status !== 'confirmed') return;
  assert.equal(sandboxItemSummary(second.session.inventory, itemId).quantity, 2);
  assert.equal(second.session.saleCorrections?.reduce((sum, entry) => sum + entry.costCents, 0), 60000);
  assert.equal(confirmSandboxSaleAdjustment(second.session, adjustment('direct-1', 'adjust-3', 'correction', 'restock')).status, 'blocked');
});

test('devolución directa reutilizable reingresa; inutilizable conserva costo físico una sola vez', () => {
  const { session, itemId } = directFixture();
  const sold = confirmSandboxDirectSale(session, directRequest(itemId, 'direct-1', 2));
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.equal(previewSandboxSaleAdjustment(sold.session, adjustment('direct-1', 'return-0', 'return', '' as 'restock')).valid, false);
  const reusable = confirmSandboxSaleAdjustment(sold.session, adjustment('direct-1', 'return-1', 'return', 'restock'));
  assert.equal(reusable.status, 'confirmed');
  if (reusable.status !== 'confirmed') return;
  assert.equal(sandboxItemSummary(reusable.session.inventory, itemId).quantity, 1);
  assert.equal(reusable.adjustment.physicalLossCostCents, 0);
  const damaged = confirmSandboxSaleAdjustment(reusable.session, adjustment('direct-1', 'return-2', 'return', 'discard'));
  assert.equal(damaged.status, 'confirmed');
  if (damaged.status !== 'confirmed') return;
  assert.equal(sandboxItemSummary(damaged.session.inventory, itemId).quantity, 1);
  assert.equal(damaged.adjustment.physicalLossCostCents, 30000);
  assert.equal(damaged.session.saleCorrections?.length, 2);
  assert.equal(damaged.session.sales[0].totalCostCents, 60000);
  assert.equal(previewSandboxSaleAdjustment(damaged.session, adjustment('direct-1', 'extra', 'return', 'discard')).valid, false);
  assert.equal(confirmSandboxSaleAdjustment(damaged.session, adjustment('direct-1', 'return-2', 'return', 'discard')).status, 'already_confirmed');
});

test('venta al momento corrige ingreso sin restituir ingredientes; devolución tampoco los repone', () => {
  let inventory = addSandboxItem(emptySandboxInventory(), 'Pan', 'unit', 3, 30);
  inventory = addSandboxItem(inventory, 'Carne', 'kg', 0.3, 30);
  const [recipe] = upsertSandboxRecipe([], inventory, { name: 'Hamburguesa', ingredients: [
    { itemId: inventory.items[0].id, quantity: 1, unit: 'unit' },
    { itemId: inventory.items[1].id, quantity: 100, unit: 'g' },
  ], directCost: 0, salePrice: 50 });
  const session: SandboxProductionSession = { inventory, sales: [], finished: emptySandboxInventory(), saleCorrections: [] };
  const sold = confirmSandboxSale(session, { id: 'moment-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const beforeIngredients = structuredClone(sold.session.inventory);
  assert.equal(confirmSandboxSaleAdjustment(sold.session, adjustment('moment-1', 'invalid', 'correction', 'restock')).status, 'blocked');
  const corrected = confirmSandboxSaleAdjustment(sold.session, adjustment('moment-1', 'adjust-1', 'correction', 'retain_consumed'));
  assert.equal(corrected.status, 'confirmed');
  if (corrected.status !== 'confirmed') return;
  assert.deepEqual(corrected.session.inventory, beforeIngredients);
  assert.equal(corrected.adjustment.physicalLossCostCents, 2000);
  const returned = confirmSandboxSaleAdjustment(corrected.session, adjustment('moment-1', 'return-1', 'return', 'discard'));
  assert.equal(returned.status, 'confirmed');
  if (returned.status !== 'confirmed') return;
  assert.deepEqual(returned.session.inventory, beforeIngredients);
  assert.equal(returned.session.saleCorrections?.reduce((sum, entry) => sum + (entry.physicalLossCostCents ?? 0), 0), 4000);
  assert.equal(returned.session.sales[0].totalCostCents, 4000);
});

test('venta preparada conserva corrección anterior y devolución sin restock alimentario', () => {
  const { session, itemId } = directFixture();
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Producto elaborado', ingredients: [
    { itemId, quantity: 1, unit: 'unit' },
  ], directCost: 0, salePrice: 500 });
  const produced = confirmSandboxProduction(session, { id: 'production-1', recipe, units: 2 });
  assert.equal(produced.status, 'confirmed');
  if (produced.status !== 'confirmed') return;
  const sold = confirmSandboxPreparedSale(produced.session, { id: 'prepared-1', recipe, units: 2 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const beforeIngredients = structuredClone(sold.session.inventory);
  const oldCorrection = confirmSandboxPreparedSaleCorrection(sold.session, { id: 'old-1', saleId: 'prepared-1', units: 1, confirmedUndelivered: true });
  assert.equal(oldCorrection.status, 'confirmed');
  if (oldCorrection.status !== 'confirmed') return;
  const returned = confirmSandboxSaleAdjustment(oldCorrection.session, adjustment('prepared-1', 'return-1', 'return', 'discard'));
  assert.equal(returned.status, 'confirmed');
  if (returned.status !== 'confirmed') return;
  assert.deepEqual(returned.session.inventory, beforeIngredients);
  assert.equal(returned.session.finished?.items.length, 1);
  assert.equal(returned.session.finished?.movements.at(-1)?.kind, 'receipt');
  assert.equal(returned.adjustment.physicalLossCostCents, 30000);
  assert.equal(confirmSandboxPreparedSaleCorrection(returned.session, { id: 'return-1', saleId: 'prepared-1', units: 1, confirmedUndelivered: true }).status, 'blocked');
  assert.equal(confirmSandboxSaleAdjustment(returned.session, adjustment('prepared-1', 'extra', 'return', 'discard')).status, 'blocked');
});

test('precio nuevo de adquisición no altera costos históricos ni ajustes previos', () => {
  const { session, itemId } = directFixture();
  const sold = confirmSandboxDirectSale(session, directRequest(itemId));
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const more = { ...sold.session, inventory: addSandboxReceipt(sold.session.inventory, itemId, 1, 'unit', 600) };
  const returned = confirmSandboxSaleAdjustment(more, adjustment('direct-1', 'return-1', 'return', 'restock'));
  assert.equal(returned.status, 'confirmed');
  if (returned.status !== 'confirmed') return;
  assert.equal(returned.adjustment.costCents, 30000);
  assert.equal(returned.session.sales[0].totalCostCents, 30000);
  assert.equal(sandboxItemSummary(returned.session.inventory, itemId).valueCents, 120000);
});
