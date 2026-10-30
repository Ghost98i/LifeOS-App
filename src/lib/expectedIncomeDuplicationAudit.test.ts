import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import { addTransaction, confirmExpectedIncome } from './financeFlows';
import { cashFlowProjection } from './calculations';
import { deriveCycleIdentity } from './financeMatching';

test('REGRESIÓN CORREGIDA: Camino A — Vincular cobro manual previene duplicación y mantiene saldo contable íntegro', () => {
  const state = defaultState();
  const today = '2026-10-21';

  // 1. Estado Inicial: Cuenta con saldo inicial $10.000
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.categories = [{ id: 'cat-sueldo', name: 'Sueldo', active: true }];

  // 2. Se crea un ingreso previsto mensual de $U 15.000
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: today,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // 3. PASO 1: El usuario registra manualmente el cobro mediante "+ Movimiento" (Ingreso de $15.000)
  const manualTx = addTransaction(state, {
    type: 'ingreso',
    amount: 15000,
    category: 'cat-sueldo',
    fixed: 'variable',
    accountId: 'acc-1',
    date: today,
    note: 'Cobro de sueldo en ventanilla / app banco'
  });

  // Estado intermedio tras registro manual
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000, 'El saldo real subió a $25.000 con la carga manual');
  assert.ok(!manualTx.expectedIncomeId, 'La transacción manual inicialmente no tiene vínculo con expectedIncomeId');

  // 4. PASO 2: El usuario va a la pestaña "Futuro" y elige "Vincular a este movimiento"
  const linkedTx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    matchedTransactionId: manualTx.id,
  });

  // 5. INSPECCIÓN DE RESULTADOS: EL DEFECTO DE DUPLICACIÓN QUEDA 100% SUBSANADO
  const observedTxCount = state.finance.transactions.length;
  const observedBalance = state.finance.accounts[0].balance;
  const proj = cashFlowProjection(state, 30, today, 'UYU');
  const observedDay0Balance = proj.dailyTrajectory[0].endingBalance;

  // COMPORTAMIENTO CORREGIDO:
  // - Sigue existiendo exactamente 1 transacción contable en el ledger (NO se duplicó a 2)
  assert.equal(observedTxCount, 1, 'CORRECTO: Se mantiene exactamente una transacción en el libro diario');
  // - El saldo real se mantiene en $25.000 exactos (NO se infló a $40.000)
  assert.equal(observedBalance, 25000, 'CORRECTO: El saldo real se mantiene en $U 25.000 (sin duplicación de liquidez)');
  // - La proyección futura parte de los $25.000 reales
  assert.equal(observedDay0Balance, 25000, 'CORRECTO: El saldo inicial de proyección parte de la liquidez real verdadera');
  // - La transacción ahora tiene trazabilidad completa del origen
  assert.equal(manualTx.expectedIncomeId, 'inc-sueldo', 'CORRECTO: La transacción manual quedó vinculada a la previsión');
  assert.equal(manualTx.id, linkedTx.id);

  // - La previsión avanzó al siguiente mes
  const incomeAfter = state.finance.expectedIncomes.find((i) => i.id === 'inc-sueldo')!;
  assert.equal(incomeAfter.startDate, '2026-11-21', 'CORRECTO: La fecha de la previsión avanzó automáticamente +1 mes');
  assert.equal(incomeAfter.lastSettledTxId, manualTx.id, 'CORRECTO: lastSettledTxId registra el ID de la transacción');
  assert.ok(incomeAfter.settledTxIds?.includes(manualTx.id), 'CORRECTO: settledTxIds contiene la transacción');
});

test('REGRESIÓN CORREGIDA: Camino B — Dos ingresos legítimos por igual importe y fecha coexisten sin fusionarse por error', () => {
  const state = defaultState();
  const today = '2026-10-21';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.categories = [
    { id: 'cat-sueldo', name: 'Sueldo', active: true },
    { id: 'cat-ventas', name: 'Ventas', active: true },
  ];

  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: today,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // 1. Cobro legítimo 1: Una venta casual o changa independiente por $15.000
  const ventaTx = addTransaction(state, {
    type: 'ingreso',
    amount: 15000,
    category: 'cat-ventas',
    fixed: 'variable',
    accountId: 'acc-1',
    date: today,
    note: 'Venta de artículo usado en marketplace'
  });

  assert.equal(state.finance.accounts[0].balance, 25000);

  // 2. Cobro legítimo 2: El usuario confirma el cobro de su sueldo como un ingreso NUEVO e independiente
  const sueldoTx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: today,
  });

  // Ambos ingresos legítimos deben coexistir plenamente
  assert.equal(state.finance.transactions.length, 2, 'Ambos ingresos legítimos deben existir en el ledger');
  assert.equal(state.finance.accounts[0].balance, 40000, 'Saldo = $10.000 inicial + $15.000 venta + $15.000 sueldo = $40.000');
  assert.ok(!ventaTx.expectedIncomeId, 'La venta independiente no fue tocada');
  assert.equal(sueldoTx.expectedIncomeId, 'inc-sueldo', 'El sueldo tiene su origen en la previsión');
  assert.notEqual(ventaTx.id, sueldoTx.id, 'Tienen IDs distintos e independientes');
});

