import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 5211;
const APP_URL = `http://localhost:${PORT}/`;
const LOCAL_OUTPUT_DIR = path.resolve('artifacts', 'visual-evidence');
const ARTIFACT_OUTPUT_DIR = path.resolve('C:\\Users\\Christian\\.gemini\\antigravity\\brain\\645e9937-fad6-470d-8b52-6c03d7ee5592', 'screenshots');

for (const dir of [LOCAL_OUTPUT_DIR, ARTIFACT_OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function makeRealisticState(darkMode = true) {
  const today = new Date().toISOString().split('T')[0];
  return {
    profile: {
      name: 'Christian',
      height: 178,
      bodyCompositionSex: 'male',
    },
    settings: {
      userName: 'Christian',
      onboardingCompleted: true,
      lastBackupAt: '2026-10-27 18:30',
      lastWeeklyReviewAt: '2026-10-26',
      darkMode,
      hiddenTabs: [],
      attentionDismissals: {},
      dismissedAttentionKeys: [],
    },
    dailyPriorities: [
      { id: 'dp-1', text: 'Refinar arquitectura visual y jerarquía en Agenda y Configuración', completed: true, createdAt: today },
      { id: 'dp-2', text: 'Validar composición responsive a 1080p, 2K y móvil', completed: false, createdAt: today },
      { id: 'dp-3', text: 'Comprobar estados de E2EE y consistencia contable', completed: false, createdAt: today },
    ],
    todayExtras: [
      { id: 'te-1', text: 'Revisión de pull request de balance contable', completed: true, time: '10:00' },
      { id: 'te-2', text: 'Sesión de entrenamiento de fuerza (Pecho y Tríceps)', completed: false, time: '17:30' },
    ],
    taskLog: {},
    agenda: {
      lunes: [
        { id: 'ag-1', time: '09:00', text: 'Planificación semanal de objetivos estratégicos', completed: true, category: 'trabajo' },
        { id: 'ag-2', time: '11:30', text: 'Reunión de alineación de producto y diseño', completed: true, category: 'trabajo' },
      ],
      martes: [
        { id: 'ag-3', time: '10:00', text: 'Auditoría de consistencia y balance contable del libro mayor', completed: true, category: 'trabajo' },
        { id: 'ag-4', time: '15:00', text: 'Revisión técnica de protocolos de cifrado E2EE y privacidad', completed: false, category: 'estudio' },
      ],
      miercoles: [
        { id: 'ag-5', time: '09:30', text: 'Alineación visual y revisión de componentes transversales', completed: false, category: 'trabajo' },
        { id: 'ag-6', time: '18:00', text: 'Entrenamiento Gimnasio (Piernas / Core)', completed: false, category: 'gimnasio' },
      ],
      jueves: [
        { id: 'ag-7', time: '11:00', text: 'Revisión de balance contable y conciliaciones', completed: false, category: 'finanzas' },
      ],
      viernes: [
        { id: 'ag-8', time: '16:00', text: 'Cierre semanal y backup de contingencia', completed: false, category: 'trabajo' },
      ],
      sabado: [
        { id: 'ag-9', time: '10:30', text: 'Lectura y notas de arquitectura', completed: false, category: 'personal' },
      ],
      domingo: [
        { id: 'ag-10', time: '19:00', text: 'Planificación de la semana entrante', completed: false, category: 'personal' },
      ],
    },
    tasksRecurring: [
      { id: 'rec-1', name: 'Revisar balance y conciliar movimientos bancarios', frequency: 'semanal', time: '11:00', category: 'finanzas' },
      { id: 'rec-2', name: 'Entrenamiento de fuerza programado', frequency: 'lunes-miercoles-viernes', time: '17:30', category: 'gimnasio' },
      { id: 'rec-3', name: 'Exportar copia de seguridad JSON independiente', frequency: 'semanal', time: '18:00', category: 'personal' },
    ],
    finance: {
      accounts: [
        { id: 'acc-1', name: 'Banco Santander', currency: 'UYU', balance: 142500, type: 'bank', color: '#3b82f6' },
        { id: 'acc-2', name: 'Caja Fuerte / Efectivo', currency: 'USD', balance: 3450, type: 'cash', color: '#10b981' },
      ],
      transactions: [
        { id: 'tx-1', accountId: 'acc-1', amount: 15000, type: 'income', category: 'Sueldo', date: today, notes: 'Honorarios desarrollo' },
        { id: 'tx-2', accountId: 'acc-1', amount: 3200, type: 'expense', category: 'Servicios', date: today, notes: 'Fibra óptica y hosting' },
      ],
      transfers: [],
      reconciliations: [],
      commitments: [],
      agreements: [],
      budgets: {},
      categories: ['Sueldo', 'Servicios', 'Alimentación', 'Gimnasio'],
    },
    gym: {
      sessions: [
        { id: 'gym-1', date: today, routineName: 'Torso A - Empuje y Tracción', status: 'completed', durationMinutes: 65, completedExercises: 5 },
      ],
      routines: [],
      customExercises: [],
      bodyRecords: [],
    },
  };
}

async function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    stdio: 'pipe',
    shell: true,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server start timed out')), 10000);
    proc.stdout.on('data', (d) => {
      const str = d.toString();
      if (str.includes(String(PORT))) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    proc.stderr.on('data', (d) => {
      const str = d.toString();
      if (str.includes(String(PORT))) {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });

  return proc;
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(LOCAL_OUTPUT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_OUTPUT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`  ✔ Guardado: ${filename}`);
}

async function captureAll() {
  console.log('🚀 Iniciando servidor Vite preview en puerto', PORT);
  const server = await startServer();
  console.log('✔ Servidor Vite preview activo');

  const browser = await chromium.launch({ channel: 'chrome' });

  const scenarios = [
    { name: '1080p', viewport: { width: 1920, height: 1080 }, isMobile: false },
    { name: '2k', viewport: { width: 2560, height: 1440 }, isMobile: false },
    { name: 'mobile', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
  ];

  try {
    // 1. Capturas Principales (Hoy, Agenda con rutinas, Agenda sin rutinas, Configuración)
    for (const scenario of scenarios) {
      for (const darkMode of [true, false]) {
        const themeLabel = darkMode ? 'dark' : 'light';
        console.log(`\n📸 Capturando resolución: ${scenario.name} | Tema: ${themeLabel}`);

        const context = await browser.newContext({
          viewport: scenario.viewport,
          isMobile: scenario.isMobile,
          hasTouch: scenario.hasTouch,
        });

        const state = makeRealisticState(darkMode);
        const page = await context.newPage();

        await page.addInitScript((st) => {
          localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
          localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
          localStorage.setItem('lifeos_offline_ready_ack', 'true');
        }, state);

        await page.goto(APP_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);

        // A. Hoy
        await saveScreenshot(page, `hoy-${scenario.name}-${themeLabel}.png`);

        // B. Agenda (Lunes - con rutinas)
        if (scenario.isMobile) {
          const menuBtn = page.locator('button[aria-label="Abrir menú"]');
          if (await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(300);
            await page.locator('aside button:has-text("Agenda")').first().click();
            await page.waitForTimeout(500);
          }
        } else {
          await page.locator('aside nav button:has-text("Agenda")').first().click();
          await page.waitForTimeout(500);
        }
        await saveScreenshot(page, `agenda-${scenario.name}-${themeLabel}.png`);

        // C. Agenda (Martes - sin rutinas, demostrando adaptación a ancho completo)
        const tuesdayBtn = page.locator('button:has-text("Mar")').first();
        if (await tuesdayBtn.isVisible()) {
          await tuesdayBtn.click();
          await page.waitForTimeout(400);
          await saveScreenshot(page, `agenda-sin-rutinas-${scenario.name}-${themeLabel}.png`);
        }

        // D. Configuración (Estado por defecto / Modo local limpio)
        if (scenario.isMobile) {
          const menuBtn = page.locator('button[aria-label="Abrir menú"]');
          if (await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(300);
            await page.locator('aside button:has-text("Configuración")').first().click();
            await page.waitForTimeout(500);
          }
        } else {
          await page.locator('aside nav button:has-text("Configuración")').first().click();
          await page.waitForTimeout(500);
        }
        await saveScreenshot(page, `configuracion-${scenario.name}-${themeLabel}.png`);

        await context.close();
      }
    }

    // 2. Estados Sintéticos de Configuración (Autenticado/Sincronizado + E2EE desbloqueado, Sesión bloqueada, y Conflicto)
    console.log('\n🔐 Capturando estados sintéticos de Configuración...');
    for (const scenario of [{ name: '1080p', viewport: { width: 1920, height: 1080 }, isMobile: false }, { name: 'mobile', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }]) {
      const context = await browser.newContext({
        viewport: scenario.viewport,
        isMobile: scenario.isMobile,
        hasTouch: scenario.hasTouch,
      });

      const state = makeRealisticState(true); // Dark theme
      const page = await context.newPage();

      await page.addInitScript((st) => {
        localStorage.setItem('lifeos-state-v1', JSON.stringify(st));
        localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
        localStorage.setItem('lifeos_offline_ready_ack', 'true');
      }, state);

      await page.goto(APP_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Navigate to Configuración
      if (scenario.isMobile) {
        const menuBtn = page.locator('button[aria-label="Abrir menú"]');
        if (await menuBtn.isVisible()) {
          await menuBtn.click();
          await page.waitForTimeout(300);
          await page.locator('aside button:has-text("Configuración")').first().click();
          await page.waitForTimeout(500);
        }
      } else {
        await page.locator('aside nav button:has-text("Configuración")').first().click();
        await page.waitForTimeout(500);
      }

      // Escenario A: Cuenta autenticada y sincronizada («Al día») SIN E2EE configurado
      await page.evaluate(() => {
        if (window.__setSyntheticCloudState) {
          window.__setSyntheticCloudState({
            cloudUser: {
              uid: 'usr-sin-e2ee',
              email: 'christian.lifeos@gmail.com',
              name: 'Christian Demo',
              photoURL: '',
            },
            syncStatus: 'synced',
            lastSyncedAt: 'Hoy 10:45',
            e2eeActive: false,
            e2eeUnlocked: false,
          });
        }
      });
      await page.waitForTimeout(600);
      await saveScreenshot(page, `configuracion-e2ee-sin-configurar-${scenario.name}-dark.png`);

      // Escenario B: Cuenta con E2EE configurado y SESIÓN BLOQUEADA («Requiere clave»)
      await page.evaluate(() => {
        if (window.__setSyntheticCloudState) {
          window.__setSyntheticCloudState({
            cloudUser: {
              uid: 'usr-e2ee-bloqueado',
              email: 'christian.lifeos@gmail.com',
              name: 'Christian Demo',
            },
            syncStatus: 'synced',
            lastSyncedAt: 'Hoy 09:30',
            e2eeActive: true,
            e2eeUnlocked: false,
          });
        }
      });
      await page.waitForTimeout(600);
      await saveScreenshot(page, `configuracion-e2ee-sesion-bloqueada-${scenario.name}-dark.png`);

      // Escenario C: Cuenta con E2EE activo y SESIÓN DESBLOQUEADA («Protegido»)
      await page.evaluate(() => {
        if (window.__setSyntheticCloudState) {
          window.__setSyntheticCloudState({
            cloudUser: {
              uid: 'usr-e2ee-desbloqueado',
              email: 'christian.lifeos@gmail.com',
              name: 'Christian Demo',
            },
            syncStatus: 'synced',
            lastSyncedAt: 'Hoy 10:45',
            e2eeActive: true,
            e2eeUnlocked: true,
          });
        }
      });
      await page.waitForTimeout(600);
      await saveScreenshot(page, `configuracion-e2ee-desbloqueado-${scenario.name}-dark.png`);

      // Escenario D: Conflicto de versiones / Sincronización pendiente
      await page.evaluate(() => {
        if (window.__setSyntheticCloudState) {
          window.__setSyntheticCloudState({
            cloudUser: {
              uid: 'usr-demo-conflict',
              email: 'christian.lifeos@gmail.com',
              name: 'Christian Demo',
            },
            syncStatus: 'conflict',
            lastSyncedAt: 'Ayer 22:00',
            e2eeActive: true,
            e2eeUnlocked: true,
          });
        }
      });
      await page.waitForTimeout(600);
      await saveScreenshot(page, `configuracion-sync-conflict-${scenario.name}-dark.png`);

      await context.close();
    }

  } finally {
    await browser.close();
    try {
      if (server.pid) {
        spawn('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore', shell: true });
      }
    } catch {
      server.kill();
    }
    console.log('\n✨ Todas las capturas (básicas y sintéticas) completadas con éxito.');
  }
}

captureAll().catch((err) => {
  console.error('Error durante la captura:', err);
  process.exit(1);
});
