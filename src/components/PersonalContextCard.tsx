import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ContextOptionalFactorKey,
  DailyContextEntry,
  LifeOSState,
  PerceivedStressLevel,
  PhysicalDiscomfortLevel,
  SleepQualityLevel,
  ViewType,
} from '../types';
import {
  buildAreaPath,
  buildSmoothPath,
  contextForDate,
  dismissContextRecommendation,
  evaluateDailyContext,
  formatSecondaryFactors,
  groupContiguousEvolutionPoints,
  hasRecordedContext,
  saveDailyContextCheckIn,
  sleepQualityDescriptor,
} from '../lib/contextInsights';
import { todayISO } from '../lib/storage';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';

export { sleepQualityDescriptor, formatSecondaryFactors };

interface PersonalContextCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onNavigate?: (view: ViewType) => void;
}

type Metric = 'energy' | 'sleep' | 'mood';
type ViewMode = 'general' | Metric;

export const ENERGY_SCALE_LABELS = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'] as const;
export const ENERGY_SHORT_LABELS = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'] as const;

export const MOOD_SCALE_LABELS = ['Muy bajo', 'Bajo', 'Estable', 'Bueno', 'Muy bueno'] as const;
export const MOOD_SHORT_LABELS = ['M. bajo', 'Bajo', 'Estable', 'Bueno', 'M. bien'] as const;

export const SLEEP_QUALITY_LABELS = ['Muy poco', 'Poco', 'Normal', 'Reparador', 'Profundo'] as const;
export const SLEEP_QUALITY_SHORT_LABELS = ['Muy poco', 'Poco', 'Normal', 'Reparador', 'Profundo'] as const;

const labels: Record<Metric, string> = { energy: 'Energía', sleep: 'Sueño', mood: 'Ánimo' };

export function energyLabel(value: number | null): string {
  if (value == null) return 'Sin dato';
  const idx = Math.max(0, Math.min(4, Math.round(value) - 1));
  return ENERGY_SCALE_LABELS[idx];
}

export function moodLabel(value: number | null, short = false): string {
  if (value == null) return 'Sin dato';
  const idx = Math.max(0, Math.min(4, Math.round(value) - 1));
  return short ? MOOD_SHORT_LABELS[idx] : MOOD_SCALE_LABELS[idx];
}

export function sleepQualityLabel(value: number | null, short = false): string {
  if (value == null) return 'Sin dato';
  const idx = Math.max(0, Math.min(4, Math.round(value) - 1));
  return short ? SLEEP_QUALITY_SHORT_LABELS[idx] : SLEEP_QUALITY_LABELS[idx];
}

export function ordinalLabel(value: number | null, short = false): string {
  return moodLabel(value, short);
}

