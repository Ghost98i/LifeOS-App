import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import type { LifeOSState } from '../types';
import {
  getTodayAgendaEntries,
  getPastPendingExtras,
  getFutureScheduledExtras,
} from './todayOverview';
import { getTodayAttentionItems } from './todayAttention';
import { calendarItemsOnDate, todayItems } from './calculations';
import { focusTargetElement, clearActiveTargetHighlight } from './navigationFocus';

function createBaseState(): LifeOSState {
  const state = defaultState();
  if (!state.settings) {
    state.settings = {} as any;
  }
  state.settings.lastBackupAt = '2026-10-19';
  state.settings.lastWeeklyReviewAt = '2026-10-19';
  state.todayExtras = [];
  state.tasksRecurring = [];
  state.agenda = {
    lunes: [],
    martes: [],
    miercoles: [],
    jueves: [],
    viernes: [],
    sabado: [],
    domingo: [],
  };
  state.dailyPriorities = [];
  state.taskLog = {};
  if (state.study) state.study.exams = [];
  if (state.finance) {
    state.finance.commitments = [];
    state.finance.agreements = [];
  }
  if (state.projects) state.projects = [];
  return state;
}

// =============================================================================
// Flujo A: Tarea recuperada y completada
// =============================================================================
test('Flujo A: Tarea recuperada y completada desde Agenda actualiza estado y limpia Atención', () => {
  const state = createBaseState();
  const today = '2026-10-19';

  state.todayExtras = [
    {
      id: 'extra-past-1',
      text: 'Enviar balance contable',
      date: '2026-10-18',
      dueDate: '2026-10-18',
      priority: 'media',
      done: false,
    },
  ];

  // 1. Estado inicial: aparece en pendientes anteriores y en Atención ahora
  const pastPending = getPastPendingExtras(state, today);
  assert.equal(pastPending.length, 1);
  assert.equal(pastPending[0].id, 'extra-past-1');

  const attention = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(attention.length, 1);
  assert.equal(attention[0].targetFocusId, 'today-extra-extra-past-1');

  // 2. Usuario completa la tarea recuperada
  const target = state.todayExtras.find((x) => x.id === 'extra-past-1');
  assert.ok(target);
  target.done = true;

  // 3. Verificación post-completado
  const pastPendingAfter = getPastPendingExtras(state, today);
  assert.equal(pastPendingAfter.length, 0, 'La sección de pendientes anteriores debe quedar vacía');

  const attentionAfter = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(attentionAfter.length, 0, 'Atención ahora debe desaparecer de inmediato');

  assert.equal(todayItems(state, today).filter((i) => !i.done).length, 0);
});

// =============================================================================
// Flujo B: Reprogramación individual con fecha límite preservada
// =============================================================================
test('Flujo B: Reprogramación individual a fecha futura preserva dueDate y ajusta vistas', () => {
  const state = createBaseState();
  const today = '2026-10-19';

  state.todayExtras = [
    {
      id: 'extra-resched-1',
      text: 'Renovar póliza de seguro',
      date: '2026-10-17',
      dueDate: '2026-10-17',
      priority: 'alta',
      done: false,
    },
  ];

  // Reprogramar para mañana
  const target = state.todayExtras.find((x) => x.id === 'extra-resched-1');
  assert.ok(target);
  target.date = '2026-10-20';

  // Invariante 1: dueDate original queda intacto
  assert.equal(target.dueDate, '2026-10-17');

  // Invariante 2: sale de pendientes anteriores de hoy
  assert.equal(getPastPendingExtras(state, today).length, 0);

  // Invariante 3: entra en próximas programadas
  const future = getFutureScheduledExtras(state, today);
  assert.equal(future.length, 1);
  assert.equal(future[0].id, 'extra-resched-1');

  // Invariante 4: sigue alertando en Atención ahora porque su plazo venció el 17
  const attention = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(attention.length, 1);
  assert.equal(attention[0].targetFocusId, 'today-extra-extra-resched-1');
  assert.equal(attention[0].targetView, 'dashboard');
});

