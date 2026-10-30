import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, pruneAttentionDismissals } from './storage';
import {
  getTodayAttentionItems,
  getDismissedAttentionItems,
  nextAttentionDismissalTimestamp,
  isAttentionOccurrenceEligible,
} from './todayAttention';
import { mergeAttentionDismissals, mergeProfileModule } from './syncMerge';

test('Atención ahora — Cero candidatos: retorna lista vacía', () => {
  const state = defaultState();
  const testDate = '2026-10-19';

  // Configuración limpia sin atrasos, sin backup urgente, con revisión al día
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;
  state.projects = [];
  state.finance.commitments = [];
  state.finance.agreements = [];
  state.study.exams = [];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.length, 0, 'No debe emitir asuntos cuando todo está en orden');
});

test('Atención ahora — Tarea programada ayer sin dueDate: NO aparece como vencida', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.projects = [
    {
      id: 'p1',
      name: 'Proyecto Casa',
      objective: 'Limpieza',
      status: 'activo',
      nextStep: 'Barrer',
      tasks: [
        {
          id: 't-no-due',
          text: 'Barrer el patio',
          done: false,
          // Sin dueDate explícito
        },
      ],
      createdAt: '2026-10-18',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.signalKind === 'task_overdue'), false, 'Tarea sin dueDate no debe alertar como vencida');
});

test('Atención ahora — Tarea con dueDate ayer y pendiente: aparece con navegación al proyecto', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.projects = [
    {
      id: 'p-docs',
      name: 'Trámites',
      objective: 'Documentos',
      status: 'activo',
      nextStep: 'Enviar',
      tasks: [
        {
          id: 'task-doc-1',
          text: 'Enviar documentación bancaria',
          done: false,
          dueDate: '2026-10-18', // Venció ayer
        },
      ],
      createdAt: '2026-10-10',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  const taskAlert = items.find((i) => i.id === 'attention-project-task-task-doc-1');

  assert.ok(taskAlert, 'Debe aparecer la alerta de tarea vencida');
  assert.equal(taskAlert.signalKind, 'task_overdue');
  assert.equal(taskAlert.module, 'notas');
  assert.equal(taskAlert.targetView, 'notas');
  assert.equal(taskAlert.targetTab, 'proyectos');
  assert.equal(taskAlert.targetFocusId, 'project-task-task-doc-1');
  assert.ok(taskAlert.detail.includes('Enviar documentación bancaria'));
  assert.ok(taskAlert.detail.includes('ayer'));
});

test('Atención ahora — Tarea vencida al marcarse completada: desaparece inmediatamente', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.projects = [
    {
      id: 'p-docs',
      name: 'Trámites',
      objective: 'Documentos',
      status: 'activo',
      nextStep: 'Enviar',
      tasks: [
        {
          id: 'task-doc-1',
          text: 'Enviar documentación bancaria',
          done: false,
          dueDate: '2026-10-18',
        },
      ],
      createdAt: '2026-10-10',
    },
  ];

  // 1. Con done: false aparece
  const before = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(before.some((i) => i.sourceRecordId === 'task-doc-1'), true);

  // 2. Al completarse (done: true) desaparece
  state.projects[0].tasks[0].done = true;
  const after = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(after.some((i) => i.sourceRecordId === 'task-doc-1'), false, 'Tarea completada no debe aparecer');
});

test('Atención ahora — Compromiso financiero pagado: no aparece', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-paid',
      name: 'Servicio de Internet',
      amount: 1800,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      status: 'paid', // Ya pagado
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.sourceRecordId === 'com-paid'), false, 'Compromiso pagado no debe alertar');
});

test('Atención ahora — Compromiso financiero que vence hoy: aparece con importe y destino proyeccion', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-rent',
      name: 'Alquiler Apartamento',
      amount: 22000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      status: 'pending',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  const rentAlert = items.find((i) => i.sourceRecordId === 'com-rent');

  assert.ok(rentAlert, 'Debe alertar compromiso que vence hoy');
  assert.equal(rentAlert.signalKind, 'financial_commitment_due');
  assert.equal(rentAlert.module, 'finanzas');
  assert.equal(rentAlert.targetTab, 'proyeccion');
  assert.equal(rentAlert.targetFocusId, 'commitment-com-rent');
  assert.ok(rentAlert.detail.includes('$22.000') || rentAlert.detail.includes('22.000'));
  assert.equal(rentAlert.title, 'Vence hoy');
});

test('Atención ahora — Compromisos indefinidos y finitos: semántica exacta de remainingOccurrences y endDate', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    // 1. Indefinido con remainingOccurrences: null (ej. alquiler mensual sin plazo fijo) -> DEBE APARECER
    {
      id: 'com-indef-null',
      name: 'Gimnasio Cuota Mensual',
      amount: 1500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      remainingOccurrences: null,
    },
    // 2. Finito agotado con remainingOccurrences: 0 -> NO DEBE APARECER
    {
      id: 'com-finite-exhausted',
      name: 'Cuota Finalizada',
      amount: 3000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      remainingOccurrences: 0,
    },
    // 3. Finito pendiente con remainingOccurrences: 2 -> DEBE APARECER
    {
      id: 'com-finite-pending',
      name: 'Cuota Curso Online',
      amount: 2500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      remainingOccurrences: 2,
    },
    // 4. Compromiso con endDate anterior y vencido -> NO DEBE APARECER
    {
      id: 'com-expired-contract',
      name: 'Contrato Vencido',
      amount: 1000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-25',
      endDate: '2026-10-15',
      active: true,
      remainingOccurrences: null,
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });

  // com-indef-null debe estar presente
  assert.ok(
    items.some((i) => i.sourceRecordId === 'com-indef-null'),
    'Compromiso indefinido con remainingOccurrences: null debe alertar'
  );

  // com-finite-exhausted (0) no debe estar presente
  assert.equal(
    items.some((i) => i.sourceRecordId === 'com-finite-exhausted'),
    false,
    'Compromiso agotado (remainingOccurrences: 0) no debe alertar'
  );

  // com-expired-contract no debe estar presente
  assert.equal(
    items.some((i) => i.sourceRecordId === 'com-expired-contract'),
    false,
    'Compromiso con contrato vencido por endDate no debe alertar'
  );
});

