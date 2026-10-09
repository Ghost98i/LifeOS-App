import React, { useMemo, useState } from 'react';
import { CashflowWindow, FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { deriveCashflowProjection } from '../lib/financeCashflow';
import { fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { FinanceBalanceAtmosphere } from './visual/FinanceBalanceAtmosphere';

interface FinanceHeroProps {
  state: LifeOSState;
  cashFlow: CashFlowProjectionResult;
  variant?: 'full' | 'compact';
  displayMode?: 'actual_balance' | 'real_available' | 'both';
  showCommitmentsStrip?: boolean;
  onOpenNewTx: () => void;
  onOpenTransfer: () => void;
  onOpenCommitmentModal?: () => void;
  onOpenCushionModal?: () => void;
  onPayCommitment?: (com: FinancialCommitment) => void;
  onEditCommitment?: (com: FinancialCommitment) => void;
  onOpenCustomize?: () => void;
}

export const FinanceHero: React.FC<FinanceHeroProps> = ({
  state,
  cashFlow,
  variant = 'full',
  displayMode = 'actual_balance',
  onOpenNewTx,
  onOpenTransfer,
  onOpenCushionModal,
  onOpenCustomize,
}) => {
  const [selectedWindow, setSelectedWindow] = useState<CashflowWindow>('month');
  const windowProj = useMemo(() => deriveCashflowProjection(state, selectedWindow), [state, selectedWindow]);
  const currencies = useMemo(() => Object.keys(windowProj.summariesByCurrency), [windowProj]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('UYU');

  const activeCurrency = currencies.includes(selectedCurrency) ? selectedCurrency : (currencies[0] || 'UYU');
  const summary = windowProj.summariesByCurrency[activeCurrency] || {
    currency: activeCurrency,
    realBalance: cashFlow.currentBalance,
    committedExpenses: cashFlow.committed,
    availableAfterCommitments: cashFlow.realAvailable,
    expectedIncomes: cashFlow.totalExpectedIncome,
    projectedBalance: cashFlow.projectedBalance,
  };

  const realBalance = summary.realBalance;
  const committedAmount = summary.committedExpenses;
  const availableAfterCommitments = summary.availableAfterCommitments;
  const projectedBalance = summary.projectedBalance;

  const windowEvents = windowProj.events.filter((e) => e.currency === activeCurrency);
  const committedCount = windowEvents.filter((e) => e.type === 'committed_expense').length;

  const cushionStatus = cashFlow.cushionStatus;
  const isDeficit = projectedBalance < 0;

  const windowLabel = selectedWindow === '7d' ? '7 días' : selectedWindow === 'month' ? 'mes' : '30 días';

  const formatCurr = (val: number) => {
    if (activeCurrency === 'USD') {
      return `US$ ${Math.round(val).toLocaleString('es-UY')}`;
    }
    return fmtMoney(val);
  };

  const atmosphereStatus: 'healthy' | 'attention' | 'warning' | 'deficit' = isDeficit
    ? 'deficit'
    : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
    ? 'warning'
    : 'healthy';

  const statusDotClasses = `inline-block h-2.5 w-2.5 rounded-full transition-colors motion-reduce:transition-none ${
    isDeficit
      ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
      : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-2 ring-amber-500/30'
      : 'bg-emerald-500'
  }`;

  // =========================================================================
  // VARIANT: COMPACT (Cuentas, Análisis, Futuro)
  // Slim single/two-row header that provides context without pushing content
  // =========================================================================
  if (variant === 'compact') {
    return (
      <section className="finance-surface relative overflow-hidden rounded-2xl p-4 sm:p-5 border border-[var(--finance-border)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Main KPI: Saldo Real */}
          <div className="flex items-center gap-3">
            <span className={statusDotClasses} title={isDeficit ? 'Riesgo de déficit' : 'Liquidez saludable'} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">
                  Saldo real
                </span>
                {currencies.length > 1 && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    {activeCurrency}
                  </span>
                )}
              </div>
              <PrivacyAmount
                as="div"
                className="text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums text-[var(--finance-text-primary)]"
              >
                {formatCurr(realBalance)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Subordinate Contextual Metrics */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Disponible tras compromisos
              </span>
              <PrivacyAmount
                as="span"
                className={`font-mono font-bold text-sm ${
                  availableAfterCommitments < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurr(availableAfterCommitments)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-6 bg-[var(--finance-border)]" />

            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Comprometido ({windowLabel})
              </span>
              <PrivacyAmount as="span" className="font-mono font-bold text-sm text-[var(--finance-text-secondary)]">
                −{formatCurr(committedAmount)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-6 bg-[var(--finance-border)]" />

            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                  Proyectado
                </span>
                <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1 rounded">
                  Proy.
                </span>
              </div>
              <PrivacyAmount
                as="span"
                className={`font-mono font-bold text-sm ${
                  projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--finance-text-primary)]'
                }`}
              >
                {formatCurr(projectedBalance)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Compact Actions */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={onOpenTransfer}
              className="finance-control px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[38px]"
              title="Transferir dinero entre cuentas propias"
            >
              <AppIcon name="repeat" className="h-3.5 w-3.5" />
              <span>Transferir</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewTx}
              className="py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all min-h-[38px]"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Movimiento</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // VARIANT: FULL (Resumen & Operación)
  // Focused, editorial header inspired by Monarch Money + LifeOS
  // Clear hierarchy: Saldo Real protagonist + 3 subordinate clarity metrics
  // =========================================================================
  return (
    <section className="finance-surface relative overflow-hidden rounded-3xl p-5 sm:p-7 border border-[var(--finance-border)]">
      {/* Soft atmospheric gradient */}
      <FinanceBalanceAtmosphere status={atmosphereStatus} />

      <div className="relative z-10 space-y-5">
        {/* Top Eyebrow: Status signal + Window toggle + Multi-currency */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={statusDotClasses} />
            <span className="text-xs font-bold text-[var(--finance-text-primary)]">
              {isDeficit
                ? `Riesgo de déficit (${windowLabel})`
                : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                ? 'Por debajo del colchón de seguridad'
                : 'Liquidez saludable'}
            </span>

            {/* Currency Pill Selector if multi-currency exists */}
            {currencies.length > 1 && (
              <div className="flex items-center gap-1 ml-1 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs font-mono font-bold">
                {currencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCurrency(c)}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      activeCurrency === c
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Window & Settings tools */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setSelectedWindow('7d')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedWindow === '7d'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                }`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setSelectedWindow('month')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedWindow === 'month'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                }`}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setSelectedWindow('30d')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedWindow === '30d'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                }`}
              >
                30d
              </button>
            </div>

            {onOpenCushionModal && (
              <button
                type="button"
                onClick={onOpenCushionModal}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer hidden sm:inline-block px-1"
                title="Configurar colchón financiero mínimo"
              >
                Colchón: {fmtMoney(state.finance?.minCushion ?? 5000)}
              </button>
            )}

            {onOpenCustomize && (
              <button
                type="button"
                onClick={onOpenCustomize}
                className="finance-control p-1.5 rounded-xl border text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] cursor-pointer transition-colors"
                title="Personalizar vista de Finanzas"
              >
                <AppIcon name="settings" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Core Hierarchy: Protagonist Saldo Real + 3 Subordinate Clarity Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center">
          {/* Protagonist: Saldo Real (Left Col 1-5) */}
          <div className="lg:col-span-5 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
              {displayMode === 'real_available' ? 'Disponible real tras compromisos' : 'Saldo real en cuentas'}
            </span>

            <div className="flex items-baseline gap-3 flex-wrap">
              <PrivacyAmount
                as="h1"
                className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight tabular-nums text-[var(--finance-text-primary)]"
              >
                {formatCurr(displayMode === 'real_available' ? availableAfterCommitments : realBalance)}
              </PrivacyAmount>
              {isDeficit && (
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  Déficit previsto
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--finance-text-secondary)] leading-relaxed max-w-sm">
              {displayMode === 'real_available'
                ? 'Dinero utilizable tras reservar compromisos inmediatos.'
                : 'Dinero real consolidado en tus cuentas bancarias y billeteras.'}
            </p>
          </div>

          {/* Subordinate Clarity Metrics Strip (Cols 6-12) */}
          <div className="lg:col-span-7">
            <div className="p-4 rounded-2xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Metric 1: Disponible tras compromisos */}
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block truncate">
                  Disponible tras compromisos
                </span>
                <PrivacyAmount
                  as="div"
                  className={`text-lg sm:text-xl font-black font-mono tabular-nums ${
                    availableAfterCommitments < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatCurr(availableAfterCommitments)}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--finance-text-muted)] block">
                  Libre para gastar hoy
                </span>
              </div>

              {/* Metric 2: Comprometido */}
              <div className="space-y-0.5 sm:border-l sm:border-[var(--finance-border)] sm:pl-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block truncate">
                  Comprometido ({windowLabel})
                </span>
                <PrivacyAmount
                  as="div"
                  className="text-lg sm:text-xl font-black font-mono tabular-nums text-[var(--finance-text-secondary)]"
                >
                  −{formatCurr(committedAmount)}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--finance-text-muted)] block">
                  {committedCount} {committedCount === 1 ? 'pago inminente' : 'pagos inminentes'}
                </span>
              </div>

              {/* Metric 3: Proyectado (Secundario / Estimación) */}
              <div className="space-y-0.5 sm:border-l sm:border-[var(--finance-border)] sm:pl-3.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block truncate">
                    Proyectado
                  </span>
                  <span className="text-[8px] font-bold px-1 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    Proy.
                  </span>
                </div>
                <PrivacyAmount
                  as="div"
                  className={`text-lg sm:text-xl font-black font-mono tabular-nums ${
                    projectedBalance < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-[var(--finance-text-primary)]'
                  }`}
                >
                  {formatCurr(projectedBalance)}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--finance-text-muted)] block">
                  Estimación al cierre
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons (Touch targets >= 44px) */}
        <div className="pt-2 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewTx}
            className="flex-1 sm:flex-initial py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98 transition-all min-h-[44px]"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            <span>+ Movimiento</span>
          </button>

          <button
            type="button"
            onClick={onOpenTransfer}
            className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-raised)] hover:bg-[var(--finance-surface-hover)] text-xs font-bold text-[var(--finance-text-primary)] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 min-h-[44px]"
            title="Mover dinero entre cuentas propias"
          >
            <AppIcon name="repeat" className="h-4 w-4" />
            <span>Transferir</span>
          </button>
        </div>
      </div>
    </section>
  );
};
