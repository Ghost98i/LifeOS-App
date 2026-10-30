import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, todayISO } from './storage';
import { addTransaction, deleteTransaction, updateTransaction } from './financeFlows';
import { reconcileFinancePublication } from './financeSyncReconciliation';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { compareFinanceBalancesShadow } from './financeLedger';
import { nextFinanceDeletionTimestamp } from './financeRevision';
import { cloudStatusWithLocalChanges } from './cloudSync';

function fixture() {
  const state = defaultState();
  state.finance.accounts = [{ id: 'cash', name: 'Prueba sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
  state.finance.transactions = [];
  for (let n = 1; n <= 3; n++) addTransaction(state, input(`shared-${n}`));
  return state;
}
function input(id: string, amount = 200) { return { id, amount, type: 'gasto' as const, category: 'Comida', accountId: 'cash', date: todayISO(), note: '' }; }
const data = (state: ReturnType<typeof fixture>) => syncModuleData(state, 'finance');

test('reconexión: dos gastos idénticos nuevos producen cinco IDs y baseline confirmado de cuatro', () => {
  const base = fixture(), a = structuredClone(base), b = structuredClone(base);
  addTransaction(a, input('offline-a'));
  addTransaction(b, input('online-b'));
  const result = reconcileFinancePublication(a, data(b), 'server-four', data(base), {});
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.state.finance.transactions.length, 5);
  assert.equal(result.state.finance.accounts[0].balance, 0);
  assert.ok(compareFinanceBalancesShadow(result.state).every(account => account.matches));
  assert.equal(result.needsUpload, true);
  assert.deepEqual(result.confirmed.data, data(b));
  assert.equal(result.confirmed.revision, 'server-four');
  assert.equal(cloudStatusWithLocalChanges('synced', { queued: result.needsUpload, pending: false, failed: false, blocked: false }), 'saving');
  assert.equal(a.finance.transactions.length, 4, 'La reconciliación no modifica la entrada');
  // This is the previous App bug: promoting the union to baseline invents a
  // server acknowledgement for offline-a and triggers a false missing conflict.
  const poisoned = mergeSyncModuleWithConflicts(result.state, 'finance', data(b), data(result.state));
  assert.ok(poisoned.conflicts.some(conflict => conflict.id === 'conflict-finance-missing-offline-a'));
  const repeated = reconcileFinancePublication(result.state, data(b), 'server-four-again', result.confirmed.data, {});
  assert.equal(repeated.conflicts.length, 0);
  assert.equal(repeated.needsUpload, true);
  assert.deepEqual(repeated.state.finance.transactions, result.state.finance.transactions);
  assert.equal(repeated.state.finance.accounts[0].balance, 0);
  const confirmed = reconcileFinancePublication(repeated.state, data(repeated.state), 'server-five', repeated.confirmed.data, {});
  assert.equal(confirmed.conflicts.length, 0);
  assert.equal(confirmed.needsUpload, false);
});

test('baseline remoto coherente conserva una edición local pendiente durante heads repetidos', () => {
  const base = fixture(), a = structuredClone(base), b = structuredClone(base);
  updateTransaction(a, 'shared-1', input('shared-1', 250));
  addTransaction(b, input('online-b'));
  const first = reconcileFinancePublication(a, data(b), 'new-remote', data(base), {});
  assert.equal(first.conflicts.length, 0);
  const repeated = reconcileFinancePublication(first.state, data(b), 'new-remote-again', first.confirmed.data, {});
  assert.equal(repeated.conflicts.length, 0);
  assert.equal(repeated.state.finance.transactions.find(tx => tx.id === 'shared-1')?.amount, 250);
  assert.equal(repeated.state.finance.accounts[0].balance, 150);
  assert.equal(repeated.needsUpload, true);
});

test('ediciones realmente incompatibles mantienen ambas versiones y el estado local intacto', () => {
  const base = fixture(), a = structuredClone(base), b = structuredClone(base);
  updateTransaction(a, 'shared-1', input('shared-1', 250));
  updateTransaction(b, 'shared-1', input('shared-1', 300));
  const before = structuredClone(a);
  const result = reconcileFinancePublication(a, data(b), 'edited-remote', data(base), {});
  assert.ok(result.conflicts.some(conflict => conflict.entityId === 'shared-1'));
  assert.deepEqual(result.state, before);
  assert.equal(result.needsUpload, false);
  assert.ok(result.conflicts.every(conflict => conflict.localValue && conflict.remoteValue));
});

test('tombstone explícito y gasto nuevo independiente convergen sin resucitar ni volver a aplicar importes', () => {
  const base = fixture(), a = structuredClone(base), b = structuredClone(base);
  addTransaction(a, input('offline-a'));
  const markers = { 'shared-1': nextFinanceDeletionTimestamp(b, 'shared-1') };
  deleteTransaction(b, 'shared-1');
  const result = reconcileFinancePublication(a, data(b), 'deleted-remote', data(base), markers);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.state.finance.transactions.map(tx => tx.id).sort(), ['offline-a', 'shared-2', 'shared-3']);
  assert.equal(result.state.finance.accounts[0].balance, 400);
  const again = reconcileFinancePublication(result.state, data(b), 'deleted-again', result.confirmed.data, markers);
  assert.equal(again.conflicts.length, 0);
  assert.deepEqual(again.state.finance, result.state.finance);
});

test('ausencia sin tombstone conserva la protección: no es una eliminación financiera válida', () => {
  const base = fixture(), a = structuredClone(base), b = structuredClone(base);
  addTransaction(a, input('offline-a'));
  deleteTransaction(b, 'shared-1');
  const result = reconcileFinancePublication(a, data(b), 'unsafe-remote', data(base), {});
  assert.ok(result.conflicts.some(conflict => conflict.id === 'conflict-finance-missing-shared-1'));
  assert.deepEqual(result.state, a);
  assert.equal(result.needsUpload, false);
});
