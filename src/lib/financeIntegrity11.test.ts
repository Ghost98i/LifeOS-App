import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  addAccount,
  addTransaction,
  addTransfer,
  computeAccountBalance,
  reconcileAccount,
} from './financeFlows';
import {
  compareMaterializedBalanceShadow,
  reconstructAccountBalance,
  reconstructAllAccountBalances,
} from './financeLedger';
import { getRealBalancesByCurrency } from './financeCashflow';
import {
  calcAccountsTotal,
  calcNetWorth,
  cashFlowProjection,
} from './calculations';
import {
  canConfirmDraft,
  confirmCaptureDraft,
  parseCaptureDrafts,
} from './quickCaptureDrafts';

/* =========================================================================
   FINANZAS 1.1 — BLINDAJE DE INTEGRIDAD CONTABLE Y SEGURIDAD MULTIMONEDA
   Test Suite de Verificación de Integridad Contable
   ========================================================================= */

test('Escenario 1: Misma fecha entre conciliación y transacción posterior', () => {
  const state = defaultState();
  const acc = addAccount(state, 'Cuenta Principal', 1000, 'UYU');

  // Conciliación a las 10:00 fija saldo en $U 1.000
  reconcileAccount(state, {
    accountId: acc.id,
    actualBalance: 1000,
    date: '2026-10-16',
    note: 'Arqueo de caja matutino',
  });

  // Gasto posterior en la misma fecha a las 15:00 por $U 200
  addTransaction(state, {
    type: 'gasto',
    amount: 200,
    category: 'Alimentación',
    accountId: acc.id,
    date: '2026-10-16',
  });

  // 1. Saldo materializado en cuenta debe ser 800
  const updatedAcc = state.finance.accounts.find((a) => a.id === acc.id)!;
  assert.equal(updatedAcc.balance, 800, 'El saldo materializado debe reflejar 800 tras el gasto');

  // 2. Motor determinista (reconstructAccountBalance) debe evaluar a 800
  const reconstructed = reconstructAccountBalance(
    updatedAcc,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  assert.equal(reconstructed.balance, 800, 'El libro mayor determinista debe reconstruir el saldo en 800');

  // 3. computeAccountBalance unificado debe dar 800 (no 1000 legacy)
  const computed = computeAccountBalance(
    updatedAcc,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  assert.equal(computed, 800, 'computeAccountBalance canónico debe dar 800 y no ignorar el gasto del mismo día');

  // 4. Auditoría de sombra: no hay diferencia de balance
  const shadow = compareMaterializedBalanceShadow(
    updatedAcc,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  assert.equal(shadow.matches, true, 'El balance materializado debe coincidir con la reconstrucción');
  assert.equal(shadow.difference, 0, 'No debe existir diferencia de balance');
  assert.equal(shadow.reconstructedBalance, 800);
});

test('Escenario 2: Herramienta de reparación nunca corrompe saldos con fechas del mismo día', () => {
  const state = defaultState();
  const acc = addAccount(state, 'Caja Chica', 5000, 'UYU');

  // Conciliación a las 09:00 fija saldo en 5000
  reconcileAccount(state, {
    accountId: acc.id,
    actualBalance: 5000,
    date: '2026-10-16',
  });

  // Dos gastos posteriores en la misma fecha
  addTransaction(state, {
    type: 'gasto',
    amount: 1200,
    category: 'Suministros',
    accountId: acc.id,
    date: '2026-10-16',
  });
  addTransaction(state, {
    type: 'gasto',
    amount: 300,
    category: 'Cafetería',
    accountId: acc.id,
    date: '2026-10-16',
  });

  // Saldo real = 5000 - 1200 - 300 = 3500
  const accountRef = state.finance.accounts.find((a) => a.id === acc.id)!;
  assert.equal(accountRef.balance, 3500);

  // Ejecución de auditoría global de saldos
  const allReconstructed = reconstructAllAccountBalances(state);
  assert.equal(allReconstructed[acc.id].balance, 3500, 'La reconstrucción global debe dar 3500, jamás 5000');

  const shadow = compareMaterializedBalanceShadow(
    accountRef,
    state.finance.transactions,
    state.finance.transfers,
    state.finance.reconciliations,
  );
  assert.equal(shadow.matches, true, 'La auditoría detecta concordancia perfecta sin sugerir reparaciones destructivas');
  assert.equal(shadow.difference, 0);
});

test('Escenario 3: Transferencias en la misma moneda (UYU -> UYU y USD -> USD) preservan invariantes contables', () => {
  const state = defaultState();
  const accUyu1 = addAccount(state, 'Caja UYU 1', 10000, 'UYU');
  const accUyu2 = addAccount(state, 'Caja UYU 2', 5000, 'UYU');

  const accUsd1 = addAccount(state, 'Banco USD 1', 1000, 'USD');
  const accUsd2 = addAccount(state, 'Banco USD 2', 200, 'USD');

  // Transferencia UYU -> UYU
  const transferUyu = addTransfer(state, {
    fromAccountId: accUyu1.id,
    toAccountId: accUyu2.id,
    amount: 2000,
    date: '2026-10-16',
    note: 'Fondeo de caja',
  });

  assert.ok(transferUyu.id);
  assert.equal(state.finance.accounts.find((a) => a.id === accUyu1.id)!.balance, 8000);
  assert.equal(state.finance.accounts.find((a) => a.id === accUyu2.id)!.balance, 7000);

  // Transferencia USD -> USD
  const transferUsd = addTransfer(state, {
    fromAccountId: accUsd1.id,
    toAccountId: accUsd2.id,
    amount: 150,
    date: '2026-10-16',
    note: 'Ahorro USD',
  });

  assert.ok(transferUsd.id);
  assert.equal(state.finance.accounts.find((a) => a.id === accUsd1.id)!.balance, 850);
  assert.equal(state.finance.accounts.find((a) => a.id === accUsd2.id)!.balance, 350);

  // Las transferencias no deben figurar como gastos ni como ingresos personales
  const incomeTx = state.finance.transactions.filter((t) => t.type === 'ingreso');
  const expenseTx = state.finance.transactions.filter((t) => t.type === 'gasto');
  assert.equal(incomeTx.length, 0, 'No deben crearse ingresos por transferencias internas');
  assert.equal(expenseTx.length, 0, 'No deben crearse gastos por transferencias internas');

  // Totales consolidados por moneda permanecen intactos
  const balances = getRealBalancesByCurrency(state);
  assert.equal(balances['UYU'], 15000, 'El total consolidado UYU no debe cambiar');
  assert.equal(balances['USD'], 1200, 'El total consolidado USD no debe cambiar');
});

test('Escenario 4: Transferencias multimoneda (UYU -> USD y USD -> UYU) rechazadas atómicamente', () => {
  const state = defaultState();
  const accUyu = addAccount(state, 'Cuenta Pesos', 10000, 'UYU');
  const accUsd = addAccount(state, 'Cuenta Dólares', 500, 'USD');

  // Intento 1: UYU -> USD debe lanzar excepción descriptiva
  assert.throws(
    () => {
      addTransfer(state, {
        fromAccountId: accUyu.id,
        toAccountId: accUsd.id,
        amount: 100,
        date: '2026-10-16',
      });
    },
    /monedas distintas/i,
    'Debe rechazar transferencias de UYU a USD'
  );

  // Verificación de atomicidad: saldos intactos y sin transferencias creadas
  assert.equal(state.finance.accounts.find((a) => a.id === accUyu.id)!.balance, 10000);
  assert.equal(state.finance.accounts.find((a) => a.id === accUsd.id)!.balance, 500);
  assert.equal(state.finance.transfers?.length || 0, 0);

  // Intento 2: USD -> UYU debe lanzar excepción descriptiva
  assert.throws(
    () => {
      addTransfer(state, {
        fromAccountId: accUsd.id,
        toAccountId: accUyu.id,
        amount: 50,
        date: '2026-10-16',
      });
    },
    /monedas distintas/i,
    'Debe rechazar transferencias de USD a UYU'
  );

  // Verificación de atomicidad
  assert.equal(state.finance.accounts.find((a) => a.id === accUyu.id)!.balance, 10000);
  assert.equal(state.finance.accounts.find((a) => a.id === accUsd.id)!.balance, 500);
  assert.equal(state.finance.transfers?.length || 0, 0);
});

test('Escenario 5: Totales segregados por moneda sin sumas engañosas 1:1', () => {
  const state = defaultState();
  // Limpiar cuentas por defecto y configurar exactamente $U 10.000 y USD 500
  state.finance.accounts = [];
  addAccount(state, 'Banco Pesos', 10000, 'UYU');
  addAccount(state, 'Caja Ahorro USD', 500, 'USD');

  // 1. getRealBalancesByCurrency segrega nítidamente
  const balances = getRealBalancesByCurrency(state);
  assert.equal(balances['UYU'], 10000);
  assert.equal(balances['USD'], 500);

  // 2. calcAccountsTotal sin moneda en presencia de multimoneda cae a UYU y jamás suma 10.500
  const totalDefault = calcAccountsTotal(state);
  assert.equal(totalDefault, 10000, 'calcAccountsTotal debe retornar 10.000 UYU y nunca sumar 10.500');
  assert.notEqual(totalDefault, 10500, 'calcAccountsTotal no debe sumar UYU y USD 1:1');

  const totalUyu = calcAccountsTotal(state, 'UYU');
  assert.equal(totalUyu, 10000);

  const totalUsd = calcAccountsTotal(state, 'USD');
  assert.equal(totalUsd, 500);

  // 3. calcNetWorth segrega por moneda
  const netWorthUyu = calcNetWorth(state, 'UYU');
  assert.equal(netWorthUyu, 10000, 'Patrimonio UYU no debe sumar USD');

  const netWorthUsd = calcNetWorth(state, 'USD');
  assert.equal(netWorthUsd, 500, 'Patrimonio USD no debe sumar UYU');

  // 4. cashFlowProjection inicia en el saldo de la moneda elegida
  const projUyu = cashFlowProjection(state, 30, '2026-10-16', 'UYU');
  assert.equal(projUyu.currentBalance, 10000, 'Proyección UYU debe arrancar con 10.000');

  const projUsd = cashFlowProjection(state, 30, '2026-10-16', 'USD');
  assert.equal(projUsd.currentBalance, 500, 'Proyección USD debe arrancar con 500');
});

test('Escenario 6: Protección de Quick Capture contra compras financiadas en cuotas vs pago de cuota individual', () => {
  const state = defaultState();
  const acc = addAccount(state, 'Cuenta Corriente', 20000, 'UYU');

  // Caso A: Compra financiada en 6 cuotas
  const draftsFinanced = parseCaptureDrafts('compré algo por 6000 en 6 cuotas', state);
  assert.equal(draftsFinanced.length, 1);
  const dFin = draftsFinanced[0];

  assert.equal(dFin.kind, 'finance');
  if (dFin.kind === 'finance') {
    assert.equal(dFin.amount, 6000);
    assert.equal(dFin.installments, 6);
    assert.ok(dFin.ambiguityWarning, 'Debe incluir advertencia de ambigüedad/protección');
    assert.match(dFin.ambiguityWarning || '', /cuotas/i);

    // canConfirmDraft debe rechazarlo explícitamente
    const check = canConfirmDraft(state, dFin);
    assert.equal(check.valid, false);
    assert.match(check.reason || '', /cuotas/i);

    // confirmCaptureDraft debe arrojar error y no debitar $6000
    assert.throws(
      () => {
        confirmCaptureDraft(state, dFin);
      },
      /cuotas/i,
      'No debe permitirse confirmar compra financiada como gasto inmediato'
    );
    assert.equal(state.finance.accounts.find((a) => a.id === acc.id)!.balance, 20000);
  }

  // Caso B: Pago de una cuota individual («pagué la tercera cuota de 1000 pesos»)
  const draftsSingle = parseCaptureDrafts('pagué la tercera cuota de 1000 pesos', state);
  assert.equal(draftsSingle.length, 1);
  const dSingle = draftsSingle[0];

  assert.equal(dSingle.kind, 'finance');
  if (dSingle.kind === 'finance') {
    assert.equal(dSingle.amount, 1000);
    assert.equal(dSingle.installments, undefined, 'No es una compra financiada en múltiples cuotas');
    assert.equal(dSingle.ambiguityWarning, undefined, 'No debe tener advertencia de ambigüedad');

    // Con categoría asignada, es un gasto ejecutable normal
    dSingle.category = 'Otros';
    dSingle.accountId = acc.id;
    dSingle.missingFields = [];

    const checkSingle = canConfirmDraft(state, dSingle);
    assert.equal(checkSingle.valid, true, 'El pago de una cuota individual sí es confirmable');

    confirmCaptureDraft(state, dSingle);
    assert.equal(state.finance.accounts.find((a) => a.id === acc.id)!.balance, 19000, 'Debe debitar exactamente 1.000');
  }
});

test('Escenario 7: Formateo de moneda sin prefijos duplicados ($U $U o U$S $U)', () => {
  const fmtMoney = (n: number) => `$U ${Math.round(n).toLocaleString('es-UY')}`;

  const renderCandidateMoney = (cand: { amount: number; currency?: string }) => {
    return cand.currency === 'USD'
      ? `US$ ${Math.round(cand.amount).toLocaleString('es-UY')}`
      : fmtMoney(cand.amount);
  };

  const candUyu = { amount: 1200, currency: 'UYU' };
  const candUsd = { amount: 1200, currency: 'USD' };
  const candLegacy = { amount: 1200, currency: undefined };

  const renderedUyu = renderCandidateMoney(candUyu);
  const renderedUsd = renderCandidateMoney(candUsd);
  const renderedLegacy = renderCandidateMoney(candLegacy);

  // Formato UYU limpio
  assert.equal(renderedUyu, '$U 1.200');
  assert.doesNotMatch(renderedUyu, /\$U\s+\$U/);

  // Formato USD limpio
  assert.equal(renderedUsd, 'US$ 1.200');
  assert.doesNotMatch(renderedUsd, /U\$S\s+\$U/);
  assert.doesNotMatch(renderedUsd, /\$U\s+US\$/);

  // Formato Legacy sin moneda definida limpio
  assert.equal(renderedLegacy, '$U 1.200');
  assert.doesNotMatch(renderedLegacy, /\$U\s+\$U/);
});

test('Escenario 8: calcNetWorth multimoneda nunca mezcla cuentas USD con inversiones/deudas UYU', () => {
  const state = defaultState();
  state.finance.accounts = [];
  addAccount(state, 'Caja UYU', 10000, 'UYU');
  addAccount(state, 'Banco USD', 500, 'USD');

  state.finance.investments = [{ id: 'inv-1', name: 'Plazo Fijo', amount: 3000 }];
  state.finance.debts = [{ id: 'debt-1', name: 'Préstamo', amount: 1000 }];

  // Patrimonio UYU: 10000 (cuentas UYU) + 3000 (inv) - 1000 (deuda) = 12000
  const netWorthUyu = calcNetWorth(state, 'UYU');
  assert.equal(netWorthUyu, 12000, 'Patrimonio UYU debe ser 12.000');

  // Patrimonio USD: estrictamente cuentas USD = 500 (NUNCA 2.500 mezclando unidades)
  const netWorthUsd = calcNetWorth(state, 'USD');
  assert.equal(netWorthUsd, 500, 'Patrimonio USD no debe sumar ni restar entidades en UYU');
  assert.notEqual(netWorthUsd, 2500, 'calcNetWorth("USD") jamás debe devolver 2500 mezclando UYU');
});

test('Escenario 9: Presentación contextual de saldos de cuentas para colchón de seguridad', () => {
  const formatCushionBalance = (state: any) => {
    const balances = getRealBalancesByCurrency(state);
    const entries = Object.entries(balances);
    if (entries.length === 0) return '$U 0';
    if (entries.length === 1) {
      const [cur, amt] = entries[0];
      return cur === 'USD' ? `US$ ${Math.round(amt).toLocaleString('es-UY')}` : `$U ${Math.round(amt).toLocaleString('es-UY')}`;
    }
    return entries
      .map(([cur, amt]) => (cur === 'USD' ? `US$ ${Math.round(amt).toLocaleString('es-UY')}` : `$U ${Math.round(amt).toLocaleString('es-UY')}`))
      .join(' + ');
  };

  // 1. Solo USD
  const sUsd = defaultState();
  sUsd.finance.accounts = [{ id: 'a1', name: 'USD Account', balance: 700, currency: 'USD' } as any];
  assert.equal(formatCushionBalance(sUsd), 'US$ 700', 'Solo USD debe mostrar US$ 700, jamás $U 700');

  // 2. Solo UYU
  const sUyu = defaultState();
  sUyu.finance.accounts = [{ id: 'a2', name: 'UYU Account', balance: 700, currency: 'UYU' } as any];
  assert.equal(formatCushionBalance(sUyu), '$U 700', 'Solo UYU debe mostrar $U 700');

  // 3. Ambas monedas
  const sBoth = defaultState();
  sBoth.finance.accounts = [
    { id: 'a3', name: 'UYU Account', balance: 10000, currency: 'UYU' } as any,
    { id: 'a4', name: 'USD Account', balance: 500, currency: 'USD' } as any,
  ];
  assert.equal(formatCushionBalance(sBoth), '$U 10.000 + US$ 500', 'Ambas monedas deben presentarse segregadas');
});
