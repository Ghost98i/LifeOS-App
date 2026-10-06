import React, { useEffect, useMemo, useState } from 'react';
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
  groupTransactionsByMonth,
  resaleStats,
  defaultAccountId,
  cashFlow30Days,
  cashFlowProjection,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
} from '../lib/calculations';
import { FinanceHero } from './FinanceHero';
import { FinanceTransactionModal } from './FinanceTransactionModal';
import { FinanceTransactionTable } from './FinanceTransactionTable';
import { FinanceBudgetProgress } from './FinanceBudgetProgress';
import { FinanceAccountsView } from './FinanceAccountsView';
import { FinanceAnalyticsView } from './FinanceAnalyticsView';
import { FinanceFutureView } from './FinanceFutureView';
import { FinanceCategoryModal } from './FinanceCategoryModal';
import { getActiveCategories, getAllCategories } from '../lib/financeCategories';
import { addAccount, addTransaction, deleteAccount, deleteTransaction, updateTransaction } from '../lib/financeFlows';
import { loadFinanceCustomization, saveFinanceCustomization, FinanceViewCustomization } from '../lib/viewCustomization';
import { CustomizeFinanceModal } from './CustomizeFinanceModal';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';

interface FinanzasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  initialTransactionType?: 'gasto' | 'ingreso' | null;
}

