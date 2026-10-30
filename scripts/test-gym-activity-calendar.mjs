import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5244';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Synthetic tests require localhost');
const output = process.env.GYM_CALENDAR_OUTPUT || 'artifacts/gimnasio-calendario-20261029/flows';
await fs.mkdir(output, { recursive: true });
const browser = process.env.CHROME_PATH
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const errors = []; const results = [];
try {
  const context = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
  const clock = () => page.clock.setFixedTime(new Date('2026-10-29T12:00:00-03:00'));
  const go = async (state, theme) => {
    await clock(); await page.goto(`${origin}/tests/gym-calendar/browser.html?state=${state}&theme=${theme}`);
    await page.locator(state === 'active' ? '[data-active-workout-view]' : '.gym-activity-calendar').waitFor();
    await page.evaluate(() => document.fonts.ready);
  };
  const day = value => page.locator(`button[data-calendar-date="${value}"]`);
  const focusedDay = value => page.waitForFunction(date => document.activeElement?.getAttribute('data-calendar-date') === date, value);
  const snapshot = () => page.evaluate(() => JSON.stringify(window.gymFixtureState));
  const unchanged = async original => { assert.equal(await snapshot(), original); assert.equal(await page.evaluate(() => window.gymFixtureSaves), 0); };
  for (const [width, height] of [[1920, 1080], [2560, 1440], [768, 1024], [390, 844]]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height }); await go('filled', theme);
    const original = await snapshot();
    await page.getByText('2 días entrenados', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-trained]').count(), 4);
    assert.equal(await day('2026-10-29').getAttribute('aria-current'), 'date');
    assert.match(await day('2026-10-29').getAttribute('aria-label'), /2 sesiones completadas/);
    assert.equal(await page.locator('[data-open-calendar-session]').count(), 2);
    assert.equal(await page.locator('.gym-activity-calendar').getByRole('button', { name: 'Ver historial', exact: true }).count(), 0);
    const calendarWidth = await page.locator('.gym-activity-calendar').evaluate(el => el.getBoundingClientRect().width);
    const gridWidth = await page.locator('.gym-activity-grid').evaluate(el => el.getBoundingClientRect().width);
    const help = page.getByLabel('Ayuda: cómo se cuenta la actividad', { exact: true });
    const helpText = page.getByText('Se cuentan los días con entrenamientos finalizados. Varias sesiones en un mismo día cuentan como uno. Los descansos no suman.', { exact: true });
    assert.equal(await helpText.isVisible(), false); await help.focus(); await page.keyboard.press('Enter'); await helpText.waitFor({ state: 'visible' });
    const popup = await helpText.boundingBox(); assert.ok(popup.x >= 0 && popup.x + popup.width <= width);
    await page.keyboard.press('Escape'); assert.equal(await helpText.isVisible(), false);
    const startButton = page.getByRole('button', { name: 'Iniciar otro entrenamiento', exact: true });
    assert.equal(await startButton.isVisible(), true);
    assert.ok(await startButton.evaluate(el => el.getBoundingClientRect().bottom < document.querySelector('.gym-activity-calendar').getBoundingClientRect().top));

    await day('2026-10-27').click(); await page.getByText('Descanso registrado. No suma un día entrenado.', { exact: true }).waitFor();
    assert.equal(await day('2026-10-27').getAttribute('data-trained'), null);
    if (width >= 1024) {
      const compactWidth = await page.locator('.gym-activity-calendar').evaluate(el => el.getBoundingClientRect().width);
      assert.ok(compactWidth <= 554 && compactWidth < calendarWidth);
      assert.ok(Math.abs(await page.locator('.gym-activity-grid').evaluate(el => el.getBoundingClientRect().width) - gridWidth) < 1);
    }
    await page.getByLabel('Mes del calendario', { exact: true }).fill('2024-01'); await day('2024-01-31').click();
    await page.locator('[data-open-calendar-session="old"]').click();
    const historical = page.locator('[data-gym-history-session="old"]'); await historical.waitFor({ state: 'visible' });
    assert.equal(await historical.locator('[data-latest-session-detail]').isVisible(), true);
    assert.equal(await historical.evaluate(el => document.activeElement === el), true);
    assert.equal(await historical.evaluate(el => el.closest('details')?.open), true);
    await page.getByRole('button', { name: 'Entrenar', exact: true }).click();
    assert.equal(await page.getByLabel('Mes del calendario', { exact: true }).inputValue(), '2024-01');
    assert.equal(await day('2024-01-31').locator('..').getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await day('2026-10-29').focus(); await page.keyboard.press('ArrowRight');
    await focusedDay('2026-10-30');
    await page.keyboard.press('PageDown');
    assert.equal(await page.getByLabel('Mes del calendario', { exact: true }).inputValue(), '2026-11');
    await focusedDay('2026-11-30');
    assert.equal(await page.locator('[data-trained]').count(), 0);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await unchanged(original);
    await context.setOffline(true); await day('2026-10-19').click();
    await page.getByRole('button', { name: /Registro anterior/ }).waitFor();
    await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    await unchanged(original); await context.setOffline(false);

    await go('invalid', theme); const invalid = await snapshot();
    await page.getByLabel('Ayuda: cómo se cuenta la actividad', { exact: true }).click();
    await page.getByText('2 registros con trabajo no tienen una fecha válida. Se conservan sin asignarles un día.', { exact: true }).waitFor();
    await page.getByText('1 registro finalizado tiene fecha futura y no cuenta como asistencia.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-trained]').count(), 4); await unchanged(invalid);
    await page.screenshot({ path: `${output}/invalid-${width}-${theme}.png`, fullPage: true });
    await go('empty', theme); assert.equal(await page.locator('[data-trained]').count(), 0);
    await page.getByText('0 días entrenados', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click(); assert.equal(await page.locator('[data-trained]').count(), 0);
    await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();

    await go('active', theme); assert.equal(await page.locator('.gym-activity-calendar').isVisible(), false);
    await page.evaluate(() => { window.gymFixtureFailSave = true; });
    await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
    await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
    assert.equal(await page.evaluate(() => window.gymFixtureState.gym.sessions[0].status), 'active');
    assert.equal(await page.locator('.gym-activity-calendar').isVisible(), false);
    await page.evaluate(() => { window.gymFixtureFailSave = false; });
    await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: 'Continuar en Celestian', exact: true }).click();
    await page.locator('.gym-activity-calendar').waitFor();
    assert.equal(await day('2026-10-29').getAttribute('data-trained'), 'true');
    await page.getByText('1 día entrenado', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.gymFixtureSaves), 1);
    await page.screenshot({ path: `${output}/finished-${width}-${theme}.png`, fullPage: true });

    await go('filled', theme); const midnight = await snapshot();
    await page.clock.setFixedTime(new Date('2026-10-30T00:01:00-03:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('button[data-calendar-date="2026-10-30"]')?.getAttribute('aria-current') === 'date');
    await page.getByRole('button', { name: 'Hoy', exact: true }).click();
    assert.equal(await day('2026-10-30').locator('..').getAttribute('aria-selected'), 'true'); await unchanged(midnight);
    const metrics = await page.locator('.gym-activity-calendar').evaluate(root => ({ font: getComputedStyle(root).fontFamily, minButtonHeight: Math.min(...[...root.querySelectorAll('button[data-calendar-date]')].map(el => el.getBoundingClientRect().height)), overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.match(metrics.font, /Instrument Sans/); assert.ok(metrics.minButtonHeight >= 44); assert.equal(metrics.overflow, false);
    results.push({ width, theme, ...metrics, selectionAndArchive: true, navigationNoWrites: true, noScheduleInvention: true, offlineNavigation: true, failedSaveNoMark: true, finishUpdatesCalendar: true, localMidnightRefresh: true });
  }
  assert.deepEqual(errors, []); await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS: ${results.length} calendar scenarios, selection/archive focus, zero navigation writes, finish/failure, local midnight, both themes and offline navigation.`);
} catch (error) {
  await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, errors }, null, 2)); throw error;
} finally { await browser.close(); }
