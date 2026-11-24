import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Store } from 'lucide-react';
import type { LifeOSState } from '../types';
import { readStoredCommercial, todayISO } from '../lib/storage';
import { checkCommercialAccess, type CloudSyncStatus } from '../lib/cloudSync';
import { applyCommercialSnapshot } from '../lib/commercialProduction';
import { CommercialInventorySandbox } from './CommercialInventorySandbox';
import type { CommercialPilotSnapshot } from '../lib/commercialPilot';
import { ContextualHelp } from './ContextualHelp';
import { SurfaceCard } from './ui/SurfacePrimitives';

const workspaceFieldClass =
  'celestian-clean-field min-h-11 w-full min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-[var(--text)] dark:border-white/[0.08] dark:bg-white/[0.03]';

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

  const isSignedOutEmpty = !enabled && !snapshot;

  return <div className="space-y-4">
    {isSignedOutEmpty ? (
      <SurfaceCard as="div" className="p-6 sm:p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-[#4F46E5] dark:bg-indigo-500/15 dark:text-indigo-300">
          <Store size={20} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <p role="status" className="mt-3.5 text-base font-semibold text-[var(--text)]">{status || 'Sesión requerida para operar'}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-soft)]">
          Mi negocio requiere iniciar sesión para registrar compras, ventas y sincronizar operaciones con Finanzas.
        </p>
        {error && !error.startsWith('Iniciá sesión') && (
          <p role="alert" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
        )}
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkAccess()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? 'Comprobando disponibilidad…' : 'Habilitar operaciones en esta sesión'}
          </button>
        </div>
      </SurfaceCard>
    ) : (
      <>
        {(status || !enabled || error) && (
          <SurfaceCard as="div" className="p-4 sm:p-5 space-y-2.5">
            {(status || !enabled) && (
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <p role="status" className="text-sm font-semibold text-slate-900 dark:text-slate-100">{status}</p>
                {!enabled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void checkAccess()}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {busy ? 'Comprobando disponibilidad…' : 'Habilitar operaciones en esta sesión'}
                  </button>
                )}
              </div>
            )}
            {error && <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-400">{error}</p>}
          </SurfaceCard>
        )}
        <fieldset aria-label="Operaciones comerciales" disabled={!enabled || syncStatus === 'conflict' || syncStatus === 'locked'} className="space-y-3">
          <CommercialInventorySandbox onClose={onClose || (() => undefined)} pilotEnabled={false} production={{
            snapshot, commit, accounts: state.finance.accounts,
            financeFields: (inheritCategory = false) => <div className="col-span-full grid gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.06] sm:grid-cols-2">
              <div>
                <div className="flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--text-soft)]">
                  Categoría en Finanzas
                  <ContextualHelp label="Categoría en Finanzas">{inheritCategory ? 'Si dejás la categoría vacía, conserva la del pago o cobro original.' : 'Elegí la categoría para este pago o cobro. No se asigna según el artículo. El movimiento se guarda en Finanzas junto con la operación.'}</ContextualHelp>
                </div>
                <label className="relative block w-full">
                  <span className="sr-only">Categoría financiera</span>
                  <select required={!inheritCategory} aria-label="Categoría financiera" value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`${workspaceFieldClass} appearance-none pr-9 cursor-pointer`}>
                    <option value="">{inheritCategory ? 'Conservar categoría original' : 'Elegí una categoría'}</option>
                    {state.finance.categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-[var(--text-soft)]">
                <span className="flex min-h-8 items-center">Fecha en Finanzas</span>
                <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={workspaceFieldClass} />
              </label>
            </div>,
          }} />
        </fieldset>
      </>
    )}
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] transition-colors hover:text-[#4338CA] dark:text-indigo-300 dark:hover:text-indigo-200 cursor-pointer"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>Ver inventario histórico anterior</span>
      </button>
    )}
  </div>;
}
