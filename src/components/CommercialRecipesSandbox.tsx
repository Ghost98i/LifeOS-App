import React, { useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CommercialSet } from '../lib/commercialContract';
import type { StockUnit } from '../lib/commercialInventory';
import { estimateSandboxRecipe, suggestedPriceCents, upsertSandboxRecipe, type SandboxRecipe } from '../lib/commercialRecipeSandbox';
import { fmtMoney } from '../lib/storage';
import { previewSandboxSale, type SandboxSale, type SandboxSaleConfirmation, type SandboxSaleRequest } from '../lib/commercialSaleSandbox';
import { finishedStock, previewSandboxFinishedWaste, previewSandboxPreparedSale, previewSandboxProduction, type SandboxFinishedWasteRequest, type SandboxProductionRequest, type SandboxProductionSession } from '../lib/commercialProductionSandbox';
import { previewSandboxSaleAdjustment, type SandboxSaleAdjustmentRequest } from '../lib/commercialCorrectionSandbox';
import { ContextualHelp } from './ContextualHelp';
import { sandboxSaleBalance } from '../lib/commercialMoneySandbox';
import { AppIcon } from './AppIcon';
import { SurfaceCard, SectionHeader, ListDivider } from './ui/SurfacePrimitives';
import { CelestianSwitch } from './ui/CelestianSwitch';

interface IngredientDraft { itemId: string; quantity: string; unit: StockUnit }
interface RecipeDraft { id?: string; name: string; ingredients: IngredientDraft[]; directCost: string; salePrice: string }
const inputClass = 'celestian-clean-field min-h-11 min-w-0 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-500';
const selectClass = `${inputClass} appearance-none pr-9 cursor-pointer`;
const labelClass = 'min-w-0 space-y-1 text-xs font-semibold text-[var(--text-soft)]';
const iconActionBtn = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300 cursor-pointer';
const deleteIconBtn = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-rose-400/60 hover:bg-rose-50 hover:text-rose-600 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer';
const unitLabel: Record<StockUnit, string> = { unit: 'unid.', kg: 'kg', g: 'g' };
const parseNumber = (value: string) => value.trim() ? Number(value.replace(',', '.')) : NaN;
const formatQuantity = (value: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 }).format(value);

function SaleCorrectionSummary({ sale, session, onOpen }: { sale: SandboxSale; session: SandboxProductionSession; onOpen: (saleId: string, kind: 'correction' | 'return') => void }) {
  const corrections = session.saleCorrections?.filter((entry) => entry.saleId === sale.id) ?? [];
  const unitsCorrected = corrections.reduce((total, entry) => total + entry.units, 0);
  const revenueReversed = corrections.reduce((total, entry) => total + entry.revenueReversalCents, 0);
  const costAllocated = corrections.reduce((total, entry) => total + entry.costCents, 0);
  const lossCost = corrections.reduce((total, entry) => total + (entry.physicalLossCostCents ?? 0), 0);
  const activeRevenue = sale.revenueCents - revenueReversed;
  const activeCost = sale.totalCostCents - costAllocated;
  return <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-[var(--text-soft)]">
    <p>Vigente: <strong>{sale.units - unitsCorrected} {sale.units - unitsCorrected === 1 ? 'unidad' : 'unidades'}</strong> · venta {fmtMoney(activeRevenue / 100)} · costo vendido {fmtMoney(activeCost / 100)} · ganancia bruta de ventas {fmtMoney((activeRevenue - activeCost) / 100)}{lossCost > 0 && ` · pérdida física ${fmtMoney(lossCost / 100)} · resultado comercial tras pérdida ${fmtMoney((activeRevenue - activeCost - lossCost) / 100)}`}</p>
    {corrections.map((entry) => <p key={entry.id}>{entry.kind === 'return' ? 'Devolución' : 'Corrección'} · {entry.units} {entry.units === 1 ? 'unidad' : 'unidades'} · importe −{fmtMoney(entry.revenueReversalCents / 100)} · {entry.disposition === 'restock' || !entry.disposition ? 'costo restituido' : 'costo físico no restituido'} {fmtMoney(entry.costCents / 100)}</p>)}
    {unitsCorrected < sale.units && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onOpen(sale.id, 'correction')} className="min-h-10 rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-[#4F46E5] hover:border-[#4F46E5] dark:border-white/[0.08] dark:text-indigo-300 cursor-pointer">Corregir registro</button><button type="button" onClick={() => onOpen(sale.id, 'return')} className="min-h-10 rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-[#4F46E5] hover:border-[#4F46E5] dark:border-white/[0.08] dark:text-indigo-300 cursor-pointer">Registrar devolución</button></div>}
    {sale.source === 'made_to_order' && <p>Los ingredientes utilizados no se restituyen automáticamente.</p>}
  </div>;
}

