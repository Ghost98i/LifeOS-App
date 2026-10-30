import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCommercialSet, type CommercialSet } from './commercialContract';

const fixture = (): CommercialSet => ({
  items: [{ id: 'pan', name: 'Pan', unit: 'unit' }],
  operations: [
    { id: 'buy', kind: 'receipt', status: 'closed', effectiveOrder: '001' },
    { id: 'eat', kind: 'consumption', status: 'closed', effectiveOrder: '002' },
    { id: 'waste', kind: 'waste', status: 'closed', effectiveOrder: '003' },
  ],
  movements: [
    { id: 'm1', operationId: 'buy', itemId: 'pan', kind: 'receipt', quantity: 20, unit: 'unit', costCents: 60000 },
    { id: 'm2', operationId: 'eat', itemId: 'pan', kind: 'consumption', quantity: 12, unit: 'unit', costCents: 36000 },
    { id: 'm3', operationId: 'waste', itemId: 'pan', kind: 'waste', quantity: 3, unit: 'unit', costCents: 9000 },
  ],
});

test('contrato válido y mismo resultado con arreglos recibidos en otro orden', () => {
  const set = fixture();
  const before = JSON.stringify(set);
  assert.deepEqual(validateCommercialSet(set), { valid: true, issues: [] });
  assert.deepEqual(validateCommercialSet({ ...set, operations: [...set.operations].reverse(), movements: [...set.movements].reverse() }), { valid: true, issues: [] });
  assert.equal(JSON.stringify(set), before);
});

test('IDs duplicados y referencias ausentes son errores estructurales', () => {
  const set = fixture();
  set.movements.push({ ...set.movements[1] });
  set.movements.push({ ...set.movements[2], id: 'orphan', operationId: 'missing', itemId: 'missing' });
  const codes = validateCommercialSet(set).issues.map((issue) => issue.code);
  assert.ok(codes.includes('duplicate_id'));
  assert.ok(codes.includes('missing_operation'));
  assert.ok(codes.includes('missing_item'));
});

test('unidad incompatible, cantidad inválida y costo histórico ausente', () => {
  const set = fixture();
  set.movements[1].unit = 'kg';
  set.movements[1].quantity = -1;
  delete set.movements[1].costCents;
  const codes = validateCommercialSet(set).issues.map((issue) => issue.code);
  assert.ok(codes.includes('incompatible_unit'));
  assert.ok(codes.includes('invalid_quantity'));
  assert.ok(codes.includes('missing_historical_cost'));
});

test('salida superior a stock y costo histórico diferente quedan identificados', () => {
  const excess = fixture();
  excess.movements[1].quantity = 21;
  assert.ok(validateCommercialSet(excess).issues.some((issue) => issue.code === 'insufficient_stock'));
  const changed = fixture();
  changed.movements[0].costCents = 80000;
  assert.ok(validateCommercialSet(changed).issues.some((issue) => issue.code === 'historical_cost_mismatch' && issue.category === 'conflict'));
  assert.equal(changed.movements[1].costCents, 36000);
});

test('orden efectivo compartido se señala aunque el desempate sea determinista', () => {
  const set = fixture();
  set.operations[2].effectiveOrder = '002';
  assert.ok(validateCommercialSet(set).issues.some((issue) => issue.code === 'shared_effective_order'));
});
