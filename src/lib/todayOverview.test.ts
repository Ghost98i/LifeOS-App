import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { getTodayAgendaCalendarItems, getTodayAgendaEntries, getTodayUnifiedOverview } from './todayOverview';

test('Agenda de Hoy mantiene posiciones al completar, desmarcar y recargar fuentes mezcladas', () => {
  const state = defaultState();
  const date = '2026-10-27';
  state.agenda.martes = [
    { id: 'block-free', activity: 'Actividad sin hora', time: '' },
    { id: 'block-timed', activity: 'Actividad con hora', time: '09:00' },
  ];
  state.tasksRecurring = [
    { id: 'routine-free', name: 'Rutina sin hora', freq: 'daily' },
    { id: 'routine-done', name: 'Rutina terminada', freq: 'daily' },
    { id: 'routine-timed', name: 'Rutina con hora', freq: 'daily', time: '09:00' },
  ];
  state.taskLog = { [date]: { 'routine-done': true } };
  state.todayExtras = [
    { id: 'extra-a', text: 'Misma tarea', date, done: false, priority: 'alta' },
    { id: 'extra-b', text: 'Misma tarea', date, done: true, priority: 'alta' },
    { id: 'extra-c', text: 'Otra tarea', date, done: false, priority: 'baja' },
  ];
  state.calendarEvents = [
    { id: 'event-free', name: 'Evento sin hora', date, type: 'otro', recurring: false },
    { id: 'event-timed', name: 'Evento con hora', date, time: '08:00', type: 'otro', recurring: false },
  ];
  const keys = () => getTodayAgendaEntries(state, date).map((entry) => entry.key);
  const original = keys();
  const pristine = JSON.stringify(state);
  assert.deepEqual(getTodayAgendaEntries(state, date).filter((entry) => entry.time).map((entry) => entry.time), ['08:00', '09:00', '09:00']);
  assert.equal(JSON.stringify(state), pristine, 'El selector no modifica las fuentes');
  for (const id of ['block-free', 'routine-free', 'routine-done', 'block-timed', 'routine-timed']) {
    state.taskLog[date][id] = !state.taskLog[date][id];
    assert.deepEqual(keys(), original, `No debe moverse ${id}`);
    assert.deepEqual(getTodayAgendaEntries(JSON.parse(JSON.stringify(state)), date).map((entry) => entry.key), original);
    state.taskLog[date][id] = !state.taskLog[date][id];
    assert.deepEqual(keys(), original);
  }
  for (const extra of state.todayExtras) {
    extra.done = !extra.done;
    Object.assign(extra, { updatedAt: '2026-10-27T21:00:00Z' });
    assert.deepEqual(keys(), original, `No debe moverse ${extra.id}`);
  }
  // Ties must not inherit the source's done-first order, including after hydration.
  state.todayExtras.reverse();
  state.tasksRecurring.reverse();
  assert.deepEqual(keys(), original);
  assert.deepEqual(getTodayAgendaEntries(JSON.parse(JSON.stringify(state)), date).map((entry) => entry.key), original);
});

