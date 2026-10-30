import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5198;
const FINANCE_URL = `http://localhost:${TEST_PORT}/?view=finanzas`;
const DELIVERABLE_DIR = path.resolve('artifacts', 'entregas', 'finance-essential-clarity-preview');
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

function buildBaseState({ darkMode = true, hasCommitments = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const dMinus2 = shiftISO(today, -2);
  const dMinus5 = shiftISO(today, -5);
  const dPlus5 = shiftISO(today, 5);
  const dPlus10 = shiftISO(today, 10);

  const commitments = hasCommitments
    ? [
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
          id: 'com-cuota-visa',
          name: 'Cuota Visa Scotia',
          amount: 6500,
          currency: 'UYU',
          nextDueDate: dPlus10,
          frequency: 'monthly',
          category: 'cat-tarjetas',
          accountId: 'acc-scotia',
          active: true,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        },
      ]
    : [];

  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      hiddenTabs: [],
      darkMode: darkMode,
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
        { id: 'acc-itau', name: 'Itaú Caja de Ahorro', balance: 25000, initialBalance: 25000, currency: 'UYU' },
        { id: 'acc-scotia', name: 'Scotia Ahorros', balance: 10000, initialBalance: 10000, currency: 'UYU' },
      ],
      transactions: [
        {
          id: 'tx-1',
          type: 'gasto',
          amount: 1450,
          category: 'cat-supermercado',
          date: dMinus2,
          accountId: 'acc-itau',
          note: 'Compra semanal frutas y verduras',
          currency: 'UYU',
          reviewStatus: 'reviewed',
          reviewed: true,
        },
        {
          id: 'tx-2',
          type: 'ingreso',
          amount: 45000,
          category: 'cat-sueldo',
          date: dMinus5,
          accountId: 'acc-itau',
          note: 'Honorarios profesionales',
          currency: 'UYU',
          reviewStatus: 'reviewed',
          reviewed: true,
        },
      ],
      transfers: [],
      categories: [
        { id: 'cat-supermercado', name: 'Supermercado', icon: 'shoppingCart', color: '#10b981', active: true },
        { id: 'cat-sueldo', name: 'Sueldo', icon: 'dollarSign', color: '#6366f1', active: true },
        { id: 'cat-servicios', name: 'Servicios', icon: 'zap', color: '#f59e0b', active: true },
        { id: 'cat-tarjetas', name: 'Tarjetas', icon: 'creditCard', color: '#ef4444', active: true },
      ],
      budgets: {},
      subscriptions: [],
      debts: [],
      investments: [],
      expectedIncomes: [],
      commitments: commitments,
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

async function run() {
  console.log('Iniciando servidor Vite para captura de evidencias...');
  const server = await startViteServer();
  const browser = await launchBrowser();

  try {
    // 1. Escritorio Oscuro (Sin compromisos - Protagonista Saldo)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: true, hasCommitments: false });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }, state);
      await page.reload();
      await page.waitForTimeout(1000);

      const outPath = path.join(CAPTURAS_DIR, 'escritorio-oscuro.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

    // 2. Escritorio Claro (Sin compromisos)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: false, hasCommitments: false });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }, state);
      await page.reload();
      await page.waitForTimeout(1000);

      const outPath = path.join(CAPTURAS_DIR, 'escritorio-claro.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

    // 3. Móvil Oscuro (iPhone 14: 390x844)
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: true, hasCommitments: false });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }, state);
      await page.reload();
      await page.waitForTimeout(1000);

      const outPath = path.join(CAPTURAS_DIR, 'movil-oscuro.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

    // 4. Móvil Claro (iPhone 14: 390x844)
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: false, hasCommitments: false });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }, state);
      await page.reload();
      await page.waitForTimeout(1000);

      const outPath = path.join(CAPTURAS_DIR, 'movil-claro.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

    // 5. Con Compromisos (Disponible $26.000 + Pendiente este mes -$9.000)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: true, hasCommitments: true });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }, state);
      await page.reload();
      await page.waitForTimeout(1000);

      const outPath = path.join(CAPTURAS_DIR, 'con-compromisos.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

    // 6. Extra diagnóstico: Menú abierto de + Movimiento
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const state = buildBaseState({ darkMode: true, hasCommitments: false });

      await page.goto(FINANCE_URL);
      await page.evaluate((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, state);
      await page.reload();
      await page.waitForTimeout(800);

      const btn = page.locator('button:has-text("+ Movimiento")');
      await btn.click();
      await page.waitForTimeout(300);

      const outPath = path.join(CAPTURAS_DIR, 'movimiento-menu-abierto.png');
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('Captura generada:', outPath);
      await context.close();
    }

  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Error generando capturas:', err);
  process.exit(1);
});
