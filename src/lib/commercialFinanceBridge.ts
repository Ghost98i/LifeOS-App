import type { Finance, ResaleItem, Transaction } from '../types';
import type { CommercialSet } from './commercialContract';
import type { SandboxMoneyEvent, SandboxMoneyPurpose, SandboxMoneySession } from './commercialMoneySandbox';
import { planSandboxFinanceEffect, sandboxPurchaseBalance, sandboxSaleBalance } from './commercialMoneySandbox';
import { compareMaterializedBalanceShadow } from './financeLedger';
import { fromCents, toCents } from './storage';

/** Evidence of ownership must come from a persisted commercial reference, not an entered transaction ID. */
export interface CommercialFinanceLink {
  originKey: string;
  transactionId: string;
}
export interface CommercialFinanceChoice {
  accountId?: string | null;
  categoryId?: string | null;
  /** Explicit commercial denomination. It cannot be inferred from an account or a transaction ID. */
  currency?: string | null;
  date?: string | null;
}
export interface CommercialFinanceBridgeInput {
  event: SandboxMoneyEvent;
  session: SandboxMoneySession;
  finance: Pick<Finance, 'accounts' | 'categories' | 'transactions' | 'transfers' | 'reconciliations'>;
  choice: CommercialFinanceChoice;
  /** Denomination supplied by the commercial source; current sandbox events do not persist it yet. */
  sourceCurrency?: string | null;
  resaleInventory?: ResaleItem[];
  links?: CommercialFinanceLink[];
}
export interface CommercialFinanceCandidate {
  id: string;
  originKey: string;
  type: Transaction['type'];
  amount: number;
  amountCents: number;
  accountId: string;
  category: string;
  currency: string;
  date: string;
  fixed: 'variable';
  purpose: SandboxMoneyEvent['purpose'];
  sourceId: string;
  /** Refunds compensate receipts; no existing transaction is modified or deleted. */
  receiptEventIds: string[];
}
export type CommercialFinancePreflight =
  | { status: 'ready'; candidate: CommercialFinanceCandidate }
  | { status: 'linked_verified'; transaction: Transaction; originKey: string }
  | { status: 'review_required' | 'blocked'; code: string; detail: string; originKey: string };

const blocked = (originKey: string, code: string, detail: string): CommercialFinancePreflight =>
  ({ status: 'blocked', code, detail, originKey });
const review = (originKey: string, code: string, detail: string): CommercialFinancePreflight =>
  ({ status: 'review_required', code, detail, originKey });
const resaleReferences = (items: ResaleItem[]) => new Set(items.flatMap((item) =>
  [item.purchaseTxId, item.saleTxId, item.feeTxId, item.financeTxId].filter((id): id is string => !!id)));
const normalizedCurrency = (value: string | null | undefined) => value?.trim().toUpperCase() || null;

