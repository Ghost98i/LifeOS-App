import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { defaultState, normalizeStoredState, saveStoredState, loadStoredState, parseBackupJSON, saveRecoveryState, loadRecoveryState } from './storage';
import { applySyncModule, syncModuleData, mergeSyncModule, mergeSyncModuleWithConflicts } from './syncModel';
import { mergeFinanceModule } from './syncMerge';
import { cashFlowProjection } from './calculations';
import { deriveCashflowProjection } from './financeCashflow';
import { generateMdek, encryptSyncModule, decryptSyncModule } from './cryptoCore';
import { detectFinanceSnapshotRegression } from './financeSnapshotIntegrity';
import { confirmFinancialCommitment, confirmExpectedIncome } from './financeFlows';
import type { LifeOSState } from '../types';

function fixture() {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'uyu', name: 'Sintética UYU', currency: 'UYU', balance: 10000, initialBalance: 10000 },
    { id: 'usd', name: 'Sintética USD', currency: 'USD', balance: 1000, initialBalance: 1000 },
  ];
  state.finance.transactions = [];
  state.finance.commitments = ['UYU', 'USD'].map((currency, index) => ({ id: `com-${currency}`, name: `Compromiso ${currency}`, currency,
    amount: index ? 20.25 : 200.50, frequency: 'once', nextDueDate: '2026-11-05', active: true,
    category: 'Comida', accountId: currency.toLowerCase(), createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.000Z', notes: 'Sintético' }));
  state.finance.expectedIncomes = ['UYU', 'USD'].map((currency, index) => ({ id: `inc-${currency}`, name: `Cobro ${currency}`, currency,
    amount: index ? 100.75 : 3000.25, frequency: 'once', startDate: '2026-11-02', active: true,
    category: 'Comida', accountId: currency.toLowerCase(), updatedAt: '2026-10-20T12:00:00.000Z' }));
  return state;
}

function assertCurrencies(state: LifeOSState) {
  for (const currency of ['UYU', 'USD']) {
    assert.equal(state.finance.commitments?.find(c => c.id === `com-${currency}`)?.currency, currency);
    assert.equal(state.finance.expectedIncomes?.find(c => c.id === `inc-${currency}`)?.currency, currency);
  }
}

function memoryStorage(context: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key),
  } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return data;
}

test('monedas explícitas UYU y USD sobreviven veinte normalizaciones sin cambiar importes, IDs, fechas o vínculos', () => {
  const original = fixture();
  let state = normalizeStoredState(original);
  const baseline = structuredClone(state);
  assertCurrencies(state);
  for (let i = 0; i < 20; i++) { state = normalizeStoredState(state); assertCurrencies(state); }
  assert.deepEqual(state.finance, baseline.finance);
  const withoutCurrency = structuredClone(original);
  for (const record of [...withoutCurrency.finance.commitments!, ...withoutCurrency.finance.expectedIncomes!]) delete record.currency;
  const stripped = structuredClone(state);
  for (const record of [...stripped.finance.commitments!, ...stripped.finance.expectedIncomes!]) delete record.currency;
  assert.deepEqual(stripped.finance, normalizeStoredState(withoutCurrency).finance, 'Ningún otro campo financiero cambia por conservar currency');
  assert.deepEqual(state.finance.commitments!.map(c => c.nextDueDate), ['2026-11-05', '2026-11-05']);
  assert.deepEqual(state.finance.expectedIncomes!.map(c => c.startDate), ['2026-11-02', '2026-11-02']);
  for (const key of ['commitments', 'expectedIncomes'] as const) for (let i = 0; i < 2; i++) {
    const initial = original.finance[key]![i], after = state.finance[key]![i];
    for (const field of ['id', 'name', 'amount', 'currency', 'active', 'accountId', 'updatedAt'] as const) assert.equal(after[field], initial[field]);
  }
  assert.deepEqual(state.finance.accounts.map(a => a.balance), [10000, 1000]);
  assert.deepEqual(state.finance.transactions, []);
});

test('guardado y dos recargas consecutivas conservan ambas monedas y el JSON reescrito', context => {
  const data = memoryStorage(context);
  assert.equal(saveStoredState(fixture()), true);
  assertCurrencies(JSON.parse(data.get('lifeos-state-v1')!));
  for (let i = 0; i < 2; i++) { const loaded = loadStoredState(); assert.equal(loaded.backend, 'localStorage'); assertCurrencies(loaded.state); assert.equal(saveStoredState(loaded.state), true); }
  assertCurrencies(JSON.parse(data.get('lifeos-state-v1')!));
});

