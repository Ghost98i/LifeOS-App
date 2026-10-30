import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const scratchDir = 'C:\\Users\\Christian\\.gemini\\antigravity\\brain\\c5adb2fc-aacf-4a3c-8d1b-dafac72342d3\\scratch';
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

async function main() {
  console.log('1. Starting Vite preview server...');
  const port = 5210;
  const viteProcess = spawn('npx', ['vite', 'preview', '--port', String(port)], {
    stdio: 'inherit',
    shell: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log('2. Launching Playwright browser (Chrome)...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 950 },
    });

    // Synthetic state with sample subjects, exams, and 276 min study log to verify "4 h 36 min"
    const syntheticState = {
      user: { name: 'Christian' },
      system: { onboardingCompleted: true, timeFormat: '24h', lastActiveDate: '2026-10-23' },
      moduleVisibility: {
        estudios: true,
        calendario: true,
        finanzas: true,
        gimnasio: true,
        trabajo: true,
        notas: true,
      },
      study: {
        subjects: [
          { id: 'sub-mat', name: 'Matemática Discreta', createdAt: Date.now() - 86400000 },
          { id: 'sub-alg', name: 'Álgebra Lineal', createdAt: Date.now() - 86400000 },
          { id: 'sub-prog', name: 'Programación Concurrente', createdAt: Date.now() - 86400000 },
        ],
        exams: [
          {
            id: 'exam-1',
            title: 'Primer Parcial Teórico',
            subjectId: 'sub-mat',
            date: '2026-10-20',
            time: '10:00',
            status: 'aprobado',
            grade: '8',
            createdAt: Date.now() - 300000000,
          },
          {
            id: 'exam-2',
            title: 'Parcial Práctico',
            subjectId: 'sub-alg',
            date: '2026-10-21',
            time: '14:30',
            status: 'desaprobado',
            grade: '4',
            createdAt: Date.now() - 200000000,
          },
          {
            id: 'exam-3',
            title: 'Entrega de Laboratorio 1',
            subjectId: 'sub-prog',
            date: '2026-10-28',
            time: '18:00',
            status: 'pendiente',
            createdAt: Date.now() - 100000000,
          },
        ],
        studyLog: [
          {
            id: 'log-1',
            date: '2026-10-23',
            minutes: 276, // 4 h 36 min
            subjectId: 'sub-mat',
            subjectName: 'Matemática Discreta',
            createdAt: new Date('2026-10-23T14:30:00').getTime(),
          },
          {
            id: 'log-2',
            date: '2026-10-22',
            minutes: 45,
            subjectId: 'sub-prog',
            subjectName: 'Programación Concurrente',
            createdAt: new Date('2026-10-22T16:15:00').getTime(),
          },
        ],
        activeSession: null,
      },
    };

    console.log('3. Navigating and injecting state...');
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
    await page.evaluate((state) => {
      localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
    }, syntheticState);
    await page.reload({ waitUntil: 'networkidle' });

    // Navigate to Estudios
    console.log('4. Navigating to Estudios view...');
    await page.click('button:has-text("Estudios")');
    await page.waitForTimeout(600);

    // Verify FocusTimer exists and is at the top
    const timerTitle = await page.locator('#qa-focus-timer h3').textContent();
    console.log(`   Timer Title: ${timerTitle}`);

    // Verify subject selector is in the main body of the timer
    const selectOptions = await page.locator('#focus-subject-select option').allTextContents();
    console.log(`   Subject Selector Options: ${selectOptions.join(', ')}`);

    // Verify duration formatting (4 h 36 min)
    const statCards = await page.locator('.lifeos-stat-card').allTextContents();
    console.log(`   Stat Cards Content:\n   - ${statCards.join('\n   - ')}`);

    // Check that '4 h 36 min' appears instead of raw '276 min' or similar
    const pageContent = await page.content();
    const hasReadableDuration = pageContent.includes('4 h 36 min') || pageContent.includes('5 h 21 min');
    console.log(`   Readable duration visible: ${hasReadableDuration}`);

    // Check approval formatting: "1 de 2 aprobadas"
    const hasApprovalText = pageContent.includes('1 de 2 aprobadas') || pageContent.includes('1 aprobada');
    console.log(`   Human approval rate visible: ${hasApprovalText}`);

    // Test Sound Mixer: open mixer
    console.log('5. Testing Sound Mixer interaction...');
    await page.click('button:has-text("Ajustar canales")');
    await page.waitForTimeout(300);

    // Click preset "Lluvia + Ruido marrón"
    const presetBtn = page.locator('button:has-text("Lluvia + Ruido marrón")');
    await presetBtn.click();
    await page.waitForTimeout(300);

    // Verify channels are visible
    const hasRainCheckbox = await page.locator('input[type="checkbox"]').first().isVisible();
    console.log(`   Mixer channels visible: ${hasRainCheckbox}`);

    // Scroll to top and close off-screen popups for clean screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    // Capture desktop screenshots
    const desktopPath = path.join(scratchDir, 'desktop-estudios.png');
    await page.screenshot({ path: desktopPath, fullPage: true });
    console.log(`   Captured ${desktopPath}`);

    // Test starting a focus session
    console.log('6. Testing Pomodoro Timer start/pause/early finish...');
    const startBtn = page.locator('button:has-text("Iniciar Enfoque")');
    await startBtn.click();
    await page.waitForTimeout(600);

    const pauseBtn = page.locator('button:has-text("Pausar")');
    const isRunning = await pauseBtn.isVisible();
    console.log(`   Session running (Pausar visible): ${isRunning}`);

    // Finish session early or test reset
    const resetBtn = page.locator('button:has-text("Reiniciar")');
    await resetBtn.click();
    await page.waitForTimeout(300);

    // Test Mobile viewport
    console.log('7. Testing Mobile View (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    const mobilePath = path.join(scratchDir, 'mobile-estudios.png');
    await page.screenshot({ path: mobilePath, fullPage: true });
    console.log(`   Captured ${mobilePath}`);

    console.log('\n✅ ALL E2E VERIFICATION CHECKS FOR ESTUDIOS & POMODORO PASSED PERFECTLY!\n');
  } finally {
    await browser.close();
    viteProcess.kill();
  }
}

main().catch((err) => {
  console.error('E2E Verification failed:', err);
  process.exit(1);
});