/** Pure preflight. A ready result is a plan, never authorization to post directly. */
export function prevalidateCommercialFinance(input: CommercialFinanceBridgeInput): CommercialFinancePreflight {
  const { event, session, finance, choice } = input;
  const plan = planSandboxFinanceEffect(event);
  const originKey = plan.candidate.originKey;
  const sameIdEvents = session.moneyEvents?.filter((entry) => entry.id === event.id) ?? [];
  if (sameIdEvents.length > 1)
    return blocked(originKey, 'duplicate_event_id', 'El identificador monetario aparece más de una vez.');
  const inSession = sameIdEvents[0];
  if (!inSession || inSession.purpose !== event.purpose || inSession.sourceId !== event.sourceId
    || inSession.amountCents !== event.amountCents || inSession.accountRef !== event.accountRef
    || JSON.stringify(inSession.finance) !== JSON.stringify(event.finance))
    return blocked(originKey, 'event_not_confirmed', 'El evento monetario no coincide con la sesión confirmada.');
  if (!Number.isSafeInteger(event.amountCents) || event.amountCents <= 0)
    return blocked(originKey, 'invalid_amount', 'El importe en centavos no es válido.');
  if (event.purpose === 'purchase_payment' || event.purpose === 'supplier_refund' || event.purpose === 'payment_reversal') {
    const balance = sandboxPurchaseBalance(session, event.sourceId);
    if (!balance)
      return blocked(originKey, 'missing_purchase', 'La compra de origen no existe.');
    if (event.purpose === 'purchase_payment' && balance.paidCents > balance.purchase.amountCents)
      return blocked(originKey, 'overpaid_purchase', 'Los pagos superan el costo de la compra.');
    if (event.purpose === 'supplier_refund' && (balance.refundedCents > balance.paidCents
      || balance.refundedCents > Math.max(0, balance.paidCents - balance.activeAmountCents)))
      return blocked(originKey, 'excess_supplier_refund', 'El reembolso supera el importe por recuperar del proveedor.');
    if (event.purpose === 'payment_reversal') {
      if (!event.reversalOf) return blocked(originKey, 'missing_reversal_target', 'Falta el pago a revertir.');
      const target = session.moneyEvents?.find((e) => e.id === event.reversalOf);
      if (!target || target.purpose !== 'purchase_payment')
        return blocked(originKey, 'invalid_reversal_target', 'El movimiento a revertir no es un pago válido.');
      if (balance.refundedCents > balance.paidCents)
        return blocked(originKey, 'unbacked_refund', 'No se puede revertir el pago porque respalda reembolsos ya cobrados.');
    }
  } else {
    const balance = sandboxSaleBalance(session, event.sourceId);
    if (!balance) return blocked(originKey, 'missing_sale', 'La venta de origen no existe.');
    if (event.purpose === 'sale_receipt' && (balance.receivedCents > balance.sale.revenueCents || balance.refundedCents > balance.receivedCents
      || balance.refundedCents > Math.max(0, balance.receivedCents - balance.activeRevenueCents)))
      return blocked(originKey, 'inconsistent_receipts', 'Cobros, ajustes y reembolsos no son coherentes.');
    if (event.purpose === 'receipt_reversal') {
      if (!event.reversalOf) return blocked(originKey, 'missing_reversal_target', 'Falta el cobro a revertir.');
      const target = session.moneyEvents?.find((e) => e.id === event.reversalOf);
      if (!target || target.purpose !== 'sale_receipt')
        return blocked(originKey, 'invalid_reversal_target', 'El movimiento a revertir no es un cobro válido.');
      if (balance.refundedCents > balance.receivedCents)
        return blocked(originKey, 'unbacked_refund', 'No se puede revertir el cobro porque respalda reembolsos ya pagados al cliente.');
    }
  }
  const receiptEventIds = event.purpose === 'customer_refund'
    ? (session.moneyEvents ?? []).filter((entry) => entry.purpose === 'sale_receipt'
      && entry.sourceId === event.sourceId).map((entry) => entry.id)
    : event.purpose === 'supplier_refund'
    ? (session.moneyEvents ?? []).filter((entry) => entry.purpose === 'purchase_payment'
      && entry.sourceId === event.sourceId).map((entry) => entry.id)
    : [];
  if (event.purpose === 'customer_refund' && receiptEventIds.length === 0)
    return blocked(originKey, 'refund_without_receipt', 'No hay cobros que respalden el reembolso.');
  if (event.purpose === 'supplier_refund' && receiptEventIds.length === 0)
    return blocked(originKey, 'refund_without_payment', 'No hay pagos que respalden el reembolso del proveedor.');

  const accountId = choice.accountId?.trim();
  if (!accountId) return blocked(originKey, 'missing_account', 'Falta seleccionar una cuenta financiera.');
  if (event.purpose === 'payment_reversal' || event.purpose === 'receipt_reversal') {
    const target = session.moneyEvents?.find((e) => e.id === event.reversalOf);
    if (target && target.accountRef !== accountId) {
      return blocked(originKey, 'reversal_account_mismatch', 'La reversión debe realizarse en la misma cuenta del movimiento original.');
    }
  }
  const account = finance.accounts.find((entry) => entry.id === accountId);
  if (!account) return blocked(originKey, 'invalid_account', 'La cuenta financiera no existe.');
  if (!Number.isFinite(account.initialBalance))
    return blocked(originKey, 'unmaterializable_account', 'La cuenta no tiene un saldo inicial verificable.');
  const shadow = compareMaterializedBalanceShadow(account, finance.transactions, finance.transfers, finance.reconciliations);
  if (shadow.ambiguities.length > 0 && !shadow.matches)
    return blocked(originKey, 'ambiguous_balance', 'La cuenta requiere revisión de su saldo antes de registrar dinero.');
  const currency = normalizedCurrency(choice.currency);
  if (!currency) return blocked(originKey, 'missing_currency', 'Falta declarar la moneda de la operación comercial.');
  const sourceCurrency = normalizedCurrency(input.sourceCurrency);
  if (!sourceCurrency) return review(originKey, 'unknown_source_currency', 'El evento comercial aún no conserva su moneda de origen.');
  if (currency !== sourceCurrency)
    return blocked(originKey, 'source_currency_mismatch', 'La moneda seleccionada no coincide con la operación comercial.');
  const accountCurrency = normalizedCurrency(account.currency) ?? 'UYU'; // Existing Finance convention.
  if (currency !== accountCurrency)
    return blocked(originKey, 'currency_mismatch', 'La moneda comercial no coincide con la cuenta.');
  const categoryId = choice.categoryId?.trim();
  if (!categoryId) return blocked(originKey, 'missing_category', 'Falta elegir una categoría financiera.');
  const category = finance.categories.find((entry) => entry.id === categoryId && entry.active);
  if (!category) return blocked(originKey, 'invalid_category', 'La categoría no existe o está archivada.');
  if (!choice.date || !/^\d{4}-\d{2}-\d{2}$/.test(choice.date)
    || Number.isNaN(Date.parse(`${choice.date}T00:00:00Z`))
    || new Date(`${choice.date}T00:00:00Z`).toISOString().slice(0, 10) !== choice.date)
    return blocked(originKey, 'missing_date', 'Falta una fecha financiera válida.');

  const reservedByResale = resaleReferences(input.resaleInventory ?? []);
  const links = input.links ?? [];
  const ownLinks = links.filter((link) => link.originKey === originKey);
  if (ownLinks.length > 1 || links.some((link) => link.originKey !== originKey
    && ownLinks.some((own) => own.transactionId === link.transactionId)))
    return blocked(originKey, 'duplicate_link', 'La referencia financiera está vinculada de forma incompatible.');
  const intendedId = event.finance.mode === 'existing' ? event.finance.transactionId : `commercial:${event.id}`;
  if (event.finance.mode === 'existing' && session.moneyEvents?.some((entry) => entry.id !== event.id
    && entry.finance.mode === 'existing' && entry.finance.transactionId === intendedId))
    return blocked(originKey, 'reused_transaction', 'Dos eventos monetarios apuntan al mismo movimiento.');
  if (reservedByResale.has(intendedId))
    return blocked(originKey, 'reserved_by_resale', 'El movimiento pertenece a la Reventa convencional.');
  if (links.some((link) => link.transactionId === intendedId && link.originKey !== originKey))
    return blocked(originKey, 'reused_transaction', 'El movimiento ya está vinculado a otra operación.');
  if (ownLinks.length === 1 && ownLinks[0].transactionId !== intendedId)
    return blocked(originKey, 'different_existing_link', 'La operación ya apunta a otro movimiento financiero.');
  const matches = finance.transactions.filter((transaction) => transaction.id === intendedId);
  if (matches.length > 1) return blocked(originKey, 'duplicate_transaction_id', 'Hay movimientos financieros con el mismo ID.');
  const transaction = matches[0];
  if (transaction) {
    const expectedType = plan.candidate.type;
    if (transaction.type !== expectedType) return blocked(originKey, 'type_mismatch', 'El tipo de movimiento no coincide.');
    if (!Number.isFinite(transaction.amount) || toCents(transaction.amount) !== event.amountCents)
      return blocked(originKey, 'amount_mismatch', 'El importe del movimiento no coincide.');
    if (transaction.accountId !== accountId) return blocked(originKey, 'account_mismatch', 'La cuenta del movimiento no coincide.');
    if (!normalizedCurrency(transaction.currency))
      return review(originKey, 'unknown_transaction_currency', 'El movimiento histórico no conserva una moneda verificable.');
    if (normalizedCurrency(transaction.currency) !== currency)
      return blocked(originKey, 'transaction_currency_mismatch', 'La moneda del movimiento no coincide.');
    if (transaction.category !== categoryId) return blocked(originKey, 'category_mismatch', 'La categoría del movimiento no coincide.');
    if (transaction.date !== choice.date) return blocked(originKey, 'date_mismatch', 'La fecha del movimiento no coincide.');
    if (transaction.origin === 'adjustment' || finance.reconciliations.some((entry) => entry.adjustmentTxId === transaction.id))
      return blocked(originKey, 'protected_transaction', 'El movimiento es un ajuste de conciliación.');
    if (transaction.origin === 'resale_purchase' || transaction.origin === 'resale_sale')
      return blocked(originKey, 'reserved_by_resale', 'El movimiento declara origen de Reventa convencional.');
    if (transaction.commitmentId || transaction.expectedIncomeId || transaction.agreementId)
      return blocked(originKey, 'foreign_finance_dependency', 'El movimiento ya responde a otra obligación financiera.');
    if (ownLinks.length === 0)
      return review(originKey, 'missing_ownership_evidence', 'Los campos coinciden, pero falta un vínculo comercial confiable con el movimiento.');
    return { status: 'linked_verified', transaction, originKey };
  }
  if (event.finance.mode === 'existing' || ownLinks.length > 0)
    return blocked(originKey, 'missing_transaction', 'La transacción vinculada no existe; no se creará otra automáticamente.');
  return { status: 'ready', candidate: { id: intendedId, originKey, type: plan.candidate.type,
    amount: fromCents(event.amountCents), amountCents: event.amountCents, accountId,
    category: category.id, currency, date: choice.date, fixed: 'variable',
    purpose: event.purpose, sourceId: event.sourceId, receiptEventIds } };
}

