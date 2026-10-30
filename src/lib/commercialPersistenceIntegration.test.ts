import assert from 'node:assert/strict';
import test from 'node:test';
import { ResaleProtocolConflict, writeCloudModules, writeCloudModulesGuarded } from './cloudSync';
import { encodeCloudModuleData, decodeCloudModuleData, generateMdek } from './cryptoCore';
import { addSandboxItem, addSandboxReceipt, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxPurchaseWithPayment, confirmSandboxDirectSaleWithReceipt } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary, type SandboxMoneySession } from './commercialMoneySandbox';
import { confirmSandboxSaleAdjustment } from './commercialCorrectionSandbox';
import { upsertSandboxRecipe } from './commercialRecipeSandbox';
import { confirmSandboxPreparedSale, confirmSandboxProduction } from './commercialProductionSandbox';
import { captureDurableCommercial, recoverDurableCommercial, type DurableEventOrder } from './commercialDurable';
import { reconcileCommercialSets } from './commercialReconcile';
import { addRemoteResaleVersion, loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './resaleConflictRecovery';
import { applySyncModule, mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { defaultState, getStorageKey, loadStoredState, parseBackupJSON, readStoredCommercial,
  saveStoredState } from './storage';

// Only the transport is replaced. The domain codec, local state path, sync module path and crypto are real.
const memory = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => { memory.clear(); },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
} as Storage;

function businessFixture() {
  let session: SandboxMoneySession = { inventory: emptySandboxInventory(), finished: emptySandboxInventory(),
    sales: [], purchases: [], productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] };
  const eventOrder: DurableEventOrder[] = [];
  const order = (kind: DurableEventOrder['kind'], id: string) => eventOrder.push({ kind, id,
    effectiveOrder: String(eventOrder.length + 1).padStart(12, '0'), commercialDate: '2026-10-24' });
  const paid = confirmSandboxPurchaseWithPayment(session,
    addSandboxItem(session.inventory, 'Pan', 'unit', 10, 100), { timing: 'now', accountRef: 'caja' });
  assert.equal(paid.status, 'confirmed');
  if (paid.status !== 'confirmed') throw new Error('Fixture: compra al contado');
  session = paid.session;
  const itemId = session.inventory.items[0].id;
  order('purchase', session.purchases!.at(-1)!.id);
  order('money', session.moneyEvents!.at(-1)!.id);
  const pending = confirmSandboxPurchaseWithPayment(session,
    addSandboxReceipt(session.inventory, itemId, 5, 'unit', 75), { timing: 'later' });
  assert.equal(pending.status, 'confirmed');
  if (pending.status !== 'confirmed') throw new Error('Fixture: compra pendiente');
  session = pending.session;
  const purchaseId = session.purchases!.at(-1)!.id;
  order('purchase', purchaseId);
  const [recipe] = upsertSandboxRecipe([], session.inventory, { name: 'Pan preparado',
    ingredients: [{ itemId, quantity: 1, unit: 'unit' }], directCost: 0, salePrice: 50 });
  const production = confirmSandboxProduction(session, { id: 'production', recipe, units: 2 });
  assert.equal(production.status, 'confirmed');
  if (production.status !== 'confirmed') throw new Error('Fixture: producción');
  session = production.session;
  order('production', 'production');
  const prepared = confirmSandboxPreparedSale(session, { id: 'prepared', recipe, units: 1 });
  assert.equal(prepared.status, 'confirmed');
  if (prepared.status !== 'confirmed') throw new Error('Fixture: venta preparada');
  session = prepared.session;
  order('sale', 'prepared');
  const cashSale = { id: 'cash-sale', itemId, units: 3, unitPriceCents: 3000 };
  const cash = confirmSandboxDirectSaleWithReceipt(session, cashSale, { timing: 'now', accountRef: 'caja' });
  assert.equal(cash.status, 'confirmed');
  if (cash.status !== 'confirmed') throw new Error('Fixture: venta al contado');
  session = cash.session;
  order('sale', cashSale.id);
  order('money', session.moneyEvents!.at(-1)!.id);
  const dueSale = { id: 'due-sale', itemId, units: 1, unitPriceCents: 1999 };
  const due = confirmSandboxDirectSaleWithReceipt(session, dueSale, { timing: 'later' });
  assert.equal(due.status, 'confirmed');
  if (due.status !== 'confirmed') throw new Error('Fixture: venta pendiente');
  session = due.session;
  order('sale', dueSale.id);
  for (const [id, purpose, sourceId, amountCents] of [
    ['later-payment', 'purchase_payment', purchaseId, 4000],
    ['later-receipt', 'sale_receipt', dueSale.id, 1000],
  ] as const) {
    const result = confirmSandboxMoneyEvent(session, { id, purpose, sourceId, amountCents,
      accountRef: 'caja', finance: { mode: 'new' } });
    assert.equal(result.status, 'confirmed');
    if (result.status !== 'confirmed') throw new Error(`Fixture: ${id}`);
    session = result.session;
    order('money', id);
  }
  const adjustment = confirmSandboxSaleAdjustment(session, { id: 'correction', saleId: cashSale.id,
    kind: 'correction', units: 1, disposition: 'restock', confirmedUndelivered: true });
  assert.equal(adjustment.status, 'confirmed');
  if (adjustment.status !== 'confirmed') throw new Error('Fixture: corrección');
  session = adjustment.session;
  order('adjustment', 'correction');
  const captured = captureDurableCommercial({ session, recipes: [recipe], currency: 'UYU', eventOrder,
    refundSources: [] });
  assert.equal(captured.status, 'valid', captured.status === 'blocked' ? captured.issues.map((issue) => issue.code).join(', ') : '');
  if (captured.status !== 'valid') throw new Error('Fixture: captura durable');
  return { session, captured, cashSale };
}

