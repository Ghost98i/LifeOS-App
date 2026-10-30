import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import { emptySandboxInventory, sandboxStockBook } from './commercialInventorySandbox';
import { stockBalance } from './commercialInventory';
import { confirmSandboxPurchaseWithPayment, confirmSandboxDirectSaleWithReceipt } from './commercialImmediateSandbox';
import { confirmSandboxPurchaseAdjustment } from './commercialCorrectionSandbox';
import { confirmSandboxMoneyEvent, sandboxPurchaseBalance, sandboxSaleBalance, sandboxMoneySummary, type SandboxMoneySession } from './commercialMoneySandbox';
import { applyCommercialSnapshot } from './commercialProduction';
import { recoverDurableCommercial } from './commercialDurable';
import { deleteTransaction, updateTransaction } from './financeFlows';
import type { CommercialPilotSnapshot } from './commercialPilot';

test('Problem 2: Purchase -> partial payment -> purchase return -> supplier refund workflow', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  // 1. Initial inventory with a raw material item (0 stock)
  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-harina', name: 'Harina 000', unit: 'kg' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  const harina = session.inventory.items[0];

  // 2. Register purchase of 10 kg for $U 1000 ($U 100/kg), payment postponed ('later')
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-purchase-1', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-purchase-1', operationId: 'op-purchase-1', itemId: harina.id, kind: 'receipt', quantity: 10, unit: 'kg', costCents: 100000 },
    ],
  }, { timing: 'later' });
  assert.equal(purchaseRes.status, 'confirmed');
  session = purchaseRes.session;

  const pBalance1 = sandboxPurchaseBalance(session, 'op-purchase-1')!;
  assert.equal(pBalance1.activeAmountCents, 100000);
  assert.equal(pBalance1.paidCents, 0);
  assert.equal(pBalance1.pendingCents, 100000);
  assert.equal(pBalance1.refundableCents, 0);
  assert.equal(pBalance1.isAnnulled, false);
  assert.equal(stockBalance(sandboxStockBook(session.inventory), harina.id).quantity, 10);

  // 3. Partial payment of $U 600
  const payRes1 = confirmSandboxMoneyEvent(session, {
    id: 'pay-1',
    purpose: 'purchase_payment',
    sourceId: 'op-purchase-1',
    amountCents: 60000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(payRes1.status, 'confirmed');
  session = payRes1.session;

  const pBalance2 = sandboxPurchaseBalance(session, 'op-purchase-1')!;
  assert.equal(pBalance2.paidCents, 60000);
  assert.equal(pBalance2.pendingCents, 40000);
  assert.equal(pBalance2.refundableCents, 0);

  // 4. Return 5 kg to supplier (cost $U 500)
  // Current stock is 10 kg, returning 5 kg leaves 5 kg.
  const returnRes = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-return-1',
    purchaseId: 'op-purchase-1',
    units: 5,
    kind: 'return',
  });
  assert.equal(returnRes.status, 'confirmed');
  session = returnRes.session;

  // Inventory stock decreased to 5 kg
  assert.equal(stockBalance(sandboxStockBook(session.inventory), harina.id).quantity, 5);

  const pBalance3 = sandboxPurchaseBalance(session, 'op-purchase-1')!;
  // Active purchase amount reduced from 100000 to 50000
  assert.equal(pBalance3.activeAmountCents, 50000);
  assert.equal(pBalance3.returnedCostCents, 50000);
  assert.equal(pBalance3.paidCents, 60000);
  // Pending debt is 0 because we paid 60000 for a 50000 active purchase
  assert.equal(pBalance3.pendingCents, 0);
  // Refundable amount owed by supplier is 10000 ($U 100)
  assert.equal(pBalance3.refundableCents, 10000);
  assert.equal(pBalance3.isAnnulled, false);

  // 5. Devolución sin reembolso NO genera ingreso aún:
  const summaryBeforeRefund = sandboxMoneySummary(session);
  assert.equal(summaryBeforeRefund.supplierRefundedCents, 0);
  assert.equal(summaryBeforeRefund.supplierRefundableCents, 10000);

  // Attempting to collect more refund than refundableCents fails
  const excessRefund = confirmSandboxMoneyEvent(session, {
    id: 'ref-excess',
    purpose: 'supplier_refund',
    sourceId: 'op-purchase-1',
    amountCents: 15000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(excessRefund.status, 'blocked');

  // 6. Collect supplier refund of $U 100
  const refundRes = confirmSandboxMoneyEvent(session, {
    id: 'ref-1',
    purpose: 'supplier_refund',
    sourceId: 'op-purchase-1',
    amountCents: 10000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(refundRes.status, 'confirmed');
  session = refundRes.session;

  const pBalance4 = sandboxPurchaseBalance(session, 'op-purchase-1')!;
  assert.equal(pBalance4.paidCents, 60000);
  assert.equal(pBalance4.refundedCents, 10000);
  assert.equal(pBalance4.netPaidCents, 50000);
  assert.equal(pBalance4.pendingCents, 0);
  assert.equal(pBalance4.refundableCents, 0);

  // 7. Persist to Finance and durable history via applyCommercialSnapshot
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-purchase-1', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-1', effectiveOrder: '000000000002' },
      { kind: 'adjustment', id: 'adj-return-1', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'ref-1', effectiveOrder: '000000000004' },
    ],
    refundSources: [],
  };

  const persistedSnapshot = applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  assert.ok(persistedSnapshot);
  // Verify Finance transactions were posted:
  // - payment of $U 600 (gasto)
  // - supplier refund of $U 100 (ingreso)
  const payTx = state.finance.transactions.find((tx) => tx.id === 'commercial:pay-1');
  const refTx = state.finance.transactions.find((tx) => tx.id === 'commercial:ref-1');
  assert.ok(payTx);
  assert.equal(payTx.type, 'gasto');
  assert.equal(payTx.amount, 600);

  assert.ok(refTx);
  assert.equal(refTx.type, 'ingreso');
  assert.equal(refTx.amount, 100);

  // Supplier refund allocated against payment in supplierRefundSources
  const commercialSet = state.resale.commercial!;
  assert.ok(commercialSet.business?.supplierRefundSources?.length === 1);
  assert.equal(commercialSet.business.supplierRefundSources[0].refundEventId, 'ref-1');
  assert.equal(commercialSet.business.supplierRefundSources[0].allocations[0].receiptEventId, 'pay-1');
  assert.equal(commercialSet.business.supplierRefundSources[0].allocations[0].amountCents, 10000);

  // Durable serialization and recovery round-trip
  const recovered = recoverDurableCommercial(JSON.stringify(commercialSet));
  assert.equal(recovered.status, 'valid');
  assert.equal(recovered.reconstructed?.session.purchaseCorrections?.length, 1);
});

