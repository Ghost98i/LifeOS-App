import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addSandboxItem, emptySandboxInventory } from '../lib/commercialInventorySandbox';
import { confirmSandboxPurchaseWithPayment } from '../lib/commercialImmediateSandbox';
import { advanceCommercialPilot, COMMERCIAL_PILOT_KEY, saveCommercialPilot, type CommercialPilotSnapshot } from '../lib/commercialPilot';
import { CommercialInventorySandbox } from './CommercialInventorySandbox';

test('la interfaz del piloto hidrata una compra desde almacenamiento aislado en un montaje nuevo', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  const empty: CommercialPilotSnapshot = { currency: 'UYU', session: { inventory: emptySandboxInventory(),
    finished: emptySandboxInventory(), sales: [], purchases: [], moneyEvents: [] },
    recipes: [], eventOrder: [], refundSources: [] };
  const bought = confirmSandboxPurchaseWithPayment(empty.session,
    addSandboxItem(empty.session.inventory, 'Pan de prueba', 'unit', 10, 100), { timing: 'later' });
  assert.equal(bought.status, 'confirmed');
  if (bought.status !== 'confirmed') return;
  const snapshot = advanceCommercialPilot(empty, bought.session);
  assert.equal(saveCommercialPilot(storage, null, snapshot).status, 'saved');
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  Object.assign(globalThis, { window: { sessionStorage: storage } });
  globalThis.localStorage = { getItem: () => { throw new Error('Acceso indebido a datos reales'); },
    setItem: () => { throw new Error('Acceso indebido a datos reales'); } } as unknown as Storage;
  try {
    const render = () => renderToStaticMarkup(<CommercialInventorySandbox pilotEnabled onClose={() => {}} />);
    const firstMount = render();
    const secondMount = render(); // A fresh component reads the saved business again.
    for (const html of [firstMount, secondMount]) {
      assert.match(html, /Pan de prueba/);
      assert.match(html, /Piloto local/);
      assert.match(html, /Compras por pagar/);
      assert.doesNotMatch(html, /Modo de prueba · los datos no se guardan/);
    }
    assert.equal(values.size, 1);
    const foreign = JSON.parse(values.get(COMMERCIAL_PILOT_KEY)!);
    foreign.business.currency = 'USD';
    foreign.business.purchases.forEach((entry: { currency: string }) => { entry.currency = 'USD'; });
    const foreignRaw = JSON.stringify(foreign);
    values.set(COMMERCIAL_PILOT_KEY, foreignRaw);
    const incompatible = render();
    assert.match(incompatible, /Esta interfaz de prueba admite UYU/);
    assert.doesNotMatch(incompatible, /Vender artículo/);
    assert.equal(values.get(COMMERCIAL_PILOT_KEY), foreignRaw);
    values.set(COMMERCIAL_PILOT_KEY, '{"incompleto":');
    const blocked = render();
    assert.match(blocked, /El piloto local necesita revisión/);
    assert.match(blocked, /Descargar copia original/);
    assert.doesNotMatch(blocked, /Guardar entrada/);
    assert.equal(values.get(COMMERCIAL_PILOT_KEY), '{"incompleto":');
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
    else globalThis.localStorage = previousLocalStorage;
  }
});
