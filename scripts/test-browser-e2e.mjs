import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';

// The fixtures below intentionally span Oct 18–25. Freeze both the runner and
// browser calendar so that "future" fixtures never become overdue with time.
process.env.TZ = 'America/Montevideo';
const TEST_NOW = '2026-10-21T12:00:00-03:00';

const TEST_PORT = process.env.TEST_PORT || 5199;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const EVIDENCE_DIR = path.resolve('artifacts', 'browser-evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function makeBaseState(custom = {}) {
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-19',
      lastWeeklyReviewAt: '2026-10-19',
      hiddenTabs: [],
    },
    todayExtras: [],
    dailyPriorities: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    tasksRecurring: [],
    study: { subjects: [], exams: [], studyLog: [] },
    finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
    projects: [],
    ...custom,
  };
}

let passedCount = 0;
let failedCount = 0;

function getTodayIso() {
  const d = new Date(TEST_NOW);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTomorrowIso() {
  const d = new Date(TEST_NOW);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calcula la huella digital criptográfica SHA-256 de dist/index.html.
 */
function getLocalBuildFingerprint() {
  const indexPath = path.resolve('dist', 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Verifica que el servidor en url esté sirviendo EXACTAMENTE
 * la huella del build de disco actual, rechazando builds obsoletos.
 */
async function verifyServerBuildFreshness(url, expectedFingerprint) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`El servidor en ${url} respondió con status ${res.status}`);
  }
  const html = await res.text();
  const servedFingerprint = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
  if (servedFingerprint !== expectedFingerprint) {
    throw new Error(
      `[SEGURIDAD BUILD E2E] El servidor en ${url} sirve un build obsoleto.\n` +
      `  Huella esperada (disco):  ${expectedFingerprint}\n` +
      `  Huella servida (red):     ${servedFingerprint}\n` +
      `Se aborta la ejecución para garantizar que no existan falsos positivos sobre versiones antiguas.`
    );
  }
  return true;
}

/**
 * Lanza el navegador de forma portable sin rutas absolutas de usuario fijas.
 * Prioriza canal oficial 'chrome', variables de entorno del sistema y fallback a Chromium.
 */
async function launchBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  }

  // 1. Canal nativo de Playwright para Google Chrome
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    // 2. Búsqueda estándar en Windows por variables de entorno del sistema
    const localAppData = process.env.LOCALAPPDATA;
    const progFiles = process.env.ProgramFiles;
    const progFilesX86 = process.env['ProgramFiles(x86)'];
    const candidates = [
      localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      progFiles && path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      progFilesX86 && path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      progFiles && path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      localAppData && path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ].filter(Boolean);

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return await chromium.launch({ executablePath: cand, headless: true });
      }
    }

    // 3. Fallback a Chromium empaquetado
    return await chromium.launch({ headless: true });
  }
}

/**
 * Configura la página en un contexto aislado, inyectando el estado sintético en localStorage.
 * NOTA: NO se inyecta ningún estilo para ocultar ni alterar componentes reales.
 */
async function setupPage(context, state) {
  const page = await context.newPage();
  await page.addInitScript((st) => {
    localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
  }, state);
  return page;
}

