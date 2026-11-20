import type { Account, LifeOSState } from '../types';
import { parseDecimalInput, roundMoney, uid } from './storage';

export interface QuickAccountPreset {
  id: string;
  name: string;
  hint?: string;
  currency: 'UYU' | 'USD';
  defaultSelected?: boolean;
}

export const FINANCE_QUICK_ACCOUNT_PRESETS: readonly QuickAccountPreset[] = [
  { id: 'efectivo', name: 'Efectivo', currency: 'UYU', defaultSelected: true },
  { id: 'banco', name: 'Banco', hint: 'Débito', currency: 'UYU', defaultSelected: true },
  { id: 'billetera-virtual', name: 'Billetera virtual', currency: 'UYU' },
  { id: 'paypal', name: 'PayPal', currency: 'USD' },
  { id: 'ahorros', name: 'Ahorros', currency: 'USD' },
] as const;

export interface QuickAccountSetupItem {
  name: string;
  currency: string;
  initialBalanceInput?: string | number | null;
}

export interface QuickAccountSetupResult {
  createdCount: number;
  updatedCount: number;
  accounts: Account[];
}

function normalizeAccountName(name: string): string {
  return name.trim().toLocaleLowerCase('es-UY');
}

function parseOptionalInitialBalance(raw?: string | number | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new Error('Ingresá un saldo inicial válido.');
    }
    return roundMoney(raw);
  }
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const parsed = parseDecimalInput(trimmed);
  if (parsed.error || parsed.value === null || !Number.isFinite(parsed.value)) {
    throw new Error(parsed.error || 'Ingresá un saldo inicial válido.');
  }
  return roundMoney(parsed.value);
}

/**
 * Creates or updates accounts without duplicating by name (case-insensitive)
 * and always sets explicit `initialBalance` so financeLedger never flags
 * `missingInitialBalance`.
 */
export function applyQuickAccountSetup(
  state: LifeOSState,
  items: readonly QuickAccountSetupItem[]
): QuickAccountSetupResult {
  if (!Array.isArray(state.finance.accounts)) {
    state.finance.accounts = [];
  }

  let createdCount = 0;
  let updatedCount = 0;
  const touched: Account[] = [];

  for (const item of items) {
    const trimmedName = item.name.trim();
    if (!trimmedName) continue;

    const normalizedKey = normalizeAccountName(trimmedName);
    const currency = (item.currency || 'UYU').trim().toUpperCase() || 'UYU';
    const balance = parseOptionalInitialBalance(item.initialBalanceInput);

    const existing = state.finance.accounts.find(
      (acc) => normalizeAccountName(acc.name) === normalizedKey
    );

    if (existing) {
      existing.balance = balance;
      existing.initialBalance = balance;
      existing.currency = currency;
      updatedCount += 1;
      if (!touched.some((acc) => acc.id === existing.id)) {
        touched.push(existing);
      }
    } else {
      const created: Account = {
        id: uid(),
        name: trimmedName,
        balance,
        initialBalance: balance,
        currency,
      };
      state.finance.accounts.push(created);
      createdCount += 1;
      touched.push(created);
    }
  }

  return {
    createdCount,
    updatedCount,
    accounts: touched,
  };
}
