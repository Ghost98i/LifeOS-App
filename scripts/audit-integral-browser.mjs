import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultState, normalizeStoredState } from '../src/lib/storage.ts';
import { addTransaction } from '../src/lib/financeFlows.ts';

const root = path.resolve('dist');
const evidence = path.resolve(process.env.LIFEOS_AUDIT_OUTPUT || 'artifacts/integral/browser');
mkdirSync(evidence, { recursive: true });
const url = 'http://127.0.0.1:5226/';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.lottie': 'application/zip', '.webmanifest': 'application/manifest+json' };
const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
const htmlHeaders = Object.fromEntries(hosting.headers[0].headers.map(({ key, value }) => [key, value]));
const server = createServer((req, res) => {
  const file = path.resolve(root, `.${decodeURIComponent(new URL(req.url, url).pathname)}`);
  if (!file.startsWith(`${root}${path.sep}`) && file !== root) { res.writeHead(403); res.end(); return; }
  const target = existsSync(file) && path.extname(file) ? file : path.join(root, 'index.html');
  try {
    const body = readFileSync(target);
    res.writeHead(200, { ...(target.endsWith('.html') ? htmlHeaders : {}), 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(5226, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [], results = [], consoleErrors = [];
const labels = ['Hoy', 'Gimnasio', 'Finanzas', 'Agenda', 'Calendario', 'Trabajo', 'Mi negocio', 'Estudios', 'Notas', 'IA', 'Configuración'];

function fixture(theme = 'light', rich = true) {
  const state = defaultState();
  Object.assign(state.settings, { darkMode: theme === 'dark', onboardingCompleted: true, hiddenTabs: [], userName: 'Auditoría', lastBackupAt: '2026-10-28', lastWeeklyReviewAt: '2026-10-28' });
  state.profile.name = 'Auditoría';
  state.finance.accounts = [{ id: 'audit-bank', name: 'Cuenta sintética', initialBalance: 40000, balance: 40000, currency: 'UYU' }, { id: 'audit-usd', name: 'Dólares', initialBalance: 100, balance: 100, currency: 'USD' }];
  state.finance.accounts.push({ id: 'audit-cash', name: 'Efectivo sintético', initialBalance: 0, balance: 0, currency: 'UYU' });
  if (!rich) { state.finance.accounts = []; return state; }
  state.tasksRecurring = [{ id: 'audit-routine', name: 'Leer veinte minutos', freq: 'daily', effort: 'low', time: '08:30' }];
  state.agenda.miercoles = [{ id: 'audit-block', activity: 'Planificar la semana', time: '10:00', effort: 'medium' }];
  state.calendarEvents = [{ id: 'audit-event', name: 'Reunión sintética', date: '2026-10-29', time: '19:30', type: 'otro', recurring: false }];
  for (let n = 0; n < 12; n++) {
    state.notes.postits.push({ id: `note-${n}`, title: `Apunte ${n + 1}`, text: 'Contenido de prueba para comprobar lectura y edición.', date: '2026-10-28' });
    addTransaction(state, { type: n % 3 ? 'gasto' : 'ingreso', amount: 150 + n, category: 'Otros', accountId: 'audit-bank', date: '2026-10-28', note: `Movimiento sintético ${n + 1}` });
  }
  state.finance.commitments = [{ id: 'audit-payment', name: 'Servicio mensual', amount: 1200, currency: 'UYU', nextDueDate: '2026-10-29', frequency: 'monthly', active: true, category: 'Otros', accountId: 'audit-bank' }];
  state.todayExtras = [{ id: 'audit-task', text: 'Revisar presupuesto', date: '2026-10-28', priority: 'media', done: false }];
  state.study.subjects = [{ id: 'audit-subject', name: 'Matemática' }];
  state.study.exams = [{ id: 'audit-exam', subjectId: 'audit-subject', date: '2026-11-04', title: 'Parcial', time: '09:00' }];
  state.study.studyLog = [{ id: 'audit-study', subjectId: 'audit-subject', date: '2026-10-28', minutes: 45 }];
  state.jobs.applications = [{ id: 'audit-job', empresa: 'Empresa sintética', puesto: 'Analista', estado: 'entrevista', fecha: '2026-10-27' }];
  state.gym.settings.autoTimerEnabled = true;
  state.gym.routineTemplates = [{ id: 'audit-gym', name: 'Fuerza histórica', days: ['miercoles'], exercises: [{ id: 'audit-press', name: 'Press banca', equipment: 'barra', muscleGroup: 'Pecho', timerEnabled: false, restSecondsMode: 'inherit', sets: [{ id: 'audit-set', weight: 40, reps: 8, completed: false }, { id: 'audit-set-2', weight: 40, reps: 8, completed: false }] }] }];
  state.gym.sessions = [{ id: 'audit-history', date: '2026-10-26', startedAt: '10:00', finishedAt: '11:00', status: 'completed', exercises: [{ id: 'audit-press', name: 'Press banca', equipment: 'barra', sets: [{ id: 'history-set', weight: 35, reps: 8, completed: true }] }] }];
  return normalizeStoredState(state);
}

async function newPage({ width = 1920, height = 1080, theme = 'light', rich = true, pwa = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: pwa ? 'allow' : 'block' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => consoleErrors.push(error.message));
  if (pwa) page.on('console', message => { if (message.type() === 'error') console.error('PWA console:', message.text()); });
  await page.clock.setFixedTime(new Date('2026-10-28T15:00:00-03:00'));
  await page.addInitScript(state => {
    if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
    localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
  }, fixture(theme, rich));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.today-observatory-greeting').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('privacy-mode')), false, 'Una cuenta sin preferencia de privacidad debe mostrar los importes');
  return { page, context };
}

async function navigate(page, label) {
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(220);
  await page.waitForFunction(() => (document.querySelector('main')?.textContent?.trim().length || 0) > 50);
  await page.locator('main h1').first().waitFor();
}
const local = page => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
async function diskFailure(page, fail) {
  await page.evaluate(fail => {
    window.auditOriginalSetItem ||= Storage.prototype.setItem;
    Storage.prototype.setItem = fail ? function(key, value) {
      if (key === 'lifeos-state-v1') throw new Error('Synthetic quota');
      return window.auditOriginalSetItem.call(this, key, value);
    } : window.auditOriginalSetItem;
  }, fail);
}
async function step(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  if (process.argv.includes('--pwa')) await step('PWA: precache visual completo y navegación de los 11 módulos sin red', async () => {
    const { page, context } = await newPage({ pwa: true });
    try {
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      const cached = await page.evaluate(async () => {
        const urls = (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
        return { scenes: urls.filter(url => /cervino-panorama/.test(url)).length, fonts: urls.filter(url => /instrument-sans.*woff2/.test(url)).length, motion: urls.filter(url => /gym-workout-success.*lottie/.test(url)).length, urls, worker: (await navigator.serviceWorker.getRegistration())?.active?.scriptURL };
      });
      writeFileSync(path.join(evidence, 'pwa-cache.json'), JSON.stringify(cached, null, 2));
      assert.equal(cached.scenes, 5, 'Las cinco escenas deben estar guardadas para el ciclo offline');
      assert.equal(cached.fonts, 2);
      assert.equal(cached.motion, 1);
      await context.setOffline(true);
      await page.reload();
      await page.locator('.today-observatory-greeting').waitFor();
      await page.evaluate(async urls => {
        await Promise.all(urls.filter(url => url.includes('cervino-panorama')).map(async url => {
          const image = new Image(); image.src = url; await image.decode();
          if (!image.naturalWidth) throw new Error('Escena offline ilegible: ' + url);
        }));
      }, cached.urls);
      for (const label of labels) await navigate(page, label);
      await navigate(page, 'Hoy');
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog', { name: 'Comandos de Celestian' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Comandos de Celestian' }).waitFor({ state: 'hidden' });
      await page.waitForFunction(() => Array.from(document.images).filter(image => image.src.includes('cervino')).every(image => image.complete && image.naturalWidth > 0));
      await page.screenshot({ path: path.join(evidence, 'pwa-offline.png') });
    } finally { await context.close(); }
  });
  if (!process.argv.includes('--pwa-only')) {
  await step('Finanzas: gasto, edición, borrado y transferencia conservan saldos y formularios ante fallos', async () => {
    const { page, context } = await newPage();
    try {
      await navigate(page, 'Finanzas');
      const before = await local(page);
      await page.getByRole('button', { name: 'Movimiento', exact: true }).click();
      await page.getByRole('menuitem', { name: /Registrar Gasto/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Registrar Gasto', exact: true });
      await dialog.getByLabel('Monto (UYU)', { exact: true }).fill('250');
      await dialog.getByRole('button', { name: /Más detalles/ }).click();
      await dialog.getByLabel('Nota / Detalle (Opcional)', { exact: true }).fill('Gasto auditoría');
      await diskFailure(page, true);
      await dialog.getByRole('button', { name: /^Guardar Gasto/ }).click();
      assert.equal(await dialog.isVisible(), true);
      assert.equal((await local(page)).finance.transactions.length, before.finance.transactions.length);
      await diskFailure(page, false);
      await dialog.getByRole('button', { name: /^Guardar Gasto/ }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await local(page)).finance.accounts[0].balance, before.finance.accounts[0].balance - 250);
      const row = page.locator('tr').filter({ hasText: 'Gasto auditoría' });
      await row.getByRole('button', { name: 'Editar', exact: true }).click();
      await page.getByLabel('Monto (UYU)', { exact: true }).fill('125');
      await page.getByRole('button', { name: 'Guardar Cambios', exact: true }).click();
      assert.equal((await local(page)).finance.accounts[0].balance, before.finance.accounts[0].balance - 125);
      page.once('dialog', dialog => dialog.accept());
      await row.locator('button[title="Eliminar movimiento"]').click();
      assert.equal((await local(page)).finance.accounts[0].balance, before.finance.accounts[0].balance);
      await page.getByRole('button', { name: 'Movimiento', exact: true }).click();
      await page.getByRole('menuitem', { name: /Transferir/ }).click();
      const transfer = page.getByRole('dialog', { name: 'Transferir entre cuentas' });
      await transfer.getByLabel('Origen', { exact: true }).selectOption('audit-bank');
      await transfer.getByLabel('Destino', { exact: true }).selectOption('audit-usd');
      assert.equal(await transfer.getByRole('button', { name: 'Confirmar transferencia' }).isDisabled(), true);
      await transfer.getByLabel('Destino', { exact: true }).selectOption('audit-cash');
      await transfer.getByLabel('Monto a transferir', { exact: true }).fill('500');
      await diskFailure(page, true);
      await transfer.getByRole('button', { name: 'Confirmar transferencia' }).click();
      assert.equal(await transfer.isVisible(), true);
      assert.equal((await local(page)).finance.transfers.length, 0);
      await diskFailure(page, false);
      await transfer.getByRole('button', { name: 'Confirmar transferencia' }).click();
      await transfer.waitFor({ state: 'hidden' });
      const after = await local(page);
      assert.equal(after.finance.accounts[0].balance, before.finance.accounts[0].balance - 500);
      assert.equal(after.finance.accounts[1].balance, before.finance.accounts[1].balance);
      assert.equal(after.finance.accounts[2].balance, 500);
      assert.equal(after.finance.transactions.length, before.finance.transactions.length);
      assert.equal(after.finance.transfers.length, 1);
      await page.reload();
      assert.deepEqual((await local(page)).finance, after.finance);
    } finally { await context.close(); }
  });

  await step('Notas y búsqueda global: crear, editar, recuperar por búsqueda y eliminar', async () => {
    const { page, context } = await newPage({ width: 375, height: 812, theme: 'dark' });
    try {
      await navigate(page, 'Notas');
      await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
      await page.getByLabel('Título de la nueva nota').fill('Nota de auditoría');
      await page.getByLabel('Contenido de la nueva nota').fill('Contenido inicial');
      await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
      const created = (await local(page)).notes.postits.find(note => note.title === 'Nota de auditoría');
      assert.ok(created);
      await page.getByRole('button', { name: 'Abrir nota Nota de auditoría', exact: true }).click();
      await page.getByLabel('Contenido de la nota', { exact: true }).fill('Contenido corregido');
      await diskFailure(page, true);
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      assert.equal(await page.getByRole('dialog', { name: 'Editar nota' }).isVisible(), true);
      await diskFailure(page, false);
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await navigate(page, 'Hoy');
      await page.getByRole('button', { name: 'Buscar en Celestian', exact: true }).click();
      await page.locator('[role="dialog"] input[type="text"]').fill('Nota de auditoría');
      await page.getByRole('button').filter({ hasText: 'Nota de auditoría' }).first().click();
      await page.getByRole('button', { name: 'Abrir nota Nota de auditoría', exact: true }).click();
      await page.getByRole('dialog', { name: 'Editar nota' }).waitFor();
      assert.equal(await page.getByLabel('Contenido de la nota', { exact: true }).inputValue(), 'Contenido corregido');
      await page.getByRole('dialog', { name: 'Editar nota' }).getByRole('button', { name: 'Cerrar editor de nota', exact: true }).click();
      await page.getByRole('button', { name: 'Acciones de la nota Nota de auditoría', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
      assert.equal((await local(page)).notes.postits.some(note => note.id === created.id), false);
    } finally { await context.close(); }
  });

  await step('Trabajo: crear y editar postulación sin perder el formulario al fallar el guardado', async () => {
    const { page, context } = await newPage({ width: 375, height: 812 });
    try {
      await navigate(page, 'Trabajo');
      await page.getByRole('button', { name: 'Nueva postulación', exact: true }).click();
      await page.getByLabel('Empresa', { exact: true }).fill('Empresa de auditoría');
      await page.getByLabel('Puesto', { exact: true }).fill('Analista');
      await diskFailure(page, true);
      await page.getByRole('button', { name: 'Agregar postulación', exact: true }).click();
      assert.equal(await page.getByLabel('Empresa', { exact: true }).inputValue(), 'Empresa de auditoría');
      assert.equal((await local(page)).jobs.applications.length, 1);
      await diskFailure(page, false);
      await page.getByRole('button', { name: 'Agregar postulación', exact: true }).click();
      assert.equal((await local(page)).jobs.applications.length, 2);
      await page.getByRole('button', { name: /Lista.*Tabla/ }).click();
      const card = page.locator('tr').filter({ hasText: 'Empresa de auditoría' });
      await card.getByRole('button', { name: 'Editar', exact: true }).click();
      await page.getByLabel('Puesto', { exact: true }).fill('Analista senior');
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      assert.equal((await local(page)).jobs.applications.find(job => job.empresa === 'Empresa de auditoría').puesto, 'Analista senior');
      await page.reload();
      assert.equal((await local(page)).jobs.applications.length, 2);
    } finally { await context.close(); }
  });

  await step('Calendario: crear sin horario, editar, reflejar en Agenda y eliminar', async () => {
    const { page, context } = await newPage();
    try {
      await navigate(page, 'Calendario');
      await page.getByRole('button', { name: 'Agregar acontecimiento', exact: true }).click();
      await page.getByLabel('Nombre o descripción *', { exact: true }).fill('Evento de auditoría');
      await page.getByLabel('Fecha', { exact: true }).fill('2026-10-28');
      await page.getByRole('button', { name: 'Guardar acontecimiento', exact: true }).click();
      const created = (await local(page)).calendarEvents.find(event => event.name === 'Evento de auditoría');
      assert.ok(created);
      assert.equal(created.time, undefined);
      await page.getByRole('button', { name: 'Editar Evento de auditoría', exact: true }).click();
      await page.getByLabel('Hora (opcional)', { exact: true }).fill('18:30');
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
      assert.equal((await local(page)).calendarEvents.find(event => event.id === created.id).time, '18:30');
      await navigate(page, 'Agenda');
      assert.ok((await page.locator('main').innerText()).includes('Evento de auditoría'));
      await navigate(page, 'Calendario');
      await page.getByRole('button', { name: 'Eliminar Evento de auditoría', exact: true }).first().click();
      assert.equal((await local(page)).calendarEvents.some(event => event.id === created.id), false);
    } finally { await context.close(); }
  });
  await step('Agenda: editar rutina, confirmar plantilla y conservar borrador si falla el disco', async () => {
    const { page, context } = await newPage({ width: 375, height: 812 });
    try {
      await navigate(page, 'Agenda');
      await page.getByRole('button', { name: 'Rutinas', exact: false }).filter({ hasText: /^Rutinas/ }).first().click();
      await page.getByRole('button', { name: 'Editar Leer veinte minutos', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Editar rutina', exact: true });
      await dialog.getByLabel('Nombre', { exact: true }).fill('Leer treinta minutos');
      await page.evaluate(() => { window.auditSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'lifeos-state-v1') throw new Error('Synthetic quota'); return window.auditSetItem.call(this, key, value); }; });
      await dialog.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
      assert.equal(await dialog.isVisible(), true);
      assert.equal((await local(page)).tasksRecurring[0].name, 'Leer veinte minutos');
      await page.evaluate(() => { Storage.prototype.setItem = window.auditSetItem; });
      await dialog.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await local(page)).tasksRecurring[0].name, 'Leer treinta minutos');
      await page.getByRole('button', { name: 'Plantilla sugerida', exact: true }).click();
      await page.getByRole('dialog', { name: 'Aplicar plantilla sugerida' }).waitFor();
      await page.screenshot({ path: path.join(evidence, 'agenda-confirmacion-375.png') });
      await page.getByRole('button', { name: 'Aplicar plantilla', exact: true }).click();
      assert.ok(Object.values((await local(page)).agenda).flat().length > 1);
      await page.getByRole('button', { name: 'Vaciar horario recurrente', exact: true }).click();
      await page.getByRole('dialog', { name: 'Vaciar horario recurrente' }).getByRole('button', { name: 'Vaciar horario', exact: true }).click();
      const after = await local(page);
      assert.equal(Object.values(after.agenda).flat().length, 0);
      assert.equal(after.calendarEvents[0].id, 'audit-event');
      assert.equal(after.tasksRecurring[0].name, 'Leer treinta minutos');
      await page.reload();
      assert.equal((await local(page)).tasksRecurring[0].name, 'Leer treinta minutos');
    } finally { await context.close(); }
  });
  await step('Quick Capture: Enter crea un borrador, respeta fecha explícita y un solo símbolo monetario', async () => {
    const { page, context } = await newPage();
    try {
      const input = page.locator('.today-command-bar input[type=text]');
      await input.fill('Gasté 300 en comida el 30/10/2026');
      await input.press('Enter');
      const confirm = page.getByRole('button', { name: 'Confirmar', exact: true });
      assert.equal(await confirm.count(), 1, 'Enter no debe crear dos borradores');
      const text = await page.locator('main').innerText();
      assert.equal(text.includes('$U $U'), false);
      assert.ok(text.includes('30/10') || text.includes('30 oct') || text.includes('2026-10-30'));
      const before = await local(page);
      await confirm.click();
      const after = await local(page);
      assert.equal(after.finance.transactions.length, before.finance.transactions.length + 1);
      assert.equal(after.finance.transactions.at(-1).date, '2026-10-30');
      assert.equal(after.finance.accounts[1].balance, before.finance.accounts[1].balance);
    } finally { await context.close(); }
  });
  await step('IA: importación y formularios conservan contenido ante fallo y no crean compras implícitas', async () => {
    const { page, context } = await newPage();
    try {
      await navigate(page, 'IA');
      const input = page.getByPlaceholder('Pegá aquí la respuesta JSON…');
      const payload = JSON.stringify({ empleo: [{ empresa: 'Empresa IA sintética', puesto: 'Soporte' }], reventa: [{ item: 'Monitor sintético', buyPrice: 500, marketPrice: 900 }], ideas: ['Idea importada sintética'] });
      await input.fill(payload);
      await page.getByRole('button', { name: 'Validar y previsualizar', exact: true }).click();
      await diskFailure(page, true);
      await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
      assert.equal(await input.inputValue(), payload);
      assert.equal((await local(page)).ideas.length, 0);
      await diskFailure(page, false);
      await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
      assert.equal((await local(page)).ideas.length, 1);
      await input.fill(payload);
      await page.getByRole('button', { name: 'Validar y previsualizar', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
      assert.equal((await local(page)).ideas.length, 1, 'Reimportar no debe duplicar elementos');
      const idea = page.getByPlaceholder('Guardar una idea manual…');
      await idea.fill('Idea manual sintética');
      await diskFailure(page, true);
      await idea.press('Enter');
      assert.equal(await idea.inputValue(), 'Idea manual sintética');
      await diskFailure(page, false);
      await idea.press('Enter');
      assert.equal((await local(page)).ideas.length, 2);
      const before = await local(page);
      await page.getByRole('button', { name: 'Registrar en Mi negocio', exact: true }).click();
      await page.getByRole('heading', { name: 'Mi negocio', exact: true }).waitFor();
      const after = await local(page);
      assert.deepEqual(after.finance, before.finance);
      assert.deepEqual(after.resale, before.resale);
    } finally { await context.close(); }
  });
  await step('Búsqueda global: el gasto y la postulación quedan abiertos si falla el guardado', async () => {
    const { page, context } = await newPage();
    try {
      await page.keyboard.press('Control+k');
      let dialog = page.getByRole('dialog', { name: 'Comandos de Celestian' });
      await dialog.getByPlaceholder('Escribe un comando o busca notas, transacciones, ejercicios…').fill('nuevo gasto');
      await dialog.getByRole('button', { name: /Nuevo Gasto \/ Registrar Gasto/ }).click();
      await dialog.getByPlaceholder('0.00').fill('90');
      const before = await local(page);
      await diskFailure(page, true);
      await dialog.getByRole('button', { name: /^Guardar Gasto/ }).click();
      assert.equal(await dialog.isVisible(), true);
      assert.equal((await local(page)).finance.transactions.length, before.finance.transactions.length);
      await diskFailure(page, false);
      await dialog.getByRole('button', { name: /^Guardar Gasto/ }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await local(page)).finance.accounts[0].balance, before.finance.accounts[0].balance - 90);
      await page.keyboard.press('Control+k');
      dialog = page.getByRole('dialog', { name: 'Comandos de Celestian' });
      await dialog.getByPlaceholder('Escribe un comando o busca notas, transacciones, ejercicios…').fill('Nueva Postulación');
      await dialog.getByRole('button', { name: /Nueva Postulación/ }).click();
      await dialog.getByPlaceholder('Ej.: MercadoLibre, Globant, Startup…').fill('Empresa búsqueda sintética');
      await dialog.getByPlaceholder('Ej: Fullstack Developer, Product Designer…').fill('Soporte');
      await diskFailure(page, true);
      await dialog.getByRole('button', { name: /^Guardar Postulación/ }).click();
      assert.equal(await dialog.isVisible(), true);
      assert.equal((await local(page)).jobs.applications.length, before.jobs.applications.length);
      await diskFailure(page, false);
      await dialog.getByRole('button', { name: /^Guardar Postulación/ }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await local(page)).jobs.applications.length, before.jobs.applications.length + 1);
    } finally { await context.close(); }
  });
  await step('Configuración: perfil, importación y recuperación reflejan el guardado real', async () => {
    const { page, context } = await newPage();
    try {
      await navigate(page, 'Configuración');
      const profile = page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar cambios', exact: true }) });
      const name = profile.locator('input[type="text"]').first();
      await name.fill('Perfil cambiado sintético');
      await diskFailure(page, true);
      await profile.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      assert.equal((await local(page)).profile.name, 'Auditoría');
      assert.equal(await name.inputValue(), 'Perfil cambiado sintético');
      await diskFailure(page, false);
      await profile.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      assert.equal((await local(page)).profile.name, 'Perfil cambiado sintético');
      const imported = await local(page);
      imported.profile.name = 'Perfil importado sintético';
      await page.locator('input[type="file"]').setInputFiles({ name: 'backup-sintetico.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
      const confirm = page.getByRole('button', { name: 'Confirmar y Reemplazar Datos', exact: true });
      await confirm.waitFor();
      await diskFailure(page, true);
      await confirm.click();
      assert.equal(await confirm.isVisible(), true);
      assert.equal((await local(page)).profile.name, 'Perfil cambiado sintético');
      await diskFailure(page, false);
      await confirm.click();
      await confirm.waitFor({ state: 'hidden' });
      assert.equal((await local(page)).profile.name, imported.profile.name);
      assert.equal(await name.inputValue(), imported.profile.name);
      await page.getByRole('button', { name: 'Restaurar Copia de Recuperación', exact: true }).click();
      await page.getByRole('button', { name: 'Restaurar Copia', exact: true }).click();
      assert.equal((await local(page)).profile.name, 'Perfil cambiado sintético');
      await page.reload();
      assert.equal((await local(page)).profile.name, 'Perfil cambiado sintético');
    } finally { await context.close(); }
  });
  await step('Gimnasio móvil: rutina histórica inicia descanso, pausa, reanuda y termina sesión', async () => {
    const { page, context } = await newPage({ width: 375, height: 812, theme: 'dark' });
    try {
      await navigate(page, 'Gimnasio');
      await page.getByLabel('Elegir rutina', { exact: true }).selectOption('audit-gym');
      await page.getByRole('button', { name: 'Iniciar entrenamiento', exact: true }).click();
      const complete = page.getByRole('button', { name: /^Completar serie 1/ });
      await complete.click();
      assert.ok((await local(page)).gym.activeTimer?.endsAt);
      await page.getByRole('button', { name: 'Pausar descanso', exact: true }).click();
      assert.ok((await local(page)).gym.activeTimer.pausedAt);
      const remaining = (await local(page)).gym.activeTimer.remainingSecondsWhenPaused;
      await navigate(page, 'Hoy');
      await page.clock.setFixedTime(new Date('2026-10-28T15:03:00-03:00'));
      await page.waitForTimeout(500);
      assert.equal((await local(page)).gym.activeTimer.remainingSecondsWhenPaused, remaining);
      await navigate(page, 'Gimnasio');
      await page.getByRole('button', { name: 'Reanudar descanso', exact: true }).click();
      await page.screenshot({ path: path.join(evidence, 'gimnasio-descanso-375-dark.png') });
      await page.locator('summary[aria-label="Acciones de la sesión: finalizar o salir sin perder datos"]').click();
      await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      await page.getByRole('button', { name: 'Continuar en Celestian', exact: true }).waitFor();
      await page.screenshot({ path: path.join(evidence, 'gimnasio-resumen-375-dark.png') });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const summary = await local(page);
      assert.equal(summary.gym.sessions[0].status, 'completed');
      assert.equal(summary.gym.activeTimer, null);
      await page.getByRole('button', { name: 'Continuar en Celestian' }).click();
      await page.reload();
      assert.equal((await local(page)).gym.sessions[0].status, 'completed');
    } finally { await context.close(); }
  });

  }
  if (!process.argv.includes('--flows-only') && !process.argv.includes('--pwa-only')) for (const rich of [true, false]) {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 768, height: 1024 }, ...(rich ? [{ width: 2560, height: 1440 }] : []), { width: 375, height: 812 }]) {
      for (const theme of ['light', 'dark']) {
        const { page, context } = await newPage({ ...viewport, theme, rich });
        try {
          for (const [index, label] of labels.entries()) await step(`${rich ? 'datos' : 'vacío'} ${viewport.width} ${theme} ${label}`, async () => {
            await navigate(page, label);
            await page.evaluate(() => document.fonts.ready);
            if (rich && label === 'Estudios') assert.equal(await page.getByRole('region', { name: 'Para estudiar', exact: true }).getByRole('button', { name: /Parcial.*Matemática/ }).isVisible(), true, 'Las evaluaciones históricas sin estado deben figurar también en el espacio de estudio');
            const measurements = await page.evaluate(() => {
              const probe = document.createElement('span');
              probe.style.color = 'var(--text-faint)'; document.body.append(probe);
              const foreground = getComputedStyle(probe).color;
              probe.style.color = 'var(--surface-muted)';
              const background = getComputedStyle(probe).color;
              probe.remove();
              const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
              const fg = luminance(foreground), bg = luminance(background);
              const mutedContrast = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
              const accent = Array.from(document.querySelectorAll('.today-shell [class], .gym-page [class]')).find(el => el.classList.contains('text-[var(--blue)]'));
              const ink = accent ? luminance(getComputedStyle(accent).color) : null;
              return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, text: document.querySelector('main')?.textContent, headings: Array.from(document.querySelectorAll('main h1')).map(el => el.textContent), brokenImages: Array.from(document.images).filter(img => img.getBoundingClientRect().width && img.complete && !img.naturalWidth).map(img => img.src), mutedContrast, accentContrast: ink === null ? null : (Math.max(ink, bg) + .05) / (Math.min(ink, bg) + .05) };
            });
            const file = `${rich ? 'datos' : 'vacio'}-${viewport.width}-${theme}-${String(index).padStart(2, '0')}.png`;
            await page.screenshot({ path: path.join(evidence, file), fullPage: true });
            writeFileSync(path.join(evidence, file.replace('.png', '.json')), JSON.stringify({ label, ...measurements }, null, 2));
            assert.ok(measurements.scrollWidth <= measurements.width + 1, `overflow ${measurements.scrollWidth - measurements.width}px`);
            assert.ok(measurements.text?.trim().length > 10, 'El contenido del módulo debe estar visible');
            assert.equal(measurements.brokenImages.length, 0, measurements.brokenImages.join(', '));
            assert.ok(measurements.mutedContrast >= 4.5, `Texto secundario: contraste ${measurements.mutedContrast.toFixed(2)}`);
            if (theme === 'dark' && measurements.accentContrast !== null) assert.ok(measurements.accentContrast >= 4.5, `Enlace violeta: contraste ${measurements.accentContrast.toFixed(2)}`);
          });
        } finally { await context.close(); }
      }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, failures, consoleErrors }, null, 2));
}
console.log(JSON.stringify({ passed: results.length, failed: failures.length, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