test('Atención ahora — Cuota de acuerdo parcialmente pagada: muestra el saldo pendiente real', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  // Acuerdo de 6 cuotas de 5000 (total 30.000). Se pagaron 2000 hacia la primera cuota (saldo pendiente 3000).
  state.finance.agreements = [
    {
      id: 'agree-moto',
      title: 'Compra Moto',
      creditorName: 'Concesionaria',
      currency: 'UYU',
      initialRemainingBalance: 30000,
      initialReferenceDate: '2026-10-01',
      status: 'active',
      schedule: {
        totalInstallments: 6,
        installmentAmount: 5000,
        firstDueDate: testDate,
        dueDay: 19,
        frequency: 'monthly',
      },
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
  ];

  state.finance.transactions = [
    {
      id: 'tx-part-1',
      agreementId: 'agree-moto',
      type: 'gasto',
      amount: 2000,
      category: 'Vehículo',
      fixed: 'fijo',
      date: '2026-10-15',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  const motoAlert = items.find((i) => i.sourceRecordId === 'agree-moto');

  assert.ok(motoAlert, 'Debe alertar la cuota pendiente del acuerdo');
  assert.equal(motoAlert.signalKind, 'financial_agreement_due');
  assert.equal(motoAlert.targetTab, 'cuentas');
  assert.equal(motoAlert.targetFocusId, 'agreement-agree-moto');
  // Debe reflejar los 3.000 restantes, NO los 5.000 iniciales
  assert.ok(motoAlert.detail.includes('3.000'), `Debe informar saldo pendiente de 3.000. Detalle: ${motoAlert.detail}`);
});

test('Atención ahora — Cuota de acuerdo cancelada o liquidada: no aparece', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.agreements = [
    {
      id: 'agree-settled',
      title: 'Préstamo Saldado',
      creditorName: 'Amigo',
      currency: 'UYU',
      initialRemainingBalance: 5000,
      initialReferenceDate: '2026-09-01',
      status: 'settled', // Liquidado
      schedule: {
        totalInstallments: 1,
        installmentAmount: 5000,
        firstDueDate: testDate,
        dueDay: 19,
        frequency: 'monthly',
      },
      createdAt: '2026-09-01',
      updatedAt: '2026-10-01',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.sourceRecordId === 'agree-settled'), false, 'Acuerdo liquidado no debe aparecer');
});

test('Atención ahora — Examen mañana: aparece con foco directo a estudios', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.study.subjects = [{ id: 'sub-mat', name: 'Matemática Discreta' }];
  state.study.exams = [
    {
      id: 'exam-mat-1',
      subjectId: 'sub-mat',
      date: '2026-10-20', // Mañana
      status: 'pendiente',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  const examAlert = items.find((i) => i.sourceRecordId === 'exam-mat-1');

  assert.ok(examAlert, 'Debe alertar examen de mañana');
  assert.equal(examAlert.signalKind, 'exam_upcoming');
  assert.equal(examAlert.title, 'Examen mañana');
  assert.equal(examAlert.module, 'estudios');
  assert.equal(examAlert.targetView, 'estudios');
  assert.equal(examAlert.targetFocusId, 'exam-exam-mat-1');
  assert.ok(examAlert.detail.includes('Matemática Discreta'));
});

test('Atención ahora — Examen hoy: NO aparece en atención para no duplicar Agenda', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.study.subjects = [{ id: 'sub-fis', name: 'Física I' }];
  state.study.exams = [
    {
      id: 'exam-today',
      subjectId: 'sub-fis',
      date: testDate, // HOY
      status: 'pendiente',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.sourceRecordId === 'exam-today'), false, 'Examen de hoy ya está en Agenda y no debe duplicarse');
});

test('Atención ahora — Examen pasado en estado pendiente: no aparece automáticamente como emergencia', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.study.subjects = [{ id: 'sub-quim', name: 'Química' }];
  state.study.exams = [
    {
      id: 'exam-past',
      subjectId: 'sub-quim',
      date: '2026-10-10', // Pasado
      status: 'pendiente', // Todavía sin nota/cierre
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.sourceRecordId === 'exam-past'), false, 'Examen pasado pendiente no es emergencia inmediata');
});

test('Atención ahora — Módulo desactivado (Module Visibility): sus señales desaparecen', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  // Creamos un examen para mañana
  state.study.subjects = [{ id: 'sub-alg', name: 'Álgebra' }];
  state.study.exams = [{ id: 'exam-alg', subjectId: 'sub-alg', date: '2026-10-20', status: 'pendiente' }];

  // 1. Con módulo habilitado aparece
  assert.equal(getTodayAttentionItems(state, { todayIso: testDate }).length, 1);

  // 2. Desactivamos estudios en hiddenTabs
  state.settings.hiddenTabs = ['estudios'];
  assert.equal(getTodayAttentionItems(state, { todayIso: testDate }).length, 0, 'Módulo oculto debe suprimir la alerta');
});

test('Atención ahora — Concurrencia y límite estricto de máximo 2 asuntos deterministas', () => {
  const state = defaultState();
  const testDate = '2026-10-19';

  // 4 asuntos concurrentes:
  // 1. Compromiso vencido (Alquiler, venció hace 3 días) -> Score 103 (Finanzas)
  // 2. Tarea de proyecto vencida (Enviar docs, venció hace 2 días) -> Score 92 (Notas)
  // 3. Examen mañana (Matemática, Score 85) (Estudios)
  // 4. Backup urgente (hace 4 días sin backup, Score 65) (Config)
  state.settings.lastBackupAt = '2026-10-15';
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-overdue',
      name: 'Alquiler',
      amount: 20000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-16',
      active: true,
      status: 'pending',
    },
  ];

  state.projects = [
    {
      id: 'p1',
      name: 'Trámites',
      objective: '',
      status: 'activo',
      nextStep: '',
      tasks: [
        {
          id: 'task-overdue',
          text: 'Enviar comprobante',
          done: false,
          dueDate: '2026-10-17',
        },
      ],
      createdAt: '2026-10-01',
    },
  ];

  state.study.subjects = [{ id: 's1', name: 'Matemática' }];
  state.study.exams = [
    {
      id: 'e1',
      subjectId: 's1',
      date: '2026-10-20',
      status: 'pendiente',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });

  // Máximo 2
  assert.equal(items.length, 2, 'Debe devolver exactamente 2 asuntos');

  // Deben ser los 2 más críticos (Obligación vencida y Tarea vencida), el backup no debe taparlos
  assert.equal(items[0].sourceRecordId, 'com-overdue');
  assert.equal(items[1].sourceRecordId, 'task-overdue');
});

test('Atención ahora — Estabilidad determinista con títulos similares y distintos IDs', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-b',
      name: 'Pago Cuota',
      amount: 1000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      status: 'pending',
    },
    {
      id: 'com-a',
      name: 'Pago Cuota',
      amount: 1000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: testDate,
      active: true,
      status: 'pending',
    },
  ];

  const itemsRun1 = getTodayAttentionItems(state, { todayIso: testDate });
  const itemsRun2 = getTodayAttentionItems(state, { todayIso: testDate });

  assert.equal(itemsRun1.length, 2);
  assert.equal(itemsRun1[0].id, itemsRun2[0].id);
  assert.equal(itemsRun1[1].id, itemsRun2[1].id);
  // Tie breaker por id alfabético: com-a precede a com-b
  assert.equal(itemsRun1[0].sourceRecordId, 'com-a');
  assert.equal(itemsRun1[1].sourceRecordId, 'com-b');
});

