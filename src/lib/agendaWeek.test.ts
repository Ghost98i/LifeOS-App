import assert from 'node:assert/strict';
import test from 'node:test';
import { agendaDaySummary, agendaWeek, editedWeeklyBlockTime, parseLocalDateISO, shiftWeek, validatePunctualEvent, validateWeeklyBlock, weekDates } from './agendaWeek';
import { defaultState, normalizeStoredState } from './storage';
import { calendarItemsOnDate, todayItems } from './calculations';
import { getTodayAgendaEntries } from './todayOverview';
import { syncModuleData } from './syncModel';
import { mergeCalendarModule } from './syncMerge';

test('editar una actividad y vaciar su hora la conserva sin horario', () => {
  const state = defaultState();
  state.agenda.lunes = [{ id: 'sin-hora', time: '09:00', activity: 'Lectura' }];
  state.agenda.lunes[0].time = editedWeeklyBlockTime('');
  assert.equal(state.agenda.lunes[0].time, '');
  assert.equal(agendaWeek(state, parseLocalDateISO('2026-10-19')!)[0].blocks[0].time, '');
  assert.equal(editedWeeklyBlockTime(' 14:30 '), '14:30');
});

test('la semana real cruza mes y año sin desplazar la recurrencia', () => {
  const state = defaultState();
  state.agenda.miercoles = [{ id: 'weekly-block', time: '09:00', activity: 'Estudiar' }];
  state.tasksRecurring = [{ id: 'routine', name: 'Repasar', freq: 'daily' }];
  const reference = parseLocalDateISO('2026-12-30')!;
  const first = agendaWeek(state, reference);
  const before = JSON.stringify(state);
  assert.deepEqual(weekDates(reference), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(first[2].blocks[0].id, 'weekly-block');
  assert.equal(first[2].routines[0].id, 'routine');
  assert.equal(agendaWeek(state, shiftWeek(reference, 1))[2].blocks[0].id, 'weekly-block');
  assert.equal(JSON.stringify(state), before);
  assert.equal(parseLocalDateISO('2026-02-30'), null);
  assert.equal(parseLocalDateISO('2026-10-28')?.getDate(), 28);
});

test('el resumen prioriza eventos y actividades sin ocultar el total de rutinas', () => {
  const state = defaultState();
  state.tasksRecurring = [{ id: 'daily', name: 'Tender la cama', freq: 'daily' }];
  state.agenda.martes = [
    { id: 'class', time: '08:00', activity: 'Clases' },
    { id: 'gym', time: '18:00', activity: 'Gimnasio' },
  ];
  state.agenda.jueves = [{ id: 'study', time: '10:00', activity: 'Estudio' }];
  state.agenda.viernes = [
    { id: 'one', time: '09:00', activity: 'Clases' },
    { id: 'two', time: '09:00', activity: 'Clases' },
  ];
  state.calendarEvents = [
    { id: 'exam', name: 'Examen de programación', date: '2026-10-21', time: '09:00', type: 'otro', recurring: false },
    { id: 'appointment', name: 'Turno', date: '2026-10-22', type: 'otro', recurring: false },
  ];
  const before = JSON.stringify(state);
  const week = agendaWeek(state, parseLocalDateISO('2026-10-19')!);
  assert.deepEqual(agendaDaySummary(week[0]), { kind: 'routine', headline: 'Sin compromisos programados', counts: '1 rutina' });
  assert.deepEqual(agendaDaySummary(week[1]), { kind: 'block', headline: 'Clases · Gimnasio', counts: '2 actividades · 1 rutina' });
  assert.deepEqual(agendaDaySummary(week[2]), { kind: 'event', headline: '09:00 · Examen de programación', counts: '1 evento · 1 rutina' });
  assert.deepEqual(agendaDaySummary(week[3]), { kind: 'event', headline: 'Turno', counts: '1 evento · 1 actividad · 1 rutina' });
  assert.deepEqual(agendaDaySummary(week[4]), { kind: 'block', headline: 'Clases · Clases', counts: '2 actividades · 1 rutina' });
  assert.equal(week[4].blocks.length, 2);
  assert.deepEqual(agendaDaySummary(agendaWeek(state, parseLocalDateISO('2026-05-12')!)[1]), agendaDaySummary(week[1]));
  assert.deepEqual(agendaDaySummary(agendaWeek(state, parseLocalDateISO('2027-01-05')!)[1]), agendaDaySummary(week[1]));
  assert.equal(JSON.stringify(state), before);
});

test('una rutina con hora no se presenta como compromiso y el día vacío queda claro', () => {
  const state = defaultState();
  state.tasksRecurring = [{ id: 'timed-routine', name: 'Meditar', freq: 'daily', time: '07:00' }];
  const monday = agendaWeek(state, parseLocalDateISO('2026-10-19')!)[0];
  assert.deepEqual(agendaDaySummary(monday), { kind: 'routine', headline: 'Sin compromisos programados', counts: '1 rutina' });
  state.tasksRecurring = [];
  assert.deepEqual(agendaDaySummary(agendaWeek(state, parseLocalDateISO('2026-10-19')!)[0]), { kind: 'empty', headline: 'Sin actividades previstas', counts: '' });
});

test('el completado de una rutina afecta solo su fecha y se puede revertir', () => {
  const state = defaultState();
  state.tasksRecurring = [{ id: 'routine-by-date', name: 'Practicar', freq: 'weekly', days: ['lunes'] }];
  const originalRoutine = JSON.stringify(state.tasksRecurring[0]);
  state.taskLog['2026-10-12'] = { 'routine-by-date': true };
  assert.equal(todayItems(state, '2026-10-12', false).find((item) => item.id === 'routine-by-date')?.done, true);
  assert.equal(todayItems(state, '2026-10-19', false).find((item) => item.id === 'routine-by-date')?.done, false);
  state.taskLog['2026-10-12']['routine-by-date'] = false;
  assert.equal(todayItems(state, '2026-10-12', false).find((item) => item.id === 'routine-by-date')?.done, false);
  assert.equal(JSON.stringify(state.tasksRecurring[0]), originalRoutine);
});

test('un evento puntual comparte entidad con Calendario y Hoy sin convertirse en check', () => {
  const state = defaultState();
  state.agenda.miercoles = [{ id: 'same-label', time: '09:00', activity: 'Examen de programación' }];
  state.tasksRecurring = [];
  state.calendarEvents = [{ id: 'event-1', name: 'Examen de programación', date: '2026-10-28', time: '09:00', type: 'otro', recurring: false }];
  const day = agendaWeek(state, parseLocalDateISO('2026-10-28')!)[2];
  assert.equal(day.events.length, 1);
  assert.equal(day.events[0].id, 'event-1');
  assert.equal(day.events[0].time, '09:00');
  assert.equal(calendarItemsOnDate(state, '2026-10-28')[0].id, 'event-1');
  assert.equal(calendarItemsOnDate(state, '2026-11-04').some((item) => item.id === 'event-1'), false);
  const today = getTodayAgendaEntries(state, '2026-10-28');
  assert.equal(today.filter((item) => item.label === 'Examen de programación').length, 2);
  assert.equal(today.find((item) => item.id === 'event-1')?.completable, false);
  assert.equal(today.find((item) => item.id === 'same-label')?.completable, true);
  assert.equal(today.filter((item) => item.id === 'event-1').length, 1);
  const reloaded = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.calendarEvents[0].time, '09:00');
  assert.equal(reloaded.agenda.miercoles[0].id, 'same-label');
  assert.deepEqual((syncModuleData(state, 'calendar') as { calendarEvents: typeof state.calendarEvents }).calendarEvents, state.calendarEvents);
  assert.equal((syncModuleData(state, 'tasks') as { taskLog: typeof state.taskLog }).taskLog, state.taskLog);
  const merged = mergeCalendarModule(
    { calendarEvents: state.calendarEvents },
    { calendarEvents: [{ id: 'remote-event', name: 'Turno', date: '2026-10-29', type: 'otro', recurring: false }] },
    { calendarEvents: [] },
  );
  assert.equal(merged.calendarEvents.find((event) => event.id === 'event-1')?.time, '09:00');
  assert.equal(merged.calendarEvents.some((event) => event.id === 'remote-event'), true);
});

