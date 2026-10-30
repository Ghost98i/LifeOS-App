import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, fmtMoney } from './storage';
import {
  parseCaptureDrafts,
  confirmCaptureDraft,
  canConfirmDraft,
  convertDraftToNote,
  convertDraftToInbox,
  enableModuleForDraft,
  segmentCompoundClauses,
  extractRelativeDate,
  type CaptureDraft,
} from './quickCaptureDrafts';
import { convertInboxItem, addQuickInbox } from './quickCapture';
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

test('LifeOS — Fase 4: Multi-intent compound capture generates independent drafts with semantic fidelity', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [];

  // Case A: Actionable study + completed expense ('pagué 1200 de internet')
  const draftsA = parseCaptureDrafts('mañana estudiar redes y pagué 1200 de internet', state, {
    defaultDate: '2026-10-03',
  });

  assert.equal(draftsA.length, 2, 'Debe generar exactamente 2 borradores');

  const studyOrTaskA = draftsA[0];
  assert.ok(studyOrTaskA.kind === 'study' || studyOrTaskA.kind === 'task');
  assert.ok(studyOrTaskA.rawText.includes('estudiar redes'));

  const financeA = draftsA[1];
  assert.equal(financeA.kind, 'finance');
  if (financeA.kind === 'finance') {
    assert.equal(financeA.amount, 1200);
    assert.equal(financeA.category, 'Admin/Hogar');
  }

  // Case B: Actionable study + pending payment action ('pagar 1200 de internet')
  const draftsB = parseCaptureDrafts('mañana estudiar redes y pagar 1200 de internet', state, {
    defaultDate: '2026-10-03',
  });
  assert.equal(draftsB.length, 2);
  assert.equal(draftsB[1].kind, 'task', 'pagar debe ser una tarea pendiente, no un gasto realizado');
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

test('LifeOS — Fase 4: Truthful capture for resale and work into Inbox without fake records', () => {
  const state = defaultState();
  const initialInboxCount = (state.inbox || []).length;

  // "vendí monitor por 4500"
  const resaleDrafts = parseCaptureDrafts('vendí monitor por 4500', state);
  assert.equal(resaleDrafts.length, 1);
  const rDraft = resaleDrafts[0];
  assert.equal(rDraft.kind, 'resale');

  // Confirmation must route to inbox honestly
  const resResale = confirmCaptureDraft(state, rDraft);
  assert.equal(resResale.sound, 'click');
  assert.ok(resResale.message.includes('Bandeja de Entrada'));
  assert.equal(state.inbox?.length, initialInboxCount + 1);
  assert.equal(state.inbox?.[0].text, 'vendí monitor por 4500');

  // Work draft
  const workDraft: CaptureDraft = {
    id: 'work-1',
    rawText: 'seguimiento entrevista MercadoLibre',
    kind: 'work',
    action: 'MercadoLibre',
    date: '2026-10-04',
    targetModule: 'trabajo',
    isModuleEnabled: true,
  };
  const resWork = confirmCaptureDraft(state, workDraft);
  assert.equal(resWork.sound, 'click');
  assert.ok(resWork.message.includes('Bandeja de Entrada'));
  assert.equal(state.inbox?.length, initialInboxCount + 2);
  assert.equal(state.inbox?.[0].text, 'seguimiento entrevista MercadoLibre');
});

test('LifeOS — Fase 4: Future study and payment intentions parsed as tasks without inventing data', () => {
  const state = defaultState();

  // "estudiar redes mañana" and "mañana estudiar redes"
  const d1 = parseCaptureDrafts('estudiar redes mañana', state, { defaultDate: '2026-10-04' })[0];
  assert.equal(d1.kind, 'task');
  if (d1.kind === 'task') {
    assert.equal(d1.priority, 'media');
    assert.equal(d1.dueDate, '2026-10-05');
  }

  const d2 = parseCaptureDrafts('mañana estudiar redes', state, { defaultDate: '2026-10-04' })[0];
  assert.equal(d2.kind, 'task');
  if (d2.kind === 'task') {
    assert.equal(d2.priority, 'media');
    assert.equal(d2.dueDate, '2026-10-05');
  }

  // Does NOT create studyLog or invent 45 minutes
  assert.equal(state.study?.studyLog?.length || 0, 0);

  // "pagar 1200 internet mañana" -> must be a Task, NOT an immediate balance deduction!
  const dPay = parseCaptureDrafts('pagar 1200 internet mañana', state, { defaultDate: '2026-10-04' })[0];
  assert.equal(dPay.kind, 'task');
  if (dPay.kind === 'task') {
    assert.equal(dPay.priority, 'media');
    assert.equal(dPay.dueDate, '2026-10-05');
  }
  // Confirming it creates a task, zero balance deduction
  const initialBalance = state.finance.accounts[0]?.balance || 0;
  confirmCaptureDraft(state, dPay);
  assert.equal(state.finance.accounts[0]?.balance || 0, initialBalance);
});

test('LifeOS — Fase 4: Gym with schedule parsed as task with time and medium priority with Agenda OFF', () => {
  const state = defaultState();
  state.settings.hiddenTabs = ['agenda']; // Agenda OFF

  const gymDrafts = parseCaptureDrafts('mañana gym 13:30', state, { defaultDate: '2026-10-04' });
  assert.equal(gymDrafts.length, 1);
  const gDraft = gymDrafts[0];
  assert.equal(gDraft.kind, 'task');
  assert.equal(gDraft.isModuleEnabled, true, 'Debe estar habilitada como tarea core');
  if (gDraft.kind === 'task') {
    assert.equal(gDraft.time, '13:30');
    assert.equal(gDraft.priority, 'media');
    assert.equal(gDraft.dueDate, '2026-10-05');
  }

  // Confirming works seamlessly with Agenda OFF
  assert.doesNotThrow(() => {
    confirmCaptureDraft(state, gDraft);
  });
});

test('LifeOS — Fase 4: Strict validation rejects invalid currency, account and archived category', () => {
  const state = defaultState();

  // Incompatible currency
  const foreignDraft: CaptureDraft = {
    id: 'f-1',
    rawText: 'USD 50',
    kind: 'finance',
    type: 'gasto',
    amount: 50,
    currency: 'USD',
    isCurrencyIncompatible: true,
    date: '2026-10-04',
    dateLabel: 'Hoy',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };
  assert.throws(() => confirmCaptureDraft(state, foreignDraft), /Moneda no soportada/);

  // Deleted or non-existent account
  const badAccDraft: CaptureDraft = {
    id: 'f-2',
    rawText: '500 comida en fantasma',
    kind: 'finance',
    type: 'gasto',
    amount: 500,
    currency: 'UYU',
    accountId: 'non-existent-account-id',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };
  assert.throws(() => confirmCaptureDraft(state, badAccDraft), /La cuenta seleccionada no existe/);

  // Archived category
  state.finance.categories = [
    { id: 'cat-active', name: 'Comida', active: true },
    { id: 'cat-archived', name: 'Viajes', active: false },
  ];
  const archivedCatDraft: CaptureDraft = {
    id: 'f-3',
    rawText: '2000 pasaje',
    kind: 'finance',
    type: 'gasto',
    amount: 2000,
    currency: 'UYU',
    category: 'cat-archived',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };
  assert.throws(() => confirmCaptureDraft(state, archivedCatDraft), /La categoría seleccionada está archivada/);
});

test('LifeOS — Fase 4: Stream Guard prevents monetary number leakage in toasts', () => {
  const state = defaultState();
  const draft = parseCaptureDrafts('800 nafta', state)[0];
  assert.equal(draft.kind, 'finance');
  const res = confirmCaptureDraft(state, draft);
  // Toast must NOT contain literal number 800 or $
  assert.doesNotMatch(res.message, /\b800\b/);
  assert.doesNotMatch(res.message, /\$/);
  assert.ok(res.message.includes('Gasto registrado'));
});

test('LifeOS — Fase 4: Guard inbox conversion to project/note when Notas is disabled', () => {
  const state = defaultState();
  state.inbox = [{ id: 'inbox-1', text: 'Aprender Docker', createdAt: new Date().toISOString(), source: 'quick-capture' }];
  state.settings.hiddenTabs = ['notas']; // Notas OFF

  // Converting to note when Notas is OFF must fail
  assert.throws(() => {
    convertInboxItem(state, 'inbox-1', 'nota');
  }, /El módulo Notas está desactivado/);

  // Converting to project when Notas is OFF must fail
  assert.throws(() => {
    convertInboxItem(state, 'inbox-1', 'proyecto');
  }, /El contexto de proyectos requiere que el módulo Notas esté activo/);

  // Item was NOT deleted from inbox due to failure
  assert.equal(state.inbox.length, 1);
});

test('LifeOS — Fase 4: "hoy me siento cansado" parses as reflective note, not a task', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('hoy me siento cansado', state);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, 'note');
  assert.equal(drafts[0].targetModule, 'notas');
  assert.equal((drafts[0] as any).text, 'hoy me siento cansado');
});

