import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';
import { verifyGoogleAuth } from './test-hosting-google-auth.mjs';

// Run against the actual Firebase Hosting emulator, never a personal profile:
// firebase emulators:exec --project demo-lifeos --only hosting "node --import tsx scripts/test-hosting-csp-wasm.mjs"
const origin = 'http://127.0.0.1:5000';
const output = path.resolve(process.env.LIFEOS_CSP_OUTPUT || `artifacts/csp-wasm-${Date.now()}`);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [];
const state = defaultState();
Object.assign(state.settings, { onboardingCompleted: true, hiddenTabs: [], userName: 'Prueba CSP local' });
state.tasksRecurring = [{ id: 'csp-task', name: 'Animación CSP local', freq: 'daily', effort: 'low' }];

async function contextFor(serviceWorkers) {
  const context = await browser.newContext({ serviceWorkers, reducedMotion: 'no-preference', viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== origin) return route.abort();
    // Negative control reproduces the previous policy without editing the candidate.
    if (process.argv.includes('--negative-control') && route.request().isNavigationRequest()) {
      const response = await route.fetch();
      const headers = response.headers();
      headers['content-security-policy'] = headers['content-security-policy'].replace(" 'wasm-unsafe-eval'", '');
      return route.fulfill({ response, headers });
    }
    return route.continue();
  });
  await context.addInitScript(state => {
    if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
    const observation = window.__cspObservation = { phase: 'runtime', violations: [], wasmInstances: 0, draws: [], probe: null };
    document.addEventListener('securitypolicyviolation', event => observation.violations.push({ phase: observation.phase, directive: event.effectiveDirective, blockedURI: event.blockedURI, sourceFile: event.sourceFile }));
    for (const method of ['instantiate', 'instantiateStreaming']) {
      const native = WebAssembly[method];
      if (!native) continue;
      WebAssembly[method] = async function (...args) {
        const result = await Reflect.apply(native, WebAssembly, args);
        if (result instanceof WebAssembly.Instance || result?.instance instanceof WebAssembly.Instance) observation.wasmInstances++;
        return result;
      };
    }
    // Observe native rendering without replacing pixels, timers, or the player.
    for (const method of ['putImageData', 'drawImage']) {
      const native = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        const result = Reflect.apply(native, this, args);
        if (this.canvas instanceof HTMLCanvasElement && this.canvas.closest('.lifeos-lottie') && observation.draws.length < 300) {
          const pixels = this.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
          let hash = 2166136261, visible = false;
          for (let i = 0; i < pixels.length; i++) { hash = Math.imul(hash ^ pixels[i], 16777619); if (i % 4 === 3 && pixels[i]) visible = true; }
          observation.draws.push({ at: performance.now(), hash: hash >>> 0, visible, width: this.canvas.width, height: this.canvas.height });
        }
        return result;
      };
    }
  }, state);
  return context;
}

