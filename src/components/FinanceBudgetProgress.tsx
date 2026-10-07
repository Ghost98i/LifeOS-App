import React, { useState } from 'react';
import { FinanceCategoryInput } from '../types';
import { fmtMoney } from '../lib/storage';
import { getAllCategories } from '../lib/financeCategories';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceBudgetProgressProps {
  categories: FinanceCategoryInput[];
  catSpent: Record<string, number>;
  budgets: Record<string, number>;
  onSetBudget: (categoryId: string, amountStr: string) => void;
  onOpenCategoryManager?: () => void;
}

export const FinanceBudgetProgress: React.FC<FinanceBudgetProgressProps> = ({
  categories,
  catSpent,
  budgets,
  onSetBudget,
  onOpenCategoryManager,
}) => {
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');
  const [showAllCategories, setShowAllCategories] = useState(false);

  const allCats = getAllCategories(categories);

  const categoryStats = allCats.map((cat) => {
    const spent = (catSpent[cat.id] || 0) + (cat.id !== cat.name ? (catSpent[cat.name] || 0) : 0);
    const budget = Number(budgets[cat.id] ?? (cat.id !== cat.name ? budgets[cat.name] : undefined) ?? 0);
    const hasBudget = budget > 0;
    const pct = hasBudget ? (spent / budget) * 100 : 0;
    const isExceeded = hasBudget && spent > budget;
    const isWarning = hasBudget && !isExceeded && pct >= 75;
    const remaining = hasBudget ? budget - spent : 0;

    return {
      category: cat.name,
      categoryId: cat.id,
      active: cat.active !== false,
      spent,
      budget,
      hasBudget,
      pct,
      isExceeded,
      isWarning,
      remaining,
    };
  });

  const configured = categoryStats.filter((c) => c.hasBudget);
  const totalBudget = configured.reduce((acc, c) => acc + c.budget, 0);
  const totalSpent = configured.reduce((acc, c) => acc + c.spent, 0);
  const globalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingTotal = totalBudget - totalSpent;

  const displayList = showAllCategories ? categoryStats : (configured.length > 0 ? configured : categoryStats.slice(0, 5));

  const startEdit = (categoryId: string, currentBudget: number) => {
    setEditingCategory(categoryId);
    setTempBudget(currentBudget > 0 ? String(currentBudget) : '');
  };

  const saveEdit = (categoryId: string) => {
    onSetBudget(categoryId, tempBudget);
    setEditingCategory(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md p-5 shadow-xs space-y-4">
      {/* Header: Monarch Style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Presupuestos por Categoría
            </h3>
            {totalBudget > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                globalPct >= 100
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : globalPct >= 75
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}>
                {globalPct.toFixed(0)}% consumido
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Planificado vs. gasto real del mes en curso
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCategoryManager && (
            <button
              type="button"
              onClick={onOpenCategoryManager}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              Categorías
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAllCategories((prev) => !prev)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            {showAllCategories ? 'Ver solo con presupuesto' : 'Ver todas'}
          </button>
        </div>
      </div>

      {/* Global Progress Bar (if budget configured) */}
      {totalBudget > 0 && (
        <div className="space-y-1.5 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-800/50">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Gastado: <strong className="font-mono text-slate-900 dark:text-white"><PrivacyAmount>{fmtMoney(totalSpent)}</PrivacyAmount></strong> de <strong className="font-mono text-slate-900 dark:text-white"><PrivacyAmount>{fmtMoney(totalBudget)}</PrivacyAmount></strong>
            </span>
            <span className="font-mono font-semibold">
              Restante: <strong className={remainingTotal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}><PrivacyAmount>{fmtMoney(remainingTotal)}</PrivacyAmount></strong>
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                globalPct >= 100
                  ? 'bg-rose-500'
                  : globalPct >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(globalPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Monarch Columnar Layout: Categoría | Planificado | Actual | Restante | Progreso */}
      {configured.length === 0 && !showAllCategories ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-400">
            Todavía no definiste límites de gasto mensuales para tus categorías.
          </span>
          <button
            type="button"
            onClick={() => setShowAllCategories(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition-colors shadow-2xs shrink-0"
          >
            Fijar presupuestos
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3">Planificado</th>
                <th className="py-2.5 px-3">Actual</th>
                <th className="py-2.5 px-3">Restante</th>
                <th className="py-2.5 px-4 text-right">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {displayList.map((item) => {
                const isEditing = editingCategory === item.categoryId;
                return (
                  <tr
                    key={item.categoryId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors group"
                  >
                    {/* Categoría */}
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      <span>{item.category}</span>
                      {!item.active && (
                        <span className="text-[10px] text-slate-400 ml-1">(archivada)</span>
                      )}
                    </td>

                    {/* Planificado (Editable) */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            autoFocus
                            value={tempBudget}
                            onChange={(e) => setTempBudget(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(item.categoryId);
                              if (e.key === 'Escape') setEditingCategory(null);
                            }}
                            className="w-24 px-2 py-0.5 rounded border border-indigo-500 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none"
                            placeholder="Monto"
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(item.categoryId)}
                            className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] cursor-pointer"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(item.categoryId, item.budget)}
                          className="hover:underline text-left cursor-pointer flex items-center gap-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                          title="Hacé clic para editar presupuesto"
                        >
                          <PrivacyAmount>{item.hasBudget ? fmtMoney(item.budget) : 'Fijar'}</PrivacyAmount>
                          <AppIcon name="edit" className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      )}
                    </td>

                    {/* Actual */}
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount>
                    </td>

                    {/* Restante */}
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      {item.hasBudget ? (
                        <span className={item.remaining < 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                          <PrivacyAmount>{item.remaining < 0 ? `−${fmtMoney(Math.abs(item.remaining))}` : fmtMoney(item.remaining)}</PrivacyAmount>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Progreso Bar + Pct */}
                    <td className="py-2.5 px-4 text-right">
                      {item.hasBudget ? (
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.isExceeded
                                  ? 'bg-rose-500'
                                  : item.isWarning
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(item.pct, 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono font-bold text-[11px] w-9 text-right ${
                            item.isExceeded
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.isWarning
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            {item.pct.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
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
