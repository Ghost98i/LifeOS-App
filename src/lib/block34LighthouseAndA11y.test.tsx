import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from './storage';
import { OnboardingView } from '../components/OnboardingView';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { MobileNav } from '../components/MobileNav';
import { DashboardView, DashboardSkeleton } from '../components/DashboardView';
import { FinanceQuickAccountsCard } from '../components/FinanceQuickAccountsCard';

const ROOT = process.cwd();

test('Bloque 34.1: SEO técnico en index.html, public/robots.txt, firebase.json, vite.config.ts y páginas legales', () => {
  const robotsPath = path.join(ROOT, 'public/robots.txt');
  assert.equal(fs.existsSync(robotsPath), true, 'public/robots.txt debe existir');
  const robots = fs.readFileSync(robotsPath, 'utf8');
  assert.match(robots, /^User-agent:\s*\*/m, 'robots.txt debe declarar User-agent: *');
  assert.match(robots, /^Allow:\s*\/$/m, 'robots.txt debe permitir /');
  assert.match(robots, /^Allow:\s*\/privacidad\.html$/m);
  assert.match(robots, /^Allow:\s*\/eliminar-cuenta\.html$/m);
  assert.match(robots, /^Allow:\s*\/creditos\.html$/m);

  const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')) as {
    hosting?: { rewrites?: Array<{ source?: string; regex?: string; destination?: string }> };
  };
  const rewrites = firebaseJson.hosting?.rewrites ?? [];
  const robotsIdx = rewrites.findIndex((r) => r.source === '/robots.txt' && r.destination === '/robots.txt');
  const catchAllIdx = rewrites.findIndex((r) => r.regex === '.*');
  assert.ok(robotsIdx >= 0, 'firebase.json debe incluir rewrite explícito para /robots.txt');
  assert.ok(robotsIdx < catchAllIdx, 'El rewrite de /robots.txt debe preceder al fallback SPA');

  const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteCfg, /\/\^\\\/robots\\\.txt\$\//, 'workbox.navigateFallbackDenylist debe excluir /robots.txt');
  assert.match(viteCfg, /legalComments:\s*'none'/, 'vite.config.ts debe eliminar comentarios legales duplicados en vendor chunks');

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /<html lang="es">/);
  assert.match(indexHtml, /<title>[^<]+<\/title>/);
  assert.match(indexHtml, /<meta name="description" content="[^"]+"/);
  assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?/i, 'viewport no debe bloquear zoom');

  for (const legalFile of ['public/privacidad.html', 'public/eliminar-cuenta.html']) {
    const html = fs.readFileSync(path.join(ROOT, legalFile), 'utf8');
    assert.match(html, /<html lang="es">/);
    assert.match(html, /<meta name="description" content="[^"]+"/, `${legalFile} debe incluir meta description`);
    assert.match(html, /<main>/, `${legalFile} debe incluir landmark <main>`);
  }
});

test('Bloque 34.2: OnboardingView expone landmark <main>, h1 único y contraste AA en separador y placeholder', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    React.createElement(OnboardingView, {
      state,
      onComplete: () => {},
      cloudConfigured: true,
      onCloudSignIn: () => {},
    })
  );

  assert.match(html, /<main\b[^>]*aria-label="Configuración inicial"/, 'OnboardingView debe renderizar <main>');
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'OnboardingView debe renderizar exactamente un <h1>');
  assert.match(html, /o sincronizá tu cuenta/);
  assert.doesNotMatch(
    html,
    /text-slate-400 dark:text-slate-500">o sincronizá tu cuenta/,
    'El texto separador de Onboarding no debe usar contraste insuficiente'
  );
  assert.match(html, /text-slate-600 dark:text-slate-400">o sincronizá tu cuenta/);
});

