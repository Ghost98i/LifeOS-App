import { PrivacyInput, PrivateFinancialText } from './PrivacyAmount';
import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Transaction, Account } from '../types';
import { todayISO, fmtDate, parseDecimalInput, uid } from '../lib/storage';
import { isExpenseBiasedCategory, resolveDefaultCategoryForType } from '../lib/financeIcons';
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

const CLEAN_FOCUS_RING =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

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
  const normalizedInitialType: 'gasto' | 'ingreso' = initialType === 'ingreso' ? 'ingreso' : 'gasto';
  const [type, setType] = useState<'gasto' | 'ingreso'>(editingTransaction?.type ?? normalizedInitialType);
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : '');
  const [category, setCategory] = useState(() =>
    editingTransaction
      ? editingTransaction.category
      : resolveDefaultCategoryForType(normalizedInitialType, categories)
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [accountId, setAccountId] = useState(editingTransaction?.accountId || accounts[0]?.id || '');
  const [fixed, setFixed] = useState<'variable' | 'fijo'>(editingTransaction?.fixed || 'variable');
  const [date, setDate] = useState(editingTransaction?.date || todayISO());
  const [operationTime, setOperationTime] = useState(editingTransaction?.operationTime || '');
  const [note, setNote] = useState(editingTransaction?.note || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const operationId = useRef<string | null>(null);
  useEffect(() => {
    if (!open) operationId.current = null;
  }, [open]);
  useDialogFocus(open, dialogRef, onClose, '#finance-movement-trigger');

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountCurrency = (selectedAccount?.currency || 'UYU').toUpperCase();
  const currencyPrefix = accountCurrency === 'USD' ? 'US$' : accountCurrency === 'UYU' ? '$U' : accountCurrency;

  useEffect(() => {
    if (open) {
      if (editingTransaction) {
        setType(editingTransaction.type);
        setAmount(String(editingTransaction.amount));
        setCategory(editingTransaction.category);
        setCategoryTouched(true);
        setAccountId(editingTransaction.accountId || accounts[0]?.id || '');
        setFixed(editingTransaction.fixed);
        setDate(editingTransaction.date);
        setOperationTime(editingTransaction.operationTime || '');
        setNote(editingTransaction.note || '');
        setShowAdvanced(
          Boolean(
            editingTransaction.operationTime ||
              editingTransaction.fixed === 'fijo' ||
              editingTransaction.date !== todayISO()
          )
        );
      } else {
        setType(normalizedInitialType);
        setAmount('');
        setCategory(resolveDefaultCategoryForType(normalizedInitialType, categories));
        setCategoryTouched(false);
        setAccountId(accounts[0]?.id || '');
        setFixed('variable');
        setDate(todayISO());
        setOperationTime('');
        setNote('');
        setShowAdvanced(false);
      }
    }
  }, [open, editingTransaction, accounts, categories, normalizedInitialType]);

  if (!open) return null;

  const handleSelectType = (nextType: 'gasto' | 'ingreso') => {
    setType(nextType);
    if (!editingTransaction) {
      const currentCatObj = categories.find((c) => c.id === category);
      const currentLabel = currentCatObj?.name || category;
      if (!categoryTouched || (nextType === 'ingreso' && isExpenseBiasedCategory(currentLabel))) {
        setCategory(resolveDefaultCategoryForType(nextType, categories));
        setCategoryTouched(false);
      }
    }
  };

  const parsedPreview = parseDecimalInput(amount);
  const isAmountValid = !parsedPreview.error && parsedPreview.value !== null && parsedPreview.value > 0;

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

  const detailsTriggerLabel = showAdvanced
    ? 'Ocultar detalles adicionales'
    : `${date === todayISO() ? 'Hoy' : fmtDate(date)} · Más detalles (fecha, hora, tipo)`;

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
        {/* Header — Unified icon direction with Hero quick actions */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                type === 'gasto'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <AppIcon name={type === 'gasto' ? 'expense' : 'income'} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="finance-tx-title" className="text-base font-extrabold text-[var(--text)]">
                {editingTransaction ? 'Editar Movimiento' : type === 'gasto' ? 'Registrar Gasto' : 'Registrar Ingreso'}
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                {editingTransaction
                  ? 'Al guardar, se actualiza este movimiento y su efecto en el saldo.'
                  : 'Se registra en la cuenta que elijas y actualiza su saldo.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer ${CLEAN_FOCUS_RING}`}
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
              onClick={() => handleSelectType('gasto')}
              aria-pressed={type === 'gasto'}
              className={`min-h-11 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${CLEAN_FOCUS_RING} ${
                type === 'gasto'
                  ? 'bg-[var(--card)] text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <AppIcon name="expense" className="h-3.5 w-3.5 shrink-0" />
              <span>Gasto</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectType('ingreso')}
              aria-pressed={type === 'ingreso'}
              className={`min-h-11 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${CLEAN_FOCUS_RING} ${
                type === 'ingreso'
                  ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <AppIcon name="income" className="h-3.5 w-3.5 shrink-0" />
              <span>Ingreso</span>
            </button>
          </div>

          {/* Amount Hero Input — Clean single border without double outline or spinners */}
          <div>
            <label htmlFor="finance-tx-amount" className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
              Monto ({accountCurrency})
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-sm sm:text-base text-[var(--text-faint)] select-none pointer-events-none">
                {currencyPrefix}
              </span>
              <PrivacyInput
                id="finance-tx-amount"
                type="text"
                inputMode="decimal"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="finance-amount-input w-full pl-12 pr-4 py-3 text-2xl font-extrabold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] tabular-nums"
              />
            </div>
          </div>

          {/* Account & Category Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="finance-tx-account" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                Cuenta / Billetera
              </label>
              <select
                id="finance-tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-semibold outline-none focus:border-indigo-500 cursor-pointer"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    <PrivateFinancialText>{a.name}</PrivateFinancialText> ({(a.currency || 'UYU').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="finance-tx-category" className="text-xs font-semibold text-[var(--text-soft)] block">
                  Categoría
                </label>
                {onOpenCategoryModal && (
                  <button
                    type="button"
                    onClick={onOpenCategoryModal}
                    className={`inline-flex min-h-8 sm:min-h-0 items-center px-1.5 sm:px-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ${CLEAN_FOCUS_RING}`}
                  >
                    Editar
                  </button>
                )}
              </div>
              <select
                id="finance-tx-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCategoryTouched(true);
                }}
                required
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-semibold outline-none focus:border-indigo-500 cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    <PrivateFinancialText>{c.name}</PrivateFinancialText>
                    {c.active === false ? ' (Archivada)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="finance-tx-note" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
              {type === 'gasto' ? '¿En qué gastaste? (opcional)' : '¿De dónde proviene? (opcional)'}
            </label>
            <PrivacyInput
              maskText
              id="finance-tx-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={type === 'gasto' ? 'Ej: Jamón, queso, almuerzo…' : 'Ej: Sueldo, venta, devolución…'}
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
            />
          </div>

          {/* Progressive Disclosure Toggle — Integrated date summary + Lucide ChevronDown */}
          <div className="pt-0.5">
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer ${CLEAN_FOCUS_RING}`}
            >
              <span className="truncate">{detailsTriggerLabel}</span>
              <AppIcon
                name="chevronDown"
                className={`h-4 w-4 shrink-0 transition-transform duration-150 ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Advanced Fields */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)] animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="finance-tx-date" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                    Fecha
                  </label>
                  <input
                    id="finance-tx-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="finance-tx-fixed" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                    {type === 'gasto' ? 'Tipo de gasto' : 'Tipo de ingreso'}
                  </label>
                  <select
                    id="finance-tx-fixed"
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value as 'variable' | 'fijo')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="variable">{type === 'gasto' ? 'Variable (cotidiano / discrecional)' : 'Variable'}</option>
                    <option value="fijo">{type === 'gasto' ? 'Fijo (estructura / recurrente)' : 'Fijo'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="finance-tx-time" className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Hora de la operación (opcional)
                </label>
                <input
                  id="finance-tx-time"
                  type="time"
                  value={operationTime}
                  onChange={(e) => setOperationTime(e.target.value)}
                  className="w-full sm:w-44 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] font-medium outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors ${CLEAN_FOCUS_RING}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isAmountValid}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl text-white shadow-xs cursor-pointer transition-all disabled:opacity-40 flex items-center gap-1.5 ${CLEAN_FOCUS_RING} ${
                type === 'gasto'
                  ? 'bg-[#4F46E5] hover:bg-[#4338CA]'
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
