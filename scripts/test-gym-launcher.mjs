import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5244';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Synthetic tests require localhost');
const output = process.env.GYM_LAUNCHER_OUTPUT || 'artifacts/gimnasio-inicio-contextual-20261030/flows';
await fs.mkdir(output, { recursive: true });
const browser = process.env.CHROME_PATH ? await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true }) : await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const errors = []; const results = [];
try {
  const context = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo' });
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
  const go = async (state, theme = 'light', time = '2026-10-30T12:00:00-03:00') => {
    await page.clock.setFixedTime(new Date(time));
    await page.goto(`${origin}/tests/gym-launcher/browser.html?state=${state}&theme=${theme}`);
    await page.locator(state === 'active' ? '[data-active-workout-view]' : '[data-gym-launcher]').waitFor();
  };
  const choice = () => page.locator('#gym-routine-choice');
  const start = () => page.locator('[data-gym-start]');
  const snapshot = () => page.evaluate(() => JSON.stringify(window.gymLauncherState));
  const unchanged = async before => { assert.equal(await snapshot(), before); assert.equal(await page.evaluate(() => window.gymLauncherSaves), 0); };
  const selected = value => page.waitForFunction(expected => document.querySelector('#gym-routine-choice')?.value === expected, value);
  const exitActive = async () => {
    await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
    await page.getByRole('button', { name: 'Salir sin finalizar · conservar sesión', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).waitFor();
  };

  for (const [width, height] of [[1920, 1080], [2560, 1440], [768, 1024], [390, 844], [375, 812]]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height }); await go('unique', theme); const initial = await snapshot();
    await selected('routine:pecho'); assert.equal(await start().innerText(), 'Iniciar Pecho');
    assert.equal(await page.getByRole('button', { name: 'Usar rutina de hoy: Pecho', exact: true }).count(), 0);
    assert.equal(await choice().locator('optgroup[label="Rutinas de hoy"] option').count(), 1);
    assert.equal(await page.locator('[data-trained]').count(), 0); await unchanged(initial);
    await choice().selectOption('free');
    assert.equal(await page.getByText('Agregá los ejercicios durante la sesión.', { exact: true }).count(), 0);
    assert.equal(await choice().getAttribute('aria-describedby'), null);
    await page.getByRole('button', { name: 'Usar rutina de hoy: Pecho', exact: true }).click(); await selected('routine:pecho'); await unchanged(initial);
    assert.equal(await choice().evaluate(el => document.activeElement === el), true);
    assert.equal(await page.getByRole('button', { name: 'Usar rutina de hoy: Pecho', exact: true }).count(), 0);
    await choice().selectOption('free'); await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Historial/ }).click();
    await page.getByRole('button', { name: 'Entrenar', exact: true }).click(); await selected('free');
    await page.evaluate(() => window.gymLauncherSetState(previous => ({ ...previous, profile: { ...previous.profile, name: 'Sintético' } })));
    await selected('free'); assert.equal(await page.evaluate(() => window.gymLauncherSaves), 0);
    await choice().selectOption('routine:espalda');
    await page.getByRole('button', { name: 'Rutinas', exact: true }).click(); await page.getByRole('button', { name: 'Entrenar', exact: true }).click();
    await selected('routine:espalda'); assert.equal(await start().innerText(), 'Iniciar Espalda');
    await context.setOffline(true); await choice().selectOption('routine:pecho'); await selected('routine:pecho'); await context.setOffline(false);
    await page.getByRole('button', { name: 'Rutinas', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar rutina: Espalda', exact: true }).click(); await selected('routine:espalda');
    assert.equal(await page.evaluate(() => window.gymLauncherSaves), 0);
    await start().click(); await page.locator('[data-active-workout-view]').waitFor();
    assert.equal(await page.evaluate(() => window.gymLauncherState.gym.sessions[0].weekLabel), 'Espalda');
    assert.equal(await page.evaluate(() => window.gymLauncherState.gym.sessions.length), 2);
    assert.equal(await page.evaluate(() => window.gymLauncherSaves), 1);

    await go('unique', theme); const failed = await snapshot();
    await choice().selectOption('routine:espalda'); await page.getByRole('button', { name: 'Usar rutina de hoy: Pecho', exact: true }).click(); await selected('routine:pecho'); await unchanged(failed);
    await page.evaluate(() => { window.gymLauncherFailSave = true; });
    await start().click(); await unchanged(failed); assert.equal(await page.locator('[data-active-workout-view]').count(), 0);
    await page.evaluate(() => { window.gymLauncherFailSave = false; }); await start().click();
    await page.locator('[data-active-workout-view]').waitFor(); assert.equal(await page.evaluate(() => window.gymLauncherState.gym.sessions[0].weekLabel), 'Pecho');

    await go('multiple', theme); const multiple = await snapshot(); await selected(''); assert.equal(await start().isDisabled(), true); await unchanged(multiple);
    assert.equal(await choice().locator('optgroup[label="Rutinas de hoy"] option').count(), 2);
    await choice().selectOption('routine:espalda'); assert.equal(await start().isEnabled(), true); await unchanged(multiple);
    await page.screenshot({ path: `${output}/multiple-${width}-${theme}.png`, fullPage: true });

    await go('conflict', theme); const conflict = await snapshot(); await selected(''); assert.equal(await start().isDisabled(), true);
    await choice().selectOption('routine:pecho'); await unchanged(conflict);
    page.once('dialog', dialog => { assert.match(dialog.message(), /descanso seguirá registrado/); return dialog.dismiss(); });
    await start().click(); await unchanged(conflict);
    page.once('dialog', dialog => dialog.accept()); await start().click(); await page.locator('[data-active-workout-view]').waitFor();
    assert.deepEqual(await page.evaluate(() => window.gymLauncherState.gym.restDays), ['2026-10-30']);
    assert.equal(await page.evaluate(() => window.gymLauncherState.gym.sessions[0].weekLabel), 'Pecho');

    await go('checkout-rest', theme); await selected(''); await page.getByRole('button', { name: 'Cancelar descanso', exact: true }).click(); await selected('routine:pecho');
    assert.equal(await page.evaluate(() => window.gymLauncherState.checkoutLog['2026-10-30'].trainedSkipped), false);
    assert.equal(await page.evaluate(() => window.gymLauncherState.gym.restDays?.length || 0), 0);
    assert.equal(await page.evaluate(() => window.gymLauncherState.gym.sessions.length), 1);
    await go('rest', theme); const rest = await snapshot(); await selected('free'); assert.equal(await start().isEnabled(), true); await unchanged(rest);
    await page.getByRole('button', { name: 'Cancelar descanso', exact: true }).click(); assert.equal(await page.evaluate(() => window.gymLauncherState.gym.restDays.length), 0);

    await go('active', theme); const active = await snapshot(); assert.equal(await page.locator('[data-gym-launcher]').count(), 0);
    await exitActive(); await page.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
    await page.locator('[data-active-workout-view]').waitFor(); await unchanged(active);

    await go('empty-routine', theme); assert.equal(await start().isDisabled(), true);
    await page.getByRole('button', { name: 'Agregar ejercicios a la rutina', exact: true }).click(); await page.locator('[data-gym-routine-editor]').waitFor();
    await go('completed', theme); await page.getByText('Sesión de hoy completada', { exact: true }).waitFor(); await selected('routine:pecho');
    assert.equal(await page.locator('[data-trained]').count(), 1); await page.getByText('1 día entrenado', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/completed-${width}-${theme}.png`, fullPage: true });
    await go('unique', theme);
    const metrics = await page.locator('[data-gym-launcher]').evaluate(root => ({ overflow: document.documentElement.scrollWidth > innerWidth, font: getComputedStyle(root).fontFamily, minHeight: Math.min(...[...root.querySelectorAll('select,button')].map(el => el.getBoundingClientRect().height)), rightGap: root.getBoundingClientRect().right - root.querySelector('[data-gym-start]').getBoundingClientRect().right }));
    assert.equal(metrics.overflow, false); assert.match(metrics.font, /Instrument Sans/); assert.ok(metrics.minHeight >= 44); assert.ok(metrics.rightGap < 30);
    results.push({ width, theme, ...metrics, automaticNoWrites: true, manualChoicePreserved: true, restConflictConfirmation: true, checkoutRestCancelled: true, selectedRoutineStarts: true, activeSessionPreserved: true, calendarRetained: true });
  }

  for (let offset = 0; offset < 7; offset++) for (const state of ['unique', 'none']) {
    const date = new Date('2026-10-26T12:00:00-03:00'); date.setUTCDate(date.getUTCDate() + offset);
    await go(state, 'light', date.toISOString()); const before = await snapshot(); await selected(state === 'unique' ? 'routine:pecho' : 'free'); await unchanged(before);
    assert.equal(await page.locator('[data-trained]').count(), 0);
  }

  await go('unique', 'dark', '2026-10-30T23:59:00-03:00');
  await page.evaluate(() => window.gymLauncherSetState(previous => { const next = structuredClone(previous); next.gym.routineTemplates[1].days = ['sabado']; return next; }));
  await choice().selectOption('free'); const midnight = await snapshot();
  await page.clock.setFixedTime(new Date('2026-10-31T00:01:00-03:00')); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await selected('routine:espalda'); await unchanged(midnight);
  await page.waitForFunction(() => document.querySelector('[data-calendar-date="2026-10-31"]')?.getAttribute('aria-current') === 'date');

  // A context without Playwright's own timezone override lets this CDP session
  // change the real browser timezone while the same application stays mounted.
  const zoneContext = await browser.newContext({ locale: 'es-UY' });
  await zoneContext.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const zonePage = await zoneContext.newPage(); zonePage.on('pageerror', error => errors.push(error.message));
  const cdp = await zoneContext.newCDPSession(zonePage); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Montevideo' });
  await zonePage.clock.setFixedTime(new Date('2026-10-30T00:30:00-03:00'));
  await zonePage.goto(`${origin}/tests/gym-launcher/browser.html?state=unique&theme=light`); await zonePage.locator('[data-gym-launcher]').waitFor();
  await zonePage.evaluate(() => window.gymLauncherSetState(previous => { const next = structuredClone(previous); next.gym.routineTemplates[1].days = ['jueves']; return next; }));
  await zonePage.locator('#gym-routine-choice').selectOption('free');
  const timezone = await zonePage.evaluate(() => JSON.stringify(window.gymLauncherState));
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Pacific/Honolulu' });
  await zonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await zonePage.waitForFunction(() => document.querySelector('#gym-routine-choice')?.value === 'routine:espalda');
  assert.equal(await zonePage.evaluate(() => JSON.stringify(window.gymLauncherState)), timezone);
  await zonePage.locator('#gym-routine-choice').selectOption('free'); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Montevideo' });
  await zonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await zonePage.waitForFunction(() => document.querySelector('#gym-routine-choice')?.value === 'routine:pecho');
  assert.equal(await zonePage.evaluate(() => JSON.stringify(window.gymLauncherState)), timezone); assert.equal(await zonePage.evaluate(() => window.gymLauncherSaves), 0);
  await cdp.detach(); await zoneContext.close();
  const ticking = await context.newPage(); ticking.on('pageerror', error => errors.push(error.message));
  await ticking.clock.install({ time: new Date('2026-10-30T22:00:00-03:00') });
  await ticking.clock.pauseAt(new Date('2026-10-30T23:59:59.900-03:00'));
  await ticking.goto(`${origin}/tests/gym-launcher/browser.html?state=unique&theme=dark`);
  await ticking.locator('[data-gym-launcher]').waitFor();
  await ticking.evaluate(() => window.gymLauncherSetState(previous => { const next = structuredClone(previous); next.gym.routineTemplates[1].days = ['sabado']; return next; }));
  assert.equal(await ticking.locator('#gym-routine-choice').inputValue(), 'routine:pecho');
  await ticking.clock.runFor(250);
  await ticking.waitForFunction(() => document.querySelector('#gym-routine-choice')?.value === 'routine:espalda');
  assert.equal(await ticking.evaluate(() => window.gymLauncherSaves), 0); await ticking.close();
  assert.deepEqual(errors, []); await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, sevenDaysWithAndWithoutRoutine: 14, localMidnight: true, midnightTimerWithoutFocus: true, timezoneChange: true, errors }, null, 2));
  console.log(`PASS: ${results.length} responsive/theme scenarios; 14 weekday cases; manual choices, starts, rests, active recovery, midnight/timezone, zero automatic writes.`);
} catch (error) { await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, errors }, null, 2)); throw error; }
finally { await browser.close(); }
