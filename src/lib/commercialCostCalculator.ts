import { exitStock, receiveStock, type StockBook, type StockUnit } from './commercialInventory';
import { fromCents, toCents } from './storage';

export interface CalculatorComponent {
  name: string;
  purchasedQuantity: number;
  purchasedUnit: StockUnit;
  totalCost: number;
  usedQuantity: number;
  usedUnit: StockUnit;
}

export interface CalculatorExtraCost { name: string; amount: number }

export interface UnitCostEstimate {
  componentCosts: Array<{ name: string; costCents: number }>;
  componentsCents: number;
  extrasCents: number;
  unitCostCents: number;
  salePriceCents: number | null;
  marginCents: number | null;
  marginPercent: number | null;
}

function validMoney(value: number, label: string): number {
  const cents = toCents(value);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents) ||
      Math.abs(value - fromCents(cents)) > 1e-9) throw new Error(`${label}: ingresá un importe válido con hasta dos decimales.`);
  return cents;
}

function addCents(a: number, b: number): number {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new Error('El total supera la precisión monetaria admitida.');
  return total;
}

export function calculateUnitCost(input: {
  components: CalculatorComponent[];
  extraCosts?: CalculatorExtraCost[];
  salePrice?: number | null;
}): UnitCostEstimate {
  if (!input.components.length) throw new Error('Agregá al menos un componente.');
  let componentsCents = 0;
  const componentCosts = input.components.map((component, index) => {
    const name = component.name.trim();
    if (!name) throw new Error(`Componente ${index + 1}: indicá un nombre.`);
    const book: StockBook = { items: [{ id: 'item', name, unit: component.purchasedUnit }], movements: [] };
    const received = receiveStock(book, { id: 'receipt', itemId: 'item', quantity: component.purchasedQuantity,
      unit: component.purchasedUnit, totalCost: component.totalCost });
    const consumed = exitStock(received, { id: 'use', itemId: 'item', kind: 'consumption',
      quantity: component.usedQuantity, unit: component.usedUnit });
    const costCents = consumed.movements.at(-1)!.costCents;
    componentsCents = addCents(componentsCents, costCents);
    return { name, costCents };
  });
  const extrasCents = (input.extraCosts || []).reduce((sum, extra, index) =>
    addCents(sum, validMoney(extra.amount, extra.name.trim() || `Costo adicional ${index + 1}`)), 0);
  const unitCostCents = addCents(componentsCents, extrasCents);
  const salePriceCents = input.salePrice == null ? null : validMoney(input.salePrice, 'Precio de venta');
  if (salePriceCents === 0) throw new Error('El precio de venta debe ser mayor que cero.');
  const marginCents = salePriceCents == null ? null : salePriceCents - unitCostCents;
  return { componentCosts, componentsCents, extrasCents, unitCostCents, salePriceCents,
    marginCents, marginPercent: marginCents == null || salePriceCents == null ? null : marginCents / salePriceCents * 100 };
}
