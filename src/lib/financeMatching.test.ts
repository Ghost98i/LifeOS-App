import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialCommitment, LifeOSState, Transaction } from '../types';
import {
  addFinancialCommitment,
  addTransaction,
  confirmTransactionMatch,
  linkTransactionToCommitment,
  linkTransactionToExpectedIncome,
  rejectTransactionMatch,
} from './financeFlows';
import {
  areMerchantsCompatible,
  findMatchCandidates,
} from './financeMatching';
import { deriveFinanceReviewInbox } from './financeReview';
import { defaultState } from './storage';
import { mergeFinanceModule } from './syncMerge';

function createBaseState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    {
      id: 'acc-main',
      name: 'Banco República',
      balance: 20000,
      initialBalance: 20000,
      lastReconciledAt: null,
    },
  ];
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.reconciliations = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  return state;
}

test('1. Match fuerte correcto: Netflix $U 490', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Netflix',
    amount: 490,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
    category: 'Streaming',
  });

  const tx = addTransaction(state, {
    amount: 490,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-10-09',
    note: 'NETFLIX.COM',
  });

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'strong');
  assert.ok(match.bestCandidate);
  assert.equal(match.bestCandidate.name, 'Netflix');
  assert.equal(match.bestCandidate.amount, 490);
});

test('2. Match fuerte correcto: Cuota 3/12 teléfono $U 2.400', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    name: 'Teléfono',
    amount: 2400,
    currency: 'UYU',
    nextDueDate: '2026-10-15',
    totalInstallments: 12,
    currentInstallment: 3,
    remainingOccurrences: 10,
    category: 'Admin/Hogar',
  });

  const tx = addTransaction(state, {
    amount: 2400,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-14',
    note: 'Pago cuota 3 de 12 teléfono',
  });

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'strong');
  assert.ok(match.bestCandidate);
  assert.equal(match.bestCandidate.targetId, com.id);
  assert.equal(match.bestCandidate.cycleKey, 'inst-3');
  assert.equal(match.bestCandidate.cycleLabel, 'Cuota 3/12');
});

test('3. Match fuerte correcto: Sueldo esperado (ExpectedIncome)', () => {
  const state = createBaseState();
  state.finance.expectedIncomes = [
    {
      id: 'inc-salary',
      name: 'Sueldo mensual',
      amount: 65000,
      currency: 'UYU',
      startDate: '2026-10-05',
      frequency: 'monthly',
      active: true,
      category: 'Sueldo',
    },
  ];

  const tx = addTransaction(state, {
    amount: 65000,
    type: 'ingreso',
    category: 'Sueldo',
    accountId: 'acc-main',
    date: '2026-10-05',
    note: 'Depósito Sueldo Empresa',
  });

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'strong');
  assert.ok(match.bestCandidate);
  assert.equal(match.bestCandidate.targetId, 'inc-salary');
  assert.equal(match.bestCandidate.targetType, 'expected_income');
});

test('4. Sólo mismo importe ≠ match fuerte (queda como mucho en possible)', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Alquiler depósito',
    amount: 15000,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
    category: 'Admin/Hogar',
  });

  // Movimiento sin note ni match de comercio ni categoría
  const tx = addTransaction(state, {
    amount: 15000,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Compra de herramientas varias',
  });

  const match = findMatchCandidates(tx, state);
  // Al no haber concordancia semántica (comercio o cuota o descripción), NO puede ser strong
  assert.notEqual(match.confidence, 'strong');
  assert.equal(match.confidence, 'possible');
});

test('5. Moneda diferente: no produce match (none)', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Hosting VPS',
    amount: 20,
    currency: 'USD',
    nextDueDate: '2026-10-10',
  });

  // Transacción en UYU por $20
  const tx = addTransaction(state, {
    amount: 20,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Hosting VPS',
  });
  // tx sin currency asume UYU
  tx.currency = 'UYU';

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'none');
  assert.equal(match.candidates.length, 0);
});

test('6. Ingreso vs gasto: incompatibilidad produce none', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Seguro médico',
    amount: 3500,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
  });

  // Transacción de ingreso con mismo monto y nombre
  const txIncome = addTransaction(state, {
    amount: 3500,
    type: 'ingreso',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Seguro médico',
  });

  const match = findMatchCandidates(txIncome, state);
  assert.equal(match.confidence, 'none');
});

