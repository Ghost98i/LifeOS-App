import { PrivacyInput, PrivateFinancialText, PrivacyAmount } from './PrivacyAmount';
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
import { confirmedFinancialCurrency, formatPlannedAmount, requireFinancialCurrency } from '../lib/financeCurrencyPolicy';
import {
  todayISO,
  formatMoney,
  sameYear,
  uid,
  parseDecimalInput,
} from '../lib/storage';
import {
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
  getRealBalancesByCurrency,
} from '../lib/calculations';
import { FinanceHero } from './FinanceHero';
import { FinanceTransactionModal } from './FinanceTransactionModal';
import { FinanceTransactionTable } from './FinanceTransactionTable';
import { FinanceAccountsView } from './FinanceAccountsView';
import { FinanceAnalyticsView } from './FinanceAnalyticsView';
import { FinanceFutureView } from './FinanceFutureView';
import { FinanceCategoryModal } from './FinanceCategoryModal';
import { FinanceReviewInbox } from './FinanceReviewInbox';
import { FinanceTransferModal } from './FinanceTransferModal';
import { FinanceReconcileModal } from './FinanceReconcileModal';
import { setMonthlyCategoryLimit, setMonthlyGlobalLimit } from '../lib/financeBudget';
import { getActiveCategories, getAllCategories, setCategoryBudget } from '../lib/financeCategories';
import {
  addAccount,
  addTransaction,
  confirmExpectedIncome,
  confirmFinancialCommitment,
  confirmTransactionMatch,
  deleteAccount,
  deleteTransaction,
  getTransactionLockReason,
  ignoreTransactionReview,
  isCommercialFinanceTransaction,
  markMultipleTransactionsReviewed,
  markTransactionReviewed,
  rejectTransactionMatch,
  updateTransaction,
} from '../lib/financeFlows';
import { deleteFinanceDuplicate, keepFinanceDuplicateGroup } from '../lib/financeDuplicateReview';
import { areMerchantsCompatible, daysDiff, deriveCycleIdentity } from '../lib/financeMatching';
import { loadFinanceCustomization, saveFinanceCustomization, FinanceViewCustomization } from '../lib/viewCustomization';
import { CustomizeFinanceModal } from './CustomizeFinanceModal';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { focusTargetElement } from '../lib/navigationFocus';

interface FinanzasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onOpenCommercial?: () => void;
  initialTransactionType?: 'gasto' | 'ingreso' | null;
  initialTab?: 'movimientos' | 'cuentas' | 'analisis' | 'proyeccion' | null;
  initialFocusId?: string | null;
  focusNonce?: number;
}

