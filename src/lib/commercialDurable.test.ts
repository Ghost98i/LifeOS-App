import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory } from './commercialInventorySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxProduction, confirmSandboxPreparedSale, confirmSandboxFinishedWaste } from './commercialProductionSandbox';
import { confirmSandboxSale } from './commercialSaleSandbox';
import { confirmSandboxDirectSale } from './commercialDirectSaleSandbox';
import { confirmSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { confirmSandboxMoneyEvent, recordSandboxPurchase, type SandboxMoneySession } from './commercialMoneySandbox';
import { captureDurableCommercial, recoverDurableCommercial, reconstructDurableCommercial, serializeDurableCommercial,
  validateDurableCommercial, type CommercialBusinessHistory, type DurableEventOrder } from './commercialDurable';
import { reconcileCommercialSets } from './commercialReconcile';
import { defaultState, parseBackupJSON, readStoredCommercial } from './storage';
import { buildStateFromModules } from './syncModel';
import { addTransaction } from './financeFlows';

const currency = 'UYU';
function fixture() {
  let session: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], purchases: [], productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] };
  const orders: DurableEventOrder[] = [];
  const order = (kind: DurableEventOrder['kind'], id: string) => orders.push({ kind, id,
    effectiveOrder: String(orders.length + 1).padStart(12, '0') });
  const enter = (name: string, unit: 'unit' | 'kg', qty: number, cost: number) => {
    session = recordSandboxPurchase(session, addSandboxItem(session.inventory, name, unit, qty, cost));
    order('purchase', session.purchases!.at(-1)!.id);
  };
  enter('Pan', 'unit', 10, 100.01);
  enter('Carne', 'kg', 2, 100);
  enter('Placa', 'unit', 2, 600);
  session = recordSandboxPurchase(session, addSandboxReceipt(session.inventory, session.inventory.items[0].id, 10, 'unit', 200));
  order('purchase', session.purchases!.at(-1)!.id);
  const payRequest = { id: 'payment1', purpose: 'purchase_payment' as const,
    sourceId: session.purchases![2].id, amountCents: 15000, accountRef: 'caja', finance: { mode: 'new' as const } };
  const paid = confirmSandboxMoneyEvent(session, payRequest);
  assert.equal(paid.status, 'confirmed'); session = paid.session; order('money', payRequest.id);
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Hamburguesa', ingredients: [
    { itemId: session.inventory.items[0].id, quantity: 1, unit: 'unit' },
    { itemId: session.inventory.items[1].id, quantity: 100, unit: 'g' },
  ], directCost: 5, salePrice: 50 });
  const production = confirmSandboxProduction(session, { id: 'production1', recipe, units: 2 });
  assert.equal(production.status, 'confirmed'); session = production.session; order('production', 'production1');
  const prepared = confirmSandboxPreparedSale(session, { id: 'prepared1', recipe, units: 1 });
  assert.equal(prepared.status, 'confirmed'); session = prepared.session; order('sale', 'prepared1');
  const made = confirmSandboxSale(session, { id: 'made1', recipe, units: 1 });
  assert.equal(made.status, 'confirmed'); session = made.session; order('sale', 'made1');
  const direct = confirmSandboxDirectSale(session, { id: 'direct1', itemId: session.inventory.items[2].id,
    units: 1, unitPriceCents: 40000 });
  assert.equal(direct.status, 'confirmed'); session = direct.session; order('sale', 'direct1');
  const receiptRequest = { id: 'receipt1', purpose: 'sale_receipt' as const, sourceId: 'direct1',
    amountCents: 25000, accountRef: 'caja', finance: { mode: 'new' as const } };
  const received = confirmSandboxMoneyEvent(session, receiptRequest);
  assert.equal(received.status, 'confirmed'); session = received.session; order('money', receiptRequest.id);
  const waste = confirmSandboxFinishedWaste(session, { id: 'waste1', recipeId: recipe.id,
    recipeName: recipe.name, units: 1 });
  assert.equal(waste.status, 'confirmed'); session = waste.session; order('finished_waste', 'waste1');
  session = { ...session, inventory: addSandboxExit(session.inventory, session.inventory.items[0].id, 'waste', 0.5, 'unit') };
  const returned = confirmSandboxSaleAdjustment(session, { id: 'return1', saleId: 'direct1', units: 1,
    kind: 'return', disposition: 'restock' });
  assert.equal(returned.status, 'confirmed'); session = returned.session; order('adjustment', 'return1');
  const refundRequest = { id: 'refund1', purpose: 'customer_refund' as const, sourceId: 'direct1',
    amountCents: 10000, accountRef: 'caja', finance: { mode: 'new' as const } };
  const refunded = confirmSandboxMoneyEvent(session, refundRequest);
  assert.equal(refunded.status, 'confirmed'); session = refunded.session; order('money', refundRequest.id);
  const frozenMadeCost = session.sales.find((entry) => entry.id === 'made1')!.totalCostCents;
  session = recordSandboxPurchase(session, addSandboxReceipt(session.inventory, session.inventory.items[0].id, 5, 'unit', 250));
  order('purchase', session.purchases!.at(-1)!.id);
  assert.equal(session.sales.find((entry) => entry.id === 'made1')!.totalCostCents, frozenMadeCost);
  const business: CommercialBusinessHistory = { version: 1, currency, finished: session.finished!,
    recipes: [{ ...recipe, currency }], purchases: session.purchases!.map((entry) => ({ ...entry, currency })),
    productions: session.productions!.map((entry) => ({ ...entry, currency })),
    sales: session.sales.map((entry) => ({ ...entry, currency })),
    finishedWastes: session.finishedWastes!.map((entry) => ({ ...entry, currency })),
    saleCorrections: session.saleCorrections!.map((entry) => ({ ...entry, currency })),
    moneyEvents: session.moneyEvents!.map((entry) => ({ ...entry, currency })),
    refundSources: [{ refundEventId: 'refund1', allocations: [{ receiptEventId: 'receipt1', amountCents: 10000 }] }],
    financeLinks: [], eventOrder: orders };
  return { set: { ...session.inventory, business }, payRequest, session };
}

