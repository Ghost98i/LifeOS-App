import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { getTodayUnifiedOverview } from './todayOverview';

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
