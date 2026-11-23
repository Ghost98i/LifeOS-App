import React, { useMemo, useState } from 'react';
import { FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult, calcIncomeMonth, calcSpentMonth } from '../lib/calculations';
import { deriveCashflowProjection } from '../lib/financeCashflow';
import { deriveMonthlySpendingPacing } from '../lib/financePacing';
import { formatMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { FinanceBalanceAtmosphere } from './visual/FinanceBalanceAtmosphere';
import { PARTIAL_FINANCE_SUMMARY } from '../lib/financeCurrencyPolicy';

export interface FinanceHeroProps {
  state: LifeOSState;
  cashFlow: CashFlowProjectionResult;
  variant?: 'full' | 'compact';
  displayMode?: 'actual_balance' | 'real_available' | 'both';
  showCommitmentsStrip?: boolean;
  isAccountsContext?: boolean;
  onOpenNewTx: () => void;
  onOpenNewTxType?: (type: 'gasto' | 'ingreso') => void;
  onOpenTransfer: () => void;
  onOpenAddAccount?: () => void;
  onNavigateTab?: (tab: 'movimientos' | 'cuentas' | 'analisis' | 'proyeccion') => void;
  onOpenCommitmentModal?: () => void;
  onOpenCushionModal?: () => void;
  onPayCommitment?: (com: FinancialCommitment) => void;
  onEditCommitment?: (com: FinancialCommitment) => void;
  onOpenCustomize?: () => void;
}

const CLEAN_FOCUS_RING =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

export const FinanceHero: React.FC<FinanceHeroProps> = ({
  state,
  variant = 'full',
  displayMode = 'actual_balance',
  isAccountsContext = false,
  onOpenNewTx,
  onOpenNewTxType,
  onOpenTransfer,
  onOpenAddAccount,
  onNavigateTab,
  onOpenCushionModal,
  onOpenCustomize,
}) => {
  // 1. Stable, explicit horizon: Current calendar month commitments ('month')
  // Multi-horizon temporal simulations (30d/60d/90d) are delegated exclusively to the Futuro tab.
  const windowProj = useMemo(
    () => deriveCashflowProjection(state, 'month'),
    [state]
  );

  // 2. Currencies grouping & active selection
  const currencies = useMemo(() => {
    const curs = Object.keys(windowProj.summariesByCurrency);
    return curs.length > 0 ? curs : ['UYU'];
  }, [windowProj]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('UYU');
  const [isDailyDetailsOpen, setIsDailyDetailsOpen] = useState<boolean>(false);

  const activeCurrency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];
  const monthIncome = calcIncomeMonth(state, 0, activeCurrency);
  const monthExpenses = calcSpentMonth(state, 0, activeCurrency);
  const pacing = useMemo(
    () => deriveMonthlySpendingPacing(state, activeCurrency),
    [state, activeCurrency]
  );

  // 3. Currency-specific summary
  const summary = windowProj.summariesByCurrency[activeCurrency] || {
    currency: activeCurrency,
    realBalance: 0,
    committedExpenses: 0,
    availableAfterCommitments: 0,
    expectedIncomes: 0,
    projectedBalance: 0,
  };

  const realBalance = summary.realBalance;
  const isPartial = windowProj.unconfirmedCurrencyEvents.length > 0;
  const committedAmount = summary.committedExpenses;
  const availableAfterCommitments = summary.availableAfterCommitments;
  const primaryIsAvailable = variant === 'full' && displayMode === 'real_available';
  const primaryBalance = primaryIsAvailable ? availableAfterCommitments : realBalance;

  const windowEvents = windowProj.events.filter((e) => e.currency === activeCurrency);
  const committedCount = windowEvents.filter((e) => e.type === 'committed_expense').length;

  const allAccounts = state.finance?.accounts || [];
  const isEmptyState = allAccounts.length === 0;
  const hasFinancialActivity = (state.finance.transactions?.length || 0) > 0
    || allAccounts.some((account) => Number(account.balance) !== 0 || Number(account.initialBalance || 0) !== 0)
    || windowProj.events.length > 0;

  // 4. Cushion & Liquidity Assessment (Rigorous, disjunct, no fake thresholds)
  const isUSD = activeCurrency === 'USD';
  const cushionEnabled = state.finance?.cushionEnabled !== false;
  const minCushionUYU = state.finance?.minCushion ?? 5000;

  let statusTone: 'healthy' | 'warning' | 'danger' | 'neutral' = 'healthy';
  let statusText = 'Saldo cubre los pagos pendientes';

  if (isEmptyState) {
    statusTone = 'neutral';
    statusText = 'Sin cuentas registradas';
  } else if (!hasFinancialActivity) {
    statusTone = 'neutral';
    statusText = 'Sin movimientos registrados';
  } else if (isUSD) {
    if (realBalance < 0) {
      statusTone = 'danger';
      statusText = 'Déficit en USD';
    } else if (availableAfterCommitments < 0) {
      statusTone = 'danger';
      statusText = 'Sobregiro inminente (USD)';
    } else if (availableAfterCommitments === 0) {
      statusTone = 'warning';
      statusText = 'Equilibrio estricto (USD)';
    } else {
      statusTone = 'healthy';
      statusText = 'Liquidez saludable (USD)';
    }
  } else {
    // Base currency UYU
    if (realBalance < 0) {
      statusTone = 'danger';
      statusText = 'Saldo negativo';
    } else if (availableAfterCommitments < 0) {
      statusTone = 'danger';
      statusText = 'Faltan fondos para los pagos del mes';
    } else if (availableAfterCommitments === 0) {
      statusTone = 'warning';
      statusText = 'Sin margen tras pagos';
    } else if (
      cushionEnabled &&
      (realBalance < minCushionUYU || availableAfterCommitments < minCushionUYU)
    ) {
      statusTone = 'warning';
      statusText = 'Bajo el colchón de seguridad';
    } else {
      statusTone = 'healthy';
      statusText = 'Saldo cubre los pagos pendientes';
    }
  }

  if (isPartial && statusTone !== 'danger') {
    statusTone = 'warning';
    statusText = 'Cálculo parcial: moneda sin confirmar';
  }

  const formatCurr = (val: number) => formatMoney(val, activeCurrency);

  const atmosphereStatus: 'healthy' | 'attention' | 'warning' | 'deficit' =
    statusTone === 'danger'
      ? 'deficit'
      : statusTone === 'warning'
      ? 'warning'
      : 'healthy';

  const statusDotClasses = `inline-block h-2 w-2 rounded-full shrink-0 transition-colors motion-reduce:transition-none ${
    statusTone === 'danger'
      ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
      : statusTone === 'warning'
      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-2 ring-amber-500/30'
      : statusTone === 'neutral'
      ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] ring-2 ring-indigo-500/30'
      : 'bg-emerald-500'
  }`;

  // 5. Direct 1-Tap Quick Actions (Gasto / Ingreso / Transferir)
  const renderQuickActions = (compactLayout = false) => {
    if (isEmptyState) {
      return (
        <button
          id="finance-movement-trigger"
          type="button"
          onClick={onOpenAddAccount ? onOpenAddAccount : onOpenNewTx}
          className={`w-full sm:w-auto py-2.5 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px] ${CLEAN_FOCUS_RING}`}
        >
          <AppIcon name="plus" className="h-4 w-4 shrink-0" />
          <span>Crear cuenta</span>
        </button>
      );
    }

    return (
      <div
        data-finance-quick-actions="true"
        className={`grid grid-cols-3 gap-1.5 sm:gap-2 ${
          compactLayout ? 'w-full md:w-auto md:flex md:items-center' : 'w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center'
        }`}
      >
        <button
          id="finance-movement-trigger"
          type="button"
          onClick={() => (onOpenNewTxType ? onOpenNewTxType('gasto') : onOpenNewTx())}
          className={`min-h-[44px] px-2 sm:px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${CLEAN_FOCUS_RING}`}
        >
          <AppIcon name="expense" className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span>Gasto</span>
        </button>

        <button
          type="button"
          onClick={() => (onOpenNewTxType ? onOpenNewTxType('ingreso') : onOpenNewTx())}
          className={`min-h-[44px] px-2 sm:px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/16 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/12 dark:hover:bg-emerald-500/20 dark:text-emerald-300 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${CLEAN_FOCUS_RING}`}
        >
          <AppIcon name="income" className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span>Ingreso</span>
        </button>

        <button
          type="button"
          onClick={onOpenTransfer}
          className={`finance-control min-h-[44px] px-2 sm:px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer transition-colors hover:border-indigo-500/40 ${CLEAN_FOCUS_RING}`}
        >
          <AppIcon name="transfer" className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-[var(--finance-text-secondary)]" />
          <span>Transferir</span>
        </button>
      </div>
    );
  };

  // =========================================================================
  // VARIANT: COMPACT (Cuentas, Análisis, Futuro)
  // =========================================================================
  if (variant === 'compact') {
    const secondaryCurrencies = isAccountsContext
      ? currencies.filter((c) => c !== activeCurrency)
      : [];

    return (
      <section className="finance-surface relative rounded-2xl p-4 sm:p-5 border border-[var(--finance-border)]">
        {isPartial && (
          <p role="status" className="relative z-10 mb-3 text-sm text-amber-800 dark:text-amber-200">
            {PARTIAL_FINANCE_SUMMARY}
          </p>
        )}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <FinanceBalanceAtmosphere status={atmosphereStatus} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          {/* Main KPI: Saldo Real */}
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <div className="flex items-baseline gap-4 flex-wrap min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={statusDotClasses} title={statusText} />
                    <span className="text-xs font-semibold text-[var(--finance-text-secondary)]">
                      Saldo real ({activeCurrency})
                    </span>
                    {currencies.length > 1 && (
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[10px] font-bold">
                        {currencies.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedCurrency(c)}
                            className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${CLEAN_FOCUS_RING} ${
                              activeCurrency === c
                                ? 'bg-[#4F46E5] text-white'
                                : 'text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)]'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <PrivacyAmount
                    as="div"
                    className="mt-0.5 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                  >
                    {formatCurr(realBalance)}
                  </PrivacyAmount>
                </div>

                {secondaryCurrencies.map((secCur) => {
                  const secBal = windowProj.summariesByCurrency[secCur]?.realBalance ?? 0;
                  return (
                    <div key={secCur} className="pl-3.5 border-l border-[var(--finance-border)]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[var(--finance-text-muted)]">
                          Saldo real ({secCur})
                        </span>
                      </div>
                      <PrivacyAmount
                        as="div"
                        className="mt-0.5 text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                      >
                        {formatMoney(secBal, secCur)}
                      </PrivacyAmount>
                    </div>
                  );
                })}
              </div>
            </div>

            {onOpenCushionModal && (
              <button
                type="button"
                onClick={onOpenCushionModal}
                className={`md:hidden finance-control min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl cursor-pointer text-[var(--finance-text-secondary)] shrink-0 ${CLEAN_FOCUS_RING}`}
                title="Configurar colchón mínimo"
                aria-label="Configurar colchón mínimo"
              >
                <AppIcon name="shield" className="h-4 w-4 text-indigo-500" />
              </button>
            )}
          </div>

          {/* Right: 1-Tap Quick Actions + Discrete Settings */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {renderQuickActions(true)}
            {onOpenCushionModal && (
              <button
                type="button"
                onClick={onOpenCushionModal}
                className={`hidden md:inline-flex finance-control min-h-[44px] min-w-[44px] items-center justify-center rounded-xl cursor-pointer text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] shrink-0 ${CLEAN_FOCUS_RING}`}
                title="Configurar colchón mínimo"
                aria-label="Configurar colchón mínimo"
              >
                <AppIcon name="shield" className="h-4 w-4 text-indigo-500" />
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // VARIANT: FULL (Movimientos — Fintech Hero con revelación progresiva)
  // =========================================================================
  const hasCommitments = committedAmount > 0;
  const isOverdraft = availableAfterCommitments < 0;
  const isBelowCushion =
    !isEmptyState &&
    hasFinancialActivity &&
    cushionEnabled &&
    !isUSD &&
    !isOverdraft &&
    availableAfterCommitments < minCushionUYU;

  const freeMarginValue =
    pacing.cushionAmount > 0 ? pacing.freeMarginAfterCushion : pacing.availableAfterCommitments;
  const showDailyToggle = !isEmptyState && (hasFinancialActivity || hasCommitments);

  return (
    <section className="finance-surface finance-hero relative rounded-2xl p-4 sm:p-5 border border-[var(--finance-border)]">
      <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
        <FinanceBalanceAtmosphere status={atmosphereStatus} />
      </div>

      <div className="relative z-10 space-y-3.5">
        {isPartial && (
          <p role="status" className="text-sm text-amber-800 dark:text-amber-200">
            {PARTIAL_FINANCE_SUMMARY}
          </p>
        )}

        {/* 1. Protagonist Balance + Compact Status + Top-Right Settings */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--finance-text-secondary)]">
                {primaryIsAvailable
                  ? isPartial
                    ? 'Saldo parcial tras pagos pendientes'
                    : 'Saldo tras pagos pendientes'
                  : 'Saldo real'}{' '}
                ({activeCurrency})
              </span>
              {currencies.length > 1 && (
                <div className="flex items-center gap-1" aria-label="Moneda del saldo">
                  {currencies.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      aria-pressed={currency === activeCurrency}
                      onClick={() => setSelectedCurrency(currency)}
                      className={`min-h-7 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${CLEAN_FOCUS_RING} ${
                        currency === activeCurrency
                          ? 'bg-[#4F46E5] text-white'
                          : 'text-[var(--finance-text-secondary)] hover:bg-[var(--finance-surface-subtle)]'
                      }`}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <PrivacyAmount
              as="div"
              className={`text-[clamp(1.75rem,7vw,2.4rem)] leading-tight font-extrabold tracking-tight tabular-nums break-words ${
                primaryBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--finance-text-primary)]'
              }`}
            >
              {formatCurr(primaryBalance)}
            </PrivacyAmount>

            {primaryIsAvailable && (
              <p className="text-xs text-[var(--finance-text-secondary)] tabular-nums">
                Saldo real:{' '}
                <PrivacyAmount as="strong" className="font-semibold text-[var(--finance-text-primary)]">
                  {formatCurr(realBalance)}
                </PrivacyAmount>
              </p>
            )}

            {!isPartial && !isOverdraft && !isBelowCushion && (
              <p className="flex items-center gap-2 text-xs text-[var(--finance-text-secondary)]">
                <span className={statusDotClasses} />
                <span>{!hasCommitments && hasFinancialActivity ? 'Sin pagos pendientes este mes' : statusText}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenCushionModal && !onOpenCustomize && (
              <button
                type="button"
                onClick={onOpenCushionModal}
                className={`finance-control min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl cursor-pointer text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] ${CLEAN_FOCUS_RING}`}
                title="Configurar colchón mínimo"
                aria-label="Configurar colchón mínimo"
              >
                <AppIcon name="shield" className="h-4 w-4 text-indigo-500" />
              </button>
            )}
            {onOpenCustomize && (
              <button
                type="button"
                onClick={onOpenCustomize}
                className={`finance-control min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl cursor-pointer text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] ${CLEAN_FOCUS_RING}`}
                title="Personalizar vista de Finanzas"
                aria-label="Personalizar vista de Finanzas"
              >
                <AppIcon name="settings" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Contextual Warning Banner (Only when real shortfall or below cushion) */}
        {(isOverdraft || isBelowCushion) && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs leading-5 ${
              isOverdraft
                ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className={statusDotClasses} />
              <span>
                {isOverdraft ? (
                  <>
                    Faltan <PrivacyAmount as="strong">{formatCurr(Math.abs(availableAfterCommitments))}</PrivacyAmount> para los pagos pendientes del mes.
                  </>
                ) : (
                  <>
                    El saldo tras pagos pendientes está por debajo del colchón de{' '}
                    <PrivacyAmount as="strong">{formatMoney(minCushionUYU, 'UYU')}</PrivacyAmount>.
                  </>
                )}
              </span>
            </span>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('proyeccion')}
                className={`min-h-8 underline font-semibold cursor-pointer shrink-0 ${CLEAN_FOCUS_RING}`}
              >
                Ver en Futuro →
              </button>
            )}
          </div>
        )}

        {/* 3. Direct 1-Tap Quick Actions */}
        <div>{renderQuickActions(false)}</div>

        {/* 4. Compact 3-Metric Key Summary Strip */}
        {!isEmptyState && (
          <div
            data-finance-summary-strip="true"
            className="grid grid-cols-1 divide-y divide-[var(--finance-border)] sm:grid-cols-3 sm:divide-y-0 sm:divide-x rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] px-3 py-1 sm:p-3"
          >
            {/* Metric 1: Margen libre */}
            <div className="flex items-center justify-between gap-2 py-2 sm:flex-col sm:items-start sm:justify-start sm:py-0 sm:pr-3 min-w-0">
              <span className="text-xs font-medium text-[var(--finance-text-secondary)]">
                Margen libre
              </span>
              <PrivacyAmount
                as="strong"
                className={`text-sm sm:text-base font-bold tabular-nums whitespace-nowrap ${
                  freeMarginValue < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--finance-text-primary)]'
                }`}
              >
                {formatCurr(freeMarginValue)}
              </PrivacyAmount>
            </div>

            {/* Metric 2: Pagos pendientes del mes */}
            <div className="flex items-center justify-between gap-2 py-2 sm:flex-col sm:items-start sm:justify-start sm:py-0 sm:px-3 min-w-0">
              <span className="text-xs font-medium text-[var(--finance-text-secondary)]">
                {isPartial ? 'Pagos pendientes conocidos' : 'Pagos pendientes del mes'}
              </span>
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <PrivacyAmount
                  as="strong"
                  className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]"
                >
                  {committedAmount > 0 ? `−${formatCurr(committedAmount)}` : formatCurr(0)}
                </PrivacyAmount>
                {committedCount > 0 && (
                  <span className="text-xs text-[var(--finance-text-muted)] tabular-nums">
                    ({committedCount})
                  </span>
                )}
              </div>
            </div>

            {/* Metric 3: Colchón mínimo (clickable when handler is provided) */}
            {onOpenCushionModal ? (
              <button
                type="button"
                onClick={onOpenCushionModal}
                className={`flex items-center justify-between gap-2 py-2 sm:flex-col sm:items-start sm:justify-start sm:py-0 sm:pl-3 min-w-0 text-left cursor-pointer rounded-lg hover:text-[var(--finance-text-primary)] transition-colors ${CLEAN_FOCUS_RING}`}
                title={
                  isUSD
                    ? 'Colchón configurado en moneda base UYU (no aplica a USD)'
                    : 'Colchón mínimo: es una referencia para los avisos; no modifica tu saldo'
                }
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--finance-text-secondary)]">
                  <AppIcon name="shield" className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{isUSD ? 'Colchón mínimo (UYU)' : 'Colchón mínimo'}</span>
                </span>
                <span
                  className={`text-sm sm:text-base font-bold tabular-nums whitespace-nowrap ${
                    isBelowCushion
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-[var(--finance-text-primary)]'
                  }`}
                >
                  {cushionEnabled ? (
                    <PrivacyAmount as="strong" className="font-bold">
                      {formatMoney(minCushionUYU, 'UYU')}
                    </PrivacyAmount>
                  ) : (
                    'Desactivado'
                  )}
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2 py-2 sm:flex-col sm:items-start sm:justify-start sm:py-0 sm:pl-3 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--finance-text-secondary)]">
                  <AppIcon name="shield" className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{isUSD ? 'Colchón mínimo (UYU)' : 'Colchón mínimo'}</span>
                </span>
                <span className="text-sm sm:text-base font-bold tabular-nums whitespace-nowrap text-[var(--finance-text-primary)]">
                  {cushionEnabled ? (
                    <PrivacyAmount as="strong" className="font-bold">
                      {formatMoney(minCushionUYU, 'UYU')}
                    </PrivacyAmount>
                  ) : (
                    'Desactivado'
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Progressive Disclosure: Daily Pacing & Margin Breakdown (Closed by Default) */}
        {showDailyToggle && (
          <div className="pt-0.5">
            <button
              type="button"
              aria-expanded={isDailyDetailsOpen}
              aria-controls="finance-hero-daily-details"
              onClick={() => setIsDailyDetailsOpen((prev) => !prev)}
              className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] hover:bg-[var(--finance-surface-subtle)] transition-colors cursor-pointer ${CLEAN_FOCUS_RING}`}
            >
              <span>Ver ritmo y margen diario</span>
              <AppIcon
                name="chevronDown"
                className={`h-4 w-4 shrink-0 transition-transform duration-150 ${
                  isDailyDetailsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isDailyDetailsOpen && (
              <div
                id="finance-hero-daily-details"
                data-finance-pacing
                className="mt-2 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] p-3 space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="min-w-0">
                    <span className="block text-xs font-medium text-[var(--finance-text-muted)]">
                      {primaryIsAvailable
                        ? 'Saldo real'
                        : isPartial
                        ? 'Saldo parcial tras pagos'
                        : 'Saldo tras pagos pendientes'}
                    </span>
                    <PrivacyAmount
                      as="strong"
                      className={`mt-0.5 block text-sm sm:text-base font-bold tabular-nums ${
                        (primaryIsAvailable ? realBalance : availableAfterCommitments) < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[var(--finance-text-primary)]'
                      }`}
                    >
                      {formatCurr(primaryIsAvailable ? realBalance : availableAfterCommitments)}
                    </PrivacyAmount>
                    <span className="block text-xs text-[var(--finance-text-secondary)]">
                      {primaryIsAvailable ? 'En todas tus cuentas' : 'Disponible antes del colchón'}
                    </span>
                  </div>

                  <div className="min-w-0 border-t border-[var(--finance-border)] pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                    <span className="block text-xs font-medium text-[var(--finance-text-muted)]">
                      Tope diario sugerido
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <PrivacyAmount
                        as="strong"
                        className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]"
                      >
                        {formatCurr(pacing.dailyAvailableMargin)}
                      </PrivacyAmount>
                      <span className="text-xs font-medium text-[var(--finance-text-secondary)]">/ día</span>
                    </div>
                    <span className="block text-xs tabular-nums text-[var(--finance-text-secondary)]">
                      {pacing.remainingDays} {pacing.remainingDays === 1 ? 'día restante' : 'días restantes'} en el mes
                    </span>
                  </div>

                  <div className="min-w-0 border-t border-[var(--finance-border)] pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-xs font-medium text-[var(--finance-text-muted)]">
                        Ritmo de gasto diario
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          pacing.pacingTone === 'deficit'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : pacing.pacingTone === 'tight'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : pacing.pacingTone === 'watch'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {pacing.pacingLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <PrivacyAmount
                        as="strong"
                        className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]"
                      >
                        {formatCurr(pacing.variableDailySpendRate)}
                      </PrivacyAmount>
                      <span className="text-xs font-medium text-[var(--finance-text-secondary)]">/ día</span>
                    </div>
                    <span className="block text-xs text-[var(--finance-text-secondary)]">
                      Gasto variable promedio ({pacing.elapsedDays} d)
                    </span>
                  </div>
                </div>

                {(monthIncome !== 0 || monthExpenses !== 0) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--finance-border)] pt-2.5 text-xs text-[var(--finance-text-secondary)]">
                    <span>
                      Ingresos del mes:{' '}
                      <PrivacyAmount as="strong" className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{formatCurr(monthIncome)}
                      </PrivacyAmount>
                    </span>
                    <span>
                      Gastos del mes:{' '}
                      <PrivacyAmount as="strong" className="font-semibold tabular-nums text-[var(--finance-text-primary)]">
                        −{formatCurr(monthExpenses)}
                      </PrivacyAmount>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
