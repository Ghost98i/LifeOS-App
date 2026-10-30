import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5196;
const APP_URL = `http://localhost:${TEST_PORT}/`;

function makeCoexistingState() {
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
        id: 'sess-study-coexist',
        plannedMinutes: 25,
        targetSubjectId: 'sub-prog',
        targetSubjectName: 'Programación',
        startedAt: now - 120000,
        status: 'running',
        endsAt: now + 23 * 60 * 1000,
        remainingSeconds: 23 * 60,
        lastTickAt: now,
        elapsedMinutes: 2,
      },
    },
    gym: {
      sessions: [
        {
          id: 'session-gym-coexist',
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
        id: 'timer-gym-coexist',
        kind: 'set',
        durationSeconds: 90,
        endsAt: now + 90 * 1000,
        sessionId: 'session-gym-coexist',
      },
      settings: {
        showQuickRestAdjustments: true,
      },
    },
    finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
    projects: [],
  };
}

let passedCount = 0;
let failedCount = 0;

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

async function runStep(name, fn) {
  try {
    process.stdout.write(`  ⏳ ${name}... `);
    await fn();
    console.log('✔ OK');
    passedCount++;
  } catch (err) {
    console.log('✖ ERROR');
    console.error(err);
    failedCount++;
  }
}

async function getStoredState(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('lifeos-state-v1');
    return raw ? JSON.parse(raw) : null;
  });
}

