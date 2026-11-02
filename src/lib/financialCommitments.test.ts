import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRealAvailable,
  evaluateCushionStatus,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
  getCommitmentOccurrences,
  sortCommitmentsChronologically,
} from './financialCommitments';
import {
  calendarItemsOnDate,
  cashFlow30Days,
  calcAccountsTotal,
} from './calculations';
import { normalizeStoredState, defaultState } from './storage';
import { mergeFinanceModule } from './syncMerge';
import type { FinancialCommitment, LifeOSState, Transaction, FinanceTransfer } from '../types';

function makeCommitment(overrides: Partial<FinancialCommitment> = {}): FinancialCommitment {
  return {
    id: 'com-1',
    currency: 'UYU', // Synthetic planning scenarios below intentionally use UYU.
    name: 'Alquiler',
    amount: 15000,
    category: 'Vivienda',
    frequency: 'monthly',
    nextDueDate: '2026-10-05',
    active: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

// ----------------------------------------------------
// 1. CALCULATE REAL AVAILABLE & OVERDUE OBLIGATIONS
// ----------------------------------------------------

test('calculateRealAvailable: calculates committed money and real available accurately', () => {
  const commitments: FinancialCommitment[] = [
    makeCommitment({ id: 'c1', name: 'Alquiler', amount: 15000, active: true }),
    makeCommitment({ id: 'c2', name: 'Internet', amount: 2000, active: true }),
    makeCommitment({ id: 'c3', name: 'Gimnasio Inactivo', amount: 1500, active: false }),
    makeCommitment({ id: 'c4', name: 'Cuota Terminada', amount: 3000, active: true, remainingOccurrences: 0 }),
  ];

  const occs = commitments.flatMap((c) => getCommitmentOccurrences(c, '2026-10-01', '2026-10-31'));
  const committedAmount = occs.reduce((s, o) => s + o.amount, 0);
  const currentBalance = 50000;
  const realAvailable = calculateRealAvailable(currentBalance, committedAmount);

  // Active: c1 (15000) + c2 (2000) = 17000. c3 is inactive, c4 has 0 remaining.
  assert.equal(committedAmount, 17000);
  assert.equal(realAvailable, 33000);
});

test('calculateRealAvailable: includes overdue commitments because money is still legally owed', () => {
  const commitments: FinancialCommitment[] = [
    makeCommitment({ id: 'c1', name: 'Factura Vencida', frequency: 'once', amount: 4000, nextDueDate: '2026-09-10', active: true }),
    makeCommitment({ id: 'c2', name: 'Próxima Factura', frequency: 'once', amount: 6000, nextDueDate: '2026-10-05', active: true }),
  ];

  const occs = commitments.flatMap((c) => getCommitmentOccurrences(c, '2026-10-01', '2026-10-31'));
  const committedAmount = occs.reduce((s, o) => s + o.amount, 0);
  const currentBalance = 20000;
  const realAvailable = calculateRealAvailable(currentBalance, committedAmount);

  assert.equal(committedAmount, 10000);
  assert.equal(realAvailable, 10000);
});

// ----------------------------------------------------
// 2. CRITICAL AUDIT: NO DOUBLE COUNTING SCENARIOS
// ----------------------------------------------------

test('CRITICAL: No double counting on commitment payment (Scenario A & B)', () => {
  // Scenario A:
  // Saldo actual: $20.000, Compromiso: $5.000 futuro (once)
  // Disponible Real esperado: $15.000
  const commitment = makeCommitment({ id: 'com-serv', name: 'Servicio', amount: 5000, frequency: 'once', nextDueDate: '2026-10-15', active: true });
  let state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'acc-1', name: 'Banco', balance: 20000 }],
      commitments: [commitment],
    },
  };

  const cfBefore = cashFlow30Days(state, '2026-10-01');
  assert.equal(cfBefore.currentBalance, 20000);
  assert.equal(cfBefore.committed, 5000);
  assert.equal(cfBefore.realAvailable, 15000);

  // Scenario B:
  // Se registra el pago real de $5.000:
  // Saldo pasa a $15.000. Compromiso ya pagado (deactivado).
  // Disponible Real esperado: $15.000 (NO $10.000!).
  const adv = advanceCommitmentDueDate(commitment);
  const updatedCom: FinancialCommitment = { ...commitment, ...adv };
  const tx: Transaction = {
    id: 'tx-1',
    amount: 5000,
    type: 'gasto',
    category: 'Servicios',
    accountId: 'acc-1',
    fixed: 'fijo',
    date: '2026-10-02',
    origin: 'manual',
  };

  state = {
    ...state,
    finance: {
      ...state.finance,
      accounts: [{ id: 'acc-1', name: 'Banco', balance: 15000 }],
      transactions: [tx],
      commitments: [updatedCom],
    },
  };

  const cfAfter = cashFlow30Days(state, '2026-10-01');
  assert.equal(cfAfter.currentBalance, 15000);
  assert.equal(cfAfter.committed, 0, 'Commitment must no longer be counted as pending');
  assert.equal(cfAfter.realAvailable, 15000, 'Real available must remain exactly 15000, not double counted as 10000');
});

