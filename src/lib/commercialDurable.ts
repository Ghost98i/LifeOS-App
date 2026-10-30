import { validateCommercialSet, type CommercialSet } from './commercialContract';
import { receiveStock, stockBalance } from './commercialInventory';
import { sandboxStockBook } from './commercialInventorySandbox';
import { sandboxMoneySummary, sandboxPurchaseBalance, sandboxSaleBalance, type SandboxMoneyEvent,
  type SandboxMoneySession, type SandboxPurchase, type SandboxPurchaseCorrection } from './commercialMoneySandbox';
import type { SandboxRecipe } from './commercialRecipeSandbox';
import type { SandboxProduction, SandboxFinishedWaste } from './commercialProductionSandbox';
import type { SandboxSale } from './commercialSaleSandbox';
import type { SandboxPreparedSaleCorrection } from './commercialCorrectionSandbox';
import type { CommercialFinanceLink, CommercialFinanceChoice } from './commercialFinanceBridge';
import { prevalidateCommercialFinance } from './commercialFinanceBridge';
import type { Finance, ResaleItem } from '../types';

/** One denomination per stock book. Mixed-currency inventory needs an explicit FX policy first. */
export type MoneyRecord<T> = T & { currency: string };
export interface DurableFinanceLink extends CommercialFinanceLink {
  choice: Required<Pick<CommercialFinanceChoice, 'accountId' | 'categoryId' | 'currency' | 'date'>>;
}
export interface RefundAllocation { receiptEventId: string; amountCents: number }
export interface DurableRefundSource { refundEventId: string; allocations: RefundAllocation[] }
export interface DurableEventOrder {
  kind: 'purchase' | 'production' | 'sale' | 'finished_waste' | 'adjustment' | 'money';
  id: string;
  /** Unique, lexically sortable application order; never derived from arrival position or ID. */
  effectiveOrder: string;
  /** Optional date supplied by the caller. Never inferred from an ID or the capture time. */
  commercialDate?: string;
}
export interface CommercialBusinessHistory {
  version: 1;
  currency: string;
  finished: CommercialSet;
  recipes: MoneyRecord<SandboxRecipe>[];
  purchases: MoneyRecord<SandboxPurchase>[];
  productions: MoneyRecord<SandboxProduction>[];
  sales: MoneyRecord<SandboxSale>[];
  finishedWastes: MoneyRecord<SandboxFinishedWaste>[];
  saleCorrections: MoneyRecord<SandboxPreparedSaleCorrection>[];
  purchaseCorrections?: MoneyRecord<SandboxPurchaseCorrection>[];
  moneyEvents: MoneyRecord<SandboxMoneyEvent>[];
  refundSources: DurableRefundSource[];
  supplierRefundSources?: DurableRefundSource[];
  financeLinks: DurableFinanceLink[];
  eventOrder: DurableEventOrder[];
}
export interface DurableIssue { code: string; entity: string; id: string; reference?: string }
export type DurableValidation = { valid: boolean; issues: DurableIssue[] };
export interface DurableFinanceContext {
  finance: Pick<Finance, 'accounts' | 'categories' | 'transactions' | 'transfers' | 'reconciliations'>;
  resaleInventory?: ResaleItem[];
}

const cents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => cents(value) && value > 0;
const currencyCode = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const commercialDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const sum = (values: number[]) => values.reduce((a, b) => {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new Error('Monetary overflow.');
  return total;
}, 0);
const unique = (records: Array<{ id: string }>, entity: string, add: (code: string, entity: string, id: string, reference?: string) => void) => {
  const seen = new Set<string>();
  for (const record of records) {
    if (typeof record.id !== 'string' || !record.id.trim()) add('invalid_id', entity, String(record.id));
    else if (seen.has(record.id)) add('duplicate_id', entity, record.id);
    seen.add(record.id);
  }
};
const movementCost = (set: CommercialSet, operationId: string) =>
  sum(set.movements.filter((movement) => movement.operationId === operationId).map((movement) => movement.costCents ?? 0));
const operationKind = (set: CommercialSet, id: string, kind: string) =>
  set.operations.some((operation) => operation.id === id && operation.kind === kind && operation.status === 'closed');
const ingredientsMatch = (set: CommercialSet, operationId: string,
  ingredients: Array<{ itemId: string; quantity: number; unit: string; historicalCostCents: number }>) => {
  const movements = set.movements.filter((entry) => entry.operationId === operationId);
  return movements.length === ingredients.length && ingredients.every((ingredient) => movements.some((movement) =>
    movement.itemId === ingredient.itemId && movement.quantity === ingredient.quantity
      && movement.unit === ingredient.unit && movement.costCents === ingredient.historicalCostCents));
};

