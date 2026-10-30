import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, formatMoney, normalizeStoredState, todayISO } from './storage';
import { FinanceAccountsView } from '../components/FinanceAccountsView';
import {
  createFinancingAgreement,
  updateFinancingAgreement,
  deleteFinancingAgreement,
  calculateAgreementRemainingBalance,
  getAgreementPayments,
  addAgreementPayment,
  linkTransactionToAgreement,
  validateAgreementCoherence,
} from './financeAgreements';
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
} from './financeFlows';
import {
  calcDebtsTotal,
  calcNetWorth,
  calcSpentMonth,
  isOperationalTransaction,
} from './calculations';
import { mergeFinanceModule } from './syncMerge';
import type { LifeOSState, Transaction } from '../types';

function createTestState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco Santander UYU', balance: 50000, initialBalance: 50000, currency: 'UYU' },
    { id: 'acc-usd', name: 'Banco USD', balance: 1000, initialBalance: 1000, currency: 'USD' },
  ];
  state.finance.transactions = [];
  state.finance.agreements = [];
  state.finance.debts = [];
  return state;
}

test('Finanzas 1.3B — Escenario moto del hermano: registro sin movimientos ficticios y amortización en ledger', () => {
  const state = createTestState();

  // 1. Registro del acuerdo: Original 50.000, Pagos previos 15.000, Saldo inicial pendiente 35.000
  const agreement = createFinancingAgreement(state, {
    title: 'Moto Honda',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 35000,
    initialReferenceDate: '2026-03-01',
    originalPrincipal: 50000,
    priorPaidAmount: 15000,
    notes: 'Acuerdo de pago flexible con el hermano',
  });

  assert.equal(state.finance.agreements?.length, 1);
  assert.equal(agreement.initialRemainingBalance, 35000);
  assert.equal(agreement.status, 'active');

  // No debe alterarse el saldo de ninguna cuenta ni crearse transacciones ficticias
  assert.equal(state.finance.accounts[0].balance, 50000, 'Saldo bancario debe permanecer inalterado');
  assert.equal(state.finance.transactions.length, 0, 'No deben crearse transacciones por la deuda inicial ni pagos previos');

  // Saldo pendiente derivado inicial
  const bal0 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal0, 35000);

  // 2. Primer abono real: $5.000 UYU
  const tx1 = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 5000,
    accountId: 'acc-uyu',
    date: '2026-03-15',
    note: 'Primer abono moto hermano',
  });

  assert.equal(tx1.type, 'gasto');
  assert.equal(tx1.origin, 'debt_payment');
  assert.equal(tx1.agreementId, agreement.id);
  assert.equal(state.finance.accounts[0].balance, 45000, 'Saldo bancario debe debitarse exactamente en 5.000');

  const bal1 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal1, 30000, 'Saldo pendiente debe reducirse a 30.000');

  // 3. Segundo abono real: $8.000 UYU (pago extraordinario/variable)
  const tx2 = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 8000,
    accountId: 'acc-uyu',
    date: '2026-04-10',
    note: 'Segundo abono moto hermano',
  });

  assert.equal(state.finance.accounts[0].balance, 37000, 'Saldo bancario debe debitarse en otros 8.000');
  const bal2 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal2, 22000, 'Saldo pendiente debe reducirse a 22.000');

  // 4. Corrección/Edición: modificar tx2 de 8.000 a 6.000
  updateTransaction(state, tx2.id, {
    type: 'gasto',
    amount: 6000,
    accountId: 'acc-uyu',
    category: 'Préstamos y deudas',
    date: '2026-04-10',
    note: 'Segundo abono corregido',
  });

  assert.equal(state.finance.accounts[0].balance, 39000, 'Saldo bancario debe reflejar el débito corregido de 6.000');
  const bal3 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal3, 24000, 'Saldo pendiente debe reconstruirse exactamente a 24.000 (35.000 - 5.000 - 6.000)');

  // 5. Reversión/Eliminación: eliminar tx1 (5.000) desde el ledger
  deleteTransaction(state, tx1.id);

  assert.equal(state.finance.accounts[0].balance, 44000, 'Saldo bancario debe recuperar los 5.000');
  const bal4 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal4, 29000, 'Saldo pendiente debe reconstruirse a 29.000 (35.000 - 6.000)');
  assert.equal(agreement.status, 'active');

  // 6. getAgreementPayments y updateFinancingAgreement
  const payments = getAgreementPayments(agreement, state.finance.transactions);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].id, tx2.id);

  updateFinancingAgreement(state, agreement.id, { notes: 'Nueva observación' });
  assert.equal(agreement.notes, 'Nueva observación');

  // 7. deleteFinancingAgreement desvincula transacciones existentes sin borrarlas
  deleteFinancingAgreement(state, agreement.id);
  assert.equal(state.finance.agreements?.length, 0);
  assert.equal(tx2.agreementId, null, 'Transacción debe desvincularse limpiamente al borrar acuerdo');
});

