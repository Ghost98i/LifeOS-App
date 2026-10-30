import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5190;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const GYM_URL = `http://localhost:${TEST_PORT}/?view=gimnasio`;
const LOCAL_EVIDENCE_DIR = path.resolve('artifacts', 'gym-audit-evidence');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/65b5b3c7-8bad-45a5-9650-8945aec1d06e';

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

function buildDemoState(darkMode = true) {
  const today = new Date().toISOString().slice(0, 10);
  const dMinus2 = shiftISO(today, -2);
  const dMinus5 = shiftISO(today, -5);
  const dMinus8 = shiftISO(today, -8);
  const dMinus12 = shiftISO(today, -12);

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
      weight: [
        { date: dMinus12, weight: 79.2 },
        { date: dMinus5, weight: 78.8 },
        { date: today, weight: 78.4 },
      ],
      measurements: [],
      settings: {
        restBetweenSetsSeconds: 120,
        restBetweenExercisesSeconds: 180,
        autoTimerEnabled: true,
        showQuickRestAdjustments: true,
        allowManualRestEditing: true,
      },
      routineTemplates: [
        {
          id: 'template-empuje',
          name: 'Empuje y Pecho',
          days: ['lunes', 'jueves'],
          appearance: { icon: 'gym-bench-press' },
          exercises: [
            {
              id: 'ex-bench-press',
              name: 'Press banca plano',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              weight: 80,
              restSeconds: 120,
              restSecondsMode: 'inherit',
              sets: [
                { id: 's1', weight: 40, reps: 12, type: 'warmup', completed: false },
                { id: 's2', weight: 70, reps: 10, type: 'normal', completed: false },
                { id: 's3', weight: 80, reps: 8, type: 'normal', completed: false },
                { id: 's4', weight: 80, reps: 8, type: 'normal', completed: false },
              ],
            },
            {
              id: 'ex-incline-press',
              name: 'Press inclinado con mancuernas',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Pecho',
              weight: 26,
              restSeconds: 90,
              restSecondsMode: 'custom',
              sets: [
                { id: 's21', weight: 24, reps: 10, type: 'normal', completed: false },
                { id: 's22', weight: 26, reps: 8, type: 'normal', completed: false },
                { id: 's23', weight: 26, reps: 8, type: 'normal', completed: false },
              ],
            },
            {
              id: 'ex-shoulder-press',
              name: 'Press de hombros sentado',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Hombros',
              weight: 22,
              sets: [
                { id: 's31', weight: 20, reps: 10, type: 'normal', completed: false },
                { id: 's32', weight: 22, reps: 8, type: 'normal', completed: false },
                { id: 's33', weight: 22, reps: 7, type: 'normal', completed: false },
              ],
            },
            {
              id: 'ex-triceps-rope',
              name: 'Extensión de tríceps en polea',
              equipment: 'polea',
              barWeight: 0,
              muscleGroup: 'Brazos',
              weight: 35,
              sets: [
                { id: 's41', weight: 30, reps: 12, type: 'normal', completed: false },
                { id: 's42', weight: 35, reps: 10, type: 'normal', completed: false },
                { id: 's43', weight: 35, reps: 10, type: 'normal', completed: false },
              ],
            },
          ],
        },
        {
          id: 'template-tiron',
          name: 'Tirón y Espalda',
          days: ['martes', 'viernes'],
          appearance: { icon: 'gym-lat-pulldown' },
          exercises: [
            {
              id: 'ex-lat-pulldown',
              name: 'Jalón al pecho',
              equipment: 'polea',
              barWeight: 0,
              muscleGroup: 'Espalda',
              weight: 65,
              sets: [
                { id: 'st1', weight: 60, reps: 10, completed: false },
                { id: 'st2', weight: 65, reps: 8, completed: false },
                { id: 'st3', weight: 65, reps: 8, completed: false },
              ],
            },
            {
              id: 'ex-seated-row',
              name: 'Remo sentado en polea baja',
              equipment: 'polea',
              barWeight: 0,
              muscleGroup: 'Espalda',
              weight: 55,
              sets: [
                { id: 'st21', weight: 50, reps: 10, completed: false },
                { id: 'st22', weight: 55, reps: 8, completed: false },
              ],
            },
          ],
        },
        {
          id: 'template-piernas',
          name: 'Piernas y Core',
          days: ['miercoles'],
          appearance: { icon: 'gym-leg-press' },
          exercises: [
            {
              id: 'ex-leg-press',
              name: 'Prensa de piernas',
              equipment: 'maquina',
              barWeight: 0,
              muscleGroup: 'Piernas',
              weight: 180,
              sets: [
                { id: 'sl1', weight: 140, reps: 12, completed: false },
                { id: 'sl2', weight: 180, reps: 10, completed: false },
                { id: 'sl3', weight: 180, reps: 10, completed: false },
              ],
            },
          ],
        },
      ],
      sessions: [
        {
          id: 'session-hist-1',
          date: dMinus2,
          weekLabel: 'Empuje y Pecho',
          status: 'completed',
          startedAt: '18:15',
          finishedAt: '19:25',
          exercises: [
            {
              id: 'ex-bench-press',
              name: 'Press banca plano',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              weight: 80,
              sets: [
                { id: 'hs1', weight: 40, reps: 12, type: 'warmup', completed: true, completedAt: `${dMinus2}T18:22:00` },
                { id: 'hs2', weight: 70, reps: 10, type: 'normal', completed: true, completedAt: `${dMinus2}T18:28:00` },
                { id: 'hs3', weight: 80, reps: 8, type: 'normal', completed: true, completedAt: `${dMinus2}T18:35:00` },
                { id: 'hs4', weight: 82.5, reps: 6, type: 'normal', completed: true, completedAt: `${dMinus2}T18:42:00` },
              ],
            },
            {
              id: 'ex-incline-press',
              name: 'Press inclinado con mancuernas',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Pecho',
              weight: 26,
              sets: [
                { id: 'hs21', weight: 24, reps: 10, type: 'normal', completed: true, completedAt: `${dMinus2}T18:50:00` },
                { id: 'hs22', weight: 26, reps: 8, type: 'normal', completed: true, completedAt: `${dMinus2}T18:56:00` },
              ],
            },
          ],
        },
        {
          id: 'session-hist-2',
          date: dMinus5,
          weekLabel: 'Tirón y Espalda',
          status: 'completed',
          startedAt: '08:00',
          finishedAt: '09:05',
          exercises: [
            {
              id: 'ex-lat-pulldown',
              name: 'Jalón al pecho',
              equipment: 'polea',
              barWeight: 0,
              muscleGroup: 'Espalda',
              weight: 65,
              sets: [
                { id: 'hst1', weight: 60, reps: 10, completed: true, completedAt: `${dMinus5}T08:15:00` },
                { id: 'hst2', weight: 65, reps: 9, completed: true, completedAt: `${dMinus5}T08:22:00` },
                { id: 'hst3', weight: 65, reps: 8, completed: true, completedAt: `${dMinus5}T08:30:00` },
              ],
            },
          ],
        },
        {
          id: 'session-hist-3',
          date: dMinus8,
          weekLabel: 'Piernas y Core',
          status: 'completed',
          startedAt: '19:00',
          finishedAt: '20:10',
          exercises: [
            {
              id: 'ex-leg-press',
              name: 'Prensa de piernas',
              equipment: 'maquina',
              barWeight: 0,
              muscleGroup: 'Piernas',
              weight: 180,
              sets: [
                { id: 'hsl1', weight: 140, reps: 12, completed: true, completedAt: `${dMinus8}T19:15:00` },
                { id: 'hsl2', weight: 170, reps: 10, completed: true, completedAt: `${dMinus8}T19:24:00` },
                { id: 'hsl3', weight: 180, reps: 10, completed: true, completedAt: `${dMinus8}T19:35:00` },
              ],
            },
          ],
        },
        {
          id: 'session-hist-4',
          date: dMinus12,
          weekLabel: 'Empuje y Pecho',
          status: 'completed',
          startedAt: '18:30',
          finishedAt: '19:40',
          exercises: [
            {
              id: 'ex-bench-press',
              name: 'Press banca plano',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              weight: 75,
              sets: [
                { id: 'hs41', weight: 70, reps: 10, completed: true, completedAt: `${dMinus12}T18:40:00` },
                { id: 'hs42', weight: 75, reps: 8, completed: true, completedAt: `${dMinus12}T18:48:00` },
              ],
            },
          ],
        },
      ],
    },
  };
}

