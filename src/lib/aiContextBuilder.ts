import type {
  CalendarEvent,
  DayKey,
  Exam,
  FinancialCommitment,
  LifeOSState,
  TodayExtra,
  Transaction,
} from '../types';
import {
  DAY_LABELS,
  DAYS,
  dayKeyFromDate,
  daysBetween,
  formatMoney,
  fromCents,
  todayISO,
} from './storage';
import { isModuleEnabled } from './moduleVisibility';
import {
  getJobApplicationType,
  getJobStageLabel,
  getNextJobKeyDate,
  isJobApplicationActive,
  JOB_KEY_DATE_LABELS,
} from './jobApplications';
import {
  getGymProgressMetrics,
  getPerformedExerciseSets,
  getPerformedGymVolume,
  isPerformedGymSession,
  selectBestPerformedSet,
} from './gymMetrics';

export type AIGoalId =
  | 'organizar_dia'
  | 'revisar_finanzas'
  | 'plan_estudio'
  | 'analizar_entrenamiento'
  | 'impulsar_negocio'
  | 'busqueda_laboral';

export type AIContextMode = 'guided' | 'data_only';

export type AIContextTimeWindowDays = 7 | 30 | 90;

export const AI_CONTEXT_TIME_WINDOWS: readonly {
  days: AIContextTimeWindowDays;
  label: string;
}[] = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

export const DEFAULT_AI_TIME_WINDOW_DAYS: AIContextTimeWindowDays = 30;

export type AIContextModuleId =
  | 'hoy_agenda'
  | 'finanzas'
  | 'estudios'
  | 'gimnasio'
  | 'trabajo'
  | 'negocio'
  | 'notas';

export interface AIContextModuleOption {
  id: AIContextModuleId;
  label: string;
}

export interface AIGoalDefinition {
  id: AIGoalId;
  title: string;
  description: string;
  defaultModules: readonly AIContextModuleId[];
  instruction: string;
}

export interface AIGoalDataIndicator {
  hasData: boolean;
  label: string;
}

export interface AIContextPromptOptions {
  goalId: AIGoalId | null;
  mode?: AIContextMode;
  selectedModules: readonly AIContextModuleId[];
  hideExactAmounts: boolean;
  timeWindowDays?: AIContextTimeWindowDays;
  customQuestion?: string;
  referenceDate?: string;
}

export interface AIContextPromptResult {
  mode: AIContextMode;
  goal: AIGoalDefinition | null;
  timeWindowDays: AIContextTimeWindowDays;
  includedModules: AIContextModuleId[];
  text: string;
  charCount: number;
  wordCount: number;
  hasAnyData: boolean;
}

export const AI_CONTEXT_MODULES: readonly AIContextModuleOption[] = [
  { id: 'hoy_agenda', label: 'Hoy y agenda' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'estudios', label: 'Estudios' },
  { id: 'gimnasio', label: 'Gimnasio' },
  { id: 'trabajo', label: 'Trabajo' },
  { id: 'negocio', label: 'Mi negocio' },
  { id: 'notas', label: 'Notas' },
] as const;

export const AI_GOALS: readonly AIGoalDefinition[] = [
  {
    id: 'organizar_dia',
    title: 'Organizar mi día y semana',
    description: 'Tareas de Hoy, bloques de Agenda, eventos y seguimientos.',
    defaultModules: ['hoy_agenda', 'trabajo'],
    instruction: [
      'Actuá como mi copiloto de organización personal. Con base en mis datos reales:',
      '1. Definí las 3 prioridades clave de hoy según urgencia e impacto.',
      '2. Proponé un orden realista para el resto de la semana respetando mis bloques y eventos.',
      '3. Señalá vencimientos, sobrecargas o seguimientos laborales que convenga destrabar antes.',
    ].join('\n'),
  },
  {
    id: 'revisar_finanzas',
    title: 'Revisar mis finanzas',
    description: 'Movimientos recientes, categorías, cuentas y compromisos.',
    defaultModules: ['finanzas'],
    instruction: [
      'Actuá como mi copiloto de finanzas personales. Con base en mis datos reales:',
      '1. Resumí cómo viene mi balance y distribución de gastos en el período.',
      '2. Detectá las 2 o 3 categorías o compromisos que requieren más atención.',
      '3. Proponé acciones concretas y realistas para ordenar mi flujo en los próximos 30 días.',
    ].join('\n'),
  },
  {
    id: 'plan_estudio',
    title: 'Armar plan de estudio',
    description: 'Materias activas, temas pendientes y exámenes cercanos.',
    defaultModules: ['estudios'],
    instruction: [
      'Actuá como mi tutor y planificador académico. Con base en mis datos reales:',
      '1. Ordená qué materias y temas estudiar primero según la cercanía de los exámenes.',
      '2. Armá un plan práctico por bloques de estudio para los próximos 7 días.',
      '3. Indicá en qué temas conviene hacer práctica o repaso activo para llegar con margen.',
    ].join('\n'),
  },
  {
    id: 'analizar_entrenamiento',
    title: 'Analizar mi entrenamiento',
    description: 'Sesiones recientes, rutinas, frecuencia y progresión.',
    defaultModules: ['gimnasio'],
    instruction: [
      'Actuá como mi entrenador de fuerza y acondicionamiento. Con base en mis datos reales:',
      '1. Evaluá mi constancia reciente y el equilibrio entre mis rutinas.',
      '2. Identificá qué ejercicios vienen progresando y dónde conviene ajustar carga, volumen o descanso.',
      '3. Proponé 3 ajustes concretos para mis próximas 2 semanas de entrenamiento.',
    ].join('\n'),
  },
  {
    id: 'impulsar_negocio',
    title: 'Impulsar mi negocio',
    description: 'Inventario, ventas, márgenes y flujo comercial.',
    defaultModules: ['negocio'],
    instruction: [
      'Actuá como mi asesor comercial y de rentabilidad. Con base en mis datos reales de Mi negocio:',
      '1. Evaluá el estado de mi inventario, ventas, márgenes y flujo comercial del período.',
      '2. Identificá qué productos o decisiones ofrecen mayor retorno o rotación esta semana.',
      '3. Señalá cuellos de botella en stock, precios o márgenes y proponé 3 acciones concretas.',
    ].join('\n'),
  },
  {
    id: 'busqueda_laboral',
    title: 'Mejorar mi búsqueda laboral',
    description: 'Postulaciones activas, estados y seguimientos próximos.',
    defaultModules: ['trabajo'],
    instruction: [
      'Actuá como mi estratega de carrera y búsqueda laboral. Con base en mis datos reales de Trabajo:',
      '1. Revisá el estado actual de mis postulaciones activas y en qué etapas se concentran.',
      '2. Ordená por prioridad los seguimientos, entrevistas y fechas clave de los próximos días.',
      '3. Proponé 3 pasos concretos para destrabar procesos y mejorar mi avance esta semana.',
    ].join('\n'),
  },
] as const;

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const FINANCIAL_LINKED_GOAL_SOURCES = new Set(['available', 'resale_profit', 'net_worth']);

function parseISODate(iso: string): Date {
  const clean = iso.slice(0, 10);
  return new Date(`${clean}T12:00:00`);
}

function formatReadableDate(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'sin fecha';
  const [year, monthStr, dayStr] = iso.slice(0, 10).split('-');
  const monthIdx = Number(monthStr) - 1;
  const dayNum = Number(dayStr);
  const monthName = MONTHS_SHORT[monthIdx] || monthStr;
  return `${dayNum} ${monthName} ${year}`;
}

