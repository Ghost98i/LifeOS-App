import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, localISODate, monthLabel } from './storage';
import {
  calcAcquisitionsByCategory, calcCashOutflowMonth, calcDebtPaymentsMonth,
  calcFinancedAcquisitionsMonth, calcIncomeMonth, calcMonthComparison,
  calcSpentMonth, calcTotalAcquisitionsMonth, cashFlowProjection,
  streamSessionsInMonth, txInMonth,
} from './calculations';
import { addTransaction } from './financeFlows';
import { addAgreementPayment, createFinancingAgreement, deriveAgreementSchedule } from './financeAgreements';
import { deriveCashflowProjection, getCommittedEventsForWindow } from './financeCashflow';
import { advanceCommitmentDueDate, advanceExpectedIncomeDate } from './financialCommitments';

const referenceDays = [1, 28, 29, 30, 31];
const offsets = [-13, -2, -1, 0, 1, 2, 13];
const timezones = ['UTC', 'America/Montevideo', 'America/New_York', 'Europe/Berlin', 'Pacific/Kiritimati', 'Asia/Kathmandu'];

for (const timezone of timezones) {
  test(`meses calendario desde días 1/28/29/30/31, sin desbordamiento ni dependencia horaria: ${timezone}`, (context) => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = timezone;
    context.mock.timers.enable({ apis: ['Date'], now: 0 });
    try {
      // Every valid requested day in every month covers leap/non-leap February,
      // both year boundaries and DST changes. Expected months use integer arithmetic.
      for (const year of [2024, 2025, 2026]) {
        for (let month = 0; month < 12; month++) {
          const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
          for (const day of referenceDays.filter((value) => value <= daysInMonth)) {
            for (const hour of [0, 12, 23]) {
              const reference = new Date(year, month, day, hour, 45, 30, 999);
              context.mock.timers.setTime(reference.getTime());
              for (const offset of offsets) {
                const expectedIndex = year * 12 + month + offset;
                const actual = monthLabel(offset);
                assert.deepEqual([actual.getFullYear(), actual.getMonth()],
                  [Math.floor(expectedIndex / 12), ((expectedIndex % 12) + 12) % 12],
                  `${timezone}: ${localISODate(reference)} ${hour}:45, offset ${offset}`);
                assert.equal(new Date().getTime(), reference.getTime(), 'La consulta no modifica el reloj');
              }
            }
          }
        }
      }
    } finally {
      context.mock.timers.reset();
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
}

test('monthLabel devuelve un identificador de mes al mediodía del día 1, no desplaza un vencimiento', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 23, 59).getTime() });
  context.after(() => context.mock.timers.reset());
  for (const [offset, expected] of [[-1, '2026-09-01'], [0, '2026-10-01'], [1, '2026-11-01']] as const) {
    const result = monthLabel(offset);
    assert.equal(localISODate(result), expected);
    assert.deepEqual([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()], [12, 0, 0, 0]);
  }
});

function financialState() {
  const state = defaultState();
  state.finance.accounts = [{ id: 'bank', name: 'Cuenta sintética', currency: 'UYU', balance: 50000, initialBalance: 50000 }];
  return state;
}

for (const day of referenceDays) {
  test(`analítica financiera desde el ${day}/10: pagos y adquisiciones en su mes, sin duplicación`, (context) => {
    context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, day, 23, 30).getTime() });
    context.after(() => context.mock.timers.reset());
    const state = financialState();
    const agreement = createFinancingAgreement(state, {
      title: 'Adquisición sintética', creditorName: 'Comercio de prueba', currency: 'UYU',
      initialRemainingBalance: 12000, initialReferenceDate: '2026-09-15', originalPrincipal: 12000,
      schedule: { totalInstallments: 6, installmentAmount: 2000, firstDueDate: '2026-11-10', dueDay: 10, frequency: 'monthly' },
      acquisition: { acquisitionDate: '2026-09-15', category: 'Hogar', totalPurchaseAmount: 12000 },
    });
    const payment = addAgreementPayment(state, { agreementId: agreement.id, amount: 2000, accountId: 'bank', date: '2026-11-10' });
    for (const [date, amount] of [['2026-09-15', 125], ['2026-10-05', 300], ['2026-11-10', 450]] as const) {
      addTransaction(state, { accountId: 'bank', type: 'gasto', amount, category: 'Comida', fixed: 'variable', date });
    }
    addTransaction(state, { accountId: 'bank', type: 'ingreso', amount: 1000, category: 'Ingreso', fixed: 'variable', date: '2026-11-10' });
    const before = JSON.stringify(state);
    assert.deepEqual([-1, 0, 1].map((offset) => calcSpentMonth(state, offset, 'UYU')), [125, 300, 450]);
    assert.deepEqual([-1, 0, 1].map((offset) => calcDebtPaymentsMonth(state, offset, 'UYU')), [0, 0, 2000]);
    assert.deepEqual([-1, 0, 1].map((offset) => calcFinancedAcquisitionsMonth(state, offset, 'UYU').total), [12000, 0, 0]);
    assert.deepEqual([-1, 0, 1].map((offset) => calcTotalAcquisitionsMonth(state, offset, 'UYU').totalAcquired), [12125, 300, 450]);
    assert.deepEqual(calcCashOutflowMonth(state, 1, 'UYU'), { operationalSpent: 450, debtPayments: 2000, totalOutflow: 2450 });
    assert.equal(calcIncomeMonth(state, 1, 'UYU'), 1000);
    assert.deepEqual(calcAcquisitionsByCategory(state, -1, 'UYU'), { Comida: 125, Hogar: 12000 });
    assert.deepEqual(calcMonthComparison(state, 'UYU'), { pct: 140, dir: 'up' });
    const selectedIds = [-1, 0, 1].flatMap((offset) => txInMonth(state, offset).map((transaction) => transaction.id));
    assert.equal(new Set(selectedIds).size, state.finance.transactions.length);
    assert.equal(selectedIds.length, state.finance.transactions.length);
    assert.ok(txInMonth(state, 1).some((transaction) => transaction.id === payment.id));
    assert.equal(JSON.stringify(state), before, 'La agrupación no escribe importes, IDs, estados o fechas');
  });
}

