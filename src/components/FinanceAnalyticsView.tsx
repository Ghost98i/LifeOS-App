import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { LifeOSState } from '../types';
import { fmtMoney } from '../lib/storage';
import { getCategoryName } from '../lib/financeCategories';
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
  gananciaReventa: number;
  catSpentThisMonth: Record<string, number>;
  catSpentAllTime: Record<string, number>;
  monthlyEvolutionData: { name: string; Gastos: number; Ingresos: number }[];
  cmp: { dir: 'up' | 'down' | 'flat'; pct: number };
}

const PALETTE = [
  '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6',
  '#06B6D4', '#F97316', '#6366F1', '#14B8A6', '#84CC16',
];

export const FinanceAnalyticsView: React.FC<FinanceAnalyticsViewProps> = ({
  state,
  ingresoMes,
  gastadoMes,
  balanceMes,
  patrimonioNeto,
  fijoMes,
  gastoVariable,
  totalGastadoAnio,
  gananciaReventa,
  catSpentThisMonth,
  catSpentAllTime,
  monthlyEvolutionData,
  cmp,
}) => {
  const [showAllTimeCategories, setShowAllTimeCategories] = useState(false);

  // Prepare current month category distribution
  const monthCategories = Object.entries(catSpentThisMonth)
    .filter(([_, val]) => Number(val) > 0)
    .map(([catKey, value]) => ({
      name: getCategoryName(state.finance?.categories, catKey),
      value: Number(value),
    }))
    .sort((a, b) => b.value - a.value);

  const distinctMonthCategoriesCount = monthCategories.length;

  // Prepare all time category distribution
  const allTimeCategories = Object.entries(catSpentAllTime)
    .filter(([_, val]) => Number(val) > 0)
    .map(([catKey, value]) => ({
      name: getCategoryName(state.finance?.categories, catKey),
      value: Number(value),
    }))
    .sort((a, b) => b.value - a.value);

  // Month comparison text
  const comparisonText = cmp.dir === 'flat'
    ? 'similar al mes anterior'
    : cmp.dir === 'up'
    ? `▲ ${cmp.pct.toFixed(0)}% más que el mes pasado`
    : `▼ ${cmp.pct.toFixed(0)}% menos que el mes pasado`;

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const name = item.name || item.payload?.name || item.dataKey;
      const value = item.value;
      return (
        <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl shadow-xl text-xs space-y-1 z-50">
          <p className="font-bold text-[var(--text)]">{name}</p>
          <p className="font-mono text-[var(--blue)] font-bold">
            {fmtMoney(Number(value || 0))}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Editorial KPI Composition (Structured by Signal) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Month Inflow */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
          <span className="eyebrow block text-[10px] text-[var(--text-faint)]">Ingresos del Mes</span>
          <PrivacyAmount as="div" className="mt-1.5 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            +{fmtMoney(ingresoMes)}
          </PrivacyAmount>
          <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">entradas operativas</span>
        </div>

        {/* Month Outflow */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
          <span className="eyebrow block text-[10px] text-[var(--text-faint)]">Gastos del Mes</span>
          <PrivacyAmount as="div" className="mt-1.5 text-2xl font-black font-mono text-rose-500">
            −{fmtMoney(gastadoMes)}
          </PrivacyAmount>
          <span className={`text-[10px] font-bold block mt-0.5 ${
            cmp.dir === 'up' ? 'text-rose-500' : cmp.dir === 'down' ? 'text-emerald-500' : 'text-[var(--text-soft)]'
          }`}>
            {comparisonText}
          </span>
        </div>

        {/* Monthly Net Balance */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
          <span className="eyebrow block text-[10px] text-[var(--text-faint)]">Balance Neto</span>
          <PrivacyAmount as="div" className={`mt-1.5 text-2xl font-black font-mono ${balanceMes < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {balanceMes >= 0 ? `+${fmtMoney(balanceMes)}` : fmtMoney(balanceMes)}
          </PrivacyAmount>
          <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">
            {balanceMes >= 0 ? 'superávit mensual' : 'déficit mensual'}
          </span>
        </div>

        {/* Total Net Worth */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
          <span className="eyebrow block text-[10px] text-[var(--text-faint)]">Patrimonio Neto</span>
          <PrivacyAmount as="div" className="mt-1.5 text-2xl font-black font-mono text-[var(--text)]">
            {fmtMoney(patrimonioNeto)}
          </PrivacyAmount>
          <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">cuentas + activos − deudas</span>
        </div>
      </div>

      {/* Secondary Operational Signal Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-[var(--surface-muted)]/60 border border-[var(--border)] text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">Gasto Fijo</span>
          <PrivacyAmount as="span" className="font-mono font-bold text-sm text-[var(--text)]">
            {fmtMoney(fijoMes)}
          </PrivacyAmount>
          <span className="block text-[10px] text-[var(--text-soft)]">comprometido</span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">Gasto Variable</span>
          <PrivacyAmount as="span" className="font-mono font-bold text-sm text-[var(--text)]">
            {fmtMoney(gastoVariable)}
          </PrivacyAmount>
          <span className="block text-[10px] text-[var(--text-soft)]">discrecional</span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">Gasto en el Año</span>
          <PrivacyAmount as="span" className="font-mono font-bold text-sm text-[var(--text)]">
            {fmtMoney(totalGastadoAnio)}
          </PrivacyAmount>
          <span className="block text-[10px] text-[var(--text-soft)]">año en curso</span>
        </div>

        {gananciaReventa > 0 ? (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">Ganancia Reventa</span>
            <PrivacyAmount as="span" className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
              +{fmtMoney(gananciaReventa)}
            </PrivacyAmount>
            <span className="block text-[10px] text-[var(--text-soft)]">margen acumulado</span>
          </div>
        ) : (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">Estructura</span>
            <span className="font-mono font-bold text-sm text-[var(--text)]">
              {gastadoMes > 0 ? `${Math.round((fijoMes / gastadoMes) * 100)}%` : '0%'} fijo
            </span>
            <span className="block text-[10px] text-[var(--text-soft)]">ratio de rigidez</span>
          </div>
        )}
      </div>

      {/* Adaptive Chart 1: Monthly Evolution (Ingresos vs Gastos) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text)]">Evolución Mensual (Ingresos vs Gastos)</h2>
            <p className="text-xs text-[var(--text-soft)]">Tendencia de flujos reales a través de los últimos meses</p>
          </div>
        </div>

        {monthlyEvolutionData.length >= 2 ? (
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyEvolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gastos" fill="#EF4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-6 text-center rounded-xl bg-[var(--surface-muted)]/40 border border-dashed border-[var(--border)] text-xs text-[var(--text-soft)] space-y-1">
            <p className="font-semibold text-[var(--text)]">Aún no hay suficientes meses registrados</p>
            <p>A medida que registres movimientos en los próximos meses, verás el gráfico comparativo de barras.</p>
          </div>
        )}
      </div>

      {/* Adaptive Chart 2: Category Distribution This Month */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text)]">Distribución de Gastos por Categoría</h2>
            <p className="text-xs text-[var(--text-soft)]">Mes actual ({distinctMonthCategoriesCount} categorías con gasto)</p>
          </div>
          {distinctMonthCategoriesCount > 0 && (
            <span className="text-xs text-[var(--text-faint)]">
              Total: <PrivacyAmount as="strong" className="font-mono font-bold text-[var(--text)]">{fmtMoney(gastadoMes)}</PrivacyAmount>
            </span>
          )}
        </div>

        {/* Adaptive Policy */}
        {distinctMonthCategoriesCount === 0 ? (
          <div className="py-8 text-center rounded-xl bg-[var(--surface-muted)]/40 border border-dashed border-[var(--border)] text-xs text-[var(--text-soft)]">
            Sin gastos registrados este mes.
          </div>
        ) : distinctMonthCategoriesCount <= 2 ? (
          /* Compact Textual Breakdown for 1-2 categories (No giant donut) */
          <div className="p-4 rounded-xl bg-[var(--surface-muted)]/60 border border-[var(--border)] space-y-3">
            <p className="text-xs text-[var(--text-soft)]">
              El gasto de este mes está concentrado en {distinctMonthCategoriesCount === 1 ? 'una sola categoría' : 'dos categorías'}:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {monthCategories.map((cat) => {
                const pct = gastadoMes > 0 ? (cat.value / gastadoMes) * 100 : 0;
                return (
                  <div key={cat.name} className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[var(--text)] block">{cat.name}</span>
                      <span className="text-[10px] text-[var(--text-faint)]">{pct.toFixed(0)}% del total</span>
                    </div>
                    <PrivacyAmount as="span" className="font-mono font-black text-xs text-[var(--text)]">
                      {fmtMoney(cat.value)}
                    </PrivacyAmount>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Full Rich Donut Chart when 3+ categories exist */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-60 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={monthCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {monthCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Ranking Breakdown */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {monthCategories.map((cat, index) => {
                const pct = gastadoMes > 0 ? (cat.value / gastadoMes) * 100 : 0;
                return (
                  <div key={cat.name} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border)]/60">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
                      <span className="font-semibold text-[var(--text)]">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-faint)] font-mono">{pct.toFixed(0)}%</span>
                      <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                        {fmtMoney(cat.value)}
                      </PrivacyAmount>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: All-Time Breakdown (Progressive Disclosure) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
        <button
          type="button"
          onClick={() => setShowAllTimeCategories(!showAllTimeCategories)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--text)]">Histórico Acumulado por Categoría</h3>
            <p className="text-[11px] text-[var(--text-soft)]">Distribución de todo el gasto histórico cargado</p>
          </div>
          <span className="text-xs text-[var(--text-soft)] font-mono font-bold">
            {showAllTimeCategories ? 'Ocultar ▴' : 'Ver detalle ▾'}
          </span>
        </button>

        {showAllTimeCategories && (
          <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-2 animate-in fade-in">
            {allTimeCategories.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)] py-2">Sin gastos históricos.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {allTimeCategories.map((c) => (
                  <div key={c.name} className="p-2.5 rounded-xl bg-[var(--surface-muted)]/50 border border-[var(--border)] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text)] truncate">{c.name}</span>
                    <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text-soft)]">
                      {fmtMoney(c.value)}
                    </PrivacyAmount>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
