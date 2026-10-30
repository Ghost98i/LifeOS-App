import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';

const phase = process.argv[2] || 'before';
const trials = Number(process.env.PERF_TRIALS || 3);
const out = path.resolve('artifacts/optimization-2026-10-29');
mkdirSync(out, { recursive: true });
const root = path.resolve('dist');
const origin = 'http://127.0.0.1:5260';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const responseCache = new Map();
const htmlHeaders = Object.fromEntries(JSON.parse(readFileSync('firebase.json', 'utf8')).hosting.headers[0].headers.map(({ key, value }) => [key, value]));
const server = createServer((req, res) => {
  const requested = path.resolve(root, `.${new URL(req.url, origin).pathname}`);
  if (!requested.startsWith(root + path.sep) && requested !== root) { res.writeHead(403); res.end(); return; }
  const file = path.extname(requested) ? requested : path.join(root, 'index.html');
  try {
    if (!responseCache.has(file)) {
      const raw = readFileSync(file);
      const zipped = /\.(html|js|css|svg|json|wasm)$/.test(file);
      responseCache.set(file, { body: zipped ? gzipSync(raw) : raw, zipped });
    }
    const { body, zipped } = responseCache.get(file);
    res.writeHead(200, { ...(file.endsWith('.html') ? htmlHeaders : {}), 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': body.length, ...(zipped ? { 'Content-Encoding': 'gzip' } : {}), 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(5260, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = { phase, trials, conditions: { cpuSlowdown: 4, latencyMs: 40, bytesPerSecond: 1500000, serviceWorker: 'blocked', gzip: true, timezone: 'America/Montevideo' }, runs: [], errors: [] };

function fixture() {
  const state = defaultState();
  Object.assign(state.settings, { onboardingCompleted: true, hiddenTabs: [], userName: 'Rendimiento sintético', lastBackupAt: '2026-10-29', lastWeeklyReviewAt: '2026-10-29' });
  state.profile.name = 'Rendimiento sintético';
  state.finance.accounts = [{ id: 'perf-account', name: 'Cuenta sintética', balance: 10000, initialBalance: 10000, currency: 'UYU' }];
  state.notes.postits = Array.from({ length: 500 }, (_, i) => ({ id: `perf-note-${i}`, title: `Apunte sintético ${String(i).padStart(3, '0')}`, text: 'Material de estudio guardado para consultar y editar durante la semana.', date: '2026-10-29', updatedAt: `2026-10-29T12:${String(i % 60).padStart(2, '0')}:00Z` }));
  state.finance.transactions = Array.from({ length: 200 }, (_, i) => ({ id: `perf-tx-${i}`, type: 'gasto', amount: 50, category: 'Comida', accountId: 'perf-account', fixed: 'variable', date: '2026-10-28', note: `Movimiento sintético ${i}` }));
  state.tasksRecurring = [{ id: 'perf-task', name: 'Repasar apuntes', freq: 'daily', effort: 'low' }];
  return state;
}
const heading = { Gimnasio: 'Gimnasio', Finanzas: 'Finanzas', Agenda: 'Agenda & Rutinas', Calendario: 'Calendario', Notas: 'Notas', Estudios: 'Estudios', Configuración: 'Configuración' };
async function navigate(page, label) {
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button', { name: label, exact: true }).click();
  if (label === 'Hoy') await page.locator('.today-observatory-greeting').waitFor();
  else await page.locator('main').getByRole('heading', { name: heading[label], exact: true, level: 1 }).waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function keyboardAudit(page) {
  await navigate(page, 'Finanzas');
  await page.getByRole('button', { name: 'Movimiento', exact: true }).click();
  await page.getByRole('menuitem', { name: /Registrar Gasto/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar Gasto', exact: true });
  await dialog.waitFor();
  await page.waitForTimeout(100);
  let escaped = false;
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    escaped ||= await dialog.evaluate(el => !el.contains(document.activeElement));
  }
  await page.keyboard.press('Escape');
  const escapeCloses = !(await dialog.isVisible());
  if (!escapeCloses) await dialog.getByRole('button', { name: /Cerrar/ }).click();
  return { focusEscapes: escaped, escapeCloses, focusAfterClose: await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 90)) };
}
try {
  const files = readdirSync(path.join(root, 'assets')).map(name => ({ name, bytes: statSync(path.join(root, 'assets', name)).size, gzip: gzipSync(readFileSync(path.join(root, 'assets', name))).length }));
  const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map(match => match[1]);
  results.build = { files, precacheFiles: urls.length, precacheBytes: urls.reduce((sum, url) => sum + statSync(path.join(root, url.replace(/^\//, ''))).size, 0), index: readFileSync(path.join(root, 'index.html'), 'utf8') };
  for (const width of (process.env.PERF_WIDTHS || '375,768,1920').split(',').map(Number)) for (let trial = 0; trial < trials; trial++) {
    const context = await browser.newContext({ viewport: { width, height: width === 1920 ? 1080 : 812 }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'no-preference' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => results.errors.push({ width, message: error.message }));
    const cdp = await context.newCDPSession(page);
    const requests = new Map();
    cdp.on('Network.responseReceived', ({ requestId, response, type, timestamp }) => requests.set(requestId, { name: new URL(response.url).pathname, type, encoded: 0, status: response.status, receivedAt: timestamp, fromDiskCache: response.fromDiskCache }));
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength, timestamp }) => { if (requests.has(requestId)) Object.assign(requests.get(requestId), { encoded: encodedDataLength, endedAt: timestamp }); });
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1500000, uploadThroughput: 1500000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.clock.setFixedTime(new Date('2026-10-29T15:00:00-03:00'));
    await page.addInitScript(state => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
      localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
      window.perfLongTasks = []; window.perfLCP = [];
      new PerformanceObserver(list => window.perfLongTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(list => window.perfLCP.push(...list.getEntries().map(entry => ({ time: entry.startTime, size: entry.size, url: entry.url })))).observe({ type: 'largest-contentful-paint', buffered: true });
    }, fixture());
    const start = performance.now();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.today-observatory-greeting').waitFor();
    const interactiveMs = performance.now() - start;
    await page.waitForFunction(() => [...document.querySelectorAll('img.hero-matterhorn-photo')].every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    const heroReadyMs = performance.now() - start;
    await page.waitForLoadState('networkidle');
    const initial = await page.evaluate(() => ({ resources: performance.getEntriesByType('resource').map(entry => ({ name: new URL(entry.name).pathname, type: entry.initiatorType, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize, duration: entry.duration })), lcp: window.perfLCP.at(-1), longTasks: window.perfLongTasks }));
    // Playwright's fixed clock replaces Performance resource entries. Network and
    // CPU counters therefore come directly from CDP, outside that page shim.
    initial.resources = [...requests.values()].map(entry => ({ ...entry }));
    initial.cpu = (await cdp.send('Performance.getMetrics')).metrics.filter(entry => ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].includes(entry.name));
    const run = { width, trial, interactiveMs, heroReadyMs, initial, navigation: {} };
    for (const label of ['Notas', 'Finanzas', 'Gimnasio', 'Agenda', 'Calendario', 'Estudios', 'Configuración', 'Hoy']) {
      const tick = performance.now(); await navigate(page, label); run.navigation[label] = performance.now() - tick;
      if (label === 'Notas') {
        run.noteCards = await page.locator('main').evaluate(el => ({ nodes: el.querySelectorAll('*').length, buttons: el.querySelectorAll('button').length }));
        run.notesCpu = (await cdp.send('Performance.getMetrics')).metrics.filter(entry => ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].includes(entry.name));
        run.notesRequests = [...requests.values()].filter(entry => !initial.resources.some(initial => initial.name === entry.name)).map(entry => ({ ...entry }));
      }
    }
    const tick = performance.now(); await navigate(page, 'Notas'); run.warmNotesMs = performance.now() - tick;
    const search = page.getByPlaceholder('Buscar por título, texto o etiqueta');
    const searchStart = performance.now(); await search.fill('Apunte sintético 499');
    await page.locator('main').getByText('Apunte sintético 499', { exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    run.noteSearchMs = performance.now() - searchStart;
    if (trial === 0) {
      run.keyboard = await keyboardAudit(page);
      await page.screenshot({ path: path.join(out, `${phase}-${width}-finance.png`) });
    }
    results.runs.push(run); console.log(`${phase} ${width} trial ${trial + 1}: ready ${heroReadyMs.toFixed(0)}ms, notes ${run.navigation.Notas.toFixed(0)}ms, ${run.noteCards.nodes} nodes`);
    await context.close();
  }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  writeFileSync(path.join(out, `${phase}.json`), JSON.stringify(results, null, 2));
}
assert.equal(results.errors.length, 0, JSON.stringify(results.errors));