export interface CommercialJointPublicationPlan {
  status: 'requires_joint_publication';
  modules: readonly ['resale', 'finance'];
  expectedRevisions: { resale: string | null; finance: string | null };
  originKey: string;
  transaction: CommercialFinanceCandidate;
  requiredReceiptEventIds: string[];
  /** Current commercial cloud writer remains disabled; this only describes dependencies. */
  publishableNow: false;
}

export function planCommercialJointPublication(preflight: CommercialFinancePreflight,
  expectedRevisions: CommercialJointPublicationPlan['expectedRevisions']): CommercialJointPublicationPlan | null {
  if (preflight.status !== 'ready') return null;
  return { status: 'requires_joint_publication', modules: ['resale', 'finance'], expectedRevisions,
    originKey: preflight.candidate.originKey, transaction: preflight.candidate,
    requiredReceiptEventIds: preflight.candidate.receiptEventIds, publishableNow: false };
}

export function describeCommercialMoneyMovement(
  event: Pick<SandboxMoneyEvent, 'purpose' | 'sourceId'>,
  context: Pick<SandboxMoneySession, 'inventory' | 'purchases' | 'sales'>
): string {
  const isPurchasePurpose =
    event.purpose === 'purchase_payment' ||
    event.purpose === 'supplier_refund' ||
    event.purpose === 'payment_reversal';

  let itemName: string | undefined;
  if (isPurchasePurpose) {
    const purchase = context.purchases?.find((entry) => entry.id === event.sourceId);
    itemName = context.inventory.items.find((entry) => entry.id === purchase?.itemId)?.name?.trim();
  } else {
    const sale = context.sales?.find((entry) => entry.id === event.sourceId);
    itemName =
      sale?.recipeName?.trim() ||
      (sale?.itemId ? context.inventory.items.find((entry) => entry.id === sale.itemId)?.name?.trim() : undefined);
  }

  switch (event.purpose) {
    case 'purchase_payment':
      return itemName ? `Compra de ${itemName}` : 'Compra comercial';
    case 'sale_receipt':
      return itemName ? `Venta de ${itemName}` : 'Venta comercial';
    case 'customer_refund':
      return itemName ? `Reembolso de venta de ${itemName}` : 'Reembolso a cliente';
    case 'supplier_refund':
      return itemName ? `Reembolso de compra de ${itemName}` : 'Reembolso de proveedor';
    case 'payment_reversal':
      return itemName ? `Reversión de compra de ${itemName}` : 'Reversión de pago';
    case 'receipt_reversal':
      return itemName ? `Reversión de venta de ${itemName}` : 'Reversión de cobro';
  }
}