async function run() {
  console.log('--- Starting Preview Server on port 5190 ---');
  const server = spawn('npx', ['vite', 'preview', '--port', String(TEST_PORT)], {
    shell: true,
    stdio: 'pipe',
  });

  let started = false;
  for (let i = 0; i < 25; i++) {
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
    const darkBaseState = buildDemoState(true);

    // Helper to dismiss banners in page if present
    async function dismissBanners(page) {
      try {
        const dismissBtns = page.locator('button:has-text("Entendido")');
        if (await dismissBtns.first().isVisible({ timeout: 500 })) {
          await dismissBtns.first().click({ force: true });
        }
      } catch {}
    }

    // 1. Idle Desktop Dark
    console.log('1. Idle Launcher Desktop Dark');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), darkBaseState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '01-idle-launcher-desktop-dark.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 2. Idle Mobile Dark
    console.log('2. Idle Launcher Mobile Dark');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), darkBaseState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '02-idle-launcher-mobile-dark.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // Active state with Dark Mode
    const activeWorkoutState = {
      ...darkBaseState,
      gym: {
        ...darkBaseState.gym,
        sessions: [
          {
            id: 'session-active-now',
            date: new Date().toISOString().slice(0, 10),
            weekLabel: 'Empuje y Pecho',
            status: 'active',
            startedAt: '17:30',
            finishedAt: null,
            exercises: [
              {
                id: 'ex-bench-press',
                name: 'Press banca plano',
                equipment: 'barra',
                barWeight: 20,
                muscleGroup: 'Pecho',
                weight: 80,
                sets: [
                  { id: 'as1', weight: 40, reps: 12, type: 'warmup', completed: true, completedAt: '2026-10-20T17:34:00' },
                  { id: 'as2', weight: 70, reps: 10, type: 'normal', completed: true, completedAt: '2026-10-20T17:38:00' },
                  { id: 'as3', weight: 82.5, reps: 8, type: 'normal', completed: false },
                  { id: 'as4', weight: 82.5, reps: 8, type: 'normal', completed: false },
                ],
              },
              {
                id: 'ex-incline-press',
                name: 'Press inclinado con mancuernas',
                equipment: 'mancuerna',
                barWeight: 0,
                muscleGroup: 'Pecho',
                weight: 26,
                sets: [
                  { id: 'as21', weight: 26, reps: 10, type: 'normal', completed: false },
                  { id: 'as22', weight: 26, reps: 8, type: 'normal', completed: false },
                ],
              },
              {
                id: 'ex-triceps',
                name: 'Extensión de tríceps en polea',
                equipment: 'polea',
                barWeight: 0,
                muscleGroup: 'Brazos',
                weight: 35,
                sets: [
                  { id: 'as31', weight: 35, reps: 12, type: 'normal', completed: false },
                ],
              },
            ],
          },
          ...darkBaseState.gym.sessions,
        ],
      },
    };

    // 4. Active Workout Desktop Dark
    console.log('4. Active Workout Desktop Dark');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), activeWorkoutState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '04-active-workout-desktop-dark.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 5. Active Workout Mobile Dark (Top and Cockpit Scroll)
    console.log('5. Active Workout Mobile Dark');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), activeWorkoutState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const fileTop = '05-active-workout-mobile-dark.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileTop), fullPage: false });
      copyToArtifacts(fileTop);

      // Scroll down to show cockpit buttons and sets table
      await page.evaluate(() => window.scrollBy(0, 360));
      await page.waitForTimeout(300);
      const fileCockpit = '05b-active-workout-mobile-cockpit-scrolled.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, fileCockpit), fullPage: false });
      copyToArtifacts(fileCockpit);

      await context.close();
    }

    // 6. Rest Timer Mobile Dark
    console.log('6. Rest Timer Mobile Dark');
    const restingState = {
      ...activeWorkoutState,
      gym: {
        ...activeWorkoutState.gym,
        activeTimer: {
          endsAt: Date.now() + 85 * 1000,
          durationSeconds: 120,
          sessionId: 'session-active-now',
          exerciseId: 'ex-bench-press',
          setId: 'as2',
          kind: 'set',
          exerciseIndex: 0,
          minimized: false,
        },
      },
    };
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), restingState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      // Scroll slightly to bring dial into focus
      await page.evaluate(() => window.scrollBy(0, 280));
      await page.waitForTimeout(300);

      const file = '06-rest-timer-in-cockpit-mobile.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 7. Rest Overlay in Hoy Mobile
    console.log('7. Rest Overlay in Hoy Mobile');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), restingState);
      await page.goto(APP_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const file = '07-rest-overlay-in-hoy-mobile.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 8 & 9. Plate Calculator Dark
    console.log('8 & 9. Plate Calculator Dark');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), activeWorkoutState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const discosBtn = page.locator('button:has-text("Discos")').first();
      if (await discosBtn.isVisible()) {
        await discosBtn.click({ force: true });
        await page.waitForTimeout(300);

        const file1 = '08-plate-calculator-target-tab.png';
        await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file1), fullPage: false });
        copyToArtifacts(file1);

        const manualTab = page.locator('button:has-text("Tocar Discos Colocados")');
        if (await manualTab.isVisible()) {
          await manualTab.click({ force: true });
          await page.waitForTimeout(200);

          const p20 = page.locator('button:has-text("+20")').first();
          if (await p20.isVisible()) await p20.click({ force: true });
          const p10 = page.locator('button:has-text("+10")').first();
          if (await p10.isVisible()) await p10.click({ force: true });
          await page.waitForTimeout(200);

          const file2 = '09-plate-calculator-manual-tab.png';
          await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file2), fullPage: false });
          copyToArtifacts(file2);
        }
      }
      await context.close();
    }

    // 10. Exercise History Modal
    console.log('10. Exercise History Modal');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), activeWorkoutState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const histBtn = page.locator('button:has-text("Historial")').first();
      if (await histBtn.isVisible()) {
        await histBtn.click({ force: true });
        await page.waitForTimeout(500);

        const file = '10-exercise-history-modal.png';
        await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
        copyToArtifacts(file);
      }
      await context.close();
    }

    // 11. Tab Historial Desktop Dark
    console.log('11. Tab Historial Desktop Dark');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), darkBaseState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const histTab = page.locator('button:has-text("Historial")').first();
      await histTab.click({ force: true });
      await page.waitForTimeout(500);

      const file = '11-gimnasio-tab-historial-desktop.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 12. Tab Progresión Desktop Dark
    console.log('12. Tab Progresión Desktop Dark');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), darkBaseState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const progTab = page.locator('button:has-text("Progresión"), button:has-text("Progreso")').first();
      await progTab.click({ force: true });
      await page.waitForTimeout(600);

      const file = '12-gimnasio-tab-progresion-desktop.png';
      await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
      copyToArtifacts(file);
      await context.close();
    }

    // 13. Summary Modal Dark
    console.log('13. Summary Modal Dark');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript((st) => localStorage.setItem('lifeos-state-v1', JSON.stringify(st)), activeWorkoutState);
      await page.goto(GYM_URL);
      await page.waitForTimeout(600);
      await dismissBanners(page);

      const moreOptions = page.locator('summary[aria-label="Opciones de la sesión"]');
      if (await moreOptions.isVisible()) {
        await moreOptions.click({ force: true });
        await page.waitForTimeout(300);

        const finishBtn = page.locator('button:has-text("Finalizar sesión")');
        if (await finishBtn.isVisible()) {
          await finishBtn.click({ force: true });
          await page.waitForTimeout(700);

          const file = '13-workout-summary-modal.png';
          await page.screenshot({ path: path.join(LOCAL_EVIDENCE_DIR, file), fullPage: false });
          copyToArtifacts(file);
        }
      }
      await context.close();
    }

    console.log('✓ All captures completed and refreshed in dark mode!');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Error running capture script:', err);
  process.exit(1);
});