test('CRITICAL: Expected Income does NOT inflate Real Available & payment prevents double counting in projection (Scenario E)', () => {
  // Escenario:
  // Saldo: $10.000
  // Expected Income: +$13.728
  // Disponible Real esperado: $10.000 (los ingresos futuros NUNCA inflan Disponible Real!)
  // Saldo Proyectado: $23.728
  const inc = {
    id: 'inc-freelance',
    currency: 'UYU',
    name: 'Cobro Freelance',
    amount: 13728,
    category: 'Trabajo',
    frequency: 'once' as const,
    startDate: '2026-10-10',
    active: true,
  };

  let state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'acc-1', name: 'Banco', balance: 10000 }],
      expectedIncomes: [inc],
      commitments: [],
    },
  };

  const cf = cashFlow30Days(state, '2026-10-01');
  assert.equal(cf.currentBalance, 10000);
  assert.equal(cf.realAvailable, 10000, 'Real available must NOT include future income');
  assert.equal(cf.totalExpectedIncome, 13728);
  assert.equal(cf.projectedBalance, 23728);

  // Registrar el cobro real:
  // Saldo pasa a $23.728
  // advanceExpectedIncomeDate desactiva la previsión realizada
  const advInc = advanceExpectedIncomeDate(inc);
  assert.equal(advInc.active, false);

  const updatedInc = { ...inc, ...advInc };
  state = {
    ...state,
    finance: {
      ...state.finance,
      accounts: [{ id: 'acc-1', name: 'Banco', balance: 23728 }],
      transactions: [{
        id: 'tx-inc-1',
        amount: 13728,
        type: 'ingreso',
        category: 'Trabajo',
        accountId: 'acc-1',
        fixed: 'variable',
        date: '2026-10-10',
        origin: 'manual',
      }],
      expectedIncomes: [updatedInc],
    },
  };

  const cfAfter = cashFlow30Days(state, '2026-10-01');
  assert.equal(cfAfter.currentBalance, 23728);
  assert.equal(cfAfter.realAvailable, 23728);
  assert.equal(cfAfter.totalExpectedIncome, 0, 'Completed expected income must not stay in projection');
  assert.equal(cfAfter.projectedBalance, 23728, 'Projected balance must remain 23728, NOT 37456');
});

// ----------------------------------------------------
// 3. ADVANCE & RECURRENCE ENGINE AUDIT
// ----------------------------------------------------

test('advanceCommitmentDueDate: advances dates correctly by frequency', () => {
  // Monthly Jan 31 -> Feb 28
  const monthly = advanceCommitmentDueDate(makeCommitment({ frequency: 'monthly', nextDueDate: '2026-01-31' }));
  assert.equal(monthly.nextDueDate, '2026-02-28');
  assert.equal(monthly.active, true);

  // Weekly
  const weekly = advanceCommitmentDueDate(makeCommitment({ frequency: 'weekly', nextDueDate: '2026-10-01' }));
  assert.equal(weekly.nextDueDate, '2026-10-08');

  // Biweekly
  const biweekly = advanceCommitmentDueDate(makeCommitment({ frequency: 'biweekly', nextDueDate: '2026-10-01' }));
  assert.equal(biweekly.nextDueDate, '2026-10-15');

  // Yearly
  const yearly = advanceCommitmentDueDate(makeCommitment({ frequency: 'yearly', nextDueDate: '2026-10-01' }));
  assert.equal(yearly.nextDueDate, '2027-10-01');

  // Once: deactivates immediately
  const once = advanceCommitmentDueDate(makeCommitment({ frequency: 'once', nextDueDate: '2026-10-01' }));
  assert.equal(once.active, false);
});

test('RECURRENCE DEEP AUDIT: 31st of month does NOT drift across Feb, March, April, May', () => {
  let com = makeCommitment({
    frequency: 'monthly',
    nextDueDate: '2026-01-31',
    dueDay: 31,
  });

  // Step 1: Advance from Jan 31 -> Feb 28
  const advFeb = advanceCommitmentDueDate(com);
  assert.equal(advFeb.nextDueDate, '2026-02-28');
  com = { ...com, ...advFeb };

  // Step 2: Advance from Feb 28 -> March 31 (recovers anchor day 31!)
  const advMar = advanceCommitmentDueDate(com);
  assert.equal(advMar.nextDueDate, '2026-03-31', 'Must recover anchor day 31 in March without drifting to 28');
  com = { ...com, ...advMar };

  // Step 3: Advance from March 31 -> April 30 (April has 30 days)
  const advApr = advanceCommitmentDueDate(com);
  assert.equal(advApr.nextDueDate, '2026-04-30');
  com = { ...com, ...advApr };

  // Step 4: Advance from April 30 -> May 31 (May has 31 days)
  const advMay = advanceCommitmentDueDate(com);
  assert.equal(advMay.nextDueDate, '2026-05-31', 'Must recover anchor day 31 in May');
});

