import React, { useEffect, useState } from 'react';
import type { DailyContextEntry, LifeOSState } from '../types';
import { buildContextInsights, todayContext, upsertDailyContext } from '../lib/contextInsights';

interface PersonalContextCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const PersonalContextCard: React.FC<PersonalContextCardProps> = ({ state, onUpdateState }) => {
  const current = todayContext(state);
  const [sleep, setSleep] = useState(current.sleepHours == null ? '' : String(current.sleepHours));
  const [energy, setEnergy] = useState<DailyContextEntry['energy']>(current.energy);
  const [connection, setConnection] = useState<DailyContextEntry['connection']>(current.connection);
  const [saved, setSaved] = useState(false);
  const insights = buildContextInsights(state);

  useEffect(() => {
    const next = todayContext(state);
    setSleep(next.sleepHours == null ? '' : String(next.sleepHours));
    setEnergy(next.energy);
    setConnection(next.connection);
  }, [current.date]);

  const save = () => {
    onUpdateState((draft) => upsertDailyContext(draft, {
      ...todayContext(draft),
      sleepHours: sleep === '' ? null : Math.max(0, Math.min(16, Number(sleep))),
      energy,
      connection,
    }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--text)]">Tu contexto de hoy</h2>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">Tres datos para entender qué te ayuda de verdad.</p>
        </div>
        {saved && <span className="text-xs font-bold text-emerald-500">✓ Guardado</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Sueño</span>
          <div className="flex items-center gap-2"><input type="number" min="0" max="16" step="0.5" value={sleep} onChange={(event) => setSleep(event.target.value)} placeholder="7.5" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm font-bold" /><span className="text-xs text-[var(--text-soft)]">h</span></div>
        </label>
        <div>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Energía</span>
          <div className="flex gap-1">{([1, 2, 3, 4, 5] as const).map((value) => <button key={value} onClick={() => setEnergy(value)} className={`flex h-10 flex-1 items-center justify-center rounded-xl border text-xs font-black ${energy === value ? 'border-amber-500 bg-amber-500/15 text-amber-600' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>{value}</button>)}</div>
        </div>
        <label>
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Conexión útil</span>
          <select value={connection || ''} onChange={(event) => setConnection((event.target.value || null) as DailyContextEntry['connection'])} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm">
            <option value="">Sin registrar</option><option value="solo">Tiempo solo</option><option value="mensaje">Mensaje / llamada</option><option value="encuentro">Encuentro</option>
          </select>
        </label>
      </div>
      <button onClick={save} className="mt-4 w-full rounded-xl border border-[var(--blue)] bg-[var(--blue-soft)] py-2.5 text-xs font-extrabold text-[var(--blue)]">Guardar contexto</button>

      {insights.length > 0 && <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">{insights.map((insight) => <p key={insight.id} className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-soft)]">↗ {insight.text}</p>)}<p className="text-[10px] text-[var(--text-faint)]">Son coincidencias personales, no pruebas de causa.</p></div>}
    </section>
  );
};
