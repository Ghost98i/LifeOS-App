import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { exitStock, receiveStock, stockBalance } from './commercialInventory';
import { emptySandboxInventory, sandboxStockBook } from './commercialInventorySandbox';
import type { SandboxRecipe } from './commercialRecipeSandbox';
import { previewSandboxSale, type SandboxSale, type SandboxSaleIngredient, type SandboxSaleSession } from './commercialSaleSandbox';

export interface SandboxProduction {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeSnapshot: SandboxRecipe;
  units: number;
  ingredients: SandboxSaleIngredient[];
  ingredientCostCents: number;
  directCostCents: number;
  totalCostCents: number;
}

/** Historical loss of finished units, separate from a sale and from cash movements. */
export interface SandboxFinishedWaste {
  id: string;
  recipeId: string;
  recipeName: string;
  units: number;
  costCents: number;
}

export interface SandboxProductionSession extends SandboxSaleSession {
  /** Separate stock book: finished units are received on production and exited on prepared sales. */
  finished?: CommercialSet;
  productions?: SandboxProduction[];
  finishedWastes?: SandboxFinishedWaste[];
  saleCorrections?: import('./commercialCorrectionSandbox').SandboxPreparedSaleCorrection[];
  /** Temporary economic simulation only; never serialized into resale.commercial. */
  purchases?: import('./commercialMoneySandbox').SandboxPurchase[];
  moneyEvents?: import('./commercialMoneySandbox').SandboxMoneyEvent[];
}

export interface SandboxProductionRequest { id: string; recipe: SandboxRecipe; units: number }
export type SandboxPreparedSaleRequest = SandboxProductionRequest;
export interface SandboxFinishedWasteRequest { id: string; recipeId: string; recipeName: string; units: number }

const copyRecipe = (recipe: SandboxRecipe): SandboxRecipe => ({ ...recipe,
  ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })) });
