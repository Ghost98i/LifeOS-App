import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PILOT_HTML = path.resolve('artifacts', 'design-exploration', 'gym-art-pilot', 'index.html');
const FILE_URL = `file://${PILOT_HTML.replace(/\\/g, '/')}`;
const LOCAL_DIR = path.resolve('artifacts', 'design-exploration', 'gym-art-pilot');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/65b5b3c7-8bad-45a5-9650-8945aec1d06e';

for (const dir of [LOCAL_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToArtifacts(filename) {
  const src = path.join(LOCAL_DIR, filename);
  const dst = path.join(ARTIFACT_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[Evidence] Copied ${filename} to artifacts.`);
  }
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

async function main() {
  console.log('[Runner] Launching browser to capture gym art pilot evidence...');
  const browser = await launchBrowser();

  try {
    // 1. Matrix View — Desktop 1440px Dark
    console.log('1. Matrix View — Desktop 1440px Dark');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.waitForTimeout(600);

      const filename = 'gym-art-01-matrix-desktop-dark.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 2. Matrix View — Desktop 1440px Light
    console.log('2. Matrix View — Desktop 1440px Light');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      // Click light mode toggle
      await page.locator('#theme-toggle').click();
      await page.waitForTimeout(400);

      const filename = 'gym-art-02-matrix-desktop-light.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 3. Matrix View — Mobile 390px Dark
    console.log('3. Matrix View — Mobile 390px Dark');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.waitForTimeout(500);

      const filename = 'gym-art-03-matrix-mobile-390-dark.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 4. Real Contexts View — Desktop 1440px Dark
    console.log('4. Real Contexts View — Desktop 1440px Dark');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.locator('button[data-tab="contexts"]').click();
      await page.waitForTimeout(400);

      const filename = 'gym-art-04-contexts-desktop-dark.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 5. Real Contexts View — Desktop 1440px Light
    console.log('5. Real Contexts View — Desktop 1440px Light');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.locator('#theme-toggle').click();
      await page.locator('button[data-tab="contexts"]').click();
      await page.waitForTimeout(400);

      const filename = 'gym-art-05-contexts-desktop-light.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 6. Zoom & Multi-Scale Inspection Tab (24px to 160px)
    console.log('6. Zoom & Multi-Scale Inspection Tab');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.locator('button[data-tab="zoom"]').click();
      await page.waitForTimeout(400);

      const filename = 'gym-art-06-zoom-inspection-desktop-dark.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    // 7. Rubric & Score Table Tab
    console.log('7. Rubric & Score Table Tab');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(FILE_URL);
      await page.locator('button[data-tab="rubric"]').click();
      await page.waitForTimeout(400);

      const filename = 'gym-art-07-rubric-evaluation.png';
      await page.screenshot({ path: path.join(LOCAL_DIR, filename), fullPage: false });
      copyToArtifacts(filename);
      await context.close();
    }

    console.log('[Runner] All gym art pilot captures completed successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
