import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account, AccountReconciliation, FinanceTransfer, LifeOSState, Transaction } from '../types';
import {
  compareLedgerEvents,
  compareMaterializedBalanceShadow,
  createEffectiveOrder,
  createEffectiveOrderAfter,
  nextFinanceEffectiveOrder,
  reconstructAccountBalance,
} from './financeLedger';

const account = (balance = 1000): Account => ({ id: 'account-1', name: 'Cuenta', balance, initialBalance: 1000 });
const tx = (id: string, type: Transaction['type'], amount: number, effectiveOrder?: string, origin?: Transaction['origin']): Transaction => ({
  id, type, amount, category: 'Varios', fixed: 'variable', date: '2026-10-07', accountId: 'account-1', effectiveOrder, origin,
});
const transfer = (id: string, fromAccountId: string, toAccountId: string, amount: number, effectiveOrder?: string): FinanceTransfer => ({
  id, fromAccountId, toAccountId, amount, date: '2026-10-07', effectiveOrder,
});
const reconciliation = (id: string, actualBalance: number, effectiveOrder?: string, adjustmentTxId?: string): AccountReconciliation => ({
  id, accountId: 'account-1', actualBalance, systemBalance: 1000, difference: actualBalance - 1000,
  date: '2026-10-07', effectiveOrder, adjustmentTxId,
});

const order = (n: number) => `v1-0000000001-${String(n).padStart(6, '0')}-test-${n}`;

test('gasto seguido por conciliación el mismo día termina en el ancla', () => {
  const result = reconstructAccountBalance(account(), [tx('tx-1', 'gasto', 200, order(1))], [], [reconciliation('rec-1', 800, order(2))]);
  assert.equal(result.balance, 800);
});

test('conciliación seguida por gasto el mismo día aplica el gasto después del ancla', () => {
  const result = reconstructAccountBalance(account(), [tx('tx-1', 'gasto', 200, order(2))], [], [reconciliation('rec-1', 1000, order(1))]);
  assert.equal(result.balance, 800);
});

test('gasto, conciliación e ingreso respetan el orden intradía', () => {
  const result = reconstructAccountBalance(
    account(),
    [tx('expense', 'gasto', 200, order(1)), tx('income', 'ingreso', 100, order(3))],
    [],
    [reconciliation('rec-1', 800, order(2))],
  );
  assert.equal(result.balance, 900);
});

test('dos conciliaciones del mismo día usan la última posición contable', () => {
  const result = reconstructAccountBalance(account(), [], [], [
    reconciliation('rec-1', 900, order(1)),
    reconciliation('rec-2', 850, order(2)),
  ]);
  assert.equal(result.balance, 850);
});

test('múltiples movimientos alrededor de una conciliación sólo aplican los posteriores sobre el ancla', () => {
  const result = reconstructAccountBalance(account(), [
    tx('expense-before', 'gasto', 120, order(1)),
    tx('income-before', 'ingreso', 20, order(2)),
    tx('expense-after', 'gasto', 50, order(4)),
    tx('income-after', 'ingreso', 10, order(5)),
  ], [], [reconciliation('rec-1', 900, order(3))]);
  assert.equal(result.balance, 860);
});

test('transferencias anteriores y posteriores a una conciliación respetan el ancla', () => {
  const result = reconstructAccountBalance(account(), [], [
    transfer('out-before', 'account-1', 'account-2', 100, order(1)),
    transfer('in-after', 'account-2', 'account-1', 50, order(3)),
  ], [reconciliation('rec-1', 900, order(2))]);
  assert.equal(result.balance, 950);
});

test('permutar arrays no altera el saldo reconstruido ni el diagnóstico', () => {
  const transactions = [tx('a', 'gasto', 100, order(1)), tx('b', 'ingreso', 40, order(4))];
  const transfers = [transfer('c', 'account-2', 'account-1', 25, order(5))];
  const reconciliations = [reconciliation('d', 900, order(3)), reconciliation('e', 850, order(2))];
  const normal = reconstructAccountBalance(account(), transactions, transfers, reconciliations);
  const shuffled = reconstructAccountBalance(account(), [...transactions].reverse(), [...transfers].reverse(), [...reconciliations].reverse());
  assert.deepEqual(shuffled, normal);
});

test('legacy queda antes de conciliación legacy y eventos nuevos quedan después del bloque legacy', () => {
  const result = reconstructAccountBalance(
    account(),
    [tx('legacy-expense', 'gasto', 100), tx('new-income', 'ingreso', 50, order(1))],
    [],
    [reconciliation('legacy-reconciliation', 900)],
  );
  assert.equal(result.balance, 950);
  assert.deepEqual(result.orderedEventIds, ['legacy-expense', 'legacy-reconciliation', 'new-income']);
});

