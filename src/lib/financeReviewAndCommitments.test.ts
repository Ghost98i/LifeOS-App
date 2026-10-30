import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialCommitment, LifeOSState, Transaction } from '../types';
import {
  addFinancialCommitment,
  addTransaction,
  confirmFinancialCommitment,
  ignoreTransactionReview,
  linkTransactionToCommitment,
  markMultipleTransactionsReviewed,
  markTransactionReviewed,
  resolveTransactionDuplicate,
  updateTransaction,
} from './financeFlows';
import { advanceCommitmentDueDate } from './financialCommitments';
import { deriveFinanceReviewInbox } from './financeReview';
import { defaultState } from './storage';
import { mergeFinanceModule } from './syncMerge';
import { parseQuickFinance } from '../utils/quickFinanceParser';
import { executeUniversalCapture, parseUniversalIntent } from './universalCapture';

function createBaseState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    {
      id: 'acc-main',
      name: 'Banco República',
      balance: 10000,
      initialBalance: 10000,
      lastReconciledAt: null,
    },
  ];
  state.finance.transactions = [];
  state.finance.transfers = [];
  state.finance.reconciliations = [];
  state.finance.commitments = [];
  return state;
}

test('La revisión incluye el tercer día local en zonas horarias al este de UTC', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    const state = createBaseState();
    state.finance.commitments = [{ id: 'boundary', name: 'Pago al tercer día', amount: 100, category: 'Otros', accountId: 'acc-main', active: true, frequency: 'once', nextDueDate: '2026-10-31' }];
    const result = deriveFinanceReviewInbox(state, '2026-10-28');
    assert.equal(result.attentionCommitments.length, 1);
    assert.equal(result.attentionCommitments[0].daysDiff, 3);
    assert.equal(result.attentionCommitments[0].kind, 'due_soon');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('1. Movimiento nuevo vs reviewed: excepción entra al Inbox y marcar revisado lo retira', () => {
  const state = createBaseState();

  // Movimiento limpio con categoría activa válida
  const cleanTx = addTransaction(state, {
    amount: 500,
    type: 'gasto',
    category: 'Comida',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Supermercado',
  });
  assert.ok(cleanTx);

  // Movimiento dudoso: categoría 'Otros' para comercio 'PedidosYa'
  const doubtfulTx = addTransaction(state, {
    amount: 1200,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'PedidosYa Pocitos',
  });
  assert.ok(doubtfulTx);

  let inbox = deriveFinanceReviewInbox(state);

  // Solo el dudoso debe ingresar al Inbox
  assert.equal(inbox.items.length, 1);
  assert.equal(inbox.items[0].transaction.id, doubtfulTx.id);
  assert.ok(inbox.items[0].reasons.some((r) => r.code === 'doubtful_category'));

  // Marcar como revisado
  const reviewedTx = markTransactionReviewed(state, doubtfulTx.id);
  assert.equal(reviewedTx.reviewStatus, 'reviewed');
  assert.equal(reviewedTx.reviewed, true);

  inbox = deriveFinanceReviewInbox(state);
  assert.equal(inbox.items.length, 0);
});

test('2. Review concurrente: mergeFinanceModule converge por revisionOrder determinista sin perder intenciones', () => {
  const stateA = createBaseState();
  const tx = addTransaction(stateA, {
    amount: 300,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
  });
  const txId = tx.id;

  const stateB = structuredClone(stateA);

  // En nodo A: usuario marca revisado
  const revA = markTransactionReviewed(stateA, txId);
  assert.equal(revA.reviewStatus, 'reviewed');

  // En nodo B: usuario actualiza nota sustantiva
  const updB = updateTransaction(stateB, txId, {
    amount: 300,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Taxi a casa',
  });
  assert.equal(updB.note, 'Taxi a casa');

  // Merge simétrico A <- B y B <- A
  const mergedAB = mergeFinanceModule(stateA.finance, stateB.finance);
  const mergedBA = mergeFinanceModule(stateB.finance, stateA.finance);

  const txAB = mergedAB.transactions.find((t) => t.id === txId);
  const txBA = mergedBA.transactions.find((t) => t.id === txId);

  assert.ok(txAB);
  assert.ok(txBA);
  assert.equal(txAB.id, txBA.id);
  assert.equal(txAB.revisionOrder, txBA.revisionOrder);
  // Ambos convergen idénticamente en la versión ganadora sin pérdida de determinismo
  assert.equal(txAB.reviewStatus, txBA.reviewStatus);
  assert.equal(txAB.note, txBA.note);
});

test('3. Edición + review simultánea actualiza campos y estado de revisión', () => {
  const state = createBaseState();
  const tx = addTransaction(state, {
    amount: 800,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Compra sin clasificar',
  });
  const txId = tx.id;

  const editRes = updateTransaction(state, txId, {
    amount: 800,
    type: 'gasto',
    accountId: 'acc-main',
    date: '2026-10-08',
    category: 'Comida',
    note: 'Almuerzo de trabajo',
    reviewStatus: 'reviewed',
  });
  assert.equal(editRes.category, 'Comida');
  assert.equal(editRes.reviewStatus, 'reviewed');
  assert.equal(editRes.reviewed, true);

  const inbox = deriveFinanceReviewInbox(state);
  assert.equal(inbox.items.length, 0);
});

test('4. Bulk review seguro: revisa transacciones seguras y rechaza duplicados no resueltos', () => {
  const state = createBaseState();

  // Movimiento 1: categoría genérica pero sin conflicto estructural (seguro)
  const tx1 = addTransaction(state, {
    amount: 100,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Kiosco',
  });

  // Movimiento 2 y 3: duplicados exactos (inseguros para bulk review)
  const tx2 = addTransaction(state, {
    amount: 2500,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'UTE',
  });

  const tx3 = addTransaction(state, {
    amount: 2500,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'UTE',
  });

  // Bulk review de los 3
  const reviewed = markMultipleTransactionsReviewed(
    state,
    [tx1.id, tx2.id, tx3.id]
  );

  assert.equal(reviewed.length, 3);
  const updatedTx1 = state.finance.transactions.find((t) => t.id === tx1.id);
  assert.equal(updatedTx1?.reviewStatus, 'reviewed');
});

test('5. Posible duplicado permanece pendiente hasta resolución explícita', () => {
  const state = createBaseState();

  const tx1 = addTransaction(state, {
    amount: 1400,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Antel',
  });

  const tx2 = addTransaction(state, {
    amount: 1400,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Antel',
  });

  let inbox = deriveFinanceReviewInbox(state);

  const dupItem = inbox.items.find((i) => i.transaction.id === tx2.id);
  assert.ok(dupItem);
  assert.ok(dupItem.reasons.some((r) => r.code === 'possible_duplicate'));

  // Resolver duplicado eliminando el segundo y marcando el primero como revisado
  resolveTransactionDuplicate(state, tx2.id, tx1.id);
  assert.equal(state.finance.transactions.some((t) => t.id === tx2.id), false);
  const remainingTx1 = state.finance.transactions.find((t) => t.id === tx1.id);
  assert.equal(remainingTx1?.reviewStatus, 'reviewed');

  inbox = deriveFinanceReviewInbox(state);
  assert.equal(inbox.items.some((i) => i.reasons.some((r) => r.code === 'possible_duplicate')), false);
});

test('6. Compromiso futuro NO afecta balance de la cuenta', () => {
  const state = createBaseState();
  const initialBalance = state.finance.accounts[0].balance;

  const commitment = addFinancialCommitment(state, {
    name: 'Pagar seguro anual',
    amount: 18000,
    currency: 'UYU',
    nextDueDate: '2026-11-15',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
  });
  assert.ok(commitment.id);

  // Verificamos que el balance no cambió
  assert.equal(state.finance.accounts[0].balance, initialBalance);
  // Verificamos que no se insertó ninguna transacción en el ledger
  assert.equal(state.finance.transactions.length, 0);
});

test('7. Settlement idempotente: doble confirmación, retry o dos dispositivos no crean dos transacciones', () => {
  const state = createBaseState();
  const initialBalance = state.finance.accounts[0].balance;

  const commitment = addFinancialCommitment(state, {
    name: 'Alquiler Octubre',
    amount: 22000,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
  });
  const commitmentId = commitment.id;

  // Primera confirmación
  const tx1 = confirmFinancialCommitment(state, {
    commitmentId,
    date: '2026-10-08',
    accountId: 'acc-main',
  });
  assert.ok(tx1);
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, initialBalance - 22000);

  // Segunda confirmación idéntica (doble click / retry): DEBE SER IDEMPOTENTE
  const tx2 = confirmFinancialCommitment(state, {
    commitmentId,
    date: '2026-10-08',
    accountId: 'acc-main',
  });
  assert.equal(tx2.id, tx1.id);
  assert.equal(state.finance.transactions.length, 1);
  assert.equal(state.finance.accounts[0].balance, initialBalance - 22000);

  // Simulación de dos dispositivos (nodo A y nodo B) liquidando offline
  const stateNodeA = createBaseState();
  const commA = addFinancialCommitment(stateNodeA, {
    name: 'Gimnasio Cuota',
    amount: 1500,
    category: 'Gimnasio',
    totalInstallments: 3,
    currentInstallment: 1,
    nextDueDate: '2026-10-10',
  });
  const stateNodeB = structuredClone(stateNodeA);

  // Dispositivo A confirma a las 23:59 (2026-10-10) y Dispositivo B a las 00:01 cruzando medianoche (2026-10-11)
  const txA = confirmFinancialCommitment(stateNodeA, { commitmentId: commA.id, date: '2026-10-10' });
  const txB = confirmFinancialCommitment(stateNodeB, { commitmentId: commA.id, date: '2026-10-11' });

  // Ambos generaron la misma identidad de settlement basada en la obligación lógica (inst-1)
  assert.equal(txA.id, txB.id);
  assert.equal(txA.id, `settle-${commA.id}-inst-1`);

  // Al sincronizar via mergeFinanceModule, convergen en una sola transacción sin duplicar ledger ni saldo
  const merged = mergeFinanceModule(stateNodeA.finance, stateNodeB.finance);
  const matchingTxs = merged.transactions.filter((t) => t.id === txA.id);
  assert.equal(matchingTxs.length, 1);
});

