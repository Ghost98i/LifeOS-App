import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, uid } from './storage';
import {
  getPastPendingExtras,
  getFutureScheduledExtras,
  getTodayAgendaEntries,
} from './todayOverview';
import { getTodayAttentionItems } from './todayAttention';
import { calendarItemsOnDate } from './calculations';

function createCleanState(todayIso: string = '2026-10-19') {
  const state = defaultState();
  state.settings.lastBackupAt = todayIso;
  state.settings.lastWeeklyReviewAt = todayIso;
  state.projects = [];
  state.finance.commitments = [];
  state.finance.agreements = [];
  state.study.exams = [];
  state.todayExtras = [];
  return state;
}

test('1. Tarea programada ayer sin dueDate: recuperable en pendientes anteriores, NO vencida en Atención ahora', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const yesterdayIso = '2026-10-18';

  state.todayExtras = [
    {
      id: 'task-no-deadline',
      date: yesterdayIso,
      text: 'Revisar apuntes',
      done: false,
      priority: 'media',
    },
  ];

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 1);
  assert.equal(pastPending[0].id, 'task-no-deadline');

  const attention = getTodayAttentionItems(state, { todayIso });
  const taskAlerts = attention.filter((a) => a.signalKind === 'task_overdue');
  assert.equal(taskAlerts.length, 0, 'No debe aparecer como vencida si no tiene dueDate explícito');

  const todayEntries = getTodayAgendaEntries(state, todayIso);
  assert.equal(todayEntries.some((e) => e.id === 'task-no-deadline'), false);
});

test('2. Tarea programada ayer con dueDate ayer: aparece en pendientes anteriores y en Atención ahora', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const yesterdayIso = '2026-10-18';

  state.todayExtras = [
    {
      id: 'task-overdue-1',
      date: yesterdayIso,
      dueDate: yesterdayIso,
      text: 'Enviar documentación',
      done: false,
      priority: 'alta',
    },
  ];

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 1);
  assert.equal(pastPending[0].id, 'task-overdue-1');

  const attention = getTodayAttentionItems(state, { todayIso });
  const taskAlert = attention.find((a) => a.sourceRecordId === 'task-overdue-1');
  assert.ok(taskAlert, 'Debe generar alerta en Atención ahora');
  assert.equal(taskAlert.signalKind, 'task_overdue');
  assert.equal(taskAlert.targetView, 'dashboard');
  assert.equal(taskAlert.targetFocusId, 'today-extra-task-overdue-1');
  assert.match(taskAlert.detail, /tenía fecha límite ayer/);
});

test('3. Tarea completada en el pasado: excluida de pendientes anteriores y de Atención ahora', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const yesterdayIso = '2026-10-18';

  state.todayExtras = [
    {
      id: 'task-done-past',
      date: yesterdayIso,
      dueDate: yesterdayIso,
      text: 'Tarea ya realizada',
      done: true,
      priority: 'media',
    },
  ];

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 0);

  const attention = getTodayAttentionItems(state, { todayIso });
  assert.equal(attention.filter((a) => a.sourceRecordId === 'task-done-past').length, 0);
});

test('4. Completar tarea recuperada: actualiza el registro, remueve alerta de Atención ahora y oculta sección', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const task = {
    id: 'task-to-complete',
    date: '2026-10-16',
    dueDate: '2026-10-16',
    text: 'Pagar servicio municipal',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  assert.equal(getPastPendingExtras(state, todayIso).length, 1);
  assert.equal(getTodayAttentionItems(state, { todayIso }).length, 1);

  // Completar in-place
  task.done = true;

  const pastPendingAfter = getPastPendingExtras(state, todayIso);
  assert.equal(pastPendingAfter.length, 0, 'La sección colapsa / queda vacía');

  const attentionAfter = getTodayAttentionItems(state, { todayIso });
  assert.equal(attentionAfter.length, 0, 'La alerta desaparece inmediatamente');
});

test('5. Reprogramar tarea a hoy: sale de pendientes anteriores y entra a la agenda activa de hoy', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const task = {
    id: 'task-reschedule-today',
    date: '2026-10-17',
    text: 'Llamar al seguro',
    done: false,
    priority: 'media' as const,
  };
  state.todayExtras = [task];

  assert.equal(getPastPendingExtras(state, todayIso).length, 1);
  assert.equal(getTodayAgendaEntries(state, todayIso).some((e) => e.id === task.id), false);

  // Reprogramar a hoy
  task.date = todayIso;

  assert.equal(getPastPendingExtras(state, todayIso).length, 0);
  const todayEntries = getTodayAgendaEntries(state, todayIso);
  const entry = todayEntries.find((e) => e.id === task.id);
  assert.ok(entry, 'Debe aparecer en la agenda de hoy');
  assert.equal(entry.label, 'Llamar al seguro');
});

