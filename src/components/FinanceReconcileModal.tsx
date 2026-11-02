import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { LifeOSState } from '../types';
import { reconcileAccount, updateReconciliation, deleteReconciliation } from '../lib/financeFlows';
import { fmtDate, formatMoney, diffMoney, parseDecimalInput, todayISO } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';
import { PrivateFinancialText, PrivacyInput, PrivacyAmount } from './PrivacyAmount';

interface FinanceReconcileModalProps {
  open: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  accountId: string;
}

export const FinanceReconcileModal: React.FC<FinanceReconcileModalProps> = ({
  open,
  onClose,
  state,
  onUpdateState,
  accountId: initialAccountId,
}) => {
  const accounts = useMemo(() => state.finance?.accounts || [], [state.finance?.accounts]);
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId || accounts[0]?.id || '');
  const [actualBalance, setActualBalance] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [editingReconId, setEditingReconId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  useEffect(() => {
    if (open) {
      const targetId = initialAccountId && accounts.some((a) => a.id === initialAccountId)
        ? initialAccountId
        : accounts[0]?.id || '';
      setSelectedAccountId(targetId);
      setActualBalance('');
      setDate(todayISO());
      setNote('');
      setEditingReconId(null);
      setSaveError('');
    }
  }, [open, initialAccountId, accounts]);

  if (!open) return null;

  const targetAccount = accounts.find((a) => a.id === selectedAccountId);
  const targetCurrency = (targetAccount?.currency || 'UYU').toUpperCase();
  const currentLedgerBalance = targetAccount ? Number(targetAccount.balance || 0) : 0;
  const parsedActual = parseDecimalInput(actualBalance);
  const hasValidActual = actualBalance.trim() !== '' && !parsedActual.error && parsedActual.value !== null;
  const numActual = hasValidActual ? parsedActual.value! : 0;
  const difference = hasValidActual ? diffMoney(numActual, currentLedgerBalance) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!selectedAccountId) {
      showToast('Seleccioná una cuenta.', 'error');
      return;
    }
    if (!hasValidActual) {
      showToast('Ingresá el saldo real del banco.', 'error');
      return;
    }

    try {
      const saved = onUpdateState((draft) => {
        const input = {
          accountId: selectedAccountId,
          actualBalance: numActual,
          date,
          note: note.trim() || undefined,
        };
        if (editingReconId) {
          updateReconciliation(draft, editingReconId, input);
        } else {
          reconcileAccount(draft, input);
        }
      });
      if (saved === false) {
        setSaveError('No se confirmó la conciliación: no se pudo guardar en este dispositivo. Revisá los datos y reintentá.');
        return;
      }
      playSound('success');
      showToast(
        difference === 0
          ? 'Conciliación guardada en este dispositivo, sin diferencias.'
          : `Conciliación guardada en este dispositivo. Ajuste registrado: ${difference > 0 ? '+' : ''}${state.settings.privacyMode ? '••••' : formatMoney(difference, targetCurrency)}`
      );
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se confirmó la conciliación. Reintentá.');
    }
  };

  const handleDeleteRecon = (id: string) => {
    try {
      const saved = onUpdateState((draft) => {
        deleteReconciliation(draft, id);
      });
      if (saved === false) {
        showToast('No se confirmó la eliminación de la conciliación. Reintentá.', 'error');
        return;
      }
      showToast('Conciliación eliminada. El saldo actual se conserva.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Error al eliminar.', 'error');
    }
  };

  const accountReconciliations = [...(state.finance.reconciliations || [])]
    .filter((r) => r.accountId === selectedAccountId)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-reconcile-title"
        aria-describedby="finance-reconcile-description"
        tabIndex={-1}
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 max-w-md w-full space-y-4 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
              <AppIcon name="check" className="h-4 w-4" />
            </div>
            <div>
              <h3 id="finance-reconcile-title" className="font-extrabold text-sm text-[var(--text)]">
                {editingReconId ? 'Editar conciliación' : 'Conciliar saldo de cuenta'}
              </h3>
              <p id="finance-reconcile-description" className="text-xs text-[var(--text-soft)]">
                Compará con tu banco o efectivo. La diferencia se registra como un ajuste de saldo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
            title="Cerrar"
            aria-label="Cerrar conciliación"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account selector if multiple accounts exist */}
          <div>
            <label htmlFor="finance-reconcile-account" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
              Cuenta a conciliar
            </label>
            <select
              id="finance-reconcile-account"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setActualBalance('');
                setEditingReconId(null);
              }}
              disabled={Boolean(editingReconId)}
              className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium disabled:opacity-60"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  <PrivateFinancialText>{a.name}</PrivateFinancialText>
                </option>
              ))}
            </select>
          </div>

          {/* Current balance context card */}
          {targetAccount && (
            <div className="p-3.5 rounded-2xl bg-[var(--surface-muted)]/50 border border-[var(--border)] flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-faint)] block">
                  Saldo en Celestian
                </span>
                <PrivacyAmount as="span" className="font-black tabular-nums text-base text-[var(--text)]">
                  {formatMoney(currentLedgerBalance, targetCurrency)}
                </PrivacyAmount>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--text-soft)] block">
                  {targetAccount.lastReconciledAt
                    ? `Última: ${fmtDate(targetAccount.lastReconciledAt)}`
                    : 'Sin conciliación previa'}
                </span>
              </div>
            </div>
          )}

          {/* Real bank balance input */}
          <div>
            <label htmlFor="finance-reconcile-balance" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
              Saldo real en banco / extracto
            </label>
            <PrivacyInput
              id="finance-reconcile-balance"
              required
              type="text"
              inputMode="decimal"
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              placeholder="0,00"
              className="w-full p-2.5 text-sm font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
            />
          </div>

          {/* Live difference callout */}
          {hasValidActual && (
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              difference === 0
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300'
                : difference > 0
                ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-800 dark:text-indigo-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-800 dark:text-rose-300'
            }`}>
              <span className="font-medium">
                {difference === 0
                  ? 'Coincidencia exacta (sin ajuste)'
                  : 'Ajuste contable necesario:'}
              </span>
              <PrivacyAmount as="span" className="tabular-nums font-bold">
                {difference === 0 ? '✓ Al día' : `${difference > 0 ? '+' : ''}${formatMoney(difference, targetCurrency)}`}
              </PrivacyAmount>
            </div>
          )}

          {/* Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="finance-reconcile-date" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                Fecha del extracto
              </label>
              <input
                id="finance-reconcile-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="finance-reconcile-note" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                Motivo del ajuste (opcional)
              </label>
              <PrivacyInput maskText
                id="finance-reconcile-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Comisiones bancarias, redondeo..."
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* CTA */}
          {saveError && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">{saveError}</p>}
          <div className="flex items-center gap-2 pt-1">
            {editingReconId && (
              <button
                type="button"
                onClick={() => {
                  setEditingReconId(null);
                  setActualBalance('');
                  setNote('');
                }}
                className="py-3 px-4 text-xs font-semibold rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3 px-4 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs active:scale-98 transition-all min-h-[44px]"
            >
              {editingReconId ? 'Guardar cambios' : 'Confirmar conciliación'}
            </button>
          </div>
        </form>

        {/* History of reconciliations */}
        {accountReconciliations.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between text-left text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer py-1"
            >
              <span>Historial de conciliaciones ({accountReconciliations.length})</span>
              <span>{showHistory ? '▴' : '▾'}</span>
            </button>

            {showHistory && (
              <div className="mt-2 divide-y divide-[var(--border)] max-h-36 overflow-y-auto pr-1 animate-in fade-in">
                {accountReconciliations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <PrivacyAmount as="span" className="tabular-nums font-bold text-[var(--text)]">
                        {formatMoney(r.actualBalance, targetCurrency)}
                      </PrivacyAmount>
                      <span className="text-[10px] text-[var(--text-faint)] block">
                        {fmtDate(r.date)} <PrivateFinancialText>{r.note ? `· ${r.note}` : ''}</PrivateFinancialText>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReconId(r.id);
                          setActualBalance(String(r.actualBalance));
                          setDate(r.date);
                          setNote(r.note || '');
                        }}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg border border-[var(--border)] text-[var(--blue)] hover:bg-[var(--surface-muted)] cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecon(r.id)}
                        className="p-1 text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
                        title="Eliminar conciliación"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
