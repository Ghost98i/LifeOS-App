import type { LifeOSState } from '../types';
import { captureDurableCommercial } from './commercialDurable';
import type { CommercialPilotSnapshot } from './commercialPilot';
import { describeCommercialMoneyMovement, prevalidateCommercialFinance } from './commercialFinanceBridge';
import { addTransaction } from './financeFlows';
import { assertCommercialTransition } from './commercialTransition';

/** Adapts the existing commands to the existing state and Finance ledger, in one local commit. */
export function applyCommercialSnapshot(state: LifeOSState, expected: unknown,
  input: CommercialPilotSnapshot, choice: { categoryId: string; date: string }): CommercialPilotSnapshot {
  if (JSON.stringify(state.resale.commercial) !== JSON.stringify(expected))
    throw new Error('El historial cambió mientras editabas. Conservá el formulario y volvé a abrir Mi negocio.');
  const next = structuredClone(input);
  const draft = structuredClone(state);
  next.financeLinks ??= [];
  next.supplierRefundSources ??= [];
  for (const event of next.session.moneyEvents ?? []) {
    const originKey = `commercial:${event.purpose}:${event.id}`;
    const linked = next.financeLinks.find(link => link.originKey === originKey);
    let financialChoice = linked?.choice;
    if (!financialChoice) {
      let inheritedCategory = choice.categoryId;
      if (!inheritedCategory && event.reversalOf) {
        const targetOriginKey = `commercial:${event.purpose === 'payment_reversal' ? 'purchase_payment' : 'sale_receipt'}:${event.reversalOf}`;
        const targetLink = next.financeLinks.find(l => l.originKey === targetOriginKey);
        if (targetLink?.choice?.categoryId) {
          inheritedCategory = targetLink.choice.categoryId;
        }
      }
      if (!inheritedCategory && (event.purpose === 'customer_refund' || event.purpose === 'supplier_refund')) {
        const basePurpose = event.purpose === 'customer_refund' ? 'sale_receipt' : 'purchase_payment';
        const baseEvent = (next.session.moneyEvents ?? []).find(
          e => e.purpose === basePurpose && e.sourceId === event.sourceId
        );
        if (baseEvent) {
          const baseLink = next.financeLinks.find(l => l.originKey === `commercial:${basePurpose}:${baseEvent.id}`);
          if (baseLink?.choice?.categoryId) {
            inheritedCategory = baseLink.choice.categoryId;
          }
        }
      }
      financialChoice = { ...choice, categoryId: inheritedCategory || choice.categoryId, accountId: event.accountRef, currency: next.currency };
    }
    const plan = prevalidateCommercialFinance({ event, session: next.session, finance: draft.finance,
      choice: financialChoice, sourceCurrency: next.currency, resaleInventory: draft.resale.inventory, links: next.financeLinks });
    if (plan.status === 'blocked' || plan.status === 'review_required') throw new Error(plan.detail);
    if (plan.status === 'ready') {
      const candidate = plan.candidate;
      const note = describeCommercialMoneyMovement(event, next.session);
      addTransaction(draft, { ...candidate, note, reviewed: true });
      next.financeLinks.push({ originKey, transactionId: candidate.id, choice: financialChoice });
    }
    if (event.purpose === 'customer_refund' && !next.refundSources.some(source => source.refundEventId === event.id)) {
      let remaining = event.amountCents;
      const allocations: { receiptEventId: string; amountCents: number }[] = [];
      for (const receipt of next.session.moneyEvents ?? []) {
        if (receipt.purpose !== 'sale_receipt' || receipt.sourceId !== event.sourceId) continue;
        const reversed = (next.session.moneyEvents ?? [])
          .filter(e => e.purpose === 'receipt_reversal' && e.reversalOf === receipt.id)
          .reduce((sum, e) => sum + e.amountCents, 0);
        const allocated = next.refundSources.flatMap(source => source.allocations)
          .filter(part => part.receiptEventId === receipt.id).reduce((sum, part) => sum + part.amountCents, 0);
        const netReceipt = receipt.amountCents - reversed;
        const amountCents = Math.min(remaining, Math.max(0, netReceipt - allocated));
        if (amountCents > 0) { allocations.push({ receiptEventId: receipt.id, amountCents }); remaining -= amountCents; }
      }
      if (remaining !== 0) throw new Error('No hay cobros suficientes para respaldar el reembolso.');
      next.refundSources.push({ refundEventId: event.id, allocations });
    }
    if (event.purpose === 'supplier_refund' && !next.supplierRefundSources.some(source => source.refundEventId === event.id)) {
      let remaining = event.amountCents;
      const allocations: { receiptEventId: string; amountCents: number }[] = [];
      for (const payment of next.session.moneyEvents ?? []) {
        if (payment.purpose !== 'purchase_payment' || payment.sourceId !== event.sourceId) continue;
        const reversed = (next.session.moneyEvents ?? [])
          .filter(e => e.purpose === 'payment_reversal' && e.reversalOf === payment.id)
          .reduce((sum, e) => sum + e.amountCents, 0);
        const allocated = next.supplierRefundSources.flatMap(source => source.allocations)
          .filter(part => part.receiptEventId === payment.id).reduce((sum, part) => sum + part.amountCents, 0);
        const netPayment = payment.amountCents - reversed;
        const amountCents = Math.min(remaining, Math.max(0, netPayment - allocated));
        if (amountCents > 0) { allocations.push({ receiptEventId: payment.id, amountCents }); remaining -= amountCents; }
      }
      if (remaining !== 0) throw new Error('No hay pagos suficientes para respaldar el reembolso del proveedor.');
      next.supplierRefundSources.push({ refundEventId: event.id, allocations });
    }
  }
  const captured = captureDurableCommercial(next);
  if (captured.status !== 'valid') throw new Error(`No se puede guardar: ${captured.issues.map(issue => issue.code).join(', ')}.`);
  draft.resale.commercial = captured.set;
  assertCommercialTransition(state, draft);
  state.resale = draft.resale;
  state.finance = draft.finance;
  return next;
}
