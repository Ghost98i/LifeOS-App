import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const TEST_PORT = 5198;
const GYM_URL = `http://localhost:${TEST_PORT}/?view=gimnasio`;
const LOCAL_DIR = path.resolve('artifacts', 'gym-final-evidence');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/65b5b3c7-8bad-45a5-9650-8945aec1d06e';

for (const dir of [LOCAL_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function freePort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      for (const line of out.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          try { execSync(`taskkill /F /PID ${pid}`); } catch {}
        }
      }
    } catch {}
  }
}

function killProcessTree(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /F /T /PID ${child.pid}`); } catch {}
  } else {
    child.kill();
  }
}

function copyToArtifacts(filename) {
  const src = path.join(LOCAL_DIR, filename);
  const dst = path.join(ARTIFACT_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[Evidence] Copied ${filename} to artifacts.`);
  }
}

async function dismissBanners(page) {
  try {
    await page.addStyleTag({
      content: `aside[role="status"] { display: none !important; }`,
    });
  } catch {}
}

async function launchBrowser() {
  const localAppData = process.env.LOCALAPPDATA;
  const progFiles = process.env.ProgramFiles;
  const candidates = [
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    progFiles && path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\155.0.4283.62\\msedge.exe',
  ].filter(Boolean);

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return await chromium.launch({ executablePath: cand, headless: true });
    }
  }
  return await chromium.launch({ headless: true });
}

function buildAppStateWithExercises(exerciseList, darkMode = true) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      hiddenTabs: [],
      darkMode,
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
      },
      routineTemplates: [],
      sessions: [
        {
          id: 'session-live-active',
          date: today,
          weekLabel: 'Fuerza A · Torso Pesado',
          status: 'active',
          startedAt: '18:15',
          exercises: exerciseList,
        },
      ],
    },
  };
}

async function startServer() {
  freePort(TEST_PORT);
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(TEST_PORT), '--strictPort'], {
    shell: true,
    stdio: 'pipe',
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${TEST_PORT}/`);
      if (res.ok) return child;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Server failed to start on port ${TEST_PORT}`);
}

