import test from 'node:test';
import assert from 'node:assert/strict';
import { LifeOSState } from '../types';
import { defaultState } from './storage';
import {
  deriveCashflowProjection,
  getCommittedEventsForWindow,
  getExpectedIncomeEventsForWindow,
  getRealBalancesByCurrency,
  calculateAvailableAfterCommitments,
  getCivilWindowBounds,
  addDaysCivilIso,
  getMonthEndIso,
} from './financeCashflow';
import {
  deriveMonthlyBudgetStatus,
  deriveAllMonthlyBudgetStatuses,
  setMonthlyGlobalLimit,
  setMonthlyCategoryLimit,
  setMonthlyBudget,
} from './financeBudget';
import {
  addAccount,
  addFinancialCommitment,
  confirmFinancialCommitment,
  confirmExpectedIncome,
  addTransaction,
  updateTransaction,
  addTransfer,
} from './financeFlows';
import { mergeMonthlyBudgets } from './syncMerge';

function createMockState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco UYU', balance: 10000, initialBalance: 10000, currency: 'UYU' },
  ];
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.reconciliations = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  state.finance.budgets = {};
  state.finance.monthlyBudgets = {};
  return state;
}

test('1. Compromiso pendiente no cambia saldo real, pero settlement sí lo cambia', () => {
  const state = createMockState();
  assert.equal(state.finance.accounts[0].balance, 10000);

  // Crear compromiso pendiente
  const com = addFinancialCommitment(state, {
    name: 'Alquiler',
    amount: 3000,
    frequency: 'once',
    nextDueDate: '2026-10-15',
    currency: 'UYU',
  });

  // El saldo real en cuentas no se modifica
  assert.equal(state.finance.accounts[0].balance, 10000);
  const realBalancesBefore = getRealBalancesByCurrency(state);
  assert.equal(realBalancesBefore['UYU'], 10000);

  // Settlement: confirmar el compromiso
  confirmFinancialCommitment(state, {
    commitmentId: com.id,
    date: '2026-10-15',
    amount: 3000,
  });

  // Tras el settlement existe transacción en ledger y el saldo real se actualiza
  assert.equal(state.finance.accounts[0].balance, 7000);
  const realBalancesAfter = getRealBalancesByCurrency(state);
  assert.equal(realBalancesAfter['UYU'], 7000);
});

test('2. Comprometido por ventana: 7d vs resto del mes vs 30d', () => {
  const state = createMockState();
  const fromIso = '2026-10-08';

  // Compromiso en 4 días (2026-10-12) -> entra en 7d, mes y 30d
  addFinancialCommitment(state, {
    name: 'Supermercado',
    amount: 1000,
    frequency: 'once',
    nextDueDate: '2026-10-12',
    currency: 'UYU',
  });

  // Compromiso en 17 días (2026-10-25) -> NO entra en 7d, entra en mes y 30d
  addFinancialCommitment(state, {
    name: 'Internet',
    amount: 2000,
    frequency: 'once',
    nextDueDate: '2026-10-25',
    currency: 'UYU',
  });

  // Compromiso en 27 días (2026-11-04) -> NO entra en 7d ni en mes de octubre, entra en 30d
  addFinancialCommitment(state, {
    name: 'Seguro Noviembre',
    amount: 4000,
    frequency: 'once',
    nextDueDate: '2026-11-04',
    currency: 'UYU',
  });

  const proj7d = deriveCashflowProjection(state, '7d', fromIso);
  assert.equal(proj7d.summariesByCurrency['UYU'].committedExpenses, 1000);

  const projMonth = deriveCashflowProjection(state, 'month', fromIso);
  assert.equal(projMonth.summariesByCurrency['UYU'].committedExpenses, 3000);

  const proj30d = deriveCashflowProjection(state, '30d', fromIso);
  assert.equal(proj30d.summariesByCurrency['UYU'].committedExpenses, 7000);
});

