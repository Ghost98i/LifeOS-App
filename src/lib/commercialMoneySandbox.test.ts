import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { confirmSandboxDirectSale } from './commercialDirectSaleSandbox';
import { confirmSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxSale } from './commercialSaleSandbox';
import { confirmSandboxPreparedSale, confirmSandboxProduction } from './commercialProductionSandbox';
import { confirmSandboxMoneyEvent, planSandboxFinanceEffect, recordSandboxPurchase,
  planSandboxNonCashEffect, sandboxMoneySummary, sandboxPurchaseBalance, sandboxSaleBalance, type SandboxMoneyRequest,
  type SandboxMoneySession } from './commercialMoneySandbox';

const empty = (): SandboxMoneySession => ({ inventory: emptySandboxInventory(), sales: [], purchases: [], moneyEvents: [] });
const request = (id: string, purpose: SandboxMoneyRequest['purpose'], sourceId: string, amountCents: number,
  finance: SandboxMoneyRequest['finance'] = { mode: 'new' }): SandboxMoneyRequest =>
  ({ id, purpose, sourceId, amountCents, accountRef: 'caja simulada', finance });
function confirmed(session: SandboxMoneySession, entry: SandboxMoneyRequest) {
  const result = confirmSandboxMoneyEvent(session, entry);
  assert.equal(result.status, 'confirmed', result.status === 'blocked' ? result.issues.join(', ') : '');
  return result.session;
}
function purchase(session: SandboxMoneySession, name: string, quantity: number, totalCost: number) {
  return recordSandboxPurchase(session, addSandboxItem(session.inventory, name, 'unit', quantity, totalCost));
}
function sell(session: SandboxMoneySession, id: string, units: number, priceCents: number) {
  const result = confirmSandboxDirectSale(session, { id, itemId: session.inventory.items[0].id, units, unitPriceCents: priceCents });
  assert.equal(result.status, 'confirmed');
  return result.session;
}

test('purchase, payment, direct sale and partial then final receipts remain distinct', () => {
  let session = purchase(empty(), 'Placa', 2, 600);
  const purchaseId = session.purchases![0].id;
  assert.equal(sandboxPurchaseBalance(session, purchaseId)?.pendingCents, 60000);
  session = confirmed(session, request('pay1', 'purchase_payment', purchaseId, 60000));
  session = sell(session, 'sale1', 1, 40000);
  assert.equal(sandboxItemSummary(session.inventory, session.inventory.items[0].id).quantity, 1);
  assert.equal(sandboxSaleBalance(session, 'sale1')?.pendingCents, 40000);
  session = confirmed(session, request('receipt1', 'sale_receipt', 'sale1', 15000));
  assert.equal(sandboxSaleBalance(session, 'sale1')?.pendingCents, 25000);
  session = confirmed(session, request('receipt2', 'sale_receipt', 'sale1', 25000));
  const summary = sandboxMoneySummary(session);
  assert.equal(summary.grossProfitCents, 10000);
  assert.equal(summary.receivedCents, 40000);
  assert.equal(summary.paidCents, 60000);
  assert.equal(summary.receivableCents, 0);
  assert.equal(summary.simulatedCashFlowCents, -20000);
  assert.equal(session.inventory.movements.length, 2);
});

test('ten panes: direct sale, full receipt and purchase payment keep commercial and cash results separate', () => {
  let session = purchase(empty(), 'Pan', 10, 100);
  const purchaseId = session.purchases![0].id;
  session = sell(session, 'sale-pan', 3, 3000);
  const itemId = session.inventory.items[0].id;
  const inventoryAfterSale = JSON.stringify(session.inventory);
  const beforeCash = sandboxMoneySummary(session);

  assert.equal(sandboxItemSummary(session.inventory, itemId).quantity, 7);
  assert.equal(session.inventory.movements.at(-1)?.costCents, 3000);
  assert.equal(session.sales[0].ingredientCostCents, 3000);
  assert.equal(beforeCash.activeRevenueCents, 9000);
  assert.equal(beforeCash.activeSoldCostCents, 3000);
  assert.equal(beforeCash.grossProfitCents, 6000);
  assert.equal(beforeCash.receivableCents, 9000);
  assert.equal(beforeCash.payableCents, 10000);

  session = confirmed(session, request('receipt-pan', 'sale_receipt', 'sale-pan', 9000));
  session = confirmed(session, request('payment-pan', 'purchase_payment', purchaseId, 10000));
  const afterCash = sandboxMoneySummary(session);
  assert.equal(afterCash.receivableCents, 0);
  assert.equal(afterCash.payableCents, 0);
  assert.equal(afterCash.receivedCents, 9000);
  assert.equal(afterCash.paidCents, 10000);
  assert.equal(afterCash.grossProfitCents, 6000);
  assert.equal(afterCash.simulatedCashFlowCents, -1000);
  assert.equal(JSON.stringify(session.inventory), inventoryAfterSale);
});