test('6. Tarea reprogramada a fecha futura: accesible en próximas/calendario y reaparece el día programado', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const futureIso = '2026-10-21';
  const task = {
    id: 'task-future',
    date: '2026-10-17',
    text: 'Comprar repuesto',
    done: false,
    priority: 'media' as const,
  };
  state.todayExtras = [task];

  // Reprogramar a dos días en el futuro
  task.date = futureIso;

  assert.equal(getPastPendingExtras(state, todayIso).length, 0);
  assert.equal(getTodayAgendaEntries(state, todayIso).some((e) => e.id === task.id), false);

  const futureList = getFutureScheduledExtras(state, todayIso);
  assert.equal(futureList.length, 1);
  assert.equal(futureList[0].id, task.id);

  // Consulta en Calendario para esa fecha futura
  const calItems = calendarItemsOnDate(state, futureIso);
  const calItem = calItems.find((i) => i.id === `scheduled-extra-${task.id}`);
  assert.ok(calItem, 'Aparece en el calendario de la fecha futura');
  assert.equal(calItem.name, 'Comprar repuesto');

  // En la fecha futura, reaparece en Hoy sin duplicarse
  const entriesOnFutureDate = getTodayAgendaEntries(state, futureIso);
  const matching = entriesOnFutureDate.filter((e) => e.id === task.id);
  assert.equal(matching.length, 1, 'Reaparece exactamente una vez en la agenda del día');
});

test('7. Tarea reprogramada con plazo vencido: date cambia a hoy, dueDate queda intacto y sigue en Atención ahora', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const pastDueDate = '2026-10-16';
  const task = {
    id: 'task-with-expired-due',
    date: '2026-10-16',
    dueDate: pastDueDate,
    text: 'Presentar formulario',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  // Reprogramar fecha de trabajo a hoy sin tocar dueDate
  task.date = todayIso;
  assert.equal(task.dueDate, pastDueDate, 'dueDate debe permanecer intacto');

  // Entra a la agenda de hoy
  const todayEntries = getTodayAgendaEntries(state, todayIso);
  assert.ok(todayEntries.some((e) => e.id === task.id));

  // Permanece en Atención ahora como vencida
  const attention = getTodayAttentionItems(state, { todayIso });
  const alert = attention.find((a) => a.sourceRecordId === task.id);
  assert.ok(alert, 'Sigue alertando de plazo vencido');
  assert.equal(alert.signalKind, 'task_overdue');

  // Completarla elimina el aviso
  task.done = true;
  assert.equal(getTodayAttentionItems(state, { todayIso }).filter((a) => a.sourceRecordId === task.id).length, 0);
});

test('8. Navegación desde Atención ahora: targetView es dashboard y targetFocusId identifica el elemento exacto', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const task = {
    id: 'extra-target-99',
    date: '2026-10-15',
    dueDate: '2026-10-15',
    text: 'Entregar declaración',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  const attention = getTodayAttentionItems(state, { todayIso });
  const item = attention.find((a) => a.sourceRecordId === task.id);
  assert.ok(item);
  assert.equal(item.targetView, 'dashboard');
  assert.equal(item.targetFocusId, 'today-extra-extra-target-99');
});

test('9. Navegación repetida: IDs deterministas para preservación de foco', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const task = {
    id: 'extra-repeat-nav',
    date: '2026-10-15',
    dueDate: '2026-10-15',
    text: 'Firmar contrato',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  const firstCall = getTodayAttentionItems(state, { todayIso });
  const secondCall = getTodayAttentionItems(state, { todayIso });

  assert.equal(firstCall[0].targetFocusId, secondCall[0].targetFocusId);
  assert.equal(firstCall[0].targetFocusId, 'today-extra-extra-repeat-nav');
});

