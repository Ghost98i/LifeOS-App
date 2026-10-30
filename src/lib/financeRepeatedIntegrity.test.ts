import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, normalizeStoredState, todayISO } from './storage';
import { addTransaction, deleteTransaction, ignoreTransactionReview, markTransactionReviewed, reconcileAccount, rejectTransactionMatch, resolveTransactionDuplicate, updateTransaction } from './financeFlows';
import { compareFinanceBalancesShadow, reconstructAccountBalanceBeforeEvent } from './financeLedger';
import { calcAccountsTotal, calcIncomeMonth, calcNetWorth, calcSpentMonth } from './calculations';
import { deriveCashflowProjection } from './financeCashflow';
import { deriveFinanceReviewInbox } from './financeReview';
import { mergeFinanceModule, mergeModuleData } from './syncMerge';
import { mergeSyncModuleWithConflicts } from './syncModel';
import { confirmCaptureDraft, parseCaptureDrafts } from './quickCaptureDrafts';
import { decryptSyncModule, encryptSyncModule, generateMdek } from './cryptoCore';

function fixture() {
  const state = defaultState();
  state.settings.hiddenTabs = [];
  state.finance.accounts = [{ id: 'cash', name: 'Caja sintética', balance: 10000, initialBalance: 10000, currency: 'UYU' }];
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.reconciliations = [];
  state.finance.debts = [];
  state.finance.investments = [];
  state.finance.subscriptions = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  state.finance.agreements = [];
  return state;
}
const expense = () => ({ type: 'gasto' as const, amount: 500, category: 'Otros', accountId: 'cash', date: todayISO(), note: 'Almuerzo' });
function check(state: ReturnType<typeof fixture>, count: number, balance: number, spent: number, income = 0) {
  assert.equal(state.finance.transactions.length, count);
  assert.equal(state.finance.accounts[0].balance, balance);
  assert.equal(calcAccountsTotal(state, 'UYU'), balance);
  assert.equal(calcSpentMonth(state, 0, 'UYU'), spent);
  assert.equal(calcIncomeMonth(state, 0, 'UYU'), income);
  assert.equal(calcNetWorth(state, 'UYU'), balance);
  assert.equal(deriveCashflowProjection(state).summariesByCurrency.UYU.realBalance, balance);
  assert.equal(deriveCashflowProjection(state).summariesByCurrency.UYU.projectedBalance, balance);
  assert.ok(compareFinanceBalancesShadow(state).every(item => item.matches));
}

for (const type of ['gasto', 'ingreso'] as const) {
  test(`independientes idénticos: ${type}, revisión, ignorar, recarga y merge no cambian importes ni totales`, () => {
    let state = fixture();
    const a = addTransaction(state, { ...expense(), type });
    const original = structuredClone(a);
    const b = addTransaction(state, { ...expense(), type });
    assert.notEqual(a.id, b.id);
    assert.deepEqual(a, original);
    assert.ok(deriveFinanceReviewInbox(state).items.some(item => item.reasons.some(reason => reason.code === 'possible_duplicate')));
    const balance = type === 'gasto' ? 9000 : 11000;
    const spent = type === 'gasto' ? 1000 : 0;
    const income = type === 'ingreso' ? 1000 : 0;
    check(state, 2, balance, spent, income);
    markTransactionReviewed(state, b.id);
    ignoreTransactionReview(state, a.id);
    check(state, 2, balance, spent, income);
    state = normalizeStoredState(JSON.parse(JSON.stringify(state)));
    check(state, 2, balance, spent, income);
    state.finance = mergeFinanceModule(state.finance, structuredClone(state.finance));
    check(state, 2, balance, spent, income);
  });
}

test('reintento con el mismo ID técnico no se inserta dos veces ni desaparece dinero al sincronizar', () => {
  const state = fixture();
  const input = { ...expense(), id: 'operation-retry' };
  const a = addTransaction(state, input);
  const original = structuredClone(a);
  assert.equal(addTransaction(state, input), a);
  assert.deepEqual(a, original);
  check(state, 1, 9500, 500);
  state.finance = mergeFinanceModule(state.finance, structuredClone(state.finance));
  check(state, 1, 9500, 500);
  assert.throws(() => addTransaction(state, { ...input, amount: 700 }), /identidad|identificador|ID/);
  check(state, 1, 9500, 500);
});

