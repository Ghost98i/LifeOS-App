import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from './storage';
import {
  addTransaction,
  confirmExpectedIncome,
  deleteTransaction,
  updateTransaction,
  linkTransactionToExpectedIncome
} from './financeFlows';

function setupState() {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Itaú Pesos', balance: 10000, initialBalance: 10000, currency: 'UYU' },
    { id: 'acc-usd', name: 'Itaú Dólares', balance: 1000, initialBalance: 1000, currency: 'USD' }
  ];
  state.finance.transactions = [];
  state.finance.categories = [
    { id: 'cat-sueldo', name: 'Sueldo', active: true },
    { id: 'cat-servicios', name: 'Servicios', active: true },
  ];
  state.finance.expectedIncomes = [];
  return state;
}

test('1. Compatibilidad: Ingreso puntual (frequency: once)', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-once',
      name: 'Venta de Laptop',
      amount: 18000,
      currency: 'UYU',
      startDate: '2026-10-25',
      frequency: 'once',
      category: 'cat-ventas',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-once',
    date: '2026-10-25',
  });

  assert.equal(tx.amount, 18000);
  assert.equal(state.finance.accounts[0].balance, 28000);
  const inc = state.finance.expectedIncomes.find((i) => i.id === 'inc-once')!;
  assert.equal(inc.active, false, 'Ingreso puntual debe desactivarse tras confirmarse');
  assert.equal(inc.lastSettledTxId, tx.id);
});

test('2. Compatibilidad: Ingreso mensual recurrente', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-mensual',
      name: 'Honorarios Mensuales',
      amount: 25000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-mensual',
    date: '2026-10-21',
  });
  assert.equal(tx.expectedIncomeId, 'inc-mensual');

  assert.equal(state.finance.accounts[0].balance, 35000);
  const inc = state.finance.expectedIncomes.find((i) => i.id === 'inc-mensual')!;
  assert.equal(inc.startDate, '2026-11-21', 'Debe avanzar +1 mes');
  assert.equal(inc.active, true, 'Debe permanecer activo para el próximo mes');
});

test('3. Compatibilidad: Ingreso pausado rechaza confirmación accidental', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-pausado',
      name: 'Alquiler Cochera',
      amount: 4000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-rentas',
      accountId: 'acc-uyu',
      active: false, // Pausado
    }
  ];

  assert.throws(
    () => confirmExpectedIncome(state, { expectedIncomeId: 'inc-pausado' }),
    /pausado/,
    'Debe exigir reanudar antes de confirmar cobro'
  );
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(state.finance.accounts[0].balance, 10000);
});

test('4. Compatibilidad: Ingreso manual vinculado a previsión (Camino A)', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo',
      amount: 20000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const manualTx = addTransaction(state, {
    type: 'ingreso',
    amount: 20000,
    category: 'cat-sueldo',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  assert.equal(state.finance.accounts[0].balance, 30000);

  const linked = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    matchedTransactionId: manualTx.id,
  });
  assert.equal(linked.id, manualTx.id);

  assert.equal(state.finance.transactions.length, 1, 'No crea transacción duplicada');
  assert.equal(state.finance.accounts[0].balance, 30000, 'Saldo no sube dos veces');
  assert.equal(manualTx.expectedIncomeId, 'inc-sueldo');
});

test('5. Compatibilidad: Confirmación de ingreso sin movimiento previo (Camino B)', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-nuevo',
      name: 'Dividendo Accionario',
      amount: 5000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-inversiones',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-nuevo',
    date: '2026-10-21',
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 15000);
  assert.equal(tx.expectedIncomeId, 'inc-nuevo');
});

test('6. Compatibilidad: Segundo intento de confirmar la misma ocurrencia es idempotente', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo',
      amount: 15000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const t1 = confirmExpectedIncome(state, { expectedIncomeId: 'inc-sueldo' });
  const t2 = confirmExpectedIncome(state, { expectedIncomeId: 'inc-sueldo', targetCycle: t1.matchedCycle });

  assert.equal(t1.id, t2.id);
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 25000);
});

test('7. Compatibilidad: Dos ingresos legítimos por igual importe y fecha', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo',
      amount: 15000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  // Manual no relacionado
  const tx1 = addTransaction(state, {
    type: 'ingreso',
    amount: 15000,
    category: 'cat-servicios',
    accountId: 'acc-uyu',
    date: '2026-10-21',
    note: 'Cobro por asesoría puntual externa'
  });

  // Previsión confirmada como nuevo cobro
  const tx2 = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  assert.equal(state.finance.transactions.length, 2);
  assert.equal(state.finance.accounts[0].balance, 40000);
  assert.notEqual(tx1.id, tx2.id);
});

