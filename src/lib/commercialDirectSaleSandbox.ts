import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { exitStock, stockBalance } from './commercialInventory';
import { sandboxStockBook } from './commercialInventorySandbox';
import type { SandboxProductionSession } from './commercialProductionSandbox';
import type { SandboxSale } from './commercialSaleSandbox';
import { parseDecimalInput, toCents } from './storage';

/** Converts user input only after the shared money parser has checked decimal precision. */
export function parseDirectSaleUnitPrice(raw: string): number | null {
  const parsed = parseDecimalInput(raw);
  if (parsed.error || parsed.value === null || parsed.value <= 0) return null;
  const cents = toCents(parsed.value);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export interface SandboxDirectSaleRequest { id: string; itemId: string; units: number; unitPriceCents: number }

export function previewSandboxDirectSale(session: SandboxProductionSession, request: SandboxDirectSaleRequest) {
  const issues: string[] = [];
  const item = session.inventory.items.find((candidate) => candidate.id === request.itemId);
  if (!request.id.trim()) issues.push('Falta el identificador de la venta.');
  if (!item) issues.push('Artículo inexistente.');
  else if (item.unit !== 'unit') issues.push('La venta directa de prueba admite artículos por unidad.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  if (!Number.isSafeInteger(request.unitPriceCents) || request.unitPriceCents <= 0) issues.push('Ingresá un precio unitario válido.');
  const available = item ? stockBalance(sandboxStockBook(session.inventory), item.id).quantity : 0;
  if (issues.length) return { valid: false, issues, item: item ?? null, available, remaining: null, totals: null };
  try {
    const book = exitStock(sandboxStockBook(session.inventory), { id: `${request.id}:item`, itemId: request.itemId,
      kind: 'sale', quantity: request.units, unit: 'unit' });
    const totalCostCents = book.movements.at(-1)!.costCents;
    const revenue = BigInt(request.unitPriceCents) * BigInt(request.units);
    if (revenue > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El importe supera la precisión monetaria admitida.');
    const revenueCents = Number(revenue);
    const grossProfitCents = revenueCents - totalCostCents;
    if (!Number.isSafeInteger(grossProfitCents)) throw new Error('El resultado supera la precisión monetaria admitida.');
    return { valid: true, issues, item: item!, available, remaining: available - request.units,
      totals: { unitPriceCents: request.unitPriceCents, revenueCents, ingredientCostCents: totalCostCents,
        directCostCents: 0, totalCostCents, grossProfitCents, grossMarginPercent: grossProfitCents / revenueCents * 100 } };
  } catch (cause) { return { valid: false, issues: [cause instanceof Error ? cause.message : 'Venta inválida.'],
    item: item!, available, remaining: null, totals: null }; }
}

export function confirmSandboxDirectSale(session: SandboxProductionSession, request: SandboxDirectSaleRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; sale: SandboxSale }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const previous = session.sales.find((sale) => sale.id === request.id);
  if (previous) return previous.source === 'direct' && previous.itemId === request.itemId
    && previous.units === request.units && previous.unitPriceCents === request.unitPriceCents
    ? { status: 'already_confirmed', session, sale: previous }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra venta.'] };
  if (session.productions?.some((production) => production.id === request.id)
    || session.finishedWastes?.some((waste) => waste.id === request.id)
    || session.saleCorrections?.some((adjustment) => adjustment.id === request.id)) {
    return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  }
  const preview = previewSandboxDirectSale(session, request);
  if (!preview.valid || !preview.item || !preview.totals) return { status: 'blocked', session, issues: preview.issues };
  const book = exitStock(sandboxStockBook(session.inventory), { id: `${request.id}:item`, itemId: request.itemId,
    kind: 'sale', quantity: request.units, unit: 'unit' });
  const movement = book.movements.at(-1)!;
  const inventory: CommercialSet = { ...session.inventory,
    operations: [...session.inventory.operations, { id: request.id, kind: 'sale', status: 'closed',
      effectiveOrder: String(session.inventory.operations.length + 1).padStart(12, '0') }],
    movements: [...session.inventory.movements, { ...movement, operationId: request.id }] };
  const validation = validateCommercialSet(inventory);
  if (!validation.valid) return { status: 'blocked', session,
    issues: validation.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
  const sale: SandboxSale = { id: request.id, operationId: request.id, source: 'direct',
    itemId: request.itemId, recipeId: '', recipeName: preview.item.name, recipeSnapshot: null,
    units: request.units, ...preview.totals, ingredients: [] };
  return { status: 'confirmed', session: { ...session, inventory, sales: [...session.sales, sale] }, sale };
}
