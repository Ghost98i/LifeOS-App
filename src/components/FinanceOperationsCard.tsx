import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { addTransfer, deleteReconciliation, deleteTransfer, reconcileAccount, updateReconciliation } from '../lib/financeFlows';
import { fmtDate, fmtMoney, todayISO } from '../lib/storage';

interface FinanceOperationsCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const FinanceOperationsCard: React.FC<FinanceOperationsCardProps> = ({ state, onUpdateState }) => {
  const accounts = state.finance.accounts;
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'transfer' | 'reconcile'>('transfer');
  const [fromId, setFromId] = useState(accounts[0]?.id || '');
  const [toId, setToId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [actualBalance, setActualBalance] = useState('');
  const [message, setMessage] = useState('');
  const [editingReconciliationId, setEditingReconciliationId] = useState<string | null>(null);

  useEffect(() => {
    if (!accounts.some((item) => item.id === fromId)) setFromId(accounts[0]?.id || '');
    if (!accounts.some((item) => item.id === toId)) setToId(accounts[1]?.id || accounts[0]?.id || '');
    if (!accounts.some((item) => item.id === accountId)) setAccountId(accounts[0]?.id || '');
  }, [accountId, accounts, fromId, toId]);

  const submitTransfer = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      onUpdateState((draft) => { addTransfer(draft, { fromAccountId: fromId, toAccountId: toId, amount: Number(amount), date, note }); });
      setAmount(''); setNote(''); setMessage('✓ Transferencia guardada sin inflar ingresos ni gastos.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
  };

  const submitReconciliation = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      onUpdateState((draft) => {
        const input = { accountId, actualBalance: Number(actualBalance), date, note };
        if (editingReconciliationId) updateReconciliation(draft, editingReconciliationId, input);
        else reconcileAccount(draft, input);
      });
      setActualBalance(''); setNote(''); setMessage('✓ Cuenta conciliada. La diferencia quedó registrada como ajuste.');
      setEditingReconciliationId(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo conciliar.'); }
  };

  return (
    <section className="finance-surface overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left cursor-pointer">
          <span className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-[var(--text)]">Operaciones de cuenta</h2>
            <span className="text-xs text-[var(--text-faint)]">{expanded ? '▴' : '▾'}</span>
          </span>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">
            Transferí dinero entre tus cuentas o conciliá el saldo real. ({accounts.length} cuenta(s) · {state.finance.transfers.length} transferencia(s) · {state.finance.reconciliations.length} conciliación(es))
          </p>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setExpanded(true); setMode('transfer'); setMessage(''); }} className="finance-control rounded-xl px-3 py-2 text-xs font-bold text-[var(--blue)] cursor-pointer">⇄ Transferir</button>
          <button type="button" onClick={() => { setExpanded(true); setMode('reconcile'); setMessage(''); }} className="finance-control rounded-xl px-3 py-2 text-xs font-bold text-[var(--blue)] cursor-pointer">✓ <span className="hidden sm:inline">Conciliar saldo</span><span className="sm:hidden">Conciliar</span></button>
        </div>
      </div>