test('10. Tareas homónimas con IDs distintos: gestión independiente y navegación inequívoca', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const taskA = {
    id: 'extra-homo-1',
    date: '2026-10-17',
    dueDate: '2026-10-17',
    text: 'Enviar informe',
    done: false,
    priority: 'media' as const,
  };
  const taskB = {
    id: 'extra-homo-2',
    date: '2026-10-18',
    dueDate: '2026-10-18',
    text: 'Enviar informe',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [taskA, taskB];

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 2);

  // Completar una no afecta a la otra
  taskA.done = true;
  const remainingPast = getPastPendingExtras(state, todayIso);
  assert.equal(remainingPast.length, 1);
  assert.equal(remainingPast[0].id, 'extra-homo-2');

  const attention = getTodayAttentionItems(state, { todayIso });
  assert.equal(attention.length, 1);
  assert.equal(attention[0].targetFocusId, 'today-extra-extra-homo-2');
});

test('11. Cambio de fecha / Medianoche: reactividad pura sin mutaciones silenciosas', () => {
  const state = createCleanState('2026-10-19');
  const day1 = '2026-10-19';
  const day2 = '2026-10-20';

  const task = {
    id: 'task-midnight',
    date: day1,
    dueDate: day1,
    text: 'Hacer backup',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  // Durante day1: es tarea de hoy, no es pendiente anterior ni está vencida
  assert.equal(getPastPendingExtras(state, day1).length, 0);
  assert.equal(getTodayAgendaEntries(state, day1).some((e) => e.id === task.id), true);
  assert.equal(getTodayAttentionItems(state, { todayIso: day1 }).filter((a) => a.sourceRecordId === task.id).length, 0);

  // Al pasar a day2 (sin haber mutado el estado del objeto task)
  assert.equal(getPastPendingExtras(state, day2).length, 1);
  assert.equal(getTodayAgendaEntries(state, day2).some((e) => e.id === task.id), false);
  const attentionDay2 = getTodayAttentionItems(state, { todayIso: day2 });
  const alert = attentionDay2.find((a) => a.sourceRecordId === task.id);
  assert.ok(alert, 'Genera alerta reactiva al pasar de medianoche');
  assert.equal(task.date, day1, 'La fecha programada original no fue modificada silenciosamente');
});

test('12. Lista vacía, dispersa y concurrida: orden determinista', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';

  // Vacía
  state.todayExtras = [];
  assert.deepEqual(getPastPendingExtras(state, todayIso), []);

  // Concurrida con 20 tareas
  const tasks = [];
  for (let i = 1; i <= 20; i++) {
    const day = (i % 15) + 1;
    const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
    const prio = i % 3 === 0 ? 'alta' : i % 3 === 1 ? 'media' : 'baja';
    tasks.push({
      id: `task-crowded-${i}`,
      date: dateStr,
      text: `Tarea concurrida ${i}`,
      done: false,
      priority: prio as 'alta' | 'media' | 'baja',
    });
  }
  state.todayExtras = tasks;

  const sorted = getPastPendingExtras(state, todayIso);
  assert.equal(sorted.length, 20);

  // Verificar orden ascendente de fecha
  for (let i = 0; i < sorted.length - 1; i++) {
    const cmp = sorted[i].date.localeCompare(sorted[i + 1].date);
    assert.ok(cmp <= 0, 'Debe ordenar por fecha ascendente');
  }
});

test('13. Integridad de captura rápida: tareas creadas se integran sin afectar tareas pasadas', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const pastTask = {
    id: 'past-1',
    date: '2026-10-17',
    text: 'Tarea anterior',
    done: false,
    priority: 'media' as const,
  };
  state.todayExtras = [pastTask];

  // Simular Quick Capture hoy
  const newTask = {
    id: uid(),
    date: todayIso,
    text: 'Nueva tarea rápida',
    done: false,
    priority: 'alta' as const,
    dueDate: todayIso,
  };
  state.todayExtras.push(newTask);

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 1);
  assert.equal(pastPending[0].id, 'past-1');

  const todayEntries = getTodayAgendaEntries(state, todayIso);
  assert.ok(todayEntries.some((e) => e.id === newTask.id));
});

test('14. Visibilidad de módulos y persistencia en roundtrip', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const task = {
    id: 'task-mod-vis',
    date: '2026-10-17',
    dueDate: '2026-10-17',
    text: 'Tarea módulo agenda',
    done: false,
    priority: 'alta' as const,
  };
  state.todayExtras = [task];

  // Con agenda habilitada: genera alerta
  assert.equal(getTodayAttentionItems(state, { todayIso }).length, 1);

  // Con agenda oculta en Module Visibility
  state.settings.hiddenTabs = ['agenda'];
  assert.equal(getTodayAttentionItems(state, { todayIso }).length, 0, 'No emite alertas si el módulo está oculto');

  // Serialización roundtrip
  const json = JSON.stringify(state);
  const parsed = JSON.parse(json);
  assert.equal(parsed.todayExtras[0].id, task.id);
  assert.equal(parsed.todayExtras[0].date, '2026-10-17');
  assert.equal(parsed.todayExtras[0].dueDate, '2026-10-17');
});

