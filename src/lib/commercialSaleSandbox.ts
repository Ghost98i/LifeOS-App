import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { exitStock, stockBalance, type StockUnit } from './commercialInventory';
import { sandboxStockBook } from './commercialInventorySandbox';
import type { SandboxRecipe } from './commercialRecipeSandbox';

export interface SandboxSaleIngredient {
  itemId: string;
  name: string;
  quantity: number;
  unit: StockUnit;
  available: number;
  remaining: number;
  historicalCostCents: number;
}

/** Session-only sale; its source determines which stock is consumed exactly once. */
export interface SandboxSale {
  id: string;
  operationId: string;
  source: 'made_to_order' | 'prepared' | 'direct';
  /** Set only for direct sales; a direct article does not acquire a recipe. */
  itemId?: string;
  recipeId: string;
  recipeName: string;
  recipeSnapshot: SandboxRecipe | null;
  units: number;
  unitPriceCents: number;
  revenueCents: number;
  ingredientCostCents: number;
  directCostCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  grossMarginPercent: number;
  ingredients: SandboxSaleIngredient[];
}

export interface SandboxSaleSession { inventory: CommercialSet; sales: SandboxSale[] }
export interface SandboxSaleRequest { id: string; recipe: SandboxRecipe; units: number }
export interface SandboxSalePreview {
  valid: boolean;
  issues: string[];
  ingredients: Array<Omit<SandboxSaleIngredient, 'historicalCostCents' | 'remaining'> & { remaining: number | null; historicalCostCents: number | null }>;
  totals: Omit<SandboxSale, 'id' | 'operationId' | 'source' | 'recipeId' | 'recipeName' | 'recipeSnapshot' | 'units' | 'ingredients'> | null;
}
export type SandboxSaleConfirmation =
  | { status: 'confirmed' | 'already_confirmed'; session: SandboxSaleSession; sale: SandboxSale }
  | { status: 'blocked'; session: SandboxSaleSession; issues: string[] };

function multiplyCents(cents: number, units: number): number {
  const result = BigInt(cents) * BigInt(units);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El importe supera la precisión monetaria admitida.');
  return Number(result);
}

function addCents(first: number, second: number): number {
  const result = first + second;
  if (!Number.isSafeInteger(result)) throw new Error('El costo supera la precisión monetaria admitida.');
  return result;
}

