import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lazyWithPreload } from './lazyWithPreload';

const ROOT = process.cwd();

test('Bloque 29.1: App.tsx carga de forma diferida todos los modales pesados y vistas secundarias + prefetch', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');

  const lazyTargets = [
    'MobileQuickCapture',
    'GymRestOverlay',
    'StudyActiveOverlay',
    'AgendaView',
    'CalendarioView',
    'TrabajoView',
    'ReventaView',
    'FinanzasView',
    'GimnasioView',
    'EstudiosView',
    'NotasView',
    'IAView',
    'ConfigView',
    'CheckoutModal',
    'GlobalSearchModal',
    'CloudConflictModal',
    'OnboardingView',
    'UnlockDeviceModal',
  ];

  for (const name of lazyTargets) {
    const lazyPattern = new RegExp(`const\\s+${name}\\s*=\\s*(?:lazyWithPreload|lazy)\\(`);
    assert.match(appSrc, lazyPattern, `${name} debe declararse con carga diferida en App.tsx`);

    // Must not have a non-type static value import of the component
    const staticValueImport = new RegExp(`^import\\s+(?!type\\b)[^;]*\\b${name}\\b[^;]*from\\s+['"]\\.\\/components\\/${name}['"]`, 'm');
    assert.doesNotMatch(appSrc, staticValueImport, `${name} no debe importarse estáticamente como valor en App.tsx`);
  }

  // resaleConflictResolution must only be imported as type at top-level and loaded dynamically on demand
  assert.doesNotMatch(
    appSrc,
    /^import\s+\{[^}]*executeAuthorizedConflictReconciliation[^}]*\}\s+from\s+['"]\.\/lib\/resaleConflictResolution['"]/m,
    'resaleConflictResolution no debe importarse estáticamente en App.tsx'
  );
  assert.match(appSrc, /await\s+import\(['"]\.\/lib\/resaleConflictResolution['"]\)/);

  // Prefetch helpers wired to navigation shell
  assert.match(appSrc, /onPrefetchView=\{prefetchViewChunk\}/);
  assert.match(appSrc, /onPrefetchCapture=\{prefetchCaptureChunk\}/);
  assert.match(appSrc, /onPrefetchSearch=\{prefetchSearchChunk\}/);
});

test('Bloque 29.2: DashboardView.tsx difiere modales secundarios (DailyStatusModal, RecentActivityModal, DismissedAttentionModal) y helpers pesados', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/DashboardView.tsx'), 'utf8');

  for (const modalName of ['DailyStatusModal', 'RecentActivityModal', 'DismissedAttentionModal']) {
    const lazyPattern = new RegExp(`const\\s+${modalName}\\s*=\\s*(?:lazyWithPreload|lazy)\\(`);
    assert.match(dashSrc, lazyPattern, `${modalName} debe cargarse con lazyWithPreload en DashboardView.tsx`);

    const staticImport = new RegExp(`^import\\s+[^;]*\\b${modalName}\\b`, 'm');
    assert.doesNotMatch(dashSrc, staticImport, `${modalName} no debe importarse estáticamente en DashboardView.tsx`);
  }

  // Must not pull studyFlows or PersonalContextCard or full contextInsights statically into Hoy
  assert.doesNotMatch(dashSrc, /^import\s+[^;]*from\s+['"]\.\.\/lib\/studyFlows['"]/m);
  assert.doesNotMatch(dashSrc, /^import\s+[^;]*from\s+['"]\.\.\/lib\/contextInsights['"]/m);
  assert.doesNotMatch(dashSrc, /PersonalContextCard/);
  assert.match(dashSrc, /import\(['"]\.\.\/lib\/studyFlows['"]\)/);
  assert.match(dashSrc, /from\s+['"]\.\.\/lib\/contextSummary['"]/);

  // Conditional mounting guards so modals are not mounted until opened
  assert.match(dashSrc, /\{isStatusModalOpen\s*&&\s*\(/);
  assert.match(dashSrc, /\{isActivityModalOpen\s*&&\s*\(/);
  assert.match(dashSrc, /\{showDismissedModal\s*&&\s*\(/);
});

test('Bloque 29.3: lazyWithPreload deduplica la carga y renderiza síncronamente tras preload()', async () => {
  let calls = 0;
  const Sample: React.FC<{ label: string }> = ({ label }) => React.createElement('span', null, label);
  const LazySample = lazyWithPreload(async () => {
    calls += 1;
    return { default: Sample };
  });

  await Promise.all([LazySample.preload(), LazySample.preload()]);
  assert.equal(calls, 1, 'preload() debe deduplicar invocaciones concurrentes');

  const html = renderToStaticMarkup(React.createElement(LazySample, { label: 'Listo' }));
  assert.equal(html, '<span>Listo</span>');
});

test('Bloque 29.4: src/index.css elimina bloques legacy huérfanos y conserva utilidades activas críticas', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

  const removedDeadSelectors = [
    '.today-observatory-panel',
    '.signature-panel',
    '.note-carousel-enter-next',
    '.gym-set-cockpit',
    '.hero-matterhorn-photo',
    '.lifeos-badge-success',
    '.trend-badge-up',
    '.today-carousel-control',
    '.gym-body-health-shortcut',
    '@keyframes celebrate-glow',
    '@keyframes today-note-enter',
    '@keyframes gym-set-confirmed',
  ];

  for (const dead of removedDeadSelectors) {
    assert.equal(css.includes(dead), false, `Selector/keyframe muerto debe haberse eliminado de src/index.css: ${dead}`);
  }

  const requiredActiveSelectors = [
    '.celestian-clean-field:focus-visible',
    '@keyframes shimmer',
    '@keyframes check-pop',
    '@keyframes check-draw',
    '@keyframes check-halo',
    '.gym-rest-card',
    '.gym-rest-long',
    '.gym-rest-ending',
    '.gym-rest-critical',
    '.privacy-mode .privacy-amount',
    '.today-hero',
    '.today-shell',
    '.today-command-bar',
    '.finance-workspace',
  ];

  for (const active of requiredActiveSelectors) {
    assert.equal(css.includes(active), true, `Regla activa crítica debe permanecer en src/index.css: ${active}`);
  }
});

test('Bloque 29.5: vite.config.ts mantiene chunking vendor óptimo y presupuesto real de dist/assets y VitePWA', () => {
  const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  for (const chunkName of [
    'firebase-firestore-vendor',
    'firebase-auth-vendor',
    'charts-vendor',
    'motion-vendor',
    'icons-vendor',
    'react-vendor',
  ]) {
    assert.match(viteCfg, new RegExp(`['"]${chunkName}['"]`), `vite.config.ts debe separar ${chunkName}`);
  }
  assert.match(viteCfg, /VitePWA\(/, 'VitePWA debe permanecer configurado');

  const assetsDir = path.join(ROOT, 'dist/assets');
  const swPath = path.join(ROOT, 'dist/sw.js');
  if (fs.existsSync(assetsDir) && fs.existsSync(swPath)) {
    const files = fs.readdirSync(assetsDir);
    const entryJs = files.find((f) => /^index-[^.]+\.js$/.test(f));
    const entryCss = files.find((f) => /^index-[^.]+\.css$/.test(f));
    const iconsChunk = files.find((f) => /^icons-vendor-[^.]+\.js$/.test(f));
    const dailyStatusChunk = files.find((f) => /^DailyStatusModal-[^.]+\.js$/.test(f));

    assert.ok(entryJs, 'Debe existir el chunk inicial index-*.js');
    assert.ok(entryCss, 'Debe existir la hoja inicial index-*.css');
    assert.ok(iconsChunk, 'lucide-react debe separarse en icons-vendor-*.js');
    assert.ok(dailyStatusChunk, 'DailyStatusModal debe emitirse en su propio chunk lazy');

    const jsBuf = fs.readFileSync(path.join(assetsDir, entryJs));
    const jsRawKb = jsBuf.length / 1024;
    const jsGzipKb = zlib.gzipSync(jsBuf).length / 1024;
    assert.ok(jsRawKb <= 650, `index-*.js raw (${jsRawKb.toFixed(2)} kB) excede presupuesto de 650 kB`);
    assert.ok(jsGzipKb <= 190, `index-*.js gzip (${jsGzipKb.toFixed(2)} kB) excede presupuesto de 190 kB`);

    const cssBuf = fs.readFileSync(path.join(assetsDir, entryCss));
    const cssRawKb = cssBuf.length / 1024;
    const cssGzipKb = zlib.gzipSync(cssBuf).length / 1024;
    assert.ok(cssRawKb <= 270, `index-*.css raw (${cssRawKb.toFixed(2)} kB) excede presupuesto de 270 kB`);
    assert.ok(cssGzipKb <= 43, `index-*.css gzip (${cssGzipKb.toFixed(2)} kB) excede presupuesto de 43 kB`);

    const swContent = fs.readFileSync(swPath, 'utf8');
    assert.match(swContent, /precacheAndRoute/, 'dist/sw.js debe conservar precacheAndRoute de VitePWA');
    assert.ok(swContent.includes(entryJs), 'dist/sw.js debe precachear el chunk inicial');
    assert.ok(swContent.includes(entryCss), 'dist/sw.js debe precachear el CSS inicial');
  }
});
