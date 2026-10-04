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

test('parseQuickFinance strictly enforces separator policy', () => {
  // 1200.50 -> 1200.50
  assert.equal(parseQuickFinance('1200.50 nafta', { accounts: mockAccounts }).amount, 1200.50);
  // 500.50 -> 500.50
  assert.equal(parseQuickFinance('500.50 comida', { accounts: mockAccounts }).amount, 500.50);
  // 1.200,50 -> 1200.50
  assert.equal(parseQuickFinance('1.200,50 super', { accounts: mockAccounts }).amount, 1200.50);
  // 1,200.50 -> 1200.50
  assert.equal(parseQuickFinance('1,200.50 super', { accounts: mockAccounts }).amount, 1200.50);
  // 1200,50 -> 1200.50
  assert.equal(parseQuickFinance('1200,50 nafta', { accounts: mockAccounts }).amount, 1200.50);
  // 1.200 -> 1200
  assert.equal(parseQuickFinance('1.200 super', { accounts: mockAccounts }).amount, 1200);
  // 1,200 -> 1200
  assert.equal(parseQuickFinance('1,200 super', { accounts: mockAccounts }).amount, 1200);

  // Ambiguous forms
  const ambig1 = parseQuickFinance('1.200.50 nafta', { accounts: mockAccounts });
  assert.equal(ambig1.amount, null);
  assert.equal(ambig1.isAmbiguous, true);
  assert.equal(ambig1.isValid, false);
});

test('parseQuickFinance does not steal date numbers as amount (date before amount)', () => {
  // "pagué internet el 15/09" -> missing amount, 15 is day, not amount!
  const res = parseQuickFinance('pagué internet el 15/09', { accounts: mockAccounts, defaultDate: '2026-09-20' });
  assert.equal(res.amount, null);
  assert.ok(res.missing.includes('amount'));
  assert.equal(res.date, '2026-09-15');
});

test('parseQuickFinance detects foreign currency as incompatible', () => {
  const resUsd = parseQuickFinance('USD 50 de hosting', { accounts: mockAccounts });
  assert.equal(resUsd.currency, 'USD');
  assert.equal(resUsd.isCurrencyIncompatible, true);
  assert.equal(resUsd.isValid, false);

  const resEur = parseQuickFinance('40 euros de suscripcion', { accounts: mockAccounts });
  assert.equal(resEur.currency, 'EUR');
  assert.equal(resEur.isCurrencyIncompatible, true);
  assert.equal(resEur.isValid, false);
});
