import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { defaultState, normalizeStoredState } from '../src/lib/storage.ts';

// node --import tsx scripts/test-agenda-consistency-build.mjs
// Only an isolated browser profile with synthetic data and a loopback server.
const output = 'artifacts/agenda-consistencia-20261030/build-flows';
await fs.mkdir(output, { recursive: true });
const root = path.resolve('dist');
const fingerprint = crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'index.html'))).digest('hex');
for (const file of await fs.readdir(root, { recursive: true })) {
  if (/\.(?:js|css|html)$/.test(file)) assert.doesNotMatch(await fs.readFile(path.join(root, file), 'utf8'), /agendaFixture|synthetic-medusa-task|tests\/agenda-consistency/);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__test') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Test</title>'); return; }
    let file = path.resolve(root, `.${pathname}`);
    assert.ok(file === root || file.startsWith(root + path.sep));
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await fs.readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = []; const errors = [];
try {
  for (const width of [1920, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1080 }, locale: 'es-UY', timezoneId: 'America/Montevideo' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-30T12:00:00-03:00'));
    const raw = defaultState(); raw.settings.hiddenTabs = []; raw.settings.onboardingCompleted = true;
    raw.todayExtras = [{ id: 'synthetic-medusa-task', date: '2026-10-30', text: 'gaste 5000 en la medusa', done: false, priority: 'media' }];
    const state = JSON.parse(JSON.stringify(normalizeStoredState(raw)));
    await page.goto(`${origin}/__test`);
    await page.evaluate(value => { localStorage.setItem('lifeos-state-v1', JSON.stringify(value)); localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1'); }, state);
    const original = () => page.locator('#today-extra-synthetic-medusa-task');
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
    await page.goto(`${origin}/?view=dashboard`); await original().waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await original().waitFor();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
    const before = await stored();
    await original().getByRole('button', { name: 'gaste 5000 en la medusa Tarea', exact: true }).click();
    const projected = page.locator('#agenda-task-extra-synthetic-medusa-task-2026-10-30');
    await projected.waitFor({ state: 'visible' }); assert.equal(await projected.count(), 1);
    await projected.getByRole('button', { name: 'Abrir tarea: gaste 5000 en la medusa', exact: true }).click(); await original().waitFor({ state: 'visible' });
    await page.goto(`${origin}/?view=calendario`);
    await page.getByRole('button', { name: 'gaste 5000 en la medusa Tarea programada', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir tarea original', exact: true }).click(); await original().waitFor({ state: 'visible' });
    await page.goto(`${origin}/?view=dashboard`); await original().waitFor({ state: 'visible' });
    await context.setOffline(true); await page.reload(); await original().waitFor({ state: 'visible' });
    await original().getByRole('button', { name: 'gaste 5000 en la medusa Tarea', exact: true }).click(); await projected.waitFor({ state: 'visible' });
    await projected.getByRole('button', { name: 'Abrir tarea: gaste 5000 en la medusa', exact: true }).click(); await original().waitFor({ state: 'visible' });
    assert.deepEqual(await stored(), before);
    await page.screenshot({ path: `${output}/offline-original-${width}.png`, fullPage: true });
    results.push({ width, realAppNavigation: true, originalIdentity: true, serviceWorkerControlled: true, offlineReloadAndNavigation: true, persistedStateUnchanged: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ fingerprint, results, errors }, null, 2));
  console.log(`PASS: ${results.length} real-build scenarios, App navigation, SW/offline, persisted state unchanged.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
