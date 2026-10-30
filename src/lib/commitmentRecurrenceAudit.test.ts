import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import { confirmFinancialCommitment } from './financeFlows';

test('PROBLEMA 2 VERIFICADO: Compromiso mensual Antel — Pago de octubre, pago de noviembre y prevención de doble pago de octubre', () => {
  const state = defaultState();
  const oct21 = '2026-10-21';
  const nov21 = '2026-11-21';

  // 1. Crear cuenta con saldo inicial $10.000
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];

  // Paso 1: Crear compromiso mensual Antel de $U 1.500, vencimiento 2026-10-21
  state.finance.commitments = [
    {
      id: 'com-antel',
      name: 'Antel Fibra',
      amount: 1500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: oct21,
      accountId: 'acc-1',
      category: 'Servicios',
      active: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  ];

  // Paso 2: Pagar octubre
  const txOct = confirmFinancialCommitment(state, {
    commitmentId: 'com-antel',
    date: oct21,
  });
  assert.equal(txOct.commitmentId, 'com-antel');

  // Paso 3: Verificar que el vencimiento avance a noviembre
  const comAfterOct = state.finance.commitments.find((c) => c.id === 'com-antel')!;
  assert.equal(comAfterOct.nextDueDate, nov21, 'El vencimiento avanzó correctamente a noviembre');
  assert.equal(state.finance.transactions.length, 1, 'Exactamente una transacción registrada');
  assert.equal(state.finance.accounts[0].balance, 8500, 'Saldo = $10.000 - $1.500 = $8.500');
  assert.equal(txOct.matchedCycle, 'cycle-2026-10-21');
  assert.equal(txOct.id, `settle-com-antel-cycle-2026-10-21`);

  // Paso 4: Pagar noviembre mediante confirmFinancialCommitment
  // (Anteriormente fallaba porque commitment.lastSettledTxId devolvía la tx de octubre)
  const txNov = confirmFinancialCommitment(state, {
    commitmentId: 'com-antel',
    date: nov21,
  });

  // Paso 5: Exigir dos transacciones de gasto distintas, saldo reducido dos veces y siguiente vencimiento correcto
  assert.notEqual(txOct.id, txNov.id, 'CORRECTO: Las transacciones de octubre y noviembre tienen IDs distintos');
  assert.equal(txNov.matchedCycle, 'cycle-2026-11-21', 'CORRECTO: La segunda transacción corresponde al ciclo de noviembre');
  assert.equal(state.finance.transactions.length, 2, 'CORRECTO: Existen dos transacciones en el libro diario');
  assert.equal(state.finance.accounts[0].balance, 7000, 'CORRECTO: Saldo = $10.000 - $1.500 - $1.500 = $7.000');
  assert.equal(comAfterOct.nextDueDate, '2026-12-21', 'CORRECTO: El vencimiento avanzó a diciembre tras pagar noviembre');
  assert.equal(comAfterOct.lastSettledTxId, txNov.id);

  // Paso 6: Reintentar el pago de octubre con su identidad original y exigir que no duplique
  const txRetryOct = confirmFinancialCommitment(state, {
    commitmentId: 'com-antel',
    targetCycle: 'cycle-2026-10-21',
    date: oct21,
  });

  assert.equal(txRetryOct.id, txOct.id, 'CORRECTO: Reintentar octubre retorna la transacción de octubre existente');
  assert.equal(state.finance.transactions.length, 2, 'CORRECTO: No se creó una tercera transacción');
  assert.equal(state.finance.accounts[0].balance, 7000, 'CORRECTO: El saldo permanece en $7.000 (sin doble débito)');
});

test('PROBLEMA 2 VERIFICADO: Compromiso único (frequency: once) — Liquidación e idempotencia estricta', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.commitments = [
    {
      id: 'com-unico',
      name: 'Matrícula Anual',
      amount: 4000,
      currency: 'UYU',
      frequency: 'once',
      nextDueDate: '2026-10-25',
      accountId: 'acc-1',
      category: 'Educación',
      active: true,
      status: 'pending',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  ];

  // 1. Pagar compromiso único
  const tx1 = confirmFinancialCommitment(state, {
    commitmentId: 'com-unico',
    date: '2026-10-25',
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 6000);
  const com = state.finance.commitments[0];
  assert.equal(com.active, false);
  assert.equal(com.status, 'paid');

  // 2. Reintentar el pago del compromiso único ya pagado
  const tx2 = confirmFinancialCommitment(state, {
    commitmentId: 'com-unico',
    date: '2026-10-25',
  });

  assert.equal(tx2.id, tx1.id, 'Idempotencia: devuelve la misma transacción');
  assert.equal(state.finance.transactions.length, 1, 'No crea transacción duplicada');
  assert.equal(state.finance.accounts[0].balance, 6000, 'Saldo no se reduce dos veces');
});

test('PROBLEMA 2 VERIFICADO: Compromiso en cuotas numeradas — Liquidación cuota a cuota e idempotencia por cuota', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 20000, initialBalance: 20000, currency: 'UYU' }
  ];
  state.finance.commitments = [
    {
      id: 'com-cuotas',
      name: 'Seguro Auto',
      amount: 3000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-21',
      totalInstallments: 3,
      currentInstallment: 1,
      totalOccurrences: 3,
      remainingOccurrences: 3,
      accountId: 'acc-1',
      category: 'Transporte',
      active: true,
      status: 'pending',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  ];

  // Cuota 1
  const txCuota1 = confirmFinancialCommitment(state, { commitmentId: 'com-cuotas', date: '2026-10-21' });
  assert.equal(txCuota1.matchedCycle, 'inst-1');
  assert.equal(state.finance.accounts[0].balance, 17000);
  assert.equal(state.finance.commitments[0].currentInstallment, 2);

  // Cuota 2
  const txCuota2 = confirmFinancialCommitment(state, { commitmentId: 'com-cuotas', date: '2026-11-21' });
  assert.equal(txCuota2.matchedCycle, 'inst-2');
  assert.equal(state.finance.accounts[0].balance, 14000);
  assert.equal(state.finance.commitments[0].currentInstallment, 3);
  assert.notEqual(txCuota1.id, txCuota2.id);

  // Cuota 3 (última)
  const txCuota3 = confirmFinancialCommitment(state, { commitmentId: 'com-cuotas', date: '2026-12-21' });
  assert.equal(txCuota3.matchedCycle, 'inst-3');
  assert.equal(state.finance.accounts[0].balance, 11000);
  assert.equal(state.finance.commitments[0].active, false);
  assert.equal(state.finance.commitments[0].status, 'paid');
  assert.equal(state.finance.transactions.length, 3);

  // Reintento de la cuota 1 con su identidad original (inst-1)
  const txRetryCuota1 = confirmFinancialCommitment(state, {
    commitmentId: 'com-cuotas',
    targetCycle: 'inst-1',
  });
  assert.equal(txRetryCuota1.id, txCuota1.id, 'Idempotencia: retorna cuota 1 sin duplicar');
  assert.equal(state.finance.transactions.length, 3, 'Total de transacciones se mantiene en 3');
  assert.equal(state.finance.accounts[0].balance, 11000, 'Saldo se mantiene en $11.000');
});