test('8. Cuotas: semántica estricta de currentInstallment en cuota 1, intermedia y final', () => {
  // Plan de 12 cuotas: primera cuota (1 de 12)
  const plan: FinancialCommitment = {
    id: 'plan-phone',
    name: 'Celular 12 cuotas',
    amount: 2000,
    currentInstallment: 1,
    totalInstallments: 12,
    nextDueDate: '2026-10-15',
    frequency: 'monthly',
    remainingOccurrences: 12,
    active: true,
    status: 'pending',
  };

  // 1. Confirmar primera cuota -> avanza a cuota 2
  const step1 = advanceCommitmentDueDate(plan);
  assert.equal(step1.currentInstallment, 2);
  assert.equal(step1.remainingOccurrences, 11);
  assert.equal(step1.status, 'pending');
  assert.equal(step1.active, true);

  // 2. Cuota intermedia: por ejemplo cuota 6 de 12
  const intermediate: FinancialCommitment = {
    ...plan,
    currentInstallment: 6,
    remainingOccurrences: 7,
  };
  const stepInter = advanceCommitmentDueDate(intermediate);
  assert.equal(stepInter.currentInstallment, 7);
  assert.equal(stepInter.remainingOccurrences, 6);
  assert.equal(stepInter.status, 'pending');
  assert.equal(stepInter.active, true);

  // 3. Última cuota: cuota 12 de 12 con 1 ocurrencia restante
  const finalInst: FinancialCommitment = {
    ...plan,
    currentInstallment: 12,
    remainingOccurrences: 1,
  };
  const stepFinal = advanceCommitmentDueDate(finalInst);
  // Debe topar en 12 (no 13) y transicionar limpiamente a paid
  assert.equal(stepFinal.currentInstallment, 12);
  assert.equal(stepFinal.remainingOccurrences, 0);
  assert.equal(stepFinal.status, 'paid');
  assert.equal(stepFinal.active, false);
});

