import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayKeyFromDate, defaultState, todayISO } from '../lib/storage';
import { getDismissedAttentionItems } from '../lib/todayAttention';
import { DashboardView } from './DashboardView';
import { PersonalContextCard } from './PersonalContextCard';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { TodayFocus } from './TodayFocus';

test('Estado vacío mantiene registro y siete fechas sin montar indicadores ni gráfico vacíos', () => {
  const html = renderToStaticMarkup(<PersonalContextCard state={defaultState()} onUpdateState={() => true} />);
  assert.match(html, /¿Cómo estás hoy\?/);
  assert.match(html, />Registrar</);
  assert.match(html, />Ahora no</);
  assert.match(html, /today-state-empty-history/);
  assert.equal((html.match(/Seleccionar día\./g) || []).length, 7);
  assert.doesNotMatch(html, /today-state-kpi-strip|S\/D|Gráfico de evolución|Vista del gráfico/);
});

test('Estado con un cero real conserva valores y gráfico con huecos', () => {
  const state = defaultState();
  state.dailyContext.push({ date: todayISO(), sleepHours: 0, energy: 2, mood: null, connection: null });
  const html = renderToStaticMarkup(<PersonalContextCard state={state} onUpdateState={() => true} />);
  assert.match(html, /today-state-kpi-strip/);
  assert.match(html, /0 h/);
  assert.match(html, /2\/5/);
  assert.match(html, /Gráfico de evolución/);
  assert.match(html, /S\/D/);
  assert.doesNotMatch(html, /today-state-empty-history/);
});

test('los vencimientos financieros en Radar y avisos descartados no filtran importes en HTML ni atributos bajo privacidad y no duplican banners', () => {
  const state = defaultState();
  state.finance.commitments.push({ id: 'private', name: 'Servicio $U 7689,45', amount: 3500, frequency: 'once', nextDueDate: todayISO(), active: true });
  const render = () => renderToStaticMarkup(<DashboardView state={state} onUpdateState={() => true} onNavigate={() => {}} onExportJSON={() => {}} />);
  const publicHtml = render();
  assert.match(publicHtml, /3\.500/);
  assert.doesNotMatch(publicHtml, /Ver cuota|vencimiento hoy/, 'Los vencimientos financieros viven en Radar sin duplicar banner horizontal');
  assert.doesNotMatch(publicHtml, />[^<]*moneda sin confirmar[^<]*</i, 'No imprime texto técnico literal visible en Radar');
  assert.match(publicHtml, /title="Moneda sin confirmar en Finanzas"/, 'Usa tooltip discreto en hover');
  state.settings.privacyMode = true;
  const html = render();
  assert.doesNotMatch(html, /3\.500|3500|7689/);
  assert.match(html, /Servicio \$U ••••/);
  state.settings.dismissedAttentionKeys = [`finance_commitment:private:${todayISO()}`];
  const dismissedHtml = renderToStaticMarkup(<DismissedAttentionModal open onClose={() => {}} dismissedItems={getDismissedAttentionItems(state)} onRestoreItem={() => {}} onRestoreAll={() => {}} />);
  assert.doesNotMatch(dismissedHtml, /3\.500|3500|7689/);
  assert.match(dismissedHtml, /Restaurar/);
  state.settings.privacyMode = false;
  state.settings.dismissedAttentionKeys = [];
  assert.match(render(), /3\.500/);
});

test('una primera revisión no aparece vacía ni se presenta como una revisión ya incumplida', () => {
  const state = defaultState();
  const render = () => renderToStaticMarkup(<WeeklyReviewCard state={state} onUpdateState={() => {}} onNavigate={() => {}} />);
  assert.equal(render(), '');
  state.todayExtras.push({ id: 'task', text: 'Actividad propia', date: todayISO(), done: false, priority: 'media' });
  assert.match(render(), /Revisá tu semana/);
  assert.doesNotMatch(render(), /Revisión semanal pendiente|señal/);
  assert.equal(state.settings.lastWeeklyReviewAt, null);
});

