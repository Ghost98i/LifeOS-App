import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, normalizeStoredState } from './storage';
import {
  createFinancingAgreement,
  updateFinancingAgreement,
  calculateInstallmentDate,
  deriveAgreementSchedule,
  getNextDueInstallment,
  addAgreementPayment,
} from './financeAgreements';
import { addTransaction, deleteTransaction } from './financeFlows';
import { getCommittedEventsForWindow, deriveCashflowProjection } from './financeCashflow';
import { mergeFinanceModule } from './syncMerge';
import {
  cashFlowProjection,
  calcDebtsTotal,
  calcCashOutflowMonth,
  calcDebtPaymentsMonth,
  calcFinancedAcquisitionsMonth,
  calcTotalAcquisitionsMonth,
  calcAcquisitionsByCategory,
} from './calculations';
import type { LifeOSState } from '../types';

function createTestState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco Santander UYU', balance: 50000, initialBalance: 50000, currency: 'UYU' },
    { id: 'acc-usd', name: 'Banco USD', balance: 2000, initialBalance: 2000, currency: 'USD' },
  ];
  state.finance.transactions = [];
  state.finance.agreements = [];
  state.finance.debts = [];
  return state;
}

test('Finanzas 1.3C — calculateInstallmentDate: cálculo civil sin desplazamiento de huso horario y ancla de fin de mes', () => {
  // Caso regular mensual: día 10
  assert.equal(calculateInstallmentDate('2026-11-10', 10, 0), '2026-11-10');
  assert.equal(calculateInstallmentDate('2026-11-10', 10, 1), '2026-12-10');
  assert.equal(calculateInstallmentDate('2026-11-10', 10, 2), '2027-01-10');

  // Caso ancla día 31: Febrero debe ajustarse al 28, y Marzo volver al 31 (no quedarse degradado en 28)
  assert.equal(calculateInstallmentDate('2027-01-31', 31, 0), '2027-01-31');
  assert.equal(calculateInstallmentDate('2027-01-31', 31, 1), '2027-02-28'); // 2027 no es bisiesto
  assert.equal(calculateInstallmentDate('2027-01-31', 31, 2), '2027-03-31');
  assert.equal(calculateInstallmentDate('2027-01-31', 31, 3), '2027-04-30'); // Abril tiene 30 días

  // Año bisiesto 2028: Febrero debe ser 29
  assert.equal(calculateInstallmentDate('2028-01-31', 31, 1), '2028-02-29');

  // Frecuencia semanal y quincenal
  assert.equal(calculateInstallmentDate('2026-11-01', 1, 1, 'weekly'), '2026-11-08');
  assert.equal(calculateInstallmentDate('2026-11-01', 1, 2, 'weekly'), '2026-11-15');
  assert.equal(calculateInstallmentDate('2026-11-01', 1, 1, 'biweekly'), '2026-11-15');
});