test('LifeOS — Fase 4: "nota: llamar al médico y comprar remedios" parses as a single intact note', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('nota: llamar al médico y comprar remedios', state);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, 'note');
  assert.equal((drafts[0] as any).text, 'llamar al médico y comprar remedios');
});

test('LifeOS — Fase 4: canConfirmDraft and confirmCaptureDraft reject category archived after parsing', () => {
  const state = defaultState();
  state.finance.categories = [
    { id: 'cat-super', name: 'Super', active: true },
  ];
  const draft: CaptureDraft = {
    id: 'f-test',
    rawText: '1500 super',
    kind: 'finance',
    type: 'gasto',
    amount: 1500,
    currency: 'UYU',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    category: 'cat-super',
    categoryMatched: 'Super',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };

  // User or system archives category before confirmation
  state.finance.categories = [
    { id: 'cat-super', name: 'Super', active: false },
  ];

  const validation = canConfirmDraft(state, draft);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'Categoría archivada');
  assert.throws(() => confirmCaptureDraft(state, draft), /La categoría seleccionada está archivada/);
});

test('LifeOS — Fase 4: canConfirmDraft and confirmCaptureDraft reject account deleted after parsing', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-itaú', name: 'Banco Itaú', balance: 5000 },
  ];
  const drafts = parseCaptureDrafts('800 nafta itau', state);
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal((draft as any).accountId, 'acc-itaú');

  // Account is deleted in another tab/view before confirmation
  state.finance.accounts = [];

  const validation = canConfirmDraft(state, draft);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'Cuenta inexistente');
  assert.throws(() => confirmCaptureDraft(state, draft), /La cuenta seleccionada no existe/);
});

test('LifeOS — Fase 4: Zero optional modules active: core tasks succeed and inactive modules fallback cleanly to Inbox', () => {
  const state = defaultState();
  // Turn OFF all optional modules
  state.settings.hiddenTabs = ['finanzas', 'gimnasio', 'estudios', 'trabajo', 'agenda', 'calendario', 'notas', 'reventa', 'ia'];

  // Core task always supported
  const taskDrafts = parseCaptureDrafts('comprar comida para los gatos', state);
  assert.equal(taskDrafts.length, 1);
  assert.equal(taskDrafts[0].targetModule, 'dashboard');
  assert.equal(taskDrafts[0].isModuleEnabled, true);
  const taskVal = canConfirmDraft(state, taskDrafts[0]);
  assert.equal(taskVal.valid, true);

  confirmCaptureDraft(state, taskDrafts[0]);
  assert.equal(state.todayExtras.some((t) => t.text.includes('comprar comida para los gatos')), true);

  // Inactive module (finance)
  const finDrafts = parseCaptureDrafts('1200 nafta', state);
  assert.equal(finDrafts.length, 1);
  assert.equal(finDrafts[0].isModuleEnabled, false);
  const finVal = canConfirmDraft(state, finDrafts[0]);
  assert.equal(finVal.valid, false);
  assert.throws(() => confirmCaptureDraft(state, finDrafts[0]), /desactivado/);

  // Fallback to inbox
  const inboxDraft = convertDraftToInbox(finDrafts[0]);
  assert.equal(inboxDraft.targetModule, 'dashboard');
  assert.equal(inboxDraft.isModuleEnabled, true);
  confirmCaptureDraft(state, inboxDraft);
  assert.equal(state.inbox.some((i) => i.text === '1200 nafta'), true);
});

