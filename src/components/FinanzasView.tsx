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
  defaultAccountId,
  cashFlow30Days,
} from '../lib/calculations';
import { FinanceOperationsCard } from './FinanceOperationsCard';
import { addAccount, addTransaction, deleteAccount, deleteTransaction, updateTransaction } from '../lib/financeFlows';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';

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
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [calmMode, setCalmMode] = useState(false);

  // Accounts, Subs, Debts, Invs forms
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState('');

  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDueDay, setSubDueDay] = useState('');

  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtMonthlyPayment, setDebtMonthlyPayment] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');

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
  const budgetEntries = state.finance.categories.map((category) => ({
    category,
    spent: catSpent[category] || 0,
    budget: Number(state.finance.budgets[category] || 0),
  }));
  const configuredBudgets = budgetEntries.filter((entry) => entry.budget > 0);
  const budgetTotal = configuredBudgets.reduce((sum, entry) => sum + entry.budget, 0);
  const budgetSpent = configuredBudgets.reduce((sum, entry) => sum + entry.spent, 0);
  const exceededBudgets = configuredBudgets.filter((entry) => entry.spent > entry.budget).length;
  const subsTotal = calcSubscriptionsTotal(state);
  const cashFlow = cashFlow30Days(state);
  const rstats = resaleStats(state);
  const ref = new Date();
  const totalGastadoAnio = state.finance.transactions
    .filter((t) => t.type === 'gasto' && t.origin !== 'adjustment' && sameYear(t.date, ref))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const fijoMes = calcFixedSpentMonth(state, 0);
  const gastoVariable = Math.max(0, gastado - fijoMes);

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accountId = txAccount || defaultAccountId(state);
      onUpdateState((draft) => {
        const input = {
          type: txType,
          amount: Number(txAmount),
          category: txCategory,
          fixed: txFixed,
          date: txDate,
          note: txNote,
          accountId,
        };
        if (editingTxId) updateTransaction(draft, editingTxId, input);
        else addTransaction(draft, input);
      });
      playSound('coins');
      setTxAmount('');
      setTxNote('');
      setEditingTxId(null);
      showToast(editingTxId ? 'Movimiento actualizado.' : `${txType === 'ingreso' ? 'Ingreso' : 'Gasto'} guardado.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el movimiento.', 'error');
    }
  };

  const beginEditTx = (transaction: Transaction) => {
    setEditingTxId(transaction.id);
    setTxType(transaction.type);
    setTxAmount(String(transaction.amount));
    setTxAccount(transaction.accountId || defaultAccountId(state) || '');
    setTxCategory(transaction.category);
    setTxFixed(transaction.fixed);
    setTxDate(transaction.date);
    setTxNote(transaction.note || '');
    document.getElementById('qa-focus-tx')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEditTx = () => {
    setEditingTxId(null);
    setTxAmount('');
    setTxNote('');
    setTxDate(todayISO());
  };

  const handleDeleteTx = (id: string) => {
    try {
      onUpdateState((draft) => deleteTransaction(draft, id));
      showToast('Movimiento eliminado.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se puede eliminar este movimiento.', 'error');
    }
  };

  const handleSetBudget = (category: string, amountStr: string) => {
    onUpdateState((draft) => {
      draft.finance.budgets[category] = Number(amountStr) || 0;
    });
  };

  // Sub-items forms
  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onUpdateState((draft) => { addAccount(draft, accName, Number(accBalance || 0)); });
      setAccName('');
      setAccBalance('');
      showToast('Cuenta agregada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo agregar la cuenta.', 'error');
    }
  };

  const handleDeleteAccount = (id: string) => {
    try {
      onUpdateState((draft) => deleteAccount(draft, id));
      showToast('Cuenta eliminada.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se puede eliminar esta cuenta.', 'error');
    }
  };

  const handleAddSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;
    onUpdateState((draft) => {
      draft.finance.subscriptions.push({
        id: uid(),
        name: subName.trim(),
        amount: Number(subAmount) || 0,
        dueDay: subDueDay ? Math.min(31, Math.max(1, Number(subDueDay))) : null,
      });
    });
    setSubName('');
    setSubAmount('');
    setSubDueDay('');
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
        monthlyPayment: Number(debtMonthlyPayment) || 0,
        dueDate: debtDueDate || null,
      });
    });
    setDebtName('');
    setDebtAmount('');
    setDebtMonthlyPayment('');
    setDebtDueDate('');
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Tu dinero</p><h1 className="page-heading mt-1">Finanzas</h1>
        <p className="page-subtitle">
          Primero lo que tenés y lo que viene. El análisis queda disponible sin ocupar toda la pantalla.
        </p></div>
        <button type="button" onClick={() => setCalmMode((value) => !value)} className="secondary-button">{calmMode ? 'Mostrar saldos' : 'Ocultar saldos'}</button>
      </div>

      <section className="surface privacy-sensitive p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="min-w-0"><span className="eyebrow">Disponible ahora</span><h2 className="number-value mt-2 text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">{calmMode ? '$U ••••' : fmtMoney(disponible)}</h2><p className="mt-2 text-sm text-[var(--text-soft)]">Suma de las cuentas activas. Las conciliaciones mantienen este total alineado con el dinero real.</p></div>
          <div className="surface-muted p-4"><div className="flex items-center gap-2 text-[var(--blue)]"><AppIcon name="calendarDays" className="h-4 w-4"/><span className="eyebrow text-current">Después de próximos pagos</span></div><strong className={`number-value mt-2 block text-2xl font-bold ${!calmMode && cashFlow.projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>{calmMode ? '$U ••••' : fmtMoney(cashFlow.projectedBalance)}</strong><p className="mt-1 text-xs text-[var(--text-soft)]">{calmMode ? 'Montos ocultos temporalmente.' : `${fmtMoney(cashFlow.committed)} comprometido hasta ${fmtDate(cashFlow.horizonIso)}.`}</p></div>
        </div>
        <div className="mt-5 flex items-center justify-between"><h3 className="text-sm font-bold text-[var(--text)]">Próximos pagos</h3><span className="text-xs text-[var(--text-faint)]">30 días</span></div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{cashFlow.commitments.map((item) => <div key={item.id} className="min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5"><span className="block truncate text-xs font-semibold text-[var(--text-soft)]">{item.label}</span><strong className="number-value mt-1 block text-sm">−{calmMode ? '$U ••••' : fmtMoney(item.amount)}</strong><span className="block text-[10px] text-[var(--text-faint)]">{item.dueDate ? fmtDate(item.dueDate) : 'fecha pendiente'}</span></div>)}{!cashFlow.commitments.length && <p className="text-sm text-[var(--text-soft)]">No hay pagos próximos cargados.</p>}</div>
        <p className="mt-3 text-[10px] text-[var(--text-faint)]">La estimación no presupone ingresos futuros ni marca automáticamente un pago como realizado.</p>
      </section>

      {/* Metrics Grid */}
      <details className="surface group p-4"><summary className="flex cursor-pointer list-none items-center justify-between"><div><p className="eyebrow">Resumen mensual</p><h2 className="section-title mt-1">Indicadores y patrimonio</h2></div><span className="text-xs font-semibold text-[var(--blue)]">Ver detalle</span></summary><div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 lg:grid-cols-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Ingresado este mes</span>
          <div className="number-value mt-2 text-xl font-bold text-[var(--text)] sm:text-2xl">{calmMode ? '$U ••••' : fmtMoney(ingreso)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Patrimonio</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{calmMode ? '$U ••••' : fmtMoney(patrimonio)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">cuentas + inversiones − deudas</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gastado este mes</span>
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
          <span className="eyebrow">Balance del mes</span>
          <div className={`text-xl sm:text-2xl font-extrabold font-mono mt-1 ${balance < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {fmtMoney(balance)}
          </div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gasto fijo</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(fijoMes)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">comprometido de antemano</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gasto variable</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {fmtMoney(gastoVariable)}
          </div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">gastos del mes que no son fijos</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Ganancia reventa</span>
          <div className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(rstats.gananciaTotal)}</div>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">histórico</p>
        </div>
      </div></details>

      {/* Warning if no accounts */}
      {state.finance.accounts.length === 0 && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400">
          ⚠️ Creá al menos una cuenta más abajo antes de cargar movimientos — si no, el monto no va a tener dónde impactar.
        </div>
      )}

      {/* Add Transaction Form */}
      <div id="qa-focus-tx" className="surface space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2"><div><p className="eyebrow">Registro</p><h2 className="section-title mt-1">{editingTxId ? 'Editar movimiento' : 'Nuevo movimiento'}</h2></div>{editingTxId && <button type="button" onClick={cancelEditTx} className="text-xs font-bold text-[var(--text-soft)]">Cancelar edición</button>}</div>
        <form onSubmit={handleAddTx} className="flex flex-wrap items-end gap-2 rounded-xl bg-[var(--surface-muted)] p-3.5">
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
              min="0.01"
              step="0.01"
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
            className="primary-button min-h-10 px-4"
          >
            {editingTxId ? 'Guardar cambios' : '＋ Agregar'}
          </button>
        </form>
      </div>

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
                <summary className="p-3.5 bg-[var(--bg)] flex flex-wrap items-center justify-between gap-2 font-semibold text-xs sm:text-sm cursor-pointer select-none">
                  <span className="text-[var(--text)]">{g.label}</span>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-[var(--text-soft)]">{g.txs.length} mov.</span>
                    <span className="text-red-500 font-bold">− {fmtMoney(g.totalGasto)}</span>
                    <span className="text-emerald-500 font-bold">+ {fmtMoney(g.totalIngreso)}</span>
                  </div>
                </summary>

                <div className="p-3">
                  <div className="space-y-2 md:hidden">
                    {g.txs.map((t) => (
                      <article key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-[var(--text)]">{t.note || t.category}</p>
                            <p className="mt-1 text-[11px] text-[var(--text-soft)]">{fmtDate(t.date)} · {state.finance.accounts.find((a) => a.id === t.accountId)?.name || 'Sin cuenta'} · {t.category}</p>
                          </div>
                          <strong className={`shrink-0 font-mono text-sm ${t.type === 'gasto' ? 'text-red-500' : 'text-emerald-500'}`}>{t.type === 'gasto' ? '−' : '+'} {fmtMoney(t.amount)}</strong>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-500">{t.fixed}{t.origin === 'adjustment' ? ' · conciliación' : ''}</span>
                          <div className="flex gap-1"><button onClick={() => beginEditTx(t)} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--blue)]">Editar</button><button onClick={() => handleDeleteTx(t.id)} aria-label={`Eliminar movimiento ${t.note || t.category}`} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-500">Eliminar</button></div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
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
                            <button onClick={() => beginEditTx(t)} className="mr-2 text-[10px] font-bold text-[var(--blue)]">Editar</button>
                            <button
                              onClick={() => handleDeleteTx(t.id)}
                              aria-label={`Eliminar movimiento ${t.note || t.category}`}
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
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <details className="surface group"><summary className="flex cursor-pointer list-none items-center justify-between p-4"><div><p className="eyebrow">Mantenimiento</p><h2 className="section-title mt-1">Cuentas, transferencias y conciliaciones</h2><p className="mt-1 text-sm text-[var(--text-soft)]">Herramientas para ordenar saldos; separadas del uso diario.</p></div><span className="text-xs font-semibold text-[var(--blue)]">Abrir</span></summary><div className="border-t border-[var(--border)] p-3 sm:p-4"><FinanceOperationsCard state={state} onUpdateState={onUpdateState} /></div></details>

      {/* Category Budgets */}
      <details className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Presupuesto por categoría</h2>
            <p className="mt-0.5 text-xs text-[var(--text-soft)]">
              {configuredBudgets.length === 0 ? 'Sin presupuestos configurados' : `${fmtMoney(budgetSpent)} de ${fmtMoney(budgetTotal)} este mes`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {exceededBudgets > 0 && <span className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-500">⚠ {exceededBudgets} excedido(s)</span>}
            <span className="text-xs font-bold text-[var(--blue)] group-open:hidden">Abrir ▾</span>
            <span className="hidden text-xs font-bold text-[var(--blue)] group-open:inline">Cerrar ▴</span>
          </div>
        </summary>
        <div className="divide-y divide-[var(--border)] space-y-3 border-t border-[var(--border)] p-4">
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
      </details>

      {/* Expense Charts with Recharts */}
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"><summary className="cursor-pointer list-none text-sm font-extrabold text-[var(--text)]">Análisis y gráficos <span className="ml-1 text-xs font-normal text-[var(--text-soft)]">· abrir cuando los necesites</span></summary><div className="mt-5 space-y-6">
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
      </div></details>

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
            <form onSubmit={handleAddSubscription} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Ej: Netflix"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input type="number" min="1" max="31" value={subDueDay} onChange={(e) => setSubDueDay(e.target.value)} placeholder="día" title="Día de vencimiento" className="w-14 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
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
                      <span className="text-right font-mono text-xs">{fmtMoney(s.amount)}<small className="block font-sans text-[9px] text-[var(--text-faint)]">{s.dueDay ? `día ${s.dueDay}` : 'sin fecha'}</small></span>
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
            <form onSubmit={handleAddDebt} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={debtName}
                onChange={(e) => setDebtName(e.target.value)}
                placeholder="Ej: Tarjeta"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input type="number" value={debtMonthlyPayment} onChange={(e) => setDebtMonthlyPayment(e.target.value)} placeholder="cuota" title="Cuota de los próximos 30 días" className="w-20 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
              <input type="date" value={debtDueDate} onChange={(e) => setDebtDueDate(e.target.value)} title="Próximo vencimiento" className="w-32 px-2 py-1.5 text-[10px] rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
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
                      <span className="text-right font-mono text-xs">{fmtMoney(d.amount)}<small className="block font-sans text-[9px] text-[var(--text-faint)]">{d.monthlyPayment ? `cuota ${fmtMoney(d.monthlyPayment)}` : 'sin cuota'}{d.dueDate ? ` · ${fmtDate(d.dueDate)}` : ''}</small></span>
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
