import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { fmtDate, fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { FinanceOperationsCard } from './FinanceOperationsCard';
import { calcDebtsTotal, calcInvestmentsTotal, calcSubscriptionsTotal } from '../lib/calculations';

interface FinanceAccountsViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onAddAccount: (name: string, balance: number) => void;
  onDeleteAccount: (id: string) => void;
  onAddSubscription: (name: string, amount: number, dueDay: number | null) => void;
  onDeleteSubscription: (id: string) => void;
  onAddDebt: (name: string, amount: number, monthlyPayment: number, dueDate: string | null) => void;
  onDeleteDebt: (id: string) => void;
  onAddInvestment: (name: string, amount: number) => void;
  onDeleteInvestment: (id: string) => void;
}

export const FinanceAccountsView: React.FC<FinanceAccountsViewProps> = ({
  state,
  onUpdateState,
  onAddAccount,
  onDeleteAccount,
  onAddSubscription,
  onDeleteSubscription,
  onAddDebt,
  onDeleteDebt,
  onAddInvestment,
  onDeleteInvestment,
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
  const totalEnCuentas = (state.finance.accounts || []).reduce((acc, a) => acc + Number(a.balance || 0), 0);
  const totalSubs = calcSubscriptionsTotal(state);
  const totalDebts = calcDebtsTotal(state);
  const totalInvs = calcInvestmentsTotal(state);
  const patrimonioNeto = totalEnCuentas + totalInvs - totalDebts;

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    onAddAccount(accName.trim(), Number(accBalance) || 0);
    setAccName('');
    setAccBalance('');
    setIsAddAccountOpen(false);
  };

  const handleCreateSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !Number(subAmount)) return;
    onAddSubscription(
      subName.trim(),
      Number(subAmount),
      subDueDay ? Math.min(31, Math.max(1, Number(subDueDay))) : null
    );
    setSubName('');
    setSubAmount('');
    setSubDueDay('');
    setIsAddSubOpen(false);
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
    <div className="space-y-6 animate-in fade-in">
      {/* SECTION 1: Operaciones de Cuenta (Transferir & Conciliar) */}
      <FinanceOperationsCard state={state} onUpdateState={onUpdateState} />

      {/* SECTION 2: Cuentas y Billeteras Líquidas */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text)]">Cuentas Bancarias & Billeteras</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Depósitos líquidos donde reside tu dinero físico o digital
            </p>
          </div>

          <div className="flex items-center gap-2">
            <PrivacyAmount as="span" className="font-mono font-bold text-sm text-[var(--text)] hidden sm:inline-block">
              {fmtMoney(totalEnCuentas)}
            </PrivacyAmount>
            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="primary-button py-1.5 px-3 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Cuenta</span>
            </button>
          </div>
        </div>

        {/* Account Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(state.finance.accounts || []).map((account) => {
            const hasRecentRecon = Boolean(account.lastReconciledAt);
            return (
              <div
                key={account.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-3.5 flex flex-col justify-between space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-xs text-[var(--text)] truncate">{account.name}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteAccount(account.id)}
                    className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                    title="Eliminar cuenta (sólo si no tiene movimientos)"
                  >
                    ✕
                  </button>
                </div>

                <div>
                  <PrivacyAmount as="div" className="font-mono font-black text-lg text-[var(--text)]">
                    {fmtMoney(account.balance)}
                  </PrivacyAmount>
                  <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">
                    {hasRecentRecon ? `Conciliada ${fmtDate(account.lastReconciledAt!)}` : 'Sin conciliación registrada'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Obligaciones Recurrentes (Suscripciones tratadas como compromisos periódicos) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text)]">Suscripciones Recurrentes</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Servicios mensuales automáticos que se deducen de tu disponibilidad
            </p>
          </div>

          <div className="flex items-center gap-2">
            <PrivacyAmount as="span" className="font-mono font-bold text-xs text-rose-500 hidden sm:inline-block">
              −{fmtMoney(totalSubs)}/mes
            </PrivacyAmount>
            <button
              type="button"
              onClick={() => setIsAddSubOpen(true)}
              className="secondary-button py-1.5 px-3 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>+ Suscripción</span>
            </button>
          </div>
        </div>

        {(state.finance.subscriptions || []).length === 0 ? (
          <p className="text-xs text-[var(--text-soft)] py-2 text-center border border-dashed border-[var(--border)] rounded-xl">
            Sin suscripciones configuradas.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {state.finance.subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-[var(--text)] block truncate">{sub.name}</span>
                  <span className="text-[10px] text-[var(--text-faint)]">
                    {sub.dueDay ? `Vence el día ${sub.dueDay} de cada mes` : 'Mensual sin fecha fija'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <PrivacyAmount as="span" className="font-mono font-bold text-rose-500">
                    −{fmtMoney(sub.amount)}
                  </PrivacyAmount>
                  <button
                    type="button"
                    onClick={() => onDeleteSubscription(sub.id)}
                    className="text-[var(--text-faint)] hover:text-rose-500 px-1 cursor-pointer"
                    title="Eliminar suscripción"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 4: Patrimonio & Balance Patrimonial (Inversiones vs Deudas) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text)]">Patrimonio Neto & Pasivos</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Lectura global: Cuentas ({fmtMoney(totalEnCuentas)}) + Activos ({fmtMoney(totalInvs)}) − Deudas ({fmtMoney(totalDebts)})
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
              Patrimonio Consolidado
            </span>
            <PrivacyAmount as="span" className="font-mono font-black text-base text-[var(--text)]">
              {fmtMoney(patrimonioNeto)}
            </PrivacyAmount>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Deudas & Pasivos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)]">Deudas & Préstamos</span>
              <button
                type="button"
                onClick={() => setIsAddDebtOpen(true)}
                className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
              >
                + Registrar deuda
              </button>
            </div>

            {(state.finance.debts || []).length === 0 ? (
              <p className="text-xs text-[var(--text-faint)] py-4 text-center border border-dashed border-[var(--border)] rounded-xl">
                Sin deudas registradas 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {state.finance.debts.map((d) => (
                  <div key={d.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-[var(--text)] block">{d.name}</span>
                      <span className="text-[10px] text-[var(--text-soft)]">
                        {d.monthlyPayment ? <>Cuota mes: <PrivacyAmount as="span">{fmtMoney(d.monthlyPayment)}</PrivacyAmount></> : 'Sin cuota'}
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
                        className="text-[var(--text-faint)] hover:text-rose-500 px-1 cursor-pointer"
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
              <span className="text-xs font-bold text-[var(--text)]">Inversiones & Activos Fijos</span>
              <button
                type="button"
                onClick={() => setIsAddInvOpen(true)}
                className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
              >
                + Registrar activo
              </button>
            </div>

            {(state.finance.investments || []).length === 0 ? (
              <p className="text-xs text-[var(--text-faint)] py-4 text-center border border-dashed border-[var(--border)] rounded-xl">
                Sin inversiones cargadas.
              </p>
            ) : (
              <div className="space-y-2">
                {state.finance.investments.map((inv) => (
                  <div key={inv.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text)]">{inv.name}</span>

                    <div className="flex items-center gap-2">
                      <PrivacyAmount as="span" className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{fmtMoney(inv.amount)}
                      </PrivacyAmount>
                      <button
                        type="button"
                        onClick={() => onDeleteInvestment(inv.id)}
                        className="text-[var(--text-faint)] hover:text-rose-500 px-1 cursor-pointer"
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
        </div>
      </div>

      {/* Modal: Add Account */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={() => setIsAddAccountOpen(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text)]">Nueva Cuenta</h3>
              <button type="button" onClick={() => setIsAddAccountOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Nombre</label>
                <input required autoFocus type="text" value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Ej. Prex, Santander, Efectivo..." className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Saldo Inicial (UYU)</label>
                <input required type="number" step="any" value={accBalance} onChange={(e) => setAccBalance(e.target.value)} placeholder="0.00" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <button type="submit" className="w-full primary-button py-2.5 text-xs font-bold cursor-pointer">Crear Cuenta</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Subscription */}
      {isAddSubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={() => setIsAddSubOpen(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text)]">Nueva Suscripción Mensual</h3>
              <button type="button" onClick={() => setIsAddSubOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
            </div>
            <form onSubmit={handleCreateSub} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Servicio</label>
                <input required autoFocus type="text" value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Ej. Netflix, Spotify, Gimnasio..." className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Monto Mensual</label>
                  <input required type="number" step="any" value={subAmount} onChange={(e) => setSubAmount(e.target.value)} placeholder="0.00" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Día Vencimiento</label>
                  <input type="number" min="1" max="31" value={subDueDay} onChange={(e) => setSubDueDay(e.target.value)} placeholder="1 al 31" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
                </div>
              </div>
              <button type="submit" className="w-full primary-button py-2.5 text-xs font-bold cursor-pointer">Guardar Suscripción</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Debt */}
      {isAddDebtOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={() => setIsAddDebtOpen(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text)]">Registrar Deuda / Préstamo</h3>
              <button type="button" onClick={() => setIsAddDebtOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 p-2 rounded-lg bg-amber-500/10">
              💡 Si este pago ya lo tenés cargado en "Compromisos Financieros", recordá que registrarlo aquí sumará al cálculo de pasivos del patrimonio neto.
            </p>
            <form onSubmit={handleCreateDebt} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Concepto</label>
                <input required autoFocus type="text" value={debtName} onChange={(e) => setDebtName(e.target.value)} placeholder="Ej. Tarjeta, Préstamo coche..." className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Saldo Total</label>
                  <input required type="number" step="any" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} placeholder="0.00" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Cuota Mensual (Opc.)</label>
                  <input type="number" step="any" value={debtMonthlyPayment} onChange={(e) => setDebtMonthlyPayment(e.target.value)} placeholder="0.00" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Vencimiento (Opcional)</label>
                <input type="date" value={debtDueDate} onChange={(e) => setDebtDueDate(e.target.value)} className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <button type="submit" className="w-full primary-button py-2.5 text-xs font-bold cursor-pointer">Guardar Deuda</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Investment */}
      {isAddInvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={() => setIsAddInvOpen(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--text)]">Registrar Activo / Inversión</h3>
              <button type="button" onClick={() => setIsAddInvOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
            </div>
            <form onSubmit={handleCreateInv} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Nombre del Activo</label>
                <input required autoFocus type="text" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Ej. Fondo común, Crypto, Inmueble..." className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">Valor Estimado (UYU)</label>
                <input required type="number" step="any" value={invAmount} onChange={(e) => setInvAmount(e.target.value)} placeholder="0.00" className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]" />
              </div>
              <button type="submit" className="w-full primary-button py-2.5 text-xs font-bold cursor-pointer">Guardar Activo</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