test('estado comercial atraviesa guardado local, backup, transporte cifrado e hidratación sin alterar Finanzas', async () => {
  const user = 'integration-isolated-business';
  const { session, captured, cashSale } = businessFixture();
  const state = defaultState();
  const originalFinance = structuredClone(state.finance);
  state.resale.commercial = captured.set;
  assert.equal(saveStoredState(state, user), true);
  const local = loadStoredState(user).state;
  const backup = parseBackupJSON(JSON.stringify({ state }));
  assert.deepEqual(readStoredCommercial(local).original, captured.set);
  assert.deepEqual(readStoredCommercial(backup).original, captured.set);

  const key = await generateMdek();
  const plain = await encodeCloudModuleData(syncModuleData(local, 'resale'), 'resale', user, null);
  assert.equal(plain.isEncrypted, false);
  const decodedPlain = await decodeCloudModuleData(structuredClone(plain.data), 'resale', user, null);
  assert.equal(decodedPlain.mode, 'plaintext');
  if (decodedPlain.mode === 'plaintext')
    assert.deepEqual(readStoredCommercial(applySyncModule(defaultState(), 'resale', decodedPlain.data)).original, captured.set);
  const encoded = await encodeCloudModuleData(syncModuleData(local, 'resale'), 'resale', user, key);
  assert.equal(encoded.isEncrypted, true);
  const transported = structuredClone(encoded.data); // In-memory stand-in for Firestore transport only.
  assert.equal((await decodeCloudModuleData(transported, 'resale', user, null)).mode, 'locked');
  assert.equal((await decodeCloudModuleData(transported, 'resale', 'wrong-user', key)).mode, 'corrupted');
  const decoded = await decodeCloudModuleData(transported, 'resale', user, key);
  assert.equal(decoded.mode, 'decrypted');
  if (decoded.mode !== 'decrypted') return;
  const hydrated = applySyncModule(defaultState(), 'resale', decoded.data);
  const read = readStoredCommercial(hydrated);
  assert.equal(read.status, 'valid');
  assert.ok(read.reconstructed);
  const recovered = recoverDurableCommercial(JSON.stringify(hydrated.resale.commercial));
  assert.equal(recovered.status, 'valid');
  if (recovered.status !== 'valid') return;
  assert.deepEqual(recovered.set, captured.set);
  assert.deepEqual(recovered.reconstructed.summary, sandboxMoneySummary(session));
  assert.deepEqual(recovered.reconstructed.stock, captured.reconstructed.stock);
  assert.deepEqual(recovered.reconstructed.finishedStock, captured.reconstructed.finishedStock);
  assert.equal(recovered.reconstructed.session.moneyEvents?.length, session.moneyEvents?.length);
  assert.equal(confirmSandboxDirectSaleWithReceipt(recovered.reconstructed.session, cashSale,
    { timing: 'now', accountRef: 'caja' }).status, 'already_confirmed');
  assert.deepEqual(state.finance, originalFinance);
  assert.deepEqual(local.finance.transactions, originalFinance.transactions);
  assert.deepEqual(hydrated.finance.transactions, originalFinance.transactions);
  assert.deepEqual(local.finance.accounts.map((account) => account.balance), [0, 0]);
  assert.deepEqual(hydrated.finance.accounts.map((account) => account.balance), [0, 0]);
});

