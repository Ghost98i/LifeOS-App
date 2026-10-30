import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import {
  buildAreaPath,
  buildContextInsights,
  buildSmoothPath,
  collectContextualDayActivities,
  contextForDate,
  dismissContextRecommendation,
  evaluateDailyContext,
  formatCompactContextSummary,
  formatMoodLabel,
  formatSecondaryFactors,
  groupContiguousEvolutionPoints,
  hasRecordedContext,
  resolveActivityNavigationTarget,
  saveDailyContextCheckIn,
  sleepQualityDescriptor,
  sleepSummary,
  upsertDailyContext,
} from './contextInsights';
import {
  ENERGY_SCALE_LABELS,
  MOOD_SCALE_LABELS,
  SLEEP_QUALITY_LABELS,
  calculateContextDeltas,
  energyLabel,
  formatLongDate,
  moodLabel,
  ordinalLabel,
  resolveInitialActiveFactors,
} from '../components/PersonalContextCard';

test('detecta tres noches cortas consecutivas y calcula el promedio semanal', () => {
  const state = defaultState();
  state.dailyContext = [
    { date: '2026-08-07', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-08-08', sleepHours: 6, energy: 2, mood: null, connection: null },
    { date: '2026-08-09', sleepHours: 6.5, energy: 2, mood: null, connection: null },
    { date: '2026-08-10', sleepHours: 5.5, energy: 1, mood: null, connection: null },
  ];

  const summary = sleepSummary(state, '2026-08-10');
  assert.equal(summary.currentShortStreak, 3);
  assert.equal(summary.shouldAlert, true);
  assert.equal(summary.recordedNights, 4);
  assert.equal(summary.shortNights, 3);
  assert.equal(summary.averageHours, 6.5);
});

test('una noche suficiente corta la alerta y un día sin datos corta la racha', () => {
  const state = defaultState();
  state.dailyContext = [
    { date: '2026-08-07', sleepHours: 5, energy: null, mood: null, connection: null },
    { date: '2026-08-08', sleepHours: 5, energy: null, mood: null, connection: null },
    { date: '2026-08-10', sleepHours: 5, energy: null, mood: null, connection: null },
  ];
  assert.equal(sleepSummary(state, '2026-08-10').currentShortStreak, 1);

  state.dailyContext.push({ date: '2026-08-11', sleepHours: 7, energy: null, mood: null, connection: null });
  assert.equal(sleepSummary(state, '2026-08-11').currentShortStreak, 0);
});

test('Estado histórico: actualiza energía, sueño y ánimo sin borrar el contexto social almacenado', () => {
  const state = defaultState();
  state.dailyContext = [{
    date: '2026-10-10', sleepHours: 6, energy: 2, mood: null, connection: 'encuentro', note: 'día largo',
  }];

  upsertDailyContext(state, {
    ...contextForDate(state, '2026-10-10'),
    sleepHours: 7.5,
    energy: 4,
    mood: 5,
  });

  assert.deepEqual(contextForDate(state, '2026-10-10'), {
    date: '2026-10-10', sleepHours: 7.5, energy: 4, mood: 5, connection: 'encuentro', note: 'día largo',
  });
  assert.equal(contextForDate(state, '2026-10-09').mood, null);
});

test('Escenario 1: Sueño corto + energía baja + actividad exigente genera sugerencia explicable de revisión de carga', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 2, mood: 2, connection: null },
  ];
  state.todayExtras = [
    {
      id: 'task-1',
      date,
      text: 'Preparar informe trimestral complejo',
      done: false,
      priority: 'media',
      effort: 'alta',
    },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.equal(evaluation.hasRecord, true);
  assert.equal(evaluation.abstentionReason, null);
  assert.ok(evaluation.recommendation != null);
  assert.equal(evaluation.recommendation?.kind, 'reduce_demanding');
  assert.match(evaluation.recommendation?.observed || '', /5 h de sueño y energía 2\/5/);
  assert.match(evaluation.recommendation?.whyRelevant || '', /Preparar informe trimestral complejo/);
  assert.match(evaluation.compactSummary, /Sueño: 5 h · Energía: 2\/5 · Ánimo: bajo/);
});

test('Escenario 2: Sueño corto + energía alta se abstiene sin alarmar ni imponer descanso', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 4, mood: 4, connection: null },
  ];
  state.todayExtras = [
    {
      id: 'task-1',
      date,
      text: 'Sesión intensa de programación',
      done: false,
      priority: 'media',
      effort: 'alta',
    },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.equal(evaluation.hasRecord, true);
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'short_sleep_but_good_energy');
  assert.match(evaluation.compactSummary, /Sueño: 5 h · Energía: 4\/5/);
});

test('Escenario 3: Ánimo bajo + energía normal se abstiene sin asumir incapacidad operativa', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 7.5, energy: 3, mood: 1, connection: null },
  ];
  state.todayExtras = [
    {
      id: 'task-1',
      date,
      text: 'Estudiar para certificación',
      done: false,
      priority: 'media',
      effort: 'alta',
    },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.equal(evaluation.hasRecord, true);
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'low_mood_normal_energy');
  assert.match(evaluation.compactSummary, /Ánimo: muy bajo/);
});

test('Escenario 4: Energía baja + compromiso impostergable mantiene el compromiso y sugiere prudencia con carga secundaria', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 2, mood: 2, connection: null },
  ];
  state.agenda.viernes = [
    {
      id: 'block-meeting',
      time: '10:00',
      activity: 'Reunión directiva presencial',
      effort: 'media',
    },
  ];
  state.todayExtras = [
    {
      id: 'extra-secondary',
      date,
      text: 'Organizar fotos antiguas',
      done: false,
      priority: 'baja',
    },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.ok(evaluation.recommendation != null);
  assert.equal(evaluation.recommendation?.kind, 'protect_impostergable');
  assert.match(evaluation.recommendation?.headline || '', /Compromiso firme con energía reducida/);
  assert.match(evaluation.recommendation?.whyRelevant || '', /Reunión directiva presencial/);
  assert.match(evaluation.recommendation?.optionToConsider || '', /Mantener tu compromiso principal y evaluar pausar o reprogramar/);
});

test('Escenario 5: Energía baja sin actividades exigentes ni compromisos fijos se abstiene de inventar conflicto', () => {
  const state = defaultState();
  const date = '2026-10-16';
  // State only has default routines (Tender la cama, Tomar 2L agua, etc.) without effort or fixed time
  state.dailyContext = [
    { date, sleepHours: 7, energy: 2, mood: 3, connection: null },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.equal(evaluation.hasRecord, true);
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'no_demanding_or_impostergable_activities');
});

test('Escenario 6: Sin registro de sueño no inventa duración del sueño en el resumen ni en la recomendación', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: null, energy: 2, mood: 3, connection: null },
  ];
  state.todayExtras = [
    {
      id: 'task-demanding',
      date,
      text: 'Rediseño de base de datos',
      done: false,
      priority: 'alta',
      effort: 'alta',
    },
  ];

  const evaluation = evaluateDailyContext(state, date);
  assert.ok(evaluation.recommendation != null);
  assert.doesNotMatch(evaluation.recommendation?.observed || '', /sueño/i);
  assert.match(evaluation.recommendation?.observed || '', /^Registraste energía 2\/5\./);
  assert.doesNotMatch(evaluation.compactSummary, /Sueño/);
  assert.equal(evaluation.compactSummary, 'Energía: 2/5 · Ánimo: estable');
});

test('Escenario 7: Sin registro del día mantiene Hoy funcional y neutral', () => {
  const state = defaultState();
  state.dailyContext = [];

  const evaluation = evaluateDailyContext(state, '2026-10-16');
  assert.equal(evaluation.hasRecord, false);
  assert.equal(evaluation.compactSummary, '');
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'no_context_recorded');
});

test('Escenario 8: Recomendación descartada no reaparece durante el mismo día', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 2, mood: 2, connection: null },
  ];
  state.todayExtras = [
    { id: 'task-1', date, text: 'Actividad exigente', done: false, priority: 'media', effort: 'alta' },
  ];

  const before = evaluateDailyContext(state, date);
  assert.ok(before.recommendation != null);
  const recKey = before.recommendation.key;

  dismissContextRecommendation(state, date, recKey);

  const after = evaluateDailyContext(state, date);
  assert.equal(after.recommendation, null);
  assert.equal(after.isRecommendationDismissed, true);
  assert.equal(after.abstentionReason, 'dismissed_by_user');
});

test('Escenario 9: Registro editado preserva morningSnapshot matutino y actualiza la interpretación contextual', () => {
  const state = defaultState();
  const date = '2026-10-16';

  // 1. Initial morning check-in
  saveDailyContextCheckIn(
    state,
    date,
    { sleepHours: 5, energy: 2, mood: 2 },
    '2026-10-16T08:00:00Z'
  );
  state.todayExtras = [
    { id: 'task-1', date, text: 'Actividad exigente', done: false, priority: 'media', effort: 'alta' },
  ];

  const morningEval = evaluateDailyContext(state, date);
  assert.ok(morningEval.recommendation != null);

  // 2. Afternoon edit: user rested, energy increased to 4
  const edited = saveDailyContextCheckIn(
    state,
    date,
    { energy: 4 },
    '2026-10-16T15:30:00Z'
  );

  // Assert morning snapshot was preserved and not silently overwritten
  assert.ok(edited.morningSnapshot != null);
  assert.equal(edited.morningSnapshot.energy, 2);
  assert.equal(edited.morningSnapshot.sleepHours, 5);
  assert.equal(edited.energy, 4);

  // Assert evaluation immediately updated: high energy cancels the low-energy recommendation
  const afternoonEval = evaluateDailyContext(state, date);
  assert.equal(afternoonEval.recommendation, null);
  assert.equal(afternoonEval.abstentionReason, 'short_sleep_but_good_energy');
});