test('Atención ahora — Cambio de fecha local: recalcula reactivamente según la fecha consultada', () => {
  const state = defaultState();
  state.settings.lastBackupAt = '2026-10-19';
  state.settings.lastWeeklyReviewAt = '2026-10-19';

  state.finance.commitments = [
    {
      id: 'com-oct20',
      name: 'Gimnasio',
      amount: 2500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-20',
      active: true,
      status: 'pending',
    },
  ];

  // El 18 de octubre (falta 2 días): NO genera alerta (el horizonte preventivo es mañana)
  const items18 = getTodayAttentionItems(state, { todayIso: '2026-10-18' });
  assert.equal(items18.some((i) => i.sourceRecordId === 'com-oct20'), false);

  // El 19 de octubre vence mañana: genera alerta preventiva 'Vence mañana'
  const items19 = getTodayAttentionItems(state, { todayIso: '2026-10-19' });
  assert.equal(items19.some((i) => i.sourceRecordId === 'com-oct20'), true);
  assert.equal(items19.find((i) => i.sourceRecordId === 'com-oct20')?.title, 'Vence mañana');

  // Al pasar a 20 de octubre: vence HOY -> aparece como 'Vence hoy'
  const items20 = getTodayAttentionItems(state, { todayIso: '2026-10-20' });
  assert.equal(items20.some((i) => i.sourceRecordId === 'com-oct20'), true);
  assert.equal(items20[0].title, 'Vence hoy');
});

test('Atención ahora — Evento puntual de hoy: detecta inicio inminente (0 a 120 minutos)', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    {
      id: 'ev-59m',
      name: 'Examen Algoritmos y PdD',
      date: testDate,
      time: '19:30',
      type: 'otro',
      recurring: false,
    },
  ];

  // Si son las 18:31, faltan 59 minutos (entre 0 y 120)
  const items = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '18:31' });
  assert.equal(items.length, 1);
  const alert = items[0];
  assert.equal(alert.signalKind, 'agenda_event_soon');
  assert.equal(alert.title, 'Comienza en 59 minutos');
  assert.equal(alert.detail, 'Examen Algoritmos y PdD · 19:30');
  assert.equal(alert.actionLabel, 'Ver evento');
  assert.equal(alert.urgency, 'urgent');
  assert.equal(alert.targetView, 'agenda');
  assert.equal(alert.targetFocusId, 'agenda-event-ev-59m');
  assert.equal(alert.sourceRecordId, 'ev-59m');
});

test('Atención ahora — Evento puntual de hoy: límites de tiempo (120 vs 121 min, 0 min y pasado)', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    { id: 'ev-edge-120', name: 'Reunión Límite', date: testDate, time: '20:00', type: 'otro', recurring: false },
    { id: 'ev-future-5h', name: 'Cena Tarde', date: testDate, time: '23:31', type: 'otro', recurring: false },
  ];

  // A las 17:59 (faltan 121 minutos) -> NO debe alertar todavía
  const items121 = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '17:59' });
  assert.equal(items121.some((i) => i.id === 'attention-agenda-event-ev-edge-120'), false);

  // A las 18:00 (faltan exactamente 120 minutos) -> entra en candidatos
  const items120 = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '18:00' });
  assert.equal(items120.some((i) => i.id === 'attention-agenda-event-ev-edge-120'), true);
  assert.equal(items120[0].title, 'Comienza en 120 minutos');

  // A las 20:00 (faltan 0 minutos) -> 'Comienza ahora'
  const itemsNow = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '20:00' });
  assert.equal(itemsNow.some((i) => i.id === 'attention-agenda-event-ev-edge-120'), true);
  assert.equal(itemsNow[0].title, 'Comienza ahora');

  // A las 20:01 (ya comenzó / en el pasado) -> retirado de atención
  const itemsPast = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '20:01' });
  assert.equal(itemsPast.some((i) => i.id === 'attention-agenda-event-ev-edge-120'), false);

  // Evento dentro de 5 horas -> no genera alerta inminente
  assert.equal(items120.some((i) => i.id === 'attention-agenda-event-ev-future-5h'), false);
});

test('Atención ahora — Evento puntual sin hora: no inventa hora ni genera alerta de inicio', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    { id: 'ev-notime', name: 'Día Libre', date: testDate, type: 'otro', recurring: false },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '12:00' });
  assert.equal(items.some((i) => i.sourceRecordId === 'ev-notime'), false);
});

test('Atención ahora — Evento puntual de mañana con hora: genera candidato moderado con navegación directa', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    {
      id: 'ev-feip-tomorrow',
      name: 'Examen FEIP',
      date: '2026-10-20',
      time: '19:30',
      type: 'otro',
      recurring: false,
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.length, 1);
  const alert = items[0];
  assert.equal(alert.signalKind, 'agenda_event_tomorrow');
  assert.equal(alert.title, 'Mañana, 19:30');
  assert.equal(alert.detail, 'Examen FEIP');
  assert.equal(alert.actionLabel, 'Ver evento');
  assert.equal(alert.urgency, 'warning');
  assert.equal(alert.score, 72);
  assert.equal(alert.targetView, 'agenda');
  assert.equal(alert.targetFocusId, 'agenda-event-ev-feip-tomorrow');
  assert.equal(alert.dueDate, '2026-10-20');
});

test('Atención ahora — Ausencia de heurísticas: evento con título "Examen FEIP" en Agenda NO se convierte en Estudios', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    {
      id: 'ev-agenda-exam',
      name: 'Examen FEIP',
      date: '2026-10-20',
      time: '19:30',
      type: 'otro',
      recurring: false,
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.length, 1);
  assert.equal(items[0].module, 'agenda');
  assert.equal(items[0].targetView, 'agenda');
  assert.notEqual(items[0].module, 'estudios');
  assert.notEqual(items[0].signalKind, 'exam_upcoming');
});

test('Atención ahora — Compromiso financiero que vence mañana: detectado con prioridad preventiva (score 82)', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-directv',
      name: 'DirecTV',
      amount: 1200,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-20',
      active: true,
      remainingOccurrences: null,
      status: 'pending',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.length, 1);
  const alert = items[0];
  assert.equal(alert.signalKind, 'financial_commitment_due');
  assert.equal(alert.title, 'Vence mañana');
  assert.equal(alert.detail, 'DirecTV ($U 1.200) vence mañana.');
  assert.equal(alert.actionLabel, 'Ver cuota');
  assert.equal(alert.urgency, 'warning');
  assert.equal(alert.score, 82);
  assert.equal(alert.targetView, 'finanzas');
  assert.equal(alert.targetTab, 'proyeccion');
  assert.equal(alert.targetFocusId, 'commitment-com-directv');
});

