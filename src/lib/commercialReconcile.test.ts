import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCommercialSets } from './commercialReconcile';
import type { CommercialSet } from './commercialContract';

const base = (): CommercialSet => ({ items: [{ id: 'pan', name: 'Pan', unit: 'unit' }],
  operations: [{ id: 'buy', kind: 'receipt', status: 'closed', commercialDate: '2026-10-22', effectiveOrder: '001' }],
  movements: [{ id: 'in', operationId: 'buy', itemId: 'pan', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 10000 }] });
const empty = (): CommercialSet => ({ items: [], operations: [], movements: [] });
const sale = (id: string, order: string, quantity: number, costCents: number): CommercialSet => ({ items: [],
  operations: [{ id, kind: 'sale', status: 'closed', commercialDate: '2026-10-22', effectiveOrder: order }],
  movements: [{ id: `${id}-stock`, operationId: id, itemId: 'pan', kind: 'sale', quantity, unit: 'unit', costCents }] });

test('idénticas y reintento idéntico no duplican', () => {
  const a = base();
  const result = reconcileCommercialSets(a, structuredClone(a));
  assert.equal(result.status, 'combined');
  if (result.status === 'combined') assert.deepEqual(result.combined, a);
});

test('operaciones distintas compatibles y llegada invertida son deterministas', () => {
  const a = base();
  const b = sale('sell', '002', 4, 4000);
  const forward = reconcileCommercialSets(a, b);
  const reverse = reconcileCommercialSets(b, a);
  assert.equal(forward.status, 'combined');
  assert.deepEqual(reverse, forward);
});

test('dos compras legítimas del mismo día y misma clave no bloquean', () => {
  const a = base();
  const b: CommercialSet = { items: [], operations: [{ id: 'buy2', kind: 'receipt', status: 'closed', commercialDate: '2026-10-22', effectiveOrder: '001' }],
    movements: [{ id: 'in2', operationId: 'buy2', itemId: 'pan', kind: 'receipt', quantity: 5, unit: 'unit', costCents: 7500 }] };
  assert.equal(reconcileCommercialSets(a, b).status, 'combined');
});

test('mismo ID diferente bloquea y conserva ambas versiones originales sin mutar entradas', () => {
  const a = base();
  const b = structuredClone(a);
  b.movements[0].costCents = 20000;
  const beforeA = JSON.stringify(a);
  const beforeB = JSON.stringify(b);
  const result = reconcileCommercialSets(a, b);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') {
    assert.ok(result.issues.some((issue) => issue.code === 'same_id_different_content' && issue.id === 'in'));
    assert.deepEqual(result.left, a);
    assert.deepEqual(result.right, b);
  }
  assert.equal(JSON.stringify(a), beforeA);
  assert.equal(JSON.stringify(b), beforeB);
});

test('dos salidas concurrentes exceden stock y bloquean el conjunto completo', () => {
  const a = base();
  const b = sale('sell1', '002', 6, 6000);
  const c = sale('sell2', '003', 6, 6000);
  const first = reconcileCommercialSets(a, b);
  assert.equal(first.status, 'combined');
  if (first.status !== 'combined') return;
  const result = reconcileCommercialSets(first.combined, c);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.ok(result.issues.some((issue) => issue.code === 'insufficient_stock'));
});

test('referencias inexistentes y costo histórico incompatible bloquean', () => {
  const orphan = sale('sell', '002', 1, 1000);
  assert.ok(reconcileCommercialSets(empty(), orphan).status === 'blocked');
  const wrong = sale('sell', '002', 1, 999);
  const result = reconcileCommercialSets(base(), wrong);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.ok(result.issues.some((issue) => issue.code === 'historical_cost_mismatch'));
});

test('orden ambiguo con salida bloquea aunque IDs den desempate', () => {
  const result = reconcileCommercialSets(base(), sale('sell', '001', 1, 1000));
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.ok(result.issues.some((issue) => issue.code === 'shared_effective_order'));
});

test('operación recibida fuera de orden que cambia costo histórico bloquea', () => {
  const initial = reconcileCommercialSets(base(), sale('sell', '003', 5, 5000));
  assert.equal(initial.status, 'combined');
  if (initial.status !== 'combined') return;
  const late: CommercialSet = { items: [], operations: [{ id: 'late', kind: 'receipt', status: 'closed', effectiveOrder: '002' }],
    movements: [{ id: 'late-in', operationId: 'late', itemId: 'pan', kind: 'receipt', quantity: 10, unit: 'unit', costCents: 30000 }] };
  const result = reconcileCommercialSets(initial.combined, late);
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') assert.ok(result.issues.some((issue) => issue.code === 'historical_cost_mismatch'));
});
