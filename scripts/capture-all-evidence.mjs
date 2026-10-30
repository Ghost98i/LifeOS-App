import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';

const PREVIEW_PORT = 5204;
const LAB_PORT = 5205;
const APP_URL = `http://localhost:${PREVIEW_PORT}/`;
const LAB_URL = `http://localhost:${LAB_PORT}/`;
const LAB_DIR = path.resolve('artifacts', 'design-exploration', 'finance-liquid-cockpit');
const SCREENSHOTS_DIR = path.join(LAB_DIR, 'screenshots');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/bda40ca1-3882-4519-94e5-a72e776a6ec9';

for (const dir of [SCREENSHOTS_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToArtifacts(filename) {
  const src = path.join(SCREENSHOTS_DIR, filename);
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
  console.log('--- Starting All Evidence Captures (Real + Lab) ---');
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
    try { execSync(`taskkill /F /T /PID ${previewProcess.pid}`); } catch {}
    labServer.close();
    throw new Error('Preview server did not start');
  }

  const browser = await launchBrowser();

  try {
    // ==========================================
    // 1. CAPTURE REAL PRODUCTION FINANCEHERO
    // ==========================================
    console.log('\n--- Capturing Real Mounted FinanceHero (Production Preview) ---');

    // Real 390px Dark
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildDemoState());
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);
      try {
        const btn = page.locator('button:has-text("Entendido")');
        if (await btn.isVisible({ timeout: 200 })) await btn.click({ force: true });
      } catch {}

      const hero = page.locator('section.finance-surface').first();
      const fn = 'real-financehero-mobile-390-dark.png';
      await hero.screenshot({ path: path.join(SCREENSHOTS_DIR, fn) });
      copyToArtifacts(fn);
      console.log(`✓ Captured: ${fn}`);
      await context.close();
    }

    // Real Desktop 1200px Dark
    {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildDemoState());
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);
      try {
        const btn = page.locator('button:has-text("Entendido")');
        if (await btn.isVisible({ timeout: 200 })) await btn.click({ force: true });
      } catch {}

      const hero = page.locator('section.finance-surface').first();
      const fn = 'real-financehero-desktop-dark.png';
      await hero.screenshot({ path: path.join(SCREENSHOTS_DIR, fn) });
      copyToArtifacts(fn);
      console.log(`✓ Captured: ${fn}`);
      await context.close();
    }

    // ==========================================
    // 2. CAPTURE LAB VARIANTS (A, B, C & Scenarios)
    // ==========================================
    console.log('\n--- Capturing Lab Prototypes (A, B, C & Scenarios) ---');
    const labContext = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: 'dark' });
    const labPage = await labContext.newPage();
    await labPage.goto(LAB_URL);
    await labPage.waitForTimeout(400);

    const simFrame = labPage.locator('#sim-frame');

    async function snap(filename, proto, view, theme, scenario = 'rich', cur = 'UYU') {
      await labPage.evaluate(({ p, v, t, s, c }) => {
        window.switchProto(p);
        window.switchView(v);
        window.switchTheme(t);
        window.switchScenario(s);
        window.toggleCur(c);
      }, { p: proto, v: view, t: theme, s: scenario, c: cur });
      await labPage.waitForTimeout(250);

      const outPath = path.join(SCREENSHOTS_DIR, filename);
      await simFrame.screenshot({ path: outPath });
      copyToArtifacts(filename);
      console.log(`✓ Captured: ${filename}`);
    }

    // A and B on 390px
    await snap('proto-a-mobile-390-dark.png', 'a', 'mobile-390', 'dark', 'rich');
    await snap('proto-b-mobile-390-dark.png', 'b', 'mobile-390', 'dark', 'rich');

    // C Core Matrix
    await snap('c-mobile-390-dark.png', 'c', 'mobile-390', 'dark', 'rich', 'UYU');
    await snap('c-mobile-390-light.png', 'c', 'mobile-390', 'light', 'rich', 'UYU');
    await snap('c-mobile-360-dark.png', 'c', 'mobile-360', 'dark', 'rich', 'UYU');
    await snap('c-desktop-dark.png', 'c', 'desktop', 'dark', 'rich', 'UYU');
    await snap('c-desktop-light.png', 'c', 'desktop', 'light', 'rich', 'UYU');

    // C Currency Verification (UYU vs USD)
    await snap('c-scenario-uyu.png', 'c', 'mobile-390', 'dark', 'multicurrency', 'UYU');
    await snap('c-scenario-usd.png', 'c', 'mobile-390', 'dark', 'multicurrency', 'USD');

    // C Mutually Exclusive States
    await snap('c-scenario-empty.png', 'c', 'mobile-390', 'dark', 'empty', 'UYU'); // State 0
    await snap('c-scenario-negative.png', 'c', 'mobile-390', 'dark', 'negative', 'UYU'); // State 1
    await snap('c-scenario-zerobalance.png', 'c', 'mobile-390', 'dark', 'zerobalance', 'UYU'); // State 2
    await snap('c-scenario-deficit.png', 'c', 'mobile-390', 'dark', 'deficit', 'UYU'); // State 3
    await snap('c-scenario-cushion-compromised.png', 'c', 'mobile-390', 'dark', 'cushion_compromised', 'UYU'); // State 4
    await snap('c-scenario-overcommitted.png', 'c', 'mobile-390', 'dark', 'overcommitted', 'UYU');

    // C Long Amounts
    await snap('c-scenario-longamounts.png', 'c', 'mobile-360', 'dark', 'longamounts', 'UYU');
    await snap('c-scenario-longamounts-390.png', 'c', 'mobile-390', 'dark', 'longamounts', 'UYU');

    await labContext.close();
    console.log('\n✓ All real and prototype evidence captured successfully!');

  } finally {
    await browser.close();
    try {
      if (previewProcess.pid) {
        execSync(`taskkill /F /T /PID ${previewProcess.pid}`);
      }
    } catch {}
    labServer.close();
  }
}

run();
