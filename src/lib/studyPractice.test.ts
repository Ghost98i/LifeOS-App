import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  addStudyQuestion,
  calculatePracticeScore,
  deleteStudyQuestion,
  finishPracticeSession,
  getPracticeRemainingSeconds,
  recordPracticeAnswer,
  startPracticeSession,
  updateStudyQuestion,
} from './studyPractice';

function makeStateWithSubject() {
  const state = defaultState();
  state.study.subjects = [
    {
      id: 'sub-1',
      name: 'Algoritmos',
      topics: [
        { id: 'top-1', title: 'Búsqueda binaria', done: false, updatedAt: 1000 },
        { id: 'top-2', title: 'Grafos', done: false, updatedAt: 1000 },
      ],
      updatedAt: 1000,
    },
    {
      id: 'sub-2',
      name: 'Redes',
      topics: [{ id: 'top-other', title: 'TCP/IP', done: false, updatedAt: 1000 }],
      updatedAt: 1000,
    },
  ];
  return state;
}

test('addStudyQuestion y updateStudyQuestion validan consigna, materia, tema y 2–6 opciones', () => {
  const state = makeStateWithSubject();

  // Consigna vacía
  const emptyPrompt = addStudyQuestion(state, {
    subjectId: 'sub-1',
    prompt: '   ',
    options: [{ id: 'a', text: 'Uno' }, { id: 'b', text: 'Dos' }],
    correctOptionId: 'a',
  });
  assert.equal(emptyPrompt.success, false);

  // Menos de 2 opciones válidas
  const oneOption = addStudyQuestion(state, {
    subjectId: 'sub-1',
    prompt: 'Pregunta válida',
    options: [{ id: 'a', text: 'Única' }, { id: 'b', text: '   ' }],
    correctOptionId: 'a',
  });
  assert.equal(oneOption.success, false);

  // Más de 6 opciones
  const sevenOptions = addStudyQuestion(state, {
    subjectId: 'sub-1',
    prompt: 'Pregunta con 7',
    options: Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, text: `Op ${i}` })),
    correctOptionId: 'o0',
  });
  assert.equal(sevenOptions.success, false);

  // Tema que pertenece a otra materia
  const wrongTopic = addStudyQuestion(state, {
    subjectId: 'sub-1',
    topicId: 'top-other',
    prompt: 'Pregunta',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    correctOptionId: 'a',
  });
  assert.equal(wrongTopic.success, false);

  // Creación válida
  let seq = 0;
  const created = addStudyQuestion(
    state,
    {
      subjectId: 'sub-1',
      topicId: 'top-1',
      prompt: '¿Complejidad de búsqueda binaria?',
      options: [{ id: 'a', text: 'O(log n)' }, { id: 'b', text: 'O(n)' }],
      correctOptionId: 'a',
      explanation: 'Divide el espacio a la mitad.',
    },
    5000,
    () => `id-${++seq}`,
  );
  assert.equal(created.success, true);
  assert.equal(state.study.questions?.length, 1);

  const updated = updateStudyQuestion(
    state,
    created.question!.id,
    {
      subjectId: 'sub-1',
      topicId: 'top-1',
      prompt: '¿Complejidad promedio de búsqueda binaria?',
      options: [{ id: 'a', text: 'O(log n)' }, { id: 'b', text: 'O(n^2)' }, { id: 'c', text: 'O(1)' }],
      correctOptionId: 'a',
    },
    6000,
  );
  assert.equal(updated.success, true);
  assert.equal(state.study.questions![0].options.length, 3);

  assert.equal(deleteStudyQuestion(state, created.question!.id), true);
  assert.equal(state.study.questions?.length, 0);
});

test('calculatePracticeScore aplica fórmula con descuento 0, 0.5 y 1 y acota a [0, 100]', () => {
  const answers = [
    { correct: true },
    { correct: true },
    { correct: false },
    { correct: false },
  ];
  assert.equal(calculatePracticeScore(4, answers, 'ninguno').score, 50);
  // (2 - 2 * 0.5) / 4 = 0.25 -> 25
  assert.equal(calculatePracticeScore(4, answers, 'medio').score, 25);
  // (2 - 2 * 1) / 4 = 0 -> 0
  assert.equal(calculatePracticeScore(4, answers, 'total').score, 0);
  // Clamping a 0 cuando errores superan aciertos
  assert.equal(calculatePracticeScore(4, [{ correct: false }, { correct: false }, { correct: false }], 'total').score, 0);
});

