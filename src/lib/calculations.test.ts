import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routineScheduledFor,
  todayItems,
  calcPRs,
  findNowAndNext,
  todayGymStatus,
  studyMinutesForDate,
  nextExam,
  examApprovalPct,
  jobStats,
  upcomingEvents,
  calendarItemsOnDate,
} from './calculations';
import { defaultState } from './storage';

test('Calendario: próximos usan el día explorado y conservan recurrencias', () => {
  const state = defaultState();
  state.calendarEvents = [
    { id: 'oct', name: 'Octubre', date: '2026-10-24', type: 'otro', recurring: false },
    { id: 'annual', name: 'Aniversario', date: '2024-01-20', type: 'aniversario', recurring: true },
    { id: 'late', name: 'Tarde', date: '2027-01-20', time: '18:00', type: 'otro', recurring: false },
    { id: 'early', name: 'Temprano', date: '2027-01-20', time: '09:00', type: 'otro', recurring: false },
    { id: 'leap', name: 'Bisiesto', date: '2024-02-29', type: 'otro', recurring: true },
  ];
  const upcoming = upcomingEvents(state, 6, '2027-01-20');
  assert.equal(upcoming.some((event) => event.id === 'oct'), false);
  assert.equal(upcoming.find((event) => event.id === 'annual')?.occursOn, '2027-01-20');
  assert.equal(upcoming.find((event) => event.id === 'leap')?.occursOn, '2028-02-29');
  assert.equal(calendarItemsOnDate(state, '2027-01-20').length, 3);
});

test('una rutina con días elegidos sólo aparece esos días', () => {
  const state = defaultState();
  const task = { id: 'dias', name: 'Gimnasio', freq: '2-3x' as const, days: ['lunes', 'viernes'] as const };
  state.tasksRecurring = [{ ...task, days: [...task.days] }];
  assert.equal(routineScheduledFor(state, state.tasksRecurring[0], '2026-08-10'), true);
  assert.equal(routineScheduledFor(state, state.tasksRecurring[0], '2026-08-11'), false);
  assert.equal(todayItems(state, '2026-08-11', false).some((item) => item.id === task.id), false);
});

test('jobStats cuenta únicamente postulaciones en la etapa CV enviado', () => {
  const state = defaultState();
  state.jobs.applications = [
    { id: 'pending', empresa: 'A', puesto: '', estado: 'pendiente', fecha: '2026-10-20' },
    { id: 'sent', empresa: 'B', puesto: '', estado: 'cv_enviado', fecha: '2026-10-20' },
    { id: 'interview', empresa: 'C', puesto: '', estado: 'entrevista', fecha: '2026-10-20' },
    { id: 'offer', empresa: 'D', puesto: '', estado: 'oferta', fecha: '2026-10-20' },
    { id: 'rejected', empresa: 'E', puesto: '', estado: 'rechazado', fecha: '2026-10-20' },
    { id: 'hired', empresa: 'F', puesto: '', estado: 'contratado', fecha: '2026-10-20' },
    { id: 'contest-interview', tipo: 'concurso', empresa: 'Organismo', puesto: '', estado: 'prueba_evaluacion', fecha: '2026-10-20' },
    { id: 'contest-entry', tipo: 'concurso', empresa: 'Organismo', puesto: '', estado: 'ingreso_confirmado', fecha: '2026-10-20' },
  ];
  assert.equal(jobStats(state).cvEnviados, 1);
  assert.equal(jobStats(state, 'concurso').cvEnviados, 0);
  assert.equal(jobStats(state, 'concurso').entrevistas, 0);
  assert.equal(jobStats(state, 'concurso').ingresosConfirmados, 1);
  assert.equal(jobStats(state, 'todos').inscripciones, 2);
  assert.equal(jobStats(state, 'todos').contratados, 1);
});

test('una rutina semanal deja de insistir al completarse', () => {
  const state = defaultState();
  const task = { id: 'semanal', name: 'Llamar', freq: 'weekly' as const };
  state.tasksRecurring = [task];
  state.taskLog['2026-08-10'] = { [task.id]: true };
  assert.equal(routineScheduledFor(state, task, '2026-08-10'), true);
  assert.equal(routineScheduledFor(state, task, '2026-08-13'), false);
  assert.equal(routineScheduledFor(state, task, '2026-08-17'), true);
});

