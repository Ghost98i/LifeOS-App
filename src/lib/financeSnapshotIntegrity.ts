import type { Finance, Transaction, FinanceTransfer, AccountReconciliation } from '../types';
import { financeRevisionMillis, parseFinanceRevisionOrder } from './financeRevision';
import { reconstructAccountBalance } from './financeLedger';
import { syncDataFingerprint, type SyncConflictItem } from './syncModel';

type Event = Transaction | FinanceTransfer | AccountReconciliation;

/** Checks an automatic replacement of a known local ledger, not a user-selected restore. */
export function detectFinanceSnapshotRegression(
  local: Finance,
  incoming: Finance,
  tombstones: Record<string, number> = {},
): SyncConflictItem[] {
  const conflicts: SyncConflictItem[] = [];
  const report = (id: string, reason: string, localValue: unknown, remoteValue: unknown) => {
    conflicts.push({
      id: `conflict-finance-snapshot-${id}`, module: 'finance', entityType: 'entity', entityId: id,
      label: reason, localSummary: 'Conservar libro local y revisar', remoteSummary: reason,
      localValue, remoteValue,
    });
  };
  const deleted = (event: Event) => {
    const timestamp = tombstones[event.id];
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp >= financeRevisionMillis(event.revisionOrder);
  };
  const localEvents: Event[] = [...local.transactions, ...(local.transfers || []), ...(local.reconciliations || [])];
  const incomingEvents: Event[] = [...incoming.transactions, ...(incoming.transfers || []), ...(incoming.reconciliations || [])];
  const localMap = new Map(localEvents.map(item => [item.id, item]));
  const incomingMap = new Map(incomingEvents.map(item => [item.id, item]));
  if (localMap.size !== localEvents.length || incomingMap.size !== incomingEvents.length) {
    report('identity', 'Identidades financieras repetidas', localEvents, incomingEvents);
    return conflicts;
  }
  for (const item of localEvents) {
    const remote = incomingMap.get(item.id);
    if (!remote) {
      if (!deleted(item)) report(item.id, 'Movimiento ausente sin evidencia de eliminación', item, null);
      continue;
    }
    if (parseFinanceRevisionOrder(item.revisionOrder)
      && (!parseFinanceRevisionOrder(remote.revisionOrder) || remote.revisionOrder! < item.revisionOrder!
        || (remote.revisionOrder === item.revisionOrder && syncDataFingerprint(remote) !== syncDataFingerprint(item)))) {
      report(item.id, 'Versión anterior o incompatible de un movimiento conocido', item, remote);
    }
  }
  for (const item of incomingEvents) {
    if (deleted(item)) report(item.id, 'La instantánea intenta recuperar un movimiento eliminado', localMap.get(item.id) || null, item);
  }
  for (const account of incoming.accounts) {
    const result = reconstructAccountBalance(account, incoming.transactions, incoming.transfers, incoming.reconciliations);
    if (result.balance !== null && result.ambiguities.length === 0 && result.balance !== account.balance) {
      report(`balance-${account.id}`, 'El saldo recibido no coincide con sus movimientos', local.accounts.find(item => item.id === account.id) || null, account);
    }
  }
  return conflicts;
}