test('exportación/importación y copia de recuperación conservan monedas explícitas', context => {
  memoryStorage(context);
  const state = fixture();
  assertCurrencies(parseBackupJSON(JSON.stringify(state)));
  assertCurrencies(parseBackupJSON(JSON.stringify({ state, schemaVersion: state.schemaVersion })));
  assert.equal(saveRecoveryState(state), true);
  assertCurrencies(loadRecoveryState()!.state);
});

test('preparar, aplicar y unir módulos conserva moneda y registra conflictos entre monedas explícitas', () => {
  const state = normalizeStoredState(fixture());
  assertCurrencies(state);
  const module = syncModuleData(state, 'finance');
  assertCurrencies(applySyncModule(defaultState(), 'finance', module));
  const remote = structuredClone(state); remote.finance.commitments![0].name = 'Nombre actualizado';
  const merged = mergeSyncModuleWithConflicts(state, 'finance', syncModuleData(remote, 'finance'), module);
  assert.equal(merged.conflicts.length, 0); assertCurrencies(merged.state);
  const localEdit = structuredClone(state), remoteEdit = structuredClone(state);
  localEdit.finance.commitments![0].amount = 250;
  remoteEdit.finance.commitments![0].currency = 'USD';
  const conflict = mergeSyncModuleWithConflicts(localEdit, 'finance', syncModuleData(remoteEdit, 'finance'), module);
  assert.ok(conflict.conflicts.some(c => c.entityId === 'com-UYU'));
  assert.deepEqual(conflict.state, localEdit);
});

test('cifrado existente conserva los campos antes y después de aplicar el módulo', async () => {
  const state = fixture(), key = await generateMdek();
  const payload = syncModuleData(state, 'finance');
  const envelope = await encryptSyncModule(payload, key, 'finance', 'synthetic-currency-user');
  const decrypted = await decryptSyncModule(envelope, key, 'finance', 'synthetic-currency-user');
  assert.deepEqual(decrypted, payload);
  assertCurrencies(applySyncModule(defaultState(), 'finance', decrypted));
});

test('proyecciones UYU/USD conservan sus obligaciones e ingresos sin cambiar saldos ni duplicar eventos', context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 12).getTime() }); context.after(() => context.mock.timers.reset());
  const state = normalizeStoredState(fixture()), before = JSON.stringify(state);
  for (const [currency, expense, income, balance] of [['UYU', 200.50, 3000.25, 10000], ['USD', 20.25, 100.75, 1000]] as const) {
    const projection = cashFlowProjection(state, 30, '2026-10-31', currency);
    assert.equal(projection.committed, expense); assert.equal(projection.totalExpectedIncome, income);
    assert.equal(projection.currentBalance, balance); assert.equal(projection.projectedBalance, balance + income - expense);
    assert.equal(projection.forecastItems.length, 2); assert.equal(new Set(projection.forecastItems.map(e => e.id)).size, 2);
    const summary = deriveCashflowProjection(state, '30d', '2026-10-31').summariesByCurrency[currency];
    assert.equal(summary.committedExpenses, expense); assert.equal(summary.expectedIncomes, income); assert.equal(summary.realBalance, balance);
  }
  assert.equal(JSON.stringify(state), before);
});

test('pagar y cobrar después de recargar respeta ambas monedas y los reintentos no duplican movimientos', context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 12).getTime() }); context.after(() => context.mock.timers.reset());
  let state = parseBackupJSON(JSON.stringify(fixture()));
  for (const currency of ['UYU', 'USD']) {
    assert.equal(confirmFinancialCommitment(state, { commitmentId: `com-${currency}`, date: '2026-11-05' }).currency, currency);
    assert.equal(confirmExpectedIncome(state, { expectedIncomeId: `inc-${currency}`, date: '2026-11-05' }).currency, currency);
  }
  assert.equal(state.finance.transactions.length, 4);
  const balances = state.finance.accounts.map(a => a.balance), movements = structuredClone(state.finance.transactions);
  state = parseBackupJSON(JSON.stringify(state)); assertCurrencies(state);
  for (const currency of ['UYU', 'USD']) {
    confirmFinancialCommitment(state, { commitmentId: `com-${currency}`, date: '2026-11-05', targetCycle: 'once' });
    confirmExpectedIncome(state, { expectedIncomeId: `inc-${currency}`, date: '2026-11-05', targetCycle: 'once' });
    const future = cashFlowProjection(state, 30, '2026-11-05', currency);
    assert.equal(future.committed, 0); assert.equal(future.totalExpectedIncome, 0);
  }
  assert.deepEqual(state.finance.transactions, movements);
  assert.deepEqual(state.finance.accounts.map(a => a.balance), balances);
  assert.deepEqual(balances, [12799.75, 1080.5]);
});

