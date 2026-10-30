import { fromCents, toCents } from './storage';

export type StockUnit = 'unit' | 'g' | 'kg';
export type StockExitKind = 'consumption' | 'sale' | 'waste';
export interface StockItem { id: string; name: string; unit: StockUnit }
export interface StockMovement {
  id: string;
  itemId: string;
  kind: 'receipt' | StockExitKind;
  quantity: number;
  unit: StockUnit;
  costCents: number;
}
export interface StockBook { items: StockItem[]; movements: StockMovement[] }
export interface StockBalance { quantity: number; unit: StockUnit; valueCents: number; averageUnitCost: number }

const scale = (unit: StockUnit) => unit === 'kg' ? 1_000_000 : 1_000;
const base = (unit: StockUnit) => unit === 'unit' ? 'unit' : 'g';

function amount(quantity: number, unit: StockUnit): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Cantidad inválida.');
  const scaled = quantity * scale(unit);
  if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new Error('Cantidad fuera de precisión (máximo tres decimales en la unidad base).');
  }
  return Math.round(scaled);
}

function itemFor(book: StockBook, itemId: string, unit: StockUnit): StockItem {
  const item = book.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Artículo inexistente.');
  if (base(item.unit) !== base(unit)) throw new Error('Unidad incompatible.');
  return item;
}

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(toCents(value))) throw new Error('Costo inválido.');
  if (Math.abs(value - fromCents(toCents(value))) > 1e-9) throw new Error('El costo admite dos decimales.');
  return toCents(value);
}

export function stockBalance(book: StockBook, itemId: string, unit?: StockUnit): StockBalance {
  const item = book.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Artículo inexistente.');
  const displayUnit = unit || item.unit;
  itemFor(book, itemId, displayUnit);
  let quantityBase = 0;
  let valueCents = 0;
  for (const movement of book.movements.filter((candidate) => candidate.itemId === itemId)) {
    const quantity = amount(movement.quantity, movement.unit);
    quantityBase += movement.kind === 'receipt' ? quantity : -quantity;
    valueCents += movement.kind === 'receipt' ? movement.costCents : -movement.costCents;
  }
  if (!Number.isSafeInteger(quantityBase) || !Number.isSafeInteger(valueCents) || quantityBase < 0 || valueCents < 0) throw new Error('Inventario inconsistente.');
  return { quantity: quantityBase / scale(displayUnit), unit: displayUnit, valueCents,
    averageUnitCost: quantityBase ? fromCents(valueCents) * scale(displayUnit) / quantityBase : 0 };
}

export function receiveStock(book: StockBook, input: { id: string; itemId: string; quantity: number; unit: StockUnit; totalCost: number }): StockBook {
  itemFor(book, input.itemId, input.unit);
  amount(input.quantity, input.unit);
  if (!input.id || book.movements.some((movement) => movement.id === input.id)) throw new Error('ID de movimiento duplicado o vacío.');
  const movement: StockMovement = { id: input.id, itemId: input.itemId, kind: 'receipt', quantity: input.quantity,
    unit: input.unit, costCents: cents(input.totalCost) };
  return { ...book, movements: [...book.movements, movement] };
}

export function exitStock(book: StockBook, input: { id: string; itemId: string; kind: StockExitKind; quantity: number; unit: StockUnit }): StockBook {
  const item = itemFor(book, input.itemId, input.unit);
  const outgoing = amount(input.quantity, input.unit);
  if (!input.id || book.movements.some((movement) => movement.id === input.id)) throw new Error('ID de movimiento duplicado o vacío.');
  const balance = stockBalance(book, input.itemId, base(item.unit));
  const available = Math.round(balance.quantity * scale(base(item.unit)));
  if (outgoing > available) throw new Error('Existencias insuficientes.');
  const costCents = outgoing === available ? balance.valueCents
    : Number((BigInt(balance.valueCents) * BigInt(outgoing) + BigInt(available) / 2n) / BigInt(available));
  const movement: StockMovement = { id: input.id, itemId: input.itemId, kind: input.kind, quantity: input.quantity,
    unit: input.unit, costCents };
  return { ...book, movements: [...book.movements, movement] };
}
