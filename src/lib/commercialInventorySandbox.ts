import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { exitStock, receiveStock, stockBalance, type StockBook, type StockUnit } from './commercialInventory';

export const emptySandboxInventory = (): CommercialSet => ({ items: [], operations: [], movements: [] });

export function sandboxStockBook(set: CommercialSet): StockBook {
  return { items: set.items, movements: set.movements.map((movement) => ({
    id: movement.id, itemId: movement.itemId, kind: movement.kind,
    quantity: movement.quantity, unit: movement.unit, costCents: movement.costCents!,
  })) };
}

function appendMovement(set: CommercialSet, book: StockBook, itemId: string): CommercialSet {
  const movement = book.movements[book.movements.length - 1];
  const number = set.operations.length + 1;
  const operationId = `sandbox-operation-${number}`;
  const next: CommercialSet = {
    items: set.items,
    operations: [...set.operations, { id: operationId, kind: movement.kind, status: 'closed', effectiveOrder: String(number).padStart(12, '0') }],
    movements: [...set.movements, { ...movement, operationId, itemId }],
  };
  const validation = validateCommercialSet(next);
  if (!validation.valid) throw new Error(`Operación inválida: ${validation.issues.map((issue) => issue.code).join(', ')}.`);
  return next;
}

export function addSandboxItem(set: CommercialSet, name: string, unit: StockUnit, quantity: number, totalCost: number): CommercialSet {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Ingresá un nombre para el insumo.');
  if (set.items.some((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
    throw new Error('Ese insumo ya existe. Usá Reponer stock desde su tarjeta.');
  }
  const itemId = `sandbox-item-${set.items.length + 1}`;
  const withItem: CommercialSet = { ...set, items: [...set.items, { id: itemId, name: cleanName, unit }] };
  return addSandboxReceipt(withItem, itemId, quantity, unit, totalCost);
}

export function addSandboxReceipt(set: CommercialSet, itemId: string, quantity: number, unit: StockUnit, totalCost: number): CommercialSet {
  const number = set.operations.length + 1;
  const book = receiveStock(sandboxStockBook(set), { id: `sandbox-movement-${number}`, itemId, quantity, unit, totalCost });
  return appendMovement(set, book, itemId);
}

export function addSandboxExit(set: CommercialSet, itemId: string, kind: 'consumption' | 'waste', quantity: number, unit: StockUnit): CommercialSet {
  const number = set.operations.length + 1;
  const book = exitStock(sandboxStockBook(set), { id: `sandbox-movement-${number}`, itemId, kind, quantity, unit });
  return appendMovement(set, book, itemId);
}

function quantityInUnit(quantity: number, source: StockUnit, target: StockUnit): number {
  if (source === target) return quantity;
  return target === 'kg' ? quantity / 1_000 : quantity * 1_000;
}

export function sandboxItemSummary(set: CommercialSet, itemId: string) {
  const item = set.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Artículo inexistente.');
  const balance = stockBalance(sandboxStockBook(set), itemId);
  const sum = (kind: 'consumption' | 'waste') => set.movements
    .filter((movement) => movement.itemId === itemId && movement.kind === kind)
    .reduce((total, movement) => total + quantityInUnit(movement.quantity, movement.unit, item.unit), 0);
  return { ...balance, consumed: sum('consumption'), discarded: sum('waste') };
}

export function sandboxStockEntries(set: CommercialSet) {
  return set.items.map((item) => ({ item, summary: sandboxItemSummary(set, item.id) }));
}