export function previewSandboxSale(inventory: CommercialSet, request: SandboxSaleRequest): SandboxSalePreview {
  const issues: string[] = [];
  const ingredients: SandboxSalePreview['ingredients'] = [];
  if (!request.id.trim()) issues.push('Falta el identificador de la venta.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) issues.push('Ingresá una cantidad entera mayor que cero.');
  if (!request.recipe.ingredients.length) issues.push('La receta no tiene ingredientes.');
  if (new Set(request.recipe.ingredients.map((ingredient) => ingredient.itemId)).size !== request.recipe.ingredients.length) issues.push('La receta contiene insumos duplicados.');
  if (request.recipe.salePriceCents == null || !Number.isSafeInteger(request.recipe.salePriceCents) || request.recipe.salePriceCents <= 0) issues.push('Definí un precio de venta válido para la receta.');
  if (!Number.isSafeInteger(request.recipe.directCostCents) || request.recipe.directCostCents < 0) issues.push('Los costos directos no son válidos.');
  if (!Number.isSafeInteger(request.units) || request.units <= 0) return { valid: false, issues, ingredients, totals: null };

  let book = sandboxStockBook(inventory);
  let ingredientCostCents = 0;
  for (const [index, ingredient] of request.recipe.ingredients.entries()) {
    const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
    if (!item) { issues.push(`Insumo faltante: ${ingredient.itemId}.`); continue; }
    const quantity = ingredient.quantity * request.units;
    try {
      const available = stockBalance(book, item.id, ingredient.unit).quantity;
      const next = exitStock(book, { id: `${request.id}:ingredient:${index}`, itemId: item.id,
        kind: 'consumption', quantity, unit: ingredient.unit });
      const movement = next.movements[next.movements.length - 1];
      ingredientCostCents = addCents(ingredientCostCents, movement.costCents);
      ingredients.push({ itemId: item.id, name: item.name, quantity, unit: ingredient.unit,
        available, remaining: stockBalance(next, item.id, ingredient.unit).quantity,
        historicalCostCents: movement.costCents });
      book = next;
    } catch (cause) {
      let available = 0;
      try { available = stockBalance(book, item.id, ingredient.unit).quantity; } catch { /* The engine error below names the incompatible unit. */ }
      ingredients.push({ itemId: item.id, name: item.name, quantity, unit: ingredient.unit, available,
        remaining: null, historicalCostCents: null });
      issues.push(`${item.name}: ${cause instanceof Error ? cause.message : 'No se pudo valorar el insumo.'}`);
    }
  }
  if (issues.length) return { valid: false, issues, ingredients, totals: null };
  try {
    const unitPriceCents = request.recipe.salePriceCents!;
    const revenueCents = multiplyCents(unitPriceCents, request.units);
    const directCostCents = multiplyCents(request.recipe.directCostCents, request.units);
    const totalCostCents = addCents(ingredientCostCents, directCostCents);
    const grossProfitCents = revenueCents - totalCostCents;
    if (!Number.isSafeInteger(grossProfitCents)) throw new Error('El resultado supera la precisión monetaria admitida.');
    return { valid: true, issues: [], ingredients,
      totals: { unitPriceCents, revenueCents, ingredientCostCents, directCostCents, totalCostCents,
        grossProfitCents, grossMarginPercent: grossProfitCents / revenueCents * 100 } };
  } catch (cause) {
    return { valid: false, issues: [cause instanceof Error ? cause.message : 'Importe inválido.'], ingredients, totals: null };
  }
}

export function confirmSandboxSale(session: SandboxSaleSession, request: SandboxSaleRequest): SandboxSaleConfirmation {
  const previous = session.sales.find((sale) => sale.id === request.id);
  if (previous) {
    return previous.source === 'made_to_order' && previous.units === request.units && JSON.stringify(previous.recipeSnapshot) === JSON.stringify(request.recipe)
      ? { status: 'already_confirmed', session, sale: previous }
      : { status: 'blocked', session, issues: ['El identificador ya corresponde a otra venta simulada.'] };
  }
  const preview = previewSandboxSale(session.inventory, request);
  if (!preview.valid || !preview.totals) return { status: 'blocked', session, issues: preview.issues };
  const order = session.inventory.operations.length + 1;
  const nextInventory: CommercialSet = {
    items: session.inventory.items,
    operations: [...session.inventory.operations, { id: request.id, kind: 'consumption', status: 'closed', effectiveOrder: String(order).padStart(12, '0') }],
    movements: [...session.inventory.movements, ...preview.ingredients.map((ingredient, index) => ({
      id: `${request.id}:ingredient:${index}`, operationId: request.id, itemId: ingredient.itemId,
      kind: 'consumption' as const, quantity: ingredient.quantity, unit: ingredient.unit,
      costCents: ingredient.historicalCostCents!,
    }))],
  };
  const validation = validateCommercialSet(nextInventory);
  if (!validation.valid) return { status: 'blocked', session, issues: validation.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
  const recipeSnapshot: SandboxRecipe = { ...request.recipe,
    ingredients: request.recipe.ingredients.map((ingredient) => ({ ...ingredient })) };
  const sale: SandboxSale = {
    id: request.id, operationId: request.id, source: 'made_to_order', recipeId: request.recipe.id, recipeName: request.recipe.name,
    recipeSnapshot, units: request.units, ...preview.totals,
    ingredients: preview.ingredients.map((ingredient) => ({ ...ingredient, remaining: ingredient.remaining!, historicalCostCents: ingredient.historicalCostCents! })),
  };
  return { status: 'confirmed', session: { ...session, inventory: nextInventory, sales: [...session.sales, sale] }, sale };
}
