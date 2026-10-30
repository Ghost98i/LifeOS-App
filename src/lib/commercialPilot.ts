import { captureDurableCommercial, recoverDurableCommercial,
  type DurableEventOrder, type DurableRefundSource, type DurableFinanceLink, type ReconstructedCommercial } from './commercialDurable';
import type { SandboxMoneySession } from './commercialMoneySandbox';
import type { SandboxRecipe } from './commercialRecipeSandbox';

/** Development-only, tab-scoped storage. It never uses a LifeOS user key or cloud document. */
export const COMMERCIAL_PILOT_KEY = 'celestea:dev-commercial-pilot:v1';
/** The current sandbox UI formats all entered prices as Uruguayan pesos. */
export const COMMERCIAL_PILOT_CURRENCY = 'UYU';

export interface CommercialPilotSnapshot {
  currency: string;
  session: SandboxMoneySession;
  recipes: SandboxRecipe[];
  eventOrder: DurableEventOrder[];
  refundSources: DurableRefundSource[];
  supplierRefundSources?: DurableRefundSource[];
  financeLinks?: DurableFinanceLink[];
}

export type CommercialPilotLoad =
  | { status: 'empty'; raw: null }
  | { status: 'ready'; raw: string; snapshot: CommercialPilotSnapshot; reconstructed: ReconstructedCommercial }
  | { status: 'blocked'; raw: string | null; issues: string[] };

export function loadCommercialPilot(storage: Pick<Storage, 'getItem'>): CommercialPilotLoad {
  let raw: string | null;
  try { raw = storage.getItem(COMMERCIAL_PILOT_KEY); }
  catch { return { status: 'blocked', raw: null, issues: ['No se pudo leer el espacio de prueba.'] }; }
  if (raw === null) return { status: 'empty', raw: null };
  try {
    const recovered = recoverDurableCommercial(raw);
    if (recovered.status === 'blocked') return { status: 'blocked', raw,
      issues: recovered.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
    const { session, recipes, eventOrder, refundSources, supplierRefundSources, financeLinks } = recovered.reconstructed;
    return { status: 'ready', raw, reconstructed: recovered.reconstructed,
      snapshot: { currency: recovered.set.business!.currency, session, recipes, eventOrder, refundSources,
        ...(supplierRefundSources?.length ? { supplierRefundSources } : {}),
        ...(financeLinks.length ? { financeLinks } : {}) } };
  } catch { return { status: 'blocked', raw, issues: ['El historial de prueba no pudo interpretarse.'] }; }
}

const eventKinds = [
  ['purchase', 'purchases'], ['production', 'productions'], ['sale', 'sales'],
  ['finished_waste', 'finishedWastes'], ['adjustment', 'saleCorrections'],
  ['adjustment', 'purchaseCorrections'], ['money', 'moneyEvents'],
] as const;

/** Registration order comes from confirmed transitions, never from an ID or commercial date. */
export function advanceCommercialPilot(before: CommercialPilotSnapshot, session: SandboxMoneySession,
  recipes: SandboxRecipe[] = before.recipes): CommercialPilotSnapshot {
  const eventOrder = [...before.eventOrder];
  let sequence = Math.max(0, ...eventOrder.map((entry) => Number(entry.effectiveOrder)));
  if (!Number.isSafeInteger(sequence)) throw new Error('El orden de operaciones de prueba no es válido.');
  for (const [kind, collection] of eventKinds) {
    const known = new Set((before.session[collection] ?? []).map((entry) => entry.id));
    for (const entry of session[collection] ?? []) {
      if (known.has(entry.id)) continue;
      sequence += 1;
      if (!Number.isSafeInteger(sequence)) throw new Error('El orden de operaciones de prueba excede el límite.');
      eventOrder.push({ kind, id: entry.id, effectiveOrder: String(sequence).padStart(12, '0') });
    }
  }
  return { ...before, session, recipes, eventOrder };
}

export type CommercialPilotSave = { status: 'saved'; raw: string; snapshot: CommercialPilotSnapshot }
  | { status: 'blocked'; issues: string[] };

function preservesHistory(previous: ReturnType<typeof recoverDurableCommercial>,
  next: Extract<ReturnType<typeof captureDurableCommercial>, { status: 'valid' }>): boolean {
  if (previous.status !== 'valid' || !previous.set.business || !next.set.business) return false;
  const prefix = (before: unknown[], after: unknown[]) => before.length <= after.length
    && before.every((entry, index) => JSON.stringify(entry) === JSON.stringify(after[index]));
  const old = previous.set;
  const current = next.set;
  const first = old.business;
  const second = current.business;
  return first.currency === second.currency
    && prefix(old.items, current.items) && prefix(old.operations, current.operations)
    && prefix(old.movements, current.movements)
    && prefix(first.finished.items, second.finished.items)
    && prefix(first.finished.operations, second.finished.operations)
    && prefix(first.finished.movements, second.finished.movements)
    && prefix(first.purchases, second.purchases) && prefix(first.productions, second.productions)
    && prefix(first.sales, second.sales) && prefix(first.finishedWastes, second.finishedWastes)
    && prefix(first.saleCorrections, second.saleCorrections)
    && prefix(first.purchaseCorrections ?? [], second.purchaseCorrections ?? [])
    && prefix(first.moneyEvents, second.moneyEvents)
    && prefix(first.refundSources, second.refundSources)
    && prefix(first.supplierRefundSources ?? [], second.supplierRefundSources ?? [])
    && prefix(first.financeLinks, second.financeLinks)
    && prefix(first.eventOrder, second.eventOrder);
}

export function saveCommercialPilot(storage: Pick<Storage, 'getItem' | 'setItem'>,
  expectedRaw: string | null, snapshot: CommercialPilotSnapshot): CommercialPilotSave {
  const captured = captureDurableCommercial(snapshot);
  if (captured.status === 'blocked') return { status: 'blocked',
    issues: captured.issues.map((issue) => `${issue.entity} ${issue.id}: ${issue.code}`) };
  try {
    const currentRaw = storage.getItem(COMMERCIAL_PILOT_KEY);
    if (currentRaw !== expectedRaw)
      return { status: 'blocked', issues: ['El espacio de prueba cambió desde la última lectura. Recargá para revisarlo.'] };
    if (currentRaw !== null) {
      const previous = recoverDurableCommercial(currentRaw);
      if (previous.status !== 'valid')
        return { status: 'blocked', issues: ['El historial guardado necesita revisión y no puede reemplazarse.'] };
      if (!preservesHistory(previous, captured))
        return { status: 'blocked', issues: ['La operación reemplazaría registros históricos del piloto.'] };
    }
    storage.setItem(COMMERCIAL_PILOT_KEY, captured.json);
    if (storage.getItem(COMMERCIAL_PILOT_KEY) !== captured.json)
      return { status: 'blocked', issues: ['El guardado de prueba no pudo verificarse.'] };
  } catch { return { status: 'blocked', issues: ['El almacenamiento de prueba no está disponible.'] }; }
  return { status: 'saved', raw: captured.json, snapshot };
}