test('3. Cuota: cuenta sólo la cuota vigente que vence en la ventana, no todas las cuotas futuras', () => {
  const state = createMockState();
  const fromIso = '2026-10-08';

  // Compra en 12 cuotas de $1.500 c/u. Próxima cuota vence el 2026-10-20
  addFinancialCommitment(state, {
    name: 'Laptop 12 cuotas',
    amount: 1500,
    frequency: 'monthly',
    totalInstallments: 12,
    currentInstallment: 1,
    remainingOccurrences: 12,
    nextDueDate: '2026-10-20',
    currency: 'UYU',
  });

  // En 7 días (2026-10-08 a 2026-10-15) la cuota del 20 todavía no vence
  const events7d = getCommittedEventsForWindow(state, '7d', fromIso);
  assert.equal(events7d.length, 0);

  // En resto del mes (octubre), vence SOLO la cuota 1 ($1.500). NO debe sumar $18.000
  const eventsMonth = getCommittedEventsForWindow(state, 'month', fromIso);
  assert.equal(eventsMonth.length, 1);
  assert.equal(eventsMonth[0].amount, 1500);

  const projMonth = deriveCashflowProjection(state, 'month', fromIso);
  assert.equal(projMonth.summariesByCurrency['UYU'].committedExpenses, 1500);
});

test('4. Recurrente: compromisos semanales se calculan con frecuencia correcta', () => {
  const state = createMockState();
  const fromIso = '2026-10-08';

  // $500 semanal desde el 2026-10-10
  addFinancialCommitment(state, {
    name: 'Clases semanales',
    amount: 500,
    frequency: 'weekly',
    nextDueDate: '2026-10-10',
    currency: 'UYU',
  });

  // 7d: solo la ocurrencia del 2026-10-10 ($500)
  const events7d = getCommittedEventsForWindow(state, '7d', fromIso);
  assert.equal(events7d.length, 1);
  assert.equal(events7d[0].amount, 500);

  // En octubre (hasta 2026-10-31): ocurrencias el 10, 17, 24, 31 (4 ocurrencias = $2.000)
  const eventsMonth = getCommittedEventsForWindow(state, 'month', fromIso);
  assert.equal(eventsMonth.length, 4);
  assert.equal(eventsMonth.reduce((acc, e) => acc + e.amount, 0), 2000);
});

test('5. Expected income separado, saldo proyectado correcto y disponible NO incluye ingresos futuros', () => {
  const state = createMockState();
  const fromIso = '2026-10-08';
  // Saldo real = 10.000

  // Compromiso de egreso: $3.000
  addFinancialCommitment(state, {
    name: 'Gasto fijo',
    amount: 3000,
    frequency: 'once',
    nextDueDate: '2026-10-15',
    currency: 'UYU',
  });

  // Ingreso esperado: $15.000
  state.finance.expectedIncomes = [
    {
      id: 'inc-1',
      name: 'Cobro de sueldo',
      amount: 15000,
      currency: 'UYU',
      startDate: '2026-10-25',
      frequency: 'once',
      active: true,
    },
  ];

  const proj = deriveCashflowProjection(state, 'month', fromIso);
  const uyu = proj.summariesByCurrency['UYU'];

  // Saldo real = 10.000
  assert.equal(uyu.realBalance, 10000);
  // Comprometido = 3.000
  assert.equal(uyu.committedExpenses, 3000);
  // Ingreso previsto = 15.000
  assert.equal(uyu.expectedIncomes, 15000);

  // Disponible después de compromisos: saldo real - compromisos (10.000 - 3.000 = 7.000).
  // CRÍTICO: NO incluye los $15.000 de ingreso futuro.
  assert.equal(uyu.availableAfterCommitments, 7000);
  assert.equal(calculateAvailableAfterCommitments(10000, 3000), 7000);

  // Saldo proyectado: saldo real actual + ingresos esperados - egresos comprometidos (10.000 + 15.000 - 3.000 = 22.000)
  assert.equal(uyu.projectedBalance, 22000);
});

test('6. Presupuesto mensual global: gastado del ledger, restante y excedido', () => {
  const state = createMockState();
  setMonthlyGlobalLimit(state.finance, '2026-10', 50000, 'UYU');

  // Gasto 1: $35.000
  addTransaction(state, {
    type: 'gasto',
    amount: 35000,
    category: 'Varios',
    accountId: 'acc-uyu',
    date: '2026-10-05',
  });

  const rep1 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(rep1.hasBudget, true);
  assert.equal(rep1.globalLimit, 50000);
  assert.equal(rep1.totalSpent, 35000);
  assert.equal(rep1.remaining, 15000);
  assert.equal(rep1.exceeded, 0);
  assert.equal(rep1.isExceeded, false);

  // Gasto 2: $20.000 adicionales (total gastado = $55.000, excede por $5.000)
  addTransaction(state, {
    type: 'gasto',
    amount: 20000,
    category: 'Varios',
    accountId: 'acc-uyu',
    date: '2026-10-12',
  });

  const rep2 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(rep2.totalSpent, 55000);
  assert.equal(rep2.remaining, -5000);
  assert.equal(rep2.exceeded, 5000);
  assert.equal(rep2.isExceeded, true);
});

