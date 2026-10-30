import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { LifeOSState } from '../types';
import { formatMoney, todayISO, diffMoney, sumMoney, sameYear } from '../lib/storage';
import { getCategoryName } from '../lib/financeCategories';
import {
  deriveAllMonthlyBudgetStatuses,
  deriveMonthlyBudgetStatus,
} from '../lib/financeBudget';
import {
  calcNetWorth,
  calcIncomeMonth,
  calcFixedSpentMonth,
  calcMonthComparison,
  calcSpentByCategory,
  calcSpentByCategoryAllTime,
  calcCashOutflowMonth,
  calcTotalAcquisitionsMonth,
  calcAcquisitionsByCategory,
  groupTransactionsByMonth,
  resolveTransactionCurrency,
} from '../lib/calculations';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceAnalyticsViewProps {
  state: LifeOSState;
  ingresoMes: number;
  gastadoMes: number;
  balanceMes: number;
  patrimonioNeto: number;
  fijoMes: number;
  gastoVariable: number;
  totalGastadoAnio: number;
  gananciaReventa: number | null;
  gananciaReventaMoneda: string | null;
  catSpentThisMonth: Record<string, number>;
  catSpentAllTime: Record<string, number>;
  monthlyEvolutionData: { name: string; Gastos: number; Ingresos: number }[];
  cmp: { dir: 'up' | 'down' | 'flat'; pct: number };
  onSetBudget?: (categoryId: string, amountStr: string, month?: string, currency?: string) => void;
  onSetGlobalBudget?: (month: string, limit: number | null, currency?: string) => void;
  onOpenCategoryManager?: () => void;
}

const PALETTE = [
  '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6',
  '#06B6D4', '#F97316', '#6366F1', '#14B8A6', '#84CC16',
];

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

