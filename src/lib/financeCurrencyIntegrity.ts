import type { Finance } from '../types';
import type { SyncConflictItem } from './syncModel';

/** Detect loss of an explicitly known currency, never infer one for a historical row. */
export function detectFinanceCurrencyLoss(
  reference: Finance, incoming: Finance, local = reference, remote = incoming, baseline?: Finance,
): SyncConflictItem[] {
  const conflicts: SyncConflictItem[] = [];
  for (const collection of ['commitments', 'expectedIncomes'] as const) {
    const rows = Array.isArray(incoming[collection]) ? incoming[collection] : [];
    const candidates = new Map(rows.map(record => [record.id, record] as const));
    for (const known of reference[collection] || []) {
      const candidate = candidates.get(known.id);
      // Whole-record deletions remain subject to the existing deletion contract.
      if (!candidate || (known.currency !== 'UYU' && known.currency !== 'USD')
        || candidate.currency === 'UYU' || candidate.currency === 'USD') continue;
      conflicts.push({
        id: `conflict-finance-currency-${collection}-${known.id}`, module: 'finance',
        entityType: 'entity', entityId: known.id, field: 'currency',
        label: `Moneda ausente o desconocida en ${collection === 'commitments' ? 'compromiso' : 'cobro previsto'}: ${known.name}`,
        localSummary: 'Revisar la moneda de la versión local', remoteSummary: 'Revisar la moneda de la versión remota',
        localValue: local[collection]?.find(record => record.id === known.id) ?? null,
        remoteValue: remote[collection]?.find(record => record.id === known.id) ?? null,
        ...(baseline ? { baseValue: baseline[collection]?.find(record => record.id === known.id) ?? null } : {}),
      });
    }
  }
  return conflicts;
}
