import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, todayISO } from './storage';
import { getSmartDailyRecommendations, adoptSmartDailyPriorities } from './smartPriorities';

test('getSmartDailyRecommendations: ranks exams and overdue job follow-ups as top priority', () => {
  const state = defaultState();
  const today = todayISO();

  // 1. Add an upcoming exam in 2 days
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 2);
  const examDate = horizon.toISOString().slice(0, 10);

  state.study.subjects.push({ id: 'sub-alg', name: 'Algoritmos' });
  state.study.exams.push({
    id: 'exam-1',
    subjectId: 'sub-alg',
    date: examDate,
    status: 'pendiente',
  });

  // 2. Add an overdue job application follow-up
  state.jobs.applications.push({
    id: 'app-1',
    empresa: 'Globant',
    puesto: 'Dev',
    estado: 'cv_enviado',
    fecha: today,
    nextAction: 'Enviar mensaje a reclutador',
    nextActionDate: today,
  });

  // 3. Add an extra task with alta priority
  state.todayExtras.push({
    id: 'task-1',
    date: today,
    text: 'Reparar canilla',
    done: false,
    priority: 'alta',
  });

  const recs = getSmartDailyRecommendations(state, 3);
  assert.equal(recs.length, 3);

  // Top candidate should be the exam in 2 days (score ~98)
  assert.equal(recs[0].source, 'exam');
  assert.ok(recs[0].text.includes('Algoritmos'));

  // Second should be the job follow-up (score ~90-95)
  assert.equal(recs[1].source, 'job');
  assert.ok(recs[1].text.includes('Globant'));

  // Third should be the high priority task
  assert.equal(recs[2].source, 'task');
  assert.ok(recs[2].text.includes('canilla'));
});

test('adoptSmartDailyPriorities: fills available slots into dailyPriorities without duplication', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-1',
    date: today,
    text: 'Comprar comida de gato',
    done: false,
    priority: 'alta',
  });

  assert.equal(state.dailyPriorities.length, 0);

  // Adopt recommendations
  const adopted = adoptSmartDailyPriorities(state, 3);
  assert.ok(adopted > 0);
  assert.ok(state.dailyPriorities.length > 0);
  assert.equal(state.dailyPriorities[0].date, today);

  // Calling again when already 3 should adopt 0
  const second = adoptSmartDailyPriorities(state, 3);
  assert.equal(second, 0);
});

test('Smart Priorities 2.0: suppresses blocked tasks and boosts unblocking tasks', () => {
  const state = defaultState();
  const today = todayISO();

  // Task A: prerequisite (not done)
  state.todayExtras.push({
    id: 'task-a',
    date: today,
    text: 'Aprobar presupuesto',
    done: false,
    priority: 'media',
  });

  // Task B: depends on Task A (so it is blocked!)
  state.todayExtras.push({
    id: 'task-b',
    date: today,
    text: 'Comprar materiales caros',
    done: false,
    priority: 'alta',
    dependsOn: ['task-a'],
  });

  // Task C: independent task
  state.todayExtras.push({
    id: 'task-c',
    date: today,
    text: 'Enviar reporte mensual',
    done: false,
    priority: 'media',
  });

  const recs = getSmartDailyRecommendations(state, 5);

  // Task B is blocked by Task A, so it must NOT be recommended!
  const hasTaskB = recs.some((r) => r.text.includes('Comprar materiales caros'));
  assert.equal(hasTaskB, false, 'Blocked task B should not be recommended');

  // Task A unblocks Task B, so it should receive unblocking boost
  const taskARec = recs.find((r) => r.text.includes('Aprobar presupuesto'));
  assert.ok(taskARec, 'Task A should be recommended');
  assert.ok(taskARec.reason.includes('Desbloquea 1 tarea(s)'));
  assert.ok(taskARec.score > 70, 'Task A should have score boosted from base');
});

test('Smart Priorities 2.0: deadline urgency boosts score with transparent reasons', () => {
  const state = defaultState();
  const today = todayISO();

  // Task due today
  state.todayExtras.push({
    id: 'task-due-today',
    date: today,
    text: 'Entrega final de proyecto',
    done: false,
    priority: 'alta',
    dueDate: today,
  });

  // Task due without deadline
  state.todayExtras.push({
    id: 'task-normal',
    date: today,
    text: 'Limpiar casilla de correo',
    done: false,
    priority: 'alta',
  });

  const recs = getSmartDailyRecommendations(state, 3);
  const dueTodayCandidate = recs.find((r) => r.text.includes('Entrega final de proyecto'));
  const normalCandidate = recs.find((r) => r.text.includes('Limpiar casilla de correo'));

  assert.ok(dueTodayCandidate);
  assert.ok(normalCandidate);
  assert.ok(dueTodayCandidate.score > normalCandidate.score);
  assert.ok(dueTodayCandidate.reason.includes('Vence hoy'));
});

