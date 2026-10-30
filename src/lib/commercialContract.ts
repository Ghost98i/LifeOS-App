import { exitStock, receiveStock, type StockBook, type StockExitKind, type StockItem, type StockUnit } from './commercialInventory';

export type CommercialKind = 'receipt' | StockExitKind;
export interface CommercialOperation {
  id: string;
  kind: CommercialKind;
  status: 'open' | 'closed';
  /** Business date; separate from the effective application order. */
  commercialDate?: string;
  /** Lexically sortable application order. ID is only a deterministic tie breaker. */
  effectiveOrder: string;
}
export interface CommercialMovement {
  id: string;
  operationId: string;
  itemId: string;
  kind: CommercialKind;
  quantity: number;
  unit: StockUnit;
  /** Receipt acquisition cost, or the frozen cost of a closed exit. */
  costCents?: number;
}
export interface CommercialSet {
  items: StockItem[];
  operations: CommercialOperation[];
  movements: CommercialMovement[];
  /** Optional durable business history. Legacy stock-only sets remain unchanged. */
  business?: import('./commercialDurable').CommercialBusinessHistory;
}
export interface CommercialIssue {
  category: 'structure' | 'commercial' | 'conflict';
  code: string;
  entity: 'item' | 'operation' | 'movement';
  id: string;
  reference?: string;
}
export interface CommercialValidation { valid: boolean; issues: CommercialIssue[] }

const unitBase = (unit: StockUnit) => unit === 'unit' ? 'unit' : 'g';
const validUnit = (unit: unknown): unit is StockUnit => unit === 'unit' || unit === 'g' || unit === 'kg';
const validKind = (kind: unknown): kind is CommercialKind => kind === 'receipt' || kind === 'consumption' || kind === 'sale' || kind === 'waste';
const validCents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const compareKey = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function validateCommercialSet(set: CommercialSet): CommercialValidation {
  const issues: CommercialIssue[] = [];
  const add = (category: CommercialIssue['category'], code: string, entity: CommercialIssue['entity'], id: string, reference?: string) => {
    issues.push({ category, code, entity, id, ...(reference ? { reference } : {}) });
  };
  const seen = new Set<string>();
  for (const [entity, records] of [['item', set.items], ['operation', set.operations], ['movement', set.movements]] as const) {
    for (const record of records) {
      if (typeof record.id !== 'string' || !record.id.trim()) add('structure', 'invalid_id', entity, String(record.id));
      const key = `${entity}:${record.id}`;
      if (seen.has(key)) add('structure', 'duplicate_id', entity, String(record.id));
      seen.add(key);
    }
  }
  const items = new Map(set.items.map((item) => [item.id, item]));
  const operations = new Map(set.operations.map((operation) => [operation.id, operation]));
  for (const item of set.items) {
    if (!validUnit(item.unit)) add('structure', 'invalid_unit', 'item', item.id);
  }
  for (const operation of set.operations) {
    if (!validKind(operation.kind) || !['open', 'closed'].includes(operation.status)) add('structure', 'invalid_operation', 'operation', operation.id);
    if (typeof operation.effectiveOrder !== 'string' || !operation.effectiveOrder.trim()) add('structure', 'invalid_order', 'operation', operation.id);
  }
  for (const movement of set.movements) {
    const operation = operations.get(movement.operationId);
    const item = items.get(movement.itemId);
    if (!operation) add('structure', 'missing_operation', 'movement', movement.id, movement.operationId);
    if (!item) add('structure', 'missing_item', 'movement', movement.id, movement.itemId);
    if (!validKind(movement.kind) || (operation && movement.kind !== operation.kind)) add('structure', 'kind_mismatch', 'movement', movement.id);
    if (!validUnit(movement.unit)) add('structure', 'invalid_unit', 'movement', movement.id);
    else if (item && validUnit(item.unit) && unitBase(movement.unit) !== unitBase(item.unit)) add('structure', 'incompatible_unit', 'movement', movement.id, item.id);
    if (!Number.isFinite(movement.quantity) || movement.quantity <= 0) add('structure', 'invalid_quantity', 'movement', movement.id);
    if (operation?.status === 'closed' && !validCents(movement.costCents)) add('structure', 'missing_historical_cost', 'movement', movement.id);
  }
  if (issues.some((issue) => issue.category === 'structure')) return { valid: false, issues };

  const byOperation = new Map<string, CommercialMovement[]>();
  for (const movement of set.movements) byOperation.set(movement.operationId, [...(byOperation.get(movement.operationId) || []), movement]);
  const closed = [...set.operations].filter((operation) => operation.status === 'closed')
    .sort((a, b) => compareKey(a.effectiveOrder, b.effectiveOrder) || compareKey(a.id, b.id));
  const orderItems = new Map<string, CommercialMovement[]>();
  for (const operation of closed) {
    for (const movement of byOperation.get(operation.id) || []) {
      const key = `${operation.effectiveOrder}\u0000${movement.itemId}`;
      orderItems.set(key, [...(orderItems.get(key) || []), movement]);
    }
  }
  for (const [key, movements] of orderItems) if (new Set(movements.map((movement) => movement.operationId)).size > 1 && movements.some((movement) => movement.kind !== 'receipt')) {
    for (const id of new Set(movements.map((movement) => movement.operationId))) add('conflict', 'shared_effective_order', 'operation', id, key.split('\u0000')[1]);
  }
  let book: StockBook = { items: set.items, movements: [] };
  for (const operation of closed) {
    for (const movement of [...(byOperation.get(operation.id) || [])].sort((a, b) => compareKey(a.id, b.id))) {
      try {
        if (movement.kind === 'receipt') {
          book = receiveStock(book, { id: movement.id, itemId: movement.itemId, quantity: movement.quantity, unit: movement.unit, totalCost: movement.costCents! / 100 });
        } else {
          const next = exitStock(book, { id: movement.id, itemId: movement.itemId, kind: movement.kind, quantity: movement.quantity, unit: movement.unit });
          const calculated = next.movements[next.movements.length - 1].costCents;
          if (calculated !== movement.costCents) add('conflict', 'historical_cost_mismatch', 'movement', movement.id, operation.id);
          book = next;
        }
      } catch (error) {
        add('commercial', error instanceof Error && error.message === 'Existencias insuficientes.' ? 'insufficient_stock' : 'invalid_sequence', 'movement', movement.id, operation.id);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}
