import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaultState } from '../src/lib/storage.ts';

// Only synthetic data in a fresh browser profile. No requests may leave this origin.
const origin = process.env.TEST_URL || 'http://127.0.0.1:5217';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin));
const baseline = process.argv.includes('--baseline');
const evidence = path.resolve('artifacts', 'perfeccionamiento');
fs.mkdirSync(evidence, { recursive: true });
const state = defaultState();
const date = '2026-10-27';
state.settings.userName = 'Prueba local';
state.settings.onboardingCompleted = true;
state.settings.darkMode = true;
state.settings.hiddenTabs = [];
state.agenda.martes = [
  { id: 'block-free', activity: 'Actividad sin hora', time: '' },
  { id: 'block-timed', activity: 'Actividad con hora', time: '09:00' },
];
state.tasksRecurring = [
  { id: 'routine-free', name: 'Rutina sin hora', freq: 'daily' },
  { id: 'routine-done', name: 'Rutina terminada', freq: 'daily' },
  { id: 'routine-timed', name: 'Rutina con hora', freq: 'daily', time: '09:00' },
];
state.taskLog = { [date]: { 'routine-done': true } };
state.todayExtras = [
  { id: 'extra-a', text: 'Comprar materiales', date, done: false, priority: 'alta' },
  { id: 'extra-b', text: 'Enviar informe', date, done: true, priority: 'media' },
];
state.calendarEvents = [
  { id: 'event-free', name: 'Evento sin hora', date, type: 'otro', recurring: false },
  { id: 'event-timed', name: 'Evento con hora', date, time: '08:00', type: 'otro', recurring: false },
];
const candidates = [process.env.CHROME_PATH,
  path.join(process.env.ProgramFiles || '', 'BraveSoftware/Brave-Browser/Application/brave.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
  await context.route('**/*', (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await context.addInitScript((fixture) => {
    if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(fixture));
  }, state);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-27T15:00:00Z'));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Agenda de hoy', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(evidence, baseline ? 'antes-2k.png' : 'despues-2k.png') });
  console.log('SVG measurements', await page.locator('aside nav svg').evaluateAll((icons) => icons.map((icon) => {
    const box = icon.getBBox(), rect = icon.getBoundingClientRect(), vb = icon.viewBox.baseVal;
    return { name: icon.dataset.appIcon, css: rect.width, drawing: Math.round(box.width / vb.width * rect.width * 10) / 10, color: getComputedStyle(icon).color };
  })));
  if (!baseline) {
    const rows = page.locator('.today-agenda-entry');
    const rowLabels = () => rows.locator('button.min-w-0 > span:first-child').allTextContents();
    const before = await rowLabels();
    for (const label of ['Actividad sin hora', 'Rutina sin hora', 'Comprar materiales', 'Actividad con hora', 'Rutina con hora']) {
      const button = page.getByRole('button', { name: `Completar: ${label}`, exact: true });
      const position = await button.boundingBox();
      await button.click();
      const completed = page.getByRole('button', { name: `Marcar como pendiente: ${label}`, exact: true });
      await completed.waitFor();
      if (label === 'Actividad sin hora') await completed.locator('.lifeos-lottie').waitFor();
      assert.deepEqual(await rowLabels(), before);
      assert.equal((await completed.boundingBox()).y, position.y);
      assert.equal(await completed.getAttribute('aria-pressed'), 'true');
    }
    await page.reload();
    await page.getByRole('heading', { name: 'Agenda de hoy', exact: true }).waitFor();
    assert.deepEqual(await rowLabels(), before);
    for (const label of ['Actividad sin hora', 'Rutina sin hora', 'Comprar materiales', 'Actividad con hora', 'Rutina con hora']) {
      await page.getByRole('button', { name: `Marcar como pendiente: ${label}`, exact: true }).click();
      assert.deepEqual(await rowLabels(), before);
    }
    console.log('PASS: toggle, untoggle, physical positions, equal times and reload');
  }
  for (const [width, height] of [[1920, 1080], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(evidence, `${baseline ? 'antes' : 'despues'}-${width}.png`) });
  }
  if (baseline) {
    console.log('Mobile sidebar visibility', await page.locator('aside').evaluate((el) => getComputedStyle(el).visibility));
  } else {
    assert.equal(await page.locator('aside').evaluate((el) => getComputedStyle(el).visibility), 'hidden');
    const menu = page.getByRole('button', { name: 'Abrir más secciones', exact: true });
    await menu.click();
    await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).waitFor();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('aside button').last().evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate((el) => el === document.activeElement), true);
    console.log('PASS: hidden mobile nav, focus loop, Escape and return focus');

    await page.goto(`${origin}/?view=calendario`);
    await page.getByRole('button', { name: 'Agregar acontecimiento', exact: true }).click();
    await page.getByLabel('Nombre o descripción *').fill('Borrador de prueba que debe conservarse');
    await page.setViewportSize({ width: 667, height: 375 });
    const dialog = page.getByRole('dialog', { name: 'Nuevo acontecimiento' });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 375, 'Form stays within short viewport');
    await page.mouse.click(2, 2);
    assert.equal(await dialog.count(), 1, 'Backdrop does not discard the form');
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      window.restoreTestStorage = () => { Storage.prototype.setItem = setItem; };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'lifeos-state-v1') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Guardar acontecimiento', exact: true }).click();
    assert.equal(await dialog.count(), 1, 'Rejected save must retain the form');
    assert.equal(await page.getByLabel('Nombre o descripción *').inputValue(), 'Borrador de prueba que debe conservarse');
    assert.equal(await page.getByText('Acontecimiento agregado.', { exact: true }).count(), 0);
    await page.evaluate(() => window.restoreTestStorage());
    await page.getByRole('button', { name: 'Guardar acontecimiento', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Cerrar formulario' }).evaluate((el) => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Guardar acontecimiento', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    console.log('PASS: Calendar short viewport, safe backdrop, rejected save retains draft, focus loop and successful retry');

    for (const width of [2560, 1920, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : width === 2560 ? 1440 : 1080 });
      for (const view of ['dashboard', 'gimnasio', 'finanzas', 'agenda', 'calendario', 'trabajo', 'reventa', 'estudios', 'notas', 'ia', 'config']) {
        await page.goto(`${origin}/?view=${view}`);
        await page.locator('main').waitFor();
        await page.waitForTimeout(300);
        if (width !== 1920) await page.screenshot({ path: path.join(evidence, `${view}-${width}.png`) });
        const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        console.log(`${view} ${width}: overflow=${overflow.scroll - overflow.width}`);
        assert.ok(overflow.scroll <= overflow.width + 1, `${view}: horizontal page overflow at ${width}`);
        if (width === 375) {
          const title = page.locator('header span[title]');
          assert.equal(await title.evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${view}: mobile title is readable`);
        }
      }
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: 11 modules at 3 sizes, no page overflow or uncaught errors');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${origin}/?view=config`);
    await page.getByText('Privacidad, seguridad y tratamiento de datos', { exact: true }).click();
    assert.equal(await page.getByText(/no cifra esa copia ni los backups JSON/).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: /Ver atribución, modificaciones y licencia/ }).getAttribute('target'), '_blank');
    await page.getByTitle('Cambiar a modo claro', { exact: true }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(evidence, 'config-claro.png') });
    assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('dark')), false);
    console.log('PASS: factual privacy information, credits in separate tab and light theme');
  }
} finally {
  await browser.close();
}
