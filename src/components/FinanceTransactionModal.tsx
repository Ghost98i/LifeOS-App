import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Transaction, Account } from '../types';
import { todayISO, parseDecimalInput, uid } from '../lib/storage';
import { AppIcon } from './AppIcon';

export interface FinanceTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    id: string;
    type: 'gasto' | 'ingreso';
    amount: number;
    category: string;
    accountId: string;
    fixed: 'variable' | 'fijo';
    date: string;
    operationTime: string | null;
    note: string;
  }) => void;
  accounts: Account[];
  categories: { id: string; name: string; active?: boolean }[];
  editingTransaction?: Transaction | null;
  onOpenCategoryModal?: () => void;
  initialType?: 'gasto' | 'ingreso';
}

export const FinanceTransactionModal: React.FC<FinanceTransactionModalProps> = ({
  open,
  onClose,
  onSubmit,
  accounts,
  categories,
  editingTransaction,
  onOpenCategoryModal,
  initialType = 'gasto',
}) => {
  const [type, setType] = useState<'gasto' | 'ingreso'>(initialType);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [fixed, setFixed] = useState<'variable' | 'fijo'>('variable');
  const [date, setDate] = useState(todayISO());
  const [operationTime, setOperationTime] = useState('');
  const [note, setNote] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const operationId = useRef<string | null>(null);
  useEffect(() => { if (!open) operationId.current = null; }, [open]);
  useDialogFocus(open, dialogRef, onClose, '#finance-movement-trigger');

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountCurrency = (selectedAccount?.currency || 'UYU').toUpperCase();

  useEffect(() => {
    if (open) {
      if (editingTransaction) {
        setType(editingTransaction.type);
        setAmount(String(editingTransaction.amount));
        setCategory(editingTransaction.category);
        setAccountId(editingTransaction.accountId || accounts[0]?.id || '');
        setFixed(editingTransaction.fixed);
        setDate(editingTransaction.date);
        setOperationTime(editingTransaction.operationTime || '');
        setNote(editingTransaction.note || '');
        setShowAdvanced(Boolean(editingTransaction.operationTime || editingTransaction.fixed === 'fijo' || editingTransaction.date !== todayISO()));
      } else {
        setType(initialType);
        setAmount('');
        const defaultCat = categories.find((c) => c.active !== false)?.id || categories[0]?.id || 'Comida';
        setCategory(defaultCat);
        setAccountId(accounts[0]?.id || '');
        setFixed('variable');
        setDate(todayISO());
        setOperationTime('');
        setNote('');
        setShowAdvanced(false);
      }
    }
  }, [open, editingTransaction, accounts, categories, initialType]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDecimalInput(amount);
    if (parsed.error || parsed.value === null || parsed.value <= 0) {
      alert(parsed.error || 'Ingresá un importe válido mayor a cero.');
      return;
    }
    if (!accountId) {
      alert('Elegí una cuenta.');
      return;
    }

    onSubmit({
      id: editingTransaction?.id || (operationId.current ??= globalThis.crypto?.randomUUID?.() || uid()),
      type,
      amount: parsed.value,
      category: category.trim(),
      accountId,
      fixed,
      date,
      operationTime: operationTime || null,
      note: note.trim(),
    });
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-tx-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-2xl transition-all space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${type === 'gasto' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <AppIcon name={type === 'gasto' ? 'arrowDownRight' : 'arrowUpRight'} className="h-5 w-5" />
            </div>
            <div>
              <h2 id="finance-tx-title" className="text-base font-extrabold text-[var(--text)]">
                {editingTransaction ? 'Editar Movimiento' : type === 'gasto' ? 'Registrar Gasto' : 'Registrar Ingreso'}
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                {editingTransaction ? 'Modificá los datos del movimiento existente' : 'Impacta directamente tu saldo real'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
            aria-label="Cerrar"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Segmented Type Picker */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setType('gasto')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                type === 'gasto'
                  ? 'bg-[var(--card)] text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>− Gasto</span>
            </button>
            <button
              type="button"
              onClick={() => setType('ingreso')}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                type === 'ingreso'
                  ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>+ Ingreso</span>
            </button>
          </div>

          {/* Amount Hero Input */}
          <div>
            <label htmlFor="finance-tx-amount" className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
              Monto ({accountCurrency})
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-sm sm:text-base text-[var(--text-faint)] select-none">
                {accountCurrency === 'USD' ? 'US$' : '$U'}
              </span>
              <input
                id="finance-tx-amount"
                type="text"
                inputMode="decimal"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-12 pr-4 py-3 text-2xl font-black rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)] tabular-nums"
              />
            </div>
          </div>

          {/* Account & Category Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="finance-tx-account" className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                Cuenta / Billetera
              </label>
              <select
                id="finance-tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-semibold focus:outline-hidden focus:border-[var(--blue)] cursor-pointer"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({(a.currency || 'UYU').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="finance-tx-category" className="text-[10px] font-black uppercase text-[var(--text-faint)] block">
                  Categoría
                </label>
                {onOpenCategoryModal && (
                  <button
                    type="button"
                    onClick={onOpenCategoryModal}
                    className="text-[10px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                  >
                    Editar
                  </button>
                )}
              </div>
              <select
                id="finance-tx-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-semibold focus:outline-hidden focus:border-[var(--blue)] cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.active === false ? ' (Archivada)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="finance-tx-note" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
              {type === 'gasto' ? '¿En qué gastaste? (opcional)' : '¿De dónde proviene? (opcional)'}
            </label>
            <input id="finance-tx-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={type === 'gasto' ? 'Ej: Jamón, queso, almuerzo…' : 'Ej: Sueldo, venta, devolución…'}
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]" />
          </div>

          {/* Progressive Disclosure Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-semibold text-[var(--blue)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{showAdvanced ? 'Ocultar detalles adicionales ▴' : 'Más detalles (fecha, hora, fijos) ▾'}</span>
            </button>
          </div>

          {/* Advanced Fields */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)] animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="finance-tx-date" className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Fecha
                  </label>
                  <input
                    id="finance-tx-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium focus:outline-hidden focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label htmlFor="finance-tx-fixed" className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Naturaleza del Gasto
                  </label>
                  <select
                    id="finance-tx-fixed"
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium focus:outline-hidden focus:border-[var(--blue)] cursor-pointer"
                  >
                    <option value="variable">Gasto Variable (cotidiano / discrecional)</option>
                    <option value="fijo">Gasto Fijo (estructura / recurrente)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="finance-tx-time" className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Hora de la operación (opcional)
                </label>
                <input
                  id="finance-tx-time"
                  type="time"
                  value={operationTime}
                  onChange={(e) => setOperationTime(e.target.value)}
                  className="w-full sm:w-44 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium focus:outline-hidden focus:border-[var(--blue)]"
                />
              </div>

            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!amount || Number(amount) <= 0}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl text-white shadow-xs cursor-pointer transition-all disabled:opacity-40 flex items-center gap-1.5 ${
                type === 'gasto'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <AppIcon name="check" className="h-4 w-4" />
              <span>{editingTransaction ? 'Guardar Cambios' : type === 'gasto' ? 'Guardar Gasto' : 'Guardar Ingreso'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