test('7. Presupuesto por categoría: límites, gastado real derivado, restante y excedido', () => {
  const state = createMockState();
  setMonthlyCategoryLimit(state.finance, '2026-10', 'Comida', 10000, 'UYU');

  // Gasto en Comida de $6.000
  addTransaction(state, {
    type: 'gasto',
    amount: 6000,
    category: 'Comida',
    accountId: 'acc-uyu',
    date: '2026-10-09',
  });

  const rep1 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  const catComida1 = rep1.categories.find((c) => c.categoryName === 'Comida' || c.categoryId === 'Comida');
  assert.ok(catComida1);
  assert.equal(catComida1.limit, 10000);
  assert.equal(catComida1.spent, 6000);
  assert.equal(catComida1.remaining, 4000);
  assert.equal(catComida1.exceeded, 0);
  assert.equal(catComida1.isExceeded, false);

  // Gasto adicional de $5.000 en Comida (total $11.000, excede en $1.000)
  addTransaction(state, {
    type: 'gasto',
    amount: 5000,
    category: 'Comida',
    accountId: 'acc-uyu',
    date: '2026-10-15',
  });

  const rep2 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  const catComida2 = rep2.categories.find((c) => c.categoryName === 'Comida' || c.categoryId === 'Comida');
  assert.ok(catComida2);
  assert.equal(catComida2.spent, 11000);
  assert.equal(catComida2.remaining, -1000);
  assert.equal(catComida2.exceeded, 1000);
  assert.equal(catComida2.isExceeded, true);
});

test('8. Cambio de categoría recalcula automáticamente el presupuesto sin campos persistidos', () => {
  const state = createMockState();
  setMonthlyCategoryLimit(state.finance, '2026-10', 'Comida', 10000, 'UYU');
  setMonthlyCategoryLimit(state.finance, '2026-10', 'Salud', 5000, 'UYU');

  const tx = addTransaction(state, {
    type: 'gasto',
    amount: 4000,
    category: 'Comida',
    accountId: 'acc-uyu',
    date: '2026-10-10',
  });

  const rep1 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  const catComida1 = rep1.categories.find((c) => c.categoryId === 'Comida');
  const catSalud1 = rep1.categories.find((c) => c.categoryId === 'Salud');
  assert.equal(catComida1?.spent, 4000);
  assert.equal(catSalud1?.spent, 0);

  // Modificar la categoría de la transacción a 'Salud'
  updateTransaction(state, tx.id, {
    type: 'gasto',
    amount: 4000,
    category: 'Salud',
    accountId: 'acc-uyu',
    date: '2026-10-10',
  });

  const rep2 = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  const catComida2 = rep2.categories.find((c) => c.categoryId === 'Comida');
  const catSalud2 = rep2.categories.find((c) => c.categoryId === 'Salud');
  assert.equal(catComida2?.spent, 0);
  assert.equal(catSalud2?.spent, 4000);
});

test('9. Transferencia no cuenta como gasto e ingresos no cuentan como gasto', () => {
  const state = createMockState();
  addAccount(state, 'Ahorro', 50000);
  const acc2 = state.finance.accounts[1];

  setMonthlyGlobalLimit(state.finance, '2026-10', 30000, 'UYU');

  // Transferencia de $15.000 entre cuentas
  addTransfer(state, {
    fromAccountId: 'acc-uyu',
    toAccountId: acc2.id,
    amount: 15000,
    date: '2026-10-10',
  });

  // Ingreso directo de $25.000
  addTransaction(state, {
    type: 'ingreso',
    amount: 25000,
    category: 'Sueldo',
    accountId: 'acc-uyu',
    date: '2026-10-11',
  });

  const rep = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  // Gastado real en el presupuesto debe seguir siendo 0
  assert.equal(rep.totalSpent, 0);
  assert.equal(rep.remaining, 30000);
});

