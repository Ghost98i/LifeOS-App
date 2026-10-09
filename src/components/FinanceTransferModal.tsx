import React, { useState, useEffect, useMemo } from 'react';
import type { LifeOSState } from '../types';
import { addTransfer, deleteTransfer } from '../lib/financeFlows';
import { fmtDate, fmtMoney, todayISO } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceTransferModalProps {
  open: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  preselectedFromId?: string;
}

export const FinanceTransferModal: React.FC<FinanceTransferModalProps> = ({
  open,
  onClose,
  state,
  onUpdateState,
  preselectedFromId,
}) => {
  const accounts = useMemo(() => state.finance?.accounts || [], [state.finance?.accounts]);
  const [fromId, setFromId] = useState(preselectedFromId || accounts[0]?.id || '');
  const [toId, setToId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    if (open) {
      const initialFrom = preselectedFromId && accounts.some((a) => a.id === preselectedFromId)
        ? preselectedFromId
        : accounts[0]?.id || '';
      setFromId(initialFrom);
      const initialTo = accounts.find((a) => a.id !== initialFrom)?.id || initialFrom;
      setToId(initialTo);
      setAmount('');
      setDate(todayISO());
      setNote('');
    }
  }, [open, preselectedFromId, accounts]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSwap = () => {
    const temp = fromId;
    setFromId(toId);
    setToId(temp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!fromId || !toId) {
      showToast('Seleccioná ambas cuentas.', 'error');
      return;
    }
    if (fromId === toId) {
      showToast('Las cuentas de origen y destino deben ser distintas.', 'error');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Ingresá un monto mayor a cero.', 'error');
      return;
    }

    try {
      onUpdateState((draft) => {
        addTransfer(draft, {
          fromAccountId: fromId,
          toAccountId: toId,
          amount: numAmount,
          date,
          note: note.trim() || undefined,
        });
      });
      playSound('coins');
      showToast('Transferencia guardada sin alterar ingresos ni gastos.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al guardar la transferencia.', 'error');
    }
  };

  const handleDeleteTransfer = (id: string) => {
    try {
      onUpdateState((draft) => {
        deleteTransfer(draft, id);
      });
      showToast('Transferencia eliminada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al eliminar.', 'error');
    }
  };

  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);
  const recentTransfers = [...(state.finance.transfers || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">
              <AppIcon name="repeat" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--text)]">
                Transferir entre cuentas
              </h3>
              <p className="text-xs text-[var(--text-soft)]">
                Movimiento interno sin alterar ingresos ni gastos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {accounts.length < 2 ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
            <p className="font-semibold">Se necesitan al menos dos cuentas para realizar una transferencia.</p>
            <p className="text-[11px] opacity-80">Creá otra cuenta desde la pestaña Cuentas para habilitar transferencias.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Accounts selector with Swap button */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Origen
                </label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {fromAccount && (
                  <span className="text-[10px] text-[var(--text-soft)] mt-1 block truncate">
                    Saldo: <PrivacyAmount as="span">{fmtMoney(fromAccount.balance)}</PrivacyAmount>
                  </span>
                )}
              </div>

              <div className="flex justify-center pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="p-2 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] cursor-pointer transition-all active:scale-95"
                  title="Intercambiar cuentas"
                >
                  <AppIcon name="repeat" className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Destino
                </label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {toAccount && (
                  <span className="text-[10px] text-[var(--text-soft)] mt-1 block truncate">
                    Saldo: <PrivacyAmount as="span">{fmtMoney(toAccount.balance)}</PrivacyAmount>
                  </span>
                )}
              </div>
            </div>

            {/* Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Monto a transferir
                </label>
                <input
                  required
                  autoFocus
                  type="number"
                  step="any"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-sm font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Nota opcional
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Extracción, carga de saldo..."
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
              />
            </div>

            {/* CTA */}
            <button
              type="submit"
              className="w-full py-3 px-4 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-98 transition-all min-h-[44px]"
            >
              Confirmar transferencia
            </button>
          </form>
        )}

        {/* Recent transfers drawer */}
        {recentTransfers.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              className="w-full flex items-center justify-between text-left text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer py-1"
            >
              <span>Transferencias recientes ({state.finance.transfers.length})</span>
              <span>{showRecent ? '▴' : '▾'}</span>
            </button>

            {showRecent && (
              <div className="mt-2 divide-y divide-[var(--border)] max-h-40 overflow-y-auto pr-1 animate-in fade-in">
                {recentTransfers.map((t) => {
                  const fromAcc = accounts.find((a) => a.id === t.fromAccountId);
                  const toAcc = accounts.find((a) => a.id === t.toAccountId);
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-[var(--text)] block truncate">
                          {fromAcc?.name || 'Cuenta'} → {toAcc?.name || 'Cuenta'}
                        </span>
                        <span className="text-[10px] text-[var(--text-faint)]">
                          {fmtDate(t.date)} {t.note ? `· ${t.note}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                          {fmtMoney(t.amount)}
                        </PrivacyAmount>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransfer(t.id)}
                          className="text-[var(--text-faint)] hover:text-rose-500 p-1 cursor-pointer transition-colors"
                          title="Eliminar transferencia"
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
        )}
      </div>
    </div>
  );
};
