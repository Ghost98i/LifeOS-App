import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';
import { computeHiddenTabsFromSelection, OPTIONAL_MODULES } from '../src/lib/moduleVisibility.ts';

// No user profile, authentication, emulators or production services. Portable mode
// disables Firebase; isolated contexts also reject every non-local request.
const port = 5323;
const origin = `http://127.0.0.1:${port}`;
const out = path.resolve('artifacts/hoy-refinement');
fs.mkdirSync(out, { recursive: true });
const today = '2026-10-31';
let passed = 0;
const measurements = [];
const errors = [];
const externalRequests = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'portable', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe', windowsHide: true });
let browser;

function fixture(modules = OPTIONAL_MODULES, history = false, darkMode = false) {
  const state = defaultState();
  state.settings.onboardingCompleted = true;
  state.settings.hiddenTabs = computeHiddenTabsFromSelection(modules);
  state.settings.darkMode = darkMode;
  if (history) {
    state.profile.name = 'Persona de prueba';
    state.agenda.sabado = [{ id: 'meeting', activity: 'Reunión para revisar la propuesta de trabajo', time: '16:00', effort: 'high' }];
    state.todayExtras = [
      { id: 'today', text: 'Preparar documentación para la reunión', date: today, priority: 'alta', effort: 'high', done: false },
      { id: 'overdue', text: 'Enviar formulario con documentación pendiente', date: '2026-10-30', dueDate: '2026-10-30', priority: 'alta', done: false },
      { id: 'future', text: 'Comprar materiales', date: '2026-11-01', priority: 'media', done: false },
    ];
    state.dailyContext = [
      { date: '2026-10-27', sleepHours: 8, energy: 4, mood: 3, connection: null },
      { date: '2026-10-30', sleepHours: 7, energy: 3, mood: 3, connection: null },
      { date: today, sleepHours: 5.5, sleepQuality: 2, energy: 2, mood: 3, connection: null },
    ];
    state.finance.accounts[0].initialBalance = 15000;
    state.finance.accounts[0].balance = 15000;
    state.finance.commitments = [{ id: 'payment', name: 'Servicio de prueba con nombre extenso y referencia $U 7689,45', amount: 3500, frequency: 'once', nextDueDate: '2026-10-30', active: true }];
  }
  return state;
}