test('10. Compromiso futuro no cuenta como gastado hasta liquidarse', () => {
  const state = createMockState();
  setMonthlyGlobalLimit(state.finance, '2026-10', 20000, 'UYU');

  // Compromiso de $8.000 para el 25 de octubre
  const com = addFinancialCommitment(state, {
    name: 'Electricidad',
    amount: 8000,
    frequency: 'once',
    nextDueDate: '2026-10-25',
    currency: 'UYU',
  });

  // Antes del pago: gastado es 0
  const repBefore = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(repBefore.totalSpent, 0);

  // Al liquidarse
  confirmFinancialCommitment(state, {
    commitmentId: com.id,
    date: '2026-10-25',
  });

  // Ahora sí figura en el ledger y en el presupuesto
  const repAfter = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(repAfter.totalSpent, 8000);
  assert.equal(repAfter.remaining, 12000);
});

test('11. Cambio de mes/año: presupuestos no trasladan sobrantes automáticamente y meses sin presupuesto funcionan', () => {
  const state = createMockState();
  // Configurar presupuesto solo para octubre 2026
  setMonthlyGlobalLimit(state.finance, '2026-10', 20000, 'UYU');

  addTransaction(state, {
    type: 'gasto',
    amount: 5000,
    category: 'Varios',
    accountId: 'acc-uyu',
    date: '2026-10-15',
  });

  // En octubre: gastó 5k de 20k -> restante 15k
  const repOct = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(repOct.totalSpent, 5000);
  assert.equal(repOct.remaining, 15000);

  // En noviembre 2026: el usuario no configuró presupuesto explícito para noviembre
  // NO se trasladan los 15k de sobrante a noviembre ni se inventa un presupuesto artificial
  const repNov = deriveMonthlyBudgetStatus(state, '2026-11', 'UYU');
  assert.equal(repNov.totalSpent, 0);
  assert.equal(repNov.globalLimit, null);
  assert.equal(repNov.hasBudget, false);

  // Fin de año / cruce de año: fecha 2026-12-25 a 30 días
  const horizon = addDaysCivilIso('2026-12-25', 30);
  assert.equal(horizon, '2027-01-24');
  const monthEnd = getMonthEndIso('2026-12-25');
  assert.equal(monthEnd, '2026-12-31');
});

test('12. Múltiples monedas permanecen separadas: nunca se suman UYU y USD', () => {
  const state = createMockState();
  // Cuenta en UYU y cuenta en USD
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco UYU', balance: 50000, initialBalance: 50000, currency: 'UYU' },
    { id: 'acc-usd', name: 'Cuenta USD', balance: 1200, initialBalance: 1200, currency: 'USD' },
  ];

  // Compromiso en UYU
  addFinancialCommitment(state, {
    name: 'Alquiler',
    amount: 15000,
    frequency: 'once',
    nextDueDate: '2026-10-15',
    currency: 'UYU',
  });

  // Compromiso en USD
  addFinancialCommitment(state, {
    name: 'Servidor Cloud',
    amount: 50,
    frequency: 'once',
    nextDueDate: '2026-10-20',
    currency: 'USD',
  });

  const proj = deriveCashflowProjection(state, 'month', '2026-10-08');

  // Monedas separadas en saldo, comprometido y disponible
  const uyu = proj.summariesByCurrency['UYU'];
  const usd = proj.summariesByCurrency['USD'];

  assert.equal(uyu.realBalance, 50000);
  assert.equal(uyu.committedExpenses, 15000);
  assert.equal(uyu.availableAfterCommitments, 35000);

  assert.equal(usd.realBalance, 1200);
  assert.equal(usd.committedExpenses, 50);
  assert.equal(usd.availableAfterCommitments, 1150);

  // Cada moneda tiene su propio resumen y no existe un total único mezclado
  assert.equal(Object.keys(proj.summariesByCurrency).length, 2);
  assert.equal((proj as any).totalBalance, undefined);

  // Presupuesto multi-moneda
  setMonthlyGlobalLimit(state.finance, '2026-10', 40000, 'UYU');
  setMonthlyGlobalLimit(state.finance, '2026-10', 500, 'USD');

  addTransaction(state, {
    type: 'gasto',
    amount: 10000,
    category: 'Oficina',
    accountId: 'acc-uyu',
    currency: 'UYU',
    date: '2026-10-10',
  });

  addTransaction(state, {
    type: 'gasto',
    amount: 100,
    category: 'Software',
    accountId: 'acc-usd',
    currency: 'USD',
    date: '2026-10-11',
  });

  const allBudgets = deriveAllMonthlyBudgetStatuses(state, '2026-10');
  assert.equal(allBudgets['UYU'].totalSpent, 10000);
  assert.equal(allBudgets['UYU'].remaining, 30000);

  assert.equal(allBudgets['USD'].totalSpent, 100);
  assert.equal(allBudgets['USD'].remaining, 400);
});

