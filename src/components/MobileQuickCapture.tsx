import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { addQuickTransaction, suggestedQuickAccountId } from '../lib/quickCapture';
import { todayISO } from '../lib/storage';
import { playSound } from '../lib/audio';

interface MobileQuickCaptureProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const MobileQuickCapture: React.FC<MobileQuickCaptureProps> = ({ state, open, onClose, onUpdateState }) => {
  const [type, setType] = useState<'gasto' | 'ingreso'>('ingreso');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(suggestedQuickAccountId(state, 'ingreso'));
  const [category, setCategory] = useState('Otros');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setAccountId(suggestedQuickAccountId(state, type));
    setDate(todayISO());
    setMessage('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(',', '.'));

    try {
      onUpdateState((draft) => {
        addQuickTransaction(draft, { type, amount: parsedAmount, accountId, category, note, date });
      });
      playSound('coins');
      setMessage(type === 'ingreso' ? '✓ Ingreso guardado' : '✓ Gasto guardado');
      setAmount('');
      setNote('');
      window.setTimeout(onClose, 650);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Captura rápida"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--card)] border border-[var(--border)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text)]">Captura rápida</h2>
            <p className="text-xs text-[var(--text-soft)]">Registralo ahora; organizalo después.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--bg)] text-[var(--text-soft)] font-bold" aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--bg)] p-1.5">
            {(['ingreso', 'gasto'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={`py-3 rounded-xl text-sm font-extrabold ${
                  type === option
                    ? option === 'ingreso' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-rose-600 text-white shadow-sm'
                    : 'text-[var(--text-soft)]'
                }`}
              >
                {option === 'ingreso' ? '+ Ingreso' : '− Gasto'}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Monto</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-extrabold text-[var(--text-faint)]">$</span>
              <input
                autoFocus
                required
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="13728"
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-4 pl-10 pr-4 text-2xl font-black outline-none focus:border-[var(--blue)]"
              />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Cuenta</span>
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">
                {state.finance.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label>
              <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Categoría</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">
                {state.finance.categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Concepto</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: Beca UTEC" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm" />
          </label>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm" />
          </label>

          {message && <p className="text-center text-xs font-bold text-[var(--text-soft)]">{message}</p>}

          <button type="submit" className={`w-full rounded-2xl py-4 text-sm font-extrabold text-white shadow-lg ${type === 'ingreso' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            Guardar {type}
          </button>
        </form>
      </section>
    </div>
  );
};