export const finishedId = (recipeId: string) => `finished:${recipeId}`;
const orderFor = (set: CommercialSet) => String(set.operations.length + 1).padStart(12, '0');
const issuesFor = (set: CommercialSet) => validateCommercialSet(set).issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`);
const failure = (cause: unknown) => [cause instanceof Error ? cause.message : 'Operación inválida.'];

/** The existing sale preview values ingredient exits without changing stock. Its price is irrelevant to production. */
export function previewSandboxProduction(inventory: CommercialSet, request: SandboxProductionRequest) {
  const preview = previewSandboxSale(inventory, { ...request, recipe: { ...request.recipe, salePriceCents: 1 } });
  return { valid: preview.valid, issues: preview.issues, ingredients: preview.ingredients,
    ingredientCostCents: preview.totals?.ingredientCostCents ?? null,
    directCostCents: preview.totals?.directCostCents ?? null,
    totalCostCents: preview.totals?.totalCostCents ?? null };
}

export function finishedStock(session: SandboxProductionSession, recipeId: string) {
  const set = session.finished ?? emptySandboxInventory();
  const item = set.items.find((candidate) => candidate.id === finishedId(recipeId));
  return item ? stockBalance(sandboxStockBook(set), item.id) : { quantity: 0, unit: 'unit' as const, valueCents: 0, averageUnitCost: 0 };
}

export function confirmSandboxProduction(session: SandboxProductionSession, request: SandboxProductionRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; production: SandboxProduction }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const previous = session.productions?.find((production) => production.id === request.id);
  if (previous) return previous.units === request.units && JSON.stringify(previous.recipeSnapshot) === JSON.stringify(request.recipe)
    ? { status: 'already_confirmed', session, production: previous }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra producción.'] };
  if (session.sales.some((sale) => sale.id === request.id)) return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  const preview = previewSandboxProduction(session.inventory, request);
  if (!preview.valid || preview.totalCostCents == null || preview.ingredientCostCents == null || preview.directCostCents == null) {
    return { status: 'blocked', session, issues: preview.issues };
  }
  const ingredients = preview.ingredients.map((ingredient) => ({ ...ingredient,
    remaining: ingredient.remaining!, historicalCostCents: ingredient.historicalCostCents! }));
  const inventory: CommercialSet = { ...session.inventory,
    operations: [...session.inventory.operations, { id: request.id, kind: 'consumption', status: 'closed', effectiveOrder: orderFor(session.inventory) }],
    movements: [...session.inventory.movements, ...ingredients.map((ingredient, index) => ({
      id: `${request.id}:ingredient:${index}`, operationId: request.id, itemId: ingredient.itemId,
      kind: 'consumption' as const, quantity: ingredient.quantity, unit: ingredient.unit,
      costCents: ingredient.historicalCostCents }))] };
  const inventoryIssues = issuesFor(inventory);
  if (inventoryIssues.length) return { status: 'blocked', session, issues: inventoryIssues };

  const previousFinished = session.finished ?? emptySandboxInventory();
  const itemId = finishedId(request.recipe.id);
  const items = previousFinished.items.some((item) => item.id === itemId) ? previousFinished.items
    : [...previousFinished.items, { id: itemId, name: request.recipe.name, unit: 'unit' as const }];
  try {
    // The commercial engine assigns the moving-average cost of later prepared sales.
    const book = receiveStock(sandboxStockBook({ ...previousFinished, items }), {
      id: `${request.id}:finished`, itemId, quantity: request.units, unit: 'unit', totalCost: preview.totalCostCents / 100 });
    const movement = book.movements[book.movements.length - 1];
    const finished: CommercialSet = { items,
      operations: [...previousFinished.operations, { id: request.id, kind: 'receipt', status: 'closed', effectiveOrder: orderFor(previousFinished) }],
      movements: [...previousFinished.movements, { ...movement, operationId: request.id }] };
    const finishedIssues = issuesFor(finished);
    if (finishedIssues.length) return { status: 'blocked', session, issues: finishedIssues };
    const production: SandboxProduction = { id: request.id, recipeId: request.recipe.id,
      recipeName: request.recipe.name, recipeSnapshot: copyRecipe(request.recipe), units: request.units,
      ingredients, ingredientCostCents: preview.ingredientCostCents, directCostCents: preview.directCostCents,
      totalCostCents: preview.totalCostCents };
    return { status: 'confirmed', production, session: { ...session, inventory, finished,
      productions: [...(session.productions ?? []), production] } };
  } catch (cause) { return { status: 'blocked', session, issues: failure(cause) }; }
}

export function previewSandboxPreparedSale(session: SandboxProductionSession, request: SandboxPreparedSaleRequest) {
  const issues: string[] = [];
  if (!request.id.trim()) issues.push('Falta el identificador de la venta.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  const price = request.recipe.salePriceCents;
  if (price == null || !Number.isSafeInteger(price) || price <= 0) issues.push('Definí un precio de venta válido.');
  const balance = finishedStock(session, request.recipe.id);
  if (issues.length) return { valid: false, issues, available: balance.quantity, remaining: null, totals: null };
  try {
    const set = session.finished ?? emptySandboxInventory();
    const book = exitStock(sandboxStockBook(set), { id: `${request.id}:finished`, itemId: finishedId(request.recipe.id),
      kind: 'sale', quantity: request.units, unit: 'unit' });
    const totalCostCents = book.movements[book.movements.length - 1].costCents;
    const revenue = BigInt(price!) * BigInt(request.units);
    if (revenue > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El importe supera la precisión monetaria admitida.');
    const revenueCents = Number(revenue);
    const grossProfitCents = revenueCents - totalCostCents;
    if (!Number.isSafeInteger(grossProfitCents)) throw new Error('El resultado supera la precisión monetaria admitida.');
    return { valid: true, issues, available: balance.quantity, remaining: balance.quantity - request.units,
      totals: { unitPriceCents: price!, revenueCents, ingredientCostCents: totalCostCents,
        directCostCents: 0, totalCostCents, grossProfitCents, grossMarginPercent: grossProfitCents / revenueCents * 100 } };
  } catch (cause) { return { valid: false, issues: failure(cause), available: balance.quantity, remaining: null, totals: null }; }
}

export function confirmSandboxPreparedSale(session: SandboxProductionSession, request: SandboxPreparedSaleRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; sale: SandboxSale }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const previous = session.sales.find((sale) => sale.id === request.id);
  if (previous) return previous.source === 'prepared' && previous.units === request.units
    && JSON.stringify(previous.recipeSnapshot) === JSON.stringify(request.recipe)
    ? { status: 'already_confirmed', session, sale: previous }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra venta.'] };
  if (session.productions?.some((production) => production.id === request.id)) return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  const preview = previewSandboxPreparedSale(session, request);
  if (!preview.valid || !preview.totals) return { status: 'blocked', session, issues: preview.issues };
  const set = session.finished ?? emptySandboxInventory();
  try {
    const book = exitStock(sandboxStockBook(set), { id: `${request.id}:finished`, itemId: finishedId(request.recipe.id),
      kind: 'sale', quantity: request.units, unit: 'unit' });
    const movement = book.movements[book.movements.length - 1];
    const finished: CommercialSet = { ...set,
      operations: [...set.operations, { id: request.id, kind: 'sale', status: 'closed', effectiveOrder: orderFor(set) }],
      movements: [...set.movements, { ...movement, operationId: request.id }] };
    const issues = issuesFor(finished);
    if (issues.length) return { status: 'blocked', session, issues };
    const sale: SandboxSale = { id: request.id, operationId: request.id, source: 'prepared',
      recipeId: request.recipe.id, recipeName: request.recipe.name, recipeSnapshot: copyRecipe(request.recipe),
      units: request.units, ...preview.totals, ingredients: [] };
    return { status: 'confirmed', sale, session: { ...session, finished, sales: [...session.sales, sale] } };
  } catch (cause) { return { status: 'blocked', session, issues: failure(cause) }; }
}

export function previewSandboxFinishedWaste(session: SandboxProductionSession, request: SandboxFinishedWasteRequest) {
  const issues: string[] = [];
  if (!request.id.trim()) issues.push('Falta el identificador de la pérdida.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  const balance = finishedStock(session, request.recipeId);
  if (issues.length) return { valid: false, issues, available: balance.quantity, remaining: null, costCents: null };
  try {
    const set = session.finished ?? emptySandboxInventory();
    const book = exitStock(sandboxStockBook(set), { id: `${request.id}:finished`, itemId: finishedId(request.recipeId),
      kind: 'waste', quantity: request.units, unit: 'unit' });
    return { valid: true, issues, available: balance.quantity, remaining: balance.quantity - request.units,
      costCents: book.movements[book.movements.length - 1].costCents };
  } catch (cause) { return { valid: false, issues: failure(cause), available: balance.quantity, remaining: null, costCents: null }; }
}

export function confirmSandboxFinishedWaste(session: SandboxProductionSession, request: SandboxFinishedWasteRequest):
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxProductionSession; waste: SandboxFinishedWaste }
  | { status: 'blocked'; session: SandboxProductionSession; issues: string[] } {
  const previous = session.finishedWastes?.find((waste) => waste.id === request.id);
  if (previous) return previous.recipeId === request.recipeId && previous.recipeName === request.recipeName && previous.units === request.units
    ? { status: 'already_confirmed', session, waste: previous }
    : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra pérdida.'] };
  if (session.sales.some((sale) => sale.id === request.id) || session.productions?.some((production) => production.id === request.id)) {
    return { status: 'blocked', session, issues: ['El identificador ya está en uso.'] };
  }
  const preview = previewSandboxFinishedWaste(session, request);
  if (!preview.valid || preview.costCents == null) return { status: 'blocked', session, issues: preview.issues };
  const set = session.finished ?? emptySandboxInventory();
  try {
    const book = exitStock(sandboxStockBook(set), { id: `${request.id}:finished`, itemId: finishedId(request.recipeId),
      kind: 'waste', quantity: request.units, unit: 'unit' });
    const movement = book.movements[book.movements.length - 1];
    const finished: CommercialSet = { ...set,
      operations: [...set.operations, { id: request.id, kind: 'waste', status: 'closed', effectiveOrder: orderFor(set) }],
      movements: [...set.movements, { ...movement, operationId: request.id }] };
    const issues = issuesFor(finished);
    if (issues.length) return { status: 'blocked', session, issues };
    const waste: SandboxFinishedWaste = { id: request.id, recipeId: request.recipeId,
      recipeName: request.recipeName, units: request.units, costCents: movement.costCents };
    return { status: 'confirmed', waste, session: { ...session, finished,
      finishedWastes: [...(session.finishedWastes ?? []), waste] } };
  } catch (cause) { return { status: 'blocked', session, issues: failure(cause) }; }
}