test('real backup and cloud module hydration reconstruct the full commercial history without changing finance', () => {
  const { set } = fixture();
  const state = defaultState();
  const finance = structuredClone(state.finance);
  state.resale.commercial = set;
  const fromBackup = parseBackupJSON(JSON.stringify({ state }));
  const fromModule = buildStateFromModules({ resale: { resale: structuredClone(state.resale) } });
  for (const hydrated of [fromBackup, fromModule]) {
    const read = readStoredCommercial(hydrated);
    assert.equal(read.status, 'valid');
    assert.deepEqual(read.original, set);
    assert.ok(read.reconstructed);
    assert.equal(read.reconstructed!.session.sales.length, set.business!.sales.length);
    assert.equal(read.reconstructed!.session.moneyEvents!.length, set.business!.moneyEvents.length);
    assert.deepEqual(read.reconstructed!.stock, reconstructDurableCommercial(set)!.stock);
    assert.deepEqual(hydrated.finance.transactions, finance.transactions);
    assert.deepEqual(hydrated.finance.accounts.map(({ balance, initialBalance }) => ({ balance, initialBalance })),
      finance.accounts.map(({ balance, initialBalance }) => ({ balance, initialBalance })));
  }
});

test('combined history serializes, reconstructs and preserves all historical results and quantities', () => {
  const { set, session } = fixture();
  const captured = captureDurableCommercial({ session,
    recipes: set.business!.recipes.map(({ currency: _currency, ...recipe }) => { void _currency; return recipe; }),
    currency, eventOrder: set.business!.eventOrder, refundSources: set.business!.refundSources });
  assert.equal(captured.status, 'valid');
  if (captured.status === 'valid') assert.deepEqual(captured.set, set);
  const unknownCurrency = captureDurableCommercial({ session, recipes: [], currency: '',
    eventOrder: set.business!.eventOrder, refundSources: set.business!.refundSources });
  assert.equal(unknownCurrency.status, 'blocked');
  const before = structuredClone(set);
  const written = serializeDurableCommercial(set);
  assert.equal(written.status, 'valid', written.status === 'blocked' ? written.issues.map((issue) => issue.code).join(', ') : '');
  if (written.status !== 'valid') return;
  const recovered = recoverDurableCommercial(written.json);
  assert.equal(recovered.status, 'valid');
  if (recovered.status !== 'valid') return;
  assert.deepEqual(recovered.set, set);
  assert.deepEqual(recovered.reconstructed.summary, written.reconstructed.summary);
  assert.deepEqual(recovered.reconstructed.stock, written.reconstructed.stock);
  assert.deepEqual(recovered.reconstructed.finishedStock, written.reconstructed.finishedStock);
  assert.deepEqual(recovered.reconstructed.recipes, set.business!.recipes.map(({ currency: _currency, ...recipe }) => {
    void _currency; return recipe;
  }));
  assert.deepEqual(recovered.reconstructed.refundSources, set.business!.refundSources);
  assert.equal(recovered.reconstructed.financeLinksVerified, true);
  assert.deepEqual(set, before);
  const oldSaleCost = recovered.reconstructed.session.sales.find((sale) => sale.id === 'direct1')!.totalCostCents;
  const retry = confirmSandboxMoneyEvent(recovered.reconstructed.session, { ...fixture().payRequest });
  assert.equal(retry.status, 'already_confirmed');
  const recipe = recovered.reconstructed.recipes[0];
  const productionRetry = confirmSandboxProduction(recovered.reconstructed.session,
    { id: 'production1', recipe, units: 2 });
  assert.equal(productionRetry.status, 'already_confirmed');
  assert.deepEqual(productionRetry.session.inventory, recovered.reconstructed.session.inventory);
  assert.equal(recovered.reconstructed.session.sales.find((sale) => sale.id === 'direct1')!.totalCostCents, oldSaleCost);
});