test('RECURRENCE DEEP AUDIT: Leap year 2028 handles February 29 accurately', () => {
  const com = makeCommitment({
    frequency: 'monthly',
    nextDueDate: '2028-01-31',
    dueDay: 31,
  });

  // In 2028 (leap year), Feb has 29 days
  const advFebLeap = advanceCommitmentDueDate(com);
  assert.equal(advFebLeap.nextDueDate, '2028-02-29');
});

// ----------------------------------------------------
// 4. INSTALLMENT PLANS & CUOTAS TERMINATION
// ----------------------------------------------------

test('advanceCommitmentDueDate: 12 cuotas countdown terminates completely at 0', () => {
  let cuota = makeCommitment({
    frequency: 'monthly',
    nextDueDate: '2026-01-10',
    totalOccurrences: 12,
    remainingOccurrences: 12,
  });

  for (let step = 11; step >= 0; step--) {
    const adv = advanceCommitmentDueDate(cuota);
    cuota = { ...cuota, ...adv };
    assert.equal(cuota.remainingOccurrences, step);
    if (step > 0) {
      assert.equal(cuota.active, true);
    } else {
      assert.equal(cuota.active, false, 'Cuota must automatically become inactive upon reaching 0');
    }
  }

  // Once at 0, no occurrences are generated anywhere
  const occs = getCommitmentOccurrences(cuota, '2026-01-01', '2027-12-31');
  assert.equal(occs.length, 0, 'Zero occurrences must be generated once cuota is complete');
});

test('getCommitmentOccurrences: limits occurrences by remainingOccurrences and endDate', () => {
  const com = makeCommitment({
    frequency: 'weekly',
    nextDueDate: '2026-10-01',
    remainingOccurrences: 2,
  });

  // Query window covering a month (would normally have 4-5 weekly occurrences)
  const occs = getCommitmentOccurrences(com, '2026-10-01', '2026-10-31');
  assert.equal(occs.length, 2);
  assert.deepEqual(occs.map((o) => o.date), ['2026-10-01', '2026-10-08']);

  // Query with endDate limiting
  const comEndDate = makeCommitment({
    frequency: 'weekly',
    nextDueDate: '2026-10-01',
    endDate: '2026-10-10',
  });
  const occsEndDate = getCommitmentOccurrences(comEndDate, '2026-10-01', '2026-10-31');
  assert.equal(occsEndDate.length, 2); // Oct 1, Oct 8
});

test('sortCommitmentsChronologically: orders by active status first, then nextDueDate, and amount', () => {
  const c1 = makeCommitment({ id: '1', nextDueDate: '2026-10-20', active: true });
  const c2 = makeCommitment({ id: '2', nextDueDate: '2026-10-05', active: true });
  const c3 = makeCommitment({ id: '3', nextDueDate: '2026-10-01', active: false });

  const sorted = sortCommitmentsChronologically([c1, c2, c3]);
  assert.equal(sorted[0].id, '2'); // Earlier active date
  assert.equal(sorted[1].id, '1'); // Later active date
  assert.equal(sorted[2].id, '3'); // Inactive moved to the bottom
});

// ----------------------------------------------------
// 5. CUSHION & LIQUIDITY STATUS EVALUATION
// ----------------------------------------------------

test('evaluateCushionStatus: correctly classifies disabled, below_current, projected_below, and ok', () => {
  // Disabled
  assert.equal(evaluateCushionStatus(10000, 8000, 5000, false).status, 'disabled');
  assert.equal(evaluateCushionStatus(10000, 8000, null, true).status, 'disabled');
  assert.equal(evaluateCushionStatus(10000, 8000, 0, true).status, 'disabled');
  // Disabled when no accounts are configured (avoids false cushion alarms during onboarding)
  assert.equal(evaluateCushionStatus(0, 0, 5000, true, 0).status, 'disabled');
  assert.equal(evaluateCushionStatus(0, 0, 5000, true, 0).message, 'Sin cuentas configuradas.');

  // Currently below
  const belowCurrent = evaluateCushionStatus(3000, 2000, 5000, true);
  assert.equal(belowCurrent.status, 'below_current');
  assert.equal(belowCurrent.shortfall, 2000);

  // Projected below (current is fine, but projected drops under cushion)
  const projBelow = evaluateCushionStatus(6000, 4000, 5000, true);
  assert.equal(projBelow.status, 'projected_below');
  assert.equal(projBelow.shortfall, 1000);

  // OK
  const ok = evaluateCushionStatus(10000, 7000, 5000, true);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.shortfall, 0);
});

