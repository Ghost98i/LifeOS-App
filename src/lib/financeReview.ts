import type { FinancialCommitment, LifeOSState, Transaction } from '../types';
import { identifyMerchant } from './merchantIdentity';
import { todayISO } from './storage';

export type ReviewReasonCode =
  | 'missing_category'
  | 'doubtful_category'
  | 'unnormalized_merchant'
  | 'possible_duplicate'
  | 'suspicious_date'
  | 'suspicious_amount'
  | 'missing_account'
  | 'pending_confirmation'
  | 'compatible_commitment';

export interface ReviewReason {
  code: ReviewReasonCode;
  label: string;
  description: string;
  suggestedValue?: string;
  suggestedCategory?: string;
  duplicateTransactionId?: string;
  compatibleCommitmentId?: string;
}

export interface FinanceReviewInboxItem {
  transaction: Transaction;
  reasons: ReviewReason[];
  suggestedAction?: 'categorize' | 'normalize_merchant' | 'resolve_duplicate' | 'fix_date' | 'link_commitment' | 'confirm';
}

export interface AttentionCommitment {
  commitment: FinancialCommitment;
  kind: 'overdue' | 'due_soon' | 'compatible_movement';
  label: string;
  daysDiff: number;
  compatibleTxId?: string;
}

export interface FinanceReviewInboxResult {
  items: FinanceReviewInboxItem[];
  totalPending: number;
  attentionCommitments: AttentionCommitment[];
  canBulkReviewAll: boolean;
}