async function main() {
  console.log('[Runner] Starting final verification captures...');
  const server = await startServer();
  const browser = await launchBrowser();

  try {
    // 1. Press de Banca Plano — Mobile (390px Dark)
    console.log('1. Press de Banca Plano — Mobile (390px Dark)');
    {
      const benchExercise = [
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
          ],
        },
      ];
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(benchExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(500);

      const filename = 'evidence-01-bench-press-mobile-390.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename) });
      copyToArtifacts(filename);
      await context.close();
    }

    // 2. Press de Banca Plano — Desktop (1440px Dark)
    console.log('2. Press de Banca Plano — Desktop (1440px Dark)');
    {
      const benchExercise = [
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
          ],
        },
      ];
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(benchExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(500);

      const filename = 'evidence-02-bench-press-desktop-1440.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename) });
      copyToArtifacts(filename);
      await context.close();
    }

    // 3. Press Militar — Mobile (390px Dark)
    console.log('3. Press Militar — Mobile (390px Dark)');
    {
      const militaryExercise = [
        {
          id: 'ex-military-press',
          name: 'Press militar de pie con barra olímpica',
          equipment: 'barra',
          barWeight: 20,
          muscleGroup: 'Hombros',
          weight: 50,
          sets: [
            { id: 'm1', weight: 50, reps: 6, completed: false },
            { id: 'm2', weight: 52.5, reps: 6, completed: false },
            { id: 'm3', weight: 55, reps: 5, completed: false },
          ],
        },
      ];
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(militaryExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(500);

      const filename = 'evidence-03-military-press-mobile-390.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename) });
      copyToArtifacts(filename);
      await context.close();
    }

    // 4. Press Militar — Desktop (1440px Dark)
    console.log('4. Press Militar — Desktop (1440px Dark)');
    {
      const militaryExercise = [
        {
          id: 'ex-military-press',
          name: 'Press militar de pie con barra olímpica',
          equipment: 'barra',
          barWeight: 20,
          muscleGroup: 'Hombros',
          weight: 50,
          sets: [
            { id: 'm1', weight: 50, reps: 6, completed: false },
            { id: 'm2', weight: 52.5, reps: 6, completed: false },
            { id: 'm3', weight: 55, reps: 5, completed: false },
          ],
        },
      ];
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(militaryExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);
      await page.waitForTimeout(500);

      const filename = 'evidence-04-military-press-desktop-1440.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename) });
      copyToArtifacts(filename);
      await context.close();
    }

    // 5. Ejercicio con Nombre Extenso — Mobile 360px & 390px
    console.log('5. Ejercicio con Nombre Extenso — Mobile 360px & 390px');
    {
      const longNameExercise = [
        {
          id: 'ex-long-name',
          name: 'Press de banca inclinado con mancuernas pesadas en banco articulado a 30 grados',
          equipment: 'mancuerna',
          barWeight: 0,
          muscleGroup: 'Pecho',
          weight: 32,
          sets: [
            { id: 'l1', weight: 32, reps: 10, completed: false },
            { id: 'l2', weight: 34, reps: 8, completed: false },
          ],
        },
      ];

      // 360px
      const context360 = await browser.newContext({
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page360 = await context360.newPage();
      await page360.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(longNameExercise, true));
      await page360.goto(GYM_URL);
      await page360.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page360);
      await page360.waitForTimeout(500);

      const filename360 = 'evidence-05-long-name-mobile-360.png';
      await page360.screenshot({ path: path.join(LOCAL_DIR, filename360) });
      copyToArtifacts(filename360);
      await context360.close();

      // 390px
      const context390 = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page390 = await context390.newPage();
      await page390.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(longNameExercise, true));
      await page390.goto(GYM_URL);
      await page390.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page390);
      await page390.waitForTimeout(500);

      const filename390 = 'evidence-06-long-name-mobile-390.png';
      await page390.screenshot({ path: path.join(LOCAL_DIR, filename390) });
      copyToArtifacts(filename390);
      await context390.close();
    }

    // 6. Resumen de Entrenamiento — Estado Inmediato y Estado Completado
    console.log('6. Resumen de Entrenamiento — Inmediato y Completado');
    {
      const completedExercise = [
        {
          id: 'ex-bench-press',
          name: 'Press de banca plano con barra',
          equipment: 'barra',
          barWeight: 20,
          muscleGroup: 'Pecho',
          weight: 100,
          sets: [
            { id: 's1', weight: 100, reps: 8, completed: true, completedAt: '2026-10-20T18:20:00Z' },
            { id: 's2', weight: 100, reps: 8, completed: true, completedAt: '2026-10-20T18:25:00Z' },
          ],
        },
      ];

      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(completedExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);

      // Finish workout
      const moreMenu = page.locator('summary[aria-label="Opciones de la sesión"]');
      await moreMenu.click();
      await page.waitForTimeout(200);

      const finishBtn = page.locator('button:has-text("Finalizar sesión")');
      await finishBtn.click();

      await page.waitForSelector('.gym-summary-modal', { timeout: 4000 });
      await dismissBanners(page);

      // Inmediato (t=0)
      const immediateFile = 'evidence-07-summary-immediate.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, immediateFile) });
      copyToArtifacts(immediateFile);

      // Animación terminada (t=4s)
      await page.waitForTimeout(4000);
      const completedFile = 'evidence-08-summary-animation-completed.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, completedFile) });
      copyToArtifacts(completedFile);

      await context.close();
    }

    // 7. Resumen de Entrenamiento — Prefers-Reduced-Motion: Reduce
    console.log('7. Resumen de Entrenamiento — Prefers-Reduced-Motion: Reduce');
    {
      const completedExercise = [
        {
          id: 'ex-bench-press',
          name: 'Press de banca plano con barra',
          equipment: 'barra',
          barWeight: 20,
          muscleGroup: 'Pecho',
          weight: 100,
          sets: [
            { id: 's1', weight: 100, reps: 8, completed: true, completedAt: '2026-10-20T18:20:00Z' },
            { id: 's2', weight: 100, reps: 8, completed: true, completedAt: '2026-10-20T18:25:00Z' },
          ],
        },
      ];

      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), buildAppStateWithExercises(completedExercise, true));
      await page.goto(GYM_URL);
      await page.waitForSelector('[data-active-workout-view]');
      await dismissBanners(page);

      const moreMenu = page.locator('summary[aria-label="Opciones de la sesión"]');
      await moreMenu.click();
      await page.waitForTimeout(200);

      const finishBtn = page.locator('button:has-text("Finalizar sesión")');
      await finishBtn.click();

      await page.waitForSelector('.gym-summary-modal', { timeout: 4000 });
      await dismissBanners(page);
      await page.waitForTimeout(300);

      const reducedFile = 'evidence-09-summary-reduced-motion.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, reducedFile) });
      copyToArtifacts(reducedFile);

      await context.close();
    }

    console.log('[Runner] All final evidence captures completed successfully!');
  } finally {
    await browser.close();
    killProcessTree(server);
  }
}

main().catch((err) => {
  console.error('[Runner] Error in captures:', err);
  process.exit(1);
});