// ── reasons[] propagation tests ────────────────────────────────────────────

test('adoptSmartDailyPriorities: reasons from SmartPriorities 2.0 are preserved in DailyPriority', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-reasons',
    date: today,
    text: 'Entregar trabajo final',
    done: false,
    priority: 'alta',
    dueDate: today,
  });

  adoptSmartDailyPriorities(state, 3);

  const p = state.dailyPriorities.find((dp) => dp.text.includes('Entregar trabajo final'));
  assert.ok(p, 'Priority should be adopted');
  assert.ok(Array.isArray(p!.reasons), 'reasons should be an array');
  assert.ok(p!.reasons!.length > 0, 'reasons should not be empty');
  assert.ok(p!.reasons!.includes('Vence hoy'), 'reasons should include "Vence hoy"');
  assert.ok(p!.reasons!.includes('Prioridad alta'), 'reasons should include "Prioridad alta"');
});

test('adoptSmartDailyPriorities: reasons are valid arrays when present (no crash for any candidate type)', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-no-extra',
    date: today,
    text: 'Tarea sin contexto extra',
    done: false,
    priority: 'baja',
  });

  adoptSmartDailyPriorities(state, 3);

  state.dailyPriorities.forEach((p) => {
    if (p.reasons !== undefined) {
      assert.ok(Array.isArray(p.reasons), 'reasons must be an array when present');
      assert.ok(p.reasons.length > 0, 'reasons must be non-empty when set');
    }
  });
});

test('adoptSmartDailyPriorities: multiple reasons are all present in DailyPriority', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-blocker',
    date: today,
    text: 'Aprobar requisito previo',
    done: false,
    priority: 'alta',
    dueDate: today,
  });
  state.todayExtras.push({
    id: 'task-blocked',
    date: today,
    text: 'Hacer la tarea dependiente',
    done: false,
    priority: 'media',
    dependsOn: ['task-blocker'],
  });

  adoptSmartDailyPriorities(state, 3);

  const p = state.dailyPriorities.find((dp) => dp.text.includes('Aprobar requisito previo'));
  assert.ok(p, 'Priority must be adopted');
  assert.ok(Array.isArray(p!.reasons));
  assert.ok(p!.reasons!.includes('Prioridad alta'), 'Should include priority reason');
  assert.ok(p!.reasons!.includes('Vence hoy'), 'Should include deadline reason');
  assert.ok(p!.reasons!.some((r) => r.includes('Desbloquea')), 'Should include unblocking reason');
});

test('SmartPriorities: score and order are unaffected by reasons — sorting is stable', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-high',
    date: today,
    text: 'Urgente primero',
    done: false,
    priority: 'alta',
    dueDate: today,
  });

  state.todayExtras.push({
    id: 'task-low',
    date: today,
    text: 'Puede esperar',
    done: false,
    priority: 'baja',
  });

  const recs = getSmartDailyRecommendations(state, 5);

  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i - 1].score >= recs[i].score, 'Recommendations must be sorted descending by score');
  }

  const highRec = recs.find((r) => r.text.includes('Urgente primero'));
  const lowRec = recs.find((r) => r.text.includes('Puede esperar'));
  if (highRec && lowRec) {
    assert.ok(highRec.score > lowRec.score, 'Alta+deadline must outscore baja without deadline');
  }
});

test('reasons in DailyPriority match engine output exactly', () => {
  const state = defaultState();
  const today = todayISO();

  state.todayExtras.push({
    id: 'task-match',
    date: today,
    text: 'Verificar coincidencia de reasons',
    done: false,
    priority: 'alta',
    dueDate: today,
  });

  const recs = getSmartDailyRecommendations(state, 3);
  const engineRec = recs.find((r) => r.text.includes('Verificar coincidencia'));
  assert.ok(engineRec, 'Engine must produce recommendation');
  assert.ok(Array.isArray(engineRec!.reasons));

  adoptSmartDailyPriorities(state, 3);

  const adopted = state.dailyPriorities.find((p) => p.text.includes('Verificar coincidencia'));
  assert.ok(adopted, 'Must be adopted');
  assert.deepEqual(adopted!.reasons, engineRec!.reasons, 'Adopted reasons must match engine exactly');
});