test('Finanzas 1.3B — Saldo inicial conocido sin historial previo', () => {
  const state = createTestState();

  // El usuario solo sabe que debe 12.500,50 UYU
  const agreement = createFinancingAgreement(state, {
    title: 'Comercio local',
    creditorName: 'Ferretería',
    currency: 'UYU',
    initialRemainingBalance: 12500.5,
  });

  assert.equal(agreement.originalPrincipal, null);
  assert.equal(agreement.priorPaidAmount, null);
  assert.equal(agreement.initialRemainingBalance, 12500.5);

  const bal0 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal0, 12500.5);

  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 2500.5,
    accountId: 'acc-uyu',
  });

  const bal1 = calculateAgreementRemainingBalance(agreement, state.finance.transactions);
  assert.equal(bal1, 10000);
});

test('Finanzas 1.3B — Validación de coherencia aritmética en registro de acuerdo', () => {
  const state = createTestState();

  // Caso incoherente: 50.000 - 10.000 != 35.000
  assert.throws(
    () => {
      createFinancingAgreement(state, {
        title: 'Préstamo',
        creditorName: 'Amigo',
        initialRemainingBalance: 35000,
        originalPrincipal: 50000,
        priorPaidAmount: 10000,
      });
    },
    /Incoherencia aritmética/,
    'Debe rechazar si original - previo no coincide con saldo inicial'
  );

  // Caso coherente: 50.000 - 15.000 === 35.000
  const valid = validateAgreementCoherence({
    initialRemainingBalance: 35000,
    originalPrincipal: 50000,
    priorPaidAmount: 15000,
  });
  assert.equal(valid.valid, true);

  // Pagos previos mayores al original
  const invalidPrior = validateAgreementCoherence({
    initialRemainingBalance: 1000,
    originalPrincipal: 5000,
    priorPaidAmount: 6000,
  });
  assert.equal(invalidPrior.valid, false);
});

test('Finanzas 1.3B — Validaciones de abonos y protección de sobrepago y divisa', () => {
  const state = createTestState();

  const agreement = createFinancingAgreement(state, {
    title: 'Deuda USD',
    creditorName: 'Proveedor',
    currency: 'USD',
    initialRemainingBalance: 500,
  });

  // 1. Rechaza abono menor o igual a cero
  assert.throws(() => {
    addAgreementPayment(state, {
      agreementId: agreement.id,
      amount: 0,
      accountId: 'acc-usd',
    });
  }, /mayor a cero/);

  // 2. Rechaza moneda incompatible (cuenta UYU debitando deuda USD)
  assert.throws(() => {
    addAgreementPayment(state, {
      agreementId: agreement.id,
      amount: 100,
      accountId: 'acc-uyu',
    });
  }, /Moneda incompatible/);

  // 3. Rechaza abono superior al saldo pendiente actual
  assert.throws(() => {
    addAgreementPayment(state, {
      agreementId: agreement.id,
      amount: 600,
      accountId: 'acc-usd',
    });
  }, /supera el saldo pendiente actual/);

  // 4. Acepta abono exacto
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 500,
    accountId: 'acc-usd',
  });

  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 0);
  assert.equal(agreement.status, 'settled');

  // 5. Rechaza abono posterior cuando ya está saldado
  assert.throws(() => {
    addAgreementPayment(state, {
      agreementId: agreement.id,
      amount: 10,
      accountId: 'acc-usd',
    });
  }, /completamente saldado/);
});