const schedules = [
  ['2024-01-31', '2024-02-29', '2024-03-31'],
  ['2025-01-31', '2025-02-28', '2025-03-31'],
  ['2026-01-31', '2026-02-28', '2026-03-31'],
  ['2026-10-31', '2026-11-30', '2026-12-31'],
  ['2026-12-31', '2027-01-31', '2027-02-28'],
];

for (const dates of schedules) {
  test(`fechas reales y proyecciones conservan el ancla 31 y separan pagos realizados: ${dates[0]}`, (context) => {
    const [year, month, day] = dates[0].split('-').map(Number);
    context.mock.timers.enable({ apis: ['Date'], now: new Date(year, month - 1, day, 12).getTime() });
    context.after(() => context.mock.timers.reset());
    const state = financialState();
    const agreement = createFinancingAgreement(state, {
      title: 'Acuerdo sintético', creditorName: 'Comercio de prueba', currency: 'UYU',
      initialRemainingBalance: 6000, initialReferenceDate: `${dates[0].slice(0, 7)}-01`, originalPrincipal: 6000,
      schedule: { totalInstallments: 3, installmentAmount: 2000, firstDueDate: dates[0], dueDay: 31, frequency: 'monthly' },
    });
    const originalSchedule = JSON.stringify(agreement.schedule);
    assert.deepEqual(deriveAgreementSchedule(agreement, state.finance.transactions, dates[0])!.installments.map((item) => item.dueDate), dates);
    assert.equal(getCommittedEventsForWindow(state, 'month', dates[0]).length, 1);
    assert.equal(calcDebtPaymentsMonth(state, 0, 'UYU'), 0, 'Una obligación no es un movimiento realizado');
    assert.equal(state.finance.accounts[0].balance, 50000);

    addAgreementPayment(state, { agreementId: agreement.id, accountId: 'bank', amount: 2000, date: dates[0] });
    const beforeQueries = JSON.stringify(state);
    const breakdown = deriveAgreementSchedule(agreement, state.finance.transactions, dates[0])!;
    assert.deepEqual(breakdown.installments.map((item) => item.dueDate), dates);
    assert.equal(breakdown.installments[0].status, 'paid');
    assert.equal(breakdown.remainingBalance, 4000);
    assert.equal(breakdown.nextDueInstallment?.dueDate, dates[1]);
    assert.equal(calcDebtPaymentsMonth(state, 0, 'UYU'), 2000);
    assert.equal(calcDebtPaymentsMonth(state, 1, 'UYU'), 0);
    assert.equal(calcTotalAcquisitionsMonth(state, 0, 'UYU').totalAcquired, 0);

    const projection = deriveCashflowProjection(state, 'month', dates[1]);
    assert.deepEqual(projection.events.map((event) => event.date), [dates[1]]);
    assert.equal(projection.summariesByCurrency.UYU.committedExpenses, 2000);
    const legacyProjection = cashFlowProjection(state, 60, dates[1], 'UYU');
    assert.deepEqual(legacyProjection.forecastItems.map((item) => item.date), dates.slice(1));
    assert.equal(legacyProjection.committed, 4000);
    assert.equal(new Set(legacyProjection.forecastItems.map((item) => item.id)).size, 2);
    assert.equal(JSON.stringify(agreement.schedule), originalSchedule);
    assert.equal(JSON.stringify(state), beforeQueries);
    assert.equal(state.finance.transactions.length, 1);
    assert.equal(state.finance.accounts[0].balance, 48000);

    const commitment = { id: 'commitment', name: 'Cuota sintética', amount: 2000, active: true, frequency: 'monthly' as const,
      nextDueDate: dates[0], dueDay: 31, remainingOccurrences: 3, totalInstallments: 3, currentInstallment: 1 };
    const next = advanceCommitmentDueDate(commitment);
    assert.equal(next.nextDueDate, dates[1]);
    assert.equal(next.remainingOccurrences, 2);
    assert.equal(advanceCommitmentDueDate({ ...commitment, ...next }).nextDueDate, dates[2]);
    assert.equal(advanceExpectedIncomeDate({ id: 'income', name: 'Ingreso sintético', amount: 1000, startDate: dates[0], frequency: 'monthly', active: true }).startDate, dates[1]);
  });
}

test('el otro consumidor compartido agrupa sesiones por mes local, incluso cerca de medianoche', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 23, 59).getTime() });
  context.after(() => context.mock.timers.reset());
  const state = defaultState();
  state.streaming.sessions = ['2026-09-30', '2026-10-31', '2026-11-01'].map((date) => ({ id: date, date, hours: 1 }));
  assert.deepEqual([-1, 0, 1].map((offset) => streamSessionsInMonth(state, offset).map((item) => item.id)),
    [['2026-09-30'], ['2026-10-31'], ['2026-11-01']]);
});