test('Bloque 34.3: Shell (Sidebar, Topbar, MobileNav) cumple landmarks distintos, contraste AA y WCAG 2.5.3 Label in Name', () => {
  const state = defaultState();
  state.settings.onboardingCompleted = true;

  const sidebarHtml = renderToStaticMarkup(
    React.createElement(Sidebar, {
      currentView: 'dashboard',
      state,
      onNavigate: () => {},
      onToggleTheme: () => {},
      isOpenMobile: false,
      onCloseMobile: () => {},
    })
  );
  assert.match(sidebarHtml, /<aside\b[^>]*aria-label="Navegación principal"/);
  assert.match(sidebarHtml, /<nav\b[^>]*aria-label="Secciones principales"/);
  assert.doesNotMatch(
    sidebarHtml,
    /text-\[var\(--text-faint\)\]\/75/,
    'Las cabeceras de sección en Sidebar no deben reducir opacidad debajo de WCAG AA'
  );

  const topbarHtml = renderToStaticMarkup(
    React.createElement(Topbar, {
      currentView: 'dashboard',
      state,
      onOpenMobileNav: () => {},
      onQuickAction: () => {},
      onSearch: () => {},
      onOpenSearch: () => {},
      onOpenCapture: () => {},
      onTogglePrivacy: () => {},
      cloudConfigured: true,
      cloudUser: null,
      syncStatus: 'signed-out',
      onCloudSignIn: () => {},
      onCloudSignOut: () => {},
    })
  );
  assert.match(topbarHtml, /<header\b/);
  assert.doesNotMatch(
    topbarHtml,
    /aria-label="Abrir Paleta de Comandos"/,
    'El botón de búsqueda en Topbar no debe sobreescribir su texto visible con un aria-label incompatible'
  );
  assert.match(topbarHtml, /<kbd[^>]*aria-hidden="true"/, 'El atajo de teclado decorativo debe estar oculto a lectores de pantalla');
  assert.match(topbarHtml, /aria-pressed="false"[^>]*>.*Privacidad|Privacidad.*aria-pressed="false"/);

  const mobileNavHtml = renderToStaticMarkup(
    React.createElement(MobileNav, {
      currentView: 'dashboard',
      state,
      onNavigate: () => {},
      onOpenCapture: () => {},
      onOpenMore: () => {},
      onTogglePrivacy: () => {},
      privacyMode: false,
    })
  );
  assert.match(mobileNavHtml, /<nav\b[^>]*aria-label="Navegación móvil"/);
  assert.match(mobileNavHtml, /aria-pressed="false"/);
});

test('Bloque 34.4: Hoy (DashboardView) y DashboardSkeleton preservan orden jerárquico de headings y estabilidad de altura (CLS=0)', () => {
  const state = defaultState();
  state.settings.onboardingCompleted = true;
  state.profile.name = 'Christian';

  const html = renderToStaticMarkup(
    React.createElement(DashboardView, {
      state,
      onUpdateState: () => true,
      onNavigate: () => {},
      onExportJSON: () => {},
    })
  );

  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  assert.equal(headings.filter((level) => level === 1).length, 1, 'Hoy debe tener un único <h1>');
  assert.equal(headings[0], 1, 'El primer encabezado de Hoy debe ser <h1>');
  for (let i = 1; i < headings.length; i += 1) {
    assert.ok(
      headings[i] <= headings[i - 1] + 1,
      `No debe haber saltos de nivel en encabezados de Hoy: ${headings.join(' -> ')}`
    );
  }

  const skeletonHtml = renderToStaticMarkup(React.createElement(DashboardSkeleton));
  assert.match(
    skeletonHtml,
    /min-h-\[195px\] sm:h-\[230px\]/,
    'DashboardSkeleton debe igualar la altura del hero para garantizar CLS = 0'
  );
});

test('Bloque 34.5: Regresiones específicas de contraste y heading-order en SurfacePrimitives, FinanceQuickAccountsCard y AgendaView', () => {
  const quickAccountsHtml = renderToStaticMarkup(
    React.createElement(FinanceQuickAccountsCard, {
      onConfirm: () => {},
      onDismiss: () => {},
    })
  );
  assert.doesNotMatch(
    quickAccountsHtml,
    /opacity-65|opacity-70/,
    'FinanceQuickAccountsCard no debe usar opacity-65/70 sobre etiquetas de moneda/subtítulo'
  );
  assert.doesNotMatch(
    quickAccountsHtml,
    /text-\[10px\] font-semibold text-slate-400 dark:text-slate-500/,
    'Las etiquetas de moneda en FinanceQuickAccountsCard deben mantener contraste WCAG AA'
  );

  const surfaceSrc = fs.readFileSync(path.join(ROOT, 'src/components/ui/SurfacePrimitives.tsx'), 'utf8');
  assert.doesNotMatch(
    surfaceSrc,
    /tabular-nums text-slate-400 dark:text-slate-500/,
    'SectionHeader count debe usar contraste WCAG AA (slate-500 / dark:slate-400)'
  );

  const agendaSrc = fs.readFileSync(path.join(ROOT, 'src/components/AgendaView.tsx'), 'utf8');
  assert.doesNotMatch(agendaSrc, /<h4\b/, 'AgendaView no debe saltar de h2 a h4');
});
