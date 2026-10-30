import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction, confirmFinancialCommitment, updateTransaction } from './financeFlows';
import { deleteFinanceDuplicate, keepFinanceDuplicateGroup } from './financeDuplicateReview';
import { deriveFinanceReviewInbox } from './financeReview';
import { calcIncomeMonth, calcNetWorth, calcSpentMonth, cashFlow30Days } from './calculations';
import { compareFinanceBalancesShadow } from './financeLedger';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { detectFinanceSnapshotRegression } from './financeSnapshotIntegrity';

function fixture() {
  const state = defaultState();
  state.finance.accounts = [{ id: 'cash', name: 'Efectivo sintético', balance: 1000, initialBalance: 1000, currency: 'UYU' }];
  state.finance.categories = [{ id: 'food', name: 'Comida', active: true }];
  state.finance.transactions = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  return state;
}
const input = (id: string, type: 'gasto' | 'ingreso' = 'gasto', date = todayISO()) => ({ id, type, amount: 200, category: 'food', accountId: 'cash', date, note: '' });
const groups = (state: ReturnType<typeof fixture>) => deriveFinanceReviewInbox(state).duplicateGroups;
function assertLedger(state: ReturnType<typeof fixture>, balance: number, expenses: number, income = 0) {
  assert.equal(state.finance.accounts[0].balance, balance);
  assert.equal(calcSpentMonth(state), expenses);
  assert.equal(calcIncomeMonth(state), income);
  assert.equal(1000 + income - expenses, balance);
  assert.equal(calcNetWorth(state), balance, 'Sin deudas ni inversiones, patrimonio igual al efectivo');
  assert.equal(cashFlow30Days(state).currentBalance, balance);
  assert.ok(compareFinanceBalancesShadow(state).every(account => account.matches));
  assert.equal(new Set(state.finance.transactions.map(tx => tx.id)).size, state.finance.transactions.length);
}

test('Simón: 800 → 600 → 400; una revisión del grupo conserva 400; eliminación exacta deja 600', () => {
  let state = fixture();
  for (let n = 1; n <= 3; n++) {
    const before = structuredClone(state.finance.transactions);
    addTransaction(state, input(`purchase-${n}`));
    assert.deepEqual(state.finance.transactions.slice(0, -1), before);
    assertLedger(state, 1000 - n * 200, n * 200);
  }
  assert.equal(groups(state).length, 1);
  assert.deepEqual(groups(state)[0].pairs.length, 3);
  const before = structuredClone(state.finance);
  keepFinanceDuplicateGroup(state, groups(state)[0].transactions);
  assertLedger(state, 400, 600);
  assert.equal(groups(state).length, 0);
  assert.deepEqual(state.finance.accounts, before.accounts);
  for (const tx of state.finance.transactions) {
    const old = before.transactions.find(item => item.id === tx.id)!;
    assert.deepEqual({ ...tx, reviewed: old.reviewed, reviewStatus: old.reviewStatus, revisionOrder: old.revisionOrder }, { ...old, reviewed: old.reviewed });
  }
  state = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.equal(groups(state).length, 0);
  assertLedger(state, 400, 600);
  const survivors = structuredClone(state.finance.transactions.filter(tx => tx.id !== 'purchase-2'));
  deleteFinanceDuplicate(state, structuredClone(state.finance.transactions.find(tx => tx.id === 'purchase-2')!));
  assert.deepEqual(state.finance.transactions, survivors);
  assertLedger(state, 600, 400);
  const after = structuredClone(state);
  assert.throws(() => deleteFinanceDuplicate(state, before.transactions[1]), /ya no existe/);
  assert.deepEqual(state, after);
});

test('dos ingresos iguales conservan ambos y eliminar uno revierte solo su ingreso', () => {
  const state = fixture();
  addTransaction(state, input('income-a', 'ingreso'));
  addTransaction(state, input('income-b', 'ingreso'));
  assertLedger(state, 1400, 0, 400);
  keepFinanceDuplicateGroup(state, groups(state)[0].transactions);
  assertLedger(state, 1400, 0, 400);
  assert.equal(groups(state).length, 0);
  deleteFinanceDuplicate(state, structuredClone(state.finance.transactions[1]));
  assertLedger(state, 1200, 0, 200);
});