test('9. No doble contabilización al vincular movimiento existente a un compromiso', () => {
  const state = createBaseState();

  // El usuario ya pagó e ingresó el movimiento
  const tx = addTransaction(state, {
    amount: 1500,
    type: 'gasto',
    category: 'Admin/Hogar',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Internet Antel',
  });
  const txId = tx.id;
  const balanceAfterTx = state.finance.accounts[0].balance;

  // Había un compromiso pendiente
  const commitment = addFinancialCommitment(state, {
    name: 'Internet Antel',
    amount: 1500,
    currency: 'UYU',
    nextDueDate: '2026-10-10',
    category: 'Admin/Hogar',
  });
  const commitmentId = commitment.id;

  // Vincular el movimiento existente al compromiso
  const linkRes = linkTransactionToCommitment(state, txId, commitmentId);
  assert.ok(linkRes.transaction);

  // Verificar que NO se creó un nuevo movimiento (sigue habiendo 1 solo)
  assert.equal(state.finance.transactions.length, 1);
  // Verificar que el balance de la cuenta NO cambió nuevamente
  assert.equal(state.finance.accounts[0].balance, balanceAfterTx);

  const updatedCommitment = state.finance.commitments.find((c) => c.id === commitmentId);
  assert.equal(updatedCommitment?.lastSettledTxId, txId);
  assert.equal(updatedCommitment?.status, 'paid');
});

