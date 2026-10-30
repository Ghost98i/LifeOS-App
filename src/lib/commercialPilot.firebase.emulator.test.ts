import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { addSandboxItem, emptySandboxInventory, sandboxItemSummary } from './commercialInventorySandbox';
import { confirmSandboxDirectSaleWithReceipt, confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { sandboxMoneySummary } from './commercialMoneySandbox';
import { confirmSandboxMoneyEvent } from './commercialMoneySandbox';
import { advanceCommercialPilot, COMMERCIAL_PILOT_CURRENCY, COMMERCIAL_PILOT_KEY, loadCommercialPilot, saveCommercialPilot,
  type CommercialPilotSnapshot } from './commercialPilot';
import { connectCommercialPilotEmulator, ResaleRevisionConflict } from './cloudSync';
import { reconcileCommercialSets } from './commercialReconcile';
import { captureDurableCommercial } from './commercialDurable';

const emptySnapshot = (): CommercialPilotSnapshot => ({
  currency: COMMERCIAL_PILOT_CURRENCY,
  session: { inventory: emptySandboxInventory(), finished: emptySandboxInventory(), sales: [], purchases: [],
    productions: [], finishedWastes: [], saleCorrections: [], moneyEvents: [] },
  recipes: [], eventOrder: [], refundSources: [],
});

function memoryStorage() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
}

async function setCommercialCapabilityInEmulator(value: Record<string, unknown> | null): Promise<void> {
  const environment = await initializeTestEnvironment({ projectId: 'demo-lifeos',
    firestore: { host: '127.0.0.1', port: 8080 } });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const capability = doc(context.firestore(), 'systemCapabilities', 'commercial');
      if (value === null) await deleteDoc(capability);
      else await setDoc(capability, value);
    });
  } finally {
    await environment.cleanup();
  }
}

const enableCommercialCapabilityInEmulator = () => setCommercialCapabilityInEmulator({
  enabled: true, commercialProtocolVersion: 1, minimumSyncProtocolVersion: 3,
});

function snapshotWithPurchase(before: CommercialPilotSnapshot, name: string, quantity: number, cost: number,
  timing: 'now' | 'later'): CommercialPilotSnapshot {
  const inventory = addSandboxItem(before.session.inventory, name, 'unit', quantity, cost);
  const result = confirmSandboxPurchaseWithPayment(before.session, inventory,
    timing === 'now' ? { timing, accountRef: 'Caja demo' } : { timing });
  assert.equal(result.status, 'confirmed');
  if (result.status !== 'confirmed') throw new Error('La compra de prueba no pudo confirmarse.');
  return advanceCommercialPilot(before, result.session);
}

