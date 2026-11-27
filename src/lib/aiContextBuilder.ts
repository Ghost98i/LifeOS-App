import type {
  CalendarEvent,
  DayKey,
  Exam,
  FinancialCommitment,
  Goal,
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
import { getCategoryName } from './financeCategories';
import { deriveCashflowProjection } from './financeCashflow';
import { goalCurrentValue } from './calculations';
import { maskFinancialText } from './financialPrivacy';

export type AIGoalId =
  | 'organizar_dia'
  | 'revisar_finanzas'
  | 'plan_estudio'
  | 'analizar_entrenamiento'
  | 'impulsar_negocio'
  | 'busqueda_laboral';

export type AIContextMode = 'guided' | 'data_only';

export type AIContextTimeWindowDays = 7 | 30 | 90;

export type AIContextDetailLevel = 'summary' | 'detailed';

export const AI_CONTEXT_TIME_WINDOWS: readonly {
  days: AIContextTimeWindowDays;
  label: string;
}[] = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

export const DEFAULT_AI_TIME_WINDOW_DAYS: AIContextTimeWindowDays = 30;

export const AI_CONTEXT_DETAIL_LEVELS: readonly {
  id: AIContextDetailLevel;
  label: string;
}[] = [
  { id: 'summary', label: 'Resumido' },
  { id: 'detailed', label: 'Detallado' },
] as const;

export const DEFAULT_AI_DETAIL_LEVEL: AIContextDetailLevel = 'summary';

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
  detailLevel?: AIContextDetailLevel;
  customQuestion?: string;
  referenceDate?: string;
}

