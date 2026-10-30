import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5197;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const SCREENSHOT_DIR = path.resolve('artifacts/overlay-qa');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function makeReproState() {
  const now = Date.now();
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-19',
      lastWeeklyReviewAt: '2026-10-19',
      hiddenTabs: [],
      darkMode: true,
    },
    todayExtras: [],
    dailyPriorities: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    tasksRecurring: [],
    study: {
      subjects: [{ id: 'sub-prog', name: 'Programación' }],
      exams: [],
      studyLog: [],
      activeSession: {
        id: 'sess-study-repro',
        plannedMinutes: 25,
        targetSubjectId: 'sub-prog',
        targetSubjectName: 'Programación',
        startedAt: now,
        status: 'running',
        endsAt: now + 25 * 60 * 1000,
        remainingSeconds: 25 * 60,
        lastTickAt: now,
        elapsedMinutes: 0,
      },
    },
    gym: {
      sessions: [
        {
          id: 'session-repro-1',
          date: '2026-10-19',
          name: 'Entrenamiento Fuerza',
          status: 'in_progress',
          exercises: [],
        },
      ],
      exercises: [],
      routines: [],
      workoutLog: [],
      activeTimer: {
        id: 'timer-gym-repro',
        kind: 'set',
        durationSeconds: 90,
        endsAt: now + 90 * 1000,
        sessionId: 'session-repro-1',
      },
      settings: {
        showQuickRestAdjustments: true,
      },
    },
    finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
    projects: [],
  };
}

async function launchBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  }
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    const candidates = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return await chromium.launch({ executablePath: cand, headless: true });
      }
    }
    return await chromium.launch({ headless: true });
  }
}

function rectsOverlap(r1, r2) {
  if (!r1 || !r2) return false;
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  );
}

function overlapArea(r1, r2) {
  if (!rectsOverlap(r1, r2)) return 0;
  const xOverlap = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
  const yOverlap = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));
  return xOverlap * yOverlap;
}

async function main() {
  console.log('Iniciando Vite preview en puerto', TEST_PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(TEST_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });

  let attempts = 0;
  while (attempts < 30) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    attempts++;
  }

  const browser = await launchBrowser();
  const viewports = [375, 389, 640, 768, 1024, 1280, 1536];

  console.log('\n============================================================');
  console.log(' AUDITORÍA DE CONVIVENCIA DE TEMPORIZADORES FLOTANTES');
  console.log('============================================================\n');

  for (const width of viewports) {
    const height = width < 768 ? 667 : 800;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();

    const state = makeReproState();
    await page.addInitScript((st) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    }, state);

    await page.goto(`${APP_URL}?view=dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);

    const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
    const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');
    const themeToggle = page.locator('button[title*="modo"]');
    const mobileNav = page.locator('nav.lg\\:hidden');

    const studyVisible = await studyOverlay.isVisible();
    const gymVisible = await gymOverlay.isVisible();
    const studyBox = studyVisible ? await studyOverlay.boundingBox() : null;
    const gymBox = gymVisible ? await gymOverlay.boundingBox() : null;
    const themeBox = await themeToggle.isVisible() ? await themeToggle.boundingBox() : null;
    const navBox = await mobileNav.isVisible() ? await mobileNav.boundingBox() : null;

    const collisionOverlays = rectsOverlap(studyBox, gymBox);
    const studySidebarCollision = rectsOverlap(studyBox, themeBox);
    const studyNavCollision = rectsOverlap(studyBox, navBox);
    const gymNavCollision = rectsOverlap(gymBox, navBox);

    const screenshotPath = path.join(SCREENSHOT_DIR, `overlay-repro-${width}px.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`\n--- Viewport ${width}x${height} px ---`);
    console.log(`  Estudios visible: ${studyVisible} | Box: ${JSON.stringify(studyBox)}`);
    console.log(`  Gimnasio visible: ${gymVisible} | Box: ${JSON.stringify(gymBox)}`);
    console.log(`  MobileNav visible: ${Boolean(navBox)} | Box: ${JSON.stringify(navBox)}`);
    console.log(`  ¿Colisión entre ambos overlays?: ${collisionOverlays} (Área: ${overlapArea(studyBox, gymBox)} px²)`);
    console.log(`  ¿Estudios tapa el Theme Toggle del Sidebar?: ${studySidebarCollision}`);
    console.log(`  ¿Estudios colisiona con MobileNav?: ${studyNavCollision}`);
    console.log(`  ¿Gimnasio colisiona con MobileNav?: ${gymNavCollision}`);
    console.log(`  Captura guardada en: ${screenshotPath}`);

    await context.close();
  }

  await browser.close();
  server.kill();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