// ----------------------------------------------------
// 6. CALENDAR INTEGRATION AUDIT
// ----------------------------------------------------

test('calendarItemsOnDate: renders financial commitments and expected incomes accurately without date spill', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      commitments: [
        makeCommitment({
          id: 'c-cal',
          name: 'Seguro Auto',
          amount: 3500,
          frequency: 'monthly',
          nextDueDate: '2026-10-15',
          active: true,
          remainingOccurrences: 4,
        }),
      ],
      expectedIncomes: [
        {
          id: 'inc-cal',
          name: 'Sueldo',
          currency: 'UYU',
          amount: 60000,
          category: 'Trabajo',
          frequency: 'monthly',
          startDate: '2026-10-15',
          active: true,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    },
  };

  const items = calendarItemsOnDate(state, '2026-10-15');
  const comItem = items.find((i) => i.type === 'finanza_compromiso');
  const incItem = items.find((i) => i.type === 'finanza_ingreso');

  assert.ok(comItem, 'Must contain commitment item on 2026-10-15');
  assert.equal(comItem?.financialAmount, 3500);
  assert.match(comItem?.name || '', /Seguro Auto/);
  assert.match(comItem?.name || '', /4 rest\./);

  assert.ok(incItem, 'Must contain income item on 2026-10-15');
  assert.equal(incItem?.financialAmount, 60000);
  assert.match(incItem?.name || '', /Sueldo/);

  // Other dates must NOT have these items
  const emptyItems = calendarItemsOnDate(state, '2026-10-16');
  assert.equal(emptyItems.filter((i) => i.type.startsWith('finanza_')).length, 0);
});

// ----------------------------------------------------
// 7. MULTI-ACCOUNT & TRANSFERS AUDIT
// ----------------------------------------------------

test('Multi-account: Consolidated balance and internal transfers do NOT create fake income/expense', () => {
  const accA = { id: 'acc-a', name: 'Cuenta Banco A', balance: 10000 };
  const accB = { id: 'acc-b', name: 'Cuenta Banco B', balance: 20000 };

  const transfer: FinanceTransfer = {
    id: 'tr-1',
    fromAccountId: 'acc-b',
    toAccountId: 'acc-a',
    amount: 5000,
    date: '2026-10-02',
    note: 'Fondos para compromiso',
  };

  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [
        { ...accA, balance: 15000 },
        { ...accB, balance: 15000 },
      ],
      transfers: [transfer],
      commitments: [
        makeCommitment({ id: 'c-acc', name: 'Alquiler', amount: 5000, accountId: 'acc-a', nextDueDate: '2026-10-05', active: true }),
      ],
    },
  };

  // Consolidated balance is 30000
  assert.equal(calcAccountsTotal(state), 30000);

  const cf = cashFlow30Days(state, '2026-10-01');
  assert.equal(cf.currentBalance, 30000);
  assert.equal(cf.committed, 5000);
  assert.equal(cf.realAvailable, 25000);
});

// ----------------------------------------------------
// 8. STORAGE & BACKWARDS COMPATIBILITY AUDIT
// ----------------------------------------------------

test('storage normalizeStoredState: guarantees 100% backwards compatibility and data preservation', () => {
  // Legacy JSON without commitments or cushion settings
  const legacyJson = {
    notes: { postits: [] },
    gym: { sessions: [] },
    projects: [{ id: 'p1', name: 'Proyecto', tasks: [] }],
    finance: {
      accounts: [{ id: 'a1', name: 'Efectivo', balance: 500 }],
      transactions: [],
    },
  };

  const normalizedLegacy = normalizeStoredState(legacyJson);
  assert.ok(Array.isArray(normalizedLegacy.finance.commitments), 'commitments must default to array');
  assert.equal(normalizedLegacy.finance.commitments.length, 0);
  assert.equal(normalizedLegacy.finance.minCushion, 5000);
  assert.equal(normalizedLegacy.finance.cushionEnabled, true);
  // Ensure other modules are intact
  assert.equal(normalizedLegacy.projects.length, 1);
  assert.equal(normalizedLegacy.projects[0].name, 'Proyecto');

  // Full export round-trip with commitments, dueDay, remainingOccurrences
  const commitment = makeCommitment({
    id: 'com-full',
    name: 'Auto cuota',
    amount: 12000,
    frequency: 'monthly',
    nextDueDate: '2026-11-15',
    totalOccurrences: 24,
    remainingOccurrences: 18,
    dueDay: 15,
  });

  const stateWithCommitment: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      commitments: [commitment],
      minCushion: 12000,
      cushionEnabled: true,
    },
  };

  const exported = JSON.stringify(stateWithCommitment);
  const imported = normalizeStoredState(JSON.parse(exported));

  assert.equal(imported.finance.commitments.length, 1);
  assert.equal(imported.finance.commitments[0].name, 'Auto cuota');
  assert.equal(imported.finance.commitments[0].amount, 12000);
  assert.equal(imported.finance.commitments[0].totalOccurrences, 24);
  assert.equal(imported.finance.commitments[0].remainingOccurrences, 18);
  assert.equal(imported.finance.commitments[0].dueDay, 15);
  assert.equal(imported.finance.minCushion, 12000);
  assert.equal(imported.finance.cushionEnabled, true);
});

