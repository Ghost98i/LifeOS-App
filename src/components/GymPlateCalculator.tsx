import React, { useState } from 'react';
import { AppIcon } from './AppIcon';
import { useDialogFocus } from '../hooks/useDialogFocus';

export interface GymPlateCalculatorProps {
  initialWeight?: number;
  initialBarWeight?: number;
  isOpen: boolean;
  onClose: () => void;
  onApplyWeight?: (totalWeight: number, barWeight: number) => void;
}

const BAR_OPTIONS = [
  { label: 'Barra Olímpica (20 kg)', weight: 20 },
  { label: 'Barra Técnica / Mujer (15 kg)', weight: 15 },
  { label: 'Barra W / EZ / Corta (10 kg)', weight: 10 },
  { label: 'Smith / Multipower (15 kg)', weight: 15 },
  { label: 'Sin barra / Máquina / Mancuerna (0 kg)', weight: 0 },
];

const STANDARD_PLATES = [
  { kg: 25, color: 'bg-rose-600 text-white border-rose-700', heightClass: 'h-16 w-3.5', label: '25 kg' },
  { kg: 20, color: 'bg-indigo-600 text-white border-indigo-700', heightClass: 'h-16 w-3', label: '20 kg' },
  { kg: 15, color: 'bg-amber-500 text-slate-950 border-amber-600', heightClass: 'h-14 w-3', label: '15 kg' },
  { kg: 10, color: 'bg-emerald-600 text-white border-emerald-700', heightClass: 'h-12 w-2.5', label: '10 kg' },
  { kg: 5, color: 'bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-white border-slate-400', heightClass: 'h-10 w-2', label: '5 kg' },
  { kg: 2.5, color: 'bg-slate-800 text-white border-slate-900', heightClass: 'h-8 w-2', label: '2.5 kg' },
  { kg: 1.25, color: 'bg-zinc-400 text-zinc-950 border-zinc-500', heightClass: 'h-7 w-1.5', label: '1.25 kg' },
];

export function calculatePlatesForWeight(totalKg: number, barKg: number): {
  perSideKg: number;
  plates: { kg: number; count: number; color: string }[];
  remainder: number;
} {
  const targetPerSide = Math.max(0, (totalKg - barKg) / 2);
  let remaining = targetPerSide;
  const plates: { kg: number; count: number; color: string }[] = [];

  for (const plate of STANDARD_PLATES) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate.kg);
    if (count > 0) {
      plates.push({ kg: plate.kg, count, color: plate.color });
      remaining = Math.round((remaining - count * plate.kg) * 1000) / 1000;
    }
  }

  return {
    perSideKg: targetPerSide,
    plates,
    remainder: remaining,
  };
}