test('Finanzas 1.3B — Cancelación y reactivación reactiva (no avance irreversible)', () => {
  const state = createTestState();

  const agreement = createFinancingAgreement(state, {
    title: 'Préstamo Chico',
    creditorName: 'Pedro',
    currency: 'UYU',
    initialRemainingBalance: 10000,
  });

  // Pago total que cancela la deuda
  const tx = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 10000,
    accountId: 'acc-uyu',
  });

  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 0);
  assert.equal(agreement.status, 'settled');
  assert.ok(agreement.settledAt, 'Debe registrar fecha de liquidación');

  // Si se elimina el movimiento de cancelación, el acuerdo vuelve a active y saldo 10.000
  deleteTransaction(state, tx.id);

  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 10000);
  assert.equal(agreement.status, 'active');
  assert.equal(agreement.settledAt, null);
});

test('Finanzas 1.3B — Invariante patrimonial: amortizar capital no reduce el patrimonio neto por segunda vez', () => {
  const state = createTestState();
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco', balance: 20000, initialBalance: 20000, currency: 'UYU' },
  ];

  const agreement = createFinancingAgreement(state, {
    title: 'Deuda Equipo',
    creditorName: 'Tienda',
    currency: 'UYU',
    initialRemainingBalance: 35000,
  });

  // Patrimonio antes del pago: Activos (20.000) - Pasivos (35.000) = -15.000
  const nwBefore = calcNetWorth(state, 'UYU');
  assert.equal(nwBefore, -15000);

  // Se paga capital por $5.000
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 5000,
    accountId: 'acc-1',
  });

  // Saldo cuenta: 15.000. Deuda pendiente: 30.000.
  assert.equal(state.finance.accounts[0].balance, 15000);
  assert.equal(calcDebtsTotal(state, 'UYU'), 30000);

  // Patrimonio después del pago: Activos (15.000) - Pasivos (30.000) = -15.000
  const nwAfter = calcNetWorth(state, 'UYU');
  assert.equal(nwAfter, -15000, 'El patrimonio neto debe permanecer idéntico tras amortizar pasivo');
});

test('Finanzas 1.3B — Gasto de consumo vs amortización de pasivo en presupuesto', () => {
  const state = createTestState();

  const agreement = createFinancingAgreement(state, {
    title: 'Moto',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 10000,
  });

  // Registrar abono a deuda
  const paymentTx = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 4000,
    accountId: 'acc-uyu',
    date: todayISO(),
  });

  assert.equal(isOperationalTransaction(paymentTx), false, 'Abono de deuda no es gasto operativo de consumo');

  // Gasto operativo normal
  const normalTx: Transaction = {
    id: 'tx-food',
    type: 'gasto',
    amount: 500,
    category: 'Comida',
    fixed: 'variable',
    date: todayISO(),
    accountId: 'acc-uyu',
    origin: 'manual',
  };
  state.finance.transactions.push(normalTx);

  assert.equal(isOperationalTransaction(normalTx), true, 'Gasto ordinario es operacional');

  // calcSpentMonth solo debe sumar el gasto operacional de comida (500), no el abono de deuda (4.000)
  // Nota: calcSpentMonth filtra por el mes actual del sistema o el offset
  const monthSpending = calcSpentMonth(state, 0, 'UYU');
  assert.equal(monthSpending, 500, 'El presupuesto de consumo mensual no debe inflarse con la amortización de pasivos');
});

