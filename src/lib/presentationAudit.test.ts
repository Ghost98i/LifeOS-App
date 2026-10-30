import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacySecuritySection } from '../components/PrivacySecuritySection';
import { FinanceHero } from '../components/FinanceHero';
import { FinanceFutureView } from '../components/FinanceFutureView';
import { MobileNav } from '../components/MobileNav';
import { Topbar } from '../components/Topbar';
import { defaultState, todayISO } from './storage';
import { provisionZeroKnowledgeKeys, clearWrappedKeyEnvelope, cryptoSession } from './cryptoCore';
import { cashFlowProjection } from './calculations';

test('Privacidad: una clave local no demuestra cobertura cifrada en la nube', async () => {
  const userId = 'synthetic-unverified-coverage';
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  try {
    await provisionZeroKnowledgeKeys(userId);
    const html = renderToStaticMarkup(React.createElement(PrivacySecuritySection, { state: defaultState(), storageUserId: userId, cloudConnected: false }));
    assert.match(html, /Cifrado en la nube sin verificar/);
    assert.doesNotMatch(html, /Protección activada/);
    assert.match(html, /Hay una clave local/);
  } finally {
    cryptoSession.lock(); clearWrappedKeyEnvelope(userId);
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as any).localStorage;
  }
});

test('Finanzas respeta la preferencia de mostrar disponible tras pagos como importe principal', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'account', name: 'Sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
  state.finance.commitments = [{ id: 'bill', name: 'Servicio', amount: 100, nextDueDate: todayISO(), frequency: 'once', active: true, category: 'Otros', accountId: 'account', currency: 'UYU' }];
  const html = renderToStaticMarkup(React.createElement(FinanceHero, { state, cashFlow: cashFlowProjection(state, 30), displayMode: 'real_available', onOpenNewTx: () => {}, onOpenTransfer: () => {} }));
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(text, /Disponible tras pagos \(UYU\).*?\$U 900/);
  assert.match(text, /Saldo real.*?\$U 1\.000/);
  assert.doesNotMatch(html, /<h1/);
});

test('Finanzas sin cuentas propone crear una sin inventar una alarma de reserva', () => {
  const state = defaultState();
  state.finance.accounts = [];
  const html = renderToStaticMarkup(React.createElement(FinanceHero, { state, cashFlow: cashFlowProjection(state, 30), onOpenNewTx: () => {}, onOpenTransfer: () => {}, onOpenAddAccount: () => {} }));
  assert.match(html, /Sin cuentas registradas/);
  assert.match(html, /Crear cuenta/);
  assert.doesNotMatch(html, /Disponible bajo reserva/);
});

test('La navegación identifica sesiones bloqueadas y sin conexión en escritorio y móvil', () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  try {
  const state = defaultState();
  const noop = () => {};
  for (const syncStatus of ['locked', 'offline'] as const) {
    const mobile = renderToStaticMarkup(React.createElement(MobileNav, { state, currentView: 'dashboard', onNavigate: noop, onOpenCapture: noop, onOpenMore: noop, cloudConfigured: true, cloudUser: { uid: 'synthetic' }, syncStatus }));
    const desktop = renderToStaticMarkup(React.createElement(Topbar, { state, currentView: 'dashboard', onOpenMobileNav: noop, onQuickAction: noop, onSearch: noop, onOpenSearch: noop, onOpenCapture: noop, onTogglePrivacy: noop, cloudConfigured: true, cloudUser: { uid: 'synthetic', name: '', email: '', photoURL: '' }, syncStatus, onCloudSignIn: noop, onCloudSignOut: noop }));
    assert.match(mobile, syncStatus === 'locked' ? /Sincronización bloqueada/ : /Sin conexión/);
    assert.match(desktop, syncStatus === 'locked' ? /Sincronización bloqueada/ : /Sin conexión/);
  }
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete (globalThis as any).navigator;
  }
});

test('Un compromiso de hoy no figura vencido cuando UTC ya cambió de día en Uruguay', context => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Montevideo';
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-28T23:30:00-03:00').getTime() });
    const state = defaultState();
    state.finance.accounts = [{ id: 'account', name: 'Sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
    state.finance.commitments = [{ id: 'bill', name: 'Servicio', amount: 100, nextDueDate: '2026-10-28', frequency: 'once', active: true, category: 'Otros', accountId: 'account', currency: 'UYU' }];
    const noop = () => {};
    const render = () => renderToStaticMarkup(React.createElement(FinanceFutureView, {
      state, projection: cashFlowProjection(state, 30), projHorizon: 30, onSetProjHorizon: noop,
      onOpenCommitmentModal: noop, onOpenIncomeModal: noop, onOpenCushionModal: noop,
      onPayCommitment: noop, onEditCommitment: noop, onToggleCommitment: noop, onDeleteCommitment: noop,
      onConfirmIncomeReal: noop, onEditIncome: noop, onToggleIncome: noop, onDeleteIncome: noop,
    }));
    assert.doesNotMatch(render(), />\s*Vencido\s*<\/span>/);
    context.mock.timers.setTime(new Date('2026-10-29T00:01:00-03:00').getTime());
    assert.match(render(), />\s*Vencido\s*<\/span>/);
  } finally {
    context.mock.timers.reset();
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
