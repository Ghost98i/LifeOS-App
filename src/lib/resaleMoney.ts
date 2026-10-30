import type { LifeOSState, ResaleItem } from '../types';
import { fromCents, toCents } from './storage';

function currency(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

export function resaleItemCurrency(state: LifeOSState | undefined, item: ResaleItem, kind: 'purchase' | 'sale'): string | null {
  const stored = currency(kind === 'purchase' ? item.purchaseCurrency : item.saleCurrency);
  const id = kind === 'purchase' ? item.purchaseTxId : item.saleTxId || item.financeTxId;
  const tx = state?.finance.transactions.find((candidate) => candidate.id === id);
  if (stored && tx && currency(tx.currency) !== stored) return null;
  if (stored) return stored;
  const expectedOrigin = kind === 'purchase' ? 'resale_purchase' : 'resale_sale';
  const expectedType = kind === 'purchase' ? 'gasto' : 'ingreso';
  const expectedAmount = kind === 'purchase' ? item.buyPrice : item.sellPrice;
  return tx && tx.origin === expectedOrigin && tx.type === expectedType && tx.amount === expectedAmount
    ? currency(tx.currency) : null;
}

export function resaleProfitAmount(item: ResaleItem, state?: LifeOSState): number | null {
  const buyCurrency = resaleItemCurrency(state, item, 'purchase');
  const sellCurrency = resaleItemCurrency(state, item, 'sale');
  if (!buyCurrency || buyCurrency !== sellCurrency || item.sellPrice == null) return null;
  const feeTx = state?.finance.transactions.find((candidate) => candidate.id === item.feeTxId);
  if (feeTx && currency(feeTx.currency) !== sellCurrency) return null;
  const breakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0);
  const fees = breakdown > 0 ? breakdown : Number(item.fees || 0);
  return fromCents(toCents(item.sellPrice) - toCents(item.buyPrice) - toCents(fees));
}