test('Finanzas 1.3B — Convivencia con deudas legacy y vinculación de movimientos existentes', () => {
  const state = createTestState();

  // Deuda legacy preexistente
  state.finance.debts = [
    { id: 'debt-legacy-1', name: 'Préstamo Banco', amount: 5000 },
  ];

  // Acuerdo nuevo sin vinculación a legacy
  const agreement = createFinancingAgreement(state, {
    title: 'Deuda Amigo',
    creditorName: 'Carlos',
    currency: 'UYU',
    initialRemainingBalance: 3000,
    initialReferenceDate: '2026-03-20',
  });

  // calcDebtsTotal suma ambas (5.000 + 3.000 = 8.000)
  assert.equal(calcDebtsTotal(state, 'UYU'), 8000);

  // Si un acuerdo vincula explícitamente a la deuda legacy (reemplazo sin duplicar)
  agreement.linkedLegacyDebtId = 'debt-legacy-1';
  assert.equal(calcDebtsTotal(state, 'UYU'), 3000, 'Debe excluir la deuda legacy enlazada para no duplicar pasivo');

  // Vinculación de un movimiento de gasto manual existente
  const manualTx: Transaction = {
    id: 'tx-manual-1',
    type: 'gasto',
    amount: 1000,
    category: 'Otros',
    fixed: 'variable',
    date: '2026-03-25',
    accountId: 'acc-uyu',
    origin: 'manual',
    currency: 'UYU',
  };
  state.finance.transactions.push(manualTx);

  linkTransactionToAgreement(state, manualTx.id, agreement.id);

  assert.equal(manualTx.agreementId, agreement.id);
  assert.equal(manualTx.origin, 'debt_payment');
  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 2000);
});

test('Finanzas 1.3B — Persistencia, normalización y sincronización 3-way', () => {
  const state = createTestState();

  createFinancingAgreement(state, {
    id: 'agr-test-1',
    title: 'Moto',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 35000.55,
    originalPrincipal: 50000.55,
    priorPaidAmount: 15000,
  });

  // 1. normalizeStoredState normaliza sin perder centésimos ni campos clave
  const cleaned = normalizeStoredState(state);
  assert.ok(cleaned.finance.agreements, 'Debe existir array de agreements en estado normalizado');
  assert.equal(cleaned.finance.agreements.length, 1);
  assert.equal(cleaned.finance.agreements[0].initialRemainingBalance, 35000.55);
  assert.equal(cleaned.finance.agreements[0].currency, 'UYU');

  // 2. syncMerge 3-way
  const localFinance = { ...state.finance, agreements: [...(state.finance.agreements || [])] };
  const remoteFinance = {
    ...state.finance,
    agreements: [
      ...(state.finance.agreements || []),
      {
        id: 'agr-remote-2',
        title: 'Préstamo Remoto',
        creditorName: 'Tío',
        currency: 'USD' as const,
        initialRemainingBalance: 200,
        initialReferenceDate: '2026-03-01',
        status: 'active' as const,
        createdAt: '2026-03-01T12:00:00.000Z',
        updatedAt: '2026-03-01T12:00:00.000Z',
      },
    ],
  };

  const merged = mergeFinanceModule(localFinance, remoteFinance, { ...localFinance, agreements: [] }, {}, () => {});
  assert.equal(merged.agreements.length, 2, 'Merge 3-way debe conservar ambos acuerdos');
  assert.ok(merged.agreements.some((a) => a.id === 'agr-test-1'));
  assert.ok(merged.agreements.some((a) => a.id === 'agr-remote-2'));
});

