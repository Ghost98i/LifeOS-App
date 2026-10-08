import React from 'react';
import { FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult, resolveFinancialCommitment } from '../lib/calculations';
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
  const disponible = cashFlow.currentBalance;
  const realAvailable = cashFlow.realAvailable;
  const committed = cashFlow.committed;
  const projectedBalance = cashFlow.projectedBalance;
  const totalExpectedIncome = cashFlow.totalExpectedIncome;
  const cushionStatus = cashFlow.cushionStatus;
  const isDeficit = cashFlow.isDeficit;

  const atmosphereStatus: 'healthy' | 'attention' | 'warning' | 'deficit' = isDeficit
    ? 'deficit'
    : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
    ? 'warning'
    : 'healthy';

  if (variant === 'compact') {
    return (
      <section className="finance-surface relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main KPI: Saldo Actual Protagonista */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="finance-text-secondary text-[10px] font-bold uppercase tracking-wider">
                  Saldo Actual
                </span>
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
                {fmtMoney(disponible)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Subordinate Contextual Indicators (Clean, borderless typography) */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="finance-text-muted text-[10px] uppercase font-bold block">Disponible (30d)</span>
              <PrivacyAmount as="span" className={`font-mono font-bold text-sm ${realAvailable < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fmtMoney(realAvailable)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-7 bg-[var(--finance-border)]" />

            <div>
              <span className="finance-text-muted text-[10px] uppercase font-bold block">Proyectado (30d)</span>
              <PrivacyAmount as="span" className={`font-mono font-bold text-sm ${projectedBalance < 0 ? 'text-rose-500' : 'finance-text-primary'}`}>
                {fmtMoney(projectedBalance)}
              </PrivacyAmount>
            </div>

            <div className="hidden sm:block w-px h-7 bg-[var(--finance-border)]" />

            <div>
              <span className="finance-text-muted text-[10px] uppercase font-bold block">Colchón</span>
              <span className={`font-bold text-sm ${
                cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                  ? 'text-amber-600 dark:text-amber-400'
                  : isDeficit
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {isDeficit ? 'Riesgo' : cushionStatus === 'below_current' || cushionStatus === 'projected_below' ? 'Atención' : 'Saludable'}
              </span>
            </div>
          </div>

          {/* Compact Actions */}
          <div className="flex items-center gap-2">
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
            <span>Liquidez y flujo diario</span>
          </span>

          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            isDeficit
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
              : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
          }`}>
            {isDeficit
              ? 'Riesgo de déficit a 30d'
              : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
              ? 'Por debajo del colchón'
              : 'Liquidez saludable'}
          </span>
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

      {/* Main Hierarchy: Open Editorial Canvas (Protagonist = Saldo Actual, Right = Alpine Flow Bridge) */}
      <div className="relative z-10 grid gap-8 lg:grid-cols-12 items-center">
        {/* Left Column: Protagonist Saldo Actual (Cols 1-5) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="finance-text-secondary text-xs font-bold uppercase tracking-wider">
              {displayMode === 'real_available' ? 'Disponible Real' : 'Saldo Actual'}
            </span>
            <span className="finance-surface-subtle finance-text-secondary text-[10px] font-semibold px-2 py-0.5 rounded-md">
              {displayMode === 'real_available' ? 'Libre tras 30d' : 'En cuentas hoy'}
            </span>
          </div>

          {/* Giant Metric Value */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <PrivacyAmount
              as="h1"
              className="finance-text-primary text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight tabular-nums font-mono"
            >
              {fmtMoney(displayMode === 'real_available' ? realAvailable : disponible)}
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
              : 'Capital total consolidado en cuentas bancarias y efectivo.'}
          </p>

          {/* Subordinate Contextual Metrics (Direct typography, no mini-cards) */}
          <div className="finance-text-secondary pt-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span>Disponible (30d):</span>
              <PrivacyAmount as="span" className={`font-mono font-bold ${realAvailable < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fmtMoney(realAvailable)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>Compromisos:</span>
              <PrivacyAmount as="span" className="finance-text-primary font-mono font-semibold">
                −{fmtMoney(committed)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>{state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas'}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Alpine Financial Flow Bridge (Cols 6-12) */}
        {/* Answers: ¿Cómo paso de mi saldo actual al saldo proyectado? */}
        <div className="lg:col-span-7">
          <div className="finance-surface-subtle p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="finance-text-muted text-[10px] font-black uppercase tracking-wider">
                Flujo de liquidez a 30 días
              </span>
              <button
                type="button"
                onClick={onOpenCushionModal}
                className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Colchón: {fmtMoney(state.finance?.minCushion ?? 5000)}
              </button>
            </div>

            {/* Arithmetic Flow Rail: Saldo -> Compromisos -> Ingresos -> Proyección */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:text-left">
              {/* Step 1: Saldo actual */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  Saldo actual
                </span>
                <PrivacyAmount as="div" className="finance-text-primary text-base sm:text-lg font-black font-mono tabular-nums">
                  {fmtMoney(disponible)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  Base en cuentas
                </span>
              </div>

              {/* Step 2: Compromisos (-) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  − Compromisos
                </span>
                <PrivacyAmount as="div" className="finance-text-secondary text-base sm:text-lg font-black font-mono tabular-nums">
                  −{fmtMoney(committed)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  {cashFlow.commitments.length} {cashFlow.commitments.length === 1 ? 'pago' : 'pagos'} fijos
                </span>
              </div>

              {/* Step 3: Ingresos Previstos (+) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  + Ingresos
                </span>
                <PrivacyAmount as="div" className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{fmtMoney(totalExpectedIncome)}
                </PrivacyAmount>
                <span className="finance-text-muted text-[10px] block">
                  previstos a 30d
                </span>
              </div>

              {/* Step 4: Saldo Proyectado (=) */}
              <div className="space-y-0.5">
                <span className="finance-text-muted text-[10px] font-semibold uppercase tracking-wider block">
                  = Proyectado
                </span>
                <PrivacyAmount as="div" className={`text-base sm:text-lg font-black font-mono tabular-nums ${projectedBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'finance-text-primary'}`}>
                  {fmtMoney(projectedBalance)}
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
