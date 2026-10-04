import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { parseUniversalIntent, executeUniversalCapture } from './universalCapture';

test('parseUniversalIntent: correctly identifies financial transactions', () => {
  const context = {
    accounts: [{ id: 'banco', name: 'Banco', balance: 5000 }],
    categories: ['Comida', 'Transporte', 'Supermercado'],
  };

  const intent1 = parseUniversalIntent('500 comida banco', context);
  assert.equal(intent1.kind, 'finance');
  if (intent1.kind === 'finance') {
    assert.equal(intent1.amount, 500);
    assert.equal(intent1.type, 'gasto');
    assert.equal(intent1.category, 'Comida');
  }

  const intent2 = parseUniversalIntent('gasté 1200 nafta', context);
  assert.equal(intent2.kind, 'finance');
  if (intent2.kind === 'finance') {
    assert.equal(intent2.amount, 1200);
    assert.equal(intent2.type, 'gasto');
  }

  const intent3 = parseUniversalIntent('+ 45000 sueldo banco', context);
  assert.equal(intent3.kind, 'finance');
  if (intent3.kind === 'finance') {
    assert.equal(intent3.amount, 45000);
    assert.equal(intent3.type, 'ingreso');
  }
});

test('parseUniversalIntent: correctly identifies study intentions and durations', () => {
  const context = {
    accounts: [],
    categories: [],
    subjects: [{ id: 'sub-ts', name: 'TypeScript' }],
  };

  const intent1 = parseUniversalIntent('estudiar TypeScript 1 hora', context);
  assert.equal(intent1.kind, 'study');
  if (intent1.kind === 'study') {
    assert.equal(intent1.minutes, 60);
    assert.equal(intent1.subjectId, 'sub-ts');
  }

  const intent2 = parseUniversalIntent('estudiar algoritmos 45 min', context);
  assert.equal(intent2.kind, 'study');
  if (intent2.kind === 'study') {
    assert.equal(intent2.minutes, 45);
    assert.equal(intent2.subjectName, 'algoritmos');
  }
});

test('parseUniversalIntent: correctly identifies ideas, notes, and tasks with priorities', () => {
  const context = { accounts: [], categories: [] };

  const idea = parseUniversalIntent('idea: crear clips para tiktok', context);
  assert.equal(idea.kind, 'idea');
  if (idea.kind === 'idea') {
    assert.equal(idea.text, 'crear clips para tiktok');
  }

  const note = parseUniversalIntent('nota: número de teléfono del plomero', context);
  assert.equal(note.kind, 'note');
  if (note.kind === 'note') {
    assert.equal(note.text, 'número de teléfono del plomero');
  }

  const urgentTask = parseUniversalIntent('urgente: comprar membrana para el techo', context);
  assert.equal(urgentTask.kind, 'task');
  if (urgentTask.kind === 'task') {
    assert.equal(urgentTask.priority, 'alta');
    assert.equal(urgentTask.text, 'comprar membrana para el techo');
  }

  const normalTask = parseUniversalIntent('comprar comida para los gatos', context);
  assert.equal(normalTask.kind, 'task');
  if (normalTask.kind === 'task') {
    assert.equal(normalTask.priority, 'media');
    assert.equal(normalTask.text, 'comprar comida para los gatos');
  }
});

test('executeUniversalCapture: modifies state seamlessly for each domain', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // 1. Finance execution
  const res1 = executeUniversalCapture(state, {
    kind: 'finance',
    type: 'gasto',
    amount: 350,
    category: 'Comida',
  });
  assert.ok(res1.message.includes('350'));
  assert.equal(state.finance.transactions.length, 1);

  // 2. Study execution
  const res2 = executeUniversalCapture(state, {
    kind: 'study',
    subjectName: 'React',
    minutes: 90,
    note: 'Sesión',
  });
  assert.ok(res2.message.includes('90 min'));
  assert.equal(state.study.studyLog.length, 1);

  // 3. Idea execution
  const res3 = executeUniversalCapture(state, {
    kind: 'idea',
    text: 'Nueva idea de canal',
  });
  assert.ok(res3.message.includes('Idea'));
  assert.equal(state.ideas.length, 1);

  // 4. Task execution
  const res4 = executeUniversalCapture(state, {
    kind: 'task',
    text: 'Revisar servidor',
    priority: 'alta',
  });
  assert.ok(res4.message.includes('Tarea'));
  assert.equal(state.todayExtras.length, 1);
  assert.equal(state.todayExtras[0].priority, 'alta');
});

test('parseUniversalIntent: prevents false positives with numbers and measurement units (e.g. 23 horas)', () => {
  const context = {
    accounts: [{ id: 'banco', name: 'Banco', balance: 5000 }],
    categories: ['Comida', 'Transporte', 'Varios'],
  };

  // Case reported by user: "Idea de transmitir 23 horas" MUST be an idea, NEVER finance
  const userCase = parseUniversalIntent('Idea de transmitir 23 horas', context);
  assert.equal(userCase.kind, 'idea');
  if (userCase.kind === 'idea') {
    assert.equal(userCase.text, 'Idea de transmitir 23 horas');
  }

  // Without "Idea", numbers with time/distance/weight units MUST NOT be finance
  const taskWithHours = parseUniversalIntent('Transmitir 23 horas', context);
  assert.equal(taskWithHours.kind, 'task');

  const taskWithDistance = parseUniversalIntent('Correr 5 km en 30 minutos', context);
  assert.equal(taskWithDistance.kind, 'task');

  const taskWithWeight = parseUniversalIntent('Pesar 80 kg en ayunas', context);
  assert.equal(taskWithWeight.kind, 'task');

  const taskWithReps = parseUniversalIntent('Hacer 20 flexiones y 3 series', context);
  assert.equal(taskWithReps.kind, 'task');

  // Notes and reminders priority
  const noteRecordar = parseUniversalIntent('Recordar pagar Antel el 10', context);
  assert.equal(noteRecordar.kind, 'note');

  const notePensar = parseUniversalIntent('Pensar en rediseño de interfaz', context);
  assert.equal(notePensar.kind, 'note');

  const notePrefixed = parseUniversalIntent('Nota para mañana: comprar 2 paquetes', context);
  assert.equal(notePrefixed.kind, 'note');

  // Real financial expressions with explicit currency or transactional verbs
  const realExpenseCurrency = parseUniversalIntent('$500 en feria', context);
  assert.equal(realExpenseCurrency.kind, 'finance');
  if (realExpenseCurrency.kind === 'finance') {
    assert.equal(realExpenseCurrency.amount, 500);
  }

  // Financial with verb and mixed units: should extract the money, not the hours!
  const mixedFinancial = parseUniversalIntent('pagué $500 por 23 horas de servidor', context);
  assert.equal(mixedFinancial.kind, 'finance');
  if (mixedFinancial.kind === 'finance') {
    assert.equal(mixedFinancial.amount, 500);
  }
});