test('8. Compatibilidad: Edición y eliminación de una transacción vinculada', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-once',
      name: 'Bono Especial',
      amount: 12000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'once',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, { expectedIncomeId: 'inc-once' });
  assert.equal(state.finance.accounts[0].balance, 22000);
  assert.equal(state.finance.expectedIncomes[0].active, false);

  // Edición: cambiar monto de 12.000 a 14.000
  updateTransaction(state, tx.id, {
    type: 'ingreso',
    amount: 14000,
    category: 'cat-sueldo',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  assert.equal(state.finance.accounts[0].balance, 24000);
  const updatedTx = state.finance.transactions.find((t) => t.id === tx.id)!;
  assert.equal(updatedTx.expectedIncomeId, 'inc-once', 'expectedIncomeId se preserva tras edición');

  // Eliminación: borrar la transacción
  deleteTransaction(state, tx.id);
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(state.finance.accounts[0].balance, 10000, 'Saldo vuelve al valor base');
  const incAfterDelete = state.finance.expectedIncomes.find((i) => i.id === 'inc-once')!;
  assert.equal(incAfterDelete.active, true, 'Ingreso puntual se reactiva si se borra la transacción que lo liquidó');
  assert.equal(incAfterDelete.settledTxIds?.length || 0, 0, 'Se limpia el ID liquidado');
});

test('9. Compatibilidad: Cambios de cuenta y moneda (USD vs UYU)', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-usd',
      name: 'Remesa Internacional',
      amount: 500,
      currency: 'USD',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-remesas',
      accountId: 'acc-usd',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-usd',
    accountId: 'acc-usd',
    date: '2026-10-21',
  });

  assert.equal(tx.currency, 'USD');
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-usd')!.balance, 1500, 'Cuenta USD sube a $1.500');
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')!.balance, 10000, 'Cuenta UYU intacta');
});

test('10. Compatibilidad: Restauración y preservación en roundtrip de serialización', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo',
      amount: 15000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, { expectedIncomeId: 'inc-sueldo' });

  // Simular exportación a JSON y restauración (como hace localStorage / sync)
  const json = JSON.stringify(state);
  const restoredState = JSON.parse(json);

  const restoredTx = restoredState.finance.transactions[0];
  const restoredInc = restoredState.finance.expectedIncomes[0];

  assert.equal(restoredTx.expectedIncomeId, 'inc-sueldo');
  assert.equal(restoredInc.lastSettledTxId, tx.id);
  assert.ok(restoredInc.settledTxIds.includes(tx.id));

  // Intentar confirmar de nuevo sobre el estado restaurado la ocurrencia liquidada
  const secondTx = confirmExpectedIncome(restoredState, { expectedIncomeId: 'inc-sueldo', targetCycle: tx.matchedCycle });
  assert.equal(secondTx.id, tx.id, 'Idempotencia funciona idénticamente tras deserialización');
  assert.equal(restoredState.finance.transactions.length, 1);
});

test('11. Dominio Monedas: Rechaza crear transacción en moneda incompatible con la cuenta (USD en cuenta UYU)', () => {
  const state = setupState();

  // Cuenta acc-uyu es de moneda UYU. Intentar registrar un movimiento en USD debe fallar en el dominio
  assert.throws(
    () => {
      addTransaction(state, {
        type: 'ingreso',
        amount: 100,
        currency: 'USD',
        category: 'Honorarios',
        accountId: 'acc-uyu',
      });
    },
    /Moneda incompatible/,
    'Debe rechazar movimiento USD en cuenta UYU'
  );

  // La cuenta acc-uyu debe permanecer en su saldo intacto
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')!.balance, 10000);
});

test('12. Dominio Monedas: Compatibilidad con datos legacy sin currency definida (asume UYU de forma segura)', () => {
  const state = setupState();
  // Cuenta legacy sin campo currency
  state.finance.accounts.push({
    id: 'acc-legacy',
    name: 'Caja Fuerte Antigua',
    balance: 5000,
    initialBalance: 5000,
  } as any);

  // Transacción sin currency definida en cuenta legacy -> Asume UYU y coincide
  const txOk = addTransaction(state, {
    type: 'ingreso',
    amount: 1000,
    category: 'Varios',
    accountId: 'acc-legacy',
  });
  assert.equal(txOk.currency, 'UYU');
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-legacy')!.balance, 6000);

  // Intentar meter USD en cuenta legacy (UYU implícito) debe fallar
  assert.throws(
    () => {
      addTransaction(state, {
        type: 'ingreso',
        amount: 50,
        currency: 'USD',
        category: 'Varios',
        accountId: 'acc-legacy',
      });
    },
    /Moneda incompatible/,
    'Debe proteger cuentas legacy contra contaminación de divisas'
  );
});

test('13. Dominio Monedas: Rechaza confirmExpectedIncome de previsión USD hacia cuenta UYU', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-freelance-usd',
      name: 'Cliente del Exterior',
      amount: 1200,
      currency: 'USD',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-servicios',
      accountId: 'acc-usd',
      active: true,
    }
  ];

  // Intentar confirmar el cobro USD depositando en la cuenta UYU
  assert.throws(
    () => {
      confirmExpectedIncome(state, {
        expectedIncomeId: 'inc-freelance-usd',
        accountId: 'acc-uyu',
        date: '2026-10-21',
      });
    },
    /Moneda incompatible/,
    'Debe impedir depositar una previsión USD en una cuenta de moneda UYU sin conversión'
  );

  // Confirmar en su cuenta correcta USD sí tiene éxito
  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-freelance-usd',
    accountId: 'acc-usd',
    date: '2026-10-21',
  });
  assert.equal(tx.currency, 'USD');
  assert.equal(state.finance.accounts.find((a) => a.id === 'acc-usd')!.balance, 2200);
});

