import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const TEST_PORT = 5198;
const GYM_URL = `http://localhost:${TEST_PORT}/?view=gimnasio`;
const LOCAL_EVIDENCE_DIR = path.resolve('artifacts', 'gym-cockpit-evidence');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/65b5b3c7-8bad-45a5-9650-8945aec1d06e';

for (const dir of [LOCAL_EVIDENCE_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function freePort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = out.split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          try {
            execSync(`taskkill /F /PID ${pid}`);
            console.log(`[Server] Freed port ${port} by killing PID ${pid}.`);
          } catch {}
        }
      }
    } catch {}
  }
}

function killProcessTree(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${child.pid}`);
    } catch {}
  } else {
    child.kill();
  }
}

function copyToArtifacts(filename) {
  const src = path.join(LOCAL_EVIDENCE_DIR, filename);
  const dst = path.join(ARTIFACT_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[Evidence] Copied ${filename} to artifacts.`);
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

function buildRealAppState(darkMode = true) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      hiddenTabs: [],
      darkMode: darkMode,
    },
    todayExtras: [],
    dailyPriorities: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    tasksRecurring: [],
    study: { subjects: [], exams: [], studyLog: [] },
    finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
    projects: [],
    gym: {
      weight: [{ date: today, weight: 78.5 }],
      measurements: [],
      settings: {
        restBetweenSetsSeconds: 90,
        restBetweenExercisesSeconds: 120,
        autoTimerEnabled: true,
        showQuickRestAdjustments: true,
        allowManualRestEditing: true,
      },
      routineTemplates: [],
      sessions: [
        {
          id: 'session-live-active',
          date: today,
          weekLabel: 'Fuerza A · Torso Pesado',
          status: 'active',
          startedAt: '18:15',
          exercises: [
            {
              id: 'ex-bench-press',
              name: 'Press de banca plano con barra',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              weight: 80,
              sets: [
                { id: 's1', weight: 80, reps: 8, completed: false },
                { id: 's2', weight: 82.5, reps: 8, completed: false },
                { id: 's3', weight: 85, reps: 6, completed: false },
                { id: 's4', weight: 85, reps: 6, completed: false },
              ],
            },
            {
              id: 'ex-dumbbell-incline',
              name: 'Press inclinado con mancuernas en banco',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Pecho',
              weight: 28,
              sets: [
                { id: 's-inc-1', weight: 28, reps: 10, completed: false },
                { id: 's-inc-2', weight: 28, reps: 10, completed: false },
                { id: 's-inc-3', weight: 28, reps: 10, completed: false },
              ],
            },
          ],
        },
      ],
    },
  };
}

function buildRealAppStateWithRestTimer(darkMode = true) {
  const state = buildRealAppState(darkMode);
  state.gym.sessions[0].exercises[0].sets[0].completed = true;
  state.gym.sessions[0].exercises[0].sets[0].completedAt = new Date().toISOString();
  state.gym.activeTimer = {
    endsAt: Date.now() + 84000,
    durationSeconds: 90,
    sessionId: 'session-live-active',
    exerciseId: 'ex-bench-press',
    setId: 's1',
    kind: 'set',
    exerciseIndex: 0,
  };
  return state;
}

async function dismissBanners(page) {
  try {
    await page.addStyleTag({
      content: `aside[role="status"] { display: none !important; }`,
    });
  } catch {}
}

async function startServer() {
  freePort(TEST_PORT);
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npx.cmd' : 'npx';
  const child = spawn(npmCmd, ['vite', 'preview', '--port', String(TEST_PORT), '--strictPort'], {
    shell: true,
    stdio: 'pipe',
  });

  child.stdout.on('data', (d) => process.stdout.write(`[Vite Preview] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[Vite Preview Error] ${d}`));

  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${TEST_PORT}/`);
      if (res.ok) {
        console.log(`[Server] Preview server ready on port ${TEST_PORT}.`);
        return child;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Server failed to start on port ${TEST_PORT}`);
}

async function main() {
  console.log('[Runner] Starting visual validation of real Cockpit integration...');
  const server = await startServer();
  const browser = await launchBrowser();

  try {
    // 1. Mobile 390px Dark — Logging Phase
    console.log('1. Mobile 390px Dark — Logging Phase');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppState(true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(600);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-01-logging-mobile-390-dark.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-01-logging-mobile-390-dark.png');
      await context.close();
    }

    // 2. Mobile 390px Light — Logging Phase
    console.log('2. Mobile 390px Light — Logging Phase');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppState(false));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(600);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-02-logging-mobile-390-light.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-02-logging-mobile-390-light.png');
      await context.close();
    }

    // 3. Mobile 360px Dark — Zero Overflow Verification
    console.log('3. Mobile 360px Dark — Zero Overflow');
    {
      const context = await browser.newContext({
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppState(true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(600);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-03-logging-mobile-360-dark.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-03-logging-mobile-360-dark.png');
      await context.close();
    }

    // 4. Mobile 430px Dark — Wide Mobile
    console.log('4. Mobile 430px Dark — Wide Mobile');
    {
      const context = await browser.newContext({
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppState(true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(600);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-04-logging-mobile-430-dark.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-04-logging-mobile-430-dark.png');
      await context.close();
    }

    // 5. Desktop 1440px Dark — Two Column Layout
    console.log('5. Desktop 1440px Dark — Two Columns');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppState(true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(600);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-05-logging-desktop-dark.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-05-logging-desktop-dark.png');
      await context.close();
    }

    // 6. Rest Phase Mobile 390px Dark
    console.log('6. Rest Phase Mobile 390px Dark');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppStateWithRestTimer(true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForSelector('.c-rest-phase', { timeout: 3000 });
      await page.waitForTimeout(300);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-06-rest-phase-mobile-390-dark.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-06-rest-phase-mobile-390-dark.png');

      // 7. Review Mode: Click "✎ Revisar o corregir Serie 1"
      console.log('7. Review Mode Mobile 390px Dark');
      const reviewBtn = page.locator('.c-review-link');
      await reviewBtn.click();
      await page.waitForTimeout(400);

      const reviewShot = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-07-review-mode-mobile-390-dark.png');
      await page.screenshot({ path: reviewShot });
      copyToArtifacts('real-cockpit-07-review-mode-mobile-390-dark.png');

      await context.close();
    }

    // 8. Rest Phase Mobile 390px Light & Advancement
    console.log('8. Rest Phase Mobile 390px Light & Advancement');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildRealAppStateWithRestTimer(false));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForSelector('.c-rest-phase', { timeout: 3000 });
      await page.waitForTimeout(300);

      const shotPath = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-08-rest-phase-mobile-390-light.png');
      await page.screenshot({ path: shotPath });
      copyToArtifacts('real-cockpit-08-rest-phase-mobile-390-light.png');

      // Click "Comenzar Serie 2 Ahora →" to advance smoothly to set 2
      const advanceBtn = page.locator('.c-primary-cta');
      await advanceBtn.click();
      await page.waitForTimeout(500);

      const advanceShot = path.join(LOCAL_EVIDENCE_DIR, 'real-cockpit-09-next-set-advanced-mobile-390-light.png');
      await page.screenshot({ path: advanceShot });
      copyToArtifacts('real-cockpit-09-next-set-advanced-mobile-390-light.png');

      await context.close();
    }

    console.log('[Runner] All visual captures completed successfully!');
  } finally {
    await browser.close();
    killProcessTree(server);
  }
}

main().catch((err) => {
  console.error('[Runner] Error in visual validation:', err);
  process.exit(1);
});