test('Finanzas 1.3B Microfix — Contrato estricto de initialReferenceDate: pagos anteriores vs posteriores y validaciones', () => {
  const state = createTestState();

  // 1. Crear acuerdo con saldo de $U 35.000 al 01/10/2026
  const agreement = createFinancingAgreement(state, {
    title: 'Moto hermano',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 35000,
    initialReferenceDate: '2026-10-01',
    originalPrincipal: 45000,
    priorPaidAmount: 10000,
  });

  // 2. Movimiento previo existente en el ledger (28/09/2026)
  const priorTx = addTransaction(state, {
    type: 'gasto',
    amount: 2000,
    category: 'Varios',
    fixed: 'variable',
    accountId: 'acc-uyu',
    date: '2026-09-28',
    note: 'Pago previo en efectivo',
    currency: 'UYU',
  });

  // El saldo derivado debe mantenerse en $U 35.000 (no descontar pagos previos no vinculados)
  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 35000);

  // 3. Intento de vincular movimiento anterior al corte vía linkTransactionToAgreement debe ser RECHAZADO
  assert.throws(
    () => linkTransactionToAgreement(state, priorTx.id, agreement.id),
    /anterior a la fecha de corte/,
    'Debe rechazar vincular un movimiento con fecha anterior a initialReferenceDate'
  );

  // 4. Intento de registrar abono retroactivo con fecha anterior al corte vía addAgreementPayment debe ser RECHAZADO
  assert.throws(
    () =>
      addAgreementPayment(state, {
        agreementId: agreement.id,
        amount: 2000,
        accountId: 'acc-uyu',
        date: '2026-09-28',
      }),
    /anterior a la fecha de corte/,
    'Debe rechazar registrar un abono con fecha anterior a initialReferenceDate'
  );

  // 5. Abono válido posterior al corte (05/10/2026) por $U 5.000
  const validPayment = addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 5000,
    accountId: 'acc-uyu',
    date: '2026-10-05',
    note: 'Abono octubre',
  });

  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 30000);
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')!.balance, 43000); // 50000 - 2000 (priorTx) - 5000 (validPayment)

  // 6. Edición de fecha de un movimiento vinculado en updateTransaction
  // a) Permitido si la nueva fecha es igual o posterior a initialReferenceDate
  updateTransaction(state, validPayment.id, {
    type: validPayment.type,
    amount: validPayment.amount,
    category: validPayment.category,
    accountId: validPayment.accountId,
    date: '2026-10-10',
    note: validPayment.note,
    currency: validPayment.currency,
  });
  assert.equal(validPayment.date, '2026-10-10');
  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 30000);

  // b) Rechazado si la nueva fecha es anterior a initialReferenceDate
  assert.throws(
    () =>
      updateTransaction(state, validPayment.id, {
        type: validPayment.type,
        amount: validPayment.amount,
        category: validPayment.category,
        accountId: validPayment.accountId,
        date: '2026-09-20',
        note: validPayment.note,
        currency: validPayment.currency,
      }),
    /anterior a la fecha de corte/,
    'Debe rechazar cambiar la fecha de un abono a un día anterior al corte del acuerdo'
  );

  // 7. Si existiese en el ledger una transacción vinculada con fecha < initialReferenceDate, getAgreementPayments la ignora
  const forcedOldTx: Transaction = {
    id: 'tx-forced-old',
    type: 'gasto',
    amount: 1000,
    category: 'Préstamos y deudas',
    fixed: 'fijo',
    accountId: 'acc-uyu',
    date: '2026-09-15',
    note: 'Pago viejo',
    origin: 'debt_payment',
    agreementId: agreement.id,
    currency: 'UYU',
  };
  state.finance.transactions.push(forcedOldTx);
  // getAgreementPayments y calculateAgreementRemainingBalance ignoran transacciones previas a initialReferenceDate
  assert.equal(getAgreementPayments(agreement, state.finance.transactions).length, 1);
  assert.equal(calculateAgreementRemainingBalance(agreement, state.finance.transactions), 30000);
});

test('Finanzas 1.3B Microfix — Deduplicación y ciclo de vida de vinculación con deuda legacy', () => {
  const state = createTestState();

  state.finance.debts = [
    { id: 'debt-legacy-moto', name: 'Moto hermano legacy', amount: 35000 },
    { id: 'debt-legacy-tarjeta', name: 'Tarjeta pendiente', amount: 5000 },
  ];

  // Pasivo inicial sin acuerdos: 35.000 + 5.000 = 40.000
  assert.equal(calcDebtsTotal(state, 'UYU'), 40000);

  // 1. Registro de acuerdo vinculado explícitamente a la deuda legacy
  const agreement = createFinancingAgreement(state, {
    title: 'Moto hermano acuerdos',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 32000,
    initialReferenceDate: '2026-10-01',
    linkedLegacyDebtId: 'debt-legacy-moto',
  });

  // Pasivo total deduplicado: 32.000 (acuerdo) + 5.000 (tarjeta) = 37.000 (se excluye debt-legacy-moto de 35.000)
  assert.equal(calcDebtsTotal(state, 'UYU'), 37000);

  // 2. Abono en el acuerdo
  addAgreementPayment(state, {
    agreementId: agreement.id,
    amount: 2000,
    accountId: 'acc-uyu',
    date: '2026-10-02',
  });
  // Pasivo total: 30.000 (acuerdo) + 5.000 (tarjeta) = 35.000
  assert.equal(calcDebtsTotal(state, 'UYU'), 35000);

  // 3. Si el acuerdo se cancela, la deuda legacy original vuelve a ser computable
  agreement.status = 'cancelled';
  assert.equal(calcDebtsTotal(state, 'UYU'), 40000, 'Al cancelar el acuerdo, la deuda legacy vuelve a computar');

  // Reactivar
  agreement.status = 'active';
  assert.equal(calcDebtsTotal(state, 'UYU'), 35000);

  // 4. Si el acuerdo se elimina, la deuda legacy original vuelve a ser computable
  deleteFinancingAgreement(state, agreement.id);
  assert.equal(calcDebtsTotal(state, 'UYU'), 40000, 'Al eliminar el acuerdo, la deuda legacy vuelve a computar');
});