test('cliente anterior: una omisión de moneda conocida requiere conflicto, sin borrar información local', () => {
  const state = normalizeStoredState(fixture());
  const remote = structuredClone(state);
  for (const record of [...remote.finance.commitments!, ...remote.finance.expectedIncomes!]) {
    delete record.currency; record.updatedAt = '2026-10-30T12:00:00.000Z';
  }
  const merged = mergeSyncModuleWithConflicts(state, 'finance', syncModuleData(remote, 'finance'), syncModuleData(state, 'finance'));
  assert.ok(merged.conflicts.length >= 4);
  assert.deepEqual(merged.state, state);
  assert.ok(detectFinanceSnapshotRegression(state.finance, remote.finance).length >= 4);
  assert.throws(() => mergeSyncModule(state, 'finance', syncModuleData(remote, 'finance'), syncModuleData(state, 'finance')), /moneda/i);
  assert.throws(() => mergeFinanceModule(state.finance, remote.finance, state.finance), /moneda/i);
  // The application checks snapshot integrity before automatic replacement. Explicit backup
  // restores still use the existing pure apply/normalization contract, without inferred currency.
  assert.equal(Object.hasOwn(applySyncModule(defaultState(), 'finance', syncModuleData(remote, 'finance')).finance.commitments![0], 'currency'), false);
});

test('una moneda explícita incorporada remotamente se conserva; una base conocida no puede perderse en ambos clientes', () => {
  const known = normalizeStoredState(fixture()), missing = structuredClone(known);
  for (const record of [...missing.finance.commitments!, ...missing.finance.expectedIncomes!]) delete record.currency;
  const repairedExplicitly = structuredClone(known);
  for (const record of [...repairedExplicitly.finance.commitments!, ...repairedExplicitly.finance.expectedIncomes!]) record.updatedAt = '2026-10-30T12:00:00.000Z';
  const upgraded = mergeSyncModuleWithConflicts(missing, 'finance', syncModuleData(repairedExplicitly, 'finance'), syncModuleData(missing, 'finance'));
  assert.equal(upgraded.conflicts.length, 0); assertCurrencies(upgraded.state);
  const lossy = mergeSyncModuleWithConflicts(missing, 'finance', syncModuleData(missing, 'finance'), syncModuleData(known, 'finance'));
  assert.equal(lossy.conflicts.length, 4); assert.deepEqual(lossy.state, missing);
});

test('conflictos por moneda no confunden colecciones con el mismo ID ni eliminaciones completas', () => {
  const state = normalizeStoredState(fixture()), remote = structuredClone(state);
  state.finance.expectedIncomes![0].id = state.finance.commitments![0].id;
  remote.finance.expectedIncomes![0].id = remote.finance.commitments![0].id;
  delete remote.finance.commitments![0].currency; remote.finance.expectedIncomes![0].currency = 'EUR';
  const conflicts = detectFinanceSnapshotRegression(state.finance, remote.finance);
  assert.equal(conflicts.length, 2); assert.equal(new Set(conflicts.map(c => c.id)).size, 2);
  remote.finance.commitments = []; remote.finance.expectedIncomes = [];
  assert.deepEqual(detectFinanceSnapshotRegression(state.finance, remote.finance), []);
});

for (const currency of ['EUR', 'usd', '', ' UYU ']) test(`código desconocido ${JSON.stringify(currency)} no se convierte en moneda válida`, () => {
  const raw = fixture(); raw.finance.commitments![0].currency = currency; raw.finance.expectedIncomes![0].currency = currency;
  for (const normalized of [normalizeStoredState(raw), parseBackupJSON(JSON.stringify(raw)), applySyncModule(defaultState(), 'finance', syncModuleData(raw, 'finance'))]) {
    assert.equal(normalized.finance.commitments![0].currency, currency);
    assert.equal(normalized.finance.expectedIncomes![0].currency, currency);
  }
  assert.equal(['UYU', 'USD'].includes(currency), false);
  // These values require review; this test does not certify current display fallbacks.
});

for (const schemaVersion of [undefined, 1, 2]) test(`ausencia histórica/ambigua con esquema ${schemaVersion} no se materializa como UYU`, () => {
  const raw = fixture(); raw.schemaVersion = schemaVersion as number;
  delete raw.finance.commitments![0].currency; delete raw.finance.expectedIncomes![0].currency;
  const normalized = normalizeStoredState(raw);
  assert.equal(Object.hasOwn(normalized.finance.commitments![0], 'currency'), false);
  assert.equal(Object.hasOwn(normalized.finance.expectedIncomes![0], 'currency'), false);
  assert.equal(raw.finance.commitments![0].amount, normalized.finance.commitments![0].amount);
});
