import type { Finance } from '../types';
import React, { useEffect, useId, useRef, useState } from 'react';
import { confirmSandboxMoneyEvent, planSandboxFinanceEffect, sandboxMoneySummary,
  sandboxPurchaseBalance, sandboxSaleBalance, type SandboxMoneyEvent, type SandboxMoneyPurpose, type SandboxMoneyRequest,
  type SandboxMoneySession } from '../lib/commercialMoneySandbox';
import { confirmSandboxPurchaseAdjustment, type SandboxPurchaseAdjustmentRequest } from '../lib/commercialCorrectionSandbox';
import { sandboxStockBook } from '../lib/commercialInventorySandbox';
import { stockBalance } from '../lib/commercialInventory';
import { fmtMoney } from '../lib/storage';
import { ContextualHelp } from './ContextualHelp';
import { AppIcon } from './AppIcon';
import { SurfaceCard, SectionHeader, ListDivider } from './ui/SurfacePrimitives';

const money = (cents: number) => fmtMoney(cents / 100);
const field = 'min-h-11 min-w-0 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]';
const label: Record<SandboxMoneyPurpose, string> = {
  purchase_payment: 'Registrar pago',
  sale_receipt: 'Registrar cobro',
  customer_refund: 'Registrar reembolso a cliente',
  supplier_refund: 'Registrar reembolso de proveedor',
  payment_reversal: 'Reversión de pago',
  receipt_reversal: 'Reversión de cobro',
};

export function salePaymentStatus(balance: NonNullable<ReturnType<typeof sandboxSaleBalance>>): string {
  if (balance.refundableCents > 0) return 'Reembolso pendiente';
  if (balance.pendingCents > 0) return balance.receivedCents > 0 ? 'Cobro parcial' : 'Pendiente de cobro';
  if (balance.netReceivedCents > 0) return 'Cobrada';
  return balance.activeRevenueCents === 0 ? 'Sin importe vigente' : 'Sin cobro pendiente';
}

