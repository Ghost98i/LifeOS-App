import React, { useState } from 'react';
import type { LifeOSState } from '../types';
import { bodyCompositionEstimate } from '../lib/bodyComposition';
import { fmtDate, todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount, PrivacyInput } from './PrivacyAmount';

interface BodyCompositionCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
}

export const BodyCompositionCard: React.FC<BodyCompositionCardProps> = ({ state, onUpdateState }) => {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const estimate = bodyCompositionEstimate(state);
  const latestWeight = [...state.gym.weight].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const latestWaist = [...state.gym.measurements].sort((a, b) => b.date.localeCompare(a.date))[0] || null;

  const saveSnapshot = (event: React.FormEvent) => {
    event.preventDefault();
    const kg = Number(weight);
    const cm = Number(waist);
    if (!Number.isFinite(kg) || kg < 30 || kg > 400 || !Number.isFinite(cm) || cm < 40 || cm > 250) return;
    const result = onUpdateState((draft) => {
      draft.gym.weight = draft.gym.weight.filter((item) => item.date !== date);
      draft.gym.measurements = draft.gym.measurements.filter((item) => item.date !== date);
      draft.gym.weight.push({ date, kg });
      draft.gym.measurements.push({ date, waist: cm });
    });
    if (result === false) { setSaveError(true); return; }
    setSaveError(false);
    setWeight('');
    setWaist('');
    setSaved(true);
    setShowForm(false);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const missing = [
    !state.profile.bodyCompositionSex && 'sexo corporal en Configuración',
    (!state.profile.height || state.profile.height < 100) && 'altura',
    !latestWeight && 'peso',
    !latestWaist && 'cintura',
  ].filter(Boolean) as string[];

  return (
    <section data-gym-body-composition className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs space-y-3.5 transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 sm:basis-auto">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500 border border-teal-500/20">
            <AppIcon name="scale" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Composición corporal</h2>
            <div className="text-[11px] text-[var(--text-soft)] tabular-nums">
              <PrivacyAmount>{latestWeight ? `${latestWeight.kg} kg` : 'Sin peso'}</PrivacyAmount> · <PrivacyAmount>{latestWaist ? `${latestWaist.waist} cm cintura` : 'Sin cintura'}</PrivacyAmount>
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saved && <span className="text-xs font-bold text-emerald-500">✓ Guardado</span>}
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="min-h-11 shrink-0 px-2 text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
          >
            {showForm ? 'Cerrar' : '+ Registrar medición'}
          </button>
        </div>
      </div>
      {saveError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">No se guardó la medición. Revisá el almacenamiento e intentá de nuevo.</p>}

      {/* Expandable Measurement Form */}
      {showForm && (
        <form
          onSubmit={saveSnapshot}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-2.5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Fecha
              </span>
              <input
                type="date"
                max={todayISO()}
                value={date}
                onChange={(e) => setDate(e.target.value || todayISO())}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Peso (kg)
              </span>
              <PrivacyInput
                type="number"
                min="30"
                max="400"
                step="0.1"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={latestWeight ? String(latestWeight.kg) : '80.0'}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs tabular-nums text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Cintura (cm)
              </span>
              <PrivacyInput
                type="number"
                min="40"
                max="250"
                step="0.1"
                inputMode="decimal"
                value={waist}
                onChange={(e) => setWaist(e.target.value)}
                placeholder={latestWaist ? String(latestWaist.waist) : '85.0'}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs tabular-nums text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--blue)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--blue-hover)] cursor-pointer"
            >
              Guardar medición
            </button>
          </div>
        </form>
      )}

      {/* Metrics Summary */}
      {estimate ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Grasa · RFM
            </span>
            <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.rfmPercent.toFixed(1)}%`}</PrivacyAmount>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Masa Grasa
            </span>
            <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.fatMassKg.toFixed(1)} kg`}</PrivacyAmount>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Masa Magra
            </span>
            <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.leanMassKg.toFixed(1)} kg`}</PrivacyAmount>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              FFMI
            </span>
            <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{estimate.ffmi.toFixed(1)}</PrivacyAmount>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-medium text-[var(--text-soft)]">
          {missing.length
            ? `Para calcular composición falta registrar: ${missing.join(', ')}.`
            : 'Revisá que la altura, el peso y la cintura sean válidos.'}
        </p>
      )}

      {estimate && (
        <div className="text-xs text-[var(--text-soft)]">
          Estimaciones de composición corporal, no mediciones clínicas. Calculadas con peso del {fmtDate(estimate.weight.date)} y cintura del {fmtDate(estimate.waist.date)}.
        </div>
      )}
    </section>
  );
};