test('invalid references, currency, orders, overpayment and refund allocation block without losing original', () => {
  const { set } = fixture();
  const cases: Array<[string, (copy: typeof set) => void]> = [
    ['currency_mismatch', (copy) => { copy.business!.sales[0].currency = 'USD'; }],
    ['invalid_version_or_currency', (copy) => { copy.business!.currency = ''; }],
    ['missing_event_order', (copy) => { copy.business!.eventOrder.pop(); }],
    ['missing_purchase', (copy) => { copy.business!.moneyEvents[0].sourceId = 'missing'; }],
    ['overpaid_purchase', (copy) => { copy.business!.moneyEvents[0].amountCents = 70000; }],
    ['overallocated_receipt', (copy) => { copy.business!.refundSources[0].allocations[0].amountCents = 30000;
      copy.business!.moneyEvents.at(-1)!.amountCents = 30000; }],
    ['orphan_finance_link', (copy) => { copy.business!.financeLinks.push({ originKey: 'commercial:missing',
      transactionId: 'tx', choice: { accountId: 'a', categoryId: 'Reventa', currency: 'UYU', date: '2026-10-23' } }); }],
    ['sale_cost_or_stock_mismatch', (copy) => { copy.business!.sales[0].totalCostCents += 1; }],
    ['premature_or_excess_refund', (copy) => { const adjustment = copy.business!.eventOrder.find((entry) => entry.id === 'return1')!;
      adjustment.effectiveOrder = '000000000014'; const refund = copy.business!.eventOrder.find((entry) => entry.id === 'refund1')!;
      refund.effectiveOrder = '000000000013'; }],
  ];
  for (const [code, change] of cases) {
    const copy = structuredClone(set); change(copy);
    const raw = JSON.stringify(copy);
    const result = recoverDurableCommercial(raw);
    assert.equal(result.status, 'blocked', code);
    if (result.status === 'blocked') {
      assert.ok(result.issues.some((issue) => issue.code === code), `${code}: ${result.issues.map((issue) => issue.code)}`);
      assert.deepEqual(result.original, copy);
    }
  }
});

