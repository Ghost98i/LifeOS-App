import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  LifeOSState,
  Transaction,
  ExpectedIncome,
  ExpectedIncomeFrequency,
  FinancialCommitment,
  FinancialCommitmentFrequency,
} from '../types';
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
  cashFlowProjection,
  CashFlowForecastItem,
  sortCommitmentsChronologically,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
} from '../lib/calculations';
import { FinanceOperationsCard } from './FinanceOperationsCard';
import { FinanceTransactionTable } from './FinanceTransactionTable';
import { FinanceBudgetProgress } from './FinanceBudgetProgress';
import { FinanceCategoryModal } from './FinanceCategoryModal';
import { getActiveCategories, getAllCategories, getCategoryName } from '../lib/financeCategories';
import { addAccount, addTransaction, deleteAccount, deleteTransaction, updateTransaction } from '../lib/financeFlows';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

function computeForecastRows(items: CashFlowForecastItem[], startBalance: number) {
  let bal = startBalance;
  return items.map((item) => {
    bal = item.type === 'income' ? bal + item.amount : bal - item.amount;
    return {
      ...item,
      runningBalance: bal,
    };
  });
}

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
  const [activeTab, setActiveTab] = useState<'movimientos' | 'cuentas' | 'analisis' | 'proyeccion'>('movimientos');
  const activeCategories = useMemo(
    () => getActiveCategories(state.finance?.categories),
    [state.finance?.categories]
  );
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [txType, setTxType] = useState<'gasto' | 'ingreso'>(initialTransactionType);
  const [txAmount, setTxAmount] = useState('');
  const [txAccount, setTxAccount] = useState<string>(defaultAccountId(state) || '');
  const [txCategory, setTxCategory] = useState<string>(activeCategories[0]?.id || 'Comida');
  const [txFixed, setTxFixed] = useState<'variable' | 'fijo'>('variable');
  const [txDate, setTxDate] = useState(todayISO());
  const [txNote, setTxNote] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [showTxDetails, setShowTxDetails] = useState(false);

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

  // Expected Incomes & Projection Horizon
  const [projHorizon, setProjHorizon] = useState<30 | 60 | 90>(30);
  const [incName, setIncName] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState(todayISO());
  const [incFreq, setIncFreq] = useState<ExpectedIncomeFrequency>('monthly');
  const [incCategory, setIncCategory] = useState<string>(activeCategories[0]?.id || 'Varios');
  const [incAccount, setIncAccount] = useState<string>(defaultAccountId(state) || '');
  const [incEndDate, setIncEndDate] = useState('');
  const [editingIncId, setEditingIncId] = useState<string | null>(null);

  // Financial Commitments
  const [comName, setComName] = useState('');
  const [comAmount, setComAmount] = useState('');
  const [comDate, setComDate] = useState(todayISO());
  const [comFreq, setComFreq] = useState<FinancialCommitmentFrequency>('monthly');
  const [comCategory, setComCategory] = useState<string>(activeCategories[0]?.id || 'Varios');
  const [comAccount, setComAccount] = useState<string>(defaultAccountId(state) || '');
  const [comIsFinite, setComIsFinite] = useState(false);
  const [comTotalOccurrences, setComTotalOccurrences] = useState('');
  const [comRemainingOccurrences, setComRemainingOccurrences] = useState('');
  const [comEndDate, setComEndDate] = useState('');
  const [comNotes, setComNotes] = useState('');
  const [finTotalAmount, setFinTotalAmount] = useState('');
  const [editingComId, setEditingComId] = useState<string | null>(null);
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);

  // Payment confirmation modal
  const [payingCommitment, setPayingCommitment] = useState<FinancialCommitment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccount, setPayAccount] = useState('');
  const [payUpdateFuture, setPayUpdateFuture] = useState(false);

  // Financial Cushion
  const [isCushionModalOpen, setIsCushionModalOpen] = useState(false);
  const [cushionInput, setCushionInput] = useState(String(state.finance?.minCushion ?? 5000));
  const [cushionEnabledInput, setCushionEnabledInput] = useState(state.finance?.cushionEnabled !== false);

  useEffect(() => {
    setTxType(initialTransactionType);
    setActiveTab('movimientos');
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
  const projection = cashFlowProjection(state, projHorizon);

  const forecastRows = useMemo(
    () => computeForecastRows(projection.forecastItems, projection.currentBalance),
    [projection.forecastItems, projection.currentBalance]
  );
  const sortedCommitments = useMemo(
    () => sortCommitmentsChronologically(state.finance?.commitments || []),
    [state.finance.commitments]
  );
  const rstats = resaleStats(state);
  const ref = new Date();
  const totalGastadoAnio = (state.finance?.transactions || [])
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
    setActiveTab('movimientos');
    setEditingTxId(transaction.id);
    setTxType(transaction.type);
    setTxAmount(String(transaction.amount));
    setTxAccount(transaction.accountId || defaultAccountId(state) || '');
    setTxCategory(transaction.category);
    setTxFixed(transaction.fixed);
    setTxDate(transaction.date);
    setTxNote(transaction.note || '');
    setShowTxDetails(true);
    setTimeout(() => {
      document.getElementById('qa-focus-tx')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const cancelEditTx = () => {
    setEditingTxId(null);
    setTxAmount('');
    setTxNote('');
    setTxDate(todayISO());
    setShowTxDetails(false);
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
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.budgets) draft.finance.budgets = {};
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
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.subscriptions) draft.finance.subscriptions = [];
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
    showToast('Suscripción agregada.');
  };

  const handleDeleteSubscription = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      draft.finance.subscriptions = (draft.finance.subscriptions || []).filter((s) => s.id !== id);
    });
    showToast('Suscripción eliminada.', 'info');
  };

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.debts) draft.finance.debts = [];
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
    showToast('Deuda registrada.');
  };

  const handleDeleteDebt = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      draft.finance.debts = (draft.finance.debts || []).filter((d) => d.id !== id);
    });
    showToast('Deuda eliminada.', 'info');
  };

  const handleAddInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.investments) draft.finance.investments = [];
      draft.finance.investments.push({
        id: uid(),
        name: invName.trim(),
        amount: Number(invAmount) || 0,
      });
    });
    setInvName('');
    setInvAmount('');
    showToast('Inversión registrada.');
  };

  const handleDeleteInvestment = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      draft.finance.investments = (draft.finance.investments || []).filter((i) => i.id !== id);
    });
    showToast('Inversión eliminada.', 'info');
  };

  const handleAddExpectedIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incName.trim() || !Number(incAmount)) {
      showToast('Completá nombre y monto del ingreso previsto.', 'error');
      return;
    }
    const amt = Number(incAmount);
    if (amt <= 0) {
      showToast('El monto debe ser mayor a 0.', 'error');
      return;
    }
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [], expectedIncomes: [] } as any;
      if (!draft.finance.expectedIncomes) draft.finance.expectedIncomes = [];

      if (editingIncId) {
        const target = draft.finance.expectedIncomes.find((i) => i.id === editingIncId);
        if (target) {
          target.name = incName.trim();
          target.amount = amt;
          target.startDate = incDate || todayISO();
          target.frequency = incFreq;
          target.category = incCategory || null;
          target.accountId = incAccount || null;
          target.endDate = incEndDate || null;
          target.updatedAt = new Date().toISOString();
        }
      } else {
        draft.finance.expectedIncomes.push({
          id: uid(),
          name: incName.trim(),
          amount: amt,
          startDate: incDate || todayISO(),
          frequency: incFreq,
          active: true,
          category: incCategory || null,
          accountId: incAccount || null,
          endDate: incEndDate || null,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    setIncName('');
    setIncAmount('');
    setIncEndDate('');
    setEditingIncId(null);
    playSound('success');
    showToast(editingIncId ? 'Ingreso previsto actualizado.' : 'Ingreso previsto registrado para proyecciones.');
  };

  const beginEditExpectedIncome = (inc: ExpectedIncome) => {
    setActiveTab('compromisos');
    setEditingIncId(inc.id);
    setIncName(inc.name);
    setIncAmount(String(inc.amount));
    setIncDate(inc.startDate);
    setIncFreq(inc.frequency);
    setIncCategory(inc.category || activeCategories[0]?.id || 'Varios');
    setIncAccount(inc.accountId || defaultAccountId(state) || '');
    setIncEndDate(inc.endDate || '');
    setTimeout(() => {
      document.getElementById('qa-focus-inc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const cancelEditExpectedIncome = () => {
    setEditingIncId(null);
    setIncName('');
    setIncAmount('');
    setIncDate(todayISO());
    setIncFreq('monthly');
    setIncCategory(activeCategories[0]?.id || 'Varios');
    setIncAccount(defaultAccountId(state) || '');
    setIncEndDate('');
  };

  const handleToggleExpectedIncome = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance?.expectedIncomes) return;
      const target = draft.finance.expectedIncomes.find((i) => i.id === id);
      if (target) {
        target.active = !target.active;
        target.updatedAt = new Date().toISOString();
      }
    });
  };

  const handleDeleteExpectedIncome = (id: string) => {
    if (editingIncId === id) {
      cancelEditExpectedIncome();
    }
    onUpdateState((draft) => {
      if (!draft.finance?.expectedIncomes) return;
      draft.finance.expectedIncomes = draft.finance.expectedIncomes.filter((i) => i.id !== id);
    });
    showToast('Ingreso previsto eliminado.', 'info');
  };

  const handleConfirmIncomeReal = (inc: ExpectedIncome) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [], expectedIncomes: [] } as any;
      const accId = inc.accountId || defaultAccountId(draft) || draft.finance.accounts[0]?.id || 'acc-1';
      const tx: Transaction = {
        id: uid(),
        amount: Number(inc.amount),
        type: 'ingreso',
        category: inc.category || 'Varios',
        accountId: accId,
        fixed: 'variable',
        date: todayISO(),
        note: `Previsión confirmada: ${inc.name}`,
      };
      draft.finance.transactions.push(tx);
      const acc = draft.finance.accounts.find((a) => a.id === accId);
      if (acc) {
        acc.balance = Number(acc.balance || 0) + tx.amount;
      }
      const targetInc = draft.finance.expectedIncomes?.find((i) => i.id === inc.id);
      if (targetInc) {
        const advanced = advanceExpectedIncomeDate(targetInc);
        targetInc.startDate = advanced.startDate;
        targetInc.active = advanced.active;
        targetInc.updatedAt = new Date().toISOString();
      }
    });
    playSound('coins');
    const toastMsg = state.settings?.privacyMode
      ? 'Ingreso real registrado: +$U ••••'
      : `Ingreso real registrado: +$${Number(inc.amount).toLocaleString('es-UY')}`;
    showToast(toastMsg);
  };

  const resetComForm = () => {
    setComName('');
    setComAmount('');
    setFinTotalAmount('');
    setComDate(todayISO());
    setComFreq('monthly');
    setComCategory(activeCategories[0]?.id || 'Varios');
    setComAccount(defaultAccountId(state) || '');
    setComIsFinite(false);
    setComTotalOccurrences('');
    setComRemainingOccurrences('');
    setComEndDate('');
    setComNotes('');
    setEditingComId(null);
    setIsCommitmentModalOpen(false);
  };

  const handleSaveCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comName.trim() || !Number(comAmount)) {
      showToast('Completá el nombre y monto del compromiso.', 'error');
      return;
    }
    const amt = Number(comAmount);
    if (amt <= 0) {
      showToast('El monto debe ser mayor a 0.', 'error');
      return;
    }
    if (comIsFinite) {
      const parsedTotal = Number(comTotalOccurrences);
      if (!parsedTotal || parsedTotal < 1) {
        showToast('La cantidad de cuotas debe ser al menos 1.', 'error');
        return;
      }
    }
    if (comEndDate && comDate && comEndDate < comDate) {
      showToast('La fecha de fin no puede ser anterior a la fecha de vencimiento.', 'error');
      return;
    }

    const totalOcc = comIsFinite && comTotalOccurrences ? Math.max(1, Math.round(Number(comTotalOccurrences))) : null;
    const remainingOcc = comIsFinite
      ? comRemainingOccurrences !== ''
        ? Math.max(0, Math.min(totalOcc ?? Infinity, Math.round(Number(comRemainingOccurrences))))
        : totalOcc
      : null;

    const targetDueDay = comDate ? new Date(`${comDate}T12:00:00`).getDate() : new Date().getDate();

    onUpdateState((draft) => {
      if (!draft.finance) {
        draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      }
      if (!draft.finance.commitments) draft.finance.commitments = [];

      if (editingComId) {
        const target = draft.finance.commitments.find((c) => c.id === editingComId);
        if (target) {
          target.name = comName.trim();
          target.amount = amt;
          target.nextDueDate = comDate || todayISO();
          target.frequency = comFreq;
          target.category = comCategory || 'Varios';
          target.accountId = comAccount || null;
          target.totalOccurrences = totalOcc;
          target.remainingOccurrences = remainingOcc;
          target.dueDay = targetDueDay;
          target.endDate = comEndDate || null;
          target.notes = comNotes.trim() || null;
          target.active = remainingOcc !== null ? remainingOcc > 0 : target.active;
          target.updatedAt = new Date().toISOString();
        }
      } else {
        draft.finance.commitments.push({
          id: uid(),
          name: comName.trim(),
          amount: amt,
          nextDueDate: comDate || todayISO(),
          frequency: comFreq,
          active: remainingOcc !== null ? remainingOcc > 0 : true,
          category: comCategory || 'Varios',
          accountId: comAccount || null,
          totalOccurrences: totalOcc,
          remainingOccurrences: remainingOcc,
          dueDay: targetDueDay,
          endDate: comEndDate || null,
          notes: comNotes.trim() || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    playSound('success');
    showToast(editingComId ? 'Compromiso actualizado.' : 'Compromiso registrado.');
    resetComForm();
  };

  const beginEditCommitment = (com: FinancialCommitment) => {
    setEditingComId(com.id);
    setComName(com.name);
    setComAmount(String(com.amount));
    setComDate(com.nextDueDate);
    setComFreq(com.frequency);
    setComCategory(com.category || activeCategories[0]?.id || 'Varios');
    setComAccount(com.accountId || defaultAccountId(state) || '');
    setComIsFinite(com.totalOccurrences != null || com.remainingOccurrences != null);
    setComTotalOccurrences(com.totalOccurrences != null ? String(com.totalOccurrences) : '');
    setComRemainingOccurrences(com.remainingOccurrences != null ? String(com.remainingOccurrences) : '');
    setComEndDate(com.endDate || '');
    setComNotes(com.notes || '');
    setIsCommitmentModalOpen(true);
  };

  const handleToggleCommitment = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance?.commitments) return;
      const target = draft.finance.commitments.find((c) => c.id === id);
      if (target) {
        target.active = !target.active;
        target.updatedAt = new Date().toISOString();
      }
    });
  };

  const handleDeleteCommitment = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance?.commitments) return;
      draft.finance.commitments = draft.finance.commitments.filter((c) => c.id !== id);
    });
    showToast('Compromiso eliminado.', 'info');
  };

  const handleConfirmCommitmentPayment = (
    com: FinancialCommitment,
    paidAmount?: number,
    paidAccountId?: string,
    updateFutureAmount?: boolean
  ) => {
    const actualAmount = paidAmount !== undefined && !isNaN(paidAmount) ? paidAmount : Number(com.amount);
    onUpdateState((draft) => {
      if (!draft.finance) return;
      const accId = paidAccountId || com.accountId || defaultAccountId(draft) || draft.finance.accounts[0]?.id || 'acc-1';
      const tx: Transaction = {
        id: uid(),
        amount: actualAmount,
        type: 'gasto',
        category: com.category || 'Varios',
        accountId: accId,
        fixed: 'fijo',
        date: todayISO(),
        note: `Pago de compromiso: ${com.name}`,
      };
      draft.finance.transactions.push(tx);
      const acc = draft.finance.accounts.find((a) => a.id === accId);
      if (acc) {
        acc.balance = Number(acc.balance || 0) - tx.amount;
      }
      const targetCom = draft.finance.commitments?.find((c) => c.id === com.id);
      if (targetCom) {
        const advanced = advanceCommitmentDueDate(targetCom);
        targetCom.nextDueDate = advanced.nextDueDate;
        targetCom.remainingOccurrences = advanced.remainingOccurrences;
        targetCom.active = advanced.active;
        if (advanced.dueDay) targetCom.dueDay = advanced.dueDay;
        if (updateFutureAmount) {
          targetCom.amount = actualAmount;
        }
        targetCom.updatedAt = new Date().toISOString();
      }
    });
    playSound('coins');
    const toastMsg = state.settings?.privacyMode
      ? 'Pago registrado y compromiso actualizado: -$U ••••'
      : `Pago registrado y compromiso actualizado: -$${Number(actualAmount).toLocaleString('es-UY')}`;
    showToast(toastMsg);
  };

  const openPayCommitment = (com: FinancialCommitment) => {
    setPayingCommitment(com);
    setPayAmount(String(com.amount));
    setPayAccount(com.accountId || defaultAccountId(state) || '');
    setPayUpdateFuture(false);
  };

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCommitment) return;
    const numAmount = Number(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('El monto debe ser mayor a 0.', 'error');
      return;
    }
    handleConfirmCommitmentPayment(
      payingCommitment,
      numAmount,
      payAccount || undefined,
      payUpdateFuture
    );
    setPayingCommitment(null);
  };

  const handleSaveCushion = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(cushionInput);
    onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.minCushion = isNaN(amount) || amount < 0 ? null : amount;
      draft.finance.cushionEnabled = cushionEnabledInput;
    });
    setIsCushionModalOpen(false);
    showToast('Colchón financiero actualizado.');
  };

  useEffect(() => {
    if (!isCommitmentModalOpen && !isCushionModalOpen && !payingCommitment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCommitmentModalOpen) setIsCommitmentModalOpen(false);
        if (isCushionModalOpen) setIsCushionModalOpen(false);
        if (payingCommitment) setPayingCommitment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommitmentModalOpen, isCushionModalOpen, payingCommitment]);

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

  const pieDataThisMonthMap = new Map<string, number>();
  for (const [catKey, value] of Object.entries(catSpent)) {
    if (value > 0) {
      const name = getCategoryName(state.finance?.categories, catKey);
      pieDataThisMonthMap.set(name, (pieDataThisMonthMap.get(name) || 0) + value);
    }
  }
  const pieDataThisMonth = Array.from(pieDataThisMonthMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  const allTimeSpent = calcSpentByCategoryAllTime(state);
  const pieDataAllTimeMap = new Map<string, number>();
  for (const [catKey, value] of Object.entries(allTimeSpent)) {
    if (value > 0) {
      const name = getCategoryName(state.finance?.categories, catKey);
      pieDataAllTimeMap.set(name, (pieDataAllTimeMap.get(name) || 0) + value);
    }
  }
  const pieDataAllTime = Array.from(pieDataAllTimeMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

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

  const heroMode = state.finance.heroDisplayMode || 'actual';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Finanzas"
        subtitle="Control de liquidez, movimientos del día a día, conciliación y proyección a 30 días."
        actions={
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
        }
      />

      {/* Hero Liquidity Overview */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xs">
        {/* Header with Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-0.5">
              Liquidez y Proyección
            </span>
          </div>
          <div className="inline-flex items-center gap-1 bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)] text-xs">
            <button
              type="button"
              onClick={() => {
                onUpdateState((draft) => {
                  draft.finance.heroDisplayMode = 'actual';
                });
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                heroMode === 'actual'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs font-bold'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Saldo Actual
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateState((draft) => {
                  draft.finance.heroDisplayMode = 'both';
                });
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                heroMode === 'both'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs font-bold'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Ambos
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateState((draft) => {
                  draft.finance.heroDisplayMode = 'real_available';
                });
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                heroMode === 'real_available'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs font-bold'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Disponible Real
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr] items-start">
          <div className="min-w-0">
            {heroMode === 'actual' && (
              <>
                <PrivacyAmount as="h2" className={`text-4xl sm:text-5xl font-bold tracking-tight tabular-nums ${disponible < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                  {fmtMoney(disponible)}
                </PrivacyAmount>
                <span className="text-xs font-medium text-[var(--text-soft)] block mt-1">
                  Saldo real en cuentas
                </span>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
                  <span>{state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta activa' : 'cuentas activas'}</span>
                  <span>·</span>
                  <span className="tabular-nums"><PrivacyAmount>{fmtMoney(cashFlow.committed)}</PrivacyAmount> comprometidos a 30 días</span>
                </div>
              </>
            )}

            {heroMode === 'both' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
                <div>
                  <PrivacyAmount as="div" className={`text-3xl sm:text-4xl font-bold tracking-tight tabular-nums ${disponible < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                    {fmtMoney(disponible)}
                  </PrivacyAmount>
                  <span className="text-xs font-medium text-[var(--text-soft)] block mt-1">
                    Saldo real ({state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas'})
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                      Disponible Proyectado
                    </span>
                    {cashFlow.realAvailable < 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
                        Déficit
                      </span>
                    )}
                  </div>
                  <PrivacyAmount as="div" className={`text-3xl sm:text-4xl font-bold tracking-tight tabular-nums ${cashFlow.realAvailable < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {fmtMoney(cashFlow.realAvailable)}
                  </PrivacyAmount>
                  <span className="text-xs text-[var(--text-soft)] block mt-1 tabular-nums">
                    Tras deducir <PrivacyAmount>{fmtMoney(cashFlow.committed)}</PrivacyAmount> en 30d
                  </span>
                </div>
              </div>
            )}

            {heroMode === 'real_available' && (
              <>
                <PrivacyAmount as="h2" className={`text-4xl sm:text-5xl font-bold tracking-tight tabular-nums ${cashFlow.realAvailable < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                  {fmtMoney(cashFlow.realAvailable)}
                </PrivacyAmount>
                <span className="text-xs font-medium text-[var(--text-soft)] block mt-1">
                  Disponible real proyectado (30d)
                </span>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
                  <span>Saldo actual: <PrivacyAmount>{fmtMoney(disponible)}</PrivacyAmount></span>
                  <span>·</span>
                  <span>Compromisos: <PrivacyAmount>{fmtMoney(cashFlow.committed)}</PrivacyAmount></span>
                </div>
              </>
            )}

            {/* Cushion alerts if triggered */}
            {cashFlow.cushionStatus !== 'disabled' && cashFlow.cushionStatus !== 'ok' && (
              <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 font-medium">
                <span className="text-sm">⚠️</span>
                <span className="flex-1">{cashFlow.cushionMessage}</span>
                <button
                  type="button"
                  onClick={() => setIsCushionModalOpen(true)}
                  className="text-[11px] underline font-bold cursor-pointer hover:opacity-80 shrink-0"
                >
                  Ajustar colchón
                </button>
              </div>
            )}
          </div>

              {/* Secondary financial breakdown */}
              <div className="p-4 sm:p-5 rounded-xl bg-[var(--surface-muted)]/50 border border-[var(--border)]/70 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {heroMode === 'actual' ? (
                    <>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                          Compromisos Próximos (30d)
                        </span>
                        <PrivacyAmount as="strong" className="text-base font-bold text-rose-500 block mt-0.5 tabular-nums">
                          −{fmtMoney(cashFlow.committed)}
                        </PrivacyAmount>
                        <span className="text-[10px] text-[var(--text-soft)]">{cashFlow.commitments.length} {cashFlow.commitments.length === 1 ? 'pago' : 'pagos'}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                          Proyección tras compromisos
                        </span>
                        <PrivacyAmount as="strong" className={`text-base font-bold block mt-0.5 tabular-nums ${cashFlow.realAvailable < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {fmtMoney(cashFlow.realAvailable)}
                        </PrivacyAmount>
                        <span className="text-[10px] text-[var(--text-soft)]">libre tras pagos</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                          En Cuentas
                        </span>
                        <PrivacyAmount as="strong" className="text-base font-bold text-[var(--text)] block mt-0.5 tabular-nums">
                          {fmtMoney(disponible)}
                        </PrivacyAmount>
                        <span className="text-[10px] text-[var(--text-soft)]">{state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas'}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                          Comprometido 30d
                        </span>
                        <PrivacyAmount as="strong" className="text-base font-bold text-rose-500 block mt-0.5 tabular-nums">
                          −{fmtMoney(cashFlow.committed)}
                        </PrivacyAmount>
                        <span className="text-[10px] text-[var(--text-soft)]">{cashFlow.commitments.length} pagos</span>
                      </div>
                    </>
                  )}

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                      Próximos Ingresos
                    </span>
                    <PrivacyAmount as="strong" className="text-base font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5 tabular-nums">
                      +{fmtMoney(cashFlow.totalExpectedIncome)}
                    </PrivacyAmount>
                    <span className="text-[10px] text-[var(--text-soft)]">previstos en 30d</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                      Saldo Proyectado
                    </span>
                    <PrivacyAmount as="strong" className={`text-base font-bold block mt-0.5 tabular-nums ${cashFlow.projectedBalance < 0 ? 'text-rose-500' : 'text-[var(--text)]'}`}>
                      {fmtMoney(cashFlow.projectedBalance)}
                    </PrivacyAmount>
                    <span className="text-[10px] text-[var(--text-soft)]">al {fmtDate(cashFlow.horizonIso)}</span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[var(--text-soft)]">
                    Colchón: {state.finance.cushionEnabled !== false && state.finance.minCushion ? fmtMoney(state.finance.minCushion) : 'Desactivado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCushionInput(String(state.finance?.minCushion ?? 5000));
                      setCushionEnabledInput(state.finance?.cushionEnabled !== false);
                      setIsCushionModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-[var(--blue)] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <AppIcon name="settings" className="h-3 w-3" />
                    <span>Configurar</span>
                  </button>
                </div>
              </div>
            </div>

        {/* Carousel of Upcoming Commitments */}
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Próximos pagos comprometidos (30 días)
              </h3>
              <span className="text-[11px] text-[var(--text-soft)] font-mono font-bold">
                {cashFlow.commitments.length} compromiso{cashFlow.commitments.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                resetComForm();
                setIsCommitmentModalOpen(true);
              }}
              className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Nuevo compromiso</span>
            </button>
          </div>

          {cashFlow.commitments.length === 0 ? (
            <p className="text-xs text-[var(--text-soft)] py-2">
              No tenés pagos fijos ni cuotas comprometidas en los próximos 30 días. Todo tu saldo actual está libre.
            </p>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5">
              {cashFlow.commitments.map((item) => {
                const comEntity = state.finance?.commitments?.find((c) => c.id === item.id.replace('com-', '').replace(/-\d{4}-\d{2}-\d{2}$/, ''));
                return (
                  <div key={item.id} className="min-w-[190px] rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="block truncate text-xs font-bold text-[var(--text)]">{item.label}</span>
                        {item.kind === 'commitment' && comEntity?.remainingOccurrences != null && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 shrink-0">
                            {comEntity.remainingOccurrences} cuota{comEntity.remainingOccurrences === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <PrivacyAmount as="strong" className="number-value mt-1 block text-sm text-rose-500 font-mono font-bold">
                        −{fmtMoney(item.amount)}
                      </PrivacyAmount>
                      <span className="block text-[10px] text-[var(--text-faint)] mt-0.5">
                        {item.dueDate ? fmtDate(item.dueDate) : 'fecha pendiente'}
                      </span>
                    </div>
                    {comEntity && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)]/60 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => openPayCommitment(comEntity)}
                          className="text-[10px] font-bold text-[var(--blue)] hover:underline cursor-pointer flex items-center gap-1"
                          title="Registrar gasto real ahora y avanzar fecha"
                        >
                          <AppIcon name="check" className="h-3 w-3" />
                          <span>Pagar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => beginEditCommitment(comEntity)}
                          className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Navigation Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('movimientos')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'movimientos'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="wallet" className="h-4 w-4" />
          <span>Movimientos & Presupuesto</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuentas')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'cuentas'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="repeat" className="h-4 w-4" />
          <span>Cuentas & Conciliación</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
            {state.finance.accounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analisis')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'analisis'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="activity" className="h-4 w-4" />
          <span>Evolución & Métricas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proyeccion')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'proyeccion'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="trendingUp" className="h-4 w-4" />
          <span>Proyección 30/60/90</span>
          {(state.finance.expectedIncomes?.length || 0) > 0 && (
            <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
              {state.finance.expectedIncomes?.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: MOVIMIENTOS & PRESUPUESTO */}
      {activeTab === 'movimientos' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Warning if no accounts */}
          {state.finance.accounts.length === 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 flex items-center justify-between">
              <span>⚠️ Creá al menos una cuenta en la pestaña "Cuentas & Conciliación" antes de cargar movimientos.</span>
              <button
                type="button"
                onClick={() => setActiveTab('cuentas')}
                className="underline font-bold ml-2 cursor-pointer shrink-0"
              >
                Crear cuenta →
              </button>
            </div>
          )}

          {/* Quick Register Transaction Form */}
          <div id="qa-focus-tx" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--text)]">
                {editingTxId ? 'Editar movimiento' : 'Nuevo movimiento'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
                >
                  <AppIcon name="settings" className="h-3.5 w-3.5" />
                  <span>Categorías</span>
                </button>
                {editingTxId && (
                  <button
                    type="button"
                    onClick={cancelEditTx}
                    className="text-xs font-medium text-rose-500 hover:underline cursor-pointer"
                  >
                    Cancelar edición ✕
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleAddTx} className="space-y-3">
              {/* Primary Fast Entry Row */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                {/* Tipo */}
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-28 px-3 py-2 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-semibold text-[var(--text)] shrink-0"
                >
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>

                {/* Monto */}
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-32 px-3 py-2 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-mono font-bold text-[var(--text)] tabular-nums shrink-0"
                />

                {/* Categoría */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  >
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {editingTxId && !activeCategories.some((c) => c.id === txCategory) && (
                      <option key={txCategory} value={txCategory}>
                        {getCategoryName(state.finance?.categories, txCategory)} (Archivada)
                      </option>
                    )}
                  </select>
                </div>

                {/* Cuenta */}
                <select
                  value={txAccount}
                  onChange={(e) => setTxAccount(e.target.value)}
                  className="flex-1 min-w-[120px] px-3 py-2 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                >
                  {state.finance.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                {/* Toggle details button */}
                <button
                  type="button"
                  onClick={() => setShowTxDetails(!showTxDetails)}
                  className={`p-2 rounded-xl border text-xs transition cursor-pointer shrink-0 ${
                    showTxDetails || txNote || txFixed === 'fijo' || txDate !== todayISO()
                      ? 'border-[var(--blue)] bg-blue-500/10 text-[var(--blue)]'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                  title="Más detalles (nota, fecha, tipo)"
                  aria-label="Más detalles"
                >
                  <AppIcon name="settings" className="h-4 w-4" />
                </button>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!txAmount || Number(txAmount) <= 0}
                  className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 disabled:opacity-40 text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
                >
                  {editingTxId ? 'Guardar' : 'Agregar'}
                </button>
              </div>

              {/* Collapsible Secondary Details */}
              {(showTxDetails || editingTxId || txNote) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--border)]/70 animate-in fade-in duration-150">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                      Tipo de Gasto
                    </label>
                    <select
                      value={txFixed}
                      onChange={(e) => setTxFixed(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] outline-none"
                    >
                      <option value="variable">Variable</option>
                      <option value="fijo">Fijo</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                      Nota (opcional)
                    </label>
                    <input
                      type="text"
                      value={txNote}
                      onChange={(e) => setTxNote(e.target.value)}
                      placeholder="Ej.: Super, nafta..."
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] outline-none"
                    />
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Visual Monthly Budgets Progress */}
          <FinanceBudgetProgress
            categories={state.finance.categories}
            catSpent={catSpent}
            budgets={state.finance.budgets}
            onSetBudget={handleSetBudget}
            onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
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
        </div>
      )}

      {/* TAB 2: CUENTAS & CONCILIACIÓN */}
      {activeTab === 'cuentas' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Quick Transfers & 10-Second Reconciliation */}
          <FinanceOperationsCard state={state} onUpdateState={onUpdateState} />

          {/* Accounts, Subscriptions, Debts, Investments Sub-components Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Accounts */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
                <span>Cuentas & Billeteras</span>
                <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(disponible)}</PrivacyAmount>
              </h2>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
                <form onSubmit={handleAddAccount} className="flex gap-2">
                  <input
                    type="text"
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="Ej: Prex, Brou, Efectivo..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    placeholder="Saldo inicial"
                    className="w-28 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer hover:opacity-90"
                  >
                    ＋
                  </button>
                </form>

                <div className="divide-y divide-[var(--border)]">
                  {state.finance.accounts.length === 0 ? (
                    <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin cuentas creadas todavía.</p>
                  ) : (
                    state.finance.accounts.map((a) => (
                      <div key={a.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                        <span className="font-semibold text-[var(--text)]">{a.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-right">
                            <PrivacyAmount as="strong" className="block font-mono text-xs text-[var(--text)] font-bold">
                              {fmtMoney(a.balance)}
                            </PrivacyAmount>
                            <span className="text-[10px] text-[var(--text-faint)]">
                              {a.lastReconciledAt ? `Conciliada ${fmtDate(a.lastReconciledAt)}` : 'Sin conciliar'}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(a.id)}
                            className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="Eliminar cuenta"
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

            {/* Subscriptions */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center justify-between">
                <span>Suscripciones Mensuales</span>
                <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(subsTotal)}/mes</PrivacyAmount>
              </h2>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
                <form onSubmit={handleAddSubscription} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder="Ej: Spotify, Gimnasio..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={subDueDay}
                    onChange={(e) => setSubDueDay(e.target.value)}
                    placeholder="Día"
                    title="Día del mes de vencimiento"
                    className="w-14 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    placeholder="Monto"
                    className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer hover:opacity-90"
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
                        <span className="font-semibold text-[var(--text)]">{s.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-right font-mono text-xs">
                            <PrivacyAmount as="span" className="font-bold text-[var(--text)]">{fmtMoney(s.amount)}</PrivacyAmount>
                            <small className="block font-sans text-[9px] text-[var(--text-faint)]">
                              {s.dueDay ? `día ${s.dueDay}` : 'sin fecha fija'}
                            </small>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubscription(s.id)}
                            className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="Eliminar suscripción"
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
                <span>Deudas & Préstamos</span>
                <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcDebtsTotal(state))}</PrivacyAmount>
              </h2>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
                <form onSubmit={handleAddDebt} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={debtName}
                    onChange={(e) => setDebtName(e.target.value)}
                    placeholder="Ej: Cuota Tarjeta..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    value={debtMonthlyPayment}
                    onChange={(e) => setDebtMonthlyPayment(e.target.value)}
                    placeholder="Cuota mes"
                    title="Cuota de los próximos 30 días"
                    className="w-24 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    title="Próximo vencimiento"
                    className="w-32 px-2 py-1.5 text-[10px] rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    placeholder="Saldo total"
                    className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer hover:opacity-90"
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
                        <span className="font-semibold text-[var(--text)]">{d.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-right font-mono text-xs">
                            <PrivacyAmount as="span" className="font-bold text-[var(--text)]">{fmtMoney(d.amount)}</PrivacyAmount>
                            <small className="block font-sans text-[9px] text-[var(--text-faint)]">
                              {d.monthlyPayment ? <>cuota <PrivacyAmount as="span">{fmtMoney(d.monthlyPayment)}</PrivacyAmount></> : 'sin cuota'}
                              {d.dueDate ? ` · ${fmtDate(d.dueDate)}` : ''}
                            </small>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteDebt(d.id)}
                            className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="Eliminar deuda"
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
                <span>Inversiones & Activos</span>
                <PrivacyAmount as="span" className="text-xs font-mono text-[var(--text-soft)]">{fmtMoney(calcInvestmentsTotal(state))}</PrivacyAmount>
              </h2>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
                <form onSubmit={handleAddInvestment} className="flex gap-2">
                  <input
                    type="text"
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="Ej: Fondo, Bonos, Crypto..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <input
                    type="number"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    placeholder="Monto"
                    className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer hover:opacity-90"
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
                        <span className="font-semibold text-[var(--text)]">{i.name}</span>
                        <div className="flex items-center gap-3">
                          <PrivacyAmount as="span" className="font-mono text-xs font-bold text-[var(--text)]">
                            {fmtMoney(i.amount)}
                          </PrivacyAmount>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvestment(i.id)}
                            className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="Eliminar inversión"
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
      )}

      {/* TAB 3: EVOLUCIÓN & MÉTRICAS */}
      {activeTab === 'analisis' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Executive Indicators Grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="eyebrow">Ingresado este mes</span>
              <PrivacyAmount className="number-value mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">
                {fmtMoney(ingreso)}
              </PrivacyAmount>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="eyebrow">Gastado este mes</span>
              <PrivacyAmount className="number-value mt-2 text-xl font-bold text-rose-500 sm:text-2xl">
                {fmtMoney(gastado)}
              </PrivacyAmount>
              <span
                className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-1 ${
                  cmp.dir === 'up'
                    ? 'bg-rose-500/10 text-rose-500'
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
              <span className="eyebrow">Balance neto mensual</span>
              <PrivacyAmount className={`number-value mt-2 text-xl font-bold sm:text-2xl ${balance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {balance >= 0 ? `+${fmtMoney(balance)}` : fmtMoney(balance)}
              </PrivacyAmount>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="eyebrow">Patrimonio Neto</span>
              <PrivacyAmount className="number-value mt-2 text-xl font-bold text-[var(--text)] sm:text-2xl">
                {fmtMoney(patrimonio)}
              </PrivacyAmount>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">cuentas + inversiones − deudas</p>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="eyebrow">Gasto fijo</span>
              <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">
                {fmtMoney(fijoMes)}
              </PrivacyAmount>
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
              <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                {fmtMoney(rstats.gananciaTotal)}
              </PrivacyAmount>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">acumulado histórico</p>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="eyebrow">Gastado en el año</span>
              <PrivacyAmount className="text-xl font-extrabold font-mono mt-1 text-[var(--text)]">
                {fmtMoney(totalGastadoAnio)}
              </PrivacyAmount>
              <p className="text-[10px] text-[var(--text-faint)] mt-0.5">año {ref.getFullYear()}</p>
            </div>
          </div>

          {/* Monthly Evolution Chart */}
          {monthlyEvolutionData.length > 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">📈 Evolución Mensual (Ingresos vs Gastos)</h3>
                  <p className="text-xs text-[var(--text-soft)]">Comparativa de flujos de dinero por mes</p>
                </div>
              </div>
              <div className="h-64 w-full pt-2">
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
          ) : (
            <div className="p-8 text-center bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs text-[var(--text-faint)]">
              Cargá ingresos o gastos para comenzar a graficar la evolución mensual.
            </div>
          )}

          {/* Category Distribution This Month */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">📊 Distribución de Gastos por Categoría</h3>
                <p className="text-xs text-[var(--text-soft)]">Mes en curso</p>
              </div>
              {pieDataThisMonth.length > 0 && (
                <span className="text-xs font-normal text-[var(--text-faint)]">
                  Total: <strong className="font-mono text-[var(--text)]">{fmtMoney(gastado)}</strong>
                </span>
              )}
            </div>

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

                {/* Breakdown List */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {pieDataThisMonth.map((item, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    const pct = gastado > 0 ? ((item.value / gastado) * 100).toFixed(1) : '0';
                    return (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs"
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
                          <PrivacyAmount as="span" className="font-bold text-[var(--text)]">
                            {fmtMoney(item.value)}
                          </PrivacyAmount>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* All-time Spent Breakdown */}
          {pieDataAllTime.length > 0 && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[var(--text)]">🏛️ Histórico Acumulado por Categoría</h3>
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
          )}
        </div>
      )}

      {/* TAB 4: PROYECCIÓN 30 / 60 / 90 DÍAS */}
      {activeTab === 'proyeccion' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header & Horizon Picker */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="section-title">Proyección Financiera a 30 / 60 / 90 Días</h2>
              <p className="text-xs text-[var(--text-soft)] mt-1">
                Visualizá la liquidez diaria combinando tus ingresos previstos con suscripciones y cuotas de deuda comprometidas.
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] self-start sm:self-auto shadow-2xs">
              {([30, 60, 90] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setProjHorizon(h)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                    projHorizon === h
                      ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  {h} días
                </button>
              ))}
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface p-4 space-y-1">
              <span className="text-[10px] font-black uppercase text-[var(--text-faint)]">Saldo Inicial (Hoy)</span>
              <PrivacyAmount as="p" className="text-2xl font-black font-mono tracking-tight text-[var(--text)]">
                {fmtMoney(projection.currentBalance)}
              </PrivacyAmount>
              <span className="text-[11px] text-[var(--text-soft)] block">Total en cuentas activas</span>
            </div>

            <div className="surface p-4 space-y-1 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[var(--text-faint)]">Ingresos Esperados</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {projection.forecastItems.filter((f) => f.type === 'income').length} cobros
                </span>
              </div>
              <PrivacyAmount as="p" className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                +{fmtMoney(projection.totalExpectedIncome)}
              </PrivacyAmount>
              <span className="text-[11px] text-[var(--text-soft)] block">Horizonte {projHorizon} días</span>
            </div>

            <div className="surface p-4 space-y-1 border-l-4 border-l-rose-500">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[var(--text-faint)]">Compromisos Fijos</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  {projection.commitments.length} pagos
                </span>
              </div>
              <PrivacyAmount as="p" className="text-2xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400">
                -{fmtMoney(projection.committed)}
              </PrivacyAmount>
              <span className="text-[11px] text-[var(--text-soft)] block">Deudas y suscripciones</span>
            </div>

            <div className={`surface p-4 space-y-1 border-l-4 ${projection.projectedBalance >= 0 ? 'border-l-indigo-500' : 'border-l-rose-600'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[var(--text-faint)]">Saldo Proyectado</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  projection.netCashFlow >= 0
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}>
                  {projection.netCashFlow >= 0 ? '+' : ''}{fmtMoney(projection.netCashFlow)}
                </span>
              </div>
              <PrivacyAmount as="p" className={`text-2xl font-black font-mono tracking-tight ${
                projection.projectedBalance >= 0 ? 'text-[var(--text)]' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {fmtMoney(projection.projectedBalance)}
              </PrivacyAmount>
              <span className="text-[11px] text-[var(--text-soft)] block">Al {fmtDate(projection.horizonIso)}</span>
            </div>
          </div>

          {/* Predictive Alerts */}
          {projection.isDeficit ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="space-y-1">
                <p className="font-bold text-sm text-rose-800 dark:text-rose-200">
                  Alerta Crítica: Déficit de liquidez proyectado
                </p>
                <p>
                  El flujo financiero proyecta un saldo negativo de <strong className="font-mono">{fmtMoney(projection.minProjectedBalance)}</strong> el día <strong className="font-mono">{fmtDate(projection.minBalanceDate)}</strong> dentro de los próximos {projHorizon} días. Se recomienda diferir gastos o adelantar cobros para evitar sobregiro.
                </p>
              </div>
            </div>
          ) : projection.thresholdWarning ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-700 dark:text-amber-300">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="space-y-1">
                <p className="font-bold text-sm text-amber-800 dark:text-amber-200">
                  Advertencia de Liquidez: Por debajo del colchón de seguridad
                </p>
                <p>
                  El saldo proyectado descenderá hasta un mínimo de <strong className="font-mono">{fmtMoney(projection.minProjectedBalance)}</strong> el día <strong className="font-mono">{fmtDate(projection.minBalanceDate)}</strong>, quedando por debajo del umbral de seguridad de <strong>$5.000 UYU</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="text-lg shrink-0">🛡️</span>
              <p>
                <strong>Liquidez saludable:</strong> Tu saldo se mantendrá por encima del umbral de seguridad de $5.000 UYU durante todo el período de {projHorizon} días (mínimo de <strong className="font-mono">{fmtMoney(projection.minProjectedBalance)}</strong> el {fmtDate(projection.minBalanceDate)}).
              </p>
            </div>
          )}

          {/* Daily Trajectory Area Chart */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Trayectoria Diaria de Liquidez</h3>
                <p className="text-xs text-[var(--text-soft)]">
                  Evolución simulada de tu saldo día a día según calendario de cobros y pagos
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase text-[var(--text-faint)]">Mínimo en período</span>
                <p className="text-xs font-mono font-bold text-[var(--text)]">{fmtMoney(projection.minProjectedBalance)}</p>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={projection.dailyTrajectory}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="trajGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor={projection.isDeficit ? '#f43f5e' : '#10b981'}
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      if (!val) return '';
                      const parts = val.split('-');
                      return `${parts[2]}/${parts[1]}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload;
                        return (
                          <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-bold text-[var(--text)]">{fmtDate(pt.date)}</p>
                            <p className="font-mono text-[var(--blue)] font-bold">
                              Saldo proyectado: {fmtMoney(pt.endingBalance)}
                            </p>
                            {pt.netDayChange !== 0 && (
                              <p className={`font-mono text-[11px] ${pt.netDayChange > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                Flujo del día: {pt.netDayChange > 0 ? '+' : ''}{fmtMoney(pt.netDayChange)}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="endingBalance"
                    stroke={projection.isDeficit ? '#f43f5e' : '#10b981'}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#trajGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Colchón Financiero Mínimo Card */}
          <div className="surface p-4 sm:p-5 rounded-2xl border border-[var(--border)] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <h3 className="section-title">Colchón Financiero Mínimo</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${state.finance?.cushionEnabled !== false && (state.finance?.minCushion ?? 5000) > 0 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-500'}`}>
                  {state.finance?.cushionEnabled !== false && (state.finance?.minCushion ?? 5000) > 0 ? 'Activo' : 'Desactivado'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-soft)]">
                Monto mínimo que deseás preservar en cuentas sin gastar. El motor compara tu proyección día a día para alertarte con anticipación si caerás por debajo.
              </p>
              <div className="pt-1">
                <p className={`text-xs font-semibold ${
                  cashFlow.cushionStatus === 'disabled'
                    ? 'text-[var(--text-faint)]'
                    : cashFlow.cushionStatus === 'below_current'
                    ? 'text-amber-700 dark:text-amber-400 font-bold'
                    : cashFlow.cushionStatus === 'projected_below'
                    ? 'text-amber-600 dark:text-amber-300 font-bold'
                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
                }`}>
                  {cashFlow.cushionMessage}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--text-faint)] block">Colchón actual</span>
                <span className="font-mono font-black text-lg text-[var(--text)]">
                  {state.finance?.cushionEnabled !== false && state.finance?.minCushion ? fmtMoney(state.finance.minCushion) : '$0'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCushionInput(String(state.finance?.minCushion ?? 5000));
                  setCushionEnabledInput(state.finance?.cushionEnabled !== false);
                  setIsCushionModalOpen(true);
                }}
                className="secondary-button py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <AppIcon name="settings" className="h-3.5 w-3.5" />
                <span>Configurar</span>
              </button>
            </div>
          </div>

          {/* Financial Commitments & Recurring Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="surface p-4 sm:p-5 space-y-4">
              <div>
                <h3 className="section-title">Nuevo Compromiso Financiero</h3>
                <p className="text-xs text-[var(--text-soft)] mt-1">
                  Gastos futuros programados, servicios o cuotas finitas. El motor proyecta su impacto a 30 días sin descontar tu saldo real actual hasta que se paguen.
                </p>
              </div>

              <form onSubmit={handleSaveCommitment} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Nombre / Obligación
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Antel, Tarjeta, Cuota TV"
                    value={comName}
                    onChange={(e) => setComName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Monto (UYU)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="0"
                      value={comAmount}
                      onChange={(e) => setComAmount(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Próximo Vencimiento
                    </label>
                    <input
                      type="date"
                      required
                      value={comDate}
                      onChange={(e) => setComDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Frecuencia
                    </label>
                    <select
                      value={comFreq}
                      onChange={(e) => setComFreq(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    >
                      <option value="monthly">Mensual</option>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="yearly">Anual</option>
                      <option value="once">Única vez</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Categoría
                    </label>
                    <select
                      value={comCategory}
                      onChange={(e) => setComCategory(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    >
                      {(() => {
                        const activeCats = getActiveCategories(state.finance?.categories || []);
                        const allCats = getAllCategories(state.finance?.categories || []);
                        const current = allCats.find((c) => c.id === comCategory);
                        const list = [...activeCats];
                        if (current && !current.active && !list.some((c) => c.id === current.id)) {
                          list.push(current);
                        }
                        return list.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}{!cat.active ? ' (archivada)' : ''}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>

                {/* Cuotas / Finito toggle */}
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={comIsFinite}
                      onChange={(e) => setComIsFinite(e.target.checked)}
                      className="rounded cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-[var(--text)]">
                      Es un pago en cuotas / compromiso con fin
                    </span>
                  </label>
                </div>

                {comIsFinite && (
                  <div className="space-y-2 p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                          Cuotas Totales
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Ej. 3"
                          value={comTotalOccurrences}
                          onChange={(e) => setComTotalOccurrences(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs font-mono text-[var(--text)]"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                          Cuotas Restantes
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Ej. 2"
                          value={comRemainingOccurrences}
                          onChange={(e) => setComRemainingOccurrences(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs font-mono text-[var(--text)]"
                        />
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-[var(--border)]/70">
                      <label className="text-[9px] font-medium text-[var(--text-soft)] block mb-0.5">
                        Sugerir cuota desde total financiado:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          step="any"
                          placeholder="Total compra (opcional)"
                          value={finTotalAmount}
                          onChange={(e) => setFinTotalAmount(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-xs font-mono text-[var(--text)] placeholder-[var(--text-faint)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tot = Number(finTotalAmount);
                            const n = Number(comTotalOccurrences);
                            if (tot > 0 && n > 0) {
                              const suggested = Math.round((tot / n) * 100) / 100;
                              setComAmount(String(suggested));
                            } else {
                              showToast('Ingresá el total de compra y cuotas totales para sugerir.', 'info');
                            }
                          }}
                          className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] shrink-0 cursor-pointer"
                          title="Calcular cuota sugerida (total / cuotas)"
                        >
                          Calcular
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Cuenta de débito (Opcional)
                  </label>
                  <select
                    value={comAccount}
                    onChange={(e) => setComAccount(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  >
                    <option value="">Sin asignar</option>
                    {(state.finance.accounts || []).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full primary-button py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <AppIcon name="plus" className="h-4 w-4" />
                  <span>Guardar Compromiso</span>
                </button>
              </form>
            </div>

            {/* List */}
            <div className="lg:col-span-2 surface p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="section-title">Compromisos & Gastos Programados</h3>
                  <p className="text-xs text-[var(--text-soft)]">
                    {sortedCommitments.length} compromiso{sortedCommitments.length === 1 ? '' : 's'} activo{sortedCommitments.length === 1 ? '' : 's'} (orden cronológico)
                  </p>
                </div>
              </div>

              {sortedCommitments.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-2xl p-6 text-[var(--text-faint)] text-xs space-y-2">
                  <p className="text-2xl">💳</p>
                  <p className="font-semibold text-[var(--text-soft)]">No tenés compromisos financieros registrados</p>
                  <p>Agregá tus pagos de servicios, cuotas de compras o compromisos fijos para saber exactamente cuánto dinero libre tenés.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sortedCommitments.map((com) => {
                    const freqLabels: Record<string, string> = {
                      monthly: 'Mensual',
                      biweekly: 'Quincenal',
                      weekly: 'Semanal',
                      yearly: 'Anual',
                      once: 'Única vez',
                    };
                    const accountName = state.finance.accounts.find((a) => a.id === com.accountId)?.name;
                    const isOverdue = com.nextDueDate < todayISO();

                    return (
                      <div
                        key={com.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          com.active
                            ? 'bg-[var(--card)] border-[var(--border)] shadow-2xs'
                            : 'bg-[var(--surface-muted)]/50 border-[var(--border)]/50 opacity-60'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-xs text-[var(--text)] truncate">{com.name}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
                              {freqLabels[com.frequency] || com.frequency}
                            </span>
                            {com.remainingOccurrences != null && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-bold">
                                {com.remainingOccurrences} cuota{com.remainingOccurrences === 1 ? '' : 's'} restante{com.remainingOccurrences === 1 ? '' : 's'}
                              </span>
                            )}
                            {isOverdue && com.active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                Vencido
                              </span>
                            )}
                            {com.nextDueDate === todayISO() && com.active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                Vence hoy
                              </span>
                            )}
                            {!com.active && com.remainingOccurrences === 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Finalizado
                              </span>
                            )}
                            {!com.active && com.remainingOccurrences !== 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-500">
                                Pausado
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-soft)]">
                            <span>Vence: <strong className={`font-mono ${isOverdue ? 'text-rose-500 font-bold' : 'text-[var(--text)]'}`}>{fmtDate(com.nextDueDate)}</strong></span>
                            {accountName && <span>Cuenta: <strong>{accountName}</strong></span>}
                            {com.category && <span>Cat: <strong>{getCategoryName(state.finance?.categories, com.category)}</strong></span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <PrivacyAmount as="span" className="font-mono font-black text-sm text-rose-500 mr-1">
                            −{fmtMoney(com.amount)}
                          </PrivacyAmount>

                          {com.active && (
                            <button
                              type="button"
                              onClick={() => openPayCommitment(com)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Registrar gasto real ahora y avanzar fecha"
                            >
                              <AppIcon name="check" className="h-3.5 w-3.5" />
                              <span>Pagar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleCommitment(com.id)}
                            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                            title={com.active ? 'Pausar compromiso' : 'Activar compromiso'}
                          >
                            <AppIcon name={com.active ? 'pause' : 'play'} className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => beginEditCommitment(com)}
                            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                            title="Editar compromiso"
                          >
                            <AppIcon name="edit" className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCommitment(com.id)}
                            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title="Eliminar compromiso"
                          >
                            <AppIcon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Expected Incomes Form & List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div id="qa-focus-inc" className="surface p-4 sm:p-5 space-y-4">
              <div>
                <h3 className="section-title">
                  {editingIncId ? 'Editar Ingreso Previsto' : 'Nuevo Ingreso Previsto'}
                </h3>
                <p className="text-xs text-[var(--text-soft)] mt-1">
                  Se usa exclusivamente para simulación financiera. No crea transacciones contables reales hasta que confirmes su cobro.
                </p>
              </div>

              <form onSubmit={handleAddExpectedIncome} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Concepto / Fuente
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sueldo, Cobro freelance, Alquiler"
                    value={incName}
                    onChange={(e) => setIncName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Monto (UYU)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="0"
                      value={incAmount}
                      onChange={(e) => setIncAmount(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Próxima Fecha
                    </label>
                    <input
                      type="date"
                      required
                      value={incDate}
                      onChange={(e) => setIncDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Frecuencia de Recurrencia
                  </label>
                  <select
                    value={incFreq}
                    onChange={(e) => setIncFreq(e.target.value as ExpectedIncomeFrequency)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  >
                    <option value="monthly">Mensual (mismo día de cada mes)</option>
                    <option value="biweekly">Quincenal (cada 14 días)</option>
                    <option value="weekly">Semanal (cada 7 días)</option>
                    <option value="yearly">Anual (cada año)</option>
                    <option value="once">Única vez (cobro puntual)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Categoría (Opcional)
                    </label>
                    <select
                      value={incCategory}
                      onChange={(e) => setIncCategory(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    >
                      <option value="">Sin categoría</option>
                      {(() => {
                        const activeCats = getActiveCategories(state.finance?.categories || []);
                        const allCats = getAllCategories(state.finance?.categories || []);
                        const current = allCats.find((c) => c.id === incCategory);
                        const list = [...activeCats];
                        if (current && !current.active && !list.some((c) => c.id === current.id)) {
                          list.push(current);
                        }
                        return list.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}{!cat.active ? ' (archivada)' : ''}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Cuenta Destino
                    </label>
                    <select
                      value={incAccount}
                      onChange={(e) => setIncAccount(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    >
                      <option value="">Sin asignar</option>
                      {(state.finance.accounts || []).map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {incFreq !== 'once' && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                      Fecha Límite / Fin (Opcional)
                    </label>
                    <input
                      type="date"
                      value={incEndDate}
                      onChange={(e) => setIncEndDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2">
                  {editingIncId && (
                    <button
                      type="button"
                      onClick={cancelEditExpectedIncome}
                      className="w-1/3 py-2.5 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`${editingIncId ? 'w-2/3' : 'w-full'} primary-button py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer`}
                  >
                    <AppIcon name={editingIncId ? 'check' : 'plus'} className="h-4 w-4" />
                    <span>{editingIncId ? 'Guardar Cambios' : 'Programar Ingreso Previsto'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* List */}
            <div className="lg:col-span-2 surface p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="section-title">Ingresos Programados</h3>
                  <p className="text-xs text-[var(--text-soft)]">
                    {(state.finance.expectedIncomes?.length || 0)} ingreso{state.finance.expectedIncomes?.length === 1 ? '' : 's'} configurado{state.finance.expectedIncomes?.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {(!state.finance.expectedIncomes || state.finance.expectedIncomes.length === 0) ? (
                <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-2xl p-6 text-[var(--text-faint)] text-xs space-y-2">
                  <p className="text-2xl">💸</p>
                  <p className="font-semibold text-[var(--text-soft)]">No hay ingresos previstos configurados</p>
                  <p>Agregá sueldos, facturaciones o cobros futuros para que el motor proyecte tu saldo real a 30, 60 y 90 días.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {state.finance.expectedIncomes.map((inc) => {
                    const freqLabels: Record<string, string> = {
                      monthly: 'Mensual',
                      biweekly: 'Quincenal',
                      weekly: 'Semanal',
                      yearly: 'Anual',
                      once: 'Única vez',
                    };
                    const accountName = state.finance.accounts.find((a) => a.id === inc.accountId)?.name;

                    return (
                      <div
                        key={inc.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          inc.active
                            ? 'bg-[var(--card)] border-[var(--border)] shadow-2xs'
                            : 'bg-[var(--surface-muted)]/50 border-[var(--border)]/50 opacity-60'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[var(--text)] truncate">{inc.name}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
                              {freqLabels[inc.frequency] || inc.frequency}
                            </span>
                            {!inc.active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-500">
                                Pausado
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-soft)]">
                            <span>Desde: <strong className="font-mono text-[var(--text)]">{fmtDate(inc.startDate)}</strong></span>
                            {accountName && <span>Cuenta: <strong>{accountName}</strong></span>}
                            {inc.category && <span>Cat: <strong>{getCategoryName(state.finance?.categories, inc.category)}</strong></span>}
                            {inc.endDate && <span>Fin: <strong className="font-mono">{fmtDate(inc.endDate)}</strong></span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                          <PrivacyAmount as="span" className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                            +{fmtMoney(inc.amount)}
                          </PrivacyAmount>

                          {/* Quick Convert to Real Transaction */}
                          <button
                            type="button"
                            onClick={() => handleConfirmIncomeReal(inc)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-emerald-500/20"
                            title="Registrar cobro real en tus cuentas hoy"
                          >
                            <AppIcon name="check" className="h-3.5 w-3.5" />
                            <span>Cobrado hoy</span>
                          </button>

                          {/* Toggle Active */}
                          <button
                            type="button"
                            onClick={() => handleToggleExpectedIncome(inc.id)}
                            className="p-1.5 rounded-lg text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-all cursor-pointer"
                            title={inc.active ? 'Pausar previsión' : 'Reanudar previsión'}
                          >
                            <AppIcon name={inc.active ? 'pause' : 'play'} className="h-4 w-4" />
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => beginEditExpectedIncome(inc)}
                            className="p-1.5 rounded-lg text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-all cursor-pointer"
                            title="Editar ingreso previsto"
                          >
                            <AppIcon name="edit" className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteExpectedIncome(inc.id)}
                            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                            title="Eliminar ingreso previsto"
                          >
                            <AppIcon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Chronological Forecast Schedule */}
          {projection.forecastItems.length > 0 && (
            <div className="surface p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="section-title">Cronograma de Flujos ({projHorizon} Días)</h3>
                  <p className="text-xs text-[var(--text-soft)]">
                    Orden cronológico de cobros y pagos previstos con saldo resultante estimado
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-soft)] font-bold">
                  {projection.forecastItems.length} eventos
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--text-faint)]">
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Concepto</th>
                      <th className="py-2.5 px-3 text-right">Monto</th>
                      <th className="py-2.5 px-3 text-right">Saldo Proyectado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {forecastRows.map((item, idx) => (
                      <tr key={`${item.id}-${item.date}-${idx}`} className="hover:bg-[var(--surface-muted)]/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-[var(--text)] whitespace-nowrap">
                          {fmtDate(item.date)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            item.type === 'income'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}>
                            {item.type === 'income' ? 'Ingreso Previsto' : 'Compromiso Fijo'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--text)]">
                          {item.label}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          <PrivacyAmount>
                            {item.type === 'income' ? '+' : '-'}{fmtMoney(item.amount)}
                          </PrivacyAmount>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text)] whitespace-nowrap">
                          <PrivacyAmount>
                            {fmtMoney(item.runningBalance)}
                          </PrivacyAmount>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Commitment Modal (Create / Edit) */}
      {isCommitmentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={resetComForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingComId ? 'Editar Compromiso' : 'Nuevo Compromiso'}
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h3 className="section-title">
                  {editingComId ? 'Editar Compromiso' : 'Nuevo Compromiso'}
                </h3>
              </div>
              <button
                type="button"
                onClick={resetComForm}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCommitment} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Nombre / Obligación
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Antel, Alquiler, Cuota Gimnasio"
                  value={comName}
                  onChange={(e) => setComName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-hidden focus:border-[var(--blue)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Monto (UYU)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="0"
                    value={comAmount}
                    onChange={(e) => setComAmount(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Próximo Vencimiento
                  </label>
                  <input
                    type="date"
                    required
                    value={comDate}
                    onChange={(e) => setComDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Frecuencia
                  </label>
                  <select
                    value={comFreq}
                    onChange={(e) => setComFreq(e.target.value as any)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="yearly">Anual</option>
                    <option value="once">Única vez</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Categoría
                  </label>
                  <select
                    value={comCategory}
                    onChange={(e) => setComCategory(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  >
                    {(() => {
                      const activeCats = getActiveCategories(state.finance?.categories || []);
                      const allCats = getAllCategories(state.finance?.categories || []);
                      const current = allCats.find((c) => c.id === comCategory);
                      const list = [...activeCats];
                      if (current && !current.active && !list.some((c) => c.id === current.id)) {
                        list.push(current);
                      }
                      return list.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}{!cat.active ? ' (archivada)' : ''}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              {/* Cuotas toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={comIsFinite}
                    onChange={(e) => setComIsFinite(e.target.checked)}
                    className="rounded cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-[var(--text)]">
                    Es un pago en cuotas / compromiso con fin
                  </span>
                </label>
              </div>

              {comIsFinite && (
                <div className="space-y-2 p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                        Cuotas Totales
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ej. 3"
                        value={comTotalOccurrences}
                        onChange={(e) => setComTotalOccurrences(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs font-mono text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                        Cuotas Restantes
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ej. 2"
                        value={comRemainingOccurrences}
                        onChange={(e) => setComRemainingOccurrences(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs font-mono text-[var(--text)]"
                      />
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-[var(--border)]/70">
                    <label className="text-[9px] font-medium text-[var(--text-soft)] block mb-0.5">
                      Sugerir cuota desde total financiado:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Total compra (opcional)"
                        value={finTotalAmount}
                        onChange={(e) => setFinTotalAmount(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-xs font-mono text-[var(--text)] placeholder-[var(--text-faint)]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const tot = Number(finTotalAmount);
                          const n = Number(comTotalOccurrences);
                          if (tot > 0 && n > 0) {
                            const suggested = Math.round((tot / n) * 100) / 100;
                            setComAmount(String(suggested));
                          } else {
                            showToast('Ingresá el total de compra y cuotas totales para sugerir.', 'info');
                          }
                        }}
                        className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] shrink-0 cursor-pointer"
                        title="Calcular cuota sugerida (total / cuotas)"
                      >
                        Calcular
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Cuenta de débito (Opcional)
                </label>
                <select
                  value={comAccount}
                  onChange={(e) => setComAccount(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                >
                  <option value="">Sin asignar</option>
                  {(state.finance.accounts || []).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Notas (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Detalles adicionales"
                  value={comNotes}
                  onChange={(e) => setComNotes(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-hidden focus:border-[var(--blue)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={resetComForm}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button py-2 px-4 text-xs font-bold cursor-pointer"
                >
                  {editingComId ? 'Guardar Cambios' : 'Registrar Compromiso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {payingCommitment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPayingCommitment(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar Pago de Compromiso"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h3 className="section-title">Confirmar Pago</h3>
              </div>
              <button
                type="button"
                onClick={() => setPayingCommitment(null)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Se registrará un gasto real y se avanzará el vencimiento de{' '}
              <strong className="text-[var(--text)]">{payingCommitment.name}</strong>.
            </p>

            <form onSubmit={handleExecutePayment} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Monto a Pagar (UYU)
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                />
                <span className="text-[10px] text-[var(--text-faint)] block mt-0.5">
                  Podés ajustar el valor si la factura o cuota real difiere del estimado.
                </span>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Cuenta de Débito
                </label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                >
                  {(state.finance.accounts || []).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Saldo: {state.settings?.privacyMode ? '••••' : fmtMoney(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Checkbox to also update future occurrences */}
              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={payUpdateFuture}
                    onChange={(e) => setPayUpdateFuture(e.target.checked)}
                    className="rounded cursor-pointer mt-0.5"
                  />
                  <span className="text-xs text-[var(--text-soft)] leading-snug">
                    Actualizar también el monto de cuotas o vencimientos futuros con este nuevo valor ({payAmount ? (state.settings?.privacyMode ? '••••' : fmtMoney(Number(payAmount) || 0)) : '$0'})
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setPayingCommitment(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <AppIcon name="check" className="h-3.5 w-3.5" />
                  <span>Confirmar Pago</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cushion Modal */}
      {isCushionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsCushionModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Colchón Financiero Mínimo"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h3 className="section-title">Colchón Financiero Mínimo</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCushionModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Tu colchón mínimo es la reserva de dinero que no deseás tocar. LifeOS vigila tu flujo proyectado día a día y te avisará si tus gastos planificados harían que caigas por debajo.
            </p>

            <form onSubmit={handleSaveCushion} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text)] block">Activar colchón de seguridad</span>
                  <span className="text-[11px] text-[var(--text-soft)]">Habilita advertencias y cálculo de alertas</span>
                </div>
                <input
                  type="checkbox"
                  checked={cushionEnabledInput}
                  onChange={(e) => setCushionEnabledInput(e.target.checked)}
                  className="h-4 w-4 rounded cursor-pointer"
                />
              </div>

              {cushionEnabledInput && (
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                    Monto Mínimo de Seguridad (UYU)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={cushionInput}
                    onChange={(e) => setCushionInput(e.target.value)}
                    placeholder="Ej. 10000"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-sm font-mono font-bold text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                  <p className="text-[11px] text-[var(--text-soft)] mt-1">
                    Saldo actual en cuentas: <strong>{fmtMoney(disponible)}</strong>
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsCushionModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button py-2 px-4 text-xs font-bold cursor-pointer"
                >
                  Guardar Colchón
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finance Category Manager Modal */}
      <FinanceCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        state={state}
        onUpdateState={onUpdateState}
        showToast={showToast}
      />
    </div>
  );
};
