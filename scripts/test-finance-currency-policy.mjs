import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const out = path.resolve('artifacts/finance-currency-policy'); fs.mkdirSync(out, { recursive: true });
const origin = 'http://127.0.0.1:5331';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'portable', '--host', '127.0.0.1', '--port', '5331', '--strictPort'], { stdio: 'pipe', windowsHide: true });
const errors = [], external = [], results = [];
let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  for (const width of [1440, 390, 375]) for (const dark of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : width === 390 ? 844 : 812 }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'reduce', isMobile: width < 640, hasTouch: width < 640 });
    await context.clock.setFixedTime(new Date('2026-11-01T12:00:00-03:00'));
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(origin); page.setDefaultTimeout(12000);
    assert.equal(await page.evaluate(async () => (await import('/src/lib/cloudSync.ts')).cloudSyncConfigured), false);
    await page.evaluate(async ({ dark }) => {
      const { defaultState } = await import('/src/lib/storage.ts'); const s = defaultState();
      s.settings.onboardingCompleted = true; s.settings.darkMode = dark; s.settings.hiddenTabs = [];
      s.finance.accounts = ['UYU', 'USD'].map(currency => ({ id: currency, name: `Cuenta sintética ${currency}`, currency, balance: 1000, initialBalance: 1000 }));
      s.finance.transactions = []; s.finance.subscriptions = []; s.finance.debts = []; s.finance.agreements = [];
      s.finance.commitments = [{ id: 'ambiguous-payment', name: 'Pago histórico sin moneda', amount: 777.77, active: true, frequency: 'once', nextDueDate: '2026-11-05' },
        ...['UYU', 'USD'].map(currency => ({ id: `known-${currency}`, name: `Pago conocido ${currency}`, currency, amount: 23.45, accountId: currency, active: true, frequency: 'once', nextDueDate: '2026-11-05' }))];
      s.finance.expectedIncomes = [{ id: 'ambiguous-income', name: 'Cobro histórico sin moneda', amount: 888.88, currency: 'usd', active: true, frequency: 'once', startDate: '2026-11-05' }];
      localStorage.setItem('lifeos-state-v1', JSON.stringify(s));
    }, { dark });
    const enter = async () => { await page.reload(); await page.locator('.today-shell').waitFor(); await page.getByRole('button', { name: width < 640 ? 'Ir a Finanzas' : 'Finanzas', exact: true }).click(); await page.locator('.finance-workspace').waitFor(); };
    await enter(); assert.match(await page.locator('.finance-workspace').innerText(), /Cálculo parcial/);
    await page.locator('.finance-tabs').getByRole('button', { name: /^Futuro/ }).click();
    const before = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance));
    await page.getByText('Pago histórico sin moneda', { exact: true }).waitFor();
    const row = page.locator('#commitment-ambiguous-payment'); assert.match(await row.innerText(), /777,77 · moneda sin confirmar/);
    assert.match(await page.locator('.finance-workspace').innerText(), /888,88 · moneda sin confirmar/);
    assert.doesNotMatch(await page.locator('.finance-workspace').innerText(), /Sin déficit previsto|Sin compromisos este mes/);
    await row.getByRole('button', { name: 'Registrar pago', exact: true }).click(); await page.getByText('La moneda de este compromiso no está confirmada. La operación no se realizó.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click(); await page.getByText('La moneda de este cobro previsto no está confirmada. La operación no se realizó.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance)), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(out, `partial-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos-state-v1')); s.settings.privacyMode = true; localStorage.setItem('lifeos-state-v1', JSON.stringify(s)); });
    await enter(); await page.locator('.finance-tabs').getByRole('button', { name: /^Futuro/ }).click();
    const privateDom = await page.locator('.finance-workspace').evaluate(root => root.textContent + Array.from(root.querySelectorAll('*')).flatMap(e => Array.from(e.attributes).filter(a => /^(aria-|title|value)/.test(a.name)).map(a => a.value)).join('|'));
    assert.doesNotMatch(privateDom, /777[.,]77|888[.,]88/); assert.match(privateDom, /Proyección parcial/);
    assert.match(await page.locator('#commitment-ambiguous-payment').innerText(), /Moneda sin confirmar/);
    if (width === 1440 && !dark) {
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos-state-v1')); s.settings.privacyMode = false; localStorage.setItem('lifeos-state-v1', JSON.stringify(s)); });
      await enter(); await page.locator('.finance-tabs').getByRole('button', { name: /^Futuro/ }).click();
      await page.getByRole('button', { name: /^\+.*Compromiso$/ }).click();
      const commitment = page.getByRole('dialog', { name: 'Registrar Compromiso Financiero', exact: true });
      await commitment.getByPlaceholder('Ej. Antel, Tarjeta, Cuota TV').fill('Creación explícita UYU');
      await commitment.locator('input[type="number"]').first().fill('50');
      await commitment.getByRole('button', { name: 'Registrar Compromiso', exact: true }).click();
      await commitment.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '+ Ingreso', exact: true }).click();
      const income = page.getByRole('dialog', { name: 'Registrar Ingreso Previsto', exact: true });
      await income.locator('input[type="text"]').first().fill('Creación de cobro UYU');
      await income.locator('input[type="number"]').first().fill('60');
      await income.getByRole('button', { name: 'Registrar Ingreso Previsto', exact: true }).click(); await income.waitFor({ state: 'hidden' });
      const created = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).finance);
      assert.equal(created.commitments.find(c => c.name === 'Creación explícita UYU').currency, 'UYU');
      assert.equal(created.expectedIncomes.find(c => c.name === 'Creación de cobro UYU').currency, 'UYU');
      assert.equal(created.commitments.find(c => c.id === 'ambiguous-payment').currency, undefined);
      await page.locator('#commitment-known-USD').getByRole('button', { name: 'Registrar pago', exact: true }).click();
      const payment = page.getByRole('dialog', { name: 'Registrar pago de Compromiso', exact: true });
      assert.match(await payment.innerText(), /Monto a pagar \(USD\)/);
      assert.match(await payment.locator('option[value="USD"]').first().textContent(), /US\$/);
      await payment.getByRole('button', { name: 'Registrar pago', exact: true }).click(); await payment.waitFor({ state: 'hidden' });
      const paid = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).finance);
      assert.equal(paid.transactions.length, 1); assert.equal(paid.transactions[0].currency, 'USD');
      assert.equal(paid.accounts.find(a => a.id === 'USD').balance, 976.55); assert.equal(paid.accounts.find(a => a.id === 'UYU').balance, 1000);
      results.push('PASS creación UYU explícita sin reparar históricos y pago USD con su moneda y saldo correctos'); console.log(results.at(-1));
    }
    results.push(`PASS ${width} ${dark ? 'oscuro' : 'claro'}: parcial, registros visibles, bloqueo sin mutación, recarga y privacidad DOM/atributos`);
    console.log(results.at(-1)); await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ results, errors, external }, null, 2));
  console.log(`RESULT ${results.length} escenarios; 0 errores de página; 0 solicitudes externas`);
} finally { await browser?.close(); server.kill(); }