test('Problem 2: Complete purchase annulment without prior payment', () => {
  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-aceite', name: 'Aceite de oliva', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  const aceite = session.inventory.items[0];

  // Purchase 3 units for $U 900
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-purchase-annul', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-purchase-annul', operationId: 'op-purchase-annul', itemId: aceite.id, kind: 'receipt', quantity: 3, unit: 'unit', costCents: 90000 },
    ],
  }, { timing: 'later' });
  assert.equal(purchaseRes.status, 'confirmed');
  session = purchaseRes.session;

  assert.equal(stockBalance(sandboxStockBook(session.inventory), aceite.id).quantity, 3);

  // Annul all 3 units
  const annulRes = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-annul-1',
    purchaseId: 'op-purchase-annul',
    units: 3,
    kind: 'annulment',
  });
  assert.equal(annulRes.status, 'confirmed');
  session = annulRes.session;

  assert.equal(stockBalance(sandboxStockBook(session.inventory), aceite.id).quantity, 0);
  const balance = sandboxPurchaseBalance(session, 'op-purchase-annul')!;
  assert.equal(balance.isAnnulled, true);
  assert.equal(balance.activeAmountCents, 0);
  assert.equal(balance.pendingCents, 0);
  assert.equal(balance.refundableCents, 0);

  // Cannot annul or return again
  const retryAnnul = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-annul-2',
    purchaseId: 'op-purchase-annul',
    units: 1,
    kind: 'annulment',
  });
  assert.equal(retryAnnul.status, 'blocked');
});