test('13. Legacy sin presupuesto sigue funcionando sin errores', () => {
  const state = createMockState();
  state.finance.budgets = {};
  delete state.finance.monthlyBudgets;

  // Registrar gasto normal
  addTransaction(state, {
    type: 'gasto',
    amount: 1200,
    category: 'Varios',
    accountId: 'acc-uyu',
    date: '2026-10-10',
  });

  const rep = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(rep.hasBudget, false);
  assert.equal(rep.totalSpent, 1200);
  assert.equal(rep.remaining, null);
  assert.equal(rep.isExceeded, false);
});

test('14. Invariante 1: Presupuesto y separación estricta de monedas', () => {
  const state = createMockState();
  state.finance.accounts.push({
    id: 'acc-usd',
    name: 'Cuenta USD',
    balance: 1000,
    initialBalance: 1000,
    currency: 'USD',
  });
  const usdAcc = state.finance.accounts.find((a) => a.currency === 'USD')!;

  // Configurar presupuesto solo para UYU
  setMonthlyBudget(state.finance, '2026-10', {
    currency: 'UYU',
    globalLimit: 50000,
    categoryLimits: { Comida: 10000 },
  });

  // Gasto en USD en la misma categoría 'Comida'
  addTransaction(state, {
    type: 'gasto',
    amount: 150,
    category: 'Comida',
    accountId: usdAcc.id,
    currency: 'USD',
    date: '2026-10-10',
  });

  // Presupuesto UYU: totalSpent debe ser 0, Comida gastado debe ser 0
  const uyuBudget = deriveMonthlyBudgetStatus(state, '2026-10', 'UYU');
  assert.equal(uyuBudget.hasBudget, true);
  assert.equal(uyuBudget.totalSpent, 0, 'Presupuesto UYU jamás debe consumir gastos en USD');
  assert.equal(uyuBudget.categories.find((c) => c.categoryName === 'Comida' || c.categoryId === 'Comida')?.spent, 0);
  assert.equal(uyuBudget.remaining, 50000);

  // Consulta en USD: no debe adoptar los límites de UYU ni presupuestos legacy
  const usdBudget = deriveMonthlyBudgetStatus(state, '2026-10', 'USD');
  assert.equal(usdBudget.hasBudget, false, 'USD no debe adoptar límites de UYU');
  assert.equal(usdBudget.totalSpent, 150);
  assert.equal(usdBudget.remaining, null);

  // Configurar presupuesto de categoría explícito para USD
  setMonthlyCategoryLimit(state.finance, '2026-10', 'Comida', 200, 'USD');
  const usdBudgetCat = deriveMonthlyBudgetStatus(state, '2026-10', 'USD');
  assert.equal(usdBudgetCat.hasBudget, true);
  assert.equal(usdBudgetCat.totalSpent, 150);
  const usdComida = usdBudgetCat.categories.find((c) => c.categoryName === 'Comida' || c.categoryId === 'Comida');
  assert.equal(usdComida?.limit, 200);
  assert.equal(usdComida?.spent, 150);
  assert.equal(usdComida?.remaining, 50);

  // Configurar límite global en USD
  setMonthlyGlobalLimit(state.finance, '2026-10', 300, 'USD');
  const usdBudgetGlobal = deriveMonthlyBudgetStatus(state, '2026-10', 'USD');
  assert.equal(usdBudgetGlobal.globalLimit, 300);
  assert.equal(usdBudgetGlobal.remaining, 150); // 300 - 150

  // Comprobar que en el almacenamiento las claves son unívocas YYYY-MM:CURRENCY
  assert.ok(state.finance.monthlyBudgets!['2026-10:UYU']);
  assert.ok(state.finance.monthlyBudgets!['2026-10:USD']);
});

