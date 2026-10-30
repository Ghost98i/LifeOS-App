import type { CommercialSet } from './commercialContract';
import type { SandboxProductionSession } from './commercialProductionSandbox';

/** Session-only acquisition. Its cost is independent of when (or whether) it is paid. */
export interface SandboxPurchase {
  id: string;
  itemId: string;
  amountCents: number;
}

export type SandboxMoneyPurpose =
  | 'purchase_payment'
  | 'sale_receipt'
  | 'customer_refund'
  | 'supplier_refund'
  | 'payment_reversal'
  | 'receipt_reversal';

export interface SandboxMoneyEvent {
  id: string;
  purpose: SandboxMoneyPurpose;
  sourceId: string;
  amountCents: number;
  /** A sandbox label; a real account ID must be checked before any future posting. */
  accountRef: string;
  effectiveOrder: number;
  finance: { mode: 'new' } | { mode: 'existing'; transactionId: string };
  reversalOf?: string;
}

export type SandboxMoneyRequest = Omit<SandboxMoneyEvent, 'effectiveOrder'>;

export interface SandboxPurchaseCorrection {
  id: string;
  purchaseId: string;
  itemId: string;
  units: number;
  unit: import('./commercialInventory').StockUnit;
  kind: 'annulment' | 'return';
  costCents: number;
  effectiveOrder: string;
  commercialDate?: string;
}

export type SandboxMoneySession = SandboxProductionSession & {
  purchases?: SandboxPurchase[];
  purchaseCorrections?: SandboxPurchaseCorrection[];
  moneyEvents?: SandboxMoneyEvent[];
};

const sum = (values: number[]) => values.reduce((total, value) => {
  const next = total + value;
  if (!Number.isSafeInteger(next)) throw new Error('El importe supera la precisión monetaria admitida.');
  return next;
}, 0);
const eventAmount = (session: SandboxMoneySession, purpose: SandboxMoneyPurpose, sourceId: string) => {
  const events = session.moneyEvents ?? [];
  const primary = sum(events.filter((event) => event.purpose === purpose && event.sourceId === sourceId)
    .map((event) => event.amountCents));
  if (purpose === 'purchase_payment') {
    const reversed = sum(events.filter((event) => event.purpose === 'payment_reversal' && event.sourceId === sourceId)
      .map((event) => event.amountCents));
    return Math.max(0, primary - reversed);
  }
  if (purpose === 'sale_receipt') {
    const reversed = sum(events.filter((event) => event.purpose === 'receipt_reversal' && event.sourceId === sourceId)
      .map((event) => event.amountCents));
    return Math.max(0, primary - reversed);
  }
  return primary;
};

export function recordSandboxPurchase(session: SandboxMoneySession, inventory: CommercialSet): SandboxMoneySession {
  const movement = inventory.movements.at(-1);
  const operation = inventory.operations.at(-1);
  if (!movement || !operation || operation.kind !== 'receipt' || movement.operationId !== operation.id
    || !Number.isSafeInteger(movement.costCents) || movement.costCents! < 0
    || session.purchases?.some((purchase) => purchase.id === operation.id)) {
    throw new Error('La entrada no puede registrarse como compra simulada.');
  }
  return { ...session, inventory, purchases: [...(session.purchases ?? []), {
    id: operation.id, itemId: movement.itemId, amountCents: movement.costCents!,
  }] };
}

export function sandboxPurchaseBalance(session: SandboxMoneySession, purchaseId: string) {
  const purchase = session.purchases?.find((entry) => entry.id === purchaseId);
  if (!purchase) return null;
  const adjustments = session.purchaseCorrections?.filter((entry) => entry.purchaseId === purchaseId) ?? [];
  const returnedCostCents = sum(adjustments.map((entry) => entry.costCents));
  const activeAmountCents = Math.max(0, purchase.amountCents - returnedCostCents);
  const paidCents = eventAmount(session, 'purchase_payment', purchaseId);
  const refundedCents = eventAmount(session, 'supplier_refund', purchaseId);
  const netPaidCents = Math.max(0, paidCents - refundedCents);
  const isAnnulled = activeAmountCents === 0 && adjustments.some((entry) => entry.kind === 'annulment');
  return {
    purchase,
    activeAmountCents,
    returnedCostCents,
    paidCents,
    refundedCents,
    netPaidCents,
    pendingCents: Math.max(0, activeAmountCents - netPaidCents),
    refundableCents: Math.max(0, netPaidCents - activeAmountCents),
    isAnnulled,
  };
}

