import React, { useEffect, useMemo, useState } from 'react';
import { FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { deriveCashflowProjection } from '../lib/financeCashflow';
import { formatMoney } from '../lib/storage';
import { calcIncomeMonth, calcSpentMonth } from '../lib/calculations';
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
    || allAccounts.some(account => Number(account.balance) !== 0 || Number(account.initialBalance || 0) !== 0)
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
    } else if (!cushionEnabled) {
      statusTone = 'healthy';
      statusText = 'Saldo cubre los pagos pendientes';
    } else {
      statusTone = 'healthy';
      statusText = 'Saldo cubre los pagos pendientes';
    }
  }

  if (isPartial && statusTone !== 'danger') {
    statusTone = 'warning';
    statusText = 'Cálculo parcial: moneda sin confirmar';
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
      hasFinancialActivity &&
      cushionEnabled &&
      !isUSD &&
      (realBalance < minCushionUYU || availableAfterCommitments < minCushionUYU);

    return (
      <button
        type="button"
        onClick={onOpenCushionModal}
        className={`inline-flex min-h-11 items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
          isWarning
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] hover:text-[var(--finance-text-primary)] hover:border-indigo-500/40'
        }`}
        title={
          isUSD
            ? 'Colchón configurado en moneda base UYU (no aplica a USD)'
            : 'Colchón mínimo: es una referencia para los avisos; no modifica tu saldo'
        }
      >
        <AppIcon name="shield" className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        <span className="min-w-0 whitespace-normal break-words text-left">
          {isUSD ? (
            <span>
              Colchón UYU:{' '}
              <strong className="block text-[var(--finance-text-primary)] font-bold">
                $U {state.settings.privacyMode ? '••••' : minCushionUYU.toLocaleString('es-UY')}
              </strong>
            </span>
          ) : (
            <span>
              Colchón mínimo:{' '}
              <strong className="block text-[var(--finance-text-primary)] font-bold">
                {cushionEnabled ? state.settings.privacyMode ? '••••' : formatMoney(minCushionUYU, 'UYU') : 'Desactivado'}
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
        {isPartial && <p role="status" className="relative z-10 mb-3 text-sm text-amber-800 dark:text-amber-200">{PARTIAL_FINANCE_SUMMARY}</p>}
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
    hasFinancialActivity &&
    cushionEnabled &&
    !isUSD &&
    !isOverdraft &&
    availableAfterCommitments < minCushionUYU;

  return (
    <section className="finance-surface finance-hero relative rounded-2xl p-4 border border-[var(--finance-border)]">
      <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
        <FinanceBalanceAtmosphere status={atmosphereStatus} />
      </div>
      <div className="relative z-10 space-y-3">
        {isPartial && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">{PARTIAL_FINANCE_SUMMARY}</p>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--finance-text-secondary)]">{primaryIsAvailable ? (isPartial ? 'Saldo parcial tras pagos pendientes' : 'Saldo tras pagos pendientes') : 'Saldo real'} ({activeCurrency})</span>
              {currencies.length > 1 && <div className="flex gap-1" aria-label="Moneda del saldo">
                {currencies.map(currency => <button key={currency} type="button" aria-pressed={currency === activeCurrency} onClick={() => setSelectedCurrency(currency)} className={`min-h-8 px-2 rounded-lg text-xs font-semibold cursor-pointer ${currency === activeCurrency ? 'bg-indigo-600 text-white' : 'text-[var(--finance-text-secondary)] hover:bg-[var(--finance-surface-subtle)]'}`}>{currency}</button>)}
              </div>}
            </div>
            <PrivacyAmount as="div" className={`text-[clamp(1.375rem,7vw,2rem)] leading-tight font-extrabold tracking-tight tabular-nums break-words ${primaryBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--finance-text-primary)]'}`}>{formatCurr(primaryBalance)}</PrivacyAmount>
            {!isPartial && !isOverdraft && !isBelowCushion && <p className="flex items-center gap-2 text-xs text-[var(--finance-text-secondary)]"><span className={statusDotClasses} />{!hasCommitments && hasFinancialActivity ? 'Sin pagos pendientes este mes' : statusText}</p>}
          </div>
          {onOpenCustomize && <button type="button" onClick={onOpenCustomize} className="finance-control min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl cursor-pointer text-[var(--finance-text-secondary)]" title="Personalizar vista de Finanzas"><AppIcon name="settings" className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasCommitments && <div className="grid grid-cols-2 gap-x-5 gap-y-2 flex-1 min-w-[240px]">
            <div className="min-w-0"><span className="block text-xs text-[var(--finance-text-secondary)]">{primaryIsAvailable ? 'Saldo real' : isPartial ? 'Saldo parcial tras pagos' : 'Saldo tras pagos pendientes'}</span><PrivacyAmount as="strong" className="block text-base tabular-nums break-words text-[var(--finance-text-primary)]">{formatCurr(primaryIsAvailable ? realBalance : availableAfterCommitments)}</PrivacyAmount></div>
            <div className="min-w-0"><span className="block text-xs text-[var(--finance-text-secondary)]">{isPartial ? 'Pagos pendientes conocidos' : 'Pagos pendientes del mes'}</span><PrivacyAmount as="strong" className="block text-base tabular-nums break-words text-[var(--finance-text-primary)]">−{formatCurr(committedAmount)}</PrivacyAmount><span className="text-xs text-[var(--finance-text-muted)]">{committedCount} {committedCount === 1 ? 'pago' : 'pagos'}</span></div>
          </div>}
          <div className="w-full sm:w-auto">{renderActionButton()}</div>
        </div>
        {(isOverdraft || isBelowCushion) && <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs leading-5 ${isOverdraft ? 'bg-rose-500/10 text-rose-800 dark:text-rose-200' : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'}`}>
          <span>{isOverdraft ? <>Faltan <PrivacyAmount as="strong">{formatCurr(Math.abs(availableAfterCommitments))}</PrivacyAmount> para los pagos pendientes del mes.</> : <>El saldo tras pagos pendientes está por debajo del colchón de <PrivacyAmount as="strong">{formatMoney(minCushionUYU, 'UYU')}</PrivacyAmount>.</>}</span>
          {onNavigateTab && <button type="button" onClick={() => onNavigateTab('proyeccion')} className="min-h-8 underline font-semibold cursor-pointer shrink-0">Ver en Futuro →</button>}
        </div>}
        <div className="flex flex-wrap items-start justify-between gap-x-1 gap-y-2 border-t border-[var(--finance-border)] pt-2">
          {renderCushionChip()}
          {(monthIncome !== 0 || monthExpenses !== 0) && <details className="min-w-0 text-xs">
            <summary className="min-h-8 flex items-center cursor-pointer font-semibold text-[var(--finance-text-secondary)]">Movimientos del mes ▾</summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 py-1 text-[var(--finance-text-secondary)]"><span>Ingresos: <PrivacyAmount as="strong" className="tabular-nums">+{formatCurr(monthIncome)}</PrivacyAmount></span><span>Gastos: <PrivacyAmount as="strong" className="tabular-nums">−{formatCurr(monthExpenses)}</PrivacyAmount></span></div>
          </details>}
        </div>
      </div>
    </section>
  );
};
