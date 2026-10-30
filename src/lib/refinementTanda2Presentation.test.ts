import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfigView } from '../components/ConfigView';
import { PrivacySecuritySection } from '../components/PrivacySecuritySection';
import { FinanzasView } from '../components/FinanzasView';
import { defaultState } from './storage';

test('Configuración distingue una sincronización fallida de una fecha de sincronización anterior', () => {
  const state = defaultState();
  const before = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(ConfigView, {
    state, onUpdateState: () => assert.fail('render must not write'), onExportJSON: () => {},
    cloudUser: { uid: 'synthetic', name: 'Prueba', email: 'test@example.invalid', photoURL: '' },
    syncStatus: 'error', lastSyncedAt: '2026-10-28 18:30',
  }));
  assert.match(html, /Error al sincronizar/);
  assert.match(html, /Última sincronización/);
  assert.doesNotMatch(html, /Al día/);
  assert.doesNotMatch(html, /Snapshot listo/);
  assert.deepEqual(state, before);
});

test('sin verificar la cuenta no se afirma que el cifrado en la nube está activo o desactivado', () => {
  const html = renderToStaticMarkup(React.createElement(PrivacySecuritySection, {
    state: defaultState(), storageUserId: null, cloudConnected: false,
  }));
  assert.match(html, /Cifrado en la nube sin verificar/);
  assert.doesNotMatch(html, /Protección activada|Cifrado no activado/);
  assert.match(html, /no quedan cifrados por esta función/);
});

test('explorar cada subpantalla de Finanzas no modifica saldos, obligaciones ni movimientos', () => {
  const state = defaultState();
  const before = structuredClone(state);
  for (const initialTab of ['movimientos', 'cuentas', 'analisis', 'proyeccion'] as const) {
    renderToStaticMarkup(React.createElement(FinanzasView, {
      state, initialTab, onUpdateState: () => assert.fail('presentation must not write'),
    }));
    assert.deepEqual(state, before);
  }
});

test('una copia exportada registrada y una copia local de emergencia se muestran por separado', () => {
  const state = defaultState();
  state.settings.lastBackupAt = '2026-10-28 18:30';
  const html = renderToStaticMarkup(React.createElement(ConfigView, {
    state, onUpdateState: () => {}, onExportJSON: () => {},
  }));
  assert.match(html, /Última exportación registrada/);
  assert.match(html, /Descargar copia/);
  assert.doesNotMatch(html, /Snapshot listo|Copia de emergencia en este navegador/);
  const reset = html.indexOf('aria-label="Reiniciar datos"');
  assert.ok(reset > html.indexOf('id="config-backups"'));
  assert.ok(reset > html.indexOf('id="config-diagnostics"'));
});
