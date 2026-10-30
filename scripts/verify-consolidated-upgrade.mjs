// Production bytes -> candidate -> rollback on one isolated localhost origin.
// Exercises the actual Service Worker prompt and historical local data.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = 'artifacts/consolidacion-tres-tandas-20261029';
const candidate = JSON.parse(await fs.readFile(`${out}/candidate.json`, 'utf8'));
const production = JSON.parse(await fs.readFile(`${out}/production-preflight.json`, 'utf8'));
let served = path.join(production.localRollback.directory, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:5268');
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    assert.ok(!relative.split('/').includes('..'));
    let file = path.join(served, relative || 'index.html');
    try { if (!(await fs.stat(file)).isFile()) throw new Error('directory'); }
    catch { file = path.join(served, 'index.html'); }
    const bytes = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(5268, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
const result = { productionVersion: production.currentVersion, candidate: candidate.buildId, errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const seed = JSON.parse(await fs.readFile(`${out}/synthetic-compatibility-state.json`, 'utf8'));
  seed.notes.postits.push({ id: 'historical-upgrade-note', title: 'Compatibilidad entre versiones', text: 'Borrador histórico', date: '2026-10-28' });
  await context.addInitScript(seed => { if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(seed)); }, seed);
  const page = await context.newPage(); page.on('pageerror', e => result.errors.push(e.message));
  await page.goto('http://127.0.0.1:5268/?view=notas');
  await page.getByRole('heading', { name: 'Notas', exact: true, level: 1 }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  async function editNote(text) {
    await page.getByRole('button', { name: 'Abrir nota Compatibilidad entre versiones', exact: true }).click();
    await page.locator('.fixed textarea').fill(text);
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.waitForFunction(text => JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.find(n => n.id === 'historical-upgrade-note').text === text, text);
  }
  await editNote('Guardada por la versión publicada');
  // Start from the format actually written by production, after its own
  // existing normalization, rather than the deliberately sparse fixture.
  const historical = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lifeos-state-v1'));
    return { finance: state.finance, resale: state.resale, study: state.study, jobs: state.jobs, goals: state.goals, projects: state.projects };
  });
  async function updateTo(directory, title) {
    served = path.join(directory, 'dist');
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    const update = page.getByRole('button', { name: 'Actualizar ahora', exact: true });
    await update.waitFor({ timeout: 30000 });
    await update.click();
    await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor({ timeout: 30000 });
  }
  await updateTo(candidate.candidate, 'Notas y herramientas');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.find(n => n.id === 'historical-upgrade-note').text), 'Guardada por la versión publicada');
  await editNote('Guardada por el candidato consolidado');
  await updateTo(production.localRollback.directory, 'Notas');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.find(n => n.id === 'historical-upgrade-note').text), 'Guardada por el candidato consolidado');
  assert.deepEqual(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lifeos-state-v1'));
    return { finance: state.finance, resale: state.resale, study: state.study, jobs: state.jobs, goals: state.goals, projects: state.projects };
  }), historical);
  result.productionWriteReadByCandidate = true; result.candidateWriteReadByProduction = true;
  result.serviceWorkerUpgradeAndRollbackPrompt = true; result.historicalDomainsUnchanged = true;
  assert.deepEqual(result.errors, []);
  await fs.writeFile(`${out}/upgrade-rollback.json`, JSON.stringify(result, null, 2));
  console.log('PASS: actual published bytes -> candidate -> rollback, SW confirmation, note writes both ways and historical domains unchanged.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
