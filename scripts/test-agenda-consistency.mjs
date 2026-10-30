import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5244';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.AGENDA_CONSISTENCY_OUTPUT || 'artifacts/agenda-consistencia-20261030/flows'; await fs.mkdir(output, { recursive: true });
const browser = process.env.CHROME_PATH ? await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true }) : await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const errors = []; const results = [];
try {
  const context = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo' });
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date('2026-10-30T12:00:00-03:00'));
  const modules = () => page.getByRole('navigation', { name: 'Módulos de prueba' });
  const original = () => page.locator('#today-extra-synthetic-medusa-task');
  const projected = () => page.locator('[id^="agenda-task-extra-synthetic-medusa-task-"]');
  const snapshot = () => page.evaluate(() => JSON.stringify(window.agendaFixtureState));
  const unchanged = async before => { assert.equal(await snapshot(), before); assert.equal(await page.evaluate(() => window.agendaFixtureSaves), 0); };
  const openCalendarTask = async () => {
    await modules().getByRole('button', { name: 'Calendario', exact: true }).click();
    await page.getByRole('button', { name: 'gaste 5000 en la medusa Tarea programada', exact: true }).click();
    await page.getByRole('dialog').waitFor();
  };
  for (const [width, height] of [[1920, 1080], [768, 1024], [390, 844]]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height }); await page.goto(`${origin}/tests/agenda-consistency/browser.html?view=dashboard&theme=${theme}`);
    await original().waitFor(); const before = await snapshot();
    assert.equal(await original().count(), 1);
    await original().getByRole('button', { name: 'gaste 5000 en la medusa Tarea', exact: true }).click();
    await projected().waitFor({ state: 'visible' }); assert.equal(await projected().count(), 1);
    assert.match(await projected().innerText(), /Tarea/); assert.match(await projected().locator('../..').innerText(), /Sin horario/);
    await page.waitForFunction(() => document.activeElement?.id === 'agenda-task-extra-synthetic-medusa-task-2026-10-30');
    await unchanged(before);
    if (width >= 768) { await page.getByRole('button', { name: 'Semana (7 días)', exact: true }).click(); await projected().waitFor({ state: 'visible' }); assert.equal(await projected().count(), 1); }
    await projected().getByRole('button', { name: 'Abrir tarea: gaste 5000 en la medusa', exact: true }).click(); await original().waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.id === 'today-extra-synthetic-medusa-task'); await unchanged(before);
    await openCalendarTask(); assert.match(await page.getByRole('dialog').innerText(), /Tarea/i); assert.match(await page.getByRole('dialog').innerText(), /Pendiente/);
    await page.getByRole('button', { name: 'Abrir tarea original', exact: true }).click(); await original().waitFor({ state: 'visible' }); await unchanged(before);
    await context.setOffline(true); await modules().getByRole('button', { name: 'Agenda', exact: true }).click(); await projected().waitFor({ state: 'visible' }); await unchanged(before); await context.setOffline(false);
    await modules().getByRole('button', { name: 'Hoy', exact: true }).click();
    await original().getByRole('button', { name: 'Completar: gaste 5000 en la medusa', exact: true }).click();
    assert.equal(await page.evaluate(() => window.agendaFixtureState.todayExtras[0].done), true);
    assert.equal(await page.evaluate(() => window.agendaFixtureSaves), 1);
    await modules().getByRole('button', { name: 'Agenda', exact: true }).click(); await projected().waitFor();
    assert.equal(await projected().locator('span.line-through').count(), 1);
    await openCalendarTask(); assert.match(await page.getByRole('dialog').innerText(), /Completada/);
    await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/completed-${theme}-${width}.png`, fullPage: true });

    // A completed historical task remains accessible through its original source,
    // without broadening the default list of pending tasks in Hoy.
    await page.evaluate(() => window.agendaFixtureSetState(previous => { const next = structuredClone(previous); next.todayExtras[0].date = '2026-10-29'; return next; }));
    await modules().getByRole('button', { name: 'Agenda', exact: true }).click();
    await page.getByRole('navigation', { name: 'Días de la semana' }).getByRole('button', { name: /^Jueves 29 de octubre/ }).click();
    await projected().getByRole('button', { name: 'Abrir tarea: gaste 5000 en la medusa', exact: true }).click();
    await page.getByLabel('Tarea original seleccionada', { exact: true }).waitFor({ state: 'visible' }); assert.match(await original().innerText(), /Completada/);
    assert.equal(await page.evaluate(() => window.agendaFixtureSaves), 1);
    if (width >= 768) {
      await page.evaluate(() => window.agendaFixtureSetState(previous => { const next = structuredClone(previous); next.todayExtras[0].dueDate = '2026-10-30'; return next; }));
      await modules().getByRole('button', { name: 'Agenda', exact: true }).click();
      await page.getByRole('button', { name: 'Semana (7 días)', exact: true }).click();
      assert.equal(await projected().count(), 2);
      const ids = await projected().evaluateAll(elements => elements.map(element => element.id));
      assert.equal(new Set(ids).size, 2);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#agenda-task-extra-synthetic-medusa-task-2026-10-30').waitFor({ state: 'visible' });
      assert.equal(await projected().count(), 1);
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => document.querySelectorAll('[id^="agenda-task-extra-synthetic-medusa-task-"]').length === 2);
      assert.equal(await page.evaluate(() => window.agendaFixtureSaves), 1);
    }
    results.push({ width, theme, sameCanonicalTaskInThreeViews: true, originalNavigationAndFocus: true, weeklyAndDailyView: true, noNavigationWrites: true, offlineNavigation: true, completionShared: true, completedHistoricalTaskOpens: true });
  }
  assert.deepEqual(errors, []); await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); console.log(`PASS: ${results.length} responsive/theme scenarios, three-view identity, original navigation, zero navigation writes, shared completion and historical access.`);
} catch (error) { await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, errors }, null, 2)); throw error; }
finally { await browser.close(); }