test('Firestore Emulator real: A publica compra, venta y obligación; B recupera y continúa sin duplicar', async (context) => {
  if (process.env.NODE_ENV !== 'test' || process.env.LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST !== '1') {
    context.skip('Ejecutar con NODE_ENV=test, indicador explícito y Auth + Firestore Emulator en demo-lifeos.');
    return;
  }
  const suffix = Date.now().toString(36);
  const clientA = await connectCommercialPilotEmulator(`round-${suffix}-A`);
  const clientB = await connectCommercialPilotEmulator(`round-${suffix}-B`);
  try {
    assert.equal(clientA.userId, clientB.userId);
    assert.notEqual(clientA.appName, clientB.appName, 'cada cliente debe usar su propia FirebaseApp');
    assert.equal((await clientA.read()).revision, null);
    const empty = emptySnapshot();
    let snapshotA = empty;
    const breadPurchase = confirmSandboxPurchaseWithPayment(snapshotA.session,
      addSandboxItem(snapshotA.session.inventory, 'Pan', 'unit', 10, 100), { timing: 'now', accountRef: 'Caja demo' });
    assert.equal(breadPurchase.status, 'confirmed');
    if (breadPurchase.status !== 'confirmed') return;
    snapshotA = advanceCommercialPilot(snapshotA, breadPurchase.session);
    const sold = confirmSandboxDirectSaleWithReceipt(snapshotA.session,
      { id: 'sandbox-direct-1', itemId: breadPurchase.session.inventory.items[0].id, units: 3, unitPriceCents: 3000 },
      { timing: 'now', accountRef: 'Caja demo' });
    assert.equal(sold.status, 'confirmed');
    if (sold.status !== 'confirmed') return;
    snapshotA = advanceCommercialPilot(snapshotA, sold.session);
    const outstandingInventory = addSandboxItem(sold.session.inventory, 'Carne', 'kg', 2, 600);
    const outstanding = confirmSandboxPurchaseWithPayment(sold.session, outstandingInventory, { timing: 'later' });
    assert.equal(outstanding.status, 'confirmed');
    if (outstanding.status !== 'confirmed') return;
    snapshotA = advanceCommercialPilot(snapshotA, outstanding.session);

    const pendingStorage = memoryStorage();
    const pendingBeforeWrite = saveCommercialPilot(pendingStorage, null, snapshotA);
    assert.equal(pendingBeforeWrite.status, 'saved');

    // The same real client transaction must be rejected when the server capability
    // is missing or disabled. The emulator's privileged test context controls only
    // this demo project's capability document.
    await setCommercialCapabilityInEmulator(null);
    await assert.rejects(clientA.publish(snapshotA, null));
    assert.equal((await clientB.read()).revision, null);
    const canonicalA = captureDurableCommercial(snapshotA);
    assert.equal(canonicalA.status, 'valid');
    if (canonicalA.status !== 'valid') return;
    const expectedAfterRecovery: CommercialPilotSnapshot = {
      currency: canonicalA.set.business!.currency,
      session: canonicalA.reconstructed.session,
      recipes: canonicalA.reconstructed.recipes,
      eventOrder: canonicalA.reconstructed.eventOrder,
      refundSources: canonicalA.reconstructed.refundSources,
    };

    const absentRecovery = loadCommercialPilot(pendingStorage);
    assert.equal(absentRecovery.status, 'ready');
    if (absentRecovery.status === 'ready') assert.deepEqual(absentRecovery.snapshot, expectedAfterRecovery);

    await setCommercialCapabilityInEmulator({ enabled: false, commercialProtocolVersion: 1,
      minimumSyncProtocolVersion: 3 });
    await assert.rejects(clientA.publish(snapshotA, null));
    assert.equal((await clientB.read()).revision, null);
    const disabledRecovery = loadCommercialPilot(pendingStorage);
    assert.equal(disabledRecovery.status, 'ready');
    if (disabledRecovery.status === 'ready') assert.deepEqual(disabledRecovery.snapshot, expectedAfterRecovery);

    await enableCommercialCapabilityInEmulator();
    const revisionA = await clientA.publish(snapshotA, null);

    const recovered = await clientB.read();
    assert.equal(recovered.revision, revisionA);
    assert.ok(recovered.snapshot);
    if (!recovered.snapshot) return;
    assert.equal(recovered.snapshot.currency, 'UYU');
    assert.equal(canonicalA.set.business!.purchases[0].currency, 'UYU');
    assert.equal(canonicalA.set.business!.sales[0].currency, 'UYU');
    assert.equal(canonicalA.set.business!.moneyEvents[0].currency, 'UYU');
    assert.deepEqual(recovered.snapshot.session.purchases, canonicalA.reconstructed.session.purchases);
    assert.deepEqual(recovered.snapshot.session.sales, canonicalA.reconstructed.session.sales);
    assert.deepEqual(recovered.snapshot.session.moneyEvents, canonicalA.reconstructed.session.moneyEvents);
    assert.equal(sandboxItemSummary(recovered.snapshot.session.inventory,
      recovered.snapshot.session.inventory.items.find((item) => item.name === 'Pan')!.id).quantity, 7);
    assert.deepEqual([sandboxMoneySummary(recovered.snapshot.session).activeRevenueCents,
      sandboxMoneySummary(recovered.snapshot.session).receivedCents,
      sandboxMoneySummary(recovered.snapshot.session).payableCents,
      sandboxMoneySummary(recovered.snapshot.session).simulatedCashFlowCents], [9000, 9000, 60000, -1000]);

    // A new adapter load models B's independent tab storage; this part is local, not Firebase persistence.
    const bStorage = memoryStorage();
    const firstSave = saveCommercialPilot(bStorage, null, recovered.snapshot);
    assert.equal(firstSave.status, 'saved');
    const reloadedB = loadCommercialPilot(bStorage);
    assert.equal(reloadedB.status, 'ready');
    if (reloadedB.status !== 'ready') return;
    const continued = confirmSandboxMoneyEvent(reloadedB.snapshot.session, { id: 'receipt-pending-purchase-1',
      purpose: 'purchase_payment', sourceId: reloadedB.snapshot.session.purchases![1].id, amountCents: 60000,
      accountRef: 'Caja demo', finance: { mode: 'new' } });
    assert.equal(continued.status, 'confirmed');
    if (continued.status !== 'confirmed') return;
    const bNext = advanceCommercialPilot(reloadedB.snapshot, continued.session);
    const revisionB = await clientB.publish(bNext, recovered.revision);
    const verifiedA = await clientA.read();
    assert.equal(verifiedA.revision, revisionB);
    assert.ok(verifiedA.snapshot);
    if (!verifiedA.snapshot) return;
    assert.equal(verifiedA.snapshot.session.moneyEvents?.length, recovered.snapshot.session.moneyEvents?.length + 1);
    assert.deepEqual([sandboxMoneySummary(verifiedA.snapshot.session).payableCents,
      sandboxMoneySummary(verifiedA.snapshot.session).paidCents], [0, 70000]);
    const expectedB = captureDurableCommercial(bNext);
    const actualB = captureDurableCommercial(verifiedA.snapshot);
    assert.equal(expectedB.status, 'valid');
    assert.equal(actualB.status, 'valid');
    if (expectedB.status !== 'valid' || actualB.status !== 'valid') return;
    assert.deepEqual(actualB.set, expectedB.set,
      'moneda, importes, IDs, referencias y el resto del estado durable deben sobrevivir al ciclo A → B → A');
    await clientA.close();
    assert.equal((await clientB.read()).revision, revisionB,
      'cerrar A no debe terminar la FirestoreApp independiente de B');
  } finally {
    await Promise.all([clientA.close(), clientB.close()]);
  }
});