function shiftISO(iso: string, amount: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(iso: string, includeDate = false): string {
  const date = new Date(`${iso}T12:00:00`);
  const value = date.toLocaleDateString(
    'es-UY',
    includeDate ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short' },
  );
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('.', '');
}

function dayNumber(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return String(date.getDate());
}

function formatSleepHours(value: number | null, compact = false): string {
  if (value == null) return compact ? '—' : 'Sin dato';
  return `${value.toLocaleString('es-UY')} h`;
}

function displayValue(value: number | null, metric: Metric): string {
  if (value == null) return 'Sin dato';
  if (metric === 'sleep') return formatSleepHours(value);
  if (metric === 'energy') return `${energyLabel(value)} (${value}/5)`;
  if (metric === 'mood') return `${moodLabel(value)} (${value}/5)`;
  return `${value}/5`;
}

export function formatLongDate(iso: string, isToday = false): string {
  const date = new Date(`${iso}T12:00:00`);
  const formatted = date.toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return isToday ? `${capitalized} (Hoy)` : capitalized;
}

function hasContext(entry: DailyContextEntry): boolean {
  return hasRecordedContext(entry);
}

interface DayWeekRecord {
  date: string;
  energy: number | null;
  sleepHours: number | null;
  sleepQuality: SleepQualityLevel | null;
  mood: number | null;
  stress: PerceivedStressLevel | null;
  physicalDiscomfort: PhysicalDiscomfortLevel | null;
  connection: string | null;
  note: string | null;
  hasAny: boolean;
}

export interface ContextDayDelta {
  hasData: boolean;
  hasPrev: boolean;
  diff: number | null;
  text: string;
  sign: 'pos' | 'neg' | 'zero';
}

export interface DailyContextDeltas {
  sleep: ContextDayDelta;
  energy: ContextDayDelta;
  mood: ContextDayDelta;
}

export function formatNaturalDelta(delta: ContextDayDelta, unit = ''): string {
  if (!delta.hasData) return 'Sin registro';
  if (!delta.hasPrev || delta.diff == null) return 'Sin registro ayer';
  if (delta.diff === 0) return 'Sin cambios respecto a ayer';
  const sign = delta.diff > 0 ? '+' : '';
  const formattedVal = delta.diff.toLocaleString('es-UY', {
    minimumFractionDigits: unit ? 1 : 0,
    maximumFractionDigits: 1,
  });
  return `${sign}${formattedVal}${unit ? ` ${unit}` : ''} respecto a ayer`;
}

export function calculateContextDeltas(state: LifeOSState, targetDate: string): DailyContextDeltas {
  const current = contextForDate(state, targetDate);
  const prevDate = shiftISO(targetDate, -1);
  const prev = contextForDate(state, prevDate);

  // Sueño
  let sleep: ContextDayDelta;
  if (current.sleepHours == null) {
    sleep = { hasData: false, hasPrev: false, diff: null, text: 'Sin registro', sign: 'zero' };
  } else if (prev.sleepHours == null) {
    sleep = { hasData: true, hasPrev: false, diff: null, text: 'Sin dato previo', sign: 'zero' };
  } else {
    const diff = Math.round((current.sleepHours - prev.sleepHours) * 10) / 10;
    const text =
      diff === 0
        ? '= 0.0 h vs ayer'
        : `${diff > 0 ? '+' : ''}${diff.toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h vs ayer`;
    sleep = { hasData: true, hasPrev: true, diff, text, sign: diff === 0 ? 'zero' : diff > 0 ? 'pos' : 'neg' };
  }

  // Energía
  let energy: ContextDayDelta;
  if (current.energy == null) {
    energy = { hasData: false, hasPrev: false, diff: null, text: 'Sin registro', sign: 'zero' };
  } else if (prev.energy == null) {
    energy = { hasData: true, hasPrev: false, diff: null, text: 'Sin dato previo', sign: 'zero' };
  } else {
    const diff = current.energy - prev.energy;
    const text = diff === 0 ? '= 0 vs ayer' : `${diff > 0 ? '+' : ''}${diff} vs ayer`;
    energy = { hasData: true, hasPrev: true, diff, text, sign: diff === 0 ? 'zero' : diff > 0 ? 'pos' : 'neg' };
  }

  // Ánimo
  let mood: ContextDayDelta;
  if (current.mood == null) {
    mood = { hasData: false, hasPrev: false, diff: null, text: 'Sin registro', sign: 'zero' };
  } else if (prev.mood == null) {
    mood = { hasData: true, hasPrev: false, diff: null, text: 'Sin dato previo', sign: 'zero' };
  } else {
    const diff = current.mood - prev.mood;
    const text = diff === 0 ? '= 0 vs ayer' : `${diff > 0 ? '+' : ''}${diff} vs ayer`;
    mood = { hasData: true, hasPrev: true, diff, text, sign: diff === 0 ? 'zero' : diff > 0 ? 'pos' : 'neg' };
  }

  return { sleep, energy, mood };
}

export function resolveInitialActiveFactors(
  entry: DailyContextEntry,
  savedSettingsFactors?: ContextOptionalFactorKey[],
  isToday = true,
): ContextOptionalFactorKey[] {
  const fromEntry: ContextOptionalFactorKey[] = [];
  if (entry.stress) fromEntry.push('stress');
  if (entry.physicalDiscomfort) fromEntry.push('physicalDiscomfort');
  if (entry.connection != null && String(entry.connection).trim() !== '') fromEntry.push('connection');
  if (entry.note && entry.note.trim() !== '') fromEntry.push('note');

  // Si no es hoy (fecha histórica), los factores activos iniciales provienen exclusivamente
  // de los datos reales ya registrados en esa fecha. No proyectar preferencias habituales sobre el pasado.
  if (!isToday) {
    return fromEntry;
  }

  const fromSettings = savedSettingsFactors || [];
  return Array.from(new Set([...fromSettings, ...fromEntry]));
}

export const PersonalContextCard: React.FC<PersonalContextCardProps> = ({
  state,
  onUpdateState,
  onNavigate,
}) => {
  const today = todayISO();
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftISO(today, index - 6)), [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('general');
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isInviteSkipped, setIsInviteSkipped] = useState(false);
  const [showExplainDetails, setShowExplainDetails] = useState(false);
  const [isOptionalContextExpanded, setIsOptionalContextExpanded] = useState(false);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);

  const current = useMemo(() => contextForDate(state, selectedDate), [state, selectedDate]);
  const evaluation = useMemo(() => evaluateDailyContext(state, selectedDate), [state, selectedDate]);
  const deltas = useMemo(() => calculateContextDeltas(state, selectedDate), [state, selectedDate]);
  const secondaryFactors = useMemo(() => formatSecondaryFactors(current), [current]);
  const hasSecondaryFactors =
    secondaryFactors.length > 0 || Boolean(current.note) || Boolean(current.morningSnapshot);
  const showCheckinInvite = selectedDate === today && !hasContext(current) && !isInviteSkipped && !isEditing;

  const isLongNote = useMemo(() => {
    if (!current.note) return false;
    const trimmed = current.note.trim();
    return trimmed.length > 70 || trimmed.includes('\n');
  }, [current.note]);

  // Al cambiar de fecha se colapsa la expansión de nota para no mezclar lecturas
  useEffect(() => {
    setIsNoteExpanded(false);
  }, [selectedDate]);

  // Form states
  const [sleep, setSleep] = useState(current.sleepHours == null ? '' : String(current.sleepHours));
  const [sleepQuality, setSleepQuality] = useState<SleepQualityLevel | null>(current.sleepQuality ?? null);
  const [energy, setEnergy] = useState<number | null>(current.energy);
  const [mood, setMood] = useState<number | null>(current.mood);
  const [stress, setStress] = useState<PerceivedStressLevel | null>(current.stress ?? null);
  const [physicalDiscomfort, setPhysicalDiscomfort] = useState<PhysicalDiscomfortLevel | null>(
    current.physicalDiscomfort ?? null,
  );
  const [connection, setConnection] = useState<string | null>(
    current.connection == null ? null : String(current.connection),
  );
  const [note, setNote] = useState<string>(current.note || '');

  // Helper to determine initial active factors from an entry and saved settings
  const getInitialActiveFactors = useCallback(
    (entry: DailyContextEntry): ContextOptionalFactorKey[] => {
      const isToday = entry.date === today;
      return resolveInitialActiveFactors(entry, state.settings?.contextOptionalFactors, isToday);
    },
    [state.settings?.contextOptionalFactors, today],
  );

  // Active optional factors for the current form draft
  const [activeOptionalFactors, setActiveOptionalFactors] = useState<ContextOptionalFactorKey[]>(() =>
    getInitialActiveFactors(current),
  );

  // Reset/sync draft form state from a canonical database entry
  const syncFormWithEntry = useCallback(
    (entry: DailyContextEntry) => {
      setSleep(entry.sleepHours == null ? '' : String(entry.sleepHours));
      setSleepQuality(entry.sleepQuality ?? null);
      setEnergy(entry.energy);
      setMood(entry.mood);
      setStress(entry.stress ?? null);
      setPhysicalDiscomfort(entry.physicalDiscomfort ?? null);
      setConnection(entry.connection == null ? null : String(entry.connection));
      setNote(entry.note || '');
      setActiveOptionalFactors(getInitialActiveFactors(entry));
    },
    [getInitialActiveFactors],
  );

  const handleStartEdit = () => {
    syncFormWithEntry(current);
    const hasOptionalData = Boolean(
      current.stress || current.physicalDiscomfort || current.connection || (current.note && current.note.trim()),
    );
    if (hasOptionalData) setIsOptionalContextExpanded(true);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    syncFormWithEntry(current);
    setIsEditing(false);
  };

  // Active optional factors count for badge
  const activeOptionalCount = useMemo(() => {
    let count = 0;
    if (activeOptionalFactors.includes('stress') && stress) count++;
    if (activeOptionalFactors.includes('physicalDiscomfort') && physicalDiscomfort) count++;
    if (activeOptionalFactors.includes('connection') && connection != null && String(connection).trim() !== '') count++;
    if (activeOptionalFactors.includes('note') && note.trim() !== '') count++;
    return count;
  }, [activeOptionalFactors, stress, physicalDiscomfort, connection, note]);

  const toggleOptionalFactor = (factor: ContextOptionalFactorKey) => {
    const isCurrentlyActive = activeOptionalFactors.includes(factor);
    if (isCurrentlyActive) {
      setActiveOptionalFactors((prev) => prev.filter((f) => f !== factor));
      if (factor === 'stress') setStress(null);
      if (factor === 'physicalDiscomfort') setPhysicalDiscomfort(null);
      if (factor === 'connection') setConnection(null);
      if (factor === 'note') setNote('');
    } else {
      setActiveOptionalFactors((prev) => (prev.includes(factor) ? prev : [...prev, factor]));
    }
  };

  const weekRecords: DayWeekRecord[] = useMemo(
    () =>
      weekDates.map((date) => {
        const entry = contextForDate(state, date);
        return {
          date,
          energy: entry.energy,
          sleepHours: entry.sleepHours,
          sleepQuality: entry.sleepQuality ?? null,
          mood: entry.mood,
          stress: entry.stress ?? null,
          physicalDiscomfort: entry.physicalDiscomfort ?? null,
          connection: entry.connection ? String(entry.connection) : null,
          note: entry.note || null,
          hasAny: hasRecordedContext(entry),
        };
      }),
    [state, weekDates],
  );

  const sleepScaleMax = useMemo(
    () => Math.ceil(Math.max(10, ...weekRecords.map((item) => item.sleepHours ?? 0))),
    [weekRecords],
  );

  const registeredDaysCount = useMemo(
    () => weekRecords.filter((item) => item.hasAny).length,
    [weekRecords],
  );
  const hasMetricHistory = weekRecords.some((record) => record.sleepHours != null || record.energy != null || record.mood != null);

  useEffect(() => {
    if (!isEditing) {
      syncFormWithEntry(current);
    }
  }, [current, isEditing, syncFormWithEntry]);

  const save = () => {
    const normalizedSleep = sleep.replace(',', '.').trim();
    const sleepHours = normalizedSleep === '' ? null : Number(normalizedSleep);
    if (sleepHours != null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 16)) return;
    const isToday = selectedDate === today;
    const persisted = onUpdateState((draft) => {
      saveDailyContextCheckIn(draft, selectedDate, {
        sleepHours,
        sleepQuality,
        energy,
        mood,
        stress: activeOptionalFactors.includes('stress') ? stress : null,
        physicalDiscomfort: activeOptionalFactors.includes('physicalDiscomfort') ? physicalDiscomfort : null,
        connection: activeOptionalFactors.includes('connection') ? connection : null,
        note: activeOptionalFactors.includes('note') ? note.trim() : '',
      });
      // Aislamiento histórico: SOLO actualizar preferencias globales si se está guardando Hoy.
      // La edición de fechas pasadas corrige el historial pero no modifica qué factores aparecerán mañana.
      if (isToday) {
        if (!draft.settings) {
          draft.settings = { ...draft.settings, contextOptionalFactors: activeOptionalFactors } as any;
        } else {
          draft.settings.contextOptionalFactors = activeOptionalFactors;
        }
      }
    });
    if (!persisted) return;
    playSound('click');
    setSaved(true);
    setIsEditing(false);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const handleDismissRecommendation = (recKey: string) => {
    playSound('click');
    onUpdateState((draft) => {
      dismissContextRecommendation(draft, selectedDate, recKey);
    });
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    const targetEntry = contextForDate(state, date);
    syncFormWithEntry(targetEntry);
    setIsEditing(false);
  };

  return (
    <section
      className="today-state-surface flex flex-col rounded-2xl border border-[var(--border)] p-3.5 sm:p-4"
      aria-labelledby="today-context-title"
    >
      <div>
        {/* Card Header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="today-section-icon today-section-icon-state">
              <AppIcon name="activity" className="h-4 w-4" />
            </span>
            <h2 id="today-context-title" className="text-base font-bold tracking-[-0.025em] text-[var(--text)]">
              {isEditing && selectedDate === today
                ? 'Registrar estado'
                : isEditing
                  ? `Editar · ${dayLabel(selectedDate, true)}`
                  : selectedDate === today
                    ? 'Estado'
                    : `Estado · ${dayLabel(selectedDate, true)}`}
            </h2>
            <span
              data-testid="today-state-date-badge"
              className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[12px] font-semibold text-[var(--text-soft)]"
            >
              {selectedDate === today ? 'Hoy' : 'Historial'}
            </span>
            {selectedDate !== today && (
              <button
                type="button"
                onClick={() => handleSelectDate(today)}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--blue-soft)]/50 px-2 py-0.5 text-[12px] font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--blue-soft)]"
              >
                <span aria-hidden="true">←</span>
                <span>Volver a hoy</span>
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {saved && (
              <span role="status" className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                Guardado
              </span>
            )}
            {!showCheckinInvite && (
              <button
                type="button"
                onClick={isEditing ? handleCancelEdit : handleStartEdit}
                className="rounded-lg border border-[var(--border)] bg-[var(--card-subtle)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-soft)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text)]"
              >
                {isEditing ? 'Cancelar' : hasContext(current) ? 'Editar' : 'Registrar'}
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3.5 border-t border-[var(--border)] pt-3" data-testid="today-state-edit-form">
            <div className="flex items-center justify-end">
              <span className="text-[11px] text-[var(--text-faint)]">Opcional</span>
            </div>

            {/* Sueño (Familia lavanda / índigo #A69AFF) */}
            <div className="space-y-2 rounded-xl border border-[var(--border)]/70 bg-[var(--card-subtle)]/35 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: 'var(--state-sleep-accent)' }}
                    aria-hidden="true"
                  />
                  <label htmlFor="today-state-sleep" className="text-[13px] font-semibold text-[var(--text)]">
                    Sueño
                  </label>
                </div>
                <span className="text-[11px] text-[var(--text-faint)]">Horas dormidas</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-28 shrink-0">
                  <input
                    id="today-state-sleep"
                    type="text"
                    inputMode="decimal"
                    value={sleep}
                    onChange={(event) => setSleep(event.target.value)}
                    placeholder="Ej. 7.5"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 pr-7 text-sm font-medium tabular-nums text-[var(--text)] transition-colors focus:border-[var(--state-sleep-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--state-sleep-border-active)]/30"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-faint)]">
                    h
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {[5, 6, 7, 8].map((preset) => {
                    const isSelected = sleep.trim() === String(preset) || sleep.trim() === `${preset}.0`;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSleep(String(preset))}
                        className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'border-[var(--state-sleep-border-active)] bg-[var(--state-sleep-soft)] font-semibold text-[var(--state-sleep)] ring-1 ring-[var(--state-sleep-border-active)]/30'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                        }`}
                      >
                        {preset} h
                      </button>
                    );
                  })}
                  {sleep.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setSleep('')}
                      className="min-h-[32px] rounded-lg px-2 py-1 text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Calidad percibida del sueño (opcional) */}
              <div className="pt-1">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-[var(--text-soft)]">
                    ¿Qué tan reparador sentiste tu descanso?
                  </span>
                  {sleepQuality != null && (
                    <button
                      type="button"
                      onClick={() => setSleepQuality(null)}
                      className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {([1, 2, 3, 4, 5] as const).map((option) => {
                    const isSelected = sleepQuality === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSleepQuality(isSelected ? null : option)}
                        aria-pressed={isSelected}
                        aria-label={`Calidad de descanso ${option} de 5: ${SLEEP_QUALITY_LABELS[option - 1]}`}
                        className={`min-h-9 rounded-lg border text-xs transition-colors ${
                          isSelected
                            ? 'border-[var(--state-sleep-border-active)] bg-[var(--state-sleep-soft)] font-semibold text-[var(--state-sleep)] shadow-2xs ring-1 ring-[var(--state-sleep-border-active)]/30'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="block font-semibold">{option}</span>
                        <span className="block text-[9px] font-normal opacity-85">
                          {SLEEP_QUALITY_SHORT_LABELS[option - 1]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Energía (Familia ámbar / dorado #F2B454) */}
            <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--card-subtle)]/35 p-3">
              <MetricScale
                label="Energía"
                sublabel="1 = Muy baja (agotado) · 5 = Muy alta (pleno)"
                value={energy}
                onChange={setEnergy}
                scaleLabels={ENERGY_SCALE_LABELS}
                shortScaleLabels={ENERGY_SHORT_LABELS}
                variant="energy"
                dotColor="var(--state-energy-accent)"
              />
            </div>

            {/* Ánimo (Familia turquesa / verde agua #53CCAD) */}
            <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--card-subtle)]/35 p-3">
              <MetricScale
                label="Ánimo"
                sublabel="1 = Muy bajo · 3 = Estable · 5 = Muy bueno"
                value={mood}
                onChange={setMood}
                scaleLabels={MOOD_SCALE_LABELS}
                shortScaleLabels={MOOD_SHORT_LABELS}
                variant="mood"
                dotColor="var(--state-mood-accent)"
              />
            </div>

            {/* Factores opcionales colapsables controlados por el usuario */}
            <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--card-subtle)]/35 p-2.5">
              <button
                type="button"
                onClick={() => setIsOptionalContextExpanded(!isOptionalContextExpanded)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={isOptionalContextExpanded}
              >
                <div className="flex items-center gap-1.5">
                  <AppIcon
                    name={isOptionalContextExpanded ? 'chevron-down' : 'chevron-right'}
                    className="h-3.5 w-3.5 text-[var(--text-muted)]"
                  />
                  <span className="text-[12px] font-semibold text-[var(--text)]">Contexto adicional (opcional)</span>
                  {activeOptionalCount > 0 && !isOptionalContextExpanded && (
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)]">
                      {activeOptionalCount} {activeOptionalCount === 1 ? 'activo' : 'activos'}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-faint)]">
                  {isOptionalContextExpanded ? 'Ocultar' : 'Estrés, molestias, nota'}
                </span>
              </button>

              {isOptionalContextExpanded && (
                <div className="mt-2.5 space-y-2 border-t border-[var(--border)]/50 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: 'stress' as const, label: 'Estrés percibido' },
                        { key: 'physicalDiscomfort' as const, label: 'Molestias físicas' },
                        { key: 'connection' as const, label: 'Conexión social' },
                        { key: 'note' as const, label: 'Nota breve' },
                      ] as const
                    ).map(({ key, label }) => {
                      const isActive = activeOptionalFactors.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleOptionalFactor(key)}
                          aria-pressed={isActive}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                            isActive
                              ? 'border-[var(--border-strong)] bg-[var(--surface-muted)] font-semibold text-[var(--text)]'
                              : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
                          }`}
                        >
                          {isActive ? '✓ ' : '+ '}
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subformularios de factores opcionales seleccionados */}
                  {activeOptionalFactors.includes('stress') && (
                    <div className="mt-2 border-t border-[var(--border)]/40 pt-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-soft)]">Estrés percibido</span>
                        {stress && (
                          <button
                            type="button"
                            onClick={() => toggleOptionalFactor('stress')}
                            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['bajo', 'moderado', 'alto'] as const).map((level) => {
                          const isSelected = stress === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setStress(isSelected ? null : level)}
                              className={`rounded-lg border py-1 text-xs font-medium capitalize transition-colors ${
                                isSelected
                                  ? 'border-amber-600/60 bg-amber-500/15 font-semibold text-amber-800 dark:text-amber-200'
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeOptionalFactors.includes('physicalDiscomfort') && (
                    <div className="mt-2 border-t border-[var(--border)]/40 pt-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-soft)]">Molestias físicas</span>
                        {physicalDiscomfort && (
                          <button
                            type="button"
                            onClick={() => toggleOptionalFactor('physicalDiscomfort')}
                            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['leve', 'moderada', 'alta'] as const).map((level) => {
                          const isSelected = physicalDiscomfort === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setPhysicalDiscomfort(isSelected ? null : level)}
                              className={`rounded-lg border py-1 text-xs font-medium capitalize transition-colors ${
                                isSelected
                                  ? level === 'leve'
                                    ? 'border-amber-500/50 bg-amber-500/10 font-semibold text-amber-900 dark:text-amber-200'
                                    : level === 'moderada'
                                      ? 'border-orange-500/50 bg-orange-500/15 font-semibold text-orange-900 dark:text-orange-200'
                                      : 'border-rose-600/60 bg-rose-500/15 font-semibold text-rose-800 dark:text-rose-200'
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeOptionalFactors.includes('connection') && (
                    <div className="mt-2 border-t border-[var(--border)]/40 pt-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-soft)]">Conexión social</span>
                        {connection && (
                          <button
                            type="button"
                            onClick={() => toggleOptionalFactor('connection')}
                            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'solo', label: 'A solas' },
                            { id: 'mensaje', label: 'Mensajes' },
                            { id: 'encuentro', label: 'Encuentro' },
                          ] as const
                        ).map(({ id, label }) => {
                          const isSelected = connection === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setConnection(isSelected ? null : id)}
                              className={`rounded-lg border py-1 text-xs font-medium transition-colors ${
                                isSelected
                                  ? 'border-sky-600/60 bg-sky-500/15 font-semibold text-sky-800 dark:text-sky-200'
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeOptionalFactors.includes('note') && (
                    <div className="mt-2 border-t border-[var(--border)]/40 pt-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <label htmlFor="today-state-note" className="font-medium text-[var(--text-soft)]">
                          {note.length > 100
                            ? `Nota del día (${note.length} caracteres)`
                            : 'Nota breve (máx. 100 caracteres)'}
                        </label>
                        {note.trim() !== '' && (
                          <button
                            type="button"
                            onClick={() => toggleOptionalFactor('note')}
                            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <input
                        id="today-state-note"
                        type="text"
                        maxLength={Math.max(100, note.length)}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ej. Dormí con calor, buena siesta..."
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text)] focus:border-[var(--border-focus)] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="min-h-9 rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-soft)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                className="min-h-9 rounded-lg bg-[var(--blue)] px-5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-[var(--blue-hover)]"
              >
                Guardar estado
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Invitación discreta si no hay datos hoy */}
            {showCheckinInvite && (
              <div
                data-testid="today-state-checkin-invite"
                className="today-state-checkin-invite mb-3 rounded-xl border border-[var(--state-sleep-border)] bg-[var(--state-sleep-soft)]/40 p-3 text-sm"
              >
                <div className="today-state-invite-content">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--text)]">¿Cómo estás hoy?</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-soft)]">Sueño, energía y ánimo.</p>
                  </div>
                  <div className="today-state-invite-actions">
                    <button
                      type="button"
                      onClick={() => setIsInviteSkipped(true)}
                      className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-[var(--text-soft)] transition-colors hover:text-[var(--text)]"
                    >
                      Ahora no
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="rounded-lg bg-[var(--blue)] px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--blue-hover)]"
                    >
                      Registrar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!hasContext(current) && !showCheckinInvite && (
              <p className="py-2 text-sm text-[var(--text-soft)]">Sin registros para este día.</p>
            )}
            {hasContext(current) && <>
            {/* Valores del día seleccionado: los ceros son registros, no ausencias. */}
            <div
              className="today-state-kpi-strip grid grid-cols-3 divide-x divide-[var(--border)]/75 rounded-xl border border-[var(--border)]/80 bg-[var(--card-subtle)]/75 px-1 py-2 sm:py-2.5 shadow-2xs"
              aria-label={`Valores registrados para ${selectedDate === today ? 'hoy' : dayLabel(selectedDate, true)}`}
            >
              {/* Sueño */}
              <div className="flex flex-col justify-between px-2 sm:px-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: current.sleepHours != null ? 'var(--state-sleep-accent)' : 'var(--border-strong)' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-soft)]">
                      Sueño
                    </span>
                  </div>
                  <div className="mt-1">
                    <div className="text-[1.15rem] sm:text-[1.3rem] font-black font-mono tabular-nums tracking-[-0.02em] text-[var(--text)] leading-none">
                      {current.sleepHours == null ? '—' : formatSleepHours(current.sleepHours)}
                    </div>
                    <div
                      className="mt-1 truncate text-[11px] sm:text-[12px] font-medium text-[var(--text-soft)]"
                      title={current.sleepHours == null ? 'Sin registro' : sleepQualityDescriptor(current.sleepQuality, true)}
                    >
                      {current.sleepHours == null ? 'Sin registro' : sleepQualityDescriptor(current.sleepQuality, true)}
                    </div>
                  </div>
                </div>
                {deltas.sleep.hasData && <div className="mt-2 pt-1 border-t border-[var(--border)]/40">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium text-[var(--text-soft)] bg-[var(--surface-muted)]/70">
                    {formatNaturalDelta(deltas.sleep, 'h')}
                  </span>
                </div>}
              </div>

              {/* Energía */}
              <div className="flex flex-col justify-between px-2 sm:px-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: current.energy != null ? 'var(--state-energy-accent)' : 'var(--border-strong)' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-soft)]">
                      Energía
                    </span>
                  </div>
                  <div className="mt-1">
                    <div className="text-[1.15rem] sm:text-[1.3rem] font-black font-mono tabular-nums tracking-[-0.02em] text-[var(--text)] leading-none">
                      {current.energy == null ? '—' : `${current.energy}/5`}
                    </div>
                    <div className="mt-1 truncate text-[11px] sm:text-[12px] font-medium text-[var(--text-soft)]">
                      {current.energy == null ? 'Sin registro' : energyLabel(current.energy)}
                    </div>
                  </div>
                </div>
                {deltas.energy.hasData && <div className="mt-2 pt-1 border-t border-[var(--border)]/40">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                    deltas.energy.sign === 'pos'
                      ? 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400'
                      : deltas.energy.sign === 'neg'
                        ? 'text-amber-600 bg-amber-500/10 dark:text-amber-400'
                        : 'text-[var(--text-soft)] bg-[var(--surface-muted)]/70'
                  }`}>
                    {formatNaturalDelta(deltas.energy)}
                  </span>
                </div>}
              </div>

              {/* Ánimo */}
              <div className="flex flex-col justify-between px-2 sm:px-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: current.mood != null ? 'var(--state-mood-accent)' : 'var(--border-strong)' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-soft)]">
                      Ánimo
                    </span>
                  </div>
                  <div className="mt-1">
                    <div className="text-[1.15rem] sm:text-[1.3rem] font-black font-mono tabular-nums tracking-[-0.02em] text-[var(--text)] leading-none">
                      {current.mood == null ? '—' : `${current.mood}/5`}
                    </div>
                    <div className="mt-1 truncate text-[11px] sm:text-[12px] font-medium text-[var(--text-soft)]">
                      {current.mood == null ? 'Sin registro' : moodLabel(current.mood)}
                    </div>
                  </div>
                </div>
                {deltas.mood.hasData && <div className="mt-2 pt-1 border-t border-[var(--border)]/40">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                    deltas.mood.sign === 'pos'
                      ? 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400'
                      : deltas.mood.sign === 'neg'
                        ? 'text-amber-600 bg-amber-500/10 dark:text-amber-400'
                        : 'text-[var(--text-soft)] bg-[var(--surface-muted)]/70'
                  }`}>
                    {formatNaturalDelta(deltas.mood)}
                  </span>
                </div>}
              </div>
            </div>

            {/* Factores Secundarios Discretos (Estrés, Molestias, Conexión, Nota) */}
            {/* Factores Secundarios Discretos (Estrés, Molestias, Conexión) y Nota Personal */}
            {hasSecondaryFactors && (
              <div
                data-testid="today-state-secondary-factors"
                className="mt-2.5 space-y-2 text-[11px] text-[var(--text-soft)]"
              >
                {(secondaryFactors.length > 0 || current.morningSnapshot) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {secondaryFactors.map((factor, idx) => (
                      <React.Fragment key={factor}>
                        {idx > 0 && <span className="select-none text-[var(--text-faint)]">·</span>}
                        <span className="inline-flex items-center rounded-md bg-[var(--surface-muted)] px-2 py-0.5 font-medium text-[var(--text-soft)]">
                          {factor}
                        </span>
                      </React.Fragment>
                    ))}
                    {current.morningSnapshot && (
                      <>
                        {secondaryFactors.length > 0 && (
                          <span className="select-none text-[var(--text-faint)]">·</span>
                        )}
                        <span
                          title={`Registro matutino: ${current.morningSnapshot.sleepHours ?? '—'} h sueño, energía ${current.morningSnapshot.energy ?? '—'}/5`}
                          className="rounded bg-[var(--state-sleep-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--state-sleep)]"
                        >
                          Registro de la mañana
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Nota personal con lectura completa y expansión accesible */}
                {current.note && current.note.trim() !== '' && (
                  <div
                    data-testid="today-state-personal-note"
                    className="rounded-xl border border-[var(--border)]/60 bg-[var(--surface-muted)]/35 p-2.5 text-xs transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <span className="select-none text-[12px] text-[var(--text-faint)] shrink-0 pt-0.5" aria-hidden="true">
                        📝
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                            Nota del día
                          </span>
                          {isLongNote && (
                            <button
                              type="button"
                              onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                              aria-expanded={isNoteExpanded}
                              aria-controls="today-state-note-content"
                              className="rounded text-[11px] font-semibold text-[var(--blue)] hover:underline focus:outline-none focus:ring-1 focus:ring-[var(--blue)] cursor-pointer"
                            >
                              {isNoteExpanded ? 'Ver menos' : 'Ver más'}
                            </button>
                          )}
                        </div>
                        <p
                          id="today-state-note-content"
                          className={`mt-0.5 text-[12px] leading-relaxed italic text-[var(--text-soft)] break-words ${
                            isNoteExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                          }`}
                        >
                          "{current.note.trim()}"
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            </>}
            {/* Sugerencia contextual explicable: SOLO para hoy si existe recomendación */}
            {selectedDate === today && evaluation.recommendation && (
              <div
                data-testid="today-state-contextual-suggestion"
                className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm dark:bg-amber-500/15"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                    <AppIcon name="sparkles" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{evaluation.recommendation.headline}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissRecommendation(evaluation.recommendation!.key)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-amber-800/80 hover:bg-amber-500/20 dark:text-amber-300"
                    title="Descartar sugerencia por hoy"
                  >
                    Descartar
                  </button>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text)]">
                  {evaluation.recommendation.whyRelevant}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20 pt-2 text-[12px]">
                  <span className="font-medium text-amber-950 dark:text-amber-100">
                    💡 {evaluation.recommendation.optionToConsider}
                  </span>
                  <div className="flex items-center gap-2">
                    {onNavigate &&
                      evaluation.recommendation.targetView &&
                      isModuleEnabled(state, evaluation.recommendation.targetView) && (
                        <button
                          type="button"
                          onClick={() => onNavigate(evaluation.recommendation!.targetView!)}
                          className="rounded-md bg-amber-600/15 px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-600/25 dark:bg-amber-400/20 dark:text-amber-100"
                        >
                          {evaluation.recommendation.targetLabel || 'Revisar agenda'}
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => setShowExplainDetails(!showExplainDetails)}
                      aria-expanded={showExplainDetails}
                      aria-controls="today-state-context-explanation"
                      className="text-[11px] font-semibold text-[var(--blue)] hover:underline"
                    >
                      {showExplainDetails ? 'Menos detalles' : 'Por qué veo esto'}
                    </button>
                  </div>
                </div>
                {showExplainDetails && (
                  <div id="today-state-context-explanation" className="mt-2 space-y-1 rounded-lg bg-[var(--card)]/80 p-2.5 text-xs text-[var(--text-soft)]">
                    <p>
                      <strong>Observado:</strong> {evaluation.recommendation.observed}
                    </p>
                    <p className="pt-1 text-xs text-[var(--text-soft)]">
                      Esta sugerencia es orientativa. Celestian nunca cancela tareas ni impone descanso automáticamente.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Zona Inferior: Tu evolución */}
            <div className="mt-4 border-t border-[var(--border)]/70 pt-3.5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-soft)]">
                    Tu evolución
                  </h3>
                  <p className="text-[12px] text-[var(--text-soft)]">
                    Últimos 7 días{registeredDaysCount > 0 ? ` · ${registeredDaysCount}/7 con registro` : ' · Sin registros todavía'}
                  </p>
                </div>
                {hasMetricHistory && <div
                  className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card-subtle)] p-0.5"
                  role="group"
                  aria-label="Vista del gráfico semanal de estado"
                >
                  {(
                    [
                      { id: 'general', label: 'General' },
                      { id: 'sleep', label: 'Sueño' },
                      { id: 'energy', label: 'Energía' },
                      { id: 'mood', label: 'Ánimo' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setViewMode(tab.id)}
                      aria-pressed={viewMode === tab.id}
                      className={`rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                        viewMode === tab.id
                          ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs'
                          : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>}
              </div>

              {/* Bottom Section: 7-Day Visualization */}
              {!hasMetricHistory ? (
                <div data-testid="today-state-empty-history" className="grid grid-cols-7 gap-1" role="group" aria-label="Seleccionar día de la semana">
                  {weekRecords.map((record) => (
                    <button
                      key={record.date}
                      type="button"
                      aria-pressed={record.date === selectedDate}
                      aria-label={`${formatLongDate(record.date, record.date === today)}: ${record.hasAny ? 'Con registro' : 'Sin registros'}. Seleccionar día.`}
                      onClick={() => handleSelectDate(record.date)}
                      className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg text-xs ${record.date === selectedDate ? 'bg-[var(--blue-soft)] font-semibold text-[var(--blue)]' : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)]'}`}
                    >
                      <span>{record.date === today ? 'Hoy' : dayLabel(record.date)}</span>
                      <span>{dayNumber(record.date)}</span>
                    </button>
                  ))}
                </div>
              ) : viewMode === 'general' ? (
                <WeeklyGeneralMatrixChart
                  records={weekRecords}
                  sleepScaleMax={sleepScaleMax}
                  selectedDate={selectedDate}
                  today={today}
                  onSelect={handleSelectDate}
                  state={state}
                />
              ) : (
                <WeeklyMetricDetailChart
                  records={weekRecords}
                  metric={viewMode}
                  scaleMax={viewMode === 'sleep' ? sleepScaleMax : 5}
                  selectedDate={selectedDate}
                  today={today}
                  onSelect={handleSelectDate}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

/**
 * Joint 7-day visualization showing Sueño (hours), Energía (1-5), and Ánimo (1-5)
 * in three horizontally aligned bands within a single unified visual surface.
 * Alta Fidelidad: Precisión Instrumental con alineación matemática 0.00px y accesibilidad WCAG.
 */
const WeeklyGeneralMatrixChart: React.FC<{
  records: DayWeekRecord[];
  sleepScaleMax: number;
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  state?: LifeOSState;
}> = ({ records, sleepScaleMax, selectedDate, today, onSelect, state }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dayButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastPointerTypeRef = useRef<string>('mouse');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const [mobileInspectDate, setMobileInspectDate] = useState<string | null>(null);

  const getX = useCallback((idx: number) => 50 + idx * 100, []);

  // Lane 1: Sueño (Top) - Baseline Y = 68, Top Y = 14 (Range = 54)
  const getSleepY = useCallback(
    (val: number) => 68 - (Math.min(val, sleepScaleMax) / sleepScaleMax) * 54,
    [sleepScaleMax],
  );
  const sleepRefY = 68 - (7 / sleepScaleMax) * 54;
  const sleepRecords = useMemo(
    () => records.map((r) => ({ date: r.date, value: r.sleepHours })),
    [records],
  );
  const sleepGroups = useMemo(
    () => groupContiguousEvolutionPoints(sleepRecords, getSleepY, getX),
    [sleepRecords, getSleepY, getX],
  );

  // Lane 2: Energía (Middle) - Baseline Y = 142, Top Y = 88 (Range = 54)
  const getEnergyY = useCallback((val: number) => 142 - ((val - 1) / 4) * 54, []);
  const energyRefY = 115; // 3/5
  const energyRecords = useMemo(
    () => records.map((r) => ({ date: r.date, value: r.energy })),
    [records],
  );
  const energyGroups = useMemo(
    () => groupContiguousEvolutionPoints(energyRecords, getEnergyY, getX),
    [energyRecords, getEnergyY, getX],
  );

  // Lane 3: Ánimo (Bottom) - Baseline Y = 216, Top Y = 162 (Range = 54)
  const getMoodY = useCallback((val: number) => 216 - ((val - 1) / 4) * 54, []);
  const moodRefY = 189; // 3/5
  const moodRecords = useMemo(
    () => records.map((r) => ({ date: r.date, value: r.mood })),
    [records],
  );
  const moodGroups = useMemo(
    () => groupContiguousEvolutionPoints(moodRecords, getMoodY, getX),
    [moodRecords, getMoodY, getX],
  );

  const selectedIdx = records.findIndex((r) => r.date === selectedDate);

  const activeInspectDate = hoveredIdx !== null ? records[hoveredIdx]?.date : mobileInspectDate;
  const inspectIdx = activeInspectDate ? records.findIndex((r) => r.date === activeInspectDate) : -1;
  const inspectRec = inspectIdx !== -1 ? records[inspectIdx] : null;

  const inspectDeltas = useMemo(() => {
    if (!inspectRec || !state) return null;
    return calculateContextDeltas(state, inspectRec.date);
  }, [inspectRec, state]);

  const handlePointerEnterDay = (_date: string, idx: number, e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    setHoveredIdx(idx);
    const rect = e.currentTarget.getBoundingClientRect();
    setPointerY(e.clientY - rect.top);
  };

  const handlePointerMoveDay = (_date: string, idx: number, e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    setHoveredIdx(idx);
    const rect = e.currentTarget.getBoundingClientRect();
    setPointerY(e.clientY - rect.top);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
  };

  const handlePointerLeave = () => {
    setHoveredIdx(null);
    setPointerY(null);
    if (lastPointerTypeRef.current !== 'touch') {
      setMobileInspectDate(null);
    }
  };

  const handleSelectDay = (date: string, isTouch = false) => {
    onSelect(date);
    if (isTouch) {
      setMobileInspectDate((prev) => (prev === date ? null : date));
    } else {
      setMobileInspectDate(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = Math.min(records.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') targetIndex = Math.max(0, index - 1);
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = records.length - 1;
    if (targetIndex != null && targetIndex !== index) {
      event.preventDefault();
      const targetDate = records[targetIndex].date;
      handleSelectDay(targetDate, false);
      dayButtonRefs.current[targetIndex]?.focus();
    }
  };

  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHoveredIdx(null);
        setMobileInspectDate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
    };
  }, []);

  useEffect(() => {
    if (!mobileInspectDate) return;
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMobileInspectDate(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [mobileInspectDate]);

  const getTooltipPlacement = (colIdx: number, pY: number | null): React.CSSProperties => {
    const colCenterPct = ((colIdx + 0.5) / 7) * 100;
    const isNearTop = pY !== null && pY < 100;

    const horizontal: React.CSSProperties =
      colIdx <= 1
        ? { left: '8px' }
        : colIdx >= 5
          ? { right: '8px' }
          : { left: `${colCenterPct}%`, transform: 'translateX(-50%)' };

    const vertical: React.CSSProperties = isNearTop
      ? { bottom: '12px' }
      : { top: '10px' };

    return { ...horizontal, ...vertical };
  };

  return (
    <div
      ref={containerRef}
      className="today-state-general-chart mt-2 rounded-xl border border-[var(--border)]/85 bg-[var(--card-subtle)]/75 overflow-hidden shadow-2xs"
      aria-label="Visualización semanal conjunta de sueño, energía y ánimo en los últimos siete días"
      onPointerLeave={handlePointerLeave}
    >
      {/* Integrated Header Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[var(--border)]/70 bg-[var(--card)]/40 px-3.5 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--state-sleep-accent)' }} />
            <span className="font-semibold text-[var(--text)]">Sueño</span>
            <span className="tabular-nums font-mono text-[11px] text-[var(--text-soft)]">(0–{sleepScaleMax}h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--state-energy-accent)' }} />
            <span className="font-semibold text-[var(--text)]">Energía</span>
            <span className="tabular-nums font-mono text-[11px] text-[var(--text-soft)]">(1–5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--state-mood-accent)' }} />
            <span className="font-semibold text-[var(--text)]">Ánimo</span>
            <span className="tabular-nums font-mono text-[11px] text-[var(--text-soft)]">(1–5)</span>
          </div>
        </div>
      </div>

      {/* Chart + Y-Axis Scale Row */}
      <div
        className="relative flex overflow-visible bg-[var(--card-subtle)]/50 pt-2 pb-1"
        onPointerLeave={handlePointerLeave}
      >
        {/* Left Y-Axis Scale Gutter (HTML CSS: crisp, never shrinks down illegibly on mobile) */}
        <div
          className="relative flex w-9 sm:w-11 shrink-0 select-none flex-col justify-between py-1 text-right font-mono text-[9px] sm:text-[10px] text-[var(--text-faint)] pr-1.5 sm:pr-2"
          aria-hidden="true"
          style={{ height: '228px' }}
        >
          {/* Lane 1 ticks */}
          <div className="absolute top-[8px] right-1.5 sm:right-2 font-mono">{sleepScaleMax}h</div>
          <div className="absolute top-[28px] right-1.5 sm:right-2 font-mono font-bold text-[var(--state-sleep)]">7h</div>
          <div className="absolute top-[60px] right-1.5 sm:right-2 font-mono">0h</div>

          {/* Lane 2 ticks */}
          <div className="absolute top-[82px] right-1.5 sm:right-2 font-mono">5</div>
          <div className="absolute top-[108px] right-1.5 sm:right-2 font-mono font-bold text-[var(--state-energy)]">3</div>
          <div className="absolute top-[134px] right-1.5 sm:right-2 font-mono">1</div>

          {/* Lane 3 ticks */}
          <div className="absolute top-[156px] right-1.5 sm:right-2 font-mono">5</div>
          <div className="absolute top-[182px] right-1.5 sm:right-2 font-mono font-bold text-[var(--state-mood)]">3</div>
          <div className="absolute top-[208px] right-1.5 sm:right-2 font-mono">1</div>
        </div>

        {/* SVG Chart Surface (flex-1) */}
        <div className="relative flex-1 min-w-0 overflow-visible">
          <svg
            className="h-[228px] w-full"
            viewBox="0 0 700 228"
            preserveAspectRatio="none"
            role="img"
            aria-label="Gráfico de evolución semanal de sueño, energía y ánimo"
          >
            <defs>
              <linearGradient id="evo-sleep-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--state-sleep)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="var(--state-sleep)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="evo-energy-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--state-energy)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--state-energy)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="evo-mood-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--state-mood)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--state-mood)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="af-pillar-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.10" />
                <stop offset="65%" stopColor="var(--blue)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.14" />
              </linearGradient>
            </defs>

            {/* Vertical day guidelines */}
            {records.map((_, idx) => (
              <line
                key={`grid-col-${idx}`}
                x1={getX(idx)}
                y1="4"
                x2={getX(idx)}
                y2="224"
                stroke="var(--border)"
                strokeOpacity="0.22"
                strokeDasharray="2 4"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Shared Day Selection Pillar ("illuminated column") */}
            {selectedIdx !== -1 && (
              <rect
                x={getX(selectedIdx) - 44}
                y="4"
                width="88"
                height="220"
                rx="8"
                fill="url(#af-pillar-grad)"
                stroke="var(--blue)"
                strokeOpacity="0.28"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Hover column pillar when hovering over a different day */}
            {hoveredIdx !== null && hoveredIdx !== selectedIdx && (
              <rect
                x={getX(hoveredIdx) - 44}
                y="4"
                width="88"
                height="220"
                rx="8"
                fill="var(--text)"
                fillOpacity="0.03"
                stroke="var(--border)"
                strokeOpacity="0.30"
                strokeDasharray="3 3"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Lane Horizontal Separators */}
            <line x1="8" y1="76" x2="692" y2="76" stroke="var(--border)" strokeOpacity="0.40" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="8" y1="150" x2="692" y2="150" stroke="var(--border)" strokeOpacity="0.40" strokeWidth="1" vectorEffect="non-scaling-stroke" />

            {/* Baselines */}
            <line x1="8" y1="68" x2="692" y2="68" stroke="var(--border)" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="8" y1="142" x2="692" y2="142" stroke="var(--border)" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="8" y1="216" x2="692" y2="216" stroke="var(--border)" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />

            {/* Reference Threshold Lines */}
            <line
              x1="8"
              y1={sleepRefY}
              x2="692"
              y2={sleepRefY}
              stroke="var(--state-sleep)"
              strokeDasharray="3 3"
              strokeOpacity="0.25"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="8"
              y1={energyRefY}
              x2="692"
              y2={energyRefY}
              stroke="var(--state-energy)"
              strokeDasharray="3 3"
              strokeOpacity="0.25"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="8"
              y1={moodRefY}
              x2="692"
              y2={moodRefY}
              stroke="var(--state-mood)"
              strokeDasharray="3 3"
              strokeOpacity="0.25"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* --- Lane 1: Sueño Data Rendering --- */}
            {sleepGroups.map((group, gIdx) => (
              <path
                key={`sleep-area-${gIdx}`}
                d={buildAreaPath(group, 68, { minY: 14, maxY: 68 })}
                fill="url(#evo-sleep-grad)"
              />
            ))}
            {sleepGroups.map((group, gIdx) => (
              <path
                key={`sleep-curve-${gIdx}`}
                d={buildSmoothPath(group, { minY: 14, maxY: 68 })}
                fill="none"
                stroke="var(--state-sleep)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {records.map((rec, idx) =>
              rec.sleepHours == null ? (
                <g key={`sleep-empty-${rec.date}`}>
                  <line
                    x1={getX(idx) - 10}
                    y1="68"
                    x2={getX(idx) + 10}
                    y2="68"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                    opacity="0.55"
                  />
                  <text x={getX(idx)} y="64" fontSize="8" fontFamily="monospace" fill="var(--text-faint)" textAnchor="middle">
                    S/D
                  </text>
                </g>
              ) : null,
            )}
            {sleepGroups.flatMap((group) =>
              group.map((pt) => {
                const isSelected = pt.date === selectedDate;
                const isHovered = hoveredIdx !== null && records[hoveredIdx]?.date === pt.date;
                return (
                  <g key={`sleep-pt-${pt.date}`}>
                    {isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="7.5"
                        fill="var(--card)"
                        stroke="var(--state-sleep)"
                        strokeWidth="1.8"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {isHovered && !isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6.5"
                        fill="var(--card)"
                        stroke="var(--state-sleep)"
                        strokeWidth="1.5"
                        strokeOpacity="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? '4.2' : '3.5'}
                      fill="var(--state-sleep-accent)"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              }),
            )}

            {/* --- Lane 2: Energía Data Rendering --- */}
            {energyGroups.map((group, gIdx) => (
              <path
                key={`energy-area-${gIdx}`}
                d={buildAreaPath(group, 142, { minY: 88, maxY: 142 })}
                fill="url(#evo-energy-grad)"
              />
            ))}
            {energyGroups.map((group, gIdx) => (
              <path
                key={`energy-curve-${gIdx}`}
                d={buildSmoothPath(group, { minY: 88, maxY: 142 })}
                fill="none"
                stroke="var(--state-energy)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {records.map((rec, idx) =>
              rec.energy == null ? (
                <g key={`energy-empty-${rec.date}`}>
                  <line
                    x1={getX(idx) - 10}
                    y1="142"
                    x2={getX(idx) + 10}
                    y2="142"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                    opacity="0.55"
                  />
                  <text x={getX(idx)} y="138" fontSize="8" fontFamily="monospace" fill="var(--text-faint)" textAnchor="middle">
                    S/D
                  </text>
                </g>
              ) : null,
            )}
            {energyGroups.flatMap((group) =>
              group.map((pt) => {
                const isSelected = pt.date === selectedDate;
                const isHovered = hoveredIdx !== null && records[hoveredIdx]?.date === pt.date;
                return (
                  <g key={`energy-pt-${pt.date}`}>
                    {isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="7.5"
                        fill="var(--card)"
                        stroke="var(--state-energy)"
                        strokeWidth="1.8"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {isHovered && !isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6.5"
                        fill="var(--card)"
                        stroke="var(--state-energy)"
                        strokeWidth="1.5"
                        strokeOpacity="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? '4.2' : '3.5'}
                      fill="var(--state-energy-accent)"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              }),
            )}

            {/* --- Lane 3: Ánimo Data Rendering --- */}
            {moodGroups.map((group, gIdx) => (
              <path
                key={`mood-area-${gIdx}`}
                d={buildAreaPath(group, 216, { minY: 162, maxY: 216 })}
                fill="url(#evo-mood-grad)"
              />
            ))}
            {moodGroups.map((group, gIdx) => (
              <path
                key={`mood-curve-${gIdx}`}
                d={buildSmoothPath(group, { minY: 162, maxY: 216 })}
                fill="none"
                stroke="var(--state-mood)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {records.map((rec, idx) =>
              rec.mood == null ? (
                <g key={`mood-empty-${rec.date}`}>
                  <line
                    x1={getX(idx) - 10}
                    y1="216"
                    x2={getX(idx) + 10}
                    y2="216"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                    opacity="0.55"
                  />
                  <text x={getX(idx)} y="212" fontSize="8" fontFamily="monospace" fill="var(--text-faint)" textAnchor="middle">
                    S/D
                  </text>
                </g>
              ) : null,
            )}
            {moodGroups.flatMap((group) =>
              group.map((pt) => {
                const isSelected = pt.date === selectedDate;
                const isHovered = hoveredIdx !== null && records[hoveredIdx]?.date === pt.date;
                return (
                  <g key={`mood-pt-${pt.date}`}>
                    {isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="7.5"
                        fill="var(--card)"
                        stroke="var(--state-mood)"
                        strokeWidth="1.8"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {isHovered && !isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6.5"
                        fill="var(--card)"
                        stroke="var(--state-mood)"
                        strokeWidth="1.5"
                        strokeOpacity="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? '4.2' : '3.5'}
                      fill="var(--state-mood-accent)"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              }),
            )}

            {/* Interactive Hit Zones: 7 columns spanning the entire canvas */}
            {records.map((rec, idx) => (
              <rect
                key={`hit-${rec.date}`}
                data-hit-date={rec.date}
                x={idx * 100}
                y="0"
                width="100"
                height="228"
                fill="#000"
                fillOpacity="0"
                pointerEvents="all"
                className="cursor-pointer"
                onPointerDown={handlePointerDown}
                onPointerEnter={(e) => handlePointerEnterDay(rec.date, idx, e)}
                onPointerMove={(e) => handlePointerMoveDay(rec.date, idx, e)}
                onClick={() => handleSelectDay(rec.date, lastPointerTypeRef.current === 'touch')}
              >
                <title>{`${formatLongDate(rec.date, rec.date === today)}: clic para consultar`}</title>
              </rect>
            ))}
          </svg>

          {/* Contextual Detail Floating Tooltip */}
          {inspectRec && (hoveredIdx !== null || mobileInspectDate === inspectRec.date) && (
            <div
              className="pointer-events-none absolute z-30 w-72 max-w-[calc(100%-1.25rem)] rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-xl backdrop-blur-md transition-all duration-150 sm:max-w-none dark:bg-[var(--card-subtle)]/95"
              style={getTooltipPlacement(inspectIdx, pointerY)}
              role="tooltip"
            >
              <div className="mb-2 flex items-center justify-between border-b border-[var(--border)]/60 pb-1.5 text-xs">
                <span className="font-bold text-[var(--text)]">
                  {formatLongDate(inspectRec.date, inspectRec.date === today)}
                </span>
                {inspectRec.date === selectedDate ? (
                  <span className="rounded bg-[var(--blue-soft)]/70 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--blue)]">
                    Seleccionado
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-faint)]">Clic para seleccionar</span>
                )}
              </div>

              {!inspectRec.hasAny ? (
                <p className="py-1 text-xs italic text-[var(--text-soft)]">
                  Sin registros de estado para este día.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {/* Sueño */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: 'var(--state-sleep-accent)' }} />
                      <span className="font-medium text-[var(--text-soft)]">Sueño:</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold font-mono tabular-nums ${inspectRec.sleepHours != null ? 'text-[var(--state-sleep)]' : 'font-normal text-[var(--text-faint)]'}`}>
                        {inspectRec.sleepHours != null
                          ? `${inspectRec.sleepHours.toLocaleString('es-UY')} h — ${inspectRec.sleepQuality != null ? sleepQualityDescriptor(inspectRec.sleepQuality) : 'sin calificar'}`
                          : 'Sin registro'}
                      </span>
                      {inspectDeltas && inspectRec.sleepHours != null && inspectDeltas.sleep.hasPrev && (
                        <span className="text-[9px] font-mono text-[var(--text-faint)] bg-[var(--surface-muted)] px-1 rounded">
                          {inspectDeltas.sleep.diff === 0 ? '= 0.0 h' : `${inspectDeltas.sleep.diff! > 0 ? '+' : ''}${inspectDeltas.sleep.diff!.toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Energía */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: 'var(--state-energy-accent)' }} />
                      <span className="font-medium text-[var(--text-soft)]">Energía:</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold font-mono tabular-nums ${inspectRec.energy != null ? 'text-[var(--state-energy)]' : 'font-normal text-[var(--text-faint)]'}`}>
                        {inspectRec.energy != null
                          ? `${inspectRec.energy}/5 — ${energyLabel(inspectRec.energy)}`
                          : 'Sin registro'}
                      </span>
                      {inspectDeltas && inspectRec.energy != null && inspectDeltas.energy.hasPrev && (
                        <span className="text-[9px] font-mono text-[var(--text-faint)] bg-[var(--surface-muted)] px-1 rounded">
                          {inspectDeltas.energy.diff === 0 ? '= 0' : `${inspectDeltas.energy.diff! > 0 ? '+' : ''}${inspectDeltas.energy.diff}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ánimo */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: 'var(--state-mood-accent)' }} />
                      <span className="font-medium text-[var(--text-soft)]">Ánimo:</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold font-mono tabular-nums ${inspectRec.mood != null ? 'text-[var(--state-mood)]' : 'font-normal text-[var(--text-faint)]'}`}>
                        {inspectRec.mood != null
                          ? `${inspectRec.mood}/5 — ${moodLabel(inspectRec.mood)}`
                          : 'Sin registro'}
                      </span>
                      {inspectDeltas && inspectRec.mood != null && inspectDeltas.mood.hasPrev && (
                        <span className="text-[9px] font-mono text-[var(--text-faint)] bg-[var(--surface-muted)] px-1 rounded">
                          {inspectDeltas.mood.diff === 0 ? '= 0' : `${inspectDeltas.mood.diff! > 0 ? '+' : ''}${inspectDeltas.mood.diff}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Optional factors */}
                  {(inspectRec.stress || inspectRec.physicalDiscomfort || inspectRec.note) && (
                    <div className="mt-1.5 border-t border-[var(--border)]/40 pt-1.5 text-[11px] text-[var(--text-soft)]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {inspectRec.stress && (
                          <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 capitalize">
                            Estrés {inspectRec.stress}
                          </span>
                        )}
                        {inspectRec.physicalDiscomfort && (
                          <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 capitalize">
                            Molestias {inspectRec.physicalDiscomfort}
                          </span>
                        )}
                      </div>
                      {inspectRec.note && (
                        <p className="mt-1 truncate italic text-[var(--text-faint)]">
                          "{inspectRec.note}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tactile 7-Day Selector Bar (Single source of truth matching Y-axis gutter) */}
      <div className="flex border-t border-[var(--border)]/70 bg-[var(--card)]/40">
        {/* Gutter spacer matching Y-axis exactly */}
        <div className="w-9 sm:w-11 shrink-0 select-none" aria-hidden="true" />

        {/* 7 Interactive accessible buttons */}
        <div
          className="grid flex-1 min-w-0 grid-cols-7"
          role="group"
          aria-label="Seleccionar día de la semana"
        >
          {records.map((rec, idx) => {
            const isToday = rec.date === today;
            const isSelected = rec.date === selectedDate;
            const isInspected = activeInspectDate === rec.date;
            const summaryTitle = `${formatLongDate(rec.date, isToday)}: ${
              rec.hasAny
                ? `Sueño: ${rec.sleepHours != null ? `${rec.sleepHours.toLocaleString('es-UY')} h` : 'Sin dato'}, Energía: ${
                    rec.energy != null ? `${rec.energy}/5` : 'Sin dato'
                  }, Ánimo: ${rec.mood != null ? moodLabel(rec.mood) : 'Sin dato'}`
                : 'Sin registros'
            }`;
            return (
              <button
                key={rec.date}
                ref={(el) => {
                  dayButtonRefs.current[idx] = el;
                }}
                type="button"
                onPointerDown={handlePointerDown}
                onClick={() => handleSelectDay(rec.date, lastPointerTypeRef.current === 'touch')}
                onPointerEnter={(e) => handlePointerEnterDay(rec.date, idx, e)}
                onPointerLeave={handlePointerLeave}
                onFocus={() => {
                  setHoveredIdx(idx);
                  setMobileInspectDate(rec.date);
                }}
                onBlur={() => {
                  setHoveredIdx(null);
                  setMobileInspectDate(null);
                }}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-pressed={isSelected}
                aria-label={`${summaryTitle}. Seleccionar día.`}
                title={summaryTitle}
                className={`group relative flex min-h-[46px] min-w-0 flex-col items-center justify-center py-1.5 px-0.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:z-10 ${
                  isSelected
                    ? 'bg-[color-mix(in_srgb,var(--blue)_14%,transparent)] font-bold text-[var(--blue)] shadow-2xs'
                    : isInspected
                      ? 'bg-[var(--surface-muted)] text-[var(--text)]'
                      : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
                }`}
              >
                <span className="text-[12px] font-semibold leading-4 truncate max-w-full">
                  {isToday ? 'Hoy' : dayLabel(rec.date)}
                </span>
                <span
                  className={`text-[12px] font-mono leading-4 tabular-nums ${
                    isSelected ? 'font-bold text-[var(--blue)]' : 'text-[var(--text-faint)] group-hover:text-[var(--text-soft)]'
                  }`}
                >
                  {dayNumber(rec.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Per-metric detail view when the user switches from General to Sueño, Energía, or Ánimo.
 */
const WeeklyMetricDetailChart: React.FC<{
  records: DayWeekRecord[];
  metric: Metric;
  scaleMax: number;
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}> = ({ records, metric, scaleMax, selectedDate, today, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dayButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastPointerTypeRef = useRef<string>('mouse');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const [mobileInspectDate, setMobileInspectDate] = useState<string | null>(null);

  const getX = useCallback((idx: number) => 50 + idx * 100, []);

  const getY = useCallback(
    (val: number) => {
      if (metric === 'sleep') {
        return 125 - (Math.min(val, scaleMax) / scaleMax) * 95;
      }
      return 125 - ((val - 1) / 4) * 95;
    },
    [metric, scaleMax],
  );

  const series = useMemo(
    () =>
      records.map((rec) => ({
        date: rec.date,
        value: metric === 'energy' ? rec.energy : metric === 'sleep' ? rec.sleepHours : rec.mood,
      })),
    [records, metric],
  );

  const groups = useMemo(
    () => groupContiguousEvolutionPoints(series, getY, getX),
    [series, getY, getX],
  );

  const registered = series.some((s) => s.value != null);
  const selectedIdx = records.findIndex((r) => r.date === selectedDate);

  const activeInspectDate = hoveredIdx !== null ? records[hoveredIdx]?.date : mobileInspectDate;
  const inspectIdx = activeInspectDate ? records.findIndex((r) => r.date === activeInspectDate) : -1;
  const inspectRec = inspectIdx !== -1 ? records[inspectIdx] : null;

  const strokeColor =
    metric === 'sleep'
      ? 'var(--state-sleep)'
      : metric === 'energy'
        ? 'var(--state-energy)'
        : 'var(--state-mood)';

  const accentColor =
    metric === 'sleep'
      ? 'var(--state-sleep-accent)'
      : metric === 'energy'
        ? 'var(--state-energy-accent)'
        : 'var(--state-mood-accent)';

  const refGuideY = metric === 'sleep' ? 125 - (7 / scaleMax) * 95 : 125 - ((3 - 1) / 4) * 95;

  const handlePointerEnterDay = (_date: string, idx: number, e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    setHoveredIdx(idx);
    const rect = e.currentTarget.getBoundingClientRect();
    setPointerY(e.clientY - rect.top);
  };

  const handlePointerMoveDay = (_date: string, idx: number, e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    setHoveredIdx(idx);
    const rect = e.currentTarget.getBoundingClientRect();
    setPointerY(e.clientY - rect.top);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
  };

  const handlePointerLeave = () => {
    setHoveredIdx(null);
    setPointerY(null);
    if (lastPointerTypeRef.current !== 'touch') {
      setMobileInspectDate(null);
    }
  };

  const handleSelectDay = (date: string, isTouch = false) => {
    onSelect(date);
    if (isTouch) {
      setMobileInspectDate((prev) => (prev === date ? null : date));
    } else {
      setMobileInspectDate(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = Math.min(records.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') targetIndex = Math.max(0, index - 1);
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = records.length - 1;
    if (targetIndex != null && targetIndex !== index) {
      event.preventDefault();
      const targetDate = records[targetIndex].date;
      handleSelectDay(targetDate, false);
      dayButtonRefs.current[targetIndex]?.focus();
    }
  };

  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHoveredIdx(null);
        setMobileInspectDate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
    };
  }, []);

  useEffect(() => {
    if (!mobileInspectDate) return;
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMobileInspectDate(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [mobileInspectDate]);

  const getTooltipPlacement = (colIdx: number, pY: number | null): React.CSSProperties => {
    const colCenterPct = ((colIdx + 0.5) / 7) * 100;
    const isNearTop = pY !== null && pY < 75;

    const horizontal: React.CSSProperties =
      colIdx <= 1
        ? { left: '12px' }
        : colIdx >= 5
          ? { right: '12px' }
          : { left: `${colCenterPct}%`, transform: 'translateX(-50%)' };

    const vertical: React.CSSProperties = isNearTop
      ? { bottom: '10px' }
      : { top: '8px' };

    return { ...horizontal, ...vertical };
  };

  return (
    <div className="mt-2" aria-label={`Últimos siete días de ${labels[metric]}`}>
      {/* Detail Header Info Bar */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs text-[var(--text-soft)]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="font-semibold text-[var(--text)]">{labels[metric]} · detalle semanal</span>
          <span className="text-[11px] tabular-nums text-[var(--text-faint)]">
            ({metric === 'sleep' ? `0–${scaleMax} h` : 'escala 1–5'})
          </span>
        </div>
      </div>

      {/* Detail Chart Container */}
      <div
        ref={containerRef}
        className="overflow-visible rounded-xl border border-[var(--border)]/85 bg-[var(--card-subtle)]/75"
        onPointerLeave={handlePointerLeave}
      >
        <div
          className="relative overflow-visible"
          onPointerLeave={handlePointerLeave}
        >
          {registered ? (
            <svg
              className="h-[150px] w-full"
              viewBox="0 0 700 150"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Gráfico de detalle de ${labels[metric]}`}
            >
              <defs>
                <linearGradient id={`detail-grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metric === 'sleep' ? '#A69AFF' : metric === 'energy' ? '#F2B454' : '#53CCAD'} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={metric === 'sleep' ? '#A69AFF' : metric === 'energy' ? '#F2B454' : '#53CCAD'} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Day column grid lines */}
              {records.map((_, idx) => (
                <line
                  key={`detail-col-${idx}`}
                  x1={getX(idx)}
                  y1="6"
                  x2={getX(idx)}
                  y2="144"
                  stroke="var(--border)"
                  strokeOpacity="0.22"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Selected day column pillar */}
              {selectedIdx !== -1 && (
                <rect
                  x={getX(selectedIdx) - 38}
                  y="6"
                  width="76"
                  height="138"
                  rx="8"
                  fill="var(--blue)"
                  fillOpacity="0.06"
                  stroke="var(--blue)"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Hover column pillar */}
              {hoveredIdx !== null && hoveredIdx !== selectedIdx && (
                <rect
                  x={getX(hoveredIdx) - 38}
                  y="6"
                  width="76"
                  height="138"
                  rx="8"
                  fill="var(--text)"
                  fillOpacity="0.03"
                  stroke="var(--border)"
                  strokeOpacity="0.30"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Baseline */}
              <line x1="20" y1="125" x2="680" y2="125" stroke="var(--border)" strokeOpacity="0.30" strokeWidth="1" vectorEffect="non-scaling-stroke" />

              {/* Reference guide line (subtle without competing text) */}
              <line
                x1="20"
                y1={refGuideY}
                x2="680"
                y2={refGuideY}
                stroke={strokeColor}
                strokeDasharray="3 3"
                strokeOpacity="0.20"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />

              {/* Area fills */}
              {groups.map((group, gIdx) => (
                <path
                  key={`detail-area-${gIdx}`}
                  d={buildAreaPath(group, 125)}
                  fill={`url(#detail-grad-${metric})`}
                />
              ))}

              {/* Curves */}
              {groups.map((group, gIdx) => (
                <path
                  key={`detail-curve-${gIdx}`}
                  d={buildSmoothPath(group)}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Unrecorded baseline ticks */}
              {series.map((item, idx) =>
                item.value == null ? (
                  <line
                    key={`detail-empty-${item.date}`}
                    x1={getX(idx) - 8}
                    y1="125"
                    x2={getX(idx) + 8}
                    y2="125"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.45"
                  />
                ) : null,
              )}

              {/* Points */}
              {groups.flatMap((group) =>
                group.map((pt) => {
                  const isSelected = pt.date === selectedDate;
                  const isHovered = hoveredIdx !== null && records[hoveredIdx]?.date === pt.date;
                  return (
                    <circle
                      key={`detail-pt-${pt.date}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? '6' : isSelected ? '5' : '3.5'}
                      fill={accentColor}
                      stroke="var(--card)"
                      strokeWidth={isSelected || isHovered ? '2.5' : '1.5'}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }),
              )}

              {/* Interactive Hit Zones */}
              {records.map((rec, idx) => (
                <rect
                  key={`detail-hit-${rec.date}`}
                  data-hit-date={rec.date}
                  x={idx * 100}
                  y="0"
                  width="100"
                  height="150"
                  fill="transparent"
                  className="cursor-pointer"
                  onPointerDown={handlePointerDown}
                  onPointerEnter={(e) => handlePointerEnterDay(rec.date, idx, e)}
                  onPointerMove={(e) => handlePointerMoveDay(rec.date, idx, e)}
                  onClick={() => handleSelectDay(rec.date, lastPointerTypeRef.current === 'touch')}
                >
                  <title>{`${formatLongDate(rec.date, rec.date === today)}: clic para consultar`}</title>
                </rect>
              ))}
            </svg>
          ) : (
            <div className="flex h-[150px] items-center justify-center px-4 text-center text-xs text-[var(--text-soft)]">
              Sin datos de {labels[metric].toLocaleLowerCase('es-UY')} en los últimos 7 días.
            </div>
          )}

          {/* Contextual Detail Floating Tooltip for Detail view */}
          {inspectRec && (hoveredIdx !== null || mobileInspectDate === inspectRec.date) && (
            <div
              className="pointer-events-none absolute z-30 w-72 max-w-[calc(100%-1.25rem)] rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-xl backdrop-blur-md transition-all duration-150 sm:max-w-none dark:bg-[var(--card-subtle)]/95"
              style={getTooltipPlacement(inspectIdx, pointerY)}
              role="tooltip"
            >
              <div className="mb-2 flex items-center justify-between border-b border-[var(--border)]/60 pb-1.5 text-xs">
                <span className="font-bold text-[var(--text)]">
                  {formatLongDate(inspectRec.date, inspectRec.date === today)}
                </span>
                {inspectRec.date === selectedDate ? (
                  <span className="rounded bg-[var(--blue-soft)]/70 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--blue)]">
                    Seleccionado
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-faint)]">Clic para seleccionar</span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                {/* Main focused metric */}
                <div className="rounded-lg bg-[var(--surface-muted)]/60 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
                      <span className="font-semibold text-[var(--text)]">{labels[metric]}:</span>
                    </div>
                    <span className="font-bold tabular-nums" style={{ color: strokeColor }}>
                      {metric === 'sleep'
                        ? inspectRec.sleepHours != null
                          ? `${inspectRec.sleepHours.toLocaleString('es-UY')} h — ${inspectRec.sleepQuality != null ? sleepQualityDescriptor(inspectRec.sleepQuality) : 'calidad sin calificar'}`
                          : 'Sin registro'
                        : metric === 'energy'
                          ? inspectRec.energy != null
                            ? `${inspectRec.energy}/5 — ${energyLabel(inspectRec.energy)}`
                            : 'Sin registro'
                          : inspectRec.mood != null
                            ? `${inspectRec.mood}/5 — ${moodLabel(inspectRec.mood)}`
                            : 'Sin registro'}
                    </span>
                  </div>
                </div>

                {/* Secondary companion metrics */}
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-[var(--text-soft)]">
                  {metric !== 'sleep' && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--state-sleep-accent)' }} />
                      <span>Sueño: </span>
                      <strong className="tabular-nums text-[var(--text)]">
                        {inspectRec.sleepHours != null ? `${inspectRec.sleepHours.toLocaleString('es-UY')}h` : '—'}
                      </strong>
                    </div>
                  )}
                  {metric !== 'energy' && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--state-energy-accent)' }} />
                      <span>Energía: </span>
                      <strong className="tabular-nums text-[var(--text)]">
                        {inspectRec.energy != null ? `${inspectRec.energy}/5` : '—'}
                      </strong>
                    </div>
                  )}
                  {metric !== 'mood' && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--state-mood-accent)' }} />
                      <span>Ánimo: </span>
                      <strong className="tabular-nums text-[var(--text)]">
                        {inspectRec.mood != null ? moodLabel(inspectRec.mood, true) : '—'}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tactile 7-Day Selector Bar (Clean: without redundant micro-dots) */}
        <div
          className="grid grid-cols-7 border-t border-[var(--border)]/70 bg-[var(--card)]/40"
          role="group"
          aria-label={`Seleccionar día para ver detalle de ${labels[metric]}`}
        >
          {records.map((rec, idx) => {
            const isToday = rec.date === today;
            const isSelected = rec.date === selectedDate;
            const isInspected = activeInspectDate === rec.date;
            const val = metric === 'sleep' ? rec.sleepHours : metric === 'energy' ? rec.energy : rec.mood;
            const summaryTitle = `${formatLongDate(rec.date, isToday)}: ${labels[metric]} ${
              val == null ? 'Sin dato' : displayValue(val, metric)
            }`;
            return (
              <button
                key={rec.date}
                ref={(el) => {
                  dayButtonRefs.current[idx] = el;
                }}
                type="button"
                onPointerDown={handlePointerDown}
                onClick={() => handleSelectDay(rec.date, lastPointerTypeRef.current === 'touch')}
                onPointerEnter={(e) => handlePointerEnterDay(rec.date, idx, e)}
                onPointerLeave={handlePointerLeave}
                onFocus={() => {
                  setHoveredIdx(idx);
                  setMobileInspectDate(rec.date);
                }}
                onBlur={() => {
                  setHoveredIdx(null);
                  setMobileInspectDate(null);
                }}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-pressed={isSelected}
                aria-label={`${summaryTitle}. Seleccionar día.`}
                title={summaryTitle}
                className={`group relative flex min-h-[46px] min-w-0 flex-col items-center justify-center py-2 text-center transition-colors ${
                  isSelected
                    ? 'bg-[color-mix(in_srgb,var(--blue)_12%,transparent)] font-bold text-[var(--blue)] shadow-2xs'
                    : isInspected
                      ? 'bg-[var(--surface-muted)] text-[var(--text)]'
                      : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
                }`}
              >
                <span className="text-[12px] font-semibold leading-4">{isToday ? 'Hoy' : dayLabel(rec.date)}</span>
                <span
                  className={`text-[12px] tabular-nums leading-4 ${
                    isSelected ? 'font-bold text-[var(--blue)]' : 'text-[var(--text-faint)] group-hover:text-[var(--text-soft)]'
                  }`}
                >
                  {dayNumber(rec.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface MetricScaleProps {
  label: string;
  sublabel?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  scaleLabels?: readonly string[];
  shortScaleLabels?: readonly string[];
  variant?: 'energy' | 'mood' | 'sleep';
  dotColor?: string;
}

const MetricScale: React.FC<MetricScaleProps> = ({
  label,
  sublabel,
  value,
  onChange,
  scaleLabels: customLabels = MOOD_SCALE_LABELS,
  shortScaleLabels: customShortLabels = MOOD_SHORT_LABELS,
  variant = 'energy',
  dotColor,
}) => {
  const getSelectedStyle = () => {
    switch (variant) {
      case 'energy':
        return 'border-[var(--state-energy-border-active)] bg-[var(--state-energy-soft)] font-semibold text-[var(--state-energy)] ring-1 ring-[var(--state-energy-border-active)]/30';
      case 'mood':
        return 'border-[var(--state-mood-border-active)] bg-[var(--state-mood-soft)] font-semibold text-[var(--state-mood)] ring-1 ring-[var(--state-mood-border-active)]/30';
      case 'sleep':
        return 'border-[var(--state-sleep-border-active)] bg-[var(--state-sleep-soft)] font-semibold text-[var(--state-sleep)] ring-1 ring-[var(--state-sleep-border-active)]/30';
      default:
        return 'border-[var(--blue)] bg-[var(--blue)] text-white';
    }
  };

  return (
    <fieldset className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {dotColor && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
              aria-hidden="true"
            />
          )}
          <legend className="text-[13px] font-semibold text-[var(--text)]">{label}</legend>
        </div>
        {sublabel && <span className="text-[11px] text-[var(--text-faint)]">{sublabel}</span>}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((option) => {
          const isSelected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(isSelected ? null : option)}
              aria-label={`${label} ${option} de 5: ${customLabels[option - 1]}`}
              aria-pressed={isSelected}
              className={`min-h-10 rounded-lg border text-sm transition-colors ${
                isSelected
                  ? getSelectedStyle()
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
              }`}
            >
              <span className="block font-semibold">{option}</span>
              <span className="block text-[10px] font-normal opacity-85">{customShortLabels[option - 1]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};
