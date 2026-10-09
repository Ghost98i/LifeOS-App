import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FinancialCommitment, ExpectedIncome, LifeOSState } from '../types';
import { CashFlowProjectionResult } from '../lib/calculations';
import { fmtDate, fmtMoney } from '../lib/storage';
import { identifyMerchant } from '../lib/merchantIdentity';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { SignatureEmptyState } from './SignatureEmptyState';

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
}) => {
  const [showScheduleDetails, setShowScheduleDetails] = useState(false);

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

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* SECTION 1: Horizon Selector & Core Liquidity Trajectory */}
      <div className="finance-surface rounded-3xl p-6 space-y-5">
        {/* Header with 30/60/90 Horizon Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-[var(--text)]">Trayectoria Diaria de Liquidez</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                projection.isDeficit
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : projection.thresholdWarning
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}>
                {projection.isDeficit ? 'Riesgo de Déficit' : projection.thresholdWarning ? 'Alerta Colchón' : 'Saludable'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-soft)] mt-0.5">
              Simulación de saldo día a día según cobros y salidas previstas
            </p>
          </div>

          {/* Horizon Selector (30d default) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] self-start sm:self-auto shadow-2xs">
            {([30, 60, 90] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onSetProjHorizon(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  projHorizon === h
                    ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
                    : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {h} días {h === 30 && <span className="text-[10px] opacity-70">★</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 4-Bento Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="finance-surface-subtle p-3.5 rounded-2xl">
            <span className="finance-text-muted text-[10px] font-bold uppercase tracking-wider block">Saldo Inicial</span>
            <PrivacyAmount as="span" className="finance-text-primary font-mono font-black text-xl block mt-1">
              {fmtMoney(projection.currentBalance)}
            </PrivacyAmount>
            <span className="finance-text-muted text-[10px] block mt-0.5">en cuentas hoy</span>
          </div>

          <div className="finance-surface-subtle p-3.5 rounded-2xl">
            <span className="finance-text-muted text-[10px] font-bold uppercase tracking-wider block">Ingresos Esperados</span>
            <PrivacyAmount as="span" className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400 block mt-1">
              +{fmtMoney(projection.totalExpectedIncome)}
            </PrivacyAmount>
            <span className="finance-text-muted text-[10px] block mt-0.5">{projection.forecastItems.filter((f) => f.type === 'income').length} cobros</span>
          </div>

          <div className="finance-surface-subtle p-3.5 rounded-2xl">
            <span className="finance-text-muted text-[10px] font-bold uppercase tracking-wider block">Salidas previstas</span>
            <PrivacyAmount as="span" className="finance-text-primary font-mono font-black text-xl block mt-1">
              −{fmtMoney(projection.committed)}
            </PrivacyAmount>
            <span className="finance-text-muted text-[10px] block mt-0.5">{projection.commitments.length} pagos</span>
          </div>

          <div className="finance-surface-subtle p-3.5 rounded-2xl">
            <span className="finance-text-muted text-[10px] font-bold uppercase tracking-wider block">Saldo Proyectado</span>
            <PrivacyAmount as="span" className={`font-mono font-black text-xl block mt-1 ${projection.projectedBalance < 0 ? 'text-rose-600' : 'finance-text-primary'}`}>
              {fmtMoney(projection.projectedBalance)}
            </PrivacyAmount>
            <span className="finance-text-muted text-[10px] block mt-0.5">al {fmtDate(projection.horizonIso)}</span>
          </div>
        </div>

        {/* Predictive Integrated Banner */}
        {projection.isDeficit ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <strong className="block font-bold">Riesgo de Déficit detectado</strong>
              <span>
                Tu saldo proyecta caer a <PrivacyAmount as="strong" className="font-mono">{fmtMoney(projection.minProjectedBalance)}</PrivacyAmount> el día <strong className="font-mono">{fmtDate(projection.minBalanceDate)}</strong>. Se sugiere diferir compromisos o ingresar fondos para evitar sobregiro.
              </span>
            </div>
          </div>
        ) : projection.thresholdWarning ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">⚠️</span>
              <span>
                El saldo caerá por debajo de tu colchón mínimo (<PrivacyAmount as="strong" className="font-mono">{fmtMoney(projection.minProjectedBalance)}</PrivacyAmount> el {fmtDate(projection.minBalanceDate)}).
              </span>
            </div>
            <button type="button" onClick={onOpenCushionModal} className="text-[11px] font-bold underline cursor-pointer shrink-0">
              Ajustar colchón
            </button>
          </div>
        ) : null}

        {/* Daily Area Chart or Adaptive Empty State */}
        {(() => {
          const hasFutureSignal =
            projection.forecastItems.length > 0 ||
            projection.commitments.length > 0 ||
            projection.dailyTrajectory.some((pt) => pt.netDayChange !== 0);

          if (!hasFutureSignal) {
            return (
              <SignatureEmptyState
                title="Todavía no hay movimientos futuros para proyectar"
                description="Agregá un compromiso, una cuota o un ingreso previsto para visualizar cómo evolucionará tu liquidez día por día."
                iconName="trendingUp"
                actionLabel="+ Compromiso"
                onAction={onOpenCommitmentModal}
                secondaryActionLabel="+ Ingreso previsto"
                onSecondaryAction={onOpenIncomeModal}
                motif="finance"
              />
            );
          }

          return (
            <div className="h-72 sm:h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projection.dailyTrajectory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="futureTrajGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      if (!val) return '';
                      const parts = val.split('-');
                      return `${parts[2]}/${parts[1]}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
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
                          <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px]">
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/60 pb-1">
                              <p className="font-bold text-[var(--text)]">{fmtDate(pt.date)}</p>
                              {dayEvents.length > 0 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold">
                                  {dayEvents.length} {dayEvents.length === 1 ? 'hito' : 'hitos'}
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[var(--blue)] font-extrabold text-sm">
                              Saldo estimado: <PrivacyAmount as="span">{fmtMoney(pt.endingBalance)}</PrivacyAmount>
                            </p>
                            {pt.netDayChange !== 0 && (
                              <p className={`font-mono text-[11px] font-bold ${
                                pt.netDayChange > 0
                                  ? 'text-emerald-500'
                                  : pt.endingBalance < 0
                                    ? 'text-rose-500'
                                    : 'text-[var(--text)]'
                              }`}>
                                Flujo neto: <PrivacyAmount as="span">{pt.netDayChange > 0 ? '+' : ''}{fmtMoney(pt.netDayChange)}</PrivacyAmount>
                              </p>
                            )}
                            {dayEvents.length > 0 && (
                              <div className="pt-1.5 border-t border-[var(--border)]/50 space-y-1">
                                <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-faint)]">
                                  Hitos del día:
                                </p>
                                {dayEvents.map((ev) => {
                                  const m = identifyMerchant(ev.label);
                                  return (
                                    <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="truncate flex items-center gap-1 text-[var(--text-soft)]">
                                        {m ? <span>{m.icon}</span> : <span>•</span>}
                                        <span className="truncate">{ev.label}</span>
                                      </span>
                                      <PrivacyAmount as="span" className={`font-mono font-bold shrink-0 ${ev.type === 'income' ? 'text-emerald-500' : 'text-[var(--text)]'}`}>
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
                    strokeWidth={2.2}
                    fill="url(#futureTrajGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* Milestones Strip: Top Upcoming Events along Trajectory */}
        {projection.forecastItems.length > 0 && (
          <div className="pt-3 border-t border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-faint)] flex items-center gap-1.5">
                <span>▲ Hitos del Período ({projHorizon}d)</span>
              </span>
              <span className="text-[10px] text-[var(--text-soft)]">
                {projection.forecastItems.length} eventos planificados
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
              {projection.forecastItems.slice(0, 8).map((item) => {
                const merchant = identifyMerchant(item.label);
                const isIncome = item.type === 'income';
                return (
                  <div
                    key={item.id}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 text-xs"
                  >
                    <span className="font-mono text-[10px] font-bold text-[var(--text-faint)]">
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
                      <span className="truncate max-w-[80px] font-medium text-[var(--text)]">
                        {item.label}
                      </span>
                    )}
                    <PrivacyAmount
                      as="span"
                      className={`font-mono font-bold text-[11px] ${
                        isIncome ? 'text-emerald-500' : 'text-[var(--text)]'
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
      </div>

      {/* SECTION 2: Grid de Compromisos Fijos & Ingresos Programados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sub-block A: Compromisos Fijos */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-[var(--text)]">Compromisos y cuotas</h3>
              <p className="text-xs text-[var(--text-soft)]">
                {sortedCommitments.length} compromiso{sortedCommitments.length === 1 ? '' : 's'} programado{sortedCommitments.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCommitmentModal}
              className="secondary-button py-1.5 px-3 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Compromiso</span>
            </button>
          </div>

          {sortedCommitments.length === 0 ? (
            <p className="text-xs text-[var(--text-soft)] py-4 text-center border border-dashed border-[var(--border)] rounded-xl">
              Sin compromisos registrados.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {sortedCommitments.map((com) => {
                const isOverdue = com.nextDueDate < new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={com.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      com.active
                        ? 'bg-[var(--surface-muted)]/40 border-[var(--border)]'
                        : 'bg-[var(--surface-muted)]/20 border-[var(--border)]/50 opacity-60'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[var(--text)] truncate">{com.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--card)] text-[var(--text-soft)] border border-[var(--border)]">
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
                      </div>
                      <div className="text-[10px] text-[var(--text-soft)]">
                        Vence: <strong className={isOverdue ? 'text-rose-500' : 'text-[var(--text)]'}>{fmtDate(com.nextDueDate)}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <PrivacyAmount as="span" className={`font-mono font-bold text-xs ${isOverdue && com.active ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                        −{fmtMoney(com.amount)}
                      </PrivacyAmount>

                      {com.active && (
                        <button
                          type="button"
                          onClick={() => onPayCommitment(com)}
                          className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-2xs"
                          title="Confirmar pago real"
                        >
                          Pagar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onToggleCommitment(com.id)}
                        className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                        title={com.active ? 'Pausar' : 'Reanudar'}
                      >
                        <AppIcon name={com.active ? 'pause' : 'play'} className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditCommitment(com)}
                        className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                        title="Editar"
                      >
                        <AppIcon name="edit" className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCommitment(com.id)}
                        className="p-1 rounded text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
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

        {/* Sub-block B: Ingresos Programados */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-[var(--text)]">Ingresos Previstos</h3>
              <p className="text-xs text-[var(--text-soft)]">
                {sortedIncomes.length} cobro{sortedIncomes.length === 1 ? '' : 's'} planificado{sortedIncomes.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenIncomeModal}
              className="secondary-button py-1.5 px-3 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Ingreso</span>
            </button>
          </div>

          {sortedIncomes.length === 0 ? (
            <p className="text-xs text-[var(--text-soft)] py-4 text-center border border-dashed border-[var(--border)] rounded-xl">
              Sin ingresos previstos.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {sortedIncomes.map((inc) => (
                <div
                  key={inc.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    inc.active
                      ? 'bg-[var(--surface-muted)]/40 border-[var(--border)]'
                      : 'bg-[var(--surface-muted)]/20 border-[var(--border)]/50 opacity-60'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[var(--text)] truncate">{inc.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--card)] text-[var(--text-soft)] border border-[var(--border)]">
                        {freqLabels[inc.frequency] || inc.frequency}
                      </span>
                      {!inc.active && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-500/10 text-zinc-500">
                          Pausado
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-soft)]">
                      Desde: <strong className="font-mono text-[var(--text)]">{fmtDate(inc.startDate)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <PrivacyAmount as="span" className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      +{fmtMoney(inc.amount)}
                    </PrivacyAmount>

                    <button
                      type="button"
                      onClick={() => onConfirmIncomeReal(inc)}
                      className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-pointer transition-colors"
                      title="Registrar como cobrado hoy"
                    >
                      Cobrado
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleIncome(inc.id)}
                      className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                      title={inc.active ? 'Pausar' : 'Reanudar'}
                    >
                      <AppIcon name={inc.active ? 'pause' : 'play'} className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditIncome(inc)}
                      className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                      title="Editar"
                    >
                      <AppIcon name="edit" className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteIncome(inc.id)}
                      className="p-1 rounded text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
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

      {/* SECTION 3: Cronograma de Flujos (Expandible / Progressive Disclosure) */}
      {projection.forecastItems.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs">
          <button
            type="button"
            onClick={() => setShowScheduleDetails(!showScheduleDetails)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div>
              <h3 className="text-xs font-extrabold text-[var(--text)]">Cronograma Detallado de Flujos ({projHorizon} días)</h3>
              <p className="text-[11px] text-[var(--text-soft)]">
                {projection.forecastItems.length} eventos de cobro y pago proyectados
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--text-soft)]">
              {showScheduleDetails ? 'Ocultar cronograma ▴' : 'Ver cronograma día por día ▾'}
            </span>
          </button>

          {showScheduleDetails && (
            <div className="mt-4 pt-3 border-t border-[var(--border)] overflow-x-auto animate-in fade-in">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--text-faint)]">
                    <th className="py-2 px-3">Fecha</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Concepto</th>
                    <th className="py-2 px-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {projection.forecastItems.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="hover:bg-[var(--surface-muted)]/40 transition-colors">
                      <td className="py-2 px-3 font-mono text-[var(--text)] whitespace-nowrap">{fmtDate(item.date)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          item.type === 'income'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : item.isOverdue
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-slate-500/10 text-[var(--text-soft)]'
                        }`}>
                          {item.type === 'income' ? 'Ingreso' : item.isOverdue ? 'Vencido' : 'Salida prevista'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium text-[var(--text)]">{item.label}</td>
                      <td className={`py-2 px-3 text-right font-mono font-bold whitespace-nowrap ${
                        item.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.isOverdue
                            ? 'text-rose-500'
                            : 'text-[var(--text)]'
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
    </div>
  );
};