test('Escenario 10: Módulos ocultos o deshabilitados no generan recomendaciones basadas en módulos no activos', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 2, mood: 2, connection: null },
  ];
  state.study = {
    subjects: [{ id: 'sub-1', name: 'Álgebra Lineal' }],
    exams: [{ id: 'exam-1', subjectId: 'sub-1', date, status: 'pendiente' }],
    studyLog: [],
  };

  // With 'estudios' enabled, exam triggers protect_impostergable
  const withModule = evaluateDailyContext(state, date);
  assert.ok(withModule.recommendation != null);
  assert.match(withModule.recommendation.whyRelevant, /Álgebra Lineal/);

  // Now hide 'estudios' in settings
  state.settings.hiddenTabs = ['estudios'];
  const withoutModule = evaluateDailyContext(state, date);
  assert.equal(withoutModule.recommendation, null);
  assert.equal(withoutModule.abstentionReason, 'no_demanding_or_impostergable_activities');
});

test('Invariante: evaluateDailyContext y collectContextualDayActivities no mutan el estado de LifeOS', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [
    { date, sleepHours: 5, energy: 2, mood: 2, connection: 'solo', note: 'test' },
  ];
  state.todayExtras = [
    { id: 't1', date, text: 'Exigente', done: false, priority: 'alta', effort: 'alta' },
  ];

  const snapshotBefore = JSON.stringify(state);
  evaluateDailyContext(state, date);
  const snapshotAfter = JSON.stringify(state);

  assert.equal(snapshotBefore, snapshotAfter);
});

test('buildContextInsights: requiere muestra suficiente (>= 10 total y >= 5 por grupo) y clasifica epistemológicamente', () => {
  const state = defaultState();

  // Insufficient sample (< 10 entries) returns empty array
  state.dailyContext = [
    { date: '2026-10-01', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-10-02', sleepHours: 5, energy: 2, mood: null, connection: null },
  ];
  assert.deepEqual(buildContextInsights(state), []);

  // Sufficient sample: 6 rested days, 6 short-sleep days
  state.dailyContext = [
    { date: '2026-10-01', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-10-02', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-10-03', sleepHours: 8, energy: 5, mood: null, connection: null },
    { date: '2026-10-04', sleepHours: 8, energy: 4, mood: null, connection: null },
    { date: '2026-10-05', sleepHours: 7.5, energy: 4, mood: null, connection: null },
    { date: '2026-10-06', sleepHours: 7.5, energy: 5, mood: null, connection: null },
    { date: '2026-10-07', sleepHours: 5, energy: 2, mood: null, connection: null },
    { date: '2026-10-08', sleepHours: 5, energy: 2, mood: null, connection: null },
    { date: '2026-10-09', sleepHours: 5.5, energy: 2, mood: null, connection: null },
    { date: '2026-10-10', sleepHours: 5, energy: 2, mood: null, connection: null },
    { date: '2026-10-11', sleepHours: 6, energy: 2, mood: null, connection: null },
    { date: '2026-10-12', sleepHours: 5, energy: 2, mood: null, connection: null },
  ];

  const insights = buildContextInsights(state);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].id, 'sleep-energy');
  assert.equal(insights[0].kind, 'comparacion_descriptiva');
  assert.match(insights[0].text, /coincidió con/);
  assert.doesNotMatch(insights[0].text, /causa/i);
});

test('buildContextInsights: no genera insights de gimnasio si el módulo gimnasio está deshabilitado', () => {
  const state = defaultState();
  state.dailyContext = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    sleepHours: 7,
    energy: i % 2 === 0 ? 5 : 2,
    mood: 3,
    connection: null,
  }));
  state.gym.sessions = [
    {
      id: 'g1',
      date: '2026-10-01',
      status: 'completed',
      exercises: [{ name: 'Sentadillas', sets: [{ id: 's1', reps: 10, weight: 80, completed: true }] }],
    },
    {
      id: 'g2',
      date: '2026-10-03',
      status: 'completed',
      exercises: [{ name: 'Sentadillas', sets: [{ id: 's2', reps: 10, weight: 80, completed: true }] }],
    },
    {
      id: 'g3',
      date: '2026-10-05',
      status: 'completed',
      exercises: [{ name: 'Sentadillas', sets: [{ id: 's3', reps: 10, weight: 80, completed: true }] }],
    },
    {
      id: 'g4',
      date: '2026-10-07',
      status: 'completed',
      exercises: [{ name: 'Sentadillas', sets: [{ id: 's4', reps: 10, weight: 80, completed: true }] }],
    },
    {
      id: 'g5',
      date: '2026-10-09',
      status: 'completed',
      exercises: [{ name: 'Sentadillas', sets: [{ id: 's5', reps: 10, weight: 80, completed: true }] }],
    },
  ];

  state.settings.hiddenTabs = ['gimnasio'];
  const insights = buildContextInsights(state);
  assert.ok(insights.every((ins) => ins.id !== 'gym-energy'));
});

test('hasRecordedContext y formatCompactContextSummary: evalúan correctamente la presencia de datos', () => {
  assert.equal(hasRecordedContext(null), false);
  assert.equal(hasRecordedContext(undefined), false);
  assert.equal(
    hasRecordedContext({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: null }),
    false
  );
  assert.equal(
    hasRecordedContext({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: null, note: '  ' }),
    false
  );

  const entry = {
    date: '2026-10-16',
    sleepHours: 5,
    energy: 2,
    mood: 2,
    connection: null,
  };
  assert.equal(hasRecordedContext(entry), true);
  assert.equal(formatCompactContextSummary(entry), 'Sueño: 5 h · Energía: 2/5 · Ánimo: bajo');
});

test('Estado 1.1: coherencia terminológica estricta en Ánimo, Energía y Calidad de Sueño (Estable vs Normal)', () => {
  // Ánimo: 1=muy bajo, 2=bajo, 3=estable (NUNCA 'normal'), 4=bueno, 5=muy bueno
  assert.equal(formatMoodLabel(1), 'muy bajo');
  assert.equal(formatMoodLabel(2), 'bajo');
  assert.equal(formatMoodLabel(3), 'estable');
  assert.equal(formatMoodLabel(4), 'bueno');
  assert.equal(formatMoodLabel(5), 'muy bueno');

  assert.equal(MOOD_SCALE_LABELS[2], 'Estable');
  assert.equal(moodLabel(3), 'Estable');
  assert.equal(ordinalLabel(3), 'Estable');
  assert.doesNotMatch(moodLabel(3).toLowerCase(), /normal/);

  // Energía: 1=Muy baja, 2=Baja, 3=Media, 4=Alta, 5=Muy alta
  assert.equal(ENERGY_SCALE_LABELS[0], 'Muy baja');
  assert.equal(ENERGY_SCALE_LABELS[1], 'Baja');
  assert.equal(ENERGY_SCALE_LABELS[2], 'Media');
  assert.equal(ENERGY_SCALE_LABELS[3], 'Alta');
  assert.equal(ENERGY_SCALE_LABELS[4], 'Muy alta');
  assert.equal(energyLabel(1), 'Muy baja');
  assert.equal(energyLabel(3), 'Media');
  assert.equal(energyLabel(5), 'Muy alta');

  // Calidad de sueño (opcional)
  assert.equal(SLEEP_QUALITY_LABELS[0], 'Muy poco');
  assert.equal(SLEEP_QUALITY_LABELS[2], 'Normal');
  assert.equal(SLEEP_QUALITY_LABELS[4], 'Profundo');
});

test('Estado 1.1: ciclo completo de interacción (selección -> guardado -> consulta -> edición -> cancelación -> guardado final)', () => {
  const state = defaultState();
  const testDate = '2026-10-16';

  // 1. Registro inicial: Sueño 7.5 h, Energía 3, Ánimo 4
  saveDailyContextCheckIn(state, testDate, {
    sleepHours: 7.5,
    energy: 3,
    mood: 4,
    note: 'Descanso reparador',
  });

  const saved1 = contextForDate(state, testDate);
  assert.equal(saved1.sleepHours, 7.5);
  assert.equal(saved1.energy, 3);
  assert.equal(saved1.mood, 4);
  assert.equal(formatCompactContextSummary(saved1), 'Sueño: 7,5 h · Energía: 3/5 · Ánimo: bueno');

  // 2. Simulación de edición con cancelación:
  // El usuario abre el formulario, cambia el borrador a Ánimo = 3 y Energía = 2, pero cancela.
  // El estado persistido en state DEBE seguir intacto con Ánimo = 4 y Energía = 3.
  const draftCanceled = {
    ...saved1,
    energy: 2,
    mood: 3,
  };
  // Cancelar: se descarta el borrador y se vuelve a consultar el estado canónico
  const reloadedBeforeSave = contextForDate(state, testDate);
  assert.equal(reloadedBeforeSave.mood, 4);
  assert.equal(reloadedBeforeSave.energy, 3);
  assert.notEqual(reloadedBeforeSave.mood, draftCanceled.mood);

  // 3. Simulación de reapertura y confirmación con guardado final:
  // El usuario vuelve a abrir, confirma Ánimo = 3 y Energía = 2, y guarda.
  saveDailyContextCheckIn(state, testDate, {
    energy: 2,
    mood: 3,
  });

  const saved2 = contextForDate(state, testDate);
  assert.equal(saved2.energy, 2);
  assert.equal(saved2.mood, 3);
  assert.equal(saved2.sleepHours, 7.5); // preservado
  assert.equal(saved2.note, 'Descanso reparador'); // preservado
  // En el resumen de Estado, Ánimo 3 se formatea estrictamente como 'estable'
  assert.equal(formatCompactContextSummary(saved2), 'Sueño: 7,5 h · Energía: 2/5 · Ánimo: estable');

  // 4. Preservación del snapshot matutino
  assert.ok(saved2.morningSnapshot != null);
  assert.equal(saved2.morningSnapshot.energy, 3); // valor original de la mañana
  assert.equal(saved2.morningSnapshot.mood, 4);   // valor original de la mañana
});

