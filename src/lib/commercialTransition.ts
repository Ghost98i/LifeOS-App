import type { LifeOSState } from '../types';
import { validateDurableCommercial } from './commercialDurable';

/** Only explicit commercial commands may append history; generic saves remain fail-closed. */
export function assertCommercialTransition(before: LifeOSState, after: LifeOSState): void {
  const old = before.resale.commercial;
  const next = after.resale.commercial;
  if (!next?.business || !validateDurableCommercial(next, { finance: after.finance,
    resaleInventory: after.resale.inventory }).valid) throw new Error('La operación comercial o su vínculo financiero no es válido.');
  if (old && (!old.business || !validateDurableCommercial(old, { finance: before.finance,
    resaleInventory: before.resale.inventory }).valid)) throw new Error('El historial existente requiere revisión; se conserva íntegro.');
  const prefix = (a: unknown[], b: unknown[]) => a.length <= b.length
    && a.every((entry, index) => JSON.stringify(entry) === JSON.stringify(b[index]));
  if (JSON.stringify(before.resale.inventory) !== JSON.stringify(after.resale.inventory))
    throw new Error('La operación no puede modificar el inventario histórico.');
  if (old?.business) {
    const known = new Set(['version', 'currency', 'finished', 'recipes', 'purchases', 'productions', 'sales',
      'finishedWastes', 'saleCorrections', 'purchaseCorrections', 'moneyEvents', 'refundSources', 'supplierRefundSources', 'financeLinks', 'eventOrder']);
    if (Object.keys(old.business).some(key => !known.has(key)))
      throw new Error('El historial contiene información de otra versión. Se conserva sin reinterpretarlo.');
    if (old.business.currency !== next.business.currency) throw new Error('No se puede cambiar la moneda del historial.');
    for (const key of ['items', 'operations', 'movements'] as const) {
      if (!prefix(old[key], next[key]) || !prefix(old.business.finished[key], next.business.finished[key]))
        throw new Error('La operación reemplazaría existencias históricas.');
    }
    for (const key of ['purchases', 'productions', 'sales', 'finishedWastes', 'saleCorrections', 'purchaseCorrections', 'moneyEvents',
      'refundSources', 'supplierRefundSources', 'financeLinks', 'eventOrder'] as const) {
      if (!prefix((old.business[key] ?? []) as unknown[], (next.business[key] ?? []) as unknown[])) throw new Error('La operación reemplazaría registros históricos.');
    }
  }
  for (const event of next.business.moneyEvents) {
    if (next.business.financeLinks.filter(link => link.originKey === `commercial:${event.purpose}:${event.id}`).length !== 1)
      throw new Error('Falta el movimiento financiero confirmado de la operación.');
  }
}
