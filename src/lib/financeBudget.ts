import {
  BudgetCategoryStatus,
  Finance,
  LifeOSState,
  MonthlyBudgetStatus,
} from '../types';
import { getAllCategories } from './financeCategories';

function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

function resolveBudgetConfig(
  finance: Finance | undefined,
  month: string,
  currency: string,
): { globalLimit: number | null; categoryLimits: Record<string, number>; hasExplicitConfig: boolean } {
  if (!finance) {
    return { globalLimit: null, categoryLimits: {}, hasExplicitConfig: false };
  }

  const cur = currency.toUpperCase();
  const monthlyKey = `${month}:${cur}`;
  let directConfig = finance.monthlyBudgets?.[monthlyKey];
  if (!directConfig && finance.monthlyBudgets?.[month]) {
    const candidate = finance.monthlyBudgets[month];
    const candidateCur = (candidate.currency || 'UYU').toUpperCase();
    if (candidateCur === cur) {
      directConfig = candidate;
    }
  }

  if (directConfig) {
    return {
      globalLimit: typeof directConfig.globalLimit === 'number' && Number.isFinite(directConfig.globalLimit) && directConfig.globalLimit > 0
        ? directConfig.globalLimit
        : null,
      categoryLimits: directConfig.categoryLimits ? { ...directConfig.categoryLimits } : {},
      hasExplicitConfig: true,
    };
  }

  // Fallback to legacy recurring category budgets for default currency if present
  if (cur === 'UYU' && finance.budgets && Object.keys(finance.budgets).length > 0) {
    const hasValues = Object.values(finance.budgets).some((v) => Number(v) > 0);
    return {
      globalLimit: null,
      categoryLimits: { ...finance.budgets },
      hasExplicitConfig: hasValues,
    };
  }

  return { globalLimit: null, categoryLimits: {}, hasExplicitConfig: false };
}

/**
 * Derives monthly budget status for an explicit month and currency.
 * - spent is calculated purely from ledger transactions in that month.
 * - Internal transfers do NOT count as expenses.
 * - Incomes do NOT count as expenses.
 * - Future commitments do NOT count as spent until settled as ledger transactions.
 * - Spent and remaining are NOT persisted, they are derived dynamically.
 * - Changing transaction category recalculates budget automatically.
 * - No automatic rollover across months.
 */
export function deriveMonthlyBudgetStatus(
  state: LifeOSState,
  month: string, // YYYY-MM
  currency = 'UYU',
): MonthlyBudgetStatus {
  const cur = currency.toUpperCase();
  const { globalLimit, categoryLimits } = resolveBudgetConfig(state.finance, month, cur);

  const accountCurrencyMap = new Map<string, string>();
  for (const acc of state.finance?.accounts || []) {
    accountCurrencyMap.set(acc.id, (acc.currency || 'UYU').toUpperCase());
  }

  // Calculate actual spending from ledger transactions
  let totalSpent = 0;
  const catSpentMap: Record<string, number> = {};

  for (const t of state.finance?.transactions || []) {
    if (!t.date || t.date.slice(0, 7) !== month) continue;
    if (t.type !== 'gasto') continue;
    if (t.origin === 'adjustment') continue; // Reconciliation balance adjustment is not expense

    const txCur = (t.currency || (t.accountId ? accountCurrencyMap.get(t.accountId) : undefined) || 'UYU').toUpperCase();
    if (txCur !== cur) continue;

    const amount = Number(t.amount || 0);
    totalSpent += amount;
    const cat = t.category;
    catSpentMap[cat] = (catSpentMap[cat] || 0) + amount;
  }

  // Build category reports
  const allKnownCategories = getAllCategories(state.finance?.categories);
  const handledKeys = new Set<string>();
  const categoryReports: BudgetCategoryStatus[] = [];

  for (const cat of allKnownCategories) {
    handledKeys.add(cat.id);
    handledKeys.add(cat.name);

    const limitVal = categoryLimits[cat.id] ?? (cat.id !== cat.name ? categoryLimits[cat.name] : undefined);
    const hasBudget = typeof limitVal === 'number' && Number.isFinite(limitVal) && limitVal > 0;
    const limit = hasBudget ? limitVal : null;

    const spent = roundMoney((catSpentMap[cat.id] || 0) + (cat.id !== cat.name ? (catSpentMap[cat.name] || 0) : 0));
    const remaining = hasBudget ? roundMoney(limit - spent) : null;
    const exceeded = hasBudget ? Math.max(0, roundMoney(spent - limit)) : 0;
    const isExceeded = hasBudget && spent > limit;
    const pct = hasBudget && limit > 0 ? (spent / limit) * 100 : 0;

    categoryReports.push({
      categoryId: cat.id,
      categoryName: cat.name,
      currency: cur,
      limit,
      hasBudget,
      spent,
      remaining,
      exceeded,
      isExceeded,
      pct,
    });
  }

  // Include any extra categories present in limits or spending not in standard taxonomy
  const extraKeys = new Set([
    ...Object.keys(categoryLimits),
    ...Object.keys(catSpentMap),
  ]);
  for (const key of extraKeys) {
    if (handledKeys.has(key)) continue;
    handledKeys.add(key);

    const limitVal = categoryLimits[key];
    const hasBudget = typeof limitVal === 'number' && Number.isFinite(limitVal) && limitVal > 0;
    const limit = hasBudget ? limitVal : null;
    const spent = roundMoney(catSpentMap[key] || 0);
    const remaining = hasBudget ? roundMoney(limit - spent) : null;
    const exceeded = hasBudget ? Math.max(0, roundMoney(spent - limit)) : 0;
    const isExceeded = hasBudget && spent > limit;
    const pct = hasBudget && limit > 0 ? (spent / limit) * 100 : 0;

    categoryReports.push({
      categoryId: key,
      categoryName: key,
      currency: cur,
      limit,
      hasBudget,
      spent,
      remaining,
      exceeded,
      isExceeded,
      pct,
    });
  }

  totalSpent = roundMoney(totalSpent);
  const hasGlobalLimit = typeof globalLimit === 'number' && Number.isFinite(globalLimit) && globalLimit > 0;
  const globalRemaining = hasGlobalLimit ? roundMoney(globalLimit - totalSpent) : null;
  const globalExceeded = hasGlobalLimit ? Math.max(0, roundMoney(totalSpent - globalLimit)) : 0;
  const isGlobalExceeded = hasGlobalLimit && totalSpent > globalLimit;
  const globalPct = hasGlobalLimit && globalLimit > 0 ? (totalSpent / globalLimit) * 100 : 0;
  const hasAnyBudget = hasGlobalLimit || Object.values(categoryLimits).some((v) => Number(v) > 0);

  return {
    month,
    currency: cur,
    hasBudget: hasAnyBudget,
    globalLimit: hasGlobalLimit ? globalLimit : null,
    totalSpent,
    remaining: globalRemaining,
    exceeded: globalExceeded,
    isExceeded: isGlobalExceeded,
    pct: globalPct,
    categories: categoryReports,
  };
}

