import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { exitStock, receiveStock, stockBalance } from './commercialInventory';
import { emptySandboxInventory, sandboxStockBook } from './commercialInventorySandbox';
import { finishedId, finishedStock, type SandboxProductionSession } from './commercialProductionSandbox';
import type { SandboxPurchaseCorrection, SandboxMoneySession } from './commercialMoneySandbox';

export const preparedSaleCorrectionReason = 'registro_erroneo_no_entregado' as const;

export interface SandboxPreparedSaleCorrection {
  id: string;
  saleId: string;
  recipeId: string;
  units: number;
  reason: typeof preparedSaleCorrectionReason | 'devolucion_reutilizable' | 'devolucion_no_reutilizable' | 'ajuste_comercial_no_entregado';
  kind?: 'correction' | 'return';
  disposition?: 'restock' | 'discard' | 'retain_consumed';
  itemId?: string;
  /** Portion of frozen cost retained as physical loss; not a second expense. */
  physicalLossCostCents?: number;
  effectiveOrder: string;
  unitPriceCents: number;
  revenueReversalCents: number;
  costCents: number;
  grossProfitReversalCents: number;
}

export interface SandboxPreparedSaleCorrectionRequest {
  id: string;
  saleId: string;
  units: number;
  /** The user confirms that these units were never delivered and remain fit for sale. */
  confirmedUndelivered: boolean;
}

const safeProduct = (a: number, b: number): number | null => {
  const result = BigInt(a) * BigInt(b);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
};

function allocatedCostFor(totalCostCents: number, totalUnits: number, cumulativeUnits: number, previousCostCents: number): number {
  // Half-up cumulative allocation: all partial adjustments sum exactly to the frozen sale cost.
  return Number((BigInt(totalCostCents) * BigInt(cumulativeUnits) + BigInt(totalUnits) / 2n) / BigInt(totalUnits)) - previousCostCents;
}