test('financial links remain provisional without Finance and are checked against actual transactions when supplied', () => {
  const { set } = fixture();
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = 1000; account.balance = 1000;
  const payment = set.business!.moneyEvents.find((entry) => entry.id === 'payment1')!;
  payment.finance = { mode: 'existing', transactionId: 'finance-payment' };
  set.business!.financeLinks.push({ originKey: 'commercial:purchase_payment:payment1',
    transactionId: 'finance-payment', choice: { accountId: account.id, categoryId: 'Reventa',
      currency: 'UYU', date: '2026-10-23' } });
  const saved = serializeDurableCommercial(set);
  assert.equal(saved.status, 'valid');
  if (saved.status !== 'valid') return;
  assert.equal(saved.reconstructed.financeLinksVerified, false);
  const missing = recoverDurableCommercial(saved.json, { finance: state.finance });
  assert.equal(missing.status, 'blocked');
  addTransaction(state, { id: 'finance-payment', type: 'gasto', amount: 150, accountId: account.id,
    category: 'Reventa', date: '2026-10-23' });
  const linked = recoverDurableCommercial(saved.json, { finance: state.finance });
  assert.equal(linked.status, 'valid');
  if (linked.status === 'valid') assert.equal(linked.reconstructed.financeLinksVerified, true);
  assert.equal(state.finance.transactions.length, 1);
});

test('an entered financial ID without a durable link remains unverified after recovery', () => {
  const { set } = fixture();
  set.business!.moneyEvents[0].finance = { mode: 'existing', transactionId: 'typed-id' };
  const saved = serializeDurableCommercial(set);
  assert.equal(saved.status, 'valid');
  if (saved.status !== 'valid') return;
  assert.equal(saved.reconstructed.financeLinksVerified, false);
  const state = defaultState();
  const checked = recoverDurableCommercial(saved.json, { finance: state.finance });
  assert.equal(checked.status, 'blocked');
  if (checked.status === 'blocked') assert.ok(checked.issues.some((issue) => issue.code === 'unverified_existing_reference'));
});

test('reconciliation preserves identical business history and blocks divergence with both originals', () => {
  const { set } = fixture();
  const same = reconcileCommercialSets(set, structuredClone(set));
  assert.equal(same.status, 'combined');
  if (same.status === 'combined') assert.deepEqual(same.combined.business, set.business);
  const other = structuredClone(set);
  other.business!.moneyEvents[0].amountCents += 1;
  const blocked = reconcileCommercialSets(set, other);
  assert.equal(blocked.status, 'blocked');
  if (blocked.status === 'blocked') { assert.deepEqual(blocked.left, set); assert.deepEqual(blocked.right, other); }
  const oneSided = reconcileCommercialSets(set, { items: set.items, operations: set.operations, movements: set.movements });
  assert.equal(oneSided.status, 'blocked');
});

test('old stock-only collections remain readable but cannot masquerade as complete durable history', () => {
  const old = emptySandboxInventory();
  assert.equal(validateDurableCommercial(old).valid, true);
  assert.equal(reconstructDurableCommercial(old), null);
  assert.equal(serializeDurableCommercial(old).status, 'blocked');
  const broken = '{"items":[],"operations":[],"movements":[],"business":{"version":1}}';
  const recovery = recoverDurableCommercial(broken);
  assert.equal(recovery.status, 'blocked');
  if (recovery.status === 'blocked') assert.equal(typeof recovery.original, 'object');
  const invalidJson = recoverDurableCommercial('{invalid');
  assert.equal(invalidJson.status, 'blocked');
  if (invalidJson.status === 'blocked') assert.equal(invalidJson.original, '{invalid');
});

test('a declared USD business round-trips as USD; missing or mixed denomination never defaults to UYU', () => {
  const { set } = fixture();
  set.business!.currency = 'USD';
  for (const key of ['recipes', 'purchases', 'productions', 'sales', 'finishedWastes', 'saleCorrections', 'moneyEvents'] as const)
    for (const record of set.business![key]) record.currency = 'USD';
  const saved = serializeDurableCommercial(set);
  assert.equal(saved.status, 'valid');
  if (saved.status !== 'valid') return;
  const restored = recoverDurableCommercial(saved.json);
  assert.equal(restored.status, 'valid');
  if (restored.status === 'valid') assert.equal(restored.set.business!.currency, 'USD');
  set.business!.moneyEvents[0].currency = '';
  assert.equal(serializeDurableCommercial(set).status, 'blocked');
});
