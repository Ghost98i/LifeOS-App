import type { LifeOSState, ResaleItem, Transaction } from '../types';
import { defaultAccountId } from './calculations';
import { todayISO, uid } from './storage';
import { addTransaction, deleteLinkedTransaction } from './financeFlows';
import { resaleProfitAmount } from './resaleMoney';

function addLinkedTransaction(
  state: LifeOSState,
  input: Omit<Transaction, 'id' | 'fixed' | 'category'> & { category?: string }
): Transaction {
  return addTransaction(state, {
    ...input,
    accountId: input.accountId || null,
    category: input.category || 'Reventa',
    fixed: 'variable',
  });
}

function removeLinkedTransaction(state: LifeOSState, transactionId?: string | null): void {
  deleteLinkedTransaction(state, transactionId);
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
  const account = state.finance.accounts.find((candidate) => candidate.id === accountId);
  if (!accountId || !account) throw new Error('Elegí una cuenta válida para la compra.');
  const buyDate = input.buyDate || todayISO();

  const item: ResaleItem = {
    id: uid(),
    item: name,
    buyPrice,
    purchaseCurrency: account.currency || 'UYU',
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

  const accountId = input.accountId || item.saleAccountId || defaultAccountId(state);
  const account = state.finance.accounts.find((candidate) => candidate.id === accountId);
  if (!accountId || !account) throw new Error('Elegí una cuenta válida para la venta.');
  removeLinkedTransaction(state, item.saleTxId || item.financeTxId);
  removeLinkedTransaction(state, item.feeTxId);
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
  item.saleCurrency = account.currency || 'UYU';
  item.saleTxId = sale.id;
  item.feeTxId = feeTxId;
  item.financeTxId = null;
  item.status = 'vendido';
  return item;
}

export interface ResaleDeletionPlan {
  itemId: string;
  itemName: string;
  transactions: Array<{ id: string; label: string; amount: number; currency: string }>;
}

export function planResaleDeletion(state: LifeOSState, itemId: string): ResaleDeletionPlan {
  const item = state.resale.inventory.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('El artículo ya no existe.');
  if (item.saleTxId && item.financeTxId && item.saleTxId !== item.financeTxId) {
    throw new Error('La venta conserva dos referencias financieras distintas; revisalas antes de eliminar el artículo.');
  }
  const links = [
    { id: item.purchaseTxId, label: 'Gasto de compra', type: 'gasto', origin: 'resale_purchase', note: `Compra reventa: ${item.item}`, amount: item.buyPrice, accountId: item.purchaseAccountId, currency: item.purchaseCurrency },
    { id: item.saleTxId || item.financeTxId, label: 'Ingreso de venta', type: 'ingreso', origin: 'resale_sale', note: `Venta reventa: ${item.item}`, amount: item.sellPrice, accountId: item.saleAccountId, currency: item.saleCurrency },
    { id: item.feeTxId, label: 'Gasto de costos de venta', type: 'gasto', origin: 'resale_sale', note: `Costos de venta: ${item.item}`, amount: item.fees, accountId: item.saleAccountId, currency: item.saleCurrency },
  ].filter((link) => Boolean(link.id));
  if (new Set(links.map((link) => link.id)).size !== links.length) throw new Error('Hay referencias financieras duplicadas; revisá el artículo antes de eliminarlo.');
  const transactions = links.map((link) => {
    const tx = state.finance.transactions.find((candidate) => candidate.id === link.id);
    const shared = state.resale.inventory.some((candidate) => candidate.id !== itemId &&
      [candidate.purchaseTxId, candidate.saleTxId, candidate.financeTxId, candidate.feeTxId].includes(link.id));
    if (!tx || shared || tx.type !== link.type || tx.origin !== link.origin || tx.note !== link.note ||
      tx.amount !== link.amount || (link.accountId && tx.accountId !== link.accountId) ||
      (link.currency && tx.currency !== link.currency)) {
      throw new Error('No se puede verificar un movimiento financiero vinculado; no se eliminó nada.');
    }
    if (!tx.currency) throw new Error('La moneda de un movimiento vinculado no se puede verificar; no se eliminó nada.');
    return { id: tx.id, label: link.label, amount: tx.amount, currency: tx.currency };
  });
  return { itemId, itemName: item.item, transactions };
}

export function deleteResaleItem(state: LifeOSState, itemId: string, confirmed?: ResaleDeletionPlan): void {
  const plan = planResaleDeletion(state, itemId);
  if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(plan)) {
    throw new Error('Confirmá nuevamente las consecuencias antes de eliminar el artículo.');
  }
  // Materialization can reject a linked account; rehearse the entire deletion first.
  const staged = structuredClone(state);
  for (const transaction of plan.transactions) removeLinkedTransaction(staged, transaction.id);
  for (const transaction of plan.transactions) removeLinkedTransaction(state, transaction.id);
  state.resale.inventory = state.resale.inventory.filter((candidate) => candidate.id !== itemId);
}

export function resaleProfit(item: ResaleItem, state?: LifeOSState): number | null {
  return resaleProfitAmount(item, state);
}
