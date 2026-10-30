import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output = 'artifacts/cierre-tandas-1-2/empty-inventory';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/src/lib/cloudSync.ts') {
      const response = await route.fetch();
      const source = await response.text();
      const start = source.indexOf('async function checkCommercialAccess(');
      assert.ok(start >= 0);
      const body = source.indexOf('{', start);
      // Isolated fixture only; real authentication/publication are covered by
      // test-commercial-production-e2e.mjs against Auth + Firestore emulators.
      return route.fulfill({ response, body: source.slice(0, body + 1) + ' return; ' + source.slice(body + 1) });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = [];
  for (const width of [1920, 768, 375]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1080 });
    await page.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-1/browser.html?view=reventa&state=empty&theme=${theme}`);
    const add = page.getByRole('button', { name: 'Agregar artículo o insumo', exact: true });
    await add.waitFor();
    await page.waitForFunction(() => document.querySelector('fieldset[aria-label="Operaciones comerciales"]')?.disabled === false);
    await page.getByText('Agregá un artículo o insumo con su cantidad y costo de compra.', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/empty-${width}-${theme}.png`, fullPage: true });
    await add.click();
    for (const label of ['Artículo o insumo', 'Cantidad que ingresa', 'Costo total ($U)']) {
      assert.equal(await page.getByLabel(label, { exact: true }).evaluate(input => input.required), true);
    }
    assert.equal(await page.getByLabel('Categoría financiera', { exact: true }).count(), 0);
    await page.getByLabel('Artículo o insumo', { exact: true }).fill('Primera compra de cierre');
    await page.getByLabel('Cantidad que ingresa', { exact: true }).fill('2');
    await page.getByLabel('Costo total ($U)', { exact: true }).fill('12');
    await page.screenshot({ path: `${output}/form-${width}-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
    const data = await page.evaluate(() => ({
      items: window.fixtureState.resale.commercial.items.length,
      purchases: window.fixtureState.resale.commercial.business.purchases.length,
      movements: window.fixtureState.finance.transactions.length,
      balance: window.fixtureState.finance.accounts[0].balance,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.deepEqual(data, { items: 1, purchases: 1, movements: 0, balance: 10000, overflow: false });
    checks.push({ width, theme, ...data });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} empty-state/form checks passed; first action creates item + purchase, no payment.`);
} finally { await browser.close(); }