test('7. Fecha cercana vs fecha demasiado distante', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Gimnasio',
    amount: 1800,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
  });

  // Transacción a 3 días: cercana -> evaluada
  const txClose = addTransaction(state, {
    amount: 1800,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-07',
    note: 'Gimnasio',
  });
  const matchClose = findMatchCandidates(txClose, state);
  assert.ok(matchClose.confidence === 'strong' || matchClose.confidence === 'possible');

  // Transacción a 40 días: demasiado distante -> none
  const txFar = addTransaction(state, {
    amount: 1800,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-11-20',
    note: 'Gimnasio',
  });
  const matchFar = findMatchCandidates(txFar, state);
  assert.equal(matchFar.confidence, 'none');
});

test('8. Merchant compatible normaliza casos como NETFLIX.COM, Netflix, NETFLIX *', () => {
  assert.ok(areMerchantsCompatible('NETFLIX.COM', 'Netflix'));
  assert.ok(areMerchantsCompatible('NETFLIX *', 'Netflix'));
  assert.ok(areMerchantsCompatible('netflix streaming', 'Netflix'));
  assert.ok(areMerchantsCompatible('Spotify AB', 'Spotify'));
  assert.ok(areMerchantsCompatible('UBER TRIP 1234', 'Uber'));
});

test('9. Dos candidatos casi equivalentes → ambiguous', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Servicio de Streaming A',
    amount: 490,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
  });
  addFinancialCommitment(state, {
    name: 'Servicio de Streaming B',
    amount: 490,
    currency: 'UYU',
    nextDueDate: '2026-10-11',
  });

  // Movimiento sin mención específica a cuál de los dos es
  const tx = addTransaction(state, {
    amount: 490,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Pago suscripción',
  });

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'ambiguous');
  assert.equal(match.candidates.length, 2);
  assert.ok(match.explanation?.includes('candidatos'));
});

test('10. Cuota correcta vs cuota siguiente', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    name: 'Notebook 12 cuotas',
    amount: 3000,
    currency: 'UYU',
    nextDueDate: '2026-10-15',
    totalInstallments: 12,
    currentInstallment: 3,
    remainingOccurrences: 10,
  });

  // Transacción para cuota 3
  const tx3 = addTransaction(state, {
    amount: 3000,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-14',
    note: 'Notebook cuota 3',
  });

  const match3 = findMatchCandidates(tx3, state);
  assert.equal(match3.confidence, 'strong');
  assert.equal(match3.bestCandidate?.cycleKey, 'inst-3');

  // Vincular cuota 3
  linkTransactionToCommitment(state, tx3.id, com.id);

  // El compromiso ahora avanzó a cuota 4 de 12
  const updatedCom = state.finance.commitments?.find((c) => c.id === com.id);
  assert.equal(updatedCom?.currentInstallment, 4);
  assert.equal(updatedCom?.remainingOccurrences, 9);

  // Una transacción posterior para cuota 4 ahora hace match con la cuota 4 (la actual pendiente)
  const tx4 = addTransaction(state, {
    amount: 3000,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-11-14',
    note: 'Notebook cuota 4',
  });

  const match4 = findMatchCandidates(tx4, state);
  assert.equal(match4.confidence, 'strong');
  assert.equal(match4.bestCandidate?.cycleKey, 'inst-4');
  assert.equal(match4.bestCandidate?.cycleLabel, 'Cuota 4/12');
});

test('11. Ciclo recurrente correcto no liquida dos ciclos accidentalmente', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    name: 'Spotify',
    amount: 350,
    currency: 'UYU',
    frequency: 'monthly',
    nextDueDate: '2026-10-10',
  });

  const txOct = addTransaction(state, {
    amount: 350,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-10-09',
    note: 'Spotify',
  });

  linkTransactionToCommitment(state, txOct.id, com.id);

  // Verificamos que el compromiso avanzó exactamente al ciclo siguiente (noviembre)
  assert.equal(com.nextDueDate, '2026-11-10');
  assert.equal(com.lastSettledTxId, txOct.id);
  assert.equal(txOct.matchedCycle, 'cycle-2026-10-10');
});

