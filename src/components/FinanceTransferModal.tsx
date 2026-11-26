import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { LifeOSState } from '../types';
import { addTransfer, deleteTransfer } from '../lib/financeFlows';
import { fmtDate, formatMoney, parseDecimalInput, todayISO } from '../lib/storage';
import { playExpenseLogged } from '../lib/audio';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';
import { PrivateFinancialText, PrivacyInput, PrivacyAmount } from './PrivacyAmount';

interface FinanceTransferModalProps {
  open: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  preselectedFromId?: string;
}

const CLEAN_FOCUS_RING =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose, '#finance-movement-trigger');

  useEffect(() => {
    if (open) {
      const initialFrom =
        preselectedFromId && accounts.some((a) => a.id === preselectedFromId)
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

  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);
  const fromCurrency = (fromAccount?.currency || 'UYU').toUpperCase();
  const toCurrency = (toAccount?.currency || 'UYU').toUpperCase();
  const fromCurrencyPrefix =
    fromCurrency === 'USD' ? 'US$' : fromCurrency === 'UYU' ? '$U' : fromCurrency;
  const isCrossCurrency = Boolean(fromAccount && toAccount && fromCurrency !== toCurrency);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDecimalInput(amount);
    if (!fromId || !toId) {
      showToast('Seleccioná ambas cuentas.', 'error');
      return;
    }
    if (fromId === toId) {
      showToast('Las cuentas de origen y destino deben ser distintas.', 'error');
      return;
    }
    if (isCrossCurrency) {
      showToast(`No se permiten transferencias entre monedas distintas (${fromCurrency} → ${toCurrency}).`, 'error');
      return;
    }
    if (parsed.error || parsed.value === null || parsed.value <= 0) {
      showToast(parsed.error || 'Ingresá un monto mayor a cero.', 'error');
      return;
    }
    const numAmount = parsed.value;

    try {
      const saved = onUpdateState((draft) => {
        addTransfer(draft, {
          fromAccountId: fromId,
          toAccountId: toId,
          amount: numAmount,
          date,
          note: note.trim() || undefined,
        });
      });
      if (saved === false) return;
      playExpenseLogged();
      showToast('Transferencia guardada sin alterar ingresos ni gastos.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al guardar la transferencia.', 'error');
    }
  };

  const handleDeleteTransfer = (id: string) => {
    try {
      const saved = onUpdateState((draft) => {
        deleteTransfer(draft, id);
      });
      if (saved === false) return;
      showToast('Transferencia eliminada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al eliminar.', 'error');
    }
  };

  const recentTransfers = [...(state.finance.transfers || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-transfer-title"
        className="flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden bg-[var(--card)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

        {/* Header — Unified transfer icon with Hero button */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5 sm:px-6 sm:pt-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <AppIcon name="transfer" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 id="finance-transfer-title" className="font-extrabold text-sm text-[var(--text)]">
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
            className={`flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] active:scale-95 cursor-pointer transition-colors ${CLEAN_FOCUS_RING}`}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 space-y-5">

        {accounts.length < 2 ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
            <p className="font-semibold">Sumá otra cuenta para habilitar transferencias.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Accounts selector with Swap button */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center">
              <div>
                <label htmlFor="finance-transfer-from" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Origen
                </label>
                <select
                  id="finance-transfer-from"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      <PrivateFinancialText>{a.name}</PrivateFinancialText> ({(a.currency || 'UYU').toUpperCase()})
                    </option>
                  ))}
                </select>
                {fromAccount && (
                  <span className="text-xs text-[var(--text-soft)] mt-1 block truncate">
                    Saldo: <PrivacyAmount as="span">{formatMoney(fromAccount.balance, fromCurrency)}</PrivacyAmount>
                  </span>
                )}
              </div>

              <div className="flex justify-center pt-1 sm:pt-4">
                <button
                  type="button"
                  onClick={handleSwap}
                  className={`p-2 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] cursor-pointer transition-all active:scale-95 ${CLEAN_FOCUS_RING}`}
                  title="Intercambiar cuentas"
                  aria-label="Intercambiar cuentas"
                >
                  <AppIcon name="transfer" className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label htmlFor="finance-transfer-to" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Destino
                </label>
                <select
                  id="finance-transfer-to"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      <PrivateFinancialText>{a.name}</PrivateFinancialText> ({(a.currency || 'UYU').toUpperCase()})
                    </option>
                  ))}
                </select>
                {toAccount && (
                  <span className="text-xs text-[var(--text-soft)] mt-1 block truncate">
                    Saldo: <PrivacyAmount as="span">{formatMoney(toAccount.balance, toCurrency)}</PrivacyAmount>
                  </span>
                )}
              </div>
            </div>

            {/* Cross-currency warning */}
            {isCrossCurrency && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <AppIcon name="shield" className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Transferencia entre monedas distintas no permitida</p>
                  <p className="text-xs opacity-90">
                    No es posible transferir directamente entre cuentas con monedas distintas ({fromCurrency} → {toCurrency}). Celestian LifeOS no convierte monedas automáticamente.
                  </p>
                </div>
              </div>
            )}

            {/* Amount (with currency prefix & clean focus) & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="finance-transfer-amount" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Monto a transferir ({fromCurrency})
                </label>
                <div className="relative">
                  <span
                    data-transfer-currency-prefix={fromCurrencyPrefix}
                    className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-xs sm:text-sm text-[var(--text-faint)] select-none pointer-events-none"
                  >
                    {fromCurrencyPrefix}
                  </span>
                  <PrivacyInput
                    id="finance-transfer-amount"
                    required
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="finance-amount-input w-full pl-11 pr-3 py-2.5 text-sm font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="finance-transfer-date" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Fecha
                </label>
                <input
                  id="finance-transfer-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label htmlFor="finance-transfer-note" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                Nota opcional
              </label>
              <PrivacyInput
                maskText
                id="finance-transfer-note"
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
              disabled={isCrossCurrency}
              className={`w-full py-3 px-4 text-xs font-bold rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-xs transition-all min-h-[44px] ${CLEAN_FOCUS_RING}`}
            >
              Confirmar transferencia
            </button>
          </form>
        )}

        {/* Recent transfers drawer — Lucide ChevronDown */}
        {recentTransfers.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              aria-expanded={showRecent}
              onClick={() => setShowRecent(!showRecent)}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer py-1.5 rounded-lg ${CLEAN_FOCUS_RING}`}
            >
              <span>Transferencias recientes ({state.finance.transfers.length})</span>
              <AppIcon
                name="chevronDown"
                className={`h-4 w-4 shrink-0 transition-transform duration-150 ${showRecent ? 'rotate-180' : ''}`}
              />
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
                        <span className="text-xs text-[var(--text-faint)]">
                          {fmtDate(t.date)} <PrivateFinancialText>{t.note ? `· ${t.note}` : ''}</PrivateFinancialText>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PrivacyAmount as="span" className="font-bold tabular-nums text-[var(--text)]">
                          {formatMoney(t.amount, fromAcc?.currency || 'UYU')}
                        </PrivacyAmount>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransfer(t.id)}
                          className={`h-7 w-7 inline-flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors ${CLEAN_FOCUS_RING}`}
                          aria-label="Eliminar transferencia"
                          title="Eliminar transferencia"
                        >
                          <AppIcon name="trash" className="h-3.5 w-3.5" />
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
    </div>
  );
};