test('Firestore Emulator real: cliente obsoleto es rechazado y su operación local pendiente queda recuperable', async (context) => {
  if (process.env.NODE_ENV !== 'test' || process.env.LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST !== '1') {
    context.skip('Ejecutar con NODE_ENV=test, indicador explícito y Auth + Firestore Emulator en demo-lifeos.');
    return;
  }
  await enableCommercialCapabilityInEmulator();
  const suffix = Date.now().toString(36);
  const clientA = await connectCommercialPilotEmulator(`race-${suffix}-A`);
  const clientB = await connectCommercialPilotEmulator(`race-${suffix}-B`);
  try {
    assert.equal(clientA.userId, clientB.userId);
    assert.notEqual(clientA.appName, clientB.appName, 'cada cliente debe usar su propia FirebaseApp');
    const empty = emptySnapshot();
    const baseRevision = await clientA.publish(empty, null);
    assert.equal((await clientA.read()).revision, baseRevision);
    assert.equal((await clientB.read()).revision, baseRevision);

    const pendingB = snapshotWithPurchase(empty, 'Artículo B', 4, 800, 'later');
    const storageB = memoryStorage();
    const savedB = saveCommercialPilot(storageB, null, pendingB);
    assert.equal(savedB.status, 'saved');
    const winnerA = snapshotWithPurchase(empty, 'Artículo A', 3, 600, 'now');
    const revisionA = await clientA.publish(winnerA, baseRevision);
    await assert.rejects(clientB.publish(pendingB, baseRevision), (error: unknown) => error instanceof ResaleRevisionConflict);

    const stillPendingB = loadCommercialPilot(storageB);
    assert.equal(stillPendingB.status, 'ready');
    if (stillPendingB.status !== 'ready') return;
    assert.equal(stillPendingB.snapshot.session.purchases?.[0].id, pendingB.session.purchases?.[0].id);
    const remote = await clientB.read();
    assert.equal(remote.revision, revisionA);
    assert.ok(remote.snapshot);
    if (!remote.snapshot) return;
    const localSet = captureDurableCommercial(stillPendingB.snapshot);
    const remoteSet = captureDurableCommercial(remote.snapshot);
    assert.equal(localSet.status, 'valid');
    assert.equal(remoteSet.status, 'valid');
    if (localSet.status !== 'valid' || remoteSet.status !== 'valid') return;
    assert.equal(reconcileCommercialSets(localSet.set, remoteSet.set).status, 'blocked');
    assert.equal(storageB.getItem(COMMERCIAL_PILOT_KEY), savedB.status === 'saved' ? savedB.raw : null);
    const itemNames = (snapshot: CommercialPilotSnapshot) => snapshot.session.purchases?.map((purchase) =>
      snapshot.session.inventory.items.find((item) => item.id === purchase.itemId)?.name);
    assert.deepEqual(itemNames(remote.snapshot), ['Artículo A']);
    assert.deepEqual(itemNames(stillPendingB.snapshot), ['Artículo B']);
  } finally {
    await Promise.all([clientA.close(), clientB.close()]);
  }
});