test('Atención ahora — Cuota de acuerdo de financiación que vence mañana: detectada con desglose', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.agreements = [
    {
      id: 'agree-moto',
      title: 'Préstamo Moto',
      creditorName: 'Banco',
      status: 'active',
      currency: 'UYU',
      initialRemainingBalance: 30000,
      initialReferenceDate: '2026-10-01',
      schedule: {
        totalInstallments: 6,
        installmentAmount: 5000,
        firstDueDate: '2026-10-20',
        dueDay: 20,
        frequency: 'monthly',
      },
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.length, 1);
  const alert = items[0];
  assert.equal(alert.signalKind, 'financial_agreement_due');
  assert.equal(alert.title, 'Cuota vence mañana');
  assert.ok(alert.detail.includes('Préstamo Moto · Cuota 1/6 ($U 5.000) vence mañana.'));
  assert.equal(alert.urgency, 'warning');
  assert.equal(alert.score, 82);
  assert.equal(alert.targetView, 'finanzas');
  assert.equal(alert.targetTab, 'cuentas');
  assert.equal(alert.targetFocusId, 'agreement-agree-moto');
});

test('Atención ahora — Obligación financiera de pasado mañana (en 2 días): excluida', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-in-2days',
      name: 'Internet Fibra',
      amount: 1800,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-21',
      active: true,
      status: 'pending',
    },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(items.some((i) => i.sourceRecordId === 'com-in-2days'), false);
});

test('Atención ahora — Jerarquía y límite de 2 con eventos inminentes, vencimientos hoy y mañana', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.calendarEvents = [
    { id: 'ev-today-50m', name: 'Examen Algoritmos y PdD', date: testDate, time: '19:30', type: 'otro', recurring: false },
    { id: 'ev-tomorrow', name: 'Examen FEIP', date: '2026-10-20', time: '19:30', type: 'otro', recurring: false },
  ];

  state.finance.commitments = [
    { id: 'com-antel', name: 'Antel', amount: 1500, currency: 'UYU', frequency: 'monthly', nextDueDate: testDate, active: true },
    { id: 'com-directv', name: 'DirecTV', amount: 1200, currency: 'UYU', frequency: 'monthly', nextDueDate: '2026-10-20', active: true },
  ];

  // A las 18:40: evento hoy está a 50 min (score 100).
  // Antel vence hoy (score 95).
  // DirecTV vence mañana (score 82).
  // Evento FEIP es mañana (score 72).
  const items = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '18:40' });
  assert.equal(items.length, 2, 'Tope estricto de 2 asuntos');
  assert.equal(items[0].sourceRecordId, 'ev-today-50m', 'Evento inminente primero');
  assert.equal(items[1].sourceRecordId, 'com-antel', 'Obligación que vence hoy segundo');
});

test('Atención ahora — Visibilidad de módulo apagado: eventos de agenda no aparecen si módulo está oculto', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;
  state.settings.hiddenTabs = ['agenda', 'calendario'];

  state.calendarEvents = [
    { id: 'ev-hidden', name: 'Examen Oculto', date: testDate, time: '19:30', type: 'otro', recurring: false },
  ];

  const items = getTodayAttentionItems(state, { todayIso: testDate, currentTime: '18:31' });
  assert.equal(items.some((i) => i.sourceRecordId === 'ev-hidden'), false);
});

test('Atención ahora — Descarte individual: remueve asunto activo y lo expone en getDismissedAttentionItems', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    { id: 'com-antel', name: 'Antel', amount: 1500, currency: 'UYU', frequency: 'monthly', nextDueDate: testDate, active: true },
  ];

  // 1. Activo antes de descartar
  const activeBefore = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(activeBefore.length, 1);
  const targetItem = activeBefore[0];
  assert.equal(targetItem.sourceRecordId, 'com-antel');
  assert.equal(targetItem.dismissKey, 'finance_commitment:com-antel:2026-10-19');

  // 2. Se descarta individualmente
  state.settings.dismissedAttentionKeys = [targetItem.dismissKey];

  // 3. Ya no aparece en activos
  const activeAfter = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(activeAfter.length, 0);

  // 4. Aparece en descartados
  const dismissed = getDismissedAttentionItems(state, { todayIso: testDate });
  assert.equal(dismissed.length, 1);
  assert.equal(dismissed[0].dismissKey, targetItem.dismissKey);
});

test('Atención ahora — Descarte individual: el siguiente candidato toma su lugar respetando el tope de 2', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  // 3 candidatos:
  // A: Tarea vencida ayer (score 91)
  // B: Compromiso vence hoy (score 85)
  // C: Compromiso vence mañana (score 82)
  state.projects = [
    {
      id: 'p1',
      name: 'Proyecto',
      objective: '',
      status: 'activo',
      nextStep: '',
      tasks: [{ id: 'task-a', text: 'Tarea A', done: false, dueDate: '2026-10-18' }],
      createdAt: '2026-10-01',
    },
  ];
  state.finance.commitments = [
    { id: 'com-b', name: 'Antel', amount: 1500, currency: 'UYU', frequency: 'monthly', nextDueDate: testDate, active: true },
    { id: 'com-c', name: 'DirecTV', amount: 1200, currency: 'UYU', frequency: 'monthly', nextDueDate: '2026-10-20', active: true },
  ];

  // Inicialmente entran com-b (score 95) y task-a (score 91)
  const initial = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(initial.length, 2);
  assert.equal(initial[0].sourceRecordId, 'com-b');
  assert.equal(initial[1].sourceRecordId, 'task-a');

  // Descartamos com-b (el primer asunto)
  state.settings.dismissedAttentionKeys = [initial[0].dismissKey];

  // Ahora task-a y com-c ocupan los dos lugares disponibles
  const afterB = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(afterB.length, 2);
  assert.equal(afterB[0].sourceRecordId, 'task-a');
  assert.equal(afterB[1].sourceRecordId, 'com-c');
});

test('Atención ahora — Examen académico descartado hoy NO reaparece mañana ni al cambiar de día', () => {
  const state = defaultState();
  const today = '2026-10-19';
  const tomorrow = '2026-10-20';
  state.settings.lastBackupAt = today;
  state.settings.lastWeeklyReviewAt = today;

  state.study.subjects = [{ id: 'sub-bd', name: 'Bases de Datos' }];
  state.study.exams = [
    { id: 'exam-bd', subjectId: 'sub-bd', date: tomorrow, status: 'pendiente' },
  ];

  // 1. En today (2026-10-19), se detecta como "Examen mañana"
  const itemsToday = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(itemsToday.length, 1);
  const examItem = itemsToday[0];
  assert.equal(examItem.signalKind, 'exam_upcoming');
  assert.equal(examItem.dismissKey, 'study_exam:exam-bd:2026-10-20');

  // 2. El usuario descarta el aviso hoy
  state.settings.dismissedAttentionKeys = [examItem.dismissKey];
  assert.equal(getTodayAttentionItems(state, { todayIso: today }).length, 0);

  // 3. Mañana (2026-10-20) evaluamos: el examen no debe reaparecer en atención
  const itemsTomorrow = getTodayAttentionItems(state, { todayIso: tomorrow });
  assert.equal(itemsTomorrow.some((i) => i.sourceRecordId === 'exam-bd'), false);
});