test('payload inválido y copias comerciales divergentes se conservan sin adopción ni publicación', async () => {
  const user = 'integration-isolated-corrupt';
  const { captured } = businessFixture();
  const local = defaultState();
  local.resale.commercial = captured.set;
  const invalid = structuredClone(local);
  invalid.resale.commercial!.business!.moneyEvents[0].sourceId = 'missing-purchase';
  assert.equal(saveStoredState(invalid, user), true);
  const loaded = loadStoredState(user).state;
  const read = readStoredCommercial(loaded);
  assert.equal(read.status, 'blocked');
  assert.deepEqual(read.original, invalid.resale.commercial);
  assert.equal(read.reconstructed, null);
  assert.equal(saveStoredState(defaultState(), user), false);
  assert.deepEqual(JSON.parse(memory.get(getStorageKey(user))!).resale.commercial, invalid.resale.commercial);
  const key = await generateMdek();
  const encryptedInvalid = await encodeCloudModuleData(syncModuleData(invalid, 'resale'), 'resale', user, key);
  const decodedInvalid = await decodeCloudModuleData(encryptedInvalid.data, 'resale', user, key);
  assert.equal(decodedInvalid.mode, 'decrypted');
  if (decodedInvalid.mode === 'decrypted') {
    const hydratedInvalid = applySyncModule(defaultState(), 'resale', decodedInvalid.data);
    const invalidRead = readStoredCommercial(hydratedInvalid);
    assert.equal(invalidRead.status, 'blocked');
    assert.deepEqual(invalidRead.original, invalid.resale.commercial);
  }

  const deviceA = structuredClone(local);
  const deviceB = structuredClone(local);
  deviceA.resale.commercial!.business!.moneyEvents[0].accountRef = 'caja A';
  deviceB.resale.commercial!.business!.moneyEvents[0].accountRef = 'caja B';
  const merged = reconcileCommercialSets(deviceA.resale.commercial!, deviceB.resale.commercial!);
  assert.equal(merged.status, 'blocked');
  if (merged.status === 'blocked') {
    assert.deepEqual(merged.left, deviceA.resale.commercial);
    assert.deepEqual(merged.right, deviceB.resale.commercial);
  }
  const sync = mergeSyncModuleWithConflicts(deviceA, 'resale', syncModuleData(deviceB, 'resale'),
    syncModuleData(local, 'resale'));
  assert.deepEqual(sync.state.resale, deviceA.resale);
  assert.ok(sync.conflicts.length > 0);
  const offlineUser = 'integration-isolated-offline';
  assert.equal(saveStoredState(deviceA, offlineUser), true);
  assert.deepEqual(loadStoredState(offlineUser).state.resale.commercial, deviceA.resale.commercial);
  assert.equal(saveStoredState(deviceB, offlineUser), false);
  assert.deepEqual(loadStoredState(offlineUser).state.resale.commercial, deviceA.resale.commercial);
  await assert.rejects(writeCloudModulesGuarded(user, invalid, ['resale'], 'test-device', {}), ResaleProtocolConflict);
  assert.throws(() => writeCloudModules(user, deviceA, ['resale', 'finance'], 'test-device', {}), ResaleProtocolConflict);
});

