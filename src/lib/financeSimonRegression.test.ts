import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction, deleteTransaction, markTransactionReviewed, updateTransaction } from './financeFlows';
import { compareFinanceBalancesShadow } from './financeLedger';
import { calcSpentMonth } from './calculations';
import { deriveFinanceReviewInbox } from './financeReview';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { detectFinanceSnapshotRegression } from './financeSnapshotIntegrity';
import { nextFinanceDeletionTimestamp } from './financeRevision';

function fixture() {
  const state = defaultState();
  state.finance.accounts = [{ id: 'simon-synthetic', name: 'Cuenta sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
  state.finance.categories = [{ id: 'food', name: 'Comida', active: true }];
  state.finance.transactions = [];
  return state;
}
const input = () => ({ type: 'gasto' as const, amount: 200, category: 'food', accountId: 'simon-synthetic', date: todayISO(), note: '' });
function check(state: ReturnType<typeof fixture>, count: number) {
  assert.equal(state.finance.transactions.length, count);
  assert.equal(new Set(state.finance.transactions.map(tx => tx.id)).size, count);
  assert.ok(state.finance.transactions.every(tx => tx.amount === 200 && tx.note === '' && tx.category === 'food'));
  assert.equal(state.finance.accounts[0].balance, 1000 - 200 * count);
  assert.equal(calcSpentMonth(state), 200 * count);
  assert.ok(compareFinanceBalancesShadow(state)[0].matches);
}

test('Simón sintético: tres gastos sin descripción, conservar, recargar y fusionar mantienen 800 → 600 → 400', () => {
  let state = fixture();
  let peer = structuredClone(state);
  for (let count = 1; count <= 3; count++) {
    const base = structuredClone(syncModuleData(state, 'finance'));
    const previous = structuredClone(state.finance.transactions);
    const tx = addTransaction(state, input());
    check(state, count);
    assert.deepEqual(state.finance.transactions.slice(0, -1), previous);
    state = normalizeStoredState(JSON.parse(JSON.stringify(state)));
    check(state, count);
    const received = mergeSyncModuleWithConflicts(peer, 'finance', syncModuleData(state, 'finance'), base);
    assert.equal(received.conflicts.length, 0);
    peer = received.state;
    check(peer, count);
    if (count > 1) assert.ok(deriveFinanceReviewInbox(state).items.find(item => item.transaction.id === tx.id)?.reasons.some(reason => reason.code === 'possible_duplicate'));
    const original = structuredClone(state.finance.transactions);
    markTransactionReviewed(state, tx.id);
    check(state, count);
    state.finance.transactions.forEach((item, index) => {
      assert.equal(item.id, original[index].id);
      assert.equal(item.amount, original[index].amount);
      assert.equal(item.date, original[index].date);
    });
    const reviewed = mergeSyncModuleWithConflicts(peer, 'finance', syncModuleData(state, 'finance'), syncModuleData(peer, 'finance'));
    assert.equal(reviewed.conflicts.length, 0);
    peer = normalizeStoredState(JSON.parse(JSON.stringify(reviewed.state)));
    state = structuredClone(peer);
    check(state, count);
  }
});

test('recepción directa de una instantánea obsoleta se bloquea aunque no existan cambios locales pendientes', () => {
  const state = fixture();
  const empty = structuredClone(state);
  addTransaction(state, input());
  const one = structuredClone(state);
  const second = addTransaction(state, input());
  markTransactionReviewed(state, second.id);
  const before = structuredClone(state);
  assert.equal(detectFinanceSnapshotRegression(state.finance, one.finance).length, 1);
  assert.equal(detectFinanceSnapshotRegression(state.finance, empty.finance).length, 2);
  assert.equal(detectFinanceSnapshotRegression(one.finance, state.finance).length, 0, 'Operación nueva legítima');
  assert.deepEqual(state, before);
  check(state, 2);
});

test('eliminación con tombstone vigente se acepta una vez y una instantánea anterior no la resucita', () => {
  const state = fixture();
  const tx = addTransaction(state, input());
  const old = structuredClone(state);
  const tombstones = { [tx.id]: nextFinanceDeletionTimestamp(state, tx.id) };
  deleteTransaction(state, tx.id);
  assert.equal(detectFinanceSnapshotRegression(old.finance, state.finance, tombstones).length, 0);
  assert.equal(detectFinanceSnapshotRegression(state.finance, old.finance, tombstones).length, 1);
});

test('una revisión o edición obsoleta y un saldo ajeno al libro se detectan sin alterar los datos', () => {
  const state = fixture();
  const tx = addTransaction(state, input());
  const old = structuredClone(state);
  markTransactionReviewed(state, tx.id);
  assert.equal(detectFinanceSnapshotRegression(state.finance, old.finance).length, 1);
  updateTransaction(state, tx.id, { ...input(), amount: 300 });
  assert.ok(detectFinanceSnapshotRegression(state.finance, old.finance).length > 0);
  const badBalance = structuredClone(state);
  badBalance.finance.accounts[0].balance = 1000;
  assert.equal(detectFinanceSnapshotRegression(state.finance, badBalance.finance).length, 1);
  assert.equal(state.finance.accounts[0].balance, 700);
});

test('una instantánea anterior sin tombstone no equivale a eliminar el gasto ya revisado', () => {
  const state = fixture();
  addTransaction(state, input());
  const stale = structuredClone(state);
  const second = addTransaction(state, input());
  markTransactionReviewed(state, second.id);
  const acknowledged = syncModuleData(structuredClone(state), 'finance');
  const original = structuredClone(state);
  const result = mergeSyncModuleWithConflicts(state, 'finance', syncModuleData(stale, 'finance'), acknowledged);
  assert.ok(result.conflicts.length > 0, 'Una ausencia sin evidencia de eliminación debe requerir revisión');
  check(result.state, 2);
  assert.deepEqual(state, original);
});
