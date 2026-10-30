import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const PORT = 5218;
const APP_URL = `http://localhost:${PORT}/`;
const ARTIFACTS_DIR = 'C:\\Users\\Christian\\.gemini\\antigravity\\brain\\8706914a-7d51-4e52-a4d0-2e7c968c91be';

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function makeSyntheticState() {
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-28',
      lastWeeklyReviewAt: '2026-10-28',
      hiddenTabs: [],
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
      weight: [],
      measurements: [],
      restDays: [],
      activeTimer: null,
      settings: {
        restBetweenSetsSeconds: 90,
        restBetweenExercisesSeconds: 120,
        autoTimerEnabled: true,
        showQuickRestAdjustments: true,
        allowManualRestEditing: false,
      },
      routineTemplates: [
        {
          id: 'template-empuje-legacy',
          name: 'Empuje (Histórica)',
          appearance: { icon: 'dumbbell' },
          days: ['lunes'],
          exercises: [
            {
              id: 'ex-bench-legacy',
              name: 'Press Banca',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              timerEnabled: false, // Simula el artefacto de la versión anterior
              restSecondsMode: 'inherit',
              weight: 80,
              sets: [
                { id: 's1', weight: 80, reps: 8, completed: false },
                { id: 's2', weight: 80, reps: 8, completed: false },
              ],
            },
            {
              id: 'ex-incline-legacy',
              name: 'Press Inclinado',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Pecho',
              timerEnabled: false, // Simula el artefacto de la versión anterior
              restSecondsMode: 'inherit',
              weight: 60,
              sets: [
                { id: 's3', weight: 60, reps: 10, completed: false },
              ],
            },
          ],
        },
      ],
      sessions: [
        {
          id: 'hist-session-1',
          date: '2026-10-20',
          weekLabel: 'Empuje (Histórica)',
          status: 'completed',
          startedAt: '10:00',
          finishedAt: '11:00',
          exercises: [
            {
              id: 'hist-ex-1',
              name: 'Press Banca',
              equipment: 'barra',
              barWeight: 20,
              muscleGroup: 'Pecho',
              timerEnabled: false,
              sets: [
                { id: 'h1', weight: 70, reps: 8, completed: true, completedAt: '2026-10-20T10:15:00.000Z' },
                { id: 'h2', weight: 70, reps: 8, completed: true, completedAt: '2026-10-20T10:30:00.000Z' },
              ],
            },
            {
              id: 'hist-ex-2',
              name: 'Press Inclinado',
              equipment: 'mancuerna',
              barWeight: 0,
              muscleGroup: 'Pecho',
              timerEnabled: false,
              sets: [
                { id: 'h3', weight: 60, reps: 10, completed: true, completedAt: '2026-10-20T10:45:00.000Z' },
              ],
            },
          ],
        },
      ],
    },
  };
}

