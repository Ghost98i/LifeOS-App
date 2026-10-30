import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { confirmSandboxDirectSaleWithReceipt, confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary, type SandboxMoneySession } from './commercialMoneySandbox';
import { parseDirectSaleUnitPrice } from './commercialDirectSaleSandbox';

const empty = (): SandboxMoneySession => ({ inventory: emptySandboxInventory(), sales: [], purchases: [], moneyEvents: [] });
const now = { timing: 'now' as const, accountRef: 'caja simulada' };
const later = { timing: 'later' as const };

function buy(session: SandboxMoneySession, inventory: SandboxMoneySession['inventory'], timing = later as typeof later | typeof now) {
  const result = confirmSandboxPurchaseWithPayment(session, inventory, timing);
  assert.equal(result.status, 'confirmed', result.status === 'blocked' ? result.issues.join(', ') : '');
  return result.session;
}

test('compra al contado y venta cobrada registran un pago y un cobro sin duplicar stock', () => {
  let session = buy(empty(), addSandboxItem(empty().inventory, 'Pan', 'unit', 10, 100), now);
  const itemId = session.inventory.items[0].id;
  assert.equal(session.purchases?.length, 1);
  assert.equal(session.moneyEvents?.length, 1);
  assert.deepEqual([sandboxMoneySummary(session).paidCents, sandboxMoneySummary(session).payableCents], [10000, 0]);
  const request = { id: 'venta-pan', itemId, units: 3, unitPriceCents: 3000 };
  const sold = confirmSandboxDirectSaleWithReceipt(session, request, now);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  session = sold.session;
  assert.equal(sandboxItemSummary(session.inventory, itemId).quantity, 7);
  assert.equal(session.sales.length, 1);
  assert.equal(session.moneyEvents?.length, 2);
  const summary = sandboxMoneySummary(session);
  assert.deepEqual([summary.activeRevenueCents, summary.activeSoldCostCents, summary.grossProfitCents,
    summary.receivableCents, summary.payableCents, summary.simulatedCashFlowCents], [9000, 3000, 6000, 0, 0, -1000]);
  const again = confirmSandboxDirectSaleWithReceipt(session, request, now);
  assert.equal(again.status, 'already_confirmed');
  assert.equal(again.session, session);
});

test('compra pendiente, pago posterior, reposición pagada y uso sin pago adicional', () => {
  let session = buy(empty(), addSandboxItem(empty().inventory, 'Pan', 'unit', 10, 100));
  const itemId = session.inventory.items[0].id;
  assert.equal(sandboxMoneySummary(session).payableCents, 10000);
  const payment = confirmSandboxMoneyEvent(session, { id: 'pago-tardio', purpose: 'purchase_payment',
    sourceId: session.purchases![0].id, amountCents: 10000, accountRef: 'caja simulada', finance: { mode: 'new' } });
  assert.equal(payment.status, 'confirmed');
  if (payment.status !== 'confirmed') return;
  session = buy(payment.session, addSandboxReceipt(payment.session.inventory, itemId, 5, 'unit', 75), now);
  const beforeUse = session.moneyEvents?.length;
  session = { ...session, inventory: addSandboxExit(session.inventory, itemId, 'consumption', 2, 'unit') };
  assert.equal(session.moneyEvents?.length, beforeUse);
  assert.equal(sandboxItemSummary(session.inventory, itemId).quantity, 13);
  assert.equal(session.purchases?.length, 2);
  assert.equal(session.moneyEvents?.length, 2);
  assert.deepEqual([sandboxMoneySummary(session).paidCents, sandboxMoneySummary(session).payableCents], [17500, 0]);
});

test('venta pendiente admite cobro posterior y cobro parcial', () => {
  const session = buy(empty(), addSandboxItem(empty().inventory, 'Pan', 'unit', 10, 100));
  const sold = confirmSandboxDirectSaleWithReceipt(session,
    { id: 'venta', itemId: session.inventory.items[0].id, units: 3, unitPriceCents: 3000 }, later);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.equal(sandboxMoneySummary(sold.session).receivableCents, 9000);
  const partial = confirmSandboxMoneyEvent(sold.session, { id: 'cobro-1', purpose: 'sale_receipt',
    sourceId: 'venta', amountCents: 4000, accountRef: 'caja simulada', finance: { mode: 'new' } });
  assert.equal(partial.status, 'confirmed');
  if (partial.status !== 'confirmed') return;
  assert.equal(sandboxMoneySummary(partial.session).receivableCents, 5000);
  const complete = confirmSandboxMoneyEvent(partial.session, { id: 'cobro-2', purpose: 'sale_receipt',
    sourceId: 'venta', amountCents: 5000, accountRef: 'caja simulada', finance: { mode: 'new' } });
  assert.equal(complete.status, 'confirmed');
  if (complete.status !== 'confirmed') return;
  assert.equal(sandboxMoneySummary(complete.session).receivableCents, 0);
});

test('cuenta inválida impide por completo compra pagada y venta cobrada', () => {
  const initial = empty();
  const inventory = addSandboxItem(initial.inventory, 'Pan', 'unit', 10, 100);
  const blockedPurchase = confirmSandboxPurchaseWithPayment(initial, inventory, { timing: 'now', accountRef: '  ' });
  assert.equal(blockedPurchase.status, 'blocked');
  assert.equal(blockedPurchase.session, initial);
  assert.deepEqual(initial, empty());
  const purchased = buy(initial, inventory);
  const before = structuredClone(purchased);
  const blockedSale = confirmSandboxDirectSaleWithReceipt(purchased,
    { id: 'venta', itemId: inventory.items[0].id, units: 3, unitPriceCents: 3000 },
    { timing: 'now', accountRef: '' });
  assert.equal(blockedSale.status, 'blocked');
  assert.equal(blockedSale.session, purchased);
  assert.deepEqual(purchased, before);
  const excess = confirmSandboxDirectSaleWithReceipt(purchased,
    { id: 'exceso', itemId: inventory.items[0].id, units: 11, unitPriceCents: 3000 }, now);
  assert.equal(excess.status, 'blocked');
  assert.equal(excess.session, purchased);
});

test('precio 19,99 conserva 1999 centavos por unidad y no redondea el total', () => {
  const session = buy(empty(), addSandboxItem(empty().inventory, 'Artículo', 'unit', 3, 30), now);
  const sold = confirmSandboxDirectSaleWithReceipt(session,
    { id: 'decimal', itemId: session.inventory.items[0].id, units: 2,
      unitPriceCents: parseDirectSaleUnitPrice('19,99')! }, now);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  assert.deepEqual([sold.sale.revenueCents, sandboxMoneySummary(sold.session).receivedCents,
    sandboxItemSummary(sold.session.inventory, session.inventory.items[0].id).quantity], [3998, 3998, 1]);
});
