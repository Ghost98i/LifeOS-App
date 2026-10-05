import React from 'react';
import { FinancialCommitment, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { fmtDate, fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { FinanceBalanceAtmosphere } from './visual/FinanceBalanceAtmosphere';

interface FinanceHeroProps {
  state: LifeOSState;
  cashFlow: CashFlowProjectionResult;
  variant?: 'full' | 'compact';
  onOpenNewTx: () => void;
  onOpenTransfer: () => void;
  onOpenCommitmentModal: () => void;
  onOpenCushionModal: () => void;
  onPayCommitment: (com: FinancialCommitment) => void;
  onEditCommitment: (com: FinancialCommitment) => void;
}

export const FinanceHero: React.FC<FinanceHeroProps> = ({
  state,
  cashFlow,
  variant = 'full',
  onOpenNewTx,
  onOpenTransfer,
  onOpenCommitmentModal,
  onOpenCushionModal,
  onPayCommitment,
  onEditCommitment,
}) => {
  const disponible = cashFlow.currentBalance;
  const realAvailable = cashFlow.realAvailable;
  const committed = cashFlow.committed;
  const projectedBalance = cashFlow.projectedBalance;
  const cushionStatus = cashFlow.cushionStatus;
  const isDeficit = cashFlow.isDeficit;

  // Determine overall atmosphere status
  const atmosphereStatus: 'healthy' | 'attention' | 'warning' | 'deficit' = isDeficit
    ? 'deficit'
    : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
    ? 'warning'
    : 'healthy';

  if (variant === 'compact') {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main KPI: Disponible Real */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Disponible Real
                </span>
                <span className={`inline-block h-2 w-2 rounded-full transition-colors motion-reduce:transition-none ${
                  isDeficit
                    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
                    : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`} />
              </div>
              <PrivacyAmount
                as="div"
                className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums font-mono mt-0.5 ${
                  realAvailable < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--text)]'
                }`}
              >
                {fmtMoney(realAvailable)}
              </PrivacyAmount>
            </div>
          </div>

          {/* Subordinate Contextual Pills */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">En cuentas:</span>
              <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                {fmtMoney(disponible)}
              </PrivacyAmount>
            </div>

            <div className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Proyectado (30d):</span>
              <PrivacyAmount as="span" className={`font-mono font-bold ${projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                {fmtMoney(projectedBalance)}
              </PrivacyAmount>
            </div>

            <div className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Colchón:</span>
              <span className={`font-bold ${
                cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                  ? 'text-amber-600 dark:text-amber-400'
                  : cushionStatus === 'disabled'
                  ? 'text-[var(--text-faint)]'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {cushionStatus === 'below_current' ? 'Por debajo' : cushionStatus === 'projected_below' ? 'Atención' : cushionStatus === 'disabled' ? 'Inactivo' : 'Saludable'}
              </span>
            </div>
          </div>

          {/* Action Shortcut */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenNewTx}
              className="primary-button py-1.5 px-3 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
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
    <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7 shadow-xs">
      {/* Ambient Visual Atmosphere */}
      <FinanceBalanceAtmosphere status={atmosphereStatus} />

      {/* Top Bar: Eyebrow status & Fast Actions */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="eyebrow flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
            <span className={`inline-block h-2 w-2 rounded-full transition-colors motion-reduce:transition-none ${
              isDeficit
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
                : cushionStatus === 'below_current' || cushionStatus === 'projected_below'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`} />
            <span>Liquidez & Flujo Diario</span>
          </span>

          {isDeficit ? (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
              Riesgo de Déficit a 30d
            </span>
          ) : cushionStatus === 'below_current' || cushionStatus === 'projected_below' ? (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
              Por debajo del Colchón
            </span>
          ) : (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Liquidez Saludable
            </span>
          )}
        </div>

        {/* Global Action CTAs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTransfer}
            className="secondary-button py-2 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title="Mover dinero entre cuentas propias"
          >
            <AppIcon name="repeat" className="h-3.5 w-3.5" />
            <span>Transferir</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewTx}
            className="primary-button py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            <span>+ Movimiento</span>
          </button>
        </div>
      </div>

      {/* Main Hierarchy Grid: Editorial Asymmetric Layout */}
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] items-start">
        {/* Left Column: Protagonist KPI (Disponible Real) */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                Disponible Real
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--text-faint)]">
                Libre tras 30d
              </span>
            </div>

            {/* Giant Metric Value */}
            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
              <PrivacyAmount
                as="h1"
                className={`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight tabular-nums font-mono ${
                  realAvailable < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--text)]'
                }`}
              >
                {fmtMoney(realAvailable)}
              </PrivacyAmount>

              {realAvailable < 0 && (
                <span className="text-xs font-extrabold px-2 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  Déficit de liquidez
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--text-soft)] mt-1.5 max-w-md">
              Lo que podés gastar hoy con seguridad sin comprometer tus pagos fijos y deudas de los próximos 30 días.
            </p>
          </div>

          {/* Subordinated Reality: Saldo Actual en Cuentas */}
          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-faint)]">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[var(--text-soft)]">En cuentas hoy:</span>
              <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                {fmtMoney(disponible)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>Comprometido 30d:</span>
              <PrivacyAmount as="span" className="font-mono font-bold text-rose-500">
                −{fmtMoney(committed)}
              </PrivacyAmount>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span>{state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas'}</span>
            </div>
          </div>

          {/* Contextual Warning Banner for Cushion */}
          {cushionStatus !== 'disabled' && cushionStatus !== 'ok' && (
            <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 font-medium">
              <div className="flex items-center gap-2">
                <span className="text-sm">⚠️</span>
                <span>{cashFlow.cushionMessage}</span>
              </div>
              <button
                type="button"
                onClick={onOpenCushionModal}
                className="text-[11px] underline font-bold cursor-pointer hover:opacity-80 shrink-0"
              >
                Ajustar colchón
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Key Forward Projections Bento */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/60 p-4 sm:p-5 space-y-3.5 shadow-2xs">
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                Compromisos Fijos
              </span>
              <PrivacyAmount as="span" className="text-lg font-black font-mono text-rose-500 block mt-0.5 tabular-nums">
                −{fmtMoney(committed)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">
                {cashFlow.commitments.length} {cashFlow.commitments.length === 1 ? 'pago' : 'pagos'} en 30d
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                Próximos Ingresos
              </span>
              <PrivacyAmount as="span" className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 block mt-0.5 tabular-nums">
                +{fmtMoney(cashFlow.totalExpectedIncome)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">
                previstos en 30d
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                Saldo Proyectado (30d)
              </span>
              <PrivacyAmount as="span" className={`text-base font-black font-mono block mt-0.5 tabular-nums ${projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                {fmtMoney(projectedBalance)}
              </PrivacyAmount>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                Colchón Mínimo
              </span>
              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                <span className="text-xs font-mono font-bold text-[var(--text-soft)]">
                  {state.finance.cushionEnabled !== false && state.finance.minCushion ? fmtMoney(state.finance.minCushion) : 'Inactivo'}
                </span>
                <button
                  type="button"
                  onClick={onOpenCushionModal}
                  className="text-[11px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                  title="Configurar Colchón"
                >
                  ⚙
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Immediate Upcoming Commitments Strip (Curated Strip) */}
      <div className="relative z-10 mt-6 pt-5 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
              Próximos Vencimientos Inmediatos
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--text-soft)] font-bold">
              {cashFlow.commitments.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenCommitmentModal}
            className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer flex items-center gap-1"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            <span>+ Compromiso</span>
          </button>
        </div>

        {cashFlow.commitments.length === 0 ? (
          <p className="text-xs text-[var(--text-soft)] py-2">
            No tenés pagos fijados ni cuotas comprometidas en los próximos 30 días. Todo tu saldo en cuentas está libre.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 pt-0.5 scrollbar-thin">
            {cashFlow.commitments.slice(0, 6).map((item) => {
              const comEntity = state.finance?.commitments?.find(
                (c) => c.id === item.id.replace('com-', '').replace(/-\d{4}-\d{2}-\d{2}$/, '')
              );
              const isOverdue = item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10);

              return (
                <div
                  key={item.id}
                  className={`min-w-[210px] sm:min-w-[230px] rounded-2xl border p-3.5 shadow-2xs flex flex-col justify-between transition-all ${
                    isOverdue
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="block truncate text-xs font-bold text-[var(--text)]">
                        {item.label}
                      </span>
                      {comEntity?.remainingOccurrences != null && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)] shrink-0 font-bold">
                          {comEntity.remainingOccurrences} cuota{comEntity.remainingOccurrences === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    <PrivacyAmount as="span" className="mt-1 block text-sm font-black font-mono text-rose-500">
                      −{fmtMoney(item.amount)}
                    </PrivacyAmount>

                    <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-faint)]">
                      {isOverdue ? (
                        <span className="text-rose-600 dark:text-rose-400 font-bold">Venció {fmtDate(item.dueDate || '')}</span>
                      ) : (
                        <span>Vence {item.dueDate ? fmtDate(item.dueDate) : 'pendiente'}</span>
                      )}
                    </div>
                  </div>

                  {comEntity && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--border)]/60 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => onPayCommitment(comEntity)}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <AppIcon name="check" className="h-3 w-3" />
                        <span>Pagar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditCommitment(comEntity)}
                        className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
