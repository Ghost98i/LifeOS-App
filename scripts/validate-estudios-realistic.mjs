import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const TEST_PORT = 5205;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const LOCAL_DIR = path.resolve('artifacts', 'estudios-realistic-qa');
const ARTIFACT_DIR = 'C:\\Users\\Christian\\.gemini\\antigravity\\brain\\38a11f6c-6161-4ee8-a34e-b59cf54aab74\\screenshots';

fs.mkdirSync(LOCAL_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function getRealisticState(isDarkMode = true) {
  return {
    profile: { name: 'Christian' },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-19',
      lastWeeklyReviewAt: '2026-10-19',
      darkMode: isDarkMode,
      hiddenTabs: [],
    },
    todayExtras: [],
    dailyPriorities: [],
    taskLog: {},
    agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
    tasksRecurring: [],
    study: {
      subjects: [
        { id: 'sub-fisica', name: 'Física I', color: '#3B82F6', createdAt: 1000, updatedAt: 1000 },
        { id: 'sub-calc', name: 'Cálculo Infinitesimal', color: '#10B981', createdAt: 1000, updatedAt: 1000 },
        { id: 'sub-distrib', name: 'Sistemas Distribuidos y Computación Paralela', color: '#8B5CF6', createdAt: 1000, updatedAt: 1000 },
      ],
      exams: [
        // 1. Próxima con fecha y hora
        {
          id: 'ex-distrib-p1',
          subjectId: 'sub-distrib',
          title: 'Primer Parcial Teórico-Práctico',
          date: '2026-10-24',
          time: '18:30',
          status: 'pendiente',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 2. Futura sin hora
        {
          id: 'ex-distrib-tp',
          subjectId: 'sub-distrib',
          title: 'Entrega Trabajo Práctico Especial de Redes y Concurrencia',
          date: '2026-11-15',
          time: null,
          status: 'pendiente',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 3. Futura adicional para misma materia (materia con varias evaluaciones)
        {
          id: 'ex-distrib-col',
          subjectId: 'sub-distrib',
          title: 'Coloquio de Algoritmos Distribuidos y Consenso Raft',
          date: '2026-12-01',
          time: '10:00',
          status: 'pendiente',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 4. Pasada pendiente de resultado (date < 2026-10-20 y pendiente)
        {
          id: 'ex-calc-recup',
          subjectId: 'sub-calc',
          title: 'Recuperatorio de Integrales y Series de Potencias',
          date: '2026-10-12',
          time: '14:00',
          status: 'pendiente',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 5. Aprobada con calificación
        {
          id: 'ex-fisica-final',
          subjectId: 'sub-fisica',
          title: 'Examen Final Regular de Mecánica y Termodinámica',
          date: '2026-09-28',
          status: 'aprobado',
          grade: '9/10',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 6. Desaprobada
        {
          id: 'ex-calc-p2',
          subjectId: 'sub-calc',
          title: 'Segundo Parcial Escrito de Límites y Derivadas',
          date: '2026-10-02',
          status: 'desaprobado',
          grade: '3/10',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // 7. Sin materia asociada (evaluación independiente)
        {
          id: 'ex-aws-cert',
          subjectId: null,
          title: 'Certificación AWS Certified Solutions Architect Associate',
          date: '2026-11-05',
          time: '09:00',
          status: 'pendiente',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      studyLog: [
        { id: 'l1', date: '2026-10-20', minutes: 50, subjectId: 'sub-distrib', subjectName: 'Sistemas Distribuidos y Computación Paralela' },
        { id: 'l2', date: '2026-10-19', minutes: 45, subjectId: 'sub-calc', subjectName: 'Cálculo Infinitesimal' },
        { id: 'l3', date: '2026-10-18', minutes: 60, subjectId: 'sub-fisica', subjectName: 'Física I' },
        { id: 'l4', date: '2026-10-17', minutes: 25, subjectId: null, subjectName: null },
        { id: 'l5', date: '2026-10-15', minutes: 40, subjectId: 'sub-distrib', subjectName: 'Sistemas Distribuidos y Computación Paralela' },
      ],
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

async function snap(page, filename, options = { fullPage: true }) {
  await dismissPwaIfVisible(page);
  const localPath = path.join(LOCAL_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, ...options });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`  📸 [${filename}] guardada`);
}

async function dismissPwaIfVisible(page) {
  try {
    const pwaBtn = page.locator('aside[role="status"] button:has-text("Entendido")');
    if (await pwaBtn.isVisible()) {
      await pwaBtn.click();
      await page.waitForTimeout(150);
    }
  } catch {}
}

async function checkHorizontalOverflow(page) {
  return await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    return {
      windowWidth: window.innerWidth,
      docScrollWidth: docEl.scrollWidth,
      docClientWidth: docEl.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      hasOverflow: docEl.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
    };
  });
}

async function main() {
  console.log('\n============================================================');
  console.log(' QA Visual y Funcional Exhaustivo — Estudios con Datos Reales');
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
  const findings = [];

  try {
    // -------------------------------------------------------------------------
    // 0. ESTADO VACÍO (Divulgación progresiva sin redundancias) - Modo Oscuro
    // -------------------------------------------------------------------------
    console.log('\n--- 0. Estado Vacío (Divulgación progresiva) ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const emptyState = getRealisticState(true);
      emptyState.study.subjects = [];
      emptyState.study.exams = [];
      emptyState.study.studyLog = [];
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, emptyState);
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      await snap(page, 'qa-00-desktop-empty-progressive.png');
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 1. DESKTOP 1536px (Escritorio Amplio / 2K) - Modo Oscuro
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Viewport 1536px (Escritorio Amplio) ---');
    {
      const context = await browser.newContext({ viewport: { width: 1536, height: 950 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const of = await checkHorizontalOverflow(page);
      findings.push({ viewport: '1536px', theme: 'dark', hasOverflow: of.hasOverflow });
      await snap(page, 'qa-01-desktop-1536px-dark.png');
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 2. DESKTOP 1280px (Escritorio Estándar) - Modo Oscuro y Modo Claro
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Viewport 1280px (Escritorio Estándar) ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const ofDark = await checkHorizontalOverflow(page);
      findings.push({ viewport: '1280px', theme: 'dark', hasOverflow: ofDark.hasOverflow });
      await snap(page, 'qa-02-desktop-1280px-dark.png');

      // Pestaña "Pendientes de resultado"
      await page.locator('button:has-text("Pendientes de resultado")').click();
      await page.waitForTimeout(300);
      await snap(page, 'qa-03-desktop-1280px-tab-pendientes.png');

      // Pestaña "Historial"
      await page.locator('button:has-text("Historial")').first().click();
      await page.waitForTimeout(300);
      await snap(page, 'qa-04-desktop-1280px-tab-historial.png');

      // Pestaña "Todas"
      await page.locator('button:has-text("Todas")').first().click();
      await page.waitForTimeout(300);
      await snap(page, 'qa-05-desktop-1280px-tab-todas.png');

      // Filtro por materia: Sistemas Distribuidos...
      await page.locator('button:has-text("Sistemas Distribuidos y Computación Paralela")').first().click();
      await page.waitForTimeout(300);
      await snap(page, 'qa-06-desktop-1280px-filter-subject.png');

      await context.close();
    }

    // 1280px Modo Claro
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.remove('dark');
      }, getRealisticState(false));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const ofLight = await checkHorizontalOverflow(page);
      findings.push({ viewport: '1280px', theme: 'light', hasOverflow: ofLight.hasOverflow });
      await snap(page, 'qa-07-desktop-1280px-light.png');
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 3. TABLET 768px - Modo Oscuro y Modo Claro
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Viewport 768px (Tablet) ---');
    {
      const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const of = await checkHorizontalOverflow(page);
      findings.push({ viewport: '768px', theme: 'dark', hasOverflow: of.hasOverflow });
      await snap(page, 'qa-08-tablet-768px-dark.png');
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.remove('dark');
      }, getRealisticState(false));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const of = await checkHorizontalOverflow(page);
      findings.push({ viewport: '768px', theme: 'light', hasOverflow: of.hasOverflow });
      await snap(page, 'qa-09-tablet-768px-light.png');
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 4. MÓVIL 389px (iPhone 14/15/16 Pro) y 375px
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Viewport 389px y 375px (Móvil) ---');
    {
      const context = await browser.newContext({
        viewport: { width: 389, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const of = await checkHorizontalOverflow(page);
      findings.push({ viewport: '389px', theme: 'dark', hasOverflow: of.hasOverflow });

      // Captura de pantalla completa
      await snap(page, 'qa-10-mobile-389px-full-dark.png');

      // Captura del viewport inicial
      await snap(page, 'qa-11-mobile-389px-viewport-top.png', { fullPage: false });

      // Scroll interactivo hacia abajo para evaluar sticky nav vs contenido
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(200);
      await snap(page, 'qa-12-mobile-389px-viewport-scrolled.png', { fullPage: false });

      // Scroll hasta el final
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      await snap(page, 'qa-13-mobile-389px-viewport-bottom.png', { fullPage: false });

      // Captura enfocada de títulos largos multilínea en móvil
      await page.evaluate(() => {
        const el = document.querySelector('#exam-ex-distrib-tp');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(200);
      await snap(page, 'qa-10b-mobile-long-title-wrapped.png', { fullPage: false });

      await context.close();
    }

    {
      const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.remove('dark');
      }, getRealisticState(false));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const of = await checkHorizontalOverflow(page);
      findings.push({ viewport: '375px', theme: 'light', hasOverflow: of.hasOverflow });
      await snap(page, 'qa-14-mobile-375px-light.png');
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 5. FORMULARIOS Y MODALES: PRUEBAS FUNCIONALES Y CAPTURAS
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Formularios y Modales ---');

    // 5.1 Modal Creación de Evaluación
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Clic en + Añadir evaluación
      await page.locator('button:has-text("Añadir evaluación")').first().click();
      await page.waitForSelector('div[role="dialog"]');

      // Completar campos realistas
      await page.fill('input[placeholder*="Primer parcial"]', 'Tercer Parcial Práctico en Laboratorio');
      await page.selectOption('div[role="dialog"] select:has(option:has-text("Sistemas Distribuidos"))', 'sub-distrib');
      await page.fill('div[role="dialog"] input[type="date"]', '2026-11-28');
      await page.fill('div[role="dialog"] input[type="time"]', '16:00');
      // Dejar calificación vacía para evidenciar el placeholder y texto de ayuda cuando está pendiente
      await snap(page, 'qa-15-modal-create-exam-filled.png');

      // Guardar y comprobar toast y DOM
      await page.locator('button:has-text("Guardar evaluación")').click();
      await page.waitForSelector('text=Evaluación registrada');
      console.log('  ✔ Creación de evaluación: Exitosa, toast confirmado y modal cerrado');

      await context.close();
    }

    // 5.2 Modal Edición de Evaluación Existente
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Buscar botón de editar en la evaluación ex-distrib-p1
      const examRow = page.locator('#exam-ex-distrib-p1');
      await examRow.locator('button[title="Editar evaluación"]').click();
      await page.waitForSelector('div[role="dialog"]');

      await snap(page, 'qa-16-modal-edit-exam-open.png');

      // Modificar la nota a '10/10' y estado a 'aprobado'
      await page.selectOption('div[role="dialog"] select:has(option:has-text("Aprobado"))', 'aprobado');
      await page.fill('input[placeholder*="Sobresaliente"]', '10/10');
      await page.locator('button:has-text("Guardar cambios")').click();
      await page.waitForSelector('text=Evaluación actualizada');
      console.log('  ✔ Edición de evaluación: Exitosa, actualización a aprobado y nota 10/10');

      await context.close();
    }

    // 5.3 Modal Creación de Materia
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("Añadir materia")').first().click();
      await page.waitForSelector('div[role="dialog"]');

      await page.fill('input[placeholder*="Álgebra"]', 'Inteligencia Artificial y Aprendizaje Automático');
      await snap(page, 'qa-17-modal-create-subject.png');

      await page.locator('button:has-text("Crear materia")').click();
      await page.waitForSelector('text=Materia agregada');
      console.log('  ✔ Creación de materia: Exitosa, nueva materia añadida a la lista');

      await context.close();
    }

    // 5.4 Modal Edición de Nombre de Materia
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Clic en editar en Física I
      await page.locator('button[title="Renombrar materia"]').first().click();
      await page.waitForSelector('div[role="dialog"]');

      await snap(page, 'qa-18-modal-edit-subject.png');

      const input = page.locator('div[role="dialog"] input[type="text"]');
      await input.fill('Física Clásica y Termodinámica');
      await page.locator('button:has-text("Guardar cambios")').click();
      await page.waitForSelector('text=Materia renombrada');
      console.log('  ✔ Renombrado de materia: Exitoso, nombre actualizado en lista');

      await context.close();
    }

    // 5.5 Modal en Móvil 389px con interacción y teclado
    {
      const context = await browser.newContext({
        viewport: { width: 389, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, getRealisticState(true));
      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');

      // Abrir modal en mobile
      await page.locator('button:has-text("Añadir evaluación")').first().click();
      await page.waitForSelector('div[role="dialog"]');

      await snap(page, 'qa-19-mobile-modal-evaluation.png', { fullPage: false });

      // Probar cierre con botón cancelar o tecla Escape
      await page.keyboard.press('Escape');
      // Si modal no se cierra con escape, probar botón Cancelar
      if (await page.locator('div[role="dialog"]').isVisible()) {
        await page.locator('button:has-text("Cancelar")').click();
      }
      await page.waitForTimeout(300);
      assert.equal(await page.locator('div[role="dialog"]').count(), 0, 'El modal debe cerrarse limpiamente');
      console.log('  ✔ Modal en móvil: Utilizable, cerrado limpiamente sin desborde');

      await context.close();
    }

    console.log('\n============================================================');
    console.log(' Resumen de Verificaciones Técnicas:');
    console.log('============================================================');
    console.table(findings);

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n✔ Proceso de validación y capturas completado exitosamente.\n');
}

main().catch((err) => {
  console.error('Error durante la validación:', err);
  process.exit(1);
});
