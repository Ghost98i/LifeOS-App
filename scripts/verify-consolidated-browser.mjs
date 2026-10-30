import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/consolidacion-tres-tandas-20261029';
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
const result = { navigation: [], offline: false, errors: [] };
try {
  const seedContext = await browser.newContext();
  await seedContext.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const seedPage = await seedContext.newPage();
  async function fixture(tanda, view) {
    await seedPage.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-${tanda}/browser.html?view=${view}&state=filled`);
    await seedPage.locator('h1').waitFor();
    return seedPage.evaluate(() => window.fixtureState);
  }
  const s1 = await fixture(1, 'agenda');
  const s2 = await fixture(2, 'finanzas');
  const s3 = await fixture(3, 'ia');
  const seed = { ...s3, agenda: s1.agenda, jobs: s1.jobs, finance: s2.finance };
  // Preserve the actual field names, not an assumed alternative schema.
  for (const key of ['work', 'trabajo', 'routines', 'calendar']) if (key in s1) seed[key] = s1[key];
  seed.settings.onboardingCompleted = true; seed.settings.hiddenTabs = [];
  await fs.writeFile(`${out}/synthetic-compatibility-state.json`, JSON.stringify(seed, null, 2));
  await seedContext.close();
  const modules = [
    ['agenda', 'Agenda y rutinas', 'product-refinement'], ['trabajo', 'Trabajo y empleo', 'product-refinement'],
    ['reventa', 'Mi negocio', 'product-refinement'], ['finanzas', 'Finanzas', 'finance-refinement'],
    ['config', 'Configuración', 'config-refinement'], ['estudios', 'Estudios', 'study-refinement'],
    ['notas', 'Notas y herramientas', 'notes-refinement'], ['ia', 'IA · Oportunidades e ideas', 'ai-refinement'],
  ];
  for (const width of [1920, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1080 } });
    await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await context.addInitScript(({ seed, theme }) => {
      if (!localStorage.getItem('lifeos-state-v1')) {
        seed.settings.darkMode = theme === 'dark'; localStorage.setItem('lifeos-state-v1', JSON.stringify(seed));
      }
    }, { seed, theme });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.message));
    let original;
    for (const [view, title, scope] of modules) {
      await page.goto(`http://127.0.0.1:5000/?view=${view}`);
      await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (!original) original = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('lifeos-state-v1'));
        return JSON.stringify({ finance: state.finance, resale: state.resale, notes: state.notes, study: state.study, ai: state.ai });
      });
      const metrics = await page.locator(`.${scope}`).first().evaluate(root => ({ font: getComputedStyle(root.querySelector('h1')).fontFamily, overflow: document.documentElement.scrollWidth > innerWidth, dark: document.documentElement.classList.contains('dark'), accent: getComputedStyle(root).getPropertyValue('--blue').trim().toUpperCase() }));
      assert.match(metrics.font, /Instrument Sans/);
      assert.equal(metrics.overflow, false, `${view}/${width}/${theme}`);
      assert.equal(metrics.dark, theme === 'dark'); assert.equal(metrics.accent, '#4F46E5');
      if (view === 'config') {
        assert.equal(await page.getByRole('button', { name: /Conectar.*Google|Iniciar.*Google/ }).count() > 0 || (await page.locator('main').innerText()).includes('Google'), true);
        await page.screenshot({ path: `${out}/config-${width}-${theme}.png`, fullPage: true });
      }
      if (view === 'notas') {
        await page.getByRole('button', { name: /^Herramientas/ }).click();
        assert.equal(await page.getByRole('navigation', { name: 'Herramientas personales' }).isVisible(), true);
      }
      if (view === 'ia') assert.match(await page.locator('main').innerText(), /externa/);
      result.navigation.push({ view, width, theme, ...metrics });
    }
    assert.equal(await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('lifeos-state-v1'));
      return JSON.stringify({ finance: state.finance, resale: state.resale, notes: state.notes, study: state.study, ai: state.ai });
    }), original, 'Navigation must not mutate historical modules');
    if (width === 390 && theme === 'dark') {
      await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      for (const [view, title] of modules) {
        await page.goto(`http://127.0.0.1:5000/?view=${view}`);
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
        if (view === 'estudios') {
          await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
          await page.getByRole('status').filter({ hasText: 'Reproduciendo' }).waitFor();
          await page.getByLabel('Ambiente', { exact: true }).selectOption('pure_white');
          await page.getByRole('button', { name: 'Pausar sonido', exact: true }).click();
          await page.getByRole('status').filter({ hasText: 'En pausa' }).waitFor();
        }
        if (view === 'notas') {
          await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
          await page.getByLabel('Título de la nueva nota', { exact: true }).fill('Nota offline consolidada');
          await page.getByPlaceholder('Escribí el contenido de la nota...', { exact: true }).fill('Persistencia sin red');
          await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
          await page.reload();
          await page.getByRole('button', { name: 'Abrir nota Nota offline consolidada', exact: true }).click();
          assert.equal(await page.locator('.fixed textarea').inputValue(), 'Persistencia sin red');
        }
      }
      result.offline = true;
    }
    await context.close();
  }
  assert.deepEqual(result.errors, []);
  await fs.writeFile(`${out}/browser-integration.json`, JSON.stringify(result, null, 2));
  console.log(`PASS: ${result.navigation.length} integrated built-App checks, 8 offline modules, audio and note persistence.`);
} finally { await browser.close(); }
