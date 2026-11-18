import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDayCheckout,
  deriveDayCheckoutSummary,
  inspectDayCheckout,
  rolloverPendingExtrasToTomorrow,
  undoRolloverPendingExtras,
  type DayCheckoutInput,
} from './checkoutFlows';
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

test('deriveDayCheckoutSummary calcula métricas reales del día sin persistir snapshots y respeta ausencia de presupuesto', () => {
  const state = defaultState();
  // '2026-10-24' es sábado
  state.tasksRecurring = [
    { id: 'rec-1', name: 'Tomar agua', freq: 'daily' },
    { id: 'rec-2', name: 'Leer', freq: 'daily' },
  ];
  state.taskLog = { [date]: { 'rec-1': true } };
  state.todayExtras = [
    { id: 'ex-1', date, text: 'Enviar informe', done: true, priority: 'alta' },
    { id: 'ex-2', date, text: 'Ordenar escritorio', done: false, priority: 'media', dueDate: date },
  ];
  state.study.studyLog = [
    { id: 'sl-1', date, minutes: 45 },
    { id: 'sl-2', date: '2026-10-23', minutes: 60 },
  ];
  state.finance.transactions = [
    { id: 'tx-1', type: 'gasto', amount: 350, category: 'Comida', fixed: 'variable', date },
    { id: 'tx-2', type: 'gasto', amount: 150, category: 'Transporte', fixed: 'variable', date },
    { id: 'tx-3', type: 'ingreso', amount: 5000, category: 'Sueldo', fixed: 'fijo', date },
  ];

  // Sin presupuesto configurado => dailyLimit debe ser null
  const withoutBudget = deriveDayCheckoutSummary(state, date);
  assert.equal(withoutBudget.tasks.completed, 2);
  assert.equal(withoutBudget.tasks.pending, 2);
  assert.equal(withoutBudget.tasks.total, 4);
  assert.equal(withoutBudget.tasks.completionPct, 50);
  assert.equal(withoutBudget.tasks.pendingExtrasCount, 1);
  assert.equal(withoutBudget.study.minutesToday, 45);
  assert.equal(withoutBudget.training.trained, false);
  assert.equal(withoutBudget.spending.spentToday, 500);
  assert.equal(withoutBudget.spending.dailyLimit, null);

  // Con presupuesto mensual global en octubre (31 días): 31000 / 31 = 1000
  state.finance.monthlyBudgets = {
    '2026-10:UYU': { month: '2026-10', currency: 'UYU', globalLimit: 31000, categoryLimits: {} },
  };
  const withBudget = deriveDayCheckoutSummary(state, date);
  assert.equal(withBudget.spending.dailyLimit, 1000);
  assert.equal(state.checkoutLog[date], undefined, 'No se deben persistir snapshots derivados');
});

test('rolloverPendingExtrasToTomorrow mueve solo pendientes puntuales de hoy, es idempotente y reversible', () => {
  const state = defaultState();
  state.tasksRecurring = [{ id: 'rec-daily', name: 'Rutina diaria', freq: 'daily' }];
  state.todayExtras = [
    {
      id: 'ex-done',
      date,
      text: 'Completada hoy',
      done: true,
      priority: 'media',
    },
    {
      id: 'ex-due-today',
      date,
      dueDate: date,
      text: 'Pendiente con vencimiento hoy',
      done: false,
      priority: 'alta',
      dependsOn: ['dep-1'],
      linkedType: 'study',
      linkedId: 'sub-1',
    },
    {
      id: 'ex-future-due',
      date,
      dueDate: '2026-10-30',
      text: 'Pendiente con vencimiento futuro',
      done: false,
      priority: 'baja',
    },
  ];
  state.taskLog = { [date]: { 'rec-daily': false } };

  const first = rolloverPendingExtrasToTomorrow(state, date, '2026-10-24T22:00:00.000Z');
  assert.equal(first.movedCount, 2);
  assert.equal(first.alreadyRolledOver, false);
  assert.equal(first.tomorrowIso, '2026-10-25');
  assert.equal(state.checkoutLog[date].rolledOverAt, '2026-10-24T22:00:00.000Z');

  // Completada permanece en today
  assert.equal(state.todayExtras.find((e) => e.id === 'ex-done')?.date, date);
  // Pendiente con vencimiento hoy mueve date y dueDate, preservando campos
  const movedDueToday = state.todayExtras.find((e) => e.id === 'ex-due-today')!;
  assert.equal(movedDueToday.date, '2026-10-25');
  assert.equal(movedDueToday.dueDate, '2026-10-25');
  assert.equal(movedDueToday.priority, 'alta');
  assert.deepEqual(movedDueToday.dependsOn, ['dep-1']);
  assert.equal(movedDueToday.linkedType, 'study');
  assert.equal(movedDueToday.linkedId, 'sub-1');
  // Pendiente con vencimiento futuro mueve date pero conserva dueDate futuro
  const movedFutureDue = state.todayExtras.find((e) => e.id === 'ex-future-due')!;
  assert.equal(movedFutureDue.date, '2026-10-25');
  assert.equal(movedFutureDue.dueDate, '2026-10-30');
  // taskLog intacto
  assert.deepEqual(state.taskLog[date], { 'rec-daily': false });

  // Segundo intento es idempotente
  const second = rolloverPendingExtrasToTomorrow(state, date, '2026-10-24T22:05:00.000Z');
  assert.equal(second.movedCount, 0);
  assert.equal(second.alreadyRolledOver, true);

  // Sigue siendo compatible con inspectDayCheckout / applyDayCheckout y preserva rolledOverAt
  assert.equal(inspectDayCheckout(state, input({ dailyNote: 'Buen día' })), 'ready');
  assert.equal(applyDayCheckout(state, input({ dailyNote: 'Buen día' }), () => 'post-1'), 'ready');
  assert.equal(state.checkoutLog[date].rolledOverAt, '2026-10-24T22:00:00.000Z');

  // Deshacer restaura fechas originales y limpia rolledOverAt
  undoRolloverPendingExtras(state, date, first.movedSnapshots);
  assert.equal(state.todayExtras.find((e) => e.id === 'ex-due-today')?.date, date);
  assert.equal(state.todayExtras.find((e) => e.id === 'ex-due-today')?.dueDate, date);
  assert.equal(state.checkoutLog[date].rolledOverAt, undefined);
});