test('Finanzas 1.3C — Caso real: Electrodoméstico $U 12.000 en 6 cuotas de $U 2.000 con cascada exacta', () => {
  const state = createTestState();

  // 1. Alta del acuerdo comercial
  const agreement = createFinancingAgreement(state, {
    title: 'Heladera James Inverter',
    creditorName: 'Barraca Europa',
    currency: 'UYU',
    initialRemainingBalance: 12000,
    initialReferenceDate: '2026-11-01',
    originalPrincipal: 12000,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 2000,
      firstDueDate: '2026-11-10',
      dueDay: 10,
      frequency: 'monthly',
    },
  });

  assert.equal(state.finance.agreements?.length, 1);
  assert.equal(agreement.schedule?.totalInstallments, 6);
  assert.equal(agreement.schedule?.installmentAmount, 2000);

  // Impacto en pasivos patrimoniales: $U 12.000
  const debtsUYU = calcDebtsTotal(state, 'UYU');
  assert.equal(debtsUYU, 12000, 'El pasivo inicial debe ser exactamente $U 12.000');

  // Estado inicial de la cascada: 0 pagadas, todas pendientes
  const initialSchedule = deriveAgreementSchedule(agreement, state.finance.transactions, '2026-11-01');
  assert.ok(initialSchedule);
  assert.equal(initialSchedule.totalAgreed, 12000);
  assert.equal(initialSchedule.totalPaid, 0);
  assert.equal(initialSchedule.remainingBalance, 12000);
  assert.equal(initialSchedule.completedInstallmentsCount, 0);
  assert.equal(initialSchedule.installments.length, 6);
  assert.equal(initialSchedule.nextDueInstallment?.installmentNumber, 1);
  assert.equal(initialSchedule.nextDueInstallment?.dueDate, '2026-11-10');
  assert.equal(initialSchedule.nextDueInstallment?.status, 'pending');

  // 2. Pago exacto de la cuota 1 ($U 2.000 el 10/11)
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 2000,
    accountId: 'acc-uyu',
    date: '2026-11-10',
    note: 'Pago cuota 1 Heladera',
  });

  // Saldo bancario: 50.000 - 2.000 = 48.000. Pasivo: 12.000 - 2.000 = 10.000
  assert.equal(state.finance.accounts[0].balance, 48000);
  assert.equal(calcDebtsTotal(state, 'UYU'), 10000);

  const schedAfterPay1 = deriveAgreementSchedule(agreement, state.finance.transactions, '2026-11-15');
  assert.ok(schedAfterPay1);
  assert.equal(schedAfterPay1.totalPaid, 2000);
  assert.equal(schedAfterPay1.remainingBalance, 10000);
  assert.equal(schedAfterPay1.completedInstallmentsCount, 1);
  assert.equal(schedAfterPay1.installments[0].status, 'paid');
  assert.equal(schedAfterPay1.installments[0].allocatedPaid, 2000);
  assert.equal(schedAfterPay1.installments[0].remainingDue, 0);
  assert.equal(schedAfterPay1.nextDueInstallment?.installmentNumber, 2);
  assert.equal(schedAfterPay1.nextDueInstallment?.dueDate, '2026-12-10');
  assert.equal(schedAfterPay1.nextDueInstallment?.status, 'pending');

  // 3. Pago parcial de la cuota 2 ($U 1.200 abonados en vez de $U 2.000 el 10/12)
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 1200,
    accountId: 'acc-uyu',
    date: '2026-12-10',
    note: 'Pago parcial cuota 2',
  });

  const schedPartial = deriveAgreementSchedule(agreement, state.finance.transactions, '2026-12-11');
  assert.ok(schedPartial);
  assert.equal(schedPartial.totalPaid, 3200);
  assert.equal(schedPartial.remainingBalance, 8800);
  assert.equal(schedPartial.completedInstallmentsCount, 1);
  assert.equal(schedPartial.installments[1].installmentNumber, 2);
  assert.equal(schedPartial.installments[1].status, 'partial');
  assert.equal(schedPartial.installments[1].allocatedPaid, 1200);
  assert.equal(schedPartial.installments[1].remainingDue, 800);
  assert.equal(schedPartial.nextDueInstallment?.installmentNumber, 2);
  assert.equal(schedPartial.nextDueInstallment?.remainingDue, 800);

  // 4. Sobrepago / Adelanto: Se abonan $U 3.000 el 15/12
  // La cuota 2 completa los $U 800 restantes, y los $U 2.200 excedentes cubren la cuota 3 ($U 2.000) y adelantan $U 200 de la cuota 4
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 3000,
    accountId: 'acc-uyu',
    date: '2026-12-15',
    note: 'Adelanto',
  });

  const schedAdvance = deriveAgreementSchedule(agreement, state.finance.transactions, '2026-12-16');
  assert.ok(schedAdvance);
  assert.equal(schedAdvance.totalPaid, 6200);
  assert.equal(schedAdvance.remainingBalance, 5800);
  assert.equal(schedAdvance.completedInstallmentsCount, 3); // Cuotas 1, 2 y 3 pagadas
  assert.equal(schedAdvance.installments[0].status, 'paid');
  assert.equal(schedAdvance.installments[1].status, 'paid');
  assert.equal(schedAdvance.installments[2].status, 'paid');
  assert.equal(schedAdvance.installments[3].installmentNumber, 4);
  assert.equal(schedAdvance.installments[3].status, 'partial');
  assert.equal(schedAdvance.installments[3].allocatedPaid, 200);
  assert.equal(schedAdvance.installments[3].remainingDue, 1800);
  assert.equal(schedAdvance.nextDueInstallment?.installmentNumber, 4);
  assert.equal(schedAdvance.nextDueInstallment?.remainingDue, 1800);

  // 5. Cancelación anticipada total: Se paga el resto ($U 5.800)
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 5800,
    accountId: 'acc-uyu',
    date: '2027-01-05',
    note: 'Cancelación total',
  });

  const schedFinal = deriveAgreementSchedule(agreement, state.finance.transactions, '2027-01-06');
  assert.ok(schedFinal);
  assert.equal(schedFinal.totalPaid, 12000);
  assert.equal(schedFinal.remainingBalance, 0);
  assert.equal(schedFinal.completedInstallmentsCount, 6);
  assert.equal(schedFinal.nextDueInstallment, null);
  assert.equal(agreement.status, 'settled');

  // 6. Reversibilidad pura: Se elimina el pago de $U 5.800
  const lastTx = state.finance.transactions.find((t) => t.amount === 5800)!;
  deleteTransaction(state, lastTx.id);

  const schedReverted = deriveAgreementSchedule(agreement, state.finance.transactions, '2027-01-06');
  assert.ok(schedReverted);
  assert.equal(schedReverted.totalPaid, 6200);
  assert.equal(schedReverted.remainingBalance, 5800);
  assert.equal(schedReverted.completedInstallmentsCount, 3);
  assert.equal(agreement.status, 'active');
  assert.equal(schedReverted.nextDueInstallment?.installmentNumber, 4);
});