export const FinanceAnalyticsView: React.FC<FinanceAnalyticsViewProps> = ({
  state,
  ingresoMes: _ingresoMes,
  gastadoMes: _gastadoMes,
  balanceMes: _balanceMes,
  patrimonioNeto: _patrimonioNeto,
  fijoMes: _fijoMes,
  gastoVariable: _gastoVariable,
  totalGastadoAnio: _totalGastadoAnio,
  gananciaReventa,
  gananciaReventaMoneda,
  catSpentThisMonth: _catSpentThisMonth,
  catSpentAllTime: _catSpentAllTime,
  monthlyEvolutionData: _monthlyEvolutionData,
  cmp: _cmp,
  onSetBudget,
  onSetGlobalBudget,
  onOpenCategoryManager,
}) => {
  // Budget & Month Navigation State
  const currentMonthIso = useMemo(() => todayISO().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthIso);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('UYU');

  // Dual Reading Mode State: 'cash_flow' (salidas reales) vs 'acquisitions' (consumo adquirido devengado)
  const [analyticsMode, setAnalyticsMode] = useState<'cash_flow' | 'acquisitions'>('cash_flow');

  // Inline Budget Editing State
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [tempGlobalBudget, setTempGlobalBudget] = useState('');

  // Toggles for Progressive Disclosure
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showCategoryChart, setShowCategoryChart] = useState(false);
  const [showAllTimeCategories, setShowAllTimeCategories] = useState(false);

  // Multi-currency detection
  const allCurrencies = useMemo(() => {
    if (!state) return ['UYU'];
    return Object.keys(deriveAllMonthlyBudgetStatuses(state, selectedMonth));
  }, [state, selectedMonth]);

  const activeCurrency = allCurrencies.includes(selectedCurrency) ? selectedCurrency : (allCurrencies[0] || 'UYU');

  const formatCurr = (val: number) => {
    return formatMoney(val, activeCurrency);
  };

  const activeNetWorth = useMemo(() => {
    return calcNetWorth(state, activeCurrency);
  }, [state, activeCurrency]);

  const monthOffset = useMemo(() => {
    const [sy, sm] = selectedMonth.split('-').map(Number);
    const [ty, tm] = currentMonthIso.split('-').map(Number);
    return (sy - ty) * 12 + (sm - tm);
  }, [selectedMonth, currentMonthIso]);

  // Dual metrics: Cash Outflow vs Acquisitions
  const cashOutflow = useMemo(() => {
    return calcCashOutflowMonth(state, monthOffset, activeCurrency);
  }, [state, monthOffset, activeCurrency]);

  const acquisitions = useMemo(() => {
    return calcTotalAcquisitionsMonth(state, monthOffset, activeCurrency);
  }, [state, monthOffset, activeCurrency]);

  const scopedMonthCatAcquisitions = useMemo(() => {
    return calcAcquisitionsByCategory(state, monthOffset, activeCurrency);
  }, [state, monthOffset, activeCurrency]);

  // Monthly Budget Status Report
  const report = useMemo(() => {
    return deriveMonthlyBudgetStatus(state, selectedMonth, activeCurrency);
  }, [state, selectedMonth, activeCurrency]);

  const configuredCategories = report.categories.filter((c) => c.hasBudget);
  const totalCategoryBudget = configuredCategories.reduce((acc, c) => acc + (c.limit || 0), 0);
  const effectiveLimit = report.globalLimit ?? (totalCategoryBudget > 0 ? totalCategoryBudget : null);
  const effectiveSpent = report.totalSpent;
  const effectiveRemaining = effectiveLimit !== null ? effectiveLimit - effectiveSpent : null;
  const effectivePct = effectiveLimit && effectiveLimit > 0 ? (effectiveSpent / effectiveLimit) * 100 : 0;
  const isGlobalOverrun = effectiveLimit !== null && effectiveSpent > effectiveLimit;

  // Currency-scoped metrics
  const scopedIngreso = useMemo(() => calcIncomeMonth(state, monthOffset, activeCurrency), [state, monthOffset, activeCurrency]);
  const currentBalanceMes = diffMoney(scopedIngreso, effectiveSpent);
  const scopedFijoMes = useMemo(() => calcFixedSpentMonth(state, monthOffset, activeCurrency), [state, monthOffset, activeCurrency]);
  const currentGastoVariable = Math.max(0, diffMoney(effectiveSpent, scopedFijoMes));
  const currentCmp = useMemo(() => calcMonthComparison(state, activeCurrency), [state, activeCurrency]);

  const scopedTotalGastadoAnio = useMemo(() => {
    const today = new Date();
    return (state.finance?.transactions || [])
      .filter((t) => {
        if (t.type !== 'gasto' || t.origin === 'adjustment' || !sameYear(t.date, today)) return false;
        return resolveTransactionCurrency(t, state.finance?.accounts || []) === activeCurrency;
      })
      .reduce((s, t) => sumMoney(s, Number(t.amount || 0)), 0);
  }, [state, activeCurrency]);

  const scopedMonthCatSpent = useMemo(() => calcSpentByCategory(state, monthOffset, activeCurrency), [state, monthOffset, activeCurrency]);
  const scopedAllTimeCatSpent = useMemo(() => calcSpentByCategoryAllTime(state, activeCurrency), [state, activeCurrency]);

  const scopedMonthlyEvolutionData = useMemo(() => {
    const groups = groupTransactionsByMonth(state, activeCurrency);
    return [...groups]
      .reverse()
      .slice(-6)
      .map((g) => ({
        name: g.label.slice(0, 3),
        Gastos: g.totalGasto,
        Ingresos: g.totalIngreso,
      }));
  }, [state, activeCurrency]);

  const displayCategories = showAllCategories
    ? report.categories
    : configuredCategories.length > 0
    ? configuredCategories
    : report.categories.slice(0, 8);

  // Category Distribution for Chart (Adapts to Dual Mode)
  const activeCategorySpentMap = analyticsMode === 'acquisitions' ? scopedMonthCatAcquisitions : scopedMonthCatSpent;
  const monthCategoriesForChart = Object.entries(activeCategorySpentMap)
    .filter(([_, val]) => Number(val) > 0)
    .map(([catKey, value]) => ({
      name: getCategoryName(state.finance?.categories, catKey),
      value: Number(value),
    }))
    .sort((a, b) => b.value - a.value);

  const distinctMonthCategoriesCount = monthCategoriesForChart.length;

  // All time categories for disclosure
  const allTimeCategories = Object.entries(scopedAllTimeCatSpent)
    .filter(([_, val]) => Number(val) > 0)
    .map(([catKey, value]) => ({
      name: getCategoryName(state.finance?.categories, catKey),
      value: Number(value),
    }))
    .sort((a, b) => b.value - a.value);

  // Historical data check
  const hasHistoricalData = scopedMonthlyEvolutionData.length >= 2;
  const comparisonText = !hasHistoricalData
    ? 'Primer mes registrado'
    : currentCmp.dir === 'flat'
    ? 'similar al mes pasado'
    : currentCmp.dir === 'up'
    ? `▲ ${currentCmp.pct.toFixed(0)}% más que el mes pasado`
    : `▼ ${currentCmp.pct.toFixed(0)}% menos que el mes pasado`;

  // Inline editing handlers
  const startEditCategory = (categoryId: string, currentBudget: number | null) => {
    setEditingCategory(categoryId);
    setTempBudget(currentBudget && currentBudget > 0 ? String(currentBudget) : '');
  };

  const saveEditCategory = (categoryId: string) => {
    if (onSetBudget) {
      onSetBudget(categoryId, tempBudget, selectedMonth, activeCurrency);
    }
    setEditingCategory(null);
  };

  const saveEditGlobal = () => {
    const val = Number(tempGlobalBudget);
    if (onSetGlobalBudget) {
      onSetGlobalBudget(selectedMonth, Number.isFinite(val) && val > 0 ? val : null, activeCurrency);
    }
    setEditingGlobal(false);
  };

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const name = item.name || item.payload?.name || item.dataKey;
      const value = item.value;
      return (
        <div className="finance-surface-raised border border-[var(--finance-border)] p-2.5 rounded-xl shadow-xl text-xs space-y-1 z-50">
          <p className="font-bold text-[var(--finance-text-primary)]">{name}</p>
          <p className="tabular-nums text-indigo-600 dark:text-indigo-400 font-bold">
            {formatCurr(Number(value || 0))}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* =========================================================================
          NIVEL 1: Lectura Principal del Mes (Gasto, Presupuesto, Variación, Balance)
          Editorial, sobrio, compacto y no un hero gigante.
         ========================================================================= */}
      <section className="finance-surface rounded-2xl p-5 sm:p-6 space-y-4">
        {/* Top Bar: Month Navigator + Multi-currency + Budget Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
              Resumen del mes
            </h2>

            {/* Month Navigator */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer px-1"
                title="Mes anterior"
              >
                ‹
              </button>
              <span className="font-bold text-[11px] min-w-[85px] text-center tabular-nums">
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

            {/* Multi-currency switch if applicable */}
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
                        : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Dual Reading Mode Selector */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setAnalyticsMode('cash_flow')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  analyticsMode === 'cash_flow'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                }`}
                title="Flujo de caja: salidas efectivas de dinero de tus cuentas"
              >
                Dinero pagado
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsMode('acquisitions')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  analyticsMode === 'acquisitions'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                }`}
                title="Compras al contado y financiadas del período"
              >
                Compras realizadas
              </button>
              <ContextualHelp label="Dinero pagado y compras realizadas">Dinero pagado incluye gastos y cuotas abonadas. Compras realizadas incluye compras al contado y financiadas; no implica que estén pagadas.</ContextualHelp>
            </div>
          </div>

          {/* Semantic Status Badge */}
          {effectiveLimit !== null ? (
            <span
              className={`text-[10px] font-bold tabular-nums px-2.5 py-1 rounded-full self-start sm:self-auto ${
                isGlobalOverrun
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : effectivePct >= 75
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isGlobalOverrun
                ? `Excedido (+${formatCurr(Math.abs(effectiveRemaining!))})`
                : `${effectivePct.toFixed(0)}% consumido`}
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-500/10 text-[var(--finance-text-muted)] self-start sm:self-auto">
              Sin presupuesto fijado
            </span>
          )}
        </div>

        {/* Asymmetric Reading Layout: Primary Anchor (Gasto & Presupuesto) + Complementary Balance & Inflow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-1">
          {/* Columna Principal (7 cols en lg): Gasto del período con Presupuesto Integrado */}
          <div className="lg:col-span-7 space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
                  {analyticsMode === 'cash_flow' ? 'Salidas reales de dinero' : 'Compras realizadas del período'}
                </span>
                {analyticsMode === 'acquisitions' && acquisitions.financedAcquisitions > 0 && (
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    Incluye {formatCurr(acquisitions.financedAcquisitions)} financiado
                  </span>
                )}
                {analyticsMode === 'cash_flow' && cashOutflow.debtPayments > 0 && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Incluye {formatCurr(cashOutflow.debtPayments)} en cuotas
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
                <PrivacyAmount as="span" className="font-black tabular-nums text-3xl sm:text-4xl text-rose-500 tracking-tight">
                  −{formatCurr(analyticsMode === 'cash_flow' ? cashOutflow.totalOutflow : acquisitions.totalAcquired)}
                </PrivacyAmount>
                <span className={`text-xs font-bold ${
                  !hasHistoricalData
                    ? 'text-[var(--finance-text-muted)]'
                    : currentCmp.dir === 'up'
                    ? 'text-rose-500'
                    : currentCmp.dir === 'down'
                    ? 'text-emerald-500'
                    : 'text-[var(--finance-text-muted)]'
                }`}>
                  {comparisonText}
                </span>
              </div>

              {/* Sub-breakdown without visual noise */}
              <div className="text-[11px] text-[var(--finance-text-muted)] pt-1 flex items-center gap-2 flex-wrap">
                {analyticsMode === 'cash_flow' ? (
                  <>
                    <span>Gastos operativos: <strong className="text-[var(--finance-text-primary)] tabular-nums">{formatCurr(cashOutflow.operationalSpent)}</strong></span>
                    <span>·</span>
                    <span>Pago de cuotas: <strong className="text-[var(--finance-text-primary)] tabular-nums">{formatCurr(cashOutflow.debtPayments)}</strong></span>
                  </>
                ) : (
                  <>
                    <span>Al contado: <strong className="text-[var(--finance-text-primary)] tabular-nums">{formatCurr(acquisitions.operationalSpent)}</strong></span>
                    <span>·</span>
                    <span>Financiado: <strong className="text-[var(--finance-text-primary)] tabular-nums">{formatCurr(acquisitions.financedAcquisitions)}</strong></span>
                    {acquisitions.financedItems.length > 0 && (
                      <span className="text-[10px] opacity-75">
                        ({acquisitions.financedItems.map((i) => `${i.title}: ${formatCurr(i.amount)}`).join(', ')})
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Presupuesto integrado: Barra y estado directo sin widget gigante */}
            {effectiveLimit !== null ? (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--finance-text-muted)] flex items-center gap-1.5">
                    <span>Límite mensual:</span>
                    <PrivacyAmount as="strong" className="tabular-nums text-[var(--finance-text-primary)]">
                      {formatCurr(effectiveLimit)}
                    </PrivacyAmount>
                  </span>
                  <span className={`tabular-nums font-bold text-xs ${
                    isGlobalOverrun
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <PrivacyAmount as="span">
                      {isGlobalOverrun
                        ? `Excedido por −${formatCurr(Math.abs(effectiveRemaining!))}`
                        : `Restan ${formatCurr(effectiveRemaining!)}`}
                    </PrivacyAmount>
                  </span>
                </div>
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
                <div className="flex items-center justify-between text-[10px] text-[var(--finance-text-muted)] tabular-nums">
                  <span>{effectivePct.toFixed(0)}% del límite consumido</span>
                  <span>{effectiveRemaining !== null && effectiveRemaining >= 0 ? `${(100 - effectivePct).toFixed(0)}% margen restante` : 'Límite superado'}</span>
                </div>
              </div>
            ) : (
              <div className="pt-1 flex items-center gap-2 text-xs text-[var(--finance-text-muted)]">
                <span>Sin límite mensual asignado.</span>
                <button
                  type="button"
                  onClick={() => {
                    setTempGlobalBudget('');
                    setEditingGlobal(true);
                  }}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Fijar presupuesto
                </button>
              </div>
            )}
          </div>

          {/* Columna Secundaria (5 cols en lg): Balance Neto y Entradas en formato compacto */}
          <div className="lg:col-span-5 lg:border-l lg:border-[var(--finance-border)] lg:pl-6 space-y-4">
            {/* Resultado Operativo Neto (Flujo del mes) */}
            <div>
              <span className="flex items-center gap-1 text-sm font-semibold text-[var(--finance-text-muted)]">
                Ingresos menos gastos
                <ContextualHelp label="Ingresos menos gastos">Ingresos registrados menos gastos del presupuesto. Excluye amortizaciones de capital y ajustes de saldo; no representa el dinero disponible en tus cuentas.</ContextualHelp>
              </span>
              <PrivacyAmount
                as="div"
                className={`font-black tabular-nums text-2xl sm:text-3xl tracking-tight mt-0.5 ${
                  currentBalanceMes < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {currentBalanceMes >= 0 ? `+${formatCurr(currentBalanceMes)}` : formatCurr(currentBalanceMes)}
              </PrivacyAmount>
            </div>

            {/* Ingresos del mes (Métrica secundaria compacta) */}
            <div className="pt-2 border-t border-[var(--finance-border)] flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
                  Ingresos registrados
                </span>
                <span className="text-[11px] text-[var(--finance-text-muted)]">
                  entradas registradas
                </span>
              </div>
              <PrivacyAmount as="span" className="font-bold tabular-nums text-base text-emerald-600 dark:text-emerald-400">
                +{formatCurr(scopedIngreso)}
              </PrivacyAmount>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          NIVEL 2: Tendencia / Evolución Histórica
          Protagonista claro cuando hay datos multi-mes. Empty state compacto si no.
         ========================================================================= */}


      {/* =========================================================================
          NIVEL 3: Presupuesto y Desglose por Categorías
          Límites planificados + gasto real + escaneo ágil sin carditis.
         ========================================================================= */}
      <section className="finance-surface rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--finance-border)]">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
              Presupuesto por categoría
            </h3>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
              Gastos y límites de {formatMonthTitle(selectedMonth)}
            </p>
          </div>

          {/* Secondary Controls & View Toggles */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
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
                  className="finance-control w-24 px-2 py-1 rounded-lg border text-xs outline-none"
                  placeholder="Límite"
                />
                <button
                  type="button"
                  onClick={saveEditGlobal}
                  className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[10px] cursor-pointer"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGlobal(false)}
                  className="px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : onSetGlobalBudget ? (
              <button
                type="button"
                onClick={() => {
                  setTempGlobalBudget(report.globalLimit ? String(report.globalLimit) : '');
                  setEditingGlobal(true);
                }}
                className="finance-control px-2.5 py-1 text-xs font-semibold rounded-xl border cursor-pointer hover:border-[var(--finance-border-strong)] min-h-[34px]"
              >
                {report.globalLimit ? 'Modificar límite global' : '+ Fijar límite global'}
              </button>
            ) : null}

            {onOpenCategoryManager && (
              <button
                type="button"
                onClick={onOpenCategoryManager}
                className="finance-control px-2.5 py-1 text-xs font-semibold rounded-xl border cursor-pointer hover:border-[var(--finance-border-strong)] min-h-[34px]"
              >
                Categorías
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAllCategories((prev) => !prev)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer px-1 min-h-[34px] flex items-center"
            >
              {showAllCategories ? 'Solo con límite' : 'Ver todas'}
            </button>

            {distinctMonthCategoriesCount >= 3 && (
              <button
                type="button"
                onClick={() => setShowCategoryChart((prev) => !prev)}
                className="text-xs font-bold text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] hover:underline cursor-pointer px-1 min-h-[34px] flex items-center"
              >
                {showCategoryChart ? 'Ocultar gráfico' : 'Ver distribución circular'}
              </button>
            )}
          </div>
        </div>

        {/* Empty state if no budgets configured */}
        {!report.hasBudget && configuredCategories.length === 0 && !showAllCategories ? (
          <div className="p-4 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-[var(--finance-text-muted)]">
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
                <tr className="border-b border-[var(--finance-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Límite Planificado</th>
                  <th className="py-2.5 px-3">Gastado Real</th>
                  <th className="py-2.5 px-3">Restante / Excedido</th>
                  <th className="py-2.5 px-4 text-right">Progreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--finance-border)]">
                {displayCategories.map((item) => {
                  const isEditing = editingCategory === item.categoryId;
                  return (
                    <tr
                      key={item.categoryId}
                      className="hover:bg-[var(--finance-surface-hover)] transition-colors group"
                    >
                      {/* Categoría */}
                      <td className="py-2.5 px-3 font-semibold text-[var(--finance-text-primary)]">
                        <span>{item.categoryName}</span>
                      </td>

                      {/* Límite Planificado (Editable in-place) */}
                      <td className="py-2.5 px-3 tabular-nums text-[var(--finance-text-secondary)]">
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
                              className="finance-control w-20 px-2 py-0.5 rounded border border-indigo-500 text-xs outline-none"
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
                            title="Clic para editar límite"
                          >
                            <PrivacyAmount>{item.hasBudget && item.limit ? formatCurr(item.limit) : 'Fijar'}</PrivacyAmount>
                            <AppIcon name="edit" className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Gastado Real */}
                      <td className="py-2.5 px-3 tabular-nums font-semibold text-[var(--finance-text-primary)]">
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
                          <span className="text-[var(--finance-text-muted)]">—</span>
                        )}
                      </td>

                      {/* Progreso Bar + Pct */}
                      <td className="py-2.5 px-4 text-right">
                        {item.hasBudget ? (
                          <div className="flex items-center justify-end gap-2.5">
                            <div className="w-20 sm:w-24 h-1.5 rounded-full bg-[var(--finance-border)] overflow-hidden">
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
                                : 'text-[var(--finance-text-secondary)]'
                            }`}>
                              {item.pct.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--finance-text-muted)] text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Optional Donut Chart Panel (Progressive Disclosure if 3+ categories) */}
        {showCategoryChart && distinctMonthCategoriesCount >= 3 && (
          <div className="mt-4 pt-4 border-t border-[var(--finance-border)] grid grid-cols-1 md:grid-cols-2 gap-4 items-center animate-in fade-in">
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={monthCategoriesForChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {monthCategoriesForChart.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {monthCategoriesForChart.map((cat, index) => {
                const pct = effectiveSpent > 0 ? (cat.value / effectiveSpent) * 100 : 0;
                return (
                  <div key={cat.name} className="flex items-center justify-between text-xs py-1 border-b border-[var(--finance-border)]">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
                      <span className="font-semibold text-[var(--finance-text-primary)]">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-[10px] text-[var(--finance-text-muted)]">{pct.toFixed(0)}%</span>
                      <PrivacyAmount as="span" className="font-bold text-[var(--finance-text-primary)]">
                        {formatCurr(cat.value)}
                      </PrivacyAmount>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          NIVEL 4: Estructura Fijo/Variable y Métricas Complementarias (Segundo Nivel)
          Sin cuatro cards independientes: tira tipográfica abierta y ratios compactos.
         ========================================================================= */}
      <section className="finance-surface rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
            Ingresos y gastos por mes
          </h3>
        </div>

        {hasHistoricalData ? (
          <div className="h-48 sm:h-52 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scopedMonthlyEvolutionData} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--finance-text-muted)', fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis
                  width={52}
                  tick={{ fill: 'var(--finance-text-muted)', fontSize: 13 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
                    return String(v);
                  }}
                />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />
                <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '13px' }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Compact Empty State (No huge void eating screen) */
          <div className="p-3.5 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] flex items-center gap-3 text-xs">
            <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <AppIcon name="activity" className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-[var(--finance-text-primary)]">
                Todavía no hay meses para comparar
              </span>
              <p className="text-[11px] text-[var(--finance-text-muted)] mt-0.5">
                Se activa al registrar movimientos en un segundo mes.
              </p>
            </div>
          </div>
        )}
      </section>

      <details className="finance-surface rounded-2xl p-4 sm:p-5 space-y-4">
        <summary className="min-h-11 cursor-pointer text-base font-bold text-[var(--finance-text-primary)]">Más detalles del mes <span className="ml-2 text-sm font-normal text-[var(--finance-text-muted)]">Gastos fijos, patrimonio e histórico</span></summary>
        {/* Fila A: Estructura de Rigidez del Gasto (Fijo vs Variable) */}
        <div className="p-3.5 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                  Gasto Fijo
                </span>
                <PrivacyAmount as="span" className="font-bold tabular-nums text-sm text-[var(--finance-text-primary)]">
                  {formatCurr(scopedFijoMes)}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--finance-text-muted)] block">
                  {effectiveSpent > 0 ? `${Math.round((scopedFijoMes / effectiveSpent) * 100)}%` : '0%'} del gasto
                </span>
              </div>

              <div className="w-px h-6 bg-[var(--finance-border)]" />

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                  Gasto Variable
                </span>
                <PrivacyAmount as="span" className="font-bold tabular-nums text-sm text-[var(--finance-text-primary)]">
                  {formatCurr(currentGastoVariable)}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--finance-text-muted)] block">
                  {effectiveSpent > 0 ? `${Math.round((currentGastoVariable / effectiveSpent) * 100)}%` : '0%'} del gasto
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Parte fija del gasto
              </span>
              <span className="font-bold tabular-nums text-sm text-[var(--finance-text-primary)]">
                {effectiveSpent > 0 ? `${Math.round((scopedFijoMes / effectiveSpent) * 100)}%` : '0%'} fijo
              </span>
            </div>
          </div>

          {/* Compact Ratio Bar */}
          {effectiveSpent > 0 && (
            <div className="h-1.5 w-full rounded-full bg-[var(--finance-border)] overflow-hidden flex">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${Math.min(Math.round((scopedFijoMes / effectiveSpent) * 100), 100)}%` }}
                title="Gasto fijo"
              />
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(Math.round((currentGastoVariable / effectiveSpent) * 100), 100)}%` }}
                title="Gasto variable"
              />
            </div>
          )}
        </div>

        {/* Fila B: Indicadores Secundarios en Tira Tipográfica Abierta (Sin Cards Equivalentes) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1 text-xs border-t border-[var(--finance-border)]">
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
              Gastos del año
            </span>
            <PrivacyAmount as="span" className="font-bold tabular-nums text-base text-[var(--finance-text-primary)] block mt-0.5">
              {formatCurr(scopedTotalGastadoAnio)}
            </PrivacyAmount>
            <span className="text-[10px] text-[var(--finance-text-muted)] block">año en curso</span>
          </div>

          {gananciaReventa !== null && gananciaReventaMoneda === activeCurrency && gananciaReventa > 0 ? (
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Ganancia Reventa
              </span>
              <PrivacyAmount as="span" className="font-bold tabular-nums text-base text-emerald-600 dark:text-emerald-400 block mt-0.5">
                +{formatCurr(gananciaReventa)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--finance-text-muted)] block">margen neto acumulado</span>
            </div>
          ) : (
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Ingresos destinados a gastos
              </span>
              <span className="font-bold tabular-nums text-base text-[var(--finance-text-primary)] block mt-0.5">
                {scopedIngreso > 0 ? `${Math.round((effectiveSpent / scopedIngreso) * 100)}%` : '0%'}
              </span>
              <span className="text-[10px] text-[var(--finance-text-muted)] block">gasto vs ingresos</span>
            </div>
          )}

          <div className="col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
              Patrimonio neto
            </span>
            <PrivacyAmount as="span" className="font-bold tabular-nums text-base text-[var(--finance-text-primary)] block mt-0.5">
              {formatCurr(activeNetWorth)}
            </PrivacyAmount>
            <span className="text-[10px] text-[var(--finance-text-muted)] block">
              {activeCurrency === 'USD' ? 'cuentas − deudas en USD' : 'activos − pasivos acumulados'}
            </span>
          </div>
        </div>

        {/* Fila C: Histórico Acumulado por Categoría (Progressive Disclosure) */}
        <div className="pt-2 border-t border-[var(--finance-border)]">
          <button
            type="button"
            onClick={() => setShowAllTimeCategories(!showAllTimeCategories)}
            className="w-full flex items-center justify-between text-left cursor-pointer py-1"
          >
            <div>
              <h4 className="text-xs font-bold text-[var(--finance-text-primary)]">
                Histórico acumulado por categoría
              </h4>
              <p className="text-[11px] text-[var(--finance-text-muted)]">
                Todo el gasto acumulado en el libro diario
              </p>
            </div>
            <span className="text-xs text-[var(--finance-text-muted)] font-bold">
              {showAllTimeCategories ? 'Ocultar ▴' : 'Ver detalle ▾'}
            </span>
          </button>

          {showAllTimeCategories && (
            <div className="mt-3 pt-3 border-t border-[var(--finance-border)] space-y-2 animate-in fade-in">
              {allTimeCategories.length === 0 ? (
                <p className="text-xs text-[var(--finance-text-muted)] py-1">Sin gastos históricos.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 divide-y sm:divide-y-0">
                  {allTimeCategories.map((c) => (
                    <div
                      key={c.name}
                      className="py-1.5 px-2 rounded-lg flex items-center justify-between text-xs hover:bg-[var(--finance-surface-hover)] transition-colors"
                    >
                      <span className="font-medium text-[var(--finance-text-primary)] truncate">{c.name}</span>
                      <PrivacyAmount as="span" className="font-bold tabular-nums text-[var(--finance-text-secondary)]">
                        {formatCurr(c.value)}
                      </PrivacyAmount>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
};
