import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { deleteResaleItem, planResaleDeletion, recordResalePurchase, recordResaleSale, resaleProfit } from './resaleFlows';
import { resaleStats } from './calculations';
import { resaleItemCurrency } from './resaleMoney';
import { reconcileAccount } from './financeFlows';

test('reventa conserva vínculo y no altera un saldo conciliado posterior', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  reconcileAccount(state, { accountId: account.id, actualBalance: 1000, date: '2026-10-10' });

  const item = recordResalePurchase(state, {
    item: 'Monitor', buyPrice: 300, buyDate: '2026-10-09', accountId: account.id,
  });
  const transaction = state.finance.transactions.find((candidate) => candidate.id === item.purchaseTxId);

  assert.equal(account.balance, 1000);
  assert.equal(transaction?.origin, 'resale_purchase');
  assert.equal(transaction?.note, 'Compra reventa: Monitor');
});

test('reventa registra compra, venta, costos y ganancia una sola vez', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  const item = recordResalePurchase(state, { item: 'GPU', buyPrice: 400, accountId: account.id });
  assert.equal(account.balance, 600);
  recordResaleSale(state, item.id, { sellPrice: 650, fees: 20, accountId: account.id });
  assert.equal(account.balance, 1230);
  assert.equal(resaleProfit(item), 230);
  assert.equal(state.finance.transactions.length, 3);
  deleteResaleItem(state, item.id, planResaleDeletion(state, item.id));
  assert.equal(account.balance, 1000);
});

test('reventa no mezcla monedas de compra y venta ni altera movimientos financieros', () => {
  const state = defaultState();
  const uyu = state.finance.accounts[0];
  uyu.balance = uyu.initialBalance = 1000;
  state.finance.accounts.push({ id: 'usd', name: 'Dólares', currency: 'USD', balance: 1000, initialBalance: 1000 });
  const item = recordResalePurchase(state, { item: 'GPU', buyPrice: 300, accountId: 'usd' });
  recordResaleSale(state, item.id, { sellPrice: 400, accountId: uyu.id });
  assert.equal(item.purchaseCurrency, 'USD');
  assert.equal(item.saleCurrency, 'UYU');
  assert.equal(resaleProfit(item, state), null);
  assert.equal(resaleStats(state).gananciaTotal, null);
  assert.equal(resaleStats(state).roi, null);
  assert.deepEqual(state.finance.transactions.map((tx) => [tx.currency, tx.amount]), [['USD', 300], ['UYU', 400]]);
  assert.equal(resaleItemCurrency(state, item, 'purchase'), 'USD');
  assert.equal(resaleItemCurrency(state, item, 'sale'), 'UYU');
});

test('históricos sin moneda explícita no adquieren UYU por inferencia', () => {
  const state = defaultState();
  state.resale.inventory.push({ id: 'legacy', item: 'Histórico', buyPrice: 300, buyDate: '2024-01-01', sellPrice: 400,
    sellDate: '2024-01-02', status: 'vendido', purchaseAccountId: state.finance.accounts[0].id });
  assert.equal(resaleProfit(state.resale.inventory[0], state), null);
  assert.equal(resaleStats(state).gananciaTotal, null);
});

test('histórico vinculado conserva moneda demostrada por Finanzas y compra/venta USD siguen comparables', () => {
  const state = defaultState();
  state.finance.accounts.push({ id: 'usd', name: 'Dólares', currency: 'USD', balance: 1000, initialBalance: 1000 });
  const item = recordResalePurchase(state, { item: 'Monitor', buyPrice: 300, accountId: 'usd' });
  recordResaleSale(state, item.id, { sellPrice: 400, accountId: 'usd' });
  assert.equal(resaleProfit(item, state), 100);
  assert.equal(resaleStats(state).profitCurrency, 'USD');
  delete item.purchaseCurrency;
  delete item.saleCurrency;
  assert.equal(resaleItemCurrency(state, item, 'purchase'), 'USD');
  assert.equal(resaleItemCurrency(state, item, 'sale'), 'USD');
  assert.equal(resaleStats(state).gananciaTotal, 100);
});

test('eliminación exige confirmar movimientos exactos y bloquea referencias ajenas', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.initialBalance = account.balance = 1000;
  const item = recordResalePurchase(state, { item: 'GPU', buyPrice: 300, accountId: account.id });
  recordResaleSale(state, item.id, { sellPrice: 400, fees: 20, accountId: account.id });
  const before = structuredClone(state);
  const plan = planResaleDeletion(state, item.id);
  assert.deepEqual(plan.transactions.map((tx) => [tx.label, tx.amount]), [
    ['Gasto de compra', 300], ['Ingreso de venta', 400], ['Gasto de costos de venta', 20],
  ]);
  assert.deepEqual(state, before); // cancelar no ejecuta ningún cambio
  assert.throws(() => deleteResaleItem(state, item.id), /Confirmá/);
  assert.deepEqual(state, before);
  state.resale.inventory.push({ id: 'other', item: 'Otro', buyPrice: 0, buyDate: '2026-01-01',
    status: 'comprado', purchaseTxId: item.purchaseTxId });
  assert.throws(() => deleteResaleItem(state, item.id, plan), /verificar/);
  assert.equal(state.finance.transactions.length, 3);
  state.resale.inventory.pop();
  item.financeTxId = 'otra-venta';
  assert.throws(() => planResaleDeletion(state, item.id), /dos referencias/);
  item.financeTxId = null;
  deleteResaleItem(state, item.id, plan);
  assert.equal(state.resale.inventory.length, 0);
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(account.balance, 1000);
});

test('reventa no registra dinero en una cuenta inexistente', () => {
  const state = defaultState();
  assert.throws(() => recordResalePurchase(state, { item: 'GPU', buyPrice: 400, accountId: 'otra' }), /cuenta válida/);
});

test('reventa desglosa envío, plataforma e impuestos sin duplicar costos', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  account.initialBalance = 1000;
  const item = recordResalePurchase(state, { item: 'Consola', buyPrice: 300, accountId: account.id });
  recordResaleSale(state, item.id, { sellPrice: 500, shippingCost: 15, platformFees: 25, taxes: 10, accountId: account.id });
  assert.equal(item.fees, 50);
  assert.equal(resaleProfit(item), 150);
  assert.equal(resaleStats(state).roi, (150 / 350) * 100); // compra + costos de venta
  assert.equal(account.balance, 1150);
});
