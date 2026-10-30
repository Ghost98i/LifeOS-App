import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { defaultState, normalizeStoredState } from '../src/lib/storage.ts';

// node --import tsx scripts/test-gym-launcher-offline.mjs
// Real local build, isolated synthetic storage, no external requests.
const output = process.env.GYM_LAUNCHER_OUTPUT || 'artifacts/gimnasio-inicio-contextual-20261030/offline';
await fs.mkdir(output, { recursive: true });
const root = path.resolve('dist'); const index = await fs.readFile(path.join(root, 'index.html'));
const fingerprint = crypto.createHash('sha256').update(index).digest('hex');
for (const file of await fs.readdir(root, { recursive: true })) if (/\.(?:js|html|css)$/.test(file)) assert.doesNotMatch(await fs.readFile(path.join(root, file), 'utf8'), /gymFixture|gymLauncherState|tests\/gym-(?:calendar|launcher)/, 'Build must exclude test fixtures');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__test') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Local test</title>'); return; }
    let file = path.resolve(root, `.${pathname}`); assert.ok(file === root || file.startsWith(root + path.sep));
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await fs.readFile(file); response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
assert.equal(crypto.createHash('sha256').update(Buffer.from(await (await fetch(origin)).arrayBuffer())).digest('hex'), fingerprint);
const browser = process.env.CHROME_PATH ? await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true }) : await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const results = []; const errors = [];
try {
  for (const width of [1920, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1080 }, locale: 'es-UY', timezoneId: 'America/Montevideo' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-30T12:00:00-03:00'));
    const raw = defaultState(); raw.settings.darkMode = theme === 'dark'; raw.settings.hiddenTabs = []; raw.settings.onboardingCompleted = true;
    raw.gym.routineTemplates = [{ id: 'pecho', name: 'Pecho', days: ['viernes'], exercises: [{ id: 'press', name: 'Press banca', equipment: 'barra', sets: [{ id: 'target', weight: 40, reps: 8, completed: false }] }] }];
    raw.gym.sessions = [{ id: 'old', date: '2024-01-31', status: 'completed', weekLabel: 'Sesión histórica', startedAt: '18:00', finishedAt: '19:00', exercises: [{ id: 'row', name: 'Remo', equipment: 'mancuerna', sets: [{ id: 'old-set', weight: 20, reps: 8, completed: true }] }] }];
    const state = JSON.parse(JSON.stringify(normalizeStoredState(raw)));
    await page.goto(`${origin}/__test`); await page.evaluate(value => { localStorage.setItem('lifeos-state-v1', JSON.stringify(value)); localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1'); }, state);
    await page.goto(`${origin}/?view=gimnasio`); await page.locator('[data-gym-launcher]').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.locator('[data-gym-launcher]').waitFor();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
    const storedGym = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    assert.deepEqual(storedGym, state.gym);
    await context.setOffline(true); await page.reload(); await page.locator('[data-gym-launcher]').waitFor();
    assert.equal(await page.locator('#gym-routine-choice').inputValue(), 'routine:pecho');
    assert.equal(await page.locator('[data-gym-start]').innerText(), 'Iniciar Pecho'); assert.equal(await page.locator('[data-trained]').count(), 0);
    await page.locator('#gym-routine-choice').selectOption('free'); await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Historial/ }).click();
    await page.getByRole('button', { name: 'Entrenar', exact: true }).click(); assert.equal(await page.locator('#gym-routine-choice').inputValue(), 'free');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym), storedGym);
    await page.locator('#gym-routine-choice').selectOption('routine:pecho');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${output}/prepared-${width}-${theme}.png`, fullPage: true });
    await page.locator('[data-gym-start]').click(); await page.locator('[data-active-workout-view]').waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lifeos-state-v1'))?.gym.sessions.some(session => session.status === 'active'));
    const gym = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    assert.equal(gym.sessions.length, 2); assert.equal(gym.sessions[0].weekLabel, 'Pecho'); assert.equal(gym.sessions[0].date, '2026-10-30'); assert.deepEqual(gym.sessions[1], storedGym.sessions[0]);
    await page.reload(); await page.locator('[data-active-workout-view]').waitFor(); assert.equal(await page.locator('[data-gym-launcher]').count(), 0);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    assert.deepEqual(restored, gym); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    results.push({ width, theme, offlineReload: true, automaticSelectionNoWrites: true, manualChoiceKeptAcrossTabs: true, startsSelectedRoutineOffline: true, historicalSessionUnchanged: true, activeRestoredAfterOfflineReload: true });
    await context.close();
  }
  assert.deepEqual(errors, []); await fs.writeFile(`${output}/results.json`, JSON.stringify({ fingerprint, results, errors }, null, 2)); console.log(`PASS: ${results.length} real-build offline scenarios, contextual start, no automatic writes, history retained, active session restored.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