      {expanded && <div className="finance-divider border-t p-4">
      <div className="finance-surface-subtle mb-4 grid grid-cols-2 rounded-xl p-1">
        <button type="button" onClick={() => { setMode('transfer'); setMessage(''); }} className={`rounded-lg px-3 py-2 text-xs font-bold cursor-pointer ${mode === 'transfer' ? 'finance-surface-raised text-[var(--blue)]' : 'finance-text-secondary'}`}>⇄ Transferir</button>
        <button type="button" onClick={() => { setMode('reconcile'); setMessage(''); }} className={`rounded-lg px-3 py-2 text-xs font-bold cursor-pointer ${mode === 'reconcile' ? 'finance-surface-raised text-[var(--blue)]' : 'finance-text-secondary'}`}>✓ Conciliar saldo</button>
      </div>
      {mode === 'transfer' ? (
        <form onSubmit={submitTransfer} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2"><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Desde</span><select value={fromId} onChange={(event) => setFromId(event.target.value)} className="finance-control w-full rounded-xl p-2.5 text-xs">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {fmtMoney(account.balance)}</option>)}</select></label>
          <label className="lg:col-span-2"><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Hacia</span><select value={toId} onChange={(event) => setToId(event.target.value)} className="finance-control w-full rounded-xl p-2.5 text-xs">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {fmtMoney(account.balance)}</option>)}</select></label>
          <label><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Monto</span><input required type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="finance-control w-full rounded-xl p-2.5 text-xs font-mono" /></label>
          <label><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="finance-control w-full rounded-xl p-2.5 text-xs" /></label>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional" className="finance-control rounded-xl p-2.5 text-xs sm:col-span-2 lg:col-span-5" />
          <button className="rounded-xl bg-[var(--blue)] p-2.5 text-xs font-extrabold text-white">Transferir</button>
        </form>
      ) : (
        <form onSubmit={submitReconciliation} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2"><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Cuenta</span><select disabled={Boolean(editingReconciliationId)} value={accountId} onChange={(event) => { setAccountId(event.target.value); setActualBalance(''); }} className="finance-control w-full rounded-xl p-2.5 text-xs disabled:opacity-60">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · LifeOS {fmtMoney(account.balance)}</option>)}</select></label>
          <label className="lg:col-span-2"><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Saldo real</span><input required type="number" value={actualBalance} onChange={(event) => setActualBalance(event.target.value)} placeholder="Miralo en tu banco" className="finance-control w-full rounded-xl p-2.5 text-xs font-mono" /></label>
          <label><span className="finance-text-muted mb-1 block text-[10px] font-black uppercase">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="finance-control w-full rounded-xl p-2.5 text-xs" /></label>
          <button className="self-end rounded-xl bg-emerald-600 p-2.5 text-xs font-extrabold text-white">{editingReconciliationId ? 'Guardar cambios' : 'Conciliar'}</button>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="¿A qué se debió la diferencia? (opcional)" className="finance-control rounded-xl p-2.5 text-xs sm:col-span-2 lg:col-span-6" />
        </form>
      )}

      {message && <p className="mt-3 text-xs font-bold text-[var(--text-soft)]">{message}</p>}
      {mode === 'transfer' && state.finance.transfers.length > 0 && <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">{[...state.finance.transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((transfer) => <div key={transfer.id} className="flex items-center gap-3 py-2.5 text-xs"><span className="font-bold text-[var(--text)]">{accounts.find((a) => a.id === transfer.fromAccountId)?.name || 'Cuenta'} → {accounts.find((a) => a.id === transfer.toAccountId)?.name || 'Cuenta'}</span><span className="ml-auto font-mono font-bold">{fmtMoney(transfer.amount)}</span><span className="text-[var(--text-faint)]">{fmtDate(transfer.date)}</span><button onClick={() => onUpdateState((draft) => deleteTransfer(draft, transfer.id))} className="text-[var(--text-faint)] hover:text-red-500">✕</button></div>)}</div>}
      {mode === 'reconcile' && state.finance.reconciliations.length > 0 && <div className="finance-divider mt-4 space-y-2 border-t pt-3">
        <div><h3 className="text-xs font-extrabold text-[var(--text)]">Conciliaciones guardadas</h3><p className="text-[10px] text-[var(--text-soft)]">Podés corregir o limpiar duplicados. Eliminar una conciliación no mueve tu saldo actual.</p></div>
        {[...state.finance.reconciliations].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div key={item.id} className="finance-surface-subtle flex flex-wrap items-center gap-2 rounded-xl p-2.5 text-xs">
          <span className="font-bold text-[var(--text)]">{accounts.find((account) => account.id === item.accountId)?.name || 'Cuenta'}</span>
          <span className="font-mono font-bold">{fmtMoney(item.actualBalance)}</span>
          <span className="text-[var(--text-faint)]">{fmtDate(item.date)}</span>
          {item.note && <span className="min-w-0 flex-1 truncate text-[var(--text-soft)]">{item.note}</span>}
          <div className="ml-auto flex gap-1.5"><button type="button" onClick={() => { setEditingReconciliationId(item.id); setAccountId(item.accountId); setActualBalance(String(item.actualBalance)); setDate(item.date); setNote(item.note || ''); }} className="finance-control rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--blue)]">Editar</button><button type="button" onClick={() => { if (confirm('¿Eliminar esta conciliación? El saldo actual se conservará.')) onUpdateState((draft) => deleteReconciliation(draft, item.id)); }} className="rounded-lg border border-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-500">Eliminar</button></div>
        </div>)}
      </div>}
      </div>}
    </section>
  );
};