test('calcPRs calcula récords por series y previene cuelgues con datos heredados', () => {
  const state = defaultState();
  state.gym.sessions = [
    {
      id: 's1',
      date: '2026-09-01',
      status: 'completed',
      exercises: [
        {
          name: 'Press banca plano',
          sets: [
            { id: '1', weight: 60, reps: 10, completed: true },
            { id: '2', weight: 80, reps: 5, completed: true },
          ],
        },
        {
          name: 'Sentadilla',
          weight: 100,
          reps: '3x5',
          sets: [],
        },
      ],
    },
  ];

  const prs = calcPRs(state);
  assert.equal(prs['Press banca plano'].weight, 80);
  assert.equal(prs['Press banca plano'].reps, 5);
  assert.equal(prs['Sentadilla'].weight, 100);
});

test('findNowAndNext expira actividades pasadas hace más de 90 minutos', () => {
  const state = defaultState();
  state.agenda.lunes = [
    { id: 'b1', time: '08:00', activity: 'Desayuno' },
    { id: 'b2', time: '14:00', activity: 'Almuerzo' },
  ];

  // At 08:30 on Monday, Breakfast is current
  const at830 = new Date('2026-08-10T08:30:00'); // 2026-08-10 is Monday
  const res830 = findNowAndNext(state, at830);
  assert.equal(res830.current?.activity, 'Desayuno');
  assert.equal(res830.next?.activity, 'Almuerzo');

  // At 22:00 on Monday, lunch was 8 hours ago, so current should be null
  const at2200 = new Date('2026-08-10T22:00:00');
  const res2200 = findNowAndNext(state, at2200);
  assert.equal(res2200.current, null);
  assert.equal(res2200.next, null);
});

test('todayGymStatus reporta fielmente entrenado, descanso o pendiente', () => {
  const state = defaultState();
  assert.equal(todayGymStatus(state, '2026-09-17').status, 'pending_today');

  state.gym.restDays = ['2026-09-17'];
  assert.equal(todayGymStatus(state, '2026-09-17').status, 'rest_today');

  state.gym.sessions = [
    {
      id: 'today-sess',
      date: '2026-09-17',
      status: 'completed',
      exercises: [
        {
          name: 'Press banca',
          sets: [{ id: '1', weight: 80, reps: 5, completed: true }],
        },
      ],
    },
  ];
  const gymSt = todayGymStatus(state, '2026-09-17');
  assert.equal(gymSt.status, 'trained_today');
  assert.equal(gymSt.totalVolume, 400);
  assert.equal(gymSt.completedSetsCount, 1);
});

test('studyMinutesForDate suma fielmente los minutos para una fecha dada', () => {
  const state = defaultState();
  state.study.studyLog = [
    { id: '1', date: '2026-10-19', minutes: 45, subjectId: 's1' },
    { id: '2', date: '2026-10-19', minutes: 25, subjectId: null },
    { id: '3', date: '2026-10-18', minutes: 60, subjectId: 's1' },
  ];
  assert.equal(studyMinutesForDate(state, '2026-10-19'), 70);
  assert.equal(studyMinutesForDate(state, '2026-10-20'), 0);
});

test('nextExam selecciona el próximo examen pendiente ordenado cronológicamente', () => {
  const state = defaultState();
  state.study.subjects = [{ id: 's1', name: 'Álgebra' }, { id: 's2', name: 'Física' }];
  state.study.exams = [
    { id: 'e3', subjectId: 's2', date: '2099-12-01', status: 'pendiente' },
    { id: 'e1', subjectId: 's1', date: '2099-11-15', status: 'pendiente' },
    { id: 'e2', subjectId: 's1', date: '2099-11-10', status: 'aprobado' }, // Ya resuelto
  ];
  const next = nextExam(state);
  assert.ok(next);
  assert.equal(next.id, 'e1', 'Debe seleccionar el examen pendiente más cercano');
});

test('examApprovalPct calcula la tasa de aprobados sobre resueltos', () => {
  const state = defaultState();
  assert.equal(examApprovalPct(state), null, 'Sin exámenes resueltos retorna null');

  state.study.exams = [
    { id: 'e1', subjectId: 's1', date: '2026-10-10', status: 'aprobado' },
    { id: 'e2', subjectId: 's1', date: '2026-10-12', status: 'aprobado' },
    { id: 'e3', subjectId: 's1', date: '2026-10-15', status: 'desaprobado' },
    { id: 'e4', subjectId: 's1', date: '2026-10-25', status: 'pendiente' }, // Pendiente se excluye
  ];
  // 2 aprobados de 3 resueltos = 66.666%
  const pct = examApprovalPct(state);
  assert.ok(pct !== null);
  assert.equal(Math.round(pct), 67);
});