const BarbellSleeveDiagram: React.FC<{ platesKg: number[]; barWeight: number }> = ({ platesKg, barWeight }) => {
  const renderedPlates = platesKg.slice(0, 10);
  return (
    <div
      aria-hidden="true"
      className="flex h-20 w-full items-center overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
    >
      {/* Shaft */}
      <div className="h-2.5 w-8 shrink-0 rounded-l-full bg-slate-400 dark:bg-slate-500" />
      {/* Collar */}
      <div className="h-7 w-2.5 shrink-0 rounded-xs bg-slate-500 dark:bg-slate-400" />
      {/* Sleeve + Stacked Plates */}
      <div className="relative flex flex-1 items-center pl-1">
        <div className="pointer-events-none absolute inset-x-0 h-3.5 rounded-r-full bg-slate-300 dark:bg-slate-600" />
        <div className="relative z-10 flex items-center gap-0.5">
          {renderedPlates.map((kg, index) => {
            const spec = STANDARD_PLATES.find((p) => p.kg === kg) || STANDARD_PLATES[STANDARD_PLATES.length - 1];
            return (
              <span
                key={`${kg}-${index}`}
                className={`${spec.heightClass} shrink-0 rounded-xs border ${spec.color} shadow-2xs transition-all`}
              />
            );
          })}
          {platesKg.length === 0 && (
            <span className="ml-3 rounded-md bg-[var(--card-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-faint)]">
              {barWeight > 0 ? `Barra de ${barWeight} kg sin discos` : 'Sin carga'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const GymPlateCalculator: React.FC<GymPlateCalculatorProps> = ({
  initialWeight = 60,
  initialBarWeight = 20,
  isOpen,
  onClose,
  onApplyWeight,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef, onClose);

  const [barWeight, setBarWeight] = useState(initialBarWeight);
  const [totalWeight, setTotalWeight] = useState(initialWeight);
  const [activeTab, setActiveTab] = useState<'calc' | 'manual'>('calc');
  const [manualPlatesPerSide, setManualPlatesPerSide] = useState<number[]>([]);

  if (!isOpen) return null;

  const result = calculatePlatesForWeight(totalWeight, barWeight);
  const expandedAutoPlates = result.plates.flatMap((plate) => Array.from({ length: plate.count }, () => plate.kg));

  const handleAddPlateManual = (plateKg: number) => {
    const updated = [...manualPlatesPerSide, plateKg].sort((a, b) => b - a);
    setManualPlatesPerSide(updated);
    const sideSum = updated.reduce((a, b) => a + b, 0);
    setTotalWeight(barWeight + sideSum * 2);
  };

  const handleRemovePlateManual = (index: number) => {
    const updated = manualPlatesPerSide.filter((_, idx) => idx !== index);
    setManualPlatesPerSide(updated);
    const sideSum = updated.reduce((a, b) => a + b, 0);
    setTotalWeight(barWeight + sideSum * 2);
  };

  const handleClearManual = () => {
    setManualPlatesPerSide([]);
    setTotalWeight(barWeight);
  };

  const handleApply = () => {
    if (onApplyWeight) {
      onApplyWeight(totalWeight, barWeight);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plate-calculator-title"
        className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#818CF8] border border-[#4F46E5]/20">
              <AppIcon name="dumbbell" className="h-4 w-4" />
            </span>
            <div>
              <h2 id="plate-calculator-title" className="text-sm font-bold text-[var(--text)]">Calculadora de Pesos Colocados</h2>
              <p className="text-xs text-[var(--text-soft)]">Desglose visual de discos y barra</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar calculadora"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] active:scale-95 transition cursor-pointer"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 p-4 space-y-4 overflow-y-auto overscroll-contain">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-muted)] p-1 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab('calc')}
              className={`min-h-10 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'calc'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Objetivo → Discos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`min-h-10 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Tocar Discos Colocados
            </button>
          </div>

          {/* Bar Selector */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-soft)] mb-1.5">
              Barra utilizada
            </label>
            <select
              value={barWeight}
              onChange={(e) => {
                const b = Number(e.target.value);
                setBarWeight(b);
                if (activeTab === 'manual') {
                  const sideSum = manualPlatesPerSide.reduce((x, y) => x + y, 0);
                  setTotalWeight(b + sideSum * 2);
                }
              }}
              className="celestian-clean-field min-h-11 w-full px-3 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
            >
              {BAR_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.weight}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tab 1: Calculate for target weight */}
          {activeTab === 'calc' && (
            <div className="space-y-3.5">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--text-soft)]">
                  Peso total objetivo (kg)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={barWeight}
                  value={totalWeight}
                  onChange={(e) => setTotalWeight(Math.max(0, Number(e.target.value)))}
                  className="celestian-clean-field min-h-12 w-full px-3 text-xl tabular-nums font-extrabold text-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                />
                <div className="grid grid-cols-5 gap-1.5">
                  {[-5, -2.5, +2.5, +5, +10].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => setTotalWeight((prev) => Math.max(barWeight, prev + delta))}
                      className="min-h-11 sm:min-h-10 px-1 text-xs tabular-nums font-bold rounded-lg border border-[var(--border)] bg-[var(--card-subtle)] hover:bg-[var(--surface-muted)] text-[var(--text)] cursor-pointer transition-colors"
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>

              <BarbellSleeveDiagram platesKg={expandedAutoPlates} barWeight={barWeight} />

              {/* Breakdown Card */}
              <div className="p-3.5 rounded-xl bg-[var(--card-subtle)] border border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-soft)]">Peso en discos (total):</span>
                  <span className="tabular-nums font-bold text-sm text-[var(--text)]">
                    {Math.max(0, totalWeight - barWeight)} kg
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <span className="text-xs font-bold text-[#4F46E5] dark:text-[#818CF8]">Colocar por cada lado:</span>
                  <span className="tabular-nums font-extrabold text-base text-[#4F46E5] dark:text-[#818CF8]">
                    {result.perSideKg} kg
                  </span>
                </div>

                {/* Plates Visual List */}
                {result.plates.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[11px] font-semibold text-[var(--text-faint)]">
                      Discos por lado:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.plates.map((p) => (
                        <span
                          key={p.kg}
                          className={`px-2.5 py-1 rounded-lg text-xs tabular-nums font-black border ${p.color} shadow-2xs flex items-center gap-1`}
                        >
                          <span>{p.count}×</span>
                          <span>{p.kg} kg</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-faint)] text-center py-1.5">
                    Solo la barra ({barWeight} kg). No requiere discos adicionales.
                  </p>
                )}

                {result.remainder > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    <AppIcon name="bell" className="h-3.5 w-3.5 shrink-0" />
                    <span>Restan {result.remainder} kg por lado (menor al disco de 1.25 kg).</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Interactive Tapping (Pesos Colocados) */}
          {activeTab === 'manual' && (
            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[var(--text-soft)]">
                    Tocá para agregar discos por lado:
                  </span>
                  {manualPlatesPerSide.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearManual}
                      className="text-xs text-rose-500 hover:underline cursor-pointer font-semibold"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {STANDARD_PLATES.map((plate) => (
                    <button
                      key={plate.kg}
                      type="button"
                      onClick={() => handleAddPlateManual(plate.kg)}
                      className={`min-h-12 py-2 px-1 rounded-xl text-xs tabular-nums font-bold border transition-transform active:scale-95 cursor-pointer shadow-2xs flex flex-col items-center justify-center ${plate.color}`}
                    >
                      <span>+{plate.kg}</span>
                      <span className="text-[10px] opacity-80">kg</span>
                    </button>
                  ))}
                </div>
              </div>

              <BarbellSleeveDiagram platesKg={manualPlatesPerSide} barWeight={barWeight} />

              {/* Current Placed Plates */}
              <div className="p-3.5 rounded-xl bg-[var(--card-subtle)] border border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)]">Discos colocados (por lado):</span>
                  <span className="tabular-nums font-bold text-xs text-[#4F46E5] dark:text-[#818CF8]">
                    {manualPlatesPerSide.reduce((a, b) => a + b, 0)} kg / lado
                  </span>
                </div>

                {manualPlatesPerSide.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)] text-center py-1.5">
                    Sin discos agregados. Tocá los botones de arriba para colocar discos.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {manualPlatesPerSide.map((kg, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleRemovePlateManual(idx)}
                        title="Tocar para quitar este disco"
                        className="min-h-9 px-2.5 py-1 rounded-lg text-xs tabular-nums font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:border-rose-500 hover:text-rose-500 cursor-pointer shadow-2xs group flex items-center gap-1.5"
                      >
                        <span>{kg} kg</span>
                        <AppIcon name="x" className="h-3 w-3 text-[var(--text-faint)] group-hover:text-rose-500" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                  <span className="text-xs font-bold text-[var(--text-soft)]">Peso Total Resultante:</span>
                  <span className="tabular-nums text-xl font-extrabold text-[#4F46E5] dark:text-[#818CF8]">
                    {totalWeight} kg
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 border-t border-[var(--border)] bg-[var(--card-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="min-h-11 px-5 text-xs font-bold rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs cursor-pointer transition-all active:scale-[0.98]"
          >
            Aplicar {totalWeight} kg
          </button>
        </div>
      </div>
    </div>
  );
};