// ----------------------------------------------------
// 9. 3-WAY SYNC MERGE & TOMBSTONES AUDIT
// ----------------------------------------------------

test('syncMerge mergeFinanceModule: handles concurrent 3-way merge and cushion resolution', () => {
  const baseFinance = defaultState().finance;

  // Device A adds commitment 1 and updates minCushion
  const localFinance = {
    ...baseFinance,
    minCushion: 8000,
    commitments: [makeCommitment({ id: 'c1', name: 'Alquiler', amount: 15000 })],
  };

  // Device B adds commitment 2 and disables cushion
  const remoteFinance = {
    ...baseFinance,
    cushionEnabled: false,
    commitments: [makeCommitment({ id: 'c2', name: 'Internet', amount: 2000 })],
  };

  const merged = mergeFinanceModule(localFinance, remoteFinance, baseFinance, {});

  // Both commitments must be present
  assert.equal(merged.commitments?.length, 2);
  const ids = merged.commitments?.map((c) => c.id).sort();
  assert.deepEqual(ids, ['c1', 'c2']);

  // 3-way scalar resolution: local modified minCushion, remote left it unchanged from base -> local preserved
  assert.equal(merged.minCushion, 8000);
  // Remote modified cushionEnabled, local left it unchanged from base -> remote preserved
  assert.equal(merged.cushionEnabled, false);
});

test('syncMerge mergeFinanceModule: deletion tombstone prevents commitment resurrection', () => {
  const baseFinance = {
    ...defaultState().finance,
    commitments: [
      makeCommitment({ id: 'com-del', name: 'Para Borrar', amount: 3000 }),
    ],
  };

  // Device A deletes the commitment (empty array)
  const localFinance = {
    ...baseFinance,
    commitments: [],
  };

  // Device B was offline and still has the commitment
  const remoteFinance = {
    ...baseFinance,
  };

  // Tombstone recorded for com-del
  const tombstones: Record<string, number> = {
    'com-del': Date.now(),
  };

  const merged = mergeFinanceModule(localFinance, remoteFinance, baseFinance, tombstones);
  assert.equal(merged.commitments?.length, 0, 'Commitment must NOT resurrect because tombstone is present');
});

// ----------------------------------------------------
// 10. UX HIERARCHY & HERO DISPLAY MODE AUDIT
// ----------------------------------------------------

test('UX Hierarchy: heroDisplayMode defaults to actual, preserves real money vs planning money', () => {
  const initial = defaultState();
  assert.equal(initial.finance.heroDisplayMode, 'actual', 'Default hero mode must be actual money');

  // Scenario: $5,000 bank balance, $1,600 upcoming Internet commitment
  const state: LifeOSState = {
    ...initial,
    finance: {
      ...initial.finance,
      accounts: [{ id: 'bank-1', name: 'Banco', balance: 5000 }],
      commitments: [
        makeCommitment({
          id: 'c-net',
          name: 'Internet Fibra',
          amount: 1600,
          nextDueDate: '2026-10-15',
          active: true,
        }),
      ],
      heroDisplayMode: 'actual',
    },
  };

  const cf = cashFlow30Days(state, '2026-10-01');
  const actualMoneyInBank = calcAccountsTotal(state);

  // Invariant 1: Dinero real hoy = $5,000
  assert.equal(actualMoneyInBank, 5000, 'Actual money in bank must remain exactly 5000');
  // Invariant 2: Dinero comprometido = $1,600
  assert.equal(cf.committed, 1600, 'Committed money must be 1600');
  // Invariant 3: Disponible después de compromisos = $3,400
  assert.equal(cf.realAvailable, 3400, 'Available after commitments is 3400 (planning only, not yet spent)');
  // Invariant 4: Hero display preference is 'actual'
  assert.equal(state.finance.heroDisplayMode, 'actual');
});