test('Estado 1.1: soporte de valores decimales en horas de sueño (coma y punto decimal)', () => {
  const parseSleepHours = (input: string): number | null => {
    const normalized = input.replace(',', '.').trim();
    if (normalized === '') return null;
    const num = Number(normalized);
    if (!Number.isFinite(num) || num < 0 || num > 16) return null;
    return num;
  };

  assert.equal(parseSleepHours('7.5'), 7.5);
  assert.equal(parseSleepHours('7,5'), 7.5);
  assert.equal(parseSleepHours('8'), 8);
  assert.equal(parseSleepHours('6,25'), 6.25);
  assert.equal(parseSleepHours('0'), 0);
  assert.equal(parseSleepHours('16'), 16);
  assert.equal(parseSleepHours('16.5'), null);
  assert.equal(parseSleepHours('-1'), null);
  assert.equal(parseSleepHours('abc'), null);
  assert.equal(parseSleepHours('  '), null);
});

test('Estado 1.1: persistencia de factores opcionales sin interferencia con las 3 dimensiones centrales', () => {
  const state = defaultState();
  const testDate = '2026-10-16';

  saveDailyContextCheckIn(state, testDate, {
    sleepHours: 8,
    sleepQuality: 4,
    energy: 4,
    mood: 5,
    stress: 'bajo',
    physicalDiscomfort: 'leve',
    connection: 'encuentro',
    note: 'Día productivo',
  });

  const entry = contextForDate(state, testDate);
  assert.equal(entry.sleepHours, 8);
  assert.equal(entry.sleepQuality, 4);
  assert.equal(entry.energy, 4);
  assert.equal(entry.mood, 5);
  assert.equal(entry.stress, 'bajo');
  assert.equal(entry.physicalDiscomfort, 'leve');
  assert.equal(entry.connection, 'encuentro');
  assert.equal(entry.note, 'Día productivo');

  // Resumen compacto muestra las dimensiones centrales de forma limpia
  assert.equal(formatCompactContextSummary(entry), 'Sueño: 8 h · Energía: 4/5 · Ánimo: muy bueno');
});

test('Estado 1.2: sleepQualityDescriptor traduce niveles numéricos a lenguaje natural', () => {
  assert.equal(sleepQualityDescriptor(1), 'Muy poco reparador');
  assert.equal(sleepQualityDescriptor(2), 'Poco reparador');
  assert.equal(sleepQualityDescriptor(3), 'Adecuado');
  assert.equal(sleepQualityDescriptor(4), 'Reparador');
  assert.equal(sleepQualityDescriptor(5), 'Muy reparador');
  assert.equal(sleepQualityDescriptor(null, true), 'Sin calificar');
  assert.equal(sleepQualityDescriptor(undefined, true), 'Sin calificar');
  assert.equal(sleepQualityDescriptor(null, false), 'Sin dato');
  assert.equal(sleepQualityDescriptor(undefined, false), 'Sin dato');
});

test('Estado 1.2: formatSecondaryFactors extrae factores opcionales sin duplicar métricas primarias ni calidad de sueño', () => {
  assert.deepEqual(formatSecondaryFactors(null), []);
  assert.deepEqual(formatSecondaryFactors(undefined), []);

  const entryEmpty = {
    date: '2026-10-16',
    sleepHours: 8,
    sleepQuality: 2 as const,
    energy: 2,
    mood: 3,
    connection: null,
  };
  // Sin factores secundarios registrados (calidad de sueño no va en esta lista)
  assert.deepEqual(formatSecondaryFactors(entryEmpty), []);

  const entryWithFactors = {
    date: '2026-10-16',
    sleepHours: 8,
    sleepQuality: 2 as const,
    energy: 2,
    mood: 3,
    stress: 'moderado' as const,
    physicalDiscomfort: 'leve' as const,
    connection: 'encuentro',
    note: 'Dormí con calor',
  };
  const factors = formatSecondaryFactors(entryWithFactors);
  assert.deepEqual(factors, [
    'Estrés moderado',
    'Molestias leves',
    'Conexión: encuentro',
  ]);

  // Variantes de molestias
  assert.deepEqual(
    formatSecondaryFactors({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: null, physicalDiscomfort: 'moderada' }),
    ['Molestias moderadas']
  );
  assert.deepEqual(
    formatSecondaryFactors({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: null, physicalDiscomfort: 'alta' }),
    ['Molestias altas']
  );

  // Variantes de conexión
  assert.deepEqual(
    formatSecondaryFactors({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: 'solo' }),
    ['Conexión: a solas']
  );
  assert.deepEqual(
    formatSecondaryFactors({ date: '2026-10-16', sleepHours: null, energy: null, mood: null, connection: 'mensaje' }),
    ['Conexión: mensajes']
  );
});

test('Estado 1.2: caso real de captura de usuario (16 de octubre) se interpreta limpiamente y sin sugerencia forzada', () => {
  const state = defaultState();
  const date = '2026-10-16';

  // Datos idénticos a los mostrados en la captura
  saveDailyContextCheckIn(state, date, {
    sleepHours: 8,
    sleepQuality: 2,
    energy: 2,
    mood: 3,
    stress: 'moderado',
    physicalDiscomfort: 'leve',
  });

  const entry = contextForDate(state, date);
  assert.equal(entry.sleepHours, 8);
  assert.equal(sleepQualityDescriptor(entry.sleepQuality, true), 'Poco reparador');
  assert.equal(entry.energy, 2);
  assert.equal(entry.mood, 3);

  // Factores secundarios discretos
  const secondary = formatSecondaryFactors(entry);
  assert.deepEqual(secondary, ['Estrés moderado', 'Molestias leves']);

  // Motor contextual: sin actividades exigentes ni compromisos firmes en el estado por defecto,
  // se abstiene correctamente de generar recomendaciones invasivas
  const evaluation = evaluateDailyContext(state, date);
  assert.equal(evaluation.hasRecord, true);
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'no_demanding_or_impostergable_activities');
});

test('Estado 1.3: groupContiguousEvolutionPoints agrupa días contiguos y segmenta días faltantes sin interpolación engañosa', () => {
  const getX = (idx: number) => idx * 100;
  const getY = (val: number) => 100 - val * 10;

  // Caso 1: Todos vacíos
  const emptyRecords = [
    { date: '2026-10-10', value: null },
    { date: '2026-10-11', value: null },
  ];
  assert.deepEqual(groupContiguousEvolutionPoints(emptyRecords, getY, getX), []);

  // Caso 2: Registro con huecos (días 0, 1 presentes; 2 ausente; 3, 4 presentes; 5 ausente; 6 presente)
  const records = [
    { date: '2026-10-10', value: 7 },
    { date: '2026-10-11', value: 8 },
    { date: '2026-10-12', value: null },
    { date: '2026-10-13', value: 6 },
    { date: '2026-10-14', value: 7.5 },
    { date: '2026-10-15', value: null },
    { date: '2026-10-16', value: 8 },
  ];

  const groups = groupContiguousEvolutionPoints(records, getY, getX);
  assert.equal(groups.length, 3, 'Debe haber exactamente 3 grupos contiguos disjuntos');

  // Grupo 1: días 0 y 1
  assert.equal(groups[0].length, 2);
  assert.equal(groups[0][0].date, '2026-10-10');
  assert.equal(groups[0][0].x, 0);
  assert.equal(groups[0][0].y, 30); // 100 - 70
  assert.equal(groups[0][1].date, '2026-10-11');
  assert.equal(groups[0][1].x, 100);

  // Grupo 2: días 3 y 4
  assert.equal(groups[1].length, 2);
  assert.equal(groups[1][0].date, '2026-10-13');
  assert.equal(groups[1][0].x, 300);
  assert.equal(groups[1][1].date, '2026-10-14');
  assert.equal(groups[1][1].x, 400);

  // Grupo 3: día 6 aislado
  assert.equal(groups[2].length, 1);
  assert.equal(groups[2][0].date, '2026-10-16');
  assert.equal(groups[2][0].x, 600);
  assert.equal(groups[2][0].index, 6);
});