export function sandboxSaleBalance(session: SandboxMoneySession, saleId: string) {
  const sale = session.sales.find((entry) => entry.id === saleId);
  if (!sale) return null;
  const adjustments = session.saleCorrections?.filter((entry) => entry.saleId === saleId) ?? [];
  const reversedCents = sum(adjustments.map((entry) => entry.revenueReversalCents));
  const adjustedCostCents = sum(adjustments.map((entry) => entry.costCents));
  const restockedCostCents = sum(adjustments.filter((entry) => entry.disposition === 'restock')
    .map((entry) => entry.costCents));
  const activeRevenueCents = sale.revenueCents - reversedCents;
  const activeSoldCostCents = sale.totalCostCents - adjustedCostCents;
  const physicalLossCents = adjustedCostCents - restockedCostCents;
  const receivedCents = eventAmount(session, 'sale_receipt', saleId);
  const refundedCents = eventAmount(session, 'customer_refund', saleId);
  const netReceivedCents = receivedCents - refundedCents;
  return { sale, activeRevenueCents, activeSoldCostCents, physicalLossCents,
    grossProfitCents: activeRevenueCents - activeSoldCostCents,
    receivedCents, refundedCents, netReceivedCents,
    pendingCents: Math.max(0, activeRevenueCents - netReceivedCents),
    refundableCents: Math.max(0, netReceivedCents - activeRevenueCents) };
}

/** No cash is posted here. The future adapter must validate account, category, currency and origin support. */
export function planSandboxFinanceEffect(event: SandboxMoneyEvent) {
  const type = event.purpose === 'sale_receipt' || event.purpose === 'supplier_refund' || event.purpose === 'payment_reversal'
    ? 'ingreso' as const
    : 'gasto' as const;
  const candidate = { originKey: `commercial:${event.purpose}:${event.id}`, sourceId: event.sourceId,
    purpose: event.purpose, type, amountCents: event.amountCents, accountRef: event.accountRef };
  return event.finance.mode === 'existing'
    ? { status: 'existing_reference_unverified' as const, transactionId: event.finance.transactionId, candidate }
    : { status: 'pending_create' as const, candidate };
}

/** Stock, sale and adjustment records alone never imply that cash changed hands. */
export function planSandboxNonCashEffect(_kind: 'inventory_entry' | 'stock_use' | 'stock_waste'
  | 'production' | 'sale' | 'sale_adjustment') {
  void _kind;
  return { status: 'none' as const };
}