test('LifeOS — Fase 4: Preserving pending drafts on close without duplicating already confirmed drafts', () => {
  const state = defaultState();
  const initialInboxCount = (state.inbox || []).length;
  const initialTaskCount = state.todayExtras.length;

  // Suppose user parsed: "estudiar redes mañana y comprar pan y 1200 nafta"
  const draft1: CaptureDraft = {
    id: 'd-1',
    rawText: 'estudiar redes mañana',
    kind: 'task',
    text: 'estudiar redes mañana',
    priority: 'media',
    targetModule: 'dashboard',
    isModuleEnabled: true,
  };
  const draft2: CaptureDraft = {
    id: 'd-2',
    rawText: 'comprar pan',
    kind: 'task',
    text: 'comprar pan',
    priority: 'media',
    targetModule: 'dashboard',
    isModuleEnabled: true,
  };
  const draft3: CaptureDraft = {
    id: 'd-3',
    rawText: '1200 nafta',
    kind: 'finance',
    type: 'gasto',
    amount: 1200,
    currency: 'UYU',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    category: 'Transporte',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };

  let activeDrafts = [draft1, draft2, draft3];

  // User confirms draft1
  confirmCaptureDraft(state, draft1);
  activeDrafts = activeDrafts.filter((d) => d.id !== draft1.id);
  assert.equal(activeDrafts.length, 2);
  assert.equal(state.todayExtras.length, initialTaskCount + 1);

  // User now closes modal with draft2 and draft3 pending:
  // "Guardar en Bandeja" action saves ONLY remaining pending drafts
  for (const remaining of activeDrafts) {
    addQuickInbox(state, remaining.rawText, 'quick-capture');
  }

  // Verify:
  // - draft1 was saved as a task once (not in inbox)
  // - draft2 and draft3 are in inbox once
  // - Nothing is duplicated
  assert.equal(state.todayExtras.filter((t) => t.text.includes('estudiar redes')).length, 1);
  assert.equal(state.inbox.filter((i) => i.text === 'estudiar redes mañana').length, 0);
  assert.equal(state.inbox.filter((i) => i.text === 'comprar pan').length, 1);
  assert.equal(state.inbox.filter((i) => i.text === '1200 nafta').length, 1);
  assert.equal(state.inbox.length, initialInboxCount + 2);
});

test('LifeOS — Fase 4: Numerical fidelity: 500.50 produces exactly 500.50 in parse, draft and transaction', () => {
  const state = defaultState();
  const bankAcc = state.finance.accounts.find((a) => a.name.toLowerCase().includes('banco'));
  assert.ok(bankAcc);
  const initialBalance = bankAcc.balance;

  const drafts = parseCaptureDrafts('500.50 comida banco', state);
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'finance');
  assert.equal((draft as any).amount, 500.50);

  confirmCaptureDraft(state, draft);

  const lastTx = state.finance.transactions[state.finance.transactions.length - 1];
  assert.equal(lastTx.amount, 500.50);
  assert.equal(bankAcc.balance, initialBalance - 500.50);
});

test('LifeOS — Fase 4: Local persistence failure & safe retry prevents duplicate mutations', () => {
  let inMemoryState = defaultState();
  const initialTxCount = inMemoryState.finance.transactions.length;
  const initialBalance = inMemoryState.finance.accounts[0].balance;

  const draft = parseCaptureDrafts('1200 nafta', inMemoryState)[0];

  // Simulated updateState contract
  let simulateStorageFail = true;
  const updateState = (updater: (draft: typeof inMemoryState) => void): boolean => {
    const clone = structuredClone(inMemoryState);
    updater(clone);
    if (simulateStorageFail) {
      // Storage failed (e.g. quota exceeded)
      // Must NOT commit to inMemoryState
      return false;
    }
    inMemoryState = clone;
    return true;
  };

  // Attempt 1: Storage fails
  let trayDrafts = [draft];
  const attempt1Saved = updateState((s) => {
    confirmCaptureDraft(s, trayDrafts[0]);
  });

  assert.equal(attempt1Saved, false);
  // Tray must retain draft when saved === false
  if (attempt1Saved) {
    trayDrafts = [];
  }
  assert.equal(trayDrafts.length, 1);
  // inMemoryState must NOT be modified
  assert.equal(inMemoryState.finance.transactions.length, initialTxCount);
  assert.equal(inMemoryState.finance.accounts[0].balance, initialBalance);

  // Attempt 2: Storage fixed, retry confirmation
  simulateStorageFail = false;
  const attempt2Saved = updateState((s) => {
    confirmCaptureDraft(s, trayDrafts[0]);
  });

  assert.equal(attempt2Saved, true);
  if (attempt2Saved) {
    trayDrafts = trayDrafts.filter((d) => d.id !== draft.id);
  }
  assert.equal(trayDrafts.length, 0);

  // Verify: Exactly 1 transaction added, balance deducted exactly once
  assert.equal(inMemoryState.finance.transactions.length, initialTxCount + 1);
  assert.equal(inMemoryState.finance.accounts[0].balance, initialBalance - 1200);
});

test('LifeOS — Fase 4: Batch confirmation (Confirm All) retains invalid or failed drafts', () => {
  const state = defaultState();
  state.finance.categories = [
    { id: 'cat-ok', name: 'Comida', active: true },
    { id: 'cat-arch', name: 'Vieja', active: false },
  ];

  const validDraft: CaptureDraft = {
    id: 'd-ok',
    rawText: 'comprar pan',
    kind: 'task',
    text: 'comprar pan',
    priority: 'media',
    targetModule: 'dashboard',
    isModuleEnabled: true,
  };
  const foreignDraft: CaptureDraft = {
    id: 'd-usd',
    rawText: 'USD 50 de hosting',
    kind: 'finance',
    type: 'gasto',
    amount: 50,
    currency: 'USD',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    isCurrencyIncompatible: true,
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };
  const archivedDraft: CaptureDraft = {
    id: 'd-arch',
    rawText: '400 algo',
    kind: 'finance',
    type: 'gasto',
    amount: 400,
    currency: 'UYU',
    date: '2026-10-04',
    dateLabel: 'Hoy',
    category: 'cat-arch',
    targetModule: 'finanzas',
    isModuleEnabled: true,
  };

  let draftsInTray = [validDraft, foreignDraft, archivedDraft];

  // Confirm all simulation
  const confirmedIds = new Set<string>();
  for (const d of draftsInTray) {
    if (canConfirmDraft(state, d).valid) {
      try {
        confirmCaptureDraft(state, d);
        confirmedIds.add(d.id);
      } catch {
        // fail
      }
    }
  }

  // Filter only successfully confirmed
  draftsInTray = draftsInTray.filter((d) => !confirmedIds.has(d.id));

  // Only validDraft confirmed, foreignDraft and archivedDraft remain in tray!
  assert.equal(confirmedIds.has('d-ok'), true);
  assert.equal(confirmedIds.has('d-usd'), false);
  assert.equal(confirmedIds.has('d-arch'), false);
  assert.equal(draftsInTray.length, 2);
  assert.equal(draftsInTray[0].id, 'd-usd');
  assert.equal(draftsInTray[1].id, 'd-arch');
});