test('dos dispositivos con pagos comerciales distintos conservan ambos historiales tras conflicto y recarga', () => {
  const user = 'integration-two-offline-devices';
  const { session, captured } = businessFixture();
  const base = defaultState();
  base.resale.commercial = captured.set;
  const purchaseId = session.purchases!.at(-1)!.id;
  const branch = (id: string, amountCents: number) => {
    const payment = confirmSandboxMoneyEvent(session, { id, purpose: 'purchase_payment', sourceId: purchaseId,
      amountCents, accountRef: 'caja', finance: { mode: 'new' } });
    assert.equal(payment.status, 'confirmed');
    if (payment.status !== 'confirmed') throw new Error('Pago de prueba inválido');
    const history = captureDurableCommercial({ session: payment.session,
      recipes: captured.set.business!.recipes, currency: 'UYU', refundSources: [],
      eventOrder: [...captured.set.business!.eventOrder, { kind: 'money', id,
        effectiveOrder: '000000000100', commercialDate: '2026-10-24' }] });
    assert.equal(history.status, 'valid');
    if (history.status !== 'valid') throw new Error('Historial de prueba inválido');
    const state = structuredClone(base);
    state.resale.commercial = history.set;
    return state;
  };
  const remoteA = branch('device-a-payment', 1000);
  const localB = branch('device-b-payment', 2000);
  const remoteHead = structuredClone(syncModuleData(remoteA, 'resale')); // Transporte aislado.
  assert.equal(saveStoredState(localB, user), true);
  const result = mergeSyncModuleWithConflicts(localB, 'resale', remoteHead,
    syncModuleData(base, 'resale'));
  assert.ok(result.conflicts.some((conflict) => conflict.entityId === 'commercial'));
  assert.deepEqual(result.state.resale.commercial, localB.resale.commercial);
  assert.equal(reconcileCommercialSets(localB.resale.commercial!, remoteA.resale.commercial!).status, 'blocked');

  const record: ResaleConflictRecord = {
    id: 'offline-conflict', status: 'pending', createdAt: '2026-10-24T12:00:00Z',
    diagnostic: 'Historiales comerciales divergentes', modules: ['resale'],
    local: { resale: structuredClone(syncModuleData(localB, 'resale')) },
    base: { resale: structuredClone(syncModuleData(base, 'resale')) },
    baseRevisions: { resale: 'shared-base' }, remoteVersions: [],
  };
  assert.equal(saveResaleConflict(user, addRemoteResaleVersion(record,
    { resale: remoteHead }, { resale: 'device-a-revision' })), true);
  const reloaded = loadResaleConflict(user);
  assert.equal(reloaded.status, 'loaded');
  if (reloaded.status !== 'loaded') return;
  assert.deepEqual(loadStoredState(user).state.resale.commercial, localB.resale.commercial);
  assert.deepEqual(reloaded.record.local.resale, syncModuleData(localB, 'resale'));
  assert.deepEqual(reloaded.record.remoteVersions[0].data.resale, remoteHead);
  for (const version of [localB.resale.commercial, remoteA.resale.commercial]) {
    const recovered = recoverDurableCommercial(JSON.stringify(version));
    assert.equal(recovered.status, 'valid');
  }
  assert.equal(saveStoredState(remoteA, user), false);
  assert.deepEqual(loadStoredState(user).state.resale.commercial, localB.resale.commercial);
});

test('la publicación durable bloquea eventos monetarios simulados sin vínculo verificado con Finanzas', async () => {
  const { captured } = businessFixture();
  const state = defaultState();
  state.resale.commercial = captured.set;

  // These are sandbox money events with no corresponding real Finance transactions
  // or durable ownership links. The guard must reject before any Firebase access.
  await assert.rejects(
    writeCloudModulesGuarded('integration-unlinked-money', state, ['resale', 'finance'], 'device', {}),
    ResaleProtocolConflict,
  );
  assert.equal(state.finance.transactions.length, 0);
});
