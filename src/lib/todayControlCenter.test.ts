import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { getTodayAgendaEntries } from './todayOverview';
import {
  getSevenDayStatusSparkline,
  getTodayPulse,
  getTodayRadarMilestones,
  partitionTodayAgenda,
  resolveTodaySpotlight,
  toggleSkippedTodayKey,
} from './todayControlCenter';

test('resolveTodaySpotlight: selecciona el bloque en curso, el siguiente o el cierre según la hora actual', () => {
  const state = defaultState();
  const dateIso = '2026-10-27'; // martes
  state.agenda.martes = [
    { id: 'b-study', time: '09:00', activity: 'Estudio de Cálculo' },
    { id: 'b-gym', time: '18:00', activity: 'Gimnasio' },
  ];
  state.gym.routineTemplates = [
    {
      id: 'tpl-torso',
      name: 'Torso A',
      days: ['martes'],
      exercises: [{ id: 'ex-1', name: 'Press banca', sets: [] }],
    },
  ];
  state.study.subjects = [{ id: 'sub-calc', name: 'Cálculo' }];

  const entries = getTodayAgendaEntries(state, dateIso);

  // 08:30 -> Siguiente bloque: Estudio de Cálculo (En 30 min, CTA activo porque falta <= 2h)
  const at0830 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T08:30:00'), dateIso);
  assert.equal(at0830.mode, 'next');
  assert.equal(at0830.domain, 'study');
  assert.equal(at0830.title, 'Estudio de Cálculo');
  assert.equal(at0830.countdownLabel, 'En 30 min');
  assert.equal(at0830.isCalmUpcoming, false);
  assert.equal(at0830.studyInfo?.matchedSubjectId, 'sub-calc');

  // 04:30 -> Madrugada y >2h de distancia -> modo sereno (isCalmUpcoming: true)
  const at0430 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T04:30:00'), dateIso);
  assert.equal(at0430.mode, 'next');
  assert.equal(at0430.isCalmUpcoming, true);

  // 14:00 -> Próximo bloque Gimnasio a las 18:00 (4h de distancia) -> modo sereno (isCalmUpcoming: true)
  const at1400 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T14:00:00'), dateIso);
  assert.equal(at1400.mode, 'next');
  assert.equal(at1400.domain, 'gym');
  assert.equal(at1400.isCalmUpcoming, true);

  // 09:20 -> En curso ahora: Estudio de Cálculo
  const at0920 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T09:20:00'), dateIso);
  assert.equal(at0920.mode, 'current');
  assert.equal(at0920.domain, 'study');
  assert.equal(at0920.title, 'Estudio de Cálculo');

  // 18:15 -> En curso ahora: Gimnasio fusionado con Torso A
  const at1815 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T18:15:00'), dateIso);
  assert.equal(at1815.mode, 'current');
  assert.equal(at1815.domain, 'gym');
  assert.match(at1815.title, /Torso A/);
  assert.equal(at1815.gymInfo?.templateId, 'tpl-torso');
  assert.equal(at1815.gymInfo?.exerciseCount, 1);

  // 21:15 -> Cierre nocturno
  const at2115 = resolveTodaySpotlight(state, entries, new Date('2026-10-27T21:15:00'), dateIso);
  assert.equal(at2115.mode, 'closing');
  assert.equal(at2115.domain, 'closing');
  assert.match(at2115.title, /cerrar el día/i);

  // Si ya está cerrado -> day_closed
  state.checkoutLog[dateIso] = { closedAt: '2026-10-27T21:10:00Z' };
  const at2115Closed = resolveTodaySpotlight(state, entries, new Date('2026-10-27T21:15:00'), dateIso);
  assert.equal(at2115Closed.mode, 'day_closed');
});

