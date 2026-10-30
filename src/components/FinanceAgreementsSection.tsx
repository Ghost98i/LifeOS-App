import React, { useState } from 'react';
import type { FinancingAgreement, InstallmentSchedule, LifeOSState } from '../types';
import {
  calculateAgreementRemainingBalance,
  createFinancingAgreement,
  updateFinancingAgreement,
  deleteFinancingAgreement,
  addAgreementPayment,
  getAgreementPayments,
  validateAgreementCoherence,
  deriveAgreementSchedule,
} from '../lib/financeAgreements';
import { fmtDate, formatMoney, parseDecimalInput, roundMoney, todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceAgreementsSectionProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const FinanceAgreementsSection: React.FC<FinanceAgreementsSectionProps> = ({
  state,
  onUpdateState,
  onShowToast,
}) => {
  const agreements = state.finance?.agreements || [];
  const accounts = state.finance?.accounts || [];
  const transactions = state.finance?.transactions || [];
  const legacyDebts = state.finance?.debts || [];
  const linkedDebtIds = new Set((agreements || []).map((a) => a.linkedLegacyDebtId).filter(Boolean));
  const availableLegacyDebts = legacyDebts.filter((d) => !linkedDebtIds.has(d.id));

  // Category options for financed acquisitions: prioritize user's active categories
  const rawCategories = state.finance?.categories || [];
  const activeCategories = rawCategories.filter((c) => c.active !== false).map((c) => c.name);
  const defaultCategoryList = ['Hogar', 'Tecnología', 'Admin/Hogar', 'Otros'];
  const categoryOptions = activeCategories.length > 0
    ? Array.from(new Set([...activeCategories, ...defaultCategoryList]))
    : defaultCategoryList;

  // Expanded payments history per agreement
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Expanded installments schedule per agreement
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Set<string>>(new Set());

  // Inline Edit Acquisition
  const [editingAcquisitionId, setEditingAcquisitionId] = useState<string | null>(null);
  const [editAcquisitionCategory, setEditAcquisitionCategory] = useState('');
  const [editAcquisitionDate, setEditAcquisitionDate] = useState(todayISO());
  const [editAcquisitionError, setEditAcquisitionError] = useState<string | null>(null);

  // Modal: Create Agreement Type & Schedule
  const [newAgreementType, setNewAgreementType] = useState<'flexible' | 'installments'>('flexible');
  const [newTotalInstallments, setNewTotalInstallments] = useState('6');
  const [newInstallmentAmount, setNewInstallmentAmount] = useState('');
  const [newFirstDueDate, setNewFirstDueDate] = useState(todayISO());

  // Modal: Financed Acquisition
  const [newIsAcquisition, setNewIsAcquisition] = useState(false);
  const [newAcquisitionCategory, setNewAcquisitionCategory] = useState('');
  const [newAcquisitionDate, setNewAcquisitionDate] = useState(todayISO());

  // Modal: Create Agreement
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCreditor, setNewCreditor] = useState('');
  const [newCurrency, setNewCurrency] = useState<'UYU' | 'USD'>('UYU');
  const [newInitialBal, setNewInitialBal] = useState('');
  const [newRefDate, setNewRefDate] = useState(todayISO());
  const [newHasHistory, setNewHasHistory] = useState(false);
  const [newOriginalPrincipal, setNewOriginalPrincipal] = useState('');
  const [newPriorPaid, setNewPriorPaid] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newLinkedLegacyDebtId, setNewLinkedLegacyDebtId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal: Register Abono
  const [payingAgreement, setPayingAgreement] = useState<FinancingAgreement | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandSchedule = (id: string) => {
    setExpandedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenCreate = () => {
    setNewAgreementType('flexible');
    setNewTotalInstallments('6');
    setNewInstallmentAmount('');
    setNewFirstDueDate(todayISO());
    setNewIsAcquisition(false);
    setNewAcquisitionCategory('');
    setNewAcquisitionDate(todayISO());
    setNewTitle('');
    setNewCreditor('');
    setNewCurrency('UYU');
    setNewInitialBal('');
    setNewRefDate(todayISO());
    setNewHasHistory(false);
    setNewOriginalPrincipal('');
    setNewPriorPaid('');
    setNewNotes('');
    setNewLinkedLegacyDebtId('');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleSelectLegacyDebt = (debtId: string) => {
    setNewLinkedLegacyDebtId(debtId);
    if (!debtId) return;
    const debt = legacyDebts.find((d) => d.id === debtId);
    if (!debt) return;
    if (!newTitle.trim()) {
      setNewTitle(debt.name);
    }
    if (!newCreditor.trim()) {
      setNewCreditor(debt.name);
    }
    if (!newInitialBal.trim()) {
      setNewInitialBal(String(debt.amount));
    }
  };

  const handleCreateAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    let initialBalanceToSet = 0;
    let originalPrincipalToSet: number | null = null;
    let prior: number | null = null;
    let schedule: InstallmentSchedule | null = null;
    const refDateToUse = (newAgreementType === 'installments' ? newFirstDueDate : newRefDate) || todayISO();

    if (newAgreementType === 'installments') {
      const numInstallments = parseInt(newTotalInstallments, 10);
      if (isNaN(numInstallments) || numInstallments < 1) {
        setCreateError('La cantidad de cuotas debe ser al menos 1.');
        return;
      }
      const parsedInstAmt = parseDecimalInput(newInstallmentAmount);
      if (parsedInstAmt.error || parsedInstAmt.value === null || parsedInstAmt.value <= 0) {
        setCreateError(parsedInstAmt.error || 'Ingresá un importe por cuota mayor a cero.');
        return;
      }
      if (!newFirstDueDate) {
        setCreateError('Ingresá la fecha de vencimiento de la primera cuota.');
        return;
      }

      const totalCalculated = roundMoney(numInstallments * parsedInstAmt.value);
      initialBalanceToSet = totalCalculated;
      originalPrincipalToSet = totalCalculated;

      schedule = {
        totalInstallments: numInstallments,
        installmentAmount: parsedInstAmt.value,
        firstDueDate: newFirstDueDate,
        dueDay: parseInt(newFirstDueDate.split('-')[2], 10) || 1,
        frequency: 'monthly',
      };
    } else {
      const parsedBal = parseDecimalInput(newInitialBal);
      if (parsedBal.error || parsedBal.value === null || parsedBal.value <= 0) {
        setCreateError(parsedBal.error || 'Ingresá un saldo inicial mayor a cero.');
        return;
      }
      initialBalanceToSet = parsedBal.value;

      let orig: number | null = null;
      if (newHasHistory) {
        if (newOriginalPrincipal.trim()) {
          const pOrig = parseDecimalInput(newOriginalPrincipal);
          if (pOrig.error || pOrig.value === null || pOrig.value <= 0) {
            setCreateError('El importe original debe ser mayor a cero.');
            return;
          }
          orig = pOrig.value;
        }
        if (newPriorPaid.trim()) {
          const pPrior = parseDecimalInput(newPriorPaid);
          if (pPrior.error || pPrior.value === null || pPrior.value < 0) {
            setCreateError('Los pagos previos no pueden ser negativos.');
            return;
          }
          prior = pPrior.value;
        }

        const coherence = validateAgreementCoherence({
          initialRemainingBalance: initialBalanceToSet,
          originalPrincipal: orig,
          priorPaidAmount: prior,
        });
        if (!coherence.valid) {
          setCreateError(coherence.error || 'Incoherencia en los importes.');
          return;
        }
      }
      originalPrincipalToSet = orig;
    }

    if (newAgreementType === 'installments' && newIsAcquisition) {
      if (!newAcquisitionCategory.trim()) {
        setCreateError('Elegí una categoría de gasto para registrar el consumo adquirido.');
        return;
      }
    }

    try {
      onUpdateState((draft) => {
        let acquisitionPayload = null;
        if (newIsAcquisition && newAgreementType === 'installments') {
          acquisitionPayload = {
            acquisitionDate: newAcquisitionDate || todayISO(),
            category: newAcquisitionCategory.trim(),
            totalPurchaseAmount: initialBalanceToSet,
          };
        }

        createFinancingAgreement(draft, {
          title: newTitle.trim(),
          creditorName: newCreditor.trim(),
          currency: newCurrency,
          initialRemainingBalance: initialBalanceToSet,
          initialReferenceDate: refDateToUse,
          originalPrincipal: originalPrincipalToSet,
          priorPaidAmount: prior,
          notes: newNotes.trim() || null,
          linkedLegacyDebtId: newLinkedLegacyDebtId || null,
          schedule,
          acquisition: acquisitionPayload,
        });
      });
      setIsCreateOpen(false);
      onShowToast?.(
        newAgreementType === 'installments'
          ? 'Financiación en cuotas registrada correctamente.'
          : 'Acuerdo de deuda registrado correctamente.',
        'success'
      );
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear el acuerdo.');
    }
  };

  const handleStartEditAcquisition = (agreement: FinancingAgreement) => {
    if (!agreement.acquisition) return;
    setEditingAcquisitionId(agreement.id);
    setEditAcquisitionCategory(agreement.acquisition.category || '');
    setEditAcquisitionDate(agreement.acquisition.acquisitionDate || todayISO());
    setEditAcquisitionError(null);
  };

  const handleSaveEditAcquisition = (e: React.FormEvent, agreement: FinancingAgreement) => {
    e.preventDefault();
    if (!agreement.acquisition) return;
    setEditAcquisitionError(null);

    const cleanCategory = editAcquisitionCategory.trim();
    if (!cleanCategory) {
      setEditAcquisitionError('Elegí una categoría de gasto válida.');
      return;
    }
    if (!editAcquisitionDate) {
      setEditAcquisitionError('Ingresá una fecha de adquisición válida.');
      return;
    }

    try {
      onUpdateState((draft) => {
        updateFinancingAgreement(draft, agreement.id, {
          acquisition: {
            acquisitionDate: editAcquisitionDate,
            category: cleanCategory,
            totalPurchaseAmount: agreement.acquisition!.totalPurchaseAmount,
          },
        });
      });
      setEditingAcquisitionId(null);
      onShowToast?.('Datos de adquisición actualizados.', 'success');
    } catch (err: any) {
      setEditAcquisitionError(err.message || 'Error al actualizar los datos de adquisición.');
    }
  };

  const handleOpenPay = (agreement: FinancingAgreement, customAmount?: number, customDate?: string) => {
    const curBal = calculateAgreementRemainingBalance(agreement, transactions);
    const today = todayISO();
    const defaultDate = customDate
      ? customDate
      : agreement.initialReferenceDate && today < agreement.initialReferenceDate
      ? agreement.initialReferenceDate
      : today;
    setPayingAgreement(agreement);
    setPayAmount(customAmount != null && customAmount > 0 ? String(customAmount) : curBal > 0 ? String(curBal) : '');
    setPayDate(defaultDate);
    setPayNote(`Abono a deuda: ${agreement.title} (${agreement.creditorName})`);
    setPayError(null);

    // Auto-select first matching currency account
    const matchingAcc = accounts.find(
      (a) => (a.currency || 'UYU').toUpperCase() === agreement.currency.toUpperCase()
    );
    setPayAccountId(matchingAcc ? matchingAcc.id : '');
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingAgreement || isSubmittingPay) return;
    setPayError(null);

    const parsedAmt = parseDecimalInput(payAmount);
    if (parsedAmt.error || parsedAmt.value === null || parsedAmt.value <= 0) {
      setPayError(parsedAmt.error || 'Ingresá un importe de abono válido mayor a cero.');
      return;
    }

    if (!payAccountId) {
      setPayError('Elegí una cuenta de origen para el débito.');
      return;
    }

    if (payingAgreement.initialReferenceDate && payDate < payingAgreement.initialReferenceDate) {
      setPayError(
        `La fecha del abono no puede ser anterior a la fecha de corte del acuerdo (${fmtDate(payingAgreement.initialReferenceDate)}). El saldo inicial declarado ya contempla los pagos previos a esa fecha.`
      );
      return;
    }

    setIsSubmittingPay(true);
    try {
      onUpdateState((draft) => {
        addAgreementPayment(draft, {
          agreementId: payingAgreement.id,
          amount: parsedAmt.value,
          accountId: payAccountId,
          date: payDate || todayISO(),
          note: payNote.trim(),
        });
      });
      const agreementName = payingAgreement.title;
      const formattedPaid = state.settings?.privacyMode
        ? '••••'
        : formatMoney(parsedAmt.value, payingAgreement.currency);
      setPayingAgreement(null);
      onShowToast?.(`Abono registrado: -${formattedPaid} a ${agreementName}.`, 'success');
    } catch (err: any) {
      setPayError(err.message || 'Error al registrar el abono.');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`¿Seguro que querés eliminar el acuerdo "${title}"? Los movimientos registrados en tus cuentas no se borrarán, pero se desvincularán del acuerdo.`)) {
      onUpdateState((draft) => {
        deleteFinancingAgreement(draft, id);
      });
      onShowToast?.('Acuerdo eliminado.', 'info');
    }
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--finance-text-primary)]">
              Acuerdos y financiaciones
            </h2>
            <span className="px-2 py-0.5 rounded-md text-[11px] tabular-nums font-semibold bg-[var(--finance-surface-subtle)] text-[var(--finance-text-secondary)]">
              {agreements.length}
            </span>
          </div>
          <p className="text-xs text-[var(--finance-text-muted)] mt-0.5">
            Compras financiadas y deudas personales
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto flex items-center gap-1"
        >
          <AppIcon name="plus" className="h-3.5 w-3.5" />
          <span>Nuevo acuerdo</span>
        </button>
      </div>

      {/* List of Agreements */}
      {agreements.length === 0 ? (
        <div className="p-3.5 rounded-2xl bg-[var(--finance-surface-subtle)] border border-[var(--finance-border)] flex items-center justify-between text-xs text-[var(--finance-text-muted)]">
          <span>No hay acuerdos activos. Agregá préstamos o compras en cuotas.</span>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0 ml-2"
          >
            + Registrar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {agreements.map((agreement) => {
            const remainingBal = calculateAgreementRemainingBalance(agreement, transactions);
            const payments = getAgreementPayments(agreement, transactions);
            const totalPaidInLifeOS = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
            const isSettled = agreement.status === 'settled' || remainingBal <= 0;
            const isExpanded = expandedIds.has(agreement.id);
            const scheduleBreakdown = agreement.schedule ? deriveAgreementSchedule(agreement, transactions) : null;
            const isScheduleExpanded = expandedScheduleIds.has(agreement.id);

            // Progress calculation if originalPrincipal is known
            const hasOrig = typeof agreement.originalPrincipal === 'number' && agreement.originalPrincipal > 0;
            const origAmt = hasOrig ? agreement.originalPrincipal! : null;
            const priorPaid = agreement.priorPaidAmount || 0;
            const cumulativePaid = priorPaid + totalPaidInLifeOS;
            const pct = origAmt && origAmt > 0 ? Math.min(100, Math.round((cumulativePaid / origAmt) * 100)) : null;

            return (
              <div
                key={agreement.id}
                id={`agreement-${agreement.id}`}
                className="rounded-2xl border border-[var(--finance-border)] bg-[var(--finance-surface-subtle)] p-3.5 sm:p-4 space-y-3 transition-all"
              >
                {/* Main Card Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[var(--finance-text-primary)]">
                        {agreement.title}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-500/10 text-[var(--finance-text-secondary)]">
                        {agreement.creditorName}
                      </span>
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        {agreement.currency}
                      </span>
                      {isSettled ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          ✓ Saldado
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          En curso
                        </span>
                      )}
                      {scheduleBreakdown && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                          Cuotas {scheduleBreakdown.completedInstallmentsCount}/{scheduleBreakdown.installments.length}
                        </span>
                      )}
                      {agreement.acquisition && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300"
                          title={`Consumo adquirido: ${agreement.acquisition.category} (${fmtDate(agreement.acquisition.acquisitionDate)})`}
                        >
                          🛍️ {agreement.acquisition.category}
                        </span>
                      )}
                      {agreement.linkedLegacyDebtId && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          title="Vinculado a deuda registrada; deduplicada del pasivo total"
                        >
                          🔗 Deuda registrada
                        </span>
                      )}
                    </div>

                    {/* Progress / Balance Details */}
                    <div className="text-xs text-[var(--finance-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-1">
                      {hasOrig ? (
                        <span>
                          Total acordado:{' '}
                          <PrivacyAmount as="strong">{formatMoney(origAmt, agreement.currency)}</PrivacyAmount>
                          {priorPaid > 0 && (
                            <>
                              {' (pagos previos: '}
                              <PrivacyAmount as="span">{formatMoney(priorPaid, agreement.currency)}</PrivacyAmount>
                              {')'}
                            </>
                          )}
                          {' · '}Abonos registrados:{' '}
                          <PrivacyAmount as="strong">{formatMoney(totalPaidInLifeOS, agreement.currency)}</PrivacyAmount>
                        </span>
                      ) : (
                        <span>
                          Saldo inicial al {fmtDate(agreement.initialReferenceDate)}:{' '}
                          <PrivacyAmount as="strong">{formatMoney(agreement.initialRemainingBalance, agreement.currency)}</PrivacyAmount>
                          {' · '}Abonos registrados:{' '}
                          <PrivacyAmount as="strong">{formatMoney(totalPaidInLifeOS, agreement.currency)}</PrivacyAmount>
                        </span>
                      )}
                    </div>

                    {/* Installment Plan Summary if schedule is present */}
                    {scheduleBreakdown && (
                      <div className="text-xs text-[var(--finance-text-muted)] flex items-center gap-2 flex-wrap pt-0.5">
                        <span>
                          Plan: <strong>{scheduleBreakdown.installments.length} cuotas</strong> de{' '}
                          <PrivacyAmount as="strong">
                            {formatMoney(agreement.schedule!.installmentAmount, agreement.currency)}
                          </PrivacyAmount>
                        </span>
                        {scheduleBreakdown.nextDueInstallment && !isSettled && (
                          <span>
                            · Próximo vencimiento:{' '}
                            <strong className="text-indigo-600 dark:text-indigo-400">
                              Cuota {scheduleBreakdown.nextDueInstallment.installmentNumber} (
                              <PrivacyAmount as="span">
                                {formatMoney(scheduleBreakdown.nextDueInstallment.remainingDue, agreement.currency)}
                              </PrivacyAmount>
                              )
                            </strong>{' '}
                            el <strong className="tabular-nums">{fmtDate(scheduleBreakdown.nextDueInstallment.dueDate)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Financed Acquisition Details if present */}
                    {agreement.acquisition && (
                      editingAcquisitionId === agreement.id ? (
                        <form
                          onSubmit={(e) => handleSaveEditAcquisition(e, agreement)}
                          className="p-2.5 rounded-xl bg-[var(--finance-surface)] border border-violet-500/30 space-y-2 mt-1 animate-in fade-in"
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                            <span>
                              Editar datos de adquisición (
                              <PrivacyAmount as="span">
                                {formatMoney(agreement.acquisition.totalPurchaseAmount, agreement.currency)}
                              </PrivacyAmount>
                              )
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingAcquisitionId(null)}
                              className="text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                          {editAcquisitionError && (
                            <div className="text-[10px] text-rose-500 font-semibold">⚠️ {editAcquisitionError}</div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold uppercase text-[var(--finance-text-muted)] block mb-0.5">
                                Categoría *
                              </label>
                              <select
                                required
                                value={editAcquisitionCategory}
                                onChange={(e) => setEditAcquisitionCategory(e.target.value)}
                                className="w-full p-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--finance-border)] text-[var(--finance-text-primary)] outline-hidden focus:border-indigo-500 font-medium"
                              >
                                <option value="" disabled>-- Elegí una categoría --</option>
                                {categoryOptions.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold uppercase text-[var(--finance-text-muted)] block mb-0.5">
                                Fecha de adquisición *
                              </label>
                              <input
                                type="date"
                                required
                                value={editAcquisitionDate}
                                onChange={(e) => setEditAcquisitionDate(e.target.value)}
                                className="w-full p-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--finance-border)] text-[var(--finance-text-primary)] outline-hidden focus:border-indigo-500 font-medium"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingAcquisitionId(null)}
                              className="px-2 py-1 text-xs font-semibold rounded-lg text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-2xs transition-all"
                            >
                              Guardar cambios
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="text-xs text-violet-700 dark:text-violet-300 flex items-center gap-1.5 pt-0.5 flex-wrap">
                          <span className="font-semibold">Consumo adquirido:</span>
                          <span>
                            {agreement.acquisition.category} por{' '}
                            <PrivacyAmount as="strong">
                              {formatMoney(agreement.acquisition.totalPurchaseAmount, agreement.currency)}
                            </PrivacyAmount>{' '}
                            el <strong className="tabular-nums">{fmtDate(agreement.acquisition.acquisitionDate)}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartEditAcquisition(agreement)}
                            className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer inline-flex items-center gap-0.5 ml-1"
                            title="Editar categoría o fecha de adquisición"
                          >
                            <AppIcon name="edit" className="h-3 w-3" />
                            <span>Editar</span>
                          </button>
                        </div>
                      )
                    )}

                    {/* Optional Notes */}
                    {agreement.notes && (
                      <p className="text-[11px] text-[var(--finance-text-muted)] italic">
                        "{agreement.notes}"
                      </p>
                    )}
                  </div>

                  {/* Right Side: Outstanding Balance & Action */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] uppercase font-bold text-[var(--finance-text-muted)] block">
                        Saldo pendiente
                      </span>
                      <PrivacyAmount
                        as="span"
                        className={`text-lg sm:text-xl font-black tabular-nums ${
                          isSettled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                        }`}
                      >
                        {formatMoney(remainingBal, agreement.currency)}
                      </PrivacyAmount>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {!isSettled && (
                        <button
                          type="button"
                          onClick={() => handleOpenPay(agreement)}
                          className="py-1 px-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-2xs transition-all flex items-center gap-1"
                        >
                          <AppIcon name="plus" className="h-3 w-3" />
                          <span>Abonar</span>
                        </button>
                      )}

                      {scheduleBreakdown && (
                        <button
                          type="button"
                          onClick={() => toggleExpandSchedule(agreement.id)}
                          className="py-1 px-2 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                          title={isScheduleExpanded ? 'Ocultar cronograma de cuotas' : 'Ver cronograma de cuotas'}
                        >
                          Cuotas ({scheduleBreakdown.completedInstallmentsCount}/{scheduleBreakdown.installments.length})
                          <AppIcon name={isScheduleExpanded ? 'chevronUp' : 'chevronDown'} className="inline-block h-3.5 w-3.5 ml-1" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(agreement.id)}
                        className="py-1 px-2 rounded-lg text-xs font-semibold text-[var(--finance-text-muted)] hover:text-[var(--finance-text-primary)] hover:bg-[var(--finance-surface)] transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar historial de abonos' : 'Ver historial de abonos'}
                      >
                        {payments.length} {payments.length === 1 ? 'abono' : 'abonos'}
                        <AppIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="inline-block h-3.5 w-3.5 ml-1" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(agreement.id, agreement.title)}
                        className="text-[var(--finance-text-muted)] hover:text-rose-500 p-1 rounded-lg cursor-pointer"
                        title="Eliminar acuerdo"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar if originalPrincipal is known */}
                {pct !== null && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-[var(--finance-text-muted)] font-semibold">
                      <span>Progreso de amortización</span>
                      <span>
                        {pct}% abonado (
                        <PrivacyAmount as="span">{formatMoney(cumulativePaid, agreement.currency)}</PrivacyAmount>
                        {' de '}
                        <PrivacyAmount as="span">{formatMoney(origAmt, agreement.currency)}</PrivacyAmount>
                        )
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--finance-border)] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${isSettled ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded Installments Schedule Drawer */}
                {isScheduleExpanded && scheduleBreakdown && (
                  <div className="pt-2 border-t border-[var(--finance-border)] space-y-1.5 animate-in fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)] flex items-center justify-between">
                      <span>Cronograma de Cuotas ({scheduleBreakdown.installments.length} cuotas)</span>
                      <span>
                        {scheduleBreakdown.completedInstallmentsCount} pagadas · {scheduleBreakdown.installments.length - scheduleBreakdown.completedInstallmentsCount} pendientes
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--finance-border)] rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface)] overflow-hidden">
                      {scheduleBreakdown.installments.map((inst) => {
                        const isPaid = inst.status === 'paid';
                        const isPartial = inst.status === 'partial';
                        const isOverdue = inst.status === 'overdue';
                        return (
                          <div key={inst.installmentNumber} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[var(--finance-text-primary)]">
                                Cuota {inst.installmentNumber} de {inst.totalInstallments}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  isPaid
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : isPartial
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : isOverdue
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    : 'bg-zinc-500/10 text-[var(--finance-text-muted)]'
                                }`}
                              >
                                {isPaid ? '✓ Pagada' : isPartial ? 'Parcial' : isOverdue ? 'Vencida' : 'Pendiente'}
                              </span>
                              <span className="text-[10px] tabular-nums text-[var(--finance-text-muted)]">
                                Vence: {fmtDate(inst.dueDate)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <PrivacyAmount as="span" className="font-bold tabular-nums text-[var(--finance-text-primary)]">
                                  {formatMoney(inst.requiredAmount, agreement.currency)}
                                </PrivacyAmount>
                                {isPartial && (
                                  <span className="block text-[9px] tabular-nums text-amber-600 dark:text-amber-400">
                                    Resta{' '}
                                    <PrivacyAmount as="span">
                                      {formatMoney(inst.remainingDue, agreement.currency)}
                                    </PrivacyAmount>
                                  </span>
                                )}
                              </div>
                              {!isPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPay(agreement, inst.remainingDue, inst.dueDate)}
                                  className="py-0.5 px-2 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-2xs transition-all"
                                  title="Pagar esta cuota ahora"
                                >
                                  Pagar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded Payment History Drawer */}
                {isExpanded && (
                  <div className="pt-2 border-t border-[var(--finance-border)] space-y-1.5 animate-in fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--finance-text-muted)]">
                      Historial de abonos ({payments.length})
                    </div>
                    {payments.length === 0 ? (
                      <div className="text-xs text-[var(--finance-text-muted)] italic py-1">
                        Aún no hay abonos para este acuerdo.
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--finance-border)] rounded-xl border border-[var(--finance-border)] bg-[var(--finance-surface)]">
                        {payments.map((p) => {
                          const acc = accounts.find((a) => a.id === p.accountId);
                          return (
                            <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-semibold text-[var(--finance-text-primary)]">
                                  {p.note || 'Abono a deuda'}
                                </div>
                                <div className="text-[10px] text-[var(--finance-text-muted)]">
                                  {fmtDate(p.date)} · Cuenta: {acc?.name || 'Desconocida'}
                                </div>
                              </div>
                              <PrivacyAmount as="span" className="font-bold tabular-nums text-rose-500">
                                -{formatMoney(p.amount, p.currency || agreement.currency)}
                              </PrivacyAmount>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CREATE AGREEMENT */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-[var(--text)]">
                  {newAgreementType === 'installments' ? 'Nueva compra financiada (Cuotas fijas)' : 'Nuevo acuerdo de deuda personal'}
                </h3>
                <p className="text-xs text-[var(--text-faint)]">
                  {newAgreementType === 'installments'
                    ? 'Registrá compras en cuotas con proyección en Futuro y amortización real'
                    : 'Registrá una deuda viva para amortizarla con pagos reales desde tus cuentas'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400">
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateAgreement} className="space-y-3">
              {/* Agreement Mode Switcher */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setNewAgreementType('flexible')}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    newAgreementType === 'flexible'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Deuda personal flexible
                </button>
                <button
                  type="button"
                  onClick={() => setNewAgreementType('installments')}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    newAgreementType === 'installments'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Cuotas fijas (Comercial)
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Concepto / Título *
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={newAgreementType === 'installments' ? 'Ej. Computadora, Heladera James...' : 'Ej. Moto Honda, Préstamo familiar...'}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                    Acreedor / Comercio *
                  </label>
                  <input
                    required
                    type="text"
                    value={newCreditor}
                    onChange={(e) => setNewCreditor(e.target.value)}
                    placeholder={newAgreementType === 'installments' ? 'Ej. Tienda Inglesa, Motociclo...' : 'Ej. Hermano, Juan...'}
                    className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                    Moneda *
                  </label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value as 'UYU' | 'USD')}
                    className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                  >
                    <option value="UYU">UYU ($U - Pesos)</option>
                    <option value="USD">USD (US$ - Dólares)</option>
                  </select>
                </div>
              </div>

              {/* Optional Link to Existing Legacy Debt */}
              {availableLegacyDebts.length > 0 && (
                <div className="p-3 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-1.5 animate-in fade-in">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                    ¿Corresponde a una deuda ya registrada en Cuentas? (Opcional)
                  </label>
                  <select
                    value={newLinkedLegacyDebtId}
                    onChange={(e) => handleSelectLegacyDebt(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                  >
                    <option value="">No, es una deuda o acuerdo nuevo</option>
                    {availableLegacyDebts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({state.settings?.privacyMode ? '••••' : formatMoney(d.amount, 'UYU')})
                      </option>
                    ))}
                  </select>
                  {newLinkedLegacyDebtId ? (
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      ✓ Al vincularla, este acuerdo reemplaza a la deuda en el cómputo patrimonial para evitar duplicados.
                    </p>
                  ) : (
                    <p className="text-[10px] text-[var(--text-faint)]">
                      Podés asociar una deuda antigua registrada para continuar su seguimiento con abonos reales.
                    </p>
                  )}
                </div>
              )}

              {/* Specific Fields: Installments vs Flexible */}
              {newAgreementType === 'installments' ? (
                <div className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3 animate-in fade-in">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Parámetros de las Cuotas
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                        Cantidad de cuotas *
                      </label>
                      <input
                        required
                        type="number"
                        min="1"
                        max="120"
                        value={newTotalInstallments}
                        onChange={(e) => setNewTotalInstallments(e.target.value)}
                        className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                        Importe por cuota *
                      </label>
                      <input
                        required
                        type="text"
                        value={newInstallmentAmount}
                        onChange={(e) => setNewInstallmentAmount(e.target.value)}
                        placeholder="Ej. 2000 o 2.000,50"
                        className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                      Primer vencimiento *
                    </label>
                    <input
                      required
                      type="date"
                      value={newFirstDueDate}
                      onChange={(e) => setNewFirstDueDate(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                    />
                    <span className="text-[9px] text-[var(--text-faint)] block mt-0.5">
                      Las cuotas subsiguientes vencerán mensualmente el mismo día ({newFirstDueDate.split('-')[2] || 1}).
                    </span>
                  </div>
                  {(() => {
                    const n = parseInt(newTotalInstallments, 10);
                    const parsed = parseDecimalInput(newInstallmentAmount);
                    if (n > 0 && parsed.value && parsed.value > 0) {
                      return (
                        <div className="pt-2 text-xs text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between border-t border-indigo-500/20">
                          <span>Total financiado:</span>
                          <PrivacyAmount as="span" className="font-bold tabular-nums">
                            {formatMoney(roundMoney(n * parsed.value), newCurrency)}
                          </PrivacyAmount>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Financed Acquisition Checkbox & Options */}
                  <div className="pt-2 border-t border-indigo-500/20 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newIsAcquisition}
                        onChange={(e) => setNewIsAcquisition(e.target.checked)}
                        className="rounded cursor-pointer text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-[var(--text)]">
                        Registrar como consumo adquirido (Compra)
                      </span>
                    </label>
                    <p className="text-[10px] text-[var(--text-faint)]">
                      Reconoce el consumo en Analítica en la fecha de compra sin crear débitos bancarios ficticios.
                    </p>

                    {newIsAcquisition && (
                      <div className="p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2 animate-in fade-in">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                              Categoría de gasto *
                            </label>
                            <select
                              required={newIsAcquisition}
                              value={newAcquisitionCategory}
                              onChange={(e) => setNewAcquisitionCategory(e.target.value)}
                              className="w-full p-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                            >
                              <option value="" disabled>-- Elegí una categoría --</option>
                              {categoryOptions.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                              Fecha de compra *
                            </label>
                            <input
                              type="date"
                              required={newIsAcquisition}
                              value={newAcquisitionDate}
                              onChange={(e) => setNewAcquisitionDate(e.target.value)}
                              className="w-full p-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                        Saldo pendiente actual *
                      </label>
                      <input
                        required
                        type="text"
                        value={newInitialBal}
                        onChange={(e) => setNewInitialBal(e.target.value)}
                        placeholder="Ej. 35000 o 35.000,50"
                        className="w-full p-2.5 text-xs font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500"
                      />
                      <span className="text-[9px] text-[var(--text-faint)] block mt-0.5">
                        ¿Cuánto debés hoy a partir de la fecha de corte?
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                        Fecha de referencia *
                      </label>
                      <input
                        required
                        type="date"
                        value={newRefDate}
                        onChange={(e) => setNewRefDate(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                      />
                      <span className="text-[9px] text-[var(--text-faint)] block mt-0.5">
                        Corte de abonos registrados
                      </span>
                    </div>
                  </div>

                  {/* Optional Historical Data Toggle */}
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newHasHistory}
                        onChange={(e) => setNewHasHistory(e.target.checked)}
                        className="rounded cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-[var(--text)]">
                        Conozco el monto original y los pagos previos
                      </span>
                    </label>
                  </div>

                  {newHasHistory && (
                    <div className="p-3 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2 animate-in fade-in">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                            Monto original pactado
                          </label>
                          <input
                            type="text"
                            value={newOriginalPrincipal}
                            onChange={(e) => setNewOriginalPrincipal(e.target.value)}
                            placeholder="Ej. 50000"
                            className="w-full p-2 text-xs font-bold tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                            Pagos previos externos
                          </label>
                          <input
                            type="text"
                            value={newPriorPaid}
                            onChange={(e) => setNewPriorPaid(e.target.value)}
                            placeholder="Ej. 15000"
                            className="w-full p-2 text-xs font-bold tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-faint)]">
                        Nota: No se crearán movimientos ficticios en tus cuentas bancarias por los pagos previos.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Notas u observaciones (Opcional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Detalles sobre el acuerdo o modalidad de pago..."
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 text-xs font-semibold rounded-xl text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs transition-all"
                >
                  Guardar acuerdo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER ABONO */}
      {payingAgreement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPayingAgreement(null)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-[var(--text)]">
                  Registrar abono a deuda
                </h3>
                <p className="text-xs text-[var(--text-faint)]">
                  {payingAgreement.title} ({payingAgreement.creditorName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingAgreement(null)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {payError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400">
                ⚠️ {payError}
              </div>
            )}

            <div className="p-3 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-between text-xs">
              <span className="text-[var(--text-faint)]">Saldo pendiente actual:</span>
              <PrivacyAmount as="span" className="font-extrabold text-sm text-rose-500 tabular-nums">
                {formatMoney(calculateAgreementRemainingBalance(payingAgreement, transactions), payingAgreement.currency)}
              </PrivacyAmount>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Importe efectivamente pagado ({payingAgreement.currency}) *
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-black tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Cuenta de origen (Débito) *
                </label>
                <select
                  required
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                >
                  <option value="">Elegí una cuenta compatible...</option>
                  {accounts
                    .filter((a) => (a.currency || 'UYU').toUpperCase() === payingAgreement.currency.toUpperCase())
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({state.settings?.privacyMode ? '••••' : formatMoney(a.balance, a.currency || 'UYU')})
                      </option>
                    ))}
                </select>
                {accounts.filter((a) => (a.currency || 'UYU').toUpperCase() === payingAgreement.currency.toUpperCase()).length === 0 && (
                  <span className="text-[10px] text-rose-500 block mt-1">
                    No tenés cuentas en {payingAgreement.currency}. Creá una cuenta en Cuentas antes de abonar.
                  </span>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Fecha del abono *
                </label>
                <input
                  required
                  type="date"
                  value={payDate}
                  min={payingAgreement.initialReferenceDate || undefined}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                />
                {payingAgreement.initialReferenceDate && (
                  <span className="text-[9px] text-[var(--text-faint)] block mt-0.5">
                    Debe ser igual o posterior a la fecha de corte ({fmtDate(payingAgreement.initialReferenceDate)})
                  </span>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Nota / Detalle en el libro mayor
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setPayingAgreement(null)}
                  className="px-3 py-2 text-xs font-semibold rounded-xl text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmittingPay ? 'Procesando...' : 'Confirmar abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
