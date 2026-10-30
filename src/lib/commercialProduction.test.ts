import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommercialSnapshot } from './commercialProduction';
import { advanceCommercialPilot, type CommercialPilotSnapshot } from './commercialPilot';
import { addSandboxItem, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxPurchaseWithPayment, confirmSandboxDirectSaleWithReceipt } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary } from './commercialMoneySandbox';
import { confirmSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { confirmSandboxPurchaseAdjustment } from './commercialCorrectionSandbox';
import { resolveCommercialTransactionPresentation } from './commercialFinanceBridge';
import { validateDurableCommercial } from './commercialDurable';
import {
  addFinancialCommitment,
  deleteTransaction,
  ignoreTransactionReview,
  linkTransactionToCommitment,
  linkTransactionToExpectedIncome,
  rejectTransactionMatch,
  updateTransaction,
} from './financeFlows';
import { deriveFinanceReviewInbox } from './financeReview';
import { findMatchCandidates } from './financeMatching';
import { defaultState, saveStoredState, getStorageKey } from './storage';
import { diagnoseCommercialAccessBlock, loadCloudRevisions } from './cloudSync';
import { provisionZeroKnowledgeKeys } from './cryptoCore';
import { executeE2EEMigration } from './cryptoMigration';
import { SYNC_MODULES, type SyncModuleKey } from './syncModel';

test('production commands persist obligations, partial money, return and refund through the existing Finance ledger', () => {
  const state = defaultState();
  const accountId = state.finance.accounts[0].id;
  const categoryId = state.finance.categories.find(c => c.active)!.id;
  let snapshot: CommercialPilotSnapshot = { currency: 'UYU', recipes: [], eventOrder: [], refundSources: [],
    session: { inventory: emptySandboxInventory(), sales: [], moneyEvents: [] } };
  const commit = (session: typeof snapshot.session) => {
    snapshot = applyCommercialSnapshot(state, structuredClone(state.resale.commercial), advanceCommercialPilot(snapshot, session),
      { categoryId, date: '2026-10-27' });
  };
  const bought = confirmSandboxPurchaseWithPayment(snapshot.session,
    addSandboxItem(snapshot.session.inventory, 'Producto', 'unit', 10, 100), { timing: 'later' });
  assert.notEqual(bought.status, 'blocked'); if (bought.status === 'blocked') return;
  commit(bought.session); assert.equal(state.finance.transactions.length, 0);
  const pay = confirmSandboxMoneyEvent(snapshot.session, { id: 'pay', purpose: 'purchase_payment',
    sourceId: snapshot.session.purchases![0].id, amountCents: 3000, accountRef: accountId, finance: { mode: 'new' } });
  assert.notEqual(pay.status, 'blocked'); if (pay.status === 'blocked') return;
  commit(pay.session);
  const sold = confirmSandboxDirectSaleWithReceipt(snapshot.session, { id: 'sale', itemId: snapshot.session.inventory.items[0].id,
    units: 2, unitPriceCents: 3000 }, { timing: 'later' });
  assert.notEqual(sold.status, 'blocked'); if (sold.status === 'blocked') return;
  commit(sold.session);
  const collect = confirmSandboxMoneyEvent(snapshot.session, { id: 'collect', purpose: 'sale_receipt', sourceId: 'sale',
    amountCents: 4000, accountRef: accountId, finance: { mode: 'new' } });
  assert.notEqual(collect.status, 'blocked'); if (collect.status === 'blocked') return;
  commit(collect.session);
  assert.equal(state.finance.accounts[0].balance, 10);
  const retry = structuredClone(state); commit(snapshot.session); assert.deepEqual(state, retry);
  const returned = confirmSandboxSaleAdjustment(snapshot.session, { id: 'return', saleId: 'sale', units: 1,
    kind: 'return', disposition: 'restock', confirmedUndelivered: false });
  assert.notEqual(returned.status, 'blocked'); if (returned.status === 'blocked') return;
  commit(returned.session);
  const refund = confirmSandboxMoneyEvent(snapshot.session, { id: 'refund', purpose: 'customer_refund', sourceId: 'sale',
    amountCents: 1000, accountRef: accountId, finance: { mode: 'new' } });
  assert.notEqual(refund.status, 'blocked'); if (refund.status === 'blocked') return;
  commit(refund.session);
  assert.equal(state.finance.transactions.length, 3);
  assert.equal(state.finance.accounts[0].balance, 0);
  assert.deepEqual(snapshot.refundSources, [{ refundEventId: 'refund', allocations: [{ receiptEventId: 'collect', amountCents: 1000 }] }]);
  assert.equal(sandboxMoneySummary(snapshot.session).payableCents, 7000);
  const original = structuredClone(state);
  assert.throws(() => applyCommercialSnapshot(state, undefined, snapshot, { categoryId, date: '2026-10-27' }), /cambió/);
  const bad = structuredClone(snapshot); bad.session.moneyEvents![0].amountCents = 9000;
  assert.throws(() => applyCommercialSnapshot(state, state.resale.commercial, bad, { categoryId, date: '2026-10-27' }));
  assert.deepEqual(state, original);
  const memory = new Map<string, string>();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } } as Storage;
  assert.equal(saveStoredState(state, 'production-test'), true);
  const stale = structuredClone(state); stale.profile.name = 'newer tab';
  memory.set(getStorageKey('production-test'), JSON.stringify(stale));
  assert.equal(saveStoredState(state, 'production-test', original), false);
  assert.equal(memory.get(getStorageKey('production-test')), JSON.stringify(stale));
});