test('REGRESSION: "gaste 930 pesos" maintains numeric value 930 and does not duplicate currency symbol', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('gaste 930 pesos', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'finance');
  if (draft.kind === 'finance') {
    assert.equal(draft.amount, 930);
    assert.equal(draft.type, 'gasto');
    assert.equal(draft.currency, 'UYU');
    // Storage fmtMoney produces '$U 930'
    const formatted = fmtMoney(draft.amount);
    assert.equal(formatted, '$U 930');
    // Ensure formatting does not produce double '$U $U'
    assert.equal(formatted.includes('$U $U'), false);

    // Persisting the draft creates transaction and updates balance
    const initialBalance = (state.finance?.accounts || []).reduce((acc, a) => acc + (a.balance || 0), 0);
    confirmCaptureDraft(state, draft);
    const updatedBalance = (state.finance?.accounts || []).reduce((acc, a) => acc + (a.balance || 0), 0);
    assert.equal(updatedBalance, initialBalance - 930);
    const tx = state.finance?.transactions.find((t) => t.amount === 930);
    assert.ok(tx);
    assert.equal(tx?.type, 'gasto');
  }
});

test('REGRESSION: "estudiar redes el 25 de octubre" resolves explicit date 2026-10-25 as Task and persists it', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('estudiar redes el 25 de octubre', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.dueDate, '2026-10-25');
    assert.equal(draft.dueDateLabel, '25 de Octubre');
    assert.equal(draft.text.toLowerCase().includes('estudiar redes'), true);
    assert.equal(draft.ambiguityWarning, undefined);

    confirmCaptureDraft(state, draft);
    const savedTask = state.todayExtras.find((t) => t.text.toLowerCase().includes('estudiar redes'));
    assert.ok(savedTask);
    assert.equal(savedTask?.date, '2026-10-25');
  }
});

test('REGRESSION: "ir a comer con la familia el 25 de diciembre" resolves explicit date 2026-12-25', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('ir a comer con la familia el 25 de diciembre', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.dueDate, '2026-12-25');
    assert.equal(draft.dueDateLabel, '25 de Diciembre');
    assert.equal(draft.text.toLowerCase().includes('ir a comer con la familia'), true);
  }
});

test('REGRESSION: "examen el lunes" preserves day-of-week parsing', () => {
  const state = defaultState();
  // 2026-10-04 is a Sunday; next Monday is 2026-10-05
  const drafts = parseCaptureDrafts('examen el lunes', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.dueDate, '2026-10-05');
    assert.equal(draft.dueDateLabel?.startsWith('Lunes'), true);
  }
});

test('REGRESSION: invalid calendar date ("31 de febrero") does NOT fall to Hoy; flags ambiguity and blocks confirmation', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('estudiar redes el 31 de febrero', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.dueDate, undefined);
    assert.notEqual(draft.dueDateLabel, 'Hoy');
    assert.ok(draft.ambiguityWarning);
    assert.equal(canConfirmDraft(state, draft).valid, false);
    assert.equal(canConfirmDraft(state, draft).reason, 'Fecha o datos ambiguos requieren revisión');
  }
});

test('REGRESSION: "Debo 5939 pesos a Jorge pagar el 25 de septiembre" flags review when date is in the past without explicit year', () => {
  const state = defaultState();
  const initialBalance = (state.finance?.accounts || []).reduce((acc, a) => acc + (a.balance || 0), 0);
  const initialTxCount = state.finance?.transactions.length || 0;

  // referenceDate is 2026-10-04, 25 de septiembre is in the past
  const drafts = parseCaptureDrafts('Debo 5939 pesos a Jorge pagar el 25 de septiembre', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];

  // Must be a Task representing the commitment, with ambiguityWarning for review since date is past
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.dueDate, '2026-09-25');
    assert.ok(draft.dueDateLabel?.includes('25 de Septiembre'));
    assert.ok(draft.ambiguityWarning);
    assert.equal(canConfirmDraft(state, draft).valid, false, 'Requiere revisión antes de confirmar');

    // No finance transaction or balance change occurred
    const finalBalance = (state.finance?.accounts || []).reduce((acc, a) => acc + (a.balance || 0), 0);
    assert.equal(finalBalance, initialBalance);
    assert.equal(state.finance?.transactions.length, initialTxCount);
  }
});

test('REGRESSION: Explicit date without year: future date resolves cleanly, past date requires review, explicit year is authoritative', () => {
  const state = defaultState();
  const ref = '2026-10-04';

  // 1. Future date in same year: 25 de octubre (posterior a 4 de octubre) resolves normally without warning
  const dFuture = parseCaptureDrafts('estudiar redes el 25 de octubre', state, { defaultDate: ref })[0];
  assert.equal(dFuture.kind, 'task');
  if (dFuture.kind === 'task') {
    assert.equal(dFuture.dueDate, '2026-10-25');
    assert.equal(dFuture.ambiguityWarning, undefined);
    assert.equal(canConfirmDraft(state, dFuture).valid, true);
  }

  // 2. Past date in same year without explicit year: 15 de agosto (anterior a 4 de octubre) requires review
  const dPast = parseCaptureDrafts('pagar patente el 15 de agosto', state, { defaultDate: ref })[0];
  assert.equal(dPast.kind, 'task');
  if (dPast.kind === 'task') {
    assert.equal(dPast.dueDate, '2026-08-15');
    assert.ok(dPast.ambiguityWarning);
    assert.equal(canConfirmDraft(state, dPast).valid, false);
  }

  // 3. Authoritative explicit year: "el 15 de agosto de 2027" resolves without ambiguity warning
  const dAuthoritative = parseCaptureDrafts('pagar patente el 15 de agosto de 2027', state, { defaultDate: ref })[0];
  assert.equal(dAuthoritative.kind, 'task');
  if (dAuthoritative.kind === 'task') {
    assert.equal(dAuthoritative.dueDate, '2027-08-15');
    assert.equal(dAuthoritative.ambiguityWarning, undefined);
    assert.equal(canConfirmDraft(state, dAuthoritative).valid, true);
  }
});

