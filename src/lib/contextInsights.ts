import type {
  DailyContextEntry,
  DailyContextMorningSnapshot,
  LifeOSState,
  ViewType,
} from '../types';
import { dayKeyFromDate, daysBetween, todayISO } from './storage';
import { isModuleEnabled } from './moduleVisibility';
import { isTaskBlocked, type UnifiedTask } from './taskDependencies';
import { isPerformedGymSession } from './gymMetrics';

/**
 * Reglas de UX configurables para Estado Contextual 1.0.
 *
 * NOTA DE DISEÑO Y TRANSPARENCIA:
 * Estos umbrales son reglas de interacción e interfaz (heurísticas de UX) diseñadas
 * exclusivamente para presentar invitaciones prudentes de revisión del día.
 * NO constituyen modelos predictivos clínicos, puntuaciones biomédicas ni algoritmos
 * validados de capacidad humana o readiness.
 */
export const CONTEXT_UX_THRESHOLDS = {
  /** Horas mínimas recomendadas de sueño para evaluar alerta de noches cortas acumuladas (7 h). */
  RECOMMENDED_MIN_SLEEP_HOURS: 7,
  /** Días consecutivos con sueño corto para sugerir atención en el resumen semanal (3 días). */
  SHORT_SLEEP_ALERT_DAYS: 3,
  /** Umbral de sueño corto para la evaluación contextual del día actual (< 6.5 h, p. ej. 6 h o menos). */
  SHORT_SLEEP_HOURS_THRESHOLD: 6.5,
  /** Umbral de energía baja en la escala subjetiva 1–5 (<= 2). */
  LOW_ENERGY_THRESHOLD: 2,
  /** Umbral de energía alta en la escala subjetiva 1–5 (>= 4). */
  HIGH_ENERGY_THRESHOLD: 4,
  /** Umbral de ánimo bajo en la escala subjetiva 1–5 (<= 2). */
  LOW_MOOD_THRESHOLD: 2,
  /** Muestra mínima total de días con contexto para generar observaciones descriptivas en insights históricos (>= 10 días). */
  MIN_INSIGHT_TOTAL_SAMPLE: 10,
  /** Muestra mínima por grupo comparativo para formular hipótesis descriptivas (>= 5 días por grupo). */
  MIN_INSIGHT_GROUP_SAMPLE: 5,
  /** Diferencia mínima de energía (en escala 1–5) para destacar una observación histórica (>= 0.5 puntos). */
  MIN_INSIGHT_ENERGY_DELTA: 0.5,
} as const;

export const RECOMMENDED_MIN_SLEEP_HOURS = CONTEXT_UX_THRESHOLDS.RECOMMENDED_MIN_SLEEP_HOURS;
export const SHORT_SLEEP_ALERT_DAYS = CONTEXT_UX_THRESHOLDS.SHORT_SLEEP_ALERT_DAYS;

export function upsertDailyContext(state: LifeOSState, entry: DailyContextEntry): void {
  const existing = state.dailyContext.find((item) => item.date === entry.date);
  if (existing) Object.assign(existing, entry);
  else state.dailyContext.push(entry);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function energyValues(entries: DailyContextEntry[]): number[] {
  return entries.flatMap((entry) => (entry.energy == null ? [] : [entry.energy]));
}

export type ContextualInsightKind =
  | 'dato_registrado'
  | 'comparacion_descriptiva'
  | 'hipotesis_exploratoria'
  | 'recomendacion_organizacion';

export interface ContextInsight {
  id: string;
  text: string;
  kind?: ContextualInsightKind;
  sampleSize?: number;
}

export interface SleepDay {
  date: string;
  hours: number | null;
}

export interface SleepSummary {
  averageHours: number | null;
  recordedNights: number;
  shortNights: number;
  currentShortStreak: number;
  recentDays: SleepDay[];
  shouldAlert: boolean;
}

function shiftISO(iso: string, amount: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validSleepHours(value: number | null): value is number {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 16;
}

export function sleepSummary(state: LifeOSState, referenceDate = todayISO()): SleepSummary {
  const byDate = new Map<string, number>();
  state.dailyContext.forEach((entry) => {
    if (validSleepHours(entry.sleepHours)) byDate.set(entry.date, Number(entry.sleepHours));
  });

  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = shiftISO(referenceDate, index - 6);
    return { date, hours: byDate.get(date) ?? null };
  });
  const hours = recentDays.flatMap((day) => (day.hours == null ? [] : [day.hours]));
  const shortNights = hours.filter((value) => value < RECOMMENDED_MIN_SLEEP_HOURS).length;

  const recorded = [...byDate.entries()]
    .filter(([date]) => date <= referenceDate)
    .sort(([a], [b]) => b.localeCompare(a));
  let currentShortStreak = 0;
  if (recorded.length && daysBetween(recorded[0][0], referenceDate) <= 1) {
    let expectedDate = recorded[0][0];
    for (const [date, value] of recorded) {
      if (date !== expectedDate || value >= RECOMMENDED_MIN_SLEEP_HOURS) break;
      currentShortStreak += 1;
      expectedDate = shiftISO(expectedDate, -1);
    }
  }

  return {
    averageHours: hours.length ? average(hours) : null,
    recordedNights: hours.length,
    shortNights,
    currentShortStreak,
    recentDays,
    shouldAlert: currentShortStreak >= SHORT_SLEEP_ALERT_DAYS,
  };
}

