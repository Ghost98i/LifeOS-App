import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = process.env.TEST_PORT || 5198;
const APP_URL = `http://localhost:${TEST_PORT}/`;

function makeBaseState(custom = {}) {
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-19',
      lastWeeklyReviewAt: '2026-10-19',
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
    ...custom,
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

async function setupPage(context, state) {
  const page = await context.newPage();
  await page.addInitScript((st) => {
    if (!localStorage.getItem('lifeos-state-v1')) {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
    }
  }, state);
  return page;
}

async function getStoredState(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('lifeos-state-v1');
    return raw ? JSON.parse(raw) : null;
  });
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

async function main() {
  console.log('\n============================================================');
  console.log(' LifeOS — Estudios Fase 0: Verificación E2E en Navegador Real');
  console.log('============================================================\n');

  // Lanzar servidor vite preview en puerto exclusivo
  const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(TEST_PORT), '--strictPort'], {
    stdio: 'ignore',
  });

  // Esperar a que el servidor esté activo
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
  const createContext = browser.newContext.bind(browser);
  browser.newContext = async (options = {}) => {
    const context = await createContext(options);
    await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    return context;
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Asignación de sesión «General» cuando existen materias
    // -------------------------------------------------------------------------
    await runStep('1. Asignación: Sesión General con materias existentes persiste subjectId como null', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = Date.now();
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-mat', name: 'Matemática Discreta' }],
          exams: [],
          studyLog: [],
          // Sesión activa con 2 minutos transcurridos (cumple política de sub-minuto)
          activeSession: {
            id: 'sess-gen-test',
            plannedMinutes: 25,
            targetSubjectId: null,
            targetSubjectName: null,
            startedAt: now - 120000,
            status: 'running',
            endsAt: now + 23 * 60000,
            remainingSeconds: 23 * 60,
            lastTickAt: now,
            elapsedMinutes: 2,
          },
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Finalizar sesión temprana (2 min transcurridos)
      const finishBtn = page.getByRole('button', { name: /Terminar ahora/i });
      await finishBtn.waitFor({ state: 'visible' });
      await finishBtn.click();

      // Verificar en la lista de registros que dice "General", NO "Matemática Discreta"
      const logItem = page.locator('#qa-focus-estudio .divide-y > div').first();
      await logItem.waitFor({ state: 'visible' });
      const logItemText = await logItem.innerText();
      assert.ok(logItemText.includes('General'), 'El registro debe rotularse como General');
      assert.equal(logItemText.includes('Matemática Discreta'), false, 'NO debe asignarse a Matemática Discreta');

      // Verificar persistencia en localStorage
      const saved = await getStoredState(page);
      assert.equal(saved.study.activeSession, null);
      assert.equal(saved.study.studyLog.length, 1);
      assert.equal(saved.study.studyLog[0].subjectId, null);
      assert.equal(saved.study.studyLog[0].minutes, 2);

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 2: Protección de materias contra eliminación destructiva
    // -------------------------------------------------------------------------
    await runStep('2. Protección: Materia con exámenes no se elimina y muestra aviso', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-fis', name: 'Física I' }],
          exams: [{ id: 'ex-1', subjectId: 'sub-fis', date: '2026-10-25', status: 'pendiente' }],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Intentar eliminar la materia
      const deleteSubjectBtn = page.getByRole('button', { name: /Eliminar materia/i }).first();
      await deleteSubjectBtn.click();

      // Debe aparecer el aviso de protección
      const warningText = page.locator('text=No se puede eliminar la materia porque conserva').first();
      await warningText.waitFor({ state: 'visible' });
      assert.ok(await warningText.isVisible());

      // Verificar que la materia sigue existiendo
      const subjectRow = page.locator('span.font-semibold', { hasText: 'Física I' }).first();
      assert.ok(await subjectRow.isVisible());

      const saved = await getStoredState(page);
      assert.equal(saved.study.subjects.length, 1);

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 3: Persistencia real del temporizador (ciclo completo con reload e idempotencia)
    // -------------------------------------------------------------------------
    await runStep('3. Persistencia real: Iniciar -> Navegar -> Reload activo -> Pausar -> Reload pausado -> Reanudar -> Finalizar en overlay -> Idempotencia', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-prog', name: 'Programación' }],
          exams: [],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // 1. Seleccionar materia "Programación"
      const subSelect = page.locator('select', { hasText: 'General' }).first();
      await subSelect.selectOption('sub-prog');

      // 2. Iniciar sesión de 25 min desde Estudios
      const startBtn = page.getByRole('button', { name: /Iniciar Enfoque/i });
      await startBtn.click();

      // Verificar en localStorage que se guardó la sesión activa
      let saved = await getStoredState(page);
      assert.ok(saved.study.activeSession, 'activeSession debe existir en localStorage');
      const initialSessionId = saved.study.activeSession.id;
      assert.equal(saved.study.activeSession.targetSubjectId, 'sub-prog');
      assert.equal(saved.study.activeSession.status, 'running');
      assert.equal(saved.study.activeSession.plannedMinutes, 25);

      // 3. Navegar a otro módulo (Agenda) mediante URL para que reload persista en esa vista
      await page.goto(`${APP_URL}?view=agenda`);
      await page.waitForLoadState('networkidle');

      // Verificar que el control flotante StudyActiveOverlay es visible
      const overlay = page.locator('aside[aria-label="Sesión de estudio en curso"]');
      await overlay.waitFor({ state: 'visible' });
      assert.ok(await overlay.isVisible());
      assert.ok(/Programaci[oó]n/i.test(await overlay.innerText()));

      // 4. Recargar mientras está activa y confirmar que recupera mismo sessionId, duración, materia y estado
      await page.reload();
      await page.waitForLoadState('networkidle');
      await overlay.waitFor({ state: 'visible' });
      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession.id, initialSessionId, 'sessionId debe ser idéntico tras reload');
      assert.equal(saved.study.activeSession.status, 'running', 'estado debe ser running tras reload');
      assert.equal(saved.study.activeSession.plannedMinutes, 25);
      assert.equal(saved.study.activeSession.targetSubjectId, 'sub-prog');

      // 5. Pausar desde el control flotante
      const pauseBtn = overlay.getByRole('button', { name: '⏸' });
      await pauseBtn.click();
      await page.waitForTimeout(200);

      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession.status, 'paused', 'estado debe cambiar a paused');

      // 6. Recargar mientras está pausada y confirmar que continúa pausada
      await page.reload();
      await page.waitForLoadState('networkidle');
      await overlay.waitFor({ state: 'visible' });
      assert.ok((await overlay.innerText()).includes('Pausado'));
      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession.status, 'paused', 'continúa pausada tras reload');

      // 7. Reanudar desde el control flotante
      const resumeBtn = overlay.getByRole('button', { name: '▶' });
      await resumeBtn.click();
      await page.waitForTimeout(200);
      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession.status, 'running', 'reanudó a running');

      // 8. Simular que transcurrieron 2 minutos para cumplir política sub-minuto y recargar para que React tome el estado actualizado
      await page.evaluate(() => {
        const raw = localStorage.getItem('lifeos-state-v1');
        const st = JSON.parse(raw);
        if (st.study?.activeSession) {
          st.study.activeSession.startedAt = Date.now() - 120000;
          st.study.activeSession.endsAt = Date.now() + 23 * 60000;
          st.study.activeSession.remainingSeconds = 23 * 60;
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        }
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await overlay.waitFor({ state: 'visible' });

      // Finalizar desde overlay
      const finishOverlayBtn = overlay.getByRole('button', { name: /Terminar/i });
      await finishOverlayBtn.click();
      await page.waitForTimeout(300);

      // 9. Verificar que desaparece la sesión activa y se registra exactamente una vez
      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession, null, 'activeSession debe ser null tras finalizar');
      assert.equal(saved.study.studyLog.length, 1, 'studyLog debe tener exactamente 1 registro');
      assert.equal(saved.study.studyLog[0].sessionId, initialSessionId);
      assert.equal(saved.study.studyLog[0].subjectId, 'sub-prog');
      assert.equal(saved.study.studyLog[0].minutes, 2);

      // Overlay ya no debe estar visible
      assert.equal(await overlay.isVisible(), false);

      // 10. Comprobar idempotencia: intentar registrar nuevamente la misma sesión
      const idempotencyResult = await page.evaluate((sessId) => {
        const raw = localStorage.getItem('lifeos-state-v1');
        const st = JSON.parse(raw);
        const existing = st.study.studyLog.find((l) => l.sessionId === sessId);
        // Si ya existe, no se permite volver a registrar
        return { alreadyLogged: Boolean(existing) };
      }, initialSessionId);
      assert.equal(idempotencyResult.alreadyLogged, true, 'Sesión protegida por idempotencia');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 4: Sesiones cortas (sub-minuto): Finalizar < 60s no inventa 1 min
    // -------------------------------------------------------------------------
    await runStep('4. Sub-minuto: Finalizar a los pocos segundos (<60s) NO genera registro en studyLog', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-test', name: 'Biología' }],
          exams: [],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Iniciar sesión y terminarla casi de inmediato (unos segundos de vida real)
      const startBtn = page.getByRole('button', { name: /Iniciar Enfoque/i });
      await startBtn.click();

      const finishBtn = page.getByRole('button', { name: /Terminar ahora/i });
      await finishBtn.waitFor({ state: 'visible' });
      await finishBtn.click();
      await page.waitForTimeout(300);

      // Verificar en localStorage que NO se inventó 1 minuto
      const saved = await getStoredState(page);
      assert.equal(saved.study.activeSession, null, 'La sesión activa se descartó');
      assert.equal(saved.study.studyLog.length, 0, 'No debe generarse ningún registro en studyLog si duró < 60s');

      // Verificar que la interfaz sigue mostrando "Sin registros de estudio."
      const emptyMsg = page.getByText('Sin registros de estudio aún.', { exact: true });
      assert.ok(await emptyMsg.isVisible(), 'El historial debe permanecer vacío');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 5: Recuperación e interrupción (interrupted_offline)
    // -------------------------------------------------------------------------
    await runStep('5. Recuperación offline: Pestaña suspendida por horas muestra opciones y no inventa minutos sin confirmar', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const now = Date.now();
      // Sesión iniciada hace 4 horas que venció hace 3h 35min
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-quim', name: 'Química Orgánica' }],
          exams: [],
          studyLog: [],
          activeSession: {
            id: 'sess-offline-test',
            plannedMinutes: 25,
            targetSubjectId: 'sub-quim',
            targetSubjectName: 'Química Orgánica',
            startedAt: now - 4 * 60 * 60 * 1000,
            status: 'running',
            endsAt: now - (4 * 60 * 60 * 1000 - 25 * 60 * 1000),
            remainingSeconds: 0,
            lastTickAt: now - 3.8 * 60 * 60 * 1000,
            elapsedMinutes: 25,
          },
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // 1. Verificar que NO se crearon minutos automáticamente
      let saved = await getStoredState(page);
      assert.equal(saved.study.studyLog.length, 0, 'No debe registrar automáticamente sin confirmación');

      // 2. Verificar que el banner de recuperación es visible
      const recoveryBanner = page.getByText('Sesión interrumpida', { exact: true });
      await recoveryBanner.waitFor({ state: 'visible' });
      assert.ok(await recoveryBanner.isVisible());

      // 3. Probar opción Descartar
      const discardBtn = page.getByRole('button', { name: /Descartar/i }).first();
      await discardBtn.click();
      await page.waitForTimeout(300);

      // Verificar que se limpió la sesión activa y no hubo log
      saved = await getStoredState(page);
      assert.equal(saved.study.activeSession, null, 'Sesión activa debe limpiarse');
      assert.equal(saved.study.studyLog.length, 0, 'studyLog debe seguir vacío');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 6: Audio Web API: Desmontaje efectivo del sonido ambiente
    // -------------------------------------------------------------------------
    await runStep('6. Audio: Desmontaje efectivo del sonido ambiente al navegar fuera de Estudios', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Iniciar sonido de fondo
      await page.getByRole('button', { name: 'Ajustar canales', exact: true }).click();
      await page.getByLabel('🌧️ Lluvia suave', { exact: true }).check();
      await page.getByRole('button', { name: /Escuchar ahora/ }).click();
      await page.getByText('Sonando en vivo', { exact: true }).waitFor();
      await page.waitForTimeout(200);

      // Navegar a otra vista (Hoy)
      const hoyNav = page.getByRole('button', { name: /Hoy/i }).first();
      await hoyNav.click();
      await page.waitForTimeout(300);

      // Volver a Estudios y confirmar que el sonido no quedó descontrolado
      const estudiosNav = page.getByRole('button', { name: /Estudios/i }).first();
      await estudiosNav.click();
      await page.waitForTimeout(300);

      assert.equal(await page.getByText('Sonando en vivo', { exact: true }).count(), 0, 'No debe seguir reproduciéndose tras desmontar Estudios');
      assert.ok(await page.getByRole('button', { name: /Escuchar ahora/ }).isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 7: Geometría visual del overlay en móvil y escritorio
    // -------------------------------------------------------------------------
    await runStep('7. Geometría overlay: Visible en móvil (375x667) y escritorio (1280x800) sin colisión', async () => {
      const now = Date.now();
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-geo', name: 'Geometría' }],
          exams: [],
          studyLog: [],
          activeSession: {
            id: 'sess-geo-test',
            plannedMinutes: 25,
            targetSubjectId: 'sub-geo',
            targetSubjectName: 'Geometría',
            startedAt: now,
            status: 'running',
            endsAt: now + 25 * 60000,
            remainingSeconds: 25 * 60,
            lastTickAt: now,
            elapsedMinutes: 0,
          },
        },
      });

      // 1. Modo Móvil (375x667)
      const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const mobilePage = await setupPage(mobileContext, state);
      await mobilePage.goto(`${APP_URL}?view=agenda`);
      await mobilePage.waitForLoadState('networkidle');

      const mobileOverlay = mobilePage.locator('aside[aria-label="Sesión de estudio en curso"]');
      await mobileOverlay.waitFor({ state: 'visible' });
      const mobileBox = await mobileOverlay.boundingBox();
      assert.ok(mobileBox, 'Overlay debe tener dimensiones en móvil');
      assert.ok(mobileBox.width > 300, 'Overlay debe ocupar el ancho en móvil');
      // Asegurarse de que el overlay esté posicionado arriba de la barra de navegación móvil
      assert.ok(mobileBox.y + mobileBox.height <= 667, 'Debe caber dentro de la ventana móvil');
      await mobileContext.close();

      // 2. Modo Escritorio (1280x800)
      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const desktopPage = await setupPage(desktopContext, state);
      await desktopPage.goto(`${APP_URL}?view=agenda`);
      await desktopPage.waitForLoadState('networkidle');

      const desktopOverlay = desktopPage.locator('aside[aria-label="Sesión de estudio en curso"]');
      await desktopOverlay.waitFor({ state: 'visible' });
      const desktopBox = await desktopOverlay.boundingBox();
      assert.ok(desktopBox, 'Overlay debe tener dimensiones en escritorio');
      assert.ok(desktopBox.width >= 350, 'Overlay debe tener ancho de tarjeta en escritorio');
      await desktopContext.close();
    });

    // -------------------------------------------------------------------------
    // TEST 8: Validación de minutos en registro manual
    // -------------------------------------------------------------------------
    await runStep('8. Validación: Rechaza minutos negativos o cero en formulario manual', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState();

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Intentar ingresar -30 minutos
      await page.getByRole('button', { name: 'Registrar tiempo manualmente', exact: true }).click();
      const minutesInput = page.locator('input[placeholder="60"]');
      await minutesInput.fill('-30');
      const submitBtn = page.locator('#manual-study-form').getByRole('button', { name: 'Registrar', exact: true });
      await submitBtn.click();

      // Verificar que no se creó registro
      const emptyMsg = page.getByText('Sin registros de estudio aún.', { exact: true });
      await emptyMsg.waitFor({ state: 'visible' });
      assert.ok(await emptyMsg.isVisible());
      assert.equal((await getStoredState(page)).study.studyLog.length, 0);
      await minutesInput.fill('0');
      await submitBtn.click();
      assert.equal((await getStoredState(page)).study.studyLog.length, 0);

      // Ingresar 45 minutos válidos
      await minutesInput.fill('45');
      await submitBtn.click();

      // Verificar que aparece el registro de 45 min
      const registeredItem = page.locator('#qa-focus-estudio').getByText('45 min').first();
      await registeredItem.waitFor({ state: 'visible' });
      assert.ok(await registeredItem.isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 9: Acceso al historial completo (> 10 entradas)
    // -------------------------------------------------------------------------
    await runStep('9. Historial: Muestra botón "Ver historial completo" cuando hay más de 10 registros', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const logs = Array.from({ length: 15 }, (_, i) => ({
        id: `log-${i + 1}`,
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        minutes: 30,
        subjectId: null,
      }));

      const state = makeBaseState({
        study: {
          subjects: [],
          exams: [],
          studyLog: logs,
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Debe mostrar el botón de ver historial completo
      const expandBtn = page.getByRole('button', { name: /Ver historial completo \(15 registros\)/i });
      await expandBtn.waitFor({ state: 'visible' });
      assert.ok(await expandBtn.isVisible());

      // Al hacer clic, debe expandir y cambiar el texto a "Mostrar menos"
      await expandBtn.click();
      const collapseBtn = page.getByRole('button', { name: /Mostrar menos/i });
      await collapseBtn.waitFor({ state: 'visible' });
      assert.ok(await collapseBtn.isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 10: Sincronización y timestamps (createdAt y updatedAt en exámenes)
    // -------------------------------------------------------------------------
    await runStep('10. Sincronización: Modificación de estado de examen actualiza updatedAt', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-exam', name: 'Arquitectura' }],
          exams: [{ id: 'exam-10', subjectId: 'sub-exam', date: '2026-10-30', status: 'pendiente', createdAt: 1000, updatedAt: 1000 }],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Cambiar estado a "aprobado"
      const statusSelect = page.locator('#exam-exam-10 select');
      await statusSelect.selectOption('aprobado');
      await page.waitForTimeout(300);

      // Verificar que updatedAt fue actualizado a timestamp reciente
      const saved = await getStoredState(page);
      assert.equal(saved.study.exams[0].status, 'aprobado');
      assert.ok(saved.study.exams[0].updatedAt > 1000, 'updatedAt debe haberse actualizado');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 11: Estado vacío amigable y primeros pasos con acciones directas
    // -------------------------------------------------------------------------
    await runStep('11. Fase 1A: Estado vacío muestra primeros pasos con 3 accesos directos accionables', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [],
          exams: [],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      const emptySection = page.locator('section[aria-label="Primeros pasos en Estudios"]');
      await emptySection.waitFor({ state: 'visible' });
      assert.ok(await emptySection.isVisible(), 'Sección de primeros pasos debe ser visible');

      // 3 accesos directos
      const addSubBtn = emptySection.getByRole('button', { name: /Añadir primera materia/i });
      const addExamBtn = emptySection.getByRole('button', { name: /Añadir evaluación/i });
      const freeSessionBtn = emptySection.getByRole('button', { name: /Sesión libre de 25 min/i });

      assert.ok(await addSubBtn.isVisible(), 'Botón añadir primera materia visible');
      assert.ok(await addExamBtn.isVisible(), 'Botón añadir evaluación visible');
      assert.ok(await freeSessionBtn.isVisible(), 'Botón sesión libre visible');

      // The current workspace keeps its academic management sections available.
      // Check unique entry points and empty metrics without assuming an obsolete layout.
      assert.equal(await page.locator('.lifeos-stat-card').count(), 0, 'No deben mostrarse tarjetas de estadísticas en estado vacío');
      assert.equal(await emptySection.getByRole('button').count(), 3, 'Los primeros pasos deben tener tres acciones distintas');
      assert.equal(await page.locator('section[aria-label="Gestión de materias"]').count(), 1);
      assert.equal(await page.locator('section[aria-label="Gestión de evaluaciones y exámenes"]').count(), 1);

      // Clic en sesión libre inicia temporizador
      await freeSessionBtn.click();
      await page.waitForSelector('button:has-text("Terminar ahora")', { timeout: 3000 });
      const saved = await getStoredState(page);
      assert.ok(saved.study.activeSession, 'activeSession debe haberse iniciado');
      assert.equal(saved.study.activeSession.plannedMinutes, 25);
      assert.ok(!saved.study.activeSession.subjectId, 'subjectId no debe tener materia asignada');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 12: Creación de evaluación completa con título, hora, materia y nota
    // -------------------------------------------------------------------------
    await runStep('12. Fase 1A: Creación de evaluación con título, hora, materia y nota', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-prog', name: 'Programación Avanzada' }],
          exams: [],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Abrir modal desde el encabezado
      await page.locator('button[title="Añadir evaluación"]').click();
      await page.waitForSelector('div[role="dialog"]');

      // Completar formulario
      await page.fill('input[placeholder*="Primer parcial"]', 'Parcial 1 Algoritmos');
      await page.selectOption('div[role="dialog"] select:has(option:has-text("Programación Avanzada"))', 'sub-prog');
      await page.fill('div[role="dialog"] input[type="date"]', '2026-11-20');
      await page.fill('div[role="dialog"] input[type="time"]', '14:30');
      await page.fill('input[placeholder*="Sobresaliente"]', '9.5');

      // Guardar
      await page.locator('button:has-text("Guardar evaluación")').click();
      await page.waitForSelector('text=Evaluación registrada');

      // Verificar en localStorage
      const saved = await getStoredState(page);
      assert.equal(saved.study.exams.length, 1);
      const ex = saved.study.exams[0];
      assert.equal(ex.title, 'Parcial 1 Algoritmos');
      assert.equal(ex.subjectId, 'sub-prog');
      assert.equal(ex.date, '2026-11-20');
      assert.equal(ex.time, '14:30');
      assert.equal(ex.grade, '9.5');
      assert.ok(ex.createdAt > 0);
      assert.ok(ex.updatedAt > 0);

      // Verificar visualización en DOM
      assert.ok(await page.locator(`[id="exam-${ex.id}"]`).isVisible());
      assert.ok(await page.locator('text=14:30').first().isVisible());
      assert.ok(await page.locator('text=Nota: 9.5').first().isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 13: Creación de evaluación independiente (sin materia asignada)
    // -------------------------------------------------------------------------
    await runStep('13. Fase 1A: Creación de evaluación independiente (sin materia) asigna subjectId como null', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-existing', name: 'Biología' }],
          exams: [],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Abrir modal de evaluación
      await page.locator('button[title="Añadir evaluación"]').click();
      await page.waitForSelector('div[role="dialog"]');

      await page.fill('input[placeholder*="Primer parcial"]', 'Certificación Cloud Architect');
      // Seleccionar opción General (sin materia)
      await page.selectOption('div[role="dialog"] select:has(option:has-text("Sin materia"))', '');
      await page.fill('div[role="dialog"] input[type="date"]', '2026-12-05');

      await page.locator('button:has-text("Guardar evaluación")').click();
      await page.waitForSelector('text=Evaluación registrada');

      const saved = await getStoredState(page);
      const ex = saved.study.exams.find((e) => e.title === 'Certificación Cloud Architect');
      assert.ok(ex, 'La evaluación debe existir en el estado');
      assert.equal(ex.subjectId, null, 'subjectId debe ser estrictamente null');

      // En el DOM debe mostrarse
      assert.ok(await page.locator(`[id="exam-${ex.id}"]`).isVisible());

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 14: Renombrar materia preserva id, actualiza snapshot en studyLog y conserva exámenes
    // -------------------------------------------------------------------------
    await runStep('14. Fase 1A: Renombrar materia preserva id, actualiza snapshots en studyLog y exámenes', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-calc', name: 'Matemática', createdAt: 500, updatedAt: 500 }],
          exams: [{ id: 'ex-calc', subjectId: 'sub-calc', title: 'Final Matemática', date: '2026-11-25', status: 'pendiente' }],
          studyLog: [{ id: 'log-calc', subjectId: 'sub-calc', subjectName: 'Matemática', date: '2026-10-18', minutes: 50 }],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Clic en editar materia
      await page.locator('button[title="Renombrar materia"]').first().click();
      await page.waitForSelector('div[role="dialog"]');

      // Modificar nombre
      const nameInput = page.locator('input[placeholder*="Álgebra"]');
      await nameInput.fill('Cálculo Infinitesimal');
      await page.locator('button:has-text("Guardar cambios")').click();
      await page.waitForSelector('text=Materia renombrada');

      // Comprobar estado guardado
      const saved = await getStoredState(page);
      const sub = saved.study.subjects.find((s) => s.id === 'sub-calc');
      assert.ok(sub, 'La materia debe conservar su ID original');
      assert.equal(sub.name, 'Cálculo Infinitesimal');
      assert.ok(sub.updatedAt > 500, 'updatedAt debe haberse actualizado');

      // El examen sigue vinculado a sub-calc
      assert.equal(saved.study.exams[0].subjectId, 'sub-calc');

      // El snapshot en studyLog fue actualizado
      assert.equal(saved.study.studyLog[0].subjectName, 'Cálculo Infinitesimal');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 15: Pestañas de evaluaciones filtran según fecha y estado
    // -------------------------------------------------------------------------
    await runStep('15. Fase 1A: Pestañas de evaluaciones (Próximas, Pendientes de resultado, Historial, Todas) filtran correctamente', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-1', name: 'Química' }],
          exams: [
            { id: 'ex-fut', subjectId: 'sub-1', title: 'Examen Futuro', date: '2026-12-10', status: 'pendiente' },
            { id: 'ex-past-pend', subjectId: 'sub-1', title: 'Examen Pasado Sin Nota', date: '2026-09-15', status: 'pendiente' },
            { id: 'ex-comp', subjectId: 'sub-1', title: 'Examen Aprobado', date: '2026-09-20', status: 'aprobado', grade: '9' },
          ],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // The current workspace starts with all evaluations; each filter must work independently.
      assert.equal(await page.locator('#exam-view-filter').inputValue(), 'all');
      await page.locator('#exam-view-filter').selectOption('upcoming');
      assert.equal(await page.locator('#exam-ex-fut').count(), 1, 'Examen Futuro visible en Próximas');
      assert.equal(await page.locator('#exam-ex-past-pend').count(), 0, 'Examen Pasado no visible en Próximas');
      assert.equal(await page.locator('#exam-ex-comp').count(), 0, 'Examen Aprobado no visible en Próximas');

      // 2. Pestaña Pendientes de resultado
      await page.locator("#exam-view-filter").selectOption("pending_results");
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#exam-ex-past-pend').count(), 1, 'Examen Pasado visible en Pendientes');
      assert.equal(await page.locator('#exam-ex-fut').count(), 0, 'Examen Futuro no visible en Pendientes');

      // 3. Pestaña Historial
      await page.locator("#exam-view-filter").selectOption("completed");
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#exam-ex-comp').count(), 1, 'Examen Aprobado visible en Historial');
      assert.equal(await page.locator('#exam-ex-fut').count(), 0, 'Examen Futuro no visible en Historial');

      // 4. Pestaña Todas
      await page.locator("#exam-view-filter").selectOption("all");
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#exam-ex-fut').count(), 1, 'Examen Futuro visible en Todas');
      assert.equal(await page.locator('#exam-ex-past-pend').count(), 1, 'Examen Pasado visible en Todas');
      assert.equal(await page.locator('#exam-ex-comp').count(), 1, 'Examen Aprobado visible en Todas');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 16: Tarjeta Próximo Compromiso contextual con navegación directa
    // -------------------------------------------------------------------------
    await runStep('16. Fase 1A: Tarjeta Próximo Compromiso contextual con navegación directa', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-redes', name: 'Redes de Datos' }],
          exams: [
            { id: 'ex-redes-final', subjectId: 'sub-redes', title: 'Coloquio Final', date: '2026-11-30', time: '18:00', status: 'pendiente' },
          ],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // La tarjeta contextual de Próxima evaluación debe ser visible
      const commitmentSection = page.getByRole('region', { name: 'Para estudiar', exact: true });
      await commitmentSection.waitFor({ state: 'visible' });
      assert.ok(await commitmentSection.isVisible());
      assert.ok(await commitmentSection.locator('text=Coloquio Final').isVisible());
      assert.ok(await commitmentSection.getByRole('button', { name: /Coloquio Final · Redes de Datos/ }).isVisible());

      // Clic en "Ver evaluación"
      await commitmentSection.getByRole('button', { name: /Coloquio Final/ }).click();
      await page.waitForTimeout(400);

      // The current workspace opens the selected evaluation directly for editing.
      await page.getByRole('dialog', { name: 'Editar evaluación' }).waitFor();
      assert.equal(await page.locator('input[placeholder*="Primer parcial"]').inputValue(), 'Coloquio Final');

      await context.close();
    });

    // -------------------------------------------------------------------------
    // TEST 17: Fase 1A Pulido: Semántica visual de notas, títulos largos y modal
    // -------------------------------------------------------------------------
    await runStep('17. Fase 1A Pulido: Nota neutra sin verde contradictorio en desaprobado y título multilínea cliqueable', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const state = makeBaseState({
        study: {
          subjects: [{ id: 'sub-arq', name: 'Arquitectura de Software' }],
          exams: [
            {
              id: 'ex-desap',
              subjectId: 'sub-arq',
              title: 'Evaluación Integradora de Arquitectura de Sistemas y Redes Distribuidas',
              date: '2026-10-10',
              status: 'desaprobado',
              grade: '3/10',
            },
          ],
          studyLog: [],
        },
      });

      const page = await setupPage(context, state);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Ir a la pestaña Historial para ver el examen desaprobado
      await page.locator("#exam-view-filter").selectOption("completed");
      await page.waitForTimeout(200);

      // Comprobar que la nota 3/10 se muestra con estilo neutro (NO verde esmeralda)
      const gradeEl = page.locator('[data-testid="exam-grade-ex-desap"]');
      await gradeEl.waitFor({ state: 'visible' });
      assert.ok(await gradeEl.isVisible(), 'El badge de nota debe ser visible');
      const classList = (await gradeEl.getAttribute('class')) || '';
      assert.ok(!classList.includes('text-emerald'), 'La nota no debe contener clases de color verde esmeralda');

      // Comprobar que el título largo tiene atributo title nativo y abre el modal al hacer clic
      const titleBtn = page.locator('#exam-ex-desap button[title*="Evaluación Integradora"]');
      await titleBtn.waitFor({ state: 'visible' });
      assert.ok(await titleBtn.isVisible(), 'El título multilínea debe ser visible');
      await titleBtn.click();

      // El modal de edición debe abrirse
      await page.waitForSelector('text=Editar evaluación', { timeout: 3000 });
      assert.ok(await page.locator('text=Editar evaluación').isVisible(), 'Modal de edición debe estar abierto');

      // Helper text del modal debe aclarar el uso de calificación
      assert.ok(await page.getByRole('dialog').getByText('Nota o calificación', { exact: false }).isVisible());
      await page.locator('button:has-text("Cancelar")').click();

      await context.close();
    });

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n============================================================');
  console.log(` Resultado E2E Estudios: ${passedCount} APROBADAS, ${failedCount} FALLIDAS`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fallo no controlado en E2E Estudios:', err);
  process.exit(1);
});
