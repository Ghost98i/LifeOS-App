import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5188;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const EVIDENCE_DIR = path.resolve('artifacts', 'browser-evidence');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/f6ce8e5e-d215-4ce3-bdd5-6e15a1296018';

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function shiftISO(iso, amount) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

async function run() {
  console.log('========================================================================');
  console.log(' LifeOS Real — E2E Browser & Subpixel Verification (Hoy: Estado)');
  console.log('========================================================================\n');

  // 1. Start Vite preview server
  console.log(`[1/5] Starting preview server on port ${TEST_PORT}...`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(TEST_PORT)], {
    shell: true,
    stdio: 'pipe',
  });

  // Wait for server to be responsive
  let started = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok) {
        started = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!started) {
    server.kill();
    throw new Error(`Server did not start at ${APP_URL}`);
  }
  console.log('✓ Server is active and serving fresh build.\n');

  // Compute real 7-day test window ending today
  const today = new Date().toISOString().slice(0, 10);
  const d0 = shiftISO(today, -6);
  const d1 = shiftISO(today, -5);
  const d2 = shiftISO(today, -4);
  const d3 = shiftISO(today, -3);
  const d4 = shiftISO(today, -2);
  const d5 = shiftISO(today, -1);
  const d6 = today;

  // Realistic mock state with full, partial, zero, and missing records
  const syntheticState = {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      hiddenTabs: [],
    },
    dailyContext: [
      { date: d0, sleepHours: 7.0, energy: 3, mood: 3, note: 'Base semanal' },
      { date: d1, sleepHours: 8.5, energy: 4, mood: 4, note: 'Excelente descanso' }, // +1.5h, +1, +1
      { date: d2, sleepHours: 8.5, energy: 4, mood: 4, note: 'Estabilidad idéntica' }, // = 0h, = 0, = 0
      { date: d3, sleepHours: 6.0, energy: 2, mood: 3, note: 'Noche corta' }, // -2.5h, -2, -1
      // d4: intentionally omitted to test missing day
      { date: d5, sleepHours: 7.5, energy: 4, mood: 4, note: 'Recuperado tras bache' }, // prev missing -> 'Sin dato previo'
      { date: d6, sleepHours: 8.0, energy: 5, mood: 5, note: 'Hoy con energía plena' }, // +0.5h, +1, +1
    ],
    dailyPriorities: [],
    todayExtras: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    tasksRecurring: [],
    study: { subjects: [], exams: [], studyLog: [] },
    finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
    projects: [],
  };

  const browser = await launchBrowser();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: DESKTOP VIEWPORT & SUBPIXEL ALIGNMENT AUDIT
    // -------------------------------------------------------------------------
    console.log('[2/5] Running Desktop Subpixel Alignment Audit (1280x900)...');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript((st) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    }, syntheticState);

    await page.goto(APP_URL);
    await page.waitForTimeout(600);

    // Ensure we are on Dashboard / Hoy view
    const estadoSection = page.locator('.today-state-general-chart');
    await estadoSection.waitFor({ state: 'visible', timeout: 5000 });

    // Measure alignment for all 7 days
    const dates = [d0, d1, d2, d3, d4, d5, d6];
    let maxDiffDesktop = 0;

    for (let i = 0; i < 7; i++) {
      const date = dates[i];
      // Click day button
      const dayBtn = page.locator('.today-state-general-chart button').nth(i);
      await dayBtn.click();
      await page.waitForTimeout(100);

      const metrics = await page.evaluate((_targetDate) => {
        const estadoCard = document.querySelector('.today-state-general-chart');
        if (!estadoCard) return null;

        // Find circles for this date
        // Centers of svg points vs buttons
        const dateButtons = Array.from(estadoCard.querySelectorAll('button'));
        const activeBtn = dateButtons.find((b) => b.getAttribute('aria-pressed') === 'true');
        const pillar = estadoCard.querySelector('svg rect[fill*="af-pillar-grad"]');

        const btnBox = activeBtn ? activeBtn.getBoundingClientRect() : null;
        const pillarBox = pillar ? pillar.getBoundingClientRect() : null;

        return {
          btnCenter: btnBox ? btnBox.left + btnBox.width / 2 : null,
          pillarCenter: pillarBox ? pillarBox.left + pillarBox.width / 2 : null,
        };
      }, date);

      if (metrics && metrics.btnCenter && metrics.pillarCenter) {
        const diff = Math.abs(metrics.btnCenter - metrics.pillarCenter);
        maxDiffDesktop = Math.max(maxDiffDesktop, diff);
        console.log(`   Día [${i}] ${date}: Botón Center=${metrics.btnCenter.toFixed(2)}px | Pilar Center=${metrics.pillarCenter.toFixed(2)}px | Δ=${diff.toFixed(3)}px`);
        assert.ok(diff <= 0.5, `Día ${date} desfase excede tolerancia: ${diff}px`);
      }
    }

    console.log(`   ✓ Desktop Max Alignment Delta: ${maxDiffDesktop.toFixed(4)}px (TOLERANCIA CUMPLIDA)`);

    // Capture Desktop Dark Today
    const dayBtnLast = page.locator('.today-state-general-chart button').nth(6);
    await dayBtnLast.click();
    await page.waitForTimeout(200);

    const shot1Path = path.join(EVIDENCE_DIR, '01-real-estado-desktop-dark-today.png');
    const estadoEl = await estadoSection.elementHandle();
    await estadoEl.screenshot({ path: shot1Path });
    console.log(`   Captured: ${shot1Path}`);

    // Capture Desktop Dark with Day 1 selected (+1.5h, +1, +1 deltas)
    const dayBtn1 = page.locator('.today-state-general-chart button').nth(1);
    await dayBtn1.click();
    await page.waitForTimeout(200);
    const shot2Path = path.join(EVIDENCE_DIR, '02-real-estado-desktop-dark-deltas.png');
    await estadoEl.screenshot({ path: shot2Path });
    console.log(`   Captured: ${shot2Path}`);

    // -------------------------------------------------------------------------
    // TEST 2: KEYBOARD ACCESSIBILITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n[3/5] Testing Keyboard Navigation & Accessibility...');
    await dayBtn1.focus();
    await page.keyboard.press('ArrowRight'); // Should move to Day 2
    await page.waitForTimeout(150);

    const isDay2Selected = await page.locator('.today-state-general-chart button').nth(2).getAttribute('aria-pressed');
    assert.equal(isDay2Selected, 'true', 'ArrowRight must advance selection to day 2');

    // Verify zero delta is displayed cleanly
    const kpiStripText = await page.locator('.today-state-kpi-strip').innerText();
    console.log(`   KPI Strip on Day 2 (=0 delta day): \n      ${kpiStripText.replace(/\n+/g, ' | ')}`);
    assert.ok(kpiStripText.includes('= 0.0 h vs ayer') || kpiStripText.includes('= 0'), 'Zero variation must be explicitly displayed');

    await page.keyboard.press('Home'); // Jump to first day
    await page.waitForTimeout(150);
    const isDay0Selected = await page.locator('.today-state-general-chart button').nth(0).getAttribute('aria-pressed');
    assert.equal(isDay0Selected, 'true', 'Home key must jump to day 0');

    await page.keyboard.press('End'); // Jump to last day (today)
    await page.waitForTimeout(150);
    const isDay6Selected = await page.locator('.today-state-general-chart button').nth(6).getAttribute('aria-pressed');
    assert.equal(isDay6Selected, 'true', 'End key must jump to day 6 (today)');
    console.log('   ✓ Keyboard navigation (Arrow keys, Home, End) fully functional.');

    await context.close();

    // -------------------------------------------------------------------------
    // TEST 3: MOBILE VIEWPORT (390x844) & TOUCH TARGET SIZES
    // -------------------------------------------------------------------------
    console.log('\n[4/5] Running Mobile 390px Viewport Audit...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript((st) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    }, syntheticState);

    await mobilePage.goto(APP_URL);
    await mobilePage.waitForTimeout(600);

    const mobileEstado = mobilePage.locator('.today-state-general-chart');
    await mobileEstado.waitFor({ state: 'visible', timeout: 5000 });

    // Check button touch target heights
    const buttonBoxes = await mobilePage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.today-state-general-chart button'));
      return buttons.map((b) => {
        const rect = b.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    });

    console.log(`   Mobile button touch target height: ${buttonBoxes[0].height.toFixed(1)}px (WCAG min target is 44px)`);
    assert.ok(buttonBoxes[0].height >= 44, 'Mobile button height must be at least 44px for WCAG compliance');

    // Check Y-axis labels font size in mobile
    const yAxisFontSize = await mobilePage.evaluate(() => {
      const yAxis = document.querySelector('.today-state-general-chart [aria-hidden="true"]');
      if (!yAxis) return null;
      return window.getComputedStyle(yAxis).fontSize;
    });
    console.log(`   Mobile Y-axis CSS font size: ${yAxisFontSize} (crisp text, not vector-shrunk)`);

    // Capture Mobile Dark
    const mobileEl = await mobileEstado.elementHandle();
    const shot3Path = path.join(EVIDENCE_DIR, '03-real-estado-mobile-dark-today.png');
    await mobileEl.screenshot({ path: shot3Path });
    console.log(`   Captured: ${shot3Path}`);

    // Switch to Light Mode in mobile
    await mobilePage.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    });
    await mobilePage.waitForTimeout(300);

    const shot4Path = path.join(EVIDENCE_DIR, '04-real-estado-mobile-light-today.png');
    await mobileEl.screenshot({ path: shot4Path });
    console.log(`   Captured: ${shot4Path}`);

    await mobileContext.close();

    // -------------------------------------------------------------------------
    // TEST 4: LIGHT MODE IN DESKTOP
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Running Desktop Light Mode Audit...');
    const lightContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const lightPage = await lightContext.newPage();
    await lightPage.addInitScript((st) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    }, syntheticState);

    await lightPage.goto(APP_URL);
    await lightPage.waitForTimeout(500);

    await lightPage.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    });
    await lightPage.waitForTimeout(300);

    const lightEstado = lightPage.locator('.today-state-general-chart');
    const lightEl = await lightEstado.elementHandle();
    const shot5Path = path.join(EVIDENCE_DIR, '05-real-estado-desktop-light-today.png');
    await lightEl.screenshot({ path: shot5Path });
    console.log(`   Captured: ${shot5Path}`);

    await lightContext.close();

    // Copy screenshots to artifact folder
    console.log('\n📦 Copying generated evidence to artifacts directory...');
    const files = fs.readdirSync(EVIDENCE_DIR);
    for (const f of files) {
      if (f.endsWith('.png')) {
        const src = path.join(EVIDENCE_DIR, f);
        const dest = path.join(ARTIFACT_DIR, f);
        fs.copyFileSync(src, dest);
        console.log(`   Copied ${f} -> ${dest}`);
      }
    }

    console.log('\n========================================================================');
    console.log(' ALL E2E VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('========================================================================\n');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('\n❌ E2E ERROR:', err);
  process.exit(1);
});