test('partial purchase payment, later payment and use do not pay twice', () => {
  let session = purchase(empty(), 'Panes', 20, 600);
  const id = session.purchases![0].id;
  session = confirmed(session, request('p1', 'purchase_payment', id, 20000));
  assert.equal(sandboxPurchaseBalance(session, id)?.pendingCents, 40000);
  session = { ...session, inventory: addSandboxExit(session.inventory, session.inventory.items[0].id, 'consumption', 12, 'unit') };
  assert.equal(sandboxMoneySummary(session).paidCents, 20000);
  session = confirmed(session, request('p2', 'purchase_payment', id, 40000));
  assert.equal(sandboxPurchaseBalance(session, id)?.pendingCents, 0);
  assert.equal(confirmSandboxMoneyEvent(session, request('p3', 'purchase_payment', id, 1)).status, 'blocked');
});

test('new acquisitions preserve earlier costs and have their own payment obligation', () => {
  let session = purchase(empty(), 'Placa', 2, 600);
  session = sell(session, 's1', 1, 40000);
  const firstCost = session.sales[0].totalCostCents;
  session = recordSandboxPurchase(session, addSandboxReceipt(session.inventory, session.inventory.items[0].id, 2, 'unit', 1000));
  assert.equal(session.sales[0].totalCostCents, firstCost);
  assert.equal(session.purchases?.length, 2);
  assert.equal(sandboxMoneySummary(session).payableCents, 160000);
});

test('idempotent confirmations and excess limits have no partial effects', () => {
  let session = purchase(empty(), 'Placa', 1, 300);
  session = sell(session, 's1', 1, 40000);
  const entry = request('r1', 'sale_receipt', 's1', 15000);
  session = confirmed(session, entry);
  const frozen = JSON.stringify(session);
  assert.equal(confirmSandboxMoneyEvent(session, entry).status, 'already_confirmed');
  assert.equal(confirmSandboxMoneyEvent(session, { finance: { mode: 'new' }, accountRef: 'caja simulada',
    amountCents: 15000, sourceId: 's1', purpose: 'sale_receipt', id: 'r1' }).status, 'already_confirmed');
  assert.equal(confirmSandboxMoneyEvent(session, request('r1', 'sale_receipt', 's1', 14000)).status, 'blocked');
  assert.equal(confirmSandboxMoneyEvent(session, request('r2', 'sale_receipt', 's1', 26000)).status, 'blocked');
  assert.equal(JSON.stringify(session), frozen);
});

test('correction before collection leaves no refund; after collection creates refundable excess', () => {
  let session = sell(purchase(empty(), 'Placa', 2, 600), 's1', 2, 40000);
  let adjusted = confirmSandboxSaleAdjustment(session, { id: 'a1', saleId: 's1', units: 1,
    kind: 'correction', disposition: 'restock', confirmedUndelivered: true });
  assert.equal(adjusted.status, 'confirmed');
  assert.equal(sandboxSaleBalance(adjusted.session, 's1')?.refundableCents, 0);
  assert.equal(sandboxSaleBalance(adjusted.session, 's1')?.pendingCents, 40000);
  session = confirmed(session, request('r1', 'sale_receipt', 's1', 60000));
  adjusted = confirmSandboxSaleAdjustment(session, { id: 'a1', saleId: 's1', units: 1,
    kind: 'correction', disposition: 'restock', confirmedUndelivered: true });
  assert.equal(adjusted.status, 'confirmed');
  assert.equal(sandboxSaleBalance(adjusted.session, 's1')?.refundableCents, 20000);
  assert.equal(sandboxMoneySummary(adjusted.session).grossProfitCents, 10000);
});

test('return of reusable stock and unusable stock count historical cost exactly once', () => {
  let session = sell(purchase(empty(), 'Placa', 2, 600), 's1', 2, 40000);
  session = confirmed(session, request('r1', 'sale_receipt', 's1', 80000));
  const reusable = confirmSandboxSaleAdjustment(session, { id: 'a1', saleId: 's1', units: 1,
    kind: 'return', disposition: 'restock' });
  assert.equal(reusable.status, 'confirmed');
  const damaged = confirmSandboxSaleAdjustment(reusable.session, { id: 'a2', saleId: 's1', units: 1,
    kind: 'return', disposition: 'discard' });
  assert.equal(damaged.status, 'confirmed');
  const balance = sandboxSaleBalance(damaged.session, 's1')!;
  assert.equal(balance.activeSoldCostCents, 0);
  assert.equal(balance.physicalLossCents, 30000);
  assert.equal(balance.refundableCents, 80000);
  assert.equal(sandboxMoneySummary(damaged.session).physicalLossCents, 30000);
  assert.equal(confirmSandboxSaleAdjustment(damaged.session, { id: 'a3', saleId: 's1', units: 1,
    kind: 'return', disposition: 'discard' }).status, 'blocked');
});

