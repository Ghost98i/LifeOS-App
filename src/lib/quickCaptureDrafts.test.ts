import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  parseCaptureDrafts,
  confirmCaptureDraft,
  convertDraftToNote,
  enableModuleForDraft,
  segmentCompoundClauses,
  extractRelativeDate,
} from './quickCaptureDrafts';
import { isModuleEnabled } from './moduleVisibility';

test('LifeOS — Fase 4: Clause segmentation distinguishes compound intents without breaking simple conjunctions', () => {
  // Non-intent conjunctions must remain as a single string
  const single1 = segmentCompoundClauses('comprar pan y leche');
  assert.deepEqual(single1, ['comprar pan y leche']);

  const single2 = segmentCompoundClauses('tom y jerry');
  assert.deepEqual(single2, ['tom y jerry']);

  // Distinct intent conjunctions must be split cleanly
  const multi1 = segmentCompoundClauses('mañana estudiar redes y pagar 1200 de internet');
  assert.equal(multi1.length, 2);
  assert.equal(multi1[0], 'mañana estudiar redes');
  assert.equal(multi1[1], 'pagar 1200 de internet');

  const multi2 = segmentCompoundClauses('pagué 1600 internet y mañana estudiar redes');
  assert.equal(multi2.length, 2);
  assert.equal(multi2[0], 'pagué 1600 internet');
  assert.equal(multi2[1], 'mañana estudiar redes');

  const multi3 = segmentCompoundClauses('1200 nafta; llamar a Juan el lunes');
  assert.equal(multi3.length, 2);
  assert.equal(multi3[0], '1200 nafta');
  assert.equal(multi3[1], 'llamar a Juan el lunes');
});

test('LifeOS — Fase 4: Relative dates are parsed accurately with readable preview labels', () => {
  const baseDate = '2026-10-03'; // Saturday

  const hoyRes = extractRelativeDate('revisar servidores hoy', baseDate);
  assert.equal(hoyRes.date, '2026-10-03');
  assert.equal(hoyRes.dateLabel, 'Hoy');

  const mananaRes = extractRelativeDate('estudiar redes mañana', baseDate);
  assert.equal(mananaRes.date, '2026-10-04');
  assert.ok(mananaRes.dateLabel.includes('Mañana'));

  const pasadoMananaRes = extractRelativeDate('entrenar piernas pasado mañana', baseDate);
  assert.equal(pasadoMananaRes.date, '2026-10-05');
  assert.ok(pasadoMananaRes.dateLabel.includes('Pasado mañana'));

  const ayerRes = extractRelativeDate('ayer gasté 800 en comida', baseDate);
  assert.equal(ayerRes.date, '2026-10-02');
  assert.ok(ayerRes.dateLabel.includes('Ayer'));

  const anteayerRes = extractRelativeDate('anteayer pagué nafta', baseDate);
  assert.equal(anteayerRes.date, '2026-10-01');
  assert.ok(anteayerRes.dateLabel.includes('Anteayer'));

  const in3DaysRes = extractRelativeDate('dentro de 3 días pagar alquiler', baseDate);
  assert.equal(in3DaysRes.date, '2026-10-06');
  assert.ok(in3DaysRes.dateLabel.includes('En 3 días'));

  // Future day calculation: today is Saturday (2026-10-03), upcoming Monday is 2026-10-05
  const lunesRes = extractRelativeDate('llamar a Juan el lunes', baseDate, 'future');
  assert.equal(lunesRes.date, '2026-10-05');
  assert.ok(lunesRes.dateLabel.includes('Lunes'));
});