test('sesión de simulacro usa temporizador basado en endsAt, actualiza tema y registra exactamente un StudyLog', () => {
  const state = makeStateWithSubject();
  addStudyQuestion(state, {
    subjectId: 'sub-1',
    topicId: 'top-1',
    prompt: 'Q1',
    options: [{ id: 'o1', text: 'Correcta' }, { id: 'o2', text: 'Incorrecta' }],
    correctOptionId: 'o1',
  }, 1000, () => 'q-1');
  addStudyQuestion(state, {
    subjectId: 'sub-1',
    topicId: 'top-1',
    prompt: 'Q2',
    options: [{ id: 'o3', text: 'Correcta' }, { id: 'o4', text: 'Incorrecta' }],
    correctOptionId: 'o3',
  }, 1000, () => 'q-2');

  // Pomodoro en curso paralelo no debe interferir ni duplicar logs
  state.study.activeSession = {
    id: 'pomodoro-1',
    plannedMinutes: 25,
    startedAt: 100_000,
    status: 'running',
    endsAt: 100_000 + 25 * 60_000,
    remainingSeconds: 1500,
    lastTickAt: 100_000,
  };

  const startMs = 200_000;
  const started = startPracticeSession(state, {
    subjectId: 'sub-1',
    topicId: 'top-1',
    mode: 'simulacro',
    timeLimitMinutes: 5,
    now: startMs,
    createId: () => 'practice-sess-1',
    shuffle: (items) => items,
  });

  assert.equal(started.success, true);
  assert.equal(started.session?.penalty, 'medio');
  assert.equal(started.session?.endsAt, startMs + 5 * 60_000);
  assert.equal(getPracticeRemainingSeconds(started.session, startMs + 120_000), 180);

  recordPracticeAnswer(state, 'q-1', 'o1', startMs + 40_000);
  recordPracticeAnswer(state, 'q-2', 'o4', startMs + 125_000);

  const finishMs = startMs + 125_000;
  const res1 = finishPracticeSession(state, {
    now: finishMs,
    dateIso: '2026-11-18',
    createId: () => 'log-practice-1',
  });

  assert.equal(res1.success, true);
  assert.equal(res1.belowMinimumDuration, false);
  assert.equal(res1.loggedMinutes, 2);
  // 1 correcta, 1 error con penalización 0.5 sobre 2 preguntas => (1 - 0.5) / 2 = 25%
  assert.equal(res1.attempt?.score, 25);
  assert.equal(res1.attempt?.studyLogId, 'log-practice-1');
  assert.equal(state.study.studyLog.length, 1);
  assert.equal(state.study.studyLog[0].sessionId, 'practice-sess-1');
  assert.equal(state.study.activeSession?.id, 'pomodoro-1');
  assert.equal(state.study.activePracticeSession, null);

  // Verifica progreso del tema y bump de subject.updatedAt
  const topic = state.study.subjects[0].topics![0];
  assert.equal(topic.practice?.attempts, 1);
  assert.equal(topic.practice?.correct, 1);
  assert.equal(topic.practice?.bestScore, 25);
  assert.equal(topic.practice?.lastPracticedAt, finishMs);
  assert.equal(state.study.subjects[0].updatedAt, finishMs);

  // Idempotencia: reintentar finalizar el mismo intento no duplica StudyLog
  state.study.activePracticeSession = {
    ...started.session!,
    answers: [...started.session!.answers],
  };
  const res2 = finishPracticeSession(state, {
    now: finishMs + 1000,
    dateIso: '2026-11-18',
    createId: () => 'log-practice-dup',
  });
  assert.equal(res2.success, true);
  assert.equal(state.study.studyLog.length, 1);
  assert.equal(state.study.practiceAttempts?.length, 1);
});

test('sesión menor a 60s no crea StudyLog pero sí registra intento y progreso del tema', () => {
  const state = makeStateWithSubject();
  addStudyQuestion(state, {
    subjectId: 'sub-1',
    topicId: 'top-2',
    prompt: 'BFS usa...',
    options: [{ id: 'a', text: 'Cola' }, { id: 'b', text: 'Pila' }],
    correctOptionId: 'a',
  }, 1000, () => 'q-bfs');

  const startMs = 500_000;
  startPracticeSession(state, {
    subjectId: 'sub-1',
    topicId: 'top-2',
    mode: 'practica',
    penalty: 'ninguno',
    now: startMs,
    createId: () => 'short-sess',
    shuffle: (items) => items,
  });
  recordPracticeAnswer(state, 'q-bfs', 'a', startMs + 15_000);
  const res = finishPracticeSession(state, {
    now: startMs + 25_000,
    dateIso: '2026-11-18',
  });

  assert.equal(res.success, true);
  assert.equal(res.belowMinimumDuration, true);
  assert.equal(res.loggedMinutes, 0);
  assert.equal(res.attempt?.studyLogId, null);
  assert.equal(state.study.studyLog.length, 0);
  assert.equal(state.study.subjects[0].topics![1].practice?.attempts, 1);
  assert.equal(state.study.subjects[0].topics![1].practice?.bestScore, 100);
});
