import { calculateUnitCost, type UnitCostEstimate } from './commercialCostCalculator';
import { exitStock, receiveStock, type StockUnit } from './commercialInventory';
import { sandboxItemSummary } from './commercialInventorySandbox';
import type { CommercialSet } from './commercialContract';
import { fromCents, toCents } from './storage';

export interface SandboxIngredient { itemId: string; quantity: number; unit: StockUnit }
/** A temporary definition only. A future sale must consume either ingredients at sale or previously produced stock, never both, and freeze its cost. Cash collection remains a separate, linked Finance event. */
export interface SandboxRecipe {
  id: string;
  name: string;
  ingredients: SandboxIngredient[];
  directCostCents: number;
  salePriceCents: number | null;
}

function moneyCents(value: number, label: string): number {
  const cents = toCents(value);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents) || Math.abs(value - fromCents(cents)) > 1e-9) {
    throw new Error(`${label}: ingresá un importe válido con hasta dos decimales.`);
  }
  return cents;
}

export function upsertSandboxRecipe(recipes: SandboxRecipe[], inventory: CommercialSet, input: {
  id?: string;
  name: string;
  ingredients: SandboxIngredient[];
  directCost: number;
  salePrice: number | null;
}): SandboxRecipe[] {
  const name = input.name.trim();
  if (!name) throw new Error('Ingresá un nombre para el producto.');
  if (!input.ingredients.length) throw new Error('Agregá al menos un ingrediente.');
  if (new Set(input.ingredients.map((ingredient) => ingredient.itemId)).size !== input.ingredients.length) {
    throw new Error('Cada insumo debe aparecer una sola vez en la receta.');
  }
  for (const ingredient of input.ingredients) {
    const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
    if (!item) throw new Error('La receta referencia un insumo inexistente.');
    // The inventory engine validates quantity precision and dimensional compatibility without consuming stock.
    receiveStock({ items: [item], movements: [] }, { id: 'validation', itemId: item.id,
      quantity: ingredient.quantity, unit: ingredient.unit, totalCost: 0 });
  }
  const directCostCents = moneyCents(input.directCost, 'Costo directo adicional');
  const salePriceCents = input.salePrice == null ? null : moneyCents(input.salePrice, 'Precio de venta');
  if (salePriceCents === 0) throw new Error('El precio de venta debe ser mayor que cero.');
  if (input.id && !recipes.some((recipe) => recipe.id === input.id)) throw new Error('Producto inexistente.');
  const id = input.id || `sandbox-recipe-${recipes.length + 1}`;
  const recipe: SandboxRecipe = { id, name, ingredients: input.ingredients.map((ingredient) => ({ ...ingredient })), directCostCents, salePriceCents };
  return input.id ? recipes.map((current) => current.id === id ? recipe : current) : [...recipes, recipe];
}

function enoughFor(inventory: CommercialSet, ingredient: SandboxIngredient, units: number): boolean {
  const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
  if (!item) return false;
  const balance = sandboxItemSummary(inventory, item.id);
  if (balance.quantity === 0) return false;
  try {
    const book = receiveStock({ items: [item], movements: [] }, { id: 'available', itemId: item.id,
      quantity: balance.quantity, unit: item.unit, totalCost: balance.valueCents / 100 });
    exitStock(book, { id: 'required', itemId: item.id, kind: 'consumption',
      quantity: ingredient.quantity * units, unit: ingredient.unit });
    return true;
  } catch { return false; }
}

export function estimateSandboxRecipe(inventory: CommercialSet, recipe: SandboxRecipe, requestedUnits: number): {
  estimate: UnitCostEstimate | null;
  missingForOne: string[];
  insufficientForRequest: string[];
} {
  if (!Number.isSafeInteger(requestedUnits) || requestedUnits <= 0) throw new Error('La cantidad solicitada debe ser un entero positivo.');
  const missingForOne: string[] = [];
  const insufficientForRequest: string[] = [];
  const components = recipe.ingredients.flatMap((ingredient) => {
    const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
    if (!item) { missingForOne.push('Insumo no disponible'); insufficientForRequest.push('Insumo no disponible'); return []; }
    const balance = sandboxItemSummary(inventory, item.id);
    if (!enoughFor(inventory, ingredient, 1)) missingForOne.push(item.name);
    if (!enoughFor(inventory, ingredient, requestedUnits)) insufficientForRequest.push(item.name);
    if (balance.quantity === 0) return [];
    return [{ name: item.name, purchasedQuantity: balance.quantity, purchasedUnit: item.unit,
      totalCost: balance.valueCents / 100, usedQuantity: ingredient.quantity, usedUnit: ingredient.unit }];
  });
  const estimate = missingForOne.length ? null : calculateUnitCost({ components,
    extraCosts: recipe.directCostCents ? [{ name: 'Otros costos directos', amount: recipe.directCostCents / 100 }] : [],
    salePrice: recipe.salePriceCents == null ? null : recipe.salePriceCents / 100 });
  return { estimate, missingForOne, insufficientForRequest };
}

export function suggestedPriceCents(unitCostCents: number, targetMarginPercent: number): number {
  if (!Number.isSafeInteger(unitCostCents) || unitCostCents <= 0) throw new Error('Costo estimado inválido.');
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) {
    throw new Error('El margen objetivo debe estar entre 0 % y menos de 100 %.');
  }
  const basisPoints = Math.round(targetMarginPercent * 100);
  if (Math.abs(targetMarginPercent * 100 - basisPoints) > 1e-9) throw new Error('El margen objetivo admite hasta dos decimales.');
  const divisor = BigInt(10_000 - basisPoints);
  const result = (BigInt(unitCostCents) * 10_000n + divisor - 1n) / divisor;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El precio sugerido supera la precisión monetaria admitida.');
  return Number(result);
}