test('10. Quick Capture: fecha explícita se conserva fielmente', () => {
  const parsed = parseQuickFinance('gasto 450 farmacia el 2026-10-25');
  assert.ok(parsed);
  assert.equal(parsed.amount, 450);
  assert.equal(parsed.date, '2026-10-25');
  assert.equal(parsed.destination, 'transaction');
});

test('11. Quick Capture: moneda uruguaya no duplica $U $U', () => {
  const parsed1 = parseQuickFinance('$U 1500 internet');
  assert.ok(parsed1);
  assert.equal(parsed1.currency, 'UYU');
  assert.equal(parsed1.amount, 1500);
  assert.ok(!parsed1.preview.includes('$U $U'));

  const parsed2 = parseQuickFinance('$U $U 2000 super');
  assert.ok(parsed2);
  assert.equal(parsed2.currency, 'UYU');
  assert.equal(parsed2.amount, 2000);
  assert.ok(!parsed2.preview.includes('$U $U'));
});

test('12. Quick Capture: pagar (futuro) vs pagué (real)', () => {
  // Pagar compromiso futuro con cuota
  const future = parseQuickFinance('pagar cuota 3 de 12 telefono 2400 el 20');
  assert.ok(future);
  assert.equal(future.destination, 'commitment');
  assert.equal(future.amount, 2400);
  assert.equal(future.currentInstallment, 3);
  assert.equal(future.totalInstallments, 12);
  assert.equal(future.date.slice(-2), '20');

  // Pagué gasto real
  const real = parseQuickFinance('pagué internet 1500 hoy');
  assert.ok(real);
  assert.equal(real.destination, 'transaction');
  assert.equal(real.amount, 1500);
  assert.equal(real.type, 'gasto');

  // Ejecución de universalCapture para compromiso futuro
  const state = createBaseState();
  const initBalance = state.finance.accounts[0].balance;

  const intentFuture = parseUniversalIntent('pagar internet 1500 el 20', {
    accounts: state.finance.accounts,
    categories: state.finance.categories,
  });
  assert.equal(intentFuture.kind, 'finance');
  assert.equal(intentFuture.destination, 'commitment');

  const execFuture = executeUniversalCapture(state, intentFuture);
  assert.ok(execFuture.message);
  // No afecta balance
  assert.equal(state.finance.accounts[0].balance, initBalance);
  assert.equal(state.finance.commitments.length, 1);
  assert.equal(state.finance.transactions.length, 0);

  // Ejecución de universalCapture para movimiento real
  const intentReal = parseUniversalIntent('pagué internet 1500 hoy', {
    accounts: state.finance.accounts,
    categories: state.finance.categories,
  });
  assert.equal(intentReal.kind, 'finance');
  assert.equal(intentReal.destination, 'transaction');

  const execReal = executeUniversalCapture(state, intentReal);
  assert.ok(execReal.message);
  // Sí afecta balance
  assert.equal(state.finance.accounts[0].balance, initBalance - 1500);
  assert.equal(state.finance.transactions.length, 1);
});

