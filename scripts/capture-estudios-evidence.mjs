import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEST_PORT = 5202;
const APP_URL = `http://localhost:${TEST_PORT}/`;
const EVIDENCE_LOCAL = path.resolve('artifacts', 'estudios-fase1a');
const ARTIFACT_DIR = 'C:\\Users\\Christian\\.gemini\\antigravity\\brain\\38a11f6c-6161-4ee8-a34e-b59cf54aab74\\screenshots';

fs.mkdirSync(EVIDENCE_LOCAL, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

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

const populatedStudyState = {
  study: {
    subjects: [
      { id: 'sub-alg', name: 'Algoritmos y Estructuras de Datos', color: '#3B82F6', createdAt: 1000, updatedAt: 1000 },
      { id: 'sub-arq', name: 'Arquitectura de Computadores', color: '#10B981', createdAt: 1000, updatedAt: 1000 },
      { id: 'sub-mat', name: 'Matemática Discreta', color: '#F59E0B', createdAt: 1000, updatedAt: 1000 },
      { id: 'sub-ing', name: 'Inglés Técnico Profesional', color: '#8B5CF6', createdAt: 1000, updatedAt: 1000 },
    ],
    exams: [
      {
        id: 'ex-alg-parcial',
        subjectId: 'sub-alg',
        title: 'Primer Parcial Teórico-Práctico',
        date: '2026-10-23',
        time: '18:30',
        status: 'pendiente',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'ex-arq-entrega',
        subjectId: 'sub-arq',
        title: 'Entrega Proyecto Ensamblador RISC-V',
        date: '2026-10-29',
        time: '23:59',
        status: 'pendiente',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'ex-indep-cert',
        subjectId: null,
        title: 'Examen de Certificación Linux LPIC-1',
        date: '2026-11-12',
        time: '10:00',
        status: 'pendiente',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'ex-mat-recup',
        subjectId: 'sub-mat',
        title: 'Coloquio de Grafos y Recursión',
        date: '2026-10-15',
        time: '16:00',
        status: 'pendiente', // Pasado sin nota -> Pendiente de resultado
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'ex-ing-final',
        subjectId: 'sub-ing',
        title: 'Evaluación Oral de Comprensión',
        date: '2026-09-28',
        status: 'aprobado',
        grade: '9/10',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    studyLog: [
      { id: 'l1', date: '2026-10-20', minutes: 50, subjectId: 'sub-alg', subjectName: 'Algoritmos y Estructuras de Datos' },
      { id: 'l2', date: '2026-10-19', minutes: 45, subjectId: 'sub-arq', subjectName: 'Arquitectura de Computadores' },
      { id: 'l3', date: '2026-10-18', minutes: 60, subjectId: 'sub-mat', subjectName: 'Matemática Discreta' },
      { id: 'l4', date: '2026-10-16', minutes: 30, subjectId: null, subjectName: null },
    ],
  },
};

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

async function saveScreenshot(page, filename) {
  const localPath = path.join(EVIDENCE_LOCAL, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: true });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`  📸 Captura guardada: ${filename}`);
}

async function main() {
  console.log('\n============================================================');
  console.log(' Generación de Evidencia Visual — Estudios Fase 1A');
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
    // 1. Desktop Populated - Dark Theme
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await saveScreenshot(page, '01-desktop-populated-dark.png');
      await context.close();
    }

    // 2. Desktop Populated - Light Theme
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.remove('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await saveScreenshot(page, '02-desktop-populated-light.png');
      await context.close();
    }

    // 3. Desktop Empty State - 3 Starting Points
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState({ study: { subjects: [], exams: [], studyLog: [] } }));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      await saveScreenshot(page, '03-desktop-empty-state-dark.png');
      await context.close();
    }

    // 4. Desktop Modal Nueva Evaluación
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.locator('button:has-text("Añadir evaluación")').first().click();
      await page.waitForSelector('div[role="dialog"]');
      await page.fill('input[placeholder*="Primer parcial"]', 'Segundo Parcial de Algoritmos');
      await page.fill('input[placeholder*="Sobresaliente"]', 'Pendiente');
      await page.waitForTimeout(400);
      await saveScreenshot(page, '04-desktop-modal-evaluation-dark.png');
      await context.close();
    }

    // 5. Desktop Modal Editar / Renombrar Materia
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.locator('button[title="Renombrar materia"]').first().click();
      await page.waitForSelector('div[role="dialog"]');
      await page.waitForTimeout(400);
      await saveScreenshot(page, '05-desktop-modal-rename-subject.png');
      await context.close();
    }

    // 6. Mobile 389px Populated - Dark Theme
    {
      const context = await browser.newContext({ viewport: { width: 389, height: 844 }, isMobile: true });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await saveScreenshot(page, '06-mobile-389px-dark.png');
      await context.close();
    }

    // 7. Mobile 375px Populated - Light Theme
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.remove('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await saveScreenshot(page, '07-mobile-375px-light.png');
      await context.close();
    }

    // 8. Tab "Pendientes de resultado" activo
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        document.documentElement.classList.add('dark');
      }, makeBaseState(populatedStudyState));

      await page.goto(`${APP_URL}?view=estudios`);
      await page.waitForLoadState('networkidle');
      await page.locator('button:has-text("Pendientes de resultado")').click();
      await page.waitForTimeout(400);
      await saveScreenshot(page, '08-desktop-tab-pending-results.png');
      await context.close();
    }

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n✔ Todas las capturas de evidencia generadas con éxito.\n');
}

main().catch((err) => {
  console.error('Error generando evidencias:', err);
  process.exit(1);
});
