import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { fmtDate, fmtMoney, formatMoney, parseDecimalInput } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivateFinancialText, PrivacyInput, PrivacyAmount } from './PrivacyAmount';
import {
  calcAccountsTotal,
  calcDebtsTotal,
  calcInvestmentsTotal,
  calcNetWorth,
} from '../lib/calculations';
import { FinanceAgreementsSection } from './FinanceAgreementsSection';
import { maskFinancialText } from '../lib/financialPrivacy';

interface FinanceAccountsViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onAddAccount: (name: string, balance: number, currency?: string) => void;
  onDeleteAccount: (id: string) => void;
  onAddDebt: (name: string, amount: number, monthlyPayment: number, dueDate: string | null) => void;
  onDeleteDebt: (id: string) => void;
  onAddInvestment: (name: string, amount: number) => void;
  onDeleteInvestment: (id: string) => void;
  onOpenTransfer?: () => void;
  onOpenReconcile?: (accountId: string) => void;
}

export const FinanceAccountsView: React.FC<FinanceAccountsViewProps> = ({
  state,
  onUpdateState,
  onAddAccount,
  onDeleteAccount,
  onAddDebt,
  onDeleteDebt,
  onAddInvestment,
  onDeleteInvestment,
  onOpenTransfer,
  onOpenReconcile,
}) => {
  // Modal states for adding entities
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState('');
  const [accCurrency, setAccCurrency] = useState<'UYU' | 'USD'>('UYU');

  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtMonthlyPayment, setDebtMonthlyPayment] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');

  const [isAddInvOpen, setIsAddInvOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invAmount, setInvAmount] = useState('');

  // Computations
  const accounts = state.finance?.accounts || [];
  const debts = state.finance?.debts || [];
  const investments = state.finance?.investments || [];
  const agreements = state.finance?.agreements || [];
  const activeAgreements = agreements.filter((a) => a.status !== 'cancelled');

  const totalEnCuentasUYU = calcAccountsTotal(state, 'UYU');
  const totalInvs = calcInvestmentsTotal(state);
  const totalDebtsUYU = calcDebtsTotal(state, 'UYU');
  const patrimonioNetoUYU = calcNetWorth(state, 'UYU');

  const totalEnCuentasUSD = calcAccountsTotal(state, 'USD');
  const totalDebtsUSD = calcDebtsTotal(state, 'USD');
  const patrimonioNetoUSD = calcNetWorth(state, 'USD');

  const hasUYUAccount = accounts.some((a) => (a.currency || 'UYU').toUpperCase() === 'UYU');
  const hasUYUAgreement = activeAgreements.some((a) => (a.currency || 'UYU').toUpperCase() === 'UYU');
  const hasUSDAccount = accounts.some((a) => (a.currency || 'UYU').toUpperCase() === 'USD');
  const hasUSDAgreement = activeAgreements.some((a) => (a.currency || 'UYU').toUpperCase() === 'USD');

  const showUSD = hasUSDAccount || hasUSDAgreement || totalEnCuentasUSD !== 0 || totalDebtsUSD !== 0;
  const showUYU =
    hasUYUAccount ||
    hasUYUAgreement ||
    investments.length > 0 ||
    debts.length > 0 ||
    totalEnCuentasUYU !== 0 ||
    totalDebtsUYU !== 0 ||
    !showUSD;

  const excludedLegacyDebtIds = new Set(
    activeAgreements.map((a) => a.linkedLegacyDebtId).filter(Boolean)
  );
  const unlinkedLegacyDebtsTotal = debts
    .filter((d) => !excludedLegacyDebtIds.has(d.id))
    .reduce((s, d) => s + Number(d.amount || 0), 0);

  const isPureLiquidityUYU =
    totalInvs === 0 &&
    totalDebtsUYU === 0 &&
    activeAgreements.filter((a) => (a.currency || 'UYU').toUpperCase() === 'UYU').length === 0;

  const isPureLiquidityUSD =
    totalDebtsUSD === 0 &&
    activeAgreements.filter((a) => (a.currency || 'UYU').toUpperCase() === 'USD').length === 0;

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const parsed = parseDecimalInput(accBalance.trim() || '0');
    if (parsed.error || parsed.value === null) {
      alert(parsed.error || 'Saldo inicial inválido');
      return;
    }
    onAddAccount(accName.trim(), parsed.value, accCurrency);
    setAccName('');
    setAccBalance('');
    setAccCurrency('UYU');
    setIsAddAccountOpen(false);
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtName.trim() || !Number(debtAmount)) return;
    onAddDebt(
      debtName.trim(),
      Number(debtAmount),
      Number(debtMonthlyPayment) || 0,
      debtDueDate || null
    );
    setDebtName('');
    setDebtAmount('');
    setDebtMonthlyPayment('');
    setDebtDueDate('');
    setIsAddDebtOpen(false);
  };

  const handleCreateInv = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim() || !Number(invAmount)) return;
    onAddInvestment(invName.trim(), Number(invAmount));
    setInvName('');
    setInvAmount('');
    setIsAddInvOpen(false);
  };

  return (
    <div className="space-y-7 animate-in fade-in">
      {/* SECTION 1: Cuentas Líquidas (Core Answer to "¿Dónde está mi dinero?") */}
      <section className="space-y-4 pt-0.5">
        {/* Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--finance-text-primary)]">
                Tus cuentas
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[11px] tabular-nums font-semibold bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)]">
                {accounts.length}
              </span>
            </div>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
              Cuentas bancarias, billeteras y efectivo
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {onOpenTransfer && (
              <button
                type="button"
                onClick={onOpenTransfer}
                className="finance-control px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[40px]"
                title="Transferir dinero entre cuentas propias"
              >
                <AppIcon name="repeat" className="h-4 w-4" />
                <span>Transferir</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="py-2 px-4 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all min-h-[40px]"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              <span>Nueva cuenta</span>
            </button>
          </div>
        </div>

        {/* Accounts Cards Grid */}
        {accounts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <AppIcon name="wallet" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--finance-text-primary)]">
              Sin cuentas
              </h3>
              <p className="text-xs text-[var(--finance-text-muted)] max-w-sm mx-auto mt-1">
                Agregá una cuenta para registrar saldos y movimientos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="py-2 px-4 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Crear cuenta</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {accounts.map((account) => {
              const hasRecentRecon = Boolean(account.lastReconciledAt);
              return (
                <div
                  key={account.id}
                  className="finance-surface-raised p-4 sm:p-5 rounded-2xl border border-[var(--finance-border)] flex flex-col justify-between gap-3.5 transition-all hover:border-[var(--finance-border-strong)] shadow-2xs"
                >
                  {/* Top: Name + Currency + Delete button */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm text-[var(--finance-text-primary)] break-words [overflow-wrap:anywhere]">
                        <PrivateFinancialText>{account.name}</PrivateFinancialText>
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] shrink-0">
                        {(account.currency || 'UYU').toUpperCase()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(maskFinancialText(`¿Eliminar la cuenta "${account.name}"? Solo se permite si no tiene movimientos registrados.`, Boolean(state.settings.privacyMode)))) {
                          onDeleteAccount(account.id);
                        }
                      }}
                      className="text-[var(--finance-text-muted)] hover:text-rose-500 p-1 -mr-1 -mt-0.5 rounded-lg hover:bg-rose-500/10 text-xs cursor-pointer transition-colors shrink-0"
                      title="Eliminar cuenta"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Middle: Prominent Balance */}
                  <div>
                    <PrivacyAmount
                      as="div"
                      className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                    >
                      {formatMoney(account.balance, account.currency || 'UYU')}
                    </PrivacyAmount>
                  </div>

                  {/* Bottom: Last reconciliation & Contextual Conciliar button */}
                  <div className="pt-2.5 border-t border-[var(--finance-border)] flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--finance-text-muted)] truncate">
                      {hasRecentRecon
                        ? `Conciliada ${fmtDate(account.lastReconciledAt!)}`
                        : 'Sin conciliación previa'}
                    </span>

                    {onOpenReconcile && (
                      <button
                        type="button"
                        onClick={() => onOpenReconcile(account.id)}
                        className="finance-control py-1 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                        title={maskFinancialText(`Conciliar saldo real de ${account.name}`, Boolean(state.settings.privacyMode))}
                      >
                        <AppIcon
                          name="check"
                          className={`h-3 w-3 ${
                            hasRecentRecon ? 'text-emerald-500' : 'text-[var(--finance-text-muted)]'
                          }`}
                        />
                        <span>Conciliar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* BLOQUE A: Patrimonio por moneda */}
      <section className="finance-surface rounded-2xl border border-[var(--finance-border)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--finance-text-primary)]">
              Patrimonio por moneda
            </h2>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
                Cuentas e inversiones menos deudas. No equivale al dinero disponible.
            </p>
          </div>
        </div>

        <div className="space-y-3.5">
          {showUYU && (
            <div className="pt-3.5 border-t border-[var(--finance-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap">
                <span className="self-start sm:self-center px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                  UYU
                </span>

                {isPureLiquidityUYU ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--finance-text-muted)]">
                    <span>Solo cuentas; no incluye activos externos ni deudas.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-4 text-xs">
                    <div className="flex sm:block items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--finance-text-muted)] block">
                        Liquidez registrada
                      </span>
                      <PrivacyAmount as="span" className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]">
                        {formatMoney(totalEnCuentasUYU, 'UYU')}
                      </PrivacyAmount>
                    </div>

                    <span className="hidden sm:inline text-sm font-bold text-[var(--finance-text-muted)] select-none" aria-hidden="true">
                      +
                    </span>

                    <div className="flex sm:block items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--finance-text-muted)] block">
                        Inversiones y activos
                      </span>
                      <PrivacyAmount as="span" className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]">
                        {formatMoney(totalInvs, 'UYU')}
                      </PrivacyAmount>
                    </div>

                    <span className="hidden sm:inline text-sm font-bold text-[var(--finance-text-muted)] select-none" aria-hidden="true">
                      −
                    </span>

                    <div className="flex sm:block items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--finance-text-muted)] block">
                        Pasivos computados
                      </span>
                      <PrivacyAmount as="span" className="text-sm sm:text-base font-bold tabular-nums text-rose-500">
                        {formatMoney(totalDebtsUYU, 'UYU')}
                      </PrivacyAmount>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2.5 lg:pt-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[var(--finance-border)] flex lg:block items-baseline justify-between gap-3 shrink-0 lg:text-right">
                <span className="text-xs font-bold text-[var(--finance-text-secondary)] block">
                  Patrimonio neto UYU
                </span>
                <PrivacyAmount
                  as="span"
                  className={`text-lg sm:text-xl font-black tabular-nums ${
                    patrimonioNetoUYU < 0 ? 'text-rose-500' : 'text-[var(--finance-text-primary)]'
                  }`}
                >
                  {formatMoney(patrimonioNetoUYU, 'UYU')}
                </PrivacyAmount>
              </div>
            </div>
          )}

          {showUSD && (
            <div className="pt-3.5 border-t border-[var(--finance-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap">
                <span className="self-start sm:self-center px-2 py-0.5 rounded-md text-xs font-bold bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)] shrink-0">
                  USD
                </span>

                {isPureLiquidityUSD ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--finance-text-muted)]">
                    <span>Solo cuentas en USD; no incluye deudas.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-4 text-xs">
                    <div className="flex sm:block items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--finance-text-muted)] block">
                        Liquidez registrada
                      </span>
                      <PrivacyAmount as="span" className="text-sm sm:text-base font-bold tabular-nums text-[var(--finance-text-primary)]">
                        {formatMoney(totalEnCuentasUSD, 'USD')}
                      </PrivacyAmount>
                    </div>

                    <span className="hidden sm:inline text-sm font-bold text-[var(--finance-text-muted)] select-none" aria-hidden="true">
                      −
                    </span>

                    <div className="flex sm:block items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--finance-text-muted)] block">
                        Pasivos computados
                      </span>
                      <PrivacyAmount as="span" className="text-sm sm:text-base font-bold tabular-nums text-rose-500">
                        {formatMoney(totalDebtsUSD, 'USD')}
                      </PrivacyAmount>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2.5 lg:pt-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[var(--finance-border)] flex lg:block items-baseline justify-between gap-3 shrink-0 lg:text-right">
                <span className="text-xs font-bold text-[var(--finance-text-secondary)] block">
                  Patrimonio neto USD
                </span>
                <PrivacyAmount
                  as="span"
                  className={`text-lg sm:text-xl font-black tabular-nums ${
                    patrimonioNetoUSD < 0 ? 'text-rose-500' : 'text-[var(--finance-text-primary)]'
                  }`}
                >
                  {formatMoney(patrimonioNetoUSD, 'USD')}
                </PrivacyAmount>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* BLOQUE B: Acuerdos y financiaciones (Sección independiente sobre el fondo principal) */}
      <FinanceAgreementsSection state={state} onUpdateState={onUpdateState} />

      {/* BLOQUE C: Inversiones y otros pasivos (Dos paneles independientes) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Panel 1: Inversiones y activos */}
        <div className="finance-surface rounded-2xl border border-[var(--finance-border)] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                Inversiones y activos
              </h3>
              {investments.length > 0 ? (
                <span className="text-xs text-[var(--finance-text-muted)] block mt-0.5">
                  Subtotal UYU:{' '}
                  <PrivacyAmount as="strong" className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{fmtMoney(totalInvs)}
                  </PrivacyAmount>
                </span>
              ) : (
                <span className="text-xs text-[var(--finance-text-muted)] block mt-0.5">
                  Activos y reservas registradas fuera de cuentas operativas
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsAddInvOpen(true)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
            >
              + Registrar activo
            </button>
          </div>

          {investments.length === 0 ? (
            <p className="text-xs text-[var(--finance-text-muted)]">Sin inversiones registradas.</p>
          ) : (
            <div className="divide-y divide-[var(--finance-border)] border-t border-[var(--finance-border)]">
              {investments.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3 first:pt-3 last:pb-0.5 flex items-center justify-between gap-3 text-xs"
                >
                  <span className="font-semibold text-[var(--finance-text-primary)] min-w-0 break-words [overflow-wrap:anywhere]">
                    <PrivateFinancialText>{inv.name}</PrivateFinancialText>
                  </span>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <PrivacyAmount as="span" className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{fmtMoney(inv.amount)}
                    </PrivacyAmount>
                    <button
                      type="button"
                      onClick={() => onDeleteInvestment(inv.id)}
                      className="text-[var(--finance-text-muted)] hover:text-rose-500 p-1 rounded-lg cursor-pointer transition-colors"
                      title="Eliminar inversión"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel 2: Otros pasivos registrados */}
        <div className="finance-surface rounded-2xl border border-[var(--finance-border)] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
                Otras deudas registradas
              </h3>
              {debts.length > 0 ? (
                <span className="text-xs text-[var(--finance-text-muted)] block mt-0.5">
                  Deudas sin acuerdo vinculado (UYU):{' '}
                  <PrivacyAmount
                    as="strong"
                    className={`font-bold tabular-nums ${
                      unlinkedLegacyDebtsTotal > 0 ? 'text-rose-500' : 'text-[var(--finance-text-secondary)]'
                    }`}
                  >
                    {fmtMoney(unlinkedLegacyDebtsTotal)}
                  </PrivacyAmount>
                </span>
              ) : (
                <span className="text-xs text-[var(--finance-text-muted)] block mt-0.5">
                  Deudas y obligaciones fijas sin cronograma en Acuerdos
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsAddDebtOpen(true)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
            >
              + Registrar deuda
            </button>
          </div>

          {debts.length === 0 ? (
            <p className="text-xs text-[var(--finance-text-muted)]">Sin deudas registradas.</p>
          ) : (
            <div className="divide-y divide-[var(--finance-border)] border-t border-[var(--finance-border)]">
              {debts.map((d) => {
                const linkedAgreement = activeAgreements.find((a) => a.linkedLegacyDebtId === d.id);
                return (
                  <div
                    key={d.id}
                    className={`py-3 first:pt-3 last:pb-0.5 flex items-start sm:items-center justify-between gap-3 text-xs ${
                      linkedAgreement ? 'opacity-75' : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-semibold ${
                            linkedAgreement ? 'text-[var(--finance-text-secondary)]' : 'text-[var(--finance-text-primary)]'
                          }`}
                        >
                          <PrivateFinancialText>{d.name}</PrivateFinancialText>
                        </span>
                        {linkedAgreement && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] text-[var(--finance-text-secondary)]"
                            title={maskFinancialText(`Vinculada al acuerdo "${linkedAgreement.title}"`, Boolean(state.settings.privacyMode))}
                          >
                            Contabilizada en Acuerdos · Excluida de este subtotal
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--finance-text-muted)] block">
                        {d.monthlyPayment ? (
                          <>
                            Cuota mes: <PrivacyAmount as="span">{fmtMoney(d.monthlyPayment)}</PrivacyAmount>
                          </>
                        ) : (
                          'Sin cuota fija'
                        )}
                        {d.dueDate ? ` · Vence ${fmtDate(d.dueDate)}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        {linkedAgreement && (
                          <span className="text-[10px] text-[var(--finance-text-muted)] block">
                            Importe original
                          </span>
                        )}
                        <PrivacyAmount
                          as="span"
                          className={`tabular-nums ${
                            linkedAgreement
                              ? 'font-semibold text-[var(--finance-text-muted)]'
                              : 'font-bold text-rose-500'
                          }`}
                        >
                          {fmtMoney(d.amount)}
                        </PrivacyAmount>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteDebt(d.id)}
                        className="text-[var(--finance-text-muted)] hover:text-rose-500 p-1 rounded-lg cursor-pointer transition-colors"
                        title="Eliminar deuda"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Modal: Add Account */}
      {isAddAccountOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddAccountOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Nueva cuenta</h3>
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Nombre de la cuenta
                </label>
                <PrivacyInput maskText
                  required
                  autoFocus
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ej. Banco, Efectivo, Prex..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Saldo inicial
                </label>
                <PrivacyInput
                  type="text"
                  inputMode="decimal"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  placeholder="0,00"
                  className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Moneda
                </label>
                <select
                  value={accCurrency}
                  onChange={(e) => setAccCurrency(e.target.value as 'UYU' | 'USD')}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="UYU">UYU ($U - Pesos Uruguayos)</option>
                  <option value="USD">USD (US$ - Dólares)</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
              >
                Crear cuenta
              </button>
            </form>
          </div>
        </div>
      )}



      {/* Modal: Add Debt */}
      {isAddDebtOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddDebtOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Registrar deuda</h3>
              <button
                type="button"
                onClick={() => setIsAddDebtOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateDebt} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Acreedor o concepto
                </label>
                <PrivacyInput maskText
                  required
                  autoFocus
                  type="text"
                  value={debtName}
                  onChange={(e) => setDebtName(e.target.value)}
                  placeholder="Ej. Tarjeta de crédito, Préstamo..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Monto total
                </label>
                <PrivacyInput
                  required
                  type="number"
                  step="any"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Cuota mensual (opcional)
                </label>
                <PrivacyInput
                  type="number"
                  step="any"
                  value={debtMonthlyPayment}
                  onChange={(e) => setDebtMonthlyPayment(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Fecha de vencimiento (opcional)
                </label>
                <input
                  type="date"
                  value={debtDueDate}
                  onChange={(e) => setDebtDueDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
              >
                Guardar deuda
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Investment */}
      {isAddInvOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddInvOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Registrar activo o inversión</h3>
              <button
                type="button"
                onClick={() => setIsAddInvOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateInv} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Nombre del activo
                </label>
                <PrivacyInput maskText
                  required
                  autoFocus
                  type="text"
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  placeholder="Ej. Plazo fijo, Fondos, Bono..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Valor estimado
                </label>
                <PrivacyInput
                  required
                  type="number"
                  step="any"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
              >
                Guardar activo
              </button>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};