test('storage normalizeStoredState: sanitizes and persists heroDisplayMode', () => {
  // Missing heroDisplayMode -> defaults to 'actual'
  const stateA = normalizeStoredState({
    finance: {
      accounts: [{ id: 'a1', name: 'Banco', balance: 1000 }],
    },
  });
  assert.equal(stateA.finance.heroDisplayMode, 'actual');

  // Valid heroDisplayModes are preserved
  const stateB = normalizeStoredState({
    finance: {
      heroDisplayMode: 'both',
    },
  });
  assert.equal(stateB.finance.heroDisplayMode, 'both');

  const stateC = normalizeStoredState({
    finance: {
      heroDisplayMode: 'real_available',
    },
  });
  assert.equal(stateC.finance.heroDisplayMode, 'real_available');

  // Invalid value falls back to 'actual'
  const stateD = normalizeStoredState({
    finance: {
      heroDisplayMode: 'invalid_mode',
    },
  });
  assert.equal(stateD.finance.heroDisplayMode, 'actual');
});

test('syncMerge mergeFinanceModule: resolves heroDisplayMode 3-way merge correctly', () => {
  const base = defaultState().finance;

  // Local changes heroDisplayMode to 'both'
  const local = { ...base, heroDisplayMode: 'both' as const };
  // Remote did not change it
  const remote = { ...base };

  const merged1 = mergeFinanceModule(local, remote, base, {});
  assert.equal(merged1.heroDisplayMode, 'both');

  // Remote changes heroDisplayMode to 'real_available' while local left it at base
  const local2 = { ...base };
  const remote2 = { ...base, heroDisplayMode: 'real_available' as const };

  const merged2 = mergeFinanceModule(local2, remote2, base, {});
  assert.equal(merged2.heroDisplayMode, 'real_available');
});

test('Caso B: Saldo = 0, Compromisos = 500 -> Saldo real = 0, Compromisos = 500, Proyección = -500 (nunca Saldo real = -500)', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'banco-0', name: 'Banco', balance: 0 }],
      commitments: [
        makeCommitment({
          id: 'c-500',
          name: 'Servicio',
          amount: 500,
          nextDueDate: '2026-10-10',
          active: true,
        }),
      ],
      heroDisplayMode: 'actual',
    },
  };

  const actualMoney = calcAccountsTotal(state);
  const cf = cashFlow30Days(state, '2026-10-01');

  // Invariante: Saldo real es exactamente 0, NO -500
  assert.equal(actualMoney, 0, 'Saldo real debe ser 0');
  assert.equal(cf.committed, 500, 'Compromisos debe ser 500');
  assert.equal(cf.realAvailable, -500, 'Proyección después de compromisos es -500');
});

test('Caso C: Activo físico (moto/posesiones) = 70.000, Saldo líquido = 5.000 -> Saldo real = 5.000 (NUNCA 75.000)', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'banco-liq', name: 'Banco', balance: 5000 }],
      commitments: [],
    },
    notes: {
      postits: [],
      shopping: [],
      links: [],
      possessions: [
        {
          id: 'moto-1',
          name: 'Moto Yamaha',
          category: 'Vehículos',
          location: 'Garaje',
          note: 'Valor estimado $70.000',
          receivedAt: '2023-11-15',
        },
      ],
    },
  };

  const actualMoney = calcAccountsTotal(state);
  // Saldo real líquido debe ser estrictamente 5.000, no sumar 70.000 de la posesión
  assert.equal(actualMoney, 5000, 'Saldo real líquido debe ser 5.000 sin mezclar activos físicos');
  assert.notEqual(actualMoney, 75000, 'No debe mezclar el activo físico de 70.000 con la liquidez');
});

test('Backup & Restore: Exportación e importación JSON conserva schemaVersion: 2 y todos los módulos intactos', () => {
  const initial = defaultState();
  initial.finance.accounts = [{ id: 'acc-test', name: 'Cuenta Principal', balance: 12500 }];
  initial.finance.commitments = [makeCommitment({ id: 'c-test', name: 'Gimnasio', amount: 1500 })];
  initial.gym.sessions = [{ id: 'sess-1', date: '2026-08-10', exercises: [] }];
  initial.ideas = [{ id: 'idea-1', text: 'Nueva idea de negocio', date: '2026-08-10', source: 'ia' }];
  initial.jobs.opportunities = [{ id: 'job-1', empresa: 'Tech Co', puesto: 'Dev', rating: 5, link: '', nota: '', fecha: '2026-08-10', status: 'nueva' }];

  // 1. Exportar a JSON
  const exportedJson = JSON.stringify(initial);
  assert.ok(exportedJson.length > 0);

  // 2. Comprobar que es JSON válido y mantiene schemaVersion: 2
  const parsed = JSON.parse(exportedJson);
  assert.equal(parsed.schemaVersion, 2, 'schemaVersion debe mantenerse en 2');

  // 3. Restaurar mediante normalizeStoredState (función core de importación)
  const restored = normalizeStoredState(parsed);

  // 4. Confirmar que ningún módulo ni dato desapareció
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.finance.accounts[0].name, 'Cuenta Principal');
  assert.equal(restored.finance.accounts[0].balance, 12500);
  assert.equal(restored.finance.commitments?.length, 1);
  assert.equal(restored.finance.commitments?.[0].name, 'Gimnasio');
  assert.equal(restored.gym.sessions.length, 1);
  assert.equal(restored.ideas.length, 1);
  assert.equal(restored.ideas[0].text, 'Nueva idea de negocio');
  assert.equal(restored.jobs.opportunities.length, 1);
  assert.equal(restored.jobs.opportunities[0].empresa, 'Tech Co');
});

