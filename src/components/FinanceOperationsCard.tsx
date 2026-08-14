import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { addTransfer, deleteTransfer, reconcileAccount } from '../lib/financeFlows';
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
      onUpdateState((draft) => { reconcileAccount(draft, { accountId, actualBalance: Number(actualBalance), date, note }); });
      setActualBalance(''); setNote(''); setMessage('✓ Cuenta conciliada. La diferencia quedó registrada como ajuste.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo conciliar.'); }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xs">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-[var(--text)]">Mover y comprobar dinero</h2>
            <span className="text-xs text-[var(--text-faint)]">{expanded ? '▴' : '▾'}</span>
          </span>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">{accounts.length} cuenta(s) · {state.finance.transfers.length} transferencia(s) · {state.finance.reconciliations.length} conciliación(es)</p>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setExpanded(true); setMode('transfer'); setMessage(''); }} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--blue)]">⇄ Transferir</button>
          <button onClick={() => { setExpanded(true); setMode('reconcile'); setMessage(''); }} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--blue)]">✓ Conciliar</button>
        </div>
      </div>

      {expanded && <div className="border-t border-[var(--border)] p-4">
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-[var(--bg)] p-1">
        <button onClick={() => { setMode('transfer'); setMessage(''); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'transfer' ? 'bg-[var(--card)] text-[var(--blue)] shadow-sm' : 'text-[var(--text-soft)]'}`}>⇄ Transferir</button>
        <button onClick={() => { setMode('reconcile'); setMessage(''); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'reconcile' ? 'bg-[var(--card)] text-[var(--blue)] shadow-sm' : 'text-[var(--text-soft)]'}`}>✓ Conciliar</button>
      </div>
      {mode === 'transfer' ? (
        <form onSubmit={submitTransfer} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Desde</span><select value={fromId} onChange={(event) => setFromId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {fmtMoney(account.balance)}</option>)}</select></label>
          <label className="lg:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Hacia</span><select value={toId} onChange={(event) => setToId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {fmtMoney(account.balance)}</option>)}</select></label>
          <label><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Monto</span><input required type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono" /></label>
          <label><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs" /></label>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional" className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs sm:col-span-2 lg:col-span-5" />
          <button className="rounded-xl bg-[var(--blue)] p-2.5 text-xs font-extrabold text-white">Transferir</button>
        </form>
      ) : (
        <form onSubmit={submitReconciliation} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Cuenta</span><select value={accountId} onChange={(event) => { setAccountId(event.target.value); setActualBalance(''); }} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · LifeOS {fmtMoney(account.balance)}</option>)}</select></label>
          <label className="lg:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Saldo real</span><input required type="number" value={actualBalance} onChange={(event) => setActualBalance(event.target.value)} placeholder="Miralo en tu banco" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono" /></label>
          <label><span className="mb-1 block text-[10px] font-black uppercase text-[var(--text-faint)]">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs" /></label>
          <button className="self-end rounded-xl bg-emerald-600 p-2.5 text-xs font-extrabold text-white">Conciliar</button>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="¿A qué se debió la diferencia? (opcional)" className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs sm:col-span-2 lg:col-span-6" />
        </form>
      )}

      {message && <p className="mt-3 text-xs font-bold text-[var(--text-soft)]">{message}</p>}
      {mode === 'transfer' && state.finance.transfers.length > 0 && <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">{[...state.finance.transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((transfer) => <div key={transfer.id} className="flex items-center gap-3 py-2.5 text-xs"><span className="font-bold text-[var(--text)]">{accounts.find((a) => a.id === transfer.fromAccountId)?.name || 'Cuenta'} → {accounts.find((a) => a.id === transfer.toAccountId)?.name || 'Cuenta'}</span><span className="ml-auto font-mono font-bold">{fmtMoney(transfer.amount)}</span><span className="text-[var(--text-faint)]">{fmtDate(transfer.date)}</span><button onClick={() => onUpdateState((draft) => deleteTransfer(draft, transfer.id))} className="text-[var(--text-faint)] hover:text-red-500">✕</button></div>)}</div>}
      </div>}
    </section>
  );
};
