import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from '../lib/storage';
import { CelestianMark, CELESTE_SILHOUETTE_PATH } from './visual/CelestianMark';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { OnboardingView } from './OnboardingView';

test('Block 11: CelestianMark renderiza la silueta exacta de Celeste sin caja, sin gradientes y con currentColor', () => {
  const html = renderToStaticMarkup(<CelestianMark size={32} />);
  assert.match(html, /data-celestian-mark="silhouette"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /viewBox="0 0 512 512"/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /fill-rule="evenodd"/);
  assert.match(html, /text-\[#0B1120\]/);
  assert.match(html, /dark:text-\[#F8FAFC\]/);
  assert.ok(html.includes(CELESTE_SILHOUETTE_PATH));

  // Sin caja/badge, sin gradientes ni rellenos blancos pintados encima
  assert.doesNotMatch(html, /<rect\b/);
  assert.doesNotMatch(html, /linearGradient|radialGradient|<defs/);
  assert.doesNotMatch(html, /#4F46E5/);

  const labeledHtml = renderToStaticMarkup(
    <CelestianMark size={28} label="Isotipo Celestian" />
  );
  assert.match(labeledHtml, /role="img"/);
  assert.match(labeledHtml, /aria-label="Isotipo Celestian"/);
  assert.doesNotMatch(labeledHtml, /aria-hidden="true"/);
});

test('Block 11: Sidebar, Topbar y OnboardingView renderizan la silueta suelta sin caja ni punto en modo claro y oscuro', () => {
  for (const theme of ['light', 'dark'] as const) {
    const state = defaultState();
    state.settings.darkMode = theme === 'dark';

    const sidebarHtml = renderToStaticMarkup(
      <div className={theme === 'dark' ? 'dark' : ''}>
        <Sidebar
          currentView="dashboard"
          state={state}
          onNavigate={() => {}}
          onToggleTheme={() => {}}
          isOpenMobile={false}
          onCloseMobile={() => {}}
        />
      </div>
    );
    assert.match(sidebarHtml, /data-celestian-mark="silhouette"/);
    assert.match(sidebarHtml, /Celestian LifeOS/);
    assert.doesNotMatch(sidebarHtml, /lifeos-icon\.png/);
    assert.doesNotMatch(sidebarHtml, /bg-indigo-500/);
    assert.doesNotMatch(sidebarHtml, /from-\[#4F46E5\]/);

    const topbarHtml = renderToStaticMarkup(
      <div className={theme === 'dark' ? 'dark' : ''}>
        <Topbar
          currentView="dashboard"
          state={state}
          onOpenMobileNav={() => {}}
          onQuickAction={() => {}}
          onSearch={() => {}}
          onOpenSearch={() => {}}
          onOpenCapture={() => {}}
          onTogglePrivacy={() => {}}
          cloudConfigured={false}
          cloudUser={null}
          syncStatus="idle"
          onCloudSignIn={() => {}}
          onCloudSignOut={() => {}}
        />
      </div>
    );
    assert.match(topbarHtml, /data-celestian-mark="silhouette"/);
    assert.doesNotMatch(topbarHtml, /lifeos-icon\.png/);

    const onboardingHtml = renderToStaticMarkup(
      <div className={theme === 'dark' ? 'dark' : ''}>
        <OnboardingView state={state} onComplete={() => {}} initialStep={1} />
      </div>
    );
    assert.match(onboardingHtml, /data-celestian-mark="silhouette"/);
    assert.doesNotMatch(onboardingHtml, /lifeos-icon\.png/);
  }
});

test('Block 11: favicon SVG adaptable a tema, íconos PWA y creditos.html están presentes y coherentes', () => {
  const faviconSvg = readFileSync('public/favicon.svg', 'utf8');
  assert.ok(faviconSvg.includes(CELESTE_SILHOUETTE_PATH));
  assert.match(faviconSvg, /fill-rule="evenodd"/);
  assert.match(faviconSvg, /path\s*\{\s*fill:\s*#0B1120;\s*\}/);
  assert.match(faviconSvg, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(faviconSvg, /fill:\s*#F8FAFC;/);
  assert.doesNotMatch(faviconSvg, /<rect\b/);

  const indexHtml = readFileSync('index.html', 'utf8');
  assert.match(indexHtml, /href="\/favicon\.svg"/);
  assert.match(indexHtml, /href="\/lifeos-icon-32\.png"/);
  assert.match(indexHtml, /href="\/lifeos-icon-180\.png"/);

  for (const file of [
    'public/lifeos-icon-16.png',
    'public/lifeos-icon-32.png',
    'public/lifeos-icon-180.png',
    'public/lifeos-icon-192.png',
    'public/lifeos-icon-512.png',
    'public/icon-512-maskable.png',
    'public/creditos.html',
  ]) {
    assert.equal(existsSync(file), true, `Falta el asset requerido: ${file}`);
  }
});
