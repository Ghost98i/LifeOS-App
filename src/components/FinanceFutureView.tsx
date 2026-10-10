import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FinancialCommitment, ExpectedIncome, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { fmtDate, fmtMoney } from '../lib/storage';
import { identifyMerchant } from '../lib/merchantIdentity';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceFutureViewProps {
  state: LifeOSState;
  projection: CashFlowProjectionResult;
  projHorizon: 30 | 60 | 90;
  onSetProjHorizon: (horizon: 30 | 60 | 90) => void;
  onOpenCommitmentModal: () => void;
  onOpenIncomeModal: () => void;
  onOpenCushionModal: () => void;
  onPayCommitment: (com: FinancialCommitment) => void;
  onEditCommitment: (com: FinancialCommitment) => void;
  onToggleCommitment: (id: string) => void;
  onDeleteCommitment: (id: string) => void;
  onConfirmIncomeReal: (inc: ExpectedIncome) => void;
  onEditIncome: (inc: ExpectedIncome) => void;
  onToggleIncome: (id: string) => void;
  onDeleteIncome: (id: string) => void;
  onAddSubscription?: (name: string, amount: number, dueDay: number | null) => void;
  onDeleteSubscription?: (id: string) => void;
}

export const FinanceFutureView: React.FC<FinanceFutureViewProps> = ({
  state,
  projection,
  projHorizon,
  onSetProjHorizon,
  onOpenCommitmentModal,
  onOpenIncomeModal,
  onOpenCushionModal,
  onPayCommitment,
  onEditCommitment,
  onToggleCommitment,
  onDeleteCommitment,
  onConfirmIncomeReal,
  onEditIncome,
  onToggleIncome,
  onDeleteIncome,
  onAddSubscription,
  onDeleteSubscription,
}) => {
  const [showScheduleDetails, setShowScheduleDetails] = useState(false);

  // Subscriptions Modal State
  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDueDay, setSubDueDay] = useState('');

  const freqLabels: Record<string, string> = {
    monthly: 'Mensual',
    biweekly: 'Quincenal',
    weekly: 'Semanal',
    yearly: 'Anual',
    once: 'Única vez',
  };

  const sortedCommitments = [...(state.finance?.commitments || [])].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.nextDueDate.localeCompare(b.nextDueDate);
  });

  const sortedIncomes = [...(state.finance?.expectedIncomes || [])].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.startDate.localeCompare(b.startDate);
  });

  const subscriptions = state.finance?.subscriptions || [];
  const totalSubs = subscriptions.reduce((acc, s) => acc + Number(s.amount || 0), 0);

  // Verification of real data conditions (avoids anxiety during onboarding or empty state)
  const accounts = state.finance?.accounts || [];
  const hasAccounts = accounts.length > 0;
  const hasNonZeroBalance = accounts.some((a) => Number(a.balance || 0) > 0);
  const hasFutureSignal =
    projection.forecastItems.length > 0 ||
    projection.commitments.length > 0 ||
    projection.dailyTrajectory.some((pt) => pt.netDayChange !== 0);

  const hasRealData = hasAccounts && (hasNonZeroBalance || hasFutureSignal);
  const hasExplicitCushion = state.finance?.minCushion != null && state.finance?.cushionEnabled !== false;

  const showDeficitAlert = hasRealData && projection.isDeficit;
  const showCushionAlert = hasRealData && hasExplicitCushion && projection.thresholdWarning && !projection.isDeficit;

  const statusBadge = !hasFutureSignal
    ? { label: 'Sin proyección', cls: 'bg-zinc-500/10 text-[var(--finance-text-muted)]' }
    : showDeficitAlert
    ? { label: 'Riesgo de Déficit', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' }
    : showCushionAlert
    ? { label: 'Alerta Colchón', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
    : { label: 'Liquidez Estable', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };

  const handleCreateSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !Number(subAmount)) return;
    if (onAddSubscription) {
      onAddSubscription(
        subName.trim(),
        Number(subAmount),
        subDueDay ? Math.min(31, Math.max(1, Number(subDueDay))) : null
      );
    }
    setSubName('');
    setSubAmount('');
    setSubDueDay('');
    setIsAddSubOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* SECTION 1: Horizon Selector & Trajectory Projections */}
      <section className="finance-surface rounded-2xl p-5 sm:p-6 space-y-4">
        {/* Header with Horizon Selection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                Trayectoria Diaria de Liquidez
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
              Simulación de saldo día por día según cobros y obligaciones previstas
            </p>
          </div>

          {/* Horizon Selector (30d default) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] self-start sm:self-auto shadow-2xs">
            {([30, 60, 90] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onSetProjHorizon(h)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  projHorizon === h
                    ? 'bg-[var(--finance-surface-raised)] text-[var(--finance-text-primary)] shadow-xs'
                    : 'text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)]'
                }`}
              >
                {h} días {h === 30 && <span className="text-[10px] opacity-70">★</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Tira compacta con métricas tipográficas integradas al horizonte */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 py-2 px-1 border-y border-[var(--finance-border)] text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-medium text-[var(--finance-text-muted)]">Flujo neto {projHorizon}d:</span>
              <PrivacyAmount
                as="span"
                className={`font-mono font-bold text-xs ${
                  projection.netCashFlow > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : projection.netCashFlow < 0
                    ? 'text-rose-500'
                    : 'text-[var(--finance-text-primary)]'
                }`}
              >
                {projection.netCashFlow > 0 ? '+' : ''}{fmtMoney(projection.netCashFlow)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--finance-text-muted)]">
                ({projection.netCashFlow >= 0 ? 'superávit' : 'déficit'})
              </span>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-medium text-[var(--finance-text-muted)]">Punto mínimo:</span>
              <PrivacyAmount
                as="span"
                className={`font-mono font-bold text-xs ${
                  projection.minProjectedBalance < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--finance-text-primary)]'
                }`}
              >
                {fmtMoney(projection.minProjectedBalance)}
              </PrivacyAmount>
              <span className="text-[10px] text-[var(--finance-text-muted)] font-mono">
                el {fmtDate(projection.minBalanceDate)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-x-4 text-[11px] text-[var(--finance-text-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Cobros:</span>
              <PrivacyAmount as="span" className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                +{fmtMoney(projection.totalExpectedIncome)}
              </PrivacyAmount>
              <span className="text-[10px] opacity-75">
                ({projection.forecastItems.filter((f) => f.type === 'income').length})
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>Salidas:</span>
              <PrivacyAmount as="span" className="font-mono font-semibold text-[var(--finance-text-secondary)]">
                −{fmtMoney(projection.committed)}
              </PrivacyAmount>
              <span className="text-[10px] opacity-75">
                ({projection.commitments.length})
              </span>
            </span>
          </div>
        </div>

        {/* Real Predictive Alerts (Only shown when actual conditions exist) */}
        {showDeficitAlert ? (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <span className="text-base shrink-0 leading-none">⚠️</span>
            <div>
              <strong className="block font-bold">Riesgo de Déficit detectado</strong>
              <span>
                Tu saldo proyecta caer a <PrivacyAmount as="strong" className="font-mono">{fmtMoney(projection.minProjectedBalance)}</PrivacyAmount> el día <strong className="font-mono">{fmtDate(projection.minBalanceDate)}</strong>. Se sugiere diferir compromisos o ingresar fondos para evitar sobregiro.
              </span>
            </div>
          </div>
        ) : showCushionAlert ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0 leading-none">⚠️</span>
              <span>
                El saldo caerá por debajo de tu colchón mínimo configurado (<PrivacyAmount as="strong" className="font-mono">{fmtMoney(projection.minProjectedBalance)}</PrivacyAmount> el {fmtDate(projection.minBalanceDate)}).
              </span>
            </div>
            <button type="button" onClick={onOpenCushionModal} className="text-[11px] font-bold underline cursor-pointer shrink-0">
              Ajustar colchón
            </button>
          </div>
        ) : null}

        {/* Daily Area Chart or Compact Adaptive Empty State */}
        {(() => {
          if (!hasFutureSignal) {
            return (
              <div className="p-4 sm:p-5 rounded-xl border border-dashed border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <AppIcon name="trendingUp" className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--finance-text-primary)] text-xs">
                      Sin movimientos futuros para proyectar en los próximos {projHorizon} días
                    </h4>
                    <p className="text-[11px] text-[var(--finance-text-muted)] mt-0.5">
                      Registrá un compromiso, una cuota o un cobro previsto para activar la simulación día a día.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={onOpenCommitmentModal}
                    className="finance-control px-2.5 py-1.5 rounded-xl border text-xs font-bold text-[var(--finance-text-primary)] hover:border-[var(--finance-border-strong)] cursor-pointer min-h-[36px]"
                  >
                    + Compromiso
                  </button>
                  <button
                    type="button"
                    onClick={onOpenIncomeModal}
                    className="finance-control px-2.5 py-1.5 rounded-xl border text-xs font-bold text-[var(--finance-text-primary)] hover:border-[var(--finance-border-strong)] cursor-pointer min-h-[36px]"
                  >
                    + Ingreso
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projection.dailyTrajectory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="futureTrajGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--finance-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      if (!val) return '';
                      const parts = val.split('-');
                      return `${parts[2]}/${parts[1]}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--finance-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload;
                        const dayEvents = projection.forecastItems.filter((f) => f.date === pt.date);
                        return (
                          <div className="finance-surface-raised border border-[var(--finance-border)] p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[210px]">
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--finance-border)] pb-1">
                              <p className="font-bold text-[var(--finance-text-primary)]">{fmtDate(pt.date)}</p>
                              {dayEvents.length > 0 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold">
                                  {dayEvents.length} {dayEvents.length === 1 ? 'evento' : 'eventos'}
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-indigo-600 dark:text-indigo-400 font-extrabold text-sm">
                              Saldo estimado: <PrivacyAmount as="span">{fmtMoney(pt.endingBalance)}</PrivacyAmount>
                            </p>
                            {pt.netDayChange !== 0 && (
                              <p className={`font-mono text-[11px] font-bold ${
                                pt.netDayChange > 0
                                  ? 'text-emerald-500'
                                  : pt.endingBalance < 0
                                  ? 'text-rose-500'
                                  : 'text-[var(--finance-text-primary)]'
                              }`}>
                                Flujo neto: <PrivacyAmount as="span">{pt.netDayChange > 0 ? '+' : ''}{fmtMoney(pt.netDayChange)}</PrivacyAmount>
                              </p>
                            )}
                            {dayEvents.length > 0 && (
                              <div className="pt-1.5 border-t border-[var(--finance-border)] space-y-1">
                                <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--finance-text-muted)]">
                                  Hitos del día:
                                </p>
                                {dayEvents.map((ev) => {
                                  const m = identifyMerchant(ev.label);
                                  return (
                                    <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="truncate flex items-center gap-1 text-[var(--finance-text-secondary)]">
                                        {m ? <span>{m.icon}</span> : <span>•</span>}
                                        <span className="truncate">{ev.label}</span>
                                      </span>
                                      <PrivacyAmount as="span" className={`font-mono font-bold shrink-0 ${ev.type === 'income' ? 'text-emerald-500' : 'text-[var(--finance-text-primary)]'}`}>
                                        {ev.type === 'income' ? '+' : '−'}{fmtMoney(ev.amount)}
                                      </PrivacyAmount>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="endingBalance"
                    stroke={projection.isDeficit ? '#f43f5e' : '#10b981'}
                    strokeWidth={2}
                    fill="url(#futureTrajGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* Milestones Strip: Top Upcoming Events along Trajectory */}
        {projection.forecastItems.length > 0 && (
          <div className="pt-3 border-t border-[var(--finance-border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--finance-text-muted)] flex items-center gap-1.5">
                <span>▲ Hitos del horizonte ({projHorizon}d)</span>
              </span>
              <span className="text-[10px] text-[var(--finance-text-muted)]">
                {projection.forecastItems.length} eventos previstos
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {projection.forecastItems.slice(0, 8).map((item) => {
                const merchant = identifyMerchant(item.label);
                const isIncome = item.type === 'income';
                return (
                  <div
                    key={item.id}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] text-xs"
                  >
                    <span className="font-mono text-[10px] font-bold text-[var(--finance-text-muted)]">
                      {fmtDate(item.date)}
                    </span>
                    {merchant ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold border"
                        style={{
                          backgroundColor: merchant.badgeBg,
                          color: merchant.badgeColor,
                          borderColor: merchant.badgeBorder,
                        }}
                      >
                        <span>{merchant.icon}</span>
                        <span className="truncate max-w-[70px]">{merchant.name}</span>
                      </span>
                    ) : (
                      <span className="truncate max-w-[80px] font-medium text-[var(--finance-text-primary)]">
                        {item.label}
                      </span>
                    )}
                    <PrivacyAmount
                      as="span"
                      className={`font-mono font-bold text-[11px] ${
                        isIncome ? 'text-emerald-500' : 'text-[var(--finance-text-primary)]'
                      }`}
                    >
                      {isIncome ? '+' : '−'}{fmtMoney(item.amount)}
                    </PrivacyAmount>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2: Structured Future Obligations & Inflows (Superficie abierta y unificada) */}
      <section className="finance-surface rounded-2xl p-5 sm:p-6 space-y-6">
        {/* Sub-block: Compromisos Fijos e Ingresos Programados en 2 Columnas / Lista Densa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna A: Compromisos Fijos & Cuotas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--finance-border)]">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                  Compromisos y cuotas
                </h3>
                <p className="text-xs text-[var(--finance-text-muted)]">
                  {sortedCommitments.length} compromiso{sortedCommitments.length === 1 ? '' : 's'} programado{sortedCommitments.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenCommitmentModal}
                className="finance-control px-2.5 py-1 text-xs font-bold rounded-xl border flex items-center gap-1 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[34px]"
              >
                <AppIcon name="plus" className="h-3 w-3" />
                <span>+ Compromiso</span>
              </button>
            </div>

            {sortedCommitments.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs text-[var(--finance-text-muted)] flex items-center justify-between">
                <span>Sin compromisos registrados</span>
                <button
                  type="button"
                  onClick={onOpenCommitmentModal}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--finance-border)] max-h-[360px] overflow-y-auto pr-1">
                {sortedCommitments.map((com) => {
                  const isOverdue = com.nextDueDate < new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={com.id}
                      className={`py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs transition-opacity ${
                        com.active ? 'opacity-100' : 'opacity-50'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[var(--finance-text-primary)] truncate">{com.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] border border-[var(--finance-border)]">
                            {freqLabels[com.frequency] || com.frequency}
                          </span>
                          {com.remainingOccurrences != null && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                              {com.remainingOccurrences} cuota{com.remainingOccurrences === 1 ? '' : 's'}
                            </span>
                          )}
                          {isOverdue && com.active && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
                              Vencido
                            </span>
                          )}
                          {!com.active && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-500/10 text-[var(--finance-text-muted)]">
                              Pausado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--finance-text-muted)]">
                          Vence: <strong className={isOverdue && com.active ? 'text-rose-500 font-mono' : 'text-[var(--finance-text-secondary)] font-mono'}>{fmtDate(com.nextDueDate)}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PrivacyAmount as="span" className={`font-mono font-bold text-xs ${isOverdue && com.active ? 'text-rose-500' : 'text-[var(--finance-text-primary)]'}`}>
                          −{fmtMoney(com.amount)}
                        </PrivacyAmount>

                        {com.active && (
                          <button
                            type="button"
                            onClick={() => onPayCommitment(com)}
                            className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-2xs"
                            title="Confirmar pago real hoy"
                          >
                            Pagar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onToggleCommitment(com.id)}
                          className="p-1 rounded text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                          title={com.active ? 'Pausar' : 'Reanudar'}
                        >
                          <AppIcon name={com.active ? 'pause' : 'play'} className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onEditCommitment(com)}
                          className="p-1 rounded text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                          title="Editar"
                        >
                          <AppIcon name="edit" className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteCommitment(com.id)}
                          className="p-1 rounded text-[var(--finance-text-muted)] hover:text-rose-500 cursor-pointer"
                          title="Eliminar"
                        >
                          <AppIcon name="trash" className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Columna B: Ingresos Programados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--finance-border)]">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                  Ingresos previstos
                </h3>
                <p className="text-xs text-[var(--finance-text-muted)]">
                  {sortedIncomes.length} cobro{sortedIncomes.length === 1 ? '' : 's'} planificado{sortedIncomes.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenIncomeModal}
                className="finance-control px-2.5 py-1 text-xs font-bold rounded-xl border flex items-center gap-1 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[34px]"
              >
                <AppIcon name="plus" className="h-3 w-3" />
                <span>+ Ingreso</span>
              </button>
            </div>

            {sortedIncomes.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs text-[var(--finance-text-muted)] flex items-center justify-between">
                <span>Sin cobros previstos</span>
                <button
                  type="button"
                  onClick={onOpenIncomeModal}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--finance-border)] max-h-[360px] overflow-y-auto pr-1">
                {sortedIncomes.map((inc) => (
                  <div
                    key={inc.id}
                    className={`py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs transition-opacity ${
                      inc.active ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[var(--finance-text-primary)] truncate">{inc.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] border border-[var(--finance-border)]">
                          {freqLabels[inc.frequency] || inc.frequency}
                        </span>
                        {!inc.active && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-500/10 text-[var(--finance-text-muted)]">
                            Pausado
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--finance-text-muted)]">
                        Desde: <strong className="font-mono text-[var(--finance-text-secondary)]">{fmtDate(inc.startDate)}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <PrivacyAmount as="span" className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        +{fmtMoney(inc.amount)}
                      </PrivacyAmount>

                      <button
                        type="button"
                        onClick={() => onConfirmIncomeReal(inc)}
                        className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-pointer transition-colors"
                        title="Registrar como cobrado hoy"
                      >
                        Cobrado
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleIncome(inc.id)}
                        className="p-1 rounded text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                        title={inc.active ? 'Pausar' : 'Reanudar'}
                      >
                        <AppIcon name={inc.active ? 'pause' : 'play'} className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditIncome(inc)}
                        className="p-1 rounded text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                        title="Editar"
                      >
                        <AppIcon name="edit" className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteIncome(inc.id)}
                        className="p-1 rounded text-[var(--finance-text-muted)] hover:text-rose-500 cursor-pointer"
                        title="Eliminar"
                      >
                        <AppIcon name="trash" className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sub-block: Suscripciones y Servicios Recurrentes (Lista densa sin carditis) */}
        <div className="border-t border-[var(--finance-border)] pt-5 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                  Suscripciones y servicios recurrentes
                </h3>
                {totalSubs > 0 && (
                  <span className="text-xs font-mono font-bold text-rose-500">
                    (−<PrivacyAmount as="span">{fmtMoney(totalSubs)}</PrivacyAmount>/mes)
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
                Costos fijos mensuales que impactan directamente tu liquidez proyectada
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddSubOpen(true)}
              className="finance-control px-2.5 py-1 text-xs font-bold rounded-xl border flex items-center gap-1 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[34px]"
            >
              <AppIcon name="plus" className="h-3 w-3" />
              <span>+ Suscripción</span>
            </button>
          </div>

          {subscriptions.length === 0 ? (
            <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-xs text-[var(--finance-text-muted)] flex items-center justify-between">
              <span>Sin suscripciones registradas</span>
              <button
                type="button"
                onClick={() => setIsAddSubOpen(true)}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + Agregar suscripción
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--finance-border)]">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--finance-surface-hover)] px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-bold text-[10px]">
                      {sub.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--finance-text-primary)] block truncate">{sub.name}</span>
                      <span className="text-[10px] text-[var(--finance-text-muted)] font-mono">
                        {sub.dueDay ? `Día ${sub.dueDay} de cada mes` : 'Cobro mensual'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <PrivacyAmount as="span" className="font-mono font-bold text-xs text-rose-500">
                      −{fmtMoney(sub.amount)}
                    </PrivacyAmount>
                    {onDeleteSubscription && (
                      <button
                        type="button"
                        onClick={() => onDeleteSubscription(sub.id)}
                        className="p-1 text-[var(--finance-text-muted)] hover:text-rose-500 rounded cursor-pointer transition-colors"
                        title="Eliminar suscripción"
                      >
                        <AppIcon name="trash" className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sub-block: Cronograma Detallado de Flujos (Expandible / Progressive Disclosure) */}
        {projection.forecastItems.length > 0 && (
          <div className="border-t border-[var(--finance-border)] pt-4">
            <button
              type="button"
              onClick={() => setShowScheduleDetails(!showScheduleDetails)}
              className="w-full flex items-center justify-between text-left cursor-pointer py-1"
            >
              <div>
                <h3 className="text-xs font-extrabold text-[var(--finance-text-primary)]">
                  Cronograma Detallado de Flujos ({projHorizon} días)
                </h3>
                <p className="text-[11px] text-[var(--finance-text-muted)]">
                  {projection.forecastItems.length} eventos de cobro y pago proyectados día por día
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[var(--finance-text-muted)]">
                {showScheduleDetails ? 'Ocultar cronograma ▴' : 'Ver cronograma día por día ▾'}
              </span>
            </button>

            {showScheduleDetails && (
              <div className="mt-3 pt-3 border-t border-[var(--finance-border)] overflow-x-auto animate-in fade-in">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--finance-border)] text-[10px] font-black uppercase text-[var(--finance-text-muted)]">
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3">Concepto</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--finance-border)]">
                    {projection.forecastItems.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`} className="hover:bg-[var(--finance-surface-hover)] transition-colors">
                        <td className="py-2 px-3 font-mono text-[var(--finance-text-primary)] whitespace-nowrap">{fmtDate(item.date)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            item.type === 'income'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : item.isOverdue
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-slate-500/10 text-[var(--finance-text-muted)]'
                          }`}>
                            {item.type === 'income' ? 'Ingreso' : item.isOverdue ? 'Vencido' : 'Salida prevista'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-[var(--finance-text-primary)]">{item.label}</td>
                        <td className={`py-2 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          item.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : item.isOverdue
                            ? 'text-rose-500'
                            : 'text-[var(--finance-text-primary)]'
                        }`}>
                          <PrivacyAmount>
                            {item.type === 'income' ? '+' : '−'}{fmtMoney(item.amount)}
                          </PrivacyAmount>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal: Add Subscription */}
      {isAddSubOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddSubOpen(false)}
        >
          <div
            className="finance-surface-raised border border-[var(--finance-border)] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--finance-text-primary)]">Nueva suscripción</h3>
              <button
                type="button"
                onClick={() => setIsAddSubOpen(false)}
                className="text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSub} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block mb-1">
                  Nombre del servicio
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Ej. Netflix, Spotify, iCloud..."
                  className="w-full p-2.5 text-xs rounded-xl finance-control border border-[var(--finance-border)] text-[var(--finance-text-primary)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block mb-1">
                  Costo mensual
                </label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.01"
                  value={subAmount}
                  onChange={(e) => setSubAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl finance-control border border-[var(--finance-border)] text-[var(--finance-text-primary)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block mb-1">
                  Día de cobro en el mes (opcional)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={subDueDay}
                  onChange={(e) => setSubDueDay(e.target.value)}
                  placeholder="1 - 31"
                  className="w-full p-2.5 text-xs font-mono rounded-xl finance-control border border-[var(--finance-border)] text-[var(--finance-text-primary)] outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
              >
                Guardar suscripción
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