test('15. Caso A: Tarea programada para hoy con vencimiento hoy aparece una sola vez en Agenda', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  state.todayExtras = [
    {
      id: 'task-case-a',
      date: todayIso,
      dueDate: todayIso,
      text: 'Entregar reporte diario',
      done: false,
      priority: 'alta',
    },
  ];

  const agenda = getTodayAgendaEntries(state, todayIso);
  const matches = agenda.filter((e) => e.id === 'task-case-a');
  assert.equal(matches.length, 1, 'Debe aparecer exactamente una vez en la agenda de hoy');

  // No debe duplicarse en Atención ahora porque ya está en Agenda
  const attention = getTodayAttentionItems(state, { todayIso });
  assert.equal(attention.filter((a) => a.sourceRecordId === 'task-case-a').length, 0);

  // No debe aparecer en pendientes anteriores ni en próximas
  assert.equal(getPastPendingExtras(state, todayIso).length, 0);
  assert.equal(getFutureScheduledExtras(state, todayIso).length, 0);
});

test('16. Caso B: Tarea programada para mañana con vencimiento hoy aparece en Atención ahora y Próximas', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const tomorrowIso = '2026-10-20';
  state.todayExtras = [
    {
      id: 'task-case-b',
      date: tomorrowIso,
      dueDate: todayIso,
      text: 'Pagar tarjeta corporativa',
      done: false,
      priority: 'alta',
    },
  ];

  // No está en la agenda activa de hoy porque fue programada para mañana
  const agenda = getTodayAgendaEntries(state, todayIso);
  assert.equal(agenda.some((e) => e.id === 'task-case-b'), false);

  // Está en próximas programadas
  const future = getFutureScheduledExtras(state, todayIso);
  assert.equal(future.length, 1);
  assert.equal(future[0].id, 'task-case-b');
  assert.equal(future[0].dueDate, todayIso);

  // CRÍTICO: Debe alertar en Atención ahora para que el usuario no pierda el vencimiento de hoy
  const attention = getTodayAttentionItems(state, { todayIso });
  const alert = attention.find((a) => a.sourceRecordId === 'task-case-b');
  assert.ok(alert, 'Debe generar alerta en Atención ahora');
  assert.equal(alert.title, 'Plazo vence hoy');
  assert.equal(alert.urgency, 'urgent');
  assert.equal(alert.targetView, 'dashboard');
  assert.equal(alert.targetFocusId, 'today-extra-task-case-b');
  assert.match(alert.detail, /vence hoy \(programada para el 20.*oct\.\)/);
});

test('17. Caso C: Tarea programada ayer, pendiente, con vencimiento hoy es recuperable y alerta en Atención ahora', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const yesterdayIso = '2026-10-18';
  state.todayExtras = [
    {
      id: 'task-case-c',
      date: yesterdayIso,
      dueDate: todayIso,
      text: 'Firmar acta de directorio',
      done: false,
      priority: 'alta',
    },
  ];

  // Es recuperable en pendientes anteriores con su dueDate intacto
  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 1);
  assert.equal(pastPending[0].id, 'task-case-c');
  assert.equal(pastPending[0].dueDate, todayIso);

  // Alerta en Atención ahora porque vence hoy
  const attention = getTodayAttentionItems(state, { todayIso });
  const alert = attention.find((a) => a.sourceRecordId === 'task-case-c');
  assert.ok(alert, 'Debe alertar en Atención ahora');
  assert.equal(alert.title, 'Plazo vence hoy');
  assert.equal(alert.targetFocusId, 'today-extra-task-case-c');
});

