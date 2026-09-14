import type { LifeOSState, ResaleItem, Transaction } from '../types';
import { adjustAccountBalance, defaultAccountId } from './calculations';
import { todayISO, uid } from './storage';

function addLinkedTransaction(
  state: LifeOSState,
  input: Omit<Transaction, 'id' | 'fixed' | 'category'> & { category?: string }
): Transaction {
  const transaction: Transaction = {
    ...input,
    id: uid(),
    category: input.category || 'Reventa',
    fixed: 'variable',
  };
  state.finance.transactions.push(transaction);
  const reconciledAfter = state.finance.reconciliations.some((item) => item.accountId === transaction.accountId && item.date >= transaction.date);
  if (!reconciledAfter) adjustAccountBalance(state, transaction.accountId, transaction.type === 'ingreso' ? transaction.amount : -transaction.amount);
  return transaction;
}

function removeLinkedTransaction(state: LifeOSState, transactionId?: string | null): void {
  if (!transactionId) return;
  const transaction = state.finance.transactions.find((item) => item.id === transactionId);
  if (transaction) {
    const reconciledAfter = state.finance.reconciliations.some((item) => item.accountId === transaction.accountId && item.date >= transaction.date);
    if (!reconciledAfter) adjustAccountBalance(state, transaction.accountId, transaction.type === 'ingreso' ? -transaction.amount : transaction.amount);
  }
  state.finance.transactions = state.finance.transactions.filter((item) => item.id !== transactionId);
}

export interface ResalePurchaseInput {
  item: string;
  buyPrice: number;
  buyDate?: string;
  accountId?: string | null;
  note?: string;
  sourceOpportunityId?: string;
}

export function recordResalePurchase(state: LifeOSState, input: ResalePurchaseInput): ResaleItem {
  const name = input.item.trim();
  const buyPrice = Number(input.buyPrice);
  if (!name) throw new Error('Escribí el producto.');
  if (!Number.isFinite(buyPrice) || buyPrice < 0) throw new Error('Ingresá un precio de compra válido.');
  const accountId = input.accountId || defaultAccountId(state);
  if (!accountId || !state.finance.accounts.some((account) => account.id === accountId)) throw new Error('Elegí una cuenta válida para la compra.');
  const buyDate = input.buyDate || todayISO();

  const item: ResaleItem = {
    id: uid(),
    item: name,
    buyPrice,
    buyDate,
    sellPrice: null,
    sellDate: null,
    status: 'comprado',
    purchaseTxId: null,
    saleTxId: null,
    feeTxId: null,
    fees: 0,
    purchaseAccountId: accountId,
    saleAccountId: null,
    note: input.note?.trim() || '',
    sourceOpportunityId: input.sourceOpportunityId,
  };

  if (buyPrice > 0) {
    const transaction = addLinkedTransaction(state, {
      type: 'gasto',
      amount: buyPrice,
      date: buyDate,
      note: `Compra reventa: ${name}`,
      accountId,
      origin: 'resale_purchase',
    });
    item.purchaseTxId = transaction.id;
  }

  state.resale.inventory.push(item);
  return item;
}

export interface ResaleSaleInput {
  sellPrice: number;
  sellDate?: string;
  accountId?: string | null;
  fees?: number;
  shippingCost?: number;
  platformFees?: number;
  taxes?: number;
}

export function recordResaleSale(state: LifeOSState, itemId: string, input: ResaleSaleInput): ResaleItem {
  const item = state.resale.inventory.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('El producto ya no existe.');
  const sellPrice = Number(input.sellPrice);
  const hasBreakdown = input.shippingCost !== undefined || input.platformFees !== undefined || input.taxes !== undefined;
  const shippingCost = Number(input.shippingCost || 0);
  const platformFees = Number(input.platformFees || 0);
  const taxes = Number(input.taxes || 0);
  const fees = hasBreakdown ? shippingCost + platformFees + taxes : Number(input.fees || 0);
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) throw new Error('Ingresá un precio de venta válido.');
  if (![fees, shippingCost, platformFees, taxes].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Ingresá costos válidos.');

  removeLinkedTransaction(state, item.saleTxId || item.financeTxId);
  removeLinkedTransaction(state, item.feeTxId);

  const accountId = input.accountId || item.saleAccountId || defaultAccountId(state);
  if (!accountId || !state.finance.accounts.some((account) => account.id === accountId)) throw new Error('Elegí una cuenta válida para la venta.');
  const sellDate = input.sellDate || todayISO();
  const sale = addLinkedTransaction(state, {
    type: 'ingreso',
    amount: sellPrice,
    date: sellDate,
    note: `Venta reventa: ${item.item}`,
    accountId,
    origin: 'resale_sale',
  });

  let feeTxId: string | null = null;
  if (fees > 0) {
    feeTxId = addLinkedTransaction(state, {
      type: 'gasto',
      amount: fees,
      date: sellDate,
      note: `Costos de venta: ${item.item}`,
      accountId,
      origin: 'resale_sale',
    }).id;
  }

  item.sellPrice = sellPrice;
  item.sellDate = sellDate;
  item.fees = fees;
  item.shippingCost = shippingCost;
  item.platformFees = platformFees;
  item.taxes = taxes;
  item.saleAccountId = accountId;
  item.saleTxId = sale.id;
  item.feeTxId = feeTxId;
  item.financeTxId = null;
  item.status = 'vendido';
  return item;
}

export function deleteResaleItem(state: LifeOSState, itemId: string): void {
  const item = state.resale.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return;
  removeLinkedTransaction(state, item.purchaseTxId);
  removeLinkedTransaction(state, item.saleTxId || item.financeTxId);
  removeLinkedTransaction(state, item.feeTxId);
  state.resale.inventory = state.resale.inventory.filter((candidate) => candidate.id !== itemId);
}

export function resaleProfit(item: ResaleItem): number {
  const breakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0);
  const costs = breakdown > 0 ? breakdown : Number(item.fees || 0);
  return Number(item.sellPrice || 0) - Number(item.buyPrice || 0) - costs;
}