export interface CommercialTransactionPresentation {
  isCommercial: boolean;
  displayNote: string;
  originBadge: string | null;
  purpose?: SandboxMoneyPurpose;
}

export function resolveCommercialTransactionPresentation(
  transaction: Pick<Transaction, 'id' | 'note'>,
  commercial?: CommercialSet | null
): CommercialTransactionPresentation {
  const business = commercial?.business;
  const link = business?.financeLinks?.find((entry) => entry.transactionId === transaction.id);
  const isCommercial = Boolean(link || transaction.id?.startsWith('commercial:'));
  const rawNote = transaction.note?.trim() || '';

  if (!isCommercial) {
    return { isCommercial: false, displayNote: rawNote, originBadge: null };
  }

  let event: SandboxMoneyEvent | undefined;
  if (business?.moneyEvents) {
    if (link) {
      event = business.moneyEvents.find((entry) => `commercial:${entry.purpose}:${entry.id}` === link.originKey);
    }
    if (!event && transaction.id?.startsWith('commercial:')) {
      const eventId = transaction.id.slice('commercial:'.length);
      event = business.moneyEvents.find((entry) => entry.id === eventId);
    }
  }

  if (rawNote && rawNote !== 'Mi negocio') {
    return {
      isCommercial: true,
      displayNote: rawNote,
      originBadge: 'Mi negocio',
      purpose: event?.purpose,
    };
  }

  if (event && commercial && business) {
    return {
      isCommercial: true,
      displayNote: describeCommercialMoneyMovement(event, {
        inventory: commercial,
        purchases: business.purchases,
        sales: business.sales,
      }),
      originBadge: 'Mi negocio',
      purpose: event.purpose,
    };
  }

  return {
    isCommercial: true,
    displayNote: rawNote && rawNote !== 'Mi negocio' ? rawNote : 'Operación comercial',
    originBadge: 'Mi negocio',
    purpose: event?.purpose,
  };
}
