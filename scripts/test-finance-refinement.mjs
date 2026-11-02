import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const out = path.resolve('artifacts/finance-refinement', phase); fs.mkdirSync(out, { recursive: true });
const origin = 'http://127.0.0.1:5333';
const appRoot = phase === 'before' ? path.resolve('artifacts/finance-refinement/baseline-app') : process.cwd();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', appRoot, '--config', path.resolve('vite.config.ts'), '--mode', 'portable', '--host', '127.0.0.1', '--port', '5333', '--strictPort'], { stdio: 'pipe', windowsHide: true });
server.stdout.on('data', chunk => fs.appendFileSync(path.join(out, 'server.log'), chunk));
server.stderr.on('data', chunk => fs.appendFileSync(path.join(out, 'server.log'), chunk));
let browser; const errors = [], external = [], results = [];
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  for (const width of [1440, 390, 375]) for (const dark of [false, true]) for (const kind of ['empty', 'active', 'partial']) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : width === 390 ? 844 : 812 }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'reduce', isMobile: width < 640, hasTouch: width < 640 });
    await context.clock.setFixedTime(new Date('2026-11-01T12:00:00-03:00'));
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message)); await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert.equal(await page.evaluate(async () => (await import('/src/lib/cloudSync.ts')).cloudSyncConfigured), false);
    await page.evaluate(async ({ kind, dark }) => {
      const { defaultState } = await import('/src/lib/storage.ts'); const { addTransaction } = await import('/src/lib/financeFlows.ts');
      const s = defaultState(); s.settings.onboardingCompleted = true; s.settings.darkMode = dark; s.settings.hiddenTabs = [];
      s.finance.accounts = [{ id: 'uyu', name: 'Cuenta principal para los gastos de la casa', currency: 'UYU', balance: kind === 'empty' ? 0 : 50000, initialBalance: kind === 'empty' ? 0 : 50000 }];
      s.finance.transactions = []; s.finance.commitments = []; s.finance.expectedIncomes = []; s.finance.subscriptions = []; s.finance.debts = []; s.finance.investments = []; s.finance.agreements = [];
      if (kind !== 'empty') {
        s.finance.accounts.push({ id: 'usd', name: 'Ahorros en dólares para proyectos familiares', currency: 'USD', initialBalance: 1234567.89, balance: 1234567.89 });
        addTransaction(s, { id: 'expense', type: 'gasto', amount: 1234.56, category: s.finance.categories[0].id, accountId: 'uyu', currency: 'UYU', date: '2026-11-01', note: 'Compra semanal de alimentos y artículos de limpieza para la casa', reviewStatus: 'reviewed' });
        addTransaction(s, { id: 'income', type: 'ingreso', amount: 28000, category: s.finance.categories[0].id, accountId: 'uyu', currency: 'UYU', date: '2026-11-01', note: 'Ingreso por trabajo', reviewStatus: 'reviewed' });
        s.finance.commitments = [{ id: 'upcoming', name: 'Alquiler del apartamento y gastos comunes correspondientes a noviembre', amount: 18500.75, currency: 'UYU', frequency: 'monthly', nextDueDate: '2026-11-05', active: true, accountId: 'uyu' }, { id: 'overdue', name: 'Factura de electricidad del mes anterior con vencimiento pendiente', amount: 8765.43, currency: 'UYU', frequency: 'once', nextDueDate: '2026-10-30', active: true, accountId: 'uyu' }];
        s.finance.expectedIncomes = [{ id: 'salary', name: 'Cobro por trabajo previsto para noviembre', amount: 28000, currency: 'UYU', frequency: 'once', startDate: '2026-11-10', active: true, accountId: 'uyu' }];
        if (kind === 'partial') { delete s.finance.commitments[0].currency; s.finance.expectedIncomes[0].currency = 'usd'; }
      }
      localStorage.setItem('lifeos-state-v1', JSON.stringify(s));
    }, { kind, dark });
    await page.reload(); await page.locator('.today-shell').waitFor(); await page.getByRole('button', { name: width < 640 ? 'Ir a Finanzas' : 'Finanzas', exact: true }).click(); await page.locator('.finance-workspace').waitFor(); await page.evaluate(() => document.fonts.ready);
    const initialFinance = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance));
    const hero = page.locator('.finance-workspace > section').first();
    if (phase === 'after') assert.match(await hero.innerText(), /Colchón mínimo/, 'Microcopy español sin errores de codificación');
    const heroHeight = (await hero.boundingBox()).height;
    const candidates = kind === 'empty' ? [page.locator('.finance-workspace').getByText(/^(No se encontraron movimientos|Sin movimientos registrados)$/).last()] : await page.getByText('Ingreso por trabajo', { exact: true }).all();
    let movement;
    for (const candidate of candidates) if (await candidate.isVisible()) { movement = candidate; break; }
    assert.ok(movement, 'Se mide la fila visible, nunca su copia oculta de otro viewport');
    const movementTop = await movement.evaluate(e => e.getBoundingClientRect().top + scrollY);
    const key = `${kind}-${width}-${dark ? 'dark' : 'light'}`;
    await page.screenshot({ path: path.join(out, `${key}-movimientos.png`), fullPage: true });
    if (phase === 'after' && kind === 'active') {
      await hero.getByRole('button', { name: 'USD', exact: true }).click();
      assert.match(await hero.innerText(), /US\$ 1\.234\.567,89/);
      assert.doesNotMatch(await hero.innerText(), /El saldo tras pagos pendientes está por debajo/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Saldo USD largo sin desbordamiento');
      if (width === 1440 && !dark || width === 375 && dark) await page.screenshot({ path: path.join(out, `${key}-saldo-usd.png`), fullPage: true });
      await hero.getByRole('button', { name: 'UYU', exact: true }).click();
    }
    const tabs = {};
    for (const tab of ['Cuentas', 'Futuro', 'Análisis']) {
      await page.locator('.finance-tabs').getByRole('button', { name: new RegExp('^' + tab) }).click();
      tabs[tab] = await page.locator('.finance-workspace').evaluate(e => ({ height: Math.round(e.getBoundingClientRect().height), text: e.innerText }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${key} ${tab}: no overflow`);
      if (tab === 'Futuro' || (kind === 'empty' && (width === 1440 || dark))) await page.screenshot({ path: path.join(out, `${key}-${tab.toLowerCase()}.png`), fullPage: true });
      if (phase === 'after' && tab === 'Futuro' && kind !== 'empty') {
        const row = page.locator('#commitment-upcoming');
        const title = row.getByText('Alquiler del apartamento y gastos comunes correspondientes a noviembre', { exact: true });
        assert.equal(await title.evaluate(e => getComputedStyle(e).textOverflow === 'ellipsis'), false);
        for (const control of await row.getByRole('button').all()) { const box = await control.boundingBox(); assert.ok(box.width >= 43 && box.height >= 43, 'Acción táctil de al menos 44px'); }
        if (width < 640) assert.equal(await row.evaluate(e => e.parentElement.scrollHeight > e.parentElement.clientHeight), false, 'Las acciones no quedan cortadas por un scroll interno móvil');
      }
      if (phase === 'after' && tab === 'Futuro' && kind === 'partial') assert.match(tabs[tab].text, /Proyección parcial|moneda sin confirmar/i);
    }
    assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance)), initialFinance, 'Navegar no cambia hechos financieros');
    if (phase === 'after' && kind === 'active' && (width === 1440 && !dark || width === 375 && dark)) {
      await page.locator('.finance-tabs').getByRole('button', { name: /^Movimientos/ }).click();
      const search = page.getByPlaceholder('Buscar por comercio, categoría, cuenta...');
      await search.fill('sin-resultados-sintéticos'); await page.getByText('Sin resultados para estos filtros', { exact: true }).waitFor(); await search.fill('');
      await page.locator('#finance-movement-trigger').click(); await page.getByRole('menuitem', { name: 'Registrar ingreso', exact: true }).click();
      const transaction = page.getByRole('dialog'); assert.match(await transaction.innerText(), /Fecha: hoy \(por defecto\)/);
      await transaction.getByRole('button', { name: /Más detalles/ }).click(); assert.equal(await transaction.getByLabel('Tipo de ingreso').count(), 1);
      const movementAmount = transaction.locator('input[inputmode="decimal"]').first(); await movementAmount.fill('7,89');
      await page.evaluate(() => { window.refineTxToasts = []; window.addEventListener('lifeos:toast', e => window.refineTxToasts.push(e.detail)); window.refineTxSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'lifeos-state-v1') throw new DOMException('Synthetic quota', 'QuotaExceededError'); return window.refineTxSet.call(this, k, v); }; });
      await transaction.getByRole('button', { name: 'Guardar Ingreso', exact: true }).click();
      assert.equal(await transaction.isVisible(), true); assert.equal(await movementAmount.inputValue(), '7,89');
      assert.equal(await page.evaluate(() => window.refineTxToasts.some(t => t.tone === 'success')), false);
      assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance)), initialFinance);
      await page.evaluate(() => { Storage.prototype.setItem = window.refineTxSet; });
      await page.keyboard.press('Escape'); await transaction.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#finance-movement-trigger').evaluate(e => e === document.activeElement), true);
      await page.locator('.finance-tabs').getByRole('button', { name: /^Cuentas/ }).click();
      const opener = page.getByRole('button', { name: 'Conciliar', exact: true }).first(); await opener.focus(); await opener.click();
      const rec = page.getByRole('dialog', { name: 'Conciliar saldo de cuenta', exact: true }); await rec.waitFor();
      for (const label of ['Cuenta a conciliar', 'Saldo real en banco / extracto', 'Fecha del extracto', 'Motivo del ajuste (opcional)']) assert.equal(await rec.getByLabel(label, { exact: true }).count(), 1);
      for (let i = 0; i < 10; i++) { await page.keyboard.press(i % 3 === 0 ? 'Shift+Tab' : 'Tab'); assert.equal(await rec.evaluate(e => e.contains(document.activeElement)), true); }
      await page.keyboard.press('Escape'); await rec.waitFor({ state: 'hidden' }); assert.equal(await opener.evaluate(e => e === document.activeElement), true);
      await opener.click(); await rec.getByLabel('Saldo real en banco / extracto', { exact: true }).fill('76785,44');
      await rec.getByLabel('Fecha del extracto', { exact: true }).fill('2026-11-01'); await rec.getByLabel('Motivo del ajuste (opcional)', { exact: true }).fill('Control sintético');
      await page.evaluate(() => { window.refineToasts = []; window.addEventListener('lifeos:toast', e => window.refineToasts.push(e.detail)); window.refineSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'lifeos-state-v1') throw new DOMException('Synthetic quota', 'QuotaExceededError'); return window.refineSet.call(this, k, v); }; });
      await rec.getByRole('button', { name: 'Confirmar conciliación', exact: true }).click();
      assert.equal(await rec.isVisible(), true); assert.equal(await rec.getByLabel('Saldo real en banco / extracto', { exact: true }).inputValue(), '76785,44');
      assert.match(await rec.getByRole('alert').innerText(), /No se confirmó la conciliación/);
      assert.equal(await rec.getByLabel('Motivo del ajuste (opcional)', { exact: true }).inputValue(), 'Control sintético');
      assert.equal(await page.evaluate(() => window.refineToasts.some(t => t.tone === 'success')), false);
      assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifeos-state-v1')).finance)), initialFinance);
      const rect = await rec.boundingBox(); assert.ok(rect.y >= 0 && rect.y + rect.height <= (width === 1440 ? 900 : 812));
      for (const control of [rec.getByLabel('Cuenta a conciliar', { exact: true }), rec.getByLabel('Saldo real en banco / extracto', { exact: true }), rec.getByLabel('Fecha del extracto', { exact: true }), rec.getByLabel('Motivo del ajuste (opcional)', { exact: true }), rec.getByRole('button', { name: 'Confirmar conciliación', exact: true })]) {
        await control.scrollIntoViewIfNeeded();
        assert.equal(await control.evaluate(e => { const box = e.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return hit === e || e.contains(hit); }), true, 'Campos y confirmación no tapados por controles fijos o avisos');
      }
      await page.screenshot({ path: path.join(out, `${key}-conciliacion-error.png`), fullPage: false });
      await page.evaluate(() => { Storage.prototype.setItem = window.refineSet; });
      await rec.getByRole('button', { name: 'Confirmar conciliación', exact: true }).click(); await rec.waitFor({ state: 'hidden' });
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).finance);
      assert.equal(saved.reconciliations.length, 1); assert.equal(saved.accounts[0].balance, 76785.44); assert.equal(saved.transactions.length, 3);
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos-state-v1')); s.settings.privacyMode = true; localStorage.setItem('lifeos-state-v1', JSON.stringify(s)); });
      await page.reload(); await page.locator('.today-shell').waitFor(); await page.getByRole('button', { name: width < 640 ? 'Ir a Finanzas' : 'Finanzas', exact: true }).click();
      for (const tab of ['Movimientos', 'Cuentas', 'Futuro', 'Análisis']) {
        await page.locator('.finance-tabs').getByRole('button', { name: new RegExp('^' + tab) }).click();
        const dom = await page.locator('.finance-workspace').evaluate(root => root.textContent + Array.from(root.querySelectorAll('*')).flatMap(e => Array.from(e.attributes).filter(a => /^(aria-|title|value)/.test(a.name)).map(a => a.value)).join('|'));
        assert.doesNotMatch(dom, /76[.,]785|76785|1[.]234[.]567|1234567|18[.]500|18500|8[.]765|8765|28[.]000|28000/, tab);
      }
      console.log(`PASS interacciones ${key}: filtros, fecha, conciliación accesible, foco, fallo/reintento único y privacidad`);
    }
    results.push({ key, kind, width, dark, heroHeight: Math.round(heroHeight), movementTop: Math.round(movementTop), tabs });
    console.log(`PASS ${key}: hero ${Math.round(heroHeight)}px, primer movimiento ${Math.round(movementTop)}px`); await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors, external }, null, 2));
  console.log(`RESULT ${results.length} escenarios; 0 errores de página; 0 solicitudes externas`);
} finally { await browser?.close(); server.kill(); }
