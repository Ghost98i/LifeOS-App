import { validateCommercialSet, type CommercialIssue, type CommercialOperation, type CommercialSet } from './commercialContract';
import { validateDurableCommercial } from './commercialDurable';

export type CommercialReconcileResult =
  | { status: 'combined'; combined: CommercialSet }
  | { status: 'blocked'; issues: CommercialIssue[]; left: CommercialSet; right: CommercialSet };

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function reconcileCommercialSets(left: CommercialSet, right: CommercialSet): CommercialReconcileResult {
  const issues: CommercialIssue[] = [];
  // The stock union alone cannot reconcile payments, recipes, sales or refund dependencies.
  // Preserve identical business history; block divergent or one-sided history with both originals intact.
  if (left.business !== undefined || right.business !== undefined) {
    if (left.business === undefined || right.business === undefined || canonical(left.business) !== canonical(right.business)) {
      return { status: 'blocked', issues: [{ category: 'conflict', code: 'business_history_diverged',
        entity: 'operation', id: 'business' }], left: structuredClone(left), right: structuredClone(right) };
    }
  }
  const merge = <T extends { id: string }>(entity: CommercialIssue['entity'], a: T[], b: T[]): T[] => {
    const result = new Map<string, T>();
    for (const [side, records] of [['left', a], ['right', b]] as const) {
      const seen = new Set<string>();
      for (const record of records) {
        if (seen.has(record.id)) issues.push({ category: 'structure', code: 'duplicate_id', entity, id: record.id, reference: side });
        seen.add(record.id);
        const previous = result.get(record.id);
        if (previous && canonical(previous) !== canonical(record)) {
          issues.push({ category: 'conflict', code: 'same_id_different_content', entity, id: record.id, reference: side });
        } else if (!previous) result.set(record.id, record);
      }
    }
    return [...result.values()];
  };
  const items = merge('item', left.items, right.items);
  const operations = merge('operation', left.operations, right.operations);
  const movements = merge('movement', left.movements, right.movements);
  const blocked = (): CommercialReconcileResult => ({ status: 'blocked', issues, left: structuredClone(left), right: structuredClone(right) });
  if (issues.length) return blocked();

  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const operationOrder = (a: CommercialOperation, b: CommercialOperation) => compare(a.effectiveOrder, b.effectiveOrder) || compare(a.id, b.id);
  const combined: CommercialSet = {
    items: items.sort((a, b) => compare(a.id, b.id)),
    operations: operations.sort(operationOrder),
    movements: movements.sort((a, b) => {
      const first = operationById.get(a.operationId);
      const second = operationById.get(b.operationId);
      return first && second ? operationOrder(first, second) || compare(a.id, b.id) : compare(a.id, b.id);
    }),
    ...(left.business ? { business: structuredClone(left.business) } : {}),
  };
  issues.push(...validateCommercialSet(combined).issues);
  if (combined.business) issues.push(...validateDurableCommercial(combined).issues.map((issue) => ({
    category: 'conflict' as const, code: issue.code, entity: 'operation' as const, id: issue.id,
    ...(issue.reference ? { reference: issue.reference } : {}),
  })));
  if (issues.length) return blocked();
  return { status: 'combined', combined: structuredClone(combined) };
}