test('REGRESIÓN CORREGIDA: Idempotencia — Segundo intento de confirmar la misma ocurrencia no duplica saldo (previene dobles clics)', () => {
  const state = defaultState();
  const today = '2026-10-21';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: today,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // Primer clic en "Confirmar cobro"
  const tx1 = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: today,
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000);

  // Segundo clic rápido en la misma ocurrencia (como envía FinanzasView con su targetCycle)
  const tx2 = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: today,
    targetCycle: 'cycle-2026-10-21',
  });

  // El segundo intento devuelve la misma transacción sin crear otra ni tocar el saldo
  assert.equal(state.finance.transactions.length, 1, 'No debe crearse una segunda transacción');
  assert.equal(state.finance.accounts[0].balance, 25000, 'El saldo no debe incrementarse nuevamente');
  assert.equal(tx1.id, tx2.id, 'Debe devolver la misma transacción idempotente');

  // Si se invoca sin targetCycle (evalúa ciclo vigente que avanzó a noviembre) sin autorización expresa:
  assert.throws(
    () => {
      confirmExpectedIncome(state, {
        expectedIncomeId: 'inc-sueldo',
        accountId: 'acc-1',
        date: today,
      });
    },
    /cobro anticipado/,
    'CORRECTO: No devuelve silenciosamente la tx de octubre; comunica inequívocamente que la operación no se realizó'
  );
});

test('FALLO 3 RESUELTO: Reintento accidental al día siguiente (2026-10-22) no liquida noviembre involuntariamente', () => {
  const state = defaultState();
  const oct21 = '2026-10-21';
  const oct22 = '2026-10-22';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: oct21,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // 1. Confirmar octubre con fecha efectiva 2026-10-21
  const txOct = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct21,
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000);
  assert.equal(txOct.date, oct21);

  // Comprobar que la previsión avanzó a noviembre en su metadata
  const incomeAfterOct = state.finance.expectedIncomes.find((i) => i.id === 'inc-sueldo')!;
  assert.equal(incomeAfterOct.startDate, '2026-11-21');

  // 2. Reintentar accidentalmente el cobro anterior el 2026-10-22 (ej. pestaña vieja o reintento de usuario)
  // CASO 2A: Reintento con targetCycle explícito de octubre (como envía la UI cuando el usuario tenía la fila de octubre)
  const txRetryCycle = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct22,
    targetCycle: 'cycle-2026-10-21',
  });

  assert.equal(state.finance.transactions.length, 1, 'No crea transacción duplicada para el mismo ciclo');
  assert.equal(state.finance.accounts[0].balance, 25000, 'Saldo no sube a $40.000');
  assert.equal(txRetryCycle.id, txOct.id, 'Devuelve la transacción ya liquidada');

  // CASO 2B: Invocación el 2026-10-22 sin targetCycle ni allowAdvance (intento de ciclo futuro sin autorización)
  assert.throws(
    () => {
      confirmExpectedIncome(state, {
        expectedIncomeId: 'inc-sueldo',
        accountId: 'acc-1',
        date: oct22,
      });
    },
    /cobro anticipado/,
    'CORRECTO: No devuelve silenciosamente la tx de octubre; comunica inequívocamente que la operación no se realizó'
  );

  assert.equal(state.finance.transactions.length, 1, 'CORRECTO: No liquida noviembre en octubre');
  assert.equal(state.finance.accounts[0].balance, 25000, 'CORRECTO: Saldo permanece en $U 25.000 sin cobrar doble');
});

test('FALLO 3 RESUELTO: Cobro anticipado legítimo de noviembre se admite cuando la acción es explícita e inequívoca', () => {
  const state = defaultState();
  const oct21 = '2026-10-21';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: oct21,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // 1. Confirmar octubre
  const txOct = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct21,
  });
  assert.equal(state.finance.accounts[0].balance, 25000);

  // 2. El usuario pretende explícitamente cobrar noviembre por adelantado (aguinaldo / pago anticipado legítimo)
  const txNovAnticipado = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: '2026-10-22',
    targetCycle: 'cycle-2026-11-21',
    allowAdvance: true,
  });

  assert.equal(state.finance.transactions.length, 2, 'Crea la segunda transacción porque fue autorizada inequívocamente');
  assert.equal(state.finance.accounts[0].balance, 40000, 'Saldo = $25.000 + $15.000 anticipado = $40.000');
  assert.equal(txNovAnticipado.matchedCycle, 'cycle-2026-11-21', 'Liquidó el ciclo de noviembre');
  assert.notEqual(txOct.id, txNovAnticipado.id);
});

