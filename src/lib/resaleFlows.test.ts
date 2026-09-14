import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { deleteResaleItem, recordResalePurchase, recordResaleSale, resaleProfit } from './resaleFlows';

test('reventa registra compra, venta, costos y ganancia una sola vez', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  account.balance = 1000;
  const item = recordResalePurchase(state, { item: 'GPU', buyPrice: 400, accountId: account.id });
  assert.equal(account.balance, 600);
  recordResaleSale(state, item.id, { sellPrice: 650, fees: 20, accountId: account.id });
  assert.equal(account.balance, 1230);
  assert.equal(resaleProfit(item), 230);
  assert.equal(state.finance.transactions.length, 3);
  deleteResaleItem(state, item.id);
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
  const item = recordResalePurchase(state, { item: 'Consola', buyPrice: 300, accountId: account.id });
  recordResaleSale(state, item.id, { sellPrice: 500, shippingCost: 15, platformFees: 25, taxes: 10, accountId: account.id });
  assert.equal(item.fees, 50);
  assert.equal(resaleProfit(item), 150);
  assert.equal(account.balance, 1150);
});
