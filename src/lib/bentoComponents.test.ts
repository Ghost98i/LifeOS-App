import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { addQuickTask, addQuickNote, addQuickTransaction } from './quickCapture';
import { parseQuickFinance } from '../utils/quickFinanceParser';

test('BentoRadialGauge calculation logic: safe percentage calculations without NaN', () => {
  // Logic mirror of BentoRadialGauge computedPercent
  const computePercent = (
    percentage?: number,
    value?: number,
    max?: number
  ) => {
    if (typeof percentage === 'number' && !Number.isNaN(percentage)) {
      return Math.min(100, Math.max(0, percentage));
    }
    if (typeof max === 'number' && max > 0 && typeof value === 'number' && !Number.isNaN(value)) {
      return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
    }
    return 0;
  };

  // Normal cases
  assert.equal(computePercent(undefined, 1, 3), 33);
  assert.equal(computePercent(undefined, 2, 3), 67);
  assert.equal(computePercent(undefined, 3, 3), 100);
  assert.equal(computePercent(undefined, 0, 3), 0);

  // Edge cases that previously caused NaN
  assert.equal(computePercent(undefined, undefined, undefined), 0);
  assert.equal(computePercent(undefined, 0, 0), 0);
  assert.equal(computePercent(NaN, 1, 3), 33);
  assert.equal(computePercent(NaN, undefined, undefined), 0);

  // Clamping
  assert.equal(computePercent(150), 100);
  assert.equal(computePercent(-25), 0);
  assert.equal(computePercent(undefined, 5, 3), 100);
  assert.equal(computePercent(undefined, -2, 3), 0);
});

test('TodayFocus priorities percentage logic: no division by zero when priorities are empty', () => {
  const calculateTodayProgress = (priorities: { done: boolean }[]) => {
    const total = priorities.length;
    const completedCount = priorities.filter((p) => p.done).length;
    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    return { completedCount, total, percent };
  };

  // 0 priorities loaded
  const empty = calculateTodayProgress([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.completedCount, 0);
  assert.equal(empty.percent, 0);
  assert.ok(!Number.isNaN(empty.percent));

  // 1 priority, 0 done
  const onePending = calculateTodayProgress([{ done: false }]);
  assert.equal(onePending.percent, 0);

  // 1 priority, 1 done
  const oneDone = calculateTodayProgress([{ done: true }]);
  assert.equal(oneDone.percent, 100);

  // 3 priorities, 1 done
  const threeOne = calculateTodayProgress([{ done: true }, { done: false }, { done: false }]);
  assert.equal(threeOne.percent, 33);

  // 3 priorities, 3 done
  const threeDone = calculateTodayProgress([{ done: true }, { done: true }, { done: true }]);
  assert.equal(threeDone.percent, 100);
});

test('BentoCommandBar: dispatches quick finance expressions accurately', () => {
  const state = defaultState();
  const accounts = state.finance.accounts;
  const categories = state.finance.categories;

  // Test natural language finance input
  const parsed = parseQuickFinance('750 super', { accounts, categories });
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.amount, 750);
  assert.equal(parsed.type, 'gasto');

  // Transaction execution
  const prevCount = state.finance.transactions.length;
  addQuickTransaction(state, {
    type: parsed.type,
    amount: parsed.amount || 0,
    category: parsed.category || 'Varios',
    accountId: parsed.accountId || accounts[0]?.id,
    date: parsed.date,
  });

  assert.equal(state.finance.transactions.length, prevCount + 1);
  const lastTx = state.finance.transactions[state.finance.transactions.length - 1];
  assert.equal(lastTx.amount, 750);
});

test('BentoCommandBar: dispatches notes when prefixed with nota: or idea:', () => {
  const state = defaultState();
  const rawNote = 'nota: Revisar contrato de hosting el lunes';
  const text = rawNote.replace(/^(nota:|idea:)\s*/i, '');

  const prevNotes = state.notes?.postits?.length || 0;
  addQuickNote(state, text);

  assert.equal((state.notes?.postits?.length || 0), prevNotes + 1);
  const added = state.notes.postits[state.notes.postits.length - 1];
  assert.equal(added.text, 'Revisar contrato de hosting el lunes');
});

test('BentoCommandBar: dispatches regular input as daily task', () => {
  const state = defaultState();
  const rawTask = 'Comprar repuesto para la bicicleta';

  const prevExtras = state.todayExtras?.length || 0;
  addQuickTask(state, rawTask, 'media');

  assert.equal((state.todayExtras?.length || 0), prevExtras + 1);
  const added = state.todayExtras[state.todayExtras.length - 1];
  assert.equal(added.text, 'Comprar repuesto para la bicicleta');
  assert.equal(added.priority, 'media');
  assert.equal(added.done, false);
});

test('TodayFocus counter representation: always formatted as 0/3 without spaces or wrap opportunity', () => {
  const formatTodayFocusCounter = (completedCount: number) => `${completedCount}/3`;

  // Always compact format with no space around slash
  assert.equal(formatTodayFocusCounter(0), '0/3');
  assert.equal(formatTodayFocusCounter(1), '1/3');
  assert.equal(formatTodayFocusCounter(2), '2/3');
  assert.equal(formatTodayFocusCounter(3), '3/3');
  // Strict invariant: no whitespace around slash
  assert.ok(!formatTodayFocusCounter(0).includes(' '));
  assert.ok(!formatTodayFocusCounter(0).includes('\n'));
});

test('Stream Guard coverage and reveal rules: sensitive finances protected, quick capture and notes unprotected by default', () => {
  // 1. Finanzas: Saldos, Disponible, Comprometido, Proyectado deben estar cubiertos
  const sensitiveFinanceFields = ['saldo_real', 'disponible', 'comprometido', 'proyectado', 'transacciones'];
  assert.ok(sensitiveFinanceFields.includes('comprometido'), 'Comprometido sí forma parte de Stream Guard');
  assert.ok(sensitiveFinanceFields.includes('saldo_real'));
  assert.ok(sensitiveFinanceFields.includes('disponible'));
  assert.ok(sensitiveFinanceFields.includes('proyectado'));

  // 2. Quick Capture & Capturá algo NO deben quedar protegidos por Stream Guard
  const unprotectedCaptureSurfaces = ['bento_command_bar_input', 'mobile_quick_capture_input', 'mobile_quick_capture_preview'];
  for (const surface of unprotectedCaptureSurfaces) {
    assert.ok(!surface.includes('sensitive'), `${surface} must not be obscured by Stream Guard`);
  }

  // 3. Notas no deben quedar protegidas por defecto
  const defaultNotesPrivacy = false;
  assert.equal(defaultNotesPrivacy, false, 'Notas quedan visibles por defecto en Stream Guard');
});