test('REGRESSION: "peso 105kg" routes to safe Inbox free-capture and does NOT invent a Task or mutate gym', () => {
  const state = defaultState();
  const initialTaskCount = state.todayExtras.length;
  const initialGymWeightCount = state.gym?.weight?.length || 0;

  const drafts = parseCaptureDrafts('peso 105kg', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];

  // Must be InboxDraft, preserving exact raw text
  assert.equal(draft.kind, 'inbox');
  if (draft.kind === 'inbox') {
    assert.equal(draft.text, 'peso 105kg');
    assert.equal(draft.targetModule, 'dashboard');
    assert.equal(draft.isModuleEnabled, true);

    const confirmationResult = confirmCaptureDraft(state, draft);
    assert.ok(confirmationResult.message.toLowerCase().includes('bandeja'));

    // Confirm that no Task was created and no Gym state was mutated
    assert.equal(state.todayExtras.length, initialTaskCount);
    assert.equal(state.gym?.weight?.length || 0, initialGymWeightCount);

    // Confirm saved to inbox
    assert.ok(state.inbox?.some((i) => i.text === 'peso 105kg'));
  }
});

test('REGRESSION: Genuine actionable tasks continue producing TaskDraft', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('comprar leche en el súper', state);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, 'task');
  if (drafts[0].kind === 'task') {
    assert.ok(drafts[0].text.includes('comprar leche'));
  }
});

/* =========================================================================
   FASE 4.2: MULTI-INTENT, AMBIGÜEDAD Y CAPTURA LIBRE
   ========================================================================= */

test('FASE 4.2: Multi-intent real genera intenciones independientes (Finanzas + Tarea)', () => {
  const state = defaultState();
  const input = 'pagué 1600 internet y mañana estudiar redes';
  const drafts = parseCaptureDrafts(input, state, { defaultDate: '2026-10-04' });

  assert.equal(drafts.length, 2);

  // Draft 1: Finance
  const d1 = drafts[0];
  assert.equal(d1.kind, 'finance');
  assert.equal(d1.originalInput, input);
  if (d1.kind === 'finance') {
    assert.equal(d1.amount, 1600);
    assert.equal(d1.type, 'gasto');
    assert.ok(d1.categoryMatched?.toLowerCase().includes('hogar') || d1.categoryMatched?.toLowerCase().includes('internet'));
  }

  // Draft 2: Task
  const d2 = drafts[1];
  assert.equal(d2.kind, 'task');
  assert.equal(d2.originalInput, input);
  if (d2.kind === 'task') {
    assert.ok(d2.text.toLowerCase().includes('estudiar redes'));
    assert.equal(d2.dueDate, '2026-10-05');
  }

  // Independent confirmation & failure simulation
  // Disabling Finanzas blocks only d1; d2 remains valid and confirms smoothly
  state.settings.hiddenTabs = ['finanzas'];
  d1.isModuleEnabled = false;
  assert.equal(canConfirmDraft(state, d1).valid, false);
  assert.equal(canConfirmDraft(state, d2).valid, true);

  const confirmRes2 = confirmCaptureDraft(state, d2);
  assert.ok(confirmRes2.message.toLowerCase().includes('tarea'));
  assert.ok(state.todayExtras.some((t) => t.text.toLowerCase().includes('estudiar redes')));
});

test('FASE 4.2: Conjunción interna ("y") NO sobre-segmenta enumeraciones ni prefijos explícitos', () => {
  const state = defaultState();

  // 1. "comprar pan y leche" -> 1 sola tarea
  const d1 = parseCaptureDrafts('comprar pan y leche', state);
  assert.equal(d1.length, 1);
  assert.equal(d1[0].kind, 'task');
  if (d1[0].kind === 'task') {
    assert.equal(d1[0].text, 'comprar pan y leche');
  }

  // 2. "nota: llamar al médico y comprar remedios" -> 1 sola nota íntegra
  const d2 = parseCaptureDrafts('nota: llamar al médico y comprar remedios', state);
  assert.equal(d2.length, 1);
  assert.equal(d2[0].kind, 'note');
  if (d2[0].kind === 'note') {
    assert.equal(d2[0].text, 'llamar al médico y comprar remedios');
  }

  // 3. "idea: hacer clips de ATS y probar otro formato" -> 1 sola idea íntegra
  const d3 = parseCaptureDrafts('idea: hacer clips de ATS y probar otro formato', state);
  assert.equal(d3.length, 1);
  assert.equal(d3[0].kind, 'idea');
  if (d3[0].kind === 'idea') {
    assert.equal(d3[0].text, 'hacer clips de ATS y probar otro formato');
  }

  // 4. "ir a comer con mamá y papá el domingo" -> 1 solo borrador
  const d4 = parseCaptureDrafts('ir a comer con mamá y papá el domingo', state, { defaultDate: '2026-10-04' });
  assert.equal(d4.length, 1);
  assert.equal(d4[0].kind, 'task');
  if (d4[0].kind === 'task') {
    assert.ok(d4[0].text.toLowerCase().includes('ir a comer con mamá y papá'));
  }
});

test('FASE 4.2: Conectores compuestos ("y después", "y luego") dividen cláusulas con acciones reales', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('comprar comida y después llamar a Juan', state);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].kind, 'task');
  assert.equal(drafts[1].kind, 'task');
  if (drafts[0].kind === 'task' && drafts[1].kind === 'task') {
    assert.equal(drafts[0].text, 'comprar comida');
    assert.equal(drafts[1].text, 'llamar a Juan');
  }
});

test('FASE 4.2: Ambigüedad real ("mañana Juan") no inventa llamada, reunión ni tarea arbitraria', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('mañana Juan', state, { defaultDate: '2026-10-04' });
  assert.equal(drafts.length, 1);
  const draft = drafts[0];

  // Must NOT be a TaskDraft
  assert.equal(draft.kind, 'inbox');
  if (draft.kind === 'inbox') {
    assert.equal(draft.text, 'mañana Juan');
    assert.ok(draft.ambiguityWarning);
    assert.ok(draft.ambiguityWarning.includes('sin acción definida'));
  }
});

test('FASE 4.2: "Juan 1600" no inventa gasto financiero sin evidencia contextual clara', () => {
  const state = defaultState();
  // "Juan" is not a category, not an account, and there is no $ or transactional verb
  const drafts = parseCaptureDrafts('Juan 1600', state);
  assert.equal(drafts.length, 1);
  const draft = drafts[0];

  // Must NOT be finance
  assert.notEqual(draft.kind, 'finance');
  assert.equal(draft.kind, 'inbox');
  if (draft.kind === 'inbox') {
    assert.equal(draft.text, 'Juan 1600');
  }
});