test('dos conciliaciones legacy del mismo día producen diagnóstico ambiguo y resultado determinista', () => {
  const first = reconciliation('legacy-a', 900);
  const second = reconciliation('legacy-b', 850);
  const normal = reconstructAccountBalance(account(), [], [], [first, second]);
  const reversed = reconstructAccountBalance(account(), [], [], [second, first]);
  assert.equal(normal.balance, 850);
  assert.deepEqual(reversed, normal);
  assert.deepEqual(normal.ambiguities, [{
    type: 'multiple_legacy_reconciliations_same_date',
    accountId: 'account-1',
    date: '2026-10-07',
    reconciliationIds: ['legacy-a', 'legacy-b'],
  }]);
});

test('ajustes de conciliación no vuelven a aplicar el efecto económico del ancla', () => {
  const result = reconstructAccountBalance(
    account(),
    [tx('adjustment', 'gasto', 200, order(2), 'adjustment')],
    [],
    [reconciliation('rec-1', 800, order(1), 'adjustment')],
  );
  assert.equal(result.balance, 800);
  assert.deepEqual(result.excludedAdjustmentIds, ['adjustment']);
});

test('un adjustment sin vínculo inequívoco conserva su efecto y queda diagnosticado', () => {
  const result = reconstructAccountBalance(
    account(),
    [tx('orphan-adjustment', 'ingreso', 50, order(1), 'adjustment')],
  );
  assert.equal(result.balance, 1050);
  assert.deepEqual(result.excludedAdjustmentIds, []);
  assert.deepEqual(result.unlinkedAdjustmentIds, ['orphan-adjustment']);
});

test('la reconstrucción conserva date y no depende del timezone del proceso', () => {
  const originalTz = process.env.TZ;
  const events = [tx('tx-1', 'gasto', 200, order(2))];
  const reconciliations = [reconciliation('rec-1', 1000, order(1))];
  process.env.TZ = 'Pacific/Kiritimati';
  const east = reconstructAccountBalance(account(), events, [], reconciliations);
  process.env.TZ = 'America/Montevideo';
  const west = reconstructAccountBalance(account(), events, [], reconciliations);
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  assert.deepEqual(west, east);
  assert.equal(events[0].date, '2026-10-07');
});

test('claves offline muy próximas son únicas, lexicales y monotónicas dentro del proceso', () => {
  const keys = Array.from({ length: 10_000 }, (_, index) => createEffectiveOrder(1_800_000_000_000, `random-${index}`));
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...keys].sort(), keys);
});

test('reinicio con clock rollback genera una clave posterior al máximo persistido', () => {
  const persisted = 'v1-00zzzzzzzz-00000z-persisted';
  const next = createEffectiveOrderAfter(persisted, 1, 'after-restart');
  assert.ok(next > persisted);

  const state = {
    finance: {
      transactions: [{ ...tx('persisted', 'gasto', 1, persisted), date: '2026-10-07' }],
      transfers: [],
      reconciliations: [],
    },
  } as LifeOSState;
  const afterPersistedDayMaximum = nextFinanceEffectiveOrder(state, '2026-10-07', 1, 'product-path');
  assert.ok(afterPersistedDayMaximum > persisted);
});

test('comparador usa date, política legacy, effectiveOrder y desempate estable sin mutar entradas', () => {
  const legacyTx = { kind: 'transaction' as const, id: 'b', date: '2026-10-07', effectiveOrder: undefined };
  const legacyRec = { kind: 'reconciliation' as const, id: 'a', date: '2026-10-07', effectiveOrder: undefined };
  const newer = { kind: 'transaction' as const, id: 'a', date: '2026-10-08', effectiveOrder: order(1) };
  const events = [newer, legacyRec, legacyTx];
  assert.deepEqual([...events].sort(compareLedgerEvents).map((event) => event.id), ['b', 'a', 'a']);
  assert.equal(events[0], newer);
});

test('modo sombra compara sin modificar Account.balance', () => {
  const current = account(1000);
  const comparison = compareMaterializedBalanceShadow(
    current,
    [tx('tx-1', 'gasto', 200, order(2))],
    [],
    [reconciliation('rec-1', 1000, order(1))],
  );
  assert.equal(current.balance, 1000);
  assert.equal(comparison.materializedBalance, 1000);
  assert.equal(comparison.reconstructedBalance, 800);
  assert.equal(comparison.difference, -200);
  assert.equal(comparison.matches, false);
});
