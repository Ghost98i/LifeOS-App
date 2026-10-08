import React, { useMemo, useState } from 'react';
import { CashflowWindow, FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult, resolveFinancialCommitment } from '../lib/calculations';
import { deriveCashflowProjection } from '../lib/financeCashflow';
import { fmtDate, fmtMoney, todayISO } from '../lib/storage';
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
  onOpenCommitmentModal: () => void;
  onOpenCushionModal: () => void;
  onPayCommitment: (com: FinancialCommitment) => void;
  onEditCommitment: (com: FinancialCommitment) => void;
  onOpenCustomize?: () => void;
}

export const FinanceHero: React.FC<FinanceHeroProps> = ({
  state,
  cashFlow,
  variant = 'full',
  displayMode = 'actual_balance',
  showCommitmentsStrip = true,
  onOpenNewTx,
  onOpenTransfer,
  onOpenCommitmentModal,
  onOpenCushionModal,
  onPayCommitment,
  onEditCommitment,
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
  const expectedIncomes = summary.expectedIncomes;
  const projectedBalance = summary.projectedBalance;

  const windowEvents = windowProj.events.filter((e) => e.currency === activeCurrency);
  const committedCount = windowEvents.filter((e) => e.type === 'committed_expense').length;

  const cushionStatus = cashFlow.cushionStatus;
  const isDeficit = projectedBalance < 0;

  const windowLabel = selectedWindow === '7d' ? '7 días' : selectedWindow === 'month' ? 'Resto del mes' : '30 días';

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

  if (variant === 'compact') {
    return (
      <section className="finance-surface relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main KPI: Saldo Real Protagonista */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="finance-text-secondary text-[10px] font-bold uppercase tracking-wider">
                  Saldo Real
                </span>
                {currencies.length > 1 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    {activeCurrency}
                  </span>
                )}
                <span className={`w-2 h-2 rounded-full ${
                  isDeficit
                    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                    : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                    : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                }`} />
              </div>
              <PrivacyAmount
                as="div"
                className="finance-text-primary text-2xl sm:text-3xl font-black tracking-tight tabular-nums font-mono mt-0.5"
              >
                {formatCurr(realBalance)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Subordinate Contextual Indicators (4 Conceptos) */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="finance-text-muted text-[10px] uppercase font-bold block">Disponible tras compromisos</span>
              <PrivacyAmount as="span" className={`font-mono font-bold text-sm ${availableAfterCommitments < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatCurr(availableAfterCommitments)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-7 bg-[var(--finance-border)]" />

            <div>
              <span className="finance-text-muted text-[10px] uppercase font-bold block">Comprometido ({windowLabel})</span>
              <PrivacyAmount as="span" className="finance-text-secondary font-mono font-bold text-sm">
                −{formatCurr(committedAmount)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-7 bg-[var(--finance-border)]" />

            <div>
              <div className="flex items-center gap-1">
                <span className="finance-text-muted text-[10px] uppercase font-bold block">Proyectado</span>
                <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1 rounded">Proyección</span>
              </div>
              <PrivacyAmount as="span" className={`font-mono font-bold text-sm ${projectedBalance < 0 ? 'text-rose-500' : 'finance-text-primary'}`}>
                {formatCurr(projectedBalance)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Compact Actions & Window Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setSelectedWindow('7d')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${selectedWindow === '7d' ? 'bg-indigo-600 text-white font-bold' : 'finance-text-secondary'}`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setSelectedWindow('month')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${selectedWindow === 'month' ? 'bg-indigo-600 text-white font-bold' : 'finance-text-secondary'}`}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setSelectedWindow('30d')}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${selectedWindow === '30d' ? 'bg-indigo-600 text-white font-bold' : 'finance-text-secondary'}`}
              >
                30d
              </button>
            </div>

            {onOpenCustomize && (
              <button
                type="button"
                onClick={onOpenCustomize}
                className="finance-control finance-text-secondary p-2 rounded-xl border transition cursor-pointer"
                title="Personalizar Finanzas"
              >
                <AppIcon name="settings" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNewTx}
              className="py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Movimiento</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="finance-surface relative overflow-hidden rounded-3xl p-6 sm:p-8">
      {/* Ambient Visual Atmosphere (Alpine Narrative Flow behind) */}
      <FinanceBalanceAtmosphere status={atmosphereStatus} />

      {/* Top Bar: Eyebrow status & Fast Actions */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="finance-text-secondary flex items-center gap-1.5 text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${
              isDeficit
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
            }`} />
            <span>Liquidez y flujo ({windowLabel})</span>
          </span>

          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            isDeficit
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
              : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
          }`}>
            {isDeficit
              ? `Riesgo de déficit (${windowLabel})`
              : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
              ? 'Por debajo del colchón'
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
                      : 'finance-text-secondary hover:text-[var(--finance-text-primary)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global Action CTAs */}
        <div className="flex items-center gap-2">
          {onOpenCustomize && (
            <button
              type="button"
              onClick={onOpenCustomize}
              className="finance-control px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer flex items-center gap-1.5 transition-all"
              title="Personalizar Finanzas"
            >
              <AppIcon name="settings" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Personalizar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenTransfer}
            className="finance-control px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 cursor-pointer transition-all"
            title="Mover dinero entre cuentas propias"
          >
            <AppIcon name="repeat" className="h-3.5 w-3.5" />
            <span>Transferir</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewTx}
            className="py-1.5 px-4 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            <span>+ Movimiento</span>
          </button>
        </div>
      </div>

      {/* Main Hierarchy: Protagonist Saldo Real & Alpine Flow Bridge */}
      <div className="relative z-10 grid gap-8 lg:grid-cols-12 items-center">
        {/* Left Column: Protagonist Saldo Real (Cols 1-5) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="finance-text-secondary text-xs font-bold uppercase tracking-wider">
              {displayMode === 'real_available' ? 'Disponible Real' : 'Saldo Real'}
            </span>
            <span className="finance-surface-subtle finance-text-secondary text-[10px] font-semibold px-2 py-0.5 rounded-md">
              {displayMode === 'real_available' ? `Libre (${windowLabel})` : `En cuentas hoy (${activeCurrency})`}
            </span>
          </div>

          {/* Giant Metric Value */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <PrivacyAmount
              as="h1"
              className="finance-text-primary text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight tabular-nums font-mono"
            >
              {formatCurr(displayMode === 'real_available' ? availableAfterCommitments : realBalance)}
            </PrivacyAmount>

            {isDeficit && (
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                Déficit proyectado
              </span>
            )}
          </div>

          <p className="finance-text-secondary text-xs max-w-sm">
            {displayMode === 'real_available'
              ? 'Monto libre utilizable tras reservar compromisos inminentes.'
              : 'Dinero real existente derivado exclusivamente del ledger contable.'}
          </p>

          {/* Subordinate Contextual Metrics (Direct typography) */}
          <div className="finance-text-secondary pt-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5" title="Saldo real menos compromisos pendientes de la ventana. No incluye ingresos futuros.">
              <span>Disponible tras compromisos:</span>
              <PrivacyAmount as="span" className={`font-mono font-bold ${availableAfterCommitments < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatCurr(availableAfterCommitments)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>Comprometido ({windowLabel}):</span>
              <PrivacyAmount as="span" className="finance-text-primary font-mono font-semibold">
                −{formatCurr(committedAmount)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>{state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas'}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Arithmetic Flow Bridge (Cols 6-12) */}
        {/* Answers: Saldo Real -> − Comprometido -> = Disponible tras compromisos -> + Ingresos -> = Saldo Proyectado */}
        <div className="lg:col-span-7">
          <div className="finance-surface-subtle p-4 sm:p-5 rounded-2xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="finance-text-muted text-[10px] font-black uppercase tracking-wider">
                  Flujo proyectado de liquidez
                </span>
                <button
                  type="button"
                  onClick={onOpenCushionModal}
                  className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Colchón: {fmtMoney(state.finance?.minCushion ?? 5000)}
                </button>
              </div>

              {/* Window Selector Tabs */}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--finance-surface)] border border-[var(--finance-border)] text-[10px] font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSelectedWindow('7d')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedWindow === '7d'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'finance-text-secondary hover:text-[var(--finance-text-primary)]'
                  }`}
                >
                  7 días
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWindow('month')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedWindow === 'month'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'finance-text-secondary hover:text-[var(--finance-text-primary)]'
                  }`}
                >
                  Resto del mes
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWindow('30d')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedWindow === '30d'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'finance-text-secondary hover:text-[var(--finance-text-primary)]'
                  }`}
                >
                  30 días
                </button>
              </div>
            </div>

            {/* Arithmetic Flow Rail: Saldo -> Compromisos -> Disponible -> Ingresos -> Proyección */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center sm:text-left pt-1">
              {/* Step 1: Saldo real actual */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  1. Saldo Real
                </span>
                <PrivacyAmount as="div" className="finance-text-primary text-sm sm:text-base font-black font-mono tabular-nums">
                  {formatCurr(realBalance)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  Base en cuentas
                </span>
              </div>

              {/* Step 2: Compromisos (-) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  2. − Comprometido
                </span>
                <PrivacyAmount as="div" className="finance-text-secondary text-sm sm:text-base font-black font-mono tabular-nums">
                  −{formatCurr(committedAmount)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  {committedCount} {committedCount === 1 ? 'pago' : 'pagos'} en {windowLabel}
                </span>
              </div>

              {/* Step 3: Disponible después de compromisos (=) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block" title="Saldo real menos compromisos pendientes. No incluye ingresos futuros.">
                  3. Disponible
                </span>
                <PrivacyAmount as="div" className={`text-sm sm:text-base font-black font-mono tabular-nums ${availableAfterCommitments < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatCurr(availableAfterCommitments)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  Tras compromisos
                </span>
              </div>

              {/* Step 4: Ingresos Previstos (+) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  4. + Ingresos
                </span>
                <PrivacyAmount as="div" className="text-sm sm:text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatCurr(expectedIncomes)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  previstos en {windowLabel}
                </span>
              </div>

              {/* Step 5: Saldo Proyectado (=) */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-center sm:justify-start gap-1">
                  <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                    5. Proyectado
                  </span>
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1 rounded">Proy.</span>
                </div>
                <PrivacyAmount as="div" className={`text-sm sm:text-base font-black font-mono tabular-nums ${projectedBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'finance-text-primary'}`}>
                  {formatCurr(projectedBalance)}
                </PrivacyAmount>
                <span className={`text-[10px] font-bold block ${
                  projectedBalance < (state.finance?.minCushion ?? 5000)
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {projectedBalance < 0 ? 'Déficit previsto' : 'Saldo al cierre'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Immediate Commitments Strip (if enabled) */}
      {showCommitmentsStrip && cashFlow.commitments.length > 0 && (
        <div className="finance-divider relative z-10 mt-6 pt-5 border-t space-y-3">
          <div className="flex items-center justify-between">
            <span className="finance-text-secondary text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Próximos Vencimientos Inmediatos</span>
              <span className="finance-surface-subtle finance-text-secondary px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                {cashFlow.commitments.length}
              </span>
            </span>

            <button
              type="button"
              onClick={onOpenCommitmentModal}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              + Compromiso
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cashFlow.commitments.slice(0, 3).map((com) => {
              const persistedCommitment = resolveFinancialCommitment(state, com);
              const isOverdue = Boolean(com.dueDate && com.dueDate < todayISO());
              return (
                <div
                  key={com.id}
                  className={`p-3.5 rounded-2xl transition-all border ${
                    isOverdue
                      ? 'border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20'
                      : 'finance-surface-raised hover:border-[var(--finance-border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="finance-text-primary text-xs font-bold truncate">
                        {com.label}
                      </h4>
                      <span className={`text-[10px] font-semibold mt-0.5 block ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'finance-text-muted'}`}>
                        {com.dueDate
                          ? isOverdue
                            ? `Venció ${fmtDate(com.dueDate)}`
                            : `Vence ${fmtDate(com.dueDate)}`
                          : 'Sin fecha'}
                      </span>
                    </div>

                    <PrivacyAmount as="span" className="finance-text-primary font-mono text-xs font-black tabular-nums shrink-0">
                      {fmtMoney(com.amount)}
                    </PrivacyAmount>
                  </div>

                  {persistedCommitment ? (
                    <div className="finance-divider mt-3 pt-2 border-t flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => onPayCommitment(persistedCommitment)}
                        className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
                      >
                        <span>✓ Pagar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditCommitment(persistedCommitment)}
                        className="finance-text-muted hover:text-[var(--finance-text-primary)] cursor-pointer text-[11px]"
                      >
                        Editar
                      </button>
                    </div>
                  ) : (
                    <div className="finance-divider finance-text-muted mt-3 pt-2 border-t text-[11px] font-semibold">
                      {com.kind === 'subscription' ? 'Suscripción prevista' : 'Cuota prevista'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
