import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyQuickAccountSetup,
  FINANCE_QUICK_ACCOUNT_PRESETS,
} from './financeQuickSetup';
import { addAccount } from './financeFlows';
import { reconstructAccountBalance } from './financeLedger';
import { defaultState } from './storage';
import { FinanzasView } from '../components/FinanzasView';

test('financeQuickSetup — presets actualizan Efectivo y Banco sin duplicar, saldo opcional → 0 e initialBalance siempre seteado', () => {
  assert.deepEqual(
    FINANCE_QUICK_ACCOUNT_PRESETS.map((p) => [p.name, p.currency]),
    [
      ['Efectivo', 'UYU'],
      ['Banco', 'UYU'],
      ['Billetera virtual', 'UYU'],
      ['PayPal', 'USD'],
      ['Ahorros', 'USD'],
    ]
  );

  const state = defaultState();
  // defaultState starts with Efectivo and Banco
  const existingEfectivoId = state.finance.accounts.find((a) => a.name === 'Efectivo')?.id;
  const existingBancoId = state.finance.accounts.find((a) => a.name === 'Banco')?.id;
  assert.ok(existingEfectivoId);
  assert.ok(existingBancoId);

  const result = applyQuickAccountSetup(state, [
    { name: 'efectivo', currency: 'UYU', initialBalanceInput: '' },
    { name: 'Banco', currency: 'UYU', initialBalanceInput: '15200,50' },
    { name: 'PayPal', currency: 'USD', initialBalanceInput: undefined },
    { name: 'PAYPAL', currency: 'USD', initialBalanceInput: '250' },
  ]);

  // Efectivo & Banco must be updated in place (no duplicate Banco + Banco / Débito)
  const efectivoMatches = state.finance.accounts.filter(
    (a) => a.name.toLowerCase() === 'efectivo'
  );
  assert.equal(efectivoMatches.length, 1);
  assert.equal(efectivoMatches[0].id, existingEfectivoId);
  assert.equal(efectivoMatches[0].balance, 0);
  assert.equal(efectivoMatches[0].initialBalance, 0);

  const bancoMatches = state.finance.accounts.filter(
    (a) => a.name.toLowerCase() === 'banco'
  );
  assert.equal(bancoMatches.length, 1);
  assert.equal(bancoMatches[0].id, existingBancoId);
  assert.equal(bancoMatches[0].balance, 15200.5);
  assert.equal(bancoMatches[0].initialBalance, 15200.5);
  assert.equal(bancoMatches[0].currency, 'UYU');

  const paypalMatches = state.finance.accounts.filter(
    (a) => a.name.toLowerCase() === 'paypal'
  );
  assert.equal(paypalMatches.length, 1);
  assert.equal(paypalMatches[0].balance, 250);
  assert.equal(paypalMatches[0].initialBalance, 250);
  assert.equal(paypalMatches[0].currency, 'USD');

  assert.equal(result.accounts.length, 3);

  // Verify financeLedger never flags missingInitialBalance for any account
  for (const acc of state.finance.accounts) {
    assert.equal(typeof acc.initialBalance, 'number');
    const recon = reconstructAccountBalance(acc, [], [], []);
    assert.equal(recon.missingInitialBalance, false);
    assert.equal(recon.balance, acc.balance);
  }
});

test('addAccount — bloquea cuenta manual duplicada por nombre (case-insensitive) + misma moneda, permite otra moneda', () => {
  const state = defaultState();
  // defaultState has 'Banco' in UYU (implicit/default)
  assert.throws(
    () => addAccount(state, '  banco  ', 500, 'UYU'),
    /Ya existe una cuenta "Banco" en UYU/
  );

  // Same name in USD is allowed
  const bancoUsd = addAccount(state, 'Banco', 100, 'USD');
  assert.equal(bancoUsd.currency, 'USD');
  assert.equal(bancoUsd.balance, 100);
  assert.equal(bancoUsd.initialBalance, 100);

  // Duplicate in USD is also blocked
  assert.throws(
    () => addAccount(state, 'BANCO', 200, 'USD'),
    /Ya existe una cuenta "Banco" en USD/
  );
});

test('FinanzasView — muestra guía rápida solo cuando transactions está vacío', () => {
  const emptyState = defaultState();
  emptyState.finance.transactions = [];

  const emptyHtml = renderToStaticMarkup(
    React.createElement(FinanzasView, {
      state: emptyState,
      onUpdateState: () => true,
    })
  );
  assert.match(emptyHtml, /Configurá tus cuentas en 10 segundos/);
  assert.match(emptyHtml, /0 · opcional/);
  assert.match(emptyHtml, /Seguir con las cuentas por defecto/);
  assert.match(emptyHtml, /Banco/);
  assert.match(emptyHtml, /Débito/);
  assert.match(emptyHtml, /Billetera virtual/);
  assert.match(emptyHtml, /PayPal/);
  assert.match(emptyHtml, /Ahorros/);

  const populatedState = defaultState();
  populatedState.finance.transactions = [
    {
      id: 'tx-existing',
      type: 'gasto',
      amount: 500,
      category: 'comida',
      fixed: 'variable',
      date: '2026-11-20',
      accountId: populatedState.finance.accounts[0].id,
      currency: 'UYU',
    },
  ];
  const populatedHtml = renderToStaticMarkup(
    React.createElement(FinanzasView, {
      state: populatedState,
      onUpdateState: () => true,
    })
  );
  assert.doesNotMatch(populatedHtml, /data-finance-quick-setup/);
});