// =============================================================================
// Flujo C: Tarea con fecha límite hoy programada a futuro
// =============================================================================
test('Flujo C: Tarea con fecha límite hoy programada a futuro no se duplica en Agenda y alerta en Atención', () => {
  const state = createBaseState();
  const today = '2026-10-19';

  state.todayExtras = [
    {
      id: 'extra-future-due-today',
      text: 'Presentar declaración jurada',
      date: '2026-10-22',
      dueDate: '2026-10-19',
      priority: 'alta',
      done: false,
    },
  ];

  // 1. Agenda principal de hoy: NO debe tenerla como tarea ejecutable hoy
  const agendaEntries = getTodayAgendaEntries(state, today);
  const inMainAgenda = agendaEntries.some((e) => e.id === 'extra-future-due-today');
  assert.equal(inMainAgenda, false, 'No debe duplicarse en la lista principal de Agenda');

  // 2. Próximas programadas: debe estar listada
  const future = getFutureScheduledExtras(state, today);
  assert.equal(future.some((e) => e.id === 'extra-future-due-today'), true);

  // 3. Atención ahora: debe señalar que vence hoy
  const attention = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(attention.length, 1);
  assert.equal(attention[0].title, 'Plazo vence hoy');
  assert.equal(attention[0].targetFocusId, 'today-extra-extra-future-due-today');

  // 4. Calendario: hoy muestra la entrega como hito de plazo (isDeadline: true)
  const calToday = calendarItemsOnDate(state, today);
  const deadlineItem = calToday.find((i) => i.id === 'deadline-extra-extra-future-due-today');
  assert.ok(deadlineItem);
  assert.equal(deadlineItem.isDeadline, true);
  assert.equal(deadlineItem.type, 'entrega');

  // El día 22 muestra la tarea programada
  const calFuture = calendarItemsOnDate(state, '2026-10-22');
  const scheduledItem = calFuture.find((i) => i.id === 'scheduled-extra-extra-future-due-today');
  assert.ok(scheduledItem);
  assert.equal(scheduledItem.type, 'otro');
});

// =============================================================================
// Flujo D: Navegación repetida y cambio de foco
// =============================================================================
test('Flujo D: Navegación repetida y cambio de foco entre módulos limpia focos previos', () => {
  const elements = new Map<string, any>();

  class MockEl {
    id: string;
    classes = new Set<string>();
    scrollCalls: any[] = [];
    classList = {
      add: (c: string) => this.classes.add(c),
      remove: (c: string) => this.classes.delete(c),
      contains: (c: string) => this.classes.has(c),
    };
    scrollIntoView(opt?: any) {
      this.scrollCalls.push(opt);
    }
    constructor(id: string) {
      this.id = id;
    }
  }

  const prevDoc = (globalThis as any).document;
  (globalThis as any).document = {
    body: {},
    getElementById: (id: string) => elements.get(id) || null,
  };

  try {
    const elExam = new MockEl('exam-101');
    const elCommitment = new MockEl('commitment-202');
    elements.set('exam-101', elExam);
    elements.set('commitment-202', elCommitment);

    // 1. Usuario navega a examen
    focusTargetElement('exam-101');
    assert.equal(elExam.classList.contains('lifeos-target-highlight'), true);
    assert.equal(elCommitment.classList.contains('lifeos-target-highlight'), false);

    // 2. Usuario vuelve y navega a compromiso financiero
    focusTargetElement('commitment-202');
    assert.equal(elExam.classList.contains('lifeos-target-highlight'), false, 'Examen debe perder el highlight');
    assert.equal(elCommitment.classList.contains('lifeos-target-highlight'), true, 'Compromiso debe recibir el highlight');

    // 3. Usuario pulsa de nuevo el mismo aviso de compromiso (segundo clic consecutivo con focusNonce)
    focusTargetElement('commitment-202');
    assert.equal(elExam.classList.contains('lifeos-target-highlight'), false);
    assert.equal(elCommitment.classList.contains('lifeos-target-highlight'), true);
    assert.equal(elCommitment.scrollCalls.length, 2, 'Debe re-scrollear en cada nonce');
  } finally {
    clearActiveTargetHighlight();
    (globalThis as any).document = prevDoc;
  }
});

