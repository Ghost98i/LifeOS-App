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

  const save = () => {
    const parsedSleep = sleep === '' ? null : Number(sleep);
    if (parsedSleep != null && (!Number.isFinite(parsedSleep) || parsedSleep < 0 || parsedSleep > 16)) return;
    onUpdateState((draft) => upsertDailyContext(draft, {
      ...contextForDate(draft, entryDate),
      sleepHours: parsedSleep,
      energy,
      connection,
    }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--text)]">Tu contexto</h2>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">Sueño, energía y vínculos en menos de un minuto.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-bold text-emerald-500">✓ Guardado</span>}
          <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Día</span>
            <input type="date" max={todayISO()} value={entryDate} onChange={(event) => setEntryDate(event.target.value || todayISO())} className="bg-transparent text-xs font-bold outline-hidden" />
          </label>
        </div>
      </div>

      {summary.shouldAlert && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <strong className="block">⚠️ {summary.currentShortStreak} noches seguidas por debajo de 7 h</strong>
          <span className="mt-0.5 block">Tu descanso viene corto. Priorizá recuperar sueño; si se vuelve habitual o te afecta durante el día, conviene consultarlo.</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Horas dormidas</span>
          <div className="flex items-center gap-2"><input type="number" min="0" max="16" step="0.25" inputMode="decimal" value={sleep} onChange={(event) => setSleep(event.target.value)} placeholder="7.5" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm font-bold" /><span className="text-xs text-[var(--text-soft)]">h</span></div>
        </label>
        <div>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Energía</span>
          <div className="flex gap-1">{([1, 2, 3, 4, 5] as const).map((value) => <button type="button" key={value} onClick={() => setEnergy(value)} className={`flex h-10 flex-1 items-center justify-center rounded-xl border text-xs font-black ${energy === value ? 'border-amber-500 bg-amber-500/15 text-amber-600' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>{value}</button>)}</div>
        </div>
        <label>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Contacto social</span>
          <select value={connection || ''} onChange={(event) => setConnection((event.target.value || null) as DailyContextEntry['connection'])} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm">
            <option value="">Sin registrar</option><option value="solo">Día más bien solo</option><option value="mensaje">Mensaje o llamada</option><option value="encuentro">Encuentro en persona</option>
          </select>
          <span className="mt-1 block text-[10px] text-[var(--text-faint)]">Para ver si hablar o estar con alguien influye en tu energía.</span>
        </label>
      </div>
      <button type="button" onClick={save} className="mt-4 w-full rounded-xl border border-[var(--blue)] bg-[var(--blue-soft)] py-2.5 text-xs font-extrabold text-[var(--blue)]">Guardar contexto</button>

      <button
        type="button"
        onClick={() => setShowAnalysis((value) => !value)}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Sueño · últimos 7 días</span>
          <strong className="text-sm text-[var(--text)]">{summary.averageHours == null ? 'Sin promedio todavía' : `${summary.averageHours.toFixed(1)} h promedio`} · {summary.recordedNights}/7 registrados</strong>
        </span>
        <span className="text-xs font-bold text-[var(--blue)]">{showAnalysis ? 'Ocultar ▴' : 'Ver análisis ▾'}</span>
      </button>

      {showAnalysis && <div className="mt-3 border-t border-[var(--border)] pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Promedio · últimos 7 días</span>
            <strong className="text-xl font-mono text-[var(--text)]">{summary.averageHours == null ? '—' : `${summary.averageHours.toFixed(1)} h`}</strong>
            <span className="ml-2 text-[10px] text-[var(--text-faint)]">{summary.recordedNights}/7 registrados</span>
          </div>
          <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${summary.shortNights ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{summary.shortNights} noche(s) &lt; 7 h</span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Historial de sueño de los últimos siete días">
          {summary.recentDays.map((day) => (
            <div key={day.date} className="text-center" title={`${day.date}: ${day.hours == null ? 'sin registro' : `${day.hours} h`}`}>
              <div className="flex h-10 items-end rounded-lg bg-[var(--bg)] p-1">
                <span className={`block w-full rounded-sm ${day.hours == null ? 'h-1 bg-[var(--border)]' : day.hours < RECOMMENDED_MIN_SLEEP_HOURS ? 'bg-amber-500' : 'bg-emerald-500'}`} style={day.hours == null ? undefined : { height: `${Math.max(16, Math.min(100, day.hours / 9 * 100))}%` }} />
              </div>
              <span className="mt-1 block text-[9px] font-bold uppercase text-[var(--text-faint)]">{dayLabel(day.date)}</span>
            </div>
          ))}
        </div>
        {summary.recordedNights < 3 && <p className="mt-2 text-[10px] text-[var(--text-faint)]">Con tres noches seguidas LifeOS ya puede avisarte si estás acumulando poco sueño. Referencia general para adultos: 7 h o más.</p>}
      </div>}

      {showAnalysis && insights.length > 0 && <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">{insights.map((insight) => <p key={insight.id} className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-soft)]">↗ {insight.text}</p>)}<p className="text-[10px] text-[var(--text-faint)]">Son coincidencias personales, no pruebas de causa.</p></div>}
    </section>
  );
};