export const CommercialMoneySandbox: React.FC<{
  accounts?: Finance['accounts'];
  financeFields?: (inheritCategory?: boolean) => React.ReactNode;
  session: SandboxMoneySession;
  onConfirm: (request: SandboxMoneyRequest) => ReturnType<typeof confirmSandboxMoneyEvent>;
  onConfirmPurchaseAdjustment?: (request: SandboxPurchaseAdjustmentRequest) => ReturnType<typeof confirmSandboxPurchaseAdjustment>;
}> = ({ session, onConfirm, onConfirmPurchaseAdjustment, accounts, financeFields }) => {
  const existingIdInput = useId();
  const sequence = useRef(Math.max(0, ...(session.moneyEvents ?? []).map((event) =>
    Number(event.id.match(/^sandbox-money-(\d+)$/)?.[1] ?? 0))));
  const [draft, setDraft] = useState<{ id: string; purpose: SandboxMoneyPurpose; sourceId: string; reversalOf?: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [existingId, setExistingId] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [error, setError] = useState('');
  const [adjustingPurchase, setAdjustingPurchase] = useState<{
    purchaseId: string;
    kind: 'annulment' | 'return';
    maxUnits: number;
    units: string;
    itemName: string;
  } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!draft) return;
    formRef.current?.scrollIntoView({ block: 'nearest' });
    amountRef.current?.focus({ preventScroll: true });
  }, [draft]);

  const summary = sandboxMoneySummary(session);
  const hasPurchases = (session.purchases?.length ?? 0) > 0;
  const hasSales = session.sales.length > 0;
  const hasMoneyEvents = (session.moneyEvents?.length ?? 0) > 0;
  const hasAdjustments = summary.physicalLossCents !== 0 || summary.refundedCents !== 0 || summary.refundableCents !== 0
    || summary.supplierRefundedCents !== 0 || summary.supplierRefundableCents !== 0;
  const hasActivity = hasPurchases || hasSales || hasMoneyEvents || hasAdjustments;

  const open = (purpose: SandboxMoneyPurpose, sourceId: string, suggestedCents: number) => {
    sequence.current = Math.max(sequence.current, ...(session.moneyEvents ?? []).map((event) =>
      Number(event.id.match(/^sandbox-money-(\d+)$/)?.[1] ?? 0))) + 1;
    setDraft({ id: accounts ? crypto.randomUUID() : `sandbox-money-${sequence.current}`, purpose, sourceId });
    setAmount((suggestedCents / 100).toFixed(2));
    setAccountRef(''); setExistingId(''); setMode('new'); setError('');
  };

  const openReversal = (targetEvent: SandboxMoneyEvent) => {
    const isPayment = targetEvent.purpose === 'purchase_payment';
    sequence.current = Math.max(sequence.current, ...(session.moneyEvents ?? []).map((event) =>
      Number(event.id.match(/^sandbox-money-(\d+)$/)?.[1] ?? 0))) + 1;
    setDraft({
      id: accounts ? crypto.randomUUID() : `sandbox-money-${sequence.current}`,
      purpose: isPayment ? 'payment_reversal' : 'receipt_reversal',
      sourceId: targetEvent.sourceId,
      reversalOf: targetEvent.id,
    });
    setAmount((targetEvent.amountCents / 100).toFixed(2));
    setAccountRef(targetEvent.accountRef);
    setExistingId('');
    setMode('new');
    setError('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const parsed = Number(amount.replace(',', '.'));
    const cents = Math.round(parsed * 100);
    if (!Number.isFinite(parsed) || !Number.isSafeInteger(cents) || Math.abs(parsed * 100 - cents) > 1e-7) {
      setError('Ingresá un importe válido con hasta dos decimales.'); return;
    }
    const result = onConfirm({
      ...draft,
      amountCents: cents,
      accountRef: accountRef.trim(),
      finance: mode === 'existing' ? { mode, transactionId: existingId.trim() } : { mode },
    });
    if (result.status === 'blocked') setError(result.issues.join(' '));
    else { setDraft(null); setError(''); }
  };

  const submitPurchaseAdjustment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjustingPurchase || !onConfirmPurchaseAdjustment) return;
    const units = Number(adjustingPurchase.units.replace(',', '.'));
    if (!Number.isSafeInteger(units) || units <= 0 || units > adjustingPurchase.maxUnits) {
      setError(`Ingresá una cantidad entera entre 1 y ${adjustingPurchase.maxUnits}.`);
      return;
    }
    const result = onConfirmPurchaseAdjustment({
      id: accounts ? crypto.randomUUID() : `sandbox-purchase-adj-${Date.now()}`,
      purchaseId: adjustingPurchase.purchaseId,
      units,
      kind: adjustingPurchase.kind,
    });
    if (result.status === 'blocked') {
      setError(result.issues.join(' '));
    } else {
      setAdjustingPurchase(null);
      setError('');
    }
  };

  const resultItems: Array<[string, number, string?]> = [
    ['Ventas vigentes', summary.activeRevenueCents, 'Importe de las ventas tras correcciones y devoluciones. No indica cuánto se cobró.'],
    ['Costo histórico vendido', summary.activeSoldCostCents, 'Costo de las unidades que siguen vendidas, fijado al confirmar cada venta.'],
    ['Ganancia bruta', summary.grossProfitCents, 'Ventas vigentes menos costo de lo vendido. No descuenta pérdidas ni otros gastos.'],
  ];
  const moneyItems: Array<[string, number, string?]> = [
    ['Cobrado', summary.receivedCents],
    ['Pendiente de cobro', summary.receivableCents, 'Parte de las ventas vigentes que todavía no se recibió.'],
    ['Pagado', summary.paidCents],
    ['Compras pendientes', summary.payableCents, 'Parte de las compras que todavía no se pagó.'],
  ];
  const visibleMoneyItems = moneyItems.filter(([name]) => name === 'Cobrado' || name === 'Pendiente de cobro' ? hasSales : hasPurchases);
  const adjustmentItems: Array<[string, number, string?]> = [
    ['Pérdidas físicas', summary.physicalLossCents, 'Suma el costo histórico de pérdidas de stock y de ventas corregidas o devueltas sin reponer unidades. No es un pago adicional.'],
    ['Reembolsado a clientes', summary.refundedCents],
    ['Por reembolsar a clientes', summary.refundableCents],
    ['Reembolsado por proveedores', summary.supplierRefundedCents],
    ['Por recuperar de proveedores', summary.supplierRefundableCents],
  ];
  const purchases = session.purchases ?? [];
  const pendingPurchases = purchases.filter((purchase) => {
    const b = sandboxPurchaseBalance(session, purchase.id);
    return Boolean(b && (b.pendingCents > 0 || b.refundableCents > 0));
  });
  const settledPurchases = purchases.filter((purchase) => {
    const b = sandboxPurchaseBalance(session, purchase.id);
    return Boolean(b && b.pendingCents === 0 && b.refundableCents === 0);
  });
  const pendingSales = session.sales.filter((sale) => {
    const balance = sandboxSaleBalance(session, sale.id);
    return Boolean(balance && (balance.pendingCents > 0 || balance.refundableCents > 0));
  });
  const settledSales = session.sales.filter((sale) => {
    const balance = sandboxSaleBalance(session, sale.id);
    return Boolean(balance && balance.pendingCents === 0 && balance.refundableCents === 0);
  });

  const draftName = draft?.purpose === 'purchase_payment' || draft?.purpose === 'supplier_refund' || draft?.purpose === 'payment_reversal'
    ? session.inventory.items.find((item) => item.id === purchases.find((purchase) => purchase.id === draft.sourceId)?.itemId)?.name
    : session.sales.find((sale) => sale.id === draft?.sourceId)?.recipeName;

  const purchaseRow = (purchase: (typeof purchases)[number]) => {
    const balance = sandboxPurchaseBalance(session, purchase.id)!;
    const name = session.inventory.items.find((item) => item.id === purchase.itemId)?.name ?? 'Artículo';
    const purchaseMovement = session.inventory.movements.find((m) => m.operationId === purchase.id && m.kind === 'receipt');
    const previousAdjustments = session.purchaseCorrections?.filter((entry) => entry.purchaseId === purchase.id) ?? [];
    const alreadyAdjustedUnits = previousAdjustments.reduce((sum, entry) => sum + entry.units, 0);
    const remainingUnits = (purchaseMovement?.quantity ?? 0) - alreadyAdjustedUnits;
    const currentStock = stockBalance(sandboxStockBook(session.inventory), purchase.itemId).quantity;
    const canReturn = remainingUnits > 0 && currentStock > 0 && Boolean(onConfirmPurchaseAdjustment);
    const statusText = balance.isAnnulled ? ' · Compra anulada' : balance.returnedCostCents > 0 ? ' · Devolución parcial' : '';

    return (
      <div key={purchase.id} className="py-3 text-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <strong>{name}</strong> · compra {money(purchase.amountCents)}{statusText} · pagado {money(balance.paidCents)} · pendiente {money(balance.pendingCents)}
            {balance.refundableCents > 0 && <span className="ml-1 font-semibold text-emerald-700 dark:text-emerald-400">· por recuperar {money(balance.refundableCents)}</span>}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {balance.pendingCents > 0 && (
              <button type="button" onClick={() => open('purchase_payment', purchase.id, balance.pendingCents)} className="inline-flex min-h-10 items-center rounded-xl bg-[#4F46E5] px-3 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer">
                Pagar {money(balance.pendingCents)}
              </button>
            )}
            {balance.refundableCents > 0 && (
              <button type="button" onClick={() => open('supplier_refund', purchase.id, balance.refundableCents)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200/80 px-3 text-xs font-semibold text-emerald-700 hover:border-[#4F46E5] dark:border-white/[0.08] dark:text-emerald-400 cursor-pointer">
                Cobrar reembolso {money(balance.refundableCents)}
              </button>
            )}
            {canReturn && !balance.isAnnulled && (
              <>
                <button
                  type="button"
                  onClick={() => setAdjustingPurchase({ purchaseId: purchase.id, kind: 'return', maxUnits: Math.min(remainingUnits, currentStock), units: '1', itemName: name })}
                  className="inline-flex min-h-10 items-center rounded-xl border border-slate-200/80 px-3 text-xs font-semibold text-[var(--text-soft)] hover:border-[#4F46E5] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer"
                >
                  Devolver unidades
                </button>
                {remainingUnits <= currentStock && (
                  <button
                    type="button"
                    onClick={() => setAdjustingPurchase({ purchaseId: purchase.id, kind: 'annulment', maxUnits: remainingUnits, units: String(remainingUnits), itemName: name })}
                    className="inline-flex min-h-10 items-center rounded-xl border border-rose-500/30 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
                  >
                    Anular compra
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const saleRow = (sale: (typeof session.sales)[number]) => {
    const balance = sandboxSaleBalance(session, sale.id)!;
    const status = salePaymentStatus(balance);
    return (
      <div key={sale.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <strong>{sale.recipeName}</strong> · {status}{balance.activeRevenueCents !== sale.revenueCents ? ' · venta ajustada' : ''} · vigente {money(balance.activeRevenueCents)} · cobrado {money(balance.netReceivedCents)}
          </span>
          <span className="flex flex-wrap gap-2">
            {balance.pendingCents > 0 && (
              <button type="button" onClick={() => open('sale_receipt', sale.id, balance.pendingCents)} className="inline-flex min-h-10 items-center rounded-xl bg-[#4F46E5] px-3 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer">
                Cobrar {money(balance.pendingCents)}
              </button>
            )}
            {balance.refundableCents > 0 && (
              <button type="button" onClick={() => open('customer_refund', sale.id, balance.refundableCents)} className="inline-flex min-h-10 items-center rounded-xl border border-amber-500/40 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 cursor-pointer">
                Reembolsar {money(balance.refundableCents)}
              </button>
            )}
          </span>
        </div>
        {balance.physicalLossCents > 0 && <p className="mt-1 text-xs text-[var(--text-soft)]">Costo físico no restituido: {money(balance.physicalLossCents)}; no se suma otra vez al costo vendido.</p>}
      </div>
    );
  };

  if (!hasActivity) return null;

  return <SurfaceCard id="commercial-money-sandbox" aria-label={accounts ? 'Pagos, cobros y resultados' : 'Pagos, cobros y resultados de prueba'} className="scroll-mt-4 overflow-hidden">
    <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
      <div className="flex items-center gap-1.5">
        <SectionHeader
          icon={<AppIcon name="wallet" className="h-4 w-4" />}
          title="Operaciones"
          className="flex-1"
        />
        {accounts && <ContextualHelp label="Operaciones y Finanzas">Las compras y ventas registran mercadería. Los pagos, cobros y reembolsos registran dinero y se guardan junto con sus movimientos en Finanzas.</ContextualHelp>}
      </div>
      {!accounts && <p className="mt-1 text-xs text-[var(--text-soft)]">Solo simulación. Ningún pago, cobro o reembolso modifica Finanzas.</p>}
    </div>

    <div className="space-y-5 p-4 sm:p-5">
      <div className="space-y-4">
        {hasSales && <section aria-label="Resultado comercial" className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resultado comercial</h4>
            <span className="text-xs text-[var(--text-soft)]">Importes comerciales, no cobros</span>
          </div>
          <div className="grid grid-cols-1 gap-3 border-y border-slate-100 py-3 dark:border-white/[0.06] sm:grid-cols-3">
            {resultItems.map(([name, cents, help], index) => <div key={name}
              className={`min-w-0 ${index === 2 ? 'sm:border-l sm:border-slate-100 sm:pl-3 dark:sm:border-white/[0.06]' : ''}`}>
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-soft)]">{name}{help && <ContextualHelp label={name}>{help}</ContextualHelp>}</span>
              <b className={`mt-1 block break-words text-lg font-bold tabular-nums sm:text-xl ${cents < 0 ? 'text-rose-700 dark:text-rose-400' : index === 2 ? 'text-[#4F46E5] dark:text-indigo-300' : 'text-[var(--text)]'}`}>{money(cents)}</b>
            </div>)}
          </div>
          <div className={`grid grid-cols-1 gap-2 text-sm ${summary.commercialResultBeforeOtherCostsCents !== summary.grossProfitCents ? 'sm:grid-cols-2' : ''}`}>
            <div className="py-1">
              <span className="inline-flex items-center gap-1 text-[var(--text-soft)]">Margen bruto sobre ventas<ContextualHelp label="Margen bruto">Indica qué parte del importe vendido queda después del costo de las unidades vendidas. No es ganancia neta.</ContextualHelp></span>
              <b className="ml-2 tabular-nums text-[var(--text)]">{summary.grossMarginPercent == null ? '—' : `${summary.grossMarginPercent.toFixed(2)} %`}</b>
            </div>
            {summary.commercialResultBeforeOtherCostsCents !== summary.grossProfitCents && <div className="py-1">
              <span className="text-[var(--text-soft)]">Resultado tras pérdidas físicas</span>
              <b className={`ml-2 tabular-nums ${summary.commercialResultBeforeOtherCostsCents < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-[var(--text)]'}`}>{money(summary.commercialResultBeforeOtherCostsCents)}</b>
              <span className="ml-1 text-xs text-[var(--text-soft)]">antes de otros gastos</span>
            </div>}
          </div>
        </section>}

        {(hasPurchases || hasSales || hasMoneyEvents) && <section aria-label="Estado de cobros y pagos" className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado de cobros y pagos</h4>
            <span className="text-xs text-[var(--text-soft)]">{accounts ? 'Dinero registrado y montos pendientes' : 'Dinero simulado y montos por cobrar o pagar'}</span>
          </div>
          <div className={`grid grid-cols-2 gap-3 border-y border-slate-100 py-3 dark:border-white/[0.06] ${visibleMoneyItems.length > 2 ? 'sm:grid-cols-4' : ''}`}>
            {visibleMoneyItems.map(([name, cents, help]) => <div key={name} className="min-w-0">
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-soft)]">{name}{help && <ContextualHelp label={name}>{help}</ContextualHelp>}</span>
              <b className="mt-1 block break-words text-sm tabular-nums text-[var(--text)] sm:text-base">{money(cents)}</b>
            </div>)}
          </div>
          {hasMoneyEvents && <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-soft)]">Flujo monetario<ContextualHelp label="Flujo monetario">Suma los cobros y resta los reembolsos y pagos registrados. No incluye el saldo inicial ni todos los movimientos de una cuenta.</ContextualHelp></span>
            <span><b className="tabular-nums text-[var(--text)]">{money(summary.simulatedCashFlowCents)}</b><span className="ml-2 text-xs text-[var(--text-soft)]">No es un saldo de cuenta.</span></span>
          </div>}
        </section>}

        {hasAdjustments && <section aria-label="Ajustes y detalles" className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ajustes y detalles</h4>
            <span className="text-xs text-[var(--text-soft)]">Separados de las ventas y del dinero cobrado</span>
          </div>
          <div className="grid grid-cols-1 gap-3 border-y border-slate-100 py-3 dark:border-white/[0.06] sm:grid-cols-3">
            {adjustmentItems.map(([name, cents, help]) => <div key={name} className="min-w-0">
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-soft)]">{name}{help && <ContextualHelp label={name}>{help}</ContextualHelp>}</span>
              <b className="mt-1 block break-words text-sm tabular-nums text-[var(--text)]">{money(cents)}</b>
            </div>)}
          </div>
        </section>}
      </div>

      {pendingPurchases.length > 0 && <div className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Compras por pagar o reembolsar</h4><ListDivider>{pendingPurchases.map(purchaseRow)}</ListDivider></div>}
      {pendingSales.length > 0 && <div className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ventas por cobrar o reembolsar</h4><ListDivider>{pendingSales.map(saleRow)}</ListDivider></div>}
      {(settledPurchases.length > 0 || settledSales.length > 0) && <details className="border-t border-slate-100 pt-3 text-sm text-[var(--text-soft)] dark:border-white/[0.06]"><summary className="cursor-pointer font-semibold">Operaciones sin importes pendientes ({settledPurchases.length + settledSales.length})</summary><ListDivider className="mt-2">{settledPurchases.map(purchaseRow)}{settledSales.map(saleRow)}</ListDivider></details>}

      {adjustingPurchase && (
        <form onSubmit={submitPurchaseAdjustment} className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 dark:border-white/[0.06] sm:grid-cols-2">
          <h4 className="text-sm font-semibold text-[var(--text)] sm:col-span-2">
            {adjustingPurchase.kind === 'annulment' ? 'Anular compra' : 'Devolver unidades al proveedor'} · {adjustingPurchase.itemName}
          </h4>
          <p className="text-xs text-[var(--text-soft)] sm:col-span-2">
            {adjustingPurchase.kind === 'annulment'
              ? 'Retirará las unidades del stock y actualizará la deuda o habilitará el reembolso del dinero pagado.'
              : `Se retirarán las unidades devueltas del inventario disponible (máx. ${adjustingPurchase.maxUnits}).`}
          </p>
          <label className="min-w-0 space-y-1 text-sm text-[var(--text-soft)]">
            {adjustingPurchase.kind === 'annulment' ? 'Unidades a anular (todas las restantes)' : 'Cantidad de unidades a devolver'}
            <input
              required
              type="number"
              min="1"
              max={adjustingPurchase.maxUnits}
              step="1"
              disabled={adjustingPurchase.kind === 'annulment'}
              value={adjustingPurchase.units}
              onChange={(e) => setAdjustingPurchase({ ...adjustingPurchase, units: e.target.value })}
              className={field}
            />
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400 sm:col-span-2">{error}</p>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] cursor-pointer">
              {adjustingPurchase.kind === 'annulment' ? 'Confirmar anulación' : 'Confirmar devolución'}
            </button>
            <button type="button" onClick={() => { setAdjustingPurchase(null); setError(''); }} className="min-h-10 rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {draft && <form ref={formRef} onSubmit={submit} className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 dark:border-white/[0.06] sm:grid-cols-2">
        <h4 className="text-sm font-semibold text-[var(--text)] sm:col-span-2">{label[draft.purpose]}{accounts ? '' : ' simulado'}{draftName ? ` · ${draftName}` : ''}</h4>
        {draft.reversalOf && (
          <p className="text-xs text-[var(--text-soft)] sm:col-span-2">
            Esta reversión registra una corrección contable que compensa el movimiento original en Finanzas, restaurando el saldo pendiente sin alterar el historial cerrado.
          </p>
        )}
        <label className="min-w-0 space-y-1 text-sm text-[var(--text-soft)]">Importe ($U)<input ref={amountRef} required disabled={Boolean(draft.reversalOf)} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} /></label>
        <label className="min-w-0 space-y-1 text-sm text-[var(--text-soft)]">{accounts ? 'Cuenta' : 'Cuenta simulada'}{accounts ? <select aria-label="Cuenta financiera" required disabled={Boolean(draft.reversalOf)} value={accountRef} onChange={e => setAccountRef(e.target.value)} className={field}><option value="">Seleccionar cuenta</option>{accounts.filter(a => (a.currency || 'UYU') === 'UYU').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : <input required disabled={Boolean(draft.reversalOf)} value={accountRef} onChange={(event) => setAccountRef(event.target.value)} placeholder="Ej.: caja de prueba" className={field} />}</label>
        {financeFields?.(Boolean(draft.reversalOf) || draft.purpose === 'customer_refund' || draft.purpose === 'supplier_refund')}
        {!accounts && !draft.reversalOf && <label className="min-w-0 space-y-1 text-sm text-[var(--text-soft)]">¿Ya lo registraste en Finanzas?<select value={mode} onChange={(event) => setMode(event.target.value as 'new' | 'existing')} className={field}><option value="new">No, queda pendiente</option><option value="existing">Sí, vincular movimiento</option></select></label>}
        {mode === 'existing' && <label htmlFor={existingIdInput} className="min-w-0 space-y-1 text-sm text-[var(--text-soft)]">Referencia del movimiento en Finanzas<ContextualHelp label="Referencia del movimiento">Copiá el identificador del movimiento ya registrado. En esta prueba el vínculo queda pendiente de verificación; no se crea otro movimiento.</ContextualHelp><input id={existingIdInput} required value={existingId} onChange={(event) => setExistingId(event.target.value)} className={field} /></label>}
        {mode === 'existing' && <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-2">Referencia solo declarada: su importe, cuenta y tipo deberán verificarse antes de una integración real. No se planifica otra transacción.</p>}
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] cursor-pointer">{accounts ? (draft.reversalOf ? 'Confirmar reversión' : 'Guardar movimiento') : 'Confirmar simulación'}</button><button type="button" onClick={() => setDraft(null)} className="min-h-10 rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer">Cancelar</button></div>
      </form>}
      {hasMoneyEvents && <details className="border-t border-slate-100 pt-3 text-sm text-[var(--text-soft)] dark:border-white/[0.06]"><summary className="cursor-pointer font-semibold">Movimientos monetarios{accounts ? '' : ' simulados'} ({session.moneyEvents?.length})</summary><ol className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.06]">{session.moneyEvents?.map((event) => {
        const plan = planSandboxFinanceEffect(event);
        const isReversal = event.purpose === 'payment_reversal' || event.purpose === 'receipt_reversal';
        const isReversed = session.moneyEvents?.some((e) => (e.purpose === 'payment_reversal' || e.purpose === 'receipt_reversal') && e.reversalOf === event.id);
        const isEligiblePurpose = event.purpose === 'purchase_payment' || event.purpose === 'sale_receipt';
        let reversalBlockedReason = '';
        if (!isReversal && !isReversed && isEligiblePurpose) {
          if (event.purpose === 'purchase_payment') {
            const pb = sandboxPurchaseBalance(session, event.sourceId);
            if (pb && (pb.paidCents - event.amountCents) < pb.refundedCents) {
              reversalBlockedReason = 'No se puede revertir: respalda reembolsos ya registrados';
            }
          } else if (event.purpose === 'sale_receipt') {
            const sb = sandboxSaleBalance(session, event.sourceId);
            if (sb && (sb.receivedCents - event.amountCents) < sb.refundedCents) {
              reversalBlockedReason = 'No se puede revertir: respalda reembolsos ya registrados';
            }
          }
        }
        const canReverse = !isReversal && !isReversed && isEligiblePurpose && !reversalBlockedReason;
        return (
          <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              {label[event.purpose]} · {money(event.amountCents)} · {event.accountRef} · {accounts ? 'Guardado en Finanzas' : plan.status === 'pending_create' ? 'pendiente de crear' : 'referencia existente'}
              {isReversed && <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">(Revertido)</span>}
            </span>
            {canReverse ? (
              <button
                type="button"
                onClick={() => openReversal(event)}
                className="inline-flex min-h-10 items-center rounded-xl border border-rose-500/30 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
              >
                Corregir / Revertir
              </button>
            ) : reversalBlockedReason ? (
              <span className="text-xs italic text-[var(--text-soft)]">{reversalBlockedReason}</span>
            ) : null}
          </li>
        );
      })}</ol></details>}
    </div>
  </SurfaceCard>;
};