export function validateDurableCommercial(set: CommercialSet, context?: DurableFinanceContext): DurableValidation {
  const issues: DurableIssue[] = [];
  const add = (code: string, entity: string, id: string, reference?: string) =>
    issues.push({ code, entity, id, ...(reference ? { reference } : {}) });
  if (!set || !Array.isArray(set.items) || !Array.isArray(set.operations) || !Array.isArray(set.movements))
    return { valid: false, issues: [{ code: 'invalid_collection', entity: 'commercial', id: 'root' }] };
  try { for (const issue of validateCommercialSet(set).issues) add(issue.code, issue.entity, issue.id, issue.reference); }
  catch { add('invalid_stock_structure', 'commercial', 'root'); return { valid: false, issues }; }
  const b = set.business;
  if (!Object.prototype.hasOwnProperty.call(set, 'business')) return { valid: issues.length === 0, issues };
  if (typeof b !== 'object' || Array.isArray(b)) {
    add('invalid_business_structure', 'business', 'root'); return { valid: false, issues };
  }
  if (b.version !== 1 || !currencyCode(b.currency)) add('invalid_version_or_currency', 'business', 'root');
  if (b.purchaseCorrections !== undefined && !Array.isArray(b.purchaseCorrections)) {
    add('invalid_business_structure', 'business', 'root'); return { valid: false, issues };
  }
  if (b.supplierRefundSources !== undefined && !Array.isArray(b.supplierRefundSources)) {
    add('invalid_business_structure', 'business', 'root'); return { valid: false, issues };
  }
  const keys = ['recipes', 'purchases', 'productions', 'sales', 'finishedWastes', 'saleCorrections',
    'moneyEvents', 'refundSources', 'financeLinks', 'eventOrder'] as const;
  if (keys.some((key) => !Array.isArray(b[key])) || !b.finished || !Array.isArray(b.finished.items)
    || !Array.isArray(b.finished.operations) || !Array.isArray(b.finished.movements)) {
    add('invalid_business_structure', 'business', 'root');
    return { valid: false, issues };
  }
  if (b.finished.business) add('nested_business', 'business', 'finished');
  try { for (const issue of validateCommercialSet(b.finished).issues) add(issue.code, `finished_${issue.entity}`, issue.id, issue.reference); }
  catch { add('invalid_finished_structure', 'business', 'finished'); }
  if (issues.length) return { valid: false, issues };
  try {
  for (const key of ['recipes', 'purchases', 'productions', 'sales', 'finishedWastes', 'saleCorrections', 'purchaseCorrections', 'moneyEvents'] as const) {
    if (!b[key]) continue;
    unique(b[key]!, key, add);
    for (const record of b[key]!) if (record.currency !== b.currency) add('currency_mismatch', key, record.id);
  }
  const businessIds = new Set<string>();
  const allBusinessRecords = [b.purchases, b.productions, b.sales, b.finishedWastes, b.saleCorrections, b.purchaseCorrections ?? [], b.moneyEvents];
  for (const records of allBusinessRecords) for (const record of records) {
    if (businessIds.has(record.id)) add('duplicate_business_id', 'business', record.id);
    businessIds.add(record.id);
  }
  const expectedOrders = new Set<string>();
  for (const [kind, records] of [
    ['purchase', b.purchases], ['production', b.productions], ['sale', b.sales],
    ['finished_waste', b.finishedWastes], ['adjustment', b.saleCorrections],
    ['adjustment', b.purchaseCorrections ?? []], ['money', b.moneyEvents],
  ] as const) for (const record of records) expectedOrders.add(`${kind}:${record.id}`);
  const seenOrders = new Set<string>();
  const seenOrderKeys = new Set<string>();
  for (const order of b.eventOrder) {
    const key = `${order.kind}:${order.id}`;
    if (!expectedOrders.has(key)) add('unknown_event_order', 'eventOrder', order.id, order.kind);
    if (seenOrders.has(key)) add('duplicate_event_order', 'eventOrder', order.id);
    if (typeof order.effectiveOrder !== 'string' || !order.effectiveOrder.trim()) add('invalid_event_order', 'eventOrder', order.id);
    else if (seenOrderKeys.has(order.effectiveOrder)) add('ambiguous_event_order', 'eventOrder', order.id);
    if (order.commercialDate !== undefined && !commercialDate(order.commercialDate))
      add('invalid_commercial_date', 'eventOrder', order.id);
    seenOrders.add(key); seenOrderKeys.add(order.effectiveOrder);
  }
  for (const key of expectedOrders) if (!seenOrders.has(key)) add('missing_event_order', 'eventOrder', key);
  const rank = new Map(b.eventOrder.map((entry) => [`${entry.kind}:${entry.id}`, entry.effectiveOrder]));
  for (const operation of [...set.operations, ...b.finished.operations]) {
    if (operation.commercialDate !== undefined && !commercialDate(operation.commercialDate))
      add('invalid_commercial_date', 'operation', operation.id);
  }
  for (const order of b.eventOrder) {
    if (order.commercialDate === undefined) continue;
    const stockOperation = set.operations.find((operation) => operation.id === order.id)
      ?? b.finished.operations.find((operation) => operation.id === order.id);
    if (stockOperation?.commercialDate !== undefined
      && stockOperation.commercialDate !== order.commercialDate)
      add('commercial_date_mismatch', 'eventOrder', order.id);
  }
  const before = (first: string, second: string, entity: string, id: string) => {
    if (rank.has(first) && rank.has(second) && rank.get(first)! >= rank.get(second)!) add('invalid_dependency_order', entity, id, first);
  };
  const purchaseById = new Map(b.purchases.map((entry) => [entry.id, entry]));
  const saleById = new Map(b.sales.map((entry) => [entry.id, entry]));
  const moneyById = new Map(b.moneyEvents.map((entry) => [entry.id, entry]));
  for (const recipe of b.recipes) {
    if (!recipe.name?.trim() || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length
      || !cents(recipe.directCostCents) || (recipe.salePriceCents != null && !positive(recipe.salePriceCents)))
      add('invalid_recipe', 'recipe', recipe.id);
    if (new Set(recipe.ingredients.map((ingredient) => ingredient.itemId)).size !== recipe.ingredients.length)
      add('duplicate_ingredient', 'recipe', recipe.id);
    for (const ingredient of recipe.ingredients) {
      const item = set.items.find((candidate) => candidate.id === ingredient.itemId);
      if (!item) { add('invalid_ingredient', 'recipe', recipe.id, ingredient.itemId); continue; }
      try { receiveStock({ items: [item], movements: [] }, { id: 'validation', itemId: item.id,
        quantity: ingredient.quantity, unit: ingredient.unit, totalCost: 0 }); }
      catch { add('invalid_ingredient', 'recipe', recipe.id, ingredient.itemId); }
    }
  }
  for (const purchase of b.purchases) {
    if (!cents(purchase.amountCents) || !set.items.some((item) => item.id === purchase.itemId)
      || !operationKind(set, purchase.id, 'receipt') || movementCost(set, purchase.id) !== purchase.amountCents)
      add('purchase_stock_mismatch', 'purchase', purchase.id);
  }
  for (const production of b.productions) {
    if (!Number.isSafeInteger(production.units) || production.units <= 0
      || !operationKind(set, production.id, 'consumption') || !operationKind(b.finished, production.id, 'receipt')
      || movementCost(set, production.id) !== production.ingredientCostCents
      || movementCost(b.finished, production.id) !== production.totalCostCents
      || production.ingredientCostCents + production.directCostCents !== production.totalCostCents
      || production.recipeSnapshot?.id !== production.recipeId
      || !ingredientsMatch(set, production.id, production.ingredients)
      || production.recipeSnapshot.directCostCents * production.units !== production.directCostCents)
      add('production_cost_or_stock_mismatch', 'production', production.id);
  }
  for (const sale of b.sales) {
    const book = sale.source === 'prepared' ? b.finished : set;
    const kind = sale.source === 'made_to_order' ? 'consumption' : 'sale';
    if (!['direct', 'prepared', 'made_to_order'].includes(sale.source)
      || !Number.isSafeInteger(sale.units) || sale.units <= 0 || !positive(sale.unitPriceCents)
      || sale.revenueCents !== sale.unitPriceCents * sale.units
      || sale.ingredientCostCents + sale.directCostCents !== sale.totalCostCents
      || sale.grossProfitCents !== sale.revenueCents - sale.totalCostCents
      || !operationKind(book, sale.operationId, kind)
      || movementCost(book, sale.operationId) !== sale.ingredientCostCents
      || (sale.source !== 'direct' && sale.recipeSnapshot?.id !== sale.recipeId)
      || (sale.source === 'direct' && (!sale.itemId || sale.recipeSnapshot !== null))
      || (sale.source === 'made_to_order' && (!ingredientsMatch(set, sale.operationId, sale.ingredients)
        || sale.recipeSnapshot!.directCostCents * sale.units !== sale.directCostCents))
      || (sale.source === 'prepared' && (sale.directCostCents !== 0 || sale.ingredients.length !== 0)))
      add('sale_cost_or_stock_mismatch', 'sale', sale.id);
  }
  const directReturns = new Set(b.saleCorrections.filter((entry) => entry.disposition === 'restock'
    && saleById.get(entry.saleId)?.source === 'direct').map((entry) => entry.id));
  for (const operation of set.operations.filter((entry) => entry.kind === 'receipt'))
    if (!purchaseById.has(operation.id) && !directReturns.has(operation.id))
      add('unattributed_receipt', 'operation', operation.id);
  const preparedReturns = new Set(b.saleCorrections.filter((entry) => entry.disposition === 'restock'
    && saleById.get(entry.saleId)?.source === 'prepared').map((entry) => entry.id));
  for (const operation of b.finished.operations.filter((entry) => entry.kind === 'receipt'))
    if (!b.productions.some((entry) => entry.id === operation.id) && !preparedReturns.has(operation.id))
      add('unattributed_finished_receipt', 'operation', operation.id);
  for (const waste of b.finishedWastes) if (!operationKind(b.finished, waste.id, 'waste')
    || movementCost(b.finished, waste.id) !== waste.costCents
    || !b.finished.items.some((item) => item.id === `finished:${waste.recipeId}`))
    add('finished_waste_mismatch', 'finishedWaste', waste.id);
  const adjustedUnits = new Map<string, number>();
  const adjustedCost = new Map<string, number>();
  for (const adjustment of b.saleCorrections) {
    const sale = saleById.get(adjustment.saleId);
    if (!sale) { add('missing_sale', 'adjustment', adjustment.id, adjustment.saleId); continue; }
    before(`sale:${sale.id}`, `adjustment:${adjustment.id}`, 'adjustment', adjustment.id);
    const units = (adjustedUnits.get(sale.id) ?? 0) + adjustment.units;
    const cost = (adjustedCost.get(sale.id) ?? 0) + adjustment.costCents;
    adjustedUnits.set(sale.id, units); adjustedCost.set(sale.id, cost);
    if (!Number.isSafeInteger(adjustment.units) || adjustment.units <= 0 || units > sale.units
      || !cents(adjustment.costCents) || cost > sale.totalCostCents
      || adjustment.revenueReversalCents !== adjustment.units * sale.unitPriceCents
      || (adjustment.disposition === 'restock'
        && (!operationKind(sale.source === 'direct' ? set : b.finished, adjustment.id, 'receipt')
          || movementCost(sale.source === 'direct' ? set : b.finished, adjustment.id) !== adjustment.costCents)))
      add('invalid_adjustment', 'adjustment', adjustment.id);
  }
  const purchaseAdjustedUnits = new Map<string, number>();
  const purchaseAdjustedCost = new Map<string, number>();
  for (const adjustment of b.purchaseCorrections ?? []) {
    const purchase = purchaseById.get(adjustment.purchaseId);
    if (!purchase) { add('missing_purchase', 'adjustment', adjustment.id, adjustment.purchaseId); continue; }
    before(`purchase:${purchase.id}`, `adjustment:${adjustment.id}`, 'adjustment', adjustment.id);
    const units = (purchaseAdjustedUnits.get(purchase.id) ?? 0) + adjustment.units;
    const cost = (purchaseAdjustedCost.get(purchase.id) ?? 0) + adjustment.costCents;
    purchaseAdjustedUnits.set(purchase.id, units);
    purchaseAdjustedCost.set(purchase.id, cost);
    if (!Number.isSafeInteger(adjustment.units) || adjustment.units <= 0
      || !cents(adjustment.costCents) || cost > purchase.amountCents
      || !operationKind(set, adjustment.id, 'waste')) {
      add('invalid_adjustment', 'adjustment', adjustment.id);
    }
  }
  for (const event of b.moneyEvents) {
    if (!positive(event.amountCents) || !Number.isSafeInteger(event.effectiveOrder) || event.effectiveOrder <= 0
      || !['purchase_payment', 'sale_receipt', 'customer_refund', 'supplier_refund', 'payment_reversal', 'receipt_reversal'].includes(event.purpose)
      || (event.finance.mode !== 'new' && event.finance.mode !== 'existing'))
      add('invalid_money_event', 'money', event.id);
    if (event.purpose === 'purchase_payment' || event.purpose === 'supplier_refund' || event.purpose === 'payment_reversal') {
      if (!purchaseById.has(event.sourceId)) add('missing_purchase', 'money', event.id, event.sourceId);
      else before(`purchase:${event.sourceId}`, `money:${event.id}`, 'money', event.id);
      if (event.purpose === 'payment_reversal') {
        if (!event.reversalOf || !moneyById.has(event.reversalOf)) add('missing_reversal_target', 'money', event.id);
        else before(`money:${event.reversalOf}`, `money:${event.id}`, 'money', event.id);
      }
    } else {
      if (!saleById.has(event.sourceId)) add('missing_sale', 'money', event.id, event.sourceId);
      else before(`sale:${event.sourceId}`, `money:${event.id}`, 'money', event.id);
      if (event.purpose === 'receipt_reversal') {
        if (!event.reversalOf || !moneyById.has(event.reversalOf)) add('missing_reversal_target', 'money', event.id);
        else before(`money:${event.reversalOf}`, `money:${event.id}`, 'money', event.id);
      }
    }
  }
  const moneyByOrder = [...b.moneyEvents].sort((a, c) =>
    (rank.get(`money:${a.id}`) ?? '').localeCompare(rank.get(`money:${c.id}`) ?? ''));
  const priorEvents: typeof b.moneyEvents = [];
  for (const event of moneyByOrder) {
    const eventRank = rank.get(`money:${event.id}`) ?? '';
    if (event.purpose === 'purchase_payment') {
      const purchase = purchaseById.get(event.sourceId);
      const paid = sum(priorEvents.filter((entry) => entry.purpose === 'purchase_payment'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const reversed = sum(priorEvents.filter((entry) => entry.purpose === 'payment_reversal'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const returned = sum(b.purchaseCorrections?.filter((entry) => entry.purchaseId === event.sourceId
        && (rank.get(`adjustment:${entry.id}`) ?? '') < eventRank).map((entry) => entry.costCents) ?? []);
      const active = (purchase?.amountCents ?? 0) - returned;
      if (purchase && (paid - reversed) + event.amountCents > active)
        add('overpaid_purchase', 'money', event.id);
    } else if (event.purpose === 'supplier_refund') {
      const purchase = purchaseById.get(event.sourceId);
      const paid = sum(priorEvents.filter((entry) => entry.purpose === 'purchase_payment'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const reversed = sum(priorEvents.filter((entry) => entry.purpose === 'payment_reversal'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const refunded = sum(priorEvents.filter((entry) => entry.purpose === 'supplier_refund'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const returned = sum(b.purchaseCorrections?.filter((entry) => entry.purchaseId === event.sourceId
        && (rank.get(`adjustment:${entry.id}`) ?? '') < eventRank).map((entry) => entry.costCents) ?? []);
      const active = (purchase?.amountCents ?? 0) - returned;
      const netPaid = Math.max(0, paid - reversed);
      if (purchase && event.amountCents > Math.max(0, netPaid - refunded - active))
        add('premature_or_excess_refund', 'money', event.id);
    } else if (event.purpose === 'payment_reversal') {
      const purchase = purchaseById.get(event.sourceId);
      const paid = sum(priorEvents.filter((entry) => entry.purpose === 'purchase_payment'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const reversed = sum(priorEvents.filter((entry) => entry.purpose === 'payment_reversal'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const refunded = sum(priorEvents.filter((entry) => entry.purpose === 'supplier_refund'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      if (purchase && (paid - reversed - event.amountCents) < refunded)
        add('unbacked_refund_after_reversal', 'money', event.id);
    } else if (event.purpose === 'receipt_reversal') {
      const sale = saleById.get(event.sourceId);
      const received = sum(priorEvents.filter((entry) => entry.purpose === 'sale_receipt'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const reversed = sum(priorEvents.filter((entry) => entry.purpose === 'receipt_reversal'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const refunded = sum(priorEvents.filter((entry) => entry.purpose === 'customer_refund'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      if (sale && (received - reversed - event.amountCents) < refunded)
        add('unbacked_refund_after_reversal', 'money', event.id);
    } else {
      const sale = saleById.get(event.sourceId);
      const adjusted = sum(b.saleCorrections.filter((entry) => entry.saleId === event.sourceId
        && (rank.get(`adjustment:${entry.id}`) ?? '') < eventRank)
        .map((entry) => entry.revenueReversalCents));
      const reversed = sum(priorEvents.filter((entry) => entry.purpose === 'receipt_reversal'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const received = sum(priorEvents.filter((entry) => entry.purpose === 'sale_receipt'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents)) - reversed;
      const refunded = sum(priorEvents.filter((entry) => entry.purpose === 'customer_refund'
        && entry.sourceId === event.sourceId).map((entry) => entry.amountCents));
      const active = (sale?.revenueCents ?? 0) - adjusted;
      if (sale && event.purpose === 'sale_receipt' && event.amountCents > Math.max(0, active - received + refunded))
        add('excess_receipt_at_event', 'money', event.id);
      if (sale && event.purpose === 'customer_refund'
        && event.amountCents > Math.max(0, received - refunded - active))
        add('premature_or_excess_refund', 'money', event.id);
    }
    priorEvents.push(event);
  }
  const session: SandboxMoneySession = { inventory: set, finished: b.finished, purchases: b.purchases,
    productions: b.productions, sales: b.sales, finishedWastes: b.finishedWastes,
    saleCorrections: b.saleCorrections, purchaseCorrections: b.purchaseCorrections, moneyEvents: b.moneyEvents };
  for (const purchase of b.purchases) {
    const balance = sandboxPurchaseBalance(session, purchase.id);
    if (balance && (balance.pendingCents < 0 || balance.refundedCents > balance.paidCents
      || balance.refundedCents > Math.max(0, balance.paidCents - balance.activeAmountCents)))
      add('invalid_purchase_settlement', 'purchase', purchase.id);
  }
  for (const sale of b.sales) {
    const balance = sandboxSaleBalance(session, sale.id);
    if (balance && (balance.activeRevenueCents < 0 || balance.activeSoldCostCents < 0
      || balance.refundedCents > balance.receivedCents
      || balance.refundedCents > Math.max(0, balance.receivedCents - balance.activeRevenueCents)))
      add('invalid_sale_settlement', 'sale', sale.id);
  }
  const refunds = b.moneyEvents.filter((event) => event.purpose === 'customer_refund');
  const allocated = new Map<string, number>();
  const seenRefundSources = new Set<string>();
  for (const source of b.refundSources) {
    if (seenRefundSources.has(source.refundEventId)) add('duplicate_refund_source', 'refund', source.refundEventId);
    seenRefundSources.add(source.refundEventId);
    const refund = moneyById.get(source.refundEventId);
    if (!refund || refund.purpose !== 'customer_refund' || !source.allocations.length
      || sum(source.allocations.map((entry) => entry.amountCents)) !== refund.amountCents)
      add('invalid_refund_source', 'refund', source.refundEventId);
    for (const allocation of source.allocations) {
      const receipt = moneyById.get(allocation.receiptEventId);
      if (!receipt || receipt.purpose !== 'sale_receipt' || !refund || receipt.sourceId !== refund.sourceId
        || !positive(allocation.amountCents)) add('invalid_refund_receipt', 'refund', source.refundEventId, allocation.receiptEventId);
      else {
        before(`money:${receipt.id}`, `money:${refund.id}`, 'refund', refund.id);
        allocated.set(receipt.id, (allocated.get(receipt.id) ?? 0) + allocation.amountCents);
      }
    }
  }
  for (const refund of refunds) if (!seenRefundSources.has(refund.id)) add('missing_refund_source', 'refund', refund.id);
  for (const [receiptId, amount] of allocated) {
    const receipt = moneyById.get(receiptId);
    if (!receipt) continue;
    const reversed = b.moneyEvents
      .filter((e) => e.purpose === 'receipt_reversal' && e.reversalOf === receiptId)
      .reduce((s, e) => s + e.amountCents, 0);
    if (amount > (receipt.amountCents - reversed)) {
      add('overallocated_receipt', 'money', receiptId);
    }
  }

  const supplierRefunds = b.moneyEvents.filter((event) => event.purpose === 'supplier_refund');
  const supplierAllocated = new Map<string, number>();
  const seenSupplierRefundSources = new Set<string>();
  for (const source of b.supplierRefundSources ?? []) {
    if (seenSupplierRefundSources.has(source.refundEventId)) add('duplicate_supplier_refund_source', 'refund', source.refundEventId);
    seenSupplierRefundSources.add(source.refundEventId);
    const refund = moneyById.get(source.refundEventId);
    if (!refund || refund.purpose !== 'supplier_refund' || !source.allocations.length
      || sum(source.allocations.map((entry) => entry.amountCents)) !== refund.amountCents)
      add('invalid_supplier_refund_source', 'refund', source.refundEventId);
    for (const allocation of source.allocations) {
      const payment = moneyById.get(allocation.receiptEventId);
      if (!payment || payment.purpose !== 'purchase_payment' || !refund || payment.sourceId !== refund.sourceId
        || !positive(allocation.amountCents)) add('invalid_refund_payment', 'refund', source.refundEventId, allocation.receiptEventId);
      else {
        before(`money:${payment.id}`, `money:${refund.id}`, 'refund', refund.id);
        supplierAllocated.set(payment.id, (supplierAllocated.get(payment.id) ?? 0) + allocation.amountCents);
      }
    }
  }
  for (const refund of supplierRefunds) if (!seenSupplierRefundSources.has(refund.id)) add('missing_supplier_refund_source', 'refund', refund.id);
  for (const [paymentId, amount] of supplierAllocated) {
    const payment = moneyById.get(paymentId);
    if (!payment) continue;
    const reversed = b.moneyEvents
      .filter((e) => e.purpose === 'payment_reversal' && e.reversalOf === paymentId)
      .reduce((s, e) => s + e.amountCents, 0);
    if (amount > (payment.amountCents - reversed)) {
      add('overallocated_payment', 'money', paymentId);
    }
  }
  const seenTransactions = new Set<string>();
  const seenOrigins = new Set<string>();
  for (const link of b.financeLinks) {
    const event = b.moneyEvents.find((entry) => `commercial:${entry.purpose}:${entry.id}` === link.originKey);
    if (!event || !link.transactionId?.trim()) add('orphan_finance_link', 'financeLink', link.originKey);
    if (seenTransactions.has(link.transactionId) || seenOrigins.has(link.originKey)) add('duplicate_finance_link', 'financeLink', link.originKey);
    seenTransactions.add(link.transactionId); seenOrigins.add(link.originKey);
    if (event?.finance.mode === 'existing' && event.finance.transactionId !== link.transactionId)
      add('finance_reference_mismatch', 'financeLink', link.originKey);
    if (event?.finance.mode === 'new' && link.transactionId !== `commercial:${event.id}`)
      add('finance_reference_mismatch', 'financeLink', link.originKey);
    if (event && context) {
      const result = prevalidateCommercialFinance({ event, session, finance: context.finance,
        resaleInventory: context.resaleInventory, links: b.financeLinks,
        choice: link.choice, sourceCurrency: event.currency });
      if (result.status !== 'linked_verified') add(`finance_${result.status}`, 'financeLink', link.originKey,
        result.status === 'ready' ? undefined : result.code);
    }
  }
  if (context) for (const event of b.moneyEvents.filter((entry) => entry.finance.mode === 'existing')) {
    if (!seenOrigins.has(`commercial:${event.purpose}:${event.id}`))
      add('unverified_existing_reference', 'money', event.id);
  }
  } catch { add('invalid_business_structure', 'business', 'root'); }
  return { valid: issues.length === 0, issues };
}

export interface ReconstructedCommercial {
  session: SandboxMoneySession;
  /** Operational view matching the existing recipe commands; currency remains in the durable history. */
  recipes: SandboxRecipe[];
  refundSources: DurableRefundSource[];
  supplierRefundSources?: DurableRefundSource[];
  financeLinks: DurableFinanceLink[];
  eventOrder: DurableEventOrder[];
  summary: ReturnType<typeof sandboxMoneySummary>;
  stock: Array<{ itemId: string; quantity: number; valueCents: number }>;
  finishedStock: Array<{ itemId: string; quantity: number; valueCents: number }>;
  financeLinksVerified: boolean;
}
export function reconstructDurableCommercial(set: CommercialSet): ReconstructedCommercial | null {
  if (!set.business || !validateDurableCommercial(set).valid) return null;
  const copy = structuredClone(set);
  const b = copy.business!;
  const session: SandboxMoneySession = { inventory: { items: copy.items, operations: copy.operations, movements: copy.movements },
    finished: b.finished, purchases: b.purchases, productions: b.productions, sales: b.sales,
    finishedWastes: b.finishedWastes, saleCorrections: b.saleCorrections,
    ...(b.purchaseCorrections ? { purchaseCorrections: b.purchaseCorrections } : {}),
    moneyEvents: b.moneyEvents };
  const stock = copy.items.map((item) => ({ itemId: item.id, ...stockBalance(sandboxStockBook(session.inventory), item.id) }));
  const finishedStock = b.finished.items.map((item) => ({ itemId: item.id,
    ...stockBalance(sandboxStockBook(b.finished), item.id) }));
  const recipes = b.recipes.map(({ currency: _currency, ...recipe }) => { void _currency; return recipe; });
  return { session, recipes, refundSources: b.refundSources,
    ...(b.supplierRefundSources ? { supplierRefundSources: b.supplierRefundSources } : {}),
    financeLinks: b.financeLinks,
    eventOrder: b.eventOrder, summary: sandboxMoneySummary(session), stock, finishedStock,
    financeLinksVerified: b.financeLinks.length === 0
      && !b.moneyEvents.some((event) => event.finance.mode === 'existing') };
}

function jsonSafe(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  seen.add(value);
  const good = Array.isArray(value) ? Array.from({ length: value.length }, (_, index) => index in value
    && jsonSafe(value[index], seen)).every(Boolean)
    : Object.values(value).every((entry) => jsonSafe(entry, seen));
  seen.delete(value);
  return good;
}
export type DurableCodecResult =
  | { status: 'valid'; set: CommercialSet; reconstructed: ReconstructedCommercial; json: string }
  | { status: 'blocked'; issues: DurableIssue[]; original: unknown };

/** Explicit capture boundary for isolated sessions with known denomination. Never use to label unknown legacy costs. */
export function captureDurableCommercial(input: {
  session: SandboxMoneySession;
  recipes: SandboxRecipe[];
  currency: string;
  eventOrder: DurableEventOrder[];
  refundSources: DurableRefundSource[];
  supplierRefundSources?: DurableRefundSource[];
  financeLinks?: DurableFinanceLink[];
}): DurableCodecResult {
  if (input.session.inventory.business) return { status: 'blocked',
    issues: [{ code: 'already_durable', entity: 'commercial', id: 'root' }], original: input.session };
  let copy: typeof input;
  try { copy = structuredClone(input); }
  catch { return { status: 'blocked', issues: [{ code: 'not_cloneable', entity: 'commercial', id: 'root' }], original: input }; }
  // New sandbox records use the explicit capture context. Recovered records keep
  // their own denomination, including invalid values that validation must reject.
  const denominated = <T extends { id: string }>(records: T[]) => records.map((record) => ({ ...record,
    currency: Object.prototype.hasOwnProperty.call(record, 'currency')
      ? (record as { currency?: string }).currency : copy.currency }));
  const set: CommercialSet = { ...copy.session.inventory, business: {
    version: 1, currency: copy.currency, finished: copy.session.finished ?? { items: [], operations: [], movements: [] },
    recipes: denominated(copy.recipes), purchases: denominated(copy.session.purchases ?? []),
    productions: denominated(copy.session.productions ?? []), sales: denominated(copy.session.sales),
    finishedWastes: denominated(copy.session.finishedWastes ?? []),
    saleCorrections: denominated(copy.session.saleCorrections ?? []),
    ...(copy.session.purchaseCorrections?.length ? { purchaseCorrections: denominated(copy.session.purchaseCorrections) } : {}),
    moneyEvents: denominated(copy.session.moneyEvents ?? []), refundSources: copy.refundSources,
    ...(copy.supplierRefundSources?.length ? { supplierRefundSources: copy.supplierRefundSources } : {}),
    financeLinks: copy.financeLinks ?? [], eventOrder: copy.eventOrder,
  } };
  return serializeDurableCommercial(set);
}

export function serializeDurableCommercial(set: CommercialSet): DurableCodecResult {
  if (!jsonSafe(set)) return { status: 'blocked', issues: [{ code: 'not_json_safe', entity: 'commercial', id: 'root' }], original: set };
  const validation = validateDurableCommercial(set);
  if (!set.business) validation.issues.push({ code: 'missing_business_history', entity: 'business', id: 'root' });
  const reconstructed = validation.valid ? reconstructDurableCommercial(set) : null;
  if (!reconstructed) return { status: 'blocked', issues: validation.issues, original: set };
  return { status: 'valid', set: structuredClone(set), reconstructed, json: JSON.stringify(set) };
}

export function recoverDurableCommercial(json: string, context?: DurableFinanceContext): DurableCodecResult {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { return { status: 'blocked', issues: [{ code: 'invalid_json', entity: 'commercial', id: 'root' }], original: json }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { status: 'blocked', issues: [{ code: 'invalid_collection', entity: 'commercial', id: 'root' }], original: parsed };
  const set = parsed as CommercialSet;
  const validation = validateDurableCommercial(set, context);
  if (!set.business) validation.issues.push({ code: 'missing_business_history', entity: 'business', id: 'root' });
  if (!validation.valid) return { status: 'blocked', issues: validation.issues, original: parsed };
  const reconstructed = reconstructDurableCommercial(set);
  if (!reconstructed) return { status: 'blocked', issues: validation.issues, original: parsed };
  if (context) reconstructed.financeLinksVerified = true;
  return { status: 'valid', set, reconstructed, json };
}