test('partitionTodayAgenda: fusiona rutina de gimnasio sin duplicarla y separa micro-hábitos', () => {
  const state = defaultState();
  const dateIso = '2026-10-27'; // martes
  state.agenda.martes = [
    { id: 'b-gym', time: '18:00', activity: 'Gimnasio' },
    { id: 'b-work', time: '10:00', activity: 'Reunión equipo' },
  ];
  state.gym.routineTemplates = [
    {
      id: 'tpl-pierna',
      name: 'Piernas B',
      days: ['martes'],
      exercises: [{ id: 'ex-1', name: 'Sentadilla', sets: [] }],
    },
  ];
  state.tasksRecurring = [
    { id: 'hab-agua', name: 'Tomar agua', freq: 'daily' },
    { id: 'hab-cama', name: 'Hacer la cama', freq: 'daily' },
  ];
  state.todayExtras = [
    { id: 'ex-1', date: dateIso, text: 'Enviar presupuesto', done: false, priority: 'alta' },
  ];

  const entries = getTodayAgendaEntries(state, dateIso);
  const partition = partitionTodayAgenda(state, entries, new Date('2026-10-27T10:15:00'), dateIso);

  assert.equal(partition.gymFused, true);
  // Timed blocks: 10:00 (current) y 18:00 (upcoming, fused with Piernas B)
  assert.equal(partition.timedBlocks.length, 2);
  assert.equal(partition.timedBlocks[0].temporalStatus, 'current');
  assert.equal(partition.timedBlocks[1].temporalStatus, 'upcoming');
  assert.equal(partition.timedBlocks[1].gymFusion?.templateName, 'Piernas B');

  // Untimed tasks: solo "Enviar presupuesto", NO duplicado de "Piernas B" ni micro-hábitos
  assert.deepEqual(
    partition.untimedTasks.map((b) => b.entry.label),
    ['Enviar presupuesto']
  );

  // Micro-hábitos separados en su propia tira
  assert.deepEqual(
    partition.microHabits.map((h) => h.label),
    ['Hacer la cama', 'Tomar agua']
  );
});

test('getTodayRadarMilestones y getTodayPulse: consolidan hitos reales y progreso diario respetando privacidad', () => {
  const state = defaultState();
  const dateIso = '2026-10-27';

  state.study.subjects = [{ id: 's1', name: 'Álgebra' }];
  state.study.exams = [
    { id: 'e1', subjectId: 's1', title: 'Parcial 1', date: '2026-10-30', status: 'pendiente' },
  ];
  state.study.studyLog = [
    { id: 'l1', date: dateIso, minutes: 45, subjectId: 's1', subjectName: 'Álgebra' },
    { id: 'l2', date: dateIso, minutes: 30, subjectId: 's1', subjectName: 'Álgebra' },
  ];
  state.jobs.applications = [
    {
      id: 'j1',
      empresa: 'Acme',
      puesto: 'Frontend',
      estado: 'entrevista',
      fecha: '2026-10-20',
      keyDates: [{ id: 'kd1', kind: 'entrevista', date: '2026-10-28', time: '15:00' }],
    },
  ];
  state.finance.commitments = [
    {
      id: 'c1',
      name: 'Alquiler 18500',
      amount: 18500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-29',
      active: true,
    },
  ];
  state.tasksRecurring = [
    { id: 'h1', name: 'Agua', freq: 'daily' },
    { id: 'h2', name: 'Ordenar', freq: 'daily' },
  ];
  state.taskLog[dateIso] = { h1: true };

  const milestones = getTodayRadarMilestones(state, dateIso);
  assert.equal(milestones.length, 3);
  assert.equal(milestones[0].module, 'trabajo'); // 2026-10-28 (Mañana)
  assert.equal(milestones[0].countdownLabel, 'Mañana');
  assert.equal(milestones[1].module, 'finanzas'); // 2026-10-29 (En 2 d)
  assert.equal(milestones[2].module, 'estudios'); // 2026-10-30 (En 3 d)

  // Privacy mode masks financial amounts in Radar too
  state.settings.privacyMode = true;
  const privateMilestones = getTodayRadarMilestones(state, dateIso);
  const finItem = privateMilestones.find((m) => m.module === 'finanzas');
  assert.ok(finItem);
  assert.doesNotMatch(finItem.title, /18500/);
  assert.doesNotMatch(finItem.detail, /18\.?500/);

  // Pulse reflects real study minutes & habit completion
  const entries = getTodayAgendaEntries(state, dateIso);
  const pulse = getTodayPulse(state, entries, dateIso, new Date('2026-10-27T12:00:00'));
  assert.equal(pulse.studyMinutesToday, 75);
  assert.equal(pulse.studyFormatted, '1 h 15 min');
  assert.equal(pulse.habitsCompleted, 1);
  assert.equal(pulse.habitsTotal, 2);
});

