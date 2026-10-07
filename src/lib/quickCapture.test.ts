import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  addQuickInbox,
  addQuickNote,
  addQuickTask,
  addQuickTransaction,
  convertInboxItem,
  suggestedQuickAccountId,
} from './quickCapture';
import { addTransaction, reconcileAccount } from './financeFlows';

test('Quick Capture respeta la misma no retroactividad que Finanzas', () => {
  const financeState = defaultState();
  const quickState = defaultState();
  const financeAccount = financeState.finance.accounts[0];
  const quickAccount = quickState.finance.accounts[0];
  financeAccount.balance = 1000;
  quickAccount.balance = 1000;

  reconcileAccount(financeState, { accountId: financeAccount.id, actualBalance: 1000, date: '2026-09-10' });
  reconcileAccount(quickState, { accountId: quickAccount.id, actualBalance: 1000, date: '2026-09-10' });

  addTransaction(financeState, {
    type: 'gasto', amount: 100, category: 'Comida', fixed: 'variable',
    accountId: financeAccount.id, date: '2026-09-09',
  });
  addQuickTransaction(quickState, {
    type: 'gasto', amount: 100, category: 'Comida',
    accountId: quickAccount.id, date: '2026-09-09',
  });

  assert.equal(financeAccount.balance, 1000);
  assert.equal(quickAccount.balance, financeAccount.balance);
  assert.equal(quickState.finance.transactions.length, financeState.finance.transactions.length);

  const laterFinanceState = defaultState();
  const laterQuickState = defaultState();
  const laterFinanceAccount = laterFinanceState.finance.accounts[0];
  const laterQuickAccount = laterQuickState.finance.accounts[0];
  laterFinanceAccount.balance = 1000;
  laterQuickAccount.balance = 1000;
  reconcileAccount(laterFinanceState, { accountId: laterFinanceAccount.id, actualBalance: 1000, date: '2026-09-10' });
  reconcileAccount(laterQuickState, { accountId: laterQuickAccount.id, actualBalance: 1000, date: '2026-09-10' });

  addTransaction(laterFinanceState, {
    type: 'gasto', amount: 100, category: 'Comida', fixed: 'variable',
    accountId: laterFinanceAccount.id, date: '2026-09-11',
  });
  addQuickTransaction(laterQuickState, {
    type: 'gasto', amount: 100, category: 'Comida',
    accountId: laterQuickAccount.id, date: '2026-09-11',
  });

  assert.equal(laterFinanceAccount.balance, 900);
  assert.equal(laterQuickAccount.balance, laterFinanceAccount.balance);
});

test('captura un ingreso y actualiza la cuenta elegida', () => {
  const state = defaultState();
  const account = state.finance.accounts[1];
  const transaction = addQuickTransaction(state, {
    type: 'ingreso',
    amount: 500,
    accountId: account.id,
    category: 'Otros',
    note: 'Ingreso de prueba',
    date: '2026-08-10',
  });

  assert.equal(transaction.type, 'ingreso');
  assert.equal(transaction.note, 'Ingreso de prueba');
  assert.equal(account.balance, 500);
});

test('rechaza montos vacíos o negativos', () => {
  const state = defaultState();
  assert.throws(() => addQuickTransaction(state, { type: 'gasto', amount: 0 }), /monto válido/);
  assert.throws(() => addQuickTransaction(state, { type: 'ingreso', amount: -100 }), /monto válido/);
});

test('sugiere el banco y luego recuerda la última cuenta usada para ese tipo', () => {
  const state = defaultState();
  const cash = state.finance.accounts[0];
  const bank = state.finance.accounts[1];
  assert.equal(suggestedQuickAccountId(state, 'ingreso'), bank.id);

  addQuickTransaction(state, { type: 'ingreso', amount: 500, accountId: cash.id });
  assert.equal(suggestedQuickAccountId(state, 'ingreso'), cash.id);
});

test('captura una tarea para hoy y una nota sin abrir otros módulos', () => {
  const state = defaultState();
  addQuickTask(state, 'Llamar a mamá', 'alta', '2026-08-10');
  addQuickNote(state, 'Idea para el escritorio', '2026-08-10');
  assert.equal(state.todayExtras[0].text, 'Llamar a mamá');
  assert.equal(state.todayExtras[0].priority, 'alta');
  assert.equal(state.notes.postits[0].text, 'Idea para el escritorio');
});

test('addQuickNote agrega un fragmento de texto directamente a state.notes.postits y valida texto no vacío', () => {
  const state = defaultState();
  const initialCount = state.notes.postits.length;
  const id1 = addQuickNote(state, 'Comprar repuesto foco cocina', '2026-09-15');
  assert.ok(id1);
  assert.equal(state.notes.postits.length, initialCount + 1);
  assert.equal(state.notes.postits[initialCount].text, 'Comprar repuesto foco cocina');
  assert.equal(state.notes.postits[initialCount].date, '2026-09-15');

  const id2 = addQuickNote(state, '  Recordar clave wifi invitado  ', '2026-09-15');
  assert.ok(id2);
  assert.notEqual(id1, id2);
  assert.equal(state.notes.postits.length, initialCount + 2);
  assert.equal(state.notes.postits[initialCount + 1].text, 'Recordar clave wifi invitado');

  assert.throws(() => addQuickNote(state, '   '), /la nota/);
});

test('addQuickInbox agrega pendientes sin clasificar y convertInboxItem los transforma correctamente', () => {
  const state = defaultState();
  const id1 = addQuickInbox(state, 'Averiguar costo de flete para mudanza');
  assert.ok(id1);
  assert.equal(state.inbox?.length, 1);
  assert.equal(state.inbox?.[0].text, 'Averiguar costo de flete para mudanza');

  // Convertir a tarea
  const { convertedId: taskId } = convertInboxItem(state, id1, 'tarea', { priority: 'alta' });
  assert.ok(taskId);
  assert.equal(state.inbox?.length, 0); // removido de la bandeja
  assert.equal(state.todayExtras.length, 1);
  assert.equal(state.todayExtras[0].text, 'Averiguar costo de flete para mudanza');
  assert.equal(state.todayExtras[0].priority, 'alta');

  // Capturar otro y convertir a proyecto
  const id2 = addQuickInbox(state, 'Lanzar nuevo canal de cocina');
  const { convertedId: projId } = convertInboxItem(state, id2, 'proyecto');
  assert.ok(projId);
  assert.equal(state.inbox?.length, 0);
  assert.equal(state.projects?.length, 1);
  assert.equal(state.projects?.[0].name, 'Lanzar nuevo canal de cocina');
  assert.equal(state.projects?.[0].status, 'activo');
  assert.equal(state.projects?.[0].nextStep, 'Definir primera acción concreta');

  // Capturar y convertir a nota
  const id3 = addQuickInbox(state, 'Cita leída: "La disciplina es libertad"');
  convertInboxItem(state, id3, 'nota');
  assert.equal(state.inbox?.length, 0);
  assert.ok(state.notes.postits.some((n) => n.text.includes('La disciplina es libertad')));
});