export function confirmSandboxMoneyEvent(session: SandboxMoneySession, request: SandboxMoneyRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxMoneySession; event: SandboxMoneyEvent }
  | { status: 'blocked'; session: SandboxMoneySession; issues: string[] } {
  const prior = session.moneyEvents?.find((event) => event.id === request.id);
  if (prior) {
    const sameFinance = prior.finance.mode === request.finance.mode
      && (prior.finance.mode === 'new' || (request.finance.mode === 'existing'
        && prior.finance.transactionId === request.finance.transactionId));
    return prior.purpose === request.purpose && prior.sourceId === request.sourceId
      && prior.amountCents === request.amountCents && prior.accountRef === request.accountRef && sameFinance
      ? { status: 'already_confirmed', session, event: prior }
      : { status: 'blocked', session, issues: ['El identificador ya corresponde a otro movimiento.'] };
  }
  const issues: string[] = [];
  if (!request.id.trim() || !request.sourceId.trim()) issues.push('Falta la referencia de la operación.');
  if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0) issues.push('Ingresá un importe positivo en centavos.');
  if (!request.accountRef.trim()) issues.push('Indicá una cuenta simulada.');
  if (request.finance.mode === 'existing') {
    if (!request.finance.transactionId.trim()) issues.push('Indicá el identificador del movimiento existente.');
    const transactionId = request.finance.transactionId;
    if (session.moneyEvents?.some((event) => event.finance.mode === 'existing'
      && event.finance.transactionId === transactionId)) issues.push('Ese movimiento financiero ya está vinculado.');
  }
  if (request.purpose === 'purchase_payment') {
    const balance = sandboxPurchaseBalance(session, request.sourceId);
    if (!balance) issues.push('Compra inexistente.');
    else if (request.amountCents > balance.pendingCents) issues.push('El pago supera el importe pendiente.');
  } else if (request.purpose === 'supplier_refund') {
    const balance = sandboxPurchaseBalance(session, request.sourceId);
    if (!balance) issues.push('Compra inexistente.');
    else if (request.amountCents > balance.refundableCents) issues.push('El reembolso supera el importe por recuperar del proveedor.');
  } else if (request.purpose === 'payment_reversal') {
    if (!request.reversalOf) issues.push('Falta el identificador del pago a revertir.');
    else {
      const target = session.moneyEvents?.find((e) => e.id === request.reversalOf);
      if (!target || target.purpose !== 'purchase_payment') issues.push('Pago inexistente para revertir.');
      else if (session.moneyEvents?.some((e) => e.purpose === 'payment_reversal' && e.reversalOf === target.id))
        issues.push('Este pago ya fue revertido.');
      else if (request.amountCents !== target.amountCents) issues.push('El importe de reversión debe coincidir con el pago original.');
      else {
        const purchaseBalance = sandboxPurchaseBalance(session, target.sourceId);
        if (purchaseBalance && (purchaseBalance.paidCents - target.amountCents) < purchaseBalance.refundedCents) {
          issues.push('No se puede revertir el pago porque respalda reembolsos de proveedor ya registrados.');
        }
      }
    }
  } else if (request.purpose === 'receipt_reversal') {
    if (!request.reversalOf) issues.push('Falta el identificador del cobro a revertir.');
    else {
      const target = session.moneyEvents?.find((e) => e.id === request.reversalOf);
      if (!target || target.purpose !== 'sale_receipt') issues.push('Cobro inexistente para revertir.');
      else if (session.moneyEvents?.some((e) => e.purpose === 'receipt_reversal' && e.reversalOf === target.id))
        issues.push('Este cobro ya fue revertido.');
      else if (request.amountCents !== target.amountCents) issues.push('El importe de reversión debe coincidir con el cobro original.');
      else {
        const saleBalance = sandboxSaleBalance(session, target.sourceId);
        if (saleBalance && (saleBalance.receivedCents - target.amountCents) < saleBalance.refundedCents) {
          issues.push('No se puede revertir el cobro porque respalda reembolsos a clientes ya registrados.');
        }
      }
    }
  } else {
    const balance = sandboxSaleBalance(session, request.sourceId);
    if (!balance) issues.push('Venta inexistente.');
    else if (request.purpose === 'sale_receipt' && request.amountCents > balance.pendingCents)
      issues.push('El cobro supera el importe exigible.');
    else if (request.purpose === 'customer_refund' && request.amountCents > balance.refundableCents)
      issues.push('El reembolso supera el exceso cobrado tras los ajustes comerciales.');
  }
  if (issues.length) return { status: 'blocked', session, issues };
  const event: SandboxMoneyEvent = { ...request, effectiveOrder: (session.moneyEvents?.length ?? 0) + 1 };
  return { status: 'confirmed', event,
    session: { ...session, moneyEvents: [...(session.moneyEvents ?? []), event] } };
}

export function sandboxMoneySummary(session: SandboxMoneySession) {
  const sales = session.sales.map((sale) => sandboxSaleBalance(session, sale.id)!);
  const purchases = (session.purchases ?? []).map((purchase) => sandboxPurchaseBalance(session, purchase.id)!);
  const total = (values: number[]) => sum(values);
  const activeRevenueCents = total(sales.map((entry) => entry.activeRevenueCents));
  const activeSoldCostCents = total(sales.map((entry) => entry.activeSoldCostCents));
  const physicalLossCents = total(sales.map((entry) => entry.physicalLossCents))
    + total((session.finishedWastes ?? []).map((entry) => entry.costCents))
    + total(session.inventory.movements.filter((movement) => movement.kind === 'waste')
      .map((movement) => movement.costCents ?? 0));
  const receivedCents = total(sales.map((entry) => entry.receivedCents));
  const refundedCents = total(sales.map((entry) => entry.refundedCents));
  const paidCents = total(purchases.map((entry) => entry.paidCents));
  const supplierRefundedCents = total(purchases.map((entry) => entry.refundedCents));
  return { activeRevenueCents, activeSoldCostCents, grossProfitCents: activeRevenueCents - activeSoldCostCents,
    grossMarginPercent: activeRevenueCents > 0
      ? (activeRevenueCents - activeSoldCostCents) / activeRevenueCents * 100 : null,
    physicalLossCents, commercialResultBeforeOtherCostsCents: activeRevenueCents - activeSoldCostCents - physicalLossCents,
    receivedCents, refundedCents, paidCents, supplierRefundedCents,
    receivableCents: total(sales.map((entry) => entry.pendingCents)),
    refundableCents: total(sales.map((entry) => entry.refundableCents)),
    supplierRefundableCents: total(purchases.map((entry) => entry.refundableCents)),
    payableCents: total(purchases.map((entry) => entry.pendingCents)),
    simulatedCashFlowCents: receivedCents - refundedCents + supplierRefundedCents - paidCents };
}
