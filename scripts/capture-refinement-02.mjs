import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5202;
const FINANCE_URL = `http://localhost:${TEST_PORT}/?view=finanzas`;
const DELIVERABLE_DIR = path.resolve('artifacts', 'entregas', 'finanzas-refinamiento-02');
const CAPTURAS_DIR = path.join(DELIVERABLE_DIR, 'capturas');

for (const dir of [DELIVERABLE_DIR, CAPTURAS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function launchBrowser() {
  const localAppData = process.env.LOCALAPPDATA;
  const progFiles = process.env.ProgramFiles;
  const progFilesX86 = process.env['ProgramFiles(x86)'];
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\155.0.4283.62\\msedge.exe',
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    progFiles && path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    progFilesX86 && path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return await chromium.launch({ executablePath: cand, headless: true });
    }
  }
  return await chromium.launch({ headless: true });
}

function shiftISO(baseIso, amountDays) {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + amountDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildStateForRefinement({ withExternal = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const dMinus2 = shiftISO(today, -2);
  const dPlus5 = shiftISO(today, 5);
  const dPlus15 = shiftISO(today, 15);
  const dPlus45 = shiftISO(today, 45); // Beyond 30-day horizon!

  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      hiddenTabs: [],
      darkMode: true,
      privacyMode: false,
    },
    todayExtras: [],
    dailyPriorities: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    notes: { items: [], folders: [] },
    calendar: { events: [] },
    jobs: { applications: [], opportunities: [] },
    study: { subjects: [], logs: [], exams: [] },
    resale: { inventory: [], sales: [], opportunities: [] },
    gym: { sessions: [], exercises: [], routines: [] },
    finance: {
      accounts: [
        { id: 'acc-itau', name: 'Itaú Caja de Ahorro', balance: 35000, initialBalance: 35000, currency: 'UYU' },
        { id: 'acc-scotia', name: 'Scotia Ahorros', balance: 15000, initialBalance: 15000, currency: 'UYU' },
      ],
      transactions: [
        {
          id: 'tx-1',
          type: 'ingreso',
          amount: 55000,
          category: 'cat-sueldo',
          date: dMinus2,
          accountId: 'acc-itau',
          note: 'Honorarios profesionales',
          currency: 'UYU',
          reviewStatus: 'reviewed',
          reviewed: true,
        },
        {
          id: 'tx-2',
          type: 'gasto',
          amount: 18000,
          category: 'cat-vivienda',
          date: dMinus2,
          accountId: 'acc-itau',
          note: 'Alquiler mensual',
          currency: 'UYU',
          reviewStatus: 'reviewed',
          reviewed: true,
        },
      ],
      transfers: [],
      categories: [
        { id: 'cat-sueldo', name: 'Sueldo', icon: 'dollarSign', color: '#10b981', active: true },
        { id: 'cat-vivienda', name: 'Vivienda', icon: 'home', color: '#6366f1', active: true },
        { id: 'cat-servicios', name: 'Servicios', icon: 'zap', color: '#f59e0b', active: true },
      ],
      budgets: {},
      subscriptions: [],
      debts: withExternal
        ? [{ id: 'debt-1', name: 'Préstamo Auto', amount: 80000, currency: 'UYU', category: 'Préstamos', active: true }]
        : [],
      investments: withExternal
        ? [{ id: 'inv-1', name: 'Fondo Ganadero', amount: 50000, currency: 'UYU', category: 'Fondos', active: true }]
        : [],
      expectedIncomes: [
        {
          id: 'inc-1',
          name: 'Cobro Freelance Web',
          amount: 22000,
          currency: 'UYU',
          startDate: dPlus15,
          frequency: 'once',
          category: 'cat-sueldo',
          accountId: 'acc-itau',
          active: true,
        },
        {
          id: 'inc-2',
          name: 'Consultoría Trimestral',
          amount: 35000,
          currency: 'UYU',
          startDate: dPlus45,
          frequency: 'once',
          category: 'cat-sueldo',
          accountId: 'acc-itau',
          active: true,
        },
        {
          id: 'inc-3',
          name: 'Reembolso Pausado',
          amount: 4500,
          currency: 'UYU',
          startDate: dPlus5,
          frequency: 'once',
          category: 'cat-servicios',
          accountId: 'acc-itau',
          active: false, // Pausado
        },
      ],
      commitments: [
        {
          id: 'com-fibra',
          name: 'Antel Fibra Óptica',
          amount: 2500,
          currency: 'UYU',
          nextDueDate: dPlus5,
          frequency: 'monthly',
          category: 'cat-servicios',
          accountId: 'acc-itau',
          active: true,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'com-seguro',
          name: 'Seguro Anual BSE',
          amount: 14000,
          currency: 'UYU',
          nextDueDate: dPlus45, // Beyond 30-day horizon!
          frequency: 'monthly',
          category: 'cat-servicios',
          accountId: 'acc-itau',
          active: true,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        },
      ],
      agreements: [],
      reconciliations: [],
      minCushion: 5000,
      cushionEnabled: true,
    },
  };
}

