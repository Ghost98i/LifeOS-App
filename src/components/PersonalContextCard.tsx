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
  const insights = buildContextInsights(state);
  const summary = sleepSummary(state);

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

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <AppIcon name="flame" className="h-4 w-4" />
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
              Contexto
            </span>
            <h3 className="text-sm font-bold text-[var(--text)]">Energía y Descanso</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] font-bold text-emerald-500">✓ Guardado</span>}
          <input
            type="date"
            max={todayISO()}
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value || todayISO())}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-bold outline-none text-[var(--text)] cursor-pointer"
          />
        </div>
      </div>

      {summary.shouldAlert && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          <strong className="block text-xs">⚠️ {summary.currentShortStreak} noches con poco descanso (&lt; 7h)</strong>
          <span className="text-[11px] opacity-90 block mt-0.5">Priorizá recuperar sueño hoy para mantener tu claridad mental.</span>
        </div>
      )}

      {/* Energy Rating Quick Buttons */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Nivel de Energía</span>
          <span className="text-[11px] font-mono font-bold text-[var(--text-soft)]">{energy ? `${energy}/5` : 'Sin registrar'}</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {([1, 2, 3, 4, 5] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => handleSelectEnergy(value)}
              className={`flex h-8 items-center justify-center rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                energy === value
                  ? 'border-amber-500 bg-amber-500 text-white shadow-2xs font-extrabold'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Sleep hours & Connection */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-mono font-bold text-[var(--text)] outline-none focus:border-[var(--blue)]"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text)] outline-none cursor-pointer"
          >
            <option value="">Sin registrar</option>
            <option value="solo">Día a solas</option>
            <option value="mensaje">Mensaje / Llamada</option>
            <option value="encuentro">Encuentro en persona</option>
          </select>
        </div>
      </div>

      {/* Collapsible 7-day Analysis */}
      <button
        type="button"
        onClick={() => setShowAnalysis((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-left cursor-pointer hover:bg-[var(--border)]/30 transition-colors"
      >
        <span className="text-xs font-semibold text-[var(--text)]">
          {summary.averageHours == null ? 'Sueño últimos 7 días' : `${summary.averageHours.toFixed(1)} h promedio · ${summary.recordedNights}/7 días`}
        </span>
        <span className="text-[11px] font-bold text-[var(--blue)] flex items-center gap-1">
          {showAnalysis ? 'Ocultar' : 'Ver'}
          <AppIcon name={showAnalysis ? 'chevronUp' : 'chevronDown'} className="h-3.5 w-3.5" />
        </span>
      </button>

      {showAnalysis && (
        <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-3">
          <div className="grid grid-cols-7 gap-1" aria-label="Historial de sueño">
            {summary.recentDays.map((day) => (
              <div key={day.date} className="text-center" title={`${day.date}: ${day.hours == null ? 'sin registro' : `${day.hours} h`}`}>
                <div className="flex h-10 items-end justify-center rounded-lg bg-[var(--bg-elevated)] p-1">
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
                <span className="mt-1 block text-[8px] font-bold uppercase text-[var(--text-faint)]">{dayLabel(day.date)}</span>
              </div>
            ))}
          </div>

          {insights.length > 0 && (
            <div className="space-y-1">
              {insights.map((insight) => (
                <p key={insight.id} className="rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-soft)]">
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
