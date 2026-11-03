import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { defaultState } from '../src/lib/storage.ts';

// Run after a normal build with explicit demo Firebase environment variables.
// Fresh contexts, no credentials, no service worker and every external request blocked.
const root = path.resolve('dist'), output = process.env.GYM_APP_OUTPUT || 'artifacts/gym-refinement/app';
await fs.mkdir(output, { recursive: true });
const chunks = await Promise.all((await fs.readdir(path.join(root, 'assets'))).filter(file => file.endsWith('.js')).map(file => fs.readFile(path.join(root, 'assets', file), 'utf8')));
assert.ok(chunks.some(source => /VITE_FIREBASE_PROJECT_ID["']?\s*:\s*["']demo-lifeos["']/.test(source)), 'This harness requires a verifiable demo build');
assert.ok(chunks.every(source => !/gymRefinementState|tests\/gym-refinement/.test(source)), 'Synthetic fixtures must not enter the production build');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    let file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    assert.ok(file === root || file.startsWith(root + path.sep)); if (!path.extname(file)) file = path.join(root, 'index.html');
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(await fs.readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
const results = [], errors = [], blocked = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844], [375, 812]]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); blocked.push(route.request().url()); return route.abort(); });
    const state = defaultState(); state.settings.onboardingCompleted = true; state.settings.hiddenTabs = []; state.settings.darkMode = theme === 'dark';
    state.gym.sessions = [{ id: 'synthetic-active', date: '2026-11-02', status: 'active', weekLabel: 'Torso · sesión sintética', startedAt: '18:30', exercises: [
      { id: 'bench', name: 'Press banca plano', equipment: 'barra', barWeight: 20, sets: [{ id: 'first', weight: 70, reps: 8, completed: false }, { id: 'second', weight: 70, reps: 8, completed: false }] },
      { id: 'row', name: 'Remo en polea baja', equipment: 'polea', sets: [{ id: 'row-set', weight: 45, reps: 10, completed: false }] },
    ] }];
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-02T18:35:00-03:00'));
    await page.addInitScript(value => {
      if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(value));
      localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
    }, state);
    await page.goto(`${origin}/?view=gimnasio`); await page.locator('[data-active-workout-view]').waitFor();
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    const cta = page.getByRole('button', { name: /^Completar serie 1/ }); await cta.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${width}-${theme}-hit-test.png` });
    const hit = await cta.evaluate(el => { const r = el.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const points = [[r.x + r.width / 2, r.y + 4], [r.x + r.width / 2, r.bottom - 4], [r.x + 4, r.y + r.height / 2], [r.right - 4, r.y + r.height / 2]]; return { height: r.height, y: r.y, x: r.x, width: r.width, viewport: innerHeight, covered: !el.contains(at) || points.some(([x, y]) => !el.contains(document.elementFromPoint(x, y))), at: at?.outerHTML.slice(0, 1400) }; });
    await fs.writeFile(`${output}/last-hit.json`, JSON.stringify({ width, theme, hit }, null, 2));
    assert.ok(hit.height >= 44 && !hit.covered, JSON.stringify(hit));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/${width}-${theme}-active.png`, fullPage: true });
    await cta.click(); await page.getByRole('button', { name: 'Pausar descanso', exact: true }).click();
    const saved = await snapshot(); assert.equal(saved.sessions[0].exercises[0].sets[0].completed, true); assert.equal(saved.activeTimer.sessionId, 'synthetic-active');
    await page.reload(); await page.locator('[data-active-workout-view]').waitFor();
    const restored = await snapshot(); assert.equal(restored.activeTimer.endsAt, saved.activeTimer.endsAt); assert.equal(restored.activeTimer.exerciseId, 'bench'); assert.equal(restored.activeTimer.remainingSecondsWhenPaused, saved.activeTimer.remainingSecondsWhenPaused);
    await page.getByRole('button', { name: 'Ejercicio siguiente', exact: true }).click();
    assert.equal((await snapshot()).activeTimer.exerciseId, 'bench'); await page.getByText(/Descanso de Press banca plano/).waitFor();
    await page.screenshot({ path: `${output}/${width}-${theme}-rest-source.png`, fullPage: true });
    if (width === 375 && theme === 'dark') {
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: 'Ajustes de descanso', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.getByLabel('Descanso entre series', { exact: true }).fill('105');
      await page.evaluate(() => { const original = Storage.prototype.setItem; window.gymRestoreStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function (key, value) { if (key === 'lifeos-state-v1') throw new DOMException('Synthetic storage failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
      await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await dialog.getByRole('alert').waitFor();
      const save = dialog.getByRole('button', { name: 'Guardar cambios', exact: true }); await save.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${width}-${theme}-settings-error.png` });
      const safe = await save.evaluate(el => { const r = el.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { covered: !el.contains(at), at: at?.outerHTML.slice(0, 1000) }; });
      await fs.writeFile(`${output}/modal-hit.json`, JSON.stringify(safe, null, 2)); assert.equal(safe.covered, false, JSON.stringify(safe));
      const switchHit = await dialog.getByRole('switch', { name: 'Descanso automático', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
      assert.ok(switchHit, 'the error toast must not cover the rest controls');
      assert.equal(await dialog.getByLabel('Descanso entre series', { exact: true }).inputValue(), '105');
      await page.evaluate(() => window.gymRestoreStorage()); await save.click(); await dialog.waitFor({ state: 'hidden' });
    }
    results.push({ width, height, theme, fixedNavigationDoesNotCoverCTA: true, noOverflow: true, completedSetRestored: true, pausedTimerRestoredExactly: true, navigationKeepsRestSource: true });
    await context.close();
  }
  assert.deepEqual(errors, []); await fs.writeFile(`${output}/results.json`, JSON.stringify({ demoBuild: true, results, errors, blocked }, null, 2));
  console.log(`PASS: ${results.length} built-app cases, fixed controls, set and paused timer reload, rest source, both themes.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