test('getTodayRadarMilestones: limpia texto técnico "moneda sin confirmar" y usa tooltip discreto', () => {
  const state = defaultState();
  const dateIso = '2026-10-27';
  state.finance.commitments = [
    {
      id: 'c-unconfirmed',
      name: 'Antel Fibra',
      amount: 1200,
      frequency: 'monthly',
      nextDueDate: '2026-10-25',
      active: true,
    },
  ];

  const milestones = getTodayRadarMilestones(state, dateIso);
  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].urgency, 'overdue');
  assert.doesNotMatch(milestones[0].detail, /moneda sin confirmar/i);
  assert.match(milestones[0].detail, /\$ 1\.200/);
  assert.match(milestones[0].amountTooltip || '', /Moneda sin confirmar/i);
});

test('Omitir hoy: marca el bloque como omitido, lo excluye del spotlight y alterna claves localmente', () => {
  const state = defaultState();
  const dateIso = '2026-10-27'; // martes
  state.agenda.martes = [
    { id: 'b-1', time: '09:00', activity: 'Bloque 1' },
    { id: 'b-2', time: '11:00', activity: 'Bloque 2' },
  ];
  const entries = getTodayAgendaEntries(state, dateIso);
  const firstKey = entries[0].key;

  const skipped = toggleSkippedTodayKey(dateIso, firstKey, []);
  assert.deepEqual(skipped, [firstKey]);

  const skippedSet = new Set(skipped);
  const partition = partitionTodayAgenda(state, entries, new Date('2026-10-27T09:15:00'), dateIso, skippedSet);
  assert.equal(partition.timedBlocks[0].skipped, true);
  assert.equal(partition.timedBlocks[1].skipped, false);

  // Al estar omitido b-1 (09:00), el spotlight salta directamente al próximo bloque (b-2 a las 11:00)
  const spotlight = resolveTodaySpotlight(state, entries, new Date('2026-10-27T09:15:00'), dateIso, skippedSet);
  assert.equal(spotlight.mode, 'next');
  assert.equal(spotlight.title, 'Bloque 2');

  // Toggle nuevamente lo restaura
  const restored = toggleSkippedTodayKey(dateIso, firstKey, skipped);
  assert.deepEqual(restored, []);
});

test('getSevenDayStatusSparkline: con <2 días no dibuja serie (evita hueco vacío); con >=2 días genera trazos SVG', () => {
  const oneDayState = defaultState();
  oneDayState.dailyContext.push(
    { date: '2026-10-27', sleepHours: 8, energy: 4, mood: 5, connection: null }
  );
  const oneDaySeries = getSevenDayStatusSparkline(oneDayState, '2026-10-27');
  assert.equal(oneDaySeries.hasAnySeries, false);
  assert.equal(oneDaySeries.sleepPath, '');
  assert.equal(oneDaySeries.energyPath, '');
  assert.equal(oneDaySeries.moodPath, '');

  const multiDayState = defaultState();
  multiDayState.dailyContext.push(
    { date: '2026-10-25', sleepHours: 7, energy: 3, mood: 4, connection: null },
    { date: '2026-10-26', sleepHours: 8, energy: 4, mood: 4, connection: null },
    { date: '2026-10-27', sleepHours: 7.5, energy: 5, mood: 5, connection: null }
  );

  const series = getSevenDayStatusSparkline(multiDayState, '2026-10-27');
  assert.equal(series.hasAnySeries, true);
  assert.match(series.sleepPath, /^M[\d.]+,[\d.]+ L/);
  assert.match(series.energyPath, /^M[\d.]+,[\d.]+ L/);
  assert.match(series.moodPath, /^M[\d.]+,[\d.]+ L/);
});

