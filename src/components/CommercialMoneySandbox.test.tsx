import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addSandboxItem, emptySandboxInventory } from '../lib/commercialInventorySandbox';
import { confirmSandboxDirectSale } from '../lib/commercialDirectSaleSandbox';
import { confirmSandboxSaleAdjustment } from '../lib/commercialCorrectionSandbox';
import { confirmSandboxMoneyEvent, recordSandboxPurchase, sandboxSaleBalance, type SandboxMoneySession } from '../lib/commercialMoneySandbox';
import { CommercialMoneySandbox, salePaymentStatus } from './CommercialMoneySandbox';

function fixture() {
  const initial: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], productions: [], finishedWastes: [], saleCorrections: [], purchases: [], moneyEvents: [] };
  const bought = recordSandboxPurchase(initial, addSandboxItem(initial.inventory, 'Pan', 'unit', 1, 200));
  const sold = confirmSandboxDirectSale(bought, { id: 'sale', itemId: bought.inventory.items[0].id, units: 1, unitPriceCents: 10000 });
  assert.equal(sold.status, 'confirmed');
  return { bought, sold: sold.session };
}

const html = (session: SandboxMoneySession) => renderToStaticMarkup(
  <CommercialMoneySandbox session={session} onConfirm={(request) => confirmSandboxMoneyEvent(session, request)} />,
);

test('compra pendiente y pérdida comercial siguen visibles sin una pared de operaciones saldadas', () => {
  const { bought, sold } = fixture();
  assert.match(html(bought), /Compras por pagar/);
  assert.match(html(bought), /Pagar.*200/);
  const rendered = html(sold);
  assert.match(rendered, /Pendiente de cobro/);
  assert.match(rendered, /text-rose-700 dark:text-rose-400[^>]*>−\$U 100/);
  assert.match(rendered, /commercial-money-sandbox/);
});

test('resultado tras pérdidas solo ocupa el primer plano cuando difiere de la ganancia bruta', () => {
  const { sold } = fixture();
  assert.doesNotMatch(html(sold), /Resultado tras pérdidas físicas/);
  const returnedDamaged = confirmSandboxSaleAdjustment(sold, { id: 'damaged', saleId: 'sale',
    kind: 'return', disposition: 'discard', units: 1 });
  assert.equal(returnedDamaged.status, 'confirmed');
  if (returnedDamaged.status !== 'confirmed') {
    return;
  }
  assert.match(html(returnedDamaged.session), /Resultado tras pérdidas físicas/);
  assert.match(html(returnedDamaged.session), /Pérdidas físicas/);
});

test('una venta ajustada sin cobro no se anuncia como cobrada', () => {
  const { sold } = fixture();
  const adjusted = confirmSandboxSaleAdjustment(sold, { id: 'fix', saleId: 'sale', kind: 'correction',
    disposition: 'restock', units: 1, confirmedUndelivered: true });
  assert.equal(adjusted.status, 'confirmed');
  if (adjusted.status !== 'confirmed') return;
  const balance = sandboxSaleBalance(adjusted.session, 'sale')!;
  assert.equal(salePaymentStatus(balance), 'Sin importe vigente');
  const rendered = html(adjusted.session);
  assert.match(rendered, /Sin importe vigente/);
  assert.match(rendered, /venta ajustada/);
  assert.doesNotMatch(rendered, /Cobrada \/ ajustada/);
});

test('un cobro anterior al ajuste muestra reembolso pendiente, no cobro nuevo', () => {
  const { sold } = fixture();
  const paid = confirmSandboxMoneyEvent(sold, { id: 'receipt', purpose: 'sale_receipt', sourceId: 'sale',
    amountCents: 10000, accountRef: 'caja de prueba', finance: { mode: 'new' } });
  assert.equal(paid.status, 'confirmed');
  if (paid.status !== 'confirmed') return;
  assert.equal(salePaymentStatus(sandboxSaleBalance(paid.session, 'sale')!), 'Cobrada');
  const adjusted = confirmSandboxSaleAdjustment(paid.session, { id: 'fix-paid', saleId: 'sale', kind: 'correction',
    disposition: 'restock', units: 1, confirmedUndelivered: true });
  assert.equal(adjusted.status, 'confirmed');
  if (adjusted.status !== 'confirmed') return;
  assert.equal(salePaymentStatus(sandboxSaleBalance(adjusted.session, 'sale')!), 'Reembolso pendiente');
  assert.match(html(adjusted.session), /Reembolsar.*100/);
});