test('FASE 4.2: Captura libre para hechos, reflexiones y estados ("hoy me siento cansado", "el auto hizo un ruido raro")', () => {
  const state = defaultState();

  const inputs = [
    'hoy me siento cansado',
    'me siento cansado',
    'hoy fue un día horrible',
    'el auto hizo un ruido raro',
    'Juan está pensando mudarse',
  ];

  for (const text of inputs) {
    const drafts = parseCaptureDrafts(text, state);
    assert.equal(drafts.length, 1);
    // Must be note (if notas enabled) or inbox, never a task
    assert.ok(drafts[0].kind === 'note' || drafts[0].kind === 'inbox');
    assert.notEqual(drafts[0].kind, 'task');
  }
});

test('FASE 4.2: Información financiera incompleta ("compré algo por 1200") no inventa categoría', () => {
  const state = defaultState();
  const drafts = parseCaptureDrafts('compré algo por 1200', state);
  assert.equal(drafts.length, 1);
  const draft = drafts[0];

  assert.equal(draft.kind, 'finance');
  if (draft.kind === 'finance') {
    assert.equal(draft.amount, 1200);
    // Category must be undefined / Sin categoría, flagged in missingFields
    assert.equal(draft.category, undefined);
    assert.ok(draft.missingFields?.includes('category'));
  }
});

/* =========================================================================
   ELIMINACIÓN DE FALLBACK AMBIGUO A TAREA (ACCIÓN VS INFORMACIÓN)
   ========================================================================= */

test('ACCION vs INFORMACION: Entradas con evidencia accionable generan TaskDraft', () => {
  const state = defaultState();

  // 1. "comprar leche"
  const d1 = parseCaptureDrafts('comprar leche', state)[0];
  assert.equal(d1.kind, 'task');
  if (d1.kind === 'task') {
    assert.equal(d1.text, 'comprar leche');
  }

  // 2. "llamar a Juan mañana"
  const d2 = parseCaptureDrafts('llamar a Juan mañana', state, { defaultDate: '2026-10-04' })[0];
  assert.equal(d2.kind, 'task');
  if (d2.kind === 'task') {
    assert.equal(d2.text, 'llamar a Juan');
    assert.equal(d2.dueDate, '2026-10-05');
  }

  // 3. "revisar el CV"
  const d3 = parseCaptureDrafts('revisar el CV', state)[0];
  assert.equal(d3.kind, 'task');
  if (d3.kind === 'task') {
    assert.equal(d3.text, 'revisar el CV');
  }

  // 4. "tengo que mandar el trabajo"
  const d4 = parseCaptureDrafts('tengo que mandar el trabajo', state)[0];
  assert.equal(d4.kind, 'task');
  if (d4.kind === 'task') {
    assert.equal(d4.text, 'mandar el trabajo');
  }

  // 5. "urgente: pagar Antel"
  const d5 = parseCaptureDrafts('urgente: pagar Antel', state)[0];
  assert.equal(d5.kind, 'task');
  if (d5.kind === 'task') {
    assert.equal(d5.priority, 'alta');
    assert.ok(d5.text.includes('pagar Antel'));
  }
});

test('ACCION vs INFORMACION: Frases meramente informativas, factuales o ambiguas NO inventan tarea', () => {
  const state = defaultState();

  const nonActionableInputs = [
    'Juan está raro últimamente',
    'la computadora hace un ruido',
    'tengo 3 gatos',
    'el alquiler subió',
    'mañana algo con Jorge',
  ];

  for (const text of nonActionableInputs) {
    const drafts = parseCaptureDrafts(text, state, { defaultDate: '2026-10-04' });
    assert.equal(drafts.length, 1);
    const d = drafts[0];
    assert.notEqual(d.kind, 'task', `"${text}" NO debe convertirse en TaskDraft`);
    assert.equal(d.kind, 'inbox', `"${text}" debe preservarse en InboxDraft`);
    if (d.kind === 'inbox') {
      assert.equal(d.text, text, `"${text}" debe conservar el texto original íntegro`);
      assert.equal(d.targetModule, 'dashboard');
      assert.equal(d.isModuleEnabled, true);
    }
  }
});

test('ACCION vs INFORMACION: Multi-intent mixto preserva tarea y captura ambigua por separado', () => {
  const state = defaultState();
  const input = 'comprar comida y después Juan está raro';
  const drafts = parseCaptureDrafts(input, state);

  assert.equal(drafts.length, 2, 'Debe segmentar en exactamente 2 intenciones');

  // Clause 1: Task
  assert.equal(drafts[0].kind, 'task');
  if (drafts[0].kind === 'task') {
    assert.equal(drafts[0].text, 'comprar comida');
  }

  // Clause 2: Inbox (ambiguous / non-actionable)
  assert.equal(drafts[1].kind, 'inbox');
  if (drafts[1].kind === 'inbox') {
    assert.equal(drafts[1].text, 'Juan está raro');
  }

  // Confirming Inbox does not depend on optional modules and mutates only state.inbox
  const initialTaskCount = state.todayExtras.length;
  const initialInboxCount = (state.inbox || []).length;

  confirmCaptureDraft(state, drafts[1]);
  assert.equal(state.todayExtras.length, initialTaskCount, 'No debe crear tareas en el estado');
  assert.equal(state.inbox?.length, initialInboxCount + 1, 'Debe guardar exactamente en inbox');
});

/* =========================================================================
   QUICK CAPTURE 2.1: PAYMENT INTENT, CONFIRMATION & PRIVACY INTEGRITY TESTS
   ========================================================================= */

test('QC 2.1: "pagar 9300 a Jorge" without date routes as TaskDraft with NO invented due date and zero balance deduction', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  const drafts = parseCaptureDrafts('pagar 9300 a Jorge', state, { defaultDate: refDate });
  assert.equal(drafts.length, 1);

  const draft = drafts[0];
  assert.equal(draft.kind, 'task', 'Debe ser interpretado como tarea pendiente, nunca como gasto realizado');
  if (draft.kind === 'task') {
    assert.equal(draft.text, 'pagar 9300 a Jorge', 'Debe conservar la acción, el monto y el destinatario');
    assert.equal(draft.dueDate, undefined, 'No debe inventar una fecha de vencimiento');
    assert.equal(draft.dueDateLabel, undefined, 'No debe etiquetar como Hoy');
  }

  // Confirmation must create a task with no due date and leave finance untouched
  const initialBalance = state.finance.accounts[0]?.balance || 0;
  const initialTxCount = state.finance.transactions.length;
  const initialTaskCount = state.todayExtras.length;

  const result = confirmCaptureDraft(state, draft);
  assert.ok(result.message.includes('Tarea creada'));

  // Finance untouched
  assert.equal(state.finance.accounts[0]?.balance || 0, initialBalance, 'El saldo no debe descontarse');
  assert.equal(state.finance.transactions.length, initialTxCount, 'No debe crear ninguna transacción');

  // Task created with undefined dueDate
  assert.equal(state.todayExtras.length, initialTaskCount + 1);
  const createdTask = state.todayExtras[state.todayExtras.length - 1];
  assert.equal(createdTask.text, 'pagar 9300 a Jorge');
  assert.equal(createdTask.dueDate, undefined, 'dueDate en TodayExtra debe ser undefined');
});

