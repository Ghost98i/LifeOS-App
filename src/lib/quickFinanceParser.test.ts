import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickFinance } from './quickFinanceParser';
import type { Account } from '../types';

const mockAccounts: Account[] = [
  { id: 'acc-brou', name: 'BROU / Banco', balance: 15000 },
  { id: 'acc-efectivo', name: 'Efectivo', balance: 3200 },
  { id: 'acc-tarjeta', name: 'Tarjeta Santander', balance: 0 },
  { id: 'acc-mp', name: 'Mercado Pago', balance: 4500 },
];

const mockCategories = ['Comida', 'Supermercado', 'Transporte', 'Gimnasio', 'Estudio', 'Ocio', 'Hogar', 'Suscripciones'];

test('parseQuickFinance parses: 500 comida banco', () => {
  const result = parseQuickFinance('500 comida banco', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 500);
  assert.equal(result.category, 'Comida');
  assert.equal(result.accountId, 'acc-brou');
  assert.equal(result.date, '2026-05-10');
  assert.equal(result.dateLabel, 'Hoy');
  assert.equal(result.type, 'gasto');
  assert.ok(result.preview.includes('$U 500'));
  assert.ok(result.preview.includes('Comida'));
  assert.ok(result.preview.includes('BROU / Banco'));
  assert.ok(result.preview.includes('Hoy'));
});

test('parseQuickFinance parses: 1200 nafta', () => {
  const result = parseQuickFinance('1200 nafta', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 1200);
  assert.equal(result.category, 'Transporte');
  assert.equal(result.accountId, null);
  assert.ok(result.missing.includes('account'));
  assert.ok(result.preview.includes('$U 1.200'));
  assert.ok(result.preview.includes('Transporte'));
  assert.ok(result.preview.includes('Cuenta no especificada'));
});

test('parseQuickFinance parses: 2000 super tarjeta', () => {
  const result = parseQuickFinance('2000 super tarjeta', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 2000);
  assert.equal(result.category, 'Supermercado');
  assert.equal(result.accountId, 'acc-tarjeta');
  assert.equal(result.date, '2026-05-10');
});

test('parseQuickFinance parses: 300 gym efectivo', () => {
  const result = parseQuickFinance('300 gym efectivo', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 300);
  assert.equal(result.category, 'Gimnasio');
  assert.equal(result.accountId, 'acc-efectivo');
});

test('parseQuickFinance parses relative dates: 500 comida mañana', () => {
  const result = parseQuickFinance('500 comida mañana', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 500);
  assert.equal(result.category, 'Comida');
  assert.equal(result.date, '2026-05-11');
  assert.equal(result.dateLabel, 'Mañana');
});

test('parseQuickFinance parses relative dates: 800 nafta ayer', () => {
  const result = parseQuickFinance('800 nafta ayer', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 800);
  assert.equal(result.category, 'Transporte');
  assert.equal(result.date, '2026-05-09');
  assert.equal(result.dateLabel, 'Ayer');
});

test('parseQuickFinance handles income notation: + 50000 sueldo banco', () => {
  const result = parseQuickFinance('+ 50000 sueldo banco', {
    accounts: mockAccounts,
    categories: mockCategories,
    defaultDate: '2026-05-10',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.amount, 50000);
  assert.equal(result.type, 'ingreso');
  assert.equal(result.accountId, 'acc-brou');
});