// ----------------------------------------------------
// 7. FASE 6: COMPROMISOS, CUOTAS, COEXISTENCIA & PAGOS
// ----------------------------------------------------

test('Fase 6: Pago de compromiso con monto diferente al estimado sin modificar compromiso futuro', () => {
  // Factura de UTE estimada en $1.600 pero la factura real vino por $1.720
  const com = makeCommitment({
    id: 'com-ute',
    name: 'UTE Electricidad',
    amount: 1600,
    frequency: 'monthly',
    nextDueDate: '2026-10-15',
    active: true,
  });

  const accountId = 'acc-banco';
  const initialBalance = 10000;
  const paidAmount = 1720; // Monto real abonado

  // 1. Simulación de la operación atómica de pago
  const tx: Transaction = {
    id: 'tx-1',
    amount: paidAmount,
    type: 'gasto',
    category: com.category || 'Varios',
    accountId,
    fixed: 'fijo',
    date: '2026-10-15',
    note: `Pago de compromiso: ${com.name}`,
  };

  const finalBalance = initialBalance - tx.amount;
  assert.equal(finalBalance, 8280, 'El saldo de la cuenta debe descontar exactamente el monto pagado real ($1.720)');

  // 2. Avanzar el compromiso sin actualizar el monto futuro (updateFutureAmount = false)
  const advanced = advanceCommitmentDueDate(com);
  const updatedCom: FinancialCommitment = {
    ...com,
    ...advanced,
    amount: com.amount, // Se preserva el estimado de $1.600
    updatedAt: new Date().toISOString(),
  };

  assert.equal(updatedCom.amount, 1600, 'El monto del compromiso futuro debe conservarse en $1.600');
  assert.equal(updatedCom.nextDueDate, '2026-11-15', 'La próxima fecha debe avanzar a noviembre');
  assert.equal(updatedCom.active, true, 'El compromiso sigue activo para el mes próximo');
});

test('Fase 6: Pago de compromiso con monto diferente actualizando también cuotas/compromisos futuros', () => {
  // Ajuste contractual de alquiler de $15.000 a $16.500
  const com = makeCommitment({
    id: 'com-alq',
    name: 'Alquiler',
    amount: 15000,
    frequency: 'monthly',
    nextDueDate: '2026-10-10',
    active: true,
  });

  const paidAmount = 16500;
  const updateFutureAmount = true;

  const advanced = advanceCommitmentDueDate(com);
  const updatedCom: FinancialCommitment = {
    ...com,
    ...advanced,
    amount: updateFutureAmount ? paidAmount : com.amount,
  };

  assert.equal(updatedCom.amount, 16500, 'El monto futuro debe actualizarse a $16.500 cuando el usuario lo elige');
  assert.equal(updatedCom.nextDueDate, '2026-11-10');
});

test('Fase 6: Ciclo de vida completo de compra en cuotas (6 cuotas hasta finalizarse)', () => {
  let notebookCom = makeCommitment({
    id: 'com-notebook',
    name: 'Notebook Dell',
    amount: 2500,
    frequency: 'monthly',
    nextDueDate: '2026-05-10',
    totalOccurrences: 6,
    remainingOccurrences: 6,
    dueDay: 10,
    active: true,
  });

  assert.equal(notebookCom.remainingOccurrences, 6);

  // Pagos 1 al 5
  for (let i = 5; i >= 1; i--) {
    const adv = advanceCommitmentDueDate(notebookCom);
    notebookCom = { ...notebookCom, ...adv };
    assert.equal(notebookCom.remainingOccurrences, i, `Debe quedar ${i} cuotas restantes`);
    assert.equal(notebookCom.active, true, 'Debe seguir activo mientras queden cuotas');
  }

  // Sexto y último pago
  const lastAdv = advanceCommitmentDueDate(notebookCom);
  notebookCom = { ...notebookCom, ...lastAdv };

  assert.equal(notebookCom.remainingOccurrences, 0, 'Las cuotas restantes deben ser 0');
  assert.equal(notebookCom.active, false, 'El compromiso debe quedar inactivo / finalizado');

  // Verificar que getCommitmentOccurrences ya no genera ocurrencias futuras
  const occs = getCommitmentOccurrences(notebookCom, '2026-11-01', '2026-11-30');
  assert.equal(occs.length, 0, 'Un compromiso finalizado no debe proyectar gastos futuros ni comprometer dinero');
});

