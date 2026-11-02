import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from '../lib/storage';
import { getDismissedAttentionItems } from '../lib/todayAttention';
import { DashboardView } from './DashboardView';
import { PersonalContextCard } from './PersonalContextCard';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import { WeeklyReviewCard } from './WeeklyReviewCard';

test('Estado vacío mantiene registro y siete fechas sin montar indicadores ni gráfico vacíos', () => {
  const html = renderToStaticMarkup(<PersonalContextCard state={defaultState()} onUpdateState={() => true} />);
  assert.match(html, /¿Cómo estás hoy\?/);
  assert.match(html, />Registrar</);
  assert.match(html, />Ahora no</);
  assert.match(html, /today-state-empty-history/);
  assert.equal((html.match(/Seleccionar día\./g) || []).length, 7);
  assert.doesNotMatch(html, /today-state-kpi-strip|S\/D|Gráfico de evolución|Vista del gráfico/);
});

test('Estado con un cero real conserva valores y gráfico con huecos', () => {
  const state = defaultState();
  state.dailyContext.push({ date: todayISO(), sleepHours: 0, energy: 2, mood: null, connection: null });
  const html = renderToStaticMarkup(<PersonalContextCard state={state} onUpdateState={() => true} />);
  assert.match(html, /today-state-kpi-strip/);
  assert.match(html, /0 h/);
  assert.match(html, /2\/5/);
  assert.match(html, /Gráfico de evolución/);
  assert.match(html, /S\/D/);
  assert.doesNotMatch(html, /today-state-empty-history/);
});

test('los avisos financieros activos y descartados no filtran importes en HTML ni atributos bajo privacidad', () => {
  const state = defaultState();
  state.finance.commitments.push({ id: 'private', name: 'Servicio $U 7689,45', amount: 3500, frequency: 'once', nextDueDate: todayISO(), active: true });
  const render = () => renderToStaticMarkup(<DashboardView state={state} onUpdateState={() => true} onNavigate={() => {}} onExportJSON={() => {}} />);
  assert.match(render(), /3\.500/);
  state.settings.privacyMode = true;
  const html = render();
  assert.doesNotMatch(html, /3\.500|3500|7689/);
  assert.match(html, /Servicio \$U ••••/);
  assert.match(html, /vencimiento hoy/);
  assert.ok(html.indexOf('Captura rápida') < html.indexOf('id="today-attention-title"'), 'El DOM sigue el orden de lectura visual');
  state.settings.dismissedAttentionKeys = [`finance_commitment:private:${todayISO()}`];
  const dismissedHtml = renderToStaticMarkup(<DismissedAttentionModal open onClose={() => {}} dismissedItems={getDismissedAttentionItems(state)} onRestoreItem={() => {}} onRestoreAll={() => {}} />);
  assert.doesNotMatch(dismissedHtml, /3\.500|3500|7689/);
  assert.match(dismissedHtml, /Restaurar/);
  state.settings.privacyMode = false;
  state.settings.dismissedAttentionKeys = [];
  assert.match(render(), /3\.500/);
});

test('una primera revisión no aparece vacía ni se presenta como una revisión ya incumplida', () => {
  const state = defaultState();
  const render = () => renderToStaticMarkup(<WeeklyReviewCard state={state} onUpdateState={() => {}} onNavigate={() => {}} />);
  assert.equal(render(), '');
  state.todayExtras.push({ id: 'task', text: 'Actividad propia', date: todayISO(), done: false, priority: 'media' });
  assert.match(render(), /Revisá tu semana/);
  assert.doesNotMatch(render(), /Revisión semanal pendiente|señal/);
  assert.equal(state.settings.lastWeeklyReviewAt, null);
});
