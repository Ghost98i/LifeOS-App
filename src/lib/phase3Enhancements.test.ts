import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWakeLockManager, type WakeLockStatus } from './wakeLock';
import { getProgressiveOverloadSuggestion, isProgressingOverPrevious } from './gymMetrics';
import {
  addExam,
  addExamTopic,
  addSubjectTopic,
  deleteExamTopic,
  getExamPreparationMetrics,
  toggleExamTopic,
} from './studyFlows';
import { getSmartDailyRecommendations } from './smartPriorities';
import { getTodayAttentionItems } from './todayAttention';
import { deriveMonthlySpendingPacing } from './financePacing';
import { addTransaction, deleteTransaction, restoreDeletedTransaction } from './financeFlows';
import { detectDeletedEntityIds, detectRestoredEntityIds } from './syncMerge';
import { defaultState, normalizeStoredState } from './storage';
import { parseCaptureDrafts } from './quickCaptureDrafts';
import { LiveCapturePreview } from '../components/LiveCapturePreview';
import { PrivacyProvider } from '../components/PrivacyAmount';

test('WakeLock: adquiere bloqueo, re-adquiere al volver a primer plano y degrada limpio sin soporte o con rechazo', async () => {
  const statuses: WakeLockStatus[] = [];
  let releaseCalls = 0;
  let visibilityListener: (() => void) | null = null;
  let releaseListener: (() => void) | null = null;

  const mockDoc = {
    visibilityState: 'visible',
    addEventListener: (type: string, cb: () => void) => {
      if (type === 'visibilitychange') visibilityListener = cb;
    },
    removeEventListener: (type: string) => {
      if (type === 'visibilitychange') visibilityListener = null;
    },
  };

  let requestCount = 0;
  const mockNav = {
    wakeLock: {
      request: async () => {
        requestCount++;
        return {
          released: false,
          release: async () => {
            releaseCalls++;
          },
          addEventListener: (_t: 'release', cb: () => void) => {
            releaseListener = cb;
          },
          removeEventListener: () => {
            releaseListener = null;
          },
        };
      },
    },
  };

  const manager = createWakeLockManager({
    navigatorObj: mockNav,
    documentObj: mockDoc,
    onStatusChange: (s) => statuses.push(s),
  });

  await manager.setActive(true);
  assert.equal(manager.getStatus(), 'active');
  assert.equal(requestCount, 1);

  // Simular pérdida de foco del sistema operativo y liberación del sentinel
  mockDoc.visibilityState = 'hidden';
  releaseListener?.();
  mockDoc.visibilityState = 'visible';
  visibilityListener?.();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(requestCount, 2, 'Debe re-adquirir el bloqueo cuando la pestaña vuelve a estar visible');
  assert.equal(manager.getStatus(), 'active');

  await manager.dispose();
  assert.equal(releaseCalls, 1);

  // Fallback limpio cuando el navegador no expone Wake Lock
  const unsupported = createWakeLockManager({ navigatorObj: {}, documentObj: mockDoc });
  assert.equal(await unsupported.setActive(true), 'unsupported');

  // Fallback limpio cuando ahorro de batería rechaza la promesa
  const denied = createWakeLockManager({
    navigatorObj: {
      wakeLock: {
        request: async () => {
          throw new Error('NotAllowedError');
        },
      },
    },
    documentObj: mockDoc,
  });
  assert.equal(await denied.setActive(true), 'denied');
});

