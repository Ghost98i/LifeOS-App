import type { DailyContextEntry, LifeOSState } from '../types';
import { daysBetween, todayISO } from './storage';

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
    averageHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null,
    recordedNights: hours.length,
    shortNights,
    currentShortStreak,
    recentDays,
    shouldAlert: currentShortStreak >= SHORT_SLEEP_ALERT_DAYS,
  };
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