test('diagnoseCommercialAccessBlock distinguishes unauthenticated vs E2EE not configured vs E2EE locked', () => {
  const unauthenticated = diagnoseCommercialAccessBlock({
    requestedUserId: 'user-1',
    authenticatedUserId: null,
    hasUnlockedSessionKey: false,
    hasLocalKeyEnvelope: false,
  });
  assert.equal(unauthenticated?.code, 'unauthenticated');
  assert.match(unauthenticated?.message ?? '', /Iniciá sesión/);

  const e2eeNotConfigured = diagnoseCommercialAccessBlock({
    requestedUserId: 'user-1',
    authenticatedUserId: 'user-1',
    hasUnlockedSessionKey: false,
    hasLocalKeyEnvelope: false,
  });
  assert.equal(e2eeNotConfigured?.code, 'e2ee_not_configured');
  assert.doesNotMatch(e2eeNotConfigured?.message ?? '', /Iniciá sesión/);
  assert.match(e2eeNotConfigured?.message ?? '', /Activá o desbloqueá el cifrado E2EE/);

  const e2eeLocked = diagnoseCommercialAccessBlock({
    requestedUserId: 'user-1',
    authenticatedUserId: 'user-1',
    hasUnlockedSessionKey: false,
    hasLocalKeyEnvelope: true,
  });
  assert.equal(e2eeLocked?.code, 'e2ee_locked');
  assert.doesNotMatch(e2eeLocked?.message ?? '', /Iniciá sesión/);
  assert.match(e2eeLocked?.message ?? '', /Desbloqueá el cifrado E2EE/);

  const ready = diagnoseCommercialAccessBlock({
    requestedUserId: 'user-1',
    authenticatedUserId: 'user-1',
    hasUnlockedSessionKey: true,
    hasLocalKeyEnvelope: true,
  });
  assert.equal(ready, null);
});

test('executeE2EEMigration persists post-encryption module revisions so subsequent commercial writes have matching parentRevision', async () => {
  const memory = new Map<string, string>();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: key => { memory.delete(key); },
    clear: () => { memory.clear(); },
  } as Storage;

  const userId = 'e2ee-migration-revision-sync';
  const state = defaultState();
  const { sessionMdek, envelope } = await provisionZeroKnowledgeKeys(userId);
  let capability = null as any;

  const result = await executeE2EEMigration(userId, state, sessionMdek, {
    capabilityHandlers: {
      getCapability: async () => capability,
      setCapability: async (_u, cap) => { capability = cap; },
      getKeyEnvelope: async () => envelope,
      setKeyEnvelope: async () => {},
    },
    customWriter: (async (_u: string, _s: any, mods: SyncModuleKey[]) => ({
      writes: mods.map(m => ({ module: m, revision: `e2ee-rev-${m}`, parentRevision: null })),
      completion: Promise.resolve(),
    })) as any,
  });

  assert.equal(result.success, true);
  const persistedRevisions = loadCloudRevisions(userId);
  for (const mod of SYNC_MODULES) {
    assert.equal(persistedRevisions[mod], `e2ee-rev-${mod}`);
  }
});

