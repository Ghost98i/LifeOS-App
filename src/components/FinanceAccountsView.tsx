import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { fmtDate, fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { calcDebtsTotal, calcInvestmentsTotal, calcSubscriptionsTotal } from '../lib/calculations';

interface FinanceAccountsViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onAddAccount: (name: string, balance: number) => void;
  onDeleteAccount: (id: string) => void;
  onAddSubscription?: (name: string, amount: number, dueDay: number | null) => void;
  onDeleteSubscription?: (id: string) => void;
  onAddDebt: (name: string, amount: number, monthlyPayment: number, dueDate: string | null) => void;
  onDeleteDebt: (id: string) => void;
  onAddInvestment: (name: string, amount: number) => void;
  onDeleteInvestment: (id: string) => void;
  onOpenTransfer?: () => void;
  onOpenReconcile?: (accountId: string) => void;
}

export const FinanceAccountsView: React.FC<FinanceAccountsViewProps> = ({
  state,
  onAddAccount,
  onDeleteAccount,
  onAddSubscription,
  onDeleteSubscription,
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

  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDueDay, setSubDueDay] = useState('');

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
  const subscriptions = state.finance?.subscriptions || [];

  const totalEnCuentas = accounts.reduce((acc, a) => acc + Number(a.balance || 0), 0);
  const totalDebts = calcDebtsTotal(state);
  const totalInvs = calcInvestmentsTotal(state);
  const totalSubs = calcSubscriptionsTotal(state);
  const patrimonioNeto = totalEnCuentas + totalInvs - totalDebts;

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    onAddAccount(accName.trim(), Number(accBalance) || 0);
    setAccName('');
    setAccBalance('');
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
      {/* SECTION 1: Cuentas Líquidas (Core Answer to "¿Dónde está mi dinero?") */}
      <section className="finance-surface rounded-3xl p-5 sm:p-7 border border-[var(--finance-border)] space-y-5">
        {/* Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-[var(--finance-text-primary)]">
                Cuentas líquidas
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {accounts.length} {accounts.length === 1 ? 'activa' : 'activas'}
              </span>
            </div>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
              Depósitos bancarios, billeteras digitales y efectivo donde reside tu dinero
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="text-right mr-1 hidden sm:block">
              <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block">
                Total en cuentas
              </span>
              <PrivacyAmount as="span" className="font-mono font-black text-base text-[var(--finance-text-primary)]">
                {fmtMoney(totalEnCuentas)}
              </PrivacyAmount>
            </div>

            {onOpenTransfer && (
              <button
                type="button"
                onClick={onOpenTransfer}
                className="finance-control px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:border-[var(--finance-border-strong)] min-h-[44px]"
                title="Transferir dinero entre cuentas propias"
              >
                <AppIcon name="repeat" className="h-4 w-4" />
                <span>Transferir</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="py-2 px-4 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              <span>+ Cuenta</span>
            </button>
          </div>
        </div>

        {/* Mobile Total KPI (if screen is small) */}
        <div className="sm:hidden p-3.5 rounded-2xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--finance-text-muted)]">
            Total en cuentas
          </span>
          <PrivacyAmount as="span" className="font-mono font-black text-lg text-[var(--finance-text-primary)]">
            {fmtMoney(totalEnCuentas)}
          </PrivacyAmount>
        </div>

        {/* Accounts Cards Grid */}
        {accounts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <AppIcon name="wallet" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--finance-text-primary)]">
                Sin cuentas bancarias ni billeteras
              </h3>
              <p className="text-xs text-[var(--finance-text-muted)] max-w-sm mx-auto mt-1">
                Creá tu primera cuenta (Efectivo, Banco o Billetera digital) para registrar saldos y conciliar movimientos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="py-2 px-4 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer shadow-xs"
            >
              + Crear cuenta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {accounts.map((account) => {
              const hasRecentRecon = Boolean(account.lastReconciledAt);
              return (
                <div
                  key={account.id}
                  className="finance-surface-raised p-4 sm:p-5 rounded-2xl border border-[var(--finance-border)] flex flex-col justify-between gap-4 transition-all hover:border-[var(--finance-border-strong)] shadow-2xs"
                >
                  {/* Top: Icon + Name + Delete button */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <AppIcon name="wallet" className="h-4 w-4" />
                      </div>
                      <span className="font-extrabold text-sm text-[var(--finance-text-primary)] truncate">
                        {account.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar la cuenta "${account.name}"? Solo se permite si no tiene movimientos registrados.`)) {
                          onDeleteAccount(account.id);
                        }
                      }}
                      className="text-[var(--finance-text-muted)] hover:text-rose-500 p-1 rounded-lg hover:bg-rose-500/10 text-xs cursor-pointer transition-colors"
                      title="Eliminar cuenta"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Middle: Prominent Balance */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--finance-text-muted)] block mb-0.5">
                      Saldo disponible
                    </span>
                    <PrivacyAmount
                      as="div"
                      className="text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums text-[var(--finance-text-primary)]"
                    >
                      {fmtMoney(account.balance)}
                    </PrivacyAmount>
                  </div>

                  {/* Bottom: Last reconciliation & Contextual Conciliar button */}
                  <div className="pt-2 border-t border-[var(--finance-border)] flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--finance-text-muted)] truncate">
                      {hasRecentRecon
                        ? `Conciliada ${fmtDate(account.lastReconciledAt!)}`
                        : 'Sin conciliación previa'}
                    </span>

                    {onOpenReconcile && (
                      <button
                        type="button"
                        onClick={() => onOpenReconcile(account.id)}
                        className="py-1 px-2.5 rounded-lg text-xs font-bold border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                        title={`Conciliar saldo real de ${account.name}`}
                      >
                        <AppIcon name="check" className="h-3 w-3" />
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

      {/* SECTION 2: Patrimonio Neto Consolidado & Pasivos (Secondary, Subdued) */}
      <section className="finance-surface rounded-3xl p-5 sm:p-7 border border-[var(--finance-border)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--finance-border)]">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--finance-text-primary)]">
              Patrimonio neto & balance patrimonial
            </h3>
            <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
              Cuentas (<PrivacyAmount as="span">{fmtMoney(totalEnCuentas)}</PrivacyAmount>) + Activos (<PrivacyAmount as="span">{fmtMoney(totalInvs)}</PrivacyAmount>) − Deudas (<PrivacyAmount as="span">{fmtMoney(totalDebts)}</PrivacyAmount>)
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] block">
              Patrimonio consolidado
            </span>
            <PrivacyAmount as="span" className="font-mono font-black text-lg text-[var(--finance-text-primary)]">
              {fmtMoney(patrimonioNeto)}
            </PrivacyAmount>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1">
          {/* Deudas & Préstamos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[var(--finance-text-primary)]">
                Deudas & pasivos
              </span>
              <button
                type="button"
                onClick={() => setIsAddDebtOpen(true)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + Registrar deuda
              </button>
            </div>

            {debts.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex items-center justify-between text-xs text-[var(--finance-text-muted)]">
                <span>Sin deudas registradas</span>
                <button
                  type="button"
                  onClick={() => setIsAddDebtOpen(true)}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {debts.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[var(--finance-text-primary)] block">{d.name}</span>
                      <span className="text-[10px] text-[var(--finance-text-muted)]">
                        {d.monthlyPayment ? (
                          <>Cuota mes: <PrivacyAmount as="span">{fmtMoney(d.monthlyPayment)}</PrivacyAmount></>
                        ) : (
                          'Sin cuota fija'
                        )}
                        {d.dueDate ? ` · Vence ${fmtDate(d.dueDate)}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <PrivacyAmount as="span" className="font-mono font-bold text-rose-500">
                        {fmtMoney(d.amount)}
                      </PrivacyAmount>
                      <button
                        type="button"
                        onClick={() => onDeleteDebt(d.id)}
                        className="text-[var(--finance-text-muted)] hover:text-rose-500 px-1 cursor-pointer"
                        title="Eliminar deuda"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activos & Inversiones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[var(--finance-text-primary)]">
                Inversiones & activos
              </span>
              <button
                type="button"
                onClick={() => setIsAddInvOpen(true)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + Registrar activo
              </button>
            </div>

            {investments.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex items-center justify-between text-xs text-[var(--finance-text-muted)]">
                <span>Sin inversiones registradas</span>
                <button
                  type="button"
                  onClick={() => setIsAddInvOpen(true)}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {investments.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-[var(--finance-text-primary)]">{inv.name}</span>

                    <div className="flex items-center gap-2">
                      <PrivacyAmount as="span" className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{fmtMoney(inv.amount)}
                      </PrivacyAmount>
                      <button
                        type="button"
                        onClick={() => onDeleteInvestment(inv.id)}
                        className="text-[var(--finance-text-muted)] hover:text-rose-500 px-1 cursor-pointer"
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

          {/* Suscripciones Recurrentes (Acceso discreto hasta 3.0B) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-[var(--finance-text-primary)]">
                  Suscripciones
                </span>
                {totalSubs > 0 && (
                  <span className="text-[10px] font-mono text-rose-500 font-bold">
                    (−<PrivacyAmount as="span">{fmtMoney(totalSubs)}</PrivacyAmount>/m)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsAddSubOpen(true)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + Registrar suscripción
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex items-center justify-between text-xs text-[var(--finance-text-muted)]">
                <span>Sin suscripciones registradas</span>
                <button
                  type="button"
                  onClick={() => setIsAddSubOpen(true)}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[var(--finance-text-primary)] block truncate">{sub.name}</span>
                      <span className="text-[10px] text-[var(--finance-text-muted)]">
                        {sub.dueDay ? `Día ${sub.dueDay} de cada mes` : 'Mensual'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <PrivacyAmount as="span" className="font-mono font-bold text-rose-500">
                        −{fmtMoney(sub.amount)}
                      </PrivacyAmount>
                      {onDeleteSubscription && (
                        <button
                          type="button"
                          onClick={() => onDeleteSubscription(sub.id)}
                          className="text-[var(--finance-text-muted)] hover:text-rose-500 px-1 cursor-pointer"
                          title="Eliminar suscripción"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                <input
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
                <input
                  required
                  type="number"
                  step="any"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
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

      {/* Modal: Add Subscription */}
      {isAddSubOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddSubOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Nueva suscripción</h3>
              <button
                type="button"
                onClick={() => setIsAddSubOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSub} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Servicio
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Ej. Netflix, Spotify, Gimnasio..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Costo mensual
                </label>
                <input
                  required
                  type="number"
                  step="any"
                  value={subAmount}
                  onChange={(e) => setSubAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Día de cobro en el mes (opcional)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={subDueDay}
                  onChange={(e) => setSubDueDay(e.target.value)}
                  placeholder="Ej. 15"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
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
                <input
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
                <input
                  required
                  type="number"
                  step="any"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Cuota mensual (opcional)
                </label>
                <input
                  type="number"
                  step="any"
                  value={debtMonthlyPayment}
                  onChange={(e) => setDebtMonthlyPayment(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
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
                <input
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
                <input
                  required
                  type="number"
                  step="any"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
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

      {/* Modal: Add Subscription (Acceso discreto hasta 3.0B) */}
      {isAddSubOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddSubOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Registrar suscripción recurrente</h3>
              <button
                type="button"
                onClick={() => setIsAddSubOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSub} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Nombre del servicio
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Ej. Netflix, Spotify, iCloud..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Costo mensual (UYU)
                </label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.01"
                  value={subAmount}
                  onChange={(e) => setSubAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Día de cobro en el mes (opcional)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={subDueDay}
                  onChange={(e) => setSubDueDay(e.target.value)}
                  placeholder="1 - 31"
                  className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
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
