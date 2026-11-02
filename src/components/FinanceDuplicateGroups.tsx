import { useRef, useState } from 'react';
import type { LifeOSState, Transaction } from '../types';
import type { FinanceDuplicateGroup } from '../lib/financeReview';
import { getTransactionLockReason } from '../lib/financeFlows';
import { fmtDate, formatMoney } from '../lib/storage';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { PrivateFinancialText, PrivacyAmount } from './PrivacyAmount';

interface Props {
  state: LifeOSState;
  groups: FinanceDuplicateGroup[];
  onKeep: (transactions: Transaction[]) => boolean;
  onDelete: (transaction: Transaction) => boolean;
}

export function FinanceDuplicateGroups({ state, groups, onKeep, onDelete }: Props) {
  const [choosing, setChoosing] = useState<FinanceDuplicateGroup | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => { setChoosing(null); setSelectedId(''); setConfirming(false); };
  useDialogFocus(Boolean(choosing), dialogRef, close);
  const selected = choosing?.transactions.find(tx => tx.id === selectedId);
  const details = (tx: Transaction, identify = false) => {
    const account = state.finance.accounts.find(a => a.id === tx.accountId);
    const category = state.finance.categories?.find(c => c.id === tx.category)?.name || tx.category || 'Sin categoría';
    const created = tx.createdAt && Number.isFinite(Date.parse(tx.createdAt)) ? new Date(tx.createdAt).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'medium' }) : null;
    return <div className="min-w-0 space-y-1 text-xs">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-semibold text-[var(--text)]">
        <span><PrivateFinancialText>{tx.note?.trim() || 'Sin descripción'}</PrivateFinancialText></span>
        <PrivacyAmount as="span" className="tabular-nums whitespace-nowrap">{tx.type === 'ingreso' ? '+' : '−'}{formatMoney(tx.amount, account?.currency || tx.currency || 'UYU')}</PrivacyAmount>
      </div>
      <p className="text-[var(--text-soft)]"><PrivateFinancialText>{category}</PrivateFinancialText> · {fmtDate(tx.date)} · <PrivateFinancialText>{account?.name || 'Sin cuenta'}</PrivateFinancialText></p>
      <p className="text-[var(--text-soft)]">{created ? `Registrado: ${created}` : 'Hora de registro no disponible'}{tx.operationTime ? ` · Hora de operación: ${tx.operationTime}` : ''}</p>
      {identify && <p className="text-[var(--text-soft)] break-all">ID: <span className="font-mono">{tx.id}</span></p>}
      {(tx.commitmentId || tx.expectedIncomeId || tx.agreementId) && <p className="text-[var(--text-soft)]">Vinculado a una obligación o acuerdo. Su eliminación actualizará también esa vinculación.</p>}
    </div>;
  };
  return <>
    {groups.map(group => <section key={group.id} aria-label="Posible duplicado" className="rounded-xl border border-[var(--border)] p-3.5 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-[var(--text)]">Posible duplicado · {group.transactions.length} movimientos</h4>
        <p className="text-xs text-[var(--text-soft)] mt-1">Tienen importes similares, la misma cuenta y fechas cercanas. Pueden ser operaciones legítimas.</p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {group.transactions.map(tx => <li key={tx.id} className="py-2.5">{details(tx)}</li>)}
      </ul>
      <p className="text-xs text-[var(--text-soft)]">Ya están contabilizados. Conservarlos cierra la revisión de estos movimientos y mantiene el saldo.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-2.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer" onClick={() => onKeep(group.transactions)}>
          {group.transactions.length === 2 ? 'Conservar ambos' : `Conservar los ${group.transactions.length} movimientos`}
        </button>
        <button type="button" className="px-3 py-2.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer" onClick={() => { setChoosing(group); setSelectedId(''); setConfirming(false); }}>Eliminar uno</button>
      </div>
    </section>)}
    {choosing && <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title" tabIndex={-1} className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--card)] border border-[var(--border)] p-4 sm:p-6 space-y-4 shadow-xl">
        <h3 id="duplicate-dialog-title" className="text-base font-bold text-[var(--text)]">{confirming ? 'Confirmar eliminación' : 'Elegí qué movimiento eliminar'}</h3>
        {confirming && selected ? <>
          <p className="text-sm text-[var(--text-soft)]">Se retirará únicamente este movimiento y se revertirá su efecto en el saldo y los resúmenes. Los demás se conservarán.</p>
          <div className="rounded-xl border border-[var(--border)] p-3">{details(selected, true)}</div>
          <p className="text-xs text-[var(--text-soft)]">La similitud no demuestra que sea un duplicado. Confirmá solo si identificaste una operación que querés eliminar.</p>
        </> : <>
          <p className="text-sm text-[var(--text-soft)]">Compará la fecha de registro y el identificador. Si los datos no te permiten distinguir las compras, cancelá y conservá los movimientos.</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Movimiento que se eliminará</legend>
            {choosing.transactions.map(tx => {
              const lock = getTransactionLockReason(state, tx);
              return <label key={tx.id} className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] cursor-pointer has-checked:border-[var(--blue)] has-checked:bg-[var(--surface-muted)]">
                <input type="radio" name="duplicate-delete-id" value={tx.id} checked={selectedId === tx.id} disabled={Boolean(lock)} onChange={() => setSelectedId(tx.id)} className="mt-1 shrink-0" />
                <div className="min-w-0 flex-1">{details(tx, true)}{lock && <p className="text-xs text-[var(--text-soft)] mt-1">{lock}</p>}</div>
              </label>;
            })}
          </fieldset>
        </>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button type="button" onClick={close} className="secondary-button px-4 py-2.5 text-xs font-semibold">Cancelar</button>
          {confirming ? <>
            <button type="button" onClick={() => setConfirming(false)} className="secondary-button px-4 py-2.5 text-xs font-semibold">Volver</button>
            <button type="button" onClick={() => { if (selected && onDelete(selected)) close(); }} className="px-4 py-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer">Eliminar movimiento</button>
          </> : <button type="button" disabled={!selected} onClick={() => setConfirming(true)} className="primary-button px-4 py-2.5 text-xs font-semibold disabled:opacity-40">Continuar</button>}
        </div>
      </div>
    </div>}
  </>;
}
