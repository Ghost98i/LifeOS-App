import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';

const evidence = path.resolve('artifacts/optimization-2026-10-29/ux');
mkdirSync(evidence, { recursive: true });
const origin = 'http://127.0.0.1:5261';
const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5261', '--strictPort'], { stdio: 'ignore' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], errors = [];
const runtimeFiles = readdirSync('dist/assets').filter(file => file.endsWith('.js') && /as DotLottieReact/.test(readFileSync(path.join('dist/assets', file), 'utf8')));
assert.equal(runtimeFiles.length, 1, 'Debe identificarse el runtime real para comprobar que no se carga al arrancar');
const heading = { Finanzas: 'Finanzas', Notas: 'Notas', Configuración: 'Configuración' };
async function navigate(page, label) {
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button', { name: label, exact: true }).click();
  if (label === 'Hoy') await page.locator('.today-observatory-greeting').waitFor();
  else await page.locator('main').getByRole('heading', { name: heading[label], exact: true, level: 1 }).waitFor();
}
async function tabInside(page, dialog, times = 24) {
  for (let index = 0; index < times; index++) {
    await page.keyboard.press(index % 3 === 0 ? 'Shift+Tab' : 'Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'El foco debe permanecer dentro del diálogo');
  }
}
async function step(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  let ready = false;
  for (let count = 0; count < 60; count++) {
    if (server.exitCode !== null) throw new Error(`Preview exited (${server.exitCode})`);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Preview debe iniciar en su puerto exclusivo');
  for (const width of [375, 768, 1920]) for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';
    const context = await browser.newContext({ viewport: { width, height: width === 1920 ? 1080 : 812 }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'no-preference' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const state = defaultState();
    Object.assign(state.settings, { darkMode: dark, onboardingCompleted: true, hiddenTabs: [], lastBackupAt: '2026-10-29', lastWeeklyReviewAt: '2026-10-29' });
    state.profile.name = 'Prueba sintética';
    state.finance.accounts = [{ id: 'ux-a', name: 'Cuenta sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }, { id: 'ux-b', name: 'Efectivo sintético', initialBalance: 0, balance: 0, currency: 'UYU' }];
    state.tasksRecurring = [{ id: 'ux-task', name: 'Repasar apuntes', freq: 'daily', effort: 'low' }];
    state.notes.postits = Array.from({ length: 500 }, (_, i) => ({ id: `ux-note-${i}`, title: `Apunte sintético ${String(i).padStart(3, '0')}`, text: 'Contenido de prueba para conservar y buscar.', date: '2026-10-29' }));
    const page = await context.newPage();
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-29T15:00:00-03:00'));
    await page.addInitScript(state => { localStorage.setItem('lifeos-state-v1', JSON.stringify(state)); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1'); }, state);
    try {
      await page.goto(origin); await page.locator('.today-observatory-greeting').waitFor();
      if (width >= 768) {
        const keycap = page.getByRole('button', { name: 'Abrir Paleta de Comandos', exact: true }).locator('kbd');
        const height = await keycap.evaluate(el => el.getBoundingClientRect().height);
        assert.ok(height < 25, 'El atajo Ctrl K debe permanecer en una línea en tablet y escritorio');
      }
      await step(`${width} ${theme}: primera animación se carga al completar, sin runtime en arranque`, async () => {
        await page.waitForLoadState('networkidle');
        assert.equal(requested.some(url => runtimeFiles.some(file => url.endsWith(file))), false);
        await page.getByRole('button', { name: 'Completar: Repasar apuntes', exact: true }).click();
        await page.locator('.lifeos-lottie canvas').waitFor({ state: 'attached', timeout: 5000 });
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-completion.png`) });
        assert.ok(requested.some(url => runtimeFiles.some(file => url.endsWith(file))), 'La primera animación solicita su runtime diferido');
        await page.waitForTimeout(2000);
        assert.equal(await page.getByRole('button', { name: 'Marcar como pendiente: Repasar apuntes', exact: true }).getAttribute('aria-pressed'), 'true');
      });
      await step(`${width} ${theme}: notas progresivas conservan búsqueda, todas las notas y acceso directo`, async () => {
        await navigate(page, 'Notas');
        const cards = () => page.locator('main').getByRole('button', { name: /^Abrir nota / });
        assert.equal(await cards().count(), 50);
        await page.getByRole('button', { name: 'Cargar 50 más', exact: true }).click();
        assert.equal(await cards().count(), 100);
        await page.getByRole('button', { name: 'Ver todas', exact: true }).click();
        assert.equal(await cards().count(), 500);
        const search = page.getByPlaceholder('Buscar por título, texto o etiqueta');
        await search.fill('Apunte sintético 499');
        assert.equal(await cards().count(), 1);
        await search.fill('');
        assert.equal(await cards().count(), 50);
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-notes.png`) });
        await page.getByRole('button', { name: 'Cargar 50 más', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-notes-footer.png`) });
        await page.keyboard.press('Control+k');
        const palette = page.getByRole('dialog', { name: 'Comandos de Celestian' });
        await palette.getByPlaceholder('Escribe un comando o busca notas, transacciones, ejercicios…').fill('Apunte sintético 499');
        await palette.getByRole('button', { name: /Apunte sintético 499/ }).click();
        const target = page.getByRole('button', { name: 'Abrir nota Apunte sintético 499', exact: true });
        await target.waitFor();
        assert.equal(await target.evaluate(el => el === document.activeElement), true, 'La búsqueda lleva a la nota aunque estuviera fuera del bloque inicial');
        await target.click();
        const editor = page.getByRole('dialog', { name: 'Editar nota' });
        await editor.waitFor();
        assert.equal(await editor.getByLabel('Título de la nota').inputValue(), 'Apunte sintético 499');
        await editor.getByRole('button', { name: 'Cerrar editor de nota' }).click();
      });
      await step(`${width} ${theme}: gasto, transferencia y categorías conservan foco y Escape`, async () => {
        await navigate(page, 'Finanzas');
        const movement = page.getByRole('button', { name: 'Movimiento', exact: true });
        await movement.click(); await page.getByRole('menuitem', { name: /Registrar Gasto/ }).click();
        let dialog = page.getByRole('dialog', { name: 'Registrar Gasto', exact: true });
        await dialog.waitFor();
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-expense-dialog.png`) });
        await tabInside(page, dialog);
        await dialog.getByRole('button', { name: 'Cerrar', exact: true }).focus();
        await page.keyboard.press('g'); await page.keyboard.press('h');
        assert.equal(await dialog.isVisible(), true, 'Los atajos de navegación no descartan un formulario abierto');
        await dialog.getByRole('button', { name: 'Editar', exact: true }).click();
        const categories = page.getByRole('dialog', { name: 'Categorías de Finanzas' });
        await categories.waitFor();
        await categories.getByRole('button', { name: 'Cerrar modal', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await categories.evaluate(el => el.contains(document.activeElement)), true, 'El diálogo padre no captura el teclado del hijo');
        await page.keyboard.press('Escape'); await categories.waitFor({ state: 'hidden' });
        assert.equal(await dialog.isVisible(), true);
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        assert.equal(await movement.evaluate(el => el === document.activeElement), true);
        await movement.click(); await page.getByRole('menuitem', { name: /Transferir/ }).click();
        dialog = page.getByRole('dialog', { name: 'Transferir entre cuentas' });
        await dialog.waitFor(); await tabInside(page, dialog);
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        assert.equal(await movement.evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        if (width === 375) {
          await page.setViewportSize({ width: 375, height: 430 });
          await movement.click(); await page.getByRole('menuitem', { name: /Registrar Gasto/ }).click();
          dialog = page.getByRole('dialog', { name: 'Registrar Gasto', exact: true });
          await dialog.getByRole('button', { name: /Más detalles/ }).click();
          const save = dialog.getByRole('button', { name: 'Guardar Gasto', exact: true });
          await save.scrollIntoViewIfNeeded();
          const rect = await save.boundingBox(); assert.ok(rect.y >= 0 && rect.y + rect.height <= 430);
          await page.screenshot({ path: path.join(evidence, `${width}-${theme}-keyboard-height.png`) });
          await page.keyboard.press('Escape');
          await page.setViewportSize({ width: 375, height: 812 });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      });
      await step(`${width} ${theme}: búsqueda diferida conserva navegación de teclado`, async () => {
        await page.keyboard.press('Control+k');
        const palette = page.getByRole('dialog', { name: 'Comandos de Celestian' });
        await palette.waitFor(); await tabInside(page, palette);
        const input = palette.getByPlaceholder('Escribe un comando o busca notas, transacciones, ejercicios…');
        await input.fill('Apunte sintético 499'); await page.keyboard.press('Escape');
        assert.equal(await input.inputValue(), ''); assert.equal(await palette.isVisible(), true);
        await page.keyboard.press('Escape'); await palette.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.activeElement === document.body), false);
      });
      await step(`${width} ${theme}: estados de Configuración completos y legibles`, async () => {
        await navigate(page, 'Configuración');
        for (const label of ['Cuenta no vinculada', 'Sin clave local']) {
          const labels = await page.getByText(label, { exact: true }).evaluateAll(elements => elements.filter(el => el.getClientRects().length > 0).map(el => ({ visible: el.scrollWidth <= el.clientWidth, text: el.textContent })));
          assert.ok(labels.some(label => label.visible), 'El estado debe estar visible sin truncamiento');
        }
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-settings.png`) });
      });
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); server.kill();
  writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, failures, errors }, null, 2));
}
assert.equal(failures.length + errors.length, 0, JSON.stringify({ failures, errors }));
