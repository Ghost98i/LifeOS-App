import type { Finance } from '../types';
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
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
const field = 'celestian-clean-field min-h-11 min-w-0 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-500';
const selectField = `${field} appearance-none pr-9 cursor-pointer`;
const subtleDestructiveBtn =
  'inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-400/60 hover:bg-rose-50 hover:text-rose-600 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer';
const formTitle: Record<SandboxMoneyPurpose, string> = {
  purchase_payment: 'Registrar pago',
  sale_receipt: 'Registrar cobro',
  customer_refund: 'Registrar reembolso a cliente',
  supplier_refund: 'Registrar reembolso de proveedor',
  payment_reversal: 'Reversión de pago',
  receipt_reversal: 'Reversión de cobro',
};
const eventMeta: Record<SandboxMoneyPurpose, { noun: string; badgeClass: string; isInflow: boolean }> = {
  purchase_payment: { noun: 'Pago', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-300', isInflow: false },
  sale_receipt: { noun: 'Cobro', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', isInflow: true },
  customer_refund: { noun: 'Reembolso', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', isInflow: false },
  supplier_refund: { noun: 'Reembolso', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', isInflow: true },
  payment_reversal: { noun: 'Reversión', badgeClass: 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300', isInflow: true },
  receipt_reversal: { noun: 'Reversión', badgeClass: 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300', isInflow: false },
};
const capitalize = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
};
const looksLikeInternalId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  || (/^[a-z0-9_-]{10,}$/i.test(value) && !/\s/.test(value) && !/^[a-z]+$/i.test(value))
  || /^[a-z0-9]{10,16}$/.test(value);

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

  const secondaryKpis: Array<{ label: string; cents: number; tone?: 'neutral' | 'positive' | 'pending-in' | 'pending-out' }> = [
    ...(hasSales ? [
      { label: 'Ventas', cents: summary.activeRevenueCents, tone: 'neutral' as const },
      { label: 'Costo vendido', cents: summary.activeSoldCostCents, tone: 'neutral' as const },
      { label: 'Cobrado', cents: summary.receivedCents, tone: 'positive' as const },
      { label: 'Pendiente de cobro', cents: summary.receivableCents, tone: 'pending-in' as const },
    ] : []),
    ...(hasPurchases ? [
      { label: 'Pagado', cents: summary.paidCents, tone: 'neutral' as const },
      { label: 'Por pagar', cents: summary.payableCents, tone: 'pending-out' as const },
    ] : []),
  ];
  const adjustmentItems: Array<[string, number]> = [
    ['Pérdidas físicas', summary.physicalLossCents],
    ['Reembolsado a clientes', summary.refundedCents],
    ['Por reembolsar a clientes', summary.refundableCents],
    ['Reembolsado por proveedores', summary.supplierRefundedCents],
    ['Por recuperar de proveedores', summary.supplierRefundableCents],
  ].filter((entry): entry is [string, number] => entry[1] !== 0);
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

  const resolveAccountName = (ref: string): string | null => {
    const cleaned = ref.trim();
    if (!cleaned) return null;
    if (accounts) {
      const found = accounts.find((account) => account.id === cleaned);
      return found ? found.name : null;
    }
    return looksLikeInternalId(cleaned) ? null : cleaned;
  };

  const resolveEventConcept = (event: SandboxMoneyEvent): string => {
    if (event.purpose === 'purchase_payment' || event.purpose === 'supplier_refund' || event.purpose === 'payment_reversal') {
      const purchase = purchases.find((entry) => entry.id === event.sourceId);
      const itemName = purchase ? session.inventory.items.find((item) => item.id === purchase.itemId)?.name : undefined;
      return itemName ? capitalize(itemName) : 'Compra';
    }
    const sale = session.sales.find((entry) => entry.id === event.sourceId);
    return sale?.recipeName ? capitalize(sale.recipeName) : 'Venta';
  };

  const purchaseRow = (purchase: (typeof purchases)[number]) => {
    const balance = sandboxPurchaseBalance(session, purchase.id)!;
    const rawName = session.inventory.items.find((item) => item.id === purchase.itemId)?.name ?? 'Artículo';
    const name = capitalize(rawName);
    const purchaseMovement = session.inventory.movements.find((m) => m.operationId === purchase.id && m.kind === 'receipt');
    const previousAdjustments = session.purchaseCorrections?.filter((entry) => entry.purchaseId === purchase.id) ?? [];
    const alreadyAdjustedUnits = previousAdjustments.reduce((sum, entry) => sum + entry.units, 0);
    const remainingUnits = (purchaseMovement?.quantity ?? 0) - alreadyAdjustedUnits;
    const currentStock = stockBalance(sandboxStockBook(session.inventory), purchase.itemId).quantity;
    const canReturn = remainingUnits > 0 && currentStock > 0 && Boolean(onConfirmPurchaseAdjustment);
    const statusLabel = balance.isAnnulled
      ? 'Anulada'
      : balance.refundableCents > 0
        ? 'Reembolso pendiente'
        : balance.pendingCents > 0
          ? (balance.paidCents > 0 ? 'Pago parcial' : 'Pendiente')
          : 'Pagada';
    const statusClass = balance.isAnnulled
      ? 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300'
      : balance.refundableCents > 0
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : balance.pendingCents > 0
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';

    return (
      <div key={purchase.id} className="py-3 text-sm">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="truncate font-semibold text-[var(--text)]">{name}</strong>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">Compra</span>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>{statusLabel}</span>
              {balance.returnedCostCents > 0 && !balance.isAnnulled && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)] dark:bg-white/[0.06]">Devolución parcial</span>
              )}
            </div>
            {(balance.pendingCents > 0 && balance.paidCents > 0) && (
              <p className="text-xs text-[var(--text-soft)]">
                Pagado <span className="tabular-nums font-medium text-[var(--text)]">{money(balance.paidCents)}</span> · Pendiente <span className="tabular-nums font-medium text-[var(--text)]">{money(balance.pendingCents)}</span>
              </p>
            )}
            {balance.refundableCents > 0 && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Por recuperar <span className="tabular-nums">{money(balance.refundableCents)}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <span className="text-sm font-bold tabular-nums text-[var(--text)]">{money(purchase.amountCents)}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {balance.pendingCents > 0 && (
                <button type="button" onClick={() => open('purchase_payment', purchase.id, balance.pendingCents)} className="inline-flex min-h-10 items-center rounded-xl bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer">
                  Pagar {money(balance.pendingCents)}
                </button>
              )}
              {balance.refundableCents > 0 && (
                <button type="button" onClick={() => open('supplier_refund', purchase.id, balance.refundableCents)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200/80 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:border-[#4F46E5] dark:border-white/[0.08] dark:text-emerald-400 cursor-pointer">
                  Cobrar reembolso {money(balance.refundableCents)}
                </button>
              )}
              {canReturn && !balance.isAnnulled && (
                <>
                  <button
                    type="button"
                    onClick={() => setAdjustingPurchase({ purchaseId: purchase.id, kind: 'return', maxUnits: Math.min(remainingUnits, currentStock), units: '1', itemName: name })}
                    className="inline-flex min-h-9 items-center rounded-xl border border-slate-200/80 px-2.5 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-[#4F46E5] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer"
                  >
                    Devolver unidades
                  </button>
                  {remainingUnits <= currentStock && (
                    <button
                      type="button"
                      onClick={() => setAdjustingPurchase({ purchaseId: purchase.id, kind: 'annulment', maxUnits: remainingUnits, units: String(remainingUnits), itemName: name })}
                      className={subtleDestructiveBtn}
                    >
                      Anular compra
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const saleRow = (sale: (typeof session.sales)[number]) => {
    const balance = sandboxSaleBalance(session, sale.id)!;
    const status = salePaymentStatus(balance);
    const name = capitalize(sale.recipeName);
    const statusClass = balance.refundableCents > 0
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : balance.pendingCents > 0
        ? 'bg-indigo-50 text-[#4F46E5] dark:bg-indigo-500/15 dark:text-indigo-300'
        : balance.netReceivedCents > 0
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300';

    return (
      <div key={sale.id} className="py-3 text-sm">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="truncate font-semibold text-[var(--text)]">{name}</strong>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Venta</span>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>{status}</span>
              {balance.activeRevenueCents !== sale.revenueCents && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)] dark:bg-white/[0.06]">venta ajustada</span>
              )}
            </div>
            {(balance.pendingCents > 0 && balance.netReceivedCents > 0) && (
              <p className="text-xs text-[var(--text-soft)]">
                Cobrado <span className="tabular-nums font-medium text-[var(--text)]">{money(balance.netReceivedCents)}</span> · Pendiente <span className="tabular-nums font-medium text-[var(--text)]">{money(balance.pendingCents)}</span>
              </p>
            )}
            {balance.physicalLossCents > 0 && (
              <p className="text-xs text-[var(--text-soft)]">Costo físico no restituido: {money(balance.physicalLossCents)}; no se suma otra vez al costo vendido.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <span className="text-sm font-bold tabular-nums text-[var(--text)]">{money(balance.activeRevenueCents)}</span>
            <div className="flex flex-wrap gap-1.5">
              {balance.pendingCents > 0 && (
                <button type="button" onClick={() => open('sale_receipt', sale.id, balance.pendingCents)} className="inline-flex min-h-10 items-center rounded-xl bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer">
                  Cobrar {money(balance.pendingCents)}
                </button>
              )}
              {balance.refundableCents > 0 && (
                <button type="button" onClick={() => open('customer_refund', sale.id, balance.refundableCents)} className="inline-flex min-h-10 items-center rounded-xl border border-amber-500/40 px-3 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400 cursor-pointer">
                  Reembolsar {money(balance.refundableCents)}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!hasActivity) return null;

  return <SurfaceCard id="commercial-money-sandbox" aria-label={accounts ? 'Pagos, cobros y resultados' : 'Pagos, cobros y resultados de prueba'} className="scroll-mt-4 overflow-hidden">
    <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader
          icon={<AppIcon name="wallet" className="h-4 w-4" />}
          title="Resumen comercial"
          className="flex-1"
        />
        <ContextualHelp label="Resultado comercial y flujo de caja">
          La ganancia bruta resta el costo histórico vendido de las ventas vigentes. El flujo monetario refleja solo cobros, pagos y reembolsos confirmados{accounts ? ' en Finanzas.' : ' en esta simulación.'}
        </ContextualHelp>
      </div>
      {!accounts && <p className="mt-0.5 text-xs text-[var(--text-soft)]">Simulación aislada · no modifica tus saldos en Finanzas.</p>}
    </div>

    <div className="space-y-5 p-4 sm:p-5">
      {/* Nivel 1: Hero fintech (Ganancia bruta + Flujo monetario) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hasSales ? (
          <div className="min-w-0 rounded-xl border border-slate-200/75 bg-slate-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="block text-xs font-medium text-[var(--text-soft)]">Ganancia bruta</span>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
              <strong className={`text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${summary.grossProfitCents < 0 ? 'text-rose-700 dark:text-rose-400' : summary.grossProfitCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
                {money(summary.grossProfitCents)}
              </strong>
              {summary.grossMarginPercent != null && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${summary.grossProfitCents < 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : summary.grossProfitCents > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300'}`}>
                  Margen {summary.grossMarginPercent.toFixed(1)}%
                </span>
              )}
            </div>
            {summary.commercialResultBeforeOtherCostsCents !== summary.grossProfitCents && (
              <p className="mt-2 text-xs text-[var(--text-soft)]">
                Resultado tras pérdidas físicas:{' '}
                <b className={`tabular-nums ${summary.commercialResultBeforeOtherCostsCents < 0 ? 'text-rose-700 dark:text-rose-400' : summary.commercialResultBeforeOtherCostsCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
                  {money(summary.commercialResultBeforeOtherCostsCents)}
                </b>
              </p>
            )}
          </div>
        ) : (
          <div className="min-w-0 rounded-xl border border-slate-200/75 bg-slate-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="block text-xs font-medium text-[var(--text-soft)]">{summary.payableCents > 0 ? 'Compras pendientes' : 'Compras pagadas'}</span>
            <strong className="mt-1.5 block text-2xl font-bold tracking-tight tabular-nums text-[var(--text)] sm:text-3xl">
              {money(summary.payableCents > 0 ? summary.payableCents : summary.paidCents)}
            </strong>
          </div>
        )}

        <div className="min-w-0 rounded-xl border border-slate-200/75 bg-slate-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-soft)]">Flujo monetario</span>
            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--text-faint)] dark:bg-white/[0.06]">
              {accounts ? 'Caja real' : 'Simulado'}
            </span>
          </div>
          <strong className={`mt-1.5 block text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${summary.simulatedCashFlowCents < 0 ? 'text-rose-700 dark:text-rose-400' : summary.simulatedCashFlowCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
            {money(summary.simulatedCashFlowCents)}
          </strong>
          <p className="mt-1 text-xs text-[var(--text-faint)]">Cobros menos pagos y reembolsos</p>
        </div>
      </div>

      {/* Nivel 2: KPIs secundarios compactos */}
      {secondaryKpis.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-white/[0.06] sm:grid-cols-3 lg:grid-cols-6">
          {secondaryKpis.map((kpi) => {
            const isZero = kpi.cents === 0;
            const valueClass = kpi.tone === 'positive' && kpi.cents > 0
              ? 'text-emerald-700 dark:text-emerald-400'
              : kpi.tone === 'pending-in' && kpi.cents > 0
                ? 'text-[#4F46E5] dark:text-indigo-300'
                : kpi.tone === 'pending-out' && kpi.cents > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : isZero && (kpi.tone === 'pending-in' || kpi.tone === 'pending-out')
                    ? 'text-[var(--text-faint)]'
                    : 'text-[var(--text)]';
            return (
              <div key={kpi.label} className="min-w-0">
                <span className="block truncate text-xs font-medium text-[var(--text-soft)]">{kpi.label}</span>
                <b className={`mt-0.5 block break-words text-sm font-bold tabular-nums sm:text-base ${valueClass}`}>
                  {money(kpi.cents)}
                </b>
              </div>
            );
          })}
        </div>
      )}

      {hasAdjustments && adjustmentItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.06] sm:grid-cols-3">
          {adjustmentItems.map(([name, cents]) => (
            <div key={name} className="min-w-0">
              <span className="block text-xs font-medium text-[var(--text-soft)]">{name}</span>
              <b className="mt-0.5 block break-words text-sm font-semibold tabular-nums text-[var(--text)]">{money(cents)}</b>
            </div>
          ))}
        </div>
      )}

      {/* Operaciones pendientes (solo visibles arriba si requieren acción) */}
      {pendingPurchases.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Compras por pagar o reembolsar</h4>
          <ListDivider>{pendingPurchases.map(purchaseRow)}</ListDivider>
        </div>
      )}
      {pendingSales.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ventas por cobrar o reembolsar</h4>
          <ListDivider>{pendingSales.map(saleRow)}</ListDivider>
        </div>
      )}

      {/* Formularios activos de ajuste / cobro / pago / reversión */}
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
          <label className="min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]">
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
              className={`${field} tabular-nums`}
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
        <h4 className="text-sm font-semibold text-[var(--text)] sm:col-span-2">{formTitle[draft.purpose]}{accounts ? '' : ' simulado'}{draftName ? ` · ${capitalize(draftName)}` : ''}</h4>
        {draft.reversalOf && (
          <p className="text-xs text-[var(--text-soft)] sm:col-span-2">
            Esta reversión registra una corrección contable que compensa el movimiento original en Finanzas, restaurando el saldo pendiente sin alterar el historial cerrado.
          </p>
        )}
        <label className="min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]">Importe ($U)<input ref={amountRef} required disabled={Boolean(draft.reversalOf)} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${field} tabular-nums`} /></label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]">{accounts ? 'Cuenta' : 'Cuenta simulada'}{accounts ? (
          <span className="relative block w-full">
            <select aria-label="Cuenta financiera" required disabled={Boolean(draft.reversalOf)} value={accountRef} onChange={e => setAccountRef(e.target.value)} className={selectField}>
              <option value="">Seleccionar cuenta</option>
              {accounts.filter(a => (a.currency || 'UYU') === 'UYU').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          </span>
        ) : <input required disabled={Boolean(draft.reversalOf)} value={accountRef} onChange={(event) => setAccountRef(event.target.value)} placeholder="Ej.: caja de prueba" className={field} />}</label>
        {financeFields?.(Boolean(draft.reversalOf) || draft.purpose === 'customer_refund' || draft.purpose === 'supplier_refund')}
        {!accounts && !draft.reversalOf && <label className="min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]">¿Ya lo registraste en Finanzas?<span className="relative block w-full"><select value={mode} onChange={(event) => setMode(event.target.value as 'new' | 'existing')} className={selectField}><option value="new">No, queda pendiente</option><option value="existing">Sí, vincular movimiento</option></select><ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /></span></label>}
        {mode === 'existing' && <label htmlFor={existingIdInput} className="min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]">Referencia del movimiento en Finanzas<input id={existingIdInput} required value={existingId} onChange={(event) => setExistingId(event.target.value)} className={field} /></label>}
        {mode === 'existing' && <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-2">Referencia solo declarada: su importe, cuenta y tipo deberán verificarse antes de una integración real. No se planifica otra transacción.</p>}
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] cursor-pointer">{accounts ? (draft.reversalOf ? 'Confirmar reversión' : 'Guardar movimiento') : 'Confirmar simulación'}</button><button type="button" onClick={() => setDraft(null)} className="min-h-10 rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-[var(--text-soft)] hover:text-[var(--text)] dark:border-white/[0.08] cursor-pointer">Cancelar</button></div>
      </form>}

      {/* Detalles desplegables cerrados por defecto (estilo Finanzas) */}
      {(settledPurchases.length > 0 || settledSales.length > 0 || hasMoneyEvents) && (
        <div className="space-y-2.5 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
          {(settledPurchases.length > 0 || settledSales.length > 0) && (
            <details className="group rounded-xl border border-slate-200/75 bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--text)] transition-colors hover:text-[#4F46E5] dark:hover:text-indigo-300 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <span>Historial de operaciones</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-soft)] dark:bg-white/[0.08]">
                    {settledPurchases.length + settledSales.length}
                  </span>
                </span>
                <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200/60 px-3.5 dark:border-white/[0.06]">
                <ListDivider>{settledPurchases.map(purchaseRow)}{settledSales.map(saleRow)}</ListDivider>
              </div>
            </details>
          )}

          {hasMoneyEvents && (
            <details className="group rounded-xl border border-slate-200/75 bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--text)] transition-colors hover:text-[#4F46E5] dark:hover:text-indigo-300 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <span>{accounts ? 'Movimientos en Finanzas' : 'Movimientos simulados'}</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-soft)] dark:bg-white/[0.08]">
                    {session.moneyEvents?.length}
                  </span>
                </span>
                <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="divide-y divide-slate-200/60 border-t border-slate-200/60 px-3.5 dark:divide-white/[0.06] dark:border-white/[0.06]">
                {session.moneyEvents?.map((event) => {
                  const plan = planSandboxFinanceEffect(event);
                  const meta = eventMeta[event.purpose];
                  const concept = resolveEventConcept(event);
                  const accountLabel = resolveAccountName(event.accountRef);
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
                  const statusNote = accounts
                    ? 'En Finanzas'
                    : plan.status === 'pending_create'
                      ? 'Simulado'
                      : 'Referencia vinculada';
                  return (
                    <li key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>{meta.noun}</span>
                          <span className="truncate text-sm font-semibold text-[var(--text)]">{concept}</span>
                          {isReversed && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">Revertido</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-faint)]">
                          {accountLabel ? `${accountLabel} · ` : ''}{statusNote}
                        </p>
                        {reversalBlockedReason && (
                          <p className="text-[11px] text-[var(--text-soft)]">{reversalBlockedReason}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2.5 sm:justify-end">
                        <strong className={`text-sm font-bold tabular-nums ${isReversed ? 'text-[var(--text-faint)] line-through' : meta.isInflow ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
                          {meta.isInflow ? '+' : '−'}{money(event.amountCents)}
                        </strong>
                        {canReverse && (
                          <button
                            type="button"
                            onClick={() => openReversal(event)}
                            aria-label={`Revertir ${meta.noun.toLowerCase()} de ${concept}`}
                            title="Revertir movimiento"
                            className={subtleDestructiveBtn}
                          >
                            <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
                            <span>Revertir</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}
        </div>
      )}
    </div>
  </SurfaceCard>;
};