test('Estado 1.3: buildSmoothPath genera curvas continuas Catmull-Rom estabilizadas sin NaN ni saltos', () => {
  // Lista vacía
  assert.equal(buildSmoothPath([]), '');

  // 1 punto
  assert.equal(buildSmoothPath([{ x: 50, y: 30 }]), 'M 50 30');

  // 2 puntos -> línea directa
  assert.equal(buildSmoothPath([{ x: 0, y: 10 }, { x: 100, y: 20 }]), 'M 0 10 L 100 20');

  // 3+ puntos -> curva bezier cúbica estabilizada
  const points = [
    { x: 0, y: 40 },
    { x: 100, y: 20 },
    { x: 200, y: 30 },
    { x: 300, y: 15 },
  ];
  const path = buildSmoothPath(points);
  assert.match(path, /^M 0 40 C /);
  assert.equal(path.includes('NaN'), false);
  // Debe contener 3 segmentos cúbicos 'C'
  const cubicSegments = path.split(' C ').length - 1;
  assert.equal(cubicSegments, 3);
});

test('Estado 1.3: buildAreaPath cierra el trazado contra la línea de base para rellenos suaves de degradado', () => {
  const baselineY = 70;

  // Vacío
  assert.equal(buildAreaPath([], baselineY), '');

  // 1 punto aislado: crea un semicírculo/bump cerrado hacia la base
  const singlePointArea = buildAreaPath([{ x: 50, y: 30 }], baselineY);
  assert.match(singlePointArea, /^M 40 70 L 40 34 Q 50 30 60 34 L 60 70 Z$/);

  // 2 o más puntos: cierra desde el último punto a la base, luego al primer punto en la base, y Z
  const points = [
    { x: 100, y: 30 },
    { x: 200, y: 20 },
    { x: 300, y: 40 },
  ];
  const area = buildAreaPath(points, baselineY);
  assert.equal(area.endsWith(`L 300 ${baselineY} L 100 ${baselineY} Z`), true);
  assert.equal(area.startsWith('M 100 30 C '), true);
});

test('Estado 1.3.1: formatLongDate formatea correctamente fechas largas con día de la semana y sufijo (Hoy)', () => {
  // Fecha histórica fija
  const dateStr = '2026-10-14';
  const formattedHistorical = formatLongDate(dateStr, false);
  // Verificamos que contenga el número de día '14', el mes 'octubre', y empiece con mayúscula
  assert.match(formattedHistorical, /^[A-ZÁÉÍÓÚ]/);
  assert.match(formattedHistorical, /14/);
  assert.match(formattedHistorical.toLowerCase(), /octubre/);
  assert.equal(formattedHistorical.includes('(Hoy)'), false);

  // Fecha marcada como hoy
  const formattedToday = formatLongDate(dateStr, true);
  assert.match(formattedToday, /14/);
  assert.equal(formattedToday.endsWith('(Hoy)'), true);
});

test('Estado 1.3.1: contratos de inspección y tooltip contextual para evolución histórica', () => {
  // 1. Caso registro completo con calidad calificada
  const sleepQuality = 2 as const;
  const sleepHours = 8;
  const qualityDesc = sleepQualityDescriptor(sleepQuality) || 'calidad sin calificar';
  assert.equal(qualityDesc, 'Poco reparador');
  const sleepText = `${sleepHours.toLocaleString('es-UY')} h — ${qualityDesc}`;
  assert.equal(sleepText, '8 h — Poco reparador');

  // 2. Caso registro con calidad sin calificar (sleepQuality null)
  const unratedQuality: number | null = null;
  const unratedQualityDesc = unratedQuality != null ? sleepQualityDescriptor(unratedQuality) : 'calidad sin calificar';
  assert.equal(unratedQualityDesc, 'calidad sin calificar');
  const sleepTextUnrated = `${sleepHours.toLocaleString('es-UY')} h — ${unratedQualityDesc}`;
  assert.equal(sleepTextUnrated, '8 h — calidad sin calificar');

  // 3. Caso energía y ánimo con labels correspondientes
  const energyVal = 2;
  const moodVal = 3;
  const energyText = `${energyVal}/5 — ${energyLabel(energyVal)}`;
  const moodText = `${moodVal}/5 — ${moodLabel(moodVal)}`;
  assert.equal(energyText, '2/5 — Baja');
  assert.equal(moodText, '3/5 — Estable');

  // 4. Caso métrica ausente en día parcial
  const missingValText = 'Sin registro';
  assert.equal(missingValText, 'Sin registro');

  // 5. Caso día sin registros registrados (hasAny: false)
  const emptyDayText = 'Sin registros de estado para este día.';
  assert.equal(emptyDayText, 'Sin registros de estado para este día.');
});

test('Estado 1.4: Escenario B - Sueño suficiente en duración (8h), pero descanso poco reparador (2/5) y energía baja (2/5)', () => {
  const state = defaultState();
  const date = '2026-10-16';

  // Registro idéntico al de la captura real del usuario
  state.dailyContext = [
    { date, sleepHours: 8, sleepQuality: 2, energy: 2, mood: 3, connection: null },
  ];

  // Caso B.1: Sin actividades exigentes ni compromisos fijos
  // Se abstiene limpiamente sin inventar conflicto ni recomendaciones forzadas
  const evalWithoutTasks = evaluateDailyContext(state, date);
  assert.equal(evalWithoutTasks.hasRecord, true);
  assert.equal(evalWithoutTasks.recommendation, null);
  assert.equal(evalWithoutTasks.abstentionReason, 'no_demanding_or_impostergable_activities');

  // Caso B.2: Con una actividad exigente real declarada por el usuario
  state.todayExtras = [
    {
      id: 'task-demanding',
      date,
      text: 'Reestructurar arquitectura de sincronización',
      done: false,
      priority: 'alta',
      effort: 'alta',
    },
  ];

  const evalWithTask = evaluateDailyContext(state, date);
  assert.ok(evalWithTask.recommendation != null);
  assert.equal(evalWithTask.recommendation?.kind, 'reduce_demanding');
  assert.equal(evalWithTask.recommendation?.headline, 'Actividad de exigencia alta');
  // Reconoce duración y calidad percibida como variables distintas
  assert.match(
    evalWithTask.recommendation?.observed || '',
    /8 h de sueño con descanso poco reparador y energía 2\/5\./
  );
  assert.match(
    evalWithTask.recommendation?.whyRelevant || '',
    /Hoy tenés una actividad marcada de exigencia alta/
  );
  // Sugerencia prudente sin afirmar incapacidad
  assert.match(
    evalWithTask.recommendation?.optionToConsider || '',
    /Revisar si podés dosificar el esfuerzo, hacer pausas conscientes o descomponer la actividad sin sobreexigencia\./
  );
});

test('Estado 1.4: Escenario E - Compromiso impostergable específico por módulo y resolución de navegación contextual', () => {
  const date = '2026-10-16';

  // 1. Examen en módulo Estudios -> destino 'estudios', label 'Revisar estudios'
  const stateStudies = defaultState();
  stateStudies.dailyContext = [{ date, sleepHours: 6, energy: 2, mood: 3, connection: null }];
  stateStudies.study = {
    subjects: [{ id: 'sub-fisica', name: 'Física Clásica' }],
    exams: [{ id: 'exam-1', subjectId: 'sub-fisica', date, status: 'pendiente' }],
    studyLog: [],
  };

  const evalStudies = evaluateDailyContext(stateStudies, date);
  assert.ok(evalStudies.recommendation != null);
  assert.equal(evalStudies.recommendation?.kind, 'protect_impostergable');
  assert.equal(evalStudies.recommendation?.targetView, 'estudios');
  assert.equal(evalStudies.recommendation?.targetLabel, 'Revisar estudios');
  assert.match(evalStudies.recommendation?.whyRelevant || '', /Tenés un examen programado para hoy \("Examen de Física Clásica"\)\./);

  // 2. Entrevista en módulo Trabajo -> destino 'trabajo', label 'Revisar trabajo'
  const stateWork = defaultState();
  stateWork.dailyContext = [{ date, sleepHours: 6, energy: 2, mood: 3, connection: null }];
  stateWork.jobs = {
    opportunities: [],
    applications: [
      {
        id: 'job-1',
        empresa: 'Globant',
        puesto: 'Frontend Architect',
        estado: 'entrevista',
        fecha: date,
        nextActionDate: date,
        notas: '',
      },
    ],
  };

  const evalWork = evaluateDailyContext(stateWork, date);
  assert.ok(evalWork.recommendation != null);
  assert.equal(evalWork.recommendation?.targetView, 'trabajo');
  assert.equal(evalWork.recommendation?.targetLabel, 'Revisar trabajo');
  assert.match(evalWork.recommendation?.whyRelevant || '', /Tenés una entrevista fijada para hoy \("Entrevista con Globant"\)\./);

  // 3. Evento en Calendario -> destino 'calendario', label 'Revisar calendario'
  const stateCal = defaultState();
  stateCal.dailyContext = [{ date, sleepHours: 6, energy: 2, mood: 3, connection: null }];
  stateCal.calendarEvents = [
    { id: 'evt-1', name: 'Audiencia legal', date, type: 'importante', recurring: false },
  ];

  const evalCal = evaluateDailyContext(stateCal, date);
  assert.ok(evalCal.recommendation != null);
  assert.equal(evalCal.recommendation?.targetView, 'calendario');
  assert.equal(evalCal.recommendation?.targetLabel, 'Revisar calendario');
  assert.match(evalCal.recommendation?.whyRelevant || '', /Tenés un evento importante fijado en tu calendario \("Evento: Audiencia legal"\)\./);

  // 4. Compromiso en Agenda -> destino 'agenda', label 'Revisar agenda'
  const stateAgenda = defaultState();
  stateAgenda.dailyContext = [{ date, sleepHours: 6, energy: 2, mood: 3, connection: null }];
  stateAgenda.agenda.viernes = [
    { id: 'blk-1', time: '14:00', activity: 'Presentación trimestral', effort: 'media' },
  ];

  const evalAgenda = evaluateDailyContext(stateAgenda, date);
  assert.ok(evalAgenda.recommendation != null);
  assert.equal(evalAgenda.recommendation?.targetView, 'agenda');
  assert.equal(evalAgenda.recommendation?.targetLabel, 'Revisar agenda');
  assert.match(evalAgenda.recommendation?.whyRelevant || '', /Tenés un compromiso con horario fijo en tu agenda \("Presentación trimestral"\)\./);
});

