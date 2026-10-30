// Run after npm run build: node --import tsx scripts/test-finance-repeated-integrity.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';
import { compareTransactionsChronologically } from '../src/lib/financeTransactionChronology.ts';

const port = 5217;
const origin = `http://127.0.0.1:${port}`;
const output = path.resolve('artifacts/finance-integrity');
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'pipe' });
let browser;
const evidence = [];
try {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Vite preview must be serving the current local build');
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
  // No real accounts, external APIs or existing browser profiles are accessible.
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const state = defaultState();
  state.settings.onboardingCompleted = true;
  state.settings.hiddenTabs = [];
  state.settings.privacyMode = false;
  state.finance.accounts = [{ id: 'cash-test', name: 'Caja sintética', balance: 1000, initialBalance: 1000, currency: 'UYU' }];
  state.finance.categories = [{ id: 'food-test', name: 'Comida', active: true }];
  state.finance.transactions = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-30T12:00:00-03:00') });
  await page.addInitScript(seed => {
    if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(seed));
  }, state);
  await page.goto(`${origin}/?view=finanzas`);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
  async function check(label, count, balance, spent, income = 0) {
    await page.waitForFunction(({ count, balance }) => {
      const s = JSON.parse(localStorage.getItem('lifeos-state-v1'));
      return s.finance.transactions.length === count && s.finance.accounts[0].balance === balance;
    }, { count, balance });
    const saved = await stored();
    assert.equal(saved.finance.transactions.filter(tx => tx.type === 'gasto').reduce((sum, tx) => sum + tx.amount, 0), spent);
    assert.equal(saved.finance.transactions.filter(tx => tx.type === 'ingreso').reduce((sum, tx) => sum + tx.amount, 0), income);
    assert.equal(1000 + income - spent, balance);
    const hero = page.locator('section').filter({ hasText: /Saldo real/ }).first();
    assert.ok((await hero.innerText()).replaceAll('.', '').includes(String(balance)), 'Saldo mostrado debe coincidir con libro persistido');
    if (count > 0) {
      const footer = page.locator('.finance-divider').filter({ hasText: 'Neto:' });
      assert.ok((await footer.innerText()).replaceAll('.', '').includes(String(Math.abs(income - spent))), 'Neto mostrado debe coincidir con los movimientos persistidos');
    }
    evidence.push({ label, count, balance, spent, income, ids: saved.finance.transactions.map(tx => tx.id) });
    return saved;
  }
  async function add(type = 'gasto', amount = '200', note = '') {
    await page.getByRole('button', { name: 'Nuevo movimiento', exact: true }).click();
    await page.getByRole('menuitem', { name: type === 'gasto' ? 'Registrar gasto' : 'Registrar ingreso' }).click();
    await page.locator('#finance-tx-amount').fill(amount);
    assert.ok(await page.getByLabel(type === 'gasto' ? '¿En qué gastaste? (opcional)' : '¿De dónde proviene? (opcional)').isVisible());
    await page.locator('#finance-tx-note').fill(note);
    await page.getByRole('button', { name: type === 'gasto' ? 'Guardar Gasto' : 'Guardar Ingreso', exact: true }).click();
  }
  const group = () => page.getByRole('region', { name: 'Posible duplicado', exact: true });
  async function choose(id) {
    await page.getByRole('button', { name: 'Eliminar uno', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.ok(await dialog.getByRole('button', { name: 'Continuar', exact: true }).isDisabled());
    await dialog.locator(`input[value="${id}"]`).check();
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    assert.ok((await dialog.innerText()).includes(id));
    assert.ok((await dialog.innerText()).includes('se revertirá su efecto'));
  }
  async function failWrites(fail) {
    await page.evaluate(failing => {
      if (!window.__financeOriginalSetItem) window.__financeOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = failing ? function(key, value) {
        if (key === 'lifeos-state-v1') throw new DOMException('synthetic quota failure', 'QuotaExceededError');
        return window.__financeOriginalSetItem.call(this, key, value);
      } : window.__financeOriginalSetItem;
    }, fail);
  }
  await check('inicial', 0, 1000, 0);
  await add();
  const first = await check('primer gasto sin descripción', 1, 800, 200);
  await add();
  const second = await check('segundo gasto idéntico', 2, 600, 400);
  assert.deepEqual(second.finance.transactions[0], first.finance.transactions[0]);
  assert.equal(new Set(second.finance.transactions.map(tx => tx.id)).size, 2);
  assert.equal(await group().count(), 1);
  assert.equal(await group().locator('button').count(), 2);
  await page.getByRole('button', { name: 'Eliminar uno', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.deepEqual((await stored()).finance, second.finance);
  await choose(second.finance.transactions[1].id);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.deepEqual((await stored()).finance, second.finance);
  await failWrites(true);
  await page.getByRole('button', { name: 'Conservar ambos', exact: true }).click();
  assert.deepEqual((await stored()).finance, second.finance);
  assert.equal(await group().count(), 1, 'Fallo al guardar no oculta ni finge conservar el grupo');
  await failWrites(false);
  await add();
  const third = await check('tercer gasto idéntico', 3, 400, 600);
  assert.equal(await group().count(), 1);
  assert.equal(await group().locator('button').count(), 2);
  await page.getByRole('button', { name: 'Conservar los 3 movimientos', exact: true }).click();
  const kept = await check('conservar los tres', 3, 400, 600);
  assert.ok(kept.finance.transactions.every(tx => tx.reviewStatus === 'reviewed'));
  assert.deepEqual(kept.finance.transactions.map(tx => tx.id), third.finance.transactions.map(tx => tx.id));
  assert.equal(await group().count(), 0);
  await page.reload();
  await check('recarga sin avisos simétricos', 3, 400, 600);
  assert.equal(await group().count(), 0);
  // After review the normal history action remains the sole deletion circuit.
  const target = [...kept.finance.transactions].sort((a, b) => compareTransactionsChronologically(b, a))[0];
  const row = page.locator('tbody tr').first();
  page.once('dialog', dialog => dialog.dismiss());
  await row.getByTitle('Eliminar movimiento', { exact: true }).click();
  assert.deepEqual((await stored()).finance, kept.finance);
  page.once('dialog', dialog => dialog.accept());
  await row.getByTitle('Eliminar movimiento', { exact: true }).click();
  const removed = await check('eliminar un gasto explícitamente', 2, 600, 400);
  assert.deepEqual(removed.finance.transactions, kept.finance.transactions.filter(tx => tx.id !== target.id));
  await add('ingreso');
  await add('ingreso');
  await check('dos ingresos idénticos', 4, 1000, 400, 400);
  await page.getByRole('button', { name: 'Conservar ambos', exact: true }).click();
  await check('conservar dos ingresos', 4, 1000, 400, 400);
  assert.equal(await group().count(), 0);
  await add('ingreso');
  const threeIncomes = await check('tercer ingreso, un grupo con contexto histórico', 5, 1200, 400, 600);
  const incomeToRemove = threeIncomes.finance.transactions.at(-1);
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(incomeToRemove.id);
  await failWrites(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar movimiento', exact: true }).click();
  assert.ok(await page.getByRole('dialog').isVisible(), 'Fallo al borrar conserva la confirmación');
  assert.deepEqual((await stored()).finance, threeIncomes.finance);
  await failWrites(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar movimiento', exact: true }).click();
  const deletedIncome = await check('selección exacta de un ingreso y reversión única', 4, 1000, 400, 400);
  assert.deepEqual(deletedIncome.finance.transactions, threeIncomes.finance.transactions.filter(tx => tx.id !== incomeToRemove.id));
  assert.equal(await group().count(), 0, 'No reabre los ingresos históricos ya conservados');
  // A failed local write must leave both persisted and rendered ledger unchanged.
  await failWrites(true);
  await add('gasto', '700', 'Reintento');
  assert.ok(await page.getByRole('dialog').isVisible(), 'Debe conservar formulario al fallar');
  const afterFailure = await stored();
  assert.equal(afterFailure.finance.transactions.length, 4);
  assert.equal(afterFailure.finance.accounts[0].balance, 1000);
  assert.equal(await page.locator('#finance-tx-amount').inputValue(), '700');
  await failWrites(false);
  await page.getByRole('button', { name: 'Guardar Gasto', exact: true }).click();
  await check('reintento tras fallo local', 5, 300, 1100, 400);
  await page.reload();
  await check('recarga final', 5, 300, 1100, 400);
  await page.screenshot({ path: path.join(output, 'final.png'), fullPage: true });
  writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