test('grupos por IDs y relaciones completas: cadena de fechas, título irrelevante, tipos/cuentas/monedas separados', () => {
  const state = fixture();
  for (const [n, date] of ['2026-10-01', '2026-10-02', '2026-10-03'].entries()) addTransaction(state, { ...input(`chain-${n}`, 'gasto', date), note: `Compra distinta ${n}` });
  addTransaction(state, input('far', 'gasto', '2026-10-10'));
  addTransaction(state, input('income', 'ingreso', '2026-10-02'));
  state.finance.accounts.push({ id: 'other', name: 'Otra', balance: 0, initialBalance: 0, currency: 'UYU' });
  addTransaction(state, { ...input('other-account', 'gasto', '2026-10-02'), accountId: 'other' });
  // Simulate an old inconsistent record; normal creation correctly rejects this currency.
  const legacyCurrency = addTransaction(state, input('other-currency', 'gasto', '2026-10-02'));
  legacyCurrency.currency = 'USD';
  const result = groups(state);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].transactions.map(tx => tx.id), ['chain-0', 'chain-1', 'chain-2']);
  assert.equal(result[0].pairs.length, 2, 'La cadena no afirma que los extremos sean iguales');
  assert.equal(groups(normalizeStoredState(JSON.parse(JSON.stringify(state))))[0].id, result[0].id);
});

test('estados históricos reviewed, ignored y reviewed=true conservados; operación nueva produce solo un grupo', () => {
  const state = fixture();
  for (const id of ['a', 'b', 'c', 'd']) addTransaction(state, input(id));
  Object.assign(state.finance.transactions[0], { reviewStatus: 'reviewed', reviewed: true });
  Object.assign(state.finance.transactions[1], { reviewStatus: 'ignored', reviewed: false });
  Object.assign(state.finance.transactions[2], { reviewed: true });
  const historical = structuredClone(state.finance.transactions.slice(0, 3));
  assert.equal(groups(state).length, 1);
  assert.equal(groups(state)[0].transactions.length, 4);
  keepFinanceDuplicateGroup(state, groups(state)[0].transactions);
  assert.deepEqual(state.finance.transactions.slice(0, 3), historical);
  assert.equal(groups(state).length, 0);
  addTransaction(state, input('e'));
  assert.equal(groups(state).length, 1);
  assert.equal(groups(state)[0].transactions.length, 5);
});

test('conservar un grupo no revisa otro grupo ni una advertencia de una operación independiente', () => {
  const state = fixture();
  for (const id of ['a', 'b']) addTransaction(state, input(id));
  for (const id of ['c', 'd']) addTransaction(state, { ...input(id), amount: 100 });
  addTransaction(state, { ...input('unrelated'), amount: 51, category: 'Categoría desconocida' });
  const unrelated = structuredClone(state.finance.transactions.slice(2));
  keepFinanceDuplicateGroup(state, groups(state).find(g => g.transactions.some(tx => tx.id === 'a'))!.transactions);
  assert.deepEqual(state.finance.transactions.slice(2), unrelated);
  assert.equal(groups(state).length, 1);
  assert.ok(deriveFinanceReviewInbox(state).items.some(item => item.transaction.id === 'unrelated'));
});