test('getTodayRadarMilestones: aplica ventanas diferenciadas por dominio (Finanzas 10d, Trabajo 14d, Estudios 30d)', () => {
  const state = defaultState();
  const dateIso = '2026-10-01';

  state.study.subjects = [{ id: 's1', name: 'Física' }];
  state.study.exams = [
    { id: 'ex-in', subjectId: 's1', title: 'Parcial 25d', date: '2026-10-26', status: 'pendiente' }, // +25d -> incluido (<=30d)
    { id: 'ex-out', subjectId: 's1', title: 'Final 35d', date: '2026-11-05', status: 'pendiente' }, // +35d -> excluido
  ];
  state.jobs.applications = [
    {
      id: 'job-1',
      empresa: 'Globant',
      puesto: 'Dev',
      estado: 'entrevista',
      fecha: '2026-09-20',
      keyDates: [
        { id: 'kd-in', kind: 'entrevista', date: '2026-10-14' }, // +13d -> incluido (<=14d)
        { id: 'kd-out', kind: 'prueba', date: '2026-10-20' }, // +19d -> excluido (>14d)
      ],
    },
  ];
  state.finance.commitments = [
    { id: 'f-in', name: 'UTE 9d', amount: 1500, currency: 'UYU', frequency: 'monthly', nextDueDate: '2026-10-10', active: true }, // +9d -> incluido (<=10d)
    { id: 'f-out', name: 'OSE 12d', amount: 900, currency: 'UYU', frequency: 'monthly', nextDueDate: '2026-10-13', active: true }, // +12d -> excluido (>10d)
  ];

  const milestones = getTodayRadarMilestones(state, dateIso, 10);
  const titles = milestones.map((m) => m.title);
  assert.ok(titles.some((t) => t.includes('UTE 9d')));
  assert.ok(!titles.some((t) => t.includes('OSE 12d')));
  assert.ok(titles.some((t) => t.includes('Globant')));
  assert.ok(!titles.some((t) => t.includes('Prueba: Globant')));
  assert.ok(titles.some((t) => t.includes('Parcial 25d')));
  assert.ok(!titles.some((t) => t.includes('Final 35d')));
});

test('partitionTodayAgenda: oculta el hábito por defecto "Repasar apuntes" cuando Estudios está desactivado sin borrar datos', () => {
  const state = defaultState();
  const dateIso = '2026-10-01'; // jueves
  const now = new Date('2026-10-01T10:00:00');
  // Ensure default Repasar apuntes is present in tasksRecurring
  assert.ok(state.tasksRecurring.some((t) => t.name === 'Repasar apuntes'));

  // With estudios disabled
  state.settings.hiddenTabs = ['estudios', 'ia'];
  const entriesWhenHidden = getTodayAgendaEntries(state, dateIso);
  const hiddenPartition = partitionTodayAgenda(state, entriesWhenHidden, now, dateIso);
  assert.equal(
    hiddenPartition.microHabits.some((h) => h.label === 'Repasar apuntes'),
    false
  );
  assert.equal(
    hiddenPartition.microHabits.some((h) => h.label === 'Tender la cama'),
    true
  );
  // Underlying task data is never deleted
  assert.ok(state.tasksRecurring.some((t) => t.name === 'Repasar apuntes'));

  // When estudios is re-enabled, habit reappears
  state.settings.hiddenTabs = ['ia'];
  const entriesWhenVisible = getTodayAgendaEntries(state, dateIso);
  const visiblePartition = partitionTodayAgenda(state, entriesWhenVisible, now, dateIso);
  assert.equal(
    visiblePartition.microHabits.some((h) => h.label === 'Repasar apuntes'),
    true
  );
});
