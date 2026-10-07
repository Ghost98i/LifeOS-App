import React, { useEffect, useState } from 'react';
import type { DailyContextEntry, LifeOSState } from '../types';
import {
  buildContextInsights,
  contextForDate,
  RECOMMENDED_MIN_SLEEP_HOURS,
  sleepSummary,
  upsertDailyContext,
} from '../lib/contextInsights';
import { todayISO } from '../lib/storage';

import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';
import { ContextWave } from './visual';

interface PersonalContextCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-UY', { weekday: 'short' }).replace('.', '');
}

export const PersonalContextCard: React.FC<PersonalContextCardProps> = ({ state, onUpdateState }) => {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [entryDate, setEntryDate] = useState(todayISO());
  const current = contextForDate(state, entryDate);
  const [sleep, setSleep] = useState(current.sleepHours == null ? '' : String(current.sleepHours));
  const [energy, setEnergy] = useState<DailyContextEntry['energy']>(current.energy);
  const [connection, setConnection] = useState<DailyContextEntry['connection']>(current.connection);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const insights = buildContextInsights(state);
  const summary = sleepSummary(state);

  // Check if today's context is already filled
  const isRecorded = current.energy != null || current.sleepHours != null;

  useEffect(() => {
    setSleep(current.sleepHours == null ? '' : String(current.sleepHours));
    setEnergy(current.energy);
    setConnection(current.connection);
  }, [entryDate, current.sleepHours, current.energy, current.connection]);

  const saveWithData = (nextSleep: string, nextEnergy: DailyContextEntry['energy'], nextConn: DailyContextEntry['connection']) => {
    const parsedSleep = nextSleep === '' ? null : Number(nextSleep);
    if (parsedSleep != null && (!Number.isFinite(parsedSleep) || parsedSleep < 0 || parsedSleep > 16)) return;
    playSound('click');
    onUpdateState((draft) => upsertDailyContext(draft, {
      ...contextForDate(draft, entryDate),
      sleepHours: parsedSleep,
      energy: nextEnergy,
      connection: nextConn,
    }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const handleSelectEnergy = (val: 1 | 2 | 3 | 4 | 5) => {
    setEnergy(val);
    saveWithData(sleep, val, connection);
  };

  const save = () => {
    saveWithData(sleep, energy, connection);
  };

  // If recorded and not editing, render ultra-compact mini-surface row
  if (isRecorded && !isEditing) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[var(--card)] to-[var(--card-subtle)] p-2.5 sm:px-3.5 shadow-xs transition-all space-y-2">
        <ContextWave expanded={showAnalysis} />
        <div className="relative flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 text-xs shadow-2xs">
              ⚡
            </span>
            <div className="flex items-center gap-1.5 flex-wrap font-semibold text-[11px] text-[var(--text)]">
              {energy != null && <span>Energía {energy}</span>}
              {energy != null && current.sleepHours != null && <span className="text-[var(--text-faint)]">·</span>}
              {current.sleepHours != null && <span className="font-mono">{current.sleepHours} h sueño</span>}
              {connection && (
                <>
                  {(energy != null || current.sleepHours != null) && <span className="text-[var(--text-faint)]">·</span>}
                  <span className="text-[var(--text-soft)]">{connection === 'solo' ? 'A solas' : connection === 'mensaje' ? 'Mensajes' : 'En persona'}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 py-0.5 cursor-pointer"
            >
              {showAnalysis ? 'Ocultar' : 'Tendencia'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Editar
            </button>
          </div>
        </div>

        {summary.shouldAlert && (
          <div className="banner-warning rounded-xl p-2 text-xs flex items-center justify-between gap-2 shadow-2xs font-bold text-[var(--warning-text-emphasis)]">
            <span className="text-[10px]">⚠️ {summary.currentShortStreak} noches consecutivas con descanso corto (&lt; 7h)</span>
          </div>
        )}

        {showAnalysis && (
          <div className="pt-2 border-t border-[var(--border)]/60 text-xs animate-in fade-in duration-150 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Últimos 7 días</span>
              <span className="text-[10px] font-mono font-bold text-[var(--text-soft)]">Promedio {summary.averageHours != null ? `${summary.averageHours.toFixed(1)}h` : '—'}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {summary.recentDays.map((day) => (
                <div key={day.date} className="p-1 rounded-lg bg-[var(--surface-muted)] text-center">
                  <span className="text-[9px] uppercase font-bold text-[var(--text-faint)] block">{dayLabel(day.date)}</span>
                  <span className="text-[10px] font-mono font-bold text-[var(--text)] block mt-0.5">{day.hours != null ? `${day.hours}h` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden signature-panel p-3.5 sm:p-4 space-y-3">
      <ContextWave expanded={true} />
      {/* Header / Summary row */}
      <div className="relative flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
            <AppIcon name="flame" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-faint)]">
                Contexto
              </span>
              <span className="signature-pill signature-pill-warning">
                <span className="signature-pulse-dot signature-pulse-dot-warning" />
                <span>Energía & Ritmo</span>
              </span>
              {saved && <span className="text-[10px] font-bold text-emerald-500 animate-in fade-in">✓ Guardado</span>}
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
              ¿Cómo venís hoy?
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Listo
            </button>
          )}
          <input
            type="date"
            max={todayISO()}
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value || todayISO())}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-bold outline-none text-[var(--text)] cursor-pointer"
            title="Seleccionar fecha para registrar contexto"
          />
        </div>
      </div>

      {summary.shouldAlert && (
        <div className="banner-warning rounded-xl p-2 sm:p-2.5 text-xs flex items-center justify-between gap-2 shadow-2xs">
          <div className="min-w-0">
            <strong className="block text-[11px] font-bold leading-tight text-[var(--warning-text-emphasis)]">⚠️ {summary.currentShortStreak} noches con poco descanso (&lt; 7h)</strong>
            <span className="text-[10px] text-[var(--warning-text)] block leading-tight mt-0.5 font-medium">Priorizá recuperar horas hoy para mantener tu energía.</span>
          </div>
        </div>
      )}

      {/* Streamlined quick check-in inputs when not recorded or editing */}
        <div className="space-y-2.5 pt-1 border-t border-[var(--border)]/60">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Nivel de Energía</span>
              <span className="text-[11px] font-mono font-bold text-[var(--text-soft)]">{energy ? `${energy}/5` : 'Seleccionar'}</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {([1, 2, 3, 4, 5] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => handleSelectEnergy(value)}
                  className={`flex h-7 items-center justify-center rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    energy === value
                      ? 'border-amber-500 bg-amber-500 text-white shadow-2xs font-extrabold'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Horas de Sueño
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="16"
                  step="0.25"
                  inputMode="decimal"
                  value={sleep}
                  onChange={(event) => setSleep(event.target.value)}
                  onBlur={save}
                  placeholder="7.5"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-mono font-bold text-[var(--text)] outline-none focus:border-[var(--blue)]"
                />
                <span className="text-xs font-bold text-[var(--text-soft)]">h</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Contacto Social
              </span>
              <select
                value={connection || ''}
                onChange={(event) => {
                  const val = (event.target.value || null) as DailyContextEntry['connection'];
                  setConnection(val);
                  saveWithData(sleep, energy, val);
                }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)] outline-none cursor-pointer"
              >
                <option value="">Sin registrar</option>
                <option value="solo">Día a solas</option>
                <option value="mensaje">Mensaje / Llamada</option>
                <option value="encuentro">Encuentro en persona</option>
              </select>
            </div>
          </div>
        </div>

      {/* Collapsible 7-day Analysis */}
      {showAnalysis && (
        <div className="border-t border-[var(--border)] pt-2.5 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-soft)]">
            <span>{summary.averageHours == null ? 'Historial de descanso' : `${summary.averageHours.toFixed(1)}h promedio (${summary.recordedNights}/7d)`}</span>
          </div>

          <div className="grid grid-cols-7 gap-1" aria-label="Historial de sueño">
            {summary.recentDays.map((day) => (
              <div key={day.date} className="text-center" title={`${day.date}: ${day.hours == null ? 'sin registro' : `${day.hours} h`}`}>
                <div className="flex h-8 items-end justify-center rounded-lg bg-[var(--surface-muted)] p-1">
                  <span
                    className={`block w-full rounded-xs transition-all ${
                      day.hours == null
                        ? 'h-1 bg-[var(--border)]'
                        : day.hours < RECOMMENDED_MIN_SLEEP_HOURS
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={day.hours == null ? undefined : { height: `${Math.max(16, Math.min(100, (day.hours / 9) * 100))}%` }}
                  />
                </div>
                <span className="mt-0.5 block text-[8px] font-bold uppercase text-[var(--text-faint)]">{dayLabel(day.date)}</span>
              </div>
            ))}
          </div>

          {insights.length > 0 && (
            <div className="space-y-1 pt-1">
              {insights.map((insight) => (
                <p key={insight.id} className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-medium text-[var(--text-soft)]">
                  💡 {insight.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