test('dos clientes: revisión recibida converge; revisión simultánea conserva el conflicto seguro existente', () => {
  const base = fixture();
  for (const id of ['a', 'b', 'c']) addTransaction(base, input(id));
  const a = structuredClone(base), b = structuredClone(base);
  keepFinanceDuplicateGroup(a, groups(a)[0].transactions);
  const received = mergeSyncModuleWithConflicts(b, 'finance', syncModuleData(a, 'finance'), syncModuleData(base, 'finance'));
  assert.equal(received.conflicts.length, 0);
  assert.equal(groups(received.state).length, 0);
  assertLedger(received.state, 400, 600);
  keepFinanceDuplicateGroup(b, groups(b)[0].transactions);
  const ab = mergeSyncModuleWithConflicts(a, 'finance', syncModuleData(b, 'finance'), syncModuleData(base, 'finance'));
  const ba = mergeSyncModuleWithConflicts(b, 'finance', syncModuleData(a, 'finance'), syncModuleData(base, 'finance'));
  assert.equal(ab.conflicts.length, 3, 'Dos ediciones simultáneas mantienen el protocolo de conflicto existente');
  assert.equal(ba.conflicts.length, 3);
  assert.deepEqual(ab.state.finance, a.finance);
  assert.deepEqual(ba.state.finance, b.finance);
  assertLedger(ab.state, 400, 600);
  assert.equal(groups(ab.state).length, 0);
  assert.ok(detectFinanceSnapshotRegression(ab.state.finance, base.finance).length > 0);
  const stale = structuredClone(base);
  stale.finance.transactions.pop();
  const rejected = mergeSyncModuleWithConflicts(ab.state, 'finance', syncModuleData(stale, 'finance'), syncModuleData(ab.state, 'finance'));
  assert.ok(rejected.conflicts.length > 0);
  assert.deepEqual(rejected.state.finance, ab.state.finance);
});

test('diálogo obsoleto rechaza revisión y eliminación sin cambios parciales; un nuevo ID no se revisa implícitamente', () => {
  const state = fixture();
  for (const id of ['a', 'b']) addTransaction(state, input(id));
  const expected = structuredClone(groups(state)[0].transactions);
  updateTransaction(state, 'b', { ...input('b'), amount: 201 });
  const before = structuredClone(state);
  assert.throws(() => keepFinanceDuplicateGroup(state, expected), /cambió/);
  assert.throws(() => deleteFinanceDuplicate(state, expected[1]), /cambió/);
  assert.deepEqual(state, before);
  updateTransaction(state, 'b', input('b'));
  const pair = structuredClone(groups(state)[0].transactions);
  const third = addTransaction(state, input('c'));
  keepFinanceDuplicateGroup(state, pair);
  assert.equal(third.reviewStatus, 'pending');
  assert.equal(groups(state).length, 1);
  assert.equal(groups(state)[0].transactions.length, 3);
  assertLedger(state, 400, 600);
});

test('eliminación de obligación usa el circuito contable; comerciales y conciliaciones permanecen protegidos', () => {
  const state = fixture();
  state.finance.commitments = [{ id: 'commitment', name: 'Pago sintético', amount: 200, category: 'food', accountId: 'cash', active: true, status: 'pending', frequency: 'once', nextDueDate: todayISO() }];
  const linked = confirmFinancialCommitment(state, { commitmentId: 'commitment', date: todayISO() });
  addTransaction(state, input('ordinary'));
  assertLedger(state, 600, 400);
  deleteFinanceDuplicate(state, structuredClone(linked));
  assertLedger(state, 800, 200);
  assert.equal(state.finance.commitments[0].active, true);
  assert.equal(state.finance.commitments[0].status, 'pending');
  assert.ok(!state.finance.commitments[0].settledTxIds?.includes(linked.id));
  for (const origin of ['adjustment', 'resale_sale', 'resale_purchase'] as const) {
    const tx = addTransaction(state, input(`locked-${origin}`));
    tx.origin = origin;
    const before = structuredClone(state);
    assert.throws(() => deleteFinanceDuplicate(state, structuredClone(tx)), /conciliación|reventa/);
    assert.deepEqual(state, before);
    assert.ok(groups(state).every(g => g.transactions.every(member => member.id !== tx.id)));
  }
  const commercial = addTransaction(state, input('commercial:synthetic-payment'));
  const beforeCommercial = structuredClone(state);
  assert.throws(() => deleteFinanceDuplicate(state, structuredClone(commercial)), /Mi negocio/);
  assert.deepEqual(state, beforeCommercial);
  assert.ok(groups(state).every(g => g.transactions.every(member => member.id !== commercial.id)));
});

test('identidades repetidas persistidas no se agrupan ni permiten eliminar dos movimientos con un único ID', () => {
  const state = fixture();
  const tx = addTransaction(state, input('corrupt'));
  state.finance.transactions.push(structuredClone(tx));
  const before = structuredClone(state);
  assert.equal(groups(state).length, 0);
  assert.throws(() => deleteFinanceDuplicate(state, tx), /identidad es ambigua/);
  assert.deepEqual(state, before);
});
