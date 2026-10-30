import assert from 'node:assert/strict';
import test from 'node:test';
import { addSandboxExit, addSandboxItem, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { confirmSandboxDirectSaleWithReceipt, confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary, type SandboxMoneySession } from './commercialMoneySandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxPreparedSale, confirmSandboxProduction } from './commercialProductionSandbox';
import { captureDurableCommercial } from './commercialDurable';
import { commercialPilotEmulatorConfigAllowed, connectCommercialPilotEmulator,
  type CommercialPilotEmulatorGuardInput } from './cloudSync';
import { advanceCommercialPilot, COMMERCIAL_PILOT_KEY, loadCommercialPilot, saveCommercialPilot,
  type CommercialPilotSnapshot } from './commercialPilot';

function pilotStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

test('el conector del emulador rechaza el acceso fuera del entorno aislado antes de inicializar Firebase', async () => {
  const keys = ['NODE_ENV', 'LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST', 'VITE_COMMERCIAL_PILOT',
    'VITE_COMMERCIAL_PILOT_SYNC', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    await assert.rejects(connectCommercialPilotEmulator('blocked'), /solo permite desarrollo explícito o pruebas en demo-lifeos/);
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('guard del piloto: solo permite pruebas explícitas en demo-lifeos con ambos emuladores locales', () => {
  const valid = {
    nodeEnv: 'test', testIndicator: '1', gcloudProject: 'demo-lifeos',
    firestoreEmulatorHost: '127.0.0.1:8080', authEmulatorHost: '127.0.0.1:9099',
  };
  const allowed = (input: CommercialPilotEmulatorGuardInput) =>
    commercialPilotEmulatorConfigAllowed(input, 'test');

  assert.equal(allowed(valid), true, 'la configuración de emulators:exec debe ser suficiente sin VITE_*');
  assert.equal(allowed({ ...valid, firestoreEmulatorHost: 'localhost:8080', authEmulatorHost: 'localhost:9099' }), true);
  assert.equal(allowed({ ...valid, gcloudProject: 'lifeos-production' }), false);
  assert.equal(allowed({ ...valid, authEmulatorHost: undefined }), false);
  assert.equal(allowed({ ...valid, firestoreEmulatorHost: undefined }), false);
  assert.equal(allowed({ ...valid, firestoreEmulatorHost: 'firestore.example.com:8080' }), false);
  assert.equal(allowed({ ...valid, nodeEnv: 'production' }), false);
  assert.equal(allowed({ ...valid, testIndicator: undefined }), false);
  assert.equal(allowed({ ...valid, firebaseConfig: '{malformed' }), false);
  assert.equal(allowed({ ...valid, firebaseConfig: '{"projectId":"lifeos-production"}' }), false);
  assert.equal(allowed({ ...valid, firebaseConfig: '{"projectId":"demo-lifeos"}' }), true);
  assert.equal(allowed({ ...valid, gcloudProject: 'demo-lifeos', firebaseConfig: '{"projectId":"other-demo"}' }), false);

  const browserBase = { ...valid, dev: true, pilotEnabled: '1', pilotSyncEnabled: '1',
    protocol: 'http:', hostname: 'localhost' };
  assert.equal(commercialPilotEmulatorConfigAllowed(browserBase, 'development'), true);
  assert.equal(commercialPilotEmulatorConfigAllowed({ ...browserBase, dev: false }, 'development'), false);
  assert.equal(commercialPilotEmulatorConfigAllowed({ ...browserBase, pilotEnabled: undefined }, 'development'), false);
  assert.equal(commercialPilotEmulatorConfigAllowed({ ...browserBase, protocol: 'https:' }, 'development'), false);
  assert.equal(commercialPilotEmulatorConfigAllowed({ ...browserBase, hostname: 'app.example.com' }, 'development'), false);
});

test('piloto aislado: compras, receta, producción, ventas y dinero sobreviven a una recarga', () => {
  const storage = pilotStorage();
  assert.equal(loadCommercialPilot(storage).status, 'empty');
  const empty: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], purchases: [], productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] };
  let snapshot: CommercialPilotSnapshot = { currency: 'UYU', session: empty, recipes: [], eventOrder: [], refundSources: [] };
  let raw: string | null = null;
  const commit = (session: SandboxMoneySession, recipes = snapshot.recipes) => {
    const next = advanceCommercialPilot(snapshot, session, recipes);
    const saved = saveCommercialPilot(storage, raw, next);
    assert.equal(saved.status, 'saved', saved.status === 'blocked' ? saved.issues.join(' ') : '');
    if (saved.status !== 'saved') throw new Error('Guardado de prueba inválido');
    snapshot = next; raw = saved.raw;
  };

  const paid = confirmSandboxPurchaseWithPayment(snapshot.session,
    addSandboxItem(snapshot.session.inventory, 'Pan', 'unit', 10, 100), { timing: 'now', accountRef: 'caja-prueba' });
  assert.equal(paid.status, 'confirmed');
  if (paid.status !== 'confirmed') return;
  commit(paid.session);
  const pending = confirmSandboxPurchaseWithPayment(snapshot.session,
    addSandboxItem(snapshot.session.inventory, 'Carne', 'kg', 2, 600), { timing: 'later' });
  assert.equal(pending.status, 'confirmed');
  if (pending.status !== 'confirmed') return;
  commit(pending.session);
  const [recipe] = upsertSandboxRecipe([], snapshot.session.inventory, { name: 'Hamburguesa',
    ingredients: [{ itemId: snapshot.session.inventory.items[0].id, quantity: 1, unit: 'unit' },
      { itemId: snapshot.session.inventory.items[1].id, quantity: 100, unit: 'g' }],
    directCost: 5, salePrice: 100 });
  commit(snapshot.session, [recipe]);
  const prepared = confirmSandboxProduction(snapshot.session, { id: 'production-1', recipe, units: 2 });
  assert.equal(prepared.status, 'confirmed');
  if (prepared.status !== 'confirmed') return;
  commit(prepared.session);
  const preparedSale = confirmSandboxPreparedSale(snapshot.session, { id: 'prepared-sale-1', recipe, units: 1 });
  assert.equal(preparedSale.status, 'confirmed');
  if (preparedSale.status !== 'confirmed') return;
  commit(preparedSale.session);
  const cashSale = confirmSandboxDirectSaleWithReceipt(snapshot.session,
    { id: 'sandbox-direct-1', itemId: snapshot.session.inventory.items[0].id, units: 2, unitPriceCents: 1999 },
    { timing: 'now', accountRef: 'caja-prueba' });
  assert.equal(cashSale.status, 'confirmed');
  if (cashSale.status !== 'confirmed') return;
  commit(cashSale.session);
  const laterSale = confirmSandboxDirectSaleWithReceipt(snapshot.session,
    { id: 'sandbox-direct-2', itemId: snapshot.session.inventory.items[0].id, units: 1, unitPriceCents: 3000 },
    { timing: 'later' });
  assert.equal(laterSale.status, 'confirmed');
  if (laterSale.status !== 'confirmed') return;
  commit(laterSale.session);
  const receipt = confirmSandboxMoneyEvent(snapshot.session, { id: 'receipt-later-1',
    purpose: 'sale_receipt', sourceId: 'sandbox-direct-2', amountCents: 1500,
    accountRef: 'caja-prueba', finance: { mode: 'new' } });
  assert.equal(receipt.status, 'confirmed');
  if (receipt.status !== 'confirmed') return;
  commit(receipt.session);
  const payment = confirmSandboxMoneyEvent(snapshot.session, { id: 'payment-later-1',
    purpose: 'purchase_payment', sourceId: snapshot.session.purchases![1].id, amountCents: 20000,
    accountRef: 'caja-prueba', finance: { mode: 'new' } });
  assert.equal(payment.status, 'confirmed');
  if (payment.status !== 'confirmed') return;
  commit(payment.session);

  const before = structuredClone(snapshot);
  const loaded = loadCommercialPilot(storage); // New hydration from serialized tab storage.
  assert.equal(loaded.status, 'ready');
  if (loaded.status !== 'ready') return;
  const expected = captureDurableCommercial(before);
  assert.equal(expected.status, 'valid');
  if (expected.status !== 'valid') return;
  assert.deepEqual(JSON.parse(loaded.raw), expected.set);
  assert.deepEqual(loaded.snapshot.session.inventory, before.session.inventory);
  assert.deepEqual(loaded.snapshot.eventOrder, before.eventOrder);
  assert.equal(loaded.reconstructed.session.sales.length, 3);
  assert.deepEqual(sandboxMoneySummary(loaded.snapshot.session), sandboxMoneySummary(before.session));
  assert.deepEqual(((summary) => [summary.activeRevenueCents, summary.activeSoldCostCents,
    summary.grossProfitCents, summary.receivedCents, summary.paidCents,
    summary.receivableCents, summary.payableCents, summary.simulatedCashFlowCents])(
    sandboxMoneySummary(loaded.snapshot.session)), [16998, 7500, 9498, 5498, 30000, 11500, 40000, -24502]);
  for (const item of before.session.inventory.items) assert.deepEqual(
    sandboxItemSummary(loaded.snapshot.session.inventory, item.id), sandboxItemSummary(before.session.inventory, item.id));
  assert.equal(loaded.snapshot.session.moneyEvents?.length, 4);
  assert.equal(loaded.snapshot.session.inventory.items[0].id, before.session.inventory.items[0].id);
  assert.equal(sandboxItemSummary(loaded.snapshot.session.inventory, loaded.snapshot.session.inventory.items[0].id).quantity, 5);
  assert.equal(sandboxItemSummary(loaded.snapshot.session.inventory, loaded.snapshot.session.inventory.items[1].id).quantity, 1.8);
  const continued = confirmSandboxMoneyEvent(loaded.snapshot.session, { id: 'receipt-later-2',
    purpose: 'sale_receipt', sourceId: 'sandbox-direct-2', amountCents: 1500,
    accountRef: 'caja-prueba', finance: { mode: 'new' } });
  assert.equal(continued.status, 'confirmed');
  if (continued.status !== 'confirmed') return;
  const next = advanceCommercialPilot(loaded.snapshot, continued.session);
  const continuedSave = saveCommercialPilot(storage, loaded.raw, next);
  assert.equal(continuedSave.status, 'saved');
  if (continuedSave.status !== 'saved') return;
  const afterReceipt = loadCommercialPilot(storage);
  assert.equal(afterReceipt.status, 'ready');
  if (afterReceipt.status !== 'ready') return;
  const nextSale = confirmSandboxDirectSaleWithReceipt(afterReceipt.snapshot.session,
    { id: 'sandbox-direct-3', itemId: afterReceipt.snapshot.session.inventory.items[0].id,
      units: 1, unitPriceCents: 1999 }, { timing: 'later' });
  assert.equal(nextSale.status, 'confirmed');
  if (nextSale.status !== 'confirmed') return;
  assert.equal(saveCommercialPilot(storage, afterReceipt.raw,
    advanceCommercialPilot(afterReceipt.snapshot, nextSale.session)).status, 'saved');
  const final = loadCommercialPilot(storage);
  assert.equal(final.status, 'ready');
  if (final.status === 'ready') assert.deepEqual(final.snapshot.session.sales.map((sale) => sale.id),
    ['prepared-sale-1', 'sandbox-direct-1', 'sandbox-direct-2', 'sandbox-direct-3']);
  assert.equal(storage.data.size, 1);
});

test('piloto aislado: payload inválido, cambio concurrente y fallo de almacenamiento no sobrescriben datos', () => {
  const storage = pilotStorage();
  const empty: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(), sales: [] };
  const snapshot: CommercialPilotSnapshot = { currency: 'UYU', session: empty, recipes: [], eventOrder: [], refundSources: [] };
  const saved = saveCommercialPilot(storage, null, snapshot);
  assert.equal(saved.status, 'saved');
  if (saved.status !== 'saved') return;
  assert.equal(saveCommercialPilot(storage, null, snapshot).status, 'blocked');
  assert.equal(storage.getItem(COMMERCIAL_PILOT_KEY), saved.raw);
  storage.setItem(COMMERCIAL_PILOT_KEY, '{"incomplete":');
  const invalid = loadCommercialPilot(storage);
  assert.equal(invalid.status, 'blocked');
  assert.equal(saveCommercialPilot(storage, storage.getItem(COMMERCIAL_PILOT_KEY), snapshot).status, 'blocked');
  assert.equal(storage.getItem(COMMERCIAL_PILOT_KEY), '{"incomplete":');
  storage.setItem(COMMERCIAL_PILOT_KEY, JSON.stringify({ items: [], operations: [], movements: [], business: null }));
  assert.equal(loadCommercialPilot(storage).status, 'blocked');
  assert.equal(storage.getItem(COMMERCIAL_PILOT_KEY), JSON.stringify({ items: [], operations: [], movements: [], business: null }));
  const unavailable = { getItem: () => { throw new Error('quota'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(loadCommercialPilot(unavailable).status, 'blocked');
  assert.equal(saveCommercialPilot(unavailable, null, snapshot).status, 'blocked');
});

test('el piloto conserva una moneda explícita distinta de UYU y bloquea historiales sin denominación', () => {
  const storage = pilotStorage();
  const empty: CommercialPilotSnapshot = { currency: 'USD', session: { inventory: emptySandboxInventory(),
    finished: emptySandboxInventory(), sales: [], purchases: [], productions: [], finishedWastes: [],
    saleCorrections: [], moneyEvents: [] }, recipes: [], eventOrder: [], refundSources: [] };
  const purchase = confirmSandboxPurchaseWithPayment(empty.session,
    addSandboxItem(empty.session.inventory, 'Test USD', 'unit', 2, 19.99), { timing: 'now', accountRef: 'test cash' });
  assert.equal(purchase.status, 'confirmed');
  if (purchase.status !== 'confirmed') return;

  const snapshot = advanceCommercialPilot(empty, purchase.session);
  const saved = saveCommercialPilot(storage, null, snapshot);
  assert.equal(saved.status, 'saved');
  if (saved.status !== 'saved') return;
  const recovered = loadCommercialPilot(storage);
  assert.equal(recovered.status, 'ready');
  if (recovered.status !== 'ready') return;
  assert.equal(recovered.snapshot.currency, 'USD');
  const durable = captureDurableCommercial(recovered.snapshot);
  assert.equal(durable.status, 'valid');
  if (durable.status !== 'valid') return;
  assert.equal(durable.set.business!.purchases[0].currency, 'USD');
  assert.equal(durable.set.business!.moneyEvents[0].currency, 'USD');
  assert.equal(durable.set.business!.purchases[0].amountCents, 1999);
  assert.equal(recovered.snapshot.session.moneyEvents?.[0].sourceId, recovered.snapshot.session.purchases?.[0].id);

  const nextPurchase = confirmSandboxPurchaseWithPayment(recovered.snapshot.session,
    addSandboxItem(recovered.snapshot.session.inventory, 'USD follow-up', 'unit', 1, 5), { timing: 'later' });
  assert.equal(nextPurchase.status, 'confirmed');
  if (nextPurchase.status !== 'confirmed') return;
  const continued = advanceCommercialPilot(recovered.snapshot, nextPurchase.session);
  const continuedSave = saveCommercialPilot(storage, recovered.raw, continued);
  assert.equal(continuedSave.status, 'saved');
  if (continuedSave.status !== 'saved') return;
  const continuedLoad = loadCommercialPilot(storage);
  assert.equal(continuedLoad.status, 'ready');
  if (continuedLoad.status !== 'ready') return;
  const continuedDurable = captureDurableCommercial(continuedLoad.snapshot);
  assert.equal(continuedDurable.status, 'valid');
  if (continuedDurable.status !== 'valid') return;
  assert.deepEqual(continuedDurable.set.business!.purchases.map((entry) => entry.currency), ['USD', 'USD']);

  const legacyWithoutCurrency = JSON.parse(continuedSave.raw) as { business: { purchases: Array<Record<string, unknown>> } };
  delete legacyWithoutCurrency.business.purchases[0].currency;
  const original = JSON.stringify(legacyWithoutCurrency);
  storage.data.set(COMMERCIAL_PILOT_KEY, original);
  const blocked = loadCommercialPilot(storage);
  assert.equal(blocked.status, 'blocked');
  assert.equal(storage.getItem(COMMERCIAL_PILOT_KEY), original);
});

test('piloto aislado: uso y pérdida manual conservan stock y no crean pagos', () => {
  const storage = pilotStorage();
  const empty: CommercialPilotSnapshot = { currency: 'UYU', session: { inventory: emptySandboxInventory(), sales: [],
    purchases: [], moneyEvents: [] }, recipes: [], eventOrder: [], refundSources: [] };
  const bought = confirmSandboxPurchaseWithPayment(empty.session,
    addSandboxItem(empty.session.inventory, 'Harina', 'kg', 2, 100), { timing: 'later' });
  assert.equal(bought.status, 'confirmed');
  if (bought.status !== 'confirmed') return;
  const first = advanceCommercialPilot(empty, bought.session);
  const stored = saveCommercialPilot(storage, null, first);
  assert.equal(stored.status, 'saved');
  if (stored.status !== 'saved') return;
  const itemId = bought.session.inventory.items[0].id;
  const used = addSandboxExit(bought.session.inventory, itemId, 'consumption', 250, 'g');
  const second = advanceCommercialPilot(first, { ...bought.session, inventory: used });
  const savedUse = saveCommercialPilot(storage, stored.raw, second);
  assert.equal(savedUse.status, 'saved');
  if (savedUse.status !== 'saved') return;
  const lost = addSandboxExit(used, itemId, 'waste', 250, 'g');
  assert.equal(saveCommercialPilot(storage, savedUse.raw,
    advanceCommercialPilot(second, { ...bought.session, inventory: lost })).status, 'saved');
  const recovered = loadCommercialPilot(storage);
  assert.equal(recovered.status, 'ready');
  if (recovered.status !== 'ready') return;
  assert.equal(sandboxItemSummary(recovered.snapshot.session.inventory, itemId).quantity, 1.5);
  assert.equal(recovered.snapshot.session.moneyEvents?.length, 0);
});
