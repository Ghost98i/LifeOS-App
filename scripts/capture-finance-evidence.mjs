import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5195;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const FINANCE_URL = `http://localhost:${TEST_PORT}/?view=finanzas`;
const LOCAL_EVIDENCE_DIR = path.resolve('artifacts', 'finance-audit-evidence');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/bda40ca1-3882-4519-94e5-a72e776a6ec9';

for (const dir of [LOCAL_EVIDENCE_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToArtifacts(filename) {
  const src = path.join(LOCAL_EVIDENCE_DIR, filename);
  const dst = path.join(ARTIFACT_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
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

function buildRichState(darkMode = true) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const dMinus1 = shiftISO(today, -1);
  const dMinus2 = shiftISO(today, -2);
  const dMinus3 = shiftISO(today, -3);
  const dMinus5 = shiftISO(today, -5);
  const dMinus8 = shiftISO(today, -8);
  const dMinus10 = shiftISO(today, -10);
  const dMinus12 = shiftISO(today, -12);
  const dMinus18 = shiftISO(today, -18);
  const dMinus25 = shiftISO(today, -25);
  const dMinus35 = shiftISO(today, -35);
  const dPlus5 = shiftISO(today, 5);
  const dPlus10 = shiftISO(today, 10);
  const dPlus15 = shiftISO(today, 15);

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
    tasksRecurring: [],
    study: { subjects: [], exams: [], studyLog: [] },
    gym: { weight: [], measurements: [], routineTemplates: [], sessions: [] },
    projects: [],
    finance: {
      minCushion: 12000,
      cushionEnabled: true,
      heroDisplayMode: 'both',
      accounts: [
        { id: 'acc-itau', name: 'Itaú Caja de Ahorro', balance: 34250, currency: 'UYU', lastReconciledAt: dMinus2 },
        { id: 'acc-prex', name: 'Prex Digital', balance: 8400, currency: 'UYU', lastReconciledAt: dMinus5 },
        { id: 'acc-usd', name: 'Santander Dólares', balance: 1450, currency: 'USD', lastReconciledAt: dMinus8 },
        { id: 'acc-efectivo', name: 'Efectivo Billetera', balance: 2100, currency: 'UYU', lastReconciledAt: null },
      ],
      categories: [
        { id: 'cat-comida', name: 'Supermercado y Comida', active: true },
        { id: 'cat-servicios', name: 'Servicios e Impuestos', active: true },
        { id: 'cat-tecnologia', name: 'Tecnología y Trabajo', active: true },
        { id: 'cat-transporte', name: 'Transporte y Movilidad', active: true },
        { id: 'cat-salud', name: 'Salud y Farmacia', active: true },
        { id: 'cat-ocio', name: 'Ocio y Restaurantes', active: true },
        { id: 'cat-hogar', name: 'Hogar y Mantenimiento', active: true },
        { id: 'cat-ingresos', name: 'Honorarios y Salario', active: true },
      ],
      budgets: {
        'cat-comida': 18000,
        'cat-servicios': 8500,
        'cat-ocio': 6000,
        'cat-transporte': 4500,
      },
      monthlyBudgets: {
        [currentMonth]: {
          month: currentMonth,
          currency: 'UYU',
          globalLimit: 42000,
          categoryLimits: {
            'cat-comida': 18000,
            'cat-servicios': 8500,
            'cat-ocio': 6000,
            'cat-transporte': 4500,
          },
        },
      },
      transactions: [
        { id: 'tx-1', type: 'ingreso', amount: 82000, category: 'cat-ingresos', fixed: 'fijo', date: dMinus12, note: 'Cobro honorarios cliente mensual', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-2', type: 'gasto', amount: 4850, category: 'cat-comida', fixed: 'variable', date: dMinus1, note: 'Disco Fresh Market compra semanal', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-3', type: 'gasto', amount: 1890, category: 'cat-servicios', fixed: 'fijo', date: dMinus2, note: 'Antel Fibra Óptica 500Mbps', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-4', type: 'gasto', amount: 2450, category: 'cat-ocio', fixed: 'variable', date: dMinus3, note: 'Cena Bistro Montevideo amigos', accountId: 'acc-prex', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-5', type: 'gasto', amount: 650, category: 'cat-transporte', fixed: 'variable', date: dMinus5, note: 'Recarga tarjeta STM y Uber', accountId: 'acc-prex', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-6', type: 'gasto', amount: 3200, category: 'cat-comida', fixed: 'variable', date: dMinus8, note: 'Tienda Inglesa carnes y verduras', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-7', type: 'gasto', amount: 1250, category: 'cat-salud', fixed: 'variable', date: dMinus8, note: 'Farmashop vitaminas y botiquín', accountId: 'acc-prex', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-8', type: 'gasto', amount: 4200, category: 'cat-hogar', fixed: 'variable', date: dMinus12, note: 'Sodimac reparación canilla y filtros', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-9', type: 'gasto', amount: 2100, category: 'cat-tecnologia', fixed: 'variable', date: dMinus18, note: 'Hub USB-C 8 en 1 escritorio', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-10', type: 'ingreso', amount: 450, category: 'cat-ingresos', fixed: 'variable', date: dMinus5, note: 'Venta consultoría remota', accountId: 'acc-usd', currency: 'USD', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-11', type: 'gasto', amount: 75, category: 'cat-tecnologia', fixed: 'variable', date: dMinus12, note: 'Suscripción Notion Plus anual', accountId: 'acc-usd', currency: 'USD', origin: 'manual', reviewStatus: 'reviewed' },
        // Month minus 1 transactions for comparison
        { id: 'tx-prev-1', type: 'ingreso', amount: 78000, category: 'cat-ingresos', fixed: 'fijo', date: dMinus35, note: 'Cobro honorarios mes anterior', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-prev-2', type: 'gasto', amount: 16500, category: 'cat-comida', fixed: 'variable', date: dMinus35, note: 'Compras mensuales anteriores', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        { id: 'tx-prev-3', type: 'gasto', amount: 8200, category: 'cat-servicios', fixed: 'fijo', date: dMinus35, note: 'UTE + Antel mes anterior', accountId: 'acc-itau', origin: 'manual', reviewStatus: 'reviewed' },
        // Unreviewed / pending review transaction for Inbox
        { id: 'tx-inbox-1', type: 'gasto', amount: 1450, category: 'Varios', fixed: 'variable', date: today, note: 'Devoto Express Pocitos', accountId: 'acc-prex', origin: 'quick-capture', reviewStatus: 'pending' },
      ],
      transfers: [
        { id: 'tr-1', fromAccountId: 'acc-itau', toAccountId: 'acc-prex', amount: 10000, date: dMinus10, note: 'Fondeo Prex para compras cotidianas' },
        { id: 'tr-2', fromAccountId: 'acc-itau', toAccountId: 'acc-efectivo', amount: 3000, date: dMinus18, note: 'Retiro cajero Banred' },
      ],
      reconciliations: [
        { id: 'rec-1', accountId: 'acc-itau', actualBalance: 34250, systemBalance: 34250, difference: 0, date: dMinus2, note: 'Revisión estado de cuenta Itaú' },
        { id: 'rec-2', accountId: 'acc-prex', actualBalance: 8400, systemBalance: 8400, difference: 0, date: dMinus5, note: 'Saldo verificado app Prex' },
      ],
      debts: [
        { id: 'debt-prestamo', name: 'Préstamo Equipamiento Oficina', amount: 28000, monthlyPayment: 3500, dueDate: dPlus10 },
      ],
      investments: [
        { id: 'inv-gletir', name: 'Fondo Renta Fija UYU (Gletir)', amount: 125000 },
        { id: 'inv-letras', name: 'Letras de Regulación Monetaria BCU', amount: 80000 },
      ],
      subscriptions: [
        { id: 'sub-spotify', name: 'Spotify Duo', amount: 390, dueDay: 15 },
        { id: 'sub-gym', name: 'Club Gimnasio Pase Libre', amount: 2400, dueDay: 5 },
      ],
      expectedIncomes: [
        { id: 'inc-salario', name: 'Ingreso Proyecto Alpha (Segunda Cuota)', amount: 45000, currency: 'UYU', startDate: dPlus10, frequency: 'monthly', active: true, accountId: 'acc-itau', category: 'cat-ingresos' },
        { id: 'inc-bonus', name: 'Reembolso Gastos Operativos', amount: 5600, currency: 'UYU', startDate: dPlus15, frequency: 'once', active: true, accountId: 'acc-itau', category: 'cat-ingresos' },
      ],
      commitments: [
        { id: 'com-alquiler', name: 'Alquiler Apartamento + Gastos Comunes', amount: 24500, currency: 'UYU', nextDueDate: dPlus5, frequency: 'monthly', active: true, category: 'cat-hogar', accountId: 'acc-itau', totalOccurrences: null, remainingOccurrences: null, dueDay: 5 },
        { id: 'com-ute', name: 'Factura UTE Consumo Eléctrico', amount: 3400, currency: 'UYU', nextDueDate: dPlus10, frequency: 'monthly', active: true, category: 'cat-servicios', accountId: 'acc-itau', totalOccurrences: null, remainingOccurrences: null, dueDay: 10 },
        { id: 'com-seguro', name: 'Seguro Médico / Emergencia Móvil', amount: 1850, currency: 'UYU', nextDueDate: dPlus15, frequency: 'monthly', active: true, category: 'cat-salud', accountId: 'acc-itau', totalOccurrences: null, remainingOccurrences: null, dueDay: 15 },
      ],
      agreements: [
        {
          id: 'agr-macbook',
          title: 'MacBook Pro M3 Pro 14"',
          creditorName: 'iPlace Montevideo / Visa Itaú',
          currency: 'UYU',
          initialRemainingBalance: 72000,
          initialReferenceDate: dMinus25,
          originalPrincipal: 96000,
          priorPaidAmount: 24000,
          status: 'active',
          schedule: {
            totalInstallments: 12,
            installmentAmount: 8000,
            firstDueDate: dMinus25,
            dueDay: 20,
            frequency: 'monthly',
          },
          acquisition: {
            acquisitionDate: dMinus25,
            category: 'Tecnología y Trabajo',
            totalPurchaseAmount: 96000,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  };
}

function buildEmptyState(darkMode = true) {
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
    tasksRecurring: [],
    study: { subjects: [], exams: [], studyLog: [] },
    gym: { weight: [], measurements: [], routineTemplates: [], sessions: [] },
    projects: [],
    finance: {
      minCushion: 5000,
      cushionEnabled: true,
      heroDisplayMode: 'actual',
      accounts: [],
      categories: [
        { id: 'cat-comida', name: 'Comida', active: true },
        { id: 'cat-servicios', name: 'Servicios', active: true },
        { id: 'cat-varios', name: 'Varios', active: true },
      ],
      budgets: {},
      monthlyBudgets: {},
      transactions: [],
      transfers: [],
      reconciliations: [],
      debts: [],
      investments: [],
      subscriptions: [],
      expectedIncomes: [],
      commitments: [],
      agreements: [],
    },
  };
}

async function run() {
  console.log('--- Starting Preview Server on port ' + TEST_PORT + ' ---');
  const server = spawn('npx', ['vite', 'preview', '--port', String(TEST_PORT)], {
    shell: true,
    stdio: 'pipe',
  });

  let started = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok) {
        started = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (!started) {
    server.kill();
    throw new Error(`Server did not start at ${APP_URL}`);
  }
  console.log('✓ Server active on', APP_URL);

  const browser = await launchBrowser();

  try {
    async function dismissBanners(page) {
      try {
        const dismissBtns = page.locator('button:has-text("Entendido")');
        if (await dismissBtns.first().isVisible({ timeout: 400 })) {
          await dismissBtns.first().click({ force: true });
        }
      } catch {}
    }

    const richDark = buildRichState(true);
    const richLight = buildRichState(false);
    const emptyDark = buildEmptyState(true);

    // 1. DESKTOP DARK - Resumen & Operación (Movimientos)
    console.log('Capture 1: Desktop Dark - Resumen & Operación');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '01-desktop-dark-movimientos.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 2. DESKTOP LIGHT - Resumen & Operación (Movimientos)
    console.log('Capture 2: Desktop Light - Resumen & Operación');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richLight);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '02-desktop-light-movimientos.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 3. DESKTOP DARK - Cuentas & Acuerdos (Tab 'cuentas')
    console.log('Capture 3: Desktop Dark - Cuentas & Acuerdos');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      // Click Cuentas tab
      await page.click('button:has-text("Cuentas")');
      await page.waitForTimeout(400);

      const file = '03-desktop-dark-cuentas.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);

      // Scroll down to capture Financing Agreements & Assets
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(300);
      const fileScroll = '03b-desktop-dark-cuentas-agreements.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileScroll), fullPage: false });
      copyToArtifacts(fileScroll);

      await context.close();
    }

    // 4. DESKTOP DARK - Análisis & Presupuestos (Tab 'analisis')
    console.log('Capture 4: Desktop Dark - Análisis & Presupuestos');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      // Click Analisis tab
      await page.click('button:has-text("Análisis")');
      await page.waitForTimeout(500);

      const file = '04-desktop-dark-analisis.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);

      // Toggle category chart and scroll
      const chartToggle = page.locator('button:has-text("Ver gráfico")');
      if (await chartToggle.isVisible()) {
        await chartToggle.click();
        await page.waitForTimeout(400);
      }
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(300);
      const fileScroll = '04b-desktop-dark-analisis-charts.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileScroll), fullPage: false });
      copyToArtifacts(fileScroll);

      await context.close();
    }

    // 5. DESKTOP DARK - Futuro & Proyecciones (Tab 'proyeccion')
    console.log('Capture 5: Desktop Dark - Futuro & Proyecciones');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      // Click Futuro tab
      await page.click('button:has-text("Futuro")');
      await page.waitForTimeout(500);

      const file = '05-desktop-dark-futuro.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);

      // Scroll to commitments list
      await page.evaluate(() => window.scrollBy(0, 450));
      await page.waitForTimeout(300);
      const fileScroll = '05b-desktop-dark-futuro-commitments.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileScroll), fullPage: false });
      copyToArtifacts(fileScroll);

      await context.close();
    }

    // 6. MOBILE DARK - Resumen & Operación
    console.log('Capture 6: Mobile Dark - Resumen & Operación');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '06-mobile-dark-movimientos.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);

      // Scroll down to transaction table on mobile
      await page.evaluate(() => window.scrollBy(0, 420));
      await page.waitForTimeout(300);
      const fileScroll = '06b-mobile-dark-movimientos-table.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileScroll), fullPage: false });
      copyToArtifacts(fileScroll);

      await context.close();
    }

    // 7. MOBILE LIGHT - Resumen & Operación
    console.log('Capture 7: Mobile Light - Resumen & Operación');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richLight);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '07-mobile-light-movimientos.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 8. MOBILE DARK - Cuentas
    console.log('Capture 8: Mobile Dark - Cuentas');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      await page.click('button:has-text("Cuentas")');
      await page.waitForTimeout(400);

      const file = '08-mobile-dark-cuentas.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 9. MODALS: Transaction, Transfer, Reconcile, Commitment
    console.log('Capture 9a: Modal Transaction');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      await page.click('button:has-text("+ Movimiento")');
      await page.waitForTimeout(400);
      const fileModal1 = '09a-modal-transaction.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileModal1), fullPage: false });
      copyToArtifacts(fileModal1);
      await context.close();
    }

    console.log('Capture 9b: Modal Transfer');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      await page.click('button:has-text("Transferir")');
      await page.waitForTimeout(400);
      const fileModal2 = '09b-modal-transfer.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileModal2), fullPage: false });
      copyToArtifacts(fileModal2);
      await context.close();
    }

    console.log('Capture 9c: Modal Reconcile');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), richDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      await page.click('button:has-text("Cuentas")');
      await page.waitForTimeout(400);
      const reconBtn = page.locator('button:has-text("Conciliar")').first();
      if (await reconBtn.isVisible()) {
        await reconBtn.click();
        await page.waitForTimeout(400);
        const fileModal3 = '09c-modal-reconcile.png';
        await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileModal3), fullPage: false });
        copyToArtifacts(fileModal3);
      }
      await context.close();
    }

    // 10. EMPTY / ONBOARDING SCENARIO
    console.log('Capture 10: Empty State Scenario');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), emptyDark);
      await page.goto(FINANCE_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const fileEmpty1 = '10a-empty-state-movimientos.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileEmpty1), fullPage: false });
      copyToArtifacts(fileEmpty1);

      // Empty cuentas
      await page.click('button:has-text("Cuentas")');
      await page.waitForTimeout(400);
      const fileEmpty2 = '10b-empty-state-cuentas.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileEmpty2), fullPage: false });
      copyToArtifacts(fileEmpty2);

      await context.close();
    }

    console.log('✓ All finance audit evidence captured successfully!');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
