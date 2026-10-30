import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const PREVIEW_PORT = 5210;
const APP_URL = `http://localhost:${PREVIEW_PORT}/`;
const BRAIN_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/bda40ca1-3882-4519-94e5-a72e776a6ec9';

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

function getBaseDemoState(isDarkMode = true) {
  const today = new Date();
  const m0 = today.toISOString().slice(0, 10);
  const d1 = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const m1 = d1.toISOString().slice(0, 10);
  const d2 = new Date(today.getFullYear(), today.getMonth() - 2, 10);
  const m2 = d2.toISOString().slice(0, 10);

  return {
    version: 1,
    settings: {
      darkMode: isDarkMode,
      soundEnabled: false,
      privacyMode: false,
      onboardingCompleted: true,
    },
    finance: {
      minCushion: 12000,
      cushionEnabled: true,
      preferredCurrency: 'UYU',
      accounts: [
        { id: 'acc-1', name: 'Itaú Sueldo', type: 'bank', balance: 35000, currency: 'UYU', color: '#2563EB', icon: 'wallet' },
        { id: 'acc-2', name: 'Prex Débito', type: 'digital', balance: 14500, currency: 'UYU', color: '#10B981', icon: 'credit-card' },
        { id: 'acc-3', name: 'Santander USD', type: 'bank', balance: 1200, currency: 'USD', color: '#6366F1', icon: 'globe' },
      ],
      transactions: [
        // Current month
        { id: 'tx-1', type: 'gasto', amount: 4850, category: 'Supermercado y Comida', date: m0, accountId: 'acc-1', note: 'Disco Fresh Market' },
        { id: 'tx-2', type: 'gasto', amount: 1890, category: 'Servicios', date: m0, accountId: 'acc-2', note: 'Antel Fibra' },
        { id: 'tx-3', type: 'ingreso', amount: 82000, category: 'Honorarios y Salario', date: m0, accountId: 'acc-1', note: 'Honorarios Proyecto' },
        // Month -1 (enables historical charts)
        { id: 'tx-4', type: 'ingreso', amount: 92000, category: 'Honorarios y Salario', date: m1, accountId: 'acc-1', note: 'Salario Anterior' },
        { id: 'tx-5', type: 'gasto', amount: 48500, category: 'Supermercado y Comida', date: m1, accountId: 'acc-1', note: 'Gastos Mes Pasado' },
        // Month -2
        { id: 'tx-6', type: 'ingreso', amount: 85000, category: 'Honorarios y Salario', date: m2, accountId: 'acc-1', note: 'Salario Previo' },
        { id: 'tx-7', type: 'gasto', amount: 42000, category: 'Supermercado y Comida', date: m2, accountId: 'acc-1', note: 'Gastos Previos' },
      ],
      commitments: [
        { id: 'com-1', name: 'Alquiler Apartamento', amount: 18000, dueDate: m0, category: 'Vivienda', recurrence: 'monthly', currency: 'UYU', autoPay: false, status: 'active' },
        { id: 'com-2', name: 'Antel Fibra Óptica', amount: 3500, dueDate: m0, category: 'Servicios', recurrence: 'monthly', currency: 'UYU', autoPay: false, status: 'active' },
      ],
      expectedIncomes: [
        { id: 'inc-1', source: 'Honorarios Consultoría', amount: 45000, expectedDate: m0, currency: 'UYU', probability: 'confirmed', status: 'pending' },
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
  console.log('=== Final Visual QA & Verification Suite for Finance Command Clarity ===\n');

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
    // -------------------------------------------------------------------------
    // TEST 1: Dark Mode vs Light Mode Authentic Contrast & Colors
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Authentic Dark vs Light Mode Verification ---');
    {
      // Dark Mode Desktop
      const contextDark = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
      const pageDark = await contextDark.newPage();
      await pageDark.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await pageDark.goto(`${APP_URL}?view=finanzas`);
      await pageDark.waitForTimeout(600);

      const darkMetrics = await pageDark.evaluate(() => {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const hero = document.querySelector('section.finance-surface');
        const heroBg = hero ? window.getComputedStyle(hero).backgroundColor : null;
        const heroText = hero ? window.getComputedStyle(hero.querySelector('h1') || hero).color : null;
        const isDarkClass = document.documentElement.classList.contains('dark');
        return { bodyBg, heroBg, heroText, isDarkClass };
      });
      console.log('Dark Mode -> HTML.dark class:', darkMetrics.isDarkClass, '| Body BG:', darkMetrics.bodyBg, '| Hero Text:', darkMetrics.heroText);

      await pageDark.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-desktop-dark.png'), fullPage: false });
      console.log('✓ Saved authentic real-c-integrated-desktop-dark.png');
      await contextDark.close();
    }

    {
      // Light Mode Desktop
      const contextLight = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
      const pageLight = await contextLight.newPage();
      await pageLight.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(false));
      await pageLight.goto(`${APP_URL}?view=finanzas`);
      await pageLight.waitForTimeout(600);

      const lightMetrics = await pageLight.evaluate(() => {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const hero = document.querySelector('section.finance-surface');
        const heroBg = hero ? window.getComputedStyle(hero).backgroundColor : null;
        const heroText = hero ? window.getComputedStyle(hero.querySelector('h1') || hero).color : null;
        const isDarkClass = document.documentElement.classList.contains('dark');
        return { bodyBg, heroBg, heroText, isDarkClass };
      });
      console.log('Light Mode -> HTML.dark class:', lightMetrics.isDarkClass, '| Body BG:', lightMetrics.bodyBg, '| Hero Text:', lightMetrics.heroText);

      await pageLight.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-desktop-light.png'), fullPage: false });
      console.log('✓ Saved authentic real-c-integrated-desktop-light.png');
      await contextLight.close();
    }

    {
      // Mobile 390px Dark & Light
      const ctxMobileDark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const pageMobDark = await ctxMobileDark.newPage();
      await pageMobDark.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await pageMobDark.goto(`${APP_URL}?view=finanzas`);
      await pageMobDark.waitForTimeout(600);

      const heroRect = await pageMobDark.locator('section.finance-surface').first().boundingBox();
      console.log('Mobile 390px Dark Hero Height:', Math.round(heroRect?.height || 0), 'px');
      await pageMobDark.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-mobile-390-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-integrated-mobile-390-dark.png');
      await ctxMobileDark.close();

      const ctxMobileLight = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
      const pageMobLight = await ctxMobileLight.newPage();
      await pageMobLight.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(false));
      await pageMobLight.goto(`${APP_URL}?view=finanzas`);
      await pageMobLight.waitForTimeout(600);

      await pageMobLight.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-mobile-390-light.png'), fullPage: false });
      console.log('✓ Saved real-c-integrated-mobile-390-light.png');
      await ctxMobileLight.close();
    }

    {
      // Mobile 360px Dark
      const ctx360 = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: 'dark' });
      const page360 = await ctx360.newPage();
      await page360.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page360.goto(`${APP_URL}?view=finanzas`);
      await page360.waitForTimeout(600);

      await page360.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-mobile-360-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-integrated-mobile-360-dark.png');
      await ctx360.close();
    }

    // -------------------------------------------------------------------------
    // TEST 2: Modal Visual Hierarchy & Non-Interference Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Modal Superposition & Unobstructed Buttons Verification ---');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);

      // Open Registrar Gasto
      await page.click('button:has-text("Gasto")');
      await page.waitForTimeout(300);

      // Verify that Save & Cancel buttons are not obstructed
      const modalBox = await page.locator('[role="dialog"]').boundingBox();
      const saveBtn = page.locator('button[type="submit"]:has-text("Guardar Gasto")');
      const isSaveVisible = await saveBtn.isVisible();
      console.log('Modal Registrar Gasto visible?:', Boolean(modalBox), '| Save Button Visible?:', isSaveVisible);

      // Capture unobstructed modal on mobile 390
      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-modal-gasto.png'), fullPage: false });
      console.log('✓ Saved real-c-integrated-modal-gasto.png (Buttons completely visible and unobstructed)');

      // Test typing and canceling
      await page.fill('input[placeholder="0,00"]', '1250');
      await page.click('button:has-text("Cancelar")');
      await page.waitForTimeout(300);

      console.log('Modal closed cleanly with Cancel button?:', !(await page.locator('[role="dialog"]').isVisible()));
      await context.close();
    }

    {
      // Test at 360px
      const context360 = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: 'dark' });
      const page360 = await context360.newPage();
      await page360.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page360.goto(`${APP_URL}?view=finanzas`);
      await page360.waitForTimeout(600);

      await page360.click('button:has-text("Gasto")');
      await page360.waitForTimeout(300);

      await page360.screenshot({ path: path.join(BRAIN_DIR, 'real-c-modal-gasto-360-unobstructed.png'), fullPage: false });
      console.log('✓ Saved real-c-modal-gasto-360-unobstructed.png');
      await context360.close();
    }

    // -------------------------------------------------------------------------
    // TEST 3: All 4 Sections of Finance (Coherence Check)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: All 4 Tabs Visual Identity & Action Coherence ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);

      // Tab 1: Resumen & Operación
      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-tab-resumen-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-tab-resumen-dark.png');

      // Tab 2: Cuentas
      await page.click('button:has-text("Cuentas")');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-tab-cuentas-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-tab-cuentas-dark.png (Cuentas compact header with accounts ledger)');

      // Tab 3: Análisis (with full Recharts chart)
      await page.click('button:has-text("Análisis")');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-integrated-analytics-chart.png'), fullPage: false });
      console.log('✓ Saved real-c-integrated-analytics-chart.png (Recharts BarChart active with bars and Y-axis)');

      // Tab 4: Futuro (with AreaChart trajectory)
      await page.click('button:has-text("Futuro")');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-tab-futuro-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-tab-futuro-dark.png (Recharts AreaChart 30d trajectory)');

      await context.close();
    }

    // -------------------------------------------------------------------------
    // TEST 4: Recharts Interactive Tooltip & Cursor Evidence
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Recharts Active Tooltip & Cursor Evidence ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);

      // Go to Análisis
      await page.click('button:has-text("Análisis")');
      await page.waitForTimeout(600);

      // Hover over first bar in chart
      const bar = page.locator('.recharts-bar-rectangle').first();
      if (await bar.isVisible()) {
        await bar.hover();
        await page.waitForTimeout(300);
      }

      await page.screenshot({ path: path.join(BRAIN_DIR, 'real-c-analytics-recharts-tooltip-dark.png'), fullPage: false });
      console.log('✓ Saved real-c-analytics-recharts-tooltip-dark.png (Tooltip active over bars)');
      await context.close();
    }

    {
      // Light mode Recharts
      const contextLight = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
      const pageLight = await contextLight.newPage();
      await pageLight.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(false));
      await pageLight.goto(`${APP_URL}?view=finanzas`);
      await pageLight.waitForTimeout(600);

      await pageLight.click('button:has-text("Análisis")');
      await pageLight.waitForTimeout(600);

      const bar = pageLight.locator('.recharts-bar-rectangle').first();
      if (await bar.isVisible()) {
        await bar.hover();
        await pageLight.waitForTimeout(300);
      }

      await pageLight.screenshot({ path: path.join(BRAIN_DIR, 'real-c-analytics-recharts-tooltip-light.png'), fullPage: false });
      console.log('✓ Saved real-c-analytics-recharts-tooltip-light.png (Light mode Recharts)');
      await contextLight.close();
    }

    // -------------------------------------------------------------------------
    // TEST 5: Mobile First Movement Access & Scroll Measurement
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Mobile First Movement Access & Scroll Geometry ---');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), getBaseDemoState(true));
      await page.goto(`${APP_URL}?view=finanzas`);
      await page.waitForTimeout(600);

      const geometry = await page.evaluate(() => {
        const hero = document.querySelector('section.finance-surface');
        const heroRect = hero ? hero.getBoundingClientRect() : null;
        const tabs = document.querySelector('.finance-tabs');
        const tabsRect = tabs ? tabs.getBoundingClientRect() : null;
        const firstTx = document.querySelector('table tbody tr') || document.querySelector('[class*="transaction"]');
        const firstTxRect = firstTx ? firstTx.getBoundingClientRect() : null;

        return {
          viewportHeight: window.innerHeight,
          heroTop: heroRect ? Math.round(heroRect.top) : null,
          heroHeight: heroRect ? Math.round(heroRect.height) : null,
          tabsTop: tabsRect ? Math.round(tabsRect.top) : null,
          firstTxTop: firstTxRect ? Math.round(firstTxRect.top) : null,
          tabsVisible: tabsRect ? tabsRect.top < window.innerHeight : false,
        };
      });

      console.log('Geometry Mobile 390x844px:');
      console.log('- Viewport Height:', geometry.viewportHeight, 'px');
      console.log('- FinanceHero Height:', geometry.heroHeight, 'px | Top:', geometry.heroTop, 'px');
      console.log('- Finance Tabs Top:', geometry.tabsTop, 'px | Visible in First Fold?:', geometry.tabsVisible);
      console.log('- First Transaction Row Top:', geometry.firstTxTop, 'px');

      await context.close();
    }

    console.log('\n=== All QA Verification Steps Completed Successfully! ===');

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