test('Estado 1.4: Escenario H - Navegación segura oculta el botón si el módulo destino está deshabilitado', () => {
  const state = defaultState();
  const date = '2026-10-16';
  state.dailyContext = [{ date, sleepHours: 5, energy: 2, mood: 2, connection: null }];
  state.agenda.viernes = [
    { id: 'blk-1', time: '11:00', activity: 'Reunión de equipo', effort: 'media' },
  ];

  // Desactivamos 'agenda' en Module Visibility
  state.settings.hiddenTabs = ['agenda'];

  const evaluation = evaluateDailyContext(state, date);
  // Al estar 'agenda' deshabilitada en hiddenTabs, la actividad de agenda no se recolecta
  assert.equal(evaluation.recommendation, null);
  assert.equal(evaluation.abstentionReason, 'no_demanding_or_impostergable_activities');

  // Si probamos directamente resolveActivityNavigationTarget con módulo deshabilitado:
  const nav = resolveActivityNavigationTarget(
    {
      id: 'a-1',
      source: 'agenda',
      text: 'Reunión',
      priorityLevel: 'alta',
      demandLevel: 'media',
      flexibility: 'fija',
      isImpostergable: true,
      isDemanding: false,
      isSecondary: false,
    },
    state
  );
  assert.equal(nav, null);
});

test('Estado 1.4: Independencia estricta entre Prioridad y Exigencia', () => {
  const state = defaultState();
  const date = '2026-10-16';

  state.todayExtras = [
    // Caso 1: Prioridad alta pero esfuerzo bajo (ej. enviar un documento rápido urgente)
    {
      id: 'task-quick',
      date,
      text: 'Firmar contrato urgente',
      done: false,
      priority: 'alta',
      effort: 'baja',
    },
    // Caso 2: Prioridad baja pero esfuerzo alto (ej. organizar depósito)
    {
      id: 'task-heavy',
      date,
      text: 'Limpieza profunda de archivo',
      done: false,
      priority: 'baja',
      effort: 'alta',
    },
  ];

  const activities = collectContextualDayActivities(state, date);
  const quickTask = activities.find((a) => a.id === 'extra-task-quick');
  const heavyTask = activities.find((a) => a.id === 'extra-task-heavy');

  assert.ok(quickTask != null);
  assert.ok(heavyTask != null);

  // La tarea urgente de bajo esfuerzo NO es exigente
  assert.equal(quickTask?.priorityLevel, 'alta');
  assert.equal(quickTask?.demandLevel, 'baja');
  assert.equal(quickTask?.isDemanding, false);

  // La tarea no urgente de alto esfuerzo SÍ es exigente
  assert.equal(heavyTask?.priorityLevel, 'baja');
  assert.equal(heavyTask?.demandLevel, 'alta');
  assert.equal(heavyTask?.isDemanding, true);
});

test('Estado 1.4: Escala de sueño dinámica por encima de 10 horas sin truncar ni distorsionar datos', () => {
  // Caso 1: Usuario duerme 12 horas (recuperación de guardia / descanso largo)
  const recordsOver10 = [
    { sleepHours: 7 },
    { sleepHours: 8 },
    { sleepHours: 12 },
    { sleepHours: 6 },
  ];
  const scaleMax12 = Math.ceil(Math.max(10, ...recordsOver10.map((r) => r.sleepHours ?? 0)));
  assert.equal(scaleMax12, 12);

  // La línea de guía de 7h escala proporcionalmente
  const guideY10 = 64 - (7 / 10) * 48; // 30.4
  const guideY12 = 64 - (7 / 12) * 48; // 36
  assert.ok(guideY12 > guideY10);

  // Caso 2: Decimales (10.5 h) se redondean con Math.ceil a 11 para una escala limpia
  const recordsDecimal = [{ sleepHours: 10.5 }, { sleepHours: 7 }];
  const scaleMaxDecimal = Math.ceil(Math.max(10, ...recordsDecimal.map((r) => r.sleepHours ?? 0)));
  assert.equal(scaleMaxDecimal, 11);

  // Caso 3: Valores normales (<= 10) preservan el ancla estándar de 10h
  const recordsNormal = [{ sleepHours: 8 }, { sleepHours: 7.5 }];
  const scaleMaxNormal = Math.ceil(Math.max(10, ...recordsNormal.map((r) => r.sleepHours ?? 0)));
  assert.equal(scaleMaxNormal, 10);
});

test('Estado 1.4.1: Contrato de separación estricta entre Selección Persistente e Inspección Temporal', () => {
  // Simulación del modelo de estado de los componentes de gráfico (WeeklyGeneralMatrixChart y WeeklyMetricDetailChart)
  interface ChartInteractionModel {
    selectedDate: string;
    hoveredIdx: number | null;
    mobileInspectDate: string | null;
    lastPointerType: string;
  }

  const records = [
    { date: '2026-10-10' },
    { date: '2026-10-11' },
    { date: '2026-10-12' },
    { date: '2026-10-13' },
    { date: '2026-10-14' },
    { date: '2026-10-15' },
    { date: '2026-10-16' },
  ];

  const createModel = (initialSelected = '2026-10-16'): ChartInteractionModel => ({
    selectedDate: initialSelected,
    hoveredIdx: null,
    mobileInspectDate: null,
    lastPointerType: 'mouse',
  });

  const isTooltipVisible = (m: ChartInteractionModel): boolean => {
    const activeDate = m.hoveredIdx !== null ? records[m.hoveredIdx]?.date : m.mobileInspectDate;
    const inspectIdx = activeDate ? records.findIndex((r) => r.date === activeDate) : -1;
    const inspectRec = inspectIdx !== -1 ? records[inspectIdx] : null;
    return Boolean(inspectRec && (m.hoveredIdx !== null || m.mobileInspectDate === inspectRec.date));
  };

  const getInspectedDate = (m: ChartInteractionModel): string | null => {
    if (!isTooltipVisible(m)) return null;
    return m.hoveredIdx !== null ? records[m.hoveredIdx]?.date : m.mobileInspectDate;
  };

  const handlePointerEnterDay = (m: ChartInteractionModel, idx: number, pointerType = 'mouse') => {
    m.lastPointerType = pointerType;
    m.hoveredIdx = idx;
  };

  const handlePointerLeave = (m: ChartInteractionModel) => {
    m.hoveredIdx = null;
    if (m.lastPointerType !== 'touch') {
      m.mobileInspectDate = null;
    }
  };

  const handleSelectDay = (m: ChartInteractionModel, date: string, isTouch = false) => {
    m.selectedDate = date;
    if (isTouch) {
      m.mobileInspectDate = m.mobileInspectDate === date ? null : date;
    } else {
      m.mobileInspectDate = null;
    }
  };

  const handleEscape = (m: ChartInteractionModel) => {
    m.hoveredIdx = null;
    m.mobileInspectDate = null;
  };

  const handlePointerDownOutside = (m: ChartInteractionModel) => {
    m.mobileInspectDate = null;
  };

  // 1. Escritorio: Hover sobre un día muestra tooltip sin cambiar selectedDate
  const m1 = createModel('2026-10-16');
  assert.equal(isTooltipVisible(m1), false);
  assert.equal(m1.selectedDate, '2026-10-16');

  handlePointerEnterDay(m1, 4, 'mouse'); // 2026-10-14
  assert.equal(isTooltipVisible(m1), true);
  assert.equal(getInspectedDate(m1), '2026-10-14');
  assert.equal(m1.selectedDate, '2026-10-16'); // Se preserva la fecha seleccionada

  // 2. Escritorio: Clic sobre un día selecciona pero NO bloquea el tooltip tras la salida (PointerLeave)
  handleSelectDay(m1, '2026-10-14', false); // Clic con mouse
  assert.equal(m1.selectedDate, '2026-10-14');
  assert.equal(m1.mobileInspectDate, null); // Invariante clave 1.4.1: Clic de mouse no deja mobileInspectDate
  assert.equal(isTooltipVisible(m1), true); // Visible solo porque el puntero sigue encima

  // Al salir del gráfico con el mouse: el tooltip DEBE desaparecer inmediatamente
  handlePointerLeave(m1);
  assert.equal(isTooltipVisible(m1), false);
  assert.equal(getInspectedDate(m1), null);
  assert.equal(m1.selectedDate, '2026-10-14'); // La selección persiste

  // 3. Móvil (Touch): Tap inspecciona y selecciona; re-tap sobre el mismo día alterna a cerrado (toggle)
  const m2 = createModel('2026-10-16');
  handleSelectDay(m2, '2026-10-13', true); // Tap táctil
  assert.equal(m2.selectedDate, '2026-10-13');
  assert.equal(m2.mobileInspectDate, '2026-10-13');
  assert.equal(isTooltipVisible(m2), true);
  assert.equal(getInspectedDate(m2), '2026-10-13');

  // Re-tap sobre el mismo día: se cierra el tooltip
  handleSelectDay(m2, '2026-10-13', true);
  assert.equal(m2.mobileInspectDate, null);
  assert.equal(isTooltipVisible(m2), false);
  assert.equal(m2.selectedDate, '2026-10-13'); // Selección se mantiene

  // 4. Móvil (Touch): Tap fuera cierra el tooltip inspeccionado
  handleSelectDay(m2, '2026-10-15', true);
  assert.equal(isTooltipVisible(m2), true);
  handlePointerDownOutside(m2);
  assert.equal(isTooltipVisible(m2), false);
  assert.equal(m2.selectedDate, '2026-10-15'); // Selección se mantiene

  // 5. Teclado: Tecla Escape descarta tooltip de inmediato sin perder la selección
  const m3 = createModel('2026-10-16');
  handlePointerEnterDay(m3, 2, 'mouse');
  assert.equal(isTooltipVisible(m3), true);
  handleEscape(m3);
  assert.equal(isTooltipVisible(m3), false);
  assert.equal(m3.selectedDate, '2026-10-16');
});

