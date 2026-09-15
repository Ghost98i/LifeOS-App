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
import { FinanceTransactionTable } from './FinanceTransactionTable';
import { FinanceBudgetProgress } from './FinanceBudgetProgress';
import { addAccount, addTransaction, deleteAccount, deleteTransaction, updateTransaction } from '../lib/financeFlows';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

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
        <button
          type="button"
          onClick={() => {
            onUpdateState((draft) => {
              draft.settings.privacyMode = !draft.settings.privacyMode;
            });
          }}
          className="secondary-button flex items-center gap-1.5"
          title="Alternar Stream Guard (Modo Privacidad)"
        >
          <AppIcon name={state.settings.privacyMode ? 'eyeOff' : 'eye'} className="h-4 w-4" />
          <span>{state.settings.privacyMode ? 'Mostrar saldos' : 'Modo Privacidad'}</span>
        </button>
      </div>

      <section className="surface p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="min-w-0">
            <span className="eyebrow">Disponible ahora</span>
            <PrivacyAmount as="h2" className="number-value mt-2 text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
              {fmtMoney(disponible)}
            </PrivacyAmount>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Suma de las cuentas activas. Las conciliaciones mantienen este total alineado con el dinero real.</p>
          </div>
          <div className="surface-muted p-4">
            <div className="flex items-center gap-2 text-[var(--blue)]">
              <AppIcon name="calendarDays" className="h-4 w-4"/>
              <span className="eyebrow text-current">Después de próximos pagos</span>
            </div>
            <PrivacyAmount as="strong" className={`number-value mt-2 block text-2xl font-bold ${cashFlow.projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
              {fmtMoney(cashFlow.projectedBalance)}
            </PrivacyAmount>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              <PrivacyAmount>{fmtMoney(cashFlow.committed)}</PrivacyAmount> comprometido hasta {fmtDate(cashFlow.horizonIso)}.
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between"><h3 className="text-sm font-bold text-[var(--text)]">Próximos pagos</h3><span className="text-xs text-[var(--text-faint)]">30 días</span></div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {cashFlow.commitments.map((item) => (
            <div key={item.id} className="min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
              <span className="block truncate text-xs font-semibold text-[var(--text-soft)]">{item.label}</span>
              <PrivacyAmount as="strong" className="number-value mt-1 block text-sm">
                −{fmtMoney(item.amount)}
              </PrivacyAmount>
              <span className="block text-[10px] text-[var(--text-faint)]">{item.dueDate ? fmtDate(item.dueDate) : 'fecha pendiente'}</span>
            </div>
          ))}
          {!cashFlow.commitments.length && <p className="text-sm text-[var(--text-soft)]">No hay pagos próximos cargados.</p>}
        </div>
        <p className="mt-3 text-[10px] text-[var(--text-faint)]">La estimación no presupone ingresos futuros ni marca automáticamente un pago como realizado.</p>
      </section>

      {/* Metrics Grid */}
      <details className="surface group p-4"><summary className="flex cursor-pointer list-none items-center justify-between"><div><p className="eyebrow">Resumen mensual</p><h2 className="section-title mt-1">Indicadores y patrimonio</h2></div><span className="text-xs font-semibold text-[var(--blue)]">Ver detalle</span></summary><div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 lg:grid-cols-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Ingresado este mes</span>
          <PrivacyAmount className="number-value mt-2 text-xl font-bold text-[var(--text)] sm:text-2xl">{fmtMoney(ingreso)}</PrivacyAmount>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Patrimonio</span>
          <PrivacyAmount className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(patrimonio)}</PrivacyAmount>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">cuentas + inversiones − deudas</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gastado este mes</span>
          <PrivacyAmount className="text-xl sm:text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(gastado)}</PrivacyAmount>
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
          <PrivacyAmount className={`text-xl sm:text-2xl font-extrabold font-mono mt-1 ${balance < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {fmtMoney(balance)}
          </PrivacyAmount>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gasto fijo</span>
          <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(fijoMes)}</PrivacyAmount>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">comprometido de antemano</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Gasto variable</span>
          <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {fmtMoney(gastoVariable)}
          </PrivacyAmount>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">gastos del mes que no son fijos</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="eyebrow">Ganancia reventa</span>
          <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">{fmtMoney(rstats.gananciaTotal)}</PrivacyAmount>
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

      {/* Visual Monthly Budgets Progress */}
      <FinanceBudgetProgress
        categories={state.finance.categories}
        catSpent={catSpent}
        budgets={state.finance.budgets}
        onSetBudget={handleSetBudget}
      />

      {/* Transaction History Clean Table with 1-Click Filters */}
      <FinanceTransactionTable
        transactions={state.finance.transactions}
        accounts={state.finance.accounts}
        categories={state.finance.categories}
        onEdit={beginEditTx}
        onDelete={handleDeleteTx}
        totalGastadoAnio={totalGastadoAnio}
      />

      <details className="surface group"><summary className="flex cursor-pointer list-none items-center justify-between p-4"><div><p className="eyebrow">Mantenimiento</p><h2 className="section-title mt-1">Cuentas, transferencias y conciliaciones</h2><p className="mt-1 text-sm text-[var(--text-soft)]">Herramientas para ordenar saldos; separadas del uso diario.</p></div><span className="text-xs font-semibold text-[var(--blue)]">Abrir</span></summary><div className="border-t border-[var(--border)] p-3 sm:p-4"><FinanceOperationsCard state={state} onUpdateState={onUpdateState} /></div></details>

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
                          <PrivacyAmount as="span" className="font-bold text-[var(--text)]">{fmtMoney(item.value)}</PrivacyAmount>
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
            <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(disponible)}</PrivacyAmount>
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
                    <span className="text-right"><PrivacyAmount as="strong" className="block font-mono text-xs">{fmtMoney(a.balance)}</PrivacyAmount><span className="text-[10px] text-[var(--text-faint)]">{a.lastReconciledAt ? `Conciliada ${fmtDate(a.lastReconciledAt)}` : 'Sin conciliar'}</span></span>
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
            <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(subsTotal)}/mes</PrivacyAmount>
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
                      <span className="text-right font-mono text-xs"><PrivacyAmount as="span">{fmtMoney(s.amount)}</PrivacyAmount><small className="block font-sans text-[9px] text-[var(--text-faint)]">{s.dueDay ? `día ${s.dueDay}` : 'sin fecha'}</small></span>
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
            <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcDebtsTotal(state))}</PrivacyAmount>
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
                      <span className="text-right font-mono text-xs"><PrivacyAmount as="span">{fmtMoney(d.amount)}</PrivacyAmount><small className="block font-sans text-[9px] text-[var(--text-faint)]">{d.monthlyPayment ? <>cuota <PrivacyAmount as="span">{fmtMoney(d.monthlyPayment)}</PrivacyAmount></> : 'sin cuota'}{d.dueDate ? ` · ${fmtDate(d.dueDate)}` : ''}</small></span>
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
            <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcInvestmentsTotal(state))}</PrivacyAmount>
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
                      <PrivacyAmount as="span" className="font-mono text-xs">{fmtMoney(i.amount)}</PrivacyAmount>
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
