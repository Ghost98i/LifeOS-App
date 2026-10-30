import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const TEST_PORT = 5198;
const LAB_DIR = path.resolve('artifacts', 'design-exploration', 'finance-liquid-cockpit');
const SCREENSHOTS_DIR = path.join(LAB_DIR, 'screenshots');
const ARTIFACT_DIR = 'C:/Users/Christian/.gemini/antigravity/brain/bda40ca1-3882-4519-94e5-a72e776a6ec9';

for (const dir of [SCREENSHOTS_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToArtifacts(filename) {
  const src = path.join(SCREENSHOTS_DIR, filename);
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

function createStaticServer() {
  const htmlPath = path.join(LAB_DIR, 'index.html');
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath, 'utf8'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      resolve(server);
    });
  });
}

async function run() {
  console.log('--- Starting Static Lab Server on port ' + TEST_PORT + ' ---');
  const server = await createStaticServer();
  const labUrl = `http://localhost:${TEST_PORT}/`;
  console.log('✓ Server active on', labUrl);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(labUrl);
    await page.waitForTimeout(500);

    const simFrame = page.locator('#sim-frame');

    // Helper to configure lab state & capture crisp frame
    async function captureFrame(filename, proto, view, theme, scenario = 'rich') {
      await page.evaluate(({ p, v, t, s }) => {
        window.switchProto(p);
        window.switchView(v);
        window.switchTheme(t);
        window.switchScenario(s);
      }, { p: proto, v: view, t: theme, s: scenario });
      await page.waitForTimeout(350);

      // Take screenshot of the simulation frame element directly for crisp 1:1 scale
      const outPath = path.join(SCREENSHOTS_DIR, filename);
      await simFrame.screenshot({ path: outPath });
      copyToArtifacts(filename);
      console.log(`✓ Captured: ${filename} (${proto}, ${view}, ${theme}, ${scenario})`);
    }

    // ==========================================
    // 1. VARIANTE C (MANDATORY EVALUATION SUITE)
    // ==========================================
    console.log('\n--- Capturing Variante C (Finance Command Clarity) ---');
    await captureFrame('c-desktop-dark.png', 'c', 'desktop', 'dark', 'rich');
    await captureFrame('c-desktop-light.png', 'c', 'desktop', 'light', 'rich');
    await captureFrame('c-mobile-390-dark.png', 'c', 'mobile-390', 'dark', 'rich');
    await captureFrame('c-mobile-390-light.png', 'c', 'mobile-390', 'light', 'rich');
    await captureFrame('c-mobile-360-dark.png', 'c', 'mobile-360', 'dark', 'rich');

    // Scenarios for C
    await captureFrame('c-scenario-deficit.png', 'c', 'mobile-390', 'dark', 'deficit');
    await captureFrame('c-scenario-negative.png', 'c', 'mobile-390', 'dark', 'negative');
    await captureFrame('c-scenario-empty.png', 'c', 'mobile-390', 'dark', 'empty');
    await captureFrame('c-scenario-multicurrency.png', 'c', 'mobile-390', 'dark', 'multicurrency');
    await captureFrame('c-scenario-overcommitted.png', 'c', 'mobile-390', 'dark', 'overcommitted');
    await captureFrame('c-scenario-agreements.png', 'c', 'mobile-390', 'dark', 'agreements');
    await captureFrame('c-scenario-unconfirmed.png', 'c', 'mobile-390', 'dark', 'unconfirmed');

    // Desktop scenario for overcommitted/deficit
    await captureFrame('c-scenario-deficit-desktop.png', 'c', 'desktop', 'dark', 'deficit');

    // ==========================================
    // 2. COMPARISON BASELINE & VARIANTS A & B
    // ==========================================
    console.log('\n--- Capturing Baseline & Variants A & B for Comparison ---');
    await captureFrame('proto-a-mobile-390-dark.png', 'a', 'mobile-390', 'dark', 'rich');
    await captureFrame('proto-b-mobile-390-dark.png', 'b', 'mobile-390', 'dark', 'rich');
    await captureFrame('proto-baseline-mobile-390-dark.png', 'baseline', 'mobile-390', 'dark', 'rich');

    await captureFrame('proto-a-desktop-dark.png', 'a', 'desktop', 'dark', 'rich');
    await captureFrame('proto-b-desktop-dark.png', 'b', 'desktop', 'dark', 'rich');
    await captureFrame('proto-baseline-desktop-dark.png', 'baseline', 'desktop', 'dark', 'rich');

    // Lab overview capture (with lab controls)
    await page.evaluate(() => {
      window.switchProto('c');
      window.switchView('desktop');
      window.switchTheme('dark');
      window.switchScenario('rich');
    });
    await page.waitForTimeout(300);
    const labOverviewPath = path.join(SCREENSHOTS_DIR, 'lab-overview-c.png');
    await page.screenshot({ path: labOverviewPath, fullPage: false });
    copyToArtifacts('lab-overview-c.png');
    console.log('✓ Captured: lab-overview-c.png');

    console.log('\n✓ All Finance Command Clarity captures completed successfully!');

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
