import assert from 'node:assert/strict';
import test from 'node:test';
import type { TodayExtra } from '../types';
import { defaultState, normalizeStoredState } from './storage';
import { agendaWeek, localDateISO, parseLocalDateISO } from './agendaWeek';
import { getDatedAgendaTasks, datedTaskDestination, agendaTaskFocusId } from './datedAgendaTasks';
import { calendarItemsOnDate } from './calculations';
import { getTodayAgendaEntries } from './todayOverview';
import { parseCaptureDrafts, confirmCaptureDraft, canConfirmDraft } from './quickCaptureDrafts';
import { parseUniversalIntent } from './universalCapture';

const extra = (id = 'synthetic-medusa-task', date = '2026-10-30'): TodayExtra => ({ id, date, text: 'gaste 5000 en la medusa', done: false, priority: 'media' });
const friday = (state: ReturnType<typeof defaultState>) => agendaWeek(state, parseLocalDateISO('2026-10-30')!)[4];

test('una tarea fechada sin hora comparte identidad en Hoy, Agenda y Calendario; la proyección no escribe', () => {
  const state = defaultState(); state.todayExtras = [extra()]; const before = JSON.stringify(state);
  const today = getTodayAgendaEntries(state, '2026-10-30').filter(item => item.id === extra().id);
  const weekly = friday(state).tasks;
  const calendar = calendarItemsOnDate(state, '2026-10-30').filter(item => item.taskRef?.id === extra().id);
  assert.equal(today.length, 1); assert.equal(today[0].sourceLabel, 'Tarea'); assert.equal(today[0].time, null);
  assert.equal(weekly.length, 1); assert.equal(weekly[0].id, today[0].id); assert.equal(weekly[0].time, undefined); assert.equal(weekly[0].done, false);
  assert.equal(calendar.length, 1); assert.deepEqual(calendar[0].taskRef, { source: 'extra', id: today[0].id });
  assert.equal(friday(state).events.some(item => item.taskRef), false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(friday(normalizeStoredState(JSON.parse(before))).tasks[0].id, extra().id);
});

test('fecha programada y vencimiento se proyectan en sus días; cuando coinciden hay una sola fila', () => {
  const state = defaultState(); state.todayExtras = [{ ...extra(), date: '2026-10-29', dueDate: '2026-10-30', time: '14:30' }];
  assert.equal(getDatedAgendaTasks(state, '2026-10-29')[0].time, '14:30');
  assert.equal(getDatedAgendaTasks(state, '2026-10-30')[0].isDeadline, true);
  assert.equal(getDatedAgendaTasks(state, '2026-10-30')[0].time, undefined);
  state.todayExtras[0].date = '2026-10-30';
  assert.equal(friday(state).tasks.length, 1); assert.equal(friday(state).tasks[0].time, '14:30');
  assert.equal(calendarItemsOnDate(state, '2026-10-30').filter(item => item.taskRef?.id === extra().id).length, 1);
  assert.equal(getTodayAgendaEntries(state, '2026-10-30').filter(item => item.id === extra().id).length, 1);
});

test('las tareas no reemplazan acontecimientos puntuales, actividades ni rutinas recurrentes', () => {
  const state = defaultState(); state.todayExtras = [extra()];
  state.agenda.viernes = [{ id: 'block', time: '08:00', activity: 'Clases' }];
  state.tasksRecurring = [{ id: 'routine', name: 'Repasar', freq: 'weekly', days: ['viernes'] }];
  state.calendarEvents = [{ id: 'event', date: '2026-10-30', name: 'Turno médico', type: 'cita', recurring: false }];
  const day = friday(state); assert.equal(day.tasks.length, 1); assert.equal(day.blocks[0].id, 'block'); assert.equal(day.routines[0].id, 'routine'); assert.equal(day.events[0].id, 'event');
  assert.equal(agendaWeek(state, parseLocalDateISO('2026-11-06')!)[4].tasks.length, 0);
  assert.equal(agendaWeek(state, parseLocalDateISO('2026-11-06')!)[4].routines[0].id, 'routine');
});

test('mismo nombre con IDs distintos no se fusiona; referencias de la misma tarea no la duplican', () => {
  const state = defaultState(); state.todayExtras = [{ ...extra('one'), dueDate: '2026-10-30' }, extra('two')];
  state.calendarEvents = [{ id: 'event', name: extra().text, date: '2026-10-30', type: 'otro', recurring: false }];
  const day = friday(state); assert.deepEqual(day.tasks.map(task => task.id), ['one', 'two']); assert.equal(day.events.length, 1);
  assert.equal(getTodayAgendaEntries(state, '2026-10-30').filter(item => item.label === extra().text).length, 3);
  assert.equal(calendarItemsOnDate(state, '2026-10-30').filter(item => item.taskRef?.id === 'one').length, 1);
});

test('las tareas completadas conservan su estado y no se vuelven a abrir; movimientos financieros no son tareas', () => {
  const state = defaultState(); state.todayExtras = [{ ...extra(), done: true }]; const financeBefore = JSON.stringify(state.finance);
  assert.equal(friday(state).tasks[0].done, true); assert.equal(getTodayAgendaEntries(state, '2026-10-30').find(item => item.id === extra().id)?.done, true);
  assert.equal(calendarItemsOnDate(state, '2026-10-30').find(item => item.taskRef)?.isDone, true);
  state.todayExtras = []; state.finance.transactions = [{ id: 'expense', type: 'gasto', amount: 5000, category: 'Otros', fixed: 'variable', date: '2026-10-30', note: extra().text }];
  assert.equal(friday(state).tasks.length, 0); assert.equal(friday(state).events.some(item => item.financialType), false);
  state.finance.transactions = []; assert.equal(JSON.stringify(state.finance), financeBefore);
});

test('desactivación de módulos y eliminación de entidades respetan las reglas existentes', () => {
  const state = defaultState(); state.todayExtras = [extra()]; state.settings.hiddenTabs = ['agenda'];
  assert.equal(friday(state).tasks.length, 0); assert.equal(state.todayExtras.length, 1);
  state.settings.hiddenTabs = []; state.todayExtras = []; assert.equal(friday(state).tasks.length, 0);
});

test('semanas que cruzan meses y años conservan las fechas locales, sin truncar timestamps UTC', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['America/Montevideo', 'Pacific/Auckland']) {
      process.env.TZ = zone; const state = defaultState(); state.todayExtras = [extra('last', '2026-12-31'), extra('next', '2027-01-01')];
      const week = agendaWeek(state, parseLocalDateISO('2027-01-01')!);
      assert.equal(week[3].tasks[0].id, 'last'); assert.equal(week[4].tasks[0].id, 'next');
      assert.equal(agendaWeek(state, parseLocalDateISO('2026-11-01')!)[4].date, '2026-10-30');
    }
    process.env.TZ = 'America/Montevideo'; const local = localDateISO(new Date('2026-10-31T02:30:00Z'));
    assert.equal(local, '2026-10-30'); const state = defaultState(); state.todayExtras = [extra('local', local), extra('timestamp', '2026-10-31T02:30:00Z')];
    assert.deepEqual(getDatedAgendaTasks(state, local).map(task => task.id), ['local']);
    assert.equal(calendarItemsOnDate(state, local).filter(item => item.taskRef).length, 1);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('la navegación de tareas conserva la fuente original y la identidad', () => {
  assert.notEqual(agendaTaskFocusId({ source: 'extra', id: 'one' }, '2026-10-29'), agendaTaskFocusId({ source: 'extra', id: 'one' }, '2026-10-30'));
  assert.deepEqual(datedTaskDestination({ source: 'extra', id: 'one' }), { view: 'dashboard', options: { focusId: 'today-extra-one' } });
  assert.deepEqual(datedTaskDestination({ source: 'project_task', id: 'two', projectId: 'project' }), { view: 'notas', options: { tab: 'proyectos', focusId: 'project-task-two' } });
});

test('vencimientos de proyecto mantienen las reglas de Hoy y Calendario, incluido su estado original', () => {
  const state = defaultState(); state.projects = [{ id: 'project', name: 'Proyecto', objective: '', nextStep: '', createdAt: '2026-10-01', status: 'cancelado', tasks: [{ id: 'project-task', text: 'Entrega', dueDate: '2026-10-30', done: true }, { id: 'undated', text: 'Sin fecha', done: false }] }];
  const before = JSON.stringify(state); const task = friday(state).tasks.find(item => item.id === 'project-task');
  assert.ok(task); assert.equal(task.source, 'project_task'); assert.equal(task.done, true); assert.equal(task.projectId, 'project');
  assert.equal(getTodayAgendaEntries(state, '2026-10-30').find(item => item.id === 'project-task')?.done, true);
  assert.equal(calendarItemsOnDate(state, '2026-10-30').find(item => item.taskRef?.id === 'project-task')?.isDone, true);
  assert.equal(friday(state).tasks.some(item => item.id === 'undated'), false); assert.equal(JSON.stringify(state), before);
  state.settings.hiddenTabs = ['notas']; assert.equal(friday(state).tasks.some(item => item.id === 'project-task'), false);
});

test('Quick Capture reconoce gasté/gaste como gasto; tarea explícita prevalece y no afecta Finanzas', () => {
  const state = defaultState(); const before = JSON.stringify(state);
  for (const text of ['gasté 5000 en la medusa', 'gaste 5000 en la medusa', 'gasto: 5000 en la medusa']) {
    const draft = parseCaptureDrafts(text, state, { defaultDate: '2026-10-30' })[0];
    assert.equal(draft.kind, 'finance'); if (draft.kind !== 'finance') throw new Error('Expected finance'); assert.equal(draft.type, 'gasto'); assert.equal(draft.amount, 5000);
    assert.equal(draft.missingFields?.includes('category'), true); assert.equal(canConfirmDraft(state, draft).valid, false);
  }
  assert.equal(JSON.stringify(state), before);
  for (const text of ['tarea: gasté 5000 en la medusa', 'crear tarea: revisar el gasto de 5000 en la medusa']) {
    const draft = parseCaptureDrafts(text, state, { defaultDate: '2026-10-30' })[0]; assert.equal(draft.kind, 'task');
    assert.equal(parseUniversalIntent(text, state.finance).kind, 'task');
    const copy = structuredClone(state); confirmCaptureDraft(copy, draft); assert.equal(copy.todayExtras.length, state.todayExtras.length + 1); assert.equal(JSON.stringify(copy.finance), JSON.stringify(state.finance));
  }
});

test('intención de evento explícita conserva el borrador de Agenda y no se convierte en gasto', () => {
  const state = defaultState(); const before = JSON.stringify(state);
  const draft = parseCaptureDrafts('evento: revisar el gasto de 5000 mañana a las 15:00', state, { defaultDate: '2026-10-30' })[0];
  assert.equal(draft.kind, 'agenda'); if (draft.kind !== 'agenda') throw new Error('Expected agenda');
  assert.equal(draft.date, '2026-10-31'); assert.equal(draft.time, '15:00'); assert.equal(JSON.stringify(state), before);
  assert.equal(draft.activity, 'revisar el gasto de 5000');
  assert.equal(parseCaptureDrafts('tarea:', state, { defaultDate: '2026-10-30' })[0].missingFields?.includes('title'), true);
});