test('Atención ahora — Evento puntual descartado cuando es «mañana» NO reaparece mañana al entrar en ventana de 2 horas', () => {
  const state = defaultState();
  const today = '2026-10-19';
  const tomorrow = '2026-10-20';
  state.settings.lastBackupAt = today;
  state.settings.lastWeeklyReviewAt = today;

  state.calendarEvents = [
    {
      id: 'ev-examen-algo',
      name: 'Examen Algoritmos y PdD',
      date: tomorrow,
      time: '19:30',
      type: 'otro',
      recurring: false,
    },
  ];

  // 1. Hoy lunes (19 de octubre): aparece como "Mañana, 19:30"
  const itemsToday = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(itemsToday.length, 1);
  const evAlert = itemsToday[0];
  assert.equal(evAlert.signalKind, 'agenda_event_tomorrow');
  assert.equal(evAlert.dismissKey, 'agenda_event:ev-examen-algo:2026-10-20');

  // 2. El usuario descarta el aviso de este evento hoy
  state.settings.dismissedAttentionKeys = [evAlert.dismissKey];
  assert.equal(getTodayAttentionItems(state, { todayIso: today }).length, 0);

  // 3. Mañana martes (20 de octubre) a las 18:00 (a 90 minutos de las 19:30, dentro de 0..120 min)
  // Comprobamos expresamente que NO reaparece como "Comienza en 90 minutos"
  const itemsTomorrow = getTodayAttentionItems(state, {
    todayIso: tomorrow,
    currentTime: '18:00',
  });
  assert.equal(
    itemsTomorrow.some((i) => i.sourceRecordId === 'ev-examen-algo'),
    false,
    'El evento descartado para esa ocurrencia NO debe reaparecer al entrar en la ventana de 2 horas'
  );

  // 4. También verificamos getDismissedAttentionItems en ese momento: está presente como silenciado
  const dismissedTomorrow = getDismissedAttentionItems(state, {
    todayIso: tomorrow,
    currentTime: '18:00',
  });
  assert.equal(dismissedTomorrow.length, 1);
  assert.equal(dismissedTomorrow[0].sourceRecordId, 'ev-examen-algo');
  assert.equal(dismissedTomorrow[0].signalKind, 'agenda_event_soon');
});

test('Atención ahora — Compromiso recurrente descartado: silencia solo el vencimiento específico, NO el siguiente', () => {
  const state = defaultState();
  const testDate = '2026-10-19';
  state.settings.lastBackupAt = testDate;
  state.settings.lastWeeklyReviewAt = testDate;

  state.finance.commitments = [
    {
      id: 'com-directv',
      name: 'DirecTV',
      amount: 1200,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-10-20',
      active: true,
      status: 'pending',
    },
  ];

  // 1. Vence mañana (20 de octubre)
  const itemsOct19 = getTodayAttentionItems(state, { todayIso: testDate });
  assert.equal(itemsOct19.length, 1);
  const alert = itemsOct19[0];
  assert.equal(alert.dismissKey, 'finance_commitment:com-directv:2026-10-20');

  // 2. Usuario descarta la cuota de octubre
  state.settings.dismissedAttentionKeys = [alert.dismissKey];
  assert.equal(getTodayAttentionItems(state, { todayIso: testDate }).length, 0);
  assert.equal(getTodayAttentionItems(state, { todayIso: '2026-10-20' }).length, 0);

  // 3. Cuando se paga o avanza el vencimiento a noviembre (2026-11-20):
  state.finance.commitments[0].nextDueDate = '2026-11-20';
  state.settings.lastBackupAt = '2026-11-19';
  state.settings.lastWeeklyReviewAt = '2026-11-19';

  // 4. En noviembre, la nueva ocurrencia NO está descartada y alerta normalmente
  const itemsNov19 = getTodayAttentionItems(state, { todayIso: '2026-11-19' });
  assert.equal(itemsNov19.length, 1);
  assert.equal(itemsNov19[0].dismissKey, 'finance_commitment:com-directv:2026-11-20');
  assert.equal(itemsNov19[0].title, 'Vence mañana');
});

test('Atención ahora — Descarte y reprogramación: cambiar título NO reactiva el aviso, cambiar fecha genera nueva ocurrencia', () => {
  const state = defaultState();
  const today = '2026-10-19';
  state.settings.lastBackupAt = today;
  state.settings.lastWeeklyReviewAt = today;

  state.calendarEvents = [
    { id: 'ev-test', name: 'Reunión de Equipo', date: '2026-10-20', time: '10:00', type: 'otro', recurring: false },
  ];

  const before = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(before.length, 1);
  const key = before[0].dismissKey;

  // 1. Descartamos
  state.settings.dismissedAttentionKeys = [key];
  assert.equal(getTodayAttentionItems(state, { todayIso: today }).length, 0);

  // 2. Cambiamos el título
  state.calendarEvents[0].name = 'Reunión de Equipo de Producto (Urgente)';
  assert.equal(
    getTodayAttentionItems(state, { todayIso: today }).length,
    0,
    'Cambiar el título NO debe reactivar el aviso descartado'
  );

  // 3. Reprogramamos la fecha para el 25 de octubre
  state.calendarEvents[0].date = '2026-10-25';

  // Evaluado para la víspera del 25 (el 24 de octubre): constituye una nueva ocurrencia activa
  const itemsOct24 = getTodayAttentionItems(state, { todayIso: '2026-10-24', backupDismissed: true });
  assert.equal(itemsOct24.length, 1);
  assert.equal(itemsOct24[0].dismissKey, 'agenda_event:ev-test:2026-10-25');
  assert.equal(itemsOct24[0].title, 'Mañana, 10:00');
});

test('Atención ahora — Descarte NO modifica registros originales (done, saldos, fechas intactos)', () => {
  const state = defaultState();
  const today = '2026-10-19';
  state.settings.lastBackupAt = today;
  state.settings.lastWeeklyReviewAt = today;

  state.study.exams = [{ id: 'ex-1', subjectId: 's1', date: '2026-10-20', status: 'pendiente' }];
  state.projects = [
    {
      id: 'p1',
      name: 'P',
      objective: '',
      status: 'activo',
      nextStep: '',
      tasks: [{ id: 't1', text: 'T1', done: false, dueDate: '2026-10-18' }],
      createdAt: '2026-10-01',
    },
  ];
  state.finance.commitments = [
    { id: 'c1', name: 'C1', amount: 2000, currency: 'UYU', frequency: 'monthly', nextDueDate: today, active: true, status: 'pending' },
  ];

  const items = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(items.length, 2);

  // Simulamos descarte de ambos avisos
  state.settings.dismissedAttentionKeys = items.map((i) => i.dismissKey);

  // Verificamos que los registros originales no sufrieron ninguna mutación
  assert.equal(state.study.exams[0].status, 'pendiente');
  assert.equal(state.projects[0].tasks[0].done, false);
  assert.equal(state.finance.commitments[0].status, 'pending');
  assert.equal(state.finance.commitments[0].amount, 2000);
});