test('QC 2.1: "pagar 9300 a Jorge el 25 de octubre" routes as TaskDraft with exact future due date', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  const drafts = parseCaptureDrafts('pagar 9300 a Jorge el 25 de octubre', state, { defaultDate: refDate });
  assert.equal(drafts.length, 1);

  const draft = drafts[0];
  assert.equal(draft.kind, 'task');
  if (draft.kind === 'task') {
    assert.equal(draft.text, 'pagar 9300 a Jorge');
    assert.equal(draft.dueDate, '2026-10-25');
    assert.ok(draft.dueDateLabel?.includes('25 de Octubre'));
  }

  const initialTxCount = state.finance.transactions.length;
  confirmCaptureDraft(state, draft);
  assert.equal(state.finance.transactions.length, initialTxCount, 'No debe crear transacción');

  const createdTask = state.todayExtras[state.todayExtras.length - 1];
  assert.equal(createdTask.dueDate, '2026-10-25');
});

test('QC 2.1: "pagué 9300 a Jorge" remains an effective financial expense', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  const drafts = parseCaptureDrafts('pagué 9300 a Jorge', state, { defaultDate: refDate });
  assert.equal(drafts.length, 1);

  const draft = drafts[0];
  assert.equal(draft.kind, 'finance', 'pagué debe ser un gasto financiero');
  if (draft.kind === 'finance') {
    assert.equal(draft.type, 'gasto');
    assert.equal(draft.amount, 9300);
  }
});

test('QC 2.1: Past tense expressions ("ayer pagué 9300 a Jorge", "gasté 800 en internet") preserve financial movements', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  // "ayer pagué 9300 a Jorge"
  const draftsA = parseCaptureDrafts('ayer pagué 9300 a Jorge', state, { defaultDate: refDate });
  assert.equal(draftsA.length, 1);
  assert.equal(draftsA[0].kind, 'finance');
  if (draftsA[0].kind === 'finance') {
    assert.equal(draftsA[0].amount, 9300);
    assert.equal(draftsA[0].date, '2026-10-15');
  }

  // "gasté 800 en internet"
  const draftsB = parseCaptureDrafts('gasté 800 en internet', state, { defaultDate: refDate });
  assert.equal(draftsB.length, 1);
  assert.equal(draftsB[0].kind, 'finance');
  if (draftsB[0].kind === 'finance') {
    assert.equal(draftsB[0].amount, 800);
  }
});

test('QC 2.1: Debts and commitments ("debo pagar 9300 a Jorge", "tengo que pagar la luz", "pago de internet") route as tasks without invented due date', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  // "debo pagar 9300 a Jorge"
  const d1 = parseCaptureDrafts('debo pagar 9300 a Jorge', state, { defaultDate: refDate })[0];
  assert.equal(d1.kind, 'task');
  if (d1.kind === 'task') {
    assert.equal(d1.dueDate, undefined);
    assert.equal(d1.dueDateLabel, undefined);
  }

  // "tengo que pagar la luz"
  const d2 = parseCaptureDrafts('tengo que pagar la luz', state, { defaultDate: refDate })[0];
  assert.equal(d2.kind, 'task');
  if (d2.kind === 'task') {
    assert.equal(d2.dueDate, undefined);
    assert.equal(d2.dueDateLabel, undefined);
  }

  // Ambiguous "pago de internet" (no past verb) -> conservative handling as task, not completed expense
  const d3 = parseCaptureDrafts('pago de internet', state, { defaultDate: refDate })[0];
  assert.equal(d3.kind, 'task', 'pago de internet debe tratarse como tarea/compromiso pendiente');
});

test('QC 2.1: Explicit dates on tasks ("examen el 30 de octubre") resolve to explicit day, while general tasks ("comprar leche") have no invented due date', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  // "examen el 30 de octubre"
  const dExam = parseCaptureDrafts('examen el 30 de octubre', state, { defaultDate: refDate })[0];
  assert.equal(dExam.kind, 'task');
  if (dExam.kind === 'task') {
    assert.equal(dExam.dueDate, '2026-10-30');
    assert.ok(dExam.dueDateLabel?.includes('30 de Octubre'));
  }

  // "comprar leche" (no date)
  const dMilk = parseCaptureDrafts('comprar leche', state, { defaultDate: refDate })[0];
  assert.equal(dMilk.kind, 'task');
  if (dMilk.kind === 'task') {
    assert.equal(dMilk.dueDate, undefined, 'comprar leche no debe tener dueDate');
    assert.equal(dMilk.dueDateLabel, undefined, 'comprar leche no debe tener dueDateLabel');
  }
});

