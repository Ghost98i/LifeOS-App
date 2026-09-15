import React, { useState } from 'react';
import { fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceBudgetProgressProps {
  categories: string[];
  catSpent: Record<string, number>;
  budgets: Record<string, number>;
  onSetBudget: (category: string, amountStr: string) => void;
}

type BudgetFilter = 'all' | 'configured' | 'alerts';

export const FinanceBudgetProgress: React.FC<FinanceBudgetProgressProps> = ({
  categories,
  catSpent,
  budgets,
  onSetBudget,
}) => {
  const [filter, setFilter] = useState<BudgetFilter>('all');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');

  // Computations
  const categoryStats = categories.map((cat) => {
    const spent = catSpent[cat] || 0;
    const budget = Number(budgets[cat] || 0);
    const hasBudget = budget > 0;
    const pct = hasBudget ? (spent / budget) * 100 : 0;
    const isExceeded = hasBudget && spent > budget;
    const isWarning = hasBudget && !isExceeded && pct >= 75;
    const remaining = hasBudget ? budget - spent : 0;

    return {
      category: cat,
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
  const exceededCount = configured.filter((c) => c.isExceeded).length;
  const warningCount = configured.filter((c) => c.isWarning).length;

  const filteredCategories = categoryStats.filter((c) => {
    if (filter === 'configured') return c.hasBudget;
    if (filter === 'alerts') return c.isExceeded || c.isWarning;
    return true;
  });

  const startEdit = (cat: string, currentBudget: number) => {
    setEditingCategory(cat);
    setTempBudget(currentBudget > 0 ? String(currentBudget) : '');
  };

  const saveEdit = (cat: string) => {
    onSetBudget(cat, tempBudget);
    setEditingCategory(null);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <AppIcon name="chart" className="h-5 w-5 text-[var(--blue)] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text)]">
              Presupuestos Mensuales por Categoría
            </h2>
            {exceededCount > 0 && (
              <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                ⚠ {exceededCount} {exceededCount === 1 ? 'excedido' : 'excedidos'}
              </span>
            )}
            {exceededCount === 0 && warningCount > 0 && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                ⚡ {warningCount} en alerta
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">
            Seguimiento visual del límite de gasto asignado para cada categoría en el mes.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-[var(--text)] text-[var(--bg)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text)] bg-[var(--surface-muted)]'
            }`}
          >
            Todas ({categories.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('configured')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === 'configured'
                ? 'bg-[var(--text)] text-[var(--bg)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text)] bg-[var(--surface-muted)]'
            }`}
          >
            Configuradas ({configured.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('alerts')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === 'alerts'
                ? 'bg-red-500 text-white'
                : 'text-red-600 dark:text-red-400 hover:text-red-500 bg-red-500/10'
            }`}
          >
            Alertas ({exceededCount + warningCount})
          </button>
        </div>
      </div>

      {/* Global Progress Bar Summary */}
      {totalBudget > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text)]">Consumo Global de Presupuesto</span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  globalPct >= 100
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : globalPct >= 75
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {globalPct.toFixed(0)}%
              </span>
            </div>
            <div className="font-mono text-xs text-[var(--text-soft)]">
              <strong className="text-[var(--text)]"><PrivacyAmount>{fmtMoney(totalSpent)}</PrivacyAmount></strong> gastados de{' '}
              <strong className="text-[var(--text)]"><PrivacyAmount>{fmtMoney(totalBudget)}</PrivacyAmount></strong> presupuestados
            </div>
          </div>

          {/* Master Progress Bar */}
          <div className="h-3 w-full rounded-full bg-[var(--bg)] overflow-hidden border border-[var(--border)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                globalPct >= 100
                  ? 'bg-red-500'
                  : globalPct >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(globalPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-faint)] font-mono">
            <span>0%</span>
            <span>50%</span>
            <span>
              {totalBudget - totalSpent >= 0 ? (
                <>
                  Disponible: <PrivacyAmount>{fmtMoney(totalBudget - totalSpent)}</PrivacyAmount>
                </>
              ) : (
                <>
                  Exceso: <PrivacyAmount>{fmtMoney(Math.abs(totalBudget - totalSpent))}</PrivacyAmount>
                </>
              )}
            </span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Category Progress Bars List */}
      <div className="space-y-3 pt-1">
        {filteredCategories.map((item) => {
          const isEditing = editingCategory === item.category;
          const displayPct = item.hasBudget ? Math.min(item.pct, 100) : 0;

          // Color calculation
          let barColor = 'bg-emerald-500';
          let badgeColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
          if (item.isExceeded) {
            barColor = 'bg-red-500';
            badgeColor = 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20';
          } else if (item.isWarning) {
            barColor = 'bg-amber-500';
            badgeColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';
          }

          return (
            <div
              key={item.category}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2 hover:border-[var(--blue)]/40 transition-colors"
            >
              {/* Row Top: Name, Spent/Budget & Percentage */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[var(--text)]">
                    {item.category}
                  </span>
                  {item.hasBudget && (
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${badgeColor}`}
                    >
                      {item.pct.toFixed(0)}%
                    </span>
                  )}
                  {item.isExceeded && (
                    <span className="text-[10px] font-bold text-red-500">
                      ⚠ Superado
                    </span>
                  )}
                </div>

                {/* Right: Amounts & Budget Config */}
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={tempBudget}
                        onChange={(e) => setTempBudget(e.target.value)}
                        placeholder="Límite $"
                        autoFocus
                        className="w-24 rounded-lg border border-[var(--blue)] bg-[var(--card)] px-2 py-1 font-mono text-xs text-right outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(item.category)}
                        className="rounded-lg bg-[var(--blue)] text-white px-2 py-1 text-[11px] font-bold"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="rounded-lg border border-[var(--border)] px-1.5 py-1 text-[11px] text-[var(--text-faint)]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-mono text-xs font-bold text-[var(--text)]">
                          <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount>
                        </span>
                        <span className="font-mono text-xs text-[var(--text-soft)]">
                          {' '}
                          /{' '}
                          {item.hasBudget ? (
                            <PrivacyAmount>{fmtMoney(item.budget)}</PrivacyAmount>
                          ) : (
                            <span className="italic text-[var(--text-faint)]">Sin fijar</span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(item.category, item.budget)}
                        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-semibold text-[var(--blue)] hover:bg-[var(--blue-soft)]"
                        title="Modificar presupuesto de esta categoría"
                      >
                        {item.hasBudget ? 'Editar' : 'Fijar'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar Track */}
              {item.hasBudget ? (
                <div className="space-y-1">
                  <div className="relative h-2.5 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${displayPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-faint)]">
                    <span>
                      {item.isExceeded ? (
                        <>
                          Excedido por <PrivacyAmount>{fmtMoney(Math.abs(item.remaining))}</PrivacyAmount>
                        </>
                      ) : (
                        <>
                          Disponible: <PrivacyAmount>{fmtMoney(item.remaining)}</PrivacyAmount>
                        </>
                      )}
                    </span>
                    <span>
                      Meta: <PrivacyAmount>{fmtMoney(item.budget)}</PrivacyAmount>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-[var(--text-faint)]">
                  <span>Gastado este mes: <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount></span>
                  <button
                    type="button"
                    onClick={() => startEdit(item.category, 0)}
                    className="text-[10px] font-medium text-[var(--blue)] hover:underline"
                  >
                    ＋ Asignar presupuesto mensual
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="py-6 text-center text-xs text-[var(--text-faint)]">
            No hay categorías que coincidan con el filtro seleccionado.
          </div>
        )}
      </div>
    </div>
  );
};