function formatShortDayMonth(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'sin fecha';
  const [, monthStr, dayStr] = iso.slice(0, 10).split('-');
  const monthIdx = Number(monthStr) - 1;
  const dayNum = Number(dayStr);
  const monthName = MONTHS_SHORT[monthIdx] || monthStr;
  return `${dayNum} ${monthName}`;
}

function formatRelativeDays(delta: number): string {
  if (delta === 0) return 'hoy';
  if (delta === 1) return 'mañana';
  if (delta > 1) return `en ${delta} días`;
  if (delta === -1) return 'ayer';
  return `hace ${Math.abs(delta)} días`;
}

function cleanInlineText(value?: string | null, maxLen = 140): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

function formatPct(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function resolveCalendarEventDate(event: CalendarEvent, referenceDate: string): string | null {
  if (!event.date || !/^\d{4}-\d{2}-\d{2}/.test(event.date)) return null;
  if (!event.recurring) return event.date.slice(0, 10);
  const refYear = Number(referenceDate.slice(0, 4));
  const monthDay = event.date.slice(5, 10);
  const candidateThisYear = `${refYear}-${monthDay}`;
  if (candidateThisYear >= referenceDate) return candidateThisYear;
  return `${refYear + 1}-${monthDay}`;
}

function getUpcomingCalendarEvents(
  state: LifeOSState,
  referenceDate: string,
  horizonDays = 14
): Array<{ event: CalendarEvent; effectiveDate: string; delta: number }> {
  if (!isModuleEnabled(state, 'calendario')) return [];
  const list: Array<{ event: CalendarEvent; effectiveDate: string; delta: number }> = [];
  for (const event of state.calendarEvents || []) {
    const effectiveDate = resolveCalendarEventDate(event, referenceDate);
    if (!effectiveDate) continue;
    const delta = daysBetween(referenceDate, effectiveDate);
    if (delta >= 0 && delta <= horizonDays) {
      list.push({ event, effectiveDate, delta });
    }
  }
  return list.sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      (a.event.time || '99:99').localeCompare(b.event.time || '99:99')
  );
}

function normalizeTimeWindowDays(days?: number): AIContextTimeWindowDays {
  if (days === 7 || days === 30 || days === 90) return days;
  return DEFAULT_AI_TIME_WINDOW_DAYS;
}

function isWithinLookbackWindow(
  isoDate: string | null | undefined,
  referenceDate: string,
  lookbackDays: number
): boolean {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return false;
  const delta = daysBetween(isoDate.slice(0, 10), referenceDate);
  return delta >= 0 && delta <= lookbackDays;
}

export function buildContextMarkdownFilename(referenceDate: string = todayISO()): string {
  const cleanDate = /^\d{4}-\d{2}-\d{2}/.test(referenceDate) ? referenceDate.slice(0, 10) : todayISO();
  return `celestian-contexto-${cleanDate}.md`;
}

function buildCommercialDateLookups(commercial: NonNullable<LifeOSState['resale']['commercial']>) {
  const eventDateByKey = new Map<string, string>();
  const opDateById = new Map<string, string>();
  const financeDateBySourceId = new Map<string, string>();

  for (const op of commercial.operations || []) {
    if (op.commercialDate) opDateById.set(op.id, op.commercialDate);
  }

  const business = commercial.business;
  if (business) {
    for (const op of business.finished?.operations || []) {
      if (op.commercialDate) opDateById.set(op.id, op.commercialDate);
    }
    for (const entry of business.eventOrder || []) {
      if (entry.commercialDate) {
        eventDateByKey.set(`${entry.kind}:${entry.id}`, entry.commercialDate);
      }
    }
    const moneySourceByOriginKey = new Map<string, string>();
    for (const me of business.moneyEvents || []) {
      if (me.id && me.sourceId) {
        moneySourceByOriginKey.set(`commercial:${me.purpose}:${me.id}`, me.sourceId);
      }
    }
    for (const link of business.financeLinks || []) {
      const linkDate = link.choice?.date;
      if (!linkDate || !link.originKey) continue;
      const sourceId = moneySourceByOriginKey.get(link.originKey);
      if (sourceId && !financeDateBySourceId.has(sourceId)) {
        financeDateBySourceId.set(sourceId, linkDate);
      }
    }
  }

  return {
    getSaleDate(sale: { id: string; operationId: string }): string | undefined {
      return (
        eventDateByKey.get(`sale:${sale.id}`) ||
        opDateById.get(sale.operationId) ||
        financeDateBySourceId.get(sale.id)
      );
    },
    getPurchaseDate(purchase: { id: string }): string | undefined {
      return (
        eventDateByKey.get(`purchase:${purchase.id}`) ||
        opDateById.get(purchase.id) ||
        financeDateBySourceId.get(purchase.id)
      );
    },
  };
}

