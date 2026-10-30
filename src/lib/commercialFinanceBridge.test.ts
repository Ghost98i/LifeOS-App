import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addTransaction } from './financeFlows';
import { recordResalePurchase } from './resaleFlows';
import { addSandboxItem, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxDirectSale } from './commercialDirectSaleSandbox';
import { confirmSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { confirmSandboxMoneyEvent, planSandboxNonCashEffect, recordSandboxPurchase,
  type SandboxMoneyEvent, type SandboxMoneySession } from './commercialMoneySandbox';
import { planCommercialJointPublication, prevalidateCommercialFinance,
  type CommercialFinanceBridgeInput, type CommercialFinanceLink } from './commercialFinanceBridge';

const start = (): SandboxMoneySession => ({ inventory: emptySandboxInventory(), sales: [], purchases: [], moneyEvents: [] });
function confirmed(session: SandboxMoneySession, id: string, purpose: SandboxMoneyEvent['purpose'],
  sourceId: string, amountCents: number, finance: SandboxMoneyEvent['finance'] = { mode: 'new' }) {
  const result = confirmSandboxMoneyEvent(session, { id, purpose, sourceId, amountCents, accountRef: 'test-cash', finance });
  assert.equal(result.status, 'confirmed');
  return { session: result.session, event: result.event };
}
function fixture() {
  const state = defaultState();
  const session = recordSandboxPurchase(start(), addSandboxItem(start().inventory, 'Placa', 'unit', 2, 600));
  const accountId = state.finance.accounts[0].id;
  const choice = { accountId, categoryId: 'Reventa', currency: 'UYU', date: '2026-10-23' };
  return { state, session, choice };
}
function preflight(input: ReturnType<typeof fixture>, event: SandboxMoneyEvent, session: SandboxMoneySession,
  overrides: Partial<CommercialFinanceBridgeInput> = {}) {
  return prevalidateCommercialFinance({ event, session, finance: input.state.finance,
    resaleInventory: input.state.resale.inventory, choice: input.choice, sourceCurrency: 'UYU', ...overrides });
}

test('fully paid purchase, partial payments and pending purchase plan only actual payments', () => {
  const f = fixture();
  const purchaseId = f.session.purchases![0].id;
  const first = confirmed(f.session, 'pay1', 'purchase_payment', purchaseId, 20000);
  const second = confirmed(first.session, 'pay2', 'purchase_payment', purchaseId, 40000);
  for (const [event, session] of [[first.event, second.session], [second.event, second.session]] as const) {
    const result = preflight(f, event, session);
    assert.equal(result.status, 'ready');
    if (result.status === 'ready') {
      assert.equal(result.candidate.type, 'gasto');
      assert.equal(result.candidate.amountCents, event.amountCents);
      assert.equal(result.candidate.accountId, f.choice.accountId);
    }
  }
  assert.equal(f.session.moneyEvents?.length, 0);
  assert.equal(f.state.finance.transactions.length, 0);
});

test('direct sale pending, partial and full receipts plan income only when collected', () => {
  const f = fixture();
  const sold = confirmSandboxDirectSale(f.session, { id: 'sale1', itemId: f.session.inventory.items[0].id,
    units: 1, unitPriceCents: 40000 });
  assert.equal(sold.status, 'confirmed');
  assert.equal(sold.session.moneyEvents?.length, 0);
  const first = confirmed(sold.session, 'receipt1', 'sale_receipt', 'sale1', 15000);
  const second = confirmed(first.session, 'receipt2', 'sale_receipt', 'sale1', 25000);
  assert.equal(preflight(f, first.event, second.session).status, 'ready');
  const result = preflight(f, second.event, second.session);
  assert.equal(result.status, 'ready');
  if (result.status === 'ready') assert.equal(result.candidate.type, 'ingreso');
  assert.equal(f.state.finance.transactions.length, 0);
});

test('refund plan points to original receipts and requires joint commercial-financial publication', () => {
  const f = fixture();
  const sold = confirmSandboxDirectSale(f.session, { id: 'sale1', itemId: f.session.inventory.items[0].id,
    units: 1, unitPriceCents: 40000 });
  assert.equal(sold.status, 'confirmed');
  const received = confirmed(sold.session, 'receipt1', 'sale_receipt', 'sale1', 40000);
  const adjusted = confirmSandboxSaleAdjustment(received.session, { id: 'return1', saleId: 'sale1', units: 1,
    kind: 'return', disposition: 'discard' });
  assert.equal(adjusted.status, 'confirmed');
  const refunded = confirmed(adjusted.session, 'refund1', 'customer_refund', 'sale1', 40000);
  const result = preflight(f, refunded.event, refunded.session);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.candidate.type, 'gasto');
  assert.deepEqual(result.candidate.receiptEventIds, ['receipt1']);
  const group = planCommercialJointPublication(result, { resale: 'resale-rev', finance: 'finance-rev' });
  assert.deepEqual(group?.modules, ['resale', 'finance']);
  assert.deepEqual(group?.requiredReceiptEventIds, ['receipt1']);
  assert.equal(group?.publishableNow, false);
});

test('a matching existing transaction needs trustworthy ownership evidence', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id,
    60000, { mode: 'existing', transactionId: 'existing-tx' });
  addTransaction(f.state, { id: 'existing-tx', type: 'gasto', amount: 600, category: 'Reventa',
    accountId: f.choice.accountId, date: f.choice.date });
  assert.equal(preflight(f, event, session).status, 'review_required');
  const link: CommercialFinanceLink = { originKey: 'commercial:purchase_payment:pay1', transactionId: 'existing-tx' };
  const verified = preflight(f, event, session, { links: [link] });
  assert.equal(verified.status, 'linked_verified');
  assert.equal(planCommercialJointPublication(verified, { resale: null, finance: null }), null);
});