function daysDiff(isoA: string, isoB: string): number {
  const msA = new Date(`${isoA}T00:00:00`).getTime();
  const msB = new Date(`${isoB}T00:00:00`).getTime();
  return Math.round((msA - msB) / (1000 * 60 * 60 * 24));
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isTransactionReviewed(tx: Transaction): boolean {
  return tx.reviewStatus === 'reviewed' || tx.reviewed === true;
}

export function isTransactionIgnored(tx: Transaction): boolean {
  return tx.reviewStatus === 'ignored';
}

const PLACEHOLDER_CATEGORY_NAMES = new Set([
  'sin categoría',
  'sin categoria',
  'categoría pendiente',
  'categoria pendiente',
  'indefinido',
]);

const GENERIC_CATEGORY_NAMES = new Set([
  'otros',
  'varios',
]);

/**
 * Derives the Review Inbox items by pure exception analysis.
 * Invariant: A transaction only enters the inbox if it has NOT been reviewed/ignored
 * AND has at least one concrete reason requiring user attention.
 */
export function deriveFinanceReviewInbox(
  state: LifeOSState,
  referenceDate = todayISO(),
): FinanceReviewInboxResult {
  const transactions = state.finance?.transactions || [];
  const accounts = state.finance?.accounts || [];
  const activeCategories = (state.finance?.categories || []).filter((c) => c.active !== false);
  const activeCategoryIds = new Set(activeCategories.map((c) => c.id));
  const activeCategoryNames = new Set(activeCategories.map((c) => c.name.toLowerCase()));
  const commitments = (state.finance?.commitments || []).filter((c) => c.active && c.status !== 'paid');

  const items: FinanceReviewInboxItem[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    // Skip already reviewed or intentionally ignored transactions
    if (isTransactionReviewed(tx) || isTransactionIgnored(tx)) {
      continue;
    }

    // Skip ledger conciliation adjustments (they are balance reconciliation artifacts, not expenses to review)
    if (tx.origin === 'adjustment') {
      continue;
    }

    const reasons: ReviewReason[] = [];

    // 1. Missing or Doubtful Category
    const trimmedCat = (tx.category || '').trim();
    if (!trimmedCat) {
      reasons.push({
        code: 'missing_category',
        label: 'Categoría ausente',
        description: 'El movimiento no tiene categoría asignada.',
      });
    } else {
      const isPlaceholder = PLACEHOLDER_CATEGORY_NAMES.has(trimmedCat.toLowerCase());
      const isGeneric = GENERIC_CATEGORY_NAMES.has(trimmedCat.toLowerCase());
      const isKnown = activeCategoryIds.has(trimmedCat) || activeCategoryNames.has(trimmedCat.toLowerCase());
      const merchant = identifyMerchant(tx.note);

      if (isPlaceholder) {
        reasons.push({
          code: 'missing_category',
          label: 'Categoría sin definir',
          description: 'El movimiento tiene una categoría temporal o pendiente.',
        });
      } else if (isGeneric && merchant?.categoryDefault && merchant.categoryDefault !== tx.category) {
        reasons.push({
          code: 'doubtful_category',
          label: 'Categoría dudosa',
          description: `Comercio identificado como ${merchant.name}, pero clasificado en "${tx.category}".`,
          suggestedCategory: merchant.categoryDefault,
        });
      } else if (!isKnown && !isGeneric) {
        reasons.push({
          code: 'doubtful_category',
          label: 'Categoría inactiva o desconocida',
          description: `La categoría "${tx.category}" no figura entre tus categorías activas.`,
        });
      }
    }

    // 2. Unnormalized Merchant Name
    if (tx.note) {
      const merchant = identifyMerchant(tx.note);
      if (merchant) {
        const cleanNote = tx.note.trim();
        const needsNormalization =
          cleanNote.toLowerCase() === merchant.name.toLowerCase() && cleanNote !== merchant.name;
        if (needsNormalization) {
          reasons.push({
            code: 'unnormalized_merchant',
            label: 'Comercio sin normalizar',
            description: `Se detectó el comercio "${merchant.name}".`,
            suggestedValue: merchant.name,
          });
        }
      }
    }

    // 3. Duplicate Detection
    // Matches another transaction with same type, amount, account, on same date or +/- 1 day
    for (let j = 0; j < transactions.length; j++) {
      if (i === j) continue;
      const other = transactions[j];
      if (other.origin === 'adjustment') continue;

      const sameType = other.type === tx.type;
      const sameAmount = Math.abs(other.amount - tx.amount) < 0.001;
      const sameAccount = other.accountId === tx.accountId;
      const dateProximity = Math.abs(daysDiff(tx.date, other.date)) <= 1;

      if (sameType && sameAmount && sameAccount && dateProximity) {
        reasons.push({
          code: 'possible_duplicate',
          label: 'Posible duplicado',
          description: `Coincide en monto, cuenta y fecha con otro movimiento (${other.date}, $${other.amount}).`,
          duplicateTransactionId: other.id,
        });
        break; // Only flag once per transaction
      }
    }

    // 4. Suspicious Date (future movements)
    if (tx.date > referenceDate) {
      reasons.push({
        code: 'suspicious_date',
        label: 'Fecha en el futuro',
        description: `El movimiento está fechado para ${tx.date}, posterior a hoy. ¿Es un compromiso pendiente o un error de fecha?`,
        suggestedValue: referenceDate,
      });
    }

    // 5. Suspicious Amount
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) {
      reasons.push({
        code: 'suspicious_amount',
        label: 'Importe inválido',
        description: 'El importe del movimiento debe ser un número positivo.',
      });
    }

    // 6. Missing or Invalid Account
    if (!tx.accountId) {
      reasons.push({
        code: 'missing_account',
        label: 'Cuenta no asignada',
        description: 'El movimiento no tiene cuenta vinculada.',
      });
    } else if (!accounts.some((a) => a.id === tx.accountId)) {
      reasons.push({
        code: 'missing_account',
        label: 'Cuenta inexistente',
        description: 'La cuenta asignada a este movimiento ya no existe.',
      });
    }

    // 7. Explicit Pending / Imported needing confirmation
    if (tx.origin === 'import') {
      reasons.push({
        code: 'pending_confirmation',
        label: 'Confirmación pendiente',
        description: 'Movimiento importado que requiere confirmación inicial.',
      });
    }

    // 8. Compatible Commitment Signal (Section 6)
    if (!tx.commitmentId && tx.type === 'gasto' && tx.amount > 0) {
      const match = commitments.find((c) => {
        const amountMatch = Math.abs(Number(c.amount) - tx.amount) < 0.001;
        const diffDays = Math.abs(daysDiff(tx.date, c.nextDueDate));
        const dateClose = diffDays <= 7;
        const noteMatch = tx.note && c.name && (
          tx.note.toLowerCase().includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(tx.note.toLowerCase())
        );
        const categoryMatch = c.category && tx.category && c.category.toLowerCase() === tx.category.toLowerCase();
        return amountMatch && dateClose && (noteMatch || categoryMatch);
      });

      if (match) {
        reasons.push({
          code: 'compatible_commitment',
          label: 'Compromiso compatible',
          description: `Coincide con el compromiso "${match.name}" ($${match.amount}). Podés vincularlo para resolverlo sin duplicar gasto.`,
          compatibleCommitmentId: match.id,
        });
      }
    }

    // Determine primary suggested action
    if (reasons.length > 0) {
      let suggestedAction: FinanceReviewInboxItem['suggestedAction'] = 'confirm';
      if (reasons.some((r) => r.code === 'possible_duplicate')) {
        suggestedAction = 'resolve_duplicate';
      } else if (reasons.some((r) => r.code === 'compatible_commitment')) {
        suggestedAction = 'link_commitment';
      } else if (reasons.some((r) => r.code === 'missing_category' || r.code === 'doubtful_category')) {
        suggestedAction = 'categorize';
      } else if (reasons.some((r) => r.code === 'unnormalized_merchant')) {
        suggestedAction = 'normalize_merchant';
      } else if (reasons.some((r) => r.code === 'suspicious_date')) {
        suggestedAction = 'fix_date';
      }

      items.push({
        transaction: tx,
        reasons,
        suggestedAction,
      });
    }
  }

  // Attention signals for Commitments (Section 6)
  const attentionCommitments: AttentionCommitment[] = [];
  const horizonEnd = addDays(referenceDate, 3);

  for (const com of commitments) {
    const diff = daysDiff(com.nextDueDate, referenceDate);
    const isOverdue = com.nextDueDate < referenceDate;
    const isDueSoon = com.nextDueDate >= referenceDate && com.nextDueDate <= horizonEnd;

    // Check if there is an unlinked transaction compatible with this commitment
    const compatibleTx = transactions.find((tx) => (
      !tx.commitmentId &&
      tx.type === 'gasto' &&
      Math.abs(Number(tx.amount) - Number(com.amount)) < 0.001 &&
      Math.abs(daysDiff(tx.date, com.nextDueDate)) <= 7
    ));

    if (isOverdue) {
      attentionCommitments.push({
        commitment: com,
        kind: 'overdue',
        label: `Vencido hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? '' : 's'}`,
        daysDiff: diff,
        compatibleTxId: compatibleTx?.id,
      });
    } else if (isDueSoon) {
      attentionCommitments.push({
        commitment: com,
        kind: 'due_soon',
        label: diff === 0 ? 'Vence hoy' : `Vence en ${diff} día${diff === 1 ? '' : 's'}`,
        daysDiff: diff,
        compatibleTxId: compatibleTx?.id,
      });
    } else if (compatibleTx) {
      attentionCommitments.push({
        commitment: com,
        kind: 'compatible_movement',
        label: 'Existe un movimiento compatible pendiente de vincular',
        daysDiff: diff,
        compatibleTxId: compatibleTx.id,
      });
    }
  }

  // Can bulk review all?
  // Safe only if there are items and none have blocking reasons (duplicates, invalid amount, missing account)
  const hasBlockingIssues = items.some((it) =>
    it.reasons.some((r) =>
      r.code === 'possible_duplicate' ||
      r.code === 'suspicious_amount' ||
      r.code === 'missing_account'
    )
  );
  const canBulkReviewAll = items.length > 0 && !hasBlockingIssues;

  return {
    items,
    totalPending: items.length,
    attentionCommitments,
    canBulkReviewAll,
  };
}
