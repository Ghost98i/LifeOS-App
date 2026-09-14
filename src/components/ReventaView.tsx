import React, { useState } from 'react';
import type { LifeOSState, ResaleItem } from '../types';
import { resaleStats } from '../lib/calculations';
import { deleteResaleItem, recordResalePurchase, recordResaleSale, resaleProfit } from '../lib/resaleFlows';
import { fmtDate, fmtMoney, todayISO } from '../lib/storage';

interface ReventaViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
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
  const [accountId, setAccountId] = useState(item.saleAccountId || state.finance.accounts[0]?.id || '');
  const [message, setMessage] = useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      onUpdateState((draft) => recordResaleSale(draft, item.id, { sellPrice: Number(price), shippingCost: Number(shippingCost || 0), platformFees: Number(platformFees || 0), taxes: Number(taxes || 0), sellDate: date, accountId }));
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar.'); }
  };
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 sm:grid-cols-4">
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Venta</span><input autoFocus required type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono" /></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Envío</span><input type="number" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono" /></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Plataforma</span><input type="number" value={platformFees} onChange={(event) => setPlatformFees(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono" /></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Impuestos</span><input type="number" value={taxes} onChange={(event) => setTaxes(event.target.value)} placeholder="0" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono" /></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Cuenta</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs">{state.finance.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-faint)]">Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs" /></label>
      <div className="col-span-2 rounded-lg border border-emerald-500/20 bg-[var(--card)] p-2 sm:col-span-2"><span className="block text-[9px] font-bold uppercase text-[var(--text-faint)]">Margen neto estimado</span><strong className={`font-mono text-sm ${Number(price) - item.buyPrice - Number(shippingCost || 0) - Number(platformFees || 0) - Number(taxes || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtMoney(Number(price) - item.buyPrice - Number(shippingCost || 0) - Number(platformFees || 0) - Number(taxes || 0))}</strong></div>
      {message && <p className="col-span-2 text-[11px] font-bold text-red-500 sm:col-span-4">{message}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4"><button className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-extrabold text-white">Confirmar venta</button><button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 text-xs font-bold text-[var(--text-soft)]">Cancelar</button></div>
    </form>
  );
};

export const ReventaView: React.FC<ReventaViewProps> = ({ state, onUpdateState }) => {
  const [item, setItem] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(state.finance.accounts[0]?.id || '');
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const stats = resaleStats(state);
  const stockValue = state.resale.inventory.filter((candidate) => candidate.status === 'comprado').reduce((sum, candidate) => sum + Number(candidate.buyPrice || 0), 0);

  const addPurchase = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      onUpdateState((draft) => recordResalePurchase(draft, { item, buyPrice: Number(buyPrice), buyDate, accountId }));
      setItem(''); setBuyPrice(''); setMessage('✓ Compra registrada también en Finanzas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar.'); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Reventa</h1><p className="text-sm text-[var(--text-soft)]">De la compra al cobro, con la ganancia real y Finanzas sincronizadas.</p></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['📦 Stock', stats.stock], ['💼 Capital en stock', fmtMoney(stockValue)], ['🤝 Ventas', stats.ventas], ['💵 Ganancia realizada', fmtMoney(stats.gananciaTotal)], ['📈 ROI realizado', `${stats.roi.toFixed(0)}%`], ['⏱ Venta promedio', stats.tiempoPromedio == null ? '—' : `${stats.tiempoPromedio.toFixed(0)} d`]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</span><div className="mt-1 text-xl font-extrabold font-mono text-[var(--text)]">{value}</div></div>)}
      </div>

      <section id="qa-focus-reventa" className="space-y-2">
        <div><h2 className="text-sm font-bold text-[var(--text)]">Registrar compra</h2><p className="text-xs text-[var(--text-soft)]">Crea el producto y descuenta el dinero de la cuenta elegida.</p></div>
        <form onSubmit={addPurchase} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3.5">
          <label className="min-w-[170px] flex-1"><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--text-faint)]">Producto</span><input required value={item} onChange={(event) => setItem(event.target.value)} placeholder="Ej.: RTX 3060" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" /></label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--text-faint)]">Compra</span><input required type="number" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} placeholder="0" className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-mono" /></label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--text-faint)]">Cuenta</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs">{state.finance.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase text-[var(--text-faint)]">Fecha</span><input type="date" value={buyDate} onChange={(event) => setBuyDate(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" /></label>
          <button className="rounded-lg bg-[var(--text)] px-4 py-2 text-xs font-extrabold text-[var(--bg-elevated)]">＋ Comprar</button>
        </form>
        {message && <p className="text-xs font-bold text-[var(--text-soft)]">{message}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-[var(--text)]">Operaciones</h2><span className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-bold text-[var(--text-soft)]">{state.resale.inventory.length}</span></div>
        {state.resale.inventory.length === 0 ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-xs text-[var(--text-faint)]">Todavía no registraste compras.</div> : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{[...state.resale.inventory].sort((a, b) => b.buyDate.localeCompare(a.buyDate)).map((candidate) => {
          const profit = resaleProfit(candidate);
          return <article key={candidate.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg)] text-xl">{candidate.status === 'vendido' ? '✓' : '📦'}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-extrabold text-[var(--text)]">{candidate.item}</h3><p className="text-[11px] text-[var(--text-soft)]">Compra {fmtMoney(candidate.buyPrice)} · {fmtDate(candidate.buyDate)}{candidate.purchaseTxId ? ' · ✓ Finanzas' : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${candidate.status === 'vendido' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'}`}>{candidate.status}</span></div>
            {candidate.status === 'vendido' && <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--bg)] p-3 text-xs"><div><span className="block text-[10px] text-[var(--text-faint)]">Cobrado</span><strong className="font-mono">{fmtMoney(candidate.sellPrice)}</strong></div><div><span className="block text-[10px] text-[var(--text-faint)]">Costos</span><strong className="font-mono">{fmtMoney(candidate.fees)}</strong><small className="block text-[9px] text-[var(--text-faint)]">envío {fmtMoney(candidate.shippingCost)} · plataforma {fmtMoney(candidate.platformFees)} · impuestos {fmtMoney(candidate.taxes)}</small></div><div><span className="block text-[10px] text-[var(--text-faint)]">Ganancia</span><strong className={`font-mono ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmtMoney(profit)}</strong><small className="block text-[9px] text-[var(--text-faint)]">{candidate.buyPrice > 0 ? `${(profit / candidate.buyPrice * 100).toFixed(1)}% ROI` : '—'}</small></div></div>}
            {sellingId === candidate.id ? <SellForm item={candidate} state={state} onUpdateState={onUpdateState} onClose={() => setSellingId(null)} /> : <div className="mt-3 flex gap-2"><button onClick={() => setSellingId(candidate.id)} className={`flex-1 rounded-xl py-2 text-xs font-extrabold ${candidate.status === 'vendido' ? 'border border-[var(--border)] text-[var(--text-soft)]' : 'bg-emerald-600 text-white'}`}>{candidate.status === 'vendido' ? 'Editar venta' : 'Registrar venta'}</button><button onClick={() => onUpdateState((draft) => deleteResaleItem(draft, candidate.id))} className="rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--text-faint)] hover:text-red-500">Eliminar</button></div>}
          </article>;
        })}</div>}
      </section>

      {stats.ranking.length > 0 && <section className="space-y-2"><h2 className="text-sm font-bold text-[var(--text)]">Mejores ventas</h2><div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">{stats.ranking.map((candidate, index) => <div key={candidate.id} className="flex items-center gap-3 py-2 text-xs"><span className="font-black text-[var(--text-faint)]">{index + 1}</span><span className="flex-1 font-bold text-[var(--text)]">{candidate.item}</span><span className="font-mono font-bold text-emerald-500">{fmtMoney(resaleProfit(candidate))}</span></div>)}</div></section>}
    </div>
  );
};