test('missing, mismatched and reused references are blocked without substitution', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id,
    60000, { mode: 'existing', transactionId: 'existing-tx' });
  assert.equal(preflight(f, event, session).status, 'blocked');
  const transaction = addTransaction(f.state, { id: 'existing-tx', type: 'gasto', amount: 600,
    category: 'Reventa', accountId: f.choice.accountId, date: f.choice.date });
  const link: CommercialFinanceLink = { originKey: 'commercial:purchase_payment:pay1', transactionId: transaction.id };
  transaction.amount = 599;
  assert.equal(preflight(f, event, session, { links: [link] }).status, 'blocked');
  transaction.amount = 600;
  transaction.accountId = f.state.finance.accounts[1].id;
  assert.equal(preflight(f, event, session, { links: [link] }).status, 'blocked');
  transaction.accountId = f.choice.accountId;
  assert.equal(preflight(f, event, session, { links: [{ originKey: 'other', transactionId: transaction.id }] }).status, 'blocked');
  assert.equal(preflight(f, event, session, { links: [link, { originKey: 'other', transactionId: transaction.id }] }).status, 'blocked');
});

test('invalid account, category, currency and date each return a distinct block', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id, 60000);
  const cases: Array<[Partial<CommercialFinanceBridgeInput['choice']>, string]> = [
    [{ accountId: null }, 'missing_account'], [{ accountId: 'missing' }, 'invalid_account'],
    [{ categoryId: null }, 'missing_category'], [{ categoryId: 'missing' }, 'invalid_category'],
    [{ currency: null }, 'missing_currency'], [{ currency: 'USD' }, 'source_currency_mismatch'],
    [{ date: null }, 'missing_date'], [{ date: '2026-02-31' }, 'missing_date'],
  ];
  for (const [change, code] of cases) {
    const result = preflight(f, event, session, { choice: { ...f.choice, ...change } });
    assert.equal(result.status, 'blocked');
    if (result.status === 'blocked') assert.equal(result.code, code);
  }
  const account = f.state.finance.accounts[0];
  account.currency = 'USD';
  assert.equal(preflight(f, event, session).status, 'blocked');
  account.currency = 'UYU';
  assert.equal(preflight(f, event, session, { sourceCurrency: null }).status, 'review_required');
});

test('same event plans a stable ID; existing deterministic ID is never planned twice', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id, 60000);
  const first = preflight(f, event, session);
  const retry = preflight(f, event, session);
  assert.deepEqual(first, retry);
  assert.equal(first.status, 'ready');
  if (first.status !== 'ready') return;
  addTransaction(f.state, { id: first.candidate.id, type: 'gasto', amount: 600, category: 'Reventa',
    accountId: f.choice.accountId, date: f.choice.date });
  assert.equal(preflight(f, event, session).status, 'review_required');
  assert.equal(preflight(f, event, session, { links: [{ originKey: first.candidate.originKey,
    transactionId: first.candidate.id }] }).status, 'linked_verified');
});

test('legacy Reventa purchase owns its finance transaction and cannot be claimed again', () => {
  const f = fixture();
  const legacy = recordResalePurchase(f.state, { item: 'Monitor', buyPrice: 600,
    buyDate: f.choice.date, accountId: f.choice.accountId });
  assert.ok(legacy.purchaseTxId);
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id,
    60000, { mode: 'existing', transactionId: legacy.purchaseTxId! });
  const result = preflight(f, event, session);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.equal(result.code, 'reserved_by_resale');
  assert.equal(f.state.resale.inventory[0].purchaseTxId, legacy.purchaseTxId);
});

test('commercial events without cash have no financial effect and preflight never mutates input', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id, 60000);
  const before = structuredClone({ session, finance: f.state.finance, resale: f.state.resale });
  assert.equal(planSandboxNonCashEffect('inventory_entry').status, 'none');
  assert.equal(planSandboxNonCashEffect('stock_use').status, 'none');
  assert.equal(planSandboxNonCashEffect('sale').status, 'none');
  assert.equal(planSandboxNonCashEffect('sale_adjustment').status, 'none');
  assert.equal(preflight(f, event, session).status, 'ready');
  assert.deepEqual({ session, finance: f.state.finance, resale: f.state.resale }, before);
});

test('forged excess, duplicate event ID and reused financial reference are blocked', () => {
  const f = fixture();
  const { session, event } = confirmed(f.session, 'pay1', 'purchase_payment', f.session.purchases![0].id, 60000);
  const duplicated = { ...session, moneyEvents: [...session.moneyEvents!, event] };
  assert.equal(preflight(f, event, duplicated).status, 'blocked');
  const excessive = { ...session, moneyEvents: [...session.moneyEvents!, { ...event, id: 'pay2', amountCents: 1 }] };
  const overpaid = preflight(f, event, excessive);
  assert.equal(overpaid.status, 'blocked');
  if (overpaid.status === 'blocked') assert.equal(overpaid.code, 'overpaid_purchase');
  const linkedEvent = { ...event, finance: { mode: 'existing' as const, transactionId: 'shared-tx' } };
  const reused = { ...session, moneyEvents: [linkedEvent, { ...linkedEvent, id: 'pay2' }] };
  assert.equal(preflight(f, linkedEvent, reused).status, 'blocked');
});