test('12. Confirmar no crea nueva transacción ni duplica saldo', () => {
  const state = createBaseState();
  const initialBalance = state.finance.accounts[0].balance;

  const com = addFinancialCommitment(state, {
    name: 'Internet',
    amount: 1600,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
  });

  // Movimiento real ya ingresado previamente
  const tx = addTransaction(state, {
    amount: 1600,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-09',
    note: 'Internet Antel',
  });
  const balanceAfterTx = state.finance.accounts[0].balance;
  assert.equal(balanceAfterTx, initialBalance - 1600);
  assert.equal(state.finance.transactions.length, 1);

  // Vincular match
  confirmTransactionMatch(state, tx.id, com.id, 'commitment');

  // Transacciones siguen siendo 1
  assert.equal(state.finance.transactions.length, 1);
  // Saldo no se duplica
  assert.equal(state.finance.accounts[0].balance, balanceAfterTx);
  // Transacción tiene commitmentId
  assert.equal(tx.commitmentId, com.id);
  assert.equal(tx.reviewStatus, 'reviewed');
});

test('13. Confirmación es idempotente ante reintentos', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    name: 'Préstamo',
    amount: 4000,
    totalInstallments: 6,
    currentInstallment: 1,
    nextDueDate: '2026-10-10',
  });

  const tx = addTransaction(state, {
    amount: 4000,
    type: 'gasto',
    category: 'Deudas',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Préstamo cuota 1',
  });

  const first = confirmTransactionMatch(state, tx.id, com.id, 'commitment');
  assert.equal(com.currentInstallment, 2);

  // Segunda confirmación con los mismos IDs
  const second = confirmTransactionMatch(state, tx.id, com.id, 'commitment');
  assert.equal(second.transaction.id, first.transaction.id);
  // NO debe avanzar a cuota 3
  assert.equal(com.currentInstallment, 2);
  assert.equal(state.finance.transactions.length, 1);
});

test('14. Dos dispositivos confirman el mismo match y convergen en sync', () => {
  const stateA = createBaseState();
  const com = addFinancialCommitment(stateA, {
    id: 'com-sync-test',
    name: 'Netflix',
    amount: 490,
    frequency: 'monthly',
    nextDueDate: '2026-10-10',
  });
  const tx = addTransaction(stateA, {
    id: 'tx-sync-test',
    amount: 490,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Netflix',
  });

  const stateB = structuredClone(stateA);

  // Nodo A confirma el match
  linkTransactionToCommitment(stateA, tx.id, com.id);

  // Nodo B confirma el mismo match offline
  linkTransactionToCommitment(stateB, tx.id, com.id);

  // Sincronización simétrica via mergeFinanceModule
  const mergedAB = mergeFinanceModule(stateA.finance, stateB.finance);
  const mergedBA = mergeFinanceModule(stateB.finance, stateA.finance);

  assert.equal(mergedAB.transactions.length, 1);
  assert.equal(mergedBA.transactions.length, 1);
  const txMerged = mergedAB.transactions[0];
  assert.equal(txMerged.commitmentId, com.id);
  assert.equal(txMerged.reviewStatus, 'reviewed');

  const comMerged = mergedAB.commitments?.find((c) => c.id === com.id);
  assert.ok(comMerged);
  assert.equal(comMerged.lastSettledTxId, tx.id);
  assert.equal(comMerged.nextDueDate, '2026-11-10');
});

test('15. Movimiento ya vinculado no se reutiliza como candidato', () => {
  const state = createBaseState();
  const com1 = addFinancialCommitment(state, {
    name: 'Suscripción 1',
    amount: 500,
    nextDueDate: '2026-10-10',
  });
  const com2 = addFinancialCommitment(state, {
    name: 'Suscripción 2',
    amount: 500,
    nextDueDate: '2026-10-10',
  });

  const tx = addTransaction(state, {
    amount: 500,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-10',
    commitmentId: com1.id,
    reviewStatus: 'reviewed',
  });

  // Al estar ya vinculado, findMatchCandidates retorna none
  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'none');
  assert.equal(match.candidates.length, 0);

  // Intento forzado de vincular a com2 lanza error de protección
  assert.throws(() => {
    linkTransactionToCommitment(state, tx.id, com2.id);
  }, /ya está vinculado/);
});

