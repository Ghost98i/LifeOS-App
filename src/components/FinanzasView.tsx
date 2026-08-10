import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { LifeOSState, Transaction } from '../types';
import { playSound } from '../lib/audio';
import {
  todayISO,
  fmtDate,
  fmtMoney,
  sameYear,
  uid,
} from '../lib/storage';
import {
  calcAccountsTotal,
  calcNetWorth,
  calcSpentMonth,
  calcIncomeMonth,
  calcFixedSpentMonth,
  calcMonthComparison,
  calcSpentByCategory,
  calcSpentByCategoryAllTime,
  calcSubscriptionsTotal,
  calcDebtsTotal,
  calcInvestmentsTotal,
  groupTransactionsByMonth,
  resaleStats,
  adjustAccountBalance,
  defaultAccountId,
} from '../lib/calculations';
import { FinanceOperationsCard } from './FinanceOperationsCard';

interface FinanzasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  initialTransactionType?: 'gasto' | 'ingreso';
}

export const FinanzasView: React.FC<FinanzasViewProps> = ({
  state,
  onUpdateState,
  initialTransactionType = 'gasto',
}) => {
  const [txType, setTxType] = useState<'gasto' | 'ingreso'>(initialTransactionType);
  const [txAmount, setTxAmount] = useState('');
  const [txAccount, setTxAccount] = useState<string>(defaultAccountId(state) || '');
  const [txCategory, setTxCategory] = useState<string>(state.finance.categories[0] || 'Comida');
  const [txFixed, setTxFixed] = useState<'variable' | 'fijo'>('variable');
  const [txDate, setTxDate] = useState(todayISO());
  const [txNote, setTxNote] = useState('');

  // Accounts, Subs, Debts, Invs forms
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState('');

  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');

  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');

  const [invName, setInvName] = useState('');
  const [invAmount, setInvAmount] = useState('');

  useEffect(() => {
    setTxType(initialTransactionType);
  }, [initialTransactionType]);

  const disponible = calcAccountsTotal(state);
  const patrimonio = calcNetWorth(state);
  const gastado = calcSpentMonth(state, 0);
  const ingreso = calcIncomeMonth(state, 0);
  const balance = ingreso - gastado;
  const cmp = calcMonthComparison(state);
  const catSpent = calcSpentByCategory(state, 0);
  const subsTotal = calcSubscriptionsTotal(state);
  const rstats = resaleStats(state);
  const ref = new Date();
  const totalGastadoAnio = state.finance.transactions
    .filter((t) => t.type === 'gasto' && t.origin !== 'adjustment' && sameYear(t.date, ref))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const fijoMes = calcFixedSpentMonth(state, 0);
  const margenDiscrecional = disponible - fijoMes;

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(txAmount);
    if (!amountNum) return;
    const accountId = txAccount || defaultAccountId(state);

    playSound('coins');

    onUpdateState((draft) => {
      draft.finance.transactions.push({
        id: uid(),
        type: txType,
        amount: amountNum,
        category: txCategory,
        fixed: txFixed,
        date: txDate || todayISO(),
        note: txNote.trim(),
        accountId,
      });
      adjustAccountBalance(draft, accountId, txType === 'ingreso' ? amountNum : -amountNum);
    });

    setTxAmount('');
    setTxNote('');
  };

  const handleDeleteTx = (id: string) => {
    onUpdateState((draft) => {
      const tx = draft.finance.transactions.find((t) => t.id === id);
      if (tx) {
        adjustAccountBalance(
          draft,
          tx.accountId,
          tx.type === 'ingreso' ? -Number(tx.amount) : Number(tx.amount)
        );
      }
      draft.finance.transactions = draft.finance.transactions.filter((t) => t.id !== id);
    });
  };

  const handleSetBudget = (category: string, amountStr: string) => {
    onUpdateState((draft) => {
      draft.finance.budgets[category] = Number(amountStr) || 0;
    });
  };

  // Sub-items forms
  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    onUpdateState((draft) => {
      draft.finance.accounts.push({
        id: uid(),
        name: accName.trim(),
        balance: Number(accBalance) || 0,
      });
    });
    setAccName('');
    setAccBalance('');
  };

  const handleDeleteAccount = (id: string) => {
    onUpdateState((draft) => {
      draft.finance.accounts = draft.finance.accounts.filter((a) => a.id !== id);
    });
  };

  const handleAddSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;
    onUpdateState((draft) => {
      draft.finance.subscriptions.push({
        id: uid(),
        name: subName.trim(),
        amount: Number(subAmount) || 0,
      });
    });
    setSubName('');
    setSubAmount('');
  };

  const handleDeleteSubscription = (id: string) => {
    onUpdateState((draft) => {
      draft.finance.subscriptions = draft.finance.subscriptions.filter((s) => s.id !== id);
    });
  };

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtName.trim()) return;
    onUpdateState((draft) => {
      draft.finance.debts.push({
        id: uid(),
        name: debtName.trim(),
        amount: Number(debtAmount) || 0,
      });
    });
    setDebtName('');
    setDebtAmount('');
  };

  const handleDeleteDebt = (id: string) => {
    onUpdateState((draft) => {
      draft.finance.debts = draft.finance.debts.filter((d) => d.id !== id);
    });
  };

  const handleAddInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim()) return;
    onUpdateState((draft) => {
      draft.finance.investments.push({
        id: uid(),
        name: invName.trim(),
        amount: Number(invAmount) || 0,
      });
    });
    setInvName('');
    setInvAmount('');
  };

  const handleDeleteInvestment = (id: string) => {
    onUpdateState((draft) => {
      draft.finance.investments = draft.finance.investments.filter((i) => i.id !== id);
    });
  };

  const monthGroups = groupTransactionsByMonth(state);

  const CHART_COLORS = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
    '#6366f1',
    '#14b8a6',
  ];

  const pieDataThisMonth = Object.entries(catSpent)
    .filter(([, val]) => val > 0)
    .map(([name, value]) => ({ name, value }));

  const allTimeSpent = calcSpentByCategoryAllTime(state);
  const pieDataAllTime = Object.entries(allTimeSpent)
    .filter(([, val]) => val > 0)
    .map(([name, value]) => ({ name, value }));

  const monthlyEvolutionData = monthGroups
    .slice()
    .reverse()
    .map((m) => ({
      name: m.label,
      Gastos: m.totalGasto,
      Ingresos: m.totalIngreso,
    }));

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const name = item.name || item.payload?.name || item.dataKey;
      const value = item.value;
      return (
        <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl shadow-xl text-xs space-y-1 z-50">
          <p className="font-bold text-[var(--text)]">{name}</p>
          <p className="font-mono text-[var(--blue)] font-bold">
            {fmtMoney(Number(value || 0))}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Finanzas</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Tu panorama financiero completo, en un solo lugar.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">💰 Disponible</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(disponible)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📊 Patrimonio</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(patrimonio)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">cuentas + inversiones − deudas</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🧾 Gastado este mes</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(gastado)}</div>
          <span
            className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-1 ${
              cmp.dir === 'up'
                ? 'bg-red-500/10 text-red-500'
                : cmp.dir === 'down'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'text-[var(--text-soft)]'
            }`}
          >
            {cmp.dir === 'flat'
              ? 'similar al mes pasado'
              : cmp.dir === 'up'
              ? `▲ ${cmp.pct.toFixed(0)}% más`
              : `▼ ${cmp.pct.toFixed(0)}% menos`}
          </span>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⚖️ Balance del mes</span>
          <div className={`text-xl sm:text-2xl font-extrabold font-mono mt-1 ${balance < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {fmtMoney(balance)}
          </div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📌 Gasto fijo este mes</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(fijoMes)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">comprometido de antemano</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🟢 Margen discrecional</span>
          <div className={`text-xl font-extrabold font-mono mt-1 ${margenDiscrecional < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {fmtMoney(margenDiscrecional)}
          </div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">disponible − gasto fijo</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🔁 Ganancia reventa</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(rstats.gananciaTotal)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">histórico</p>
        </div>
      </div>

      {/* Warning if no accounts */}
      {state.finance.accounts.length === 0 && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400">
          ⚠️ Creá al menos una cuenta más abajo antes de cargar movimientos — si no, el monto no va a tener dónde impactar.
        </div>
      )}

      {/* Add Transaction Form */}
      <div id="qa-focus-tx" className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Nuevo movimiento</h2>
        <form onSubmit={handleAddTx} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Tipo</label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-semibold"
            >
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Monto</label>
            <input
              type="number"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="0"
              className="w-28 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Cuenta</label>
            <select
              value={txAccount}
              onChange={(e) => setTxAccount(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            >
              {state.finance.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Categoría</label>
            <select
              value={txCategory}
              onChange={(e) => setTxCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            >
              {state.finance.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fijo / Variable</label>
            <select
              value={txFixed}
              onChange={(e) => setTxFixed(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            >
              <option value="variable">Variable</option>
              <option value="fijo">Fijo</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Nota</label>
            <input
              type="text"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
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

      <FinanceOperationsCard state={state} onUpdateState={onUpdateState} />

      {/* Transaction History grouped by month */}
      <div className="space-y-2">
        <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
          Historial de movimientos
          <span className="text-xs font-semibold text-[var(--text-faint)] bg-[var(--bg)] px-2.5 py-0.5 rounded-md border border-[var(--border)]">
            {state.finance.transactions.length}
          </span>
        </h2>
        <p className="text-xs text-[var(--text-soft)]">
          Gastado este año: <strong className="font-mono text-[var(--text)]">{fmtMoney(totalGastadoAnio)}</strong> · agrupado por mes, tocá para expandir.
        </p>

        {state.finance.transactions.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center text-xs text-[var(--text-faint)]">
            Todavía no cargaste movimientos.
          </div>
        ) : (
          <div className="space-y-2">
            {monthGroups.map((g) => (
              <details
                key={g.key}
                open={g.isCurrent}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden group"
              >
                <summary className="p-3.5 bg-[var(--bg)] flex items-center justify-between font-semibold text-xs sm:text-sm cursor-pointer select-none">
                  <span className="text-[var(--text)]">{g.label}</span>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-[var(--text-soft)]">{g.txs.length} mov.</span>
                    <span className="text-red-500 font-bold">− {fmtMoney(g.totalGasto)}</span>
                    <span className="text-emerald-500 font-bold">+ {fmtMoney(g.totalIngreso)}</span>
                  </div>
                </summary>

                <div className="p-3 overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-faint)] uppercase text-[10px]">
                        <th className="py-2 px-2">Fecha</th>
                        <th className="py-2 px-2">Tipo</th>
                        <th className="py-2 px-2">Cuenta</th>
                        <th className="py-2 px-2">Categoría</th>
                        <th className="py-2 px-2">Marca</th>
                        <th className="py-2 px-2">Nota</th>
                        <th className="py-2 px-2 text-right">Monto</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {g.txs.map((t) => (
                        <tr key={t.id} className="hover:bg-[var(--bg)]/50 transition-colors">
                          <td className="py-2 px-2 font-mono text-[var(--text-soft)]">{fmtDate(t.date)}</td>
                          <td className="py-2 px-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                t.type === 'gasto'
                                  ? 'bg-red-500/10 text-red-500'
                                  : 'bg-emerald-500/10 text-emerald-500'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-[var(--text-soft)]">
                            {state.finance.accounts.find((a) => a.id === t.accountId)?.name || '—'}
                          </td>
                          <td className="py-2 px-2 font-medium text-[var(--text)]">{t.category}</td>
                          <td className="py-2 px-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                              {t.fixed}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-[var(--text-faint)] truncate max-w-[150px]">
                            {t.note || '—'}
                          </td>
                          <td className="py-2 px-2 font-mono font-bold text-right text-[var(--text)]">
                            {fmtMoney(t.amount)}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button
                              onClick={() => handleDeleteTx(t.id)}
                              className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Category Budgets */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Presupuesto por categoría (mes actual)</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 divide-y divide-[var(--border)] space-y-3">
          {state.finance.categories.map((cat) => {
            const spent = catSpent[cat] || 0;
            const budget = Number(state.finance.budgets[cat] || 0);
            const pct = budget > 0 ? (spent / budget) * 100 : 0;
            const over = budget > 0 && spent > budget;

            return (
              <div key={cat} className="pt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-[var(--text)]">{cat}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--text-soft)]">{fmtMoney(spent)} /</span>
                    <input
                      type="number"
                      value={budget || ''}
                      onChange={(e) => handleSetBudget(cat, e.target.value)}
                      placeholder="presupuesto"
                      className="w-24 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-right"
                    />
                    {over && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">⚠ excedido</span>}
                  </div>
                </div>

                {budget > 0 && (
                  <div className="w-full h-2 rounded-full bg-[var(--bg)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expense Charts with Recharts */}
      <div className="space-y-6">
        {/* Row 1: Pie Chart + Legend for This Month */}
        <div>
          <h2 className="text-sm font-bold text-[var(--text)] mb-3 flex items-center justify-between">
            <span>📊 Distribución de gastos por categoría (Mes actual)</span>
            {pieDataThisMonth.length > 0 && (
              <span className="text-xs font-normal text-[var(--text-faint)]">
                Total: <strong className="font-mono text-[var(--text)]">{fmtMoney(gastado)}</strong>
              </span>
            )}
          </h2>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs">
            {pieDataThisMonth.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--text-faint)]">
                No hay gastos registrados en el mes actual para mostrar en el gráfico.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                {/* Donut Chart */}
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieDataThisMonth}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieDataThisMonth.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend & Breakdown list */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {pieDataThisMonth.map((item, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    const pct = gastado > 0 ? ((item.value / gastado) * 100).toFixed(1) : '0';
                    return (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-semibold text-[var(--text)]">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-[var(--text-soft)] text-[11px]">{pct}%</span>
                          <span className="font-bold text-[var(--text)]">{fmtMoney(item.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Monthly Evolution (Ingresos vs Gastos) */}
        {monthlyEvolutionData.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] mb-3">
              📈 Evolución mensual (Ingresos vs Gastos)
            </h2>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyEvolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Bar dataKey="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Gastos" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Row 3: All-time Expense Breakdown */}
        {pieDataAllTime.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] mb-3">
              🏛️ Histórico completo por categoría
            </h2>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pieDataAllTime}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fill: 'var(--text)', fontSize: 11, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]}>
                      {pieDataAllTime.map((_, index) => (
                        <Cell
                          key={`cell-alltime-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Accounts */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
            Cuentas
            <span className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(disponible)}</span>
          </h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddAccount} className="flex gap-2">
              <input
                type="text"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Ej: Prex"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="number"
                value={accBalance}
                onChange={(e) => setAccBalance(e.target.value)}
                placeholder="0"
                className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.finance.accounts.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-medium text-[var(--text)]">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-right"><strong className="block font-mono text-xs">{fmtMoney(a.balance)}</strong><span className="text-[10px] text-[var(--text-faint)]">{a.lastReconciledAt ? `Conciliada ${fmtDate(a.lastReconciledAt)}` : 'Sin conciliar'}</span></span>
                    <button
                      onClick={() => handleDeleteAccount(a.id)}
                      className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subscriptions */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
            Suscripciones
            <span className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(subsTotal)}/mes</span>
          </h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddSubscription} className="flex gap-2">
              <input
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Ej: Netflix"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="number"
                value={subAmount}
                onChange={(e) => setSubAmount(e.target.value)}
                placeholder="0"
                className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.finance.subscriptions.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin suscripciones cargadas.</p>
              ) : (
                state.finance.subscriptions.map((s) => (
                  <div key={s.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-[var(--text)]">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">{fmtMoney(s.amount)}</span>
                      <button
                        onClick={() => handleDeleteSubscription(s.id)}
                        className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Debts */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
            Deudas
            <span className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcDebtsTotal(state))}</span>
          </h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddDebt} className="flex gap-2">
              <input
                type="text"
                value={debtName}
                onChange={(e) => setDebtName(e.target.value)}
                placeholder="Ej: Tarjeta"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="number"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                placeholder="0"
                className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.finance.debts.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin deudas cargadas 🎉</p>
              ) : (
                state.finance.debts.map((d) => (
                  <div key={d.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-[var(--text)]">{d.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">{fmtMoney(d.amount)}</span>
                      <button
                        onClick={() => handleDeleteDebt(d.id)}
                        className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Investments */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
            Inversiones
            <span className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcInvestmentsTotal(state))}</span>
          </h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddInvestment} className="flex gap-2">
              <input
                type="text"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="Ej: Fondo"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="number"
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                placeholder="0"
                className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.finance.investments.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin inversiones cargadas.</p>
              ) : (
                state.finance.investments.map((i) => (
                  <div key={i.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-[var(--text)]">{i.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">{fmtMoney(i.amount)}</span>
                      <button
                        onClick={() => handleDeleteInvestment(i.id)}
                        className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
