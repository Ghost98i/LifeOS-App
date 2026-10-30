import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxItem, addSandboxReceipt, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxDirectSaleWithReceipt, confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary, type SandboxMoneySession } from './commercialMoneySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxPreparedSale, confirmSandboxProduction } from './commercialProductionSandbox';
import { captureDurableCommercial, recoverDurableCommercial, type DurableEventOrder } from './commercialDurable';

const now = { timing: 'now' as const, accountRef: 'caja simulada' };
const later = { timing: 'later' as const };

test('contado y pendiente sobreviven al contrato duradero con stock, receta, centavos e identidades intactos', () => {
  let session: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], purchases: [], productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] };
  const eventOrder: DurableEventOrder[] = [];
  const order = (kind: DurableEventOrder['kind'], id: string) => eventOrder.push({ kind, id,
    effectiveOrder: String(eventOrder.length + 1).padStart(12, '0'), commercialDate: '2026-10-24' });
  const bought = confirmSandboxPurchaseWithPayment(session,
    addSandboxItem(session.inventory, 'Pan', 'unit', 10, 100), now);
  assert.equal(bought.status, 'confirmed');
  if (bought.status !== 'confirmed') return;
  session = bought.session;
  const itemId = session.inventory.items[0].id;
  order('purchase', session.purchases!.at(-1)!.id);
  order('money', session.moneyEvents!.at(-1)!.id);
  const cashSale = { id: 'venta-contado', itemId, units: 3, unitPriceCents: 3000 };
  const sold = confirmSandboxDirectSaleWithReceipt(session, cashSale, now);
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  session = sold.session;
  order('sale', cashSale.id);
  order('money', session.moneyEvents!.at(-1)!.id);
  const pendingBuy = confirmSandboxPurchaseWithPayment(session,
    addSandboxReceipt(session.inventory, itemId, 5, 'unit', 75), later);
  assert.equal(pendingBuy.status, 'confirmed');
  if (pendingBuy.status !== 'confirmed') return;
  session = pendingBuy.session;
  const pendingPurchaseId = session.purchases!.at(-1)!.id;
  order('purchase', pendingPurchaseId);
  const pendingSale = { id: 'venta-pendiente', itemId, units: 2, unitPriceCents: 1999 };
  const secondSale = confirmSandboxDirectSaleWithReceipt(session, pendingSale, later);
  assert.equal(secondSale.status, 'confirmed');
  if (secondSale.status !== 'confirmed') return;
  session = secondSale.session;
  order('sale', pendingSale.id);
  for (const [id, purpose, sourceId, amountCents] of [
    ['pago-parcial', 'purchase_payment', pendingPurchaseId, 4000],
    ['cobro-parcial', 'sale_receipt', pendingSale.id, 1000],
  ] as const) {
    const result = confirmSandboxMoneyEvent(session, { id, purpose, sourceId, amountCents,
      accountRef: 'caja simulada', finance: { mode: 'new' } });
    assert.equal(result.status, 'confirmed');
    if (result.status !== 'confirmed') return;
    session = result.session;
    order('money', id);
  }
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Pan preparado',
    ingredients: [{ itemId, quantity: 1, unit: 'unit' }], directCost: 0, salePrice: 50 });
  const production = confirmSandboxProduction(session, { id: 'preparacion', recipe, units: 2 });
  assert.equal(production.status, 'confirmed');
  if (production.status !== 'confirmed') return;
  session = production.session;
  order('production', 'preparacion');
  const prepared = confirmSandboxPreparedSale(session, { id: 'venta-preparada', recipe, units: 1 });
  assert.equal(prepared.status, 'confirmed');
  if (prepared.status !== 'confirmed') return;
  session = prepared.session;
  order('sale', 'venta-preparada');

  const captured = captureDurableCommercial({ session, recipes: [recipe], currency: 'UYU',
    eventOrder, refundSources: [] });
  assert.equal(captured.status, 'valid', captured.status === 'blocked' ? captured.issues.map((issue) => issue.code).join(', ') : '');
  if (captured.status !== 'valid') return;
  const recovered = recoverDurableCommercial(captured.json);
  assert.equal(recovered.status, 'valid');
  if (recovered.status !== 'valid') return;
  assert.deepEqual(recovered.set, captured.set);
  assert.deepEqual(recovered.reconstructed.summary, sandboxMoneySummary(session));
  assert.equal(recovered.reconstructed.eventOrder[0].commercialDate, '2026-10-24');
  assert.equal(recovered.reconstructed.session.moneyEvents?.length, 4);
  assert.equal(recovered.reconstructed.session.inventory.items[0].id, itemId);
  assert.equal(recovered.reconstructed.summary.simulatedCashFlowCents, -4000);
  assert.equal(confirmSandboxDirectSaleWithReceipt(recovered.reconstructed.session, cashSale, now).status, 'already_confirmed');
  const inconsistentDate = structuredClone(captured.set);
  inconsistentDate.operations[0].commercialDate = '2026-10-23';
  const dateRead = recoverDurableCommercial(JSON.stringify(inconsistentDate));
  assert.equal(dateRead.status, 'blocked');
  if (dateRead.status === 'blocked') assert.ok(dateRead.issues.some((issue) => issue.code === 'commercial_date_mismatch'));
});

test('fecha inválida, moneda ausente y referencia rota bloquean recuperación sin sustituir el original', () => {
  const session: SandboxMoneySession = { inventory: emptySandboxInventory(), sales: [], purchases: [], moneyEvents: [] };
  const captured = captureDurableCommercial({ session, recipes: [], currency: 'UYU', eventOrder: [], refundSources: [] });
  assert.equal(captured.status, 'valid');
  if (captured.status !== 'valid') return;
  const undated = recoverDurableCommercial(captured.json);
  assert.equal(undated.status, 'valid');
  if (undated.status === 'valid') assert.deepEqual(undated.reconstructed.eventOrder, []);
  const invalidDate = structuredClone(captured.set);
  invalidDate.business!.eventOrder.push({ kind: 'money', id: 'missing', effectiveOrder: '1', commercialDate: '2026-02-30' });
  const result = recoverDurableCommercial(JSON.stringify(invalidDate));
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') {
    assert.deepEqual(result.original, invalidDate);
    assert.ok(result.issues.some((issue) => issue.code === 'invalid_commercial_date'));
  }
  const noCurrency = structuredClone(captured.set);
  noCurrency.business!.currency = '';
  assert.equal(recoverDurableCommercial(JSON.stringify(noCurrency)).status, 'blocked');
  assert.equal(recoverDurableCommercial('{bad').status, 'blocked');
});
