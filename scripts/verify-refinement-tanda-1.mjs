import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase = process.argv[2] || 'after';
const dir = `artifacts/refinamiento-tanda-1/${phase}`;
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext();
// Isolated fixtures: only the remote availability check is substituted. All commands,
// validation, accounting and components are the real local implementation.
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
  if (url.pathname === '/src/lib/cloudSync.ts') {
    const response = await route.fetch();
    const source = await response.text();
    const start = source.indexOf('async function checkCommercialAccess(');
    assert.ok(start >= 0, 'availability function located');
    const body = source.indexOf('{', start);
    return route.fulfill({ response, body: source.slice(0, body + 1) + ' return; ' + source.slice(body + 1) });
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
const results = [];
for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) for (const view of ['agenda', 'trabajo', 'reventa']) for (const state of ['empty', 'filled']) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`http://127.0.0.1:5241/artifacts/refinamiento-tanda-1/browser.html?view=${view}&state=${state}&theme=${theme}`);
  await page.locator('h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (view === 'reventa') await page.getByRole('button', { name: state === 'filled' ? 'Agregar otro artículo' : 'Agregar artículo o insumo', exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/${view}-${state}-${theme}-${width}.png`, fullPage: true });
  results.push({ view, state, theme, width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
}
await fs.writeFile(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
if (phase === 'after') {
  const financialChecks = [];
  for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) {
    const goto = async view => {
      await page.goto(`http://127.0.0.1:5241/artifacts/refinamiento-tanda-1/browser.html?view=${view}&state=empty&theme=${theme}`);
      await page.locator('h1').waitFor();
    };
    await page.setViewportSize({ width, height: 1000 });
    await goto('reventa');
    await page.getByRole('button', { name: 'Agregar artículo o insumo', exact: true }).click();
    assert.equal(await page.getByLabel('Categoría financiera', { exact: true }).count(), 0);
    await page.getByLabel('Artículo o insumo', { exact: true }).fill('Pan de prueba');
    await page.getByLabel('Cantidad que ingresa', { exact: true }).fill('10');
    await page.getByLabel('Costo total ($U)', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 0);
    // An immediate purchase requires an explicit category and preserves the form on save failure.
    await page.getByRole('button', { name: 'Agregar otro artículo', exact: true }).click();
    await page.getByLabel('Artículo o insumo', { exact: true }).fill('Bolsas');
    await page.getByLabel('Cantidad que ingresa', { exact: true }).fill('2');
    await page.getByLabel('Costo total ($U)', { exact: true }).fill('20');
    await page.getByLabel('Pagado ahora', { exact: true }).check();
    const entry = page.locator('form').filter({ has: page.getByLabel('Artículo o insumo', { exact: true }) });
    await entry.getByLabel(/^Cuenta/).selectOption('cash');
    await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 0);
    assert.equal(await page.getByLabel('Categoría financiera', { exact: true }).evaluate(el => el.validity.valueMissing), true);
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('business');
    await page.getByLabel('Fecha en Finanzas', { exact: true }).fill('2026-10-29');
    await page.evaluate(() => { window.failSave = true; });
    await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 0);
    assert.equal(await page.getByLabel('Artículo o insumo', { exact: true }).inputValue(), 'Bolsas');
    await page.getByRole('alert').filter({ hasText: 'Error de guardado' }).first().waitFor();
    await page.screenshot({ path: `${dir}/purchase-error-${theme}-${width}.png`, fullPage: true });
    await page.evaluate(() => { window.failSave = false; });
    await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 9980);
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 1);
    // A partial payment does not change the purchase, inventory cost or sale result.
    await page.getByRole('button', { name: /^Pagar \$U 100$/ }).click();
    await page.getByLabel('Importe ($U)', { exact: true }).fill('40');
    await page.getByLabel('Cuenta financiera', { exact: true }).selectOption('cash');
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 1);
    await page.getByRole('button', { name: 'Ayuda: Categoría en Finanzas', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ayuda: Categoría en Finanzas', exact: true }).waitFor();
    await page.screenshot({ path: `${dir}/payment-help-${theme}-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('business');
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 9940);
    // Sell every unit; the financial history must survive zero stock.
    const bread = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pan de prueba', exact: true }) });
    await bread.getByRole('button', { name: 'Vender artículo', exact: true }).click();
    await page.getByLabel('Unidades a vender', { exact: true }).fill('10');
    await page.getByLabel('Precio por unidad ($U)', { exact: true }).fill('25');
    assert.equal(await page.getByLabel('Categoría financiera', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Confirmar venta directa', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.transactions.length), 2);
    await page.getByRole('button', { name: /^Sin stock/ }).click();
    await bread.getByRole('button', { name: 'Reponer stock', exact: true }).waitFor();
    assert.equal(await page.getByText('Sin compras ni ventas registradas.', { exact: true }).count(), 0);
    await page.screenshot({ path: `${dir}/zero-stock-history-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /^Cobrar \$U 250$/ }).click();
    await page.getByLabel('Importe ($U)', { exact: true }).fill('100');
    await page.getByLabel('Cuenta financiera', { exact: true }).selectOption('cash');
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 10040);
    await page.getByRole('button', { name: /^Cobrar \$U 150$/ }).waitFor();
    const computed = await page.evaluate(async () => {
      const { readStoredCommercial } = await import('/src/lib/storage.ts');
      const { sandboxMoneySummary } = await import('/src/lib/commercialMoneySandbox.ts');
      const loaded = readStoredCommercial(window.fixtureState);
      return sandboxMoneySummary(loaded.reconstructed.session);
    });
    assert.equal(computed.grossProfitCents, 15000);
    assert.equal(computed.receivableCents, 15000);
    assert.equal(computed.payableCents, 6000);
    const tx = await page.evaluate(() => window.fixtureState.finance.transactions);
    assert.deepEqual(tx.map(t => t.amount), [20, 40, 100]);
    assert.ok(tx.every(t => t.category === 'business' && t.date === '2026-10-29'));
    financialChecks.push({ width, theme, balance: 10040, profitCents: computed.grossProfitCents, transactions: tx.length });
    // Category inheritance and date remain available for a compensating reversal.
    await page.getByText(/^Movimientos monetarios/).click();
    const receiptRow = page.locator('li').filter({ hasText: 'Registrar cobro' });
    await receiptRow.getByRole('button', { name: 'Corregir / Revertir', exact: true }).click();
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Confirmar reversión', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 9940);
    await page.getByRole('button', { name: /^Cobrar \$U 250$/ }).waitFor();
    await page.screenshot({ path: `${dir}/reversal-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /^Con stock/ }).click();
    const bags = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Bolsas', exact: true }) });
    await bags.getByRole('button', { name: 'Vender artículo', exact: true }).click();
    await page.getByLabel('Precio por unidad ($U)', { exact: true }).fill('50');
    await page.getByLabel('Cobrado ahora', { exact: true }).check();
    await page.getByLabel(/^Cuenta/).selectOption('cash');
    await page.getByRole('button', { name: 'Confirmar venta directa', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 9940);
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('business');
    await page.screenshot({ path: `${dir}/immediate-sale-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Confirmar venta directa', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 9990);
    const purchaseRow = page.locator('#commercial-money-sandbox div.rounded-lg').filter({ hasText: /^Bolsas · compra/ }).last();
    // Settled purchases remain reachable through their disclosure.
    const settled = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Operaciones sin importes pendientes/ }) });
    await settled.locator('summary').click();
    await purchaseRow.getByRole('button', { name: 'Devolver unidades', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar devolución', exact: true }).click();
    await page.getByRole('button', { name: /^Cobrar reembolso \$U 10$/ }).click();
    await page.getByLabel('Cuenta financiera', { exact: true }).selectOption('cash');
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.finance.accounts[0].balance), 10000);
    financialChecks.at(-1).reversalAndRefundBalance = 10000;
    // Agenda: weekly block, one-off event and completed routine keep their separate models.
    await goto('agenda');
    await page.getByRole('button', { name: 'Actividad semanal', exact: true }).first().click();
    await page.getByLabel('Nombre de actividad', { exact: true }).fill('Revisar pedidos');
    await page.getByLabel('Hora', { exact: true }).fill('09:00');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    assert.equal(await page.evaluate(() => Object.values(window.fixtureState.agenda).flat().length), 1);
    await page.getByRole('button', { name: 'Compromiso puntual', exact: true }).first().click();
    await page.getByLabel('Título', { exact: true }).fill('Visita al proveedor');
    await page.screenshot({ path: `${dir}/agenda-event-form-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.calendarEvents[0].recurring), false);
    await page.getByRole('button', { name: /^Rutinas/ }).first().click();
    await page.getByRole('button', { name: 'Nueva rutina', exact: true }).click();
    await page.getByLabel('Nombre de la rutina', { exact: true }).fill('Caminar');
    await page.getByRole('button', { name: 'Agregar rutina', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.tasksRecurring.length), 1);
    await page.getByRole('button', { name: 'Completar Caminar', exact: true }).click();
    await page.getByRole('button', { name: 'Reabrir Caminar', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.values(window.fixtureState.taskLog).some(day => Object.values(day).includes(true))), true);
    await page.getByRole('button', { name: 'Ayuda: Rutinas recurrentes', exact: true }).click();
    await page.screenshot({ path: `${dir}/agenda-routines-${theme}-${width}.png`, fullPage: true });
    // Work: both types and the offer/confirmed stages retain their persisted IDs.
    await goto('trabajo');
    await page.getByRole('button', { name: 'Nueva postulación', exact: true }).click();
    await page.getByLabel('Empresa', { exact: true }).fill('Estudio del Sur');
    await page.getByLabel(/^Estado/).selectOption('oferta');
    await page.screenshot({ path: `${dir}/trabajo-form-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Agregar postulación', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.jobs.applications[0].estado), 'oferta');
    if (width >= 1024) await page.locator('.job-kanban-panorama').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    else await page.getByLabel('Etapa del tablero', { exact: true }).selectOption('oferta');
    await page.getByLabel('Cambiar estado de Estudio del Sur', { exact: true }).filter({ visible: true }).selectOption('contratado');
    assert.equal(await page.evaluate(() => window.fixtureState.jobs.applications[0].estado), 'contratado');
    await page.getByLabel('Filtrar por tipo de proceso', { exact: true }).selectOption('concurso');
    await page.getByRole('button', { name: 'Nueva postulación', exact: true }).click();
    await page.getByLabel('Organismo', { exact: true }).fill('Intendencia');
    await page.getByLabel(/^Estado/).selectOption('ingreso_confirmado');
    await page.getByRole('button', { name: 'Agregar postulación', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureState.jobs.applications[1].estado), 'ingreso_confirmado');
    await page.getByRole('button', { name: 'Ayuda: Estados de las postulaciones', exact: true }).click();
    await page.screenshot({ path: `${dir}/trabajo-contest-help-${theme}-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Lista / Tabla', exact: true }).click();
    await page.getByLabel('Filtrar por tipo de proceso', { exact: true }).selectOption('todos');
    await page.screenshot({ path: `${dir}/trabajo-mixed-list-${theme}-${width}.png`, fullPage: true });
  }
  await fs.writeFile(`${dir}/financial-checks.json`, JSON.stringify(financialChecks, null, 2));
  await page.goto('http://127.0.0.1:5241/artifacts/refinamiento-tanda-1/browser.html?view=reventa&state=filled&theme=light');
  await page.getByRole('button', { name: 'Agregar otro artículo', exact: true }).waitFor();
  const appState = await page.evaluate(() => window.fixtureState);
  const shellChecks = [];
  for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) {
    const shell = await browser.newContext({ viewport: { width, height: 1000 } });
    await shell.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await shell.addInitScript(({ state, dark }) => {
      state.settings.darkMode = dark;
      state.settings.onboardingCompleted = true;
      localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
    }, { state: appState, dark: theme === 'dark' });
    const appPage = await shell.newPage();
    appPage.on('pageerror', error => errors.push(error.message));
    for (const [view, heading] of [['agenda', 'Agenda y rutinas'], ['trabajo', 'Trabajo y empleo'], ['reventa', 'Mi negocio']]) {
      await appPage.goto(`http://127.0.0.1:5241/?view=${view}`);
      await appPage.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
      await appPage.evaluate(() => document.fonts.ready);
      const measure = await appPage.locator('.product-refinement').evaluate(root => ({
        font: getComputedStyle(root.querySelector('h1')).fontFamily,
        accent: getComputedStyle(root).getPropertyValue('--blue').trim(),
        smallText: [...root.querySelectorAll('.text-xs')].filter(el => el.getClientRects().length).map(el => parseFloat(getComputedStyle(el).fontSize)).filter(size => size < 14),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.ok(measure.font.includes('Instrument Sans'));
      assert.equal(measure.accent, '#4F46E5');
      assert.deepEqual(measure.smallText, []);
      assert.equal(measure.overflow, false);
      shellChecks.push({ width, theme, view, ...measure });
      await appPage.screenshot({ path: `${dir}/app-shell-${view}-${theme}-${width}.png`, fullPage: true });
    }
    await shell.close();
  }
  await fs.writeFile(`${dir}/shell-checks.json`, JSON.stringify(shellChecks, null, 2));
}
await browser.close();
assert.deepEqual(errors, []);
assert.equal(results.some(result => result.overflow), false);
console.log(`${phase}: ${results.length} captures, no page errors or page overflow`);
