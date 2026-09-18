import assert from 'node:assert/strict';
import test from 'node:test';
import appletConfig from '../../firebase-applet-config.json';
import { cloudSyncConfigured, hasMeaningfulData } from './cloudSync';
import { defaultState } from './storage';

test('firebase-applet-config.json contiene las credenciales de produccion para lifeosanywhere', () => {
  assert.equal(appletConfig.projectId, 'lifeosanywhere');
  assert.ok(appletConfig.apiKey.startsWith('AIzaSy'));
  assert.ok(appletConfig.appId.includes('177511653491'));
  assert.equal(appletConfig.authDomain, 'lifeosanywhere.firebaseapp.com');
  assert.equal(appletConfig.storageBucket, 'lifeosanywhere.firebasestorage.app');
});

test('cloudSyncConfigured esta activo en entorno web/PWA sin requerir archivo .env', () => {
  assert.equal(cloudSyncConfigured, true);
});

test('hasMeaningfulData distingue correctamente entre plantilla vacia y datos reales de usuario', () => {
  const def = defaultState();
  assert.equal(hasMeaningfulData(def), false);

  const withGym = defaultState();
  withGym.gym.sessions.push({
    id: 's-1',
    date: '2026-09-18',
    status: 'completed',
    exercises: [],
  });
  assert.equal(hasMeaningfulData(withGym), true);

  const withFinance = defaultState();
  withFinance.finance.transactions.push({
    id: 'tx-1',
    type: 'gasto',
    amount: 150,
    category: 'Comida',
    fixed: 'variable',
    date: '2026-09-18',
    note: 'Super',
  });
  assert.equal(hasMeaningfulData(withFinance), true);
});