async function main() {
  console.log('\n============================================================');
  console.log(' LifeOS — Convivencia de Temporizadores Flotantes E2E');
  console.log('============================================================\n');

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

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Ambos activos simultáneamente en móvil (389x667) sin colisión
    // -------------------------------------------------------------------------
    await runStep('1. Móvil (389px): Ambos activos se apilan verticalmente sin colisión ni tapar MobileNav', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 667 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
      const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');
      const mobileNav = page.locator('nav.lg\\:hidden');

      await studyOverlay.waitFor({ state: 'visible' });
      await gymOverlay.waitFor({ state: 'visible' });

      const studyBox = await studyOverlay.boundingBox();
      const gymBox = await gymOverlay.boundingBox();
      const navBox = await mobileNav.boundingBox();

      assert.ok(studyBox, 'Study overlay debe tener caja');
      assert.ok(gymBox, 'Gym overlay debe tener caja');
      assert.ok(navBox, 'MobileNav debe tener caja');

      // 1. Cero colisión entre ambos
      assert.equal(rectsOverlap(studyBox, gymBox), false, 'Estudios y Gimnasio no deben solaparse');

      // 2. Estudios debe estar apilado por encima de Gimnasio
      assert.ok(studyBox.y + studyBox.height <= gymBox.y, 'Estudios debe estar arriba de Gimnasio');

      // 3. Gimnasio debe estar por encima de MobileNav
      assert.ok(gymBox.y + gymBox.height <= navBox.y, 'Gimnasio debe estar arriba de MobileNav');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 2: Pausa de Estudios mientras Gimnasio sigue corriendo (independencia)
    // -------------------------------------------------------------------------
    await runStep('2. Interacción: Pausar Estudios no altera ni detiene el temporizador de Gimnasio', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 667 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
      const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');

      // Pausar Estudios
      const pauseStudyBtn = studyOverlay.getByRole('button', { name: '⏸' });
      await pauseStudyBtn.click();
      await page.waitForTimeout(300);

      // Verificar que Estudios indica pausado y Gimnasio sigue visible y activo
      assert.ok((await studyOverlay.innerText()).includes('Pausado'));
      assert.ok(await gymOverlay.isVisible(), 'Gimnasio debe seguir visible en pantalla');

      // Verificar en localStorage que Estudios está pausado y Gimnasio sigue activo
      const saved = await getStoredState(page);
      assert.equal(saved.study.activeSession.status, 'paused');
      assert.ok(saved.gym.activeTimer, 'Gimnasio debe continuar activo');
      assert.ok(saved.gym.activeTimer.endsAt > Date.now());

      // Verificar que el botón de reanudar está disponible
      const resumeStudyBtn = studyOverlay.getByRole('button', { name: '▶' });
      assert.ok(await resumeStudyBtn.isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 3: Ajuste rápido de Gimnasio (+30s) sin afectar Estudios
    // -------------------------------------------------------------------------
    await runStep('3. Interacción: Ajustar +30s en descanso de Gimnasio mantiene sesión de Estudios intacta', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 667 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');
      const plus30Btn = gymOverlay.getByRole('button', { name: '+30s' });
      await plus30Btn.click();
      await page.waitForTimeout(300);

      const saved = await getStoredState(page);
      assert.equal(saved.gym.activeTimer.durationSeconds, 120, 'La duración debe haber subido a 120s');
      assert.equal(saved.study.activeSession.status, 'running', 'Estudios sigue running');
      assert.equal(saved.study.activeSession.plannedMinutes, 25);

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 4: Finalización de Gimnasio (Saltar) reposiciona fluidamente Estudios
    // -------------------------------------------------------------------------
    await runStep('4. Ciclo de vida: Saltar Gimnasio desmonta su overlay y recoloca Estudios al nivel base', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 667 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');
      const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');

      // Saltar Gimnasio
      const skipGymBtn = gymOverlay.getByRole('button', { name: /Saltar/i });
      await skipGymBtn.click();
      await page.waitForTimeout(400);

      // Gimnasio debe desaparecer
      assert.equal(await gymOverlay.isVisible(), false, 'Gym overlay debe desaparecer');

      // Estudios sigue visible
      assert.ok(await studyOverlay.isVisible(), 'Study overlay sigue visible');

      // Verificar en localStorage
      const saved = await getStoredState(page);
      assert.equal(saved.gym.activeTimer, null, 'activeTimer de gimnasio es null');
      assert.ok(saved.study.activeSession, 'activeSession de estudios sigue vivo');

      // Ahora que está solo, Estudios debe haber bajado al nivel base
      const singleStudyBox = await studyOverlay.boundingBox();
      assert.ok(singleStudyBox.y > 450, 'Estudios debe haber descendido al espacio liberado');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 5: Finalización y guardado de Estudios
    // -------------------------------------------------------------------------
    await runStep('5. Ciclo de vida: Finalizar Estudios desde overlay registra tiempo y limpia sesión', async () => {
      const context = await browser.newContext({ viewport: { width: 389, height: 667 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
      const finishStudyBtn = studyOverlay.getByRole('button', { name: /Terminar/i });
      await finishStudyBtn.click();
      await page.waitForTimeout(400);

      const saved = await getStoredState(page);
      assert.equal(saved.study.activeSession, null, 'activeSession de estudios pasa a null');
      assert.equal(saved.study.studyLog.length, 1, 'studyLog tiene 1 registro');
      assert.equal(saved.study.studyLog[0].minutes, 2);

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 6: Escritorio (1280x800): Cero colisión con Sidebar ni Theme Toggle
    // -------------------------------------------------------------------------
    await runStep('6. Escritorio (1280px): Estudios fuera de Sidebar, Theme Toggle 100% interactivo', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const state = makeCoexistingState();

      await page.addInitScript((st) => {
        if (!localStorage.getItem('lifeos-state-v1')) {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      }, state);

      await page.goto(`${APP_URL}?view=dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const studyOverlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
      const gymOverlay = page.locator('aside[aria-label="Temporizador de descanso en segundo plano"]');
      const themeToggle = page.locator('button[title*="modo"]');

      const studyBox = await studyOverlay.boundingBox();
      const gymBox = await gymOverlay.boundingBox();
      const themeBox = await themeToggle.boundingBox();

      // 1. Cero colisión entre ambos
      assert.equal(rectsOverlap(studyBox, gymBox), false, 'Estudios y Gimnasio no colisionan');

      // 2. Cero colisión con Theme Toggle
      assert.equal(rectsOverlap(studyBox, themeBox), false, 'Estudios no debe colisionar con Theme Toggle');
      assert.ok(studyBox.x >= 232, 'Estudios debe situarse a la derecha de la barra lateral (232px)');

      // 3. Probar interactividad real del Theme Toggle: clic para cambiar modo
      const initialText = await themeToggle.innerText();
      await themeToggle.click();
      await page.waitForTimeout(300);
      const afterText = await themeToggle.innerText();
      assert.notEqual(initialText, afterText, 'El botón de tema debe conmutar exitosamente');

      await context.close();
    });

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n============================================================');
  console.log(` Resultado E2E Convivencia: ${passedCount} APROBADAS, ${failedCount} FALLIDAS`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fallo en test de convivencia:', err);
  process.exit(1);
});