test('Atención ahora — Restaurar aviso: vuelve de inmediato a la lista de candidatos activos', () => {
  const state = defaultState();
  const today = '2026-10-19';
  state.settings.lastBackupAt = today;
  state.settings.lastWeeklyReviewAt = today;

  state.calendarEvents = [
    { id: 'ev-restaurar', name: 'Cita Médica', date: '2026-10-20', time: '11:00', type: 'otro', recurring: false },
  ];

  const items = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(items.length, 1);
  const dismissKey = items[0].dismissKey;

  // Descartamos
  state.settings.dismissedAttentionKeys = [dismissKey];
  assert.equal(getTodayAttentionItems(state, { todayIso: today }).length, 0);
  assert.equal(getDismissedAttentionItems(state, { todayIso: today }).length, 1);

  // Restauramos
  state.settings.dismissedAttentionKeys = state.settings.dismissedAttentionKeys.filter((k) => k !== dismissKey);
  const restored = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].sourceRecordId, 'ev-restaurar');
  assert.equal(getDismissedAttentionItems(state, { todayIso: today }).length, 0);
});

test('Atención ahora — Sincronización multi-dispositivo Caso A: Descarte entre dispositivos', () => {
  const localDismissals = {
    'agenda_event:ev-1:2026-10-19': { status: 'dismissed' as const, updatedAt: 1000 },
  };
  const remoteDismissals = {};

  const merged = mergeAttentionDismissals(localDismissals, remoteDismissals);
  assert.equal(merged.attentionDismissals['agenda_event:ev-1:2026-10-19'].status, 'dismissed');
  assert.deepEqual(merged.dismissedAttentionKeys, ['agenda_event:ev-1:2026-10-19']);
});

test('Atención ahora — Sincronización multi-dispositivo Caso B: Restauración entre dispositivos gana sin resurrección', () => {
  // Dispositivo A descartó a t=1000, y luego restauró a t=2000
  const deviceA = {
    'agenda_event:ev-1:2026-10-19': { status: 'active' as const, updatedAt: 2000 },
  };
  // Dispositivo B se quedó con la versión previa descartada a t=1000
  const deviceB = {
    'agenda_event:ev-1:2026-10-19': { status: 'dismissed' as const, updatedAt: 1000 },
  };

  // Merge en dispositivo B
  const merged = mergeAttentionDismissals(deviceB, deviceA);
  assert.equal(
    merged.attentionDismissals['agenda_event:ev-1:2026-10-19'].status,
    'active',
    'La restauración con timestamp más reciente debe ganar'
  );
  assert.equal(
    merged.dismissedAttentionKeys.includes('agenda_event:ev-1:2026-10-19'),
    false,
    'El aviso restaurado NO debe estar en dismissedAttentionKeys'
  );
});

test('Atención ahora — Sincronización multi-dispositivo Caso C: Descarte sucesivo tras restauración', () => {
  // Dispositivo A restauró a t=2000
  const deviceA = {
    'agenda_event:ev-1:2026-10-19': { status: 'active' as const, updatedAt: 2000 },
  };
  // Dispositivo B luego lo volvió a descartar a t=3000
  const deviceB = {
    'agenda_event:ev-1:2026-10-19': { status: 'dismissed' as const, updatedAt: 3000 },
  };

  const merged = mergeAttentionDismissals(deviceA, deviceB);
  assert.equal(
    merged.attentionDismissals['agenda_event:ev-1:2026-10-19'].status,
    'dismissed',
    'El descarte posterior (t=3000) debe prevalecer sobre la restauración anterior (t=2000)'
  );
  assert.deepEqual(merged.dismissedAttentionKeys, ['agenda_event:ev-1:2026-10-19']);
});

test('Atención ahora — Sincronización multi-dispositivo Caso D: Resolución determinista de conflictos en timestamps idénticos', () => {
  const local = {
    'agenda_event:ev-1:2026-10-19': { status: 'active' as const, updatedAt: 1500 },
  };
  const remote = {
    'agenda_event:ev-1:2026-10-19': { status: 'dismissed' as const, updatedAt: 1500 },
  };

  // Desempate determinista: 'dismissed' gana de forma estable sin importar el orden de argumentos
  const merged1 = mergeAttentionDismissals(local, remote);
  const merged2 = mergeAttentionDismissals(remote, local);

  assert.equal(merged1.attentionDismissals['agenda_event:ev-1:2026-10-19'].status, 'dismissed');
  assert.equal(merged2.attentionDismissals['agenda_event:ev-1:2026-10-19'].status, 'dismissed');
});

test('Atención ahora — Sincronización multi-dispositivo Caso E: Compatibilidad con clientes legados y preservación de Settings', () => {
  const stateA = defaultState();
  stateA.settings.darkMode = true;
  stateA.settings.hiddenTabs = ['streaming'];
  // Cliente moderno con registro restaurado a t=500
  stateA.settings.attentionDismissals = {
    'finance_commitment:c1:2026-10-19': { status: 'active', updatedAt: 500 },
  };

  const stateB = defaultState();
  stateB.settings.darkMode = false;
  // Cliente legado que solo manda dismissedAttentionKeys sin attentionDismissals
  stateB.settings.dismissedAttentionKeys = ['finance_commitment:c1:2026-10-19', 'study_exam:ex1:2026-10-20'];
  delete (stateB.settings as any).attentionDismissals;

  const merged = mergeProfileModule(
    { profile: stateA.profile, settings: stateA.settings },
    { profile: stateB.profile, settings: stateB.settings }
  );

  // 1. La restauración de c1 a t=500 gana frente al cliente legado con timestamp por defecto t=1
  assert.equal(merged.settings.attentionDismissals?.['finance_commitment:c1:2026-10-19'].status, 'active');
  // 2. El aviso nuevo del cliente legado ex1 se incorpora como dismissed
  assert.equal(merged.settings.attentionDismissals?.['study_exam:ex1:2026-10-20'].status, 'dismissed');
  assert.deepEqual(merged.settings.dismissedAttentionKeys, ['study_exam:ex1:2026-10-20']);
  // 3. Preferencias de settings preservadas
  assert.deepEqual([...(merged.settings.hiddenTabs || [])].sort(), ['ia', 'streaming']);
});