test('getTodayUnifiedOverview: extrae prioridades, agenda, tareas y entrenamiento sin mutar el estado', () => {
  const state = defaultState();
  const testDate = '2026-09-26'; // Sábado

  // 1. Prioridades
  state.dailyPriorities = [
    { id: 'dp-1', date: testDate, text: 'Finalizar informe F2', done: false, rank: 2, reasons: ['Urgencia'] },
    { id: 'dp-2', date: testDate, text: 'Enviar CV', done: true, rank: 1 },
    { id: 'dp-old', date: '2026-09-25', text: 'Prioridad de ayer', done: true, rank: 1 },
  ];

  // 2. Agenda para sábado
  state.agenda.sabado = [
    { id: 'ag-1', time: '10:00', activity: 'Estudio de TypeScript' },
    { id: 'ag-2', time: '14:00', activity: 'Entrenamiento Gimnasio' },
  ];
  state.taskLog[testDate] = {
    'ag-1': true, // marcado como asistido/completado en taskLog
  };

  // 3. Tareas extras espontáneas
  state.todayExtras = [
    { id: 'tx-1', date: testDate, text: 'Comprar alimento gatos', done: false, priority: 'alta' },
    { id: 'tx-old', date: '2026-09-20', text: 'Tarea vieja', done: true, priority: 'baja' },
  ];

  // 4. Rutinas recurrentes
  state.tasksRecurring = [
    { id: 'rec-1', name: 'Meditar 10 min', freq: 'daily', effort: 'medium' },
  ];

  // 5. Gimnasio
  state.gym.routineTemplates = [
    {
      id: 'tpl-sabado',
      name: 'Torso & Brazos',
      days: ['sabado'],
      exercises: [],
    },
  ];

  // 6. Finanzas
  state.finance.accounts = [
    { id: 'acc-1', name: 'Efectivo', balance: 4500 },
    { id: 'acc-2', name: 'Banco', balance: 5500 },
  ];

  const cloneBefore = JSON.stringify(state);
  const overview = getTodayUnifiedOverview(state, testDate);
  const cloneAfter = JSON.stringify(state);

  // Invariante de lectura pura: no muta el estado
  assert.equal(cloneBefore, cloneAfter, 'getTodayUnifiedOverview no debe mutar el estado');

  // Prioridades: solo de hoy, ordenadas por rank
  assert.equal(overview.priorities.length, 2);
  assert.equal(overview.priorities[0].id, 'dp-2');
  assert.equal(overview.priorities[0].done, true);
  assert.equal(overview.priorities[1].id, 'dp-1');
  assert.equal(overview.priorities[1].reasons?.[0], 'Urgencia');

  // Agenda: ordenada por horario, conserva estado de taskLog
  assert.equal(overview.schedule.blocks.length, 2);
  assert.equal(overview.schedule.blocks[0].time, '10:00');
  assert.equal(overview.schedule.blocks[0].done, true);
  assert.equal(overview.schedule.blocks[1].time, '14:00');
  assert.equal(overview.schedule.blocks[1].done, false);

  // Tareas extras: solo de hoy
  assert.equal(overview.tasks.extras.length, 1);
  assert.equal(overview.tasks.extras[0].text, 'Comprar alimento gatos');

  // Rutinas recurrentes: meditar diario presente
  assert.equal(overview.tasks.recurring.length, 1);
  assert.equal(overview.tasks.recurring[0].text, 'Meditar 10 min');

  // Conteo de tareas
  assert.equal(overview.tasks.allPendingCount, 2); // 1 extra + 1 recurrente
  assert.equal(overview.tasks.allCompletedCount, 0);

  // Gimnasio: detecta plantilla programada para sábado
  assert.equal(overview.workout.hasWorkoutScheduled, true);
  assert.equal(overview.workout.scheduledTemplateName, 'Torso & Brazos');

  // Contexto financiero: liquidez real líquida estricta
  assert.equal(overview.context.realLiquidity, 10000);
});

test('getTodayUnifiedOverview: modelos permanecen independientes ante cambios', () => {
  const state = defaultState();
  const testDate = '2026-09-26';

  state.dailyPriorities = [{ id: 'p1', date: testDate, text: 'Prioridad única', done: false, rank: 1 }];
  state.todayExtras = [{ id: 't1', date: testDate, text: 'Tarea única', done: false, priority: 'media' }];

  const overview1 = getTodayUnifiedOverview(state, testDate);
  assert.equal(overview1.priorities.length, 1);
  assert.equal(overview1.tasks.extras.length, 1);

  // Completar prioridad no altera tarea
  state.dailyPriorities[0].done = true;
  const overview2 = getTodayUnifiedOverview(state, testDate);
  assert.equal(overview2.priorities[0].done, true);
  assert.equal(overview2.tasks.extras[0].done, false);

  // Completar tarea no altera prioridad
  state.todayExtras[0].done = true;
  const overview3 = getTodayUnifiedOverview(state, testDate);
  assert.equal(overview3.priorities[0].done, true);
  assert.equal(overview3.tasks.extras[0].done, true);
});

test('getTodayAgendaCalendarItems: conserva eventos reales y excluye finanzas y tareas duplicadas', () => {
  const state = defaultState();
  const testDate = '2026-10-14';

  state.calendarEvents = [
    { id: 'event-1', name: 'Presentación', date: testDate, type: 'importante', recurring: false },
  ];
  state.study.subjects = [{ id: 'subject-1', name: 'FEIP' }];
  state.study.exams = [{ id: 'exam-1', subjectId: 'subject-1', date: testDate, status: 'pendiente' }];
  state.todayExtras = [
    { id: 'task-1', date: testDate, dueDate: testDate, text: 'Entregar informe', done: false, priority: 'alta' },
  ];
  state.finance.commitments = [{
    id: 'commitment-1',
    name: 'Pago mensual',
    amount: 1200,
    category: 'Servicios',
    frequency: 'monthly',
    nextDueDate: testDate,
    active: true,
  }];
  state.finance.expectedIncomes = [{
    id: 'income-1',
    name: 'Ingreso esperado',
    amount: 5000,
    startDate: testDate,
    frequency: 'once',
    active: true,
  }];

  const items = getTodayAgendaCalendarItems(state, testDate);

  assert.deepEqual(items.map((item) => item.name), ['Presentación', 'Examen: FEIP']);
  assert.equal(items.some((item) => item.type.startsWith('finanza_')), false);
  assert.equal(items.some((item) => item.type === 'entrega'), false);
});