test('commercial movements enforce domain protection, descriptive labels, origin traceability, manual category choice and compensatory coherence', () => {
  const state = defaultState();
  const accountId = state.finance.accounts[0].id;
  let snapshot: CommercialPilotSnapshot = {
    currency: 'UYU',
    recipes: [],
    eventOrder: [],
    refundSources: [],
    session: { inventory: emptySandboxInventory(), sales: [], moneyEvents: [] },
  };

  // 1. Purchase of "pan" ($U 150) without immediate payment requires no category yet
  const bought = confirmSandboxPurchaseWithPayment(
    snapshot.session,
    addSandboxItem(snapshot.session.inventory, 'pan', 'unit', 10, 150),
    { timing: 'later' }
  );
  assert.notEqual(bought.status, 'blocked');
  if (bought.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, bought.session),
    { categoryId: '', date: '2026-10-27' }
  );
  assert.equal(state.finance.transactions.length, 0);

  // 2. Paying the purchase without choosing a category is rejected (no silent default)
  const pay150 = confirmSandboxMoneyEvent(snapshot.session, {
    id: 'pay-pan',
    purpose: 'purchase_payment',
    sourceId: snapshot.session.purchases![0].id,
    amountCents: 15000,
    accountRef: accountId,
    finance: { mode: 'new' },
  });
  assert.notEqual(pay150.status, 'blocked');
  if (pay150.status === 'blocked') return;
  assert.throws(
    () =>
      applyCommercialSnapshot(
        state,
        structuredClone(state.resale.commercial),
        advanceCommercialPilot(snapshot, pay150.session),
        { categoryId: '', date: '2026-10-27' }
      ),
    /categoría financiera/i
  );

  // 3. Paying with explicit category "Reventa" applies "Reventa" and labels "Compra de pan"
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, pay150.session),
    { categoryId: 'Reventa', date: '2026-10-27' }
  );
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.transactions[0].id, 'commercial:pay-pan');
  assert.equal(state.finance.transactions[0].note, 'Compra de pan');
  assert.equal(state.finance.transactions[0].category, 'Reventa');
  assert.equal(state.finance.accounts[0].balance, -150);

  // 4. Direct sale of "pan" ($U 300) with receipt labels "Venta de pan"
  const sold = confirmSandboxDirectSaleWithReceipt(
    snapshot.session,
    { id: 'sale-pan', itemId: snapshot.session.inventory.items[0].id, units: 5, unitPriceCents: 6000 },
    { timing: 'now', accountRef: accountId }
  );
  assert.notEqual(sold.status, 'blocked');
  if (sold.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, sold.session),
    { categoryId: 'Reventa', date: '2026-10-27' }
  );
  assert.equal(state.finance.transactions.length, 2);
  const saleTx = state.finance.transactions[1];
  assert.equal(saleTx.note, 'Venta de pan');
  assert.equal(saleTx.category, 'Reventa');
  assert.equal(state.finance.accounts[0].balance, 150);

  // 5. Legacy/existing transaction stored with generic note "Mi negocio" resolves live to "Compra de pan" + originBadge "Mi negocio"
  const legacyPresentation = resolveCommercialTransactionPresentation(
    { id: 'commercial:pay-pan', note: 'Mi negocio' },
    state.resale.commercial
  );
  assert.equal(legacyPresentation.isCommercial, true);
  assert.equal(legacyPresentation.displayNote, 'Compra de pan');
  assert.equal(legacyPresentation.originBadge, 'Mi negocio');

  // 6. Domain-level protection blocks direct edit, delete, review inbox mutation, and commitment/income linking
  addFinancialCommitment(state, {
    id: 'com-150',
    name: 'pan',
    amount: 150,
    currency: 'UYU',
    nextDueDate: '2026-10-27',
  });
  state.finance.expectedIncomes = [
    {
      id: 'inc-300',
      name: 'pan',
      amount: 300,
      currency: 'UYU',
      startDate: '2026-10-27',
      frequency: 'once',
      active: true,
    },
  ];

  const beforeProtectedAttempts = structuredClone(state);
  assert.throws(() => deleteTransaction(state, 'commercial:pay-pan'), /Mi negocio/);
  assert.throws(
    () =>
      updateTransaction(state, 'commercial:pay-pan', {
        type: 'gasto',
        amount: 999,
        category: 'Comida',
        accountId,
        date: '2026-10-27',
        note: 'Editado manualmente',
      }),
    /Mi negocio/
  );
  assert.throws(() => linkTransactionToCommitment(state, 'commercial:pay-pan', 'com-150'), /Mi negocio/);
  assert.throws(() => linkTransactionToExpectedIncome(state, saleTx.id, 'inc-300'), /Mi negocio/);
  assert.throws(() => ignoreTransactionReview(state, 'commercial:pay-pan'), /Mi negocio/);
  assert.throws(() => rejectTransactionMatch(state, 'commercial:pay-pan', 'com-150'), /Mi negocio/);
  assert.equal(findMatchCandidates(state.finance.transactions[0], state).confidence, 'none');
  const inbox = deriveFinanceReviewInbox(state, '2026-10-27');
  assert.equal(inbox.items.length, 0);
  assert.equal(inbox.attentionCommitments[0]?.compatibleTxId, undefined);
  assert.deepEqual(state, beforeProtectedAttempts);

  // 7. Compensatory flows in Mi negocio (sale return + customer refund, purchase return + supplier refund, payment reversal)
  const saleReturn = confirmSandboxSaleAdjustment(snapshot.session, {
    id: 'ret-sale-pan',
    saleId: 'sale-pan',
    units: 1,
    kind: 'return',
    disposition: 'restock',
    confirmedUndelivered: false,
  });
  assert.notEqual(saleReturn.status, 'blocked');
  if (saleReturn.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, saleReturn.session),
    { categoryId: '', date: '2026-10-27' }
  );

  // Customer refund inherits "Reventa" when categoryId is empty and labels "Reembolso de venta de pan"
  const custRefund = confirmSandboxMoneyEvent(snapshot.session, {
    id: 'refund-sale-pan',
    purpose: 'customer_refund',
    sourceId: 'sale-pan',
    amountCents: 6000,
    accountRef: accountId,
    finance: { mode: 'new' },
  });
  assert.notEqual(custRefund.status, 'blocked');
  if (custRefund.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, custRefund.session),
    { categoryId: '', date: '2026-10-27' }
  );
  assert.equal(state.finance.transactions.at(-1)?.note, 'Reembolso de venta de pan');
  assert.equal(state.finance.transactions.at(-1)?.category, 'Reventa');
  assert.equal(state.finance.accounts[0].balance, 90);

  // Purchase return of 2 units ($U 30) + supplier refund ($U 30) labels "Reembolso de compra de pan"
  const purchReturn = confirmSandboxPurchaseAdjustment(snapshot.session, {
    id: 'ret-purch-pan',
    purchaseId: snapshot.session.purchases![0].id,
    units: 2,
    kind: 'return',
  });
  assert.notEqual(purchReturn.status, 'blocked');
  if (purchReturn.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, purchReturn.session),
    { categoryId: '', date: '2026-10-27' }
  );

  const suppRefund = confirmSandboxMoneyEvent(snapshot.session, {
    id: 'refund-purch-pan',
    purpose: 'supplier_refund',
    sourceId: snapshot.session.purchases![0].id,
    amountCents: 3000,
    accountRef: accountId,
    finance: { mode: 'new' },
  });
  assert.notEqual(suppRefund.status, 'blocked');
  if (suppRefund.status === 'blocked') return;
  snapshot = applyCommercialSnapshot(
    state,
    structuredClone(state.resale.commercial),
    advanceCommercialPilot(snapshot, suppRefund.session),
    { categoryId: '', date: '2026-10-27' }
  );
  assert.equal(state.finance.transactions.at(-1)?.note, 'Reembolso de compra de pan');
  assert.equal(state.finance.transactions.at(-1)?.category, 'Reventa');
  assert.equal(state.finance.accounts[0].balance, 120);

  const validation = validateDurableCommercial(state.resale.commercial!, {
    finance: state.finance,
    resaleInventory: state.resale.inventory,
  });
  assert.equal(validation.valid, true);
});
