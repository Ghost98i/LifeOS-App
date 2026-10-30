import React, { useMemo, useState } from 'react';
import { FinanceCategoryInput, LifeOSState } from '../types';
import { formatMoney, todayISO } from '../lib/storage';
import { getAllCategories } from '../lib/financeCategories';
import {
  deriveAllMonthlyBudgetStatuses,
  deriveMonthlyBudgetStatus,
} from '../lib/financeBudget';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceBudgetProgressProps {
  state?: LifeOSState;
  categories: FinanceCategoryInput[];
  catSpent: Record<string, number>;
  budgets: Record<string, number>;
  onSetBudget: (categoryId: string, amountStr: string, month?: string, currency?: string) => void;
  onSetGlobalBudget?: (month: string, limit: number | null, currency?: string) => void;
  onOpenCategoryManager?: () => void;
}

function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map((v) => parseInt(v, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(monthIso: string): string {
  const [y, m] = monthIso.split('-').map((v) => parseInt(v, 10));
  const d = new Date(Date.UTC(y, m - 1, 15));
  const raw = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export const FinanceBudgetProgress: React.FC<FinanceBudgetProgressProps> = ({
  state,
  categories,
  catSpent,
  budgets,
  onSetBudget,
  onSetGlobalBudget,
  onOpenCategoryManager,
}) => {
  const currentMonthIso = useMemo(() => todayISO().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthIso);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [tempGlobalBudget, setTempGlobalBudget] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('UYU');

  // Detect currencies from state if available
  const allCurrencies = useMemo(() => {
    if (!state) return ['UYU'];
    return Object.keys(deriveAllMonthlyBudgetStatuses(state, selectedMonth));
  }, [state, selectedMonth]);

  const activeCurrency = allCurrencies.includes(selectedCurrency) ? selectedCurrency : (allCurrencies[0] || 'UYU');

  const formatCurr = (val: number) => {
    return formatMoney(val, activeCurrency);
  };

  // Derive report from state or fallback to legacy props
  const report = useMemo(() => {
    if (state) {
      return deriveMonthlyBudgetStatus(state, selectedMonth, activeCurrency);
    }
    // Legacy fallback
    const allCats = getAllCategories(categories);
    const categoryStats = allCats.map((cat) => {
      const spent = (catSpent[cat.id] || 0) + (cat.id !== cat.name ? (catSpent[cat.name] || 0) : 0);
      const budget = Number(budgets[cat.id] ?? (cat.id !== cat.name ? budgets[cat.name] : undefined) ?? 0);
      const hasBudget = budget > 0;
      const pct = hasBudget ? (spent / budget) * 100 : 0;
      const isExceeded = hasBudget && spent > budget;
      const remaining = hasBudget ? budget - spent : null;
      const exceeded = hasBudget ? Math.max(0, spent - budget) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        currency: 'UYU',
        limit: hasBudget ? budget : null,
        hasBudget,
        spent,
        remaining,
        exceeded,
        isExceeded,
        pct,
      };
    });

    const configured = categoryStats.filter((c) => c.hasBudget);
    const totalSpent = configured.reduce((acc, c) => acc + c.spent, 0);
    const totalLimit = configured.reduce((acc, c) => acc + (c.limit || 0), 0);
    const remaining = totalLimit > 0 ? totalLimit - totalSpent : null;
    const exceeded = totalLimit > 0 ? Math.max(0, totalSpent - totalLimit) : 0;
    const isExceeded = totalLimit > 0 && totalSpent > totalLimit;
    const pct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

    return {
      month: selectedMonth,
      currency: 'UYU',
      hasBudget: configured.length > 0,
      globalLimit: null,
      totalSpent,
      remaining,
      exceeded,
      isExceeded,
      pct,
      categories: categoryStats,
    };
  }, [state, selectedMonth, activeCurrency, categories, catSpent, budgets]);

  const configuredCategories = report.categories.filter((c) => c.hasBudget);
  const displayList = showAllCategories
    ? report.categories
    : (configuredCategories.length > 0 ? configuredCategories : report.categories.slice(0, 6));

  const totalCategoryBudget = configuredCategories.reduce((acc, c) => acc + (c.limit || 0), 0);
  const effectiveLimit = report.globalLimit ?? (totalCategoryBudget > 0 ? totalCategoryBudget : null);
  const effectiveSpent = report.totalSpent;
  const effectiveRemaining = effectiveLimit !== null ? effectiveLimit - effectiveSpent : null;
  const effectivePct = effectiveLimit && effectiveLimit > 0 ? (effectiveSpent / effectiveLimit) * 100 : 0;
  const isGlobalOverrun = effectiveLimit !== null && effectiveSpent > effectiveLimit;

  const startEditCategory = (categoryId: string, currentBudget: number | null) => {
    setEditingCategory(categoryId);
    setTempBudget(currentBudget && currentBudget > 0 ? String(currentBudget) : '');
  };

  const saveEditCategory = (categoryId: string) => {
    onSetBudget(categoryId, tempBudget, selectedMonth, activeCurrency);
    setEditingCategory(null);
  };

  const saveEditGlobal = () => {
    const val = Number(tempGlobalBudget);
    if (onSetGlobalBudget) {
      onSetGlobalBudget(selectedMonth, Number.isFinite(val) && val > 0 ? val : null, activeCurrency);
    }
    setEditingGlobal(false);
  };

  return (
    <div className="finance-surface rounded-2xl p-5 space-y-4">
      {/* Header: Month Selector + Currency + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="finance-text-primary text-sm font-extrabold">
              Presupuesto Mensual
            </h3>

            {/* Month Badge & Navigator */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer px-1"
                title="Mes anterior"
              >
                ‹
              </button>
              <span className="font-bold text-[11px] min-w-[90px] text-center tabular-nums">
                {formatMonthTitle(selectedMonth)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer px-1"
                title="Mes siguiente"
              >
                ›
              </button>
            </div>

            {selectedMonth !== currentMonthIso && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthIso)}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Ir al mes actual
              </button>
            )}

            {/* Currency Pill Selector if multi-currency exists */}
            {allCurrencies.length > 1 && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[10px] font-bold">
                {allCurrencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCurrency(c)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${
                      activeCurrency === c
                        ? 'bg-indigo-600 text-white'
                        : 'finance-text-secondary hover:text-[var(--finance-text-primary)]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {effectiveLimit !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                effectivePct >= 100
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : effectivePct >= 75
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}>
                {effectivePct.toFixed(0)}% consumido
              </span>
            )}
          </div>
          <p className="finance-text-secondary text-xs mt-0.5">
            Límites planificados frente a gasto real derivado del ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCategoryManager && (
            <button
              type="button"
              onClick={onOpenCategoryManager}
              className="finance-text-secondary text-xs font-semibold hover:text-[var(--finance-text-primary)] transition cursor-pointer"
            >
              Categorías
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAllCategories((prev) => !prev)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            {showAllCategories ? 'Ver solo con límite' : 'Ver todas'}
          </button>
        </div>
      </div>

      {/* Global / Monthly Limit Banner */}
      <div className="finance-surface-subtle space-y-2 p-3.5 rounded-xl border border-[var(--finance-border)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="finance-text-secondary">
              Límite mensual global:
            </span>
            {editingGlobal ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  autoFocus
                  value={tempGlobalBudget}
                  onChange={(e) => setTempGlobalBudget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditGlobal();
                    if (e.key === 'Escape') setEditingGlobal(false);
                  }}
                  className="finance-control w-28 px-2 py-0.5 rounded border border-indigo-500 text-xs outline-none"
                  placeholder="Monto total"
                />
                <button
                  type="button"
                  onClick={saveEditGlobal}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] cursor-pointer"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGlobal(false)}
                  className="px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <strong className="finance-text-primary tabular-nums">
                  {report.globalLimit ? (
                    <PrivacyAmount>{formatCurr(report.globalLimit)}</PrivacyAmount>
                  ) : totalCategoryBudget > 0 ? (
                    <span className="finance-text-muted font-normal">
                      Suma de categorías: <PrivacyAmount>{formatCurr(totalCategoryBudget)}</PrivacyAmount>
                    </span>
                  ) : (
                    <span className="finance-text-muted font-normal font-sans">Sin límite global</span>
                  )}
                </strong>
                {onSetGlobalBudget && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempGlobalBudget(report.globalLimit ? String(report.globalLimit) : '');
                      setEditingGlobal(true);
                    }}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-1"
                  >
                    {report.globalLimit ? 'Modificar' : 'Fijar límite global'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 tabular-nums">
            <span>
              Gastado: <strong className="finance-text-primary"><PrivacyAmount>{formatCurr(effectiveSpent)}</PrivacyAmount></strong>
            </span>
            {effectiveRemaining !== null && (
              <span>
                Restante:{' '}
                <strong className={isGlobalOverrun ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                  <PrivacyAmount>
                    {isGlobalOverrun ? `−${formatCurr(Math.abs(effectiveRemaining))}` : formatCurr(effectiveRemaining)}
                  </PrivacyAmount>
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* Global Progress Bar */}
        {effectiveLimit !== null && (
          <div className="h-2 w-full rounded-full bg-[var(--finance-border)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isGlobalOverrun
                  ? 'bg-rose-500'
                  : effectivePct >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(effectivePct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Categories Table */}
      {!report.hasBudget && configuredCategories.length === 0 && !showAllCategories ? (
        <div className="finance-surface-subtle flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border-dashed text-xs">
          <span className="finance-text-secondary">
            Todavía no definiste límites de gasto para {formatMonthTitle(selectedMonth)}.
          </span>
          <button
            type="button"
            onClick={() => setShowAllCategories(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition-colors shadow-2xs shrink-0"
          >
            Fijar límites de categorías
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="finance-divider finance-text-muted border-b uppercase text-[10px] font-bold tracking-wider">
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3">Límite Planificado</th>
                <th className="py-2.5 px-3">Gastado Real</th>
                <th className="py-2.5 px-3">Restante / Excedido</th>
                <th className="py-2.5 px-4 text-right">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--finance-border)]">
              {displayList.map((item) => {
                const isEditing = editingCategory === item.categoryId;
                return (
                  <tr
                    key={item.categoryId}
                    className="hover:bg-[var(--finance-surface-hover)] transition-colors group"
                  >
                    {/* Categoría */}
                    <td className="finance-text-primary py-2.5 px-3 font-semibold">
                      <span>{item.categoryName}</span>
                    </td>

                    {/* Planificado (Editable) */}
                    <td className="finance-text-secondary py-2.5 px-3 tabular-nums">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            autoFocus
                            value={tempBudget}
                            onChange={(e) => setTempBudget(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditCategory(item.categoryId);
                              if (e.key === 'Escape') setEditingCategory(null);
                            }}
                            className="finance-control w-24 px-2 py-0.5 rounded border border-indigo-500 text-xs outline-none"
                            placeholder="Monto"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditCategory(item.categoryId)}
                            className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] cursor-pointer"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditCategory(item.categoryId, item.limit)}
                          className="hover:underline text-left cursor-pointer flex items-center gap-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                          title="Hacé clic para editar límite"
                        >
                          <PrivacyAmount>{item.hasBudget && item.limit ? formatCurr(item.limit) : 'Fijar'}</PrivacyAmount>
                          <AppIcon name="edit" className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      )}
                    </td>

                    {/* Gastado Real */}
                    <td className="finance-text-primary py-2.5 px-3 tabular-nums font-semibold">
                      <PrivacyAmount>{formatCurr(item.spent)}</PrivacyAmount>
                    </td>

                    {/* Restante / Excedido */}
                    <td className="py-2.5 px-3 tabular-nums">
                      {item.hasBudget && item.remaining !== null ? (
                        <span className={item.isExceeded ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                          <PrivacyAmount>
                            {item.isExceeded
                              ? `Excedido (+${formatCurr(item.exceeded)})`
                              : formatCurr(item.remaining)}
                          </PrivacyAmount>
                        </span>
                      ) : (
                        <span className="finance-text-muted">—</span>
                      )}
                    </td>

                    {/* Progreso Bar + Pct */}
                    <td className="py-2.5 px-4 text-right">
                      {item.hasBudget ? (
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-24 h-1.5 rounded-full bg-[var(--finance-border)] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.isExceeded
                                  ? 'bg-rose-500'
                                  : item.pct >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(item.pct, 100)}%` }}
                            />
                          </div>
                          <span className={`tabular-nums font-bold text-[11px] w-9 text-right ${
                            item.isExceeded
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.pct >= 75
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'finance-text-secondary'
                          }`}>
                            {item.pct.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="finance-text-muted text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