export function buildContextInsights(state: LifeOSState): ContextInsight[] {
  const entries = state.dailyContext.filter((entry) => entry.energy != null);
  if (entries.length < CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_TOTAL_SAMPLE) return [];
  const insights: ContextInsight[] = [];

  const rested = energyValues(entries.filter((entry) => Number(entry.sleepHours || 0) >= 7));
  const shortSleep = energyValues(entries.filter((entry) => entry.sleepHours != null && Number(entry.sleepHours) < 7));
  if (
    rested.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE &&
    shortSleep.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE
  ) {
    const delta = average(rested) - average(shortSleep);
    if (Math.abs(delta) >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_ENERGY_DELTA) {
      insights.push({
        id: 'sleep-energy',
        kind: 'comparacion_descriptiva',
        sampleSize: rested.length + shortSleep.length,
        text:
          delta > 0
            ? `Dormir 7 h o más coincidió con ${delta.toFixed(1)} puntos más de energía promedio (muestra: ${rested.length} vs ${shortSleep.length} días).`
            : `Tus días con menos de 7 h coincidieron con ${Math.abs(delta).toFixed(1)} puntos más de energía promedio; seguí registrando para ver si se sostiene (muestra: ${shortSleep.length} vs ${rested.length} días).`,
      });
    }
  }

  const connected = energyValues(entries.filter((entry) => entry.connection === 'mensaje' || entry.connection === 'encuentro'));
  const alone = energyValues(entries.filter((entry) => entry.connection === 'solo'));
  if (
    connected.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE &&
    alone.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE
  ) {
    const delta = average(connected) - average(alone);
    if (Math.abs(delta) >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_ENERGY_DELTA) {
      insights.push({
        id: 'connection-energy',
        kind: 'hipotesis_exploratoria',
        sampleSize: connected.length + alone.length,
        text:
          delta > 0
            ? `Hablar o encontrarte con alguien coincidió con ${delta.toFixed(1)} puntos más de energía promedio.`
            : `Los días con más tiempo a solas coincidieron con ${Math.abs(delta).toFixed(1)} puntos más de energía promedio; puede tratarse de descanso reparador.`,
      });
    }
  }

  if (isModuleEnabled(state, 'gimnasio')) {
    const gymDates = new Set(
      (state.gym?.sessions || []).filter(isPerformedGymSession).map((session) => session.date)
    );
    const gymDays = energyValues(entries.filter((entry) => gymDates.has(entry.date)));
    const nonGymDays = energyValues(entries.filter((entry) => !gymDates.has(entry.date)));
    if (
      gymDays.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE &&
      nonGymDays.length >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_GROUP_SAMPLE
    ) {
      const delta = average(gymDays) - average(nonGymDays);
      if (Math.abs(delta) >= CONTEXT_UX_THRESHOLDS.MIN_INSIGHT_ENERGY_DELTA) {
        insights.push({
          id: 'gym-energy',
          kind: 'comparacion_descriptiva',
          sampleSize: gymDays.length + nonGymDays.length,
          text: `Los días con entrenamiento realizado coincidieron con ${Math.abs(delta).toFixed(1)} puntos ${delta > 0 ? 'más' : 'menos'} de energía promedio.`,
        });
      }
    }
  }

  return insights.slice(0, 2);
}

export function todayContext(state: LifeOSState): DailyContextEntry {
  return contextForDate(state, todayISO());
}

export function contextForDate(state: LifeOSState, date: string): DailyContextEntry {
  return (
    state.dailyContext.find((entry) => entry.date === date) || {
      date,
      sleepHours: null,
      energy: null,
      mood: null,
      connection: null,
      note: '',
    }
  );
}

export function hasRecordedContext(entry: DailyContextEntry | null | undefined): boolean {
  if (!entry) return false;
  return (
    entry.sleepHours != null ||
    entry.sleepQuality != null ||
    entry.energy != null ||
    entry.mood != null ||
    entry.stress != null ||
    entry.physicalDiscomfort != null ||
    (entry.connection != null && String(entry.connection).trim() !== '') ||
    Boolean(entry.note && entry.note.trim() !== '')
  );
}

export function formatMoodLabel(mood: number | null | undefined): string {
  if (mood == null) return '';
  switch (mood) {
    case 1:
      return 'muy bajo';
    case 2:
      return 'bajo';
    case 3:
      return 'estable';
    case 4:
      return 'bueno';
    case 5:
      return 'muy bueno';
    default:
      return `${mood}/5`;
  }
}

function formatHoursValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

