import assert from 'node:assert/strict';
import test from 'node:test';
import { exitStock, receiveStock, stockBalance, type StockBook } from './commercialInventory';

test('hamburguesería conserva cantidades y valor entre consumo, merma y sobrante', () => {
  let book: StockBook = { items: [
    { id: 'pan', name: 'Pan', unit: 'unit' }, { id: 'carne', name: 'Carne', unit: 'kg' },
    { id: 'verdura', name: 'Verdura', unit: 'unit' },
  ], movements: [] };
  book = receiveStock(book, { id: 'p1', itemId: 'pan', quantity: 20, unit: 'unit', totalCost: 600 });
  book = receiveStock(book, { id: 'c1', itemId: 'carne', quantity: 2, unit: 'kg', totalCost: 900 });
  book = receiveStock(book, { id: 'v1', itemId: 'verdura', quantity: 20, unit: 'unit', totalCost: 200 });
  book = exitStock(book, { id: 'p2', itemId: 'pan', kind: 'consumption', quantity: 12, unit: 'unit' });
  book = exitStock(book, { id: 'c2', itemId: 'carne', kind: 'consumption', quantity: 1200, unit: 'g' });
  book = exitStock(book, { id: 'v2', itemId: 'verdura', kind: 'consumption', quantity: 12, unit: 'unit' });
  book = exitStock(book, { id: 'p3', itemId: 'pan', kind: 'waste', quantity: 3, unit: 'unit' });
  const consumed = book.movements.filter((m) => m.kind === 'consumption').reduce((sum, m) => sum + m.costCents, 0);
  assert.equal(consumed, 102000);
  assert.equal(book.movements.find((m) => m.id === 'p3')?.costCents, 9000);
  assert.deepEqual([stockBalance(book, 'pan').quantity, stockBalance(book, 'pan').valueCents], [5, 15000]);
  assert.equal(stockBalance(book, 'carne').quantity, 0.8);
  assert.equal(stockBalance(book, 'verdura').quantity, 8);
  const remaining = book.items.reduce((sum, item) => sum + stockBalance(book, item.id).valueCents, 0);
  assert.equal(consumed + 9000 + remaining, 170000);
});

test('promedio móvil y costo histórico congelado, incluido redondeo final', () => {
  let book: StockBook = { items: [{ id: 'a', name: 'A', unit: 'unit' }], movements: [] };
  book = receiveStock(book, { id: 'r1', itemId: 'a', quantity: 3, unit: 'unit', totalCost: 1 });
  book = exitStock(book, { id: 's1', itemId: 'a', kind: 'sale', quantity: 1, unit: 'unit' });
  const historical = book.movements.find((m) => m.id === 's1')?.costCents;
  book = receiveStock(book, { id: 'r2', itemId: 'a', quantity: 1, unit: 'unit', totalCost: 1 });
  assert.equal(historical, 33);
  assert.equal(book.movements.find((m) => m.id === 's1')?.costCents, historical);
  assert.equal(stockBalance(book, 'a').valueCents, 167);
  book = exitStock(book, { id: 's2', itemId: 'a', kind: 'sale', quantity: 3, unit: 'unit' });
  assert.equal(book.movements.find((m) => m.id === 's2')?.costCents, 167);
  assert.equal(stockBalance(book, 'a').valueCents, 0);
  assert.equal(stockBalance(book, 'a').quantity, 0);
});

test('rechaza entradas y salidas inválidas sin mutar el libro', () => {
  const book: StockBook = { items: [{ id: 'a', name: 'A', unit: 'kg' }], movements: [] };
  assert.throws(() => receiveStock(book, { id: 'x', itemId: 'a', quantity: 1, unit: 'unit', totalCost: 1 }), /Unidad incompatible/);
  assert.throws(() => receiveStock(book, { id: 'x', itemId: 'a', quantity: -1, unit: 'kg', totalCost: 1 }), /Cantidad inválida/);
  assert.throws(() => receiveStock(book, { id: 'x', itemId: 'a', quantity: 1, unit: 'kg', totalCost: 1.001 }), /dos decimales/);
  assert.throws(() => exitStock(book, { id: 'x', itemId: 'a', kind: 'waste', quantity: 1, unit: 'kg' }), /Existencias insuficientes/);
  assert.equal(book.movements.length, 0);
});

test('reventa expresa costo comercial sin movimientos financieros', () => {
  let book: StockBook = { items: [{ id: 'gpu', name: 'GPU', unit: 'unit' }], movements: [] };
  book = receiveStock(book, { id: 'buy', itemId: 'gpu', quantity: 1, unit: 'unit', totalCost: 8300 });
  book = exitStock(book, { id: 'sell', itemId: 'gpu', kind: 'sale', quantity: 1, unit: 'unit' });
  assert.equal(11000 - book.movements[1].costCents / 100 - 500, 2200);
  assert.equal(stockBalance(book, 'gpu').quantity, 0);
  assert.deepEqual(Object.keys(book).sort(), ['items', 'movements']);
});