test('Gimnasio: sobrecarga progresiva aplica doble progresión según equipamiento y excluye calentamiento', () => {
  // 1. Barra pesada por debajo del techo (8 reps -> sugiere +1 rep con mismo peso)
  const addRep = getProgressiveOverloadSuggestion({
    previousSet: { weight: 80, reps: 8, type: 'normal' },
    previousGhostSets: [
      { weight: 80, reps: 8, type: 'normal' },
      { weight: 80, reps: 8, type: 'normal' },
    ],
    equipment: 'barra',
  });
  assert.ok(addRep);
  assert.equal(addRep.kind, 'add_reps');
  assert.equal(addRep.weight, 80);
  assert.equal(addRep.reps, 9);

  // 2. Barra pesada con todas las series en el techo (10 reps @ 80kg -> sugiere +2.5kg x 8)
  const stepUpBarbell = getProgressiveOverloadSuggestion({
    previousSet: { weight: 80, reps: 10, type: 'normal' },
    previousGhostSets: [
      { weight: 80, reps: 10, type: 'normal' },
      { weight: 80, reps: 10, type: 'normal' },
    ],
    equipment: 'barra',
  });
  assert.ok(stepUpBarbell);
  assert.equal(stepUpBarbell.kind, 'add_weight');
  assert.equal(stepUpBarbell.weight, 82.5);
  assert.equal(stepUpBarbell.reps, 8);

  // 3. Mancuernas en techo (12 reps @ 16kg -> +2kg)
  const stepUpDb = getProgressiveOverloadSuggestion({
    previousSet: { weight: 16, reps: 12, type: 'normal' },
    previousGhostSets: [{ weight: 16, reps: 12, type: 'normal' }],
    equipment: 'mancuerna',
  });
  assert.ok(stepUpDb);
  assert.equal(stepUpDb.weight, 18);

  // 4. Serie de calentamiento nunca sugiere sobrecarga
  const warmup = getProgressiveOverloadSuggestion({
    previousSet: { weight: 40, reps: 10, type: 'warmup' },
    equipment: 'barra',
    currentSetType: 'warmup',
  });
  assert.equal(warmup, null);

  assert.equal(isProgressingOverPrevious({ weight: 82.5, reps: 8 }, { weight: 80, reps: 10 }), true);
  assert.equal(isProgressingOverPrevious({ weight: 80, reps: 10 }, { weight: 80, reps: 10 }), false);
});

test('Estudios y Hoy: temarios por materia/examen alimentan preparación real y prioridades inteligentes', () => {
  const state = defaultState();
  state.study.subjects = [
    { id: 'sub-algo', name: 'Algoritmos', createdAt: 1, updatedAt: 1 },
    { id: 'sub-redes', name: 'Redes', createdAt: 1, updatedAt: 1 },
  ];

  // Temas en materia sin examen próximo -> genera recomendación continua de estudio
  addSubjectTopic(state, 'sub-redes', 'Modelo OSI y TCP/IP');

  // Examen en 3 días con 3 temas (1 completado, 2 pendientes) y 0 min recientes
  const createdExam = addExam(state, {
    title: 'Parcial 1',
    subjectId: 'sub-algo',
    date: '2026-05-13',
    status: 'pendiente',
  });
  assert.equal(createdExam.success, true);
  const examId = createdExam.exam!.id;

  const t1 = addExamTopic(state, examId, 'Árboles AVL');
  const t2 = addExamTopic(state, examId, 'Grafos y Dijkstra');
  const t3 = addExamTopic(state, examId, 'Programación dinámica');
  assert.ok(t1.topic && t2.topic && t3.topic);

  toggleExamTopic(state, examId, t1.topic.id);

  // Verificar preservación al normalizar almacenamiento
  const normalized = normalizeStoredState(structuredClone(state));
  const normExam = normalized.study.exams.find((e) => e.id === examId)!;
  assert.equal(normExam.topics?.length, 3);

  const prep = getExamPreparationMetrics(normExam, normalized, '2026-05-10');
  assert.equal(prep.daysUntil, 3);
  assert.equal(prep.completedTopics, 1);
  assert.equal(prep.totalTopics, 3);
  assert.equal(prep.progressPct, 33);
  assert.equal(prep.readiness, 'needs_attention');
  assert.equal(prep.pendingTopics[0].title, 'Grafos y Dijkstra');

  const recs = getSmartDailyRecommendations(normalized, 3, '2026-05-10');
  const examRec = recs.find((r) => r.source === 'exam' && r.text.includes('Algoritmos'));
  assert.ok(examRec, 'Debe recomendar estudiar para el parcial próximo');
  assert.match(examRec.text, /Grafos y Dijkstra/, 'Debe proponer exactamente el próximo tema pendiente');
  assert.ok(examRec.reasons.some((reason) => reason.includes('Temario: 1/3 temas listos')));
  assert.ok(examRec.reasons.some((reason) => reason.includes('Sin estudio registrado en 7 días')));

  // Atención ahora a 1 día incluye el conteo de temas pendientes
  const attention = getTodayAttentionItems(normalized, { todayIso: '2026-05-12' });
  const examAtt = attention.find((a) => a.signalKind === 'exam_upcoming');
  assert.ok(examAtt);
  assert.match(examAtt.detail, /2\/3 temas pendientes/);

  // Eliminar tema devuelve el snapshot para Deshacer
  const deleted = deleteExamTopic(normalized, examId, t3.topic.id);
  assert.equal(deleted.success, true);
  assert.equal(deleted.removed?.title, 'Programación dinámica');
});