export function formatCompactContextSummaryParts(entry: DailyContextEntry | null | undefined): string[] {
  if (!entry || !hasRecordedContext(entry)) return [];
  const parts: string[] = [];
  if (entry.sleepHours != null) {
    parts.push(`Sueño: ${formatHoursValue(entry.sleepHours)} h`);
  }
  if (entry.energy != null) {
    parts.push(`Energía: ${entry.energy}/5`);
  }
  if (entry.mood != null) {
    parts.push(`Ánimo: ${formatMoodLabel(entry.mood)}`);
  }
  return parts;
}

export function formatCompactContextSummary(entry: DailyContextEntry | null | undefined): string {
  const parts = formatCompactContextSummaryParts(entry);
  return parts.join(' · ');
}

/**
 * Retorna un descriptor legible en lenguaje natural de la calidad percibida del sueño.
 * Ejemplos: 'Poco reparador', 'Adecuado', 'Reparador', 'Sin calificar'.
 */
export function sleepQualityDescriptor(
  quality: number | null | undefined,
  hasSleepHours = true
): string {
  if (quality == null) {
    return hasSleepHours ? 'Sin calificar' : 'Sin dato';
  }
  switch (quality) {
    case 1:
      return 'Muy poco reparador';
    case 2:
      return 'Poco reparador';
    case 3:
      return 'Adecuado';
    case 4:
      return 'Reparador';
    case 5:
      return 'Muy reparador';
    default:
      return `Calidad ${quality}/5`;
  }
}

/**
 * Extrae y formatea factores secundarios opcionales (estrés, molestias físicas, conexión social)
 * sin duplicar métricas primarias (sueño, energía, ánimo) ni calidad de sueño.
 */
export function formatSecondaryFactors(entry: DailyContextEntry | null | undefined): string[] {
  if (!entry) return [];
  const factors: string[] = [];

  if (entry.stress) {
    factors.push(`Estrés ${entry.stress}`);
  }

  if (entry.physicalDiscomfort) {
    const discomfortLabel =
      entry.physicalDiscomfort === 'leve'
        ? 'Molestias leves'
        : entry.physicalDiscomfort === 'moderada'
          ? 'Molestias moderadas'
          : 'Molestias altas';
    factors.push(discomfortLabel);
  }

  if (entry.connection) {
    const connStr = String(entry.connection);
    const connLabel =
      connStr === 'solo'
        ? 'A solas'
        : connStr === 'mensaje'
          ? 'Mensajes'
          : connStr === 'encuentro'
            ? 'Encuentro'
            : connStr;
    factors.push(`Conexión: ${connLabel.toLowerCase()}`);
  }

  return factors;
}

export interface ContextEvolutionPoint {
  x: number;
  y: number;
  value: number;
  date: string;
  index: number;
}

/**
 * Agrupa días registrados contiguos para evitar interpolar falsamente sobre días sin registro.
 */