test('reconfirmar un borrador es idempotente; otra captura idéntica es independiente', () => {
  const state = fixture();
  const [a] = parseCaptureDrafts('gaste 500 almuerzo', state);
  assert.equal(a.kind, 'finance');
  confirmCaptureDraft(state, a);
  confirmCaptureDraft(state, a);
  check(state, 1, 9500, 500);
  const [b] = parseCaptureDrafts('gaste 500 almuerzo', state);
  assert.notEqual(a.id, b.id);
  confirmCaptureDraft(state, b);
  check(state, 2, 9000, 1000);
});

test('sucesivos, retroactivo, edición y eliminación solo cambian el movimiento elegido', () => {
  const state = fixture();
  const a = addTransaction(state, expense());
  check(state, 1, 9500, 500);
  const original = structuredClone(a);
  const b = addTransaction(state, expense());
  check(state, 2, 9000, 1000);
  assert.deepEqual(a, original);
  const priorDate = `${todayISO().slice(0, 8)}01`;
  const backdated = addTransaction(state, { ...expense(), date: priorDate });
  check(state, 3, 8500, 1500);
  assert.deepEqual(a, original);
  assert.equal(reconstructAccountBalanceBeforeEvent(state.finance.accounts[0], a.id, state.finance.transactions), 9500);
  const bOriginal = structuredClone(b);
  updateTransaction(state, backdated.id, { ...expense(), amount: 700, date: priorDate });
  check(state, 3, 8300, 1700);
  assert.deepEqual(a, original);
  assert.deepEqual(b, bOriginal);
  deleteTransaction(state, backdated.id);
  deleteTransaction(state, backdated.id);
  check(state, 2, 9000, 1000);
});

test('eliminar duplicado explícitamente revierte solo uno; revisar no acepta un pago nuevo', () => {
  const state = fixture();
  const a = addTransaction(state, expense());
  const b = addTransaction(state, expense());
  markTransactionReviewed(state, b.id);
  check(state, 2, 9000, 1000);
  resolveTransactionDuplicate(state, b.id, a.id);
  check(state, 1, 9500, 500);
});

test('dos clientes con operaciones idénticas y revisión obsoleta preservan ambos IDs y la edición', () => {
  const state = fixture();
  const a = addTransaction(state, expense());
  const base = structuredClone(state.finance);
  const left = structuredClone(state);
  const right = structuredClone(state);
  updateTransaction(left, a.id, { ...expense(), amount: 700 });
  addTransaction(left, expense());
  addTransaction(right, expense());
  const conflicts: unknown[] = [];
  const merged = mergeFinanceModule(left.finance, right.finance, base, {}, conflict => conflicts.push(conflict));
  state.finance = merged;
  check(state, 3, 8300, 1700);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(merged, mergeFinanceModule(right.finance, left.finance, base));
  state.finance = mergeFinanceModule(merged, base, base);
  check(state, 3, 8300, 1700);
});

test('conciliación es ancla: retroactivo afecta flujo histórico pero no reemplaza el saldo declarado', () => {
  const state = fixture();
  const a = addTransaction(state, { ...expense(), date: '2026-09-01' });
  const original = structuredClone(a);
  reconcileAccount(state, { accountId: 'cash', actualBalance: 9000, date: '2026-09-02' });
  addTransaction(state, { ...expense(), date: '2026-09-01' });
  assert.equal(state.finance.accounts[0].balance, 9000);
  assert.deepEqual(a, original);
  assert.ok(compareFinanceBalancesShadow(state)[0].matches);
});

test('datos históricos sin metadatos y roundtrip cifrado conservan exactamente los movimientos', async () => {
  const state = fixture();
  state.finance.transactions = ['old-a', 'old-b'].map(id => ({ ...expense(), id, fixed: 'variable' }));
  state.finance.accounts[0].balance = 9000;
  const before = structuredClone(state.finance.transactions);
  const normalized = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(normalized.finance.transactions, before);
  const key = await generateMdek();
  const encrypted = await encryptSyncModule({ finance: normalized.finance }, key, 'finance', 'synthetic-user');
  const decoded = await decryptSyncModule(encrypted, key, 'finance', 'synthetic-user') as { finance: typeof state.finance };
  state.finance = decoded.finance;
  check(state, 2, 9000, 1000);
  assert.deepEqual(state.finance.transactions, before);
});