test('TodayFocus: muestra motivos con prefijo cuando motivosVisibles es true y los oculta cuando es false o manual', () => {
  const today = todayISO();
  const priorities = [
    { id: 'p-smart', date: today, text: 'Repasar examen', done: false, rank: 1, reasons: ['Examen hoy', 'Impacto académico alto'] },
    { id: 'p-manual', date: today, text: 'Tarea manual', done: false, rank: 2 },
  ];

  const htmlVisible = renderToStaticMarkup(
    <TodayFocus
      priorities={priorities}
      onAdd={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      motivosVisibles={true}
      onToggleMotivos={() => {}}
    />
  );
  assert.match(htmlVisible, /Sugerido por: Examen hoy · Impacto académico alto/);
  assert.equal((htmlVisible.match(/Sugerido por:/g) || []).length, 1);

  const htmlHidden = renderToStaticMarkup(
    <TodayFocus
      priorities={priorities}
      onAdd={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      motivosVisibles={false}
      onToggleMotivos={() => {}}
    />
  );
  assert.doesNotMatch(htmlHidden, /Sugerido por:/);
});

test('Hoy V3: renderiza hero integrado con mini sparkline, Spotlight reactivo, Tu día con jerarquía invertida, Hábitos separados y Radar + Registro de hoy sin % punitivo ni subtítulos didácticos', () => {
  const state = defaultState();
  const today = todayISO();
  const dayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));

  const yesterdayDate = new Date(`${today}T12:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  state.dailyContext.push(
    { date: yesterday, sleepHours: 7, energy: 3, mood: 4, connection: null },
    { date: today, sleepHours: 7.5, energy: 4, mood: 5, connection: null }
  );
  state.agenda[dayKey] = [
    { id: 'blk-done', time: '08:00', activity: 'Lectura matinal' },
    { id: 'blk-study', time: '10:00', activity: 'Estudio de Redes' },
    { id: 'blk-gym', time: '18:00', activity: 'Gimnasio' },
  ];
  state.taskLog[today] = { 'blk-done': true };
  state.gym.routineTemplates = [
    {
      id: 'tpl-push',
      name: 'Empuje A',
      days: [dayKey],
      exercises: [{ id: 'e1', name: 'Press', sets: [] }],
    },
  ];
  state.tasksRecurring = [{ id: 'hab-1', name: 'Tomar agua', freq: 'daily' }];
  state.study.studyLog = [{ id: 'sl-1', date: today, minutes: 50 }];

  const html = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T10:20:00`)}
      initialSkippedKeys={['agenda-blk-gym']}
    />
  );

  // Hero alpino con degradado integrado (sin caja flotante) + píldora compacta con mini sparkline 56x20
  assert.match(html, /data-hero-gradient="true"/);
  assert.doesNotMatch(html, /today-hero-copy-plate/);
  assert.match(html, /7,5 h · 4\/5 · 5\/5/);
  assert.match(html, /data-status-sparkline="true"/);

  // Sin barra inline redundante ni banda de Actividad reciente
  assert.doesNotMatch(html, /today-command-bar/);
  assert.doesNotMatch(html, /Actividad reciente/);

  // Cero subtítulos didácticos en las secciones
  assert.doesNotMatch(html, /Bloques horarios y pendientes reales/);
  assert.doesNotMatch(html, /Próximos hitos y vencimientos/);
  assert.doesNotMatch(html, /Avance automático en tus módulos/);

  // Spotlight reactivo en curso a las 10:20 (bloque de estudio)
  assert.match(html, /data-spotlight-mode="current"/);
  assert.match(html, /data-spotlight-domain="study"/);
  assert.match(html, /Estudio de Redes/);
  assert.match(html, /Iniciar estudio \(25 min\)/);

  // Tu día con menú contextual (•••), bloque completado apagado ("Hecho") y bloque omitido ("Omitido")
  assert.match(html, /id="today-agenda-title"[^>]*>Tu día/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, />Hecho</);
  assert.match(html, /data-skipped="true"/);
  assert.match(html, />Omitido</);

  // Micro-hábitos en su propia tira
  assert.match(html, /id="today-habits-title"[^>]*>Hábitos de hoy/);
  assert.match(html, /Tomar agua/);

  // Columna derecha: Radar y Registro de hoy SIN porcentaje punitivo ni barra de progreso + botón Historial
  assert.match(html, /id="today-radar-title"[^>]*>Radar/);
  assert.match(html, /id="today-record-title"[^>]*>Registro de hoy/);
  assert.match(html, />Historial</);
  assert.match(html, /50 min/);
  assert.match(html, /1 hecho/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.doesNotMatch(html, /Pulso de hoy/);

  // Simetría de columnas (items-stretch)
  assert.match(html, /items-stretch/);

  // Modal de Estado/Evolución cerrado por defecto
  assert.doesNotMatch(html, /id="daily-status-modal-title"/);
  assert.doesNotMatch(html, /Gráfico de evolución/);
});