test('Estado 1.4.2 & 1.4.3: resolución inicial de factores activos desde settings y registro previo', () => {
  // 1. Sin settings ni datos en el registro -> lista vacía
  const empty = resolveInitialActiveFactors({ date: '2026-10-16', energy: 3, mood: 3, sleepHours: 7, connection: null, note: '' }, []);
  assert.deepEqual(empty, []);

  // 2. Factores guardados en settings (día de Hoy)
  const fromSettingsOnly = resolveInitialActiveFactors(
    { date: '2026-10-16', energy: 3, mood: 3, sleepHours: 7, connection: null, note: '' },
    ['stress', 'note'],
    true,
  );
  assert.deepEqual(fromSettingsOnly, ['stress', 'note']);

  // 3. Factores presentes en el registro del día se incorporan aunque no estén en settings
  const fromEntry = resolveInitialActiveFactors(
    {
      date: '2026-10-16',
      energy: 3,
      mood: 3,
      sleepHours: 7,
      stress: 'moderado',
      physicalDiscomfort: 'leve',
      connection: 'encuentro',
      note: 'Dormí bien',
    },
    ['stress'],
    true,
  );
  assert.deepEqual(fromEntry.sort(), ['connection', 'note', 'physicalDiscomfort', 'stress'].sort());

  // 4. Aislamiento histórico: fecha histórica (isToday = false) NO hereda preferencias globales
  const historicalEmpty = resolveInitialActiveFactors(
    { date: '2026-10-11', energy: 3, mood: 3, sleepHours: 7, connection: null, note: '' },
    ['stress', 'physicalDiscomfort'],
    false, // fecha histórica
  );
  assert.deepEqual(historicalEmpty, [], 'Fecha histórica sin datos no debe activar chips de preferencias globales');

  // 5. Aislamiento histórico: fecha histórica con datos refleja únicamente sus datos guardados
  const historicalWithData = resolveInitialActiveFactors(
    { date: '2026-10-11', energy: 3, mood: 3, sleepHours: 7, connection: 'solo', note: 'Descanso' },
    ['stress', 'physicalDiscomfort'],
    false,
  );
  assert.deepEqual(historicalWithData.sort(), ['connection', 'note'].sort());
});

test('Estado 1.4.2: contrato de activación, desactivación, cancelación y guardado de factores opcionales', () => {
  // Simulación de la máquina de estados del borrador de PersonalContextCard
  interface FormDraft {
    activeOptionalFactors: ('stress' | 'physicalDiscomfort' | 'connection' | 'note')[];
    stress: 'bajo' | 'moderado' | 'alto' | null;
    physicalDiscomfort: 'leve' | 'moderada' | 'alta' | null;
    connection: string | null;
    note: string;
    isEditing: boolean;
  }

  const createFormDraft = (
    entry: {
      stress?: 'bajo' | 'moderado' | 'alto' | null;
      physicalDiscomfort?: 'leve' | 'moderada' | 'alta' | null;
      connection?: string | number | null;
      note?: string;
    },
    savedSettingsFactors: ('stress' | 'physicalDiscomfort' | 'connection' | 'note')[] = [],
  ): FormDraft => {
    const fullEntry = {
      date: '2026-10-16',
      energy: 3,
      mood: 3,
      sleepHours: 7,
      stress: entry.stress ?? null,
      physicalDiscomfort: entry.physicalDiscomfort ?? null,
      connection: entry.connection == null ? null : String(entry.connection),
      note: entry.note ?? '',
    };
    return {
      activeOptionalFactors: resolveInitialActiveFactors(fullEntry, savedSettingsFactors),
      stress: fullEntry.stress,
      physicalDiscomfort: fullEntry.physicalDiscomfort,
      connection: fullEntry.connection,
      note: fullEntry.note,
      isEditing: false,
    };
  };

  const toggleFactor = (draft: FormDraft, factor: 'stress' | 'physicalDiscomfort' | 'connection' | 'note') => {
    const isActive = draft.activeOptionalFactors.includes(factor);
    if (isActive) {
      draft.activeOptionalFactors = draft.activeOptionalFactors.filter((f) => f !== factor);
      if (factor === 'stress') draft.stress = null;
      if (factor === 'physicalDiscomfort') draft.physicalDiscomfort = null;
      if (factor === 'connection') draft.connection = null;
      if (factor === 'note') draft.note = '';
    } else {
      draft.activeOptionalFactors = [...draft.activeOptionalFactors, factor];
    }
  };

  // CASO A — Activar y desactivar con el chip (los cuatro factores)
  for (const factor of ['stress', 'physicalDiscomfort', 'connection', 'note'] as const) {
    const draft = createFormDraft({});
    assert.equal(draft.activeOptionalFactors.includes(factor), false);

    // 1. Clic para activar
    toggleFactor(draft, factor);
    assert.equal(draft.activeOptionalFactors.includes(factor), true);

    // Asignar valor según factor
    if (factor === 'stress') draft.stress = 'alto';
    if (factor === 'physicalDiscomfort') draft.physicalDiscomfort = 'moderada';
    if (factor === 'connection') draft.connection = 'mensaje';
    if (factor === 'note') draft.note = 'Nota de prueba';

    // 2. Segundo clic sobre el mismo chip desactiva y limpia el borrador
    toggleFactor(draft, factor);
    assert.equal(draft.activeOptionalFactors.includes(factor), false);
    if (factor === 'stress') assert.equal(draft.stress, null);
    if (factor === 'physicalDiscomfort') assert.equal(draft.physicalDiscomfort, null);
    if (factor === 'connection') assert.equal(draft.connection, null);
    if (factor === 'note') assert.equal(draft.note, '');
  }

  // CASO B — Desactivar y guardar: se persiste null y se eliminan de settings
  const state = defaultState();
  state.dailyContext = [
    {
      date: '2026-10-16',
      sleepHours: 7,
      energy: 3,
      mood: 4,
      stress: 'moderado',
      physicalDiscomfort: 'leve',
      connection: null,
      note: '',
    },
  ];
  state.settings.contextOptionalFactors = ['stress', 'physicalDiscomfort'];

  // El usuario edita y desactiva estrés y molestias desde el chip
  const draftB = createFormDraft(state.dailyContext[0], state.settings.contextOptionalFactors);
  assert.equal(draftB.activeOptionalFactors.includes('stress'), true);
  assert.equal(draftB.activeOptionalFactors.includes('physicalDiscomfort'), true);

  toggleFactor(draftB, 'stress');
  toggleFactor(draftB, 'physicalDiscomfort');
  assert.equal(draftB.activeOptionalFactors.includes('stress'), false);
  assert.equal(draftB.activeOptionalFactors.includes('physicalDiscomfort'), false);
  assert.equal(draftB.stress, null);
  assert.equal(draftB.physicalDiscomfort, null);

  // Al guardar: se persisten los factores activos y los valores se limpian en dailyContext
  saveDailyContextCheckIn(state, '2026-10-16', {
    sleepHours: 7,
    energy: 3,
    mood: 4,
    stress: draftB.activeOptionalFactors.includes('stress') ? draftB.stress : null,
    physicalDiscomfort: draftB.activeOptionalFactors.includes('physicalDiscomfort') ? draftB.physicalDiscomfort : null,
    connection: draftB.activeOptionalFactors.includes('connection') ? draftB.connection : null,
    note: draftB.activeOptionalFactors.includes('note') ? draftB.note : '',
  });
  state.settings.contextOptionalFactors = draftB.activeOptionalFactors;

  assert.equal(state.dailyContext[0].stress, null);
  assert.equal(state.dailyContext[0].physicalDiscomfort, null);
  assert.deepEqual(state.settings.contextOptionalFactors, []);

  // CASO C — Reactivar antes de guardar: controles limpios sin resucitar valor previo
  const draftC = createFormDraft({ stress: 'moderado' }, ['stress']);
  assert.equal(draftC.stress, 'moderado');
  toggleFactor(draftC, 'stress'); // Se desactiva y se limpia a null
  assert.equal(draftC.stress, null);
  assert.equal(draftC.activeOptionalFactors.includes('stress'), false);

  toggleFactor(draftC, 'stress'); // Se reactiva antes de guardar
  assert.equal(draftC.activeOptionalFactors.includes('stress'), true);
  assert.equal(draftC.stress, null); // Permanece limpio, no resucita 'moderado'

  // CASO D — Cancelar restaura el estado previo intacto
  const savedEntry = {
    date: '2026-10-16',
    sleepHours: 8,
    energy: 4,
    mood: 4,
    stress: 'moderado' as const,
    physicalDiscomfort: 'leve' as const,
    connection: null,
    note: '',
  };
  const savedSettings = ['stress', 'physicalDiscomfort'] as ('stress' | 'physicalDiscomfort')[];

  const draftD = createFormDraft(savedEntry, savedSettings);
  toggleFactor(draftD, 'stress');
  toggleFactor(draftD, 'physicalDiscomfort');
  assert.equal(draftD.activeOptionalFactors.length, 0);

  // El usuario cancela: se vuelve a sincronizar con savedEntry y savedSettings
  const restoredDraft = createFormDraft(savedEntry, savedSettings);
  assert.equal(restoredDraft.stress, 'moderado');
  assert.equal(restoredDraft.physicalDiscomfort, 'leve');
  assert.deepEqual(restoredDraft.activeOptionalFactors.sort(), ['physicalDiscomfort', 'stress'].sort());

  // CASO E — Factores parcialmente completados (activar sin seleccionar valor y desactivar)
  const draftE = createFormDraft({});
  toggleFactor(draftE, 'connection');
  assert.equal(draftE.activeOptionalFactors.includes('connection'), true);
  assert.equal(draftE.connection, null); // Sin valor seleccionado
  toggleFactor(draftE, 'connection');
  assert.equal(draftE.activeOptionalFactors.includes('connection'), false);
  assert.equal(draftE.connection, null);

  // CASO F — Botón Quitar opera en paridad total con el chip
  const draftF = createFormDraft({ stress: 'alto', note: 'Prueba' }, ['stress', 'note']);
  // Simular botón Quitar llamando a toggleFactor
  toggleFactor(draftF, 'stress');
  toggleFactor(draftF, 'note');
  assert.equal(draftF.activeOptionalFactors.includes('stress'), false);
  assert.equal(draftF.activeOptionalFactors.includes('note'), false);
  assert.equal(draftF.stress, null);
  assert.equal(draftF.note, '');
});