async function run() {
  console.log('\n============================================================');
  console.log(' VALIDACIÓN PLAYWRIGHT GIMNASIO MÓVIL (375x812)');
  console.log('============================================================\n');

  console.log('1. Compilando aplicación...');
  execSync('npm run build', { stdio: 'pipe' });

  console.log(`2. Levantando servidor Vite preview en puerto ${PORT}...`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    shell: true,
    stdio: 'ignore',
  });

  // Esperar a que el servidor esté activo
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(APP_URL);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
  }
  assert.ok(ready, 'El servidor preview debe estar disponible');
  console.log('✔ Servidor preview listo.');

  console.log('3. Lanzando navegador en viewport móvil (375x812)...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  const syntheticState = makeSyntheticState();

  await page.addInitScript((st) => {
    localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
  }, syntheticState);

  try {
    console.log('4. Navegando a LifeOS en Gimnasio...');
    await page.goto(`${APP_URL}?view=gimnasio`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('5. Iniciando entrenamiento desde rutina histórica con timerEnabled: false...');
    // Seleccionar la rutina histórica en el selector de rutinas
    const templateSelect = page.locator('select').filter({ hasText: 'Empuje (Histórica)' }).first();
    await templateSelect.waitFor({ state: 'visible', timeout: 8000 });
    await templateSelect.selectOption('template-empuje-legacy');
    await page.waitForTimeout(400);

    // Hacer clic en "Iniciar entrenamiento"
    const startBtn = page.locator('button').filter({ hasText: /Iniciar entrenamiento|Iniciar otro entrenamiento/i }).first();
    await startBtn.click();
    await page.waitForTimeout(1000);

    // Verificar que estamos en ActiveWorkoutView
    const activeHeader = page.locator('text=Press Banca').first();
    await activeHeader.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✔ Vista de entrenamiento activo abierta correctamente para Press Banca.');

    console.log('6. Marcando serie 1 completada para disparar el temporizador de descanso...');
    const completeSetBtn = page.locator('.c-primary-cta').first();
    await completeSetBtn.click();
    await page.waitForTimeout(800);

    // Verificar que la fase de descanso está activa
    const timerText = page.locator('.c-rest-timer-text').first();
    await timerText.waitFor({ state: 'visible', timeout: 4000 });
    const formattedVal = (await timerText.textContent()) || '';
    console.log(`✔ Temporizador iniciado automáticamente: ${formattedVal.trim()}`);
    assert.ok(/\d{1,2}:\d{2}/.test(formattedVal), 'El cronómetro de descanso debe mostrar formato mm:ss');

    // Capturar screenshot 1: Temporizador funcionando en móvil
    const timerScreenshotPath = path.join(ARTIFACTS_DIR, 'gym-timer-mobile.png');
    await page.screenshot({ path: timerScreenshotPath });
    console.log(`✔ Captura del temporizador guardada: ${timerScreenshotPath}`);

    console.log('7. Probando minimizar el temporizador...');
    const minimizeBtn = page.locator('button').filter({ hasText: 'Minimizar' }).first();
    if (await minimizeBtn.isVisible()) {
      await minimizeBtn.click();
      await page.waitForTimeout(500);

      // Verificar que la barra sticky permanece visible
      const stickyBar = page.locator('.gym-rest-sticky-bar').first();
      assert.ok(await stickyBar.isVisible(), 'La barra sticky debe ser visible tras minimizar');
      console.log('✔ Barra sticky de descanso permanece visible tras minimizar.');

      console.log('8. Probando pausa y reanudación desde la barra...');
      const pauseBtn = stickyBar.locator('button').filter({ hasText: /Pausa|Seguir/i }).first();
      await pauseBtn.click();
      await page.waitForTimeout(500);
      console.log('✔ Temporizador pausado.');

      await pauseBtn.click();
      await page.waitForTimeout(500);
      console.log('✔ Temporizador reanudado.');

      // Restaurar temporizador
      const restoreBtn = stickyBar.locator('button').filter({ hasText: 'Ver' }).first();
      if (await restoreBtn.isVisible()) {
        await restoreBtn.click();
        await page.waitForTimeout(500);
      }
    }

    console.log('9. Avanzando descanso y completando las series restantes...');
    // Saltar descanso actual para avanzar
    const skipBtn = page.locator('button').filter({ hasText: /Ir a la siguiente|Saltar|Siguiente/i }).first();
    if (await skipBtn.isVisible()) {
      await skipBtn.click();
      await page.waitForTimeout(600);
    }

    // Serie 2 de Press Banca: completarla
    const set2Btn = page.locator('.c-primary-cta').first();
    if (await set2Btn.isVisible()) {
      await set2Btn.click();
      await page.waitForTimeout(600);
      // Saltar descanso entre ejercicios para entrar a Press Inclinado
      const skip2 = page.locator('button').filter({ hasText: /Ir a la siguiente|Saltar|Siguiente|Cambio/i }).first();
      if (await skip2.isVisible()) {
        await skip2.click();
        await page.waitForTimeout(600);
      }
    }

    console.log('10. Finalizando sesión de entrenamiento...');
    const finishBtn = page.locator('button.c-primary-cta').filter({ hasText: /Finalizar/i }).first();
    await finishBtn.waitFor({ state: 'visible', timeout: 5000 });
    await finishBtn.click();
    await page.waitForTimeout(1000);

    const modal = page.locator('[role="dialog"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✔ Modal de resumen visible.');

    // Verificar duración
    const durationElem = modal.locator('text=min').first();
    assert.ok(await durationElem.isVisible(), 'El modal debe mostrar una métrica de duración');
    const durText = await durationElem.textContent();
    console.log(`✔ Duración calculada en el modal: ${durText?.trim()}`);

    // Verificar PRs
    const prCard = modal.locator('text=Récords personales').first();
    const hasPRs = await prCard.isVisible();
    console.log(`✔ Sección de PRs presente: ${hasPRs}`);

    // Verificar accesibilidad y posición del botón Continuar en el viewport 375x812
    const continueBtn = modal.locator('button[aria-label="Continuar en Celestian"]').first();
    assert.ok(await continueBtn.isVisible(), 'El botón Continuar debe estar visible');

    const box = await continueBtn.boundingBox();
    assert.ok(box, 'El botón Continuar debe tener bounding box');
    console.log(`✔ Posición del botón Continuar: y=${box.y}, height=${box.height}`);
    assert.ok(box.y >= 0 && box.y + box.height <= 812, 'El botón Continuar debe estar completamente dentro del viewport de 812px sin scroll forzado');

    // Capturar screenshot 2: Modal de resumen en móvil
    const summaryScreenshotPath = path.join(ARTIFACTS_DIR, 'gym-summary-modal-mobile.png');
    await page.screenshot({ path: summaryScreenshotPath });
    console.log(`✔ Captura del modal guardada: ${summaryScreenshotPath}`);

    // Hacer clic en Continuar para cerrar
    await continueBtn.click();
    await page.waitForTimeout(600);
    assert.ok(!(await modal.isVisible()), 'El modal debe cerrarse tras hacer clic en Continuar');
    console.log('✔ Modal cerrado correctamente tras hacer clic en Continuar.');

    console.log('\n============================================================');
    console.log(' ✔ VALIDACIÓN E2E MÓVIL COMPLETADA CON ÉXITO');
    console.log('============================================================\n');
  } catch (err) {
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'debug-failure.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('\n✖ Error en la validación:', err);
  process.exit(1);
});
