import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDayCheckout, inspectDayCheckout, type DayCheckoutInput } from './checkoutFlows';
import { defaultState, fmtDate, normalizeStoredState } from './storage';

const date = '2026-10-24';
const input = (overrides: Partial<DayCheckoutInput> = {}): DayCheckoutInput => ({
  date,
  trainedSkipped: false,
  trainedSkippedTouched: false,
  studiedSkipped: false,
  expensesSkipped: false,
  dailyNote: '',
  closedAt: '21:30',
  ...overrides,
});

test('el mismo cierre no crea otra nota ni altera la hora, incluso tras recargar', () => {
  const state = defaultState();
  const first = input({ dailyNote: 'Terminé el proyecto' });
  assert.equal(applyDayCheckout(state, first, () => 'reflection-1'), 'ready');
  assert.equal(state.notes.postits.length, 1);
  assert.equal(state.checkoutLog[date].reflectionPostitId, 'reflection-1');

  const reloaded = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.equal(inspectDayCheckout(reloaded, { ...first, closedAt: '22:45' }), 'unchanged');
  assert.equal(applyDayCheckout(reloaded, { ...first, closedAt: '22:45' }), 'unchanged');
  assert.equal(reloaded.notes.postits.length, 1);
  assert.equal(reloaded.checkoutLog[date].closedAt, '21:30');
});

test('editar la reflexión actualiza la nota enlazada y separa días distintos', () => {
  const state = defaultState();
  applyDayCheckout(state, input({ dailyNote: 'Primera versión' }), () => 'reflection-1');
  const historic = { id: 'historic', text: 'Nota histórica', date: '2026-10-20' };
  state.notes.postits.push(historic);
  applyDayCheckout(state, input({ dailyNote: 'Versión corregida', closedAt: '22:00' }));
  assert.equal(state.notes.postits.length, 2);
  assert.equal(state.notes.postits[0].id, 'reflection-1');
  assert.equal(state.notes.postits[0].text, `[Cierre del ${fmtDate(date)}] Versión corregida`);
  assert.deepEqual(state.notes.postits[1], historic);
  assert.equal(state.checkoutLog[date].closedAt, '21:30');

  applyDayCheckout(state, input({ date: '2026-10-25', dailyNote: 'Versión corregida' }), () => 'reflection-2');
  assert.equal(state.notes.postits.length, 3);
  assert.equal(state.notes.postits[0].id, 'reflection-2');
  assert.equal(state.notes.postits[1].id, 'reflection-1');
});

test('una reflexión previa sin enlace se edita por coincidencia única y no duplica post-its', () => {
  const state = defaultState();
  state.checkoutLog[date] = { closedAt: '20:00', dailyNote: 'Texto anterior' };
  state.notes.postits.push({ id: 'legacy', date, text: `[Cierre del ${fmtDate(date)}] Texto anterior` });
  applyDayCheckout(state, input({ dailyNote: 'Texto editado' }));
  assert.equal(state.notes.postits.length, 1);
  assert.equal(state.notes.postits[0].id, 'legacy');
  assert.equal(state.notes.postits[0].text, `[Cierre del ${fmtDate(date)}] Texto editado`);
  assert.equal(state.checkoutLog[date].reflectionPostitId, 'legacy');
});

test('notas históricas ambiguas bloquean solo la edición de reflexión', () => {
  const state = defaultState();
  state.checkoutLog[date] = { closedAt: '20:00', dailyNote: 'Repetida' };
  state.notes.postits = ['old-1', 'old-2'].map((id) => ({ id, date, text: `[Cierre del ${fmtDate(date)}] Repetida` }));
  const before = structuredClone(state);
  const edit = input({ dailyNote: 'Nueva versión' });
  assert.equal(inspectDayCheckout(state, edit), 'ambiguous-reflection');
  assert.equal(applyDayCheckout(state, edit), 'ambiguous-reflection');
  assert.deepEqual(state, before);
});

test('Estado permanece íntegro y los campos opcionales vacíos no se convierten en cero', () => {
  const state = defaultState();
  state.dailyContext.push({ date, sleepHours: 10, energy: 5, mood: 4, connection: null });
  const originalContext = structuredClone(state.dailyContext);
  applyDayCheckout(state, input());
  assert.deepEqual(state.dailyContext, originalContext);
  assert.equal(state.checkoutLog[date].sleepHours, undefined);
  assert.equal(state.checkoutLog[date].energyLevel, undefined);
  assert.equal(state.notes.postits.length, 0);
  applyDayCheckout(state, input({ sleepHours: 8, energyLevel: 3 }));
  assert.deepEqual(state.dailyContext, originalContext);
  assert.equal(state.checkoutLog[date].sleepHours, 8);
  assert.equal(state.checkoutLog[date].energyLevel, 3);
});

test('el descanso solo cambia por control explícito; estudios y gastos no crean registros', () => {
  const state = defaultState();
  state.gym.restDays = [date];
  const beforeStudy = structuredClone(state.study);
  const beforeFinance = structuredClone(state.finance);
  applyDayCheckout(state, input({ studiedSkipped: true, expensesSkipped: true }));
  assert.deepEqual(state.gym.restDays, [date]);
  assert.deepEqual(state.study, beforeStudy);
  assert.deepEqual(state.finance, beforeFinance);
  assert.equal(state.checkoutLog[date].trainedSkipped, true);
  applyDayCheckout(state, input({ trainedSkipped: false, trainedSkippedTouched: true, studiedSkipped: true, expensesSkipped: true }));
  assert.deepEqual(state.gym.restDays, []);
  applyDayCheckout(state, input({ trainedSkipped: true, trainedSkippedTouched: true, studiedSkipped: true, expensesSkipped: true }));
  assert.deepEqual(state.gym.restDays, [date]);
});