test('15. Invariante 2: Budget sync convergencia 3-way merge', () => {
  // A. Cambios independientes por categoría en el mismo mes convergen limpiamente
  const baselineA = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 50000,
      categoryLimits: { Comida: 10000, Casa: 15000 },
    },
  };
  const localA = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 50000,
      categoryLimits: { Comida: 12000, Casa: 15000 }, // local modificó Comida
    },
  };
  const remoteA = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 50000,
      categoryLimits: { Comida: 10000, Casa: 18000 }, // remote modificó Casa
    },
  };
  const mergedA = mergeMonthlyBudgets(localA, remoteA, baselineA);
  assert.equal(mergedA['2026-10:UYU'].categoryLimits?.Comida, 12000);
  assert.equal(mergedA['2026-10:UYU'].categoryLimits?.Casa, 18000);
  assert.equal(mergedA['2026-10:UYU'].globalLimit, 50000);

  // B. Cambio de límite global en local vs límite de categoría en remote
  const baselineB = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 40000,
      categoryLimits: { Comida: 10000 },
    },
  };
  const localB = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 45000, // local editó global
      categoryLimits: { Comida: 10000 },
    },
  };
  const remoteB = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 40000,
      categoryLimits: { Comida: 14000 }, // remote editó categoría
    },
  };
  const mergedB = mergeMonthlyBudgets(localB, remoteB, baselineB);
  assert.equal(mergedB['2026-10:UYU'].globalLimit, 45000);
  assert.equal(mergedB['2026-10:UYU'].categoryLimits?.Comida, 14000);

  // C. Delete vs snapshot viejo (no resucitar lo eliminado si la otra parte no lo tocó)
  const baselineC = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 30000,
      categoryLimits: { Comida: 5000, Casa: 10000 },
    },
  };
  const localC = {}; // local borró el mes completo
  const remoteC = { ...baselineC }; // remote tiene snapshot viejo idéntico
  const mergedC = mergeMonthlyBudgets(localC, remoteC, baselineC);
  assert.equal(mergedC['2026-10:UYU'], undefined, 'El mes eliminado no debe resucitar ante snapshot viejo');

  // Deletions de categorías individuales: local borró 'Casa', remote no tocó 'Casa'
  const localCatDelete = {
    '2026-10:UYU': {
      month: '2026-10',
      currency: 'UYU',
      globalLimit: 30000,
      categoryLimits: { Comida: 5000 }, // Casa borrada
    },
  };
  const mergedCatDel = mergeMonthlyBudgets(localCatDelete, remoteC, baselineC);
  assert.equal(mergedCatDel['2026-10:UYU'].categoryLimits?.Casa, undefined);
  assert.equal(mergedCatDel['2026-10:UYU'].categoryLimits?.Comida, 5000);

  // D. Meses distintos offline
  const baselineD = {};
  const localD = {
    '2026-11:UYU': { month: '2026-11', currency: 'UYU', globalLimit: 60000 },
  };
  const remoteD = {
    '2026-12:USD': { month: '2026-12', currency: 'USD', globalLimit: 1500 },
  };
  const mergedD = mergeMonthlyBudgets(localD, remoteD, baselineD);
  assert.ok(mergedD['2026-11:UYU']);
  assert.ok(mergedD['2026-12:USD']);
  assert.equal(mergedD['2026-11:UYU'].globalLimit, 60000);
  assert.equal(mergedD['2026-12:USD'].globalLimit, 1500);
});