test('refunds require actual simulated receipts and prior commercial adjustment', () => {
  let session = sell(purchase(empty(), 'Placa', 1, 300), 's1', 1, 40000);
  assert.equal(confirmSandboxMoneyEvent(session, request('f0', 'customer_refund', 's1', 1)).status, 'blocked');
  session = confirmed(session, request('r1', 'sale_receipt', 's1', 40000));
  const adjusted = confirmSandboxSaleAdjustment(session, { id: 'a1', saleId: 's1', units: 1,
    kind: 'return', disposition: 'discard' });
  assert.equal(adjusted.status, 'confirmed');
  session = confirmed(adjusted.session, request('f1', 'customer_refund', 's1', 15000));
  assert.equal(sandboxSaleBalance(session, 's1')?.refundableCents, 25000);
  assert.equal(confirmSandboxMoneyEvent(session, request('f2', 'customer_refund', 's1', 25001)).status, 'blocked');
  session = confirmed(session, request('f2', 'customer_refund', 's1', 25000));
  assert.equal(sandboxSaleBalance(session, 's1')?.refundableCents, 0);
  assert.equal(sandboxMoneySummary(session).physicalLossCents, 30000);
});

test('existing financial reference never plans a second transaction', () => {
  let session = purchase(empty(), 'Placa', 1, 300);
  const event = request('p1', 'purchase_payment', session.purchases![0].id, 30000,
    { mode: 'existing', transactionId: 'finance-tx-1' });
  session = confirmed(session, event);
  const plan = planSandboxFinanceEffect(session.moneyEvents![0]);
  assert.equal(plan.status, 'existing_reference_unverified');
  assert.equal(confirmSandboxMoneyEvent(session, request('p2', 'purchase_payment', session.purchases![0].id, 1,
    { mode: 'existing', transactionId: 'finance-tx-1' })).status, 'blocked');
  assert.equal(planSandboxFinanceEffect({ ...session.moneyEvents![0], finance: { mode: 'new' } }).status, 'pending_create');
});

test('invalid purchase recording does not mutate the original session', () => {
  const session = empty();
  const frozen = JSON.stringify(session);
  assert.throws(() => recordSandboxPurchase(session, session.inventory));
  assert.equal(JSON.stringify(session), frozen);
});

test('prepared sale collects money without another ingredient use or purchase payment', () => {
  let session = empty();
  session = recordSandboxPurchase(session, addSandboxItem(session.inventory, 'Pan', 'unit', 3, 90));
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Pan preparado',
    ingredients: [{ itemId: session.inventory.items[0].id, quantity: 1, unit: 'unit' }],
    directCost: 0, salePrice: 100 });
  const prepared = confirmSandboxProduction(session, { id: 'production1', recipe, units: 2 });
  assert.equal(prepared.status, 'confirmed');
  const sold = confirmSandboxPreparedSale(prepared.session, { id: 'sale1', recipe, units: 1 });
  assert.equal(sold.status, 'confirmed');
  const before = structuredClone(sold.session.inventory);
  const collected = confirmed(sold.session, request('receipt1', 'sale_receipt', 'sale1', 10000));
  assert.deepEqual(collected.inventory, before);
  assert.equal(sandboxMoneySummary(collected).paidCents, 0);
  assert.equal(sandboxMoneySummary(collected).payableCents, 9000);
  assert.equal(planSandboxNonCashEffect('production').status, 'none');
});

test('made-to-order adjustment changes commercial result but never restores ingredients or creates cash', () => {
  let session = recordSandboxPurchase(empty(), addSandboxItem(empty().inventory, 'Pan', 'unit', 1, 30));
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Preparación',
    ingredients: [{ itemId: session.inventory.items[0].id, quantity: 1, unit: 'unit' }],
    directCost: 0, salePrice: 100 });
  const sold = confirmSandboxSale(session, { id: 'sale1', recipe, units: 1 });
  assert.equal(sold.status, 'confirmed');
  session = sold.session;
  const adjusted = confirmSandboxSaleAdjustment(session, { id: 'adjustment1', saleId: 'sale1', units: 1,
    kind: 'correction', disposition: 'retain_consumed', confirmedUndelivered: true });
  assert.equal(adjusted.status, 'confirmed');
  assert.equal(sandboxItemSummary(adjusted.session.inventory, adjusted.session.inventory.items[0].id).quantity, 0);
  const summary = sandboxMoneySummary(adjusted.session);
  assert.equal(summary.activeRevenueCents, 0);
  assert.equal(summary.physicalLossCents, 3000);
  assert.equal(summary.receivedCents, 0);
  assert.equal(planSandboxNonCashEffect('sale_adjustment').status, 'none');
});
