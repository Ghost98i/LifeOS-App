import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LifeOSState } from '../types';
import { readStoredCommercial, todayISO } from '../lib/storage';
import { checkCommercialAccess, type CloudSyncStatus } from '../lib/cloudSync';
import { applyCommercialSnapshot } from '../lib/commercialProduction';
import { CommercialInventorySandbox } from './CommercialInventorySandbox';
import type { CommercialPilotSnapshot } from '../lib/commercialPilot';
import { ContextualHelp } from './ContextualHelp';

export function CommercialWorkspace({ state, userId, syncStatus, onUpdate, onClose }: {
  state: LifeOSState; userId?: string; syncStatus: CloudSyncStatus;
  onUpdate: (updater: (draft: LifeOSState) => void) => boolean; onClose?: () => void;
}) {
  const initial = useMemo(() => readStoredCommercial(state), [state]);
  const expected = useRef(state.resale.commercial);
  useEffect(() => {
    expected.current = state.resale.commercial;
  }, [state.resale.commercial]);

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saved, setSaved] = useState(false);

  const checkAccess = useCallback(async () => {
    setBusy(true); setError('');
    try {
      if (!userId) throw new Error('Iniciá sesión para trabajar con tu negocio.');
      await checkCommercialAccess(userId);
      setEnabled(true);
    } catch (cause) {
      setEnabled(false);
      setError(cause instanceof Error ? cause.message : 'No se pudo comprobar la disponibilidad.');
    } finally {
      setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  if (initial.status === 'blocked' || (initial.status === 'valid' && !initial.reconstructed)
    || (initial.status === 'valid' && state.resale.commercial?.business?.currency !== 'UYU'))
    return <section role="alert" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-[var(--text)]">
      <h3 className="font-extrabold">Historial comercial requiere revisión</h3>
      <p>Este historial necesita revisión o utiliza una moneda que esta interfaz todavía no admite. Los datos originales se conservan.</p>
      {onClose && <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--text)]">Volver</button>}
    </section>;

  const snapshot: CommercialPilotSnapshot | undefined = initial.reconstructed ? {
    ...initial.reconstructed, currency: state.resale.commercial!.business!.currency,
  } : undefined;

  const commit = (next: CommercialPilotSnapshot): CommercialPilotSnapshot => {
    if (!enabled || syncStatus === 'conflict' || syncStatus === 'locked') throw new Error('La operación está bloqueada; conservá el formulario y revisá la sincronización.');
    let confirmed = next;
    let commercial = expected.current;
    const persisted = onUpdate(draft => {
      confirmed = applyCommercialSnapshot(draft, expected.current, next, { categoryId, date });
      commercial = draft.resale.commercial;
    });
    if (!persisted) throw new Error('Error de guardado. La operación no se confirmó; el formulario sigue disponible.');
    expected.current = commercial; setSaved(true);
    return confirmed;
  };

  const status = syncStatus === 'conflict' ? 'Conflicto' : syncStatus === 'locked' ? 'Sincronización bloqueada: desbloqueá tus datos para operar.' : syncStatus === 'error' ? 'Error de sincronización; guardado local conservado'
    : saved && syncStatus === 'synced' ? 'Sincronizado' : saved ? 'Guardado local · sincronización pendiente'
      : enabled ? ''
        : !userId || error.startsWith('Iniciá sesión') ? 'Sesión requerida para operar'
          : error.includes('cifrado E2EE') ? 'Cifrado E2EE requerido para operar'
            : 'Función temporalmente no disponible';

  return <div className="space-y-3">
    {(status || !enabled) && <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-sm font-medium text-[var(--text-soft)]">{status}</p>
      {!enabled && <button disabled={busy} onClick={() => void checkAccess()} className="rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Comprobando disponibilidad…' : 'Habilitar operaciones en esta sesión'}</button>}
    </div>}
    {error && <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-400">{error}</p>}
    <fieldset aria-label="Operaciones comerciales" disabled={!enabled || syncStatus === 'conflict' || syncStatus === 'locked'} className="space-y-3">
      <CommercialInventorySandbox onClose={onClose || (() => undefined)} pilotEnabled={false} production={{
        snapshot, commit, accounts: state.finance.accounts,
        financeFields: (inheritCategory = false) => <div className="col-span-full grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold text-[var(--text-soft)]">
              Categoría en Finanzas
              <ContextualHelp label="Categoría en Finanzas">{inheritCategory ? 'Si dejás la categoría vacía, conserva la del pago o cobro original.' : 'Elegí la categoría para este pago o cobro. No se asigna según el artículo. El movimiento se guarda en Finanzas junto con la operación.'}</ContextualHelp>
            </div>
            <label className="block">
              <span className="sr-only">Categoría financiera</span>
              <select required={!inheritCategory} aria-label="Categoría financiera" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]">
                <option value="">{inheritCategory ? 'Conservar categoría original' : 'Elegí una categoría'}</option>
                {state.finance.categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold text-[var(--text-soft)]">
            <span className="flex min-h-10 items-center">Fecha en Finanzas</span>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]" />
          </label>
        </div>,
      }} />
    </fieldset>
    {onClose && <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--blue)] hover:underline">Volver al inventario histórico anterior</button>}
  </div>;
}