test('borrador no confirmado, validación fallida y rechazo de sugerencia no producen un pago', () => {
  const state = fixture();
  parseCaptureDrafts('gaste 500 almuerzo', state);
  check(state, 0, 10000, 0);
  assert.throws(() => addTransaction(state, { ...expense(), accountId: 'missing' }));
  check(state, 0, 10000, 0);
  const tx = addTransaction(state, expense());
  state.finance.commitments.push({ id: 'suggestion', name: 'Posible pago', amount: 500, category: 'Otros', frequency: 'once', nextDueDate: todayISO(), active: true });
  rejectTransactionMatch(state, tx.id, 'suggestion', 'once');
  assert.equal(state.finance.accounts[0].balance, 9500);
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.commitments[0].active, true);
});

test('colisiones históricas de ID se bloquean sin reparar ni borrar movimientos', () => {
  const state = fixture();
  const a = addTransaction(state, expense());
  state.finance.transactions.push(structuredClone(a));
  state.finance.accounts[0].balance = 9000;
  const original = structuredClone(state);
  assert.throws(() => addTransaction(state, expense()), /mismo ID/);
  assert.throws(() => mergeFinanceModule(state.finance, state.finance), /ID financiero repetido/);
  assert.throws(() => mergeModuleData('finance', { finance: state.finance }, { finance: state.finance }), /ID repetido/);
  const conflicts: unknown[] = [];
  mergeFinanceModule(state.finance, state.finance, undefined, {}, item => conflicts.push(item));
  assert.equal(conflicts.length, 1);
  const guarded = mergeSyncModuleWithConflicts(state, 'finance', { finance: state.finance });
  assert.equal(guarded.conflicts.length, 1);
  assert.equal(guarded.state, state, 'No entregar como aplicable una versión colapsada por ID');
  assert.deepEqual(state, original);
});

test('cuenta histórica sin saldo inicial conserva saldo e IDs al normalizar y agregar otra operación', () => {
  const state = fixture();
  state.finance.transactions = ['legacy-a', 'legacy-b'].map(id => ({ ...expense(), id, fixed: 'variable' }));
  state.finance.accounts[0].balance = 9000;
  delete state.finance.accounts[0].initialBalance;
  const before = structuredClone(state.finance.transactions);
  const normalized = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  check(normalized, 2, 9000, 1000);
  addTransaction(normalized, expense());
  check(normalized, 3, 8500, 1500);
  assert.deepEqual(normalized.finance.transactions.slice(0, 2), before);
});

test('revisión basada en datos obsoletos frente a edición monetaria se informa como conflicto', () => {
  const state = fixture();
  const tx = addTransaction(state, expense());
  const base = structuredClone(state.finance);
  const edited = structuredClone(state);
  const reviewed = structuredClone(state);
  updateTransaction(edited, tx.id, { ...expense(), amount: 700 });
  markTransactionReviewed(reviewed, tx.id);
  const before = structuredClone([edited, reviewed]);
  const conflicts: unknown[] = [];
  mergeFinanceModule(edited.finance, reviewed.finance, base, {}, item => conflicts.push(item));
  assert.equal(conflicts.length, 1, 'La app debe detener la fusión y conservar ambas versiones');
  assert.deepEqual([edited, reviewed], before);
  assert.equal(edited.finance.accounts[0].balance, 9300);
  assert.equal(reviewed.finance.accounts[0].balance, 9500);
});

test('mismo nombre e importe en fechas distintas mantiene operaciones y flujo mensual separado', () => {
  const state = fixture();
  addTransaction(state, { ...expense(), date: '2020-01-01' });
  addTransaction(state, expense());
  check(state, 2, 9000, 500);
  assert.equal(deriveFinanceReviewInbox(state).items.some(item => item.reasons.some(reason => reason.code === 'possible_duplicate')), false);
});

test('saldo real, disponible, proyección y patrimonio tienen contratos diferentes', () => {
  const state = fixture();
  addTransaction(state, expense());
  addTransaction(state, expense());
  state.finance.commitments.push({ id: 'future-expense', name: 'Pendiente', amount: 2000, category: 'Otros', frequency: 'once', nextDueDate: todayISO(), active: true });
  state.finance.expectedIncomes.push({ id: 'future-income', name: 'Por cobrar', amount: 3000, frequency: 'once', startDate: todayISO(), active: true });
  state.finance.investments.push({ id: 'investment', name: 'Inversión', amount: 4000 });
  const summary = deriveCashflowProjection(state).summariesByCurrency.UYU;
  assert.equal(summary.realBalance, 9000);
  assert.equal(summary.availableAfterCommitments, 7000);
  assert.equal(summary.projectedBalance, 10000);
  assert.equal(calcNetWorth(state), 13000);
  assert.equal(calcSpentMonth(state), 1000);
  assert.equal(calcIncomeMonth(state), 0);
});
