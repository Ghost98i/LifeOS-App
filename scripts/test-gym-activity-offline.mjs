import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { defaultState } from '../src/lib/storage.ts';

// Run with: node --import tsx scripts/test-gym-activity-offline.mjs
// Isolated local build and browser storage only; never connects to production.
const output = process.env.GYM_CALENDAR_OUTPUT || 'artifacts/gimnasio-calendario-20261029/offline';
await fs.mkdir(output, { recursive: true });
const root = path.resolve('dist');
const index = await fs.readFile(path.join(root, 'index.html'));
const fingerprint = crypto.createHash('sha256').update(index).digest('hex');
const sw = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
assert.match(sw, /assets\/GimnasioView-[^"\s]+\.js/);
const publicFiles = [];
for (const file of await fs.readdir(root, { recursive: true })) {
  if (!(await fs.stat(path.join(root, file))).isFile()) continue;
  publicFiles.push(file);
  if (/\.(?:html|js|css)$/.test(file)) assert.doesNotMatch(await fs.readFile(path.join(root, file), 'utf8'), /gymFixture|tests\/gym-calendar/, 'Test fixtures must not ship in dist');
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__test') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Local test</title>'); return; }
    let file = path.resolve(root, `.${pathname}`);
    assert.ok(file.startsWith(root + path.sep) || file === root);
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await fs.readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
assert.equal(crypto.createHash('sha256').update(Buffer.from(await (await fetch(origin)).arrayBuffer())).digest('hex'), fingerprint);
const browser = process.env.CHROME_PATH
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const results = []; const errors = [];
const session = (id, date) => ({ id, date, status: 'completed', weekLabel: id === 'old' ? 'Sesión histórica' : 'Fuerza', startedAt: '18:30', finishedAt: '19:10', exercises: [{ id: 'press', name: 'Press', equipment: 'mancuerna', sets: [{ id: `set-${id}`, weight: 12, reps: 10, completed: true }] }] });
try {
  for (const [width, height] of [[1920, 1080], [2560, 1440], [768, 1024], [390, 844], [375, 812]]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-29T12:00:00-03:00'));
    const state = defaultState(); state.settings.darkMode = theme === 'dark'; state.settings.hiddenTabs = []; state.settings.onboardingCompleted = true;
    state.gym.sessions = [session('a', '2026-10-29'), session('b', '2026-10-29'), session('monday', '2026-10-26'), session('old', '2024-01-31')];
    await page.goto(`${origin}/__test`);
    await page.evaluate(value => { localStorage.setItem('lifeos-state-v1', JSON.stringify(value)); localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1'); }, state);
    await page.goto(`${origin}/?view=gimnasio`);
    await page.locator('.gym-activity-calendar').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.locator('.gym-activity-calendar').waitFor();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
    assert.ok(cached.some(url => /assets\/GimnasioView-.*\.js/.test(url)));
    assert.ok(cached.some(url => /assets\/index-.*\.css/.test(url)));
    await context.setOffline(true); await page.reload();
    await page.locator('.gym-activity-calendar').waitFor(); await page.getByText('2 días entrenados', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-trained]').count(), 2);
    assert.equal(await page.getByRole('button', { name: 'Iniciar otro entrenamiento', exact: true }).isVisible(), true);
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark');
    await page.getByLabel('Mes del calendario', { exact: true }).fill('2024-01');
    await page.locator('[data-calendar-date="2024-01-31"]').click();
    await page.locator('[data-open-calendar-session="old"]').click();
    const old = page.locator('[data-gym-history-session="old"]'); await old.waitFor({ state: 'visible' });
    assert.equal(await old.locator('[data-latest-session-detail]').isVisible(), true);
    await page.getByRole('button', { name: 'Entrenar', exact: true }).click();
    assert.equal(await page.getByLabel('Mes del calendario', { exact: true }).inputValue(), '2024-01');
    await page.locator('.gym-activity-calendar').getByRole('button', { name: 'Hoy', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym), stored);
    const metrics = await page.locator('.gym-activity-calendar').evaluate(el => ({ font: getComputedStyle(el).fontFamily, overflow: document.documentElement.scrollWidth > innerWidth, minDayWidth: Math.min(...[...el.querySelectorAll('[data-calendar-date]')].map(button => button.getBoundingClientRect().width)), minDayHeight: Math.min(...[...el.querySelectorAll('[data-calendar-date]')].map(button => button.getBoundingClientRect().height)) }));
    assert.equal(metrics.overflow, false); assert.ok(metrics.minDayHeight >= 44); assert.ok(metrics.minDayWidth >= 44); assert.match(metrics.font, /Instrument Sans/);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/app-${width}-${theme}.png`, fullPage: true });
    results.push({ width, theme, ...metrics, offlineReload: true, archivedSessionOffline: true, navigationPreservesStoredGym: true, swControlsPage: true, precachedGymChunk: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ fingerprint, publicFileCount: publicFiles.length, noTestFixturesInBuild: true, results, errors }, null, 2));
  console.log(`PASS: ${results.length} built-app scenarios, offline reload/archive, Service Worker, local data unchanged, both themes, no overflow.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
