import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 5221;
const APP_URL = `http://localhost:${PORT}/`;

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
              timerEnabled: false,
              restSecondsMode: 'inherit',
              weight: 80,
              sets: [
                { id: 's1', weight: 80, reps: 8, completed: false },
                { id: 's2', weight: 80, reps: 8, completed: false },
              ],
            },
          ],
        },
      ],
      sessions: [],
    },
  };
}

async function run() {
  console.log('1. Iniciando servidor Vite preview...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { shell: true, stdio: 'ignore' });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(APP_URL);
      if (res.ok) break;
    } catch {}
  }

  console.log('2. Conectando navegador móvil 375x812...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.addInitScript((st) => {
    localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
  }, makeSyntheticState());

  await page.goto(`${APP_URL}?view=gimnasio`);
  await page.waitForLoadState('networkidle');

  console.log('3. Iniciando entrenamiento desde rutina histórica...');
  const templateSelect = page.locator('select').filter({ hasText: 'Empuje (Histórica)' }).first();
  await templateSelect.waitFor({ state: 'visible', timeout: 5000 });
  await templateSelect.selectOption('template-empuje-legacy');

  const startBtn = page.locator('button').filter({ hasText: /Iniciar entrenamiento/i }).first();
  await startBtn.click();
  await page.waitForTimeout(400);

  // Completar set 1 inmediatamente para activar descanso mientras el toast sigue en pantalla
  console.log('4. Completando serie 1 para activar descanso...');
  const completeSetBtn = page.locator('.c-primary-cta').first();
  await completeSetBtn.click();
  await page.waitForTimeout(300);

  // Comprobar que el toast verde ESTÁ PRESENTE
  const toast = page.locator('.toast-enter').first();
  await toast.waitFor({ state: 'visible', timeout: 3000 });
  const toastText = await toast.textContent();
  console.log(`✔ Toast presente en pantalla: "${toastText?.trim()}"`);
  assert.ok(toastText?.includes('Entrenamiento iniciado'), 'El toast debe ser el de inicio');

  const toastBox = await toast.boundingBox();
  console.log(`✔ Coordenadas del Toast: top=${toastBox?.y}, bottom=${toastBox?.y + toastBox?.height}`);
  assert.ok(toastBox && toastBox.y < 150, 'El toast debe estar posicionado en la zona superior (< 150px)');

  // 1. Pausa con el aviso presente
  console.log('5. Pulsando PAUSA con el aviso presente...');
  const pauseBtn = page.locator('button[aria-label="Pausar descanso"]').first();
  await pauseBtn.waitFor({ state: 'visible', timeout: 2000 });
  const pauseBox = await pauseBtn.boundingBox();
  console.log(`   Coordenadas botón Pausar: y=${pauseBox?.y}`);
  assert.ok(pauseBox && pauseBox.y > toastBox.y + toastBox.height, 'El botón de pausa no debe colisionar con el toast');
  await pauseBtn.click();
  await page.waitForTimeout(400);

  // 2. Reanudación con el aviso presente
  console.log('6. Pulsando REANUDAR con el aviso presente...');
  const resumeBtn = page.locator('button[aria-label="Reanudar descanso"]').first();
  await resumeBtn.waitFor({ state: 'visible', timeout: 2000 });
  await resumeBtn.click();
  await page.waitForTimeout(400);

  // 3. Ajuste -30s con el aviso presente
  console.log('7. Pulsando AJUSTE -30s...');
  const timerTextBefore = (await page.locator('.c-rest-timer-text').first().textContent()) || '';
  console.log(`   Tiempo antes de -30s: ${timerTextBefore.trim()}`);
  const minus30Btn = page.locator('button[aria-label="Restar 30 segundos"]').first();
  await minus30Btn.click();
  await page.waitForTimeout(400);
  const timerTextAfterMinus = (await page.locator('.c-rest-timer-text').first().textContent()) || '';
  console.log(`   Tiempo después de -30s: ${timerTextAfterMinus.trim()}`);

  // 4. Ajuste +30s con el aviso presente
  console.log('8. Pulsando AJUSTE +30s...');
  const plus30Btn = page.locator('button[aria-label="Sumar 30 segundos"]').first();
  await plus30Btn.click();
  await page.waitForTimeout(400);
  const timerTextAfterPlus = (await page.locator('.c-rest-timer-text').first().textContent()) || '';
  console.log(`   Tiempo después de +30s: ${timerTextAfterPlus.trim()}`);

  // 5. Omisión (Empezar serie ya / Saltar descanso)
  console.log('9. Pulsando OMISIÓN (Empezar serie ya)...');
  const skipBtn = page.locator('.c-primary-cta').first();
  const skipBtnText = (await skipBtn.textContent()) || '';
  console.log(`   Botón de omisión visible: "${skipBtnText.trim()}"`);
  assert.ok(/Comenzar Serie|Empezar serie|Saltar descanso/i.test(skipBtnText), 'El botón de omisión debe ser visible');
  await skipBtn.click();
  await page.waitForTimeout(600);

  // Verificar que la omisión avanzó a la serie 2
  const nextSetCta = page.locator('.c-primary-cta').first();
  const nextSetText = (await nextSetCta.textContent()) || '';
  console.log(`✔ Fase de descanso omitida con éxito. Botón actual: "${nextSetText.trim()}"`);
  assert.ok(/Completar Serie 2/i.test(nextSetText), 'Debe haber avanzado a Completar Serie 2');

  // 6. Probar control de descarte del Toast (botón ✕)
  console.log('10. Probando control de descarte (botón ✕) del Toast...');
  // Disparar un nuevo toast de prueba
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('lifeos:toast', {
      detail: { id: 'test-dismiss-id', message: 'Aviso de prueba para descartar', tone: 'info' }
    }));
  });
  await page.waitForTimeout(300);

  const testToast = page.locator('.toast-enter').filter({ hasText: 'Aviso de prueba para descartar' }).first();
  await testToast.waitFor({ state: 'visible', timeout: 2000 });
  console.log('   Toast de prueba visible.');

  const dismissBtn = testToast.locator('button[aria-label="Descartar aviso"]').first();
  await dismissBtn.waitFor({ state: 'visible', timeout: 2000 });
  await dismissBtn.click();
  await page.waitForTimeout(300);

  const stillVisible = await testToast.isVisible().catch(() => false);
  assert.strictEqual(stillVisible, false, 'El toast debe desaparecer inmediatamente al hacer clic en descartar');
  console.log('✔ Toast descartado correctamente con el control de descarte (✕).');

  console.log('\n✔ TODAS LAS ACCIONES (PAUSA, REANUDACIÓN, -30s, +30s, OMISIÓN Y DESCARTE) FUERON PULSADAS CON ÉXITO SIN NINGUNA COLISIÓN.');

  await browser.close();
  server.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error durante la validación:', err);
  process.exit(1);
});