export const FinanzasView: React.FC<FinanzasViewProps> = ({
  state,
  onUpdateState,
  initialTransactionType,
}) => {
  // Main Tab State
  const [activeTab, setActiveTab] = useState<'movimientos' | 'cuentas' | 'analisis' | 'proyeccion'>('movimientos');

  // View Customization State (Monarch-inspired modular personalization)
  const [financeCustomization, setFinanceCustomization] = useState<FinanceViewCustomization>(loadFinanceCustomization);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);

  // Modals & Entity Forms
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txModalInitialType, setTxModalInitialType] = useState<'gasto' | 'ingreso'>('gasto');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Projections Horizon & Memoized calculations
  const [projHorizon, setProjHorizon] = useState<30 | 60 | 90>(30);

  // Financial Commitments modal & edit state
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [editingComId, setEditingComId] = useState<string | null>(null);
  const [comName, setComName] = useState('');
  const [comAmount, setComAmount] = useState('');
  const [comDate, setComDate] = useState(todayISO());
  const [comFreq, setComFreq] = useState<FinancialCommitmentFrequency>('monthly');
  const [comCategory, setComCategory] = useState<string>('Varios');
  const [comAccount, setComAccount] = useState<string>('');
  const [comIsFinite, setComIsFinite] = useState(false);
  const [comTotalOccurrences, setComTotalOccurrences] = useState('');
  const [comRemainingOccurrences, setComRemainingOccurrences] = useState('');
  const [comEndDate, setComEndDate] = useState('');
  const [comNotes, setComNotes] = useState('');
  const [finTotalAmount, setFinTotalAmount] = useState('');

  // Expected Income modal & edit state
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editingIncId, setEditingIncId] = useState<string | null>(null);
  const [incName, setIncName] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState(todayISO());
  const [incFreq, setIncFreq] = useState<ExpectedIncomeFrequency>('monthly');
  const [incCategory, setIncCategory] = useState<string>('Varios');
  const [incAccount, setIncAccount] = useState<string>('');
  const [incEndDate, setIncEndDate] = useState('');

  // Payment confirmation modal
  const [payingCommitment, setPayingCommitment] = useState<FinancialCommitment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccount, setPayAccount] = useState('');
  const [payUpdateFuture, setPayUpdateFuture] = useState(false);

  // Financial Cushion modal
  const [isCushionModalOpen, setIsCushionModalOpen] = useState(false);
  const [cushionInput, setCushionInput] = useState(String(state.finance?.minCushion ?? 5000));
  const [cushionEnabledInput, setCushionEnabledInput] = useState(state.finance?.cushionEnabled !== false);

  const activeCategories = useMemo(
    () => getActiveCategories(state.finance?.categories),
    [state.finance?.categories]
  );

  // Respond to quick capture intent
  useEffect(() => {
    if (initialTransactionType) {
      setTxModalInitialType(initialTransactionType);
      setEditingTx(null);
      setIsTxModalOpen(true);
    }
  }, [initialTransactionType]);

  // Financial Computations
  const cashFlow = useMemo(() => cashFlow30Days(state), [state]);
  const projection = useMemo(() => cashFlowProjection(state, projHorizon), [state, projHorizon]);

  const disponible = calcAccountsTotal(state);
  const patrimonio = calcNetWorth(state);
  const gastado = calcSpentMonth(state, 0);
  const ingreso = calcIncomeMonth(state, 0);
  const balance = ingreso - gastado;
  const cmp = calcMonthComparison(state);
  const catSpent = calcSpentByCategory(state, 0);
  const allTimeSpent = calcSpentByCategoryAllTime(state);
  const rstats = resaleStats(state);
  const monthGroups = groupTransactionsByMonth(state);

  const today = new Date();
  const totalGastadoAnio = (state.finance?.transactions || [])
    .filter((t) => t.type === 'gasto' && t.origin !== 'adjustment' && sameYear(t.date, today))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const fijoMes = calcFixedSpentMonth(state, 0);
  const gastoVariable = Math.max(0, gastado - fijoMes);

  const monthlyEvolutionData = useMemo(() => {
    return monthGroups
      .slice()
      .reverse()
      .map((m) => ({
        name: m.label,
        Gastos: m.totalGasto,
        Ingresos: m.totalIngreso,
      }));
  }, [monthGroups]);

  // Transaction Operations
  const handleOpenNewTx = (type: 'gasto' | 'ingreso' = 'gasto') => {
    setEditingTx(null);
    setTxModalInitialType(type);
    setIsTxModalOpen(true);
  };

  const handleEditTx = (transaction: Transaction) => {
    setEditingTx(transaction);
    setTxModalInitialType(transaction.type);
    setIsTxModalOpen(true);
  };

  const handleSubmitTx = (data: {
    type: 'gasto' | 'ingreso';
    amount: number;
    category: string;
    accountId: string;
    fixed: 'variable' | 'fijo';
    date: string;
    note: string;
  }) => {
    try {
      onUpdateState((draft) => {
        const input = {
          type: data.type,
          amount: data.amount,
          category: data.category,
          fixed: data.fixed,
          date: data.date,
          note: data.note,
          accountId: data.accountId || defaultAccountId(state),
        };
        if (editingTx) {
          updateTransaction(draft, editingTx.id, input);
        } else {
          addTransaction(draft, input);
        }
      });
      playSound('coins');
      setIsTxModalOpen(false);
      setEditingTx(null);
      showToast(editingTx ? 'Movimiento actualizado.' : `${data.type === 'ingreso' ? 'Ingreso' : 'Gasto'} guardado.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el movimiento.', 'error');
    }
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

  // Accounts & Assets Operations
  const handleAddAccount = (name: string, balanceVal: number) => {
    try {
      onUpdateState((draft) => { addAccount(draft, name, balanceVal); });
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

  const handleAddSubscription = (name: string, amountVal: number, dueDayVal: number | null) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.subscriptions) draft.finance.subscriptions = [];
      draft.finance.subscriptions.push({
        id: uid(),
        name,
        amount: amountVal,
        dueDay: dueDayVal,
      });
    });
    showToast('Suscripción agregada.');
  };

  const handleDeleteSubscription = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.subscriptions = (draft.finance.subscriptions || []).filter((s) => s.id !== id);
    });
    showToast('Suscripción eliminada.', 'info');
  };

  const handleAddDebt = (name: string, amountVal: number, monthlyPaymentVal: number, dueDateVal: string | null) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.debts) draft.finance.debts = [];
      draft.finance.debts.push({
        id: uid(),
        name,
        amount: amountVal,
        monthlyPayment: monthlyPaymentVal,
        dueDate: dueDateVal,
      });
    });
    showToast('Deuda registrada.');
  };

  const handleDeleteDebt = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.debts = (draft.finance.debts || []).filter((d) => d.id !== id);
    });
    showToast('Deuda eliminada.', 'info');
  };

  const handleAddInvestment = (name: string, amountVal: number) => {
    onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.investments) draft.finance.investments = [];
      draft.finance.investments.push({
        id: uid(),
        name,
        amount: amountVal,
      });
    });
    showToast('Inversión registrada.');
  };

  const handleDeleteInvestment = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.investments = (draft.finance.investments || []).filter((i) => i.id !== id);
    });
    showToast('Inversión eliminada.', 'info');
  };

  // Commitments Operations
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

  // Payment Confirmation Operations
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

  // Expected Incomes Operations
  const resetIncomeForm = () => {
    setIncName('');
    setIncAmount('');
    setIncDate(todayISO());
    setIncFreq('monthly');
    setIncCategory(activeCategories[0]?.id || 'Varios');
    setIncAccount(defaultAccountId(state) || '');
    setIncEndDate('');
    setEditingIncId(null);
    setIsIncomeModalOpen(false);
  };

  const handleSaveExpectedIncome = (e: React.FormEvent) => {
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
    playSound('success');
    showToast(editingIncId ? 'Ingreso previsto actualizado.' : 'Ingreso previsto registrado.');
    resetIncomeForm();
  };

  const beginEditExpectedIncome = (inc: ExpectedIncome) => {
    setEditingIncId(inc.id);
    setIncName(inc.name);
    setIncAmount(String(inc.amount));
    setIncDate(inc.startDate);
    setIncFreq(inc.frequency);
    setIncCategory(inc.category || activeCategories[0]?.id || 'Varios');
    setIncAccount(inc.accountId || defaultAccountId(state) || '');
    setIncEndDate(inc.endDate || '');
    setIsIncomeModalOpen(true);
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

  // Cushion Operations
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

  // Keyboard shortcut for escaping modals
  useEffect(() => {
    if (!isCommitmentModalOpen && !isIncomeModalOpen && !isCushionModalOpen && !payingCommitment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCommitmentModalOpen) setIsCommitmentModalOpen(false);
        if (isIncomeModalOpen) setIsIncomeModalOpen(false);
        if (isCushionModalOpen) setIsCushionModalOpen(false);
        if (payingCommitment) setPayingCommitment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommitmentModalOpen, isIncomeModalOpen, isCushionModalOpen, payingCommitment]);

  return (
    <div className="space-y-6">
      {/* 1. Page Header with Privacy Toggle */}
      <PageHeader
        title="Finanzas"
        subtitle="Entendé tu liquidez real, operá dinero con rapidez y anticipá problemas antes de que ocurran."
        actions={
          <button
            type="button"
            onClick={() => {
              onUpdateState((draft) => {
                draft.settings.privacyMode = !draft.settings.privacyMode;
              });
            }}
            className="secondary-button flex items-center gap-1.5 cursor-pointer"
            title="Alternar Stream Guard (Modo Privacidad)"
          >
            <AppIcon name={state.settings.privacyMode ? 'eyeOff' : 'eye'} className="h-4 w-4" />
            <span>{state.settings.privacyMode ? 'Mostrar montos' : 'Modo Privacidad'}</span>
          </button>
        }
      />

      {/* 2. Hero Editorial Asimétrico: Variante Completa en Resumen/Cuentas, Compacta en Análisis/Futuro */}
      <FinanceHero
        state={state}
        cashFlow={cashFlow}
        variant={activeTab === 'analisis' || activeTab === 'proyeccion' ? 'compact' : 'full'}
        displayMode={financeCustomization.heroDisplayMode}
        showCommitmentsStrip={financeCustomization.showCommitmentsStrip && financeCustomization.visibleSections.commitments !== false}
        onOpenNewTx={() => handleOpenNewTx('gasto')}
        onOpenTransfer={() => setActiveTab('cuentas')}
        onOpenCommitmentModal={() => {
          resetComForm();
          setIsCommitmentModalOpen(true);
        }}
        onOpenCushionModal={() => {
          setCushionInput(String(state.finance?.minCushion ?? 5000));
          setCushionEnabledInput(state.finance?.cushionEnabled !== false);
          setIsCushionModalOpen(true);
        }}
        onPayCommitment={openPayCommitment}
        onEditCommitment={beginEditCommitment}
        onOpenCustomize={() => setIsCustomizeModalOpen(true)}
      />

      {/* 3. Segmented Navigation Bar (4 Conceptual Areas) */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('movimientos')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'movimientos'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AppIcon name="wallet" className="h-4 w-4" />
          <span>Resumen & Operación</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuentas')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'cuentas'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AppIcon name="repeat" className="h-4 w-4" />
          <span>Cuentas</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.2 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {state.finance.accounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analisis')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'analisis'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AppIcon name="activity" className="h-4 w-4" />
          <span>Análisis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proyeccion')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'proyeccion'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AppIcon name="trendingUp" className="h-4 w-4" />
          <span>Futuro</span>
          {(state.finance.expectedIncomes?.length || 0) + (state.finance.commitments?.length || 0) > 0 && (
            <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.2 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {(state.finance.expectedIncomes?.length || 0) + (state.finance.commitments?.length || 0)}
            </span>
          )}
        </button>
      </div>

      {/* AREA 1: RESUMEN & OPERACIÓN (MOVIMIENTOS) */}
      {activeTab === 'movimientos' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Warning if no accounts exist */}
          {state.finance.accounts.length === 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 flex items-center justify-between">
              <span>⚠️ Creá al menos una cuenta bancaria antes de registrar movimientos.</span>
              <button
                type="button"
                onClick={() => setActiveTab('cuentas')}
                className="underline font-bold ml-2 cursor-pointer shrink-0"
              >
                Crear cuenta →
              </button>
            </div>
          )}

          {/* Quick Action Bar above table */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  Libro Diario de Movimientos
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Registro histórico con filtros bajo demanda y conciliación instantánea
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                title="Administrar categorías"
              >
                <AppIcon name="settings" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Categorías</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewTx('ingreso')}
                className="px-3 py-1.5 text-xs font-bold rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Registrar ingreso directo"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
                <span>+ Ingreso</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewTx('gasto')}
                className="px-3 py-1.5 text-xs font-bold rounded-xl text-rose-600 dark:text-rose-400 border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Registrar gasto directo"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
                <span>+ Gasto</span>
              </button>
            </div>
          </div>

          {/* Monthly Budgets Progress */}
          {financeCustomization.visibleSections.budgets !== false && (
            <FinanceBudgetProgress
              categories={state.finance.categories}
              catSpent={catSpent}
              budgets={state.finance.budgets}
              onSetBudget={handleSetBudget}
              onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
            />
          )}

          {/* Transaction History Clean Table with 1-Click Filters */}
          {financeCustomization.visibleSections.transactions !== false && (
            <FinanceTransactionTable
              transactions={state.finance.transactions}
              accounts={state.finance.accounts}
              categories={state.finance.categories}
              onEdit={handleEditTx}
              onDelete={handleDeleteTx}
              totalGastadoAnio={totalGastadoAnio}
            />
          )}
        </div>
      )}

      {/* AREA 2: CUENTAS, OPERACIONES & PATRIMONIO */}
      {activeTab === 'cuentas' && (
        <FinanceAccountsView
          state={state}
          onUpdateState={onUpdateState}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
          onAddSubscription={handleAddSubscription}
          onDeleteSubscription={handleDeleteSubscription}
          onAddDebt={handleAddDebt}
          onDeleteDebt={handleDeleteDebt}
          onAddInvestment={handleAddInvestment}
          onDeleteInvestment={handleDeleteInvestment}
        />
      )}

      {/* AREA 3: ANÁLISIS & EVOLUCIÓN */}
      {activeTab === 'analisis' && (
        <FinanceAnalyticsView
          state={state}
          ingresoMes={ingreso}
          gastadoMes={gastado}
          balanceMes={balance}
          patrimonioNeto={patrimonio}
          fijoMes={fijoMes}
          gastoVariable={gastoVariable}
          totalGastadoAnio={totalGastadoAnio}
          gananciaReventa={rstats.gananciaTotal}
          catSpentThisMonth={catSpent}
          catSpentAllTime={allTimeSpent}
          monthlyEvolutionData={monthlyEvolutionData}
          cmp={cmp}
        />
      )}

      {/* AREA 4: FUTURO & PROYECCIONES */}
      {activeTab === 'proyeccion' && (
        <FinanceFutureView
          state={state}
          projection={projection}
          projHorizon={projHorizon}
          onSetProjHorizon={setProjHorizon}
          onOpenCommitmentModal={() => {
            resetComForm();
            setIsCommitmentModalOpen(true);
          }}
          onOpenIncomeModal={() => {
            resetIncomeForm();
            setIsIncomeModalOpen(true);
          }}
          onOpenCushionModal={() => {
            setCushionInput(String(state.finance?.minCushion ?? 5000));
            setCushionEnabledInput(state.finance?.cushionEnabled !== false);
            setIsCushionModalOpen(true);
          }}
          onPayCommitment={openPayCommitment}
          onEditCommitment={beginEditCommitment}
          onToggleCommitment={handleToggleCommitment}
          onDeleteCommitment={handleDeleteCommitment}
          onConfirmIncomeReal={handleConfirmIncomeReal}
          onEditIncome={beginEditExpectedIncome}
          onToggleIncome={handleToggleExpectedIncome}
          onDeleteIncome={handleDeleteExpectedIncome}
        />
      )}

      {/* MODAL 1: Progressive Disclosure Transaction Modal */}
      <FinanceTransactionModal
        open={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSubmit={handleSubmitTx}
        accounts={state.finance.accounts}
        categories={state.finance.categories}
        editingTransaction={editingTx}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        initialType={txModalInitialType}
      />

      {/* MODAL 2: Financial Commitment Form Modal */}
      {isCommitmentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsCommitmentModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Registrar Compromiso Financiero"
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
                onClick={() => setIsCommitmentModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Compromisos fijos, cuotas o pagos periódicos. El motor deduce su impacto de tu Disponible Real sin restar fondos contables reales hasta que se paguen.
            </p>

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
                      const allCats = getAllCategories(state.finance?.categories || []);
                      const current = allCats.find((c) => c.id === comCategory);
                      const list = [...activeCategories];
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

      {/* MODAL 3: Expected Income Form Modal */}
      {isIncomeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsIncomeModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Registrar Ingreso Previsto"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <h3 className="section-title">
                  {editingIncId ? 'Editar Ingreso Previsto' : 'Nuevo Ingreso Previsto'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsIncomeModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Se usa exclusivamente para simulación financiera y proyección de flujos. No crea transacciones contables reales hasta que confirmes su cobro efectivo.
            </p>

            <form onSubmit={handleSaveExpectedIncome} className="space-y-3">
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
                      const allCats = getAllCategories(state.finance?.categories || []);
                      const current = allCats.find((c) => c.id === incCategory);
                      const list = [...activeCategories];
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={resetIncomeForm}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button py-2 px-4 text-xs font-bold cursor-pointer"
                >
                  {editingIncId ? 'Guardar Cambios' : 'Registrar Ingreso Previsto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Payment Confirmation Modal */}
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

      {/* MODAL 5: Cushion Config Modal */}
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

      {/* MODAL 6: Category Manager Modal */}
      <FinanceCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        state={state}
        onUpdateState={onUpdateState}
        showToast={showToast}
      />

      {/* MODAL 7: Customize Finance View Modal (Monarch-style) */}
      <CustomizeFinanceModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        config={financeCustomization}
        onSave={(newCfg) => {
          saveFinanceCustomization(newCfg);
          setFinanceCustomization(newCfg);
        }}
      />
    </div>
  );
};
