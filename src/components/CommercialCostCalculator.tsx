import React, { useState } from 'react';
import { calculateUnitCost, type CalculatorComponent, type CalculatorExtraCost } from '../lib/commercialCostCalculator';
import type { StockUnit } from '../lib/commercialInventory';
import { fmtMoney, fromCents } from '../lib/storage';
import { PrivacyAmount } from './PrivacyAmount';
import { ContextualHelp } from './ContextualHelp';

interface Row {
  id: string;
  name: string;
  purchasedQuantity: string;
  purchasedUnit: StockUnit;
  totalCost: string;
  usedQuantity: string;
  usedUnit: StockUnit;
}
interface ExtraRow { id: string; name: string; amount: string }

const newRow = (): Row => ({ id: crypto.randomUUID(), name: '', purchasedQuantity: '', purchasedUnit: 'unit', totalCost: '', usedQuantity: '', usedUnit: 'unit' });
const parse = (value: string) => value.trim() === '' ? Number.NaN : Number(value.trim().replace(',', '.'));
const optional = (value: string) => value.trim() === '' ? 0 : parse(value);
const fieldClass = 'min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] tabular-nums';
const labelClass = 'mb-1 block text-[11px] font-semibold text-[var(--text-soft)]';

export function CommercialCostCalculator({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'elaborado' | 'reventa'>('elaborado');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [sellingCost, setSellingCost] = useState('');

  const complete = mode === 'reventa'
    ? purchasePrice.trim() !== ''
    : rows.length > 0 && rows.every((row) => row.name.trim() && row.purchasedQuantity.trim() && row.totalCost.trim() && row.usedQuantity.trim());
  let estimate: ReturnType<typeof calculateUnitCost> | null = null;
  let error = '';
  if (complete) {
    try {
      const components: CalculatorComponent[] = mode === 'reventa'
        ? [{ name: 'Artículo', purchasedQuantity: 1, purchasedUnit: 'unit', totalCost: parse(purchasePrice), usedQuantity: 1, usedUnit: 'unit' }]
        : rows.map((row) => ({ name: row.name, purchasedQuantity: parse(row.purchasedQuantity), purchasedUnit: row.purchasedUnit,
          totalCost: parse(row.totalCost), usedQuantity: parse(row.usedQuantity), usedUnit: row.usedUnit }));
      const extraCosts: CalculatorExtraCost[] = mode === 'reventa'
        ? [{ name: 'Adquisición adicional', amount: optional(acquisitionCost) }, { name: 'Gastos de venta', amount: optional(sellingCost) }]
        : extras.map((extra) => ({ name: extra.name || 'Costo adicional', amount: optional(extra.amount) }));
      estimate = calculateUnitCost({ components, extraCosts, salePrice: salePrice.trim() ? parse(salePrice) : null });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Revisá los valores ingresados.';
    }
  }

  const updateRow = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const updateExtra = (id: string, patch: Partial<ExtraRow>) => setExtras((current) => current.map((extra) => extra.id === id ? { ...extra, ...patch } : extra));

  return <section id="commercial-cost-calculator" aria-labelledby="commercial-cost-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="commercial-cost-title" className="text-base font-extrabold text-[var(--text)]">Calculadora de costos</h2><p className="mt-0.5 text-xs text-[var(--text-soft)]">Estimación temporal · no guarda operaciones ni mueve dinero</p></div>
      <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)]">Cerrar</button>
    </div>

    <div className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1" role="group" aria-label="Tipo de cálculo">
      <button type="button" aria-pressed={mode === 'elaborado'} onClick={() => setMode('elaborado')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'elaborado' ? 'bg-[var(--card)] text-[var(--text)] shadow-sm' : 'text-[var(--text-soft)]'}`}>Producto elaborado</button>
      <button type="button" aria-pressed={mode === 'reventa'} onClick={() => setMode('reventa')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'reventa' ? 'bg-[var(--card)] text-[var(--text)] shadow-sm' : 'text-[var(--text-soft)]'}`}>Reventa</button>
    </div>

    {mode === 'elaborado' ? <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Insumos por producto</h3><button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold text-[var(--blue)]">Agregar insumo</button></div>
      {rows.map((row, index) => <div key={row.id} className="border-b border-[var(--border)] pb-3 last:border-b-0">
        <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs text-[var(--text-soft)]">Insumo {index + 1}</strong><button type="button" onClick={() => setRows((current) => current.filter((candidate) => candidate.id !== row.id))} className="min-h-10 px-2 text-xs font-semibold text-rose-600">Quitar</button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="col-span-2 sm:col-span-5"><span className={labelClass}>Nombre</span><input value={row.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} placeholder="Ej.: carne" className={fieldClass} /></label>
          <label><span className={labelClass}>Cantidad comprada</span><input inputMode="decimal" value={row.purchasedQuantity} onChange={(event) => updateRow(row.id, { purchasedQuantity: event.target.value })} placeholder="2" className={fieldClass} /></label>
          <label><span className={labelClass}>Unidad</span><select value={row.purchasedUnit} onChange={(event) => updateRow(row.id, { purchasedUnit: event.target.value as StockUnit })} className={fieldClass}><option value="unit">unidad</option><option value="g">g</option><option value="kg">kg</option></select></label>
          <label className="col-span-2 sm:col-span-1"><span className={labelClass}>Costo total</span><input inputMode="decimal" value={row.totalCost} onChange={(event) => updateRow(row.id, { totalCost: event.target.value })} placeholder="0" className={fieldClass} /></label>
          <label><span className={labelClass}>Uso por producto</span><input inputMode="decimal" value={row.usedQuantity} onChange={(event) => updateRow(row.id, { usedQuantity: event.target.value })} placeholder="0,1" className={fieldClass} /></label>
          <label><span className={labelClass}>Unidad usada</span><select value={row.usedUnit} onChange={(event) => updateRow(row.id, { usedUnit: event.target.value as StockUnit })} className={fieldClass}><option value="unit">unidad</option><option value="g">g</option><option value="kg">kg</option></select></label>
        </div>
      </div>)}
      {rows.length === 0 && <p className="text-xs text-[var(--text-soft)]">Agregá un insumo para calcular el costo.</p>}
      <div className="flex items-center justify-between gap-3 pt-1"><h3 className="text-sm font-bold">Costos adicionales por unidad</h3><button type="button" onClick={() => setExtras((current) => [...current, { id: crypto.randomUUID(), name: '', amount: '' }])} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold text-[var(--blue)]">Agregar costo</button></div>
      {extras.map((extra) => <div key={extra.id} className="flex flex-wrap items-end gap-2"><label className="min-w-[150px] flex-1"><span className={labelClass}>Concepto</span><input value={extra.name} onChange={(event) => updateExtra(extra.id, { name: event.target.value })} placeholder="Ej.: envase" className={fieldClass} /></label><label className="w-28"><span className={labelClass}>Costo</span><input inputMode="decimal" value={extra.amount} onChange={(event) => updateExtra(extra.id, { amount: event.target.value })} placeholder="0" className={fieldClass} /></label><button type="button" onClick={() => setExtras((current) => current.filter((candidate) => candidate.id !== extra.id))} className="min-h-10 rounded-xl px-2 text-xs font-semibold text-rose-600">Eliminar</button></div>)}
    </div> : <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label><span className={labelClass}>Compra del artículo</span><input inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0" className={fieldClass} /></label>
      <label><span className={labelClass}>Adquisición adicional</span><input inputMode="decimal" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} placeholder="Ej.: envío" className={fieldClass} /></label>
      <label><span className={labelClass}>Gastos de venta</span><input inputMode="decimal" value={sellingCost} onChange={(event) => setSellingCost(event.target.value)} placeholder="Ej.: comisión" className={fieldClass} /></label>
    </div>}

    <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] sm:items-end">
      <label><span className={labelClass}>Precio de venta por unidad</span><input inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0" className={fieldClass} /></label>
      <div aria-live="polite" className="min-w-0 border-l-2 border-[var(--blue)] py-1 pl-3">
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : estimate ? <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-soft)]">{estimate.marginCents == null ? 'Costo estimado por unidad' : 'Ganancia bruta por unidad'}{estimate.marginCents != null && <ContextualHelp label="Ganancia bruta estimada">Precio de venta menos los costos informados por unidad.</ContextualHelp>}</span>
            <strong className={`block text-2xl font-extrabold tabular-nums ${estimate.marginCents != null && estimate.marginCents < 0 ? 'text-rose-600' : 'text-[var(--text)]'}`}><PrivacyAmount>{fmtMoney(fromCents(estimate.marginCents ?? estimate.unitCostCents))}</PrivacyAmount></strong>
          </div>
          {estimate.marginCents != null ? <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-soft)]">
            <span>Costo por unidad <b className="block tabular-nums text-[var(--text)]"><PrivacyAmount>{fmtMoney(fromCents(estimate.unitCostCents))}</PrivacyAmount></b></span>
            <span>Margen sobre venta <b className="block tabular-nums text-[var(--text)]">{estimate.marginPercent!.toFixed(1)}%</b></span>
          </div> : <span className="text-xs text-[var(--text-soft)]">Ingresá un precio para ver la ganancia.</span>}
        </div> : <p className="text-xs text-[var(--text-soft)]">{mode === 'reventa' ? 'Ingresá el precio de compra para calcular.' : 'Completá los datos del insumo para calcular.'}</p>}
      </div>
    </div>
    <p className="mt-2 text-[11px] text-[var(--text-faint)]">Los gastos no informados quedan fuera. El resultado no representa dinero disponible.</p>
    {estimate && <details className="mt-3 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-soft)]">
      <summary className="w-fit cursor-pointer font-semibold hover:text-[var(--text)]">Ver desglose de costos</summary>
      <div className="mt-2 max-w-md space-y-1">
        {mode === 'reventa' ? <div className="flex justify-between gap-3"><span>Compra del artículo</span><span className="tabular-nums"><PrivacyAmount>{fmtMoney(fromCents(estimate.componentsCents))}</PrivacyAmount></span></div> : estimate.componentCosts.map((component, index) => <div key={`${component.name}-${index}`} className="flex justify-between gap-3"><span className="min-w-0 break-words">{component.name}</span><span className="tabular-nums"><PrivacyAmount>{fmtMoney(fromCents(component.costCents))}</PrivacyAmount></span></div>)}
        {estimate.extrasCents > 0 && <div className="flex justify-between gap-3"><span>{mode === 'reventa' ? 'Adquisición y venta' : 'Costos adicionales'}</span><span className="tabular-nums"><PrivacyAmount>{fmtMoney(fromCents(estimate.extrasCents))}</PrivacyAmount></span></div>}
      </div>
    </details>}
  </section>;
}
