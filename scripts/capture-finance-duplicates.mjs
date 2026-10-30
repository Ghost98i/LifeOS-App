// Synthetic, isolated UI evidence. All non-loopback requests are blocked.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';
const phase = process.argv.includes('--before') ? 'before' : 'after';
const origin = 'http://127.0.0.1:5227';
const output = path.resolve('artifacts/finance-duplicates');
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5227', '--strictPort'], { windowsHide: true, stdio: 'pipe' });
let browser;
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const seed = defaultState();
    seed.settings.onboardingCompleted = true;
    seed.settings.hiddenTabs = [];
    seed.settings.privacyMode = false;
    seed.finance.accounts = [{ id: 'synthetic-cash', name: 'Efectivo de prueba', balance: 400, initialBalance: 1000, currency: 'UYU' }];
    seed.finance.categories = [{ id: 'synthetic-food', name: 'Comida', active: true }];
    seed.finance.commitments = [];
    seed.finance.expectedIncomes = [];
    seed.finance.transactions = [1, 2, 3].map(n => ({ id: `synthetic-purchase-${n}`, type: 'gasto', amount: 200, category: 'synthetic-food', date: '2026-10-30', fixed: 'variable', note: '', accountId: 'synthetic-cash', origin: 'manual', createdAt: `2026-10-30T12:0${n}:00.000Z`, reviewStatus: 'pending' }));
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-10-30T12:00:00-03:00') });
    await page.addInitScript(state => localStorage.setItem('lifeos-state-v1', JSON.stringify(state)), seed);
    await page.goto(`${origin}/?view=finanzas`);
    const inbox = page.locator('div.finance-surface').filter({ has: page.getByRole('heading', { name: 'Atención requerida' }) });
    await inbox.waitFor();
    await inbox.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).finance.accounts[0].balance), 400);
    const device = width === 1440 ? 'desktop' : width === 390 ? 'mobile' : 'tablet';
    await page.screenshot({ path: path.join(output, `${phase}-${device}.png`) });
    if (phase === 'after' && width === 1440) {
      // Static copy of the actually rendered DOM/CSS for the design inspector.
      // No scripts, authentication, remote services or mutable application state.
      const html = await page.evaluate(() => {
        const root = document.documentElement.cloneNode(true);
        root.querySelectorAll('script, link[rel="stylesheet"], link[rel="preconnect"], link[rel="manifest"]').forEach(node => node.remove());
        return '<!doctype html>' + root.outerHTML;
      });
      writeFileSync(path.join(output, 'after-screen.html'), html);
    }
    if (phase === 'after') {
      await page.getByRole('button', { name: 'Eliminar uno', exact: true }).click();
      await page.getByRole('dialog', { name: 'Elegí qué movimiento eliminar' }).waitFor();
      await page.screenshot({ path: path.join(output, `selection-${device}.png`) });
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Nuevo movimiento', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Registrar gasto' }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: path.join(output, `${phase}-form-${device}.png`) });
    await context.close();
  }
  console.log(`Captured ${phase} synthetic desktop, tablet and mobile evidence in ${output}`);
} finally { await browser?.close(); server.kill(); }
