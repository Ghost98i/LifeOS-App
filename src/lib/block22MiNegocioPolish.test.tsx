import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { addSandboxItem, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxDirectSale } from './commercialDirectSaleSandbox';
import { confirmSandboxMoneyEvent, recordSandboxPurchase, type SandboxMoneySession } from './commercialMoneySandbox';
import { ReventaView } from '../components/ReventaView';
import { CommercialWorkspace } from '../components/CommercialWorkspace';
import { CommercialCostCalculator } from '../components/CommercialCostCalculator';
import { CommercialInventorySandbox } from '../components/CommercialInventorySandbox';
import { CommercialMoneySandbox } from '../components/CommercialMoneySandbox';

const MI_NEGOCIO_FILES = [
  'src/components/ReventaView.tsx',
  'src/components/CommercialWorkspace.tsx',
  'src/components/CommercialCostCalculator.tsx',
  'src/components/CommercialInventorySandbox.tsx',
  'src/components/CommercialMoneySandbox.tsx',
  'src/components/CommercialRecipesSandbox.tsx',
];

test('Bloque 22.1: Cero azules residuales, checkboxes/radios crudos, caracteres ASCII ni emojis en los 6 archivos de Mi negocio', () => {
  for (const relPath of MI_NEGOCIO_FILES) {
    const src = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.doesNotMatch(src, /var\(--blue|blue-\d|sky-\d/, `${relPath} no debe tener azules residuales`);
    assert.doesNotMatch(src, /type="checkbox"|type="radio"/, `${relPath} no debe usar checkboxes ni radios nativos crudos`);
    assert.doesNotMatch(src, /[▲▼▶▾×↗→←✓🛠]/u, `${relPath} no debe renderizar caracteres ASCII o emojis crudos`);
    assert.match(src, /celestian-clean-field/, `${relPath} debe usar .celestian-clean-field en sus campos`);
  }

  const recipesSrc = fs.readFileSync(path.resolve('src/components/CommercialRecipesSandbox.tsx'), 'utf8');
  assert.match(recipesSrc, /CelestianSwitch/, 'CommercialRecipesSandbox usa CelestianSwitch para confirmación de corrección');
});

test('Bloque 22.2: ReventaView unifica tabs en pastilla #4F46E5, KPIs alineados, ganancia esmeralda y acciones Pencil/Trash2', () => {
  const today = todayISO();
  const state = defaultState();
  const accId = state.finance.accounts[0]?.id || 'acc-1';
  state.resale.inventory = [
    {
      id: 'b22-1',
      item: 'Mouse MX Master',
      buyPrice: 3000,
      buyDate: today,
      status: 'comprado',
      purchaseAccountId: accId,
      purchaseCurrency: 'UYU',
    },
    {
      id: 'b22-2',
      item: 'Teclado Keychron',
      buyPrice: 2500,
      buyDate: today,
      sellPrice: 4000,
      sellDate: today,
      shippingCost: 150,
      platformFees: 150,
      taxes: 0,
      fees: 300,
      status: 'vendido',
      purchaseAccountId: accId,
      saleAccountId: accId,
      purchaseCurrency: 'UYU',
      saleCurrency: 'UYU',
    },
  ];

  // Con onCommercialUpdate: renderiza tablist unificado con pastilla #4F46E5 y foco limpio
  const tabbedHtml = renderToStaticMarkup(
    <ReventaView state={state} onUpdateState={() => true} onCommercialUpdate={() => true} />
  );
  assert.match(tabbedHtml, /role="tablist"[^>]*aria-label="Secciones de Mi negocio"/);
  assert.match(
    tabbedHtml,
    /role="tab"[^>]*aria-selected="true"[^>]*class="[^"]*outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70[^"]*bg-\[#4F46E5\] text-white/
  );
  assert.doesNotMatch(tabbedHtml, /var\(--blue/);

  // Vista histórica (sin onCommercialUpdate): KPIs en grilla 2x2 / 4 cols, ganancia positiva esmeralda y acciones unificadas
  const legacyHtml = renderToStaticMarkup(
    <ReventaView state={state} onUpdateState={() => true} />
  );
  assert.match(legacyHtml, /grid grid-cols-2 gap-4 sm:grid-cols-4/, 'KPIs alineados en grilla 2x2 en móvil y 4 columnas en desktop');
  assert.match(legacyHtml, /text-emerald-700 dark:text-emerald-400[^>]*>[\s\S]*1\.200/, 'Ganancia realizada positiva en esmeralda');
  assert.match(legacyHtml, /title="Editar venta"[^>]*aria-label="Editar venta de Teclado Keychron"/);
  assert.match(legacyHtml, /title="Eliminar registro"[^>]*aria-label="Eliminar Teclado Keychron"/);
  assert.match(legacyHtml, /title="Eliminar registro"[^>]*aria-label="Eliminar Mouse MX Master"/);
  assert.doesNotMatch(legacyHtml, /← Ir a operaciones comerciales/);
});

test('Bloque 22.3: CommercialCostCalculator, CommercialWorkspace y CommercialMoneySandbox cumplen semántica fintech y controles limpios', () => {
  const calcHtml = renderToStaticMarkup(<CommercialCostCalculator onClose={() => {}} />);
  assert.match(calcHtml, /aria-pressed="true"[^>]*class="[^"]*bg-\[#4F46E5\] text-white/, 'Selector de modo con pastilla activa #4F46E5');
  assert.match(calcHtml, /celestian-clean-field/, 'Campos limpios sin doble borde');
  assert.match(calcHtml, /appearance-none pr-9/, 'Selects con chevron Lucide en lugar de flecha nativa');
  assert.match(calcHtml, /aria-label="Cerrar calculadora de costos"[^>]*title="Cerrar"/);

  const state = defaultState();
  const wsHtml = renderToStaticMarkup(
    <CommercialWorkspace state={state} userId={undefined} syncStatus="signed-out" onUpdate={() => true} onClose={() => {}} />
  );
  assert.doesNotMatch(wsHtml, /var\(--blue/, 'CommercialWorkspace elimina enlace azul residual');

  const empty: SandboxMoneySession = {
    inventory: emptySandboxInventory(),
    finished: emptySandboxInventory(),
    sales: [],
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };
  const bought = recordSandboxPurchase(empty, addSandboxItem(empty.inventory, 'Auriculares', 'unit', 5, 2000));
  const sold = confirmSandboxDirectSale(bought, { id: 'sale-1', itemId: bought.inventory.items[0].id, units: 2, unitPriceCents: 90000 });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const moneyHtml = renderToStaticMarkup(
    <CommercialMoneySandbox session={sold.session} onConfirm={(req) => confirmSandboxMoneyEvent(sold.session, req)} />
  );
  assert.match(moneyHtml, /text-emerald-700 dark:text-emerald-400[^>]*>\$U 1\.000/, 'Ganancia bruta positiva en esmeralda');

  const sandboxHtml = renderToStaticMarkup(
    <CommercialInventorySandbox pilotEnabled={false} onClose={() => {}} />
  );
  assert.match(sandboxHtml, /id="commercial-inventory-sandbox"/);
});

test('Bloque 22.1: Jerarquía fintech en CommercialMoneySandbox sin IDs internos crudos, sin botones rojos permanentes, <=1 tooltip y desplegables cerrados', () => {
  const empty: SandboxMoneySession = {
    inventory: emptySandboxInventory(),
    finished: emptySandboxInventory(),
    sales: [],
    productions: [],
    finishedWastes: [],
    saleCorrections: [],
    purchases: [],
    moneyEvents: [],
  };
  const bought = recordSandboxPurchase(empty, addSandboxItem(empty.inventory, 'pan artesanal', 'unit', 1, 150));
  const paid = confirmSandboxMoneyEvent(bought, {
    id: 'm-pay-1',
    purpose: 'purchase_payment',
    sourceId: bought.purchases![0].id,
    amountCents: 15000,
    accountRef: 'wmrxvosmlrvf',
    finance: { mode: 'new' },
  });
  assert.equal(paid.status, 'confirmed');
  if (paid.status !== 'confirmed') return;
  const sold = confirmSandboxDirectSale(paid.session, {
    id: 's-1',
    itemId: bought.inventory.items[0].id,
    units: 1,
    unitPriceCents: 30000,
  });
  assert.equal(sold.status, 'confirmed');
  if (sold.status !== 'confirmed') return;
  const collected = confirmSandboxMoneyEvent(sold.session, {
    id: 'm-rec-1',
    purpose: 'sale_receipt',
    sourceId: 's-1',
    amountCents: 30000,
    accountRef: 'oruot52clrvf',
    finance: { mode: 'new' },
  });
  assert.equal(collected.status, 'confirmed');
  if (collected.status !== 'confirmed') return;

  const html = renderToStaticMarkup(
    <CommercialMoneySandbox
      accounts={[{ id: 'wmrxvosmlrvf', name: 'Efectivo', type: 'efectivo', initialBalance: 0, currency: 'UYU', active: true }]}
      session={collected.session}
      onConfirm={(req) => confirmSandboxMoneyEvent(collected.session, req)}
    />
  );

  // Cero IDs internos crudos
  assert.doesNotMatch(html, /wmrxvosmlrvf|oruot52clrvf/, 'No debe filtrar IDs internos de cuenta en pantalla');
  assert.match(html, /Efectivo/, 'Muestra el nombre humano de la cuenta resuelta');

  // Jerarquía Hero: Ganancia bruta + Margen % + Flujo monetario
  assert.match(html, /Ganancia bruta/);
  assert.match(html, /Margen 50\.0%/);
  assert.match(html, /Flujo monetario/);

  // Máximo 1 tooltip (i) en toda la tarjeta de resumen comercial
  const helpButtons = html.match(/aria-label="Ayuda:/g) || [];
  assert.ok(helpButtons.length <= 1, `Se esperaba <= 1 ayuda contextual, hubo ${helpButtons.length}`);

  // Etiquetas de sustantivo y sin textos de log ("pendiente $U 0", "Registrar pago", "Corregir / Revertir")
  assert.doesNotMatch(html, /pendiente \$U 0|Registrar pago|Registrar cobro|Corregir \/ Revertir/);
  assert.match(html, />Pago</);
  assert.match(html, />Cobro</);
  assert.match(html, />Revertir</);
  assert.doesNotMatch(html, /border-rose-500\/30[^>]*>[\s\S]*Revertir/, 'Botón Revertir no debe tener borde rojo permanente');

  // Dos desplegables cerrados por defecto (<details sin open)
  assert.match(html, /Historial de operaciones/);
  assert.match(html, /Movimientos en Finanzas/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/, 'Los listados de detalle deben iniciar cerrados por defecto');
});