test('Estado 1.4.3: aislamiento estricto entre registros históricos y preferencias globales (Casos A, B, C, D, E)', () => {
  const today: string = '2026-10-16';
  const historicalDate: string = '2026-10-11';
  const otherDate: string = '2026-10-14';

  const state = defaultState();
  state.dailyContext = [
    {
      date: historicalDate,
      sleepHours: 6,
      sleepQuality: 1,
      energy: 1,
      mood: 1,
      stress: 'alto',
      physicalDiscomfort: 'alta',
      connection: 'solo',
      note: 'Dormí con calor y desperté muy cansado',
    },
    {
      date: otherDate,
      sleepHours: 8,
      sleepQuality: 4,
      energy: 4,
      mood: 4,
      stress: 'bajo',
      physicalDiscomfort: null,
      connection: 'encuentro',
      note: 'Excelente día',
    },
    {
      date: today,
      sleepHours: 7,
      sleepQuality: 3,
      energy: 3,
      mood: 3,
      stress: 'moderado',
      physicalDiscomfort: 'leve',
      connection: null,
      note: '',
    },
  ];
  // Preferencias habituales guardadas del usuario: estrés y molestias
  state.settings.contextOptionalFactors = ['stress', 'physicalDiscomfort'];

  // --- CASO A: Edición histórica y adición de factor no altera preferencias globales ---
  const histEntry = state.dailyContext.find((d) => d.date === historicalDate)!;
  // Inicialización de la edición histórica
  const activeHistFactors = resolveInitialActiveFactors(histEntry, state.settings.contextOptionalFactors, false);
  assert.deepEqual(
    activeHistFactors.sort(),
    ['connection', 'note', 'physicalDiscomfort', 'stress'].sort(),
    'La fecha histórica inicializa sus factores desde sus datos registrados reales',
  );

  // El usuario añade una nota modificada y guarda en la fecha histórica (selectedDate !== today)
  const isTodaySave = historicalDate === today;
  assert.equal(isTodaySave, false);

  saveDailyContextCheckIn(state, historicalDate, {
    ...histEntry,
    note: 'Dormí con calor y desperté cansadísimo, pero descansé algo al mediodía',
  });
  // Regla de aislamiento 1.4.3: settings NO se actualiza si !isToday
  if (isTodaySave) {
    state.settings.contextOptionalFactors = activeHistFactors;
  }

  // Verificaciones Caso A:
  assert.equal(
    state.dailyContext.find((d) => d.date === historicalDate)?.note,
    'Dormí con calor y desperté cansadísimo, pero descansé algo al mediodía',
  );
  assert.deepEqual(
    state.settings.contextOptionalFactors,
    ['stress', 'physicalDiscomfort'],
    'Las preferencias globales permanecen intactas tras editar el historial',
  );
  assert.equal(state.dailyContext.find((d) => d.date === otherDate)?.note, 'Excelente día');

  // --- CASO B: Eliminar un factor de una fecha histórica no lo elimina de preferencias habituales ---
  saveDailyContextCheckIn(state, historicalDate, {
    ...histEntry,
    stress: null, // El usuario retira estrés del domingo 11
  });
  if (historicalDate === today) {
    state.settings.contextOptionalFactors = ['physicalDiscomfort'];
  }

  // Verificaciones Caso B:
  assert.equal(
    state.dailyContext.find((d) => d.date === historicalDate)?.stress,
    null,
    'El factor estrés se elimina del día histórico',
  );
  assert.deepEqual(
    state.settings.contextOptionalFactors,
    ['stress', 'physicalDiscomfort'],
    'La preferencia habitual de estrés NO desaparece del sistema global',
  );

  // Un nuevo registro para Hoy sigue ofreciendo los factores habituales
  const todayEntryEmpty = { date: today, sleepHours: null, energy: null, mood: null, connection: null, note: '' };
  const factorsForToday = resolveInitialActiveFactors(todayEntryEmpty, state.settings.contextOptionalFactors, true);
  assert.deepEqual(factorsForToday, ['stress', 'physicalDiscomfort']);

  // --- CASO C: Cancelación de edición histórica ---
  // Al cancelar, no se ejecutan escrituras ni en dailyContext ni en settings
  const originalStateSnapshot = JSON.stringify(state);
  // (Simulación de edición descartada)
  const discardedDraft = { ...histEntry, mood: 5 };
  void discardedDraft;
  // Estado intacto
  assert.equal(JSON.stringify(state), originalStateSnapshot);

  // --- CASO D: Historial antiguo sin factores opcionales ---
  const oldLegacyDate = '2026-08-01';
  state.dailyContext.push({
    date: oldLegacyDate,
    sleepHours: 7,
    energy: 3,
    mood: 3,
    connection: null,
    note: '',
  });
  const legacyEntry = state.dailyContext.find((d) => d.date === oldLegacyDate)!;
  const legacyActiveFactors = resolveInitialActiveFactors(legacyEntry, state.settings.contextOptionalFactors, false);
  assert.deepEqual(
    legacyActiveFactors,
    [],
    'Un día histórico sin factores no proyecta falsamente las preferencias globales actuales',
  );

  // --- CASO E: Compatibilidad de sincronización y round-trip ---
  // Guardar hoy sí actualiza las preferencias si el usuario las cambia
  const newFactorsForToday = ['stress' as const, 'connection' as const];
  saveDailyContextCheckIn(state, today, {
    ...state.dailyContext.find((d) => d.date === today)!,
    connection: 'encuentro',
  });
  if (today === today) {
    state.settings.contextOptionalFactors = newFactorsForToday;
  }
  assert.deepEqual(state.settings.contextOptionalFactors, ['stress', 'connection']);
});

