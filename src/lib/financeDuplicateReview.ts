import type { LifeOSState, Transaction } from '../types';
import { deleteTransaction, getTransactionLockReason, markTransactionReviewed } from './financeFlows';
import { deriveFinanceDuplicateGroups, isTransactionIgnored, isTransactionReviewed } from './financeReview';

function currentTransaction(state: LifeOSState, expected: Transaction): Transaction {
  const matches = state.finance.transactions.filter(tx => tx.id === expected.id);
  if (matches.length !== 1) throw new Error('El movimiento ya no existe o su identidad es ambigua. Volvé a revisar.');
  const tx = matches[0];
  // A dialog must never silently act on a transaction edited by another client.
  const keys = new Set([...Object.keys(tx), ...Object.keys(expected)]);
  if ([...keys].some(key => JSON.stringify(tx[key as keyof Transaction]) !== JSON.stringify(expected[key as keyof Transaction]))) {
    throw new Error('El movimiento cambió desde que abriste la revisión. Cerrá y volvé a revisar.');
  }
  const lock = getTransactionLockReason(state, tx);
  if (lock) throw new Error(lock);
  return tx;
}

/** Uses only existing per-transaction review states; never posts money again. */
export function keepFinanceDuplicateGroup(state: LifeOSState, expected: Transaction[]): void {
  const ids = new Set(expected.map(tx => tx.id));
  if (ids.size !== expected.length || ids.size < 2) throw new Error('Elegí al menos dos movimientos distintos.');
  const current = expected.map(tx => currentTransaction(state, tx));
  const group = deriveFinanceDuplicateGroups(state).find(item => expected.every(tx => item.transactions.some(member => member.id === tx.id)));
  if (!group) throw new Error('La advertencia cambió. Volvé a revisar los movimientos.');
  for (const tx of current) {
    // Preserve historical ignored/reviewed metadata verbatim, including legacy reviewed=true.
    if (!isTransactionReviewed(tx) && !isTransactionIgnored(tx)) markTransactionReviewed(state, tx.id);
  }
}

/** One exact identity, through the ledger's existing dependency/reconciliation circuit. */
export function deleteFinanceDuplicate(state: LifeOSState, expected: Transaction): void {
  const tx = currentTransaction(state, expected);
  deleteTransaction(state, tx.id);
}
