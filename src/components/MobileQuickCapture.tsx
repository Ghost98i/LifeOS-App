import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { addQuickNote, addQuickTask, addQuickTransaction, suggestedQuickAccountId } from '../lib/quickCapture';
import { todayISO } from '../lib/storage';
import { playSound } from '../lib/audio';

interface MobileQuickCaptureProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

type CaptureKind = 'tarea' | 'ingreso' | 'gasto' | 'nota';

const captureOptions: { kind: CaptureKind; label: string; icon: string }[] = [
  { kind: 'tarea', label: 'Tarea', icon: '✓' },
  { kind: 'ingreso', label: 'Ingreso', icon: '+' },
  { kind: 'gasto', label: 'Gasto', icon: '−' },
  { kind: 'nota', label: 'Nota', icon: '✎' },
];

export const MobileQuickCapture: React.FC<MobileQuickCaptureProps> = ({ state, open, onClose, onUpdateState }) => {
  const [kind, setKind] = useState<CaptureKind>('tarea');
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(suggestedQuickAccountId(state, 'ingreso'));
  const [category, setCategory] = useState('Otros');
  const [date, setDate] = useState(todayISO());
  const [message, setMessage] = useState('');

  const isFinance = kind === 'ingreso' || kind === 'gasto';

  useEffect(() => {
    if (!open) return;
    const transactionType = kind === 'gasto' ? 'gasto' : 'ingreso';
    setAccountId(suggestedQuickAccountId(state, transactionType));
    setDate(todayISO());
    setMessage('');
  }, [open, kind, state]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      onUpdateState((draft) => {
        if (isFinance) {
          addQuickTransaction(draft, {
            type: kind,
            amount: Number(amount.replace(',', '.')),
            accountId,
            category,
            note: text,
            date,
          });
        } else if (kind === 'tarea') {
          addQuickTask(draft, text, priority, date);
        } else {
          addQuickNote(draft, text, date);
        }
      });
      playSound(isFinance ? 'coins' : 'success');
      setMessage('✓ Guardado');
      setAmount('');
      setText('');
      window.setTimeout(onClose, 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Captura universal"
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--card)] border border-[var(--border)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text)]">Capturar</h2>
            <p className="text-xs text-[var(--text-soft)]">Un solo botón para sacar algo de tu cabeza.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--bg)] text-[var(--text-soft)] font-bold" aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-[var(--bg)] p-1.5">
            {captureOptions.map((option) => (
              <button
                key={option.kind}
                type="button"
                onClick={() => setKind(option.kind)}
                className={`rounded-xl py-2.5 text-[11px] font-extrabold ${kind === option.kind ? 'bg-[var(--card)] text-[var(--blue)] shadow-sm' : 'text-[var(--text-soft)]'}`}
              >
                <span className="block text-base leading-none mb-1">{option.icon}</span>{option.label}
              </button>
            ))}
          </div>

          {isFinance && (
            <label className="block">
              <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Monto</span>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-extrabold text-[var(--text-faint)]">$</span>
                <input autoFocus required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-4 pl-10 pr-4 text-2xl font-black outline-none focus:border-[var(--blue)]" />
              </div>
            </label>
          )}

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">{kind === 'tarea' ? '¿Qué hay que hacer?' : kind === 'nota' ? '¿Qué querés guardar?' : 'Concepto'}</span>
            <input autoFocus={!isFinance} required={!isFinance} value={text} onChange={(event) => setText(event.target.value)} placeholder={kind === 'tarea' ? 'Ej.: Pedir hora al dentista' : kind === 'nota' ? 'Idea, dato o recordatorio…' : 'Ej.: Beca UTEC'} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 text-sm outline-none focus:border-[var(--blue)]" />
          </label>

          {kind === 'tarea' && (
            <div className="grid grid-cols-3 gap-2">
              {(['alta', 'media', 'baja'] as const).map((item) => <button key={item} type="button" onClick={() => setPriority(item)} className={`rounded-xl border px-3 py-2 text-xs font-bold capitalize ${priority === item ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>{item}</button>)}
            </div>
          )}

          {isFinance && (
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
          )}

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm" />
          </label>

          {message && <p className="text-center text-xs font-bold text-[var(--text-soft)]">{message}</p>}
          <button type="submit" className="w-full rounded-2xl bg-[var(--blue)] py-4 text-sm font-extrabold text-white shadow-lg">Guardar</button>
        </form>
      </section>
    </div>
  );
};
