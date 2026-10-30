import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5205;
const FINANCE_URL = `http://localhost:${TEST_PORT}/?view=finanzas`;
const AUDIT_DIR = path.resolve('artifacts', 'auditorias', 'finanzas-cobros');
const CAPTURA_PATH = path.join(AUDIT_DIR, 'futuro-ingresos-previstos-cobro.png');

if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
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

function buildAuditState() {
  const today = new Date().toISOString().slice(0, 10);
  const dPlus5 = shiftISO(today, 5);
  const dPlus12 = shiftISO(today, 12);
  const dPlus45 = shiftISO(today, 45); // Posterior al horizonte de 30 días

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
      ],
      transactions: [],
      transfers: [],
      categories: [
        { id: 'cat-sueldo', name: 'Sueldo', active: true },
        { id: 'cat-servicios', name: 'Servicios', active: true },
      ],
      budgets: {},
      subscriptions: [],
      debts: [],
      investments: [],
      expectedIncomes: [
        {
          id: 'inc-sueldo',
          name: 'Honorarios Mensuales Principales',
          amount: 45000,
          currency: 'UYU',
          startDate: dPlus5,
          frequency: 'monthly',
          category: 'cat-sueldo',
          accountId: 'acc-itau',
          active: true, // Activo dentro del horizonte
        },
        {
          id: 'inc-consultoria',
          name: 'Consultoría Trimestral Pro',
          amount: 32000,
          currency: 'UYU',
          startDate: dPlus45, // Posterior al horizonte de 30 días
          frequency: 'once',
          category: 'cat-sueldo',
          accountId: 'acc-itau',
          active: true, // Activo pero posterior a 30d
        },
        {
          id: 'inc-pausado',
          name: 'Reembolso por Trámite',
          amount: 4500,
          currency: 'UYU',
          startDate: dPlus12,
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

async function run() {
  console.log('Iniciando captura específica de Futuro (Ingresos previstos y Confirmar cobro)...');
  const server = await startViteServer();
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    const state = buildAuditState();

    await page.goto(FINANCE_URL);
    await page.evaluate(({ st }) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }, { st: state });
    await page.goto(FINANCE_URL);
    await page.waitForTimeout(1000);

    // Ir a pestaña Futuro (índice 3)
    await page.locator('.finance-tab').nth(3).click();
    await page.waitForTimeout(800);

    // Hacer scroll hasta la tarjeta de Ingresos Previstos para que quede perfectamente centrada
    const incomeHeading = page.locator('h3:has-text("Ingresos previstos")');
    await incomeHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Capturar la vista enfocada en la sección de ingresos previstos y compromisos
    await page.screenshot({
      path: CAPTURA_PATH,
      fullPage: false,
    });
    console.log('Captura generada con éxito en:', CAPTURA_PATH);
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