test('PROBLEMA 1 VERIFICADO: Antel mensual el 22/10 con argumentos reales de FinanzasView sin allowAdvance rechaza pago anticipado accidental', () => {
  const state = defaultState();
  const oct21 = '2026-10-21';
  const oct22 = '2026-10-22';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.commitments = [
    {
      id: 'com-antel',
      name: 'Antel Fibra',
      amount: 1500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: oct21,
      accountId: 'acc-1',
      category: 'Servicios',
      active: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  ];

  // 1. Pagar octubre el 21/10
  const txOct = confirmFinancialCommitment(state, {
    commitmentId: 'com-antel',
    amount: 1500,
    accountId: 'acc-1',
    date: oct21,
  });

  assert.equal(txOct.commitmentId, 'com-antel');
  assert.equal(state.finance.accounts[0].balance, 8500, 'Saldo se reduce a $8.500');
  assert.equal(state.finance.commitments[0].nextDueDate, '2026-11-21', 'Vencimiento avanzó al 21/11');

  // 2. Repetir la acción el 22/10 con los argumentos reales de FinanzasView (sin targetCycle ni allowAdvance)
  assert.throws(
    () => {
      confirmFinancialCommitment(state, {
        commitmentId: 'com-antel',
        amount: 1500,
        accountId: 'acc-1',
        date: oct22,
        // Sin targetCycle ni allowAdvance
      });
    },
    /pago anticipado/,
    'CORRECTO: Debe rechazar el pago anticipado accidental de noviembre si no hay autorización explícita'
  );

  // Exigir que no se haya modificado el saldo ni creado una segunda transacción
  assert.equal(state.finance.transactions.length, 1, 'No se creó transacción de noviembre');
  assert.equal(state.finance.accounts[0].balance, 8500, 'Saldo permanece intacto en $8.500');
  assert.equal(state.finance.commitments[0].nextDueDate, '2026-11-21', 'Vencimiento no avanzó a diciembre');

  // 3. Si el usuario autoriza explícitamente el pago anticipado con allowAdvance: true
  const txNovAnticipado = confirmFinancialCommitment(state, {
    commitmentId: 'com-antel',
    amount: 1500,
    accountId: 'acc-1',
    date: oct22,
    allowAdvance: true,
  });

  assert.equal(state.finance.transactions.length, 2, 'Crea la transacción de noviembre porque fue autorizada');
  assert.equal(state.finance.accounts[0].balance, 7000, 'Saldo baja a $7.000');
  assert.equal(txNovAnticipado.matchedCycle, 'cycle-2026-11-21');
  assert.equal(state.finance.commitments[0].nextDueDate, '2026-12-21', 'Avanza a diciembre tras pago anticipado');
});

test('DOMINIO: Rechazo estricto de targetCycle arbitrario o inválido en confirmFinancialCommitment', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.commitments = [
    {
      id: 'com-antel',
      name: 'Antel Fibra',
      amount: 1500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-21',
      accountId: 'acc-1',
      category: 'Servicios',
      active: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  ];

  // Intento con clave de ciclo arbitraria que no corresponde al ciclo vigente ni a ocurrencias liquidadas
  assert.throws(
    () => {
      confirmFinancialCommitment(state, {
        commitmentId: 'com-antel',
        targetCycle: 'cycle-2029-99-99',
        date: '2026-10-21',
      });
    },
    /no corresponde al ciclo vigente ni a una ocurrencia liquidada/,
    'Debe rechazar claves de ciclo arbitrarias'
  );

  assert.equal(state.finance.transactions.length, 0);
  assert.equal(state.finance.accounts[0].balance, 10000);
});