test('Problem 3: Payment correction via reversal without destroying history', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-cafe', name: 'Café en grano', unit: 'kg' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  const cafe = session.inventory.items[0];

  // Purchase of $U 500
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-purchase-cafe', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-purchase-cafe', operationId: 'op-purchase-cafe', itemId: cafe.id, kind: 'receipt', quantity: 2, unit: 'kg', costCents: 50000 },
    ],
  }, { timing: 'later' });
  session = purchaseRes.session;

  // Mistaken payment: user enters $U 400 when they actually paid $U 300
  const mistakePayment = confirmSandboxMoneyEvent(session, {
    id: 'pay-err-400',
    purpose: 'purchase_payment',
    sourceId: 'op-purchase-cafe',
    amountCents: 40000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(mistakePayment.status, 'confirmed');
  session = mistakePayment.session;

  let balance = sandboxPurchaseBalance(session, 'op-purchase-cafe')!;
  assert.equal(balance.paidCents, 40000);
  assert.equal(balance.pendingCents, 10000);

  // Cannot reverse non-existent target or mismatched amount
  const badReversal = confirmSandboxMoneyEvent(session, {
    id: 'rev-bad',
    purpose: 'payment_reversal',
    sourceId: 'op-purchase-cafe',
    reversalOf: 'pay-err-400',
    amountCents: 35000, // must match 40000 exactly
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(badReversal.status, 'blocked');

  // Reversal of the $U 400 payment
  const paymentReversal = confirmSandboxMoneyEvent(session, {
    id: 'rev-400',
    purpose: 'payment_reversal',
    sourceId: 'op-purchase-cafe',
    reversalOf: 'pay-err-400',
    amountCents: 40000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(paymentReversal.status, 'confirmed');
  session = paymentReversal.session;

  // Double reversal is rejected
  const doubleReversal = confirmSandboxMoneyEvent(session, {
    id: 'rev-400-second',
    purpose: 'payment_reversal',
    sourceId: 'op-purchase-cafe',
    reversalOf: 'pay-err-400',
    amountCents: 40000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(doubleReversal.status, 'blocked');

  // Balance now reflects that the $U 400 was reversed: pending debt is restored to $U 500
  balance = sandboxPurchaseBalance(session, 'op-purchase-cafe')!;
  assert.equal(balance.paidCents, 0);
  assert.equal(balance.pendingCents, 50000);

  // Now user enters the correct payment of $U 300
  const correctPayment = confirmSandboxMoneyEvent(session, {
    id: 'pay-correct-300',
    purpose: 'purchase_payment',
    sourceId: 'op-purchase-cafe',
    amountCents: 30000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(correctPayment.status, 'confirmed');
  session = correctPayment.session;

  balance = sandboxPurchaseBalance(session, 'op-purchase-cafe')!;
  assert.equal(balance.paidCents, 30000);
  assert.equal(balance.pendingCents, 20000);

  // Commit via applyCommercialSnapshot to Finance
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-purchase-cafe', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-err-400', effectiveOrder: '000000000002' },
      { kind: 'money', id: 'rev-400', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'pay-correct-300', effectiveOrder: '000000000004' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  // Verify all transactions in Finance:
  // - pay-err-400: gasto $U 400
  // - rev-400: ingreso $U 400 (compensating transaction)
  // - pay-correct-300: gasto $U 300
  const errTx = state.finance.transactions.find((tx) => tx.id === 'commercial:pay-err-400')!;
  const revTx = state.finance.transactions.find((tx) => tx.id === 'commercial:rev-400')!;
  const corTx = state.finance.transactions.find((tx) => tx.id === 'commercial:pay-correct-300')!;

  assert.ok(errTx && revTx && corTx);
  assert.equal(errTx.type, 'gasto');
  assert.equal(errTx.amount, 400);

  assert.equal(revTx.type, 'ingreso');
  assert.equal(revTx.amount, 400);

  assert.equal(corTx.type, 'gasto');
  assert.equal(corTx.amount, 300);

  // Net cash effect: -400 + 400 - 300 = -300. Exactly matching the $U 300 paid!
});

test('Problem 3: Generic Finance UI is strictly prevented from editing or deleting commercial transactions', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 5000;
  account.balance = 5000;
  const category = state.finance.categories.find((c) => c.active)!;

  const session: SandboxMoneySession = {
    inventory: {
      items: [{ id: 'item-test', name: 'Insumo Test', unit: 'unit' }],
      operations: [{ id: 'op-test-receipt', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' }],
      movements: [{ id: 'mov-test-receipt', operationId: 'op-test-receipt', itemId: 'item-test', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 10000 }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [{ id: 'op-test-receipt', itemId: 'item-test', amountCents: 10000 }],
    moneyEvents: [{ id: 'pay-test-receipt', purpose: 'purchase_payment', sourceId: 'op-test-receipt', amountCents: 10000, accountRef: account.id, finance: { mode: 'new' }, effectiveOrder: 1 }],
  };

  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-test-receipt', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-test-receipt', effectiveOrder: '000000000002' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  const txId = state.resale.commercial!.business!.financeLinks[0].transactionId;
  const commercialTx = state.finance.transactions.find((tx) => tx.id === txId)!;
  assert.ok(commercialTx);

  // Generic Finance deleteTransaction must throw
  assert.throws(
    () => deleteTransaction(state, commercialTx.id),
    /Este movimiento pertenece a Mi negocio\. Para corregirlo, anularlo o registrar una devolución o reembolso, gestioná la operación desde Mi negocio\./
  );

  // Generic Finance updateTransaction must throw
  assert.throws(
    () => updateTransaction(state, commercialTx.id, {
      amount: 999,
      category: category.id,
      date: '2026-10-27',
      type: 'ingreso',
      accountId: account.id,
    }),
    /Este movimiento pertenece a Mi negocio\. Para corregirlo, anularlo o registrar una devolución o reembolso, gestioná la operación desde Mi negocio\./
  );
});

test('Problem 3: Sale -> mistaken receipt -> receipt reversal -> correct receipt workflow', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 5000;
  account.balance = 5000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      items: [{ id: 'item-remera', name: 'Remera básica', unit: 'unit' }],
      operations: [{ id: 'op-initial-stock', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' }],
      movements: [{ id: 'mov-initial-stock', operationId: 'op-initial-stock', itemId: 'item-remera', kind: 'receipt', quantity: 5, unit: 'unit', costCents: 100000 }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [{ id: 'op-initial-stock', itemId: 'item-remera', amountCents: 100000 }],
    moneyEvents: [],
  };

  // Direct sale of 1 remera for $U 500, payment postponed ('later')
  const saleRes = confirmSandboxDirectSaleWithReceipt(session, {
    id: 'sale-remera-1',
    itemId: 'item-remera',
    units: 1,
    unitPriceCents: 50000,
  }, { timing: 'later' });
  assert.equal(saleRes.status, 'confirmed');
  session = saleRes.session;

  // Mistaken collection: user types $U 350 instead of $U 250
  const mistakenReceipt = confirmSandboxMoneyEvent(session, {
    id: 'receipt-err-350',
    purpose: 'sale_receipt',
    sourceId: 'sale-remera-1',
    amountCents: 35000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(mistakenReceipt.status, 'confirmed');
  session = mistakenReceipt.session;

  let balance = sandboxSaleBalance(session, 'sale-remera-1')!;
  assert.equal(balance.receivedCents, 35000);
  assert.equal(balance.pendingCents, 15000);

  // Reverse the mistaken collection
  const reversalRes = confirmSandboxMoneyEvent(session, {
    id: 'rev-receipt-350',
    purpose: 'receipt_reversal',
    sourceId: 'sale-remera-1',
    reversalOf: 'receipt-err-350',
    amountCents: 35000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(reversalRes.status, 'confirmed');
  session = reversalRes.session;

  // After reversal, pending debt from customer is restored to full $U 500
  balance = sandboxSaleBalance(session, 'sale-remera-1')!;
  assert.equal(balance.receivedCents, 0);
  assert.equal(balance.pendingCents, 50000);

  // Now record the correct partial collection of $U 250
  const correctReceipt = confirmSandboxMoneyEvent(session, {
    id: 'receipt-cor-250',
    purpose: 'sale_receipt',
    sourceId: 'sale-remera-1',
    amountCents: 25000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(correctReceipt.status, 'confirmed');
  session = correctReceipt.session;

  balance = sandboxSaleBalance(session, 'sale-remera-1')!;
  assert.equal(balance.receivedCents, 25000);
  assert.equal(balance.pendingCents, 25000);

  // Persist to Finance and durable history via applyCommercialSnapshot
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-initial-stock', effectiveOrder: '000000000001' },
      { kind: 'sale', id: 'sale-remera-1', effectiveOrder: '000000000002' },
      { kind: 'money', id: 'receipt-err-350', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'rev-receipt-350', effectiveOrder: '000000000004' },
      { kind: 'money', id: 'receipt-cor-250', effectiveOrder: '000000000005' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  // Verify Finance transactions:
  // - receipt-err-350: ingreso $U 350
  // - rev-receipt-350: gasto $U 350 (compensating reversal)
  // - receipt-cor-250: ingreso $U 250
  const errTx = state.finance.transactions.find((tx) => tx.id === 'commercial:receipt-err-350')!;
  const revTx = state.finance.transactions.find((tx) => tx.id === 'commercial:rev-receipt-350')!;
  const corTx = state.finance.transactions.find((tx) => tx.id === 'commercial:receipt-cor-250')!;

  assert.ok(errTx && revTx && corTx);
  assert.equal(errTx.type, 'ingreso');
  assert.equal(errTx.amount, 350);

  assert.equal(revTx.type, 'gasto');
  assert.equal(revTx.amount, 350);

  assert.equal(corTx.type, 'ingreso');
  assert.equal(corTx.amount, 250);

  // Net cash effect: +350 - 350 + 250 = +250.
});

test('Problem 2: Purchase annulment after partial payment creates refundable cents and collected supplier refund', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-madera', name: 'Tablas de pino', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  // Buy 4 units for $U 800
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-purchase-madera', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-purchase-madera', operationId: 'op-purchase-madera', itemId: 'item-madera', kind: 'receipt', quantity: 4, unit: 'unit', costCents: 80000 },
    ],
  }, { timing: 'later' });
  session = purchaseRes.session;

  // Pay $U 400 upfront
  const payRes = confirmSandboxMoneyEvent(session, {
    id: 'pay-madera-400',
    purpose: 'purchase_payment',
    sourceId: 'op-purchase-madera',
    amountCents: 40000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  session = payRes.session;

  // Now annul all 4 units (supplier cancelled order after partial payment)
  const annulRes = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-annul-madera',
    purchaseId: 'op-purchase-madera',
    units: 4,
    kind: 'annulment',
  });
  assert.equal(annulRes.status, 'confirmed');
  session = annulRes.session;

  const balanceAfterAnnul = sandboxPurchaseBalance(session, 'op-purchase-madera')!;
  assert.equal(balanceAfterAnnul.isAnnulled, true);
  assert.equal(balanceAfterAnnul.activeAmountCents, 0);
  assert.equal(balanceAfterAnnul.pendingCents, 0);
  assert.equal(balanceAfterAnnul.refundableCents, 40000); // We paid 400, active is 0 -> 400 to collect back!

  // Collect the supplier refund of $U 400
  const refundRes = confirmSandboxMoneyEvent(session, {
    id: 'refund-madera-400',
    purpose: 'supplier_refund',
    sourceId: 'op-purchase-madera',
    amountCents: 40000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(refundRes.status, 'confirmed');
  session = refundRes.session;

  const finalBalance = sandboxPurchaseBalance(session, 'op-purchase-madera')!;
  assert.equal(finalBalance.isAnnulled, true);
  assert.equal(finalBalance.netPaidCents, 0);
  assert.equal(finalBalance.refundableCents, 0);
  assert.equal(finalBalance.pendingCents, 0);

  // Commit via applyCommercialSnapshot
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-purchase-madera', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-madera-400', effectiveOrder: '000000000002' },
      { kind: 'adjustment', id: 'adj-annul-madera', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'refund-madera-400', effectiveOrder: '000000000004' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  const payTx = state.finance.transactions.find((tx) => tx.id === 'commercial:pay-madera-400')!;
  const refTx = state.finance.transactions.find((tx) => tx.id === 'commercial:refund-madera-400')!;

  assert.equal(payTx.type, 'gasto');
  assert.equal(payTx.amount, 400);

  assert.equal(refTx.type, 'ingreso');
  assert.equal(refTx.amount, 400);

  // Recovery verification: an annulled purchase does NOT report active debt or active amount
  const recovered = recoverDurableCommercial(JSON.stringify(state.resale.commercial!));
  assert.equal(recovered.status, 'valid');
  const recoveredBalance = sandboxPurchaseBalance(recovered.reconstructed!.session, 'op-purchase-madera')!;
  assert.equal(recoveredBalance.isAnnulled, true);
  assert.equal(recoveredBalance.activeAmountCents, 0);
  assert.equal(recoveredBalance.pendingCents, 0);
});

test('Escenario A — Compra, pagos y devolución (10 unidades por $U 100, paga $U 40, devuelve 3 unidades)', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-esc-a', name: 'Articulo Esc A', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  // 1. Comprar 10 unidades por $U 100 ($U 10 cada una)
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-esc-a-pur', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-esc-a-pur', operationId: 'op-esc-a-pur', itemId: 'item-esc-a', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 10000 },
    ],
  }, { timing: 'later' });
  assert.equal(purchaseRes.status, 'confirmed');
  session = purchaseRes.session;

  // 2. Pagar $U 40
  const payRes = confirmSandboxMoneyEvent(session, {
    id: 'pay-esc-a-40',
    purpose: 'purchase_payment',
    sourceId: 'op-esc-a-pur',
    amountCents: 4000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(payRes.status, 'confirmed');
  session = payRes.session;

  // 3. Devolver 3 unidades al proveedor
  const returnRes = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-esc-a-ret3',
    purchaseId: 'op-esc-a-pur',
    units: 3,
    kind: 'return',
  });
  assert.equal(returnRes.status, 'confirmed');
  session = returnRes.session;

  // 4. Comprobaciones obligatorias:
  // - Quedan 7 unidades en inventario
  const stock = stockBalance(sandboxStockBook(session.inventory), 'item-esc-a');
  assert.equal(stock.quantity, 7);

  // - Costo vigente $U 70 y deuda pendiente $U 30
  const balance = sandboxPurchaseBalance(session, 'op-esc-a-pur')!;
  assert.equal(balance.activeAmountCents, 7000); // $U 70
  assert.equal(balance.paidCents, 4000); // $U 40
  assert.equal(balance.pendingCents, 3000); // $U 30
  assert.equal(balance.refundableCents, 0); // No hay saldo a favor todavía

  // 5. Confirmar que una devolución física no genera automáticamente un ingreso financiero
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-esc-a-pur', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-esc-a-40', effectiveOrder: '000000000002' },
      { kind: 'adjustment', id: 'adj-esc-a-ret3', effectiveOrder: '000000000003' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  // Solo debe existir la transacción de pago de $U 40, ningún ingreso por la devolución física
  const txs = state.finance.transactions.filter((tx) => tx.id.startsWith('commercial:'));
  assert.equal(txs.length, 1);
  assert.equal(txs[0].id, 'commercial:pay-esc-a-40');
  assert.equal(txs[0].type, 'gasto');
  assert.equal(txs[0].amount, 40);
});

test('Escenario B — Reembolso del proveedor (10 unidades por $U 100, paga $U 80, devuelve 3 unidades -> saldo recuperable $U 10 -> cobra reembolso)', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-esc-b', name: 'Articulo Esc B', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  // 1. Comprar 10 unidades por $U 100 ($U 10 cada una)
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-esc-b-pur', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-esc-b-pur', operationId: 'op-esc-b-pur', itemId: 'item-esc-b', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 10000 },
    ],
  }, { timing: 'later' });
  session = purchaseRes.session;

  // 2. Pagar $U 80
  const payRes = confirmSandboxMoneyEvent(session, {
    id: 'pay-esc-b-80',
    purpose: 'purchase_payment',
    sourceId: 'op-esc-b-pur',
    amountCents: 8000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  session = payRes.session;

  // 3. Devolver 3 unidades correspondientes a $U 30
  const returnRes = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-esc-b-ret3',
    purchaseId: 'op-esc-b-pur',
    units: 3,
    kind: 'return',
  });
  assert.equal(returnRes.status, 'confirmed');
  session = returnRes.session;

  // 4. Comprobar que existe un saldo recuperable de $U 10
  const balanceBeforeRefund = sandboxPurchaseBalance(session, 'op-esc-b-pur')!;
  assert.equal(balanceBeforeRefund.activeAmountCents, 7000);
  assert.equal(balanceBeforeRefund.paidCents, 8000);
  assert.equal(balanceBeforeRefund.pendingCents, 0);
  assert.equal(balanceBeforeRefund.refundableCents, 1000); // $U 10 por recuperar

  // 5. Registrar su reembolso y verificar el movimiento financiero efectivo
  const refundRes = confirmSandboxMoneyEvent(session, {
    id: 'refund-esc-b-10',
    purpose: 'supplier_refund',
    sourceId: 'op-esc-b-pur',
    amountCents: 1000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(refundRes.status, 'confirmed');
  session = refundRes.session;

  const balanceAfterRefund = sandboxPurchaseBalance(session, 'op-esc-b-pur')!;
  assert.equal(balanceAfterRefund.refundableCents, 0);
  assert.equal(balanceAfterRefund.netPaidCents, 7000); // 8000 - 1000 = 7000 net paid

  // 6. Aplicar y verificar Finanzas:
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-esc-b-pur', effectiveOrder: '000000000001' },
      { kind: 'money', id: 'pay-esc-b-80', effectiveOrder: '000000000002' },
      { kind: 'adjustment', id: 'adj-esc-b-ret3', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'refund-esc-b-10', effectiveOrder: '000000000004' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  const payTx = state.finance.transactions.find((tx) => tx.id === 'commercial:pay-esc-b-80')!;
  const refTx = state.finance.transactions.find((tx) => tx.id === 'commercial:refund-esc-b-10')!;
  assert.ok(payTx && refTx);
  assert.equal(payTx.type, 'gasto');
  assert.equal(payTx.amount, 80);
  assert.equal(refTx.type, 'ingreso');
  assert.equal(refTx.amount, 10);

  // Recovery test: snapshot survives durable capture and reconstruction
  const recovered = recoverDurableCommercial(JSON.stringify(state.resale.commercial!));
  assert.equal(recovered.status, 'valid');
  assert.equal(recovered.reconstructed!.summary.supplierRefundedCents, 1000);
});

test('Escenario C — Corrección de cobro (Venta $U 60, cobro $U 20, reversión, cobro correcto $U 15)', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;
  const category = state.finance.categories.find((c) => c.active)!;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-esc-c', name: 'Articulo Esc C', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [{ id: 'op-esc-c-stock', itemId: 'item-esc-c', amountCents: 20000 }],
    moneyEvents: [],
  };

  // Stock inicial de 10 unidades a $U 20 cada una
  session.inventory.movements.push({
    id: 'mov-esc-c-stock',
    operationId: 'op-esc-c-stock',
    itemId: 'item-esc-c',
    kind: 'receipt',
    quantity: 10,
    unit: 'unit',
    costCents: 20000,
  });
  session.inventory.operations.push({
    id: 'op-esc-c-stock',
    kind: 'receipt',
    status: 'closed',
    effectiveOrder: '000000000001',
  });

  // 1. Registrar una venta de $U 60 (2 unidades a $U 30)
  const saleRes = confirmSandboxDirectSaleWithReceipt(session, {
    id: 'sale-esc-c-1',
    itemId: 'item-esc-c',
    units: 2,
    unitPriceCents: 3000,
  }, { timing: 'later' });
  assert.equal(saleRes.status, 'confirmed');
  session = saleRes.session;
  const saleId = 'sale-esc-c-1';

  // 2. Cobrar $U 20
  const receipt1 = confirmSandboxMoneyEvent(session, {
    id: 'rec-esc-c-err-20',
    purpose: 'sale_receipt',
    sourceId: saleId,
    amountCents: 2000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(receipt1.status, 'confirmed');
  session = receipt1.session;

  const b1 = sandboxSaleBalance(session, saleId)!;
  assert.equal(b1.receivedCents, 2000);
  assert.equal(b1.pendingCents, 4000);

  // 3. Revertir ese cobro erróneo
  const revRes = confirmSandboxMoneyEvent(session, {
    id: 'rev-esc-c-20',
    purpose: 'receipt_reversal',
    sourceId: saleId,
    reversalOf: 'rec-esc-c-err-20',
    amountCents: 2000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(revRes.status, 'confirmed');
  session = revRes.session;

  const b2 = sandboxSaleBalance(session, saleId)!;
  assert.equal(b2.receivedCents, 0); // Net received returns to 0
  assert.equal(b2.pendingCents, 6000); // Full debt restored

  // 4. Registrar el cobro correcto de $U 15
  const receipt2 = confirmSandboxMoneyEvent(session, {
    id: 'rec-esc-c-cor-15',
    purpose: 'sale_receipt',
    sourceId: saleId,
    amountCents: 1500,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(receipt2.status, 'confirmed');
  session = receipt2.session;

  // 5. Confirmar que quedan $U 45 por cobrar
  const b3 = sandboxSaleBalance(session, saleId)!;
  assert.equal(b3.receivedCents, 1500);
  assert.equal(b3.pendingCents, 4500); // $U 45

  // 6. Confirmar que Finanzas refleja el dinero neto efectivamente recibido ($U 15)
  const snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    session,
    recipes: [],
    eventOrder: [
      { kind: 'purchase', id: 'op-esc-c-stock', effectiveOrder: '000000000001' },
      { kind: 'sale', id: saleId, effectiveOrder: '000000000002' },
      { kind: 'money', id: 'rec-esc-c-err-20', effectiveOrder: '000000000003' },
      { kind: 'money', id: 'rev-esc-c-20', effectiveOrder: '000000000004' },
      { kind: 'money', id: 'rec-esc-c-cor-15', effectiveOrder: '000000000005' },
    ],
    refundSources: [],
  };

  applyCommercialSnapshot(state, state.resale.commercial, snapshot, {
    categoryId: category.id,
    date: '2026-10-27',
  });

  const txErr = state.finance.transactions.find((tx) => tx.id === 'commercial:rec-esc-c-err-20')!;
  const txRev = state.finance.transactions.find((tx) => tx.id === 'commercial:rev-esc-c-20')!;
  const txCor = state.finance.transactions.find((tx) => tx.id === 'commercial:rec-esc-c-cor-15')!;

  assert.equal(txErr.type, 'ingreso');
  assert.equal(txErr.amount, 20);
  assert.equal(txRev.type, 'gasto'); // Compensating reversal transaction in Finance
  assert.equal(txRev.amount, 20);
  assert.equal(txCor.type, 'ingreso');
  assert.equal(txCor.amount, 15);

  const netCashFromCommercial = [txErr, txRev, txCor].reduce(
    (sum, tx) => sum + (tx.type === 'ingreso' ? tx.amount : -tx.amount),
    0
  );
  assert.equal(netCashFromCommercial, 15);
});

test('Escenario D — Límites y validaciones de borde estrictas', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 10000;
  account.balance = 10000;

  let session: SandboxMoneySession = {
    inventory: {
      ...emptySandboxInventory(),
      items: [{ id: 'item-esc-d', name: 'Articulo Esc D', unit: 'unit' }],
    },
    sales: [],
    finished: emptySandboxInventory(),
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };

  // 1. Compra de 10 unidades por $U 1000
  const purchaseRes = confirmSandboxPurchaseWithPayment(session, {
    items: session.inventory.items,
    operations: [
      ...session.inventory.operations,
      { id: 'op-esc-d-pur', kind: 'receipt', status: 'closed', effectiveOrder: '000000000001' },
    ],
    movements: [
      { id: 'mov-esc-d-pur', operationId: 'op-esc-d-pur', itemId: 'item-esc-d', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 100000 },
    ],
  }, { timing: 'later' });
  session = purchaseRes.session;

  // 2. Límites de importes monetarios
  // Monto no positivo o fraccionario
  const invAmount = confirmSandboxMoneyEvent(session, {
    id: 'pay-inv-1',
    purpose: 'purchase_payment',
    sourceId: 'op-esc-d-pur',
    amountCents: -500,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(invAmount.status, 'blocked');

  // Monto superior a la deuda pendiente ($U 1000 máximo)
  const overpay = confirmSandboxMoneyEvent(session, {
    id: 'pay-over',
    purpose: 'purchase_payment',
    sourceId: 'op-esc-d-pur',
    amountCents: 100001,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(overpay.status, 'blocked');
  assert.match(overpay.issues[0], /supera el importe pendiente/i);

  // Pago válido de $U 500
  const validPay = confirmSandboxMoneyEvent(session, {
    id: 'pay-valid-500',
    purpose: 'purchase_payment',
    sourceId: 'op-esc-d-pur',
    amountCents: 50000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(validPay.status, 'confirmed');
  session = validPay.session;

  // 3. Venta de 8 unidades de las 10 compradas
  const saleRes = confirmSandboxDirectSaleWithReceipt(session, {
    id: 'sale-esc-d-1',
    itemId: 'item-esc-d',
    units: 8,
    unitPriceCents: 15000,
  }, { timing: 'later' });
  assert.equal(saleRes.status, 'confirmed');
  session = saleRes.session;

  // Ahora quedan solo 2 unidades en stock.
  // Intentar devolver 5 unidades debe ser bloqueado por stock insuficiente
  const overReturn = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-ret-over',
    purchaseId: 'op-esc-d-pur',
    units: 5,
    kind: 'return',
  });
  assert.equal(overReturn.status, 'blocked');
  assert.match(overReturn.issues[0], /Stock insuficiente para devolver/i);

  // Intentar anular la compra cuando ya se vendieron unidades (quedan 2 en stock de 10) debe ser bloqueado
  const annulSold = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-annul-sold',
    purchaseId: 'op-esc-d-pur',
    units: 10,
    kind: 'annulment',
  });
  assert.equal(annulSold.status, 'blocked');

  // Intentar anulación parcial (la anulación no puede ser parcial)
  const partialAnnul = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-annul-partial',
    purchaseId: 'op-esc-d-pur',
    units: 2,
    kind: 'annulment',
  });
  assert.equal(partialAnnul.status, 'blocked');
  assert.match(partialAnnul.issues[0], /anulación de compra debe comprender la totalidad/i);

  // 4. Devolver las 2 unidades restantes legítimamente
  const validReturn = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-ret-2',
    purchaseId: 'op-esc-d-pur',
    units: 2,
    kind: 'return',
  });
  assert.equal(validReturn.status, 'confirmed');
  session = validReturn.session;

  // Active purchase amount: 1000 - 200 = $U 800.
  // Paid: $U 500. Pending: $U 300. Refundable: 0.
  // Intentar cobrar un reembolso cuando refundable es 0 debe ser bloqueado
  const premRefund = confirmSandboxMoneyEvent(session, {
    id: 'ref-prem',
    purpose: 'supplier_refund',
    sourceId: 'op-esc-d-pur',
    amountCents: 1000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(premRefund.status, 'blocked');
  assert.match(premRefund.issues[0], /supera el importe por recuperar/i);

  // 5. Doble reversión:
  // Revertir el pago de $U 500
  const rev1 = confirmSandboxMoneyEvent(session, {
    id: 'rev-pay-500',
    purpose: 'payment_reversal',
    sourceId: 'op-esc-d-pur',
    reversalOf: 'pay-valid-500',
    amountCents: 50000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(rev1.status, 'confirmed');
  session = rev1.session;

  // Intentar revertir el mismo pago por segunda vez debe ser bloqueado
  const rev2 = confirmSandboxMoneyEvent(session, {
    id: 'rev-pay-500-dup',
    purpose: 'payment_reversal',
    sourceId: 'op-esc-d-pur',
    reversalOf: 'pay-valid-500',
    amountCents: 50000,
    accountRef: account.id,
    finance: { mode: 'new' },
  });
  assert.equal(rev2.status, 'blocked');
  assert.match(rev2.issues[0], /Este pago ya fue revertido/i);

  // 6. Idempotencia en reintentos exactos
  const retryReturn = confirmSandboxPurchaseAdjustment(session, {
    id: 'adj-ret-2',
    purchaseId: 'op-esc-d-pur',
    units: 2,
    kind: 'return',
  });
  assert.equal(retryReturn.status, 'already_confirmed');
});