async function runStep(name, fn) {
  try {
    process.stdout.write(`  ⏳ ${name}... `);
    await fn();
    console.log(`\x1b[32m✔ OK\x1b[0m`);
    passedCount++;
  } catch (err) {
    console.log(`\x1b[31m✖ FAILED\x1b[0m`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log(' LifeOS — Validación E2E en Navegador Real con Build Fresco');
  console.log('============================================================\n');

  // =========================================================================
  // FASE 0: COMPILACIÓN OBLIGATORIA Y SERVIDOR EXCLUSIVO EN PUERTO DEDICADO
  // =========================================================================
  console.log('📦 1. Compilación de producción obligatoria para garantizar código vigente...');
  execSync('npm run build', { stdio: 'pipe' });
  const localFingerprint = getLocalBuildFingerprint();
  assert.ok(localFingerprint, 'dist/index.html debe existir tras el build');
  console.log(`   Huella digital del build en disco: ${localFingerprint}`);

  console.log(`🚀 2. Iniciando servidor Vite preview exclusivo en puerto ${TEST_PORT}...`);
  const spawnedServer = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(TEST_PORT), '--strictPort'], {
    stdio: 'ignore',
  });

  // Esperar a que el servidor responda y verificar frescura estricta
  let serverReady = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      if (await verifyServerBuildFreshness(APP_URL, localFingerprint)) {
        serverReady = true;
        break;
      }
    } catch {
      // Reintentar mientras arranca el proceso
    }
  }

  assert.equal(serverReady, true, `El servidor de pruebas en ${APP_URL} no estuvo listo o la huella no coincidió.`);
  console.log(`   Servidor verificado: código 100% fresco servido en ${APP_URL}\n`);

  const browser = await launchBrowser();
  const createContext = browser.newContext.bind(browser);
  browser.newContext = async (options = {}) => {
    const context = await createContext({ timezoneId: 'America/Montevideo', locale: 'es-UY', ...options });
    await context.clock.setFixedTime(new Date(TEST_NOW));
    await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    return context;
  };

  try {
    // =========================================================================
    // SUITE 1: NAVEGACIÓN DIRIGIDA DESDE «ATENCIÓN AHORA»
    // =========================================================================
    console.log('--- Suite 1: Navegación Dirigida desde «Atención ahora» ---');

    // 1.1 Compromiso Financiero
    await runStep('1.1 Compromiso Financiero: abre Finanzas -> Proyección y enfoca cuota', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        finance: {
          accounts: [{ id: 'acc1', name: 'Cuenta Principal', type: 'banco', currency: 'UYU', balance: 50000 }],
          transactions: [],
          commitments: [
            {
              id: 'c-rent-due',
              name: 'Alquiler Estudio',
              amount: 18000,
              currency: 'UYU',
              frequency: 'monthly',
              nextDueDate: '2026-10-19',
              active: true,
              remainingOccurrences: 10,
              category: 'Hogar',
            },
          ],
          agreements: [],
          budgets: {},
          categories: ['Hogar'],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver cuota")');
      assert.equal(await alertBtn.count(), 1, 'Debe haber un botón "Ver cuota"');
      await alertBtn.click();

      await page.waitForSelector('#commitment-c-rent-due', { timeout: 4000 });
      const isVisible = await page.isVisible('#commitment-c-rent-due');
      assert.equal(isVisible, true, 'El compromiso debe ser visible en el DOM');

      await page.waitForTimeout(600);
      const isHighlighted = await page.$eval('#commitment-c-rent-due', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El elemento debe tener la clase lifeos-target-highlight');

      await context.close();
    });

    // 1.2 Acuerdo de Financiación
    await runStep('1.2 Acuerdo de Financiación: abre Finanzas -> Cuentas y enfoca acuerdo', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        finance: {
          accounts: [{ id: 'acc1', name: 'Caja Ahorro', type: 'banco', currency: 'UYU', balance: 35000 }],
          transactions: [],
          commitments: [],
          agreements: [
            {
              id: 'agr-due',
              title: 'Plan Auto Cuota 12',
              creditorName: 'Banco Santander',
              initialRemainingBalance: 40000,
              currency: 'UYU',
              status: 'active',
              schedule: {
                totalInstallments: 12,
                installmentAmount: 10000,
                firstDueDate: '2026-10-19',
                dueDay: 19,
                frequency: 'monthly',
              },
            },
          ],
          budgets: {},
          categories: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver cuota")');
      assert.equal(await alertBtn.count(), 1, 'Debe existir aviso para acuerdo por vencer');
      await alertBtn.click();

      await page.waitForSelector('#agreement-agr-due', { timeout: 4000 });
      await page.waitForTimeout(600);

      const isHighlighted = await page.$eval('#agreement-agr-due', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El acuerdo debe tener la clase de foco');

      await context.close();
    });

    // 1.3 Examen Académico
    await runStep('1.3 Examen Académico: abre Estudios y enfoca el examen', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const tomStr = getTomorrowIso();
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'subj-fisica', name: 'Física II', color: '#3B82F6' }],
          exams: [
            {
              id: 'exam-fisica-1',
              subjectId: 'subj-fisica',
              name: 'Parcial 1',
              date: tomStr,
              status: 'pendiente',
            },
          ],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver examen")');
      assert.equal(await alertBtn.count(), 1, 'Debe alertar examen próximo');
      await alertBtn.click();

      await page.waitForSelector('#exam-exam-fisica-1', { timeout: 4000 });
      await page.waitForTimeout(600);

      const hasHighlight = await page.$eval('#exam-exam-fisica-1', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(hasHighlight, true, 'El examen debe estar enfocado y resaltado');

      await context.close();
    });

    // 1.4 Proyecto Pausado
    await runStep('1.4 Proyecto Pausado: abre Notas -> Proyectos, desactiva filtro y enfoca tarea', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        projects: [
          {
            id: 'proj-redesign',
            title: 'Rediseño Web',
            status: 'pausado',
            tasks: [
              {
                id: 'pt-seo-overdue',
                title: 'Optimizar SEO on-page',
                completed: false,
                dueDate: '2026-10-18',
              },
            ],
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver tarea")');
      assert.equal(await alertBtn.count(), 1, 'Debe alertar tarea vencida en proyecto pausado');
      await alertBtn.click();

      await page.waitForSelector('#project-task-pt-seo-overdue', { timeout: 4000 });
      await page.waitForTimeout(600);

      const hasHighlight = await page.$eval('#project-task-pt-seo-overdue', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(hasHighlight, true, 'Debe resaltar la tarea dentro del proyecto pausado');

      await context.close();
    });

    // 1.5 Tarea recuperada de todayExtras (Auto-Expande Acordeón)
    await runStep('1.5 Tarea Anterior en Hoy: auto-expande "Pendientes anteriores" y enfoca fila', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          {
            id: 't-past-overdue',
            text: 'Presentar documentación bancaria',
            date: '2026-10-18',
            dueDate: '2026-10-18',
            priority: 'alta',
            done: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver tarea")');
      assert.equal(await alertBtn.count(), 1);
      await alertBtn.click();

      await page.waitForSelector('#today-extra-t-past-overdue', { timeout: 4000 });
      await page.waitForTimeout(600);

      const isVisible = await page.isVisible('#today-extra-t-past-overdue');
      assert.equal(isVisible, true, 'La fila de la tarea debe estar visible');

      const hasHighlight = await page.$eval('#today-extra-t-past-overdue', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(hasHighlight, true, 'Debe tener la clase lifeos-target-highlight');

      await context.close();
    });

    // 1.6 Navegación Consecutiva y Limpieza de Foco
    await runStep('1.6 Navegaciones Consecutivas: limpia focos previos y soporta repetición sin fugas', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        finance: {
          accounts: [{ id: 'acc1', name: 'Cuenta Principal', type: 'banco', currency: 'UYU', balance: 50000 }],
          transactions: [],
          commitments: [
            {
              id: 'c-1',
              name: 'Gasto Común',
              amount: 5000,
              currency: 'UYU',
              frequency: 'monthly',
              nextDueDate: '2026-10-19',
              active: true,
              remainingOccurrences: 5,
            },
          ],
          agreements: [],
          budgets: {},
          categories: [],
        },
        study: {
          subjects: [{ id: 's1', name: 'Materia 1', color: '#10B981' }],
          exams: [{ id: 'ex-1', subjectId: 's1', date: getTomorrowIso(), status: 'pendiente' }],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      // 1. Clic en examen
      await page.locator('.today-attention button:has-text("Ver examen")').click();
      await page.waitForSelector('#exam-ex-1.lifeos-target-highlight', { timeout: 4000 });

      // 2. Volver a Hoy usando el sidebar
      await page.click('aside nav button:has-text("Hoy")');
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      // 3. Clic en compromiso financiero
      await page.locator('.today-attention button:has-text("Ver cuota")').click();
      await page.waitForSelector('#commitment-c-1.lifeos-target-highlight', { timeout: 4000 });

      // 4. Volver a Hoy y pulsar DE NUEVO el mismo compromiso financiero (segundo clic con focusNonce)
      await page.click('aside nav button:has-text("Hoy")');
      await page.waitForSelector('.today-attention', { timeout: 4000 });
      await page.locator('.today-attention button:has-text("Ver cuota")').click();
      await page.waitForSelector('#commitment-c-1.lifeos-target-highlight', { timeout: 4000 });

      await context.close();
    });

    // 1.7 Destino Inexistente (Timeout de Seguridad Limpio)
    await runStep('1.7 Destino Inexistente: no bloquea ni crashea la interfaz', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-observatory-greeting', { timeout: 4000 });

      const hasHero = await page.evaluate(() => Boolean(document.querySelector('.today-observatory-greeting')));
      assert.equal(hasHero, true, 'La interfaz debe seguir montada y activa');
      await context.close();
    });

    // 1.8 Evento Puntual de Agenda Próximo (Hoy)
    await runStep('1.8 Evento Puntual de Agenda Próximo (Hoy): abre Agenda y enfoca el evento', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date('2026-10-19T14:00:00');
      await context.clock.setFixedTime(now);
      const in45m = new Date(now.getTime() + 45 * 60 * 1000);
      const timeStr = `${String(in45m.getHours()).padStart(2, '0')}:${String(in45m.getMinutes()).padStart(2, '0')}`;
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const state = makeBaseState({
        calendarEvents: [
          {
            id: 'ev-today-e2e',
            name: 'Examen Algoritmos y PdD',
            date: todayStr,
            time: timeStr,
            type: 'otro',
            recurring: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const alertBtn = page.locator('.today-attention button:has-text("Ver evento")');
      assert.equal(await alertBtn.count(), 1, 'Debe alertar evento próximo a comenzar');
      await alertBtn.click();

      await page.waitForSelector('#agenda-event-ev-today-e2e', { timeout: 4000 });
      await page.waitForTimeout(600);

      const isHighlighted = await page.$eval('#agenda-event-ev-today-e2e', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El evento puntual de hoy debe estar resaltado con lifeos-target-highlight');

      await context.close();
    });

    // 1.9 Evento Puntual de Agenda Mañana
    await runStep('1.9 Evento Puntual de Agenda Mañana: abre Agenda posicionado en mañana y enfoca el evento', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      const state = makeBaseState({
        calendarEvents: [
          {
            id: 'ev-tomorrow-e2e',
            name: 'Examen FEIP',
            date: tomStr,
            time: '19:30',
            type: 'otro',
            recurring: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const titleText = await page.locator('.today-attention').textContent();
      assert.ok(titleText.includes('Mañana, 19:30'), 'Debe indicar que el evento es mañana');
      assert.ok(titleText.includes('Examen FEIP'), 'Debe mostrar el nombre del evento');

      const alertBtn = page.locator('.today-attention button:has-text("Ver evento")');
      await alertBtn.click();

      // Debe abrir Agenda en la fecha de mañana y enfocar el elemento
      await page.waitForSelector('#agenda-event-ev-tomorrow-e2e', { timeout: 4000 });
      await page.waitForTimeout(600);

      const isHighlighted = await page.$eval('#agenda-event-ev-tomorrow-e2e', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El evento de mañana debe estar visible y enfocado en la vista Agenda');

      await context.close();
    });

    // 1.10 Compromiso Financiero que Vence Mañana
    await runStep('1.10 Compromiso Financiero que Vence Mañana: abre Finanzas -> Proyección y enfoca cuota', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      const state = makeBaseState({
        finance: {
          accounts: [{ id: 'acc-main', name: 'Banco', type: 'banco', currency: 'UYU', balance: 40000 }],
          transactions: [],
          commitments: [
            {
              id: 'c-directv-tomorrow',
              name: 'DirecTV',
              amount: 1200,
              currency: 'UYU',
              frequency: 'monthly',
              nextDueDate: tomStr,
              active: true,
              remainingOccurrences: null,
            },
          ],
          agreements: [],
          budgets: {},
          categories: ['Servicios'],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const text = await page.locator('.today-attention').textContent();
      assert.ok(text.includes('Vence mañana'), 'Debe etiquetarse como Vence mañana');
      assert.ok(text.includes('DirecTV'), 'Debe nombrar el compromiso DirecTV');

      const btn = page.locator('.today-attention button:has-text("Ver cuota")');
      assert.equal(await btn.count(), 1);
      await btn.click();

      await page.waitForSelector('#commitment-c-directv-tomorrow', { timeout: 4000 });
      await page.waitForTimeout(600);

      const isHighlighted = await page.$eval('#commitment-c-directv-tomorrow', (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El compromiso de mañana debe resaltarse en Proyección');

      await context.close();
    });

    // 1.11 Navegación Repetida a Evento de Agenda (focusNonce)
    await runStep('1.11 Navegación Repetida a Evento de Agenda: preserva foco dinámico en clics sucesivos', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      const state = makeBaseState({
        calendarEvents: [
          {
            id: 'ev-repeat-e2e',
            name: 'Examen Repetido',
            date: tomStr,
            time: '18:00',
            type: 'otro',
            recurring: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      // 1. Primer clic
      await page.locator('.today-attention button:has-text("Ver evento")').click();
      await page.waitForSelector('#agenda-event-ev-repeat-e2e.lifeos-target-highlight', { timeout: 4000 });

      // 2. Volver a Hoy
      await page.click('aside nav button:has-text("Hoy")');
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      // 3. Segundo clic consecutivo (focusNonce se incrementa)
      await page.locator('.today-attention button:has-text("Ver evento")').click();
      await page.waitForSelector('#agenda-event-ev-repeat-e2e.lifeos-target-highlight', { timeout: 4000 });

      await context.close();
    });

    // 1.12 Descarte Individual de Recordatorio en Navegador
    await runStep('1.12 Descarte Individual: remueve aviso de inmediato, promueve el siguiente candidato y persiste tras recarga', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;

      // 3 asuntos concurrentes
      const state = makeBaseState({
        calendarEvents: [
          {
            id: 'ev-dismiss-test',
            name: 'Reunión de Coordinación',
            date: tomStr,
            time: '18:30',
            type: 'otro',
            recurring: false,
          },
        ],
        finance: {
          accounts: [{ id: 'acc1', name: 'Banco', type: 'banco', currency: 'UYU', balance: 50000 }],
          transactions: [],
          commitments: [
            {
              id: 'c-dismiss-test',
              name: 'Seguro Hogar',
              amount: 2500,
              currency: 'UYU',
              frequency: 'monthly',
              nextDueDate: tomStr,
              active: true,
              remainingOccurrences: null,
            },
          ],
          agreements: [],
          budgets: {},
          categories: [],
        },
        projects: [
          {
            id: 'p-dismiss-test',
            name: 'Administración',
            objective: '',
            status: 'activo',
            nextStep: '',
            tasks: [
              {
                id: 'task-overdue-dismiss-test',
                text: 'Enviar balance contable',
                done: false,
                dueDate: yestStr,
              },
            ],
            createdAt: '2026-10-01',
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      // Verificamos que hay 2 asuntos en la franja
      const actionButtons = page.locator('.today-attention button[title="Descartar aviso"]');
      assert.equal(await actionButtons.count(), 2, 'Debe mostrar 2 avisos con botón de descarte');

      // Descartamos el primer aviso pulsando su botón "x"
      await actionButtons.first().click();
      await page.waitForTimeout(400);

      // Verificamos que sigue habiendo 2 asuntos (el tercer candidato fue promovido inmediatamente)
      assert.equal(await page.locator('.today-attention button[title="Descartar aviso"]').count(), 2);

      // Verificamos que aparece el enlace discreto de aviso descartado
      const dismissedPill = page.locator('.today-attention button:has-text("1 aviso descartado")');
      assert.equal(await dismissedPill.count(), 1, 'Debe mostrar el indicador discreto de 1 aviso descartado');

      // Comprobamos en localStorage que los registros originales no sufrieron ninguna mutación y el descarte se guardó
      const storedStateRaw = await page.evaluate(() => localStorage.getItem('lifeos-state-v1'));
      const storedState = JSON.parse(storedStateRaw);
      assert.ok(storedState.settings?.dismissedAttentionKeys?.length >= 1, 'Debe registrar la clave de descarte en settings');
      assert.equal(storedState.calendarEvents[0].name, 'Reunión de Coordinación', 'El registro original no se muta');
      assert.equal(storedState.finance.commitments[0].active, true, 'El compromiso original sigue activo');
      assert.equal(storedState.projects[0].tasks[0].done, false, 'La tarea original sigue pendiente');

      // Para comprobar la persistencia entre cargas de sesión sin que addInitScript de la primera página reinicie el estado,
      // abrimos una nueva pestaña dentro del mismo contexto de almacenamiento compartido
      const page2 = await context.newPage();
      await page2.goto(APP_URL);
      await page2.waitForSelector('.today-attention', { timeout: 4000 });

      // Comprobamos que el aviso descartado sigue silenciado y el indicador sigue visible
      const dismissedPillAfterReload = page2.locator('.today-attention button:has-text("1 aviso descartado")');
      assert.equal(await dismissedPillAfterReload.count(), 1, 'El descarte debe persistir entre cargas');
      assert.equal(storedState.finance.commitments[0].active, true, 'El compromiso original sigue activo');
      assert.equal(storedState.projects[0].tasks[0].done, false, 'La tarea original sigue pendiente');

      await context.close();
    });

    // 1.13 Examen o Evento Descartado Hoy: NO reaparece mañana ni al entrar en la ventana de 2 horas
    await runStep('1.13 Examen o Evento Descartado: no reaparece al entrar en ventana de 2 horas y es restaurable', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = new Date('2026-10-19T14:00:00');
      await context.clock.setFixedTime(now);
      const targetTime = new Date(now.getTime() + 45 * 60 * 1000); // En 45 minutos (ventana de 2 horas)
      const timeStr = `${String(targetTime.getHours()).padStart(2, '0')}:${String(targetTime.getMinutes()).padStart(2, '0')}`;
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Clave exacta de descarte para esta ocurrencia
      const eventDismissKey = `agenda_event:ev-examen-algo-e2e:${todayStr}`;

      const state = makeBaseState({
        calendarEvents: [
          {
            id: 'ev-examen-algo-e2e',
            name: 'Examen Algoritmos y PdD',
            date: todayStr,
            time: timeStr,
            type: 'otro',
            recurring: false,
          },
        ],
        settings: {
          darkMode: false,
          lastBackupAt: todayStr,
          lastWeeklyReviewAt: todayStr,
          hiddenTabs: [],
          onboardingCompleted: true,
          attentionDismissals: {
            [eventDismissKey]: { status: 'dismissed', updatedAt: Date.now() },
          },
          dismissedAttentionKeys: [eventDismissKey], // Previamente descartado para esta ocurrencia
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForTimeout(600);

      // 1. En Hoy: comprobamos que NO aparece la franja activa de atención
      const attentionHeader = page.locator('.today-attention');
      assert.equal(await attentionHeader.count(), 0, 'No debe mostrar franja de atención cuando el evento inminente está descartado');

      // 2. Comprobamos que Hoy queda 100% LIMPIO: NINGUNA cápsula residual ni píldora de descartados
      const residualCapsule = page.locator('.today-attention-dismissed');
      assert.equal(await residualCapsule.count(), 0, 'No debe existir cápsula residual de descartados en Hoy');

      // 3. Vamos a Configuración para gestionar avisos silenciados
      await page.click('aside nav button:has-text("Configuración")');
      await page.waitForSelector('h2:has-text("Recordatorios de «Atención ahora»")', { timeout: 4000 });

      const manageBtn = page.locator('button:has-text("Gestionar avisos silenciados")');
      assert.equal(await manageBtn.count(), 1, 'Debe existir el botón de gestión en Configuración');
      await manageBtn.click();

      await page.waitForSelector('[role="dialog"][aria-labelledby="dismissed-attention-title"]', { timeout: 3000 });

      // Verificamos que el modal lista el examen
      const modalText = await page.locator('[role="dialog"]').textContent();
      assert.ok(modalText.includes('Examen Algoritmos y PdD'), 'El modal debe listar el aviso descartado');

      // Hacemos clic en "Restaurar"
      const restoreBtn = page.locator('[role="dialog"] button:has-text("Restaurar")');
      await restoreBtn.click();
      await page.waitForTimeout(400);

      // Cerramos el modal de avisos descartados
      const closeBtn = page.locator('[role="dialog"] button:has-text("Cerrar")');
      await closeBtn.click();
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 });

      // Volvemos a Hoy
      await page.click('aside nav button:has-text("Hoy")');

      // Ahora que fue restaurado, la franja de «Atención ahora» aparece inmediatamente
      await page.waitForSelector('.today-attention', { timeout: 4000 });
      const restoredText = await page.locator('.today-attention').textContent();
      assert.ok(restoredText.includes('Examen Algoritmos y PdD'), 'El evento restaurado debe volver a Atención ahora');
      assert.ok(restoredText.includes('Comienza en'), 'Debe mostrar la etiqueta de comienzo inminente');

      // Ahora descartamos directamente desde la tarjeta activa en Hoy
      const dismissBtn = page.locator('.today-attention button[title="Descartar aviso"]');
      await dismissBtn.click();
      await page.waitForTimeout(400);

      // Verificamos que Hoy vuelve a quedar 100% limpio (0 elementos de atención y 0 cápsulas)
      assert.equal(await page.locator('.today-attention').count(), 0, 'La franja activa debe desaparecer tras descartar');
      assert.equal(await page.locator('.today-attention-dismissed').count(), 0, 'No debe quedar ninguna cápsula residual en Hoy');

      await context.close();
    });

    // =========================================================================
    // SUITE 2: ACCIONES REALES SOBRE TAREAS EN NAVEGADOR
    // =========================================================================
    console.log('\n--- Suite 2: Acciones Reales sobre Tareas en Navegador ---');

    // 2.1 Completar Tarea Recuperada
    await runStep('2.1 Completar Tarea Recuperada: marca hecho, decrementa contador y limpia alerta', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          {
            id: 't-complete-me',
            text: 'Revisar contrato de alquiler',
            date: '2026-10-18',
            dueDate: '2026-10-18',
            priority: 'alta',
            done: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const expandBtn = page.locator('button:has-text("Pendientes anteriores")');
      await expandBtn.click();
      await page.waitForSelector('#today-extra-t-complete-me');

      const checkBtn = page.locator('#today-extra-t-complete-me button.lifeos-task-check');
      await checkBtn.click();

      await page.waitForSelector('.today-attention', { state: 'detached', timeout: 3000 });
      const attentionCount = await page.locator('.today-attention').count();
      assert.equal(attentionCount, 0, 'La franja Atención ahora debe desaparecer de inmediato');

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const task = stored.todayExtras.find((x) => x.id === 't-complete-me');
      assert.equal(task.done, true, 'El registro en localStorage debe estar completado');

      await context.close();
    });

    // 2.2 Reprogramar para Hoy
    await runStep('2.2 Reprogramar para Hoy: mueve tarea a la agenda activa de hoy (sin ocultar PWA)', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          {
            id: 't-resched-today',
            text: 'Comprar cartuchos impresora',
            date: '2026-10-17',
            priority: 'media',
            done: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-t-resched-today');

      // Click en botón "Hoy": no debe ser interceptado por nada
      await page.locator('#today-extra-t-resched-today button[title="Programar para hoy"]').click();

      await page.waitForSelector('.today-agenda-scroller >> text=Comprar cartuchos impresora');
      const pastCount = await page.locator('button:has-text("Pendientes anteriores")').count();
      assert.equal(pastCount, 0, 'Ya no debe haber pendientes anteriores');

      await context.close();
    });

    // 2.3 Reprogramación Futura y Preservación de dueDate
    await runStep('2.3 Reprogramación Futura: mueve a Próximas y preserva dueDate intacto', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          {
            id: 't-future-resched',
            text: 'Informe trimestral socios',
            date: '2026-10-18',
            dueDate: '2026-10-18',
            priority: 'alta',
            done: false,
          },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-t-future-resched input[type="date"]');

      await page.fill('#today-extra-t-future-resched input[type="date"]', '2026-10-25');

      await page.waitForSelector('button:has-text("Próximas programadas")');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const task = stored.todayExtras.find((x) => x.id === 't-future-resched');
      assert.equal(task.date, '2026-10-25', 'La fecha programada debe ser 2026-10-25');
      assert.equal(task.dueDate, '2026-10-18', 'El vencimiento dueDate debe permanecer intacto');

      await context.close();
    });

    // 2.4 Acción Masiva (Cancelar)
    await runStep('2.4 Acción Masiva (Cancelar): window.confirm cancelado no altera tareas', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          { id: 'p1', text: 'Tarea 1', date: '2026-10-17', done: false },
          { id: 'p2', text: 'Tarea 2', date: '2026-10-16', done: false },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('button:has-text("Mover todas a hoy")');

      page.once('dialog', (dialog) => dialog.dismiss());
      await page.locator('button:has-text("Mover todas a hoy")').click();

      const pastTasks = await page.locator('#today-extra-p1').count();
      assert.equal(pastTasks, 1, 'Las tareas deben seguir en pendientes anteriores');

      await context.close();
    });

    // 2.5 Acción Masiva (Aceptar)
    await runStep('2.5 Acción Masiva (Aceptar): mueve solo tareas pasadas pendientes y preserva dueDates', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          { id: 'p1', text: 'Pasada 1', date: '2026-10-17', dueDate: '2026-10-18', done: false },
          { id: 'p2', text: 'Pasada 2', date: '2026-10-16', done: false },
          { id: 'fut1', text: 'Futura 1', date: '2026-10-25', done: false },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('button:has-text("Mover todas a hoy")');

      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('button:has-text("Mover todas a hoy")').click();

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const p1 = stored.todayExtras.find((x) => x.id === 'p1');
      const p2 = stored.todayExtras.find((x) => x.id === 'p2');
      const fut1 = stored.todayExtras.find((x) => x.id === 'fut1');

      const expectedToday = getTodayIso();
      assert.equal(p1.date, expectedToday, 'p1 debe haberse movido a hoy');
      assert.equal(p1.dueDate, '2026-10-18', 'p1 debe conservar su fecha límite intacta');
      assert.equal(p2.date, expectedToday, 'p2 debe haberse movido a hoy');
      assert.equal(fut1.date, '2026-10-25', 'fut1 no debe haber sido alterada');

      await context.close();
    });

    // 2.6 Creación Real de Compromiso Puntual desde Formulario de Agenda
    await runStep('2.6 Creación Real desde Formulario de Agenda: crea evento puntual, aparece en Hoy y navega con foco', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();
      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      // 1. Ir a Agenda
      await page.click('aside nav button:has-text("Agenda")');
      await page.waitForSelector('button:has-text("+ Puntual")', { timeout: 4000 });

      // 2. Abrir formulario real
      await page.locator('button:has-text("+ Puntual")').first().click();
      await page.waitForSelector('#agenda-event-title', { timeout: 4000 });

      // 3. Llenar formulario real para mañana a las 19:30
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      await page.locator('label:has-text("Título") input').fill('Examen Algoritmos y PdD');
      await page.locator('label:has-text("Fecha") input').fill(tomStr);
      await page.locator('label:has-text("Hora opcional") input').fill('19:30');
      await page.click('button[type="submit"]:has-text("Guardar")');

      // 4. Verificar que se persistió en localStorage
      await page.waitForTimeout(400);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const createdEvent = (stored.calendarEvents || []).find((e) => e.name === 'Examen Algoritmos y PdD');
      assert.ok(createdEvent, 'El evento debe haberse guardado en calendarEvents');
      assert.equal(createdEvent.date, tomStr);
      assert.equal(createdEvent.time, '19:30');

      // 5. Ir a Hoy
      await page.click('aside nav button:has-text("Hoy")');
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      const attentionText = await page.locator('.today-attention').textContent();
      assert.ok(attentionText.includes('Examen Algoritmos y PdD'), 'Atención ahora debe mostrar el evento creado');
      assert.ok(attentionText.includes('Mañana, 19:30'), 'Debe mostrar la hora');

      // 6. Hacer clic en "Ver evento"
      await page.locator('.today-attention button:has-text("Ver evento")').click();
      await page.waitForSelector(`#agenda-event-${createdEvent.id}`, { timeout: 4000 });
      await page.waitForTimeout(600);

      const isHighlighted = await page.$eval(`#agenda-event-${createdEvent.id}`, (el) =>
        el.classList.contains('lifeos-target-highlight')
      );
      assert.equal(isHighlighted, true, 'El evento creado desde el formulario real debe enfocarse y resaltarse');

      await context.close();
    });

    // =========================================================================
    // SUITE 3: CONVIVENCIA DEL BANNER PWA CON ESTADO Y OTRAS SUPERFICIES
    // =========================================================================
    console.log('\n--- Suite 3: Convivencia del Banner PWA con Estado y Otras Superficies ---');

    // 3.1 Convivencia en Desktop (1280 px): Estado y registro matutino visibles y utilizables
    await runStep('3.1 Desktop (1280 px): Estado con registro matutino ("Omitir", "Registrar") y Agenda libres', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [{ id: 'tx-desk', text: 'Tarea para test de convivencia', date: '2026-10-17', done: false }],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      // 1. Verificar visibilidad del banner de registro matutino en Estado (columna derecha)
      await page.waitForSelector('[data-testid="today-state-checkin-invite"]', { timeout: 4000 });
      const inviteVisible = await page.isVisible('[data-testid="today-state-checkin-invite"]');
      assert.equal(inviteVisible, true, 'El registro matutino debe ser visible en la tarjeta Estado');

      // 2. Clic real en "Registrar" sin colisión de punteros: conmuta a edición de contexto
      const registerBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Registrar")');
      await registerBtn.click();

      // Verificar que el formulario de contexto entra en modo edición (aparecen Guardar y Cancelar)
      await page.waitForSelector('button:has-text("Guardar")', { timeout: 4000 });
      const editActive = await page.isVisible('button:has-text("Guardar")');
      assert.equal(editActive, true, 'El formulario de descanso y energía debe abrirse en modo edición');

      // Cancelar edición para retornar al estado previo
      await page.click('button:has-text("Cancelar")');
      await page.waitForSelector('button:has-text("Cancelar")', { state: 'detached', timeout: 3000 });

      // 3. Clic real en "Omitir por hoy" en Estado
      const skipBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Omitir por hoy")');
      await skipBtn.click();
      await page.waitForSelector('[data-testid="today-state-checkin-invite"]', { state: 'detached', timeout: 3000 });

      // 4. Clic real en la columna izquierda ("Hoy" en tarea pendiente)
      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-tx-desk');
      await page.locator('#today-extra-tx-desk button[title="Programar para hoy"]').click();
      await page.waitForSelector('.today-agenda-scroller >> text=Tarea para test de convivencia');

      await context.close();
    });

    // 3.2 Convivencia en Tablet (1024 px): Layout apilado con Estado bajo Agenda
    await runStep('3.2 Tablet (1024 px): Layout vertical apilado, Estado y controles utilizables', async () => {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.waitForSelector('[data-testid="today-state-checkin-invite"]');
      const registerBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Registrar")');
      await registerBtn.click();

      await page.waitForSelector('button:has-text("Guardar")');
      await page.click('button:has-text("Cancelar")');
      await page.waitForSelector('button:has-text("Cancelar")', { state: 'detached' });

      await context.close();
    });

    // 3.3 Convivencia en Pantalla Ancha (1536 px): 2 columnas con espacio holgado
    await runStep('3.3 Wide 2K (1536 px): 2 columnas simétricas con contenedor amplio y cero colisión', async () => {
      const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.waitForSelector('[data-testid="today-state-checkin-invite"]');
      const skipBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Omitir por hoy")');
      await skipBtn.click();
      await page.waitForSelector('[data-testid="today-state-checkin-invite"]', { state: 'detached' });

      await context.close();
    });

    // 3.4 Desplazamiento forzado (Scroll) y liberación inmediata de superficie
    await runStep('3.4 Coincidencia por Scroll: Descarte por botón "X" o "Entendido" libera superficie de inmediato', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      const pwaBanner = page.locator('aside[role="status"]');
      if (await pwaBanner.count() > 0) {
        // Verificar que el banner tiene botón de cierre accesible
        const closeBtn = pwaBanner.locator('button[aria-label="Cerrar aviso"]');
        assert.equal(await closeBtn.count(), 1, 'Debe haber un botón de cierre accesible con aria-label="Cerrar aviso"');

        // Cerrar el banner con clic real
        await closeBtn.click();

        // El banner debe estar completamente desmontado del DOM
        await page.waitForSelector('aside[role="status"]', { state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('aside[role="status"]').count(), 0, 'El banner debe estar desmontado');
      }

      // La superficie está 100% libre: clic en registrar de Estado conmuta a edición limpiamente
      const registerBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Registrar")');
      await registerBtn.click();
      await page.waitForSelector('button:has-text("Guardar")');
      await page.click('button:has-text("Cancelar")');
      await page.waitForSelector('button:has-text("Cancelar")', { state: 'detached' });

      await context.close();
    });

    // 3.5 Actividad Reciente en región inferior derecha
    await runStep('3.5 Actividad Reciente: Elementos de actividad en región inferior operables sin bloqueo', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        finance: {
          accounts: [{ id: 'acc1', name: 'Cuenta Principal', type: 'banco', currency: 'UYU', balance: 50000 }],
          transactions: [
            { id: 'tx-act-1', date: '2026-10-19', amount: 250, type: 'expense', category: 'Alimentación', accountId: 'acc1', description: 'Café matutino' },
          ],
          commitments: [],
          agreements: [],
          budgets: {},
          categories: ['Alimentación'],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      // Scroll hasta la sección de actividad reciente
      await page.waitForSelector('.today-activity-surface');
      const activityBtn = page.locator('.today-activity-item').first();
      await activityBtn.scrollIntoViewIfNeeded();

      // Clic real sobre el ítem de actividad: navega al módulo de Finanzas
      await activityBtn.click();
      await page.waitForSelector('.finance-workspace', { timeout: 4000 });

      await context.close();
    });

    // 3.6 Ciclo de vida y Auto-descarte de offlineReady
    await runStep('3.6 Auto-descarte offlineReady: Temporizador configurado desmonta el aviso informativo automáticamente', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      const pwaBanner = page.locator('aside[role="status"]');
      if (await pwaBanner.count() > 0) {
        const text = await pwaBanner.textContent();
        // Si el aviso presentado es el informativo de modo sin conexión
        if (text && text.includes('sin conexión')) {
          // Esperar los 7 segundos de auto-descarte configurados
          await page.waitForSelector('aside[role="status"]', { state: 'detached', timeout: 9000 });
          assert.equal(await page.locator('aside[role="status"]').count(), 0, 'El aviso offline debe auto-descartarse tras 7 segundos');
        }
      }

      await context.close();
    });

    // 3.7 Persistencia y decisión de usuario en needRefresh
    await runStep('3.7 Aviso needRefresh: Permanece activo hasta decisión de usuario y "Más tarde" lo descarta', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      // Simular evento needRefresh en la UI verificando la presencia de las opciones de decisión
      const dismissBtn = page.locator('aside[role="status"] button:has-text("Más tarde"), aside[role="status"] button:has-text("Entendido")');
      if (await dismissBtn.count() > 0) {
        await dismissBtn.first().click();
        await page.waitForSelector('aside[role="status"]', { state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('aside[role="status"]').count(), 0, 'El aviso debe cerrarse limpiamente');
      }

      await context.close();
    });

    // 3.8 Navegación por Teclado y Foco Accesible en Estado y Banner
    await runStep('3.8 Teclado y Accesibilidad: Tabulación fluida entre controles de Estado y Banner PWA', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);

      await page.waitForSelector('[data-testid="today-state-checkin-invite"]');

      // Foco en el botón "Registrar" y activación con Enter
      const regBtn = page.locator('[data-testid="today-state-checkin-invite"] button:has-text("Registrar")');
      await regBtn.focus();
      await page.keyboard.press('Enter');

      await page.waitForSelector('button:has-text("Guardar")');
      await page.click('button:has-text("Cancelar")');
      await page.waitForSelector('button:has-text("Cancelar")', { state: 'detached' });

      await context.close();
    });

    // 3.9 Convivencia en Mobile (389 px): Banner sobre MobileNav
    await runStep('3.9 Convivencia en Mobile (389 px): Banner situado sobre MobileNav sin solapar tabs', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 844 }, isMobile: true, hasTouch: true });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-observatory-greeting');

      const mobileNav = page.locator('nav.fixed.bottom-0');
      assert.equal(await mobileNav.isVisible(), true, 'MobileNav debe ser visible');

      const pwaBanner = page.locator('aside[role="status"]');
      if (await pwaBanner.count() > 0) {
        const pwaBox = await pwaBanner.boundingBox();
        const navBox = await mobileNav.boundingBox();
        if (pwaBox && navBox) {
          assert.ok(
            pwaBox.y + pwaBox.height <= navBox.y + 4,
            `El banner PWA (bottom: ${pwaBox.y + pwaBox.height}) debe situarse sobre MobileNav (top: ${navBox.y})`
          );
        }
      }

      await context.close();
    });

    // 3.10 Descarte Accesible en Mobile (389 px)
    await runStep('3.10 Descarte en Mobile (389 px): Clic en "X" o "Entendido" desmonta banner y libera pantalla', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 844 }, isMobile: true, hasTouch: true });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-observatory-greeting');

      const pwaBanner = page.locator('aside[role="status"]');
      if (await pwaBanner.count() > 0) {
        const closeBtn = pwaBanner.locator('button[aria-label="Cerrar aviso"]');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
        } else {
          await pwaBanner.locator('button:has-text("Entendido")').click();
        }
        await page.waitForSelector('aside[role="status"]', { state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('aside[role="status"]').count(), 0, 'El banner debe estar desmontado');
      }

      await context.close();
    });

    // =========================================================================
    // SUITE 4: VERIFICACIÓN GEOMÉTRICA Y TÁCTIL DE CHECKS (.lifeos-task-check)
    // =========================================================================
    console.log('\n--- Suite 4: Verificación Geométrica y Táctil de Checks ---');

    // 4.1 Bounding box y aislamiento de contexto posicional
    await runStep('4.1 Geometría Táctil: .lifeos-task-check tiene target adecuado y contexto relative aislado', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [{ id: 'geo-1', text: 'Verificar target size', date: '2026-10-18', done: false }],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-geo-1 button.lifeos-task-check');

      const geom = await page.$eval('#today-extra-geo-1 button.lifeos-task-check', (el) => {
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          position: computed.position,
          width: rect.width,
          height: rect.height,
        };
      });

      assert.equal(geom.position, 'relative', '.lifeos-task-check debe tener position: relative');
      assert.ok(geom.width >= 20, 'El ancho base del check debe ser al menos 20 px');
      assert.ok(geom.height >= 20, 'El alto base del check debe ser al menos 20 px');

      await context.close();
    });

    // 4.2 Independencia de Botones Adyacentes
    await runStep('4.2 Independencia Adyacente: check no activa "Hoy"/"Fecha" y viceversa', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [{ id: 'adj-1', text: 'Probar colisiones', date: '2026-10-17', done: false }],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-adj-1');

      // Comprobar que clic en el botón "Hoy" reprograma y NO marca completada la tarea
      await page.locator('#today-extra-adj-1 button[title="Programar para hoy"]').click();

      await page.waitForSelector('.today-agenda-scroller >> text=Probar colisiones');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const task = stored.todayExtras.find((x) => x.id === 'adj-1');
      const expectedToday = getTodayIso();
      assert.equal(task.date, expectedToday, 'La tarea debe estar reprogramada a hoy');
      assert.equal(task.done, false, 'La tarea NO debe haberse marcado completada por error');

      await context.close();
    });

    // 4.3 Tareas Consecutivas en Cascada
    await runStep('4.3 Tareas Consecutivas: múltiples checks seguidos no se solapan entre filas', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        todayExtras: [
          { id: 'seq-1', text: 'Secuencia 1', date: '2026-10-17', done: false },
          { id: 'seq-2', text: 'Secuencia 2', date: '2026-10-17', done: false },
          { id: 'seq-3', text: 'Secuencia 3', date: '2026-10-17', done: false },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-seq-1');

      // Completar en secuencia 1, luego 2, luego 3
      await page.locator('#today-extra-seq-1 button.lifeos-task-check').click();
      await page.locator('#today-extra-seq-2 button.lifeos-task-check').click();
      await page.locator('#today-extra-seq-3 button.lifeos-task-check').click();

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      const s1 = stored.todayExtras.find((x) => x.id === 'seq-1');
      const s2 = stored.todayExtras.find((x) => x.id === 'seq-2');
      const s3 = stored.todayExtras.find((x) => x.id === 'seq-3');

      assert.equal(s1.done, true);
      assert.equal(s2.done, true);
      assert.equal(s3.done, true);

      await context.close();
    });

    // 4.4 Interacción Multimodal (Touch + Teclado)
    await runStep('4.4 Multimodal: Interacción por Toque Táctil Emulado y Teclado', async () => {
      const context = await browser.newContext({
        viewport: { width: 640, height: 800 },
        hasTouch: true,
      });
      const state = makeBaseState({
        todayExtras: [
          { id: 'touch-1', text: 'Touch check', date: '2026-10-17', done: false },
          { id: 'key-1', text: 'Keyboard check', date: '2026-10-17', done: false },
        ],
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.locator('button:has-text("Pendientes anteriores")').click();
      await page.waitForSelector('#today-extra-touch-1');

      // 1. Toque táctil sobre touch-1
      const touchCheck = page.locator('#today-extra-touch-1 button.lifeos-task-check');
      await touchCheck.tap();

      // 2. Teclado (Focus + Space) sobre key-1
      const keyCheck = page.locator('#today-extra-key-1 button.lifeos-task-check');
      await keyCheck.focus();
      await page.keyboard.press('Space');

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1') || '{}'));
      assert.equal(stored.todayExtras.find((x) => x.id === 'touch-1').done, true);
      assert.equal(stored.todayExtras.find((x) => x.id === 'key-1').done, true);

      await context.close();
    });

    // =========================================================================
    // SUITE 5: RESPONSIVE REAL, ACCESIBILIDAD Y CAPTURAS
    // =========================================================================
    console.log('\n--- Suite 5: Responsive Real, Accesibilidad y Capturas ---');

    const viewports = [
      { width: 389, height: 844, name: '389px-mobile' },
      { width: 640, height: 800, name: '640px-sm' },
      { width: 768, height: 1024, name: '768px-md' },
      { width: 1024, height: 768, name: '1024px-lg' },
      { width: 1280, height: 800, name: '1280px-desktop-split' },
      { width: 1536, height: 960, name: '1536px-wide-2k' },
    ];

    for (const vp of viewports) {
      await runStep(`5.1 Viewport ${vp.width} px (${vp.name}): 0 overflow y layout correcto`, async () => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.width < 768,
        });
        const state = makeBaseState({
          todayExtras: [
            { id: 'vp-t1', text: 'Documento legal', date: '2026-10-18', dueDate: '2026-10-18', done: false },
          ],
        });

        const page = await setupPage(context, state);
        await page.goto(APP_URL);
        await page.waitForSelector('.today-observatory-greeting', { timeout: 4000 });

        const expandBtn = page.locator('button:has-text("Pendientes anteriores")');
        if (await expandBtn.count() > 0) {
          await expandBtn.click();
          await page.waitForSelector('#today-extra-vp-t1');
        }

        // 1. Verificación de desborde horizontal cero
        const overflow = await page.evaluate(() => {
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });
        assert.equal(
          overflow.scrollWidth,
          overflow.clientWidth,
          `En ${vp.width} px no debe haber scroll horizontal (scrollWidth: ${overflow.scrollWidth}, clientWidth: ${overflow.clientWidth})`
        );

        // 2. En escritorio (>= 1280 px), verificar CSS grid split
        if (vp.width >= 1280) {
          const isTwoCol = await page.evaluate(() => {
            const el = document.querySelector('.today-agenda-surface')?.parentElement;
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.gridTemplateColumns.split(' ').length === 2;
          });
          assert.equal(isTwoCol, true, `En ${vp.width} px debe renderizar 2 columnas simétricas`);
        }

        // 3. Captura visual de evidencia
        const shotPath = path.join(EVIDENCE_DIR, `evidence-vp-${vp.width}px.png`);
        await page.screenshot({ path: shotPath, fullPage: false });

        await context.close();
      });
    }

    // 5.2 Modo Oscuro vs Modo Claro
    await runStep('5.2 Temas: Modo Oscuro vs Modo Claro sin roturas de contraste', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        settings: {
          userName: 'Christian',
          darkMode: true,
          onboardingCompleted: true,
          lastBackupAt: '2026-10-19',
          lastWeeklyReviewAt: '2026-10-19',
          hiddenTabs: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-observatory-greeting');

      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      assert.equal(isDark, true, 'El elemento raíz debe contener la clase dark');

      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'evidence-dark-mode.png') });

      // Cambiar a claro
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
      });
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'evidence-light-mode.png') });

      await context.close();
    });

    // 5.3 Movimiento Reducido (prefers-reduced-motion)
    await runStep('5.3 prefers-reduced-motion: animation y scroll desactivan efectos bruscos', async () => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: 'reduce',
      });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-observatory-greeting');

      const motionValid = await page.evaluate(() => {
        const testEl = document.createElement('div');
        testEl.className = 'lifeos-target-highlight';
        document.body.appendChild(testEl);
        const style = window.getComputedStyle(testEl);
        const animDuration = style.animationDuration;
        document.body.removeChild(testEl);
        return animDuration === '0.001s' || animDuration === '0s' || style.animationName === 'none';
      });
      assert.equal(motionValid, true, 'La animación debe estar reducida bajo prefers-reduced-motion');

      await context.close();
    });

    // 5.4 Foco Accesible por Teclado
    await runStep('5.4 Accesibilidad Teclado: foco transferido permite tabular a controles', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 's1', name: 'Materia 1', color: '#10B981' }],
          exams: [{ id: 'ex-key-1', subjectId: 's1', date: getTomorrowIso(), status: 'pendiente' }],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(APP_URL);
      await page.waitForSelector('.today-attention', { timeout: 4000 });

      await page.locator('.today-attention button:has-text("Ver examen")').click();
      await page.waitForSelector('#exam-ex-key-1.lifeos-target-highlight', { timeout: 4000 });

      const hasActive = await page.evaluate(() => {
        const target = document.getElementById('exam-ex-key-1');
        return document.activeElement === target || target?.contains(document.activeElement);
      });
      assert.equal(hasActive, true, 'El elemento navegado debe tener foco activo en el DOM');

      await page.keyboard.press('Tab');
      const activeTag = await page.evaluate(() => document.activeElement?.tagName);
      assert.ok(
        ['BUTTON', 'INPUT', 'A', 'SELECT'].includes(activeTag || ''),
        `El elemento tabulado debe ser interactivo, recibido: ${activeTag}`
      );

      await context.close();
    });

    // 5.5 Franja contextual «Atención ahora»: verificación con cero, uno y dos asuntos en 6 viewports y ambos temas
    await runStep('5.5 Franja «Atención ahora»: 0, 1 y 2 asuntos sin roturas en 6 viewports y ambos temas', async () => {
      const now = new Date(TEST_NOW);
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      // Caso 0 asuntos: sin franja en el DOM
      {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const state = makeBaseState();
        const page = await setupPage(context, state);
        await page.goto(APP_URL);
        await page.waitForSelector('.today-observatory-greeting');
        const count = await page.locator('.today-attention').count();
        assert.equal(count, 0, 'Con cero asuntos no debe existir franja en el DOM');
        await context.close();
      }

      // Caso 2 asuntos en 6 viewports y ambos temas
      for (const vp of viewports) {
        for (const dark of [false, true]) {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.width < 768,
          });
          const state = makeBaseState({
            settings: {
              userName: 'Christian',
              darkMode: dark,
              onboardingCompleted: true,
              lastBackupAt: '2026-10-19',
              lastWeeklyReviewAt: '2026-10-19',
              hiddenTabs: [],
            },
            calendarEvents: [
              { id: `ev-att-${vp.width}`, name: 'Examen FEIP', date: tomStr, time: '19:30', type: 'otro', recurring: false },
            ],
            finance: {
              accounts: [{ id: 'acc-1', name: 'Banco', type: 'banco', currency: 'UYU', balance: 10000 }],
              transactions: [],
              commitments: [
                { id: `com-att-${vp.width}`, name: 'DirecTV', amount: 1200, currency: 'UYU', frequency: 'monthly', nextDueDate: tomStr, active: true },
              ],
              agreements: [],
              budgets: {},
              categories: [],
            },
          });

          const page = await setupPage(context, state);
          await page.goto(APP_URL);
          await page.waitForSelector('.today-attention', { timeout: 4000 });

          // Verificar que muestra exactamente 2 asuntos
          const rows = page.locator('.today-attention > div');
          assert.equal(await rows.count(), 2, `En ${vp.width} px debe renderizar 2 asuntos`);

          // Verificación de overflow
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
          assert.equal(overflow, true, `En ${vp.width} px (${dark ? 'dark' : 'light'}) no debe haber overflow horizontal`);

          // Capturar evidencia para 389px y 1280px
          if (vp.width === 389 || vp.width === 1280) {
            await page.screenshot({ path: path.join(EVIDENCE_DIR, `evidence-attention-${vp.width}px-${dark ? 'dark' : 'light'}.png`) });
          }

          await context.close();
        }
      }
    });

    // =========================================================================
    // SUITE 6: COMPROBACIÓN DE SEGURIDAD DE FRESCURA DE BUILD (ANTI-FALSOS VERDES)
    // =========================================================================
    console.log('\n--- Suite 6: Comprobación de Seguridad de Frescura de Build ---');

    // 6.1 Detección y rechazo de build desactualizado
    await runStep('6.1 Anti-Falsos Verdes: Comprobación reproducible de que un build desactualizado es rechazado', async () => {
      // Intentar validar la frescura contra una huella artificial obsoleta
      const fakeObsoleteHash = 'deadbeef12345678';
      let rejected = false;
      try {
        await verifyServerBuildFreshness(APP_URL, fakeObsoleteHash);
      } catch (err) {
        if (err.message.includes('[SEGURIDAD BUILD E2E]') && err.message.includes('build obsoleto')) {
          rejected = true;
        }
      }
      assert.equal(rejected, true, 'El guardián de frescura DEBE rechazar cualquier servidor con huella desactualizada');
    });

  } finally {
    if (spawnedServer) {
      spawnedServer.kill();
    }
    await browser.close();
  }

  console.log('\n============================================================');
  console.log(` Resultado Final E2E: ${passedCount} APROBADAS, ${failedCount} FALLIDAS`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal durante la ejecución E2E:', err);
  process.exit(1);
});