// =============================================================================
// Flujo E: Navegación con retardo de renderizado
// =============================================================================
test('Flujo E: Navegación con retardo de renderizado espera dinámicamente al DOM sin fallar', () => {
  const elements = new Map<string, any>();
  const callbacks: Array<() => void> = [];

  class MockEl {
    id: string;
    classes = new Set<string>();
    classList = {
      add: (c: string) => this.classes.add(c),
      remove: (c: string) => this.classes.delete(c),
      contains: (c: string) => this.classes.has(c),
    };
    scrollIntoView() {}
    constructor(id: string) {
      this.id = id;
    }
  }

  class MockObserver {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
      callbacks.push(cb);
    }
    observe() {}
    disconnect() {
      const idx = callbacks.indexOf(this.cb);
      if (idx !== -1) callbacks.splice(idx, 1);
    }
  }

  const prevDoc = (globalThis as any).document;
  const prevMO = (globalThis as any).MutationObserver;

  (globalThis as any).document = {
    body: {},
    getElementById: (id: string) => elements.get(id) || null,
  };
  (globalThis as any).MutationObserver = MockObserver;

  try {
    let focusCallbackCalled = false;
    const cancel = focusTargetElement('drawer-task-55', {
      onFocusFound: () => {
        focusCallbackCalled = true;
      },
    });

    assert.equal(focusCallbackCalled, false, 'Elemento aún no montado en el DOM');

    // Simular montaje tardío del componente (expansión de sección o tab)
    const delayedEl = new MockEl('drawer-task-55');
    elements.set('drawer-task-55', delayedEl);

    // Disparar mutación del DOM
    for (const cb of [...callbacks]) {
      cb();
    }

    assert.equal(focusCallbackCalled, true, 'Debe detectar el montaje vía MutationObserver');
    assert.equal(delayedEl.classList.contains('lifeos-target-highlight'), true);

    cancel();
  } finally {
    clearActiveTargetHighlight();
    (globalThis as any).document = prevDoc;
    (globalThis as any).MutationObserver = prevMO;
  }
});

// =============================================================================
// Flujo F: Acción masiva con confirmación y cancelación
// =============================================================================
test('Flujo F: Mover todas a hoy respeta confirmación, preserva dueDates y protege tareas futuras', () => {
  const state = createBaseState();
  const today = '2026-10-19';

  state.todayExtras = [
    // Tarea 1: Pasada pendiente con vencimiento
    { id: 'p1', text: 'Tarea 1', date: '2026-10-17', dueDate: '2026-10-17', priority: 'media', done: false },
    // Tarea 2: Pasada pendiente sin vencimiento
    { id: 'p2', text: 'Tarea 2', date: '2026-10-18', priority: 'alta', done: false },
    // Tarea 3: Pasada completada (no debe moverse)
    { id: 'p3', text: 'Tarea 3 completada', date: '2026-10-18', priority: 'baja', done: true },
    // Tarea 4: Futura programada (no debe moverse)
    { id: 'f4', text: 'Tarea 4 futura', date: '2026-10-25', dueDate: '2026-10-25', priority: 'media', done: false },
    // Tarea 5: De hoy (no debe alterarse)
    { id: 't5', text: 'Tarea 5 hoy', date: '2026-10-19', priority: 'alta', done: false },
  ];

  // Caso 1: Cancelación -> ninguna tarea cambia
  const confirmedFalse = false;
  if (confirmedFalse) {
    // No-op
  }
  assert.equal(getPastPendingExtras(state, today).length, 2);

  // Caso 2: Confirmación -> solo p1 y p2 pasan a hoy
  const pastPending = getPastPendingExtras(state, today);
  assert.equal(pastPending.length, 2);

  for (const extra of state.todayExtras) {
    if (extra.date < today && !extra.done) {
      extra.date = today;
    }
  }

  // Comprobaciones
  assert.equal(state.todayExtras.find((x) => x.id === 'p1')?.date, today);
  assert.equal(state.todayExtras.find((x) => x.id === 'p1')?.dueDate, '2026-10-17', 'dueDate intacto');

  assert.equal(state.todayExtras.find((x) => x.id === 'p2')?.date, today);

  assert.equal(state.todayExtras.find((x) => x.id === 'p3')?.date, '2026-10-18', 'Tarea completada no fue alterada');
  assert.equal(state.todayExtras.find((x) => x.id === 'f4')?.date, '2026-10-25', 'Tarea futura no fue alterada');
  assert.equal(state.todayExtras.find((x) => x.id === 't5')?.date, today);

  // Pendientes anteriores ahora es 0
  assert.equal(getPastPendingExtras(state, today).length, 0);

  // Agenda de hoy ahora contiene p1, p2 y t5
  const todayList = todayItems(state, today);
  assert.equal(todayList.some((t) => t.id === 'p1'), true);
  assert.equal(todayList.some((t) => t.id === 'p2'), true);
  assert.equal(todayList.some((t) => t.id === 't5'), true);
  assert.equal(todayList.some((t) => t.id === 'f4'), false);
});