test('LifeOS — Fase 4: Financial drafts parsing, amounts, currencies, and installments', () => {
  const state = defaultState();
  state.settings.hiddenTabs = []; // All modules ON

  // 1. "1200 nafta"
  const drafts1 = parseCaptureDrafts('1200 nafta', state);
  assert.equal(drafts1.length, 1);
  const d1 = drafts1[0];
  assert.equal(d1.kind, 'finance');
  if (d1.kind === 'finance') {
    assert.equal(d1.amount, 1200);
    assert.equal(d1.type, 'gasto');
    assert.equal(d1.category, 'Transporte');
  }

  // 2. "pagué 800 de internet"
  const drafts2 = parseCaptureDrafts('pagué 800 de internet', state);
  assert.equal(drafts2.length, 1);
  const d2 = drafts2[0];
  assert.equal(d2.kind, 'finance');
  if (d2.kind === 'finance') {
    assert.equal(d2.amount, 800);
    assert.equal(d2.category, 'Admin/Hogar');
  }

  // 3. "6000 en 6 cuotas"
  const drafts3 = parseCaptureDrafts('6000 en 6 cuotas', state);
  assert.equal(drafts3.length, 1);
  const d3 = drafts3[0];
  assert.equal(d3.kind, 'finance');
  if (d3.kind === 'finance') {
    assert.equal(d3.amount, 6000);
    assert.equal(d3.installments, 6);
  }

  // 4. "USD 50" / "50 dólares"
  const drafts4 = parseCaptureDrafts('USD 50 de hosting', state);
  assert.equal(drafts4.length, 1);
  const d4 = drafts4[0];
  assert.equal(d4.kind, 'finance');
  if (d4.kind === 'finance') {
    assert.equal(d4.amount, 50);
    assert.equal(d4.currency, 'USD');
  }

  // 5. "ayer gasté 800 en comida"
  const drafts5 = parseCaptureDrafts('ayer gasté 800 en comida', state, { defaultDate: '2026-10-03' });
  assert.equal(drafts5.length, 1);
  const d5 = drafts5[0];
  assert.equal(d5.kind, 'finance');
  if (d5.kind === 'finance') {
    assert.equal(d5.amount, 800);
    assert.equal(d5.date, '2026-10-02'); // Must NOT be today!
    assert.ok(d5.dateLabel.includes('Ayer'));
  }
});

test('LifeOS — Fase 4: Ambiguous data and no-invent rule for finance', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // "compré algo por 1200" -> has amount, but NO known category. Must NOT invent a category!
  const draftsNoCat = parseCaptureDrafts('compré algo por 1200', state);
  assert.equal(draftsNoCat.length, 1);
  const dNoCat = draftsNoCat[0];
  assert.equal(dNoCat.kind, 'finance');
  if (dNoCat.kind === 'finance') {
    assert.equal(dNoCat.amount, 1200);
    assert.equal(dNoCat.category, undefined, 'No debe inventar categoría si es ambigua');
    assert.ok(dNoCat.missingFields?.includes('category'));
  }

  // "pagué internet" -> has transactional verb and category keyword, but NO amount. Must flag missing amount!
  const draftsNoAmt = parseCaptureDrafts('pagué internet', state);
  assert.equal(draftsNoAmt.length, 1);
  const dNoAmt = draftsNoAmt[0];
  assert.equal(dNoAmt.kind, 'finance');
  if (dNoAmt.kind === 'finance') {
    assert.equal(dNoAmt.amount, undefined, 'No debe inventar importe');
    assert.ok(dNoAmt.missingFields?.includes('amount'));
    assert.ok(dNoAmt.categoryMatched?.includes('Hogar') || dNoAmt.categoryMatched?.includes('internet'));
  }
});

test('LifeOS — Fase 4: Non-financial captures (tasks, notes, ideas, resale, study)', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // Tasks
  const task1 = parseCaptureDrafts('estudiar redes mañana', state, { defaultDate: '2026-10-03' })[0];
  assert.ok(task1.kind === 'study' || task1.kind === 'task');
  assert.equal(task1.targetModule, 'estudios');

  const task2 = parseCaptureDrafts('comprar comida para los gatos', state)[0];
  assert.equal(task2.kind, 'task');
  if (task2.kind === 'task') {
    assert.ok(task2.text.includes('comprar comida para los gatos'));
    assert.equal(task2.priority, 'media');
  }

  const task3 = parseCaptureDrafts('urgente: llamar al contador hoy', state)[0];
  assert.equal(task3.kind, 'task');
  if (task3.kind === 'task') {
    assert.equal(task3.priority, 'alta');
  }

  // Ideas
  const idea1 = parseCaptureDrafts('idea: hacer clips de ATS', state)[0];
  assert.equal(idea1.kind, 'idea');
  if (idea1.kind === 'idea') {
    assert.equal(idea1.text, 'hacer clips de ATS');
    assert.equal(idea1.targetModule, 'ia');
  }

  const idea2 = parseCaptureDrafts('me gustaría algún día hacer una app para organizar viajes', state)[0];
  assert.equal(idea2.kind, 'idea');

  // Notes & Unstructured thoughts
  const note1 = parseCaptureDrafts('hoy fue un día horrible', state)[0];
  assert.equal(note1.kind, 'note');
  assert.equal(note1.targetModule, 'notas');

  const note2 = parseCaptureDrafts('ayer pensé que debería cambiar cómo hago los streams', state)[0];
  assert.equal(note2.kind, 'note');

  // Resale
  const resale1 = parseCaptureDrafts('vendí monitor por 4500', state)[0];
  assert.equal(resale1.kind, 'resale');
  if (resale1.kind === 'resale') {
    assert.equal(resale1.title, 'monitor');
    assert.equal(resale1.price, 4500);
    assert.equal(resale1.targetModule, 'reventa');
  }
});

