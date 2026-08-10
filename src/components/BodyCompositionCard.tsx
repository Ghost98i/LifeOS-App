import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { bodyCompositionEstimate } from '../lib/bodyComposition';
import { fmtDate, todayISO } from '../lib/storage';

interface BodyCompositionCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const BodyCompositionCard: React.FC<BodyCompositionCardProps> = ({ state, onUpdateState }) => {
  const [height, setHeight] = useState(String(state.profile.height || ''));
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saved, setSaved] = useState(false);
  const estimate = bodyCompositionEstimate(state);
  const latestWeight = [...state.gym.weight].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const latestWaist = [...state.gym.measurements].sort((a, b) => b.date.localeCompare(a.date))[0] || null;

  useEffect(() => setHeight(String(state.profile.height || '')), [state.profile.height]);

  const saveHeight = () => {
    const value = Number(height);
    if (!Number.isFinite(value) || value < 100 || value > 250) return;
    onUpdateState((draft) => { draft.profile.height = value; });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const setFormula = (value: 'male' | 'female') => {
    onUpdateState((draft) => { draft.profile.bodyCompositionSex = value; });
  };

  const saveSnapshot = (event: React.FormEvent) => {
    event.preventDefault();
    const kg = Number(weight);
    const cm = Number(waist);
    if (!Number.isFinite(kg) || kg < 30 || kg > 400 || !Number.isFinite(cm) || cm < 40 || cm > 250) return;
    onUpdateState((draft) => {
      draft.gym.weight = draft.gym.weight.filter((item) => item.date !== date);
      draft.gym.measurements = draft.gym.measurements.filter((item) => item.date !== date);
      draft.gym.weight.push({ date, kg });
      draft.gym.measurements.push({ date, waist: cm });
    });
    setWeight('');
    setWaist('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const missing = [
    !state.profile.bodyCompositionSex && 'elegir fórmula',
    !latestWeight && 'registrar peso',
    !latestWaist && 'registrar cintura',
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--text)]">Composición corporal estimada</h2>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">RFM estima grasa con altura y cintura; después LifeOS calcula masa magra y FFMI.</p>
        </div>
        {saved && <span className="text-xs font-bold text-emerald-500">✓ Guardado</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[160px_1fr_auto] lg:items-end">
        <label>
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Altura</span>
          <div className="flex gap-2">
            <input type="number" min="100" max="250" step="0.1" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-mono" />
            <span className="self-center text-xs text-[var(--text-soft)]">cm</span>
          </div>
        </label>
        <div>
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Fórmula corporal</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFormula('male')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${state.profile.bodyCompositionSex === 'male' ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>Masculina</button>
            <button type="button" onClick={() => setFormula('female')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${state.profile.bodyCompositionSex === 'female' ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>Femenina</button>
          </div>
        </div>
        <button type="button" onClick={saveHeight} className="rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--bg-elevated)]">Guardar altura</button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-faint)]">La ecuación RFM usa una constante corporal masculina o femenina. Esta elección solo se usa para el cálculo, no como identidad.</p>

      <form onSubmit={saveSnapshot} className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end">
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Fecha</span>
          <input type="date" max={todayISO()} value={date} onChange={(event) => setDate(event.target.value || todayISO())} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Peso · kg</span>
          <input type="number" min="30" max="400" step="0.1" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder={latestWeight ? String(latestWeight.kg) : '80'} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-mono" />
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Cintura · cm</span>
          <input type="number" min="40" max="250" step="0.1" inputMode="decimal" value={waist} onChange={(event) => setWaist(event.target.value)} placeholder={latestWaist ? String(latestWaist.waist) : '85'} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-mono" />
        </label>
        <button type="submit" className="col-span-2 rounded-xl bg-[var(--blue)] px-4 py-2.5 text-xs font-extrabold text-white sm:col-span-1">Actualizar</button>
      </form>
      <p className="mt-2 text-[10px] text-[var(--text-faint)]">Para comparar tendencias, medí la cintura relajada, sin apretar la cinta y siempre en el mismo punto.</p>

      {estimate ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-[var(--bg)] p-3"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Grasa · RFM</span><strong className="mt-1 block text-xl font-mono text-[var(--text)]">{estimate.rfmPercent.toFixed(1)}%</strong></div>
            <div className="rounded-xl bg-[var(--bg)] p-3"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Masa grasa</span><strong className="mt-1 block text-xl font-mono text-[var(--text)]">{estimate.fatMassKg.toFixed(1)} kg</strong></div>
            <div className="rounded-xl bg-[var(--bg)] p-3"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">Masa magra</span><strong className="mt-1 block text-xl font-mono text-[var(--text)]">{estimate.leanMassKg.toFixed(1)} kg</strong></div>
            <div className="rounded-xl bg-[var(--bg)] p-3"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">FFMI</span><strong className="mt-1 block text-xl font-mono text-[var(--text)]">{estimate.ffmi.toFixed(1)}</strong></div>
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-faint)]">Calculado con peso del {fmtDate(estimate.weight.date)} y cintura del {fmtDate(estimate.waist.date)}. Es una estimación para seguir tendencias, no un diagnóstico ni una medición directa como DXA.</p>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--bg)] p-3 text-xs font-semibold text-[var(--text-soft)]">{missing.length ? `Para calcularlo falta ${missing.join(', ')}.` : 'Revisá que la altura, el peso y la cintura sean válidos.'}</p>
      )}
    </section>
  );
};
