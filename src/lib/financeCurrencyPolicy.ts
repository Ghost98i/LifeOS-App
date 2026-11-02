import { formatMoney } from './storage';

/** An explicit supported code is evidence; a fallback or normalized guess is not. */
export function confirmedFinancialCurrency(value: unknown): 'UYU' | 'USD' | null {
  return value === 'UYU' || value === 'USD' ? value : null;
}

export function requireFinancialCurrency(value: unknown, kind: 'compromiso' | 'cobro previsto'): 'UYU' | 'USD' {
  const currency = confirmedFinancialCurrency(value);
  if (!currency) throw new Error(`La moneda de este ${kind} no está confirmada. La operación no se realizó.`);
  return currency;
}

export function formatPlannedAmount(amount: number, currency: unknown): string {
  const confirmed = confirmedFinancialCurrency(currency);
  return confirmed ? formatMoney(amount, confirmed) : `${formatMoney(amount, 'UYU', { noSymbol: true })} · moneda sin confirmar`;
}

export const PARTIAL_FINANCE_PROJECTION = 'Proyección parcial: hay pagos o cobros sin moneda confirmada. Las cifras y el gráfico incluyen sólo importes con moneda conocida.';
export const PARTIAL_FINANCE_SUMMARY = 'Cálculo parcial: hay pagos o cobros sin moneda confirmada. El disponible y la proyección son parciales.';