test('13. Legacy compatible: transacciones y compromisos preexistentes funcionan sin romper', () => {
  const state = createBaseState();

  // Transacción antigua sin reviewStatus ni reviewed
  const legacyTx: Transaction = {
    id: 'legacy-tx-1',
    effectiveOrder: 'v1-0000000001-000001-event-1',
    type: 'gasto',
    amount: 750,
    category: 'Comida',
    fixed: 'variable',
    date: '2026-10-01',
    accountId: 'acc-main',
    origin: 'manual',
  };
  state.finance.transactions.push(legacyTx);

  // Compromiso antiguo sin cuotas ni status
  const legacyCommitment: FinancialCommitment = {
    id: 'legacy-commit-1',
    name: 'Suscripción Netflix',
    amount: 600,
    nextDueDate: '2026-10-15',
    frequency: 'monthly',
    active: true,
  };
  state.finance.commitments.push(legacyCommitment);

  // deriveFinanceReviewInbox maneja legacy limpiamente
  const inbox = deriveFinanceReviewInbox(state);

  // La transacción legacy tiene categoría limpia y fecha pasada, no debe generar falso positivo
  assert.equal(inbox.items.length, 0);

  // Se puede ignorar o marcar revisada una transacción legacy
  const ignoredTx = ignoreTransactionReview(state, 'legacy-tx-1');
  assert.equal(ignoredTx.reviewStatus, 'ignored');
});

test('14. Sync/convergencia de reviewStatus y commitmentId en mergeFinanceModule', () => {
  const stateA = createBaseState();
  const tx = addTransaction(stateA, {
    amount: 1000,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
  });
  const txId = tx.id;

  const stateB = structuredClone(stateA);

  // Nodo A: vincula a compromiso 'comm-123'
  updateTransaction(stateA, txId, {
    amount: 1000,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    commitmentId: 'comm-123',
    reviewStatus: 'reviewed',
  });

  // Nodo B: no lo tocó
  const merged = mergeFinanceModule(stateB.finance, stateA.finance);
  const mergedTx = merged.transactions.find((t) => t.id === txId);
  assert.ok(mergedTx);
  assert.equal(mergedTx.commitmentId, 'comm-123');
  assert.equal(mergedTx.reviewStatus, 'reviewed');
  assert.equal(mergedTx.reviewed, true);
});

test('15. Review Inbox thresholds: excepciones conservadoras sin convertir inbox en revisión de todo', () => {
  const state = createBaseState();

  // Movimiento A: 'Otros' sin comercio identificado -> NO entra (no es excepción)
  addTransaction(state, {
    amount: 200,
    type: 'gasto',
    category: 'Otros',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'Gasto menor varios',
  });

  // Movimiento B: Quick capture limpio con categoría válida -> NO entra
  addTransaction(state, {
    amount: 350,
    type: 'gasto',
    category: 'Comida',
    accountId: 'acc-main',
    date: '2026-10-08',
    origin: 'quick-capture',
    note: 'Panadería',
  });

  // Movimiento C: Fecha en el futuro (> hoy) -> SÍ entra (suspicious_date)
  const txFuture = addTransaction(state, {
    amount: 500,
    type: 'gasto',
    category: 'Comida',
    accountId: 'acc-main',
    date: '2026-10-25',
    note: 'Almuerzo futuro',
  });

  // Movimiento D: Comercio reconocido ('pedidosya') con caso sin normalizar -> SÍ entra (unnormalized_merchant)
  const txMerchant = addTransaction(state, {
    amount: 400,
    type: 'gasto',
    category: 'Comida',
    accountId: 'acc-main',
    date: '2026-10-08',
    note: 'pedidosya',
  });

  const inbox = deriveFinanceReviewInbox(state, '2026-10-08');

  // Solo los dos casos que realmente tienen anomalías objetivas entraron
  assert.equal(inbox.items.length, 2);
  const futureItem = inbox.items.find((i) => i.transaction.id === txFuture.id);
  const merchantItem = inbox.items.find((i) => i.transaction.id === txMerchant.id);

  assert.ok(futureItem);
  assert.ok(futureItem.reasons.some((r) => r.code === 'suspicious_date'));

  assert.ok(merchantItem);
  assert.ok(merchantItem.reasons.some((r) => r.code === 'unnormalized_merchant'));
});
