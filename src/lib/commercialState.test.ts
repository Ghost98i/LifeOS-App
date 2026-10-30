import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommercialSet } from './commercialContract';
import { validateCommercialSet } from './commercialContract';
import { ResaleProtocolConflict, writeCloudModules, writeCloudModulesAsync, writeCloudModulesGuarded } from './cloudSync';
import { recordResalePurchase, recordResaleSale, resaleProfit } from './resaleFlows';
import { mergeModuleDataWithConflicts } from './syncMerge';
import { defaultState, getStorageKey, inspectBackupJSON, inspectStoredCommercial, loadRecoveryState,
  loadStoredState, normalizeStoredState, parseBackupJSON, saveRecoveryState, saveStoredState } from './storage';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
} as Storage;

const commercial = (): CommercialSet => ({
  items: [{ id: 'pan', name: 'Pan', unit: 'unit' }, { id: 'carne', name: 'Carne', unit: 'kg' }],
  operations: [
    { id: 'purchase-1', kind: 'receipt', status: 'closed', commercialDate: '2026-10-22', effectiveOrder: '001' },
    { id: 'consume-1', kind: 'consumption', status: 'closed', commercialDate: '2026-10-22', effectiveOrder: '002' },
  ],
  movements: [
    { id: 'pan-in', operationId: 'purchase-1', itemId: 'pan', kind: 'receipt', quantity: 20, unit: 'unit', costCents: 60000 },
    { id: 'meat-in', operationId: 'purchase-1', itemId: 'carne', kind: 'receipt', quantity: 2, unit: 'kg', costCents: 90000 },
    { id: 'pan-out', operationId: 'consume-1', itemId: 'pan', kind: 'consumption', quantity: 12, unit: 'unit', costCents: 36000 },
    { id: 'meat-out', operationId: 'consume-1', itemId: 'carne', kind: 'consumption', quantity: 1200, unit: 'g', costCents: 54000 },
  ],
});

test('estado antiguo mantiene ausente commercial y Reventa conserva sus movimientos financieros', () => {
  const state = normalizeStoredState(defaultState());
  assert.equal(Object.hasOwn(state.resale, 'commercial'), false);
  assert.deepEqual(inspectStoredCommercial(state), { present: false, valid: true, issues: [] });
  const account = state.finance.accounts[0];
  const purchase = recordResalePurchase(state, { item: 'GPU', buyPrice: 8000, accountId: account.id });
  recordResaleSale(state, purchase.id, { sellPrice: 11000, fees: 500, accountId: account.id });
  assert.equal(resaleProfit(purchase), 2500);
  assert.deepEqual(state.finance.transactions.map((transaction) => [transaction.type, transaction.amount]),
    [['gasto', 8000], ['ingreso', 11000], ['gasto', 500]]);
  assert.ok(purchase.purchaseTxId && purchase.saleTxId && purchase.feeTxId);
  assert.equal(Object.hasOwn(state.resale, 'commercial'), false);
  const merged = mergeModuleDataWithConflicts('resale', { resale: state.resale }, { resale: state.resale });
  assert.deepEqual(merged.conflicts, []);
});

test('colección válida conserva IDs, unidades, orden y costos al guardar, recuperar y restaurar backup', () => {
  const user = 'commercial-state-valid';
  const state = defaultState();
  state.resale.commercial = commercial();
  assert.equal(validateCommercialSet(state.resale.commercial).valid, true);
  const financeBefore = structuredClone(state.finance);
  assert.equal(saveStoredState(state, user), true);
  assert.ok(store.get(getStorageKey(user))?.includes('commercial'));
  const loaded = loadStoredState(user);
  assert.equal(loaded.backend, 'localStorage');
  assert.deepEqual(loaded.state.resale.commercial, state.resale.commercial);
  assert.deepEqual(loaded.state.finance.transactions, financeBefore.transactions);
  assert.equal(saveRecoveryState(state, user), true);
  assert.deepEqual(loadRecoveryState(user)?.state.resale.commercial, state.resale.commercial);
  const backup = JSON.stringify({ meta: { version: 2 }, state });
  assert.deepEqual(parseBackupJSON(backup).resale.commercial, state.resale.commercial);
  assert.equal(inspectBackupJSON(backup).warnings.some((warning) => warning.includes('Mi negocio contiene')), false);
  assert.deepEqual(inspectStoredCommercial(loaded.state), { present: true, valid: true, issues: [] });
});

test('colección inválida conserva el payload íntegro y produce diagnóstico sin inventar referencias', () => {
  const user = 'commercial-state-invalid';
  const state = defaultState();
  const invalid = commercial();
  invalid.movements[3].itemId = 'faltante';
  state.resale.commercial = invalid;
  const raw = JSON.parse(JSON.stringify(state));
  const normalized = normalizeStoredState(raw);
  assert.deepEqual(normalized.resale.commercial, invalid);
  assert.ok(inspectStoredCommercial(normalized).issues.some((issue) => issue.code === 'missing_item'));
  assert.equal(saveStoredState(normalized, user), true);
  assert.deepEqual(loadStoredState(user).state.resale.commercial, invalid);
  const backup = JSON.stringify({ state: normalized });
  assert.deepEqual(parseBackupJSON(backup).resale.commercial, invalid);
  assert.ok(inspectBackupJSON(backup).warnings.some((warning) => warning.includes('missing_item')));
  assert.equal(saveRecoveryState(normalized, user), true);
  assert.deepEqual(loadRecoveryState(user)?.state.resale.commercial, invalid);

  const malformed = { ...raw, resale: { ...raw.resale, commercial: { items: 'invalid', operations: [], movements: [] } } };
  assert.deepEqual(normalizeStoredState(malformed).resale.commercial, malformed.resale.commercial);
  assert.equal(inspectStoredCommercial(malformed).issues[0].code, 'invalid_collection');
});

test('el rechazo preventivo sigue impidiendo publicar commercial con Reventa y Finanzas', async () => {
  const state = defaultState();
  state.resale.commercial = commercial();
  const modules = ['resale', 'finance'] as const;
  assert.throws(() => writeCloudModules('isolated', state, [...modules], 'device', {}), ResaleProtocolConflict);
  await assert.rejects(writeCloudModulesAsync('isolated', state, [...modules], 'device', {}), ResaleProtocolConflict);
  await assert.rejects(writeCloudModulesGuarded('isolated', state, [...modules], 'device', {}), ResaleProtocolConflict);
  assert.equal(state.finance.transactions.length, 0);
});