test('18. Caso D: Tarea programada para mañana con vencimiento ayer alerta en Atención ahora y enfoca el registro', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  const tomorrowIso = '2026-10-20';
  const yesterdayIso = '2026-10-18';
  state.todayExtras = [
    {
      id: 'task-case-d',
      date: tomorrowIso,
      dueDate: yesterdayIso,
      text: 'Enviar comprobante atrasado',
      done: false,
      priority: 'alta',
    },
  ];

  // Está en próximas programadas
  const future = getFutureScheduledExtras(state, todayIso);
  assert.equal(future.length, 1);
  assert.equal(future[0].id, 'task-case-d');

  // Alerta en Atención ahora como plazo vencido
  const attention = getTodayAttentionItems(state, { todayIso });
  const alert = attention.find((a) => a.sourceRecordId === 'task-case-d');
  assert.ok(alert);
  assert.equal(alert.title, 'Plazo vencido');
  assert.equal(alert.urgency, 'critical');
  assert.equal(alert.targetFocusId, 'today-extra-task-case-d');
});

test('19. Caso E: Tarea programada y con vencimiento hoy ya completada no genera avisos ni duplicaciones', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';
  state.todayExtras = [
    {
      id: 'task-case-e',
      date: todayIso,
      dueDate: todayIso,
      text: 'Pago de alquiler',
      done: true,
      priority: 'alta',
    },
  ];

  // No genera alertas en Atención ahora
  assert.equal(getTodayAttentionItems(state, { todayIso }).length, 0);

  // No aparece en pendientes anteriores ni en próximas
  assert.equal(getPastPendingExtras(state, todayIso).length, 0);
  assert.equal(getFutureScheduledExtras(state, todayIso).length, 0);

  // En la agenda activa aparece una sola vez con done === true
  const agenda = getTodayAgendaEntries(state, todayIso);
  const matches = agenda.filter((e) => e.id === 'task-case-e');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].done, true);
});

test('20. Seguridad de «Mover todas a hoy»: preserva IDs, dueDates, no toca tareas completadas ni futuras', () => {
  const state = createCleanState('2026-10-19');
  const todayIso = '2026-10-19';

  state.todayExtras = [
    {
      id: 'past-pending-1',
      date: '2026-10-16',
      dueDate: '2026-10-16',
      text: 'Tarea pasada 1',
      done: false,
      priority: 'alta',
    },
    {
      id: 'past-pending-2',
      date: '2026-10-17',
      text: 'Tarea pasada 2 sin plazo',
      done: false,
      priority: 'media',
    },
    {
      id: 'past-completed',
      date: '2026-10-16',
      dueDate: '2026-10-16',
      text: 'Tarea pasada ya hecha',
      done: true,
      priority: 'media',
    },
    {
      id: 'future-task',
      date: '2026-10-22',
      dueDate: '2026-10-25',
      text: 'Tarea futura',
      done: false,
      priority: 'baja',
    },
  ];

  const pastPending = getPastPendingExtras(state, todayIso);
  assert.equal(pastPending.length, 2);

  // Simular la mutación exacta de handleMoveAllPastToToday
  const pastIds = new Set(pastPending.map((x) => x.id));
  for (const extra of state.todayExtras) {
    if (pastIds.has(extra.id)) {
      extra.date = todayIso;
    }
  }

  // 1. Tareas pendientes anteriores movidas a hoy
  const task1 = state.todayExtras.find((x) => x.id === 'past-pending-1');
  const task2 = state.todayExtras.find((x) => x.id === 'past-pending-2');
  assert.equal(task1?.date, todayIso);
  assert.equal(task1?.dueDate, '2026-10-16', 'dueDate debe permanecer intacto');
  assert.equal(task2?.date, todayIso);
  assert.equal(task2?.dueDate, undefined);

  // 2. Tarea pasada completada NO modificada
  const taskCompleted = state.todayExtras.find((x) => x.id === 'past-completed');
  assert.equal(taskCompleted?.date, '2026-10-16', 'La fecha de tareas completadas no debe cambiar');
  assert.equal(taskCompleted?.done, true);

  // 3. Tarea futura NO modificada
  const taskFuture = state.todayExtras.find((x) => x.id === 'future-task');
  assert.equal(taskFuture?.date, '2026-10-22', 'Las tareas futuras no deben ser afectadas');
  assert.equal(taskFuture?.dueDate, '2026-10-25');

  // 4. Pendientes anteriores ahora queda vacía
  assert.equal(getPastPendingExtras(state, todayIso).length, 0);

  // 5. Ambas tareas entran a la agenda de hoy sin duplicaciones
  const todayAgenda = getTodayAgendaEntries(state, todayIso);
  assert.equal(todayAgenda.filter((e) => e.id === 'past-pending-1').length, 1);
  assert.equal(todayAgenda.filter((e) => e.id === 'past-pending-2').length, 1);
});