test('Finanzas 1.3C — Proyección en Futuro: getCommittedEventsForWindow y cashFlowProjection', () => {
  const state = createTestState();

  const agreement = createFinancingAgreement(state, {
    title: 'Notebook ASUS',
    creditorName: 'ZonaTecno',
    currency: 'USD',
    initialRemainingBalance: 1200,
    initialReferenceDate: '2026-11-01',
    originalPrincipal: 1200,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 200,
      firstDueDate: '2026-11-15',
      dueDay: 15,
      frequency: 'monthly',
    },
  });

  // Ventana de 30 días desde 2026-11-01: debe incluir Cuota 1 (2026-11-15)
  const events30d = getCommittedEventsForWindow(state, '30d', '2026-11-01');
  const asusEvents = events30d.filter((e) => e.agreementId === agreement.id);
  assert.equal(asusEvents.length, 1);
  assert.equal(asusEvents[0].amount, 200);
  assert.equal(asusEvents[0].currency, 'USD');
  assert.equal(asusEvents[0].installmentNumber, 1);
  assert.equal(asusEvents[0].totalInstallments, 6);
  assert.equal(asusEvents[0].isFinancing, true);

  // Pago parcial de USD 50 en la cuota 1
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 50,
    accountId: 'acc-usd',
    date: '2026-11-05',
    note: 'Pago parcial cuota 1',
  });

  // Ahora la proyección debe pedir ÚNICAMENTE los USD 150 restantes, no USD 200
  const eventsAfterPartial = getCommittedEventsForWindow(state, '30d', '2026-11-01');
  const asusAfterPartial = eventsAfterPartial.filter((e) => e.agreementId === agreement.id);
  assert.equal(asusAfterPartial.length, 1);
  assert.equal(asusAfterPartial[0].amount, 150, 'Debe proyectar solo el remanente impago de la cuota');

  // Simulación en cashFlowProjection para USD
  const projUSD = cashFlowProjection(state, 30, '2026-11-01', 'USD');
  const forecastItem = projUSD.forecastItems.find((f) => f.agreementId === agreement.id);
  assert.ok(forecastItem);
  assert.equal(forecastItem.amount, 150);
  assert.equal(forecastItem.type, 'debt');
  assert.equal(forecastItem.installmentNumber, 1);
});

test('Finanzas 1.3C — Convivencia pacífica con acuerdos flexibles (Finanzas 1.3B)', () => {
  const state = createTestState();

  // Acuerdo personal flexible (sin schedule)
  const flexAgreement = createFinancingAgreement(state, {
    title: 'Deuda moto hermano',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 30000,
    initialReferenceDate: '2026-10-01',
  });

  assert.equal(flexAgreement.schedule, null);
  const sched = deriveAgreementSchedule(flexAgreement, state.finance.transactions);
  assert.equal(sched, null, 'deriveAgreementSchedule debe ser null para acuerdos sin cuotas');
  assert.equal(getNextDueInstallment(flexAgreement, state.finance.transactions), null);

  // No debe romper getCommittedEventsForWindow
  const events = getCommittedEventsForWindow(state, '30d', '2026-10-01');
  const flexEvents = events.filter((e) => e.agreementId === flexAgreement.id);
  assert.equal(flexEvents.length, 0, 'Acuerdos sin schedule no generan cuotas arbitrarias en Futuro');
});