export const FinanzasView: React.FC<FinanzasViewProps> = ({
  state,
  onUpdateState,
  onOpenCommercial,
  initialTransactionType,
  initialTab,
  initialFocusId,
  focusNonce,
}) => {
  // Main Tab State
  const [activeTab, setActiveTab] = useState<'movimientos' | 'cuentas' | 'analisis' | 'proyeccion'>(
    initialTab || 'movimientos'
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, focusNonce]);

  useEffect(() => {
    if (initialFocusId) {
      return focusTargetElement(initialFocusId);
    }
  }, [initialFocusId, activeTab, focusNonce]);

  // View Customization State (Monarch-inspired modular personalization)
  const [financeCustomization, setFinanceCustomization] = useState<FinanceViewCustomization>(loadFinanceCustomization);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);

  // Modals & Entity Forms
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txModalInitialType, setTxModalInitialType] = useState<'gasto' | 'ingreso'>('gasto');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [reconcileAccountId, setReconcileAccountId] = useState<string>('');

  // Onboarding / Account Creation modal
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('');
  const [newAccCurrency, setNewAccCurrency] = useState<'UYU' | 'USD'>('UYU');

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
  const [payDate, setPayDate] = useState<string>(todayISO());
  const [payIsAdvance, setPayIsAdvance] = useState(false);
  const [payUpdateFuture, setPayUpdateFuture] = useState(false);

  // Expected Income Confirmation & Matching modal
  const [confirmingIncome, setConfirmingIncome] = useState<ExpectedIncome | null>(null);
  const [confirmIncomeAccountId, setConfirmIncomeAccountId] = useState<string>('');
  const [confirmIncomeDate, setConfirmIncomeDate] = useState<string>(todayISO());
  const [confirmIncomeAction, setConfirmIncomeAction] = useState<'link' | 'new'>('new');
  const [selectedMatchingTxId, setSelectedMatchingTxId] = useState<string | null>(null);
  const [confirmIncomeIsAdvance, setConfirmIncomeIsAdvance] = useState(false);

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

  const patrimonio = calcNetWorth(state);
  const balancesByCurrency = useMemo(() => getRealBalancesByCurrency(state), [state]);
  const balanceEntries = useMemo(() => Object.entries(balancesByCurrency), [balancesByCurrency]);

  const cushionBalanceLabel = useMemo(() => {
    if (balanceEntries.length === 0) return formatMoney(0, 'UYU');
    return balanceEntries
      .map(([cur, amt]) => formatMoney(amt, cur))
      .join(' + ');
  }, [balanceEntries]);
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
    const lockReason = getTransactionLockReason(state, transaction);
    if (lockReason) {
      showToast(lockReason, 'error');
      return;
    }
    setEditingTx(transaction);
    setTxModalInitialType(transaction.type);
    setIsTxModalOpen(true);
  };

  const handleSubmitTx = (data: {
    id: string;
    type: 'gasto' | 'ingreso';
    amount: number;
    category: string;
    accountId: string;
    fixed: 'variable' | 'fijo';
    date: string;
    operationTime: string | null;
    note: string;
  }) => {
    try {
      if (onUpdateState((draft) => {
        const input = {
          id: data.id,
          type: data.type,
          amount: data.amount,
          category: data.category,
          fixed: data.fixed,
          date: data.date,
          operationTime: data.operationTime,
          note: data.note,
          accountId: data.accountId || defaultAccountId(state),
        };
        if (editingTx) {
          updateTransaction(draft, editingTx.id, input);
        } else {
          addTransaction(draft, input);
        }
      }) === false) return;
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
      if (onUpdateState((draft) => deleteTransaction(draft, id)) === false) return;
      showToast('Movimiento eliminado.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se puede eliminar este movimiento.', 'error');
    }
  };

  // Review Inbox Operations (Fase 2.2)
  const handleMarkReviewed = (txId: string) => {
    try {
      if (onUpdateState((draft) => {
        markTransactionReviewed(draft, txId);
      }) === false) return;
      showToast('Revisión cerrada. El movimiento ya estaba contabilizado.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.', 'error');
    }
  };

  const handleBulkReview = (txIds: string[]) => {
    try {
      if (onUpdateState((draft) => {
        markMultipleTransactionsReviewed(draft, txIds);
      }) === false) return;
      showToast(`${txIds.length} movimientos marcados como revisados.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudieron marcar los movimientos.', 'error');
    }
  };

  const handleIgnoreReview = (txId: string) => {
    try {
      if (onUpdateState((draft) => {
        ignoreTransactionReview(draft, txId);
      }) === false) return;
      showToast('Movimiento excluido de la revisión.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.', 'error');
    }
  };

  const handleKeepDuplicates = (transactions: Transaction[]): boolean => {
    try {
      if (onUpdateState(draft => keepFinanceDuplicateGroup(draft, transactions)) === false) return false;
      showToast('Movimientos conservados. El saldo no cambia.');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar la revisión.', 'error');
      return false;
    }
  };

  const handleDeleteDuplicate = (transaction: Transaction): boolean => {
    try {
      if (onUpdateState(draft => deleteFinanceDuplicate(draft, transaction)) === false) return false;
      showToast('Movimiento eliminado. Su efecto contable fue revertido.', 'info');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar el movimiento.', 'error');
      return false;
    }
  };

  const handleLinkCommitment = (txId: string, targetId: string, targetType: 'commitment' | 'expected_income' = 'commitment') => {
    try {
      if (onUpdateState((draft) => {
        confirmTransactionMatch(draft, txId, targetId, targetType);
      }) === false) return;
      showToast(targetType === 'expected_income' ? 'Movimiento vinculado al ingreso previsto.' : 'Movimiento vinculado al compromiso.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo vincular el movimiento.', 'error');
    }
  };

  const handleRejectMatch = (txId: string, candidateId: string, cycleKey?: string) => {
    try {
      if (onUpdateState((draft) => {
        rejectTransactionMatch(draft, txId, candidateId, cycleKey);
      }) === false) return;
      showToast('Sugerencia descartada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo descartar la sugerencia.', 'error');
    }
  };

  const handleQuickUpdateTx = (txId: string, updates: { category?: string; note?: string; date?: string }) => {
    try {
      if (onUpdateState((draft) => {
        const tx = draft.finance.transactions.find((t) => t.id === txId);
        if (!tx) return;
        updateTransaction(draft, txId, {
          type: tx.type,
          amount: tx.amount,
          category: updates.category || tx.category,
          fixed: tx.fixed,
          accountId: tx.accountId,
          date: updates.date || tx.date,
          note: updates.note !== undefined ? updates.note : tx.note,
          reviewStatus: 'reviewed',
        });
      }) === false) return;
      showToast('Movimiento actualizado y revisado.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.', 'error');
    }
  };

  const handleSetBudget = (categoryId: string, amountStr: string, month?: string, currency = 'UYU') => {
    if (onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.budgets) draft.finance.budgets = {};
      const num = Number(amountStr) || 0;
      setCategoryBudget(draft.finance, categoryId, num);
      if (month) {
        setMonthlyCategoryLimit(draft.finance, month, categoryId, num > 0 ? num : null, currency);
      }
    }) === false) return;
  };

  const handleSetGlobalBudget = (month: string, limit: number | null, currency = 'UYU') => {
    if (onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      setMonthlyGlobalLimit(draft.finance, month, limit, currency);
    }) === false) return;
  };

  // Accounts & Assets Operations
  const handleAddAccount = (name: string, balanceVal: number, currencyVal?: string) => {
    try {
      if (onUpdateState((draft) => { addAccount(draft, name, balanceVal, currencyVal); }) === false) return;
      showToast('Cuenta agregada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo agregar la cuenta.', 'error');
    }
  };

  const handleCreateFirstAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    const parsed = parseDecimalInput(newAccBalance.trim() || '0');
    if (parsed.error || parsed.value === null) {
      showToast(parsed.error || 'Saldo inicial inválido', 'error');
      return;
    }
    handleAddAccount(newAccName.trim(), parsed.value, newAccCurrency);
    setNewAccName('');
    setNewAccBalance('');
    setNewAccCurrency('UYU');
    setIsAddAccountModalOpen(false);
  };

  const handleDeleteAccount = (id: string) => {
    try {
      if (onUpdateState((draft) => deleteAccount(draft, id)) === false) return;
      showToast('Cuenta eliminada.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se puede eliminar esta cuenta.', 'error');
    }
  };

  const handleAddSubscription = (name: string, amountVal: number, dueDayVal: number | null) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.subscriptions) draft.finance.subscriptions = [];
      draft.finance.subscriptions.push({
        id: uid(),
        name,
        amount: amountVal,
        dueDay: dueDayVal,
      });
    }) === false) return;
    showToast('Suscripción agregada.');
  };

  const handleDeleteSubscription = (id: string) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.subscriptions = (draft.finance.subscriptions || []).filter((s) => s.id !== id);
    }) === false) return;
    showToast('Suscripción eliminada.', 'info');
  };

  const handleAddDebt = (name: string, amountVal: number, monthlyPaymentVal: number, dueDateVal: string | null) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.debts) draft.finance.debts = [];
      draft.finance.debts.push({
        id: uid(),
        name,
        amount: amountVal,
        monthlyPayment: monthlyPaymentVal,
        dueDate: dueDateVal,
      });
    }) === false) return;
    showToast('Deuda registrada.');
  };

  const handleDeleteDebt = (id: string) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.debts = (draft.finance.debts || []).filter((d) => d.id !== id);
    }) === false) return;
    showToast('Deuda eliminada.', 'info');
  };

  const handleAddInvestment = (name: string, amountVal: number) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) draft.finance = { accounts: [], transactions: [], categories: [], budgets: {}, subscriptions: [], debts: [], investments: [] } as any;
      if (!draft.finance.investments) draft.finance.investments = [];
      draft.finance.investments.push({
        id: uid(),
        name,
        amount: amountVal,
      });
    }) === false) return;
    showToast('Inversión registrada.');
  };

  const handleDeleteInvestment = (id: string) => {
    if (onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.investments = (draft.finance.investments || []).filter((i) => i.id !== id);
    }) === false) return;
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

    if (onUpdateState((draft) => {
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
          currency: 'UYU', // This existing creation form explicitly labels its amount in UYU.
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
    }) === false) return;

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
    if (onUpdateState((draft) => {
      if (!draft.finance?.commitments) return;
      const target = draft.finance.commitments.find((c) => c.id === id);
      if (target) {
        target.active = !target.active;
        target.updatedAt = new Date().toISOString();
      }
    }) === false) return;
  };

  const handleDeleteCommitment = (id: string) => {
    if (onUpdateState((draft) => {
      if (!draft.finance?.commitments) return;
      draft.finance.commitments = draft.finance.commitments.filter((c) => c.id !== id);
    }) === false) return;
    showToast('Compromiso eliminado.', 'info');
  };

  // Payment Confirmation Operations
  const handleConfirmCommitmentPayment = (
    com: FinancialCommitment,
    paidAmount?: number,
    paidAccountId?: string,
    updateFutureAmount?: boolean,
    paymentDate?: string,
    targetCycle?: string,
    allowAdvance?: boolean
  ) => {
    const actualAmount = paidAmount !== undefined && !isNaN(paidAmount) ? paidAmount : Number(com.amount);
    const date = paymentDate || todayISO();
    const cycle = targetCycle || deriveCycleIdentity(com, 'commitment').cycleKey;
    if (onUpdateState((draft) => {
      if (!draft.finance) return;
      confirmFinancialCommitment(draft, {
        commitmentId: com.id,
        amount: actualAmount,
        accountId: paidAccountId || com.accountId,
        date,
        updateFutureAmount,
        targetCycle: cycle,
        allowAdvance,
      });
    }) === false) return false;
    playSound('coins');
    const toastMsg = state.settings?.privacyMode
      ? 'Pago registrado y compromiso actualizado.'
      : `Pago registrado y compromiso actualizado: −${formatPlannedAmount(actualAmount, com.currency)}`;
    showToast(toastMsg);
    return true;
  };

  const openPayCommitment = (com: FinancialCommitment) => {
    try { requireFinancialCurrency(com.currency, 'compromiso'); } catch (error) { showToast((error as Error).message, 'error'); return; }
    setPayingCommitment(com);
    setPayAmount(String(com.amount));
    setPayAccount(com.accountId || defaultAccountId(state) || '');
    setPayDate(todayISO());
    setPayIsAdvance(false);
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
    const effectivePayDate = payDate || todayISO();
    const isCommitmentFutureCycle = Boolean(
      payingCommitment.frequency !== 'once' &&
      !payingCommitment.totalInstallments &&
      payingCommitment.nextDueDate &&
      payingCommitment.nextDueDate > effectivePayDate
    );
    if (isCommitmentFutureCycle && !payIsAdvance) {
      showToast('Para pagar un ciclo futuro, debés autorizar el pago anticipado.', 'error');
      return;
    }
    const targetCycle = deriveCycleIdentity(payingCommitment, 'commitment').cycleKey;
    try {
      const saved = handleConfirmCommitmentPayment(
        payingCommitment,
        numAmount,
        payAccount || undefined,
        payUpdateFuture,
        effectivePayDate,
        targetCycle,
        isCommitmentFutureCycle ? payIsAdvance : undefined
      );
      if (saved !== false) setPayingCommitment(null);
    } catch (err: any) {
      showToast(err.message || 'Error al registrar el pago', 'error');
    }
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
    if (onUpdateState((draft) => {
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
          currency: 'UYU', // Capture the denomination explicitly offered by this form, only for new rows.
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
    }) === false) return;
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
    if (onUpdateState((draft) => {
      if (!draft.finance?.expectedIncomes) return;
      const target = draft.finance.expectedIncomes.find((i) => i.id === id);
      if (target) {
        target.active = !target.active;
        target.updatedAt = new Date().toISOString();
      }
    }) === false) return;
  };

  const handleDeleteExpectedIncome = (id: string) => {
    if (onUpdateState((draft) => {
      if (!draft.finance?.expectedIncomes) return;
      draft.finance.expectedIncomes = draft.finance.expectedIncomes.filter((i) => i.id !== id);
    }) === false) return;
    showToast('Ingreso previsto eliminado.', 'info');
  };

  const handleConfirmIncomeReal = (inc: ExpectedIncome) => {
    const incCur = confirmedFinancialCurrency(inc.currency);
    if (!incCur) { showToast('La moneda de este cobro previsto no está confirmada. La operación no se realizó.', 'error'); return; }
    const incDate = inc.startDate || todayISO();

    // Buscar candidatos compatibles con invariantes contables
    const candidates = (state.finance?.transactions || [])
      .filter((tx) => {
        if (tx.type !== 'ingreso') return false;
        if (tx.expectedIncomeId) return false;
        if (tx.origin === 'adjustment' || tx.origin === 'resale_purchase' || tx.origin === 'resale_sale') return false;
        if (isCommercialFinanceTransaction(state, tx)) return false;
        const txCur = (tx.currency || 'UYU').trim().toUpperCase();
        if (txCur !== incCur) return false;
        const dDiff = Math.abs(daysDiff(tx.date, incDate));
        if (dDiff > 30) return false;
        return Math.abs(Number(tx.amount) - Number(inc.amount)) < 0.01;
      })
      .map((tx) => {
        const dDiff = Math.abs(daysDiff(tx.date, incDate));
        const sameMerchant = areMerchantsCompatible(tx.note, inc.name);
        const score = (dDiff <= 3 ? 5 : dDiff <= 7 ? 3 : 1) + (sameMerchant ? 5 : 0);
        return { tx, score, dDiff, sameMerchant };
      })
      .sort((a, b) => b.score - a.score);

    setConfirmingIncome(inc);
    setConfirmIncomeAccountId(inc.accountId || defaultAccountId(state) || '');
    setConfirmIncomeDate(todayISO());
    setConfirmIncomeIsAdvance(false);

    // Principio: solo sugerir preselección automática si hay exactamente un candidato fuerte
    if (candidates.length === 1 && (candidates[0].sameMerchant || candidates[0].dDiff <= 3)) {
      setConfirmIncomeAction('link');
      setSelectedMatchingTxId(candidates[0].tx.id);
    } else if (candidates.length > 0) {
      // Múltiples candidatos o fecha más distante: no preseleccionar silenciosamente
      setConfirmIncomeAction('new');
      setSelectedMatchingTxId(null);
    } else {
      setConfirmIncomeAction('new');
      setSelectedMatchingTxId(null);
    }
  };

  const handleExecuteIncomeConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingIncome) return;
    const targetCycle = deriveCycleIdentity(confirmingIncome, 'expected_income').cycleKey;
    const effectiveDate = confirmIncomeDate || todayISO();
    const cycleDate = targetCycle.startsWith('cycle-')
      ? targetCycle.replace('cycle-', '')
      : (confirmingIncome.frequency === 'once' ? confirmingIncome.startDate : null);
    const isFutureCycle = Boolean(cycleDate && cycleDate > effectiveDate);

    if (confirmIncomeAction === 'link' && selectedMatchingTxId) {
      if (onUpdateState((draft) => {
        if (!draft.finance) return;
        confirmExpectedIncome(draft, {
          expectedIncomeId: confirmingIncome.id,
          matchedTransactionId: selectedMatchingTxId,
          targetCycle,
        });
      }) === false) return;
      playSound('coins');
      showToast('Previsión vinculada al movimiento existente sin duplicar saldo.');
    } else {
      let resultTx: Transaction | null = null;
      try {
        if (onUpdateState((draft) => {
          if (!draft.finance) return;
          resultTx = confirmExpectedIncome(draft, {
            expectedIncomeId: confirmingIncome.id,
            accountId: confirmIncomeAccountId || confirmingIncome.accountId,
            date: effectiveDate,
            targetCycle,
            allowAdvance: isFutureCycle ? confirmIncomeIsAdvance : undefined,
          });
        }) === false) return;
        playSound('coins');
        if (resultTx && confirmingIncome.lastSettledTxId && (resultTx as any).id === confirmingIncome.lastSettledTxId) {
          showToast('El período actual ya estaba liquidado. Saldo protegido sin duplicados.', 'info');
        } else {
          const toastMsg = state.settings?.privacyMode
            ? 'Ingreso real registrado.'
            : `Ingreso real registrado: +${formatPlannedAmount(confirmingIncome.amount, confirmingIncome.currency)}`;
          showToast(toastMsg);
        }
      } catch (err: any) {
        showToast(err.message || 'Error al confirmar el cobro', 'error');
        return;
      }
    }
    setConfirmingIncome(null);
  };

  // Cushion Operations
  const handleSaveCushion = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(cushionInput);
    if (onUpdateState((draft) => {
      if (!draft.finance) return;
      draft.finance.minCushion = isNaN(amount) || amount < 0 ? null : amount;
      draft.finance.cushionEnabled = cushionEnabledInput;
    }) === false) return;
    setIsCushionModalOpen(false);
    showToast('Colchón financiero actualizado.');
  };

  // Keyboard shortcut for escaping modals
  useEffect(() => {
    if (!isCommitmentModalOpen && !isIncomeModalOpen && !isCushionModalOpen && !payingCommitment && !confirmingIncome && !isAddAccountModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCommitmentModalOpen) setIsCommitmentModalOpen(false);
        if (isIncomeModalOpen) setIsIncomeModalOpen(false);
        if (isCushionModalOpen) setIsCushionModalOpen(false);
        if (payingCommitment) setPayingCommitment(null);
        if (confirmingIncome) setConfirmingIncome(null);
        if (isAddAccountModalOpen) setIsAddAccountModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommitmentModalOpen, isIncomeModalOpen, isCushionModalOpen, payingCommitment, confirmingIncome, isAddAccountModalOpen]);

  return (
    <div className="finance-refinement finance-workspace space-y-4">
      {/* 1. Page Header (Privacidad gobernada por Stream Guard en Topbar) */}
      <PageHeader
        title="Finanzas"
      />

      {/* 2. Cabecera Financiera Command Clarity */}
      <FinanceHero
        state={state}
        cashFlow={cashFlow}
        variant={activeTab === 'movimientos' ? 'full' : 'compact'}
        displayMode={financeCustomization.heroDisplayMode}
        isAccountsContext={activeTab === 'cuentas'}
        onOpenNewTx={() => handleOpenNewTx('gasto')}
        onOpenNewTxType={(type) => handleOpenNewTx(type)}
        onOpenTransfer={() => setIsTransferModalOpen(true)}
        onOpenAddAccount={() => setIsAddAccountModalOpen(true)}
        onNavigateTab={(tab) => setActiveTab(tab)}
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
      <div className="finance-tabs grid grid-cols-2 sm:flex items-center gap-1 rounded-2xl p-1">
        <button
          type="button"
          onClick={() => setActiveTab('movimientos')}
          className={`finance-tab flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'movimientos'
              ? 'finance-tab-active'
              : ''
          }`}
        >
          <AppIcon name="wallet" className="h-4 w-4" />
          <span>Movimientos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuentas')}
          className={`finance-tab flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'cuentas'
              ? 'finance-tab-active'
              : ''
          }`}
        >
          <AppIcon name="repeat" className="h-4 w-4" />
          <span>Cuentas</span>
          <span className="finance-surface-subtle hidden sm:inline-block rounded-full px-2 py-0.5 tabular-nums text-[10px] text-[var(--finance-text-secondary)]">
            {state.finance.accounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analisis')}
          className={`finance-tab flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'analisis'
              ? 'finance-tab-active'
              : ''
          }`}
        >
          <AppIcon name="chart" className="h-4 w-4" />
          <span>Análisis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proyeccion')}
          className={`finance-tab flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'proyeccion'
              ? 'finance-tab-active'
              : ''
          }`}
        >
          <AppIcon name="trendingUp" className="h-4 w-4" />
          <span>Futuro</span>
          {(state.finance.expectedIncomes?.length || 0) + (state.finance.commitments?.length || 0) + (state.finance.subscriptions?.length || 0) > 0 && (
            <span className="finance-surface-subtle hidden sm:inline-block rounded-full px-2 py-0.5 tabular-nums text-[10px] text-[var(--finance-text-secondary)]">
              {(state.finance.expectedIncomes?.length || 0) + (state.finance.commitments?.length || 0) + (state.finance.subscriptions?.length || 0)}
            </span>
          )}
        </button>
      </div>

      {/* AREA 1: RESUMEN & OPERACIÓN (MOVIMIENTOS) */}
      {activeTab === 'movimientos' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Review Inbox (Sólo si existen excepciones reales, cero superficie si limpia) */}
          <FinanceReviewInbox
            state={state}
            onMarkReviewed={handleMarkReviewed}
            onBulkReview={handleBulkReview}
            onIgnore={handleIgnoreReview}
            onKeepDuplicates={handleKeepDuplicates}
            onDeleteDuplicate={handleDeleteDuplicate}
            onLinkCommitment={handleLinkCommitment}
            onRejectMatch={handleRejectMatch}
            onUpdateTx={handleQuickUpdateTx}
            onPayCommitment={openPayCommitment}
          />

          {/* Quick Action Bar above table */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div>
              <h2 className="finance-text-primary text-base sm:text-lg font-black tracking-tight">
                Movimientos registrados
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="finance-control px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 cursor-pointer transition-all min-h-[38px]"
                title="Administrar categorías y presupuestos"
              >
                <AppIcon name="settings" className="h-3.5 w-3.5" />
                <span>Categorías</span>
              </button>
            </div>
          </div>

          {/* Transaction History Clean Table with 1-Click Filters */}
          {financeCustomization.visibleSections.transactions !== false && (
            <FinanceTransactionTable
              transactions={state.finance.transactions}
              accounts={state.finance.accounts}
              categories={state.finance.categories}
              commercial={state.resale?.commercial}
              onOpenCommercial={onOpenCommercial}
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
          onAddDebt={handleAddDebt}
          onDeleteDebt={handleDeleteDebt}
          onAddInvestment={handleAddInvestment}
          onDeleteInvestment={handleDeleteInvestment}
          onOpenTransfer={() => setIsTransferModalOpen(true)}
          onOpenReconcile={(accId) => {
            setReconcileAccountId(accId);
            setIsReconcileModalOpen(true);
          }}
        />
      )}

      {/* AREA 3: ANÁLISIS & EVOLUCIÓN (INCLUYE PRESUPUESTOS INTEGRADOS) */}
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
          gananciaReventaMoneda={rstats.profitCurrency}
          catSpentThisMonth={catSpent}
          catSpentAllTime={allTimeSpent}
          monthlyEvolutionData={monthlyEvolutionData}
          cmp={cmp}
          onSetBudget={handleSetBudget}
          onSetGlobalBudget={handleSetGlobalBudget}
          onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
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
          onAddSubscription={handleAddSubscription}
          onDeleteSubscription={handleDeleteSubscription}
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
              Se reflejan en la proyección; afectan el saldo real al pagarse.
            </p>

            <form onSubmit={handleSaveCommitment} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Nombre / Obligación
                </label>
                <PrivacyInput maskText
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
                    Monto ({editingComId ? confirmedFinancialCurrency(state.finance.commitments?.find(c => c.id === editingComId)?.currency) ?? 'moneda sin confirmar' : 'UYU'})
                  </label>
                  <PrivacyInput
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="0"
                    value={comAmount}
                    onChange={(e) => setComAmount(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
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
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs tabular-nums text-[var(--text)]"
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
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-xs tabular-nums text-[var(--text)]"
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
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-xs tabular-nums text-[var(--text)] placeholder-[var(--text-faint)]"
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
                      <PrivateFinancialText>{acc.name}</PrivateFinancialText>
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Notas (Opcional)
                </label>
                <PrivacyInput maskText
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
              Proyecta el ingreso; el saldo real cambia al confirmar el cobro.
            </p>

            <form onSubmit={handleSaveExpectedIncome} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Concepto / Fuente
                </label>
                <PrivacyInput maskText
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
                    Monto ({editingIncId ? confirmedFinancialCurrency(state.finance.expectedIncomes?.find(i => i.id === editingIncId)?.currency) ?? 'moneda sin confirmar' : 'UYU'})
                  </label>
                  <PrivacyInput
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="0"
                    value={incAmount}
                    onChange={(e) => setIncAmount(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
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
                        <PrivateFinancialText>{acc.name}</PrivateFinancialText>
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
            aria-label="Registrar pago de Compromiso"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h3 className="section-title">Registrar pago</h3>
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
              <strong className="text-[var(--text)]"><PrivateFinancialText>{payingCommitment.name}</PrivateFinancialText></strong>.
            </p>

            <form onSubmit={handleExecutePayment} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Monto a pagar ({confirmedFinancialCurrency(payingCommitment.currency) ?? 'moneda sin confirmar'})
                </label>
                <PrivacyInput
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
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
                      <PrivateFinancialText>{acc.name}</PrivateFinancialText> (Saldo: {state.settings?.privacyMode ? '••••' : formatMoney(acc.balance, acc.currency)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                  Fecha Efectiva de Pago
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                />
              </div>

              {payingCommitment.frequency !== 'once' && !payingCommitment.totalInstallments && payingCommitment.nextDueDate && payingCommitment.nextDueDate > (payDate || todayISO()) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <AppIcon name="alertTriangle" className="h-3.5 w-3.5 shrink-0" />
                    Pago de ciclo futuro ({payingCommitment.nextDueDate})
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    La fecha de vencimiento es posterior a la fecha de pago elegida. Para registrar este pago por adelantado, marcá la casilla de pago anticipado.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5 select-none font-semibold text-[11px]">
                    <input
                      type="checkbox"
                      checked={payIsAdvance}
                      onChange={(e) => setPayIsAdvance(e.target.checked)}
                      className="rounded cursor-pointer"
                    />
                    <span>Confirmar pago anticipado</span>
                  </label>
                </div>
              )}

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
                    Actualizar también el monto de cuotas o vencimientos futuros con este nuevo valor ({payAmount ? (state.settings?.privacyMode ? '••••' : formatPlannedAmount(Number(payAmount) || 0, payingCommitment.currency)) : '0'})
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
                {(() => {
                  const isFuture = Boolean(
                    payingCommitment.frequency !== 'once' &&
                    !payingCommitment.totalInstallments &&
                    payingCommitment.nextDueDate &&
                    payingCommitment.nextDueDate > (payDate || todayISO())
                  );
                  const isSubmitDisabled = isFuture && !payIsAdvance;
                  return (
                    <button
                      type="submit"
                      disabled={isSubmitDisabled}
                      className={`px-4 py-2 text-xs font-bold rounded-xl text-white shadow-2xs flex items-center gap-1.5 ${
                        isSubmitDisabled
                          ? 'bg-blue-600/50 cursor-not-allowed opacity-60'
                          : 'bg-[var(--blue)] hover:bg-[var(--blue-hover)] cursor-pointer'
                      }`}
                    >
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                      <span>Registrar pago</span>
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4B: Income Confirmation & Matching Modal */}
      {confirmingIncome && (() => {
        const incCur = confirmedFinancialCurrency(confirmingIncome.currency);
        const incDate = confirmingIncome.startDate || todayISO();
        const matchingCandidates = (state.finance?.transactions || [])
          .filter((tx) => {
            if (tx.type !== 'ingreso') return false;
            if (tx.expectedIncomeId) return false;
            if (tx.origin === 'adjustment' || tx.origin === 'resale_purchase' || tx.origin === 'resale_sale') return false;
            if (isCommercialFinanceTransaction(state, tx)) return false;
            const txCur = (tx.currency || 'UYU').trim().toUpperCase();
            if (txCur !== incCur) return false;
            const dDiff = Math.abs(daysDiff(tx.date, incDate));
            if (dDiff > 30) return false;
            return Math.abs(Number(tx.amount) - Number(confirmingIncome.amount)) < 0.01;
          })
          .sort((a, b) => {
            const diffA = Math.abs(daysDiff(a.date, incDate));
            const diffB = Math.abs(daysDiff(b.date, incDate));
            return diffA - diffB;
          });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
            onClick={() => setConfirmingIncome(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirmar cobro de previsión"
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <AppIcon name="trendingUp" className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">Confirmar cobro previsto</h3>
                    <p className="text-xs text-[var(--text-soft)]">
                      <PrivateFinancialText>{confirmingIncome.name}</PrivateFinancialText> · {state.settings?.privacyMode ? '••••' : formatPlannedAmount(confirmingIncome.amount, confirmingIncome.currency)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmingIncome(null)}
                  className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                >
                  <AppIcon name="x" className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleExecuteIncomeConfirmation} className="space-y-4">
                {matchingCandidates.length > 0 ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <AppIcon name="alertTriangle" className="h-3.5 w-3.5 shrink-0" />
                        Se encontró {matchingCandidates.length === 1 ? 'un movimiento coincidente sin vincular' : `${matchingCandidates.length} movimientos coincidentes sin vincular`} (ventana 30d):
                      </p>
                      <p className="text-[11px] opacity-90 leading-relaxed">
                        Elegí vincular un cobro registrado o crear uno nuevo.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] cursor-pointer transition-all hover:border-[var(--blue)]">
                        <input
                          type="radio"
                          name="confirmAction"
                          value="link"
                          checked={confirmIncomeAction === 'link'}
                          onChange={() => setConfirmIncomeAction('link')}
                          className="mt-0.5 cursor-pointer text-indigo-600"
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <span className="text-xs font-bold text-[var(--text)] block">
                            Vincular cobro registrado
                          </span>
                          <span className="text-[11px] text-[var(--text-soft)] block">
                            Vincula la previsión; no crea otro movimiento.
                          </span>
                          {confirmIncomeAction === 'link' && (
                            <div className="mt-2 space-y-1.5 pt-1.5 border-t border-[var(--border)]">
                              {matchingCandidates.map((cTx) => (
                                <label
                                  key={cTx.id}
                                  className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                    selectedMatchingTxId === cTx.id
                                      ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                                      : 'border-[var(--border)] hover:bg-[var(--card)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="radio"
                                      name="selectedTx"
                                      checked={selectedMatchingTxId === cTx.id}
                                      onChange={() => setSelectedMatchingTxId(cTx.id)}
                                      className="cursor-pointer"
                                    />
                                    <span className="truncate"><PrivateFinancialText>{cTx.note || cTx.category}</PrivateFinancialText></span>
                                  </div>
                                  <span className="tabular-nums font-semibold shrink-0">
                                    {cTx.date} · {state.settings.privacyMode ? '••••' : formatMoney(cTx.amount, cTx.currency)}
                                  </span>
                                </label>
                              ))}
                              {!selectedMatchingTxId && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                                  Seleccioná un movimiento de la lista para vincularlo.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] cursor-pointer transition-all hover:border-[var(--blue)]">
                        <input
                          type="radio"
                          name="confirmAction"
                          value="new"
                          checked={confirmIncomeAction === 'new'}
                          onChange={() => setConfirmIncomeAction('new')}
                          className="mt-0.5 cursor-pointer text-indigo-600"
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <span className="text-xs font-bold text-[var(--text)] block">
                            Registrar como cobro nuevo (+saldo en cuenta)
                          </span>
                          <span className="text-[11px] text-[var(--text-soft)] block">
                            Crea un movimiento y actualiza el saldo real.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                    <p className="font-semibold">
                      Se registrará un nuevo movimiento contable por {state.settings?.privacyMode ? '••••' : formatPlannedAmount(confirmingIncome.amount, confirmingIncome.currency)} y se incrementará el saldo real en la cuenta seleccionada.
                    </p>
                  </div>
                )}

                {confirmIncomeAction === 'new' && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                        Cuenta de Depósito
                      </label>
                      <select
                        value={confirmIncomeAccountId}
                        onChange={(e) => setConfirmIncomeAccountId(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                      >
                        {(state.finance.accounts || []).map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            <PrivateFinancialText>{acc.name}</PrivateFinancialText> (Saldo: {state.settings?.privacyMode ? '••••' : formatMoney(acc.balance, acc.currency)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-[var(--text-faint)] block mb-1">
                        Fecha Efectiva
                      </label>
                      <input
                        type="date"
                        value={confirmIncomeDate}
                        onChange={(e) => setConfirmIncomeDate(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs tabular-nums text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                      />
                    </div>

                    {confirmingIncome.startDate && confirmingIncome.startDate > confirmIncomeDate && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-2">
                        <p className="font-bold flex items-center gap-1.5">
                          <AppIcon name="alertTriangle" className="h-3.5 w-3.5 shrink-0" />
                          Cobro de ciclo futuro ({confirmingIncome.startDate})
                        </p>
                        <p className="text-[11px] opacity-90 leading-relaxed">
                          La fecha del ciclo es posterior. Activá «Cobro anticipado» para confirmar.
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer pt-0.5 select-none font-semibold text-[11px]">
                          <input
                            type="checkbox"
                            checked={confirmIncomeIsAdvance}
                            onChange={(e) => setConfirmIncomeIsAdvance(e.target.checked)}
                            className="rounded cursor-pointer"
                          />
                          <span>Confirmar cobro anticipado</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const isFuture = Boolean(
                    confirmingIncome.frequency !== 'once' &&
                    confirmingIncome.startDate &&
                    confirmingIncome.startDate > confirmIncomeDate
                  );
                  const isSubmitDisabled = confirmIncomeAction === 'link'
                    ? !selectedMatchingTxId
                    : Boolean(isFuture && !confirmIncomeIsAdvance);

                  return (
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setConfirmingIncome(null)}
                        className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitDisabled}
                        className={`px-4 py-2 text-xs font-bold rounded-xl text-white shadow-2xs flex items-center gap-1.5 ${
                          isSubmitDisabled
                            ? 'bg-emerald-600/50 cursor-not-allowed opacity-60'
                            : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
                        }`}
                      >
                        <AppIcon name="check" className="h-3.5 w-3.5" />
                        <span>
                          {confirmIncomeAction === 'link'
                            ? 'Vincular cobro (sin duplicar)'
                            : 'Registrar cobro nuevo'}
                        </span>
                      </button>
                    </div>
                  );
                })()}
              </form>
            </div>
          </div>
        );
      })()}

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
                <h3 className="section-title">Colchón mínimo</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCushionModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCushion} className="space-y-4">
              <p className="text-xs text-[var(--text-soft)]">Es una referencia para los avisos; no modifica tu saldo.</p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text)] block">Activar avisos por saldo bajo</span>
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
                    Monto mínimo (UYU)
                  </label>
                  <PrivacyInput
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={cushionInput}
                    onChange={(e) => setCushionInput(e.target.value)}
                    placeholder="Ej. 10000"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-sm tabular-nums font-bold text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)]"
                  />
                  <p className="text-[11px] text-[var(--text-soft)] mt-1">
                    Saldo actual en cuentas: <PrivacyAmount as="strong">{cushionBalanceLabel}</PrivacyAmount>
                  </p>
                  {balanceEntries.length > 1 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      El colchón de seguridad opera en moneda base local (UYU).
                    </p>
                  )}
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

      {/* MODAL 8: Transfer between own accounts */}
      <FinanceTransferModal
        open={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        state={state}
        onUpdateState={onUpdateState}
      />

      {/* MODAL 9: Contextual account reconciliation */}
      <FinanceReconcileModal
        open={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        state={state}
        onUpdateState={onUpdateState}
        accountId={reconcileAccountId}
      />

      {/* MODAL 10: Nueva cuenta (desde Onboarding o botón rápido) */}
      {isAddAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsAddAccountModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nueva cuenta"
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--text)]">Nueva cuenta</h3>
              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFirstAccount} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Nombre de la cuenta
                </label>
                <PrivacyInput maskText
                  required
                  autoFocus
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="Ej. Banco, Efectivo, Prex..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Saldo inicial
                </label>
                <PrivacyInput
                  type="text"
                  inputMode="decimal"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  placeholder="0,00"
                  className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Moneda
                </label>
                <select
                  value={newAccCurrency}
                  onChange={(e) => setNewAccCurrency(e.target.value as 'UYU' | 'USD')}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="UYU">UYU ($U - Pesos Uruguayos)</option>
                  <option value="USD">USD (US$ - Dólares)</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs active:scale-95 transition-all min-h-[44px]"
              >
                Crear cuenta
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
