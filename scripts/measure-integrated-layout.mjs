import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const PREVIEW_PORT = 5206;
const APP_URL = `http://localhost:${PREVIEW_PORT}/`;

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
    if (fs.existsSync(cand)) return await chromium.launch({ executablePath: cand, headless: true });
  }
  return await chromium.launch({ headless: true });
}

function buildDemoState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    settings: { theme: 'dark', soundEnabled: false, privacyMode: false },
    finance: {
      minCushion: 12000,
      cushionEnabled: true,
      preferredCurrency: 'UYU',
      accounts: [
        { id: 'acc-1', name: 'Itaú Sueldo', type: 'bank', balance: 32500, currency: 'UYU', color: '#2563EB', icon: 'wallet' },
        { id: 'acc-2', name: 'Prex Débito', type: 'digital', balance: 12250, currency: 'UYU', color: '#10B981', icon: 'credit-card' },
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
  console.log('--- Measuring Real Production Full Layout Geometry ---');
  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], { shell: true, stdio: 'pipe' });

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
    throw new Error('Preview server did not start');
  }

  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildDemoState());
    await page.goto(`${APP_URL}?view=finanzas`);
    await page.waitForTimeout(600);

    try {
      const btn = page.locator('button:has-text("Entendido")');
      if (await btn.isVisible({ timeout: 200 })) await btn.click({ force: true });
    } catch {}

    const measurements = await page.evaluate(() => {
      function getGeo(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          top: Math.round(rect.top * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          visibleInViewport: rect.top < window.innerHeight && rect.bottom > 0,
        };
      }

      // PageHeader
      const pageHeader = getGeo('header') || getGeo('[class*="PageHeader"]') || getGeo('h1');
      // FinanceHero
      const hero = getGeo('section.finance-surface');
      // Navigation Tabs
      const tabs = getGeo('.finance-tabs');
      // First transaction row
      const firstTx = getGeo('table tbody tr') || getGeo('[class*="transaction-row"]') || getGeo('.finance-workspace table tr:nth-child(2)');
      // Bottom Nav bar
      const bottomNav = getGeo('nav') || getGeo('[class*="bottom-nav"]') || getGeo('[class*="MobileNavbar"]');

      return {
        viewportHeight: window.innerHeight,
        pageHeader,
        hero,
        tabs,
        firstTx,
        bottomNav,
      };
    });

    console.log('\n--- Production Full Layout (iPhone 390x844px) ---');
    console.log('Viewport Height:', measurements.viewportHeight, 'px');
    console.log('PageHeader Height:', measurements.pageHeader?.height, 'px | Top:', measurements.pageHeader?.top, 'px');
    console.log('FinanceHero Height:', measurements.hero?.height, 'px | Top:', measurements.hero?.top, 'px | Bottom:', measurements.hero?.bottom, 'px');
    console.log('Finance Tabs Top:', measurements.tabs?.top, 'px | Height:', measurements.tabs?.height, 'px');
    console.log('First Tx Row Top:', measurements.firstTx?.top, 'px | Visible in 844px?:', measurements.firstTx?.visibleInViewport);
    console.log('Bottom Nav Bar Top:', measurements.bottomNav?.top, 'px | Height:', measurements.bottomNav?.height, 'px');

    await context.close();

  } finally {
    await browser.close();
    try {
      if (previewProcess.pid) {
        execSync(`taskkill /F /T /PID ${previewProcess.pid}`);
      }
    } catch {}
  }
}

run();