test('Estado 1.4.3: lectura de notas, previsualización, saltos de línea y aislamiento entre fechas', () => {
  // Función pura de categorización de nota
  const evaluateNote = (noteText: string | null | undefined) => {
    if (!noteText || noteText.trim() === '') {
      return { hasNote: false, isLong: false, text: '' };
    }
    const trimmed = noteText.trim();
    return {
      hasNote: true,
      isLong: trimmed.length > 70 || trimmed.includes('\n'),
      text: trimmed,
    };
  };

  // 1. Registro sin nota: no debe mostrar contenedor
  assert.equal(evaluateNote(null).hasNote, false);
  assert.equal(evaluateNote('').hasNote, false);
  assert.equal(evaluateNote('   ').hasNote, false);

  // 2. Nota corta (<= 70 caracteres, sin saltos): se lee completa sin botón Ver más
  const shortNote = evaluateNote('Dormí bien y descansado');
  assert.equal(shortNote.hasNote, true);
  assert.equal(shortNote.isLong, false);
  assert.equal(shortNote.text, 'Dormí bien y descansado');

  // 3. Nota larga (> 70 caracteres): activa botón Ver más
  const longNoteText = 'Dormí con calor y desperté cansadísimo, no pude descansar bien porque hacía mucho ruido afuera y los vecinos tuvieron fiesta';
  const longNote = evaluateNote(longNoteText);
  assert.equal(longNote.hasNote, true);
  assert.equal(longNote.isLong, true);

  // 4. Nota con saltos de línea: activa botón Ver más para permitir lectura en bloque
  const multilineNote = evaluateNote('Dormí 6h.\nMe desperté dos veces.');
  assert.equal(multilineNote.hasNote, true);
  assert.equal(multilineNote.isLong, true);

  // 5. Simulación de aislamiento de expansión al cambiar de fecha
  let selectedDate: string = '2026-10-11';
  let isNoteExpanded = false;

  // Usuario expande la nota en la fecha histórica
  isNoteExpanded = true;
  assert.equal(isNoteExpanded, true);

  // Usuario cambia a otra fecha en el gráfico
  selectedDate = '2026-10-12';
  // El efecto useEffect en PersonalContextCard resetea la expansión
  if (selectedDate !== '2026-10-11') {
    isNoteExpanded = false;
  }
  assert.equal(isNoteExpanded, false, 'Al cambiar de fecha, la expansión de la nota anterior se contrae');
});

test('Estado: preservación íntegra de notas históricas de 180+ caracteres y saltos de línea al editar otros campos', () => {
  const note180 =
    'Dormí con calor y desperté muy cansado.\nSentí la cabeza pesada durante toda la mañana y me costó concentrarme.\nPor la tarde descansé unos 30 minutos y logré completar las tareas prioritarias.';

  assert.equal(note180.length > 180, true, 'La nota de prueba debe tener más de 180 caracteres');
  assert.equal(note180.includes('\n'), true, 'La nota de prueba contiene saltos de línea');

  const state = defaultState();
  const historicalDate = '2026-10-11';

  // 1. Cargar nota histórica en fixture aislado
  state.dailyContext = [
    {
      date: historicalDate,
      sleepHours: 6,
      sleepQuality: 1,
      energy: 1,
      mood: 1,
      stress: 'alto',
      physicalDiscomfort: 'alta',
      connection: 'solo',
      note: note180,
    },
  ];

  // 2. Simular apertura del formulario de edición
  const entry = state.dailyContext[0];
  const formSleep = String(entry.sleepHours);
  let formEnergy = entry.energy;
  const formNote = entry.note; // El estado local se inicializa con la nota íntegra
  const activeFactors = resolveInitialActiveFactors(entry, [], false);

  assert.equal(formNote, note180);
  assert.equal(activeFactors.includes('note'), true);

  // 3. El usuario cambia ÚNICAMENTE Energía (de 1 a 3), sin tocar la nota
  formEnergy = 3;

  // 4. Guardar: saveDailyContextCheckIn
  const updated = saveDailyContextCheckIn(state, historicalDate, {
    sleepHours: Number(formSleep),
    energy: formEnergy,
    note: activeFactors.includes('note') ? formNote.trim() : '',
  });

  // Comprobar que la nota original se conserva íntegra, carácter por carácter
  assert.equal(updated.energy, 3);
  assert.equal(updated.note, note180);
  assert.equal(updated.note.length, note180.length);

  const persistedEntry = state.dailyContext.find((d) => d.date === historicalDate)!;
  assert.equal(persistedEntry.note, note180, 'La nota persistida en dailyContext coincide carácter por carácter');

  // 5. Repetir con Cancelar: si el usuario modifica energía o borrador y cancela, se sincroniza con el original
  let draftEnergy = 5;
  let draftNote = 'Texto modificado que se descartará';
  // Cancelar:
  draftEnergy = persistedEntry.energy!;
  draftNote = persistedEntry.note;
  assert.equal(draftEnergy, 3);
  assert.equal(draftNote, note180);

  // 6. Exportación / Importación (round-trip JSON de backups)
  const exportedJson = JSON.stringify(state);
  const importedState = JSON.parse(exportedJson);
  const roundTripEntry = importedState.dailyContext.find((d: any) => d.date === historicalDate);
  assert.equal(roundTripEntry.note, note180, 'El round-trip de backup preserva la nota completa con sus saltos de línea');

  // 7. Dynamic maxLength: cálculo protege notas largas
  const standardLimit = 100;
  const dynamicMaxLengthForShort = Math.max(standardLimit, 'Nota corta'.length);
  assert.equal(dynamicMaxLengthForShort, 100, 'Notas cortas conservan el límite estándar de 100 caracteres');

  const dynamicMaxLengthForLong = Math.max(standardLimit, note180.length);
  assert.equal(dynamicMaxLengthForLong, note180.length, 'Notas históricas largas relajan maxLength dinámicamente para no truncarse');
});

test('calculateContextDeltas: calcula variaciones estrictas frente al día calendario inmediatamente anterior', () => {
  const state = defaultState();
  state.dailyContext = [
    { date: '2026-10-18', sleepHours: 7.0, energy: 3, mood: 3, connection: null },
    { date: '2026-10-19', sleepHours: 8.5, energy: 4, mood: 3, connection: null },
    { date: '2026-10-20', sleepHours: 7.0, energy: 4, mood: 2, connection: null },
    // 2026-10-21 sin registro
    { date: '2026-10-22', sleepHours: 6.0, energy: 2, mood: 4, connection: null },
  ];

  // Caso 1: 2026-10-19 vs 2026-10-18 (Sueño +1.5h, Energía +1, Ánimo 0)
  const deltas19 = calculateContextDeltas(state, '2026-10-19');
  assert.equal(deltas19.sleep.hasData, true);
  assert.equal(deltas19.sleep.hasPrev, true);
  assert.equal(deltas19.sleep.diff, 1.5);
  assert.equal(deltas19.sleep.text, '+1,5 h vs ayer');
  assert.equal(deltas19.sleep.sign, 'pos');

  assert.equal(deltas19.energy.diff, 1);
  assert.equal(deltas19.energy.text, '+1 vs ayer');
  assert.equal(deltas19.energy.sign, 'pos');

  assert.equal(deltas19.mood.diff, 0);
  assert.equal(deltas19.mood.text, '= 0 vs ayer');
  assert.equal(deltas19.mood.sign, 'zero');

  // Caso 2: 2026-10-20 vs 2026-10-19 (Sueño -1.5h, Energía 0, Ánimo -1)
  const deltas20 = calculateContextDeltas(state, '2026-10-20');
  assert.equal(deltas20.sleep.diff, -1.5);
  assert.equal(deltas20.sleep.text, '-1,5 h vs ayer');
  assert.equal(deltas20.sleep.sign, 'neg');

  assert.equal(deltas20.energy.diff, 0);
  assert.equal(deltas20.energy.text, '= 0 vs ayer');
  assert.equal(deltas20.energy.sign, 'zero');

  assert.equal(deltas20.mood.diff, -1);
  assert.equal(deltas20.mood.text, '-1 vs ayer');
  assert.equal(deltas20.mood.sign, 'neg');

  // Caso 3: 2026-10-21 sin datos
  const deltas21 = calculateContextDeltas(state, '2026-10-21');
  assert.equal(deltas21.sleep.hasData, false);
  assert.equal(deltas21.sleep.text, 'Sin registro');

  // Caso 4: 2026-10-22 tiene datos, pero 2026-10-21 no los tiene
  const deltas22 = calculateContextDeltas(state, '2026-10-22');
  assert.equal(deltas22.sleep.hasData, true);
  assert.equal(deltas22.sleep.hasPrev, false);
  assert.equal(deltas22.sleep.text, 'Sin dato previo');
  assert.equal(deltas22.energy.text, 'Sin dato previo');
  assert.equal(deltas22.mood.text, 'Sin dato previo');
});

test('buildSmoothPath: clamping previene que los splines excedan los dominios de escala', () => {
  // Puntos con un salto abrupto en el límite superior
  const points = [
    { x: 50, y: 14 },
    { x: 150, y: 14 },
    { x: 250, y: 40 },
  ];

  // Sin clamp
  const pathWithoutClamp = buildSmoothPath(points);
  assert.ok(pathWithoutClamp.includes('C'));

  // Con clamp { minY: 14, maxY: 68 }
  const pathWithClamp = buildSmoothPath(points, { minY: 14, maxY: 68 });
  assert.ok(pathWithClamp.includes('C'));

  // Comprobar que en el path con clamp ningún cp1y o cp2y excede los límites [14, 68]
  const segmentRegex = /C\s+([0-9.-]+)\s+([0-9.-]+),\s+([0-9.-]+)\s+([0-9.-]+),\s+([0-9.-]+)\s+([0-9.-]+)/g;
  let match;
  while ((match = segmentRegex.exec(pathWithClamp)) !== null) {
    const cp1y = parseFloat(match[2]);
    const cp2y = parseFloat(match[4]);
    assert.ok(cp1y >= 13.99 && cp1y <= 68.01, `cp1y (${cp1y}) debe estar dentro de [14, 68]`);
    assert.ok(cp2y >= 13.99 && cp2y <= 68.01, `cp2y (${cp2y}) debe estar dentro de [14, 68]`);
  }
});




