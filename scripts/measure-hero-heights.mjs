import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const TEST_PORT = 5201;
const LAB_DIR = path.resolve('artifacts', 'design-exploration', 'finance-liquid-cockpit');

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
  const server = await createStaticServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`http://localhost:${TEST_PORT}/`);
  await page.waitForTimeout(500);

  const viewports = [
    { name: '360px', view: 'mobile-360', cssWidth: 360 },
    { name: '390px', view: 'mobile-390', cssWidth: 390 },
    { name: 'Desktop (1180px)', view: 'desktop', cssWidth: 1180 },
  ];

  const protos = [
    { id: 'baseline', name: 'Baseline Actual (Lab Replica)' },
    { id: 'a', name: 'Variante A (Command Surface)' },
    { id: 'b', name: 'Variante B (Financial Clarity)' },
    { id: 'c', name: 'Variante C (Finance Command Clarity)' },
  ];

  const results = [];

  for (const vp of viewports) {
    for (const proto of protos) {
      await page.evaluate(({ p, v }) => {
        window.switchProto(p);
        window.switchView(v);
        window.switchScenario('rich');
      }, { p: proto.id, v: vp.view });

      await page.waitForTimeout(200);

      const metrics = await page.evaluate(() => {
        const el = document.getElementById('cockpit-element');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        return {
          offsetHeight: el.offsetHeight,
          clientHeight: el.clientHeight,
          rectHeight: Math.round(rect.height * 100) / 100,
          rectWidth: Math.round(rect.width * 100) / 100,
          paddingTop: computed.paddingTop,
          paddingBottom: computed.paddingBottom,
          dpr: window.devicePixelRatio,
        };
      });

      results.push({
        viewport: vp.name,
        proto: proto.name,
        protoId: proto.id,
        ...metrics,
      });
    }
  }

  console.log('--- LAB MEASUREMENTS (getBoundingClientRect CSS Pixels) ---');
  console.table(results.map(r => ({
    Viewport: r.viewport,
    Prototipo: r.proto,
    'rect.height (CSS px)': r.rectHeight,
    'rect.width (CSS px)': r.rectWidth,
    'offsetHeight (px)': r.offsetHeight,
  })));

  await browser.close();
  server.close();
}

run();
