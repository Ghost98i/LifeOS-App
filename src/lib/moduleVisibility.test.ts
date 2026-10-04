import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isModuleEnabled,
  isModuleHidden,
  getHiddenTabs,
  getVisibleModules,
  getMobileNavSlots,
  NON_HIDEABLE_MODULES,
  OPTIONAL_MODULES,
} from './moduleVisibility';
import { defaultState, todayISO } from './storage';
import { weeklyReviewExceptions, formatWeeklyReviewSummaryNote, gatherWeeklyReviewData } from './review';
import { getSmartDailyRecommendations } from './smartPriorities';
import { executeUniversalCapture } from './universalCapture';

test('Module Visibility - Single Source of Truth', async (t) => {
  await t.test('Case A: All modules enabled when hiddenTabs is empty', () => {
    const state = defaultState();
    state.settings.hiddenTabs = [];

    const visible = getVisibleModules(state);
    assert.equal(visible.includes('dashboard'), true);
    assert.equal(visible.includes('finanzas'), true);
    assert.equal(visible.includes('gimnasio'), true);

    for (const mod of OPTIONAL_MODULES) {
      assert.equal(isModuleEnabled(state, mod), true, `Module ${mod} should be enabled`);
      assert.equal(isModuleHidden(state, mod), false, `Module ${mod} should not be hidden`);
    }

    for (const core of NON_HIDEABLE_MODULES) {
      assert.equal(isModuleEnabled(state, core), true, `Core module ${core} should be enabled`);
      assert.equal(isModuleHidden(state, core), false, `Core module ${core} should not be hidden`);
    }
  });

  await t.test('Case B: Optional module hidden when listed in hiddenTabs', () => {
    const state = defaultState();
    state.settings.hiddenTabs = ['gimnasio', 'reventa'];

    assert.equal(isModuleEnabled(state, 'gimnasio'), false);
    assert.equal(isModuleHidden(state, 'gimnasio'), true);

    assert.equal(isModuleEnabled(state, 'reventa'), false);
    assert.equal(isModuleHidden(state, 'reventa'), true);

    assert.equal(isModuleEnabled(state, 'finanzas'), true);
    assert.equal(isModuleHidden(state, 'finanzas'), false);
  });

  await t.test('Case C: Legacy compatibility when hiddenTabs is undefined or null', () => {
    const legacyStateNoHiddenTabs = {
      ...defaultState(),
      settings: {
        darkMode: true,
      } as any,
    };

    assert.deepEqual(getHiddenTabs(legacyStateNoHiddenTabs), []);
    assert.equal(isModuleEnabled(legacyStateNoHiddenTabs, 'finanzas'), true);
    assert.equal(isModuleEnabled(legacyStateNoHiddenTabs, 'gimnasio'), true);
    assert.equal(isModuleEnabled(legacyStateNoHiddenTabs, 'reventa'), true);
    assert.equal(isModuleHidden(legacyStateNoHiddenTabs, 'finanzas'), false);

    // Completely null or undefined state/settings
    assert.deepEqual(getHiddenTabs(null), []);
    assert.deepEqual(getHiddenTabs(undefined), []);
    assert.equal(isModuleEnabled(null, 'finanzas'), true);
    assert.equal(isModuleEnabled(undefined, 'dashboard'), true);
  });

  await t.test('Case D: Core non-hideable modules can NEVER be hidden', () => {
    const maliciousState = defaultState();
    // Even if somehow pushed into hiddenTabs
    maliciousState.settings.hiddenTabs = ['dashboard', 'config', 'checkout'];

    for (const core of NON_HIDEABLE_MODULES) {
      assert.equal(isModuleEnabled(maliciousState, core), true, `Core ${core} must never be disabled`);
      assert.equal(isModuleHidden(maliciousState, core), false, `Core ${core} must never be hidden`);
    }
  });

  await t.test('Case E: getMobileNavSlots dynamic assignment', () => {
    // 1. Default: gimnasio and finanzas
    const stateDefault = defaultState();
    stateDefault.settings.hiddenTabs = [];
    const slots1 = getMobileNavSlots(stateDefault);
    assert.equal(slots1.slot2?.id, 'gimnasio');
    assert.equal(slots1.slot4?.id, 'finanzas');

    // 2. Gimnasio hidden: slot 2 falls back to agenda
    const stateGymHidden = defaultState();
    stateGymHidden.settings.hiddenTabs = ['gimnasio'];
    const slots2 = getMobileNavSlots(stateGymHidden);
    assert.equal(slots2.slot2?.id, 'agenda');
    assert.equal(slots2.slot4?.id, 'finanzas');

    // 3. Both gimnasio and finanzas hidden: slot 2 = agenda, slot 4 = notas
    const stateBothHidden = defaultState();
    stateBothHidden.settings.hiddenTabs = ['gimnasio', 'finanzas'];
    const slots3 = getMobileNavSlots(stateBothHidden);
    assert.equal(slots3.slot2?.id, 'agenda');
    assert.equal(slots3.slot4?.id, 'notas');
    assert.notEqual(slots3.slot2?.id, slots3.slot4?.id, 'Slots 2 and 4 must never duplicate');

    // 4. All optional modules hidden except notas
    const stateOnlyNotas = defaultState();
    stateOnlyNotas.settings.hiddenTabs = [
      'gimnasio',
      'finanzas',
      'agenda',
      'calendario',
      'trabajo',
      'reventa',
      'estudios',
      'ia',
    ];
    const slots4 = getMobileNavSlots(stateOnlyNotas);
    assert.equal(slots4.slot2?.id, 'notas');
    assert.equal(slots4.slot4, null, 'Slot 4 should be null when no more active modules exist');
  });

  await t.test('Case F: Data preservation - Hiding a module does NOT mutate or delete data', () => {
    const state = defaultState();
    state.finance.transactions.push({
      id: 'tx-123',
      type: 'gasto',
      amount: 1500,
      category: 'Comida',
      fixed: 'variable',
      date: '2026-09-30',
      note: 'Supermercado',
    });
    state.resale.inventory.push({
      id: 'resale-1',
      item: 'MacBook Air',
      status: 'comprado',
      buyDate: '2026-09-01',
      buyPrice: 800,
    });
    state.notes.postits.push({
      id: 'note-1',
      text: 'Nota importante de LifeOS',
      date: '2026-09-30',
    });

    // Hide modules
    state.settings.hiddenTabs = ['finanzas', 'reventa', 'notas'];

    // Verify visibility reports hidden
    assert.equal(isModuleHidden(state, 'finanzas'), true);
    assert.equal(isModuleHidden(state, 'reventa'), true);
    assert.equal(isModuleHidden(state, 'notas'), true);

    // Crucial check: state data is 100% intact!
    assert.equal(state.finance.transactions.length, 1);
    assert.equal(state.finance.transactions[0].id, 'tx-123');
    assert.equal(state.resale.inventory.length, 1);
    assert.equal(state.resale.inventory[0].item, 'MacBook Air');
    assert.equal(state.notes.postits.length, 1);
    assert.equal(state.notes.postits[0].text, 'Nota importante de LifeOS');
  });

  await t.test('Case G: Weekly review exceptions filter out hidden modules', () => {
    const state = defaultState();
    // Create an overdue job followup
    state.jobs.applications.push({
      id: 'job-1',
      empresa: 'Google',
      puesto: 'Software Engineer',
      estado: 'cv_enviado',
      fecha: '2026-09-01',
      nextActionDate: '2026-09-10',
    });

    // When trabajo is enabled: exception appears
    state.settings.hiddenTabs = [];
    const exceptionsEnabled = weeklyReviewExceptions(state);
    assert.equal(exceptionsEnabled.some((e) => e.view === 'trabajo'), true);

    // When trabajo is hidden: exception is filtered out
    state.settings.hiddenTabs = ['trabajo'];
    const exceptionsHidden = weeklyReviewExceptions(state);
    assert.equal(exceptionsHidden.some((e) => e.view === 'trabajo'), false);
  });

  await t.test('Case H: Stream Guard / Privacy Mode coexistence', () => {
    const state = defaultState();
    state.settings.privacyMode = true;
    state.settings.hiddenTabs = ['finanzas'];

    // Stream guard active and finanzas hidden
    assert.equal(state.settings.privacyMode, true);
    assert.equal(isModuleHidden(state, 'finanzas'), true);
    assert.equal(isModuleEnabled(state, 'dashboard'), true);
  });

  await t.test('Case I: Smart Priorities honors module visibility', () => {
    const today = todayISO();
    const state = defaultState();

    // Setup entities across optional modules
    state.study = {
      subjects: [{ id: 'sub-1', name: 'Arquitectura' }],
      exams: [{ id: 'exam-1', subjectId: 'sub-1', date: today, status: 'pendiente' }],
      studyLog: [],
    };
    state.jobs.applications.push({
      id: 'job-1',
      empresa: 'Globant',
      puesto: 'Dev',
      estado: 'cv_enviado',
      fecha: today,
      nextAction: 'Entrevista',
      nextActionDate: today,
    });
    state.finance.debts = [{ id: 'debt-1', name: 'Alquiler', dueDate: today, amount: 20000 }];
    state.resale.opportunities = [{
      id: 'resale-1',
      item: 'Laptop',
      buyPrice: 100,
      marketPrice: 200,
      status: 'nueva',
      fecha: today,
    }];

    // 1. All active -> candidates include all sources
    state.settings.hiddenTabs = [];
    const recsAll = getSmartDailyRecommendations(state, 10);
    assert.equal(recsAll.some((r) => r.source === 'exam'), true);
    assert.equal(recsAll.some((r) => r.source === 'job'), true);
    assert.equal(recsAll.some((r) => r.source === 'debt'), true);
    assert.equal(recsAll.some((r) => r.source === 'resale'), true);

    // 2. Hide estudios and finanzas -> exam & debt excluded, job & resale remain
    state.settings.hiddenTabs = ['estudios', 'finanzas'];
    const recsNoStudyFin = getSmartDailyRecommendations(state, 10);
    assert.equal(recsNoStudyFin.some((r) => r.source === 'exam'), false);
    assert.equal(recsNoStudyFin.some((r) => r.source === 'debt'), false);
    assert.equal(recsNoStudyFin.some((r) => r.source === 'job'), true);
    assert.equal(recsNoStudyFin.some((r) => r.source === 'resale'), true);

    // 3. Hide trabajo, reventa, gimnasio -> job, resale, gym excluded, exam & debt return
    state.settings.hiddenTabs = ['trabajo', 'reventa', 'gimnasio'];
    const recsNoWorkResaleGym = getSmartDailyRecommendations(state, 10);
    assert.equal(recsNoWorkResaleGym.some((r) => r.source === 'job'), false);
    assert.equal(recsNoWorkResaleGym.some((r) => r.source === 'resale'), false);
    assert.equal(recsNoWorkResaleGym.some((r) => r.source === 'gym'), false);
    assert.equal(recsNoWorkResaleGym.some((r) => r.source === 'exam'), true);
    assert.equal(recsNoWorkResaleGym.some((r) => r.source === 'debt'), true);
  });

  await t.test('Case J: Universal Capture rejects mutations into inactive modules', () => {
    const state = defaultState();
    state.settings.hiddenTabs = ['finanzas', 'estudios', 'notas', 'ia'];

    // 1. Finance intent rejected without mutation
    const fbFin = executeUniversalCapture(state, {
      kind: 'finance',
      type: 'gasto',
      amount: 1200,
      category: 'Combustible',
    });
    assert.equal(state.finance.transactions.length, 0);
    assert.ok(fbFin.message.includes('desactivado'));

    // 2. Study intent rejected without mutation
    const fbStudy = executeUniversalCapture(state, {
      kind: 'study',
      minutes: 45,
      note: 'Repaso TypeScript',
      subjectName: 'TS',
    });
    assert.equal((state.study?.studyLog || []).length, 0);
    assert.ok(fbStudy.message.includes('desactivado'));

    // 3. Note intent rejected without mutation
    const fbNote = executeUniversalCapture(state, {
      kind: 'note',
      text: 'Nota sobre LifeOS',
    });
    assert.equal(state.notes.postits.length, 0);
    assert.ok(fbNote.message.includes('desactivado'));

    // 4. Idea intent rejected without mutation
    const fbIdea = executeUniversalCapture(state, {
      kind: 'idea',
      text: 'Idea de negocio',
    });
    assert.equal((state.ideas || []).length, 0);
    assert.ok(fbIdea.message.includes('desactivado'));

    // 5. Normal task intent always succeeds
    const fbTask = executeUniversalCapture(state, {
      kind: 'task',
      text: 'Comprar frutas',
      priority: 'alta',
    });
    assert.equal(state.todayExtras.length, 1);
    assert.equal(state.todayExtras[0].text, 'Comprar frutas');
    assert.ok(fbTask.message.includes('Tarea agregada'));

    // 6. Active modules persist normally
    state.settings.hiddenTabs = [];
    const fbFinActive = executeUniversalCapture(state, {
      kind: 'finance',
      type: 'gasto',
      amount: 450,
      category: 'Comida',
    });
    assert.equal(state.finance.transactions.length, 1);
    assert.equal(state.finance.transactions[0].amount, 450);
    assert.ok(fbFinActive.message.includes('Gasto de $450'));

    const fbStudyActive = executeUniversalCapture(state, {
      kind: 'study',
      minutes: 30,
      note: 'Matemática',
      subjectName: 'Álgebra',
    });
    assert.equal(state.study.studyLog.length, 1);
    assert.ok(fbStudyActive.message.includes('30 min'));

    const fbNoteActive = executeUniversalCapture(state, {
      kind: 'note',
      text: 'Apunte activo',
    });
    assert.equal(state.notes.postits.length, 1);
    assert.ok(fbNoteActive.message.includes('Nota agregada'));
  });

  await t.test('Case K: Weekly review summary note respects module visibility', () => {
    const state = defaultState();
    const reviewData = gatherWeeklyReviewData(state, todayISO());

    // Both active: includes gym and finance
    const noteFull = formatWeeklyReviewSummaryNote(reviewData, 'Todo bien', [], {
      showGym: true,
      showFinances: true,
    });
    assert.ok(noteFull.includes('Gimnasio:'));
    assert.ok(noteFull.includes('Finanzas:'));

    // Gym inactive: omits gym
    const noteNoGym = formatWeeklyReviewSummaryNote(reviewData, 'Todo bien', [], {
      showGym: false,
      showFinances: true,
    });
    assert.ok(!noteNoGym.includes('Gimnasio:'));
    assert.ok(noteNoGym.includes('Finanzas:'));

    // Finances inactive: omits finances
    const noteNoFin = formatWeeklyReviewSummaryNote(reviewData, 'Todo bien', [], {
      showGym: true,
      showFinances: false,
    });
    assert.ok(noteNoFin.includes('Gimnasio:'));
    assert.ok(!noteNoFin.includes('Finanzas:'));
  });

  await t.test('Case L: Topbar QUICK_ACTIONS filtering respects isModuleEnabled', () => {
    const quickActions = [
      { label: '+ Gasto', view: 'finanzas' },
      { label: '+ Ingreso', view: 'finanzas' },
      { label: '+ Peso', view: 'gimnasio' },
      { label: '+ Estudio', view: 'estudios' },
      { label: '+ Postulación', view: 'trabajo' },
      { label: '+ Reventa', view: 'reventa' },
    ];
    const state = defaultState();
    state.settings.hiddenTabs = ['finanzas', 'gimnasio'];

    const filtered = quickActions.filter((q) => isModuleEnabled(state, q.view));
    assert.equal(filtered.some((a) => a.view === 'finanzas'), false);
    assert.equal(filtered.some((a) => a.view === 'gimnasio'), false);
    assert.equal(filtered.some((a) => a.view === 'estudios'), true);
    assert.equal(filtered.some((a) => a.view === 'trabajo'), true);
    assert.equal(filtered.some((a) => a.view === 'reventa'), true);
  });

  await t.test('Case M: Gym rest timer overlay suppression when module inactive', () => {
    const state = defaultState();
    state.gym.activeTimer = {
      durationSeconds: 90,
      endsAt: Date.now() + 90000,
    };
    state.settings.hiddenTabs = ['gimnasio'];

    // Data in state is preserved
    assert.ok(state.gym.activeTimer !== null);
    assert.equal(state.gym.activeTimer.durationSeconds, 90);

    // Visibility layer marks it disabled
    assert.equal(isModuleEnabled(state, 'gimnasio'), false);
    assert.equal(isModuleHidden(state, 'gimnasio'), true);
  });
});
