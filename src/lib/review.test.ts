import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, uid } from './storage';
import {
  weeklyReviewExceptions,
  gatherWeeklyReviewData,
  formatWeeklyReviewSummaryNote,
} from './review';

test('la revisión semanal muestra excepciones y omite actividad normal', () => {
  const state = defaultState();
  state.settings.lastBackupAt = '2026-08-10';
  state.finance.accounts.forEach((account) => { account.lastReconciledAt = '2026-08-10'; });
  state.jobs.applications.push({
    id: uid(), empresa: 'Empresa', puesto: 'Soporte', estado: 'pendiente', fecha: '2026-08-01',
    nextAction: 'Escribir', nextActionDate: '2020-01-01',
  });
  const results = weeklyReviewExceptions(state);
  assert.ok(results.some((item) => item.id === 'job-followups'));
  assert.ok(!results.some((item) => item.id === 'old-stock'));
});

test('la revisión avisa al acumular tres noches cortas consecutivas', () => {
  const state = defaultState();
  const reference = new Date();
  state.dailyContext = [2, 1, 0].map((daysAgo) => {
    const date = new Date(reference);
    date.setDate(date.getDate() - daysAgo);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date: iso, sleepHours: 6, energy: null, mood: null, connection: null };
  });

  const results = weeklyReviewExceptions(state);
  assert.ok(results.some((item) => item.id === 'short-sleep-streak'));
});

test('gatherWeeklyReviewData recopila hechos reales de los últimos 7 días con exactitud', () => {
  const state = defaultState();
  const today = '2026-09-17';

  // 1. Tareas: 1 completada en ventana, 1 completada hace 10 días, 1 atrasada
  state.todayExtras = [
    { id: 't1', text: 'Entregar reporte', date: '2026-09-16', done: true, priority: 'alta' },
    { id: 't2', text: 'Tarea vieja', date: '2026-09-01', done: true, priority: 'media' },
    { id: 't3', text: 'Llamar al médico', date: '2026-09-15', done: false, priority: 'alta' },
  ];

  // 2. Gimnasio: 1 sesión con 2 sets completados (10x80kg + 10x100kg = 1800kg)
  state.gym.sessions = [
    {
      id: 'gym-1',
      date: '2026-09-15',
      weekLabel: 'Pierna Pesada',
      status: 'completed',
      exercises: [
        {
          name: 'Sentadilla',
          sets: [
            { id: 's1', reps: 10, weight: 80, completed: true },
            { id: 's2', reps: 10, weight: 100, completed: true },
            { id: 's3', reps: 10, weight: 120, completed: false },
          ],
        },
      ],
    },
  ];
  state.gym.weight = [{ date: '2026-09-16', kg: 76.5 }];

  // 3. Finanzas: Gasto 1500 en Comida, 500 en Transporte, Ingreso 10000
  state.finance.transactions = [
    { id: 'tx-1', type: 'gasto', amount: 1500, category: 'Comida', fixed: 'variable', date: '2026-09-16' },
    { id: 'tx-2', type: 'gasto', amount: 500, category: 'Transporte', fixed: 'variable', date: '2026-09-14' },
    { id: 'tx-3', type: 'ingreso', amount: 10000, category: 'Sueldo', fixed: 'fijo', date: '2026-09-13' },
    { id: 'tx-old', type: 'gasto', amount: 3000, category: 'Viejos', fixed: 'variable', date: '2026-08-01' },
  ];

  // 4. Sueño
  state.dailyContext = [
    { date: '2026-09-16', sleepHours: 7.5, energy: 4, mood: null, connection: null },
    { date: '2026-09-15', sleepHours: 6.5, energy: 3, mood: null, connection: null },
  ];

  // 5. Proyectos
  state.projects = [
    {
      id: 'p-1',
      name: 'LifeOS App',
      objective: 'Lanzar v2',
      status: 'activo',
      nextStep: 'Hacer testing',
      blockers: 'Falta configurar Firebase',
      reviewDate: '2026-09-15',
      tasks: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
    },
    {
      id: 'p-2',
      name: 'Proyecto Libre',
      objective: 'Sin bloqueos',
      status: 'activo',
      nextStep: '',
      tasks: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
    },
  ];

  const review = gatherWeeklyReviewData(state, today);

  // Assertions
  assert.equal(review.tasks.totalCompleted, 1);
  assert.equal(review.tasks.completed[0].text, 'Entregar reporte');
  assert.equal(review.tasks.totalOverdue, 1);
  assert.equal(review.tasks.overdue[0].text, 'Llamar al médico');

  assert.equal(review.gym.sessionsCount, 1);
  assert.equal(review.gym.totalSets, 2);
  assert.equal(review.gym.totalVolumeKg, 1800);
  assert.equal(review.gym.currentWeight, 76.5);

  assert.equal(review.finances.totalExpenses, 2000);
  assert.equal(review.finances.totalIncome, 10000);
  assert.equal(review.finances.netBalance, 8000);
  assert.equal(review.finances.topCategories[0].category, 'Comida');
  assert.equal(review.finances.topCategories[0].amount, 1500);

  assert.equal(review.sleep.loggedDays, 2);
  assert.equal(review.sleep.avgHours, 7.0);
  assert.equal(review.sleep.minHours, 6.5);
  assert.equal(review.sleep.avgEnergy, 3.5);

  assert.equal(review.projects.activeCount, 2);
  assert.equal(review.projects.withBlockers.length, 1);
  assert.equal(review.projects.withBlockers[0].name, 'LifeOS App');
  assert.equal(review.projects.overdueReview.length, 1);

  // Formato de nota
  const noteText = formatWeeklyReviewSummaryNote(
    review,
    'Gran consistencia en el gimnasio y ahorro.',
    ['Terminar módulo de proyectos', 'Dormir al menos 7.5h']
  );

  assert.ok(noteText.includes('HECHOS VERIFICADOS'));
  assert.ok(noteText.includes('volumen total'));
  assert.ok(noteText.includes(review.gym.totalVolumeKg.toLocaleString()));
  assert.ok(noteText.includes('Balance neto: $' + review.finances.netBalance.toLocaleString()));
  assert.ok(noteText.includes('Falta configurar Firebase'));
  assert.ok(noteText.includes('Terminar módulo de proyectos'));
});