test('Finanzas 1.3C — Consistencia de cuotas vencidas en Dashboard (calculations) y Futuro (cashflow): inclusión única, abonos parciales y liquidación completa', () => {
  const state = createTestState();

  // Financiación comercial de 6 cuotas de $U 2.000 con primer vencimiento el 15/11/2026
  const agreement = createFinancingAgreement(state, {
    title: 'Televisor Smart 55',
    creditorName: 'Carlos Gutiérrez',
    currency: 'UYU',
    initialRemainingBalance: 12000,
    initialReferenceDate: '2026-11-01',
    originalPrincipal: 12000,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 2000,
      firstDueDate: '2026-11-15',
      dueDay: 15,
      frequency: 'monthly',
    },
  });

  // Fecha de consulta: 20/11/2026 (exactamente 5 días DESPUÉS del vencimiento de la cuota 1)
  const fromIso = '2026-11-20';

  // 1. Escenario Inicial: Cuota 1 vencida e impaga ($U 2.000)
  // Dashboard / calculations.ts
  const proj = cashFlowProjection(state, 30, fromIso, 'UYU');
  const agrForecast = proj.forecastItems.filter((f) => f.agreementId === agreement.id);

  // Deben figurar Cuota 1 (vencida el 15/11) y Cuota 2 (a vencer el 15/12)
  assert.equal(agrForecast.length, 2, 'Debe incluir la cuota vencida y la próxima cuota dentro del horizonte');

  const cuota1 = agrForecast.find((f) => f.installmentNumber === 1);
  assert.ok(cuota1, 'Cuota 1 debe estar presente');
  assert.equal(cuota1.amount, 2000);
  assert.equal(cuota1.date, '2026-11-15', 'Debe conservar su fecha de vencimiento real sin fingir que vence hoy');
  assert.equal(cuota1.isOverdue, true, 'Debe identificarse explícitamente como atrasada');
  assert.equal(cuota1.type, 'debt');

  const cuota2 = agrForecast.find((f) => f.installmentNumber === 2);
  assert.ok(cuota2, 'Cuota 2 debe estar presente');
  assert.equal(cuota2.amount, 2000);
  assert.equal(cuota2.date, '2026-12-15');
  assert.equal(cuota2.isOverdue, false);

  // Verificación de compromisos y liquidez disponible
  const agrCommitments = proj.commitments.filter((c) => c.id.startsWith(`agreement-${agreement.id}`));
  assert.equal(agrCommitments.length, 2);
  assert.equal(proj.committed, 4000, 'Cuota vencida ($2.000) + Cuota en ventana ($2.000) = $4.000');
  assert.equal(proj.realAvailable, 46000, 'Saldo de $50.000 menos $4.000 comprometidos = $46.000');
  assert.equal(proj.projectedBalance, 46000);

  // Verificación de consistencia en dailyTrajectory: el compromiso vencido impacta desde el día 0
  assert.equal(proj.dailyTrajectory[0].startingBalance, 50000);
  assert.equal(proj.dailyTrajectory[0].debtPayments, 2000, 'El egreso vencido se computa en el día 0 de la proyección');
  assert.equal(proj.dailyTrajectory[0].endingBalance, 48000);
  assert.equal(proj.dailyTrajectory[proj.dailyTrajectory.length - 1].endingBalance, proj.projectedBalance, 'El saldo final de trayectoria coincide exactamente con el proyectado');

  // Coherencia con Futuro / financeCashflow.ts
  const futureEvents = getCommittedEventsForWindow(state, '30d', fromIso);
  const agrFutureEvents = futureEvents.filter((e) => e.agreementId === agreement.id);
  assert.equal(agrFutureEvents.length, 2);
  assert.equal(agrFutureEvents[0].amount, 2000);
  assert.equal(agrFutureEvents[0].isOverdue, true);

  const windowProj = deriveCashflowProjection(state, '30d', fromIso);
  assert.equal(windowProj.summariesByCurrency['UYU'].committedExpenses, 4000);
  assert.equal(windowProj.summariesByCurrency['UYU'].availableAfterCommitments, 46000);

  // 2. Escenario Abono Parcial: se pagan $U 1.200 de la cuota vencida
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 1200,
    accountId: 'acc-uyu',
    date: '2026-11-21',
    note: 'Pago parcial cuota 1',
  });

  // Saldo bancario ahora es $48.800
  const projPartial = cashFlowProjection(state, 30, fromIso, 'UYU');
  const cuota1Partial = projPartial.forecastItems.find((f) => f.agreementId === agreement.id && f.installmentNumber === 1);
  assert.ok(cuota1Partial);
  assert.equal(cuota1Partial.amount, 800, 'La cuota vencida debe exigir ÚNICAMENTE los $U 800 restantes');
  assert.equal(cuota1Partial.isOverdue, true);

  const agrCommitmentsPartial = projPartial.commitments.filter((c) => c.id.startsWith(`agreement-${agreement.id}`));
  assert.equal(agrCommitmentsPartial.length, 2);
  assert.equal(projPartial.committed, 2800, '$U 800 restantes + $U 2.000 cuota 2 = $U 2.800 comprometidos');
  assert.equal(projPartial.realAvailable, 46000, '$U 48.800 en cuenta - $U 2.800 = $U 46.000 disponible');
  assert.equal(projPartial.projectedBalance, 46000);

  // Coherencia en Futuro con pago parcial
  const futurePartialEvents = getCommittedEventsForWindow(state, '30d', fromIso);
  const cuota1FuturePartial = futurePartialEvents.find((e) => e.agreementId === agreement.id && e.installmentNumber === 1);
  assert.ok(cuota1FuturePartial);
  assert.equal(cuota1FuturePartial.amount, 800);

  // 3. Escenario Pago Completo: se abonan los $U 800 restantes de la cuota vencida
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 800,
    accountId: 'acc-uyu',
    date: '2026-11-22',
    note: 'Liquidación cuota 1',
  });

  // Saldo bancario ahora es $48.000. Cuota 1 está 100% saldada
  const projFull = cashFlowProjection(state, 30, fromIso, 'UYU');
  const cuota1Full = projFull.forecastItems.find((f) => f.agreementId === agreement.id && f.installmentNumber === 1);
  assert.equal(cuota1Full, undefined, 'La cuota vencida totalmente pagada NO debe seguir afectando la proyección');

  const cuota2Full = projFull.forecastItems.find((f) => f.agreementId === agreement.id && f.installmentNumber === 2);
  assert.ok(cuota2Full);
  assert.equal(cuota2Full.amount, 2000);

  assert.equal(projFull.committed, 2000, 'Solamente la cuota 2 queda comprometida ($U 2.000)');
  assert.equal(projFull.realAvailable, 46000, '$U 48.000 en cuenta - $U 2.000 = $U 46.000 disponible');
  assert.equal(projFull.projectedBalance, 46000);

  // Futuro tampoco proyecta la cuota liquidada
  const futureFullEvents = getCommittedEventsForWindow(state, '30d', fromIso);
  assert.equal(futureFullEvents.some((e) => e.agreementId === agreement.id && e.installmentNumber === 1), false);

  // 4. Integridad contable del historial y precisión monetaria
  assert.equal(state.finance.transactions.length, 2);
  assert.equal(state.finance.transactions[0].amount, 1200);
  assert.equal(state.finance.transactions[1].amount, 800);
  assert.equal(state.finance.transactions[0].origin, 'debt_payment');
  assert.equal(state.finance.transactions[1].origin, 'debt_payment');
  assert.equal(calcDebtsTotal(state, 'UYU'), 10000, 'Deuda remanente derivada: 12000 - 2000 = $10.000 exactos');
});