test('Atención ahora — Recurrencia anual en Calendario: clave incorpora fecha de ocurrencia evaluada y no silencia años posteriores', () => {
  const state = defaultState();
  const today2026 = '2026-10-19';
  state.settings.lastBackupAt = today2026;
  state.settings.lastWeeklyReviewAt = today2026;

  // Evento recurrente anual (cumpleaños / aniversario) creado en 1995
  state.calendarEvents = [
    {
      id: 'ev-anual-1',
      name: 'Cumpleaños de Papá',
      date: '1995-10-19', // Año original
      time: '12:00',
      type: 'importante',
      recurring: true, // Recurrente anual
    },
  ];

  // 1. Evaluado para 2026-10-19 a las 11:00 (dentro de la ventana de 2 horas)
  const items2026 = getTodayAttentionItems(state, {
    todayIso: today2026,
    currentTime: '11:00',
  });
  assert.equal(items2026.length, 1);
  const candidate = items2026[0];
  // La clave de descarte DEBE tener el año 2026, no 1995
  assert.equal(candidate.dismissKey, 'agenda_event:ev-anual-1:2026-10-19');
  assert.equal(candidate.dueDate, '2026-10-19');

  // 2. Descartamos la ocurrencia de 2026
  state.settings.attentionDismissals = {
    [candidate.dismissKey]: { status: 'dismissed', updatedAt: Date.now() },
  };
  state.settings.dismissedAttentionKeys = [candidate.dismissKey];

  // En 2026 no aparece
  const afterDismiss2026 = getTodayAttentionItems(state, {
    todayIso: today2026,
    currentTime: '11:00',
  });
  assert.equal(afterDismiss2026.length, 0, 'En 2026 debe quedar silenciado');

  // 3. Al año siguiente (2027-10-19 a las 11:00):
  state.settings.lastBackupAt = '2027-10-19';
  state.settings.lastWeeklyReviewAt = '2027-10-19';
  const items2027 = getTodayAttentionItems(state, {
    todayIso: '2027-10-19',
    currentTime: '11:00',
  });
  assert.equal(items2027.length, 1, 'En 2027 DEBE volver a alertar para la nueva ocurrencia');
  assert.equal(items2027[0].dismissKey, 'agenda_event:ev-anual-1:2027-10-19');
});

test('Atención ahora — Pruning seguro: no poda avisos de compromisos o tareas pendientes activas', () => {
  const state = defaultState();
  const today = '2026-10-19';

  state.finance.commitments = [
    {
      id: 'com-1',
      name: 'Internet',
      amount: 1500,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: '2026-09-10', // Vencido hace más de 30 días, aún pendiente
      active: true,
      status: 'pending',
    },
  ];

  state.projects = [
    {
      id: 'p1',
      name: 'Proyecto',
      objective: '',
      status: 'activo',
      nextStep: '',
      tasks: [
        {
          id: 't-overdue',
          text: 'Tarea vencida',
          done: false, // Sigue sin completarse
          dueDate: '2026-08-01',
        },
      ],
      createdAt: '2026-08-01',
    },
  ];

  const dismissals = {
    // 1. Compromiso aún pendiente: NO debe podarse
    'finance_commitment:com-1:2026-09-10': { status: 'dismissed' as const, updatedAt: 100 },
    // 2. Tarea aún abierta: NO debe podarse
    'project_task:t-overdue:2026-08-01': { status: 'dismissed' as const, updatedAt: 100 },
    // 3. Backup de hace 20 días: SÍ se poda
    'backup_urgent:2026-09-20': { status: 'dismissed' as const, updatedAt: 100 },
    // 4. Registro active de hace 100 días: SÍ se poda
    'agenda_event:ev-old:2026-01-01': { status: 'active' as const, updatedAt: Date.now() - 100 * 24 * 60 * 60 * 1000 },
  };

  const pruned = pruneAttentionDismissals(dismissals, state, today);

  assert.ok(pruned['finance_commitment:com-1:2026-09-10'], 'Compromiso pendiente debe conservarse');
  assert.ok(pruned['project_task:t-overdue:2026-08-01'], 'Tarea pendiente debe conservarse');
  assert.equal(pruned['backup_urgent:2026-09-20'], undefined, 'Aviso de backup viejo debe podarse');
  assert.equal(pruned['agenda_event:ev-old:2026-01-01'], undefined, 'Registro active viejo debe podarse');
});

test('Atención ahora — Verificación de convergencia 1: Relojes desajustados y causalidad Lamport/HLC', () => {
  // Simulación: Dos dispositivos con diferencias de reloj significativas
  // Dispositivo A descarta un aviso a t=100_000
  const deviceA: Record<string, { status: 'dismissed' | 'active'; updatedAt: number }> = {
    'agenda_event:ev-skew:2026-10-19': { status: 'dismissed', updatedAt: 100_000 },
  };

  // Dispositivo B sincroniza y recibe ese descarte
  let deviceB: Record<string, { status: 'dismissed' | 'active'; updatedAt: number }> = {};
  const syncInitial = mergeAttentionDismissals(deviceB, deviceA);
  deviceB = { ...syncInitial.attentionDismissals };
  assert.equal(deviceB['agenda_event:ev-skew:2026-10-19'].status, 'dismissed');
  assert.equal(deviceB['agenda_event:ev-skew:2026-10-19'].updatedAt, 100_000);

  // Posteriormente (en tiempo real), el usuario en Dispositivo B restaura el aviso.
  // Sin embargo, el reloj físico local de Dispositivo B está muy atrasado (e.g. now = 40_000, 60s detrás de A)
  const physicalClockB = 40_000;
  const prevRecOnB = deviceB['agenda_event:ev-skew:2026-10-19'];
  const restoreTimestampB = nextAttentionDismissalTimestamp(prevRecOnB, physicalClockB);

  // Verificación causal: El reloj lógico Lamport debe avanzar estrictamente más allá del descarte previo conocido
  assert.equal(
    restoreTimestampB,
    100_001,
    'El orden causal prevalece sobre el reloj local físico: T_restore = max(physical, previous + 1)'
  );

  deviceB['agenda_event:ev-skew:2026-10-19'] = { status: 'active', updatedAt: restoreTimestampB };

  // Ambos dispositivos sincronizan nuevamente (probamos 2-way peer sync y 3-way sync con baseline)
  // 1. Sincronización 2-way (sin baseline):
  const sync2Way = mergeAttentionDismissals(deviceA, deviceB);
  assert.equal(
    sync2Way.attentionDismissals['agenda_event:ev-skew:2026-10-19'].status,
    'active',
    'La restauración en B (t=100_001) prevalece sobre el descarte en A (t=100_000) sin revertirse'
  );
  assert.equal(
    sync2Way.dismissedAttentionKeys.includes('agenda_event:ev-skew:2026-10-19'),
    false,
    'El aviso no debe figurar como descartado tras la restauración'
  );

  // 2. Sincronización 3-way (con baseline del descarte previo común):
  const baseline = {
    'agenda_event:ev-skew:2026-10-19': { status: 'dismissed' as const, updatedAt: 100_000 },
  };
  const sync3Way = mergeAttentionDismissals(deviceA, deviceB, undefined, undefined, baseline);
  assert.equal(
    sync3Way.attentionDismissals['agenda_event:ev-skew:2026-10-19'].status,
    'active',
    'En 3-way merge, el cambio local en B se detecta y prevalece inequívocamente'
  );

  // 3. Si posteriormente el usuario en A decide volver a descartar el aviso:
  // Incluso si el reloj de A sigue en 100_000 o 95_000, la regla monotónica garantiza avance causal
  const physicalClockA = 95_000;
  const prevRecOnA = sync2Way.attentionDismissals['agenda_event:ev-skew:2026-10-19'];
  const reDismissTsA = nextAttentionDismissalTimestamp(prevRecOnA, physicalClockA);
  assert.equal(
    reDismissTsA,
    100_002,
    'Un nuevo descarte en A tras observar la restauración de B recibe un timestamp causal superior (100_002)'
  );
});