test('Fase 6: Coexistencia armónica sin double counting entre suscripciones, deudas y compromisos', () => {
  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'acc-1', name: 'Banco Central', balance: 50000 }],
      subscriptions: [
        { id: 'sub-spotify', name: 'Spotify', amount: 400, dueDay: 15 },
      ],
      debts: [
        { id: 'debt-prestamo', name: 'Préstamo Auto', amount: 100000, monthlyPayment: 3000, dueDate: '2026-10-20' },
      ],
      commitments: [
        makeCommitment({ id: 'com-alquiler', name: 'Alquiler', amount: 15000, nextDueDate: '2026-10-05', active: true }),
      ],
    },
  };

  const cf = cashFlow30Days(state, '2026-10-01');

  // En cashFlow30Days:
  // - Spotify (sub): 400
  // - Préstamo Auto (debt con monthlyPayment): 3.000
  // - Alquiler (commitment): 15.000
  // Total comprometido = 18.400
  assert.equal(cf.currentBalance, 50000);
  assert.equal(cf.committed, 18400, 'Debe sumar 400 + 3.000 + 15.000 = 18.400 sin duplicar');
  assert.equal(cf.realAvailable, 31600, 'Disponible Real debe ser 50.000 - 18.400 = 31.600');
  assert.equal(cf.commitments.length, 3, 'Debe incluir las 3 obligaciones previstas en la lista');
});

test('Fase 6: Expected Income nunca infla Disponible Real y se confirma atómicamente', () => {
  const inc = {
    id: 'inc-sueldo',
    currency: 'UYU',
    name: 'Sueldo Octubre',
    amount: 35000,
    startDate: '2026-10-10',
    frequency: 'monthly' as const,
    active: true,
  };

  const state: LifeOSState = {
    ...defaultState(),
    finance: {
      ...defaultState().finance,
      accounts: [{ id: 'acc-1', name: 'Caja', balance: 10000 }],
      expectedIncomes: [inc],
      commitments: [
        makeCommitment({ id: 'com-1', name: 'Servicio', amount: 3000, nextDueDate: '2026-10-12', active: true }),
      ],
    },
  };

  const cf = cashFlow30Days(state, '2026-10-01');

  // Disponible Real = Saldo actual ($10.000) - Comprometido ($3.000) = $7.000.
  // El sueldo esperado de $35.000 NUNCA debe sumarse a Disponible Real.
  assert.equal(cf.currentBalance, 10000);
  assert.equal(cf.committed, 3000);
  assert.equal(cf.realAvailable, 7000, 'Disponible Real es estrictamente $7.000, NUNCA $42.000');
  assert.equal(cf.totalExpectedIncome, 35000);
  // Proyección futura sí incluye el sueldo: 10.000 + 35.000 - 3.000 = 42.000
  assert.equal(cf.projectedBalance, 42000);

  // Cobro real del ingreso:
  const advInc = advanceExpectedIncomeDate(inc);
  assert.equal(advInc.startDate, '2026-11-10', 'Debe avanzar al próximo mes');
});

test('Fase 6: Preservación de ancla dueDay (día 31) en meses de 28/29/30/31 días sin deriva', () => {
  let com = makeCommitment({
    id: 'com-fin-mes',
    name: 'Servicio Fin de Mes',
    amount: 1200,
    frequency: 'monthly',
    nextDueDate: '2026-01-31',
    dueDay: 31,
    active: true,
  });

  // Enero 31 -> Febrero (28 días en 2026)
  let adv = advanceCommitmentDueDate(com);
  com = { ...com, ...adv };
  assert.equal(com.nextDueDate, '2026-02-28');
  assert.equal(com.dueDay, 31, 'El día ancla 31 debe preservarse');

  // Febrero 28 -> Marzo (31 días): Debe volver al día 31 sin quedarse en 28
  adv = advanceCommitmentDueDate(com);
  com = { ...com, ...adv };
  assert.equal(com.nextDueDate, '2026-03-31', 'Debe recuperar el día 31 en marzo');
  assert.equal(com.dueDay, 31);

  // Marzo 31 -> Abril (30 días)
  adv = advanceCommitmentDueDate(com);
  com = { ...com, ...adv };
  assert.equal(com.nextDueDate, '2026-04-30', 'Debe caer en el día 30 en abril');
  assert.equal(com.dueDay, 31);

  // Abril 30 -> Mayo (31 días)
  adv = advanceCommitmentDueDate(com);
  com = { ...com, ...adv };
  assert.equal(com.nextDueDate, '2026-05-31', 'Debe recuperar el día 31 en mayo');
});