test('Finanzas 1.3C — Deduplicación estricta de deudas legacy vinculadas a un acuerdo con cuotas', () => {
  const state = createTestState();

  // Deuda legacy
  state.finance.debts = [
    {
      id: 'legacy-debt-1',
      name: 'Deuda Vieja Casa de Crédito',
      amount: 10000,
      monthlyPayment: 2000,
      dueDate: '2026-11-15',
    },
  ];

  // Acuerdo moderno enlazado a esa misma deuda legacy
  const agreement = createFinancingAgreement(state, {
    title: 'Migración Deuda Vieja',
    creditorName: 'Casa de Crédito',
    currency: 'UYU',
    initialRemainingBalance: 10000,
    initialReferenceDate: '2026-11-01',
    originalPrincipal: 10000,
    linkedLegacyDebtId: 'legacy-debt-1',
    schedule: {
      totalInstallments: 5,
      installmentAmount: 2000,
      firstDueDate: '2026-11-15',
      dueDay: 15,
      frequency: 'monthly',
    },
  });
  assert.equal(agreement.linkedLegacyDebtId, 'legacy-debt-1');

  // Ambas proyecciones deben desduplicar la deuda legacy
  const proj = cashFlowProjection(state, 30, '2026-11-01', 'UYU');
  const legacyItems = proj.forecastItems.filter((f) => f.sourceId === 'legacy-debt-1');
  assert.equal(legacyItems.length, 0, 'La deuda legacy vinculada no debe duplicarse en cashFlowProjection');

  const futureEvents = getCommittedEventsForWindow(state, '30d', '2026-11-01');
  const legacyEvents = futureEvents.filter((e) => e.sourceId === 'legacy-debt-1');
  assert.equal(legacyEvents.length, 0, 'La deuda legacy vinculada no debe duplicarse en getCommittedEventsForWindow');

  // En el pasivo patrimonial tampoco se debe sumar dos veces
  const totalDebts = calcDebtsTotal(state, 'UYU');
  assert.equal(totalDebts, 10000, 'El pasivo total no debe sumar la deuda legacy vinculada (10.000, no 20.000)');
});