test('getTodayAgendaEntries: conserva entidades distintas y pliega Foco sobre la tarea', () => {
  const state = defaultState();
  const testDate = '2026-10-14'; // miércoles
  state.agenda.miercoles = [
    { id: 'agenda-a', time: '10:00', activity: 'Bloque A' },
    { id: 'agenda-b', time: '10:00', activity: 'Bloque B' },
  ];
  state.tasksRecurring = [{ id: 'routine-1', name: 'Tender la cama', freq: 'daily', time: '08:30' }];
  state.todayExtras = [
    { id: 'extra-focus', date: testDate, text: 'Estudiar FEIP', done: false, priority: 'alta', time: '14:00' },
    { id: 'extra-free', date: testDate, text: 'Ordenar escritorio', done: false, priority: 'baja' },
  ];
  state.dailyPriorities = [
    { id: 'focus-matched', date: testDate, text: 'Estudiar FEIP', rank: 1 },
    { id: 'focus-independent', date: testDate, text: 'Llamar a mamá', rank: 2 },
  ];
  state.projects = [{
    id: 'project-1', name: 'Proyecto', objective: '', status: 'activo', nextStep: '', createdAt: testDate,
    tasks: [{ id: 'project-task', text: 'Entregar proyecto', done: false, dueDate: testDate, priority: 'alta' }],
  }];
  state.calendarEvents = [
    { id: 'calendar-duplicate', name: 'Ordenar escritorio', date: testDate, type: 'otro', recurring: false },
    { id: 'calendar-only', name: 'Cumpleaños de Ana', date: testDate, type: 'cumpleanos', recurring: false },
  ];

  const entries = getTodayAgendaEntries(state, testDate);
  assert.equal(entries.filter((entry) => entry.label === 'Estudiar FEIP').length, 1);
  assert.equal(entries.find((entry) => entry.label === 'Estudiar FEIP')?.isFocus, true);
  assert.equal(entries.filter((entry) => entry.label === 'Ordenar escritorio').length, 2);
  assert.equal(entries.find((entry) => entry.label === 'Cumpleaños de Ana')?.completable, false);
  assert.equal(entries.find((entry) => entry.label === 'Tender la cama')?.completable, true);
  assert.equal(entries.find((entry) => entry.label === 'Tender la cama')?.time, '08:30');
  assert.equal(entries.some((entry) => entry.source === 'priority' && entry.label === 'Llamar a mamá'), true);
  assert.equal(entries.some((entry) => entry.source === 'proyecto'), true);
  assert.deepEqual(entries.filter((entry) => entry.time === '10:00').map((entry) => entry.label), ['Bloque A', 'Bloque B']);
  assert.equal(entries.find((entry) => entry.label === 'Estudiar FEIP')?.time, '14:00');
});

test('getTodayAgendaEntries: soporta más de ocho actividades y respeta Module Visibility', () => {
  const state = defaultState();
  const testDate = '2026-10-14';
  state.agenda.miercoles = Array.from({ length: 9 }, (_, index) => ({
    id: `agenda-${index}`,
    time: `${String(8 + index).padStart(2, '0')}:00`,
    activity: `Actividad ${index + 1}`,
  }));
  state.tasksRecurring = [{ id: 'routine-hidden', name: 'Rutina oculta', freq: 'daily' }];
  state.calendarEvents = [{ id: 'event-hidden', name: 'Evento oculto', date: testDate, type: 'otro', recurring: false }];
  state.projects = [{
    id: 'project-hidden', name: 'Proyecto', objective: '', status: 'activo', nextStep: '', createdAt: testDate,
    tasks: [{ id: 'task-hidden', text: 'Proyecto oculto', done: false, dueDate: testDate }],
  }];

  assert.equal(getTodayAgendaEntries(state, testDate).length >= 11, true);

  state.settings.hiddenTabs = ['agenda', 'calendario', 'notas', 'gimnasio'];
  const hiddenEntries = getTodayAgendaEntries(state, testDate);
  assert.equal(hiddenEntries.some((entry) => entry.source === 'agenda' || entry.source === 'rutina'), false);
  assert.equal(hiddenEntries.some((entry) => entry.source === 'calendar'), false);
  assert.equal(hiddenEntries.some((entry) => entry.source === 'proyecto'), false);
  assert.equal(hiddenEntries.some((entry) => entry.source === 'gym'), false);
});

test('getTodayAgendaEntries: recalcula recurrencias según la fecha local consultada', () => {
  const state = defaultState();
  state.tasksRecurring = [
    { id: 'daily', name: 'Rutina diaria', freq: 'daily' },
    { id: 'monday', name: 'Rutina del lunes', freq: 'weekly', days: ['lunes'] },
  ];

  const monday = getTodayAgendaEntries(state, '2026-10-12');
  const tuesday = getTodayAgendaEntries(state, '2026-10-13');
  assert.equal(monday.some((entry) => entry.id === 'daily'), true);
  assert.equal(monday.some((entry) => entry.id === 'monday'), true);
  assert.equal(tuesday.some((entry) => entry.id === 'daily'), true);
  assert.equal(tuesday.some((entry) => entry.id === 'monday'), false);
});
