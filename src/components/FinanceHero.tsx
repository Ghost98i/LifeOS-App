import React, { useEffect, useMemo, useState } from 'react';
import { FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { deriveCashflowProjection } from '../lib/financeCashflow';
import { formatMoney } from '../lib/storage';
import { calcIncomeMonth, calcSpentMonth } from '../lib/calculations';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { FinanceBalanceAtmosphere } from './visual/FinanceBalanceAtmosphere';

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
  const activeCurrency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];
  const monthIncome = calcIncomeMonth(state, 0, activeCurrency);
  const monthExpenses = calcSpentMonth(state, 0, activeCurrency);

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
  const committedAmount = summary.committedExpenses;
  const availableAfterCommitments = summary.availableAfterCommitments;
  const primaryIsAvailable = variant === 'full' && displayMode === 'real_available';
  const primaryBalance = primaryIsAvailable ? availableAfterCommitments : realBalance;

  const windowEvents = windowProj.events.filter((e) => e.currency === activeCurrency);
  const committedCount = windowEvents.filter((e) => e.type === 'committed_expense').length;

  const allAccounts = state.finance?.accounts || [];
  const isEmptyState = allAccounts.length === 0;

  // 4. Cushion & Liquidity Assessment (Rigorous, disjunct, no fake thresholds)
  const isUSD = activeCurrency === 'USD';
  const cushionEnabled = state.finance?.cushionEnabled !== false;
  const minCushionUYU = state.finance?.minCushion ?? 5000;

  let statusTone: 'healthy' | 'warning' | 'danger' | 'neutral' = 'healthy';
  let statusText = 'Pagos del mes cubiertos';

  if (isEmptyState) {
    statusTone = 'neutral';
    statusText = 'Sin cuentas registradas';
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
    } else if (!cushionEnabled) {
      statusTone = 'healthy';
      statusText = 'Pagos del mes cubiertos';
    } else {
      statusTone = 'healthy';
      statusText = 'Pagos del mes cubiertos';
    }
  }

  const formatCurr = (val: number) => {
    return formatMoney(val, activeCurrency);
  };

  const atmosphereStatus: 'healthy' | 'attention' | 'warning' | 'deficit' =
    statusTone === 'danger'
      ? 'deficit'
      : statusTone === 'warning'
      ? 'warning'
      : 'healthy';

  const statusDotClasses = `inline-block h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${
    statusTone === 'danger'
      ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
      : statusTone === 'warning'
      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-2 ring-amber-500/30'
      : statusTone === 'neutral'
      ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] ring-2 ring-indigo-500/30'
      : 'bg-emerald-500'
  }`;

  // 5. Unified Action Menu State (+ Movimiento)
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  // Render Action Button (+ Movimiento)
  const renderActionButton = () => {
    if (isEmptyState) {
      return (
        <button
          type="button"
          onClick={onOpenAddAccount ? onOpenAddAccount : onOpenNewTx}
          className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 active:scale-98 transition-all min-h-[44px]"
        >
          <AppIcon name="plus" className="h-4 w-4" />
          <span>Crear cuenta</span>
        </button>
      );
    }

    return (
      <div className="relative w-full sm:w-auto">
        <button
          id="finance-movement-trigger"
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center sm:justify-start gap-2 cursor-pointer shadow-md shadow-indigo-600/20 active:scale-98 transition-all min-h-[44px]"
          aria-expanded={isMenuOpen}
          aria-haspopup="true"
        >
          <AppIcon name="plus" className="h-4 w-4" />
          <span>Nuevo movimiento</span>
          <AppIcon
            name="chevronDown"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsMenuOpen(false)}
            />
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[var(--finance-border)] bg-[var(--finance-surface-raised)] shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150"
              role="menu"
            >
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenNewTxType) onOpenNewTxType('gasto');
                  else onOpenNewTx();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2.5 cursor-pointer transition-colors"
                role="menuitem"
              >
                <span className="h-6 w-6 rounded-lg bg-rose-500/15 flex items-center justify-center font-black text-sm shrink-0">
                  <AppIcon name="expense" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-bold truncate">Registrar gasto</div>
                  
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenNewTxType) onOpenNewTxType('ingreso');
                  else onOpenNewTx();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2.5 cursor-pointer transition-colors"
                role="menuitem"
              >
                <span className="h-6 w-6 rounded-lg bg-emerald-500/15 flex items-center justify-center font-black text-sm shrink-0">
                  <AppIcon name="income" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-bold truncate">Registrar ingreso</div>
                  
                </div>
              </button>

              <div className="h-px bg-[var(--finance-border)] my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenTransfer();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[var(--finance-text-primary)] hover:bg-[var(--finance-surface-subtle)] flex items-center gap-2.5 cursor-pointer transition-colors"
                role="menuitem"
              >
                <span className="h-6 w-6 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
                  <AppIcon name="transfer" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="font-bold truncate">Transferir</div>
                  <div className="text-[10px] text-[var(--finance-text-muted)] font-normal truncate">
                    Entre cuentas propias
                  </div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Render Discrete Cushion Chip (Top Right)
  const renderCushionChip = () => {
    if (!onOpenCushionModal) return null;
    const isWarning =
      statusTone === 'warning' &&
      cushionEnabled &&
      !isUSD &&
      (realBalance < minCushionUYU || availableAfterCommitments < minCushionUYU);

    return (
      <button
        type="button"
        onClick={onOpenCushionModal}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
          isWarning
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] hover:border-indigo-500/40'
        }`}
        title={
          isUSD
            ? 'Colchón configurado en moneda base UYU (no aplica a USD)'
            : 'Configurar colchón financiero mínimo de seguridad'
        }
      >
        <AppIcon name="shield" className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        <span className="min-w-0 whitespace-normal break-words text-left">
          {isUSD ? (
            <span>
              Colchón UYU:{' '}
              <strong className="text-[var(--finance-text-primary)] font-bold">
                $U {minCushionUYU.toLocaleString('es-UY')}
              </strong>
            </span>
          ) : (
            <span>
              Colchón:{' '}
              <strong className="text-[var(--finance-text-primary)] font-bold">
                {cushionEnabled ? formatMoney(minCushionUYU, 'UYU') : 'Desactivado'}
              </strong>
            </span>
          )}
        </span>
      </button>
    );
  };

  // =========================================================================
  // VARIANT: COMPACT (Cuentas, Análisis, Futuro)
  // Slim responsive single/two-row header that provides context without pushing content
  // =========================================================================
  if (variant === 'compact') {
    const secondaryCurrencies = isAccountsContext
      ? currencies.filter((c) => c !== activeCurrency)
      : [];

    return (
      <section className="finance-surface relative rounded-2xl p-4 sm:p-5 border border-[var(--finance-border)]">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <FinanceBalanceAtmosphere status={atmosphereStatus} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Main KPI: Saldo Real */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={statusDotClasses} title={statusText} />
            <div className="flex items-baseline gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">
                    Saldo real ({activeCurrency})
                  </span>
                  {currencies.length > 1 && (
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[9px] font-bold">
                      {currencies.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSelectedCurrency(c)}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
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
                </div>
                <PrivacyAmount
                  as="div"
                  className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                >
                  {formatCurr(realBalance)}
                </PrivacyAmount>
              </div>

              {secondaryCurrencies.map((secCur) => {
                const secBal = windowProj.summariesByCurrency[secCur]?.realBalance ?? 0;
                return (
                  <div key={secCur} className="pl-3.5 border-l border-[var(--finance-border)]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">
                        Saldo real
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)]">
                        {secCur}
                      </span>
                    </div>
                    <PrivacyAmount
                      as="div"
                      className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                    >
                      {formatMoney(secBal, secCur)}
                    </PrivacyAmount>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Cushion Chip + Action Button */}
          <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
            {renderCushionChip()}
            {renderActionButton()}
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // VARIANT: FULL (Finance Essential Clarity — Cabecera Refinada)
  // Adaptable financial hierarchy + Single +Movimiento Command + Discrete Cushion
  // =========================================================================
  const hasCommitments = committedAmount > 0;
  const isOverdraft = availableAfterCommitments < 0;
  const isBelowCushion =
    !isEmptyState &&
    cushionEnabled &&
    !isUSD &&
    !isOverdraft &&
    availableAfterCommitments < minCushionUYU;

  return (
    <section className="finance-surface relative rounded-3xl p-4 sm:p-6 border border-[var(--finance-border)]">
      <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
        <FinanceBalanceAtmosphere status={atmosphereStatus} />
      </div>

      <div className="relative z-10 space-y-4">
        {/* =========================================================================
            1. TOP ROW: Status signal + Currency pills (Left) + Cushion & Customize (Right)
           ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Status & Currency Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={statusDotClasses} />
            <span className="text-xs font-bold text-[var(--finance-text-primary)]">
              {statusText}
            </span>

            {/* Currency Pill Selector */}
            {currencies.length > 1 && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs font-bold ml-1">
                {currencies.map((c) => {
                  const cBal = windowProj.summariesByCurrency[c]?.realBalance ?? 0;
                  return (
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
                      {c} ({formatMoney(cBal, c, { noSymbol: true })})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Discrete Cushion Chip + Settings */}
          <div className="flex items-center gap-2">
            {renderCushionChip()}

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

        {/* =========================================================================
            2. CORE POSITION & ACTION BAR
           ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Protagonist Balance */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
              {primaryIsAvailable ? 'Disponible tras pagos' : 'Saldo real'} ({activeCurrency})
            </span>

            <PrivacyAmount
              as="div"
              className={`text-[clamp(1.25rem,7vw,2.25rem)] leading-tight font-black tracking-tight tabular-nums break-words max-w-full ${
                primaryBalance < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[var(--finance-text-primary)]'
              }`}
            >
              {formatCurr(primaryBalance)}
            </PrivacyAmount>

            {/* When NO commitments: quiet, serene indicator (No duplicate numbers!) */}
            {!hasCommitments && !isEmptyState && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--finance-text-muted)] pt-0.5 font-medium">
                <AppIcon name="checkCircle" className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Sin compromisos este mes</span>
              </div>
            )}
          </div>

          {/* Right: Single Action Button (+ Movimiento) */}
          <div className="shrink-0">
            {renderActionButton()}
          </div>
        </div>

        {/* =========================================================================
            3. ADAPTABLE SECONDARY METRICS: ONLY when commitments exist
           ========================================================================= */}
        {hasCommitments && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] animate-in fade-in duration-200">
            {/* Metric 1: Disponible tras compromisos */}
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
                {primaryIsAvailable ? 'Saldo real' : 'Disponible tras pagos'}
              </span>
              <PrivacyAmount
                as="div"
                className={`text-[clamp(0.8125rem,4.2vw,1.125rem)] break-words font-black tabular-nums ${
                  availableAfterCommitments < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurr(primaryIsAvailable ? realBalance : availableAfterCommitments)}
              </PrivacyAmount>
            </div>

            {/* Metric 2: Compromisos del mes */}
            <div className="space-y-0.5 border-l border-[var(--finance-border)] pl-3 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
                Compromisos del mes
              </span>
              <PrivacyAmount
                as="div"
                className="text-[clamp(0.8125rem,4.2vw,1.125rem)] break-words font-black tabular-nums text-[var(--finance-text-secondary)]"
              >
                −{formatCurr(committedAmount)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--finance-text-muted)] block truncate">
                {committedCount === 1 ? '1 pago' : `${committedCount} pagos`}
              </span>
            </div>
          </div>
        )}

        <details open className="finance-surface-subtle rounded-xl border border-[var(--finance-border)]">
          <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-3 px-3 text-xs font-semibold text-[var(--finance-text-secondary)]">
            Ingresos y gastos del mes
          </summary>
          <div className="grid grid-cols-2 gap-3 border-t border-[var(--finance-border)] p-3">
            <div className="min-w-0 space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">Ingresos</span>
              <PrivacyAmount
                as="div"
                className="whitespace-nowrap text-[clamp(0.75rem,4vw,1rem)] font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
              >
                +{formatCurr(monthIncome)}
              </PrivacyAmount>
            </div>
            <div className="min-w-0 space-y-0.5 border-l border-[var(--finance-border)] pl-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">Gastos</span>
              <PrivacyAmount
                as="div"
                className="whitespace-nowrap text-[clamp(0.75rem,4vw,1rem)] font-bold tabular-nums text-[var(--finance-text-primary)]"
              >
                −{formatCurr(monthExpenses)}
              </PrivacyAmount>
            </div>
          </div>
        </details>

        {/* =========================================================================
            4. CONTEXTUAL RISK ALERTS (ONLY when relevant risks exist, linking to Futuro)
           ========================================================================= */}
        {isOverdraft ? (
          <div className="p-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2 min-w-0">
              <AppIcon name="alertTriangle" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words leading-5">
                Faltan <strong>{formatCurr(Math.abs(availableAfterCommitments))}</strong> para cubrir los compromisos del mes.
              </span>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('proyeccion')}
                className="self-start underline font-bold text-xs shrink-0 cursor-pointer hover:opacity-80 sm:self-auto"
              >
                Ver en Futuro →
              </button>
            )}
          </div>
        ) : isBelowCushion ? (
          <div className="p-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2 min-w-0">
              <AppIcon name="shield" className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 break-words leading-5">
                Disponible bajo reserva de {formatMoney(minCushionUYU, 'UYU')}.
              </span>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('proyeccion')}
                className="self-start underline font-bold text-xs shrink-0 cursor-pointer hover:opacity-80 sm:self-auto"
              >
                Ver en Futuro →
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
};