test('Identidad Visual 1C-B1 — Stream Guard protege todos los importes secundarios en Acuerdos y Balance Patrimonial', () => {
  const state = createTestState();
  state.settings = { ...state.settings, privacyMode: true };

  state.finance.investments = [{ id: 'inv-1', name: 'Plazo Fijo', amount: 88000 }];
  state.finance.debts = [
    { id: 'debt-linked', name: 'Moto Hermano Legacy', amount: 35000, monthlyPayment: 4500, dueDate: '2026-11-10' },
    { id: 'debt-unlinked', name: 'Tarjeta Oca', amount: 12500, monthlyPayment: 2500, dueDate: '2026-11-15' },
  ];

  // Acuerdo 1: Con monto original, pagos previos y abonos en LifeOS
  const agr1 = createFinancingAgreement(state, {
    title: 'Moto Honda',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 35000,
    initialReferenceDate: '2026-10-01',
    originalPrincipal: 50000,
    priorPaidAmount: 15000,
    linkedLegacyDebtId: 'debt-linked',
  });
  addAgreementPayment(state, {
    agreementId: agr1.id,
    amount: 5000,
    accountId: 'acc-uyu',
    date: '2026-10-05',
    note: 'Abono moto',
  });

  // Acuerdo 2: Sin monto original conocido (usa Saldo inicial al...)
  createFinancingAgreement(state, {
    title: 'Préstamo personal',
    creditorName: 'Juan',
    currency: 'UYU',
    initialRemainingBalance: 18400,
    initialReferenceDate: '2026-10-02',
  });

  // Acuerdo 3: Compra financiada en cuotas USD con adquisición
  createFinancingAgreement(state, {
    title: 'MacBook Pro',
    creditorName: 'Tienda Oficial',
    currency: 'USD',
    initialRemainingBalance: 1800,
    initialReferenceDate: '2026-10-10',
    originalPrincipal: 1800,
    schedule: {
      totalInstallments: 6,
      installmentAmount: 300,
      firstDueDate: '2026-11-10',
      dueDay: 10,
      frequency: 'monthly',
    },
    acquisition: {
      acquisitionDate: '2026-10-10',
      category: 'Tecnología',
      totalPurchaseAmount: 1800,
    },
  });

  const html = renderToStaticMarkup(
    React.createElement(FinanceAccountsView, {
      state,
      onUpdateState: () => {},
      onAddAccount: () => {},
      onDeleteAccount: () => {},
      onAddDebt: () => {},
      onDeleteDebt: () => {},
      onAddInvestment: () => {},
      onDeleteInvestment: () => {},
    })
  );

  // 1. Ningún atributo title="..." puede exponer importes monetarios ($U o US$)
  const titleMatches = [...html.matchAll(/title="([^"]*)"/g)].map((m) => m[1]);
  for (const titleText of titleMatches) {
    assert.ok(
      !titleText.includes('$U') && !titleText.includes('US$'),
      `El atributo title no debe exponer importes en Stream Guard: "${titleText}"`
    );
  }

  // 2. Si eliminamos todos los bloques protegidos por .privacy-amount, no debe quedar ningún importe monetario expuesto
  const htmlWithoutPrivacyProtected = html.replace(
    /<([a-z0-9]+)[^>]*class="[^"]*privacy-amount[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
    '[PROTECTED]'
  );

  const sensitiveFormattedAmounts = [
    formatMoney(50000, 'UYU'), // Total acordado
    formatMoney(15000, 'UYU'), // Pagos previos
    formatMoney(5000, 'UYU'),  // Abonos en LifeOS
    formatMoney(30000, 'UYU'), // Saldo pendiente acuerdo 1
    formatMoney(20000, 'UYU'), // Progreso acumulado (15000 + 5000)
    formatMoney(18400, 'UYU'), // Saldo inicial acuerdo 2
    formatMoney(1800, 'USD'),  // Compra adquirida / saldo acuerdo 3
    formatMoney(300, 'USD'),   // Importe de cuota y próximo vencimiento
    formatMoney(88000, 'UYU'), // Inversión
    formatMoney(35000, 'UYU'), // Importe original deuda legacy vinculada
    formatMoney(12500, 'UYU'), // Deuda legacy no vinculada y subtotal computado
  ];

  for (const formatted of sensitiveFormattedAmounts) {
    assert.ok(
      html.includes(formatted),
      `El importe ${formatted} debe renderizarse en el DOM`
    );
    assert.ok(
      !htmlWithoutPrivacyProtected.includes(formatted),
      `El importe ${formatted} quedó expuesto fuera de <PrivacyAmount> (Stream Guard)`
    );
  }
});

