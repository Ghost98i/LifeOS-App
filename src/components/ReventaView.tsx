import { CommercialWorkspace } from './CommercialWorkspace';
import type { CloudSyncStatus } from '../lib/cloudSync';
import React, { useState } from 'react';
import type { LifeOSState, ResaleItem } from '../types';
import { resaleStats } from '../lib/calculations';
import { deleteResaleItem, planResaleDeletion, recordResalePurchase, recordResaleSale, resaleProfit, type ResaleDeletionPlan } from '../lib/resaleFlows';
import { resaleItemCurrency } from '../lib/resaleMoney';
import { fmtDate, formatMoney, todayISO } from '../lib/storage';
import { PrivacyAmount } from './PrivacyAmount';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { CommercialCostCalculator } from './CommercialCostCalculator';
import { ContextualHelp } from './ContextualHelp';
import { showToast } from '../lib/toast';

const DevInventory = import.meta.env?.DEV ? React.lazy(() => import('./CommercialInventorySandbox').then((module) => ({ default: module.CommercialInventorySandbox }))) : null;
const devCommercialPilot = import.meta.env?.DEV && import.meta.env.VITE_COMMERCIAL_PILOT === '1';
const fmtMoney = (amount: number | null | undefined, currency: string | null = 'UYU') =>
  !currency ? `${formatMoney(amount, 'UYU', { noSymbol: true })} · moneda sin verificar`
    : currency === 'UYU' || currency === 'USD' ? formatMoney(amount, currency)
      : `${currency} ${formatMoney(amount, 'UYU', { noSymbol: true })}`;

interface ReventaViewProps {
  onCommercialUpdate?: (updater: (draft: LifeOSState) => void) => boolean;
  commercialUserId?: string;
  syncStatus?: CloudSyncStatus;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
}

interface SellFormProps {
  item: ResaleItem;
  state: LifeOSState;
  onUpdateState: ReventaViewProps['onUpdateState'];
  onClose: () => void;
}

