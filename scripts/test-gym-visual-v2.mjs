import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const output = process.env.GYM_VISUAL_OUTPUT || `artifacts/gym-visual-v2/${phase}`;
const origin = 'http://127.0.0.1:5343';
await fs.mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'portable', '--host', '127.0.0.1', '--port', '5343', '--strictPort'], { stdio: 'ignore', env: { ...process.env, DISABLE_HMR: 'true' } });
let browser;
const results = [], keyboardResults = [], errors = [], external = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 300)); }
  assert.ok(ready);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  for (const [width, height] of [[1440, 900], [390, 844], [375, 812]]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-02T18:35:00-03:00'));
    for (const state of ['active', 'rest', 'idle', 'empty', 'paused', 'minimized']) {
      await page.goto(`${origin}/tests/gym-refinement/browser.html?state=${state}&theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('[data-active-workout-view], [data-gym-launcher]').first().waitFor(); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => window.gymRefinementCloudConfigured), false);
      const before = await page.evaluate(() => JSON.stringify(window.gymRefinementState));
      await page.screenshot({ path: `${output}/${width}-${theme}-${state}.png`, fullPage: true });
      const metrics = await page.evaluate(() => {
        const box = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: r.x, y: r.y, width: r.width, height: r.height, font: parseFloat(s.fontSize), weight: s.fontWeight, color: s.color }; };
        return { overflow: document.documentElement.scrollWidth > innerWidth, stage: box('.c-stage-card'), header: box('.c-header-card'), ring: box('.c-rest-timer-wrap'), time: box('.c-rest-timer-text'), launcher: box('[data-gym-launcher]'), calendar: box('.gym-activity-calendar'), cta: box('.c-primary-cta'), stroke: document.querySelector('.c-timer-svg circle:last-child')?.getAttribute('stroke-width'), smallControls: [...document.querySelectorAll('[data-active-workout-view] button, [data-active-workout-view] summary, [data-gym-launcher] button, [data-gym-launcher] select')].filter(el => el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)')).map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(v => v.width < 44 || v.height < 44) };
      });
      assert.equal(metrics.overflow, false, `${width} ${theme} ${state}`); assert.deepEqual(metrics.smallControls, []);
      assert.equal(await page.evaluate(() => JSON.stringify(window.gymRefinementState)), before);
      if (phase === 'after' && ['rest', 'paused'].includes(state)) { assert.ok(metrics.ring.width <= 88); assert.ok(metrics.time.font <= 26); assert.ok(Number(metrics.stroke) <= 2.5); }
      if (phase === 'after' && ['rest', 'paused'].includes(state)) {
        assert.ok(metrics.cta.height >= 44);
        if (width >= 1024) assert.ok(metrics.cta.width <= 360 && metrics.cta.width < metrics.stage.width / 2, 'Desktop start CTA retains a contained width');
        else assert.ok(Math.abs(metrics.cta.width - (metrics.stage.width - 28)) < 1, 'Mobile start CTA retains the available full width');
        const cta = page.locator('.c-next-effort-cta');
        await cta.focus();
        assert.equal(await cta.evaluate(el => document.activeElement === el && parseFloat(getComputedStyle(el).outlineWidth) >= 2), true, 'Start CTA has a visible keyboard focus');
        await page.keyboard.press('Tab');
      }
      if (phase === 'after' && ['rest', 'paused'].includes(state)) {
        const colors = await page.evaluate(() => ({ check: getComputedStyle(document.querySelector('.c-check')).color, progress: getComputedStyle(document.querySelector('.c-timer-progress')).color }));
        assert.equal(colors.check, colors.progress);
        assert.equal(colors.check, theme === 'dark' ? 'rgb(165, 180, 252)' : 'rgb(79, 70, 229)');
        metrics.flowColors = colors;
      }
      results.push({ width, height, theme, state, ...metrics });
    }
    if (phase === 'after' && width < 640) {
      const go = async state => {
        await page.goto(`${origin}/tests/gym-refinement/browser.html?state=${state}&theme=${theme}`);
        await page.locator('[data-active-workout-view]').waitFor();
      };
      await go('active');
      const original = await page.evaluate(() => JSON.stringify(window.gymRefinementState));
      const third = page.getByRole('button', { name: /^Serie 3:/ });
      await third.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.c-series-strip button:nth-child(3)')?.getAttribute('aria-pressed') === 'true');
      assert.equal(await page.getByLabel('Peso en kilogramos', { exact: true }).inputValue(), '72.5');
      assert.equal(await page.getByLabel('Repeticiones', { exact: true }).inputValue(), '8');
      assert.equal(await page.evaluate(() => JSON.stringify(window.gymRefinementState)), original, 'Set selection does not write or complete a set');
      assert.ok(await third.evaluate(el => {
        const r = el.getBoundingClientRect(), strip = el.closest('.c-series-strip').getBoundingClientRect();
        return r.left >= strip.left - 1 && r.right <= strip.right + 1;
      }), 'Selected chip is visible inside the strip');
      await go('rest'); await page.locator('.c-next-effort-cta').focus(); await page.keyboard.press('Space');
      await page.getByRole('button', { name: /^Completar serie 2/ }).waitFor();
      assert.equal(await page.evaluate(() => window.gymRefinementState.gym.sessions[0].exercises[0].sets[1].completed), false, 'Starting a set does not complete it');
      keyboardResults.push({ width, theme, keyboardSelection: true, selectedChipVisible: true, noWriteFromSelection: true, startDoesNotCompleteSet: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ phase, results, keyboardResults, errors, external }, null, 2));
  console.log(`PASS ${phase}: ${results.length} visual states, ${keyboardResults.length} mobile keyboard cases, zero overflow, 44px controls, zero automatic writes, zero external requests.`);
} finally { await browser?.close(); server.kill(); }