export function previewSandboxPreparedSaleCorrection(session: SandboxProductionSession, request: SandboxPreparedSaleCorrectionRequest) {
  const issues: string[] = [];
  const sale = session.sales.find((candidate) => candidate.id === request.saleId);
  if (!request.id.trim()) issues.push('Falta el identificador de la corrección.');
  if (!sale) issues.push('Venta original inexistente.');
  else if (sale.source !== 'prepared') issues.push('La venta al momento no admite restitución automática de ingredientes.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  if (!request.confirmedUndelivered) issues.push('Confirmá que las unidades no fueron entregadas y siguen aptas para vender.');
  const previous = session.saleCorrections?.filter((correction) => correction.saleId === request.saleId) ?? [];
  const correctedUnits = previous.reduce((sum, correction) => sum + correction.units, 0);
  const correctedCostCents = previous.reduce((sum, correction) => sum + correction.costCents, 0);
  const remainingUnits = sale ? sale.units - correctedUnits : 0;
  if (sale && request.units > remainingUnits) issues.push(`Solo quedan ${remainingUnits} unidades de esta venta por corregir.`);
  // Show the commercial effect before the user checks the delivery confirmation.
  const cannotProject = !sale || sale.source !== 'prepared' || !Number.isSafeInteger(request.units)
    || request.units <= 0 || request.units > remainingUnits;
  if (cannotProject) return { valid: false, issues,
    original: sale ?? null, correctedUnits, remainingUnits, stockAvailable: sale ? finishedStock(session, sale.recipeId).quantity : 0,
    stockAfter: null, revenueReversalCents: null, costCents: null, grossProfitReversalCents: null,
    currentRevenueCents: null, currentCostCents: null, currentGrossProfitCents: null };

  // Cumulative half-up allocation makes partial corrections sum exactly to the frozen sale cost.
  const cumulativeUnits = correctedUnits + request.units;
  const costCents = allocatedCostFor(sale.totalCostCents, sale.units, cumulativeUnits, correctedCostCents);
  const revenueReversalCents = safeProduct(sale.unitPriceCents, request.units);
  const currentRevenueCents = safeProduct(sale.unitPriceCents, sale.units - cumulativeUnits);
  if (revenueReversalCents == null || currentRevenueCents == null || !Number.isSafeInteger(costCents) || costCents < 0) {
    return { valid: false, issues: ['El importe supera la precisión monetaria admitida.'], original: sale,
      correctedUnits, remainingUnits, stockAvailable: finishedStock(session, sale.recipeId).quantity,
      stockAfter: null, revenueReversalCents: null, costCents: null, grossProfitReversalCents: null,
      currentRevenueCents: null, currentCostCents: null, currentGrossProfitCents: null };
  }
  const currentCostCents = sale.totalCostCents - correctedCostCents - costCents;
  const grossProfitReversalCents = revenueReversalCents - costCents;
  const currentGrossProfitCents = currentRevenueCents - currentCostCents;
  const stockAvailable = finishedStock(session, sale.recipeId).quantity;
  if (![currentCostCents, grossProfitReversalCents, currentGrossProfitCents].every(Number.isSafeInteger) || currentCostCents < 0) {
    issues.push('El resultado supera la precisión monetaria admitida.');
  }
  return { valid: issues.length === 0, issues, original: sale, correctedUnits, remainingUnits,
    stockAvailable, stockAfter: stockAvailable + request.units, revenueReversalCents, costCents,
    grossProfitReversalCents, currentRevenueCents, currentCostCents, currentGrossProfitCents };
}

export function confirmSandboxPreparedSaleCorrection(session: SandboxProductionSession, request: SandboxPreparedSaleCorrectionRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; correction: SandboxPreparedSaleCorrection }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const prior = session.saleCorrections?.find((correction) => correction.id === request.id);
  if (prior) return request.confirmedUndelivered && prior.saleId === request.saleId && prior.units === request.units
    && (prior.kind ?? 'correction') === 'correction' && (prior.disposition ?? 'restock') === 'restock'
    ? { status: 'already_confirmed', session, correction: prior }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra corrección.'] };
  const set = session.finished ?? emptySandboxInventory();
  if (session.sales.some((sale) => sale.id === request.id)
    || session.productions?.some((production) => production.id === request.id)
    || session.finishedWastes?.some((waste) => waste.id === request.id)
    || set.operations.some((operation) => operation.id === request.id)) {
    return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  }
  const preview = previewSandboxPreparedSaleCorrection(session, request);
  if (!preview.valid || !preview.original || preview.costCents == null || preview.revenueReversalCents == null
    || preview.grossProfitReversalCents == null) return { status: 'blocked', session, issues: preview.issues };
  try {
    const itemId = finishedId(preview.original.recipeId);
    const book = receiveStock(sandboxStockBook(set), { id: `${request.id}:finished`, itemId,
      quantity: request.units, unit: 'unit', totalCost: preview.costCents / 100 });
    const movement = book.movements[book.movements.length - 1];
    const effectiveOrder = String(set.operations.length + 1).padStart(12, '0');
    const finished: CommercialSet = { ...set,
      operations: [...set.operations, { id: request.id, kind: 'receipt', status: 'closed', effectiveOrder }],
      movements: [...set.movements, { ...movement, operationId: request.id }] };
    const validation = validateCommercialSet(finished);
    if (!validation.valid) return { status: 'blocked', session,
      issues: validation.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
    const correction: SandboxPreparedSaleCorrection = { id: request.id, saleId: request.saleId,
      recipeId: preview.original.recipeId, units: request.units, reason: preparedSaleCorrectionReason,
      kind: 'correction', disposition: 'restock', physicalLossCostCents: 0,
      effectiveOrder, unitPriceCents: preview.original.unitPriceCents,
      revenueReversalCents: preview.revenueReversalCents, costCents: preview.costCents,
      grossProfitReversalCents: preview.grossProfitReversalCents };
    return { status: 'confirmed', session: { ...session, finished,
      saleCorrections: [...(session.saleCorrections ?? []), correction] }, correction };
  } catch (cause) { return { status: 'blocked', session,
    issues: [cause instanceof Error ? cause.message : 'No se pudo restituir el producto terminado.'] }; }
}

export interface SandboxSaleAdjustmentRequest {
  id: string;
  saleId: string;
  units: number;
  kind: 'correction' | 'return';
  /** A returned article is restocked only when explicitly marked fit for sale. */
  disposition: 'restock' | 'discard' | 'retain_consumed';
  confirmedUndelivered?: boolean;
}

const saleStock = (session: SandboxProductionSession, saleId: string) => {
  const sale = session.sales.find((candidate) => candidate.id === saleId);
  if (!sale) return 0;
  if (sale.source === 'prepared') return finishedStock(session, sale.recipeId).quantity;
  if (sale.source === 'direct') {
    const item = session.inventory.items.find((candidate) => candidate.id === sale.itemId);
    return item ? stockBalance(sandboxStockBook(session.inventory), item.id).quantity : 0;
  }
  return 0;
};

export function previewSandboxSaleAdjustment(session: SandboxProductionSession, request: SandboxSaleAdjustmentRequest) {
  const issues: string[] = [];
  const sale = session.sales.find((candidate) => candidate.id === request.saleId);
  if (!request.id.trim()) issues.push('Falta el identificador de la operación.');
  if (!sale) issues.push('Venta original inexistente.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  if (sale) {
    if (request.kind === 'correction') {
      if (!request.confirmedUndelivered) issues.push('Confirmá que las unidades no fueron entregadas.');
      if (sale.source === 'made_to_order' && request.disposition !== 'retain_consumed') issues.push('Los ingredientes utilizados no pueden volver al inventario.');
      if (sale.source !== 'made_to_order' && request.disposition !== 'restock') issues.push('Las unidades no entregadas y aptas deben restituirse al stock.');
    } else if (request.kind === 'return') {
      if (sale.source === 'direct' && !['restock', 'discard'].includes(request.disposition)) issues.push('Indicá si el artículo devuelto puede venderse otra vez.');
      if (sale.source !== 'direct' && request.disposition !== 'discard') issues.push('Una preparación devuelta no vuelve automáticamente al stock vendible.');
    } else issues.push('Tipo de ajuste inválido.');
  }
  const previous = session.saleCorrections?.filter((entry) => entry.saleId === request.saleId) ?? [];
  const adjustedUnits = previous.reduce((sum, entry) => sum + entry.units, 0);
  const previousCost = previous.reduce((sum, entry) => sum + entry.costCents, 0);
  const previousRestockedCost = previous.filter((entry) => (entry.disposition ?? 'restock') === 'restock')
    .reduce((sum, entry) => sum + entry.costCents, 0);
  const remainingUnits = sale ? sale.units - adjustedUnits : 0;
  if (sale && request.units > remainingUnits) issues.push(`Solo quedan ${remainingUnits} unidades de esta venta sin ajustar.`);
  const stockAvailable = sale ? saleStock(session, sale.id) : 0;
  const canProject = sale && Number.isSafeInteger(request.units) && request.units > 0 && request.units <= remainingUnits;
  if (!canProject) return { valid: false, issues, original: sale ?? null, remainingUnits, stockAvailable,
    stockAfter: null, revenueReversalCents: null, costCents: null, physicalLossCostCents: null,
    currentRevenueCents: null, currentSoldCostCents: null, totalPhysicalLossCents: null,
    grossProfitOnActiveSalesCents: null, commercialResultCents: null };
  const costCents = allocatedCostFor(sale.totalCostCents, sale.units, adjustedUnits + request.units, previousCost);
  const revenueReversalCents = safeProduct(sale.unitPriceCents, request.units);
  const currentRevenueCents = safeProduct(sale.unitPriceCents, remainingUnits - request.units);
  const currentSoldCostCents = sale.totalCostCents - previousCost - costCents;
  const restockedCost = previousRestockedCost + (request.disposition === 'restock' ? costCents : 0);
  const totalPhysicalLossCents = sale.totalCostCents - currentSoldCostCents - restockedCost;
  const grossProfitOnActiveSalesCents = currentRevenueCents == null ? null : currentRevenueCents - currentSoldCostCents;
  const commercialResultCents = grossProfitOnActiveSalesCents == null ? null : grossProfitOnActiveSalesCents - totalPhysicalLossCents;
  if (revenueReversalCents == null || currentRevenueCents == null || ![costCents, currentSoldCostCents,
    totalPhysicalLossCents, grossProfitOnActiveSalesCents, commercialResultCents].every(Number.isSafeInteger)
    || costCents < 0 || currentSoldCostCents < 0 || totalPhysicalLossCents < 0) issues.push('El importe supera la precisión monetaria admitida.');
  return { valid: issues.length === 0, issues, original: sale, remainingUnits, stockAvailable,
    stockAfter: request.disposition === 'restock' ? stockAvailable + request.units : stockAvailable,
    revenueReversalCents, costCents, physicalLossCostCents: request.disposition === 'restock' ? 0 : costCents,
    currentRevenueCents, currentSoldCostCents, totalPhysicalLossCents,
    grossProfitOnActiveSalesCents, commercialResultCents };
}

export function confirmSandboxSaleAdjustment(session: SandboxProductionSession, request: SandboxSaleAdjustmentRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; adjustment: SandboxPreparedSaleCorrection }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const prior = session.saleCorrections?.find((entry) => entry.id === request.id);
  if (prior) return prior.saleId === request.saleId && prior.units === request.units
    && (prior.kind ?? 'correction') === request.kind && (prior.disposition ?? 'restock') === request.disposition
    && (request.kind === 'return' || request.confirmedUndelivered)
    ? { status: 'already_confirmed', session, adjustment: prior }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otro ajuste.'] };
  if (session.sales.some((sale) => sale.id === request.id) || session.productions?.some((entry) => entry.id === request.id)
    || session.finishedWastes?.some((entry) => entry.id === request.id)
    || session.inventory.operations.some((entry) => entry.id === request.id)
    || session.finished?.operations.some((entry) => entry.id === request.id)) {
    return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  }
  const preview = previewSandboxSaleAdjustment(session, request);
  if (!preview.valid || !preview.original || preview.costCents == null || preview.revenueReversalCents == null) {
    return { status: 'blocked', session, issues: preview.issues };
  }
  const sale = preview.original;
  let inventory = session.inventory;
  let finished = session.finished;
  let effectiveOrder = String(session.inventory.operations.length + (finished?.operations.length ?? 0)
    + (session.saleCorrections?.length ?? 0) + 1).padStart(12, '0');
  if (request.disposition === 'restock') {
    const isDirect = sale.source === 'direct';
    const set = isDirect ? inventory : finished ?? emptySandboxInventory();
    const itemId = isDirect ? sale.itemId! : finishedId(sale.recipeId);
    try {
      const book = receiveStock(sandboxStockBook(set), { id: `${request.id}:restock`, itemId,
        quantity: request.units, unit: 'unit', totalCost: preview.costCents / 100 });
      const movement = book.movements.at(-1)!;
      effectiveOrder = String(set.operations.length + 1).padStart(12, '0');
      const next: CommercialSet = { ...set,
        operations: [...set.operations, { id: request.id, kind: 'receipt', status: 'closed', effectiveOrder }],
        movements: [...set.movements, { ...movement, operationId: request.id }] };
      const validation = validateCommercialSet(next);
      if (!validation.valid) return { status: 'blocked', session,
        issues: validation.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
      if (isDirect) inventory = next;
      else finished = next;
    } catch (cause) { return { status: 'blocked', session,
      issues: [cause instanceof Error ? cause.message : 'No se pudo restituir el stock.'] }; }
  }
  const reason = request.kind === 'correction'
    ? sale.source === 'made_to_order' ? 'ajuste_comercial_no_entregado' : preparedSaleCorrectionReason
    : request.disposition === 'restock' ? 'devolucion_reutilizable' : 'devolucion_no_reutilizable';
  const adjustment: SandboxPreparedSaleCorrection = { id: request.id, saleId: sale.id,
    recipeId: sale.recipeId, ...(sale.itemId ? { itemId: sale.itemId } : {}),
    units: request.units, kind: request.kind, disposition: request.disposition, reason, effectiveOrder,
    unitPriceCents: sale.unitPriceCents, revenueReversalCents: preview.revenueReversalCents,
    costCents: preview.costCents,
    physicalLossCostCents: request.disposition === 'restock' ? 0 : preview.costCents,
    grossProfitReversalCents: preview.revenueReversalCents - (request.disposition === 'restock' ? preview.costCents : 0) };
  return { status: 'confirmed', session: { ...session, inventory, finished,
    saleCorrections: [...(session.saleCorrections ?? []), adjustment] }, adjustment };
}

export interface SandboxPurchaseAdjustmentRequest {
  id: string;
  purchaseId: string;
  units: number;
  kind: 'annulment' | 'return';
}

export function confirmSandboxPurchaseAdjustment(
  session: SandboxMoneySession,
  request: SandboxPurchaseAdjustmentRequest
):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxMoneySession; adjustment: SandboxPurchaseCorrection }
  | { status: 'blocked'; session: SandboxMoneySession; issues: string[] } {
  const prior = session.purchaseCorrections?.find((entry) => entry.id === request.id);
  if (prior) {
    return prior.purchaseId === request.purchaseId && prior.units === request.units && prior.kind === request.kind
      ? { status: 'already_confirmed', session, adjustment: prior }
      : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra corrección de compra.'] };
  }
  const purchase = session.purchases?.find((entry) => entry.id === request.purchaseId);
  if (!purchase) return { status: 'blocked', session, issues: ['Compra inexistente.'] };
  const purchaseMovement = session.inventory.movements.find((m) => m.operationId === purchase.id && m.kind === 'receipt');
  if (!purchaseMovement) return { status: 'blocked', session, issues: ['Movimiento de compra no encontrado en inventario.'] };
  const previousAdjustments = session.purchaseCorrections?.filter((entry) => entry.purchaseId === request.purchaseId) ?? [];
  const alreadyAdjustedUnits = previousAdjustments.reduce((sum, entry) => sum + entry.units, 0);
  const remainingUnits = purchaseMovement.quantity - alreadyAdjustedUnits;
  if (remainingUnits <= 0) return { status: 'blocked', session, issues: ['La compra ya fue totalmente anulada o devuelta.'] };
  if (!Number.isSafeInteger(request.units) || request.units <= 0 || request.units > remainingUnits) {
    return { status: 'blocked', session, issues: [`La cantidad a devolver debe ser un entero entre 1 y ${remainingUnits}.`] };
  }
  if (request.kind === 'annulment' && request.units !== remainingUnits) {
    return { status: 'blocked', session, issues: ['La anulación de compra debe comprender la totalidad de las unidades restantes.'] };
  }
  const currentStock = stockBalance(sandboxStockBook(session.inventory), purchase.itemId);
  if (currentStock.quantity < request.units) {
    return { status: 'blocked', session, issues: [`Stock insuficiente para devolver (${currentStock.quantity} disponibles, ${request.units} solicitadas).`] };
  }

  const previousCostCents = previousAdjustments.reduce((sum, entry) => sum + entry.costCents, 0);
  const cumulativeUnits = alreadyAdjustedUnits + request.units;
  const costCents = cumulativeUnits === purchaseMovement.quantity
    ? purchase.amountCents - previousCostCents
    : Number((BigInt(purchase.amountCents) * BigInt(Math.round(cumulativeUnits * 1000)) + BigInt(Math.round(purchaseMovement.quantity * 1000)) / 2n) / BigInt(Math.round(purchaseMovement.quantity * 1000))) - previousCostCents;

  try {
    const book = exitStock(sandboxStockBook(session.inventory), {
      id: `${request.id}:exit`,
      itemId: purchase.itemId,
      kind: 'waste',
      quantity: request.units,
      unit: purchaseMovement.unit,
    });
    const exitMovement = book.movements.at(-1)!;
    const effectiveOrder = String(session.inventory.operations.length + 1).padStart(12, '0');
    const nextInventory: CommercialSet = {
      ...session.inventory,
      operations: [...session.inventory.operations, { id: request.id, kind: 'waste', status: 'closed', effectiveOrder }],
      movements: [...session.inventory.movements, { ...exitMovement, operationId: request.id, costCents: exitMovement.costCents }],
    };
    const validation = validateCommercialSet(nextInventory);
    if (!validation.valid) {
      return { status: 'blocked', session, issues: validation.issues.map((i) => `${i.entity} ${i.id}: ${i.code}`) };
    }
    const adjustment: SandboxPurchaseCorrection = {
      id: request.id,
      purchaseId: purchase.id,
      itemId: purchase.itemId,
      units: request.units,
      unit: purchaseMovement.unit,
      kind: request.kind,
      costCents,
      effectiveOrder,
    };
    return {
      status: 'confirmed',
      adjustment,
      session: {
        ...session,
        inventory: nextInventory,
        purchaseCorrections: [...(session.purchaseCorrections ?? []), adjustment],
      },
    };
  } catch (cause) {
    return { status: 'blocked', session, issues: [cause instanceof Error ? cause.message : 'No se pudo retirar el stock para la devolución.'] };
  }
}