export function groupContiguousEvolutionPoints(
  records: Array<{ date: string; value: number | null }>,
  getY: (val: number) => number,
  getX: (idx: number) => number,
): ContextEvolutionPoint[][] {
  const groups: ContextEvolutionPoint[][] = [];
  let current: ContextEvolutionPoint[] = [];

  records.forEach((rec, idx) => {
    if (rec.value != null && Number.isFinite(rec.value)) {
      current.push({
        x: getX(idx),
        y: getY(rec.value),
        value: rec.value,
        date: rec.date,
        index: idx,
      });
    } else {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    }
  });

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

/**
 * Genera un trazado SVG curvado suave (spline cúbico Catmull-Rom estabilizado)
 * que pasa exactamente por los puntos sin oscilaciones espurias ni rebasar los dominios de escala.
 */
export function buildSmoothPath(
  points: Array<{ x: number; y: number }>,
  clampY?: { minY: number; maxY: number }
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const yRange = Math.max(maxY - minY, 4);
    cp1y = Math.max(minY - yRange * 0.35, Math.min(maxY + yRange * 0.35, cp1y));
    cp2y = Math.max(minY - yRange * 0.35, Math.min(maxY + yRange * 0.35, cp2y));

    if (clampY) {
      cp1y = Math.max(clampY.minY, Math.min(clampY.maxY, cp1y));
      cp2y = Math.max(clampY.minY, Math.min(clampY.maxY, cp2y));
    }

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Cierra la curva suave contra una línea de base (baselineY) para permitir
 * rellenos sutiles con degradado sin fugas de área ni rebasar los dominios de escala.
 */
export function buildAreaPath(
  points: Array<{ x: number; y: number }>,
  baselineY: number,
  clampY?: { minY: number; maxY: number }
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    const w = 10;
    return `M ${p.x - w} ${baselineY} L ${p.x - w} ${p.y + 4} Q ${p.x} ${p.y} ${p.x + w} ${p.y + 4} L ${p.x + w} ${baselineY} Z`;
  }
  const curve = buildSmoothPath(points, clampY);
  const first = points[0];
  const last = points[points.length - 1];
  return `${curve} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

export function saveDailyContextCheckIn(
  state: LifeOSState,
  date: string,
  patch: Partial<DailyContextEntry>,
  nowIso = new Date().toISOString()
): DailyContextEntry {
  const existing = state.dailyContext.find((item) => item.date === date);

  let morningSnapshot: DailyContextMorningSnapshot | null = existing?.morningSnapshot
    ? { ...existing.morningSnapshot }
    : null;

  if (existing) {
    const morningFields: Array<keyof DailyContextMorningSnapshot> = [
      'sleepHours',
      'sleepQuality',
      'energy',
      'mood',
      'stress',
      'physicalDiscomfort',
      'connection',
    ];
    let hasFieldChanged = false;
    for (const field of morningFields) {
      if (existing[field] != null && patch[field] !== undefined && patch[field] !== existing[field]) {
        hasFieldChanged = true;
        break;
      }
    }

    if (hasFieldChanged && !morningSnapshot) {
      morningSnapshot = {
        sleepHours: existing.sleepHours,
        sleepQuality: existing.sleepQuality,
        energy: existing.energy,
        mood: existing.mood,
        stress: existing.stress,
        physicalDiscomfort: existing.physicalDiscomfort,
        connection: existing.connection,
        capturedAt: existing.recordedAt || nowIso,
      };
    }
  }

  let dismissedRecommendationKey = existing?.dismissedRecommendationKey ?? null;
  if (
    existing &&
    ((patch.sleepHours !== undefined && patch.sleepHours !== existing.sleepHours) ||
      (patch.energy !== undefined && patch.energy !== existing.energy))
  ) {
    dismissedRecommendationKey = null;
  }
  if (patch.dismissedRecommendationKey !== undefined) {
    dismissedRecommendationKey = patch.dismissedRecommendationKey;
  }

  const updatedEntry: DailyContextEntry = {
    date,
    sleepHours: patch.sleepHours !== undefined ? patch.sleepHours : existing?.sleepHours ?? null,
    energy: patch.energy !== undefined ? patch.energy : existing?.energy ?? null,
    mood: patch.mood !== undefined ? patch.mood : existing?.mood ?? null,
    connection: patch.connection !== undefined ? patch.connection : existing?.connection ?? null,
    note: patch.note !== undefined ? patch.note : existing?.note ?? '',
  };

  const sleepQuality = patch.sleepQuality !== undefined ? patch.sleepQuality : existing?.sleepQuality;
  if (sleepQuality !== undefined) updatedEntry.sleepQuality = sleepQuality;

  const stress = patch.stress !== undefined ? patch.stress : existing?.stress;
  if (stress !== undefined) updatedEntry.stress = stress;

  const physicalDiscomfort =
    patch.physicalDiscomfort !== undefined ? patch.physicalDiscomfort : existing?.physicalDiscomfort;
  if (physicalDiscomfort !== undefined) updatedEntry.physicalDiscomfort = physicalDiscomfort;

  if (morningSnapshot) updatedEntry.morningSnapshot = morningSnapshot;

  updatedEntry.recordedAt = existing?.recordedAt || nowIso;
  updatedEntry.updatedAt = nowIso;
  if (dismissedRecommendationKey) updatedEntry.dismissedRecommendationKey = dismissedRecommendationKey;

  upsertDailyContext(state, updatedEntry);
  return updatedEntry;
}

export function dismissContextRecommendation(
  state: LifeOSState,
  date: string,
  recommendationKey: string
): void {
  const entry = state.dailyContext.find((item) => item.date === date);
  if (entry) {
    entry.dismissedRecommendationKey = recommendationKey;
    entry.updatedAt = new Date().toISOString();
  } else {
    state.dailyContext.push({
      date,
      sleepHours: null,
      energy: null,
      mood: null,
      connection: null,
      note: '',
      dismissedRecommendationKey: recommendationKey,
      recordedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

export type ContextActivityPriority = 'alta' | 'media' | 'baja';
export type ContextActivityDemand = 'alta' | 'media' | 'baja' | 'desconocida';
export type ContextActivityFlexibility = 'fija' | 'desconocida';

export interface ContextualActivityItem {
  id: string;
  source: 'priority' | 'todayExtra' | 'agenda' | 'recurring' | 'project' | 'studyExam' | 'calendar' | 'job';
  text: string;
  priorityLevel: ContextActivityPriority;
  demandLevel: ContextActivityDemand;
  flexibility: ContextActivityFlexibility;
  isImpostergable: boolean;
  isDemanding: boolean;
  isSecondary: boolean;
  scheduledTime?: string;
  dueDate?: string;
  entityId?: string;
  linkedType?: string;
}

export interface ContextualRecommendation {
  key: string;
  headline: string;
  observed: string;
  whyRelevant: string;
  optionToConsider: string;
  kind: 'reduce_demanding' | 'protect_impostergable' | 'pace_day';
  targetView?: ViewType;
  targetLabel?: string;
  activitySource?: ContextualActivityItem['source'];
}

/**
 * Resuelve la vista de destino y la etiqueta de navegación correspondiente
 * para una actividad contextualizada, respetando la visibilidad de módulos.
 * Si el módulo correspondiente está desactivado, retorna null para no exponer
 * acciones rotas al usuario.
 */
export function resolveActivityNavigationTarget(
  activity: ContextualActivityItem,
  state: LifeOSState,
): { targetView: ViewType; targetLabel: string } | null {
  let view: ViewType = 'agenda';
  let label = 'Revisar agenda';

  switch (activity.source) {
    case 'studyExam':
      view = 'estudios';
      label = 'Revisar estudios';
      break;
    case 'calendar':
      view = 'calendario';
      label = 'Revisar calendario';
      break;
    case 'job':
      view = 'trabajo';
      label = 'Revisar trabajo';
      break;
    case 'project':
      view = 'notas';
      label = 'Revisar proyectos';
      break;
    case 'todayExtra':
      if (activity.linkedType === 'study') {
        view = 'estudios';
        label = 'Revisar estudios';
      } else if (activity.linkedType === 'gym') {
        view = 'gimnasio';
        label = 'Revisar gimnasio';
      } else if (activity.linkedType === 'calendar') {
        view = 'calendario';
        label = 'Revisar calendario';
      } else if (activity.linkedType === 'project') {
        view = 'notas';
        label = 'Revisar notas';
      } else {
        view = 'agenda';
        label = 'Revisar agenda';
      }
      break;
    case 'agenda':
    case 'recurring':
    default:
      view = 'agenda';
      label = 'Revisar agenda';
      break;
  }

  // Si el módulo de destino está deshabilitado en Module Visibility, no mostrar la acción
  if (!isModuleEnabled(state, view)) {
    return null;
  }

  return { targetView: view, targetLabel: label };
}

export interface DailyContextEvaluation {
  date: string;
  hasRecord: boolean;
  isMorningCheckInPending: boolean;
  compactSummary: string;
  compactSummaryParts: string[];
  recommendation: ContextualRecommendation | null;
  isRecommendationDismissed: boolean;
  abstentionReason:
    | null
    | 'no_context_recorded'
    | 'insufficient_context_data'
    | 'short_sleep_but_good_energy'
    | 'low_mood_normal_energy'
    | 'no_demanding_or_impostergable_activities'
    | 'dismissed_by_user';
  activitiesSummary: {
    totalActivities: number;
    demandingCount: number;
    impostergableCount: number;
    demandingTitles: string[];
    impostergableTitles: string[];
  };
}

export function collectContextualDayActivities(state: LifeOSState, dateIso: string): ContextualActivityItem[] {
  const items: ContextualActivityItem[] = [];
  const seenTexts = new Set<string>();

  const registerItem = (item: ContextualActivityItem) => {
    const key = item.text.trim().toLowerCase();
    if (seenTexts.has(key)) return;
    seenTexts.add(key);
    items.push(item);
  };

  // 1. Agenda Blocks (Guarded by 'agenda' module)
  if (isModuleEnabled(state, 'agenda') && state.agenda) {
    const dayKey = dayKeyFromDate(new Date(`${dateIso}T12:00:00`));
    const blocks = state.agenda[dayKey] || [];
    for (const b of blocks) {
      if (!b.activity || !b.activity.trim()) continue;
      const isDone = Boolean(state.taskLog?.[dateIso]?.[b.id]);
      if (isDone) continue;

      const demandLevel: ContextActivityDemand =
        b.effort === 'alta' || b.effort === 'high'
          ? 'alta'
          : b.effort === 'media' || b.effort === 'medium'
            ? 'media'
            : b.effort === 'baja' || b.effort === 'low'
              ? 'baja'
              : 'desconocida';

      registerItem({
        id: `agenda-${b.id}`,
        entityId: b.id,
        source: 'agenda',
        text: b.activity.trim(),
        priorityLevel: 'alta',
        demandLevel,
        flexibility: 'fija',
        isImpostergable: true,
        isDemanding: demandLevel === 'alta',
        isSecondary: false,
        scheduledTime: b.time,
      });
    }
  }

  // 2. Study Exams (Guarded by 'estudios' module)
  if (isModuleEnabled(state, 'estudios') && state.study?.exams) {
    const subjectMap = new Map((state.study.subjects || []).map((s) => [s.id, s.name]));
    for (const exam of state.study.exams) {
      if (exam.date === dateIso && exam.status === 'pendiente') {
        const subjectName = subjectMap.get(exam.subjectId) || 'materia';
        const text = `Examen de ${subjectName}`;
        registerItem({
          id: `exam-${exam.id}`,
          entityId: exam.id,
          source: 'studyExam',
          text,
          priorityLevel: 'alta',
          demandLevel: 'desconocida',
          flexibility: 'fija',
          isImpostergable: true,
          isDemanding: false,
          isSecondary: false,
          dueDate: exam.date,
        });
      }
    }
  }

  // 3. Calendar Events (Guarded by 'calendario' module)
  if (isModuleEnabled(state, 'calendario') && state.calendarEvents) {
    const dateMonthDay = dateIso.slice(5);
    for (const event of state.calendarEvents) {
      const isToday = event.date === dateIso || (event.recurring && event.date.slice(5) === dateMonthDay);
      if (isToday && event.type === 'importante') {
        registerItem({
          id: `calendar-${event.id}`,
          entityId: event.id,
          source: 'calendar',
          text: `Evento: ${event.name}`,
          priorityLevel: 'alta',
          demandLevel: 'desconocida',
          flexibility: 'fija',
          isImpostergable: true,
          isDemanding: false,
          isSecondary: false,
        });
      }
    }
  }

  // 4. Job Interviews / Actions (Guarded by 'trabajo' module)
  if (isModuleEnabled(state, 'trabajo') && state.jobs?.applications) {
    for (const app of state.jobs.applications) {
      const isRelevant =
        app.estado === 'entrevista' &&
        (app.nextActionDate === dateIso || (!app.nextActionDate && app.fecha === dateIso));
      if (isRelevant) {
        registerItem({
          id: `job-${app.id}`,
          entityId: app.id,
          source: 'job',
          text: `Entrevista con ${app.empresa}`,
          priorityLevel: 'alta',
          demandLevel: 'desconocida',
          flexibility: 'fija',
          isImpostergable: true,
          isDemanding: false,
          isSecondary: false,
        });
      }
    }
  }

  // 5. Today Extras / Tasks
  if (state.todayExtras) {
    for (const t of state.todayExtras) {
      if (t.done) continue;
      const isDueTodayOrOverdue = t.date === dateIso || (t.dueDate != null && t.dueDate <= dateIso);
      if (!isDueTodayOrOverdue) continue;

      // Module visibility check for linked items
      if (t.linkedType === 'study' && !isModuleEnabled(state, 'estudios')) continue;
      if (t.linkedType === 'gym' && !isModuleEnabled(state, 'gimnasio')) continue;
      if (t.linkedType === 'calendar' && !isModuleEnabled(state, 'calendario')) continue;
      if (t.linkedType === 'project' && !isModuleEnabled(state, 'notas')) continue;

      const unified: UnifiedTask = {
        id: t.id,
        text: t.text,
        done: Boolean(t.done),
        type: 'extra',
        date: t.date,
        dueDate: t.dueDate,
        time: t.time,
        durationMinutes: t.durationMinutes,
        priority: t.priority,
        effort: t.effort,
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        linkedType: t.linkedType,
        linkedId: t.linkedId,
      };
      if (isTaskBlocked(unified, state)) continue;

      const demandLevel: ContextActivityDemand =
        t.effort === 'alta' || t.effort === 'high'
          ? 'alta'
          : t.effort === 'media' || t.effort === 'medium'
            ? 'media'
            : t.effort === 'baja' || t.effort === 'low'
              ? 'baja'
              : 'desconocida';

      const priorityLevel: ContextActivityPriority =
        t.priority === 'alta' ? 'alta' : t.priority === 'baja' ? 'baja' : 'media';

      const hasFixedSchedule = Boolean(t.time);
      const isDeadlineTodayOrOverdue = Boolean(t.dueDate && t.dueDate <= dateIso);
      const isImpostergable = hasFixedSchedule || (priorityLevel === 'alta' && isDeadlineTodayOrOverdue);
      const isDemanding = demandLevel === 'alta';
      const isSecondary = !isImpostergable && !isDemanding && priorityLevel !== 'alta';

      registerItem({
        id: `extra-${t.id}`,
        entityId: t.id,
        source: 'todayExtra',
        text: t.text.trim(),
        priorityLevel,
        demandLevel,
        flexibility: isImpostergable ? 'fija' : 'desconocida',
        isImpostergable,
        isDemanding,
        isSecondary,
        scheduledTime: t.time,
        dueDate: t.dueDate,
        linkedType: t.linkedType,
      });
    }
  }

  // 6. Project Tasks (Guarded by 'notas' module)
  if (isModuleEnabled(state, 'notas') && state.projects) {
    for (const project of state.projects) {
      if (project.status !== 'activo') continue;
      for (const t of project.tasks || []) {
        if (t.done) continue;
        const isDueToday = t.dueDate && t.dueDate <= dateIso;
        if (!isDueToday) continue;

        const unified: UnifiedTask = {
          id: t.id,
          text: t.text,
          done: Boolean(t.done),
          type: 'project_task',
          dueDate: t.dueDate,
          priority: t.priority || 'media',
          effort: t.effort || 'medium',
          dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
          projectId: project.id,
          projectName: project.name,
        };
        if (isTaskBlocked(unified, state)) continue;

        const demandLevel: ContextActivityDemand =
          t.effort === 'alta' || t.effort === 'high'
            ? 'alta'
            : t.effort === 'media' || t.effort === 'medium'
              ? 'media'
              : t.effort === 'baja' || t.effort === 'low'
                ? 'baja'
                : 'desconocida';

        const priorityLevel: ContextActivityPriority =
          t.priority === 'alta' ? 'alta' : t.priority === 'baja' ? 'baja' : 'media';

        const isImpostergable = priorityLevel === 'alta';
        const isDemanding = demandLevel === 'alta';
        const isSecondary = !isImpostergable && !isDemanding;

        registerItem({
          id: `proj-${t.id}`,
          entityId: t.id,
          source: 'project',
          text: `${t.text.trim()} (${project.name})`,
          priorityLevel,
          demandLevel,
          flexibility: isImpostergable ? 'fija' : 'desconocida',
          isImpostergable,
          isDemanding,
          isSecondary,
          dueDate: t.dueDate,
        });
      }
    }
  }

  // 7. Recurring Routines (Guarded by 'agenda' module)
  if (isModuleEnabled(state, 'agenda') && state.tasksRecurring) {
    const dayKey = dayKeyFromDate(new Date(`${dateIso}T12:00:00`));
    for (const r of state.tasksRecurring) {
      const matchesDay = r.freq === 'daily' || !r.days?.length || r.days.includes(dayKey);
      if (!matchesDay) continue;
      const isDone = Boolean(state.taskLog?.[dateIso]?.[r.id]);
      if (isDone) continue;

      const demandLevel: ContextActivityDemand =
        r.effort === 'alta' || r.effort === 'high'
          ? 'alta'
          : r.effort === 'media' || r.effort === 'medium'
            ? 'media'
            : r.effort === 'baja' || r.effort === 'low'
              ? 'baja'
              : 'desconocida';

      const hasFixedSchedule = Boolean(r.time);
      const isDemanding = demandLevel === 'alta';
      const isImpostergable = hasFixedSchedule;
      const isSecondary = !hasFixedSchedule && !isDemanding;

      registerItem({
        id: `recurring-${r.id}`,
        entityId: r.id,
        source: 'recurring',
        text: r.name.trim(),
        priorityLevel: 'media',
        demandLevel,
        flexibility: isImpostergable ? 'fija' : 'desconocida',
        isImpostergable,
        isDemanding,
        isSecondary,
        scheduledTime: r.time,
      });
    }
  }

  return items;
}

export function evaluateDailyContext(state: LifeOSState, dateIso = todayISO()): DailyContextEvaluation {
  const entry = contextForDate(state, dateIso);
  const hasRecord = hasRecordedContext(entry);
  const isMorningCheckInPending = dateIso === todayISO() && !hasRecord;
  const compactSummaryParts = formatCompactContextSummaryParts(entry);
  const compactSummary = compactSummaryParts.join(' · ');

  const activities = collectContextualDayActivities(state, dateIso);
  const demandingActivities = activities.filter((a) => a.isDemanding);
  const impostergableActivities = activities.filter((a) => a.isImpostergable);

  const activitiesSummary = {
    totalActivities: activities.length,
    demandingCount: demandingActivities.length,
    impostergableCount: impostergableActivities.length,
    demandingTitles: demandingActivities.map((a) => a.text),
    impostergableTitles: impostergableActivities.map((a) => a.text),
  };

  if (!hasRecord) {
    return {
      date: dateIso,
      hasRecord: false,
      isMorningCheckInPending,
      compactSummary: '',
      compactSummaryParts: [],
      recommendation: null,
      isRecommendationDismissed: false,
      abstentionReason: 'no_context_recorded',
      activitiesSummary,
    };
  }

  const hasSleepHours = entry.sleepHours != null;
  const sleepHours = entry.sleepHours;
  const isShortSleep = hasSleepHours && sleepHours! < CONTEXT_UX_THRESHOLDS.SHORT_SLEEP_HOURS_THRESHOLD;

  const hasEnergy = entry.energy != null;
  const energy = entry.energy;
  const isLowEnergy = hasEnergy && energy! <= CONTEXT_UX_THRESHOLDS.LOW_ENERGY_THRESHOLD;
  const isHighEnergy = hasEnergy && energy! >= CONTEXT_UX_THRESHOLDS.HIGH_ENERGY_THRESHOLD;

  const hasMood = entry.mood != null;
  const mood = entry.mood;
  const isLowMood = hasMood && mood! <= CONTEXT_UX_THRESHOLDS.LOW_MOOD_THRESHOLD;

  // 1. Sueño corto + energía alta: abstenerse para no alarmar ni imponer descanso
  if (isShortSleep && isHighEnergy) {
    return {
      date: dateIso,
      hasRecord: true,
      isMorningCheckInPending,
      compactSummary,
      compactSummaryParts,
      recommendation: null,
      isRecommendationDismissed: false,
      abstentionReason: 'short_sleep_but_good_energy',
      activitiesSummary,
    };
  }

  // 2. Ánimo bajo + energía normal: abstenerse para no asumir incapacidad operativa
  if (isLowMood && (!hasEnergy || energy! >= 3) && !isLowEnergy) {
    return {
      date: dateIso,
      hasRecord: true,
      isMorningCheckInPending,
      compactSummary,
      compactSummaryParts,
      recommendation: null,
      isRecommendationDismissed: false,
      abstentionReason: 'low_mood_normal_energy',
      activitiesSummary,
    };
  }

  // 3. Sin señal de baja energía: abstenerse
  if (!isLowEnergy) {
    return {
      date: dateIso,
      hasRecord: true,
      isMorningCheckInPending,
      compactSummary,
      compactSummaryParts,
      recommendation: null,
      isRecommendationDismissed: false,
      abstentionReason: 'insufficient_context_data',
      activitiesSummary,
    };
  }

  // 4. Energía baja registrada: evaluar si hay compromisos impostergables o actividades exigentes
  let candidateRecommendation: ContextualRecommendation | null = null;

  let observedPrefix: string;
  const isPoorSleepQuality = entry.sleepQuality != null && entry.sleepQuality <= 2;

  if (hasSleepHours) {
    if (isPoorSleepQuality) {
      observedPrefix = `Registraste ${formatHoursValue(sleepHours!)} h de sueño con descanso poco reparador y energía ${energy}/5.`;
    } else if (isShortSleep) {
      observedPrefix = `Registraste ${formatHoursValue(sleepHours!)} h de sueño y energía ${energy}/5.`;
    } else {
      observedPrefix = `Registraste energía ${energy}/5.`;
    }
  } else {
    observedPrefix = `Registraste energía ${energy}/5.`;
  }

  if (impostergableActivities.length > 0) {
    const primaryActivity = impostergableActivities[0];
    const primaryCommitment = primaryActivity.text;
    const navTarget = resolveActivityNavigationTarget(primaryActivity, state);

    let whyRelevant = `Tenés una actividad impostergable programada para hoy ("${primaryCommitment}").`;
    if (primaryActivity.source === 'studyExam') {
      whyRelevant = `Tenés un examen programado para hoy ("${primaryCommitment}").`;
    } else if (primaryActivity.source === 'job') {
      whyRelevant = `Tenés una entrevista fijada para hoy ("${primaryCommitment}").`;
    } else if (primaryActivity.source === 'calendar') {
      whyRelevant = `Tenés un evento importante fijado en tu calendario ("${primaryCommitment}").`;
    } else if (primaryActivity.source === 'agenda') {
      whyRelevant = `Tenés un compromiso con horario fijo en tu agenda ("${primaryCommitment}").`;
    } else if (primaryActivity.source === 'recurring') {
      whyRelevant = `Tenés una rutina con horario fijado para hoy ("${primaryCommitment}").`;
    } else if (primaryActivity.source === 'project') {
      whyRelevant = `Tenés una tarea de proyecto con fecha límite hoy ("${primaryCommitment}").`;
    }

    candidateRecommendation = {
      key: `protect_impostergable:${isShortSleep ? 'short_sleep' : 'energy'}:${primaryActivity.id}`,
      kind: 'protect_impostergable',
      headline: 'Compromiso firme con energía reducida',
      observed: observedPrefix,
      whyRelevant,
      optionToConsider:
        'Mantener tu compromiso principal y evaluar pausar o reprogramar tareas secundarias alrededor de él.',
      targetView: navTarget?.targetView,
      targetLabel: navTarget?.targetLabel,
      activitySource: primaryActivity.source,
    };
  } else if (demandingActivities.length > 0) {
    const primaryActivity = demandingActivities[0];
    const navTarget = resolveActivityNavigationTarget(primaryActivity, state);
    const demandingSummary = demandingActivities.map((a) => `"${a.text}"`).join(', ');

    candidateRecommendation = {
      key: `reduce_demanding:${isShortSleep ? 'short_sleep' : 'energy'}:${primaryActivity.id}`,
      kind: 'reduce_demanding',
      headline: 'Actividad de exigencia alta',
      observed: observedPrefix,
      whyRelevant: `Hoy tenés ${demandingActivities.length === 1 ? 'una actividad marcada' : 'actividades marcadas'} de exigencia alta (${demandingSummary}).`,
      optionToConsider:
        'Revisar si podés dosificar el esfuerzo, hacer pausas conscientes o descomponer la actividad sin sobreexigencia.',
      targetView: navTarget?.targetView,
      targetLabel: navTarget?.targetLabel,
      activitySource: primaryActivity.source,
    };
  } else {
    // Energía baja sin actividades exigentes ni compromisos fijos: no inventar conflicto
    return {
      date: dateIso,
      hasRecord: true,
      isMorningCheckInPending,
      compactSummary,
      compactSummaryParts,
      recommendation: null,
      isRecommendationDismissed: false,
      abstentionReason: 'no_demanding_or_impostergable_activities',
      activitiesSummary,
    };
  }

  const dismissedKey = entry.dismissedRecommendationKey;
  const isDismissed = Boolean(
    dismissedKey &&
      (dismissedKey === candidateRecommendation.key ||
        dismissedKey.split(':')[0] === candidateRecommendation.kind)
  );

  return {
    date: dateIso,
    hasRecord: true,
    isMorningCheckInPending,
    compactSummary,
    compactSummaryParts,
    recommendation: isDismissed ? null : candidateRecommendation,
    isRecommendationDismissed: isDismissed,
    abstentionReason: isDismissed ? 'dismissed_by_user' : null,
    activitiesSummary,
  };
}
