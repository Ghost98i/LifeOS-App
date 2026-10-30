import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PREVIEW_PORT = 5202;
const LAB_PORT = 5203;
const APP_URL = `http://localhost:${PREVIEW_PORT}/`;
const LAB_URL = `http://localhost:${LAB_PORT}/`;
const LAB_DIR = path.resolve('artifacts', 'design-exploration', 'finance-liquid-cockpit');

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

function createLabServer() {
  const htmlPath = path.join(LAB_DIR, 'index.html');
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath, 'utf8'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(LAB_PORT, () => resolve(server));
  });
}

function buildDemoState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    settings: {
      theme: 'dark',
      soundEnabled: false,
      privacyMode: false,
    },
    finance: {
      minCushion: 12000,
      cushionEnabled: true,
      preferredCurrency: 'UYU',
      accounts: [
        { id: 'acc-1', name: 'Itaú Sueldo', type: 'bank', balance: 32500, currency: 'UYU', color: '#2563EB', icon: 'wallet' },
        { id: 'acc-2', name: 'Prex Débito', type: 'digital', balance: 12250, currency: 'UYU', color: '#10B981', icon: 'credit-card' },
        { id: 'acc-3', name: 'Efectivo Billetera', type: 'cash', balance: 1450, currency: 'USD', color: '#F59E0B', icon: 'banknote' },
      ],
      transactions: [
        { id: 'tx-1', type: 'gasto', amount: 4850, category: 'Supermercado y Comida', date: today, accountId: 'acc-1', note: 'Disco Fresh Market' },
        { id: 'tx-2', type: 'gasto', amount: 1890, category: 'Servicios', date: today, accountId: 'acc-2', note: 'Antel Fibra' },
        { id: 'tx-3', type: 'ingreso', amount: 82000, category: 'Honorarios y Salario', date: today, accountId: 'acc-1', note: 'Honorarios Proyecto' },
      ],
      commitments: [
        { id: 'com-1', name: 'Antel Fibra Óptica', amount: 3500, dueDate: today, category: 'Servicios', recurrence: 'monthly', currency: 'UYU', autoPay: false, status: 'active' },
      ],
      expectedIncomes: [
        { id: 'inc-1', source: 'Honorarios Proyecto', amount: 45000, expectedDate: today, currency: 'UYU', probability: 'confirmed', status: 'pending' },
      ],
      categories: [],
      monthlyBudgets: {},
      transfers: [],
      reconciliations: [],
      debts: [],
      investments: [],
      subscriptions: [],
      agreements: [],
    },
  };
}

async function run() {
  console.log('--- Measuring Real Production FinanceHero vs Lab Prototypes ---');
  const labServer = await createLabServer();
  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], { shell: true, stdio: 'pipe' });

  // Wait for preview
  let started = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok) { started = true; break; }
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!started) {
    previewProcess.kill();
    labServer.close();
    throw new Error('Preview server did not start');
  }

  const browser = await launchBrowser();
  const viewports = [
    { name: '360px (Android)', width: 360, labView: 'mobile-360' },
    { name: '390px (iPhone)', width: 390, labView: 'mobile-390' },
    { name: 'Desktop (1200px)', width: 1200, labView: 'desktop' },
  ];

  const summaryData = [];

  try {
    // 1. MEASURE REAL FINANCEHERO IN PRODUCTION PREVIEW
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((state) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
      }, buildDemoState());

      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);

      // Dismiss banners if present
      try {
        const btn = page.locator('button:has-text("Entendido")');
        if (await btn.isVisible({ timeout: 200 })) await btn.click({ force: true });
      } catch {}

      const realMetrics = await page.evaluate(() => {
        // Find FinanceHero
        const hero = document.querySelector('section.finance-surface');
        if (!hero) return null;
        const rect = hero.getBoundingClientRect();
        return {
          rectHeight: Math.round(rect.height * 10) / 10,
          rectWidth: Math.round(rect.width * 10) / 10,
          offsetHeight: hero.offsetHeight,
        };
      });

      summaryData.push({
        surface: 'FinanceHero Real (Producción)',
        viewport: vp.name,
        rectHeight: realMetrics?.rectHeight || 0,
        rectWidth: realMetrics?.rectWidth || 0,
      });

      await context.close();
    }

    // 2. MEASURE LAB PROTOTYPES (BASELINE, A, B, C)
    const labContext = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: 'dark' });
    const labPage = await labContext.newPage();
    await labPage.goto(LAB_URL);
    await labPage.waitForTimeout(400);

    const protos = [
      { id: 'baseline', name: 'Baseline (Lab Replica)' },
      { id: 'a', name: 'Variante A (Command Surface)' },
      { id: 'b', name: 'Variante B (Financial Clarity)' },
      { id: 'c', name: 'Variante C (Finance Command Clarity)' },
    ];

    for (const vp of viewports) {
      for (const p of protos) {
        await labPage.evaluate(({ proto, v }) => {
          window.switchProto(proto);
          window.switchView(v);
          window.switchScenario('rich');
        }, { proto: p.id, v: vp.labView });
        await labPage.waitForTimeout(150);

        const labMetrics = await labPage.evaluate(() => {
          const el = document.getElementById('cockpit-element');
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            rectHeight: Math.round(rect.height * 10) / 10,
            rectWidth: Math.round(rect.width * 10) / 10,
          };
        });

        summaryData.push({
          surface: p.name,
          viewport: vp.name,
          rectHeight: labMetrics?.rectHeight || 0,
          rectWidth: labMetrics?.rectWidth || 0,
        });
      }
    }

    await labContext.close();

    console.log('\n=============================================================');
    console.log('REAL MEASUREMENTS COMPARISON TABLE (getBoundingClientRect)');
    console.log('=============================================================');
    console.table(summaryData);

  } finally {
    await browser.close();
    try {
      if (previewProcess.pid) {
        import('node:child_process').then(cp => {
          try { cp.execSync(`taskkill /F /T /PID ${previewProcess.pid}`); } catch {}
        });
      }
    } catch {}
    labServer.close();
    process.exit(0);
  }
}

run();