test('Atención ahora — Verificación de convergencia 2: Historial podado y réplica desconectada > 90 días no resucita descarte en tareas/compromisos vivos', () => {
  const stateA = defaultState();

  // 1. Tarea viva de proyecto con fecha límite en 2026-05-15
  stateA.projects = [
    {
      id: 'p-convergence',
      name: 'Infraestructura',
      objective: '',
      status: 'activo',
      nextStep: '',
      tasks: [
        {
          id: 't-critical',
          text: 'Auditoría de seguridad',
          done: false, // Sigue ABIERTA y PENDIENTE
          dueDate: '2026-05-15',
        },
      ],
      createdAt: '2026-05-01',
    },
  ];

  // 2. Compromiso financiero mensual activo
  stateA.finance.commitments = [
    {
      id: 'c-cloud',
      name: 'Servidor Cloud',
      amount: 45,
      currency: 'USD',
      frequency: 'monthly',
      nextDueDate: '2026-05-15',
      active: true,
      status: 'pending', // Sigue PENDIENTE
    },
  ];

  const taskKey = 'project_task:t-critical:2026-05-15';
  const comKey = 'finance_commitment:c-cloud:2026-05-15';

  // Dispositivo A y B sincronizan un descarte inicial a t=100
  const stateB = JSON.parse(JSON.stringify(stateA)) as typeof stateA;
  stateB.settings.attentionDismissals = {
    [taskKey]: { status: 'dismissed', updatedAt: 100 },
    [comKey]: { status: 'dismissed', updatedAt: 100 },
  };
  stateB.settings.dismissedAttentionKeys = [taskKey, comKey];

  // Dispositivo B se desconecta de la red y queda inactivo por más de 90 días con ese descarte.

  // En Dispositivo A, el usuario restaura ambos avisos a t=200
  stateA.settings.attentionDismissals = {
    [taskKey]: { status: 'active', updatedAt: 200 },
    [comKey]: { status: 'active', updatedAt: 200 },
  };
  stateA.settings.dismissedAttentionKeys = [];

  // Pasan 105 días (más de 90 días): fecha actual es 2026-08-28.
  // La tarea y el compromiso SIGUEN PENDIENTES (elegibles).
  const futureRefDate = '2026-08-28';
  assert.equal(isAttentionOccurrenceEligible(taskKey, stateA, futureRefDate), true);
  assert.equal(isAttentionOccurrenceEligible(comKey, stateA, futureRefDate), true);

  // Dispositivo A ejecuta el mantenimiento / pruneAttentionDismissals tras 105 días
  stateA.settings.attentionDismissals = pruneAttentionDismissals(
    stateA.settings.attentionDismissals,
    stateA,
    futureRefDate
  );

  // COMPROBACIÓN CRÍTICA:
  // Las excepciones de pruning deben proteger los registros 'active' de tareas vivas,
  // impidiendo que se borren y queden indefensas ante réplicas desconectadas.
  assert.ok(
    stateA.settings.attentionDismissals[taskKey],
    'El registro active de una tarea pendiente viva NO debe ser podado tras 90 días'
  );
  assert.equal(stateA.settings.attentionDismissals[taskKey].status, 'active');
  assert.ok(
    stateA.settings.attentionDismissals[comKey],
    'El registro active de un compromiso pendiente vivo NO debe ser podado tras 90 días'
  );
  assert.equal(stateA.settings.attentionDismissals[comKey].status, 'active');

  // Dispositivo B se reconecta tras 105 días e intenta sincronizar su descarte viejo (t=100)
  const syncAfterReconnect = mergeAttentionDismissals(
    stateA.settings.attentionDismissals,
    stateB.settings.attentionDismissals,
    stateA.settings.dismissedAttentionKeys,
    stateB.settings.dismissedAttentionKeys
  );

  // COMPROBACIÓN DEL RESULTADO DE CONVERGENCIA:
  // 1. La restauración de Dispositivo A (t=200) vence al descarte antiguo de Dispositivo B (t=100)
  assert.equal(
    syncAfterReconnect.attentionDismissals[taskKey].status,
    'active',
    'La tarea viva NO debe sufrir la reintroducción silenciosa del descarte de la réplica desconectada'
  );
  assert.equal(
    syncAfterReconnect.attentionDismissals[comKey].status,
    'active',
    'El compromiso vivo NO debe sufrir la reintroducción silenciosa del descarte de la réplica desconectada'
  );
  assert.deepEqual(syncAfterReconnect.dismissedAttentionKeys, []);

  // 2. Evaluado en Hoy: ambos asuntos deben aparecer en «Atención ahora»
  stateA.settings.attentionDismissals = syncAfterReconnect.attentionDismissals;
  stateA.settings.dismissedAttentionKeys = syncAfterReconnect.dismissedAttentionKeys;
  const attentionNow = getTodayAttentionItems(stateA, { todayIso: futureRefDate });
  const hasTask = attentionNow.some((item) => item.sourceRecordId === 't-critical');
  const hasCommitment = attentionNow.some((item) => item.sourceRecordId === 'c-cloud');
  assert.equal(hasTask, true, 'La tarea pendiente debe mostrarse en Atención ahora');
  assert.equal(hasCommitment, true, 'El compromiso pendiente debe mostrarse en Atención ahora');

  // 3. Cuando la tarea finalmente se completa (deja de ser elegible):
  stateA.projects[0].tasks[0].done = true;
  assert.equal(isAttentionOccurrenceEligible(taskKey, stateA, futureRefDate), false);

  // Al correr pruning con fecha posterior a los 30 días de gracia de la tarea completada:
  const staleActiveDismissals = {
    [taskKey]: { status: 'active' as const, updatedAt: Date.now() - 35 * 24 * 60 * 60 * 1000 },
  };
  const prunedCompleted = pruneAttentionDismissals(staleActiveDismissals, stateA, futureRefDate);
  assert.equal(
    prunedCompleted[taskKey],
    undefined,
    'Una vez completada la tarea, el registro active viejo se poda limpiamente'
  );
});