test('PROBLEMA 1 VERIFICADO: Ruta real de FinanzasView con targetCycle no elude la protección contra cobros anticipados', () => {
  const state = defaultState();
  const oct21 = '2026-10-21';
  const oct22 = '2026-10-22';

  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', balance: 10000, initialBalance: 10000, currency: 'UYU' }
  ];
  state.finance.transactions = [];
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo Mensual',
      amount: 15000,
      currency: 'UYU',
      startDate: oct21,
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-1',
      active: true,
    }
  ];

  // 1. Paso 1: Enviar confirmación de octubre con los argumentos EXACTOS de FinanzasView
  // FinanzasView deriva: targetCycle = deriveCycleIdentity(inc, 'expected_income').cycleKey ('cycle-2026-10-21')
  const targetCycleOct = deriveCycleIdentity(state.finance.expectedIncomes[0], 'expected_income').cycleKey;
  assert.equal(targetCycleOct, 'cycle-2026-10-21');

  const txOct = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct21,
    targetCycle: targetCycleOct,
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000);
  assert.equal(txOct.matchedCycle, 'cycle-2026-10-21');

  // 2. Paso 2: Actualizar el estado y volver a abrir el formulario el 22/10
  // La previsión avanzó a 2026-11-21
  const incomeNov = state.finance.expectedIncomes[0];
  assert.equal(incomeNov.startDate, '2026-11-21');
  const targetCycleNov = deriveCycleIdentity(incomeNov, 'expected_income').cycleKey;
  assert.equal(targetCycleNov, 'cycle-2026-11-21');

  // 3. Paso 3: Confirmar el 22/10 enviando exactamente targetCycle: 'cycle-2026-11-21'
  // SIN expresar intención de cobrar noviembre anticipadamente (allowAdvance: false o undefined)
  // Exigencia contable: NO devolver silenciosamente la transacción anterior de octubre; comunicar inequívocamente el rechazo
  assert.throws(
    () => {
      confirmExpectedIncome(state, {
        expectedIncomeId: 'inc-sueldo',
        accountId: 'acc-1',
        date: oct22,
        targetCycle: targetCycleNov,
        // allowAdvance NO está autorizado (false/undefined)
      });
    },
    /cobro anticipado/,
    'CORRECTO: No devuelve silenciosamente la tx de octubre; comunica inequívocamente que la operación no se realizó'
  );

  // 4. Paso 4: VERIFICACIONES OBLIGATORIAS TRAS RECHAZO:
  // - No se debe crear una segunda transacción
  assert.equal(state.finance.transactions.length, 1, 'CORRECTO: No se creó una segunda transacción');
  // - No debe aumentar el saldo
  assert.equal(state.finance.accounts[0].balance, 25000, 'CORRECTO: El saldo no aumentó (se mantiene en $25.000)');
  // - La fecha de la previsión permanece en 2026-11-21 (no avanzó a diciembre)
  assert.equal(state.finance.expectedIncomes[0].startDate, '2026-11-21');

  // 5. Paso 5: Modal abierto con estado desactualizado (enviando targetCycle: 'cycle-2026-10-21')
  const resultModalDesactualizado = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct22,
    targetCycle: 'cycle-2026-10-21',
  });
  assert.equal(state.finance.transactions.length, 1, 'Modal desactualizado no duplica');
  assert.equal(state.finance.accounts[0].balance, 25000);
  assert.equal(resultModalDesactualizado.id, txOct.id);

  // 6. Paso 6: targetCycle que no corresponda al ciclo vigente ni liquidado (ej. cycle-2027-01-01)
  assert.throws(
    () => {
      confirmExpectedIncome(state, {
        expectedIncomeId: 'inc-sueldo',
        accountId: 'acc-1',
        date: oct22,
        targetCycle: 'cycle-2027-01-01',
      });
    },
    /no corresponde al ciclo vigente ni a un ciclo liquidado/,
    'Debe rechazar un targetCycle arbitrario o no sincronizado'
  );

  // 7. Paso 7: Cobro anticipado legítimo con autorización expresa
  const txNovLegitimo = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-1',
    date: oct22,
    targetCycle: targetCycleNov,
    allowAdvance: true, // Autorización expresa de cobro anticipado
  });

  assert.equal(state.finance.transactions.length, 2, 'Crea la segunda transacción porque fue autorizada expresamente');
  assert.equal(state.finance.accounts[0].balance, 40000, 'Saldo aumentó a $40.000');
  assert.equal(txNovLegitimo.matchedCycle, 'cycle-2026-11-21');
  assert.notEqual(txNovLegitimo.id, txOct.id);
  assert.equal(state.finance.expectedIncomes[0].startDate, '2026-12-21', 'Avanzó a diciembre tras cobrar noviembre');
});