test('Hoy V3: abrir el modal de Estado muestra el editor diario y el gráfico de evolución de 7 días bajo demanda', () => {
  const state = defaultState();
  const today = todayISO();
  state.dailyContext.push({ date: today, sleepHours: 8, energy: 5, mood: 4, connection: null });

  const html = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T14:00:00`)}
      initialStatusModalOpen={true}
    />
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /id="daily-status-modal-title"/);
  assert.match(html, /Estado de hoy y evolución \(7 días\)/);
  // Sin doble encabezado ni jaula cuadrada detrás del ícono en el modal
  assert.doesNotMatch(html, /id="today-context-title"/);
  assert.doesNotMatch(html, /today-section-icon-state/);
  assert.match(html, /Gráfico de evolución/);
  assert.match(html, /8 h/);
});

test('Hoy V3: sin bloques oculta Spotlight duplicado y muestra un único estado vacío limpio; con bloque lejano (>2h) calma el CTA', () => {
  const emptyState = defaultState();
  const today = todayISO();

  const emptyHtml = renderToStaticMarkup(
    <DashboardView
      state={emptyState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      onOpenCapture={() => {}}
      nowOverride={new Date(`${today}T11:00:00`)}
    />
  );

  // Sin Spotlight duplicado cuando el día está vacío
  assert.doesNotMatch(emptyHtml, /id="today-spotlight-title"/);
  assert.match(emptyHtml, /Tu día está despejado\./);
  assert.match(emptyHtml, /Agregar bloque/);
  // Estado vacío colapsado en un único botón
  assert.match(emptyHtml, /Registrar estado de hoy/);
  assert.doesNotMatch(emptyHtml, /data-status-sparkline="true"/);

  // Con bloque a >2h (10:00 vs 16:00) muestra Spotlight con CTA sereno y sin repetir "Agenda"
  const scheduledState = defaultState();
  const dayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));
  scheduledState.agenda[dayKey] = [{ id: 'blk-study', time: '16:00', activity: 'Estudio de Física' }];

  const scheduledHtml = renderToStaticMarkup(
    <DashboardView
      state={scheduledState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T10:00:00`)}
    />
  );

  assert.match(scheduledHtml, /data-spotlight-calm="true"/);
  assert.match(scheduledHtml, /Preparar bloque/);
  assert.doesNotMatch(scheduledHtml, /Iniciar estudio \(25 min\)/);
  assert.doesNotMatch(scheduledHtml, />Agenda</);
});

test('Hoy V3 cierre: con 1 solo día de estado oculta sparkline vacío, y el botón Historial abre modal de Actividad reciente bajo demanda', () => {
  const state = defaultState();
  const today = todayISO();
  state.dailyContext.push({ date: today, sleepHours: 8, energy: 4, mood: 5, connection: null });
  state.study.subjects.push({ id: 'sub-mat', name: 'Matemática' });
  state.study.studyLog.push({ id: 'sl-hist', date: today, minutes: 35, subjectId: 'sub-mat', subjectName: 'Matemática' });

  const closedHtml = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T14:00:00`)}
    />
  );

  // Con <2 días NO se renderiza el SVG del sparkline (sin hueco vacío junto a 8 h · 4/5 · 5/5)
  assert.match(closedHtml, /8 h · 4\/5 · 5\/5/);
  assert.doesNotMatch(closedHtml, /data-status-sparkline="true"/);
  assert.doesNotMatch(closedHtml, /id="recent-activity-modal-title"/);

  // Al abrir el modal de Historial aparece Actividad reciente bajo demanda
  const openHtml = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T14:00:00`)}
      initialActivityModalOpen={true}
    />
  );

  assert.match(openHtml, /id="recent-activity-modal-title"/);
  assert.match(openHtml, /Actividad reciente/);
  assert.match(openHtml, /Matemática/);
});

test('Bloque 3: Hoy oculta el aviso de copia de seguridad cuando el workspace está vacío y lo muestra con actividad real', () => {
  const emptyState = defaultState();
  const today = todayISO();

  // Workspace completamente vacío: nunca muestra el aviso de copia de seguridad
  const emptyHtml = renderToStaticMarkup(
    <DashboardView
      state={emptyState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T12:00:00`)}
    />
  );
  assert.doesNotMatch(emptyHtml, /No hay una copia de seguridad registrada/);

  // Incluso si solo tiene una plantilla inicial de gimnasio sin sesiones reales ni otros datos
  const templateOnlyState = defaultState();
  templateOnlyState.gym.routineTemplates.push({
    id: 'tpl-starter',
    name: 'Full Body A',
    days: [],
    exercises: [{ id: 'e1', name: 'Sentadilla', sets: [] }],
  });
  const templateOnlyHtml = renderToStaticMarkup(
    <DashboardView
      state={templateOnlyState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T12:00:00`)}
    />
  );
  assert.doesNotMatch(templateOnlyHtml, /No hay una copia de seguridad registrada/);

  // Al cargar actividad real (ej. un movimiento financiero), sí muestra el aviso de copia de seguridad
  const activeState = defaultState();
  activeState.finance.transactions.push({
    id: 'tx-1',
    accountId: activeState.finance.accounts[0].id,
    amount: 1200,
    type: 'gasto',
    category: 'Comida',
    date: today,
    fixed: 'variable',
  });
  const activeHtml = renderToStaticMarkup(
    <DashboardView
      state={activeState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T12:00:00`)}
    />
  );
  assert.match(activeHtml, /Copia de seguridad:/);
  assert.match(activeHtml, /No hay una copia de seguridad registrada/);
});
