import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from '../lib/storage';
import { isStreamingEnabled } from '../lib/moduleVisibility';
import type { DayCyclePeriod } from '../lib/alpineDayCycle';
import { AlpineDayCycleBackdrop } from './visual/AlpineDayCycleBackdrop';
import { DashboardView } from './DashboardView';
import { IAView } from './IAView';
import { getVisibleContextModules } from '../lib/aiContextBuilder';
import { NotasView } from './NotasView';
import { ConfigView } from './ConfigView';

test('Block 10: AlpineDayCycleBackdrop renderiza limpio en SSR para las 5 franjas sin etiquetas de texto', () => {
  const periods: DayCyclePeriod[] = ['predawn', 'morning', 'day', 'sunset', 'night'];
  for (const period of periods) {
    const html = renderToStaticMarkup(<AlpineDayCycleBackdrop forcePeriod={period} compact />);
    assert.match(html, new RegExp(`data-day-cycle="${period}"`));
    assert.match(html, /<canvas/);
    assert.match(html, /opacity-\[0\.042\] mix-blend-overlay/);
    assert.match(html, /class="hero-scrim/);
    assert.doesNotMatch(html, /MAÑANA|NOCHE|MADRUGADA|ATARDECER|MEDIODÍA/i);
    assert.doesNotMatch(html, /cervino/i);
  }
});

test('Block 10: DashboardView usa composición Hero Horizonte y Lago con reloj protagonista y barra 24h sin overlay oscuro heredado', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date('2026-11-21T19:15:00')}
    />
  );
  assert.match(html, /min-h-\[195px\] sm:h-\[230px\]/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-label="Progreso del día"/);
  assert.match(html, /aria-valuenow="80"/);
  assert.match(html, /19:15/);
  assert.doesNotMatch(html, /rgba\(9,12,20,0\.88\)/);
});

test('Block 10 / 24: IAView adapta módulos según visibilidad, elimina contrato JSON y conserva privacidad', () => {
  const allVisible = defaultState();
  allVisible.settings.hiddenTabs = [];
  const fullModules = getVisibleContextModules(allVisible).map((m) => m.id);
  assert.ok(fullModules.includes('trabajo'));
  assert.ok(fullModules.includes('negocio'));
  assert.ok(fullModules.includes('finanzas'));

  const onlyCore = defaultState();
  onlyCore.settings.hiddenTabs = ['trabajo', 'reventa'];
  const reducedModules = getVisibleContextModules(onlyCore).map((m) => m.id);
  assert.ok(!reducedModules.includes('trabajo'));
  assert.ok(!reducedModules.includes('negocio'));
  assert.ok(reducedModules.includes('hoy_agenda'));

  const html = renderToStaticMarkup(<IAView state={onlyCore} onUpdateState={() => true} />);
  assert.match(html, /Celestian no envía tus datos automáticamente/);
  assert.doesNotMatch(html, /Contrato JSON/i);
  assert.doesNotMatch(html, /Respuesta de la IA \(JSON\)/i);
});

test('Block 10: isStreamingEnabled oculta por defecto en cuentas nuevas, preserva legacy y respeta el toggle en NotasView y ConfigView', () => {
  const fresh = defaultState();
  assert.equal(isStreamingEnabled(fresh), false);

  const legacyWithSessions = defaultState();
  legacyWithSessions.streaming.sessions = [{ id: 's1', date: '2026-11-20', hours: 2 }];
  assert.equal(isStreamingEnabled(legacyWithSessions), true);

  const legacyWithGoal = defaultState();
  legacyWithGoal.streaming.monthlyGoal = 8;
  assert.equal(isStreamingEnabled(legacyWithGoal), true);

  const explicitlyDisabled = defaultState();
  explicitlyDisabled.streaming.sessions = [{ id: 's1', date: '2026-11-20', hours: 2 }];
  explicitlyDisabled.settings.streamingEnabled = false;
  assert.equal(isStreamingEnabled(explicitlyDisabled), false);

  // NotasView oculta pill y hace fallback cuando streaming está desactivado
  const notesFreshHtml = renderToStaticMarkup(
    <NotasView state={fresh} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} initialTab="streaming" />
  );
  assert.doesNotMatch(notesFreshHtml, /Streaming y contenido/);

  // NotasView muestra pill cuando está habilitado
  const enabledState = defaultState();
  enabledState.settings.streamingEnabled = true;
  const notesEnabledHtml = renderToStaticMarkup(
    <NotasView state={enabledState} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} initialTab="proyectos" />
  );
  assert.match(notesEnabledHtml, /Streaming y contenido/);

  // ConfigView oculta "Meta mensual de streams" cuando streaming está desactivado, y lo muestra cuando está activo
  const configFreshHtml = renderToStaticMarkup(
    <ConfigView state={fresh} onUpdateState={() => true} onExportJSON={() => {}} initialTab="preferencias" />
  );
  assert.doesNotMatch(configFreshHtml, /Meta mensual de streams/);
  assert.match(configFreshHtml, /Streaming y contenido/);

  const configEnabledHtml = renderToStaticMarkup(
    <ConfigView state={enabledState} onUpdateState={() => true} onExportJSON={() => {}} initialTab="preferencias" />
  );
  assert.match(configEnabledHtml, /Meta mensual de streams/);
});

test('Block 10: ConfigView ya no contiene referencias a Icons8 ni a Andrew Bossi', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    <ConfigView state={state} onUpdateState={() => true} onExportJSON={() => {}} />
  );
  assert.doesNotMatch(html, /Icons8/i);
  assert.doesNotMatch(html, /Andrew Bossi/i);
});
