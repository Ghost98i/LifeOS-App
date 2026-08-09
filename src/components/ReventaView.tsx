import React, { useState } from 'react';
import { LifeOSState } from '../types';
import {
  todayISO,
  fmtDate,
  fmtMoney,
  uid,
  syncResaleSaleToFinance,
} from '../lib/storage';
import { resaleStats } from '../lib/calculations';

interface ReventaViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const ReventaView: React.FC<ReventaViewProps> = ({ state, onUpdateState }) => {
  const [item, setItem] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState(todayISO());

  const r = resaleStats(state);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim()) return;
    onUpdateState((draft) => {
      draft.resale.inventory.push({
        id: uid(),
        item: item.trim(),
        buyPrice: Number(buyPrice) || 0,
        buyDate: buyDate || todayISO(),
        sellPrice: null,
        sellDate: null,
        status: 'comprado',
        financeTxId: null,
      });
    });
    setItem('');
    setBuyPrice('');
  };

  const handleSetSellPrice = (id: string, priceStr: string) => {
    onUpdateState((draft) => {
      const inv = draft.resale.inventory.find((i) => i.id === id);
      if (inv) {
        inv.sellPrice = priceStr ? Number(priceStr) : null;
        inv.status = inv.sellPrice && inv.sellDate ? 'vendido' : 'comprado';
        syncResaleSaleToFinance(draft, inv);
      }
    });
  };

  const handleSetSellDate = (id: string, dateStr: string) => {
    onUpdateState((draft) => {
      const inv = draft.resale.inventory.find((i) => i.id === id);
      if (inv) {
        inv.sellDate = dateStr || null;
        inv.status = inv.sellPrice && inv.sellDate ? 'vendido' : 'comprado';
        syncResaleSaleToFinance(draft, inv);
      }
    });
  };

  const handleDeleteItem = (id: string) => {
    onUpdateState((draft) => {
      const inv = draft.resale.inventory.find((i) => i.id === id);
      if (inv && inv.financeTxId) {
        draft.finance.transactions = draft.finance.transactions.filter((t) => t.id !== inv.financeTxId);
      }
      draft.resale.inventory = draft.resale.inventory.filter((i) => i.id !== id);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Reventa</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Productos, oportunidades y rentabilidad de tus operaciones.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📦 Stock actual</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{r.stock}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🤝 Ventas</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{r.ventas}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🛒 Compras totales</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{r.compras}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📈 ROI</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{r.roi.toFixed(0)}%</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">💵 Ganancia total</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(r.gananciaTotal)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📊 Ganancia promedio</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(r.gananciaPromedio)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⏱ Tiempo prom. venta</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {r.tiempoPromedio != null ? `${r.tiempoPromedio.toFixed(0)} d` : '—'}
          </div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🆕 Oportunidades</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{r.oportunidadesNuevas}</div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">ver en pestaña IA</p>
        </div>
      </div>

      {/* Form */}
      <div id="qa-focus-reventa" className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Registrar compra</h2>
        <form onSubmit={handleAddItem} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div className="min-w-[160px] flex-1">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Producto</label>
            <input
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ej: RTX 3060"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Precio compra</label>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0"
              className="w-28 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha compra</label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ＋ Agregar
          </button>
        </form>
      </div>

      {/* Inventory Table */}
      <div className="space-y-2">
        <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
          Inventario
          <span className="text-xs font-semibold text-[var(--text-faint)] bg-[var(--bg)] px-2.5 py-0.5 rounded-md border border-[var(--border)]">
            {state.resale.inventory.length}
          </span>
        </h2>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 overflow-x-auto">
          {state.resale.inventory.length === 0 ? (
            <p className="text-center py-8 text-xs text-[var(--text-faint)]">Sin productos cargados.</p>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-faint)] uppercase text-[10px]">
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2">Compra</th>
                  <th className="py-2 px-2">Venta</th>
                  <th className="py-2 px-2">Ganancia</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {[...state.resale.inventory]
                  .sort((a, b) => b.buyDate.localeCompare(a.buyDate))
                  .map((i) => {
                    const ganancia = (i.sellPrice ? Number(i.sellPrice) : 0) - Number(i.buyPrice || 0);
                    return (
                      <tr key={i.id} className="hover:bg-[var(--bg)]/50 transition-colors">
                        <td className="py-2.5 px-2 font-bold text-[var(--text)]">{i.item}</td>
                        <td className="py-2.5 px-2 font-mono">
                          <div>{fmtMoney(i.buyPrice)}</div>
                          <div className="text-[10px] text-[var(--text-faint)]">{fmtDate(i.buyDate)}</div>
                        </td>
                        <td className="py-2.5 px-2 space-y-1">
                          <input
                            type="number"
                            value={i.sellPrice ?? ''}
                            onChange={(e) => handleSetSellPrice(i.id, e.target.value)}
                            placeholder="precio"
                            className="w-24 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
                          />
                          <input
                            type="date"
                            value={i.sellDate ?? ''}
                            onChange={(e) => handleSetSellDate(i.id, e.target.value)}
                            className="w-32 px-2 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] block"
                          />
                        </td>
                        <td
                          className={`py-2.5 px-2 font-mono font-bold ${
                            i.sellPrice
                              ? ganancia > 0
                                ? 'text-emerald-500'
                                : ganancia < 0
                                ? 'text-red-500'
                                : 'text-[var(--text)]'
                              : 'text-[var(--text-faint)]'
                          }`}
                        >
                          {i.sellPrice ? fmtMoney(ganancia) : '—'}
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              i.status === 'vendido'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {i.status}
                          </span>
                          {i.financeTxId && (
                            <div className="text-[10px] text-[var(--text-faint)] mt-0.5">✓ en Finanzas</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <button
                            onClick={() => handleDeleteItem(i.id)}
                            className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1.5 py-1"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top Sales Ranking */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Ranking de mejores ventas</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 divide-y divide-[var(--border)]">
          {r.ranking.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)]">Todavía no hay ventas registradas.</p>
          ) : (
            r.ranking.map((i, idx) => (
              <div key={i.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                <span className="font-bold w-6 text-[var(--text-faint)]">{idx + 1}.</span>
                <span className="flex-1 font-medium text-[var(--text)]">{i.item}</span>
                <span className="font-mono font-bold text-emerald-500">
                  {fmtMoney(Number(i.sellPrice) - Number(i.buyPrice))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