test('16. Invariante 3: No double projection tras settlement o vinculación', () => {
  const state = createMockState();
  assert.equal(state.finance.accounts[0].balance, 10000);

  // 1. Compromiso puntual de 2500
  const com = addFinancialCommitment(state, {
    name: 'Mantenimiento PC',
    amount: 2500,
    frequency: 'once',
    nextDueDate: '2026-10-15',
    currency: 'UYU',
  });

  // 2. Ingreso previsto puntual de 8000
  state.finance.expectedIncomes.push({
    id: 'inc-pago-extra',
    name: 'Bono freelance',
    amount: 8000,
    frequency: 'once',
    startDate: '2026-10-20',
    active: true,
    currency: 'UYU',
  });

  // Proyección ANTES de settlement
  const projBefore = deriveCashflowProjection(state, 'month', '2026-10-08');
  const uyuBefore = projBefore.summariesByCurrency['UYU'];
  assert.equal(uyuBefore.realBalance, 10000);
  assert.equal(uyuBefore.committedExpenses, 2500);
  assert.equal(uyuBefore.expectedIncomes, 8000);
  assert.equal(uyuBefore.availableAfterCommitments, 7500); // 10000 - 2500
  assert.equal(uyuBefore.projectedBalance, 15500); // 10000 + 8000 - 2500

  // Liquidar compromiso a transacción real en ledger
  confirmFinancialCommitment(state, {
    commitmentId: com.id,
    date: '2026-10-10',
  });

  // El saldo real bajó 2500 a 7500
  assert.equal(state.finance.accounts[0].balance, 7500);

  // Proyección tras liquidar compromiso: el compromiso ya no debe figurar en cashflow
  const projAfterCom = deriveCashflowProjection(state, 'month', '2026-10-08');
  const uyuAfterCom = projAfterCom.summariesByCurrency['UYU'];
  assert.equal(uyuAfterCom.realBalance, 7500);
  assert.equal(uyuAfterCom.committedExpenses, 0, 'Compromiso liquidado no debe proyectarse nuevamente');
  assert.equal(uyuAfterCom.expectedIncomes, 8000);
  assert.equal(uyuAfterCom.availableAfterCommitments, 7500);
  assert.equal(uyuAfterCom.projectedBalance, 15500, 'Saldo proyectado permanece invariante sin duplicación');

  // Liquidar ingreso previsto a transacción real en ledger
  confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-pago-extra',
    accountId: 'acc-uyu',
    date: '2026-10-12',
  });

  // El saldo real subió 8000 a 15500
  assert.equal(state.finance.accounts[0].balance, 15500);

  // Proyección tras liquidar ingreso: el ingreso ya no debe figurar en cashflow
  const projAfterInc = deriveCashflowProjection(state, 'month', '2026-10-08');
  const uyuAfterInc = projAfterInc.summariesByCurrency['UYU'];
  assert.equal(uyuAfterInc.realBalance, 15500);
  assert.equal(uyuAfterInc.committedExpenses, 0);
  assert.equal(uyuAfterInc.expectedIncomes, 0, 'Ingreso liquidado no debe proyectarse nuevamente');
  assert.equal(uyuAfterInc.availableAfterCommitments, 15500);
  assert.equal(uyuAfterInc.projectedBalance, 15500);

  const incEventsAfter = getExpectedIncomeEventsForWindow(state, 'month', '2026-10-08');
  assert.equal(incEventsAfter.length, 0, 'Eventos individuales de ingreso previsto se vacían tras settlement');

  // 3. Cuotas: cuota 1 de 3 liquidada avanza a ciclo siguiente y no cuenta dos veces en el mes
  const cuota = addFinancialCommitment(state, {
    name: 'Celular en cuotas',
    amount: 1000,
    frequency: 'monthly',
    totalInstallments: 3,
    currentInstallment: 1,
    nextDueDate: '2026-10-14',
    currency: 'UYU',
  });

  confirmFinancialCommitment(state, {
    commitmentId: cuota.id,
    date: '2026-10-14',
  });

  // La cuota 1 está en el ledger (saldo real = 14500)
  assert.equal(state.finance.accounts[0].balance, 14500);

  // La cuota vigente para octubre ya se pagó; la próxima (cuota 2) vence en noviembre
  const comEventsOct = getCommittedEventsForWindow(state, 'month', '2026-10-08');
  const celularInOct = comEventsOct.filter((e) => e.sourceId === cuota.id);
  assert.equal(celularInOct.length, 0, 'Cuota 1 pagada no se vuelve a contar en el cashflow del mes');
});

