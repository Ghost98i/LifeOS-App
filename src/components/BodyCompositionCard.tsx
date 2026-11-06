import React, { useMemo, useState } from 'react';
import type { LifeOSState } from '../types';
import { bodyCompositionEstimate } from '../lib/bodyComposition';
import { calcIMC, imcCategory } from '../lib/calculations';
import { fmtDate, todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';
import { PrivacyAmount, PrivacyInput } from './PrivacyAmount';

interface BodyCompositionCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  children?: React.ReactNode;
}

export const BodyCompositionCard: React.FC<BodyCompositionCardProps> = React.memo(({ state, onUpdateState, children }) => {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const estimate = useMemo(
    () => bodyCompositionEstimate(state),
    [state]
  );
  const imc = useMemo(() => calcIMC(state), [state]);
  const imcCat = useMemo(() => imcCategory(imc), [imc]);

  const { latestWeight, prevWeight } = useMemo(() => {
    const sorted = [...state.gym.weight].sort((a, b) => b.date.localeCompare(a.date));
    return { latestWeight: sorted[0] || null, prevWeight: sorted[1] || null };
  }, [state.gym.weight]);
  const { latestWaist, prevWaist } = useMemo(() => {
    const sorted = [...state.gym.measurements].sort((a, b) => b.date.localeCompare(a.date));
    return { latestWaist: sorted[0] || null, prevWaist: sorted[1] || null };
  }, [state.gym.measurements]);

  const weightDelta = latestWeight && prevWeight ? +(latestWeight.kg - prevWeight.kg).toFixed(1) : null;
  const waistDelta = latestWaist && prevWaist ? +(latestWaist.waist - prevWaist.waist).toFixed(1) : null;

  const saveSnapshot = (event: React.FormEvent) => {
    event.preventDefault();
    const kg = Number(weight);
    const hasWaistInput = waist.trim().length > 0;
    const cm = hasWaistInput ? Number(waist) : (latestWaist?.waist ?? NaN);
    const validWeight = Number.isFinite(kg) && kg >= 30 && kg <= 400;
    const validWaist = Number.isFinite(cm) && cm >= 40 && cm <= 250;
    if (!validWeight && !validWaist) return;
    if (hasWaistInput && !validWaist) return;

    const result = onUpdateState((draft) => {
      if (validWeight) {
        draft.gym.weight = draft.gym.weight.filter((item) => item.date !== date);
        draft.gym.weight.push({ date, kg });
      }
      if (hasWaistInput && validWaist) {
        draft.gym.measurements = draft.gym.measurements.filter((item) => item.date !== date);
        draft.gym.measurements.push({ date, waist: cm });
      }
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500 border border-teal-500/20">
            <AppIcon name="scale" className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 className="text-sm font-bold text-[var(--text)]">Composición corporal</h2>
              <ContextualHelp label="Cómo se calcula la composición corporal">
                Usa tu altura, sexo y cintura para estimar grasa corporal (fórmula RFM), masa magra libre de grasa, FFMI (desarrollo muscular relativo a tu estatura) e IMC orientativo. Medí la cintura a la altura del ombligo en ayunas para comparar con consistencia.
              </ContextualHelp>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--text-soft)] tabular-nums">
              <PrivacyAmount>{latestWeight ? `${latestWeight.kg} kg` : 'Sin peso'}</PrivacyAmount>
              {weightDelta !== null && weightDelta !== 0 && (
                <span className="text-[10px] text-[var(--text-faint)]">
                  ({weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg)
                </span>
              )}
              <span>·</span>
              <PrivacyAmount>{latestWaist ? `${latestWaist.waist} cm cintura` : 'Sin cintura'}</PrivacyAmount>
              {waistDelta !== null && waistDelta !== 0 && (
                <span className="text-[10px] text-[var(--text-faint)]">
                  ({waistDelta > 0 ? `+${waistDelta}` : waistDelta} cm)
                </span>
              )}
              {imc != null && (
                <>
                  <span>·</span>
                  <span className="text-[var(--text-faint)]">
                    IMC <PrivacyAmount>{imc.toFixed(1)}</PrivacyAmount> ({imcCat.label})
                  </span>
                </>
              )}
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
                Cintura (cm · opcional)
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
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Grasa · RFM
              </span>
              <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.rfmPercent.toFixed(1)}%`}</PrivacyAmount>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">Cintura / altura</span>
            </div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Masa Grasa
              </span>
              <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.fatMassKg.toFixed(1)} kg`}</PrivacyAmount>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">Tejido adiposo est.</span>
            </div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Masa Magra
              </span>
              <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{`${estimate.leanMassKg.toFixed(1)} kg`}</PrivacyAmount>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">{`${(100 - estimate.rfmPercent).toFixed(0)}% libre de grasa`}</span>
            </div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-2.5 border border-[var(--border)]/60">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                FFMI
              </span>
              <PrivacyAmount as="strong" className="mt-0.5 block text-lg tabular-nums font-extrabold text-[var(--text)]">{estimate.ffmi.toFixed(1)}</PrivacyAmount>
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">Masa magra / m²</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-faint)]">
            <span>Estimaciones orientativas (no mediciones clínicas) · {fmtDate(estimate.weight.date)}</span>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-medium text-[var(--text-soft)]">
          {missing.length
            ? `Para calcular composición falta registrar: ${missing.join(', ')}.`
            : 'Revisá que la altura, el peso y la cintura sean válidos.'}
        </p>
      )}

      {children}
    </section>
  );
});