type SandboxActionResult = { status: 'confirmed' | 'already_confirmed' | 'blocked'; issues?: string[] };
export const CommercialRecipesSandbox: React.FC<{ production?: boolean; inventory: CommercialSet; session: SandboxProductionSession; sales: SandboxSale[];
  recipes: SandboxRecipe[]; onRecipesChange: (next: SandboxRecipe[]) => boolean;
  onConfirmSale: (request: SandboxSaleRequest) => SandboxSaleConfirmation;
  onConfirmProduction: (request: SandboxProductionRequest) => SandboxActionResult;
  onConfirmPreparedSale: (request: SandboxProductionRequest) => SandboxActionResult;
  onConfirmFinishedWaste: (request: SandboxFinishedWasteRequest) => SandboxActionResult;
  onConfirmAdjustment: (request: SandboxSaleAdjustmentRequest) => SandboxActionResult;
}> = ({ production, inventory, session, sales, recipes, onRecipesChange, onConfirmSale, onConfirmProduction, onConfirmPreparedSale, onConfirmFinishedWaste, onConfirmAdjustment }) => {
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [requested, setRequested] = useState<Record<string, string>>({});
  const [targetMargins, setTargetMargins] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, { priceCents: number; unitCostCents: number; margin: string }>>({});
  const [error, setError] = useState('');
  const [pendingSale, setPendingSale] = useState<{ id: string; recipe: SandboxRecipe; unitsText: string; mode: 'made_to_order' | 'production' | 'prepared' } | null>(null);
  const [recentSaleId, setRecentSaleId] = useState<string | null>(null);
  const [saleError, setSaleError] = useState('');
  const [pendingWaste, setPendingWaste] = useState<{ id: string; recipeId: string; recipeName: string; unitsText: string } | null>(null);
  const [wasteError, setWasteError] = useState('');
  const [pendingCorrection, setPendingCorrection] = useState<{ id: string; saleId: string; unitsText: string;
    kind: 'correction' | 'return'; disposition: SandboxSaleAdjustmentRequest['disposition'] | ''; confirmedUndelivered: boolean } | null>(null);
  const [correctionError, setCorrectionError] = useState('');
  const saleCounter = useRef(Math.max(0, ...[
    ...sales.map((sale) => sale.id), ...(session.productions ?? []).map((entry) => entry.id),
    ...(session.finishedWastes ?? []).map((entry) => entry.id),
    ...(session.saleCorrections ?? []).map((entry) => entry.id),
  ].map((id) => Number(id.match(/^sandbox-(?:made_to_order|production|prepared|finished-waste|adjustment)-(\d+)$/)?.[1] ?? 0))));

  const newIngredient = (used: IngredientDraft[]): IngredientDraft => {
    const item = inventory.items.find((candidate) => !used.some((ingredient) => ingredient.itemId === candidate.id)) || inventory.items[0];
    return { itemId: item.id, quantity: '', unit: item.unit };
  };
  const openNew = () => { setDraft({ name: '', ingredients: [newIngredient([])], directCost: '', salePrice: '' }); setError(''); };
  const edit = (recipe: SandboxRecipe) => {
    setPendingSale(null); setSaleError('');
    setPendingWaste(null); setWasteError('');
    setPendingCorrection(null); setCorrectionError('');
    setDraft({ id: recipe.id, name: recipe.name,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, quantity: String(ingredient.quantity) })),
      directCost: recipe.directCostCents ? String(recipe.directCostCents / 100) : '',
      salePrice: recipe.salePriceCents == null ? '' : String(recipe.salePriceCents / 100) });
    setError('');
  };
  const updateIngredient = (index: number, change: Partial<IngredientDraft>) => {
    if (!draft) return;
    setDraft({ ...draft, ingredients: draft.ingredients.map((ingredient, position) => position === index ? { ...ingredient, ...change } : ingredient) });
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    try {
      const next = upsertSandboxRecipe(recipes, inventory, { id: draft.id, name: draft.name,
        ingredients: draft.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, unit: ingredient.unit, quantity: parseNumber(ingredient.quantity) })),
        directCost: draft.directCost.trim() ? parseNumber(draft.directCost) : 0,
        salePrice: draft.salePrice.trim() ? parseNumber(draft.salePrice) : null });
      if (!onRecipesChange(next)) return;
      setDraft(null); setError('');
      if (draft.id) setSuggestions((current) => { const nextSuggestions = { ...current }; delete nextSuggestions[draft.id!]; return nextSuggestions; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la receta.'); }
  };
  const suggest = (recipe: SandboxRecipe, unitCostCents: number) => {
    try {
      const margin = targetMargins[recipe.id] || '';
      const priceCents = suggestedPriceCents(unitCostCents, parseNumber(margin));
      setSuggestions((current) => ({ ...current, [recipe.id]: { priceCents, unitCostCents, margin } })); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Margen objetivo inválido.'); }
  };
  const applySuggestion = (recipe: SandboxRecipe, currentUnitCostCents: number) => {
    const suggestion = suggestions[recipe.id];
    if (!suggestion || suggestion.unitCostCents !== currentUnitCostCents || suggestion.margin !== targetMargins[recipe.id]) return;
    try {
      setPendingSale(null); setSaleError('');
      if (!onRecipesChange(upsertSandboxRecipe(recipes, inventory, { id: recipe.id, name: recipe.name,
        ingredients: recipe.ingredients, directCost: recipe.directCostCents / 100, salePrice: suggestion.priceCents / 100 }))) return;
      setSuggestions((current) => { const next = { ...current }; delete next[recipe.id]; return next; });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo aplicar el precio.'); }
  };
  const openSale = (recipe: SandboxRecipe, unitsText: string, mode: 'made_to_order' | 'production' | 'prepared') => {
    saleCounter.current += 1;
    setPendingWaste(null); setWasteError('');
    setPendingCorrection(null); setCorrectionError('');
    setPendingSale({ id: `sandbox-${mode}-${saleCounter.current}`, recipe: { ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })) }, unitsText, mode });
    setSaleError('');
  };
  const openWaste = (recipe: SandboxRecipe) => {
    saleCounter.current += 1;
    setPendingSale(null); setSaleError(''); setWasteError('');
    setPendingCorrection(null); setCorrectionError('');
    setPendingWaste({ id: `sandbox-finished-waste-${saleCounter.current}`, recipeId: recipe.id,
      recipeName: recipe.name, unitsText: '1' });
  };
  const openCorrection = (saleId: string, kind: 'correction' | 'return') => {
    saleCounter.current += 1;
    setPendingSale(null); setSaleError(''); setPendingWaste(null); setWasteError(''); setCorrectionError('');
    const sale = sales.find((candidate) => candidate.id === saleId)!;
    setPendingCorrection({ id: `sandbox-adjustment-${saleCounter.current}`, saleId, unitsText: '1', kind,
      disposition: kind === 'correction' ? sale.source === 'made_to_order' ? 'retain_consumed' : 'restock'
        : sale.source === 'direct' ? '' : 'discard', confirmedUndelivered: false });
  };
  const correctionRequest: SandboxSaleAdjustmentRequest | null = pendingCorrection ? {
    ...pendingCorrection, disposition: pendingCorrection.disposition as SandboxSaleAdjustmentRequest['disposition'],
    units: parseNumber(pendingCorrection.unitsText) } : null;
  const correctionPreview = correctionRequest ? previewSandboxSaleAdjustment(session, correctionRequest) : null;
  const confirmCorrection = () => {
    if (!correctionRequest || !correctionPreview?.valid) return;
    const result = onConfirmAdjustment(correctionRequest);
    if (result.status === 'blocked') setCorrectionError(result.issues?.join(' ') || 'No se pudo corregir la venta.');
    else { setPendingCorrection(null); setCorrectionError(''); }
  };
  const wastePreview = pendingWaste ? previewSandboxFinishedWaste(session, { ...pendingWaste, units: parseNumber(pendingWaste.unitsText) }) : null;
  const confirmWaste = () => {
    if (!pendingWaste || !wastePreview?.valid) return;
    const result = onConfirmFinishedWaste({ id: pendingWaste.id, recipeId: pendingWaste.recipeId,
      recipeName: pendingWaste.recipeName, units: parseNumber(pendingWaste.unitsText) });
    if (result.status === 'blocked') setWasteError(result.issues?.join(' ') || 'No se pudo registrar la pérdida.');
    else { setPendingWaste(null); setWasteError(''); }
  };
  const salePreview = pendingSale?.mode === 'made_to_order' ? previewSandboxSale(inventory, { id: pendingSale.id, recipe: pendingSale.recipe, units: parseNumber(pendingSale.unitsText) }) : null;
  const productionPreview = pendingSale?.mode === 'production' ? previewSandboxProduction(inventory, { id: pendingSale.id, recipe: pendingSale.recipe, units: parseNumber(pendingSale.unitsText) }) : null;
  const preparedPreview = pendingSale?.mode === 'prepared' ? previewSandboxPreparedSale(session, { id: pendingSale.id, recipe: pendingSale.recipe, units: parseNumber(pendingSale.unitsText) }) : null;
  const confirmSale = () => {
    if (!pendingSale || !(salePreview?.valid || productionPreview?.valid || preparedPreview?.valid)) return;
    try {
      const request = { id: pendingSale.id, recipe: pendingSale.recipe, units: parseNumber(pendingSale.unitsText) };
      const result = pendingSale.mode === 'production' ? onConfirmProduction(request)
        : pendingSale.mode === 'prepared' ? onConfirmPreparedSale(request) : onConfirmSale(request);
      if (result.status === 'blocked') setSaleError(result.issues?.join(' ') || 'La operación no pudo confirmarse.');
      else { if (pendingSale.mode !== 'production' && result.status === 'confirmed') setRecentSaleId(request.id); setPendingSale(null); setSaleError(''); }
    } catch (cause) { setSaleError(cause instanceof Error ? cause.message : 'No se pudo confirmar la simulación.'); }
  };

  return <SurfaceCard className="overflow-hidden" aria-label="Productos y recetas">
    <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <SectionHeader icon={<AppIcon name="list" className="h-4 w-4" />} title="Productos y recetas" />
          <ContextualHelp label="Productos y recetas">Definir una receta no consume insumos ni agrega unidades al stock. Usá «Preparar unidades» cuando corresponda.</ContextualHelp>
        </div>
        {inventory.items.length > 0 && !draft && (
          <button type="button" onClick={openNew} className="min-h-10 shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent cursor-pointer">
            Definir producto
          </button>
        )}
      </div>
    </div>

    <div className="space-y-4 p-4 sm:p-5">
      {inventory.items.length === 0 && <p className="text-sm text-[var(--text-soft)]">Agregá un artículo o insumo para crear una receta.</p>}
      {draft && <form onSubmit={save} className="space-y-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[var(--text)]">{draft.id ? 'Editar receta' : 'Definir producto y receta'}</h4>
          <button type="button" onClick={() => { setDraft(null); setError(''); }} aria-label="Cancelar receta" title="Cancelar" className={iconActionBtn}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <label className={`${labelClass} block`}>Nombre del producto<input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej.: hamburguesa de pollo" className={inputClass} /></label>
        <div className="space-y-2.5"><span className="text-xs font-semibold text-[var(--text-soft)]">Ingredientes por unidad</span>
          {draft.ingredients.map((ingredient, index) => {
            const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
            const allowedUnits: StockUnit[] = item?.unit === 'unit' ? ['unit'] : ['kg', 'g'];
            return <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,0.55fr)_auto]">
              <label className={labelClass}>
                Insumo
                <span className="relative block w-full">
                  <select value={ingredient.itemId} onChange={(event) => { const selected = inventory.items.find((candidate) => candidate.id === event.target.value)!; updateIngredient(index, { itemId: selected.id, unit: selected.unit }); }} className={selectClass}>
                    {inventory.items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                  </select>
                  <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                </span>
              </label>
              <label className={labelClass}>Cantidad<input required type="number" min="0" step="any" value={ingredient.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })} className={`${inputClass} tabular-nums`} /></label>
              <label className={labelClass}>
                Unidad
                <span className="relative block w-full">
                  <select value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value as StockUnit })} className={selectClass}>
                    {allowedUnits.map((candidate) => <option key={candidate} value={candidate}>{unitLabel[candidate]}</option>)}
                  </select>
                  <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                </span>
              </label>
              <button type="button" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, position) => position !== index) })} aria-label="Quitar ingrediente" title="Quitar ingrediente" className={deleteIconBtn}>
                <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>;
          })}
          {draft.ingredients.length < inventory.items.length && <button type="button" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, newIngredient(draft.ingredients)] })} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer"><Plus size={14} strokeWidth={2} aria-hidden="true" /><span>Agregar ingrediente</span></button>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClass}>Otros costos directos por unidad ($U)<input type="number" min="0" step="0.01" value={draft.directCost} onChange={(event) => setDraft({ ...draft, directCost: event.target.value })} placeholder="Opcional, ej.: envase" className={`${inputClass} tabular-nums`} /></label>
          <label className={labelClass}>Precio de venta por unidad ($U)<input type="number" min="0" step="0.01" value={draft.salePrice} onChange={(event) => setDraft({ ...draft, salePrice: event.target.value })} placeholder="Opcional" className={`${inputClass} tabular-nums`} /></label>
        </div>
        <button className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] cursor-pointer">Guardar receta</button>
      </form>}
      {recipes.length > 0 && <ListDivider className="-mx-4 sm:-mx-5">{recipes.map((recipe) => {
        const units = requested[recipe.id] || '1';
        let result: ReturnType<typeof estimateSandboxRecipe> | null = null;
        try { result = estimateSandboxRecipe(inventory, recipe, parseNumber(units)); } catch { /* The field below explains invalid requested quantities. */ }
        const estimate = result?.estimate;
        const suggestion = suggestions[recipe.id];
        const currentSuggestion = estimate && suggestion?.unitCostCents === estimate.unitCostCents && suggestion.margin === targetMargins[recipe.id] ? suggestion.priceCents : null;
        const recentSale = sales.find((sale) => sale.id === recentSaleId && sale.recipeId === recipe.id);
        const recentBalance = recentSale ? sandboxSaleBalance(session, recentSale.id) : null;
        return <article key={recipe.id} className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="min-w-0 break-words text-sm font-semibold text-[var(--text)]">{recipe.name}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSale(recipe, units, 'made_to_order')} className="min-h-10 rounded-xl bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer">Preparar y vender</button>
              <button type="button" onClick={() => openSale(recipe, units, 'production')} className="min-h-10 rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-[#4F46E5] dark:border-white/[0.08] cursor-pointer">Preparar unidades</button>
              {finishedStock(session, recipe.id).quantity > 0 && <>
                <button type="button" onClick={() => openSale(recipe, units, 'prepared')} className="min-h-10 rounded-xl border border-[#4F46E5]/40 px-3 py-1.5 text-xs font-semibold text-[#4F46E5] hover:bg-indigo-50/70 dark:text-indigo-300 dark:hover:bg-indigo-500/10 cursor-pointer">Vender del stock preparado</button>
                <button type="button" onClick={() => openWaste(recipe)} className="min-h-10 rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:border-amber-500/50 dark:border-white/[0.08] dark:text-amber-400 cursor-pointer">Registrar pérdida</button>
              </>}
              <button type="button" onClick={() => edit(recipe)} aria-label={`Editar receta ${recipe.name}`} title="Editar receta" className={iconActionBtn}>
                <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
          {recentBalance && recentBalance.pendingCents > 0 && <p role="status" className="text-sm text-[var(--text-soft)]">Venta registrada · pendiente de cobro {fmtMoney(recentBalance.pendingCents / 100)} · <a href="#commercial-money-sandbox" className="font-semibold text-[#4F46E5] underline-offset-2 hover:underline dark:text-indigo-300">Ir al cobro</a></p>}
          {finishedStock(session, recipe.id).quantity > 0 && <p className="text-sm font-semibold text-[var(--text)]">Preparadas disponibles: {formatQuantity(finishedStock(session, recipe.id).quantity)} · costo en stock {fmtMoney(finishedStock(session, recipe.id).valueCents / 100)}{recipe.salePriceCents != null && ` · venta estimada ${fmtMoney(finishedStock(session, recipe.id).quantity * recipe.salePriceCents / 100)}`}</p>}
          <ul className="space-y-1 text-sm text-[var(--text-soft)]">{recipe.ingredients.map((ingredient) => {
            const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
            const component = estimate?.componentCosts.find((candidate) => candidate.name === item?.name);
            return <li key={ingredient.itemId} className="flex justify-between gap-2"><span>{item?.name || 'Insumo faltante'} · {ingredient.quantity} {unitLabel[ingredient.unit]}</span><span className="shrink-0 tabular-nums">{component ? fmtMoney(component.costCents / 100) : '—'}</span></li>;
          })}{recipe.directCostCents > 0 && <li className="flex justify-between gap-2"><span>Otros costos directos</span><span className="tabular-nums">{fmtMoney(recipe.directCostCents / 100)}</span></li>}</ul>
          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-white/[0.06]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="font-semibold text-[var(--text-soft)]">Ganancia bruta estimada / unidad <span className="font-normal">· antes de gastos generales</span></span><strong className={`text-base font-bold tabular-nums ${estimate?.marginCents != null && estimate.marginCents < 0 ? 'text-rose-700 dark:text-rose-400' : estimate?.marginCents != null && estimate.marginCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>{estimate?.marginCents == null ? '—' : fmtMoney(estimate.marginCents / 100)}</strong></div>
            <div className="grid grid-cols-2 gap-3 text-[var(--text-soft)] sm:grid-cols-3">
              <div className="min-w-0"><span className="flex min-h-10 flex-wrap items-center gap-1 text-xs font-medium">Costo / unidad<ContextualHelp label="Costo estimado por unidad">Suma el costo actual de los ingredientes de una unidad y los otros costos directos configurados. Puede variar si cambia el costo de los insumos.</ContextualHelp></span><strong className="block break-words tabular-nums text-[var(--text)]">{estimate ? fmtMoney(estimate.unitCostCents / 100) : 'Pendiente'}</strong></div>
              <div className="min-w-0"><span className="flex min-h-10 items-center text-xs font-medium">Precio / unidad</span><strong className="block break-words tabular-nums text-[var(--text)]">{recipe.salePriceCents == null ? 'Sin definir' : fmtMoney(recipe.salePriceCents / 100)}</strong></div>
              <div className="min-w-0"><span className="flex min-h-10 flex-wrap items-center gap-1 text-xs font-medium">Margen bruto<ContextualHelp label="Margen bruto estimado">Parte del precio de venta que queda tras restar el costo estimado por unidad. No incluye gastos generales, impuestos ni otros costos no ingresados.</ContextualHelp></span><strong className="block break-words tabular-nums text-[var(--text)]">{estimate?.marginPercent == null ? '—' : `${estimate.marginPercent.toFixed(2)} %`}</strong></div>
            </div>
          </div>
          <label className={`${labelClass} flex items-center gap-2`}>Unidades a evaluar<input type="number" min="1" step="1" value={units} onChange={(event) => setRequested((current) => ({ ...current, [recipe.id]: event.target.value }))} className="celestian-clean-field min-h-10 w-20 rounded-xl border border-slate-200/80 bg-white p-2 text-sm tabular-nums text-[var(--text)] dark:border-white/[0.08] dark:bg-white/[0.03]" /></label>
          {!result && <p className="text-sm text-rose-600 dark:text-rose-400">Ingresá una cantidad entera mayor que cero.</p>}
          {result && result.missingForOne.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">Costo pendiente: reponé {result.missingForOne.join(', ')} para preparar una unidad.</p>}
          {result && result.insufficientForRequest.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">No alcanza el stock para {units} unidades: {result.insufficientForRequest.join(', ')}.</p>}
          {estimate && <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
            <label className={labelClass}>Margen objetivo (%)<input type="number" min="0" max="99.99" step="any" value={targetMargins[recipe.id] || ''} onChange={(event) => { setTargetMargins((current) => ({ ...current, [recipe.id]: event.target.value })); setSuggestions((current) => { const next = { ...current }; delete next[recipe.id]; return next; }); }} placeholder="Ej.: 50" className="celestian-clean-field min-h-10 w-28 rounded-xl border border-slate-200/80 bg-white p-2 text-sm tabular-nums text-[var(--text)] dark:border-white/[0.08] dark:bg-white/[0.03]" /></label>
            <button type="button" onClick={() => suggest(recipe, estimate.unitCostCents)} className="min-h-10 rounded-xl border border-slate-200/80 px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--text)] hover:border-[#4F46E5] dark:border-white/[0.08] cursor-pointer">Sugerir precio</button>
            {currentSuggestion != null && <span className="text-sm text-[var(--text)]">Precio sugerido: <b className="tabular-nums">{fmtMoney(currentSuggestion / 100)}</b> <button type="button" onClick={() => applySuggestion(recipe, estimate.unitCostCents)} className="ml-1 min-h-10 font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer">Usar precio</button></span>}
          </div>}
        </article>;
      })}</ListDivider>}
      {pendingCorrection && correctionPreview && <section className="space-y-3 border-t border-slate-100 pt-4 dark:border-white/[0.06]" aria-label="Vista previa de ajuste de venta">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-semibold text-[var(--text)]">{pendingCorrection.kind === 'return' ? 'Registrar devolución' : 'Corregir registro de venta'}</h4><p className="text-xs text-[var(--text-soft)]">El registro histórico de la venta no se modifica. No se registra dinero.</p></div><button type="button" onClick={() => { setPendingCorrection(null); setCorrectionError(''); }} aria-label="Cancelar ajuste" title="Cancelar" className={iconActionBtn}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button></div>
        <label className={`${labelClass} block max-w-40`}>Unidades {pendingCorrection.kind === 'return' ? 'devueltas' : 'registradas por error'}<input type="number" min="1" step="1" value={pendingCorrection.unitsText} onChange={(event) => { setPendingCorrection({ ...pendingCorrection, unitsText: event.target.value }); setCorrectionError(''); }} className={`${inputClass} tabular-nums`} /></label>
        {pendingCorrection.kind === 'return' && correctionPreview.original?.source === 'direct' && <label className={`${labelClass} block max-w-64`}>Estado del artículo devuelto<span className="relative block w-full"><select value={pendingCorrection.disposition} onChange={(event) => { setPendingCorrection({ ...pendingCorrection, disposition: event.target.value as SandboxSaleAdjustmentRequest['disposition'] }); setCorrectionError(''); }} className={selectClass}><option value="">Elegí el estado</option><option value="restock">Apto para volver a vender</option><option value="discard">Dañado o inutilizable</option></select><ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /></span></label>}
        {pendingCorrection.kind === 'return' && correctionPreview.original?.source !== 'direct' && <p className="text-sm text-[var(--text-soft)]">El producto elaborado devuelto no vuelve al stock vendible. Su costo físico permanece como pérdida.</p>}
        {pendingCorrection.kind === 'correction' && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
            <CelestianSwitch
              checked={pendingCorrection.confirmedUndelivered}
              onChange={(nextChecked) => { setPendingCorrection({ ...pendingCorrection, confirmedUndelivered: nextChecked }); setCorrectionError(''); }}
              ariaLabel={`Confirmo que estas unidades nunca se entregaron${correctionPreview.original?.source !== 'made_to_order' ? ' y siguen aptas para vender' : ''}`}
              size="sm"
              className="mt-0.5"
            />
            <span className="text-xs sm:text-sm text-[var(--text)]">
              Confirmo que estas unidades nunca se entregaron{correctionPreview.original?.source !== 'made_to_order' ? ' y siguen aptas para vender' : ''}.
            </span>
          </div>
        )}
        <p className="text-sm text-[var(--text-soft)]">Quedan {correctionPreview.remainingUnits} unidades de esta venta sin ajustar.</p>
        {correctionPreview.original && <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-white/[0.06] sm:grid-cols-3"><span>Venta original <b className="block tabular-nums">{correctionPreview.original.units} unid. · {fmtMoney(correctionPreview.original.revenueCents / 100)}</b></span><span>Precio histórico por unidad <b className="block tabular-nums">{fmtMoney(correctionPreview.original.unitPriceCents / 100)}</b></span><span>Costo histórico original <b className="block tabular-nums">{fmtMoney(correctionPreview.original.totalCostCents / 100)}</b></span><span>Importe a revertir <b className="block tabular-nums">{correctionPreview.revenueReversalCents == null ? '—' : fmtMoney(correctionPreview.revenueReversalCents / 100)}</b></span><span>Costo histórico asociado <b className="block tabular-nums">{correctionPreview.costCents == null ? '—' : fmtMoney(correctionPreview.costCents / 100)}</b></span><span>Venta vigente <b className="block tabular-nums">{correctionPreview.currentRevenueCents == null ? '—' : fmtMoney(correctionPreview.currentRevenueCents / 100)}</b></span><span>Costo de unidades aún vendidas <b className="block tabular-nums">{correctionPreview.currentSoldCostCents == null ? '—' : fmtMoney(correctionPreview.currentSoldCostCents / 100)}</b></span><span>Pérdida física acumulada <b className="block tabular-nums">{correctionPreview.totalPhysicalLossCents == null ? '—' : fmtMoney(correctionPreview.totalPhysicalLossCents / 100)}</b></span><span>Resultado comercial tras pérdidas <b className="block tabular-nums">{correctionPreview.commercialResultCents == null ? '—' : fmtMoney(correctionPreview.commercialResultCents / 100)}</b></span><span>Stock vendible <b className="inline-flex items-center gap-1 tabular-nums">{correctionPreview.stockAvailable}<ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" className="text-slate-400" />{correctionPreview.stockAfter == null ? '—' : correctionPreview.stockAfter}</b></span></div>}
        {correctionPreview.issues.map((issue, index) => <p key={index} className="text-sm font-semibold text-rose-600 dark:text-rose-400">{issue}</p>)}
        {correctionError && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{correctionError}</p>}
        <button type="button" disabled={!correctionPreview.valid} onClick={confirmCorrection} className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">{pendingCorrection.kind === 'return' ? 'Confirmar devolución' : 'Confirmar corrección'}</button>
      </section>}
      {pendingWaste && wastePreview && <section className="space-y-3 border-t border-slate-100 pt-4 dark:border-white/[0.06]" aria-label="Vista previa de pérdida de productos terminados">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-semibold text-[var(--text)]">Registrar pérdida · {pendingWaste.recipeName}</h4><p className="text-xs text-[var(--text-soft)]">Descuenta solo unidades preparadas. No es una venta, no vuelve a consumir ingredientes y no mueve dinero.</p></div><button type="button" onClick={() => { setPendingWaste(null); setWasteError(''); }} aria-label="Cancelar pérdida" title="Cancelar" className={iconActionBtn}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button></div>
        <label className={`${labelClass} block max-w-40`}>Unidades perdidas<input type="number" min="1" step="1" value={pendingWaste.unitsText} onChange={(event) => { setPendingWaste({ ...pendingWaste, unitsText: event.target.value }); setWasteError(''); }} className={`${inputClass} tabular-nums`} /></label>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"><span>Disponibles <b className="block tabular-nums">{wastePreview.available}</b></span><span>Quedarían <b className="block tabular-nums">{wastePreview.remaining == null ? '—' : wastePreview.remaining}</b></span><span>Valor histórico de la pérdida <b className="block tabular-nums">{wastePreview.costCents == null ? '—' : fmtMoney(wastePreview.costCents / 100)}</b></span></div>
        {wastePreview.issues.map((issue, index) => <p key={index} className="text-sm font-semibold text-rose-600 dark:text-rose-400">{issue}</p>)}
        {wasteError && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{wasteError}</p>}
        <button type="button" disabled={!wastePreview.valid} onClick={confirmWaste} className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">Confirmar pérdida</button>
      </section>}
      {pendingSale && <section className="space-y-3 border-t border-slate-100 pt-4 dark:border-white/[0.06]" aria-label="Vista previa de operación">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-semibold text-[var(--text)]">{pendingSale.mode === 'production' ? 'Preparar unidades' : pendingSale.mode === 'prepared' ? 'Vender del stock preparado' : 'Preparar y vender'} · {pendingSale.recipe.name}</h4><p className="text-xs text-[var(--text-soft)]">{pendingSale.mode === 'production' ? 'Se consumirán ingredientes y se incorporarán unidades terminadas.' : pendingSale.mode === 'prepared' ? 'Se descontarán solo unidades terminadas; los ingredientes no se consumen otra vez.' : 'Se consumirán ingredientes para esta venta.'} La vista previa no cambia existencias ni registra dinero.</p></div><button type="button" onClick={() => { setPendingSale(null); setSaleError(''); }} aria-label="Cancelar operación" title="Cancelar" className={iconActionBtn}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button></div>
        <label className={`${labelClass} block max-w-40`}>Unidades {pendingSale.mode === 'production' ? 'a preparar' : 'a vender'}<input type="number" min="1" step="1" value={pendingSale.unitsText} onChange={(event) => { setPendingSale({ ...pendingSale, unitsText: event.target.value }); setSaleError(''); }} className={`${inputClass} tabular-nums`} /></label>
        {(salePreview || productionPreview) && <div className="space-y-1"><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ingredientes necesarios</h5>{(salePreview?.ingredients || productionPreview?.ingredients || []).map((ingredient) => <div key={ingredient.itemId} className="flex flex-wrap justify-between gap-x-3 border-b border-slate-100 py-1.5 text-sm text-[var(--text-soft)] last:border-0 dark:border-white/[0.06]"><span>{ingredient.name} · {formatQuantity(ingredient.quantity)} {unitLabel[ingredient.unit]}</span><span className="tabular-nums">Disponible {formatQuantity(ingredient.available)} · Quedaría {ingredient.remaining == null ? 'insuficiente' : formatQuantity(ingredient.remaining)} {unitLabel[ingredient.unit]}{ingredient.historicalCostCents == null ? '' : ` · Costo ${fmtMoney(ingredient.historicalCostCents / 100)}`}</span></div>)}</div>}
        {preparedPreview && <p className="text-sm text-[var(--text)]">Terminadas disponibles: {preparedPreview.available} · Quedarían: {preparedPreview.remaining == null ? 'insuficientes' : preparedPreview.remaining}</p>}
        {productionPreview?.valid && <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-white/[0.06] sm:grid-cols-3"><span>Ingredientes <b className="block tabular-nums">{fmtMoney(productionPreview.ingredientCostCents! / 100)}</b></span><span>Otros costos directos <b className="block tabular-nums">{fmtMoney(productionPreview.directCostCents! / 100)}</b></span><span>Costo total de producción <b className="block tabular-nums">{fmtMoney(productionPreview.totalCostCents! / 100)}</b></span></div>}
        {(salePreview?.totals || preparedPreview?.totals) && (() => { const totals = (salePreview?.totals || preparedPreview?.totals)!; return <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-white/[0.06] sm:grid-cols-3">
          <div><span className="block text-xs text-[var(--text-faint)]">Precio unitario</span><strong className="tabular-nums">{fmtMoney(totals.unitPriceCents / 100)}</strong></div>
          <div><span className="block text-xs text-[var(--text-faint)]">Venta comercial</span><strong className="tabular-nums">{fmtMoney(totals.revenueCents / 100)}</strong></div>
          <div><span className="block text-xs text-[var(--text-faint)]">{pendingSale.mode === 'prepared' ? 'Costo de unidades terminadas' : 'Ingredientes'}</span><strong className="tabular-nums">{fmtMoney(totals.ingredientCostCents / 100)}</strong></div>
          <div><span className="block text-xs text-[var(--text-faint)]">{pendingSale.mode === 'prepared' ? 'Costos directos ya incluidos' : 'Otros costos directos'}</span><strong className="tabular-nums">{fmtMoney(totals.directCostCents / 100)}</strong></div>
          <div><span className="block text-xs text-[var(--text-faint)]">Costo comercial total</span><strong className="tabular-nums">{fmtMoney(totals.totalCostCents / 100)}</strong></div>
          <div><span className="block text-xs text-[var(--text-faint)]">Ganancia bruta · margen</span><strong className={`tabular-nums ${totals.grossProfitCents < 0 ? 'text-rose-700 dark:text-rose-400' : totals.grossProfitCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>{fmtMoney(totals.grossProfitCents / 100)} · {totals.grossMarginPercent.toFixed(2)} %</strong></div>
        </div>; })()}
        {(salePreview?.issues || productionPreview?.issues || preparedPreview?.issues || []).map((issue, index) => <p key={index} className="text-sm font-semibold text-rose-600 dark:text-rose-400">{issue}</p>)}
        {saleError && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{saleError}</p>}
        <button type="button" disabled={!(salePreview?.valid || productionPreview?.valid || preparedPreview?.valid)} onClick={confirmSale} className="min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">{pendingSale.mode === 'production' ? 'Confirmar preparación' : production ? 'Guardar venta' : 'Confirmar venta simulada'}</button>
      </section>}
      {(session.productions?.length || sales.length || session.finishedWastes?.length) ? <details className="group border-t border-slate-100 pt-3 text-sm text-[var(--text-soft)] dark:border-white/[0.06]"><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold transition-colors hover:text-[var(--text)] [&::-webkit-details-marker]:hidden"><ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className="transition-transform group-open:rotate-180" /><span>Historial comercial ({(session.productions?.length || 0) + sales.length + (session.finishedWastes?.length || 0)})</span></summary><div className="mt-3 space-y-4">
      {(session.productions?.length || 0) > 0 && <section className="space-y-1" aria-label="Preparaciones"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preparaciones de esta sesión</h3><ListDivider>{[...(session.productions || [])].reverse().map((production) => <article key={production.id} className="py-3 text-sm"><strong>{production.recipeName} · {production.units} unidades</strong><p>Costo histórico: {fmtMoney(production.totalCostCents / 100)} · Ingredientes {fmtMoney(production.ingredientCostCents / 100)} · Otros costos {fmtMoney(production.directCostCents / 100)}</p><details className="group/sub mt-1"><summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold [&::-webkit-details-marker]:hidden"><ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" className="transition-transform group-open/sub:rotate-180" /><span>Ingredientes utilizados</span></summary><ul>{production.ingredients.map((ingredient) => <li key={ingredient.itemId}>{ingredient.name}: {formatQuantity(ingredient.quantity)} {unitLabel[ingredient.unit]} · {fmtMoney(ingredient.historicalCostCents / 100)}</li>)}</ul></details></article>)}</ListDivider></section>}
      {sales.length > 0 && <section className="space-y-1 border-t border-slate-100 pt-4 dark:border-white/[0.06]" aria-label="Ventas registradas"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{production ? 'Ventas' : 'Ventas simuladas'}</h3><ListDivider>{[...sales].reverse().map((sale) => <article key={sale.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="text-[var(--text)]">{sale.recipeName.charAt(0).toUpperCase() + sale.recipeName.slice(1)} · {sale.units} {sale.units === 1 ? 'unidad' : 'unidades'} · {sale.source === 'prepared' ? 'preparadas' : sale.source === 'direct' ? 'venta directa' : 'al momento'}</strong></div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><span>Venta comercial <b className="block tabular-nums">{fmtMoney(sale.revenueCents / 100)}</b></span><span>{sale.source === 'prepared' ? 'Costo de unidades terminadas' : sale.source === 'direct' ? 'Costo del artículo vendido' : 'Costo de ingredientes'} <b className="block tabular-nums">{fmtMoney(sale.ingredientCostCents / 100)}</b></span><span>Costo total <b className="block tabular-nums">{fmtMoney(sale.totalCostCents / 100)}</b></span><span>Ganancia bruta original <b className={`block tabular-nums ${sale.grossProfitCents < 0 ? 'text-rose-700 dark:text-rose-400' : sale.grossProfitCents > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--text)]'}`}>{fmtMoney(sale.grossProfitCents / 100)} · {sale.grossMarginPercent.toFixed(2)} %</b></span></div>{sale.source === 'made_to_order' && <details className="group/sub mt-2 text-[var(--text-soft)]"><summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold [&::-webkit-details-marker]:hidden"><ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" className="transition-transform group-open/sub:rotate-180" /><span>Composición y costos confirmados</span></summary><ul className="mt-1 space-y-1">{sale.ingredients.map((ingredient) => <li key={ingredient.itemId}>{ingredient.name}: {formatQuantity(ingredient.quantity)} {unitLabel[ingredient.unit]} · {fmtMoney(ingredient.historicalCostCents / 100)}</li>)}<li>Otros costos directos: {fmtMoney(sale.directCostCents / 100)}</li></ul></details>}<SaleCorrectionSummary sale={sale} session={session} onOpen={openCorrection} /></article>)}</ListDivider></section>}
      {(session.finishedWastes?.length || 0) > 0 && <section className="space-y-1 border-t border-slate-100 pt-4 dark:border-white/[0.06]" aria-label="Pérdidas de productos terminados"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pérdidas de productos terminados</h3><ListDivider>{[...(session.finishedWastes || [])].reverse().map((waste) => <article key={waste.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><strong>{waste.recipeName}</strong> · {waste.units} {waste.units === 1 ? 'unidad' : 'unidades'} perdidas</span><span>Valor de inventario perdido <b className="tabular-nums">{fmtMoney(waste.costCents / 100)}</b></span></article>)}</ListDivider><p className="text-xs text-[var(--text-faint)]">Este valor es independiente del margen bruto de las ventas; no representa otro pago.</p></section>}
      </div></details> : null}
      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  </SurfaceCard>;
};