test('Identidad Visual 1C-B1 — Estructura patrimonial en 3 bloques, separación UYU/USD y deuda legacy vinculada sin tachado', () => {
  const state = createTestState();
  // Caso borde USD: cuenta USD con saldo 0 y obligación USD activa
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Santander UYU', balance: 40000, initialBalance: 40000, currency: 'UYU' },
    { id: 'acc-usd-zero', name: 'Caja USD', balance: 0, initialBalance: 0, currency: 'USD' },
  ];
  state.finance.debts = [
    { id: 'debt-1', name: 'Moto Hermano', amount: 35000 },
    { id: 'debt-2', name: 'Préstamo Cooperativa', amount: 10000 },
  ];

  createFinancingAgreement(state, {
    title: 'Moto Hermano Acuerdo',
    creditorName: 'Hermano',
    currency: 'UYU',
    initialRemainingBalance: 25000,
    initialReferenceDate: '2026-10-01',
    linkedLegacyDebtId: 'debt-1',
  });

  createFinancingAgreement(state, {
    title: 'Notebook USD',
    creditorName: 'Tienda',
    currency: 'USD',
    initialRemainingBalance: 600,
    initialReferenceDate: '2026-10-01',
  });

  const html = renderToStaticMarkup(
    React.createElement(FinanceAccountsView, {
      state,
      onUpdateState: () => {},
      onAddAccount: () => {},
      onDeleteAccount: () => {},
      onAddDebt: () => {},
      onDeleteDebt: () => {},
      onAddInvestment: () => {},
      onDeleteInvestment: () => {},
    })
  );

  // 1. Presencia de los tres bloques diferenciados
  assert.ok(html.includes('Patrimonio por moneda'));
  assert.ok(html.includes('Acuerdos y financiaciones'));
  assert.ok(html.includes('Inversiones y activos'));
  assert.ok(html.includes('Otros pasivos registrados'));

  // 2. Separación explícita UYU y USD incluso con liquidez USD = 0 y patrimonio neto USD negativo (-600)
  assert.ok(html.includes('Patrimonio neto UYU'));
  assert.ok(html.includes('Patrimonio neto USD'));
  assert.ok(html.includes(formatMoney(-600, 'USD')), 'Debe mostrar Patrimonio neto USD negativo (-US$ 600)');

  // 3. Deuda legacy vinculada: muestra explicación clara, conserva importe original y NO usa line-through
  assert.ok(html.includes('Contabilizada en Acuerdos · Excluida de este subtotal'));
  assert.ok(html.includes('Importe original'));
  assert.ok(!html.includes('line-through'), 'No debe utilizarse texto tachado (line-through) para deudas vinculadas');
});

