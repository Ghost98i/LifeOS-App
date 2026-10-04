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
  onSetBudget: (category: string, amountStr: string) => void;
  onOpenCategoryManager?: () => void;
}

type BudgetFilter = 'all' | 'configured' | 'alerts';

export const FinanceBudgetProgress: React.FC<FinanceBudgetProgressProps> = ({
  categories,
  catSpent,
  budgets,
  onSetBudget,
  onOpenCategoryManager,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<BudgetFilter>('all');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');

  const allCats = getAllCategories(categories);

  // Computations
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
  const exceededCount = configured.filter((c) => c.isExceeded).length;
  const warningCount = configured.filter((c) => c.isWarning).length;

  // Prioritization for compact view (up to 3 categories)
  const prioritizedCategories = [...categoryStats].sort((a, b) => {
    // 1. Exceeded categories first (needs attention)
    if (a.isExceeded && !b.isExceeded) return -1;
    if (!a.isExceeded && b.isExceeded) return 1;
    // 2. Warning categories second (>= 75%)
    if (a.isWarning && !b.isWarning) return -1;
    if (!a.isWarning && b.isWarning) return 1;
    // 3. Has budget with active spending
    if (a.hasBudget && !b.hasBudget) return -1;
    if (!a.hasBudget && b.hasBudget) return 1;
    // 4. Highest spending percentage
    return b.pct - a.pct || b.spent - a.spent;
  });

  const compactCategories = prioritizedCategories.slice(0, 3);

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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <AppIcon name="chart" className="h-4 w-4 text-[var(--blue)] shrink-0" />
          <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">
            Presupuestos Mensuales
          </h2>

          {/* Quick Summary Pill */}
          <span className="text-xs font-mono text-[var(--text-soft)]">
            {configured.length > 0 ? (
              <>
                <strong className="text-[var(--text)]">
                  <PrivacyAmount>{fmtMoney(totalSpent)}</PrivacyAmount>
                </strong>{' '}
                usados de{' '}
                <strong className="text-[var(--text)]">
                  <PrivacyAmount>{fmtMoney(totalBudget)}</PrivacyAmount>
                </strong>{' '}
                · {configured.length} configurados
              </>
            ) : (
              <span className="text-[var(--text-faint)]">Sin límites configurados</span>
            )}
          </span>

          {exceededCount > 0 && (
            <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
              ⚠ {exceededCount} {exceededCount === 1 ? 'excedido' : 'excedidos'}
            </span>
          )}
          {exceededCount === 0 && warningCount > 0 && (
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              ⚡ {warningCount} en alerta
            </span>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenCategoryManager && (
            <button
              type="button"
              onClick={onOpenCategoryManager}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
            >
              <AppIcon name="settings" className="h-3.5 w-3.5" />
              <span>Categorías</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--blue)] hover:text-[var(--blue-hover)] transition cursor-pointer shrink-0"
          >
            <span>{isExpanded ? 'Contraer resumen' : 'Ver todos / Gestionar →'}</span>
          </button>
        </div>
      </div>

      {/* COMPACT VIEW (Default) */}
      {!isExpanded ? (
        <div className="space-y-3 pt-2 border-t border-[var(--border)]">
          {configured.length === 0 ? (
            /* Compact Empty State */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-3.5 text-xs">
              <span className="text-[var(--text-soft)]">
                Todavía no definiste límites de gasto mensuales para tus categorías.
              </span>
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="rounded-lg bg-[var(--blue)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--blue-hover)] transition cursor-pointer shrink-0"
              >
                Configurar presupuestos
              </button>
            </div>
          ) : (
            <>
              {/* Slim Master Progress Bar */}
              {totalBudget > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-soft)]">
                    <span className="font-semibold text-[var(--text)]">Consumo mensual</span>
                    <span
                      className={`font-bold ${
                        globalPct >= 100
                          ? 'text-red-500'
                          : globalPct >= 75
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      }`}
                    >
                      {globalPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        globalPct >= 100
                          ? 'bg-red-500'
                          : globalPct >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(globalPct, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Max 3 Relevant Categories */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {compactCategories.map((item) => {
                  let barColor = 'bg-emerald-500';
                  let badgeClass = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
                  if (item.isExceeded) {
                    barColor = 'bg-red-500';
                    badgeClass = 'text-red-600 dark:text-red-400 bg-red-500/10';
                  } else if (item.isWarning) {
                    barColor = 'bg-amber-500';
                    badgeClass = 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
                  }

                  return (
                    <div
                      key={item.category}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2 hover:border-[var(--border-hover)] transition"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-bold text-[var(--text)] truncate">
                            {item.category}
                          </span>
                          {!item.active && (
                            <span className="text-[9px] text-[var(--text-faint)] font-normal shrink-0">
                              (archivada)
                            </span>
                          )}
                        </div>
                        {item.hasBudget ? (
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${badgeClass}`}
                          >
                            {item.pct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-faint)] italic">Sin fijar</span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono">
                        <span className="font-bold text-[var(--text)]">
                          <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount>
                        </span>
                        <span className="text-[var(--text-soft)]">
                          {' '}
                          /{' '}
                          {item.hasBudget ? (
                            <PrivacyAmount>{fmtMoney(item.budget)}</PrivacyAmount>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>

                      {item.hasBudget && (
                        <div className="h-1.5 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${Math.min(item.pct, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Quick Trigger */}
              <div className="pt-1 flex items-center justify-between text-xs text-[var(--text-soft)]">
                <span className="text-[11px] text-[var(--text-faint)]">
                  Mostrando las 3 categorías más relevantes
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  className="font-semibold text-[var(--blue)] hover:underline cursor-pointer"
                >
                  Ver todas las categorías ({categories.length}) →
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* EXPANDED FULL VIEW */
        <div className="space-y-4 pt-3 border-t border-[var(--border)]">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
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
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
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
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  filter === 'alerts'
                    ? 'bg-red-500 text-white'
                    : 'text-red-600 dark:text-red-400 hover:text-red-500 bg-red-500/10'
                }`}
              >
                Alertas ({exceededCount + warningCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
            >
              Cerrar lista ↑
            </button>
          </div>

          {/* Master Progress Bar in Expanded View */}
          {totalBudget > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[var(--text)]">Consumo Global</span>
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  <strong className="text-[var(--text)]">
                    <PrivacyAmount>{fmtMoney(totalSpent)}</PrivacyAmount>
                  </strong>{' '}
                  gastados de{' '}
                  <strong className="text-[var(--text)]">
                    <PrivacyAmount>{fmtMoney(totalBudget)}</PrivacyAmount>
                  </strong>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[var(--bg)] overflow-hidden border border-[var(--border)]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    globalPct >= 100
                      ? 'bg-red-500'
                      : globalPct >= 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(globalPct, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Category Progress Bars List */}
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredCategories.map((item) => {
              const currentCatKey = item.categoryId || item.category;
              const isEditing = editingCategory === currentCatKey;
              const displayPct = item.hasBudget ? Math.min(item.pct, 100) : 0;

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
                  key={currentCatKey}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2 hover:border-[var(--blue)]/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-[var(--text)]">
                        {item.category}
                      </span>
                      {!item.active && (
                        <span className="text-[10px] text-[var(--text-faint)] font-normal">
                          (archivada)
                        </span>
                      )}
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

                    {/* Right: Amounts & Inline Budget Config */}
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
                            onClick={() => saveEdit(currentCatKey)}
                            className="rounded-lg bg-[var(--blue)] text-white px-2 py-1 text-[11px] font-bold cursor-pointer"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategory(null)}
                            className="rounded-lg border border-[var(--border)] px-1.5 py-1 text-[11px] text-[var(--text-faint)] cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="text-right font-mono text-xs">
                            <span className="font-bold text-[var(--text)]">
                              <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount>
                            </span>
                            <span className="text-[var(--text-soft)]">
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
                            onClick={() => startEdit(currentCatKey, item.budget)}
                            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-semibold text-[var(--blue)] hover:bg-[var(--blue-soft)] cursor-pointer"
                            title="Modificar presupuesto de esta categoría"
                          >
                            {item.hasBudget ? 'Editar' : 'Fijar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {item.hasBudget ? (
                    <div className="space-y-1">
                      <div className="relative h-2 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden">
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
                          Límite: <PrivacyAmount>{fmtMoney(item.budget)}</PrivacyAmount>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-faint)]">
                      <span>Gastado este mes: <PrivacyAmount>{fmtMoney(item.spent)}</PrivacyAmount></span>
                      <button
                        type="button"
                        onClick={() => startEdit(currentCatKey, 0)}
                        className="text-[10px] font-medium text-[var(--blue)] hover:underline cursor-pointer"
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

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
            >
              ↑ Volver a vista compacta
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
