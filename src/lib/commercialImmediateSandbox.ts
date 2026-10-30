import type { CommercialSet } from './commercialContract';
import { confirmSandboxDirectSale, type SandboxDirectSaleRequest } from './commercialDirectSaleSandbox';
import { confirmSandboxMoneyEvent, recordSandboxPurchase, type SandboxMoneySession } from './commercialMoneySandbox';

export type ImmediateChoice = { timing: 'later' } | { timing: 'now'; accountRef: string };

/** Compose the existing pure transitions before the caller commits either result. */
export function confirmSandboxPurchaseWithPayment(session: SandboxMoneySession, inventory: CommercialSet,
  choice: ImmediateChoice) {
  try {
    const purchased = recordSandboxPurchase(session, inventory);
    if (choice.timing === 'later') return { status: 'confirmed' as const, session: purchased };
    const purchase = purchased.purchases!.at(-1)!;
    if (purchase.amountCents <= 0) return { status: 'blocked' as const, session,
      issues: ['Una compra sin importe no requiere un pago.'] };
    const payment = confirmSandboxMoneyEvent(purchased, { id: `${purchase.id}:payment`,
      purpose: 'purchase_payment', sourceId: purchase.id, amountCents: purchase.amountCents,
      accountRef: choice.accountRef.trim(), finance: { mode: 'new' } });
    return payment.status === 'blocked' ? { status: 'blocked' as const, session, issues: payment.issues }
      : { status: 'confirmed' as const, session: payment.session };
  } catch (cause) {
    return { status: 'blocked' as const, session,
      issues: [cause instanceof Error ? cause.message : 'No se pudo registrar la compra.'] };
  }
}

export function confirmSandboxDirectSaleWithReceipt(session: SandboxMoneySession,
  request: SandboxDirectSaleRequest, choice: ImmediateChoice) {
  const sold = confirmSandboxDirectSale(session, request);
  if (sold.status === 'blocked') return sold;
  if (choice.timing === 'later') return sold;
  const receipt = confirmSandboxMoneyEvent(sold.session, { id: `${request.id}:receipt`,
    purpose: 'sale_receipt', sourceId: request.id, amountCents: sold.sale.revenueCents,
    accountRef: choice.accountRef.trim(), finance: { mode: 'new' } });
  if (receipt.status === 'blocked') return { status: 'blocked' as const, session, issues: receipt.issues };
  return { status: sold.status === 'already_confirmed' && receipt.status === 'already_confirmed'
    ? 'already_confirmed' as const : 'confirmed' as const, session: receipt.session, sale: sold.sale };
}