test('LifeOS — Fase 4: Multi-intent compound capture generates independent drafts', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  const drafts = parseCaptureDrafts('mañana estudiar redes y pagar 1200 de internet', state, {
    defaultDate: '2026-10-03',
  });

  assert.equal(drafts.length, 2, 'Debe generar exactamente 2 borradores');

  const studyOrTask = drafts[0];
  assert.ok(studyOrTask.kind === 'study' || studyOrTask.kind === 'task');
  assert.ok(studyOrTask.rawText.includes('estudiar redes'));

  const finance = drafts[1];
  assert.equal(finance.kind, 'finance');
  if (finance.kind === 'finance') {
    assert.equal(finance.amount, 1200);
    assert.equal(finance.category, 'Admin/Hogar');
  }
});

test('LifeOS — Fase 4: Module Visibility prevents mutations to inactive modules and offers safe fallback', () => {
  const state = defaultState();
  // Disable Finanzas, Estudios, IA, Reventa
  state.settings.hiddenTabs = ['finanzas', 'estudios', 'ia', 'reventa'];

  // Case A: Finanzas OFF
  const financeDrafts = parseCaptureDrafts('1200 nafta', state);
  assert.equal(financeDrafts.length, 1);
  const fDraft = financeDrafts[0];
  assert.equal(fDraft.kind, 'finance');
  assert.equal(fDraft.isModuleEnabled, false, 'Draft debe marcarse como módulo inactivo');

  // Attempting to confirm must throw and make ZERO mutations
  const initialTxCount = state.finance.transactions.length;
  assert.throws(() => {
    confirmCaptureDraft(state, fDraft);
  }, /El módulo finanzas está desactivado/);
  assert.equal(state.finance.transactions.length, initialTxCount, 'No debe mutar Finanzas');

  // Safe fallback 1: Convert to note
  const noteDraft = convertDraftToNote(fDraft);
  assert.equal(noteDraft.kind, 'note');
  confirmCaptureDraft(state, noteDraft);
  assert.equal(state.notes.postits.length, 1, 'Debe guardarse en Notas');

  // Safe fallback 2: Enable module and confirm
  const fDraft2 = parseCaptureDrafts('800 nafta', state)[0];
  enableModuleForDraft(state, fDraft2);
  assert.equal(isModuleEnabled(state, 'finanzas'), true, 'Debe activar el módulo en settings');
  confirmCaptureDraft(state, fDraft2);
  assert.equal(state.finance.transactions.length, initialTxCount + 1, 'Ahora sí debe registrar la transacción');
});

test('LifeOS — Fase 4: Confirmation, inline editing, and discard lifecycle', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // Create a draft
  const drafts = parseCaptureDrafts('1200 nafta', state);
  const draft = drafts[0];
  assert.equal(draft.kind, 'finance');

  // Simulate inline edit of amount and category
  if (draft.kind === 'finance') {
    draft.amount = 1500;
    draft.note = 'Nafta para viaje a Punta del Este';
  }

  // Confirm modified draft
  const res = confirmCaptureDraft(state, draft);
  assert.equal(res.sound, 'coins');
  const lastTx = state.finance.transactions[state.finance.transactions.length - 1];
  assert.equal(lastTx.amount, 1500);
  assert.equal(lastTx.note, 'Nafta para viaje a Punta del Este');

  // Discard simulation (no mutation occurs)
  const taskDraft = parseCaptureDrafts('comprar leche', state)[0];
  assert.ok(taskDraft);
  const initialTaskCount = state.todayExtras.length;
  // Discarding simply omits calling confirmCaptureDraft
  assert.equal(state.todayExtras.length, initialTaskCount);
});
