import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addQuickNote, addQuickTask, addQuickTransaction, suggestedQuickAccountId } from './quickCapture';

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