async function startViteServer() {
  const child = spawn('npx', ['vite', '--port', String(TEST_PORT), '--strictPort'], {
    shell: true,
    stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite server start timeout')), 25000);
    child.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Local:') || msg.includes('localhost:')) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });
  return child;
}

async function setupPage(page, state, darkMode = true) {
  await page.goto(FINANCE_URL);
  await page.evaluate(({ st, dark }) => {
    localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, { st: state, dark: darkMode });
  await page.goto(FINANCE_URL);
  await page.waitForTimeout(1000);
}

async function run() {
  console.log('Iniciando servidor Vite para captura de evidencias del refinamiento 02...');
  const server = await startViteServer();
  const browser = await launchBrowser();

  try {
    // 1. Cuentas: Adaptativo Puro (100% liquidez)
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: false });
      await setupPage(page, state, true);

      await page.locator('.finance-tab').nth(1).click();
      await page.waitForTimeout(600);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'cuentas-adaptativo-puro.png'),
        fullPage: false,
      });
      console.log('Capturado: cuentas-adaptativo-puro.png');
      await context.close();
    }

    // 2. Cuentas: Con Activos/Pasivos externos
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: true });
      await setupPage(page, state, true);

      await page.locator('.finance-tab').nth(1).click();
      await page.waitForTimeout(600);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'cuentas-con-activos-pasivos.png'),
        fullPage: false,
      });
      console.log('Capturado: cuentas-con-activos-pasivos.png');
      await context.close();
    }

    // 3. Futuro: Coherencia de Horizonte y Acción "Confirmar cobro"
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: false });
      await setupPage(page, state, true);

      await page.locator('.finance-tab').nth(3).click();
      await page.waitForTimeout(800);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'futuro-horizonte-y-cobro.png'),
        fullPage: false,
      });
      console.log('Capturado: futuro-horizonte-y-cobro.png');
      await context.close();
    }

    // 4. Análisis: Separación conceptual Flujo vs Stock
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: false });
      await setupPage(page, state, true);

      await page.locator('.finance-tab').nth(2).click();
      await page.waitForTimeout(800);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'analisis-flujo-vs-stock.png'),
        fullPage: false,
      });
      console.log('Capturado: analisis-flujo-vs-stock.png');
      await context.close();
    }

    // 5. Resumen: Móvil (390x844) verificando un único signo '+' en botón Movimiento
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: false });
      await setupPage(page, state, true);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'resumen-single-plus-mobile.png'),
        fullPage: false,
      });
      console.log('Capturado: resumen-single-plus-mobile.png');
      await context.close();
    }

    // 6. Resumen: Escritorio (1440x900)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const state = buildStateForRefinement({ withExternal: false });
      await setupPage(page, state, true);

      await page.screenshot({
        path: path.join(CAPTURAS_DIR, 'resumen-single-plus-desktop.png'),
        fullPage: false,
      });
      console.log('Capturado: resumen-single-plus-desktop.png');
      await context.close();
    }

    console.log('Todas las capturas se generaron con éxito.');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