test('16. Rechazo evita sugerencia inmediata repetida', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    name: 'Cuota Club',
    amount: 1200,
    nextDueDate: '2026-10-10',
  });

  const tx = addTransaction(state, {
    amount: 1200,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Pago cuota club',
  });

  // Inicialmente hay match fuerte
  let match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'strong');

  // El usuario rechaza ("No corresponde")
  rejectTransactionMatch(state, tx.id, com.id);
  assert.ok(tx.rejectedMatchIds?.some((id) => id === com.id || id.startsWith(`${com.id}:`)));

  // El movimiento sigue existiendo intacto
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(tx.amount, 1200);

  // En la siguiente evaluación, no vuelve a sugerirse
  match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'none');
  assert.equal(match.candidates.length, 0);
});

test('17. Compromiso pagado o cancelado no entra como candidato', () => {
  const state = createBaseState();
  addFinancialCommitment(state, {
    name: 'Celular Finalizado',
    amount: 1000,
    nextDueDate: '2026-10-10',
    active: false,
    status: 'paid',
  });
  addFinancialCommitment(state, {
    name: 'Suscripción Cancelada',
    amount: 1000,
    nextDueDate: '2026-10-10',
    active: true,
    status: 'cancelled',
  });

  const tx = addTransaction(state, {
    amount: 1000,
    type: 'gasto',
    category: 'Varios',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'Celular',
  });

  const match = findMatchCandidates(tx, state);
  assert.equal(match.confidence, 'none');
  assert.equal(match.candidates.length, 0);
});

test('18. Compatibilidad legacy sin campos nuevos', () => {
  const state = createBaseState();

  // Transacción antigua sin rejectedMatchIds ni currency ni matchedCycle
  const legacyTx: Transaction = {
    id: 'legacy-tx-99',
    type: 'gasto',
    amount: 600,
    category: 'Streaming',
    fixed: 'variable',
    date: '2026-10-08',
    accountId: 'acc-main',
    note: 'Netflix',
  };
  state.finance.transactions.push(legacyTx);

  // Compromiso antiguo sin settledTxIds ni status
  const legacyCom: FinancialCommitment = {
    id: 'legacy-com-99',
    name: 'Netflix',
    amount: 600,
    frequency: 'monthly',
    nextDueDate: '2026-10-09',
    active: true,
  };
  state.finance.commitments?.push(legacyCom);

  // Evaluamos match y Review Inbox
  const match = findMatchCandidates(legacyTx, state);
  assert.equal(match.confidence, 'strong');
  assert.equal(match.bestCandidate?.targetId, legacyCom.id);

  const inbox = deriveFinanceReviewInbox(state);
  assert.equal(inbox.items.length, 1);
  assert.ok(inbox.items[0].matchResult);
  assert.equal(inbox.items[0].matchResult.confidence, 'strong');
});

test('19. Auditoría 1: Ambigüedad por cercanía (diferencia de 1-2 puntos deriva en ambiguous y no en strong)', () => {
  const state = createBaseState();
  // Candidato A: Netflix esperado el 10-oct
  addFinancialCommitment(state, {
    name: 'Netflix Personal',
    amount: 490,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
    category: 'Streaming',
  });
  // Candidato B: Netflix Familia esperado el 12-oct (2 días después: 1 punto menos de fecha)
  addFinancialCommitment(state, {
    name: 'Netflix Familia',
    amount: 490,
    currency: 'UYU',
    nextDueDate: '2026-10-12',
    category: 'Streaming',
  });

  // Movimiento que dice sólo "Netflix"
  const tx = addTransaction(state, {
    amount: 490,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-10-10',
    note: 'NETFLIX',
  });

  const match = findMatchCandidates(tx, state);
  // Ambos superan el umbral base pero su cercanía (diff <= 2) NO permite un strong engañoso
  assert.equal(match.confidence, 'ambiguous');
  assert.equal(match.candidates.length, 2);
  assert.ok(Math.abs(match.candidates[0].score - match.candidates[1].score) <= 2);
});