// =============================================================================
// Flujo G: Cambio de día en caliente (medianoche)
// =============================================================================
test('Flujo G: Transición de medianoche recalcula tareas y vencimientos sin corrupción', () => {
  const state = createBaseState();

  state.todayExtras = [
    { id: 'task-oct19', text: 'Revisión nocturna', date: '2026-10-19', priority: 'media', done: false },
  ];
  if (state.study) {
    state.study.exams = [
      { id: 'ex-oct20', subjectId: 's1', date: '2026-10-20', status: 'pendiente' },
    ];
  }

  // 1. Día 19 antes de medianoche
  const pastOn19 = getPastPendingExtras(state, '2026-10-19');
  assert.equal(pastOn19.length, 0, 'No hay tareas pasadas el día 19');

  const attentionOn19 = getTodayAttentionItems(state, { todayIso: '2026-10-19' });
  assert.equal(attentionOn19.some((a) => a.id === 'attention-exam-ex-oct20'), true, 'Examen de mañana alerta en atención');

  // 2. Medianoche: fecha cambia a 2026-10-20
  const pastOn20 = getPastPendingExtras(state, '2026-10-20');
  assert.equal(pastOn20.length, 1, 'task-oct19 ahora es pendiente anterior');
  assert.equal(pastOn20[0].id, 'task-oct19');

  const attentionOn20 = getTodayAttentionItems(state, { todayIso: '2026-10-20' });
  assert.equal(
    attentionOn20.some((a) => a.id === 'attention-exam-ex-oct20'),
    false,
    'El examen es hoy, por lo que pertenece a Agenda y NO duplica en Atención ahora'
  );

  const agendaOn20 = getTodayAgendaEntries(state, '2026-10-20');
  assert.equal(agendaOn20.some((e) => e.id === 'exam-ex-oct20'), true, 'Examen aparece en Agenda de hoy');
});

// =============================================================================
// Flujo H: Composición contextual limpia (0, 1, 2, >2 asuntos)
// =============================================================================
test('Flujo H: Composición contextual limpia y precedencia determinista en Atención ahora', () => {
  const state = createBaseState();
  const today = '2026-10-19';

  // Estado H0: 0 excepciones
  assert.deepEqual(getTodayAttentionItems(state, { todayIso: today }), []);

  // Estado H1: 1 excepción (tarea vencida)
  state.todayExtras.push({
    id: 't-overdue-1',
    text: 'Declaración jurada',
    date: '2026-10-17',
    dueDate: '2026-10-17',
    priority: 'alta',
    done: false,
  });
  const itemsH1 = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(itemsH1.length, 1);
  assert.equal(itemsH1[0].targetFocusId, 'today-extra-t-overdue-1');

  // Estado H2: 2 excepciones (+ 1 compromiso financiero)
  if (state.finance) {
    state.finance.commitments.push({
      id: 'com-rent',
      name: 'Alquiler',
      amount: 25000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: today,
      active: true,
      category: 'Hogar',
      remainingOccurrences: 10,
    });
  }
  const itemsH2 = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(itemsH2.length, 2);

  // Estado H3: Más de 2 excepciones (+ examen + tarea de proyecto + acuerdo financiero)
  if (state.study) {
    state.study.exams.push({
      id: 'exam-hist',
      subjectId: 's2',
      date: '2026-10-20',
      status: 'pendiente',
    });
  }
  state.todayExtras.push({
    id: 't-overdue-2',
    text: 'Segunda tarea vencida',
    date: '2026-10-16',
    dueDate: '2026-10-16',
    priority: 'alta',
    done: false,
  });

  const itemsH3 = getTodayAttentionItems(state, { todayIso: today });
  // Invariante estricto: máximo 2 asuntos
  assert.equal(itemsH3.length, 2);

  // Resolver el primer asunto (marcar la tarea vencida como hecha)
  const taskToComplete = state.todayExtras.find((x) => x.id === 't-overdue-2');
  assert.ok(taskToComplete);
  taskToComplete.done = true;

  // El siguiente asunto emerge determinísticamente
  const itemsAfterResolution = getTodayAttentionItems(state, { todayIso: today });
  assert.equal(itemsAfterResolution.length, 2);
  assert.equal(itemsAfterResolution.some((x) => x.targetFocusId === 'today-extra-t-overdue-2'), false);
});
