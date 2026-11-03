// Full application, synthetic guest storage, explicit demo bundle, no external APIs.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { defaultState } from '../src/lib/storage.ts';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const output = process.env.GYM_LAYOUT_OUTPUT || `artifacts/gym-page-layout/${phase}`;
const root = path.resolve(process.env.GYM_LAYOUT_DIST || 'dist');
const remote = process.env.GYM_LAYOUT_ORIGIN;
if (remote) assert.match(remote, /^https:\/\/lifeosanywhere--consolidated-review-20261103-[a-z0-9]+\.web\.app$/);
await fs.mkdir(output, { recursive: true });
const sources = await Promise.all((await fs.readdir(path.join(root, 'assets'))).filter(n => n.endsWith('.js')).map(n => fs.readFile(path.join(root, 'assets', n), 'utf8')));
assert.ok(sources.some(s => /VITE_FIREBASE_PROJECT_ID["']?\s*:\s*["']demo-lifeos["']/.test(s)), 'Only an explicit demo build is allowed');
assert.ok(sources.every(s => !/gymRefinementState|tests\/gym-refinement/.test(s)), 'No test harness in the bundle');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    assert.ok(file === root || file.startsWith(root + path.sep));
    if (!path.extname(file)) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = remote || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
const results = [], interactions = [], errors = [], external = [];
const now = new Date('2026-11-02T18:35:00-03:00').getTime();
function seed(theme, active = false, rest = false) {
  const s = defaultState(); s.settings.onboardingCompleted = true; s.settings.hiddenTabs = []; s.settings.darkMode = theme === 'dark'; s.profile.name = 'Revisión sintética';
  const exercise = { id: 'bench', name: 'Press banca plano con barra', equipment: 'barra', muscleGroup: 'Pecho', barWeight: 20, timerEnabled: true, sets: [{ id: 'warm', type: 'warmup', weight: 20, reps: 12, completed: false }, { id: 'work-1', weight: 60, reps: 8, completed: false }, { id: 'work-2', weight: 60, reps: 8, completed: false }] };
  s.gym.routineTemplates = ['Torso · fuerza y técnica con movimientos controlados', 'Piernas y trabajo complementario', 'Rutina todavía sin ejercicios'].map((name, i) => ({ id: `routine-${i}`, name, days: ['lunes'], exercises: i === 2 ? [] : [structuredClone(exercise), { id: 'row', name: 'Remo sentado en polea baja con agarre neutro y pausa', equipment: 'polea', muscleGroup: 'Espalda', sets: [{ id: 'row-1', weight: 45, reps: 10, completed: false }] }] }));
  s.gym.sessions = Array.from({ length: 8 }, (_, i) => ({ id: `history-${i}`, date: `2026-10-${String(15 + i * 2).padStart(2, '0')}`, status: 'completed', weekLabel: 'Torso · sesión sintética', startedAt: '18:00', finishedAt: '18:50', exercises: s.gym.routineTemplates[0].exercises.map(ex => ({ ...structuredClone(ex), sets: ex.sets.map(set => ({ ...set, completed: true })) })) }));
  s.gym.weight = [{ date: '2026-10-15', kg: 80 }, { date: '2026-11-01', kg: 79.5 }];
  s.gym.settings = { restBetweenSetsSeconds: 90, restBetweenExercisesSeconds: 120, autoTimerEnabled: true, showQuickRestAdjustments: true, allowManualRestEditing: true };
  if (active) {
    const session = { id: 'active', date: '2026-11-02', startedAt: '18:30', status: 'active', weekLabel: s.gym.routineTemplates[0].name, exercises: structuredClone(s.gym.routineTemplates[0].exercises) };
    s.gym.sessions.unshift(session);
    if (rest) { session.exercises[0].sets[0].completed = true; s.gym.activeTimer = { sessionId: 'active', exerciseId: 'bench', exerciseIndex: 0, setId: 'warm', kind: 'set', endsAt: now + 75000, durationSeconds: 90, pausedAt: now, remainingSecondsWhenPaused: 75 }; }
  }
  return s;
}
try {
  const widths = process.env.GYM_LAYOUT_WIDTHS ? process.env.GYM_LAYOUT_WIDTHS.split(',').map(Number) : [1920, 1600, 1440, 1280, 1024, 768, 390, 375, 2560];
  for (const width of widths) for (const theme of ['light', 'dark']) {
    const height = width >= 1920 ? 1080 : width >= 768 ? 900 : width === 390 ? 844 : 812;
    const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(new URL(route.request().url()).hostname); return route.abort(); });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); await page.clock.setFixedTime(new Date(now));
    await page.addInitScript(value => { if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(value)); localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1'); }, seed(theme));
    let reference;
    const capture = async (view, selector) => {
      await page.locator(selector).first().waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(100);
      const measurement = await page.evaluate(selector => {
        const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, right: r.right, height: r.height }; };
        const el = document.querySelector(selector), main = document.querySelector('main'), ms = getComputedStyle(main);
        const box = name => rect(document.querySelector(name));
        return { root: rect(el), main: rect(main), mainPadding: Number.parseFloat(ms.paddingLeft), heading: box('.gym-page-heading h1, .gym-workout-topbar h1'), tabs: box('.gym-section-nav'), panel: box('.gym-cockpit-wrap'), aside: box('.gym-workout-aside'), calendar: box('.gym-activity-month'), calendarDetails: box('.gym-activity-selection'), timer: box('.c-rest-timer-wrap'), cta: box('.c-primary-cta'), routineList: box('.gym-routine-list'), routineEditor: box('[data-gym-routine-editor]'), overflow: document.documentElement.scrollWidth > innerWidth };
      }, selector);
      if (view === 'hoy') reference = measurement.root;
      if (!before) {
        assert.equal(measurement.overflow, false, `${width} ${theme} ${view}: page overflow`);
        assert.ok(Math.abs(measurement.root.x - reference.x) < 1 && Math.abs(measurement.root.width - reference.width) < 1, `${width} ${theme} ${view}: must share Hoy's actual global content bounds`);
        if (measurement.tabs && view.startsWith('gym-')) assert.ok(Math.abs(measurement.tabs.width - reference.width) < 1);
        if (measurement.timer) assert.ok(measurement.timer.width <= 84);
        if (measurement.cta && reference.width >= 960) assert.ok(measurement.cta.width < measurement.panel.width * .8, 'Desktop CTA must not stretch with the workspace');
      }
      results.push({ phase, width, height, theme, view, ...measurement });
      await fs.writeFile(`${output}/measurements.json`, JSON.stringify({ results, interactions, errors }, null, 2));
      if ([1920, 1600, 1440, 1024, 390, 375].includes(width)) {
        await page.screenshot({ path: `${output}/${width}-${theme}-${view}.png`, fullPage: true });
        if (width >= 1440 && ['hoy', 'finanzas', 'gym-entrenar', 'gym-active'].includes(view)) {
          await page.evaluate(({ reference, root, view }) => {
            const guides = document.createElement('div'); guides.id = 'layout-guides'; guides.setAttribute('aria-hidden', 'true');
            for (const [bounds, color] of [[reference, '#0891b2'], [root, '#d946ef']]) for (const x of [bounds.x, bounds.right]) { const line = document.createElement('div'); Object.assign(line.style, { position: 'fixed', left: `${x}px`, top: '0', bottom: '0', borderLeft: `2px dashed ${color}`, zIndex: '99999', pointerEvents: 'none' }); guides.append(line); }
            const label = document.createElement('div'); label.textContent = `${view}: ${root.width.toFixed(0)} px | Hoy: ${reference.width.toFixed(0)} px | x=${root.x.toFixed(0)}`; Object.assign(label.style, { position: 'fixed', top: '66px', right: '16px', background: '#0f172a', color: '#fff', font: '12px monospace', padding: '8px', zIndex: '99999', pointerEvents: 'none' }); guides.append(label); document.body.append(guides);
          }, { reference, root: measurement.root, view });
          await page.screenshot({ path: `${output}/${width}-${theme}-${view}-guides.png`, fullPage: true }); await page.locator('#layout-guides').evaluate(el => el.remove());
        }
      }
      return measurement;
    };
    await page.goto(origin + '/'); await capture('hoy', '.today-shell');
    await page.goto(origin + '/?view=finanzas'); await capture('finanzas', '.finance-workspace');
    await page.goto(origin + '/?view=gimnasio'); await capture('gym-entrenar', '.gym-page');
    const nav = page.getByRole('navigation', { name: 'Secciones de Gimnasio' });
    for (const [tab, label] of [['rutinas', /^Rutinas$/], ['historial', /^Historial/], ['progreso', /^Progreso/]]) { await nav.getByRole('button', { name: label }).click(); await capture(`gym-${tab}`, '.gym-page'); }
    await nav.getByRole('button', { name: /^Rutinas$/ }).click(); await page.getByRole('button', { name: 'Editar', exact: true }).first().click(); await capture('gym-routine-editor', '.gym-page');
    await page.evaluate(s => localStorage.setItem('lifeos-state-v1', JSON.stringify(s)), seed(theme, true)); await page.goto(origin + '/?view=gimnasio'); await capture('gym-active', '.gym-page');
    const cta = page.getByRole('button', { name: /^Completar serie 1/ }); await cta.scrollIntoViewIfNeeded();
    assert.equal(await cta.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) && r.height >= 44; }), true);
    if (width < 400) await page.screenshot({ path: `${output}/${width}-${theme}-registration-controls.png` });
    await cta.click(); await page.getByRole('button', { name: 'Pausar descanso', exact: true }).click(); await page.getByRole('button', { name: 'Reanudar descanso', exact: true }).waitFor();
    const paused = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym.activeTimer);
    await page.reload(); await page.getByRole('button', { name: 'Reanudar descanso', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym.activeTimer), paused);
    await capture('gym-rest', '.gym-page');
    const nextEffort = page.locator('.c-next-effort-cta'); await nextEffort.scrollIntoViewIfNeeded();
    assert.equal(await nextEffort.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) && r.height >= 44; }), true);
    if (width < 400) await page.screenshot({ path: `${output}/${width}-${theme}-rest-controls.png` });
    await page.getByRole('button', { name: 'Ejercicio siguiente', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym.activeTimer.exerciseId), 'bench');
    interactions.push({ width, theme, completion: true, pausedAfterReload: true, timerOriginRetained: true, ctaHit: true });
    await context.close(); console.log(`PASS ${phase} ${width} ${theme}: references, four tabs, editor, active/rest, CTA and paused reload`);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/measurements.json`, JSON.stringify({ results, interactions, errors, external }, null, 2));
  console.log(`PASS ${phase}: ${results.length} measured states and ${interactions.length} critical interaction configurations; isolated synthetic data`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