const SellForm: React.FC<SellFormProps> = ({ item, state, onUpdateState, onClose }) => {
  const [price, setPrice] = useState(item.sellPrice ? String(item.sellPrice) : '');
  const [shippingCost, setShippingCost] = useState(item.shippingCost ? String(item.shippingCost) : '');
  const hasCostBreakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0) > 0;
  const [platformFees, setPlatformFees] = useState(item.platformFees ? String(item.platformFees) : !hasCostBreakdown && item.fees ? String(item.fees) : '');
  const [taxes, setTaxes] = useState(item.taxes ? String(item.taxes) : '');
  const [date, setDate] = useState(item.sellDate || todayISO());
  const [accountId, setAccountId] = useState(item.saleAccountId || state.finance?.accounts?.[0]?.id || '');
  const [message, setMessage] = useState('');
  const purchaseCurrency = resaleItemCurrency(state, item, 'purchase');
  const selectedCurrency = state.finance.accounts.find((account) => account.id === accountId)?.currency || null;
  const comparable = Boolean(purchaseCurrency && selectedCurrency && purchaseCurrency === selectedCurrency);
  const estimate = comparable ? Number(price) - item.buyPrice - Number(shippingCost || 0) - Number(platformFees || 0) - Number(taxes || 0) : null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (onUpdateState((draft) => recordResaleSale(draft, item.id, { sellPrice: Number(price), shippingCost: Number(shippingCost || 0), platformFees: Number(platformFees || 0), taxes: Number(taxes || 0), sellDate: date, accountId })) === false) return;
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar.'); }
  };
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 sm:grid-cols-4">
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Venta</span><input autoFocus required type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs tabular-nums" /></label>
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Envío</span><input type="number" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs tabular-nums" /></label>
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Plataforma</span><input type="number" value={platformFees} onChange={(event) => setPlatformFees(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs tabular-nums" /></label>
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Impuestos</span><input type="number" value={taxes} onChange={(event) => setTaxes(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs tabular-nums" /></label>
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Cuenta</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs">{(state.finance?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs" /></label>
      <div className="col-span-2 rounded-lg border border-emerald-500/20 bg-[var(--card)] p-2 sm:col-span-2"><span className="flex items-center gap-1 text-xs font-bold text-[var(--text-faint)]">Ganancia estimada<ContextualHelp label="Ganancia estimada">Precio de venta menos compra y costos de venta ingresados. No incluye otros gastos del negocio.</ContextualHelp></span><strong className={`tabular-nums text-sm ${estimate !== null && estimate < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-[var(--text)]'}`}><PrivacyAmount>{estimate === null ? 'No comparable entre monedas' : fmtMoney(estimate, selectedCurrency)}</PrivacyAmount></strong></div>
      {message && <p className="col-span-2 text-xs font-bold text-red-500 sm:col-span-4">{message}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4"><button className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-extrabold text-white">Confirmar venta</button><button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 text-xs font-bold text-[var(--text-soft)]">Cancelar</button></div>
    </form>
  );
};

export const ReventaView: React.FC<ReventaViewProps> = ({ state, onUpdateState, onCommercialUpdate, commercialUserId, syncStatus = 'unavailable' as CloudSyncStatus }) => {
  const inventory = state.resale?.inventory || [];
  const hasLegacyInventory = inventory.length > 0;
  const [activeTab, setActiveTab] = useState<'commercial' | 'legacy'>(() => onCommercialUpdate ? 'commercial' : 'legacy');
  const [item, setItem] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(state.finance?.accounts?.[0]?.id || '');
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [deletion, setDeletion] = useState<ResaleDeletionPlan | null>(null);
  const stats = resaleStats(state);
  const availableItems = inventory.filter((candidate) => candidate.status === 'comprado');
  const soldItems = [...inventory].filter((candidate) => candidate.status === 'vendido').sort((a, b) => (b.sellDate || '').localeCompare(a.sellDate || ''));
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showCostCalculator, setShowCostCalculator] = useState(false);
  const [showDevInventory, setShowDevInventory] = useState(false);
  const stockCurrencies = availableItems.map((candidate) => resaleItemCurrency(state, candidate, 'purchase'));
  const stockCurrency = stockCurrencies.length > 0 && stockCurrencies.every((value) => value && value === stockCurrencies[0]) ? stockCurrencies[0] : null;
  const stockValue = availableItems.length === 0 ? 0 : stockCurrency ? availableItems.reduce((sum, candidate) => sum + Number(candidate.buyPrice || 0), 0) : null;

  const requestDeletion = (itemId: string) => {
    try { setDeletion(planResaleDeletion(state, itemId)); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se puede eliminar este artículo.'); }
  };
  const confirmDeletion = () => {
    if (!deletion) return;
    try {
      const saved = onUpdateState((draft) => deleteResaleItem(draft, deletion.itemId, deletion));
      if (saved === false) { setMessage('La eliminación no quedó guardada; revisá el aviso de almacenamiento.'); return; }
      setDeletion(null);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el artículo.'); }
  };

  const addPurchase = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const saved = onUpdateState((draft) => recordResalePurchase(draft, { item, buyPrice: Number(buyPrice), buyDate, accountId }));
      setShowPurchaseForm(false);
      if (saved === false) {
        showToast('No se pudo confirmar el guardado. Revisá el inventario antes de reintentar la compra.', 'error');
      } else {
        setItem(''); setBuyPrice(''); setMessage('');
        showToast('Compra registrada en Mi negocio y Finanzas.', 'success');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar.'); }
  };

  const openDevInventory = () => {
    setShowPurchaseForm(false);
    setSellingId(null);
    setShowCostCalculator(false);
    setShowDevInventory(true);
  };

  return (
    <div className="product-refinement space-y-6">
      <PageHeader
        title="Mi negocio"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={showCostCalculator}
              aria-controls="commercial-cost-calculator"
              onClick={() => setShowCostCalculator((current) => !current)}
              className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
            >
              Calcular costos
            </button>
          </div>
        }
      />

      {showCostCalculator && <CommercialCostCalculator onClose={() => setShowCostCalculator(false)} />}

      {hasLegacyInventory && onCommercialUpdate && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('commercial')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'commercial'
                ? 'bg-[var(--blue)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Operaciones comerciales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('legacy')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'legacy'
                ? 'bg-[var(--blue)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Inventario histórico anterior ({inventory.length})
          </button>
        </div>
      )}

      {activeTab === 'commercial' && onCommercialUpdate ? (
        <CommercialWorkspace
          state={state}
          userId={commercialUserId}
          syncStatus={syncStatus}
          onUpdate={onCommercialUpdate}
          onClose={hasLegacyInventory ? () => setActiveTab('legacy') : undefined}
        />
      ) : (
        <div className="space-y-6">
          {onCommercialUpdate && (
            <button
              type="button"
              onClick={() => setActiveTab('commercial')}
              className="rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-bold text-white hover:opacity-95"
            >
              ← Ir a operaciones comerciales
            </button>
          )}

          {inventory.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex flex-wrap gap-x-7 gap-y-2">
                <div><span className="block text-xs font-bold text-[var(--text-faint)]">Disponibles</span><strong className="text-lg tabular-nums">{stats.stock}</strong></div>
                <div><span className="flex items-center gap-1 text-xs font-bold text-[var(--text-faint)]">Capital en stock<ContextualHelp label="Capital en stock">Suma el precio de compra de los productos disponibles cuando comparten moneda. Es mercadería, no dinero disponible.</ContextualHelp></span><strong className="text-lg tabular-nums"><PrivacyAmount>{availableItems.length === 0 ? 'Sin stock' : stockValue === null ? 'No comparable entre monedas' : fmtMoney(stockValue, stockCurrency)}</PrivacyAmount></strong></div>
                <div><span className="block text-xs font-bold text-[var(--text-faint)]">Vendidos</span><strong className="text-lg tabular-nums">{stats.ventas}</strong></div>
                <div><span className="flex items-center gap-1 text-xs font-bold text-[var(--text-faint)]">Ganancia realizada<ContextualHelp label="Ganancia realizada">Ventas menos compra y costos de venta, solo si las monedas son comparables. No incluye otros gastos.</ContextualHelp></span><strong className={`text-lg tabular-nums ${stats.gananciaTotal !== null && stats.gananciaTotal < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-[var(--text)]'}`}><PrivacyAmount>{stats.gananciaTotal === null ? 'No comparable entre monedas' : fmtMoney(stats.gananciaTotal, stats.profitCurrency)}</PrivacyAmount></strong></div>
              </div>
              <details className="text-xs text-[var(--text-soft)]"><summary className="cursor-pointer font-bold">Más métricas</summary><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1">Ganancia / costo total {stats.roi === null ? 'No comparable' : `${stats.roi.toFixed(0)}%`}<ContextualHelp label="Ganancia sobre costo total">Divide la ganancia por el precio de compra más los costos de venta registrados.</ContextualHelp></span><span>Tiempo promedio de venta {stats.tiempoPromedio == null ? '—' : `${stats.tiempoPromedio.toFixed(0)} d`}</span>{stats.ranking.length > 0 && <span>Mejores ventas: {stats.ranking.map((candidate) => candidate.item).join(', ')}</span>}</div></details>
            </div>
          )}

          {inventory.length === 0 && !showPurchaseForm && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
              <h2 className="text-base font-extrabold text-[var(--text)]">Empezá por registrar una compra</h2>
              <p className="mt-1 text-sm text-[var(--text-soft)]">Actividad disponible: compraventa y reventa.</p>
              <button id="qa-focus-reventa" onClick={() => setShowPurchaseForm(true)} className="mt-4 rounded-xl bg-[var(--blue)] px-4 py-2.5 text-sm font-bold text-white">Registrar compra</button>
            </section>
          )}

          {inventory.length > 0 && !showPurchaseForm && (
            <button id="qa-focus-reventa" onClick={() => setShowPurchaseForm(true)} className="rounded-xl bg-[var(--blue)] px-4 py-2.5 text-sm font-bold text-white">Registrar compra</button>
          )}

          {showPurchaseForm && (
            <section id="qa-focus-reventa" className="space-y-2">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-[var(--text)]">Registrar compra</h2><button type="button" onClick={() => { setShowPurchaseForm(false); setMessage(''); }} className="text-xs font-semibold text-[var(--text-soft)]">Cerrar</button></div>
              <form onSubmit={addPurchase} className="flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <label className="min-w-[170px] flex-1"><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Producto</span><input required value={item} onChange={(event) => setItem(event.target.value)} placeholder="Ej.: RTX 3060" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)]" /></label>
                <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Compra</span><input required type="number" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} placeholder="0" className="w-28 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs tabular-nums" /></label>
                <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Cuenta</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs">{(state.finance?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                <label><span className="mb-1 block text-xs font-bold text-[var(--text-faint)]">Fecha</span><input type="date" value={buyDate} onChange={(event) => setBuyDate(event.target.value)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" /></label>
                <button className="rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-bold text-white">Comprar</button>
              </form>{message && <p className="text-xs font-bold text-[var(--blue)]">{message}</p>}
            </section>
          )}

          {inventory.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-[var(--text)]">Inventario disponible</h2>
                <span className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-bold text-[var(--text-soft)]">{availableItems.length}</span>
              </div>
              {availableItems.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay productos disponibles.</p> : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {[...availableItems].sort((a, b) => b.buyDate.localeCompare(a.buyDate)).map((candidate) => {
                    const profit = resaleProfit(candidate, state);
                    return (
                      <article key={candidate.id} className="lifeos-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--blue)]">
                            <AppIcon name={candidate.status === 'vendido' ? 'checkCircle' : 'product'} className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-extrabold text-[var(--text)]">{candidate.item}</h3>
                            <p className="text-xs text-[var(--text-soft)]">
                              Compra <PrivacyAmount>{fmtMoney(candidate.buyPrice, resaleItemCurrency(state, candidate, 'purchase'))}</PrivacyAmount> · {fmtDate(candidate.buyDate)}{candidate.purchaseTxId ? ' · ✓ Finanzas' : ''}
                            </p>
                          </div>
                          <span className={`lifeos-badge ${candidate.status === 'vendido' ? 'lifeos-badge-success' : 'lifeos-badge-info'}`}>
                            {candidate.status}
                          </span>
                        </div>
                        {candidate.status === 'vendido' && (
                          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-muted)] p-3 text-xs">
                            <div>
                              <span className="block text-xs text-[var(--text-faint)]">Cobrado</span>
                              <strong className="tabular-nums"><PrivacyAmount>{fmtMoney(candidate.sellPrice, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount></strong>
                            </div>
                            <div>
                              <span className="block text-xs text-[var(--text-faint)]">Costos</span>
                              <strong className="tabular-nums"><PrivacyAmount>{fmtMoney(candidate.fees, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount></strong>
                              <small className="block text-xs text-[var(--text-faint)]">envío <PrivacyAmount>{fmtMoney(candidate.shippingCost, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount> · plataforma <PrivacyAmount>{fmtMoney(candidate.platformFees, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount> · impuestos <PrivacyAmount>{fmtMoney(candidate.taxes, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount></small>
                            </div>
                            <div>
                              <span className="block text-xs text-[var(--text-faint)]">Ganancia</span>
                              <strong className={`tabular-nums ${profit !== null && profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}><PrivacyAmount>{profit === null ? 'No comparable' : fmtMoney(profit, resaleItemCurrency(state, candidate, 'sale'))}</PrivacyAmount></strong>
                              <small className="block text-xs text-[var(--text-faint)]">{profit !== null && candidate.buyPrice > 0 ? `${(profit / candidate.buyPrice * 100).toFixed(1)}% sobre compra` : '—'}</small>
                            </div>
                          </div>
                        )}
                        {sellingId === candidate.id ? (
                          <SellForm item={candidate} state={state} onUpdateState={onUpdateState} onClose={() => setSellingId(null)} />
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => setSellingId(candidate.id)}
                              className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                                candidate.status === 'vendido'
                                  ? 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)]'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                              }`}
                            >
                              {candidate.status === 'vendido' ? 'Editar venta' : 'Registrar venta'}
                            </button>
                            <button
                              onClick={() => requestDeletion(candidate.id)}
                              className="flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--text-faint)] hover:text-red-500 hover:border-red-400 transition-colors cursor-pointer"
                              title="Eliminar registro"
                              aria-label="Eliminar registro"
                            >
                              <AppIcon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {soldItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-[var(--text)]">Ventas realizadas</h2>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {soldItems.map((candidate) => {
                  const profit = resaleProfit(candidate, state);
                  const purchaseCurrency = resaleItemCurrency(state, candidate, 'purchase');
                  const saleCurrency = resaleItemCurrency(state, candidate, 'sale');
                  return (
                    <article key={candidate.id} className="lifeos-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-extrabold text-[var(--text)]">{candidate.item}</h3>
                          <p className="text-xs text-[var(--text-soft)]">Compra <PrivacyAmount>{fmtMoney(candidate.buyPrice, purchaseCurrency)}</PrivacyAmount> · Venta <PrivacyAmount>{fmtMoney(candidate.sellPrice, saleCurrency)}</PrivacyAmount> · {fmtDate(candidate.sellDate || candidate.buyDate)}</p>
                        </div>
                        <span className="lifeos-badge lifeos-badge-success">Vendido</span>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
                        <span>Costos <PrivacyAmount>{fmtMoney(candidate.fees, saleCurrency)}</PrivacyAmount></span>
                        <strong className={profit !== null && profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>Ganancia <PrivacyAmount>{profit === null ? 'No comparable entre monedas' : fmtMoney(profit, saleCurrency)}</PrivacyAmount></strong>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">Envío <PrivacyAmount>{fmtMoney(candidate.shippingCost, saleCurrency)}</PrivacyAmount> · Plataforma <PrivacyAmount>{fmtMoney(candidate.platformFees, saleCurrency)}</PrivacyAmount> · Impuestos <PrivacyAmount>{fmtMoney(candidate.taxes, saleCurrency)}</PrivacyAmount> · Ganancia / compra {profit !== null && candidate.buyPrice > 0 ? `${(profit / candidate.buyPrice * 100).toFixed(1)}%` : '—'}</p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setSellingId(candidate.id)} className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-bold">Editar venta</button>
                        <button onClick={() => requestDeletion(candidate.id)} className="rounded-xl border border-[var(--border)] px-3 text-xs">Eliminar</button>
                      </div>
                      {sellingId === candidate.id && <SellForm item={candidate} state={state} onUpdateState={onUpdateState} onClose={() => setSellingId(null)} />}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {deletion && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div role="dialog" aria-modal="true" aria-label="Confirmar eliminación de Reventa" className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[var(--card)] p-4 text-sm text-[var(--text)] shadow-xl">
                <h2 className="font-bold">Eliminar «{deletion.itemName}»</h2>
                <p className="mt-1 text-xs text-[var(--text-soft)]">Se quitará el artículo y su historial de compra y venta en Mi negocio.</p>
                {deletion.transactions.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-bold">También se eliminarán estos movimientos de Finanzas y cambiarán los saldos de sus cuentas:</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {deletion.transactions.map((tx) => <li key={tx.id}>{tx.label}: <PrivacyAmount>{fmtMoney(tx.amount, tx.currency)}</PrivacyAmount></li>)}
                    </ul>
                  </>
                )}
                {message && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{message}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={confirmDeletion} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white">Eliminar artículo y movimientos indicados</button>
                  <button type="button" onClick={() => setDeletion(null)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold">Cancelar</button>
                </div>
              </div>
            </div>
          )}
          {message && !showPurchaseForm && <p role="alert" className="text-xs font-semibold text-rose-600">{message}</p>}
        </div>
      )}

      {DevInventory && (
        <div className="pt-6 border-t border-[var(--border)]">
          {showDevInventory ? (
            <div className="space-y-3 rounded-2xl border-2 border-dashed border-amber-500/50 bg-amber-500/5 p-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Sandbox de prueba aislado (solo desarrollo · sin persistencia en Finanzas ni nube)
                </span>
                <button
                  type="button"
                  onClick={() => setShowDevInventory(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold"
                >
                  Cerrar sandbox
                </button>
              </div>
              <React.Suspense fallback={null}>
                <DevInventory onClose={() => setShowDevInventory(false)} pilotEnabled={devCommercialPilot} />
              </React.Suspense>
            </div>
          ) : (
            <div className="text-center">
              <button
                type="button"
                onClick={openDevInventory}
                className="text-xs font-semibold text-[var(--text-faint)] hover:text-amber-600 transition-colors"
              >
                🛠 Abrir sandbox de prueba aislado (solo desarrollo)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