test('14. Vinculación Segura: Rechaza vincular un gasto a una previsión de cobro', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-cobro',
      name: 'Cobro de Factura',
      amount: 8000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  // Registrar un gasto
  const gastoTx = addTransaction(state, {
    type: 'gasto',
    amount: 8000,
    category: 'cat-servicios',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  // Intentar vincular el gasto a la previsión de ingreso
  assert.throws(
    () => {
      linkTransactionToExpectedIncome(state, gastoTx.id, 'inc-cobro');
    },
    /Solo se pueden vincular movimientos de tipo ingreso/,
    'Debe rechazar vincular un gasto a una previsión de cobro'
  );

  assert.ok(!gastoTx.expectedIncomeId);
});

test('15. Vinculación Segura: Rechaza vincular transacción USD a previsión UYU', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-alquiler',
      name: 'Alquiler Local',
      amount: 1000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  // Registrar un ingreso de USD 1000 en cuenta USD
  const txUsd = addTransaction(state, {
    type: 'ingreso',
    amount: 1000,
    currency: 'USD',
    category: 'cat-sueldo',
    accountId: 'acc-usd',
    date: '2026-10-21',
  });

  // Intentar vincular la transacción en USD a la previsión en UYU
  assert.throws(
    () => {
      linkTransactionToExpectedIncome(state, txUsd.id, 'inc-alquiler');
    },
    /Moneda incompatible/,
    'Debe rechazar vincular un movimiento USD a una previsión UYU'
  );
});

test('16. Edición Segura: updateTransaction rechaza cambiar tipo a gasto en movimiento vinculado a previsión', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-renta',
      name: 'Renta Garaje',
      amount: 3500,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-renta',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  assert.equal(tx.expectedIncomeId, 'inc-renta');

  // Intentar editar la transacción para convertirla en gasto
  assert.throws(
    () => {
      updateTransaction(state, tx.id, {
        type: 'gasto',
        amount: 3500,
        category: 'cat-servicios',
        accountId: 'acc-uyu',
        date: '2026-10-21',
      });
    },
    /No podés cambiar el tipo a gasto en un movimiento vinculado a una previsión de cobro/,
    'Debe impedir cambiar el tipo contable de una transacción vinculada'
  );
});

test('17. Edición Segura: updateTransaction rechaza mover movimiento vinculado a cuenta de distinta moneda', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-sueldo',
      name: 'Sueldo',
      amount: 25000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-sueldo',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  // Intentar transferir la transacción a una cuenta en USD
  assert.throws(
    () => {
      updateTransaction(state, tx.id, {
        type: 'ingreso',
        amount: 25000,
        category: 'cat-sueldo',
        accountId: 'acc-usd',
        date: '2026-10-21',
      });
    },
    /Moneda incompatible/,
    'Debe impedir cambiar a una cuenta con moneda distinta a la previsión vinculada'
  );
});

test('18. Borrado de previsión: Borrar ExpectedIncome recurrente preserva intactas las transacciones liquidadas históricas', () => {
  const state = setupState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-consultoria',
      name: 'Consultoría Mensual',
      amount: 30000,
      currency: 'UYU',
      startDate: '2026-10-21',
      frequency: 'monthly',
      category: 'cat-sueldo',
      accountId: 'acc-uyu',
      active: true,
    }
  ];

  // Liquidar cobro del mes
  const tx = confirmExpectedIncome(state, {
    expectedIncomeId: 'inc-consultoria',
    accountId: 'acc-uyu',
    date: '2026-10-21',
  });

  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, 40000);

  // El usuario decide eliminar la previsión recurrente porque el cliente no renovó contrato
  state.finance.expectedIncomes = state.finance.expectedIncomes.filter((i) => i.id !== 'inc-consultoria');

  // La previsión ya no existe para el futuro
  assert.equal(state.finance.expectedIncomes.length, 0);

  // La transacción histórica y el dinero cobrado permanecen íntegros en la contabilidad
  assert.equal(state.finance.transactions.length, 1, 'La transacción histórica no se elimina');
  assert.equal(state.finance.transactions[0].id, tx.id);
  assert.equal(state.finance.accounts[0].balance, 40000, 'El saldo cobrado se mantiene íntegro');

  // Si se consulta o elimina la transacción histórica, no produce cuelgues ni errores de puntero
  assert.doesNotThrow(() => {
    deleteTransaction(state, tx.id);
  });
  assert.equal(state.finance.transactions.length, 0);
  assert.equal(state.finance.accounts[0].balance, 10000, 'Saldo revertido correctamente');
});