export interface AIContextPromptResult {
  mode: AIContextMode;
  goal: AIGoalDefinition | null;
  timeWindowDays: AIContextTimeWindowDays;
  detailLevel: AIContextDetailLevel;
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

const FREQUENCY_LABELS_ES: Record<string, string> = {
  once: 'único',
  weekly: 'semanal',
  biweekly: 'quincenal',
  monthly: 'mensual',
  yearly: 'anual',
};

const ADJUSTMENT_CATEGORY_NAMES = new Set([
  'ajuste de saldo',
  'ajuste contable',
  'reconciliacion',
  'balance adjustment',
]);

const INTERNAL_CATEGORY_ID_REGEX = /^cat[_-][a-z0-9_-]{3,}$/i;

const INVISIBLE_UNICODE_REGEX =
  /[\u00A0\u115F\u1160\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFEFF\uFFA0]+/g;

const NON_PERSON_CAPITALIZED_WORDS = new Set([
  // Meses y días
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  // Monedas, bancos, marcas, plataformas
  'uyu', 'usd', 'eur', 'ars', 'brl', 'banco', 'brou', 'itau', 'santander', 'bbva',
  'scotia', 'scotiabank', 'hsbc', 'bandes', 'heritage', 'prex', 'oca', 'visa',
  'mastercard', 'amex', 'mercadopago', 'mercadolibre', 'mercado', 'paypal', 'stripe',
  'spotify', 'netflix', 'youtube', 'google', 'apple', 'amazon', 'microsoft', 'adobe',
  'antel', 'ute', 'ose', 'bps', 'dgi', 'fonasa', 'caja', 'fondo', 'centenario',
  'sony', 'keychron', 'nike', 'adidas', 'samsung', 'iphone', 'macbook', 'windows',
  'linux', 'react', 'typescript', 'linkedin', 'github', 'celestian', 'lifeos',
  // Lugares y entidades
  'uruguay', 'montevideo', 'canelones', 'maldonado', 'colonia', 'argentina',
  'buenos', 'aires', 'espana', 'madrid', 'chile', 'brasil', 'facultad',
  'universidad', 'liceo', 'colegio', 'hospital', 'clinica', 'farmacia',
  'supermercado', 'tienda', 'oficina', 'gimnasio', 'gym', 'studio', 'nubesur',
  'norte', 'sur', 'este', 'oeste', 'acme',
  // Materias y conceptos frecuentes en mayúscula
  'calculo', 'fisica', 'quimica', 'algoritmos', 'historia', 'derecho', 'economia',
  'matematica', 'matematicas', 'biologia', 'medicina', 'ingenieria', 'ingles',
  'english', 'frontend', 'backend', 'proyecto', 'trabajo', 'negocio', 'estudios',
  'finanzas', 'agenda', 'calendario', 'notas', 'persona', 'cuenta', 'posicion',
  'tarjeta', 'cuota', 'cuotas', 'alquiler', 'sueldo', 'salario', 'internet',
  'emergencia', 'ahorro', 'ahorros', 'inversion', 'inversiones', 'viajes', 'viaje',
  'salud', 'hogar', 'vivienda', 'comida', 'alimentacion', 'transporte', 'ocio',
  'compras', 'ropa', 'tecnologia', 'auto', 'casa', 'apartamento', 'depto',
  'equipo', 'clientes', 'cliente', 'ventas', 'stock', 'producto', 'productos',
  'servicios', 'servicio', 'impuestos', 'seguros', 'seguro', 'pension', 'prestamo',
  'credito', 'debito', 'efectivo', 'dolares', 'pesos', 'parcial', 'examen',
  'entrega', 'reunion', 'control', 'dentista', 'pasaporte', 'pecho', 'espalda',
  'piernas', 'hombros', 'brazos', 'torso', 'fuerza', 'cardio', 'triceps', 'biceps',
]);

interface PersonAnonymizer {
  enabled: boolean;
  anonymizeText: (text: string) => string;
  anonymizeDirectName: (name: string) => string;
}

function normalizeTextKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function createPersonAnonymizer(enabled: boolean): PersonAnonymizer {
  if (!enabled) {
    return {
      enabled: false,
      anonymizeText: (text: string) => text,
      anonymizeDirectName: (name: string) => name,
    };
  }

  let counter = 0;
  const exactMap = new Map<string, string>();
  const firstNameMap = new Map<string, string>();

  const getOrAssignLabel = (rawCandidate: string): { label: string; trailing: string } | null => {
    const tokens = rawCandidate.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    const firstKey = normalizeTextKey(tokens[0]);
    if (!firstKey || firstKey.length < 3 || NON_PERSON_CAPITALIZED_WORDS.has(firstKey)) {
      return null;
    }

    let nameTokens = [tokens[0]];
    let trailing = '';
    if (tokens.length >= 2) {
      const secondKey = normalizeTextKey(tokens[1]);
      if (secondKey && secondKey.length >= 2 && !NON_PERSON_CAPITALIZED_WORDS.has(secondKey)) {
        nameTokens = [tokens[0], tokens[1]];
      } else {
        trailing = ` ${tokens.slice(1).join(' ')}`;
      }
    }

    const fullKey = normalizeTextKey(nameTokens.join(' '));
    const existingExact = exactMap.get(fullKey);
    if (existingExact) {
      return { label: existingExact, trailing };
    }

    const existingFirst = firstNameMap.get(firstKey);
    if (nameTokens.length === 1 && existingFirst && existingFirst !== '__ambiguous__') {
      exactMap.set(fullKey, existingFirst);
      return { label: existingFirst, trailing };
    }

    if (nameTokens.length === 2 && existingFirst && existingFirst !== '__ambiguous__') {
      // If only the bare first name was registered so far, unify with full name
      const hasOtherFullWithSameFirst = Array.from(exactMap.keys()).some(
        (key) => key !== firstKey && key !== fullKey && key.startsWith(`${firstKey} `)
      );
      if (!hasOtherFullWithSameFirst) {
        exactMap.set(fullKey, existingFirst);
        return { label: existingFirst, trailing };
      }
      firstNameMap.set(firstKey, '__ambiguous__');
    }

    counter += 1;
    const label = `Persona ${counter}`;
    exactMap.set(fullKey, label);
    if (!firstNameMap.has(firstKey)) {
      firstNameMap.set(firstKey, label);
    } else if (firstNameMap.get(firstKey) !== label) {
      firstNameMap.set(firstKey, '__ambiguous__');
    }

    return { label, trailing };
  };

  const PREPOSITIONAL_NAME_REGEX =
    /(^|[\s([{"'¿¡,;:–—-])((?:[Aa]|[Dd][Ee]|[Cc][Oo][Nn]|[Pp][Aa][Rr][Aa])\s+)([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,})?)/g;

  const anonymizeText = (text: string): string => {
    if (!text) return text;
    return text.replace(
      PREPOSITIONAL_NAME_REGEX,
      (fullMatch, boundary: string, prep: string, candidate: string) => {
        const resolved = getOrAssignLabel(candidate);
        if (!resolved) return fullMatch;
        return `${boundary}${prep}${resolved.label}${resolved.trailing}`;
      }
    );
  };

  const anonymizeDirectName = (name: string): string => {
    const clean = cleanInlineText(name, 80);
    if (!clean) return '';
    const resolved = getOrAssignLabel(clean);
    if (!resolved) return clean;
    return `${resolved.label}${resolved.trailing}`.trim();
  };

  return {
    enabled: true,
    anonymizeText,
    anonymizeDirectName,
  };
}

function stripInvisibleUnicode(value?: string | null): string {
  return String(value || '').replace(INVISIBLE_UNICODE_REGEX, ' ');
}

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

function formatMonthYear(ym: string): string {
  const [year, monthStr] = ym.split('-');
  const monthIdx = Number(monthStr) - 1;
  const monthName = MONTHS_SHORT[monthIdx] || monthStr;
  return `${monthName} ${year}`;
}

function formatRelativeDays(delta: number): string {
  if (delta === 0) return 'hoy';
  if (delta === 1) return 'mañana';
  if (delta > 1) return `en ${delta} días`;
  if (delta === -1) return 'ayer';
  return `hace ${Math.abs(delta)} días`;
}

function cleanInlineText(value?: string | null, maxLen = 140): string {
  const normalized = stripInvisibleUnicode(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

function cleanMultilineText(value?: string | null, maxLen = 2000): string {
  const raw = stripInvisibleUnicode(value).replace(/\r\n?/g, '\n');
  const cleanedLines = raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const joined = cleanedLines.join(' · ');
  if (!joined) return '';
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1).trimEnd()}…`;
}

function formatPct(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function translateFrequency(freq?: string | null): string {
  if (!freq) return 'sin frecuencia';
  const normalized = normalizeTextKey(freq);
  return FREQUENCY_LABELS_ES[normalized] || cleanInlineText(freq, 30);
}

function resolveSafeCategoryName(state: LifeOSState, rawCategory?: string | null): string {
  const cleanedRaw = cleanInlineText(rawCategory, 80);
  if (!cleanedRaw) return 'Sin categoría';

  const resolved = cleanInlineText(getCategoryName(state.finance?.categories, cleanedRaw), 60);
  if (!resolved || INTERNAL_CATEGORY_ID_REGEX.test(resolved)) {
    return 'Sin categoría';
  }
  return resolved;
}

function isBalanceAdjustmentTransaction(tx: Transaction, resolvedCategory: string): boolean {
  if (tx.origin === 'adjustment') return true;
  return ADJUSTMENT_CATEGORY_NAMES.has(normalizeTextKey(resolvedCategory));
}

function normalizeDetailLevel(level?: AIContextDetailLevel): AIContextDetailLevel {
  return level === 'detailed' ? 'detailed' : DEFAULT_AI_DETAIL_LEVEL;
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

function describeNumericTrend(values: number[], threshold: number): string | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const early = values.slice(0, mid);
  const recent = values.slice(mid);
  const avgEarly = early.reduce((s, v) => s + v, 0) / early.length;
  const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
  const diff = avgRecent - avgEarly;
  if (diff >= threshold) return 'en suba';
  if (diff <= -threshold) return 'en baja';
  return 'estable';
}

function buildHoyAgendaSection(
  state: LifeOSState,
  referenceDate: string,
  timeWindowDays: AIContextTimeWindowDays,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const isDetailed = detailLevel === 'detailed';
  const todayKey: DayKey = dayKeyFromDate(parseISODate(referenceDate));

  // Daily check-in context for today
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
    const note = anonymizer.anonymizeText(cleanInlineText(todayCheckin.note, isDetailed ? 300 : 120));
    if (note) lines.push(`- Nota del día: ${note}`);
  }

  // Sleep, energy, mood & daily checkouts across the selected window
  const recentContext = (state.dailyContext || [])
    .filter((entry) => isWithinLookbackWindow(entry.date, referenceDate, timeWindowDays))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const checkoutEntries = Object.entries(state.checkoutLog || {})
    .filter(([date, log]) => {
      if (!log || !isWithinLookbackWindow(date, referenceDate, timeWindowDays)) return false;
      return Boolean(
        log.closedAt ||
        cleanInlineText(log.dailyNote) ||
        typeof log.sleepHours === 'number' ||
        typeof log.energyLevel === 'number' ||
        log.trainedSkipped ||
        log.studiedSkipped ||
        log.expensesSkipped
      );
    })
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

  const shouldShowWellbeingBlock =
    checkoutEntries.length > 0 ||
    recentContext.length >= 2 ||
    (recentContext.length === 1 && recentContext[0].date !== referenceDate);

  if (shouldShowWellbeingBlock) {
    const byDate = new Map<
      string,
      {
        date: string;
        sleepHours: number | null;
        energy: number | null;
        mood: number | null;
        stress?: string | null;
        note: string;
        closed: boolean;
      }
    >();

    for (const ctx of recentContext) {
      byDate.set(ctx.date, {
        date: ctx.date,
        sleepHours: typeof ctx.sleepHours === 'number' && Number.isFinite(ctx.sleepHours) ? ctx.sleepHours : null,
        energy: typeof ctx.energy === 'number' && Number.isFinite(ctx.energy) ? ctx.energy : null,
        mood: typeof ctx.mood === 'number' && Number.isFinite(ctx.mood) ? ctx.mood : null,
        stress: ctx.stress || null,
        note: anonymizer.anonymizeText(cleanInlineText(ctx.note, isDetailed ? 240 : 120)),
        closed: false,
      });
    }

    for (const [date, log] of checkoutEntries) {
      const existing = byDate.get(date);
      const checkoutNote = anonymizer.anonymizeText(cleanInlineText(log.dailyNote, isDetailed ? 240 : 120));
      const sleep =
        existing?.sleepHours ??
        (typeof log.sleepHours === 'number' && Number.isFinite(log.sleepHours) ? log.sleepHours : null);
      const energy =
        existing?.energy ??
        (typeof log.energyLevel === 'number' && Number.isFinite(log.energyLevel) ? log.energyLevel : null);
      const mergedNote =
        existing?.note && checkoutNote && existing.note !== checkoutNote
          ? `${existing.note} / Cierre: ${checkoutNote}`
          : checkoutNote || existing?.note || '';

      byDate.set(date, {
        date,
        sleepHours: sleep,
        energy,
        mood: existing?.mood ?? null,
        stress: existing?.stress ?? null,
        note: mergedNote,
        closed: Boolean(log.closedAt || checkoutNote),
      });
    }

    const sortedDays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const sleepValues = sortedDays.map((d) => d.sleepHours).filter((v): v is number => v !== null);
    const energyValues = sortedDays.map((d) => d.energy).filter((v): v is number => v !== null);
    const moodValues = sortedDays.map((d) => d.mood).filter((v): v is number => v !== null);
    const highStressDays = sortedDays.filter((d) => d.stress === 'alto').length;

    const summaryBits: string[] = [];
    if (sleepValues.length > 0) {
      const avgSleep = (sleepValues.reduce((s, v) => s + v, 0) / sleepValues.length).toFixed(1).replace(/\.0$/, '');
      const trend = describeNumericTrend(sleepValues, 0.4);
      summaryBits.push(`sueño prom. ${avgSleep} h${trend ? ` (${trend})` : ''}`);
    }
    if (energyValues.length > 0) {
      const avgEnergy = (energyValues.reduce((s, v) => s + v, 0) / energyValues.length).toFixed(1).replace(/\.0$/, '');
      const trend = describeNumericTrend(energyValues, 0.35);
      summaryBits.push(`energía prom. ${avgEnergy}/5${trend ? ` (${trend})` : ''}`);
    }
    if (moodValues.length > 0) {
      const avgMood = (moodValues.reduce((s, v) => s + v, 0) / moodValues.length).toFixed(1).replace(/\.0$/, '');
      summaryBits.push(`ánimo prom. ${avgMood}/5`);
    }
    if (highStressDays > 0) {
      summaryBits.push(`estrés alto en ${pluralize(highStressDays, 'día', 'días')}`);
    }
    if (checkoutEntries.length > 0) {
      summaryBits.push(`${pluralize(checkoutEntries.length, 'cierre diario', 'cierres diarios')}`);
    }

    if (summaryBits.length > 0) {
      lines.push(`- Sueño, energía y cierres (últimos ${timeWindowDays} días): ${summaryBits.join(' · ')}`);
    }

    if (isDetailed) {
      const recentDetailedDays = sortedDays.slice(-7).reverse();
      for (const day of recentDetailedDays) {
        const dayBits: string[] = [];
        if (day.sleepHours !== null) dayBits.push(`sueño ${day.sleepHours} h`);
        if (day.energy !== null) dayBits.push(`energía ${day.energy}/5`);
        if (day.mood !== null) dayBits.push(`ánimo ${day.mood}/5`);
        if (day.stress) dayBits.push(`estrés ${day.stress}`);
        if (day.note) dayBits.push(`"${day.note}"`);
        if (dayBits.length > 0) {
          lines.push(`  - ${formatShortDayMonth(day.date)}: ${dayBits.join(' · ')}`);
        }
      }
    } else {
      const latestWithNote = [...sortedDays].reverse().find((d) => d.closed && d.note);
      if (latestWithNote) {
        lines.push(`  - Último cierre (${formatShortDayMonth(latestWithNote.date)}): ${latestWithNote.note}`);
      }
    }
  }

  // Daily priorities for today
  const priorities = (state.dailyPriorities || []).filter((p) => p.date === referenceDate);
  if (priorities.length > 0) {
    lines.push('- Prioridades de hoy:');
    for (const p of priorities.slice(0, isDetailed ? 10 : 5)) {
      const status = p.done ? 'hecha' : 'pendiente';
      lines.push(`  - [${status}] ${anonymizer.anonymizeText(cleanInlineText(p.text, 120))}`);
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

  const taskLimit = isDetailed ? 25 : 12;
  if (pendingExtras.length > 0) {
    lines.push(`- Tareas pendientes (${pendingExtras.length}):`);
    for (const task of pendingExtras.slice(0, taskLimit)) {
      const meta: string[] = [`prioridad ${task.priority}`];
      if (task.dueDate && /^\d{4}-\d{2}-\d{2}/.test(task.dueDate)) {
        const delta = daysBetween(referenceDate, task.dueDate.slice(0, 10));
        meta.push(`vence ${formatShortDayMonth(task.dueDate)} (${formatRelativeDays(delta)})`);
      }
      if (task.time) meta.push(task.time);
      if (task.durationMinutes) meta.push(`${task.durationMinutes} min`);
      lines.push(`  - ${anonymizer.anonymizeText(cleanInlineText(task.text, 120))} (${meta.join(', ')})`);
    }
    if (pendingExtras.length > taskLimit) {
      lines.push(`  - … y ${pendingExtras.length - taskLimit} tareas más.`);
    }
  }

  // Recurring tasks / habits
  const recurring = state.tasksRecurring || [];
  if (recurring.length > 0) {
    const todayLog = state.taskLog?.[referenceDate] || {};
    const pendingHabits = recurring.filter((r) => !todayLog[r.id]);
    const doneHabits = recurring.length - pendingHabits.length;
    const habitPreview = pendingHabits
      .slice(0, isDetailed ? 15 : 6)
      .map((h) => {
        const label = anonymizer.anonymizeText(cleanInlineText(h.name, 60));
        return h.time ? `${label} (${h.time})` : label;
      })
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
      for (const block of todayBlocks.slice(0, isDetailed ? 20 : 10)) {
        lines.push(`  - ${block.time || 'Sin hora'}: ${anonymizer.anonymizeText(cleanInlineText(block.activity, 100))}`);
      }
    }
    const otherBusyDays = DAYS.filter((day) => day !== todayKey && (state.agenda?.[day]?.length || 0) > 0);
    if (otherBusyDays.length > 0) {
      if (isDetailed) {
        lines.push('- Bloques de Agenda resto de la semana:');
        for (const day of otherBusyDays) {
          const dayBlocks = (state.agenda?.[day] || [])
            .slice()
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            .slice(0, 8)
            .map((b) => `${b.time || 'Sin hora'} ${anonymizer.anonymizeText(cleanInlineText(b.activity, 70))}`)
            .join(' · ');
          lines.push(`  - ${DAY_LABELS[day]}: ${dayBlocks}`);
        }
      } else {
        const summary = otherBusyDays.map((day) => `${DAY_LABELS[day]} (${state.agenda[day].length})`);
        lines.push(`- Carga de Agenda resto de la semana: ${summary.join(', ')}`);
      }
    }
  }

  // Calendar events
  const eventHorizon = isDetailed ? 30 : 14;
  const upcomingEvents = getUpcomingCalendarEvents(state, referenceDate, eventHorizon);
  if (upcomingEvents.length > 0) {
    lines.push(`- Próximos eventos de Calendario (${eventHorizon} días):`);
    for (const item of upcomingEvents.slice(0, isDetailed ? 20 : 10)) {
      const timeLabel = item.event.time ? ` ${item.event.time}` : '';
      lines.push(
        `  - ${formatShortDayMonth(item.effectiveDate)}${timeLabel} (${formatRelativeDays(item.delta)}): ${anonymizer.anonymizeText(cleanInlineText(item.event.name, 100))}`
      );
    }
  }

  // Active projects
  const activeProjects = (state.projects || []).filter((p) => p.status === 'activo');
  if (activeProjects.length > 0) {
    lines.push('- Proyectos activos:');
    for (const proj of activeProjects.slice(0, isDetailed ? 10 : 5)) {
      const openTasks = (proj.tasks || []).filter((t) => !t.done).length;
      const nextStep = anonymizer.anonymizeText(cleanInlineText(proj.nextStep, 90));
      const objective = isDetailed ? anonymizer.anonymizeText(cleanInlineText(proj.objective, 120)) : '';
      lines.push(
        `  - ${anonymizer.anonymizeText(cleanInlineText(proj.name, 80))} (${pluralize(openTasks, 'tarea pendiente', 'tareas pendientes')}${nextStep ? ` · próximo paso: ${nextStep}` : ''}${objective ? ` · objetivo: ${objective}` : ''})`
      );
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildFinanzasSection(
  state: LifeOSState,
  referenceDate: string,
  hideExactAmounts: boolean,
  timeWindowDays: AIContextTimeWindowDays,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const finance = state.finance;
  if (!finance) return null;

  const isDetailed = detailLevel === 'detailed';
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
      const realTxList: Array<{ tx: Transaction; category: string; amount: number }> = [];
      const adjustmentTxList: Array<{ tx: Transaction; amount: number }> = [];

      for (const tx of txList) {
        const amount = Math.abs(Number(tx.amount) || 0);
        const resolvedCat = resolveSafeCategoryName(state, tx.category);
        if (isBalanceAdjustmentTransaction(tx, resolvedCat)) {
          adjustmentTxList.push({ tx, amount });
          continue;
        }

        realTxList.push({ tx, category: resolvedCat, amount });
        if (tx.type === 'ingreso') {
          totalIncome += amount;
        } else {
          totalExpense += amount;
          if (tx.fixed === 'fijo') fixedExpense += amount;
          else variableExpense += amount;
          categoryTotals.set(resolvedCat, (categoryTotals.get(resolvedCat) || 0) + amount);
        }
      }

      if (realTxList.length > 0) {
        if (hideExactAmounts) {
          lines.push(`- Movimientos (${windowLabel}, ${currency}): ${pluralize(realTxList.length, 'movimiento', 'movimientos')}`);
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
            .slice(0, isDetailed ? 25 : 8);
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

          // Top individual expenses (top 3 in Resumido, top 8 in Detallado)
          const topExpenses = realTxList
            .filter((item) => item.tx.type === 'gasto' && item.amount > 0)
            .slice()
            .sort((a, b) => b.amount - a.amount || b.tx.date.localeCompare(a.tx.date))
            .slice(0, isDetailed ? 8 : 3);

          if (topExpenses.length > 0) {
            lines.push(`  - Mayores gastos individuales (top ${topExpenses.length}):`);
            for (const item of topExpenses) {
              const rawNote = cleanInlineText(item.tx.note, 60);
              const safeNote = anonymizer.anonymizeText(rawNote);
              const notePart =
                safeNote && normalizeTextKey(safeNote) !== normalizeTextKey(item.category)
                  ? ` (${safeNote})`
                  : '';
              if (hideExactAmounts) {
                lines.push(
                  `    - ${formatShortDayMonth(item.tx.date)} · ${item.category}${notePart}: ${formatPct(item.amount, totalExpense)} del gasto`
                );
              } else {
                lines.push(
                  `    - ${formatShortDayMonth(item.tx.date)} · ${item.category}${notePart}: ${formatMoney(item.amount, currency)}`
                );
              }
            }
          }
        }

        // Month-by-month evolution for windows >= 30 days
        if (timeWindowDays >= 30) {
          const byMonth = new Map<string, { income: number; expense: number; count: number }>();
          for (const item of realTxList) {
            const ym = item.tx.date.slice(0, 7);
            const bucket = byMonth.get(ym) || { income: 0, expense: 0, count: 0 };
            if (item.tx.type === 'ingreso') bucket.income += item.amount;
            else bucket.expense += item.amount;
            bucket.count += 1;
            byMonth.set(ym, bucket);
          }

          const sortedMonths = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
          if (sortedMonths.length > 0) {
            lines.push('  - Evolución mes a mes:');
            for (const [ym, bucket] of sortedMonths) {
              const monthLabel = formatMonthYear(ym);
              if (hideExactAmounts) {
                let relation = `${pluralize(bucket.count, 'movimiento', 'movimientos')}`;
                if (bucket.income > 0 && bucket.expense > 0) {
                  if (bucket.expense > bucket.income) {
                    relation += ' · balance negativo';
                  } else {
                    const savePct = Math.round(((bucket.income - bucket.expense) / bucket.income) * 100);
                    relation += ` · margen de ahorro aprox. ${savePct}%`;
                  }
                } else if (bucket.expense > 0) {
                  relation += ' · solo egresos';
                } else if (bucket.income > 0) {
                  relation += ' · solo ingresos';
                }
                lines.push(`    - ${monthLabel}: ${relation}`);
              } else {
                const netMonth = bucket.income - bucket.expense;
                lines.push(
                  `    - ${monthLabel}: ingresos ${formatMoney(bucket.income, currency)} · gastos ${formatMoney(bucket.expense, currency)} · neto ${formatMoney(netMonth, currency)}`
                );
              }
            }
          }
        }
      }

      // Separate accounting line for balance adjustments (never mixed into consumption categories)
      if (adjustmentTxList.length > 0) {
        const adjNet = adjustmentTxList.reduce(
          (sum, item) => sum + (item.tx.type === 'ingreso' ? item.amount : -item.amount),
          0
        );
        if (hideExactAmounts) {
          lines.push(
            `- Ajustes contables de saldo (${windowLabel}, ${currency}, excluidos de gastos reales): ${pluralize(adjustmentTxList.length, 'ajuste', 'ajustes')} (montos ocultos por privacidad)`
          );
        } else {
          lines.push(
            `- Ajustes contables de saldo (${windowLabel}, ${currency}, excluidos de gastos reales): ${pluralize(adjustmentTxList.length, 'ajuste', 'ajustes')} (efecto neto ${formatMoney(adjNet, currency)})`
          );
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

  // Projected balance for the next 30 days (expected incomes vs. upcoming commitments/subscriptions)
  const projection30 = deriveCashflowProjection(state, '30d', referenceDate);
  if (projection30.events.length > 0) {
    const projectedCurrencies = Object.values(projection30.summariesByCurrency).filter(
      (summary) => summary.expectedIncomes > 0 || summary.committedExpenses > 0
    );
    if (projectedCurrencies.length > 0) {
      for (const summary of projectedCurrencies) {
        const net30 = summary.expectedIncomes - summary.committedExpenses;
        if (hideExactAmounts) {
          const incCount = projection30.events.filter(
            (ev) => ev.type === 'expected_income' && (ev.currency || 'UYU').toUpperCase() === summary.currency
          ).length;
          const expCount = projection30.events.filter(
            (ev) => ev.type === 'committed_expense' && (ev.currency || 'UYU').toUpperCase() === summary.currency
          ).length;
          let flowLabel = 'flujo proyectado equilibrado';
          if (summary.expectedIncomes === 0 && summary.committedExpenses > 0) {
            flowLabel = 'solo compromisos por vencer sin ingresos esperados registrados';
          } else if (net30 > 0) {
            flowLabel = 'flujo proyectado positivo (ingresos esperados cubren los compromisos)';
          } else if (net30 < 0) {
            flowLabel = 'flujo proyectado negativo (compromisos superan los ingresos esperados)';
          }
          lines.push(
            `- Balance proyectado (próximos 30 días, ${summary.currency}): ${pluralize(incCount, 'ingreso esperado', 'ingresos esperados')} vs. ${pluralize(expCount, 'compromiso/suscripción por vencer', 'compromisos/suscripciones por vencer')} · ${flowLabel} (montos ocultos por privacidad)`
          );
        } else {
          lines.push(
            `- Balance proyectado (próximos 30 días, ${summary.currency}): ingresos esperados ${formatMoney(summary.expectedIncomes, summary.currency)} · compromisos/suscripciones ${formatMoney(summary.committedExpenses, summary.currency)} · flujo neto proyectado ${formatMoney(net30, summary.currency)} · saldo proyectado ${formatMoney(summary.projectedBalance, summary.currency)}`
          );
        }
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

    for (const c of commitments.slice(0, isDetailed ? 16 : 8)) {
      const curr = (c.currency || 'UYU').toUpperCase();
      const dueLabel = c.nextDueDate
        ? `vence ${formatShortDayMonth(c.nextDueDate)} (${formatRelativeDays(daysBetween(referenceDate, c.nextDueDate.slice(0, 10)))})`
        : 'sin fecha';
      const freqLabel = c.frequency ? ` · ${translateFrequency(c.frequency)}` : '';
      const instLabel =
        c.currentInstallment && c.totalInstallments
          ? ` · cuota ${c.currentInstallment}/${c.totalInstallments}`
          : '';
      const safeName = anonymizer.anonymizeText(cleanInlineText(c.name, 70));
      if (hideExactAmounts) {
        const shareLabel =
          totalCommitmentWeight > 0 && commitments.length > 1
            ? ` · ${formatPct(Math.max(0, Number(c.amount) || 0), totalCommitmentWeight)} de los compromisos`
            : '';
        lines.push(`  - ${safeName} (${dueLabel}${freqLabel}${instLabel}${shareLabel})`);
      } else {
        lines.push(`  - ${safeName}: ${formatMoney(c.amount, curr)} (${dueLabel}${freqLabel}${instLabel})`);
      }
    }

    for (const sub of subscriptions.slice(0, isDetailed ? 15 : 6)) {
      const due = sub.dueDay ? ` · día ${sub.dueDay}` : '';
      const safeName = anonymizer.anonymizeText(cleanInlineText(sub.name, 70));
      if (hideExactAmounts) {
        lines.push(`  - Suscripción: ${safeName}${due} (monto oculto)`);
      } else {
        lines.push(`  - Suscripción: ${safeName} (${formatMoney(sub.amount, 'UYU')}${due})`);
      }
    }

    for (const debt of debts.slice(0, isDetailed ? 12 : 5)) {
      const due = debt.dueDate ? ` · vence ${formatShortDayMonth(debt.dueDate)}` : '';
      const safeName = anonymizer.anonymizeText(cleanInlineText(debt.name, 70));
      if (hideExactAmounts) {
        lines.push(`  - Deuda activa: ${safeName}${due} (saldo oculto)`);
      } else {
        lines.push(`  - Deuda: ${safeName} (${formatMoney(debt.amount, 'UYU')}${due})`);
      }
    }

    for (const ag of agreements.slice(0, isDetailed ? 10 : 5)) {
      const safeTitle = anonymizer.anonymizeText(cleanInlineText(ag.title, 70));
      const safeCreditor = ag.creditorName ? anonymizer.anonymizeDirectName(ag.creditorName) : '';
      const creditorNote =
        safeCreditor && !normalizeTextKey(safeTitle).includes(normalizeTextKey(safeCreditor))
          ? ` con ${safeCreditor}`
          : '';
      if (hideExactAmounts) {
        lines.push(`  - Acuerdo de financiación activo: ${safeTitle}${creditorNote} (${ag.currency} · saldo oculto)`);
      } else {
        lines.push(
          `  - Acuerdo de financiación: ${safeTitle}${creditorNote} (saldo base ${formatMoney(ag.initialRemainingBalance, ag.currency)})`
        );
      }
    }
  }

  // Expected incomes
  const expectedIncomes = (finance.expectedIncomes || []).filter((inc) => inc.active !== false);
  if (expectedIncomes.length > 0) {
    lines.push('- Ingresos esperados:');
    for (const inc of expectedIncomes.slice(0, isDetailed ? 12 : 5)) {
      const curr = (inc.currency || 'UYU').toUpperCase();
      const freqEs = translateFrequency(inc.frequency);
      const safeName = anonymizer.anonymizeText(cleanInlineText(inc.name, 70));
      if (hideExactAmounts) {
        lines.push(`  - ${safeName} (${freqEs} · monto oculto)`);
      } else {
        lines.push(`  - ${safeName}: ${formatMoney(inc.amount, curr)} (${freqEs})`);
      }
    }
  }

  // Investments
  const investments = (finance.investments || []).filter((inv) => Number(inv.amount) > 0);
  if (investments.length > 0) {
    const totalInv = investments.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    if (hideExactAmounts) {
      const shares = investments
        .slice(0, isDetailed ? 10 : 5)
        .map((inv, idx) => `Posición ${idx + 1}: ${formatPct(Number(inv.amount || 0), totalInv)}`)
        .join(', ');
      lines.push(`- Inversiones: ${pluralize(investments.length, 'posición', 'posiciones')} (${shares} · montos ocultos)`);
    } else {
      const detail = investments
        .slice(0, isDetailed ? 10 : 5)
        .map((inv) => `${cleanInlineText(inv.name, 50)}: ${formatMoney(inv.amount, 'UYU')}`)
        .join(' · ');
      lines.push(`- Inversiones (${formatMoney(totalInv, 'UYU')}): ${detail}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatExamLabel(exam: Exam, subjectName: string | null): string {
  const cleanTitle = cleanInlineText(exam.title, 80);
  const cleanSubject = cleanInlineText(subjectName, 60);

  const isGenericExamTitle = !cleanTitle || /^ex[aá]men$/i.test(cleanTitle);
  if (isGenericExamTitle) {
    return cleanSubject || 'Sin materia';
  }

  const stripped = cleanTitle
    .replace(/^ex[aá]men(?:\s*(?:de|del|:|-|—|\|))?\s*/i, '')
    .replace(/^\(([^)]+)\)$/, '$1')
    .trim();

  const effectiveTitle = stripped || cleanTitle;

  if (cleanSubject) {
    const lowerTitle = effectiveTitle.toLowerCase();
    const lowerSubject = cleanSubject.toLowerCase();
    if (lowerTitle === lowerSubject || lowerTitle.includes(lowerSubject)) {
      return effectiveTitle;
    }
    return `${cleanSubject} — ${effectiveTitle}`;
  }

  return effectiveTitle;
}

function buildEstudiosSection(
  state: LifeOSState,
  referenceDate: string,
  timeWindowDays: AIContextTimeWindowDays,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const study = state.study;
  if (!study) return null;

  const isDetailed = detailLevel === 'detailed';
  const subjectById = new Map((study.subjects || []).map((s) => [s.id, s]));

  // Pending exams sorted by proximity (no redundant "Examen (Materia)" prefix)
  const pendingExams: Exam[] = (study.exams || [])
    .filter((exam) => exam.status === 'pendiente')
    .slice()
    .sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));

  if (pendingExams.length > 0) {
    lines.push(`- Exámenes próximos (${pendingExams.length}):`);
    for (const exam of pendingExams.slice(0, isDetailed ? 15 : 8)) {
      const subjectName = exam.subjectId ? subjectById.get(exam.subjectId)?.name || null : null;
      const label = anonymizer.anonymizeText(formatExamLabel(exam, subjectName));
      const delta = exam.date ? daysBetween(referenceDate, exam.date.slice(0, 10)) : null;
      const dateInfo = exam.date
        ? `${formatReadableDate(exam.date)}${exam.time ? ` ${exam.time}` : ''} · ${formatRelativeDays(delta ?? 0)}`
        : 'sin fecha';
      const pendingExamTopics = (exam.topics || []).filter((t) => !t.done).map((t) => cleanInlineText(t.title, 50));
      const maxExamTopics = isDetailed ? 10 : 4;
      const topicsNote =
        pendingExamTopics.length > 0
          ? ` · temas pendientes: ${pendingExamTopics.slice(0, maxExamTopics).join(', ')}${pendingExamTopics.length > maxExamTopics ? ` (+${pendingExamTopics.length - maxExamTopics})` : ''}`
          : '';
      lines.push(`  - ${label}: ${dateInfo}${topicsNote}`);
    }
  }

  // Active subjects and pending topics
  const subjects = study.subjects || [];
  if (subjects.length > 0) {
    lines.push(`- Materias activas (${subjects.length}):`);
    const maxTopics = isDetailed ? 12 : 5;
    for (const subject of subjects.slice(0, isDetailed ? 15 : 10)) {
      const topics = subject.topics || [];
      const doneTopics = topics.filter((t) => t.done).length;
      const pendingTopics = topics.filter((t) => !t.done);
      if (topics.length === 0) {
        lines.push(`  - ${cleanInlineText(subject.name, 70)} (sin temario cargado)`);
      } else {
        const preview = pendingTopics
          .slice(0, maxTopics)
          .map((t) => cleanInlineText(t.title, 55))
          .join(', ');
        lines.push(
          `  - ${cleanInlineText(subject.name, 70)}: ${doneTopics}/${topics.length} temas listos${preview ? ` · pendientes: ${preview}${pendingTopics.length > maxTopics ? ` (+${pendingTopics.length - maxTopics})` : ''}` : ' · temario al día'}`
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

    if (isDetailed) {
      const minsBySubject = new Map<string, number>();
      for (const log of recentLogs) {
        const subName = log.subjectId ? subjectById.get(log.subjectId)?.name || 'General' : 'General';
        minsBySubject.set(subName, (minsBySubject.get(subName) || 0) + (Number(log.minutes) || 0));
      }
      const breakdown = [...minsBySubject.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, mins]) => `${cleanInlineText(name, 45)}: ${(mins / 60).toFixed(1).replace(/\.0$/, '')} h`)
        .join(' · ');
      if (breakdown) {
        lines.push(`  - Horas por materia: ${breakdown}`);
      }
    }
  } else if ((study.studyLog || []).length > 0) {
    lines.push(`- Estudio reciente (últimos ${timeWindowDays} días): sin sesiones registradas en este período.`);
  }

  // Practice attempts filtered by chosen time window
  const attempts = (study.practiceAttempts || [])
    .filter((a) => isWithinLookbackWindow(a.date, referenceDate, timeWindowDays))
    .slice(isDetailed ? -12 : -5);
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
  timeWindowDays: AIContextTimeWindowDays,
  detailLevel: AIContextDetailLevel
): string | null {
  const lines: string[] = [];
  const gym = state.gym;
  if (!gym) return null;

  const isDetailed = detailLevel === 'detailed';
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

    // Routine distribution across the full selected window (including 0-count configured routines)
    if (windowSessions.length > 0 || routines.length > 0) {
      const routineCounts = new Map<string, { label: string; count: number }>();
      for (const r of routines) {
        const label = cleanInlineText(r.name, 50);
        if (!label) continue;
        const key = normalizeTextKey(label);
        if (!routineCounts.has(key)) {
          routineCounts.set(key, { label, count: 0 });
        }
      }
      for (const session of windowSessions) {
        const label = cleanInlineText(session.weekLabel || 'Sesión libre', 50) || 'Sesión libre';
        const key = normalizeTextKey(label);
        const existing = routineCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          routineCounts.set(key, { label, count: 1 });
        }
      }
      const distributionEntries = [...routineCounts.values()];
      if (distributionEntries.length > 0) {
        const distText = distributionEntries.map((entry) => `${entry.label}: ${entry.count}`).join(' · ');
        lines.push(`- Distribución por rutina (últimos ${timeWindowDays} días): ${distText}`);
      }
    }

    if (windowSessions.length > 0) {
      const sessionLimit = isDetailed ? 15 : 6;
      const shownSessions = windowSessions.slice(0, sessionLimit);
      const listHeading =
        windowSessions.length > shownSessions.length
          ? `- Últimas ${shownSessions.length} de ${windowSessions.length} sesiones (últimos ${timeWindowDays} días):`
          : `- Sesiones registradas (${windowSessions.length} en los últimos ${timeWindowDays} días):`;
      lines.push(listHeading);

      const exLimit = isDetailed ? 8 : 4;
      for (const session of shownSessions) {
        const volume = Math.round(getPerformedGymVolume(session));
        const label = cleanInlineText(session.weekLabel || 'Sesión libre', 50);
        const exSummaries: string[] = [];
        for (const ex of (session.exercises || []).slice(0, exLimit)) {
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
      const improved = windowProgress.exercises.filter((ex) => ex.state === 'improved').slice(0, isDetailed ? 10 : 5);
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

      // Monthly volume evolution in Detallado mode
      if (isDetailed) {
        const volByMonth = new Map<string, { sessions: number; totalVolume: number }>();
        for (const session of windowSessions) {
          const ym = session.date.slice(0, 7);
          const bucket = volByMonth.get(ym) || { sessions: 0, totalVolume: 0 };
          bucket.sessions += 1;
          bucket.totalVolume += getPerformedGymVolume(session);
          volByMonth.set(ym, bucket);
        }
        const sortedVolMonths = [...volByMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
        if (sortedVolMonths.length > 0) {
          lines.push(`- Evolución de volumen mensual (últimos ${timeWindowDays} días):`);
          for (const [ym, bucket] of sortedVolMonths) {
            const totalKg = Math.round(bucket.totalVolume);
            const avgKg = Math.round(bucket.totalVolume / bucket.sessions);
            lines.push(
              `  - ${formatMonthYear(ym)}: ${pluralize(bucket.sessions, 'sesión', 'sesiones')} · volumen total ${totalKg.toLocaleString('es-UY')} kg (prom. ${avgKg.toLocaleString('es-UY')} kg/sesión)`
            );
          }
        }
      }
    } else {
      lines.push(`- Sesiones registradas (últimos ${timeWindowDays} días): sin sesiones en este período.`);
    }
  }

  if (routines.length > 0) {
    const routineText = routines
      .slice(0, isDetailed ? 12 : 6)
      .map((r) => {
        const days = r.days && r.days.length > 0 ? ` (${r.days.map((d) => DAY_LABELS[d]).join(', ')})` : '';
        return `${cleanInlineText(r.name, 45)}${days} · ${pluralize((r.exercises || []).length, 'ejercicio', 'ejercicios')}`;
      })
      .join(' | ');
    lines.push(`- Rutinas configuradas: ${routineText}`);
  }

  // Body weight evolution in the window (>= 2 entries) or latest recorded weight
  const weights = (gym.weight || [])
    .filter((w) => typeof w.kg === 'number' && Number.isFinite(w.kg))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const windowWeights = weights.filter((w) => isWithinLookbackWindow(w.date, referenceDate, timeWindowDays));

  if (windowWeights.length >= 2) {
    const first = windowWeights[0];
    const latest = windowWeights[windowWeights.length - 1];
    const delta = Number((latest.kg - first.kg).toFixed(1));
    const deltaStr = delta === 0 ? 'sin variación' : `${delta > 0 ? '+' : ''}${delta} kg`;
    let rangeNote = '';
    if (isDetailed && windowWeights.length >= 3) {
      const minKg = Math.min(...windowWeights.map((w) => w.kg));
      const maxKg = Math.max(...windowWeights.map((w) => w.kg));
      rangeNote = ` · rango ${minKg} kg a ${maxKg} kg`;
    }
    lines.push(
      `- Evolución de peso corporal (últimos ${timeWindowDays} días, ${windowWeights.length} registros): de ${first.kg} kg (${formatShortDayMonth(first.date)}) a ${latest.kg} kg (${formatShortDayMonth(latest.date)}) (${deltaStr})${rangeNote}`
    );
  } else if (weights.length > 0) {
    const latest = weights[weights.length - 1];
    const prev = weights.length >= 2 ? weights[weights.length - 2] : null;
    const diff = prev ? Number((latest.kg - prev.kg).toFixed(1)) : null;
    const diffStr = diff !== null && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff} kg vs registro anterior)` : '';
    lines.push(`- Peso corporal más reciente: ${latest.kg} kg (${formatShortDayMonth(latest.date)})${diffStr}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildTrabajoSection(
  state: LifeOSState,
  referenceDate: string,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const applications = state.jobs?.applications || [];
  if (applications.length === 0) return null;

  const isDetailed = detailLevel === 'detailed';
  const active = applications.filter(isJobApplicationActive);
  const closed = applications.filter((app) => !isJobApplicationActive(app));

  lines.push(
    `- Estado general: ${pluralize(active.length, 'postulación activa', 'postulaciones activas')}${closed.length > 0 ? ` · ${pluralize(closed.length, 'proceso cerrado', 'procesos cerrados')}` : ''}`
  );

  if (active.length > 0) {
    lines.push('- Postulaciones activas:');
    const sortedActive = active.slice().sort((a, b) => {
      const nextA = getNextJobKeyDate(a, referenceDate)?.keyDate.date || '9999-99-99';
      const nextB = getNextJobKeyDate(b, referenceDate)?.keyDate.date || '9999-99-99';
      return nextA.localeCompare(nextB) || (b.fecha || '').localeCompare(a.fecha || '');
    });

    const activeLimit = isDetailed ? 25 : 10;
    for (const app of sortedActive.slice(0, activeLimit)) {
      const tipo = getJobApplicationType(app);
      const stageLabel = getJobStageLabel(tipo, app.estado);
      const next = getNextJobKeyDate(app, referenceDate);
      const nextInfo = next
        ? ` · próximo hito: ${JOB_KEY_DATE_LABELS[next.keyDate.kind]} ${formatShortDayMonth(next.keyDate.date)} (${formatRelativeDays(next.daysUntil)})`
        : '';
      const actionNote = anonymizer.anonymizeText(cleanInlineText(app.nextAction || app.followUpNotes, isDetailed ? 140 : 80));
      const recruiterNote =
        isDetailed && app.reclutador
          ? ` · contacto: ${anonymizer.anonymizeDirectName(app.reclutador)}`
          : '';
      const extraNotes =
        isDetailed && app.notas
          ? ` · notas: ${anonymizer.anonymizeText(cleanInlineText(app.notas, 140))}`
          : '';
      lines.push(
        `  - ${cleanInlineText(app.empresa, 50)} — ${cleanInlineText(app.puesto, 60)} [${stageLabel}${tipo === 'concurso' ? ' · concurso' : ''}]${nextInfo}${actionNote ? ` · ${actionNote}` : ''}${recruiterNote}${extraNotes}`
      );
    }
    if (sortedActive.length > activeLimit) {
      lines.push(`  - … y ${sortedActive.length - activeLimit} postulaciones activas más.`);
    }
  }

  // Summary of closed processes by outcome/status
  if (closed.length > 0) {
    const countsByStatus = new Map<string, number>();
    for (const app of closed) {
      const tipo = getJobApplicationType(app);
      const label = getJobStageLabel(tipo, app.estado);
      countsByStatus.set(label, (countsByStatus.get(label) || 0) + 1);
    }
    const statusSummary = [...countsByStatus.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label}: ${count}`)
      .join(' · ');
    lines.push(`- Resultados de procesos cerrados (${closed.length}): ${statusSummary}`);

    if (isDetailed) {
      const recentClosed = closed
        .slice()
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
        .slice(0, 10);
      for (const app of recentClosed) {
        const tipo = getJobApplicationType(app);
        const stageLabel = getJobStageLabel(tipo, app.estado);
        const datePart = app.fecha ? ` (${formatShortDayMonth(app.fecha)})` : '';
        lines.push(
          `  - ${cleanInlineText(app.empresa, 50)} — ${cleanInlineText(app.puesto, 60)} [${stageLabel}]${datePart}`
        );
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildNegocioSection(
  state: LifeOSState,
  referenceDate: string,
  hideExactAmounts: boolean,
  timeWindowDays: AIContextTimeWindowDays,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const inventory = state.resale?.inventory || [];
  const commercial = state.resale?.commercial;
  const windowLabel = `últimos ${timeWindowDays} días`;
  const isDetailed = detailLevel === 'detailed';

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

    const stockLimit = isDetailed ? 15 : 6;
    if (inStock.length > 0) {
      const preview = inStock
        .slice(0, stockLimit)
        .map((item) => {
          const safeItem = anonymizer.anonymizeText(cleanInlineText(item.item, 50));
          return hideExactAmounts
            ? safeItem
            : `${safeItem} (compra ${formatMoney(item.buyPrice, item.purchaseCurrency || 'UYU')})`;
        })
        .join(', ');
      lines.push(`  - En stock: ${preview}${inStock.length > stockLimit ? ` (+${inStock.length - stockLimit})` : ''}`);
    }

    if (isDetailed && soldInWindow.length > 0) {
      lines.push(`  - Ventas concretadas recientes (${soldInWindow.length}):`);
      for (const item of soldInWindow.slice(0, 10)) {
        const safeItem = anonymizer.anonymizeText(cleanInlineText(item.item, 50));
        const dateLabel = formatShortDayMonth(item.sellDate || item.buyDate);
        if (hideExactAmounts) {
          const profit = (Number(item.sellPrice) || 0) - (Number(item.buyPrice) || 0);
          const margin = Number(item.sellPrice) > 0 ? ` (margen ${formatPct(profit, Number(item.sellPrice))})` : '';
          lines.push(`    - ${dateLabel} · ${safeItem}${margin}`);
        } else {
          lines.push(
            `    - ${dateLabel} · ${safeItem}: venta ${formatMoney(Number(item.sellPrice) || 0, item.saleCurrency || 'UYU')}`
          );
        }
      }
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

function parseGoalNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    // Detect Spanish thousands-grouped integers like "163.830" or "1.250.000"
    if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
      return Number(trimmed.replace(/\./g, ''));
    }
    // Detect Spanish formatted decimals like "163.830,50" or "77,9"
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(trimmed)) {
      return Number(trimmed.replace(/\./g, '').replace(',', '.'));
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatGoalValue(val: number, goal: Goal, isWeightGoal: boolean): string {
  if (!Number.isFinite(val)) return 'N/D';
  const isFinancialGoal = Boolean(goal.linked && FINANCIAL_LINKED_GOAL_SOURCES.has(goal.linked));
  if (isFinancialGoal) {
    return formatMoney(val, 'UYU');
  }
  if (isWeightGoal) {
    const rounded = Number(val.toFixed(1));
    return `${rounded} kg`;
  }
  if (goal.linked === 'study_hours') {
    const rounded = Number(val.toFixed(1));
    return `${rounded} h`;
  }
  if (goal.linked === 'gym_sessions') {
    return `${Math.round(val).toLocaleString('es-UY')}`;
  }
  if (Number.isInteger(val)) {
    return val.toLocaleString('es-UY', { maximumFractionDigits: 0 });
  }
  return val.toLocaleString('es-UY', { maximumFractionDigits: 2 });
}

function resolveGoalProgress(state: LifeOSState, goal: Goal): {
  initial: number;
  current: number;
  target: number;
  pct: number | null;
  isWeightGoal: boolean;
  isFinancialGoal: boolean;
} {
  const rawInitial = parseGoalNumber(goal.initial);
  const rawCurrent = parseGoalNumber(goal.current);
  const target = parseGoalNumber(goal.target);
  const isFinancialGoal = Boolean(goal.linked && FINANCIAL_LINKED_GOAL_SOURCES.has(goal.linked));
  const isWeightGoal =
    goal.linked === 'weight' ||
    (!goal.linked && /\b(peso|kg|kilos?|adelgazar|bajar de peso)\b/i.test(goal.name || ''));

  const sortedWeights = (state.gym?.weight || [])
    .filter((w) => typeof w.kg === 'number' && Number.isFinite(w.kg))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  let effectiveInitial = rawInitial;
  let effectiveCurrent = rawCurrent;

  if (isWeightGoal && sortedWeights.length > 0) {
    const earliestWeight = sortedWeights[0].kg;
    const latestWeight = sortedWeights[sortedWeights.length - 1].kg;
    if (goal.linked === 'weight' || rawCurrent === rawInitial || rawCurrent <= 0) {
      effectiveCurrent = latestWeight;
    }
    if (effectiveInitial <= 0) {
      effectiveInitial = earliestWeight;
    }
  } else if (goal.linked && (rawCurrent === 0 || rawCurrent === rawInitial)) {
    const derived = goalCurrentValue(state, goal);
    if (Number.isFinite(derived)) {
      effectiveCurrent = derived;
    }
  }

  // Descending goal with missing initial baseline (e.g. initial=0, current=84, target=75)
  if (effectiveInitial === 0 && isWeightGoal && effectiveCurrent > target) {
    return {
      initial: effectiveInitial,
      current: effectiveCurrent,
      target,
      pct: null,
      isWeightGoal,
      isFinancialGoal,
    };
  }

  const span = target - effectiveInitial;
  let pct = 0;
  if (span === 0) {
    pct = effectiveCurrent === target ? 100 : 0;
  } else {
    // Works accurately for both ascending (target > initial) and descending (target < initial) goals
    const rawPct = ((effectiveCurrent - effectiveInitial) / span) * 100;
    pct = Math.max(0, Math.min(100, Math.round(rawPct)));
  }

  return {
    initial: effectiveInitial,
    current: effectiveCurrent,
    target,
    pct,
    isWeightGoal,
    isFinancialGoal,
  };
}

function buildNotasSection(
  state: LifeOSState,
  hideExactAmounts: boolean,
  detailLevel: AIContextDetailLevel,
  anonymizer: PersonAnonymizer
): string | null {
  const lines: string[] = [];
  const isDetailed = detailLevel === 'detailed';

  const activeNotes = (state.notes?.postits || [])
    .filter((n) => {
      if (n.archived) return false;
      const t = cleanInlineText(n.title);
      const b = isDetailed ? cleanMultilineText(n.text, 2000) : cleanInlineText(n.text, 180);
      return Boolean(t || b);
    })
    .slice()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.date || '').localeCompare(a.date || ''));

  if (activeNotes.length > 0) {
    lines.push(`- Notas recientes (${activeNotes.length}):`);
    for (const note of activeNotes.slice(0, isDetailed ? 20 : 6)) {
      const title = anonymizer.anonymizeText(cleanInlineText(note.title, 80));
      const body = anonymizer.anonymizeText(
        isDetailed ? cleanMultilineText(note.text, 2000) : cleanInlineText(note.text, 180)
      );
      const prefix = note.pinned ? '[Fijada] ' : '';
      if (title && body) {
        lines.push(`  - ${prefix}${title}: ${body}`);
      } else if (title) {
        lines.push(`  - ${prefix}${title}`);
      } else if (body) {
        lines.push(`  - ${prefix}${body}`);
      }
    }
  }

  const pendingShopping = (state.notes?.shopping || []).filter((item) => !item.done && cleanInlineText(item.text));
  if (pendingShopping.length > 0) {
    const shoppingLimit = isDetailed ? 40 : 8;
    const items = pendingShopping
      .slice(0, shoppingLimit)
      .map((i) => anonymizer.anonymizeText(cleanInlineText(i.text, 60)))
      .join(', ');
    lines.push(
      `- Lista de compras pendiente (${pendingShopping.length}): ${items}${pendingShopping.length > shoppingLimit ? ` (+${pendingShopping.length - shoppingLimit})` : ''}`
    );
  }

  if (isDetailed) {
    const possessions = (state.notes?.possessions || []).filter((p) => cleanInlineText(p.name));
    if (possessions.length > 0) {
      lines.push(`- Posesiones y objetos relevantes (${possessions.length}):`);
      for (const item of possessions.slice(0, 20)) {
        const meta: string[] = [];
        const cat = cleanInlineText(item.category, 40);
        const loc = cleanInlineText(item.location, 50);
        const note = anonymizer.anonymizeText(cleanInlineText(item.note, 90));
        if (cat) meta.push(cat);
        if (loc) meta.push(`ubicación: ${loc}`);
        if (note) meta.push(note);
        lines.push(
          `  - ${anonymizer.anonymizeText(cleanInlineText(item.name, 70))}${meta.length > 0 ? ` (${meta.join(' · ')})` : ''}`
        );
      }
    }

    const links = (state.notes?.links || []).filter((l) => cleanInlineText(l.name));
    if (links.length > 0) {
      const linkSummary = links
        .slice(0, 10)
        .map((l) => cleanInlineText(l.name, 50))
        .join(', ');
      lines.push(`- Enlaces guardados (${links.length}): ${linkSummary}`);
    }
  }

  const goals = state.goals || [];
  if (goals.length > 0) {
    lines.push('- Objetivos personales:');
    for (const goal of goals.slice(0, isDetailed ? 15 : 5)) {
      const resolved = resolveGoalProgress(state, goal);
      const safeName = anonymizer.anonymizeText(cleanInlineText(goal.name, 70));
      if (hideExactAmounts && resolved.isFinancialGoal) {
        const pctPart = resolved.pct !== null ? `${resolved.pct}% de avance` : 'en curso';
        lines.push(`  - ${safeName}: ${pctPart} (montos ocultos por privacidad)`);
      } else {
        const curFormatted = formatGoalValue(resolved.current, goal, resolved.isWeightGoal);
        const targetFormatted = formatGoalValue(resolved.target, goal, resolved.isWeightGoal);
        const isDescending = resolved.target < resolved.initial;
        const initNote =
          isDescending && resolved.initial > 0
            ? `desde ${formatGoalValue(resolved.initial, goal, resolved.isWeightGoal)}, actual ${curFormatted}, meta ${targetFormatted}`
            : `${curFormatted} / ${targetFormatted}`;
        if (resolved.pct !== null) {
          lines.push(`  - ${safeName}: ${resolved.pct}% de avance (${initNote})`);
        } else {
          lines.push(`  - ${safeName}: en curso (actual ${curFormatted}, meta ${targetFormatted})`);
        }
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
  const detailLevel = normalizeDetailLevel(options.detailLevel);
  const isDataOnly = options.mode === 'data_only' || options.goalId === null;
  const mode: AIContextMode = isDataOnly ? 'data_only' : 'guided';
  const goal = isDataOnly || !options.goalId ? null : getGoalDefinition(options.goalId);
  const visibleIds = new Set(getVisibleContextModules(state).map((m) => m.id));
  const moduleOrder = AI_CONTEXT_MODULES.map((m) => m.id);
  const selectedSet = new Set(options.selectedModules);

  const includedModules = moduleOrder.filter((id) => selectedSet.has(id) && visibleIds.has(id));
  const anonymizer = createPersonAnonymizer(options.hideExactAmounts);

  const dayName = DAY_LABELS[dayKeyFromDate(parseISODate(referenceDate))];
  const detailLabel = detailLevel === 'detailed' ? 'Detallado' : 'Resumido';
  const blocks: string[] = [
    isDataOnly || !goal
      ? '# Datos personales — Celestian LifeOS'
      : `# Contexto personal — ${goal.title}`,
    `Fecha de referencia: ${formatReadableDate(referenceDate)} (${dayName})`,
    `Período de datos: últimos ${timeWindowDays} días`,
    `Nivel de detalle: ${detailLabel}`,
  ];

  if (options.hideExactAmounts) {
    blocks.push(
      '> Privacidad activa: los montos exactos, nombres de cuentas bancarias y nombres propios de terceros fueron omitidos o anonimizados.'
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
        content = buildHoyAgendaSection(state, referenceDate, timeWindowDays, detailLevel, anonymizer);
        break;
      case 'finanzas':
        sectionTitle = 'Finanzas';
        content = buildFinanzasSection(
          state,
          referenceDate,
          options.hideExactAmounts,
          timeWindowDays,
          detailLevel,
          anonymizer
        );
        break;
      case 'estudios':
        sectionTitle = 'Estudios';
        content = buildEstudiosSection(state, referenceDate, timeWindowDays, detailLevel, anonymizer);
        break;
      case 'gimnasio':
        sectionTitle = 'Gimnasio';
        content = buildGimnasioSection(state, referenceDate, timeWindowDays, detailLevel);
        break;
      case 'trabajo':
        sectionTitle = 'Trabajo';
        content = buildTrabajoSection(state, referenceDate, detailLevel, anonymizer);
        break;
      case 'negocio':
        sectionTitle = 'Mi negocio';
        content = buildNegocioSection(
          state,
          referenceDate,
          options.hideExactAmounts,
          timeWindowDays,
          detailLevel,
          anonymizer
        );
        break;
      case 'notas':
        sectionTitle = 'Notas y objetivos';
        content = buildNotasSection(state, options.hideExactAmounts, detailLevel, anonymizer);
        break;
    }

    if (content) {
      const safeContent = options.hideExactAmounts ? maskFinancialText(content, true) : content;
      dataSections.push(`### ${sectionTitle}\n${safeContent}`);
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
    detailLevel,
    includedModules,
    text,
    charCount: text.length,
    wordCount,
    hasAnyData: dataSections.length > 0,
  };
}
