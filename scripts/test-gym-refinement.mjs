import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const phase = process.env.GYM_PHASE || 'after';
const output = process.env.GYM_OUTPUT || `artifacts/gym-refinement/${phase}`;
const port = process.env.GYM_TEST_PORT || '5341';
const origin = `http://127.0.0.1:${port}`;
await fs.mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(process.env.GYM_ROOT ? [process.env.GYM_ROOT, '--config', path.resolve('vite.config.ts')] : []), '--mode', 'portable', '--host', '127.0.0.1', '--port', port, '--strictPort'], { stdio: 'pipe', env: { ...process.env, DISABLE_HMR: 'true' } });
let serverLog = ''; server.stdout.on('data', chunk => serverLog += chunk); server.stderr.on('data', chunk => serverLog += chunk);
let browser;
const results = [], errors = [], external = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 300)); }
  assert.ok(ready, serverLog);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  for (const [width, height] of [[1440, 900], [390, 844], [375, 812]]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-02T18:35:00-03:00'));
    const go = async state => {
      await page.goto(`${origin}/tests/gym-refinement/browser.html?state=${state}&theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('[data-active-workout-view], [data-gym-launcher]').first().waitFor();
      assert.equal(await page.evaluate(() => window.gymRefinementCloudConfigured), false);
      await page.evaluate(() => document.fonts.ready);
    };
    const shot = async label => {
      await page.screenshot({ path: `${output}/${width}-${theme}-${label}.png`, fullPage: true });
      if (phase === 'after') assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: page overflow`);
    };
    const metrics = async label => {
      const measurement = await page.evaluate(() => {
        const rect = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; };
        return { overflow: document.documentElement.scrollWidth > innerWidth, header: rect('.c-header-card'), stage: rect('.c-stage-card'), cta: rect('.c-primary-cta'), small: [...document.querySelectorAll('button,input,select,summary')].filter(el => el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)')).map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 70), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(r => r.width < 44 || r.height < 44) };
      });
      results.push({ width, height, theme, state: label, ...measurement });
      if (phase === 'after') assert.equal(measurement.overflow, false, `${label} ${width} overflow`);
    };
    for (const scenario of ['active', 'rest', 'minimized', 'empty', 'routines', 'history', 'progress']) {
      await go(['routines', 'history', 'progress'].includes(scenario) ? 'idle' : scenario);
      if (scenario === 'routines') await page.getByRole('button', { name: 'Rutinas', exact: true }).click();
      if (scenario === 'history') await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Historial/ }).click();
      if (scenario === 'progress') await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Progres/ }).click();
      await shot(scenario); await metrics(scenario);
    }
    if (phase === 'before' && width === 1440 && theme === 'light') {
      const observed = {};
      await go('active');
      await page.evaluate(() => window.gymRefinementSetState(previous => ({ ...previous, gym: { ...previous.gym, activeTimer: { sessionId: 'active', exerciseId: 'bench', setId: 'warmup', exerciseIndex: 0, kind: 'set', durationSeconds: 90, endsAt: Date.now() + 90000, pausedAt: Date.now(), remainingSecondsWhenPaused: 90 } } })));
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      observed.rejectedFinish = await page.evaluate(() => ({ status: window.gymRefinementState.gym.sessions[0].status, timer: window.gymRefinementState.gym.activeTimer }));
      await go('empty'); await page.getByRole('button', { name: 'Crear primera rutina', exact: true }).click();
      await page.getByLabel('Nombre de la nueva rutina').fill('Rutina sin guardar');
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await page.getByRole('button', { name: 'Crear rutina', exact: true }).click();
      observed.rejectedRoutine = { value: await page.getByLabel('Nombre de la nueva rutina').inputValue(), records: await page.evaluate(() => window.gymRefinementState.gym.routineTemplates.length), falseSuccess: (await page.locator('body').innerText()).includes('Plantilla creada.') };
      await page.goto(`${origin}/tests/gym-refinement/browser.html?state=idle&theme=light&privacy=on`);
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: 'Progreso', exact: true }).click();
      await page.getByRole('button', { name: /Peso y composición corporal/ }).click();
      const health = page.locator('#gym-body-health');
      observed.privacy = { valuesStillInDOM: /82\.4|91\.7/.test(await health.textContent()), blurredSection: await health.locator('.privacy-sensitive').last().evaluate(el => getComputedStyle(el).filter) };
      await health.getByRole('button', { name: /Registrar medición/ }).click();
      await health.getByLabel('Peso (kg)', { exact: true }).fill('82.7'); await health.getByLabel('Cintura (cm)', { exact: true }).fill('92.2');
      await page.evaluate(() => { window.gymRefinementFailSave = true; }); await health.getByRole('button', { name: 'Guardar medición', exact: true }).click();
      observed.rejectedMeasurement = { formClosed: await health.getByLabel('Peso (kg)', { exact: true }).count() === 0, records: await page.evaluate(() => window.gymRefinementState.gym.weight.length), falseSuccess: (await health.innerText()).includes('Guardado') };
      await fs.writeFile(`${output}/defects.json`, JSON.stringify(observed, null, 2));
    }
    if (phase === 'after') {
      const state = () => page.evaluate(() => structuredClone(window.gymRefinementState));
      const actions = () => page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true });
      const tabs = () => page.getByRole('navigation', { name: 'Secciones de Gimnasio' });
      const focusTrapped = async dialog => {
        const buttons = dialog.locator('button:visible');
        await buttons.last().focus(); await page.keyboard.press('Tab');
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
        await buttons.first().focus(); await page.keyboard.press('Shift+Tab');
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      };
      await go('active'); const history = (await state()).gym.sessions.slice(1);
      const editor = page.locator('[data-active-workout-view]');
      const controls = await editor.locator('button:visible, summary:visible').evaluateAll(items => items.map(el => ({ name: el.getAttribute('aria-label') || el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
      assert.deepEqual(controls.filter(item => item.width < 44 || item.height < 44), [], 'active session touch controls');
      const contrast = await page.locator('.c-primary-cta, .c-warmup-pill, .c-copy-link, .c-load-label, .c-load-unit').evaluateAll(elements => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const context = canvas.getContext('2d');
        const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); const v = [...context.getImageData(0, 0, 1, 1).data]; return [...v.slice(0, 3), v[3] / 255]; };
        const over = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return alpha ? [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha) : [0, 0, 0, 0]; };
        const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        return elements.map(el => { let background = [0, 0, 0, 0]; for (let node = el; node; node = node.parentElement) background = over(background, rgba(getComputedStyle(node).backgroundColor)); background = over(background, [255, 255, 255, 1]); const text = luminance(over(rgba(getComputedStyle(el).color), background)), bg = luminance(background); return { text: el.textContent.trim(), ratio: (Math.max(text, bg) + .05) / (Math.min(text, bg) + .05) }; });
      });
      assert.ok(contrast.every(item => item.ratio >= 4.5), JSON.stringify(contrast));
      const copy = page.getByRole('button', { name: 'Copiar', exact: true });
      await copy.scrollIntoViewIfNeeded();
      assert.ok(await copy.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
      assert.ok(await page.locator('.c-prev-best-pill').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.getByRole('button', { name: 'Historial del ejercicio', exact: true }).click();
      const historyDialog = page.getByRole('dialog'); await historyDialog.waitFor(); await focusTrapped(historyDialog);
      assert.ok((await historyDialog.innerText()).includes(' kg'));
      await shot('exercise-history'); await page.keyboard.press('Escape');
      assert.ok(await page.getByRole('button', { name: 'Historial del ejercicio', exact: true }).evaluate(el => el === document.activeElement));
      await copy.click(); assert.equal((await state()).gym.sessions[0].exercises[0].sets[0].weight, 37.5);
      await page.getByLabel('Peso en kilogramos', { exact: true }).fill('42.5');
      await page.getByLabel('Repeticiones', { exact: true }).fill('11');
      await page.getByRole('button', { name: /^Completar serie 1/ }).click();
      let current = await state();
      assert.equal(current.gym.sessions[0].exercises[0].sets[0].completed, true);
      assert.equal(current.gym.activeTimer.sessionId, 'active'); assert.equal(current.gym.activeTimer.exerciseId, 'bench');
      await page.getByRole('button', { name: 'Pausar descanso', exact: true }).click();
      const remaining = (await state()).gym.activeTimer.remainingSecondsWhenPaused;
      await page.getByRole('button', { name: 'Sumar 30 segundos', exact: true }).click();
      assert.equal((await state()).gym.activeTimer.remainingSecondsWhenPaused, remaining + 30);
      await page.getByRole('button', { name: 'Restar 30 segundos', exact: true }).click();
      await page.getByRole('button', { name: 'Ejercicio siguiente', exact: true }).click();
      assert.equal((await state()).gym.activeTimer.exerciseId, 'bench');
      await page.getByText(/Descanso de Press banca plano con barra/).waitFor();
      await page.getByRole('button', { name: 'Ver descanso', exact: true }).click();
      await page.getByRole('button', { name: /^Revisar o corregir Serie 1/ }).click();
      await page.getByLabel('Peso en kilogramos', { exact: true }).fill('45');
      await page.getByRole('button', { name: /^Serie 1 completada/ }).click();
      assert.equal((await state()).gym.sessions[0].exercises[0].sets[0].completed, false);
      assert.deepEqual((await state()).gym.sessions.slice(1), history);
      await page.evaluate(() => window.gymRefinementSetState(previous => ({ ...previous, gym: { ...previous.gym, activeTimer: { sessionId: 'active', exerciseId: 'bench', setId: 'warmup', exerciseIndex: 0, kind: 'set', durationSeconds: 90, endsAt: Date.now() + 90000, pausedAt: Date.now(), remainingSecondsWhenPaused: 90 } } })));
      const invalidTimer = (await state()).gym.activeTimer;
      await actions().click(); await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      assert.deepEqual((await state()).gym.activeTimer, invalidTimer, 'rejected finalization retains the timer');
      assert.equal((await state()).gym.sessions[0].status, 'active');
      await actions().click();
      await page.getByRole('button', { name: /Comenzar Serie 1 Ahora/ }).click();
      await page.getByRole('button', { name: /^Serie 2:/ }).click();
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await page.getByRole('button', { name: /^Completar serie 2/ }).click();
      assert.equal((await state()).gym.sessions[0].exercises[0].sets[1].completed, false);
      assert.equal(await page.getByRole('button', { name: /^Serie 2:/ }).getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => { window.gymRefinementFailSave = false; });
      await page.getByRole('button', { name: /^Serie 2:/ }).click();
      await page.getByRole('button', { name: /^Completar serie 2/ }).click();
      await actions().click(); await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      const summary = page.getByRole('dialog'); await summary.waitFor(); await focusTrapped(summary); await shot('completed');
      current = await state(); assert.equal(current.gym.sessions[0].status, 'completed'); assert.equal(current.gym.activeTimer, null);
      assert.equal(current.gym.sessions.length, 13); assert.deepEqual(current.gym.sessions.slice(1), history);
      await page.keyboard.press('Escape'); assert.ok(await page.locator('#gym-routine-choice').evaluate(el => el === document.activeElement));

      await go('idle'); await tabs().getByRole('button', { name: 'Rutinas', exact: true }).click();
      await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
      const routineEditor = page.locator('[data-gym-routine-editor]');
      const beforeAppearance = (await state()).gym.sessions;
      await routineEditor.getByRole('radio', { name: 'Brazos', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates[0].appearance.icon, 'gym-dumbbell');
      await routineEditor.getByRole('radio', { name: 'Brazos', exact: true }).dispatchEvent('keydown', { key: 'ArrowRight', altKey: true });
      assert.equal((await state()).gym.routineTemplates[0].appearance.icon, 'gym-dumbbell');
      await page.keyboard.press('ArrowRight'); assert.equal((await state()).gym.routineTemplates[0].appearance.icon, 'gym-shoulder-press');
      await page.getByLabel(/^Más acciones para Torso/).click();
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await page.getByRole('button', { name: 'Duplicar rutina', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates.length, 2);
      assert.doesNotMatch(await page.locator('body').innerText(), /Rutina duplicada\./);
      await page.evaluate(() => { window.gymRefinementFailSave = false; });
      await page.getByRole('button', { name: 'Duplicar rutina', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates.at(-1).appearance.icon, 'gym-shoulder-press');
      await routineEditor.getByRole('button', { name: 'Automático', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates.at(-1).appearance, undefined);
      assert.equal((await state()).gym.routineTemplates[0].appearance.icon, 'gym-shoulder-press');
      assert.deepEqual((await state()).gym.sessions, beforeAppearance);
      await routineEditor.getByLabel('Nombre del ejercicio de la rutina', { exact: true }).fill('Ejercicio sin guardar');
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await routineEditor.getByRole('button', { name: 'Agregar', exact: true }).click();
      assert.equal(await routineEditor.getByLabel('Nombre del ejercicio de la rutina', { exact: true }).inputValue(), 'Ejercicio sin guardar');
      assert.equal((await state()).gym.routineTemplates.at(-1).exercises.length, 3);
      await page.evaluate(() => { window.gymRefinementFailSave = false; });
      await routineEditor.getByRole('button', { name: 'Agregar', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates.at(-1).exercises.length, 4);
      assert.deepEqual((await state()).gym.sessions, beforeAppearance);
      await shot('routine-editor');
      await page.getByRole('button', { name: 'Descansos', exact: true }).click();
      const settings = page.getByRole('dialog'); await settings.waitFor(); await focusTrapped(settings);
      await settings.getByLabel('Descanso entre series', { exact: true }).fill('105');
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await settings.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await settings.getByRole('alert').waitFor(); assert.equal(await settings.getByLabel('Descanso entre series', { exact: true }).inputValue(), '105');
      await page.evaluate(() => { window.gymRefinementFailSave = false; });
      await settings.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      assert.equal((await state()).gym.settings.restBetweenSetsSeconds, 105);

      await go('empty'); await page.getByRole('button', { name: 'Crear primera rutina', exact: true }).click();
      await page.getByLabel('Nombre de la nueva rutina', { exact: true }).fill('Primera rutina sintética');
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await page.getByRole('button', { name: 'Crear rutina', exact: true }).click();
      assert.equal(await page.getByLabel('Nombre de la nueva rutina', { exact: true }).inputValue(), 'Primera rutina sintética');
      assert.equal((await state()).gym.routineTemplates.length, 0);
      await page.evaluate(() => { window.gymRefinementFailSave = false; });
      await page.getByRole('button', { name: 'Crear rutina', exact: true }).click();
      assert.equal((await state()).gym.routineTemplates.length, 1);
      assert.ok(await page.getByRole('button', { name: 'Rutina sin ejercicios: Primera rutina sintética', exact: true }).isDisabled());

      await page.goto(`${origin}/tests/gym-refinement/browser.html?state=idle&theme=${theme}&privacy=on`);
      await tabs().getByRole('button', { name: 'Progreso', exact: true }).click();
      await page.getByRole('button', { name: /Peso y composición corporal/ }).click();
      const health = page.locator('#gym-body-health'); await page.locator('[data-gym-body-composition]').waitFor();
      const scan = () => health.evaluate(root => root.textContent + [...root.querySelectorAll('*')].flatMap(el => [...el.attributes].map(a => a.value)).join(' '));
      assert.doesNotMatch(await scan(), /82\.4|83\.1|91\.7/, 'body values must not leak in DOM or attributes');
      await health.getByRole('button', { name: 'Revelar importe', exact: true }).first().click();
      assert.match(await scan(), /82\.4/);
      await page.evaluate(() => window.gymRefinementSetState(previous => ({ ...previous, settings: { ...previous.settings, privacyMode: false } })));
      await page.locator('[data-gym-body-composition]').getByText('91.7 cm cintura', { exact: true }).waitFor();
      assert.match(await scan(), /91\.7/);
      await page.locator('[data-gym-body-composition]').getByRole('button', { name: /Registrar medición/ }).click();
      const body = page.locator('[data-gym-body-composition]');
      await body.getByLabel('Peso (kg)', { exact: true }).fill('82.7'); await body.getByLabel('Cintura (cm)', { exact: true }).fill('92.2');
      await page.evaluate(() => { window.gymRefinementFailSave = true; });
      await body.getByRole('button', { name: /Guardar/ }).click(); await body.getByRole('alert').waitFor();
      assert.equal(await body.getByLabel('Peso (kg)', { exact: true }).inputValue(), '82.7');
      assert.equal((await state()).gym.weight.length, 2);
      await page.evaluate(() => { window.gymRefinementFailSave = false; }); await body.getByRole('button', { name: /Guardar/ }).click();
      assert.equal((await state()).gym.weight.length, 3); await shot('body-composition');

      await go('icons'); await page.getByRole('region', { name: 'Catálogo de prueba' }).waitFor(); await shot('icons');
      await page.route('**/gym-icons/v1/bench-press.svg', route => route.fulfill({ status: 404, body: '' }));
      await go('active'); await page.locator('.c-art-badge [data-gym-icon="gym-fallback"]').waitFor();
      results.push({ width, theme, contrast, interactions: 'set edit/copy/complete/correct/unmark, rest pause/adjust/source, invalid finish, save failure/retry, valid finish, dialog keyboard, routine icons/duplicate/auto, settings failure/retry, creation failure/retry, privacy DOM/reveal/off, body measurement failure/retry, missing SVG fallback', passed: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, errors, external, isolatedFixture: 'GimnasioView directly, storageUserId null, no App/auth/Firebase, portable Vite, fresh contexts, external requests blocked' }, null, 2));
  console.log(JSON.stringify({ phase, cases: results.length, errors, externalRequestsBlocked: external.length }));
} finally { await browser?.close(); server.kill(); await fs.writeFile(`${output}/server.log`, serverLog); }