test('Finanzas 1.3C-D1 — Semántica dual: compra financiada de $U 12.000 (Hogar) y pago posterior de cuota sin duplicación', () => {
  const state = createTestState();
  const now = new Date();
  const purchaseDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 10);
  const nextPaymentDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-10`;

  // 1. Alta del acuerdo comercial con compra de electrodoméstico $U 12.000 en 6 cuotas de $U 2.000 (Hogar)
  const agreement = createFinancingAgreement(state, {
    title: 'Heladera James Inverter',
    creditorName: 'Barraca Europa',
    currency: 'UYU',
    initialRemainingBalance: 12000,
    initialReferenceDate: purchaseDate,
    originalPrincipal: 12000,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 2000,
      firstDueDate: nextPaymentDate,
      dueDay: 10,
      frequency: 'monthly',
    },
    acquisition: {
      acquisitionDate: purchaseDate,
      category: 'Hogar',
      totalPurchaseAmount: 12000,
    },
  });

  // A. Estado en el mes de adquisición (offset 0):
  // - Consumo adquirido: $U 12.000 en Hogar
  // - Salidas bancarias de caja: $U 0
  // - Deuda pendiente: $U 12.000
  const financedOnly0 = calcFinancedAcquisitionsMonth(state, 0, 'UYU');
  assert.equal(financedOnly0.total, 12000, 'calcFinancedAcquisitionsMonth retorna $U 12.000');
  assert.equal(financedOnly0.items.length, 1);

  const acqMonth = calcTotalAcquisitionsMonth(state, 0, 'UYU');
  assert.equal(acqMonth.operationalSpent, 0, 'No hubo gastos de caja operativos');
  assert.equal(acqMonth.financedAcquisitions, 12000, 'Se reconocen $U 12.000 como adquisición financiada');
  assert.equal(acqMonth.totalAcquired, 12000, 'El consumo económico total adquirido es $U 12.000');
  assert.equal(acqMonth.financedItems.length, 1);
  assert.equal(acqMonth.financedItems[0].category, 'Hogar');

  const acqCategories = calcAcquisitionsByCategory(state, 0, 'UYU');
  assert.equal(acqCategories['Hogar'], 12000, 'La categoría Hogar refleja los $U 12.000 adquiridos');

  const cashMonth0 = calcCashOutflowMonth(state, 0, 'UYU');
  assert.equal(cashMonth0.operationalSpent, 0);
  assert.equal(cashMonth0.debtPayments, 0);
  assert.equal(cashMonth0.totalOutflow, 0, 'Salidas de caja en el mes de compra deben ser $U 0');

  assert.equal(state.finance.accounts[0].balance, 50000, 'El saldo de la cuenta bancaria permanece intacto');
  assert.equal(calcDebtsTotal(state, 'UYU'), 12000, 'El pasivo inicial es de $U 12.000');

  // B. Estado en el mes siguiente (offset 1) ANTES del pago:
  const acqMonthNextBefore = calcTotalAcquisitionsMonth(state, 1, 'UYU');
  assert.equal(acqMonthNextBefore.financedAcquisitions, 0, 'El mes siguiente no tiene adquisiciones');
  assert.equal(acqMonthNextBefore.totalAcquired, 0);

  // C. Pago de la cuota 1 ($U 2.000) en el mes siguiente
  const paymentTx = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 2000,
    accountId: 'acc-uyu',
    date: nextPaymentDate,
    note: 'Pago cuota 1 Heladera',
  });

  // Saldo bancario disminuye en $U 2.000
  assert.equal(state.finance.accounts[0].balance, 48000);
  // Deuda pendiente disminuye a $U 10.000
  assert.equal(calcDebtsTotal(state, 'UYU'), 10000);

  // Semántica contable del mes siguiente (offset 1):
  // - Salida real de caja: $U 2.000 (abono a deuda)
  // - Consumo adquirido: $U 0 (NO se duplica la compra del electrodoméstico)
  const debtPay1 = calcDebtPaymentsMonth(state, 1, 'UYU');
  assert.equal(debtPay1, 2000, 'calcDebtPaymentsMonth detecta los $U 2.000 de abono a cuota');

  const cashMonth1 = calcCashOutflowMonth(state, 1, 'UYU');
  assert.equal(cashMonth1.operationalSpent, 0, 'El pago de deuda no es gasto operativo de vida');
  assert.equal(cashMonth1.debtPayments, 2000, 'Registrado como salida de servicio de deuda');
  assert.equal(cashMonth1.totalOutflow, 2000, 'Salida total de dinero: $U 2.000');

  const acqMonth1 = calcTotalAcquisitionsMonth(state, 1, 'UYU');
  assert.equal(acqMonth1.totalAcquired, 0, 'El pago de la cuota no añade consumo adquirido');

  // D. Coexistencia con gasto operativo de vida en el mismo mes (offset 1):
  // Por ejemplo, compra de supermercado por $U 1.500
  addTransaction(state, {
    accountId: 'acc-uyu',
    amount: 1500,
    type: 'gasto',
    category: 'Comida',
    date: nextPaymentDate,
    fixed: 'variable',
  });

  const cashMonth1WithOp = calcCashOutflowMonth(state, 1, 'UYU');
  assert.equal(cashMonth1WithOp.operationalSpent, 1500);
  assert.equal(cashMonth1WithOp.debtPayments, 2000);
  assert.equal(cashMonth1WithOp.totalOutflow, 3500, 'Salida total de caja: $U 3.500 (1500 operativo + 2000 cuota)');

  const acqMonth1WithOp = calcTotalAcquisitionsMonth(state, 1, 'UYU');
  assert.equal(acqMonth1WithOp.operationalSpent, 1500);
  assert.equal(acqMonth1WithOp.financedAcquisitions, 0);
  assert.equal(acqMonth1WithOp.totalAcquired, 1500, 'Consumo del mes: estrictamente $U 1.500, sin duplicar los $U 2.000');

  // E. Reversión contable al eliminar el pago de la cuota
  deleteTransaction(state, paymentTx.id);
  assert.equal(state.finance.accounts[0].balance, 48500, 'Se reembolsan los $U 2.000 a la cuenta bancaria (50000 - 1500 = 48500)');
  assert.equal(calcDebtsTotal(state, 'UYU'), 12000, 'El pasivo vuelve a $U 12.000');

  // La adquisición original sigue intacta
  const acqMonth0AfterDelete = calcTotalAcquisitionsMonth(state, 0, 'UYU');
  assert.equal(acqMonth0AfterDelete.financedAcquisitions, 12000);
});

test('Finanzas 1.3C-D1 — Segregación multimoneda y acuerdos personales sin acquisition', () => {
  const state = createTestState();
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;

  // Acuerdo en USD con adquisición
  createFinancingAgreement(state, {
    title: 'MacBook Pro M-Chip',
    creditorName: 'Apple Store',
    currency: 'USD',
    initialRemainingBalance: 1500,
    initialReferenceDate: todayIso,
    originalPrincipal: 1500,
    schedule: {
      totalInstallments: 3,
      installmentAmount: 500,
      firstDueDate: todayIso,
      dueDay: 5,
      frequency: 'monthly',
    },
    acquisition: {
      acquisitionDate: todayIso,
      category: 'Tecnología',
      totalPurchaseAmount: 1500,
    },
  });

  // Acuerdo flexible personal en UYU SIN acquisition
  createFinancingAgreement(state, {
    title: 'Préstamo entre amigos',
    creditorName: 'Martín',
    currency: 'UYU',
    initialRemainingBalance: 10000,
    initialReferenceDate: todayIso,
    acquisition: null,
  });

  // A. Vista UYU en el mes actual
  const uyuAcq = calcTotalAcquisitionsMonth(state, 0, 'UYU');
  assert.equal(uyuAcq.financedAcquisitions, 0, 'El acuerdo personal sin acquisition no aporta consumo en UYU');
  assert.equal(uyuAcq.totalAcquired, 0);

  // B. Vista USD en el mes actual
  const usdAcq = calcTotalAcquisitionsMonth(state, 0, 'USD');
  assert.equal(usdAcq.financedAcquisitions, 1500, 'Reconoce exactamente US$ 1.500 en USD');
  assert.equal(usdAcq.totalAcquired, 1500);
  assert.equal(usdAcq.financedItems[0].category, 'Tecnología');

  const usdCats = calcAcquisitionsByCategory(state, 0, 'USD');
  assert.equal(usdCats['Tecnología'], 1500);
  assert.equal(usdCats['Hogar'] || 0, 0);
});

test('Finanzas 1.3C microfix — Edición segura de categoría y fecha de adquisición sin alterar importes ni cronogramas', () => {
  const state = createTestState();
  const now = new Date();
  const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const prevMonthIso = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-15`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 10);
  const nextMonthIso = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-10`;

  // 1. Alta con categoría "Hogar" en el mes actual
  const agreement = createFinancingAgreement(state, {
    title: 'Heladera James Inverter',
    creditorName: 'Barraca Europa',
    currency: 'UYU',
    initialRemainingBalance: 12000,
    initialReferenceDate: currentMonthIso,
    originalPrincipal: 12000,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 2000,
      firstDueDate: nextMonthIso,
      dueDay: 10,
      frequency: 'monthly',
    },
    acquisition: {
      acquisitionDate: currentMonthIso,
      category: 'Hogar',
      totalPurchaseAmount: 12000,
    },
  });

  // Estado analítico inicial: 12.000 en Hogar en el mes actual
  let acqCats = calcAcquisitionsByCategory(state, 0, 'UYU');
  assert.equal(acqCats['Hogar'], 12000);
  assert.equal(acqCats['Tecnología'] || 0, 0);

  // 2. Se paga una cuota ($U 2.000) en el mes siguiente
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 2000,
    accountId: 'acc-uyu',
    date: nextMonthIso,
    note: 'Pago cuota 1',
  });
  assert.equal(state.finance.accounts[0].balance, 48000);
  assert.equal(calcDebtsTotal(state, 'UYU'), 10000);

  // 3. Edición segura: corregir categoría a "Tecnología" sin alterar importes
  updateFinancingAgreement(state, agreement.id, {
    acquisition: {
      acquisitionDate: currentMonthIso,
      category: 'Tecnología',
      totalPurchaseAmount: agreement.acquisition!.totalPurchaseAmount,
    },
  });

  // Verificaciones de no alteración financiera:
  assert.equal(agreement.acquisition?.category, 'Tecnología');
  assert.equal(agreement.acquisition?.totalPurchaseAmount, 12000, 'El importe financiado no cambia');
  assert.equal(agreement.schedule?.totalInstallments, 6, 'El cronograma no se altera');
  assert.equal(agreement.schedule?.installmentAmount, 2000);
  assert.equal(state.finance.accounts[0].balance, 48000, 'El saldo bancario no se altera');
  assert.equal(calcDebtsTotal(state, 'UYU'), 10000, 'La deuda pendiente sigue siendo exactamente $U 10.000');
  assert.equal(state.finance.transactions.length, 1, 'No se crean ni duplican transacciones en el ledger');

  // En Analítica, la categoría cambia inmediatamente de Hogar a Tecnología
  acqCats = calcAcquisitionsByCategory(state, 0, 'UYU');
  assert.equal(acqCats['Tecnología'], 12000);
  assert.equal(acqCats['Hogar'] || 0, 0);

  // 4. Edición segura: mover fecha de adquisición al mes anterior (prevMonthIso)
  updateFinancingAgreement(state, agreement.id, {
    acquisition: {
      acquisitionDate: prevMonthIso,
      category: 'Tecnología',
      totalPurchaseAmount: agreement.acquisition!.totalPurchaseAmount,
    },
  });

  // En el mes actual (offset 0), ya no figura el consumo
  const curMonthAcq = calcTotalAcquisitionsMonth(state, 0, 'UYU');
  assert.equal(curMonthAcq.financedAcquisitions, 0, 'El mes actual ya no tiene el consumo adquirido');
  assert.equal(curMonthAcq.financedItems.length, 0);

  // En el mes anterior (offset -1), figura el consumo de $U 12.000
  const prevMonthAcq = calcTotalAcquisitionsMonth(state, -1, 'UYU');
  assert.equal(prevMonthAcq.financedAcquisitions, 12000, 'El consumo se movió correctamente al mes anterior');
  assert.equal(prevMonthAcq.financedItems[0].category, 'Tecnología');

  // Ausencia de duplicación analítica:
  assert.equal(prevMonthAcq.totalAcquired, 12000);
  assert.equal(prevMonthAcq.operationalSpent, 0);

  // 5. Persistencia y sincronización tras la edición
  const serialized = JSON.stringify(state);
  const reloaded = normalizeStoredState(JSON.parse(serialized));
  const reloadedAgr = reloaded.finance.agreements.find((a) => a.id === agreement.id)!;
  assert.equal(reloadedAgr.acquisition?.category, 'Tecnología');
  assert.equal(reloadedAgr.acquisition?.acquisitionDate, prevMonthIso);

  // 3-way merge conserva la edición
  const base = structuredClone(reloaded);
  const local = structuredClone(reloaded);
  const remote = structuredClone(reloaded);
  local.finance.agreements[0].acquisition!.category = 'Electrodomésticos';
  const merged = mergeFinanceModule(local.finance, remote.finance, base.finance);
  assert.equal(merged.agreements[0].acquisition?.category, 'Electrodomésticos');

  // 6. Compatibilidad con acuerdo sin acquisition:
  const flexAgr = createFinancingAgreement(state, {
    title: 'Deuda sin adquisición',
    creditorName: 'Amigo',
    currency: 'UYU',
    initialRemainingBalance: 5000,
    initialReferenceDate: currentMonthIso,
    acquisition: null,
  });
  updateFinancingAgreement(state, flexAgr.id, { notes: 'Nueva nota' });
  assert.equal(flexAgr.acquisition, null, 'Acuerdo flexible preserva acquisition: null');
});