async function open(state, viewport) {
  const context = await browser.newContext({ viewport, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', hasTouch: viewport.width < 640, isMobile: viewport.width < 640, reducedMotion: 'reduce' });
  await context.clock.setFixedTime(new Date(`${today}T14:00:00-03:00`));
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript((synthetic) => {
    if (!localStorage.getItem('hoy-test-seeded')) {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(synthetic));
      localStorage.setItem('hoy-test-seeded', '1');
    }
  }, state);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator('.today-shell').waitFor();
  assert.equal(await page.evaluate(async () => (await import('/src/lib/cloudSync.ts')).cloudSyncConfigured), false, 'Firebase deshabilitado en la instancia real');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-matterhorn-photo').evaluate((img) => img.decode());
  return { context, page };
}

async function check(name, run) {
  await run();
  console.log(`PASS ${name}`);
  passed++;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { ready = (await fetch(origin)).ok; } catch { /* server starting */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Servidor portable disponible');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });

  for (const modules of [[], ['finanzas'], ['finanzas', 'gimnasio'], OPTIONAL_MODULES]) {
    await check(`instalación vacía: ${modules.join(',') || 'mínima'}`, async () => {
      const { context, page } = await open(fixture(modules), { width: 1440, height: 900 });
      assert.equal(await page.locator('.today-attention').count(), 0);
      assert.equal(await page.getByTestId('today-state-empty-history').count(), 1);
      await context.close();
    });
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 812 }]) {
    for (const dark of [false, true]) {
      for (const history of [false, true]) {
        await check(`${viewport.width} × ${viewport.height}, ${dark ? 'oscuro' : 'claro'}, ${history ? 'historial' : 'vacío'}`, async () => {
          const { context, page } = await open(fixture(history ? OPTIONAL_MODULES : [], history, dark), viewport);
          const geometry = await page.evaluate(() => {
            const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
            return { hero: rect('.today-hero'), agenda: rect('.today-agenda-surface'), state: rect('.today-state-surface'), overflow: document.documentElement.scrollWidth > innerWidth,
              controls: [...document.querySelectorAll('.today-attention button')].map((button) => ({ label: button.getAttribute('aria-label') || button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
              clipped: [...document.querySelectorAll('.today-attention strong, .today-attention-copy > span')].some((node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight) };
          });
          assert.equal(geometry.overflow, false);
          assert.equal(geometry.clipped, false);
          assert.ok(geometry.hero.height <= (viewport.width > 640 ? 330 : 280));
          assert.ok(geometry.agenda.top >= geometry.hero.bottom, 'Sin solapamiento entre cabecera y agenda');
          for (const control of geometry.controls) assert.ok(control.width >= 44 && control.height >= 44, JSON.stringify(control));
          if (!history) {
            assert.ok(geometry.state.height < 380, JSON.stringify(geometry.state));
            assert.equal(await page.locator('.today-state-kpi-strip').count(), 0);
            const dates = page.getByTestId('today-state-empty-history').getByRole('button');
            assert.equal(await dates.count(), 7);
            await dates.nth(5).focus();
            await page.keyboard.press('Enter');
            assert.match(await page.locator('.today-state-surface').innerText(), /Historial/);
            await page.locator('.today-state-surface').getByRole('button', { name: 'Registrar', exact: true }).click();
            await page.getByLabel('Sueño', { exact: true }).fill('0');
            const save = page.getByRole('button', { name: 'Guardar estado', exact: true });
            await save.scrollIntoViewIfNeeded();
            if (viewport.width < 640) {
              await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
              const buttonBox = await save.boundingBox();
              const navBox = await page.locator('nav.fixed.bottom-0').boundingBox();
              assert.ok(buttonBox.y + buttonBox.height <= navBox.y, 'Guardar estado puede quedar libre de la navegación fija');
            }
            await save.click();
            assert.match(await page.locator('.today-state-kpi-strip').innerText(), /0 h/);
            const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
            assert.equal(stored.dailyContext.find((entry) => entry.date === '2026-10-30').sleepHours, 0);
            await page.getByRole('button', { name: 'Volver a hoy', exact: true }).click();
            // Capture the untouched empty state in a separate fresh context below.
          } else {
            assert.equal(await page.locator('.today-state-kpi-strip').count(), 1);
            assert.match(await page.locator('.today-state-surface').innerText(), /5,5 h/);
            assert.match(await page.locator('.today-attention').innerText(), /3\.500/);
            if (viewport.width === 375 && dark) await page.screenshot({ path: path.join(out, 'hoy-aviso-visible-375-oscuro.png') });
            const toggle = viewport.width < 640 ? page.getByRole('button', { name: 'Stream Guard', exact: true }) : page.getByRole('button', { name: 'Activar Stream Guard', exact: true });
            await toggle.click();
            assert.doesNotMatch(await page.locator('.today-attention').evaluate((element) => element.outerHTML), /3\.500|3500|7689/);
            if (viewport.width === 375 && dark) await page.screenshot({ path: path.join(out, 'hoy-aviso-privado-375-oscuro.png') });
            await page.locator('.today-attention-dismiss').first().click();
            await page.locator('.today-attention [aria-label^="Ver "]').click();
            const modal = page.getByRole('dialog', { name: 'Avisos descartados' });
            assert.doesNotMatch(await modal.evaluate((element) => element.outerHTML), /3\.500|3500|7689/);
            await modal.getByRole('button', { name: 'Restaurar aviso: Vencimiento pendiente', exact: true }).click();
            await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
            await page.getByRole('button', { name: 'Ver tarea', exact: true }).click();
            await page.locator('#today-extra-overdue.lifeos-target-highlight').waitFor();
            assert.equal(await page.evaluate(() => document.activeElement.id), 'today-extra-overdue');
            await page.getByRole('button', { name: 'Por qué veo esto', exact: true }).click();
            const explanation = await page.getByTestId('today-state-contextual-suggestion').innerText();
            assert.equal(explanation.split('Tenés un compromiso con horario fijo').length - 1, 1);
            assert.match(explanation, /Registraste 5,5 h/);
          }
          measurements.push({ viewport, dark, history, ...geometry });
          await context.close();
          const clean = await open(fixture(history ? OPTIONAL_MODULES : [], history, dark), viewport);
          await clean.page.screenshot({ path: path.join(out, `hoy-${history ? 'historial' : 'vacio'}-${viewport.width}-${dark ? 'oscuro' : 'claro'}.png`), fullPage: true });
          await clean.context.close();
        });
      }
    }
  }

  await check('captura por teclado revisa un único borrador antes de guardarlo', async () => {
    const { context, page } = await open(fixture(), { width: 1440, height: 900 });
    const input = page.getByRole('textbox', { name: 'Captura rápida', exact: true });
    await input.fill('Enviar presupuesto mañana');
    await input.press('Enter');
    assert.equal(await page.getByText('Borradores para revisar', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).todayExtras.length), 0);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
    assert.equal(stored.todayExtras.length, 1);
    assert.equal(stored.todayExtras[0].date, '2026-11-01');
    assert.match(await page.locator('[role="status"]').innerText(), /Tarea creada/);
    await context.close();
  });

  assert.deepEqual(errors, [], 'Sin errores no controlados');
  assert.deepEqual(externalRequests, [], 'Portable no intenta conectarse a servicios externos');
  console.log(`RESULT ${passed} escenarios aprobados; 0 fallidos; 0 solicitudes externas; 0 errores de página.`);
} finally {
  fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify({ passed, measurements, errors, externalRequests }, null, 2));
  await browser?.close();
  server.kill();
}