test('Finanzas: ritmo de gasto diario separa monedas, excluye fijos del ritmo variable y restaura borrados con exactitud', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco UYU', currency: 'UYU', initialBalance: 45000, balance: 45000 },
    { id: 'acc-usd', name: 'Ahorro USD', currency: 'USD', initialBalance: 1000, balance: 1000 },
  ];
  state.finance.minCushion = 5000;
  state.finance.cushionEnabled = true;

  // Alquiler fijo el día 2 ($15.000) + gasto variable el día 5 ($5.000) -> saldo real $25.000
  const rentTx = addTransaction(state, {
    type: 'gasto',
    amount: 15000,
    category: 'Vivienda',
    fixed: 'fijo',
    accountId: 'acc-uyu',
    date: '2026-05-02',
  });
  const foodTx = addTransaction(state, {
    type: 'gasto',
    amount: 5000,
    category: 'Comida',
    fixed: 'variable',
    accountId: 'acc-uyu',
    date: '2026-05-05',
  });

  // Compromiso pendiente en el mismo mes ($6.000 UYU)
  state.finance.commitments.push({
    id: 'com-luz',
    name: 'UTE',
    amount: 6000,
    currency: 'UYU',
    category: 'Servicios',
    frequency: 'monthly',
    nextDueDate: '2026-05-20',
    active: true,
    status: 'pending',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  });

  // Gasto en USD no debe contaminar el ritmo en UYU
  addTransaction(state, {
    type: 'gasto',
    amount: 200,
    category: 'Suscripciones',
    fixed: 'variable',
    accountId: 'acc-usd',
    currency: 'USD',
    date: '2026-05-04',
  });

  const pacingUyu = deriveMonthlySpendingPacing(state, 'UYU', '2026-05-10');
  assert.equal(pacingUyu.realBalance, 25000);
  assert.equal(pacingUyu.pendingCommitments, 6000);
  assert.equal(pacingUyu.availableAfterCommitments, 19000);
  assert.equal(pacingUyu.freeMarginAfterCushion, 14000); // 19.000 - 5.000 colchón
  assert.equal(pacingUyu.spentThisMonth, 20000);
  assert.equal(pacingUyu.variableSpentThisMonth, 5000); // excluye el alquiler fijo de 15.000
  assert.equal(pacingUyu.variableDailySpendRate, 500); // 5.000 / 10 días
  assert.equal(pacingUyu.remainingDays, 22); // del 10 al 31 inclusive = 22 días
  assert.equal(pacingUyu.dailyAvailableMargin, Math.round(14000 / 22));
  assert.equal(pacingUyu.pacingTone, 'healthy');

  const pacingUsd = deriveMonthlySpendingPacing(state, 'USD', '2026-05-10');
  assert.equal(pacingUsd.realBalance, 800);
  assert.equal(pacingUsd.cushionAmount, 0);

  // Deshacer eliminación de transacción restaura saldo materializado e ID original
  const snapshotFood = structuredClone(state.finance.transactions.find((t) => t.id === foodTx.id)!);
  const beforeDeleteState = structuredClone(state);
  deleteTransaction(state, foodTx.id);
  assert.equal(state.finance.accounts[0].balance, 30000);
  assert.deepEqual(detectDeletedEntityIds(beforeDeleteState, state), [foodTx.id]);

  const afterDeleteState = structuredClone(state);
  restoreDeletedTransaction(state, snapshotFood);
  assert.equal(state.finance.accounts[0].balance, 25000);
  assert.deepEqual(detectRestoredEntityIds(afterDeleteState, state), [foodTx.id]);
  assert.ok(rentTx.id);
});

test('Captura Rápida: LiveCapturePreview muestra atributos interpretados y protege montos con Stream Guard', () => {
  const state = defaultState();
  state.settings.privacyMode = true;
  state.finance.accounts = [
    { id: 'acc-1', name: 'Banco Itaú', currency: 'UYU', initialBalance: 5000, balance: 5000 },
  ];
  state.finance.categories = [
    { id: 'Supermercado', name: 'Supermercado', active: true },
  ];
  const drafts = parseCaptureDrafts('gasté 850 super', state);
  assert.equal(drafts.length, 1);

  const html = renderToStaticMarkup(
    React.createElement(
      PrivacyProvider,
      { privacyMode: true },
      React.createElement(LiveCapturePreview, { drafts, state })
    )
  );
  assert.match(html, /Gasto/);
  assert.match(html, /privacy-amount/, 'El monto previsualizado debe envolverse en PrivacyAmount');
  assert.match(html, /Listo/);
});