test('QC 2.2: Matriz completa de precisión semántica financiera (Ingresos, Gastos, Tareas de compra, Ahorros, Negaciones)', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  // 1. "gané 500 pesos por arbitrar un partido" -> Ingreso $U 500
  const dGane = parseCaptureDrafts('gané 500 pesos por arbitrar un partido', state, { defaultDate: refDate })[0];
  assert.equal(dGane.kind, 'finance');
  if (dGane.kind === 'finance') {
    assert.equal(dGane.type, 'ingreso', 'gané debe clasificarse como ingreso, no como gasto');
    assert.equal(dGane.amount, 500);
  }

  // 2. "cobré 1500 pesos por un trabajo" -> Ingreso $U 1.500
  const dCobre = parseCaptureDrafts('cobré 1500 pesos por un trabajo', state, { defaultDate: refDate })[0];
  assert.equal(dCobre.kind, 'finance');
  if (dCobre.kind === 'finance') {
    assert.equal(dCobre.type, 'ingreso', 'cobré debe clasificarse como ingreso');
    assert.equal(dCobre.amount, 1500);
  }

  // 3. "recibí 800 pesos por un servicio" -> Ingreso $U 800
  const dRecibi = parseCaptureDrafts('recibí 800 pesos por un servicio', state, { defaultDate: refDate })[0];
  assert.equal(dRecibi.kind, 'finance');
  if (dRecibi.kind === 'finance') {
    assert.equal(dRecibi.type, 'ingreso', 'recibí debe clasificarse como ingreso');
    assert.equal(dRecibi.amount, 800);
  }

  // 4. "pagué 800 pesos de internet" -> Gasto $U 800
  const dPague = parseCaptureDrafts('pagué 800 pesos de internet', state, { defaultDate: refDate })[0];
  assert.equal(dPague.kind, 'finance');
  if (dPague.kind === 'finance') {
    assert.equal(dPague.type, 'gasto');
    assert.equal(dPague.amount, 800);
  }

  // 5. "compré 250 pesos de manzana" -> Gasto $U 250 (acción pasada)
  const dCompre = parseCaptureDrafts('compré 250 pesos de manzana', state, { defaultDate: refDate })[0];
  assert.equal(dCompre.kind, 'finance');
  if (dCompre.kind === 'finance') {
    assert.equal(dCompre.type, 'gasto');
    assert.equal(dCompre.amount, 250);
  }

  // 6. "comprar 250 pesos de manzana" -> Tarea pendiente (infinitivo = acción futura)
  const dComprar = parseCaptureDrafts('comprar 250 pesos de manzana', state, { defaultDate: refDate })[0];
  assert.equal(dComprar.kind, 'task', 'comprar en infinitivo debe ser tarea, no gasto');
  if (dComprar.kind === 'task') {
    assert.ok(dComprar.text.includes('comprar 250 pesos de manzana'));
    assert.equal(dComprar.dueDate, undefined, 'Sin fecha explícita no debe inventar dueDate');
  }

  // 7. "voy a comprar 250 pesos de manzana" -> Tarea pendiente
  const dVoyAComprar = parseCaptureDrafts('voy a comprar 250 pesos de manzana', state, { defaultDate: refDate })[0];
  assert.equal(dVoyAComprar.kind, 'task', 'voy a comprar debe ser tarea');
  if (dVoyAComprar.kind === 'task') {
    assert.equal(dVoyAComprar.dueDate, undefined);
  }

  // 8. "pagar 9300 a Jorge" -> Tarea sin vencimiento
  const dPagar = parseCaptureDrafts('pagar 9300 a Jorge', state, { defaultDate: refDate })[0];
  assert.equal(dPagar.kind, 'task');
  if (dPagar.kind === 'task') {
    assert.equal(dPagar.dueDate, undefined);
  }

  // 9. "debo 500 pesos a jorga" -> Tarea pendiente
  const dDebo = parseCaptureDrafts('debo 500 pesos a jorga', state, { defaultDate: refDate })[0];
  assert.equal(dDebo.kind, 'task');

  // 10. "ahorro de 1000 pesos en viaje a bolivia" -> No registrar gasto ni ingreso (Bandeja)
  const dAhorro = parseCaptureDrafts('ahorro de 1000 pesos en viaje a bolivia', state, { defaultDate: refDate })[0];
  assert.notEqual(dAhorro.kind, 'finance', 'Ahorro no debe ser gasto ni ingreso');
  assert.equal(dAhorro.kind, 'inbox', 'Ahorro debe ser capturado de forma segura en Bandeja');

  // 11. "quiero ahorrar 5000 pesos" -> Intención futura, no ingreso/gasto
  const dQuieroAhorrar = parseCaptureDrafts('quiero ahorrar 5000 pesos', state, { defaultDate: refDate })[0];
  assert.notEqual(dQuieroAhorrar.kind, 'finance');
  assert.equal(dQuieroAhorrar.kind, 'inbox');

  // 12. "me ahorré 1000 pesos en un viaje" -> No gasto ni ingreso automático
  const dMeAhorre = parseCaptureDrafts('me ahorré 1000 pesos en un viaje', state, { defaultDate: refDate })[0];
  assert.notEqual(dMeAhorre.kind, 'finance');
  assert.equal(dMeAhorre.kind, 'inbox');

  // 13. "no pagué 500 pesos" -> No gasto realizado (negación)
  const dNoPague = parseCaptureDrafts('no pagué 500 pesos', state, { defaultDate: refDate })[0];
  assert.notEqual(dNoPague.kind, 'finance');
  assert.equal(dNoPague.kind, 'inbox');

  // 14. "quiero ganar 500 pesos" -> No ingreso realizado (deseo)
  const dQuieroGanar = parseCaptureDrafts('quiero ganar 500 pesos', state, { defaultDate: refDate })[0];
  assert.notEqual(dQuieroGanar.kind, 'finance');
  assert.equal(dQuieroGanar.kind, 'inbox');

  // 15. "examen el 30 de octubre" -> Fecha explícita correcta
  const dExamen = parseCaptureDrafts('examen el 30 de octubre', state, { defaultDate: refDate })[0];
  assert.equal(dExamen.kind, 'task');
  if (dExamen.kind === 'task') {
    assert.equal(dExamen.dueDate, '2026-10-30');
  }

  // 16. "6000 en 6 cuotas" -> No inventar cuotas ni vencimientos en finanzas
  const dCuotas = parseCaptureDrafts('6000 en 6 cuotas', state, { defaultDate: refDate })[0];
  assert.equal(dCuotas.kind, 'finance');
  if (dCuotas.kind === 'finance') {
    assert.equal(dCuotas.amount, 6000);
    assert.equal(dCuotas.installments, 6);
  }
});

test('QC 2.2: Capturas compuestas preservan intenciones independientes ("cobré 500 por arbitrar y mañana comprar leche")', () => {
  const state = defaultState();
  const refDate = '2026-10-16';

  const drafts = parseCaptureDrafts('cobré 500 por arbitrar y mañana comprar leche', state, { defaultDate: refDate });
  assert.equal(drafts.length, 2, 'Debe generar exactamente dos borradores independientes');

  // Borrador 1: Ingreso por arbitrar
  assert.equal(drafts[0].kind, 'finance');
  if (drafts[0].kind === 'finance') {
    assert.equal(drafts[0].type, 'ingreso');
    assert.equal(drafts[0].amount, 500);
  }

  // Borrador 2: Tarea para mañana comprar leche
  assert.equal(drafts[1].kind, 'task');
  if (drafts[1].kind === 'task') {
    assert.equal(drafts[1].text, 'comprar leche');
    assert.equal(drafts[1].dueDate, '2026-10-17');
  }
});