/**
 * Derives monthly budget status for all distinct currencies present in the state.
 */
export function deriveAllMonthlyBudgetStatuses(
  state: LifeOSState,
  month: string,
): Record<string, MonthlyBudgetStatus> {
  const currencies = new Set<string>();
  for (const acc of state.finance?.accounts || []) {
    currencies.add((acc.currency || 'UYU').toUpperCase());
  }
  for (const tx of state.finance?.transactions || []) {
    if (tx.currency) currencies.add(tx.currency.toUpperCase());
  }
  for (const key of Object.keys(state.finance?.monthlyBudgets || {})) {
    if (key.includes(':')) {
      currencies.add(key.split(':')[1].toUpperCase());
    }
  }
  if (currencies.size === 0) currencies.add('UYU');

  const result: Record<string, MonthlyBudgetStatus> = {};
  for (const cur of currencies) {
    result[cur] = deriveMonthlyBudgetStatus(state, month, cur);
  }
  return result;
}

/**
 * Sets or updates monthly budget configuration for a specific month and currency.
 */
export function setMonthlyBudget(
  finance: Finance,
  month: string,
  config: {
    globalLimit?: number | null;
    categoryLimits?: Record<string, number>;
    currency?: string;
  },
): void {
  if (!finance.monthlyBudgets) finance.monthlyBudgets = {};
  const cur = (config.currency || 'UYU').toUpperCase();
  const key = `${month}:${cur}`;

  const existing = finance.monthlyBudgets[key] || finance.monthlyBudgets[month] || {
    month,
    currency: cur,
    globalLimit: null,
    categoryLimits: {},
  };

  finance.monthlyBudgets[key] = {
    month,
    currency: cur,
    globalLimit: config.globalLimit !== undefined ? config.globalLimit : existing.globalLimit,
    categoryLimits: config.categoryLimits !== undefined
      ? { ...config.categoryLimits }
      : { ...(existing.categoryLimits || {}) },
  };

  // If legacy un-prefixed key exists, remove to avoid duplicate identities
  if (finance.monthlyBudgets[month] && month !== key) {
    delete finance.monthlyBudgets[month];
  }
}

/**
 * Sets the optional global spending limit for a specific month.
 */
export function setMonthlyGlobalLimit(
  finance: Finance,
  month: string,
  limit: number | null,
  currency = 'UYU',
): void {
  const validLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
  setMonthlyBudget(finance, month, { globalLimit: validLimit, currency });
}

/**
 * Sets or updates a category limit for a specific month.
 */
export function setMonthlyCategoryLimit(
  finance: Finance,
  month: string,
  categoryId: string,
  limit: number | null,
  currency = 'UYU',
): void {
  if (!finance.monthlyBudgets) finance.monthlyBudgets = {};
  const cur = currency.toUpperCase();
  const key = `${month}:${cur}`;
  const existing = finance.monthlyBudgets[key] || finance.monthlyBudgets[month] || {
    month,
    currency: cur,
    globalLimit: null,
    categoryLimits: {},
  };

  const nextLimits = { ...(existing.categoryLimits || {}) };
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    nextLimits[categoryId] = limit;
  } else {
    delete nextLimits[categoryId];
  }

  setMonthlyBudget(finance, month, { categoryLimits: nextLimits, currency: cur });
}