test('20. Auditoría 2: Rechazo scoped al ciclo lógico no bloquea ciclos futuros', () => {
  const state = createBaseState();
  const com = addFinancialCommitment(state, {
    id: 'com-netflix-scoped',
    name: 'Netflix',
    amount: 490,
    currency: 'UYU',
    frequency: 'monthly',
    nextDueDate: '2026-10-10',
  });

  // 1. Movimiento en octubre
  const txOct = addTransaction(state, {
    id: 'tx-oct',
    amount: 490,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-10-09',
    note: 'Netflix',
  });

  // Inicialmente sugiere match
  assert.equal(findMatchCandidates(txOct, state).confidence, 'strong');

  // El usuario rechaza el match de octubre
  rejectTransactionMatch(state, txOct.id, com.id, 'cycle-2026-10-10');
  assert.ok(txOct.rejectedMatchIds?.includes('com-netflix-scoped:cycle-2026-10-10'));

  // Ahora txOct no vuelve a sugerirse
  assert.equal(findMatchCandidates(txOct, state).confidence, 'none');

  // 2. Llega el ciclo de noviembre
  com.nextDueDate = '2026-11-10';

  const txNov = addTransaction(state, {
    id: 'tx-nov',
    amount: 490,
    type: 'gasto',
    category: 'Streaming',
    accountId: 'acc-main',
    date: '2026-11-09',
    note: 'Netflix',
  });

  // El ciclo noviembre SÍ es sugerido con éxito (no fue bloqueado para siempre)
  const matchNov = findMatchCandidates(txNov, state);
  assert.equal(matchNov.confidence, 'strong');
  assert.equal(matchNov.bestCandidate?.targetId, com.id);
  assert.equal(matchNov.bestCandidate?.cycleKey, 'cycle-2026-11-10');
});

test('21. Auditoría 3: Expected Income vinculado es idempotente, sin doble transacción ni duplicación de saldo', () => {
  const state = createBaseState();
  const initialBalance = state.finance.accounts[0].balance;

  // Previsión de sueldo mensual
  state.finance.expectedIncomes = [
    {
      id: 'inc-salary-audit',
      name: 'Sueldo',
      amount: 50000,
      currency: 'UYU',
      startDate: '2026-10-05',
      frequency: 'monthly',
      active: true,
      category: 'Sueldo',
      accountId: 'acc-main',
    },
  ];

  // Ingreso real ya cobrado e ingresado
  const txIncome = addTransaction(state, {
    id: 'tx-income-1',
    amount: 50000,
    type: 'ingreso',
    category: 'Sueldo',
    accountId: 'acc-main',
    date: '2026-10-05',
    note: 'Cobro Sueldo',
  });

  const balanceAfterIncome = state.finance.accounts[0].balance;
  assert.equal(balanceAfterIncome, initialBalance + 50000);
  assert.equal(state.finance.transactions.length, 1);

  // Vincular a previsión
  const res = linkTransactionToExpectedIncome(state, txIncome.id, 'inc-salary-audit');
  assert.ok(res.expectedIncome);

  // 1. No crea otra transacción
  assert.equal(state.finance.transactions.length, 1);
  // 2. No duplica el saldo
  assert.equal(state.finance.accounts[0].balance, balanceAfterIncome);
  // 3. Avanza la previsión al ciclo siguiente (noviembre)
  assert.equal(res.expectedIncome.startDate, '2026-11-05');
  assert.equal(res.expectedIncome.active, true);
  assert.equal(res.expectedIncome.lastSettledTxId, txIncome.id);
  assert.ok(res.expectedIncome.settledTxIds?.includes(txIncome.id));
  assert.equal(txIncome.reviewStatus, 'reviewed');

  // 4. Idempotencia: segunda confirmación no altera nada
  const res2 = linkTransactionToExpectedIncome(state, txIncome.id, 'inc-salary-audit');
  assert.equal(res2.expectedIncome.startDate, '2026-11-05');
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, balanceAfterIncome);
});