test('Module Visibility oculta proyecciones sin borrar datos', () => {
  const state = defaultState();
  state.agenda.lunes = [{ id: 'block', time: '08:00', activity: 'Trabajo' }];
  state.tasksRecurring = [{ id: 'routine', name: 'Leer', freq: 'daily' }];
  state.calendarEvents = [{ id: 'event', name: 'Turno', date: '2026-10-26', type: 'otro', recurring: false }];
  state.settings.hiddenTabs = ['agenda', 'calendario'];
  const monday = agendaWeek(state, parseLocalDateISO('2026-10-26')!)[0];
  assert.equal(monday.blocks.length, 0);
  assert.equal(monday.routines.length, 0);
  assert.equal(monday.events.length, 0);
  assert.equal(state.agenda.lunes.length, 1);
  assert.equal(state.calendarEvents.length, 1);
});

test('el formulario puntual valida título, fecha y hora', () => {
  assert.match(validatePunctualEvent('  ', '2026-10-28', '09:00')!, /título/);
  assert.match(validatePunctualEvent('Examen', '2026-02-30', '09:00')!, /fecha/);
  assert.match(validatePunctualEvent('Examen', '2026-10-28', '25:00')!, /hora/);
  assert.equal(validatePunctualEvent(' Examen ', '2026-10-28', ''), null);
  assert.equal(validatePunctualEvent('Examen', '2026-10-28', '09:00'), null);
});

test('el alta semanal exige actividad, día y hora de 24 horas', () => {
  assert.match(validateWeeklyBlock('  ', 'lunes', '09:00').activity!, /actividad/);
  assert.match(validateWeeklyBlock('Leer', '', '09:00').day!, /día/);
  assert.match(validateWeeklyBlock('Leer', 'martes', '').time!, /hora/);
  assert.match(validateWeeklyBlock('Leer', 'martes', '24:00').time!, /hora/);
  assert.match(validateWeeklyBlock('Leer', 'martes', '9:00').time!, /hora/);
  assert.deepEqual(validateWeeklyBlock(' Leer ', 'miercoles', '09:00'), {});
});