test('17. Invariante 4: Boundary dates civiles (hoy, +7d, fin de mes, cambio de año, +30d)', () => {
  const fromOct8 = '2026-10-08';

  // 1. Ventana 7d: hoy hasta exactamente +7d (ambos inclusive)
  const bounds7d = getCivilWindowBounds('7d', fromOct8);
  assert.equal(bounds7d.fromIso, '2026-10-08');
  assert.equal(bounds7d.horizonIso, '2026-10-15');
  assert.equal(addDaysCivilIso(fromOct8, 7), '2026-10-15');

  // 2. Ventana month: hoy hasta el último día civil del mes
  const boundsMonth = getCivilWindowBounds('month', fromOct8);
  assert.equal(boundsMonth.fromIso, '2026-10-08');
  assert.equal(boundsMonth.horizonIso, '2026-10-31');
  assert.equal(getMonthEndIso(fromOct8), '2026-10-31');

  // 3. Ventana 30d: hoy hasta exactamente +30d
  const bounds30d = getCivilWindowBounds('30d', fromOct8);
  assert.equal(bounds30d.fromIso, '2026-10-08');
  assert.equal(bounds30d.horizonIso, '2026-11-07');
  assert.equal(addDaysCivilIso(fromOct8, 30), '2026-11-07');

  // 4. Inclusión y exclusión en compromisos reales
  const state = createMockState();
  // Evento Hoy (2026-10-08)
  addFinancialCommitment(state, {
    name: 'Hoy',
    amount: 100,
    frequency: 'once',
    nextDueDate: '2026-10-08',
  });
  // Evento Exactamente +7d (2026-10-15)
  addFinancialCommitment(state, {
    name: 'Exacto 7d',
    amount: 200,
    frequency: 'once',
    nextDueDate: '2026-10-15',
  });
  // Evento +8d (2026-10-16) fuera de 7d
  addFinancialCommitment(state, {
    name: 'Dia 8',
    amount: 300,
    frequency: 'once',
    nextDueDate: '2026-10-16',
  });
  // Evento Fin de mes (2026-10-31)
  addFinancialCommitment(state, {
    name: 'Fin de mes',
    amount: 400,
    frequency: 'once',
    nextDueDate: '2026-10-31',
  });
  // Evento 1 Nov (2026-11-01) fuera de month
  addFinancialCommitment(state, {
    name: 'Inicio prox mes',
    amount: 500,
    frequency: 'once',
    nextDueDate: '2026-11-01',
  });
  // Evento Exactamente +30d (2026-11-07)
  addFinancialCommitment(state, {
    name: 'Exacto 30d',
    amount: 600,
    frequency: 'once',
    nextDueDate: '2026-11-07',
  });
  // Evento +31d (2026-11-08) fuera de 30d
  addFinancialCommitment(state, {
    name: 'Dia 31',
    amount: 700,
    frequency: 'once',
    nextDueDate: '2026-11-08',
  });

  const ev7d = getCommittedEventsForWindow(state, '7d', fromOct8);
  const labels7d = ev7d.map((e) => e.label);
  assert.ok(labels7d.includes('Hoy'), 'Hoy debe incluirse en 7d');
  assert.ok(labels7d.includes('Exacto 7d'), 'Exactamente +7d debe incluirse');
  assert.ok(!labels7d.includes('Dia 8'), 'Dia 8 debe excluirse de 7d');

  const evMonth = getCommittedEventsForWindow(state, 'month', fromOct8);
  const labelsMonth = evMonth.map((e) => e.label);
  assert.ok(labelsMonth.includes('Fin de mes'), 'Último día del mes debe incluirse en month');
  assert.ok(!labelsMonth.includes('Inicio prox mes'), 'Día 1 del siguiente mes debe excluirse de month');

  const ev30d = getCommittedEventsForWindow(state, '30d', fromOct8);
  const labels30d = ev30d.map((e) => e.label);
  assert.ok(labels30d.includes('Exacto 30d'), 'Exactamente +30d debe incluirse');
  assert.ok(!labels30d.includes('Dia 31'), 'Dia 31 debe excluirse de 30d');

  // 5. Cambio de año civil sin desfasaje horario
  const fromYearEnd = '2026-12-25';
  const yearEnd7d = getCivilWindowBounds('7d', fromYearEnd);
  assert.equal(yearEnd7d.horizonIso, '2027-01-01', '7d cruza el fin de año a 2027-01-01');

  const yearEndMonth = getCivilWindowBounds('month', fromYearEnd);
  assert.equal(yearEndMonth.horizonIso, '2026-12-31', 'month termina el 31 de diciembre');

  const yearEnd30d = getCivilWindowBounds('30d', fromYearEnd);
  assert.equal(yearEnd30d.horizonIso, '2027-01-24', '30d cruza el año hasta el 24 de enero 2027');
});