function getRecentTransactions(state: LifeOSState, referenceDate: string, lookbackDays = 30): Transaction[] {
  return (state.finance?.transactions || [])
    .filter((tx) => isWithinLookbackWindow(tx.date, referenceDate, lookbackDays))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function getActiveCommitments(state: LifeOSState): FinancialCommitment[] {
  return (state.finance?.commitments || [])
    .filter((c) => c.active !== false && c.status !== 'paid' && c.status !== 'cancelled')
    .sort((a, b) => (a.nextDueDate || '9999-99-99').localeCompare(b.nextDueDate || '9999-99-99'));
}

export function getVisibleContextModules(state: LifeOSState): AIContextModuleOption[] {
  return AI_CONTEXT_MODULES.filter((mod) => {
    switch (mod.id) {
      case 'hoy_agenda':
        return true; // Hoy (dashboard) is non-hideable
      case 'finanzas':
        return isModuleEnabled(state, 'finanzas');
      case 'estudios':
        return isModuleEnabled(state, 'estudios');
      case 'gimnasio':
        return isModuleEnabled(state, 'gimnasio');
      case 'trabajo':
        return isModuleEnabled(state, 'trabajo');
      case 'negocio':
        return isModuleEnabled(state, 'reventa');
      case 'notas':
        return isModuleEnabled(state, 'notas');
    }
  });
}

export function getGoalDefinition(goalId: AIGoalId): AIGoalDefinition {
  return AI_GOALS.find((goal) => goal.id === goalId) || AI_GOALS[0];
}

export function getDefaultModulesForGoal(goalId: AIGoalId, state: LifeOSState): AIContextModuleId[] {
  const goal = getGoalDefinition(goalId);
  const visibleIds = new Set(getVisibleContextModules(state).map((m) => m.id));
  const filtered = goal.defaultModules.filter((id) => visibleIds.has(id));
  if (filtered.length > 0) return filtered;
  return visibleIds.has('hoy_agenda') ? ['hoy_agenda'] : [];
}

export function getGoalDataIndicator(
  goalId: AIGoalId,
  state: LifeOSState,
  referenceDate: string = todayISO(),
  timeWindowDays: AIContextTimeWindowDays = DEFAULT_AI_TIME_WINDOW_DAYS
): AIGoalDataIndicator {
  const windowDays = normalizeTimeWindowDays(timeWindowDays);

  switch (goalId) {
    case 'organizar_dia': {
      const pendingTasks = (state.todayExtras || []).filter((t) => !t.done).length
        + (state.dailyPriorities || []).filter((p) => p.date === referenceDate && !p.done).length;
      const upcomingEvents = getUpcomingCalendarEvents(state, referenceDate, 14).length;
      const agendaBlocks = isModuleEnabled(state, 'agenda')
        ? DAYS.reduce((acc, day) => acc + (state.agenda?.[day]?.length || 0), 0)
        : 0;
      const jobFollowUps = isModuleEnabled(state, 'trabajo')
        ? (state.jobs?.applications || []).filter((app) => {
            if (!isJobApplicationActive(app)) return false;
            const next = getNextJobKeyDate(app, referenceDate);
            return Boolean(next && next.daysUntil <= 14);
          }).length
        : 0;

      const parts: string[] = [];
      if (pendingTasks > 0) parts.push(pluralize(pendingTasks, 'tarea', 'tareas'));
      if (upcomingEvents > 0) parts.push(pluralize(upcomingEvents, 'evento', 'eventos'));
      if (parts.length < 2 && agendaBlocks > 0) parts.push(pluralize(agendaBlocks, 'bloque', 'bloques'));
      if (parts.length < 2 && jobFollowUps > 0) parts.push(pluralize(jobFollowUps, 'seguimiento', 'seguimientos'));

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }

    case 'revisar_finanzas': {
      if (!isModuleEnabled(state, 'finanzas')) {
        return { hasData: false, label: 'Módulo oculto' };
      }
      const recentTx = getRecentTransactions(state, referenceDate, windowDays).length;
      const allTx = (state.finance?.transactions || []).length;
      const commitmentsCount =
        getActiveCommitments(state).length +
        (state.finance?.subscriptions || []).length +
        (state.finance?.debts || []).filter((d) => Number(d.amount) > 0).length +
        (state.finance?.agreements || []).filter((a) => a.status === 'active').length;
      const activeAccountsCount = (state.finance?.accounts || []).filter(
        (acc) => Number(acc.balance || 0) !== 0 || Number(acc.initialBalance || 0) !== 0
      ).length;

      const parts: string[] = [];
      if (recentTx > 0) parts.push(pluralize(recentTx, 'movimiento', 'movimientos'));
      if (commitmentsCount > 0) parts.push(pluralize(commitmentsCount, 'compromiso', 'compromisos'));
      if (parts.length < 2 && activeAccountsCount > 0) {
        parts.push(pluralize(activeAccountsCount, 'cuenta', 'cuentas'));
      }
      if (parts.length === 0 && allTx > 0) {
        parts.push(pluralize(allTx, 'movimiento', 'movimientos'));
      }

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }

    case 'plan_estudio': {
      if (!isModuleEnabled(state, 'estudios')) {
        return { hasData: false, label: 'Módulo oculto' };
      }
      const pendingExams = (state.study?.exams || []).filter((e) => e.status === 'pendiente').length;
      const subjectsCount = (state.study?.subjects || []).length;
      const pendingTopics = (state.study?.subjects || []).reduce(
        (sum, sub) => sum + (sub.topics || []).filter((t) => !t.done).length,
        0
      );

      const parts: string[] = [];
      if (pendingExams > 0) parts.push(pluralize(pendingExams, 'examen', 'exámenes'));
      if (subjectsCount > 0) parts.push(pluralize(subjectsCount, 'materia', 'materias'));
      if (parts.length < 2 && pendingTopics > 0) parts.push(pluralize(pendingTopics, 'tema pendiente', 'temas pendientes'));

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }

    case 'analizar_entrenamiento': {
      if (!isModuleEnabled(state, 'gimnasio')) {
        return { hasData: false, label: 'Módulo oculto' };
      }
      const performedAll = (state.gym?.sessions || []).filter(isPerformedGymSession);
      const performedInWindow = performedAll.filter((s) =>
        isWithinLookbackWindow(s.date, referenceDate, windowDays)
      ).length;
      const routinesCount = (state.gym?.routineTemplates || []).length;

      const parts: string[] = [];
      if (performedInWindow > 0) parts.push(pluralize(performedInWindow, 'sesión', 'sesiones'));
      else if (performedAll.length > 0 && routinesCount === 0) {
        parts.push(pluralize(performedAll.length, 'sesión', 'sesiones'));
      }
      if (routinesCount > 0) parts.push(pluralize(routinesCount, 'rutina', 'rutinas'));

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }

    case 'impulsar_negocio': {
      if (!isModuleEnabled(state, 'reventa')) {
        return { hasData: false, label: 'Módulo oculto' };
      }
      const inventory = state.resale?.inventory || [];
      const commercial = state.resale?.commercial;
      const stockCount = inventory.filter((item) => item.status === 'comprado').length;
      const commercialItems = commercial?.items?.length || 0;
      const soldResaleInWindow = inventory.filter(
        (item) =>
          item.status === 'vendido' &&
          isWithinLookbackWindow(item.sellDate || item.buyDate, referenceDate, windowDays)
      ).length;
      const lookups = commercial ? buildCommercialDateLookups(commercial) : null;
      const commercialSalesInWindow = (commercial?.business?.sales || []).filter((sale) => {
        const saleDate = lookups?.getSaleDate(sale);
        return !saleDate || isWithinLookbackWindow(saleDate, referenceDate, windowDays);
      }).length;

      const businessCount = stockCount + commercialItems;
      const salesInWindow = soldResaleInWindow + commercialSalesInWindow;
      const allSales =
        inventory.filter((item) => item.status === 'vendido').length +
        (commercial?.business?.sales?.length || 0);

      const parts: string[] = [];
      if (businessCount > 0) parts.push(pluralize(businessCount, 'artículo', 'artículos'));
      if (salesInWindow > 0) parts.push(pluralize(salesInWindow, 'venta', 'ventas'));
      else if (parts.length === 0 && allSales > 0) parts.push(pluralize(allSales, 'venta', 'ventas'));

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }

    case 'busqueda_laboral': {
      if (!isModuleEnabled(state, 'trabajo')) {
        return { hasData: false, label: 'Módulo oculto' };
      }
      const applications = state.jobs?.applications || [];
      const activeJobs = applications.filter(isJobApplicationActive);
      const upcomingFollowUps = activeJobs.filter((app) => {
        const next = getNextJobKeyDate(app, referenceDate);
        return Boolean(next && next.daysUntil <= 14);
      }).length;
      const closedJobs = applications.length - activeJobs.length;

      const parts: string[] = [];
      if (activeJobs.length > 0) parts.push(pluralize(activeJobs.length, 'postulación', 'postulaciones'));
      if (upcomingFollowUps > 0) parts.push(pluralize(upcomingFollowUps, 'seguimiento', 'seguimientos'));
      if (parts.length === 0 && closedJobs > 0) parts.push(pluralize(closedJobs, 'proceso cerrado', 'procesos cerrados'));

      return parts.length > 0
        ? { hasData: true, label: parts.slice(0, 2).join(' · ') }
        : { hasData: false, label: 'Sin datos aún' };
    }
  }
}

function buildHoyAgendaSection(state: LifeOSState, referenceDate: string): string | null {
  const lines: string[] = [];
  const todayKey: DayKey = dayKeyFromDate(parseISODate(referenceDate));

  // Daily check-in context
  const todayCheckin = (state.dailyContext || []).find((entry) => entry.date === referenceDate);
  if (todayCheckin) {
    const bits: string[] = [];
    if (typeof todayCheckin.sleepHours === 'number') bits.push(`sueño ${todayCheckin.sleepHours} h`);
    if (typeof todayCheckin.energy === 'number') bits.push(`energía ${todayCheckin.energy}/5`);
    if (typeof todayCheckin.mood === 'number') bits.push(`ánimo ${todayCheckin.mood}/5`);
    if (todayCheckin.stress) bits.push(`estrés ${todayCheckin.stress}`);
    if (bits.length > 0) {
      lines.push(`- Estado de hoy: ${bits.join(' · ')}`);
    }
    const note = cleanInlineText(todayCheckin.note, 120);
    if (note) lines.push(`- Nota del día: ${note}`);
  }

  // Daily priorities for today
  const priorities = (state.dailyPriorities || []).filter((p) => p.date === referenceDate);
  if (priorities.length > 0) {
    lines.push('- Prioridades de hoy:');
    for (const p of priorities.slice(0, 5)) {
      const status = p.done ? 'hecha' : 'pendiente';
      lines.push(`  - [${status}] ${cleanInlineText(p.text, 120)}`);
    }
  }

  // Pending tasks (TodayExtra)
  const priorityOrder: Record<TodayExtra['priority'], number> = { alta: 0, media: 1, baja: 2 };
  const pendingExtras = (state.todayExtras || [])
    .filter((t) => !t.done && cleanInlineText(t.text))
    .slice()
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
    });

  if (pendingExtras.length > 0) {
    lines.push(`- Tareas pendientes (${pendingExtras.length}):`);
    for (const task of pendingExtras.slice(0, 12)) {
      const meta: string[] = [`prioridad ${task.priority}`];
      if (task.dueDate && /^\d{4}-\d{2}-\d{2}/.test(task.dueDate)) {
        const delta = daysBetween(referenceDate, task.dueDate.slice(0, 10));
        meta.push(`vence ${formatShortDayMonth(task.dueDate)} (${formatRelativeDays(delta)})`);
      }
      if (task.time) meta.push(task.time);
      if (task.durationMinutes) meta.push(`${task.durationMinutes} min`);
      lines.push(`  - ${cleanInlineText(task.text, 120)} (${meta.join(', ')})`);
    }
    if (pendingExtras.length > 12) {
      lines.push(`  - … y ${pendingExtras.length - 12} tareas más.`);
    }
  }

  // Recurring tasks / habits
  const recurring = state.tasksRecurring || [];
  if (recurring.length > 0) {
    const todayLog = state.taskLog?.[referenceDate] || {};
    const pendingHabits = recurring.filter((r) => !todayLog[r.id]);
    const doneHabits = recurring.length - pendingHabits.length;
    const habitPreview = pendingHabits
      .slice(0, 6)
      .map((h) => (h.time ? `${cleanInlineText(h.name, 60)} (${h.time})` : cleanInlineText(h.name, 60)))
      .join(', ');
    lines.push(
      `- Rutinas activas: ${doneHabits}/${recurring.length} hechas hoy${habitPreview ? ` · pendientes: ${habitPreview}` : ''}`
    );
  }

  // Agenda blocks (respecting module visibility)
  if (isModuleEnabled(state, 'agenda')) {
    const todayBlocks = (state.agenda?.[todayKey] || [])
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (todayBlocks.length > 0) {
      lines.push(`- Bloques de Agenda para hoy (${DAY_LABELS[todayKey]}):`);
      for (const block of todayBlocks.slice(0, 10)) {
        lines.push(`  - ${block.time || 'Sin hora'}: ${cleanInlineText(block.activity, 100)}`);
      }
    }
    const otherBusyDays = DAYS.filter((day) => day !== todayKey && (state.agenda?.[day]?.length || 0) > 0)
      .map((day) => `${DAY_LABELS[day]} (${state.agenda[day].length})`);
    if (otherBusyDays.length > 0) {
      lines.push(`- Carga de Agenda resto de la semana: ${otherBusyDays.join(', ')}`);
    }
  }

  // Calendar events (next 14 days)
  const upcomingEvents = getUpcomingCalendarEvents(state, referenceDate, 14);
  if (upcomingEvents.length > 0) {
    lines.push('- Próximos eventos de Calendario (14 días):');
    for (const item of upcomingEvents.slice(0, 10)) {
      const timeLabel = item.event.time ? ` ${item.event.time}` : '';
      lines.push(
        `  - ${formatShortDayMonth(item.effectiveDate)}${timeLabel} (${formatRelativeDays(item.delta)}): ${cleanInlineText(item.event.name, 100)}`
      );
    }
  }

  // Active projects
  const activeProjects = (state.projects || []).filter((p) => p.status === 'activo');
  if (activeProjects.length > 0) {
    lines.push('- Proyectos activos:');
    for (const proj of activeProjects.slice(0, 5)) {
      const openTasks = (proj.tasks || []).filter((t) => !t.done).length;
      const nextStep = cleanInlineText(proj.nextStep, 90);
      lines.push(
        `  - ${cleanInlineText(proj.name, 80)} (${pluralize(openTasks, 'tarea pendiente', 'tareas pendientes')}${nextStep ? ` · próximo paso: ${nextStep}` : ''})`
      );
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildFinanzasSection(
  state: LifeOSState,
  referenceDate: string,
  hideExactAmounts: boolean,
  timeWindowDays: AIContextTimeWindowDays
): string | null {
  const lines: string[] = [];
  const finance = state.finance;
  if (!finance) return null;

  const recentTx = getRecentTransactions(state, referenceDate, timeWindowDays);
  const windowLabel = `últimos ${timeWindowDays} días`;

  // Group movements by currency
  if (recentTx.length > 0) {
    const byCurrency = new Map<string, Transaction[]>();
    for (const tx of recentTx) {
      const curr = (tx.currency || 'UYU').toUpperCase();
      byCurrency.set(curr, [...(byCurrency.get(curr) || []), tx]);
    }

    for (const [currency, txList] of byCurrency.entries()) {
      let totalIncome = 0;
      let totalExpense = 0;
      let fixedExpense = 0;
      let variableExpense = 0;
      const categoryTotals = new Map<string, number>();

      for (const tx of txList) {
        const amount = Math.abs(Number(tx.amount) || 0);
        if (tx.type === 'ingreso') {
          totalIncome += amount;
        } else {
          totalExpense += amount;
          if (tx.fixed === 'fijo') fixedExpense += amount;
          else variableExpense += amount;
          const cat = cleanInlineText(tx.category || 'Sin categoría', 60);
          categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + amount);
        }
      }

      if (hideExactAmounts) {
        lines.push(`- Movimientos (${windowLabel}, ${currency}): ${pluralize(txList.length, 'movimiento', 'movimientos')}`);
        if (totalIncome > 0 && totalExpense > 0) {
          if (totalExpense > totalIncome) {
            lines.push(
              '  - Relación ingresos/gastos: balance negativo: gastos por encima de los ingresos del período'
            );
          } else {
            const expenseRatio = Math.round((totalExpense / totalIncome) * 100);
            const savingsRatio = Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
            lines.push(
              `  - Relación ingresos/gastos: los gastos equivalen al ${expenseRatio}% de los ingresos (margen de ahorro aprox. ${savingsRatio}%)`
            );
          }
        } else if (totalExpense > 0) {
          lines.push('  - Solo se registraron egresos en este período (montos ocultos por privacidad).');
        } else if (totalIncome > 0) {
          lines.push('  - Solo se registraron ingresos en este período (montos ocultos por privacidad).');
        }
      } else {
        const net = totalIncome - totalExpense;
        let savingsNote = '';
        if (totalExpense > totalIncome) {
          savingsNote = ' · balance negativo: gastos por encima de los ingresos del período';
        } else if (totalIncome > 0) {
          savingsNote = ` · tasa de ahorro ${Math.round((net / totalIncome) * 100)}%`;
        }
        lines.push(
          `- Resumen (${windowLabel}, ${currency}): ingresos ${formatMoney(totalIncome, currency)} · gastos ${formatMoney(totalExpense, currency)} · neto ${formatMoney(net, currency)}${savingsNote}`
        );
      }

      if (totalExpense > 0) {
        if (fixedExpense > 0 || variableExpense > 0) {
          if (hideExactAmounts) {
            lines.push(
              `  - Estructura de gastos: ${formatPct(fixedExpense, totalExpense)} fijos · ${formatPct(variableExpense, totalExpense)} variables`
            );
          } else {
            lines.push(
              `  - Estructura de gastos: fijos ${formatMoney(fixedExpense, currency)} (${formatPct(fixedExpense, totalExpense)}) · variables ${formatMoney(variableExpense, currency)} (${formatPct(variableExpense, totalExpense)})`
            );
          }
        }

        const sortedCategories = [...categoryTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        if (sortedCategories.length > 0) {
          lines.push('  - Distribución por categorías:');
          for (const [cat, amount] of sortedCategories) {
            if (hideExactAmounts) {
              lines.push(`    - ${cat}: ${formatPct(amount, totalExpense)} del gasto`);
            } else {
              lines.push(`    - ${cat}: ${formatMoney(amount, currency)} (${formatPct(amount, totalExpense)})`);
            }
          }
        }
      }
    }
  } else if ((finance.transactions || []).length > 0) {
    lines.push(`- Movimientos (${windowLabel}): sin movimientos registrados en este período.`);
  }

  // Accounts (skip placeholder 0-balance default accounts when there is no financial activity yet)
  const accounts = finance.accounts || [];
  const hasAnyAccountActivity =
    accounts.some((acc) => Number(acc.balance || 0) !== 0 || Number(acc.initialBalance || 0) !== 0) ||
    recentTx.length > 0;
  if (accounts.length > 0 && hasAnyAccountActivity) {
    const accountsByCurrency = new Map<string, typeof accounts>();
    for (const acc of accounts) {
      const curr = (acc.currency || 'UYU').toUpperCase();
      accountsByCurrency.set(curr, [...(accountsByCurrency.get(curr) || []), acc]);
    }

    if (hideExactAmounts) {
      const summaryParts: string[] = [];
      for (const [curr, list] of accountsByCurrency.entries()) {
        const positiveTotal = list.reduce((sum, a) => sum + Math.max(0, Number(a.balance) || 0), 0);
        if (list.length > 1 && positiveTotal > 0) {
          const shares = list
            .map((a, idx) => `Cuenta ${idx + 1}: ${formatPct(Math.max(0, Number(a.balance) || 0), positiveTotal)}`)
            .join(', ');
          summaryParts.push(`${pluralize(list.length, 'cuenta', 'cuentas')} en ${curr} (${shares})`);
        } else {
          summaryParts.push(`${pluralize(list.length, 'cuenta', 'cuentas')} en ${curr}`);
        }
      }
      lines.push(`- Cuentas: ${summaryParts.join(' · ')} (nombres y saldos ocultos por privacidad)`);
    } else {
      lines.push('- Cuentas:');
      for (const [curr, list] of accountsByCurrency.entries()) {
        const total = list.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
        const detail = list
          .map((a) => `${cleanInlineText(a.name, 50)}: ${formatMoney(a.balance, curr)}`)
          .join(' · ');
        lines.push(`  - ${curr} (total ${formatMoney(total, curr)}): ${detail}`);
      }
    }
  }

  // Commitments & upcoming obligations
  const commitments = getActiveCommitments(state);
  const subscriptions = finance.subscriptions || [];
  const debts = (finance.debts || []).filter((d) => Number(d.amount) > 0);
  const agreements = (finance.agreements || []).filter((a) => a.status === 'active');

  if (commitments.length > 0 || subscriptions.length > 0 || debts.length > 0 || agreements.length > 0) {
    lines.push('- Compromisos, suscripciones y deudas:');
    const totalCommitmentWeight = commitments.reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0);

    for (const c of commitments.slice(0, 8)) {
      const curr = (c.currency || 'UYU').toUpperCase();
      const dueLabel = c.nextDueDate
        ? `vence ${formatShortDayMonth(c.nextDueDate)} (${formatRelativeDays(daysBetween(referenceDate, c.nextDueDate.slice(0, 10)))})`
        : 'sin fecha';
      const instLabel =
        c.currentInstallment && c.totalInstallments
          ? ` · cuota ${c.currentInstallment}/${c.totalInstallments}`
          : '';
      if (hideExactAmounts) {
        const shareLabel =
          totalCommitmentWeight > 0 && commitments.length > 1
            ? ` · ${formatPct(Math.max(0, Number(c.amount) || 0), totalCommitmentWeight)} de los compromisos`
            : '';
        lines.push(`  - ${cleanInlineText(c.name, 70)} (${dueLabel}${instLabel}${shareLabel})`);
      } else {
        lines.push(`  - ${cleanInlineText(c.name, 70)}: ${formatMoney(c.amount, curr)} (${dueLabel}${instLabel})`);
      }
    }

    for (const sub of subscriptions.slice(0, 6)) {
      const due = sub.dueDay ? ` · día ${sub.dueDay}` : '';
      if (hideExactAmounts) {
        lines.push(`  - Suscripción: ${cleanInlineText(sub.name, 70)}${due} (monto oculto)`);
      } else {
        lines.push(`  - Suscripción: ${cleanInlineText(sub.name, 70)} (${formatMoney(sub.amount, 'UYU')}${due})`);
      }
    }

    for (const debt of debts.slice(0, 5)) {
      const due = debt.dueDate ? ` · vence ${formatShortDayMonth(debt.dueDate)}` : '';
      if (hideExactAmounts) {
        lines.push(`  - Deuda activa: ${cleanInlineText(debt.name, 70)}${due} (saldo oculto)`);
      } else {
        lines.push(`  - Deuda: ${cleanInlineText(debt.name, 70)} (${formatMoney(debt.amount, 'UYU')}${due})`);
      }
    }

    for (const ag of agreements.slice(0, 5)) {
      if (hideExactAmounts) {
        lines.push(`  - Acuerdo de financiación activo: ${cleanInlineText(ag.title, 70)} (${ag.currency} · saldo oculto)`);
      } else {
        lines.push(
          `  - Acuerdo de financiación: ${cleanInlineText(ag.title, 70)} (saldo base ${formatMoney(ag.initialRemainingBalance, ag.currency)})`
        );
      }
    }
  }

  // Expected incomes
  const expectedIncomes = (finance.expectedIncomes || []).filter((inc) => inc.active !== false);
  if (expectedIncomes.length > 0) {
    lines.push('- Ingresos esperados:');
    for (const inc of expectedIncomes.slice(0, 5)) {
      const curr = (inc.currency || 'UYU').toUpperCase();
      if (hideExactAmounts) {
        lines.push(`  - ${cleanInlineText(inc.name, 70)} (${inc.frequency} · monto oculto)`);
      } else {
        lines.push(`  - ${cleanInlineText(inc.name, 70)}: ${formatMoney(inc.amount, curr)} (${inc.frequency})`);
      }
    }
  }

  // Investments
  const investments = (finance.investments || []).filter((inv) => Number(inv.amount) > 0);
  if (investments.length > 0) {
    const totalInv = investments.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    if (hideExactAmounts) {
      const shares = investments
        .slice(0, 5)
        .map((inv, idx) => `Posición ${idx + 1}: ${formatPct(Number(inv.amount || 0), totalInv)}`)
        .join(', ');
      lines.push(`- Inversiones: ${pluralize(investments.length, 'posición', 'posiciones')} (${shares} · montos ocultos)`);
    } else {
      const detail = investments
        .slice(0, 5)
        .map((inv) => `${cleanInlineText(inv.name, 50)}: ${formatMoney(inv.amount, 'UYU')}`)
        .join(' · ');
      lines.push(`- Inversiones (${formatMoney(totalInv, 'UYU')}): ${detail}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildEstudiosSection(
  state: LifeOSState,
  referenceDate: string,
  timeWindowDays: AIContextTimeWindowDays
): string | null {
  const lines: string[] = [];
  const study = state.study;
  if (!study) return null;

  const subjectById = new Map((study.subjects || []).map((s) => [s.id, s]));

  // Pending exams sorted by proximity
  const pendingExams: Exam[] = (study.exams || [])
    .filter((exam) => exam.status === 'pendiente')
    .slice()
    .sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));

  if (pendingExams.length > 0) {
    lines.push(`- Exámenes próximos (${pendingExams.length}):`);
    for (const exam of pendingExams.slice(0, 8)) {
      const subjectName = exam.subjectId ? subjectById.get(exam.subjectId)?.name : null;
      const title = cleanInlineText(exam.title || subjectName || 'Examen', 80);
      const subjectSuffix =
        subjectName &&
        exam.title &&
        !exam.title.toLowerCase().includes(subjectName.toLowerCase())
          ? ` (${cleanInlineText(subjectName, 50)})`
          : '';
      const delta = exam.date ? daysBetween(referenceDate, exam.date.slice(0, 10)) : null;
      const dateInfo = exam.date
        ? `${formatReadableDate(exam.date)}${exam.time ? ` ${exam.time}` : ''} · ${formatRelativeDays(delta ?? 0)}`
        : 'sin fecha';
      const pendingExamTopics = (exam.topics || []).filter((t) => !t.done).map((t) => cleanInlineText(t.title, 50));
      const topicsNote =
        pendingExamTopics.length > 0
          ? ` · temas pendientes: ${pendingExamTopics.slice(0, 4).join(', ')}${pendingExamTopics.length > 4 ? ` (+${pendingExamTopics.length - 4})` : ''}`
          : '';
      lines.push(`  - ${title}${subjectSuffix}: ${dateInfo}${topicsNote}`);
    }
  }

  // Active subjects and pending topics
  const subjects = study.subjects || [];
  if (subjects.length > 0) {
    lines.push(`- Materias activas (${subjects.length}):`);
    for (const subject of subjects.slice(0, 10)) {
      const topics = subject.topics || [];
      const doneTopics = topics.filter((t) => t.done).length;
      const pendingTopics = topics.filter((t) => !t.done);
      if (topics.length === 0) {
        lines.push(`  - ${cleanInlineText(subject.name, 70)} (sin temario cargado)`);
      } else {
        const preview = pendingTopics
          .slice(0, 5)
          .map((t) => cleanInlineText(t.title, 55))
          .join(', ');
        lines.push(
          `  - ${cleanInlineText(subject.name, 70)}: ${doneTopics}/${topics.length} temas listos${preview ? ` · pendientes: ${preview}${pendingTopics.length > 5 ? ` (+${pendingTopics.length - 5})` : ''}` : ' · temario al día'}`
        );
      }
    }
  }

  // Study log filtered by chosen time window
  const recentLogs = (study.studyLog || []).filter((log) =>
    isWithinLookbackWindow(log.date, referenceDate, timeWindowDays)
  );
  if (recentLogs.length > 0) {
    const totalMinutes = recentLogs.reduce((sum, l) => sum + (Number(l.minutes) || 0), 0);
    const hours = (totalMinutes / 60).toFixed(1).replace(/\.0$/, '');
    lines.push(
      `- Estudio reciente (últimos ${timeWindowDays} días): ${hours} h en ${pluralize(recentLogs.length, 'sesión', 'sesiones')}`
    );
  } else if ((study.studyLog || []).length > 0) {
    lines.push(`- Estudio reciente (últimos ${timeWindowDays} días): sin sesiones registradas en este período.`);
  }

  // Practice attempts filtered by chosen time window
  const attempts = (study.practiceAttempts || [])
    .filter((a) => isWithinLookbackWindow(a.date, referenceDate, timeWindowDays))
    .slice(-5);
  if (attempts.length > 0) {
    const avgScore = Math.round(
      attempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / attempts.length
    );
    lines.push(
      `- Prácticas recientes (últimos ${timeWindowDays} días): ${pluralize(attempts.length, 'intento', 'intentos')} · promedio ${avgScore}%`
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildGimnasioSection(
  state: LifeOSState,
  referenceDate: string,
  timeWindowDays: AIContextTimeWindowDays
): string | null {
  const lines: string[] = [];
  const gym = state.gym;
  if (!gym) return null;

  const performedSessions = (gym.sessions || [])
    .filter(isPerformedGymSession)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const windowSessions = performedSessions.filter((session) =>
    isWithinLookbackWindow(session.date, referenceDate, timeWindowDays)
  );

  const routines = gym.routineTemplates || [];

  if (performedSessions.length > 0) {
    const allProgress = getGymProgressMetrics(performedSessions, referenceDate);
    if (timeWindowDays === 7) {
      lines.push(
        `- Frecuencia (últimos 7 días): ${pluralize(windowSessions.length, 'sesión', 'sesiones')} (7 días previos: ${allProgress.frequency.previous7Days.workoutCount})`
      );
    } else if (timeWindowDays === 30) {
      lines.push(
        `- Frecuencia (últimos 30 días): ${pluralize(windowSessions.length, 'sesión', 'sesiones')} (${pluralize(allProgress.frequency.last7Days.workoutCount, 'sesión', 'sesiones')} en los últimos 7 días)`
      );
    } else {
      lines.push(
        `- Frecuencia (últimos 90 días): ${pluralize(windowSessions.length, 'sesión', 'sesiones')} (${pluralize(allProgress.frequency.last30Days.workoutCount, 'sesión', 'sesiones')} en los últimos 30 días)`
      );
    }

    if (windowSessions.length > 0) {
      lines.push(`- Sesiones registradas (últimos ${timeWindowDays} días):`);
      for (const session of windowSessions.slice(0, 6)) {
        const volume = Math.round(getPerformedGymVolume(session));
        const label = cleanInlineText(session.weekLabel || 'Sesión libre', 50);
        const exSummaries: string[] = [];
        for (const ex of (session.exercises || []).slice(0, 4)) {
          const sets = getPerformedExerciseSets(session, ex);
          const best = selectBestPerformedSet(sets);
          if (best) {
            exSummaries.push(`${cleanInlineText(ex.name, 40)} (${best.weight} kg x ${best.reps})`);
          }
        }
        lines.push(
          `  - ${formatShortDayMonth(session.date)} · ${label} · volumen ${volume} kg${exSummaries.length > 0 ? ` · ${exSummaries.join(', ')}` : ''}`
        );
      }

      const windowProgress = getGymProgressMetrics(windowSessions, referenceDate);
      const improved = windowProgress.exercises.filter((ex) => ex.state === 'improved').slice(0, 5);
      if (improved.length > 0) {
        const improvedText = improved
          .map((ex) =>
            ex.bestSet
              ? `${cleanInlineText(ex.exerciseName, 40)} (${ex.bestSet.weight} kg x ${ex.bestSet.reps})`
              : cleanInlineText(ex.exerciseName, 40)
          )
          .join(', ');
        lines.push(`- Progresión destacada (últimos ${timeWindowDays} días): ${improvedText}`);
      }
    } else {
      lines.push(`- Sesiones registradas (últimos ${timeWindowDays} días): sin sesiones en este período.`);
    }
  }

  if (routines.length > 0) {
    const routineText = routines
      .slice(0, 6)
      .map((r) => {
        const days = r.days && r.days.length > 0 ? ` (${r.days.map((d) => DAY_LABELS[d]).join(', ')})` : '';
        return `${cleanInlineText(r.name, 45)}${days} · ${pluralize((r.exercises || []).length, 'ejercicio', 'ejercicios')}`;
      })
      .join(' | ');
    lines.push(`- Rutinas configuradas: ${routineText}`);
  }

  const weights = (gym.weight || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length > 0) {
    const latest = weights[weights.length - 1];
    const prev = weights.length >= 2 ? weights[weights.length - 2] : null;
    const diff = prev ? Number((latest.kg - prev.kg).toFixed(1)) : null;
    const diffStr = diff !== null && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff} kg vs registro anterior)` : '';
    lines.push(`- Peso corporal más reciente: ${latest.kg} kg (${formatShortDayMonth(latest.date)})${diffStr}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildTrabajoSection(state: LifeOSState, referenceDate: string): string | null {
  const lines: string[] = [];
  const applications = state.jobs?.applications || [];
  if (applications.length === 0) return null;

  const active = applications.filter(isJobApplicationActive);
  const closedCount = applications.length - active.length;

  lines.push(
    `- Estado general: ${pluralize(active.length, 'postulación activa', 'postulaciones activas')}${closedCount > 0 ? ` · ${pluralize(closedCount, 'proceso cerrado', 'procesos cerrados')}` : ''}`
  );

  if (active.length > 0) {
    lines.push('- Postulaciones activas:');
    const sortedActive = active.slice().sort((a, b) => {
      const nextA = getNextJobKeyDate(a, referenceDate)?.keyDate.date || '9999-99-99';
      const nextB = getNextJobKeyDate(b, referenceDate)?.keyDate.date || '9999-99-99';
      return nextA.localeCompare(nextB) || (b.fecha || '').localeCompare(a.fecha || '');
    });

    for (const app of sortedActive.slice(0, 10)) {
      const tipo = getJobApplicationType(app);
      const stageLabel = getJobStageLabel(tipo, app.estado);
      const next = getNextJobKeyDate(app, referenceDate);
      const nextInfo = next
        ? ` · próximo hito: ${JOB_KEY_DATE_LABELS[next.keyDate.kind]} ${formatShortDayMonth(next.keyDate.date)} (${formatRelativeDays(next.daysUntil)})`
        : '';
      const actionNote = cleanInlineText(app.nextAction || app.followUpNotes, 80);
      lines.push(
        `  - ${cleanInlineText(app.empresa, 50)} — ${cleanInlineText(app.puesto, 60)} [${stageLabel}${tipo === 'concurso' ? ' · concurso' : ''}]${nextInfo}${actionNote ? ` · ${actionNote}` : ''}`
      );
    }
    if (sortedActive.length > 10) {
      lines.push(`  - … y ${sortedActive.length - 10} postulaciones activas más.`);
    }
  }

  return lines.join('\n');
}

function buildNegocioSection(
  state: LifeOSState,
  referenceDate: string,
  hideExactAmounts: boolean,
  timeWindowDays: AIContextTimeWindowDays
): string | null {
  const lines: string[] = [];
  const inventory = state.resale?.inventory || [];
  const commercial = state.resale?.commercial;
  const windowLabel = `últimos ${timeWindowDays} días`;

  if (inventory.length > 0) {
    const inStock = inventory.filter((item) => item.status === 'comprado');
    const soldInWindow = inventory.filter(
      (item) =>
        item.status === 'vendido' &&
        isWithinLookbackWindow(item.sellDate || item.buyDate, referenceDate, timeWindowDays)
    );

    const stockInvested = inStock.reduce((sum, item) => sum + (Number(item.buyPrice) || 0), 0);
    const soldRevenue = soldInWindow.reduce((sum, item) => sum + (Number(item.sellPrice) || 0), 0);
    const soldCost = soldInWindow.reduce(
      (sum, item) =>
        sum +
        (Number(item.buyPrice) || 0) +
        (Number(item.fees) || 0) +
        (Number(item.shippingCost) || 0) +
        (Number(item.platformFees) || 0) +
        (Number(item.taxes) || 0),
      0
    );
    const soldProfit = soldRevenue - soldCost;

    if (hideExactAmounts) {
      const marginNote =
        soldRevenue > 0 ? ` · margen neto estimado ${formatPct(soldProfit, soldRevenue)}` : '';
      lines.push(
        `- Inventario de reventa (${windowLabel}): ${pluralize(inStock.length, 'artículo en stock', 'artículos en stock')} · ${pluralize(soldInWindow.length, 'venta concretada', 'ventas concretadas')}${marginNote} (montos ocultos por privacidad)`
      );
    } else {
      const marginNote =
        soldRevenue > 0 ? ` (margen ${formatPct(soldProfit, soldRevenue)})` : '';
      lines.push(
        `- Inventario de reventa (${windowLabel}): ${pluralize(inStock.length, 'artículo en stock', 'artículos en stock')} (invertido ${formatMoney(stockInvested, 'UYU')}) · ${pluralize(soldInWindow.length, 'venta', 'ventas')} (ingresos ${formatMoney(soldRevenue, 'UYU')}, ganancia est. ${formatMoney(soldProfit, 'UYU')}${marginNote})`
      );
    }

    if (inStock.length > 0) {
      const preview = inStock
        .slice(0, 6)
        .map((item) =>
          hideExactAmounts
            ? cleanInlineText(item.item, 50)
            : `${cleanInlineText(item.item, 50)} (compra ${formatMoney(item.buyPrice, item.purchaseCurrency || 'UYU')})`
        )
        .join(', ');
      lines.push(`  - En stock: ${preview}${inStock.length > 6 ? ` (+${inStock.length - 6})` : ''}`);
    }
  }

  if (commercial && (commercial.items.length > 0 || commercial.business || commercial.operations.length > 0)) {
    const business = commercial.business;
    const lookups = buildCommercialDateLookups(commercial);
    const itemsCount = commercial.items.length;
    const recipesCount = business?.recipes.length || 0;
    const allSales = business?.sales || [];
    const allPurchases = business?.purchases || [];
    const salesInWindow = allSales.filter((sale) => {
      const saleDate = lookups.getSaleDate(sale);
      return !saleDate || isWithinLookbackWindow(saleDate, referenceDate, timeWindowDays);
    });
    const purchasesInWindow = allPurchases.filter((purchase) => {
      const purchaseDate = lookups.getPurchaseDate(purchase);
      return !purchaseDate || isWithinLookbackWindow(purchaseDate, referenceDate, timeWindowDays);
    });
    const operationsInWindow = (commercial.operations || []).filter(
      (op) => !op.commercialDate || isWithinLookbackWindow(op.commercialDate, referenceDate, timeWindowDays)
    );
    const curr = business?.currency || 'UYU';

    if (
      itemsCount > 0 ||
      recipesCount > 0 ||
      allSales.length > 0 ||
      allPurchases.length > 0 ||
      commercial.operations.length > 0
    ) {
      const opsSuffix =
        business === undefined && commercial.operations.length > 0
          ? ` · ${pluralize(operationsInWindow.length, 'operación', 'operaciones')}`
          : '';
      lines.push(
        `- Actividad comercial (${windowLabel}): ${pluralize(itemsCount, 'artículo/insumo', 'artículos/insumos')}${recipesCount > 0 ? ` · ${pluralize(recipesCount, 'receta', 'recetas')}` : ''} · ${pluralize(salesInWindow.length, 'venta', 'ventas')} · ${pluralize(purchasesInWindow.length, 'compra', 'compras')}${opsSuffix}`
      );
    }

    if (salesInWindow.length > 0) {
      const totalRevCents = salesInWindow.reduce((sum, s) => sum + (Number(s.revenueCents) || 0), 0);
      const totalProfitCents = salesInWindow.reduce((sum, s) => sum + (Number(s.grossProfitCents) || 0), 0);
      if (hideExactAmounts) {
        lines.push(
          `  - Desempeño de ventas (${windowLabel}): margen bruto estimado ${formatPct(totalProfitCents, totalRevCents)} (cifras exactas ocultas por privacidad)`
        );
      } else {
        lines.push(
          `  - Desempeño de ventas (${windowLabel}, ${curr}): ingresos ${formatMoney(fromCents(totalRevCents), curr)} · ganancia bruta ${formatMoney(fromCents(totalProfitCents), curr)} (${formatPct(totalProfitCents, totalRevCents)})`
        );
      }
    } else if (allSales.length > 0) {
      lines.push(`  - Desempeño de ventas (${windowLabel}): sin ventas registradas en este período.`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildNotasSection(state: LifeOSState, hideExactAmounts: boolean): string | null {
  const lines: string[] = [];

  const activeNotes = (state.notes?.postits || [])
    .filter((n) => !n.archived && (cleanInlineText(n.title) || cleanInlineText(n.text)))
    .slice()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.date || '').localeCompare(a.date || ''));

  if (activeNotes.length > 0) {
    lines.push(`- Notas recientes (${activeNotes.length}):`);
    for (const note of activeNotes.slice(0, 6)) {
      const title = cleanInlineText(note.title, 60);
      const body = cleanInlineText(note.text, 120);
      const prefix = note.pinned ? '[Fijada] ' : '';
      lines.push(`  - ${prefix}${title ? `${title}: ` : ''}${body}`);
    }
  }

  const pendingShopping = (state.notes?.shopping || []).filter((item) => !item.done && cleanInlineText(item.text));
  if (pendingShopping.length > 0) {
    const items = pendingShopping.slice(0, 8).map((i) => cleanInlineText(i.text, 40)).join(', ');
    lines.push(`- Lista de compras pendiente (${pendingShopping.length}): ${items}`);
  }

  const goals = state.goals || [];
  if (goals.length > 0) {
    lines.push('- Objetivos personales:');
    for (const goal of goals.slice(0, 5)) {
      const span = goal.target - goal.initial;
      const pct = span !== 0 ? Math.max(0, Math.min(100, Math.round(((goal.current - goal.initial) / span) * 100))) : 0;
      const isFinancialGoal = Boolean(goal.linked && FINANCIAL_LINKED_GOAL_SOURCES.has(goal.linked));
      if (hideExactAmounts && isFinancialGoal) {
        lines.push(`  - ${cleanInlineText(goal.name, 70)}: ${pct}% de avance (montos ocultos por privacidad)`);
      } else {
        lines.push(`  - ${cleanInlineText(goal.name, 70)}: ${pct}% de avance (${goal.current}/${goal.target})`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

export function buildAIContextPrompt(
  state: LifeOSState,
  options: AIContextPromptOptions
): AIContextPromptResult {
  const referenceDate = options.referenceDate || todayISO();
  const timeWindowDays = normalizeTimeWindowDays(options.timeWindowDays);
  const isDataOnly = options.mode === 'data_only' || options.goalId === null;
  const mode: AIContextMode = isDataOnly ? 'data_only' : 'guided';
  const goal = isDataOnly || !options.goalId ? null : getGoalDefinition(options.goalId);
  const visibleIds = new Set(getVisibleContextModules(state).map((m) => m.id));
  const moduleOrder = AI_CONTEXT_MODULES.map((m) => m.id);
  const selectedSet = new Set(options.selectedModules);

  const includedModules = moduleOrder.filter((id) => selectedSet.has(id) && visibleIds.has(id));

  const dayName = DAY_LABELS[dayKeyFromDate(parseISODate(referenceDate))];
  const blocks: string[] = [
    isDataOnly || !goal
      ? '# Datos personales — Celestian LifeOS'
      : `# Contexto personal — ${goal.title}`,
    `Fecha de referencia: ${formatReadableDate(referenceDate)} (${dayName})`,
    `Período de datos: últimos ${timeWindowDays} días`,
  ];

  if (options.hideExactAmounts) {
    blocks.push(
      '> Privacidad activa: los montos exactos y nombres de cuentas bancarias fueron omitidos o expresados en porcentajes.'
    );
  }

  if (!isDataOnly && goal) {
    blocks.push('', '## Objetivo', goal.instruction);
  }

  const customQuestion = cleanInlineText(options.customQuestion, 500);
  if (customQuestion) {
    blocks.push(
      '',
      isDataOnly ? '## Mi pregunta o consigna' : '## Mi pregunta o restricción adicional',
      customQuestion
    );
  }

  const dataSections: string[] = [];

  for (const modId of includedModules) {
    let sectionTitle = '';
    let content: string | null = null;

    switch (modId) {
      case 'hoy_agenda':
        sectionTitle = 'Hoy y agenda';
        content = buildHoyAgendaSection(state, referenceDate);
        break;
      case 'finanzas':
        sectionTitle = 'Finanzas';
        content = buildFinanzasSection(state, referenceDate, options.hideExactAmounts, timeWindowDays);
        break;
      case 'estudios':
        sectionTitle = 'Estudios';
        content = buildEstudiosSection(state, referenceDate, timeWindowDays);
        break;
      case 'gimnasio':
        sectionTitle = 'Gimnasio';
        content = buildGimnasioSection(state, referenceDate, timeWindowDays);
        break;
      case 'trabajo':
        sectionTitle = 'Trabajo';
        content = buildTrabajoSection(state, referenceDate);
        break;
      case 'negocio':
        sectionTitle = 'Mi negocio';
        content = buildNegocioSection(state, referenceDate, options.hideExactAmounts, timeWindowDays);
        break;
      case 'notas':
        sectionTitle = 'Notas y objetivos';
        content = buildNotasSection(state, options.hideExactAmounts);
        break;
    }

    if (content) {
      dataSections.push(`### ${sectionTitle}\n${content}`);
    }
  }

  blocks.push('', '## Datos actuales');
  if (dataSections.length > 0) {
    blocks.push(dataSections.join('\n\n'));
  } else {
    blocks.push(
      isDataOnly
        ? 'Todavía no hay datos cargados en los módulos seleccionados para este período.'
        : 'Todavía no hay datos cargados en los módulos seleccionados. Guiame con 3 preguntas breves para empezar a ordenarme.'
    );
  }

  const text = blocks.join('\n');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return {
    mode,
    goal,
    timeWindowDays,
    includedModules,
    text,
    charCount: text.length,
    wordCount,
    hasAnyData: dataSections.length > 0,
  };
}