async function run(name, task) {
  try { const evidence = await task(); results.push({ name, passed: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}

async function animation(page, label) {
  await page.getByRole('button', { name: 'Completar: Animación CSP local', exact: true }).click();
  try {
    await page.waitForFunction(() => {
      const o = window.__cspObservation;
      return o.wasmInstances > 0 && new Set(o.draws.filter(d => d.visible).map(d => d.hash)).size >= 3;
    }, null, { timeout: 8000 });
    await page.screenshot({ path: path.join(output, `${label}-progress.png`) });
    await page.getByRole('button', { name: 'Marcar como pendiente: Animación CSP local', exact: true }).waitFor();
    await page.waitForTimeout(1900);
    const evidence = await page.evaluate(() => window.__cspObservation);
    const visible = evidence.draws.filter(draw => draw.visible);
    assert.ok(visible.at(-1).at - visible[0].at > 50, 'Frames must advance over time, not just mount a canvas.');
    assert.equal(evidence.violations.length, 0, JSON.stringify(evidence.violations));
    await page.screenshot({ path: path.join(output, `${label}.png`) });
    return evidence;
  } finally {
    writeFileSync(path.join(output, `${label}.json`), JSON.stringify(await page.evaluate(() => window.__cspObservation), null, 2));
  }
}

try {
  const context = await contextFor('block');
  const page = await context.newPage();
  const errors = [], consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(origin); await page.locator('.today-observatory-greeting').waitFor();
  await run('dotLottie online: initialized WASM and changing rendered frames', async () => {
    const evidence = await animation(page, 'online-animation');
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
    return evidence;
  });
  if (!process.argv.includes('--wasm-only')) {
    await run('CSP blocks JavaScript eval and Function constructors', async () => {
      await page.route(`${origin}/__csp-javascript-probe.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.__cspObservation.phase='javascript-probe'; window.__cspObservation.probe={}; for(const [name,call] of [['eval',()=>eval('40+2')],['Function',()=>new Function('return 42')()]]) { try { call(); window.__cspObservation.probe[name]={blocked:false}; } catch(error) { window.__cspObservation.probe[name]={blocked:error instanceof EvalError,name:error.name}; } }` }));
      await page.addScriptTag({ url: `${origin}/__csp-javascript-probe.js` });
      await page.waitForTimeout(150);
      const observation = await page.evaluate(() => window.__cspObservation);
      assert.equal(observation.probe.eval.blocked, true);
      assert.equal(observation.probe.Function.blocked, true);
      const expected = observation.violations.filter(v => v.phase === 'javascript-probe');
      assert.equal(expected.length, 2);
      assert.ok(expected.every(v => v.blockedURI === 'eval' && v.directive === 'script-src'));
      return { probe: observation.probe, expectedViolations: expected };
    });
    await run('CSP rejects scripts outside the explicitly permitted Google paths', async () => {
      await page.evaluate(() => { window.__cspObservation.phase = 'unapproved-script'; });
      await assert.rejects(page.addScriptTag({ url: 'https://apis.google.com/unapproved-csp-probe.js' }));
      await page.waitForTimeout(150);
      const blocked = await page.evaluate(() => window.__cspObservation.violations.filter(v => v.phase === 'unapproved-script'));
      assert.ok(blocked.some(v => v.directive === 'script-src-elem' && v.blockedURI.startsWith('https://apis.google.com')));
      return { expectedViolations: blocked };
    });
    for (const mode of ['popup', 'redirect']) await run(`Firebase Google OAuth initiation: ${mode}, without credentials`, async () => verifyGoogleAuth(browser, { output, mode }));
  }
  await context.close();

  if (!process.argv.includes('--wasm-only')) {
    const offline = await contextFor('allow');
    const page = await offline.newPage();
    const errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(origin); await page.locator('.today-observatory-greeting').waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); await page.locator('.today-observatory-greeting').waitFor();
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
    assert.ok(cached.some(url => url.endsWith('.wasm')));
    assert.ok(cached.some(url => url.includes('lifeos-task-completion.json')));
    await offline.setOffline(true); await page.reload(); await page.locator('.today-observatory-greeting').waitFor();
    await run('dotLottie offline after reload: fresh WASM initialization and changing rendered frames', async () => {
      const evidence = await animation(page, 'offline-animation');
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
      return evidence;
    });
    await run('PWA: eleven modules, local scenes and fonts without network', async () => {
      const labels = ['Hoy', 'Gimnasio', 'Finanzas', 'Agenda', 'Calendario', 'Trabajo', 'Mi negocio', 'Estudios', 'Notas', 'IA', 'Configuración'];
      for (const label of labels) {
        await page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button', { name: label, exact: true }).click();
        await page.waitForFunction(() => (document.querySelector('main')?.textContent?.trim().length || 0) > 50);
      }
      const scenes = cached.filter(url => url.includes('cervino-panorama') && url.includes('.webp'));
      assert.equal(scenes.length, 5);
      await page.evaluate(async urls => { for (const url of urls) { const image = new Image(); image.src = url; await image.decode(); if (!image.naturalWidth) throw Error('Unreadable offline WebP'); } await document.fonts.ready; }, scenes);
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
      assert.equal((await page.evaluate(() => window.__cspObservation.violations)).length, 0);
      return { modules: labels.length, webpScenes: scenes.length, cachedFonts: cached.filter(url => url.includes('.woff2')).length, controlled: true, offline: true };
    });
    await offline.close();
  }
} finally {
  await browser.close();
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
}
console.log(JSON.stringify({ passed: results.length, failed: failures.length, output }, null, 2));
if (failures.length) process.exitCode = 1;
