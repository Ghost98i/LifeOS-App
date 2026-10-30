import React, { useState } from 'react';
import { AppIcon } from './AppIcon';

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
  { kg: 25, color: 'bg-rose-600 text-white border-rose-700', label: '25 kg' },
  { kg: 20, color: 'bg-blue-600 text-white border-blue-700', label: '20 kg' },
  { kg: 15, color: 'bg-amber-500 text-slate-950 border-amber-600', label: '15 kg' },
  { kg: 10, color: 'bg-emerald-600 text-white border-emerald-700', label: '10 kg' },
  { kg: 5, color: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white border-slate-400', label: '5 kg' },
  { kg: 2.5, color: 'bg-slate-800 text-white border-slate-900', label: '2.5 kg' },
  { kg: 1.25, color: 'bg-zinc-400 text-zinc-950 border-zinc-500', label: '1.25 kg' },
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

export const GymPlateCalculator: React.FC<GymPlateCalculatorProps> = ({
  initialWeight = 60,
  initialBarWeight = 20,
  isOpen,
  onClose,
  onApplyWeight,
}) => {
  const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    if (document.activeElement instanceof HTMLElement) {
      previousFocusedElementRef.current = document.activeElement;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusedElementRef.current && typeof previousFocusedElementRef.current.focus === 'function') {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const [barWeight, setBarWeight] = useState(initialBarWeight);
  const [totalWeight, setTotalWeight] = useState(initialWeight);
  const [activeTab, setActiveTab] = useState<'calc' | 'manual'>('calc');
  const [manualPlatesPerSide, setManualPlatesPerSide] = useState<number[]>([]);

  if (!isOpen) return null;

  const result = calculatePlatesForWeight(totalWeight, barWeight);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plate-calculator-title"
        className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <AppIcon name="dumbbell" className="h-4 w-4" />
            </span>
            <div>
              <h2 id="plate-calculator-title" className="text-sm font-bold text-[var(--text)]">Calculadora de Pesos Colocados</h2>
              <p className="text-[11px] text-[var(--text-soft)]">Desglose de discos y barra</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar calculadora"
            className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Tabs */}
          <div className="flex rounded-xl bg-[var(--bg)] p-1 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab('calc')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'calc'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Objetivo → Discos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Tocar Discos Colocados
            </button>
          </div>

          {/* Bar Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
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
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden cursor-pointer"
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
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
                  Peso total objetivo (kg)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min={barWeight}
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(Math.max(0, Number(e.target.value)))}
                    className="flex-1 px-3 py-2 text-base tabular-nums font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                  />
                  <div className="flex gap-1">
                    {[+2.5, +5, +10, -5, -2.5].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => setTotalWeight((prev) => Math.max(barWeight, prev + delta))}
                        className="px-2 py-2 text-xs tabular-nums font-bold rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-muted)] text-[var(--text)] cursor-pointer"
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Breakdown Card */}
              <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-soft)]">Peso en discos (total):</span>
                  <span className="tabular-nums font-bold text-sm text-[var(--text)]">
                    {Math.max(0, totalWeight - barWeight)} kg
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <span className="text-xs font-bold text-[var(--blue)]">Colocar por cada lado:</span>
                  <span className="tabular-nums font-extrabold text-base text-[var(--blue)]">
                    {result.perSideKg} kg
                  </span>
                </div>

                {/* Plates Visual List */}
                {result.plates.length > 0 ? (
                  <div className="space-y-1.5 pt-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
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
                  <p className="text-xs text-[var(--text-faint)] text-center py-2">
                    Solo la barra ({barWeight} kg). No requiere discos adicionales.
                  </p>
                )}

                {result.remainder > 0 && (
                  <p className="text-[11px] text-amber-500 font-medium">
                    ⚠️ Restan {result.remainder} kg por lado (menor al disco de 1.25 kg).
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Interactive Tapping (Pesos Colocados) */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Tocá para agregar discos por lado:
                  </span>
                  {manualPlatesPerSide.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearManual}
                      className="text-[11px] text-rose-500 hover:underline cursor-pointer font-semibold"
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
                      className={`py-2 px-1 rounded-xl text-xs tabular-nums font-bold border transition-transform active:scale-95 cursor-pointer shadow-xs flex flex-col items-center ${plate.color}`}
                    >
                      <span>+{plate.kg}</span>
                      <span className="text-[9px] opacity-75">kg</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Placed Plates */}
              <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)]">Discos colocados (por lado):</span>
                  <span className="tabular-nums font-bold text-xs text-[var(--blue)]">
                    {manualPlatesPerSide.reduce((a, b) => a + b, 0)} kg / lado
                  </span>
                </div>

                {manualPlatesPerSide.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)] text-center py-2">
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
                        className="px-2 py-1 rounded-lg text-xs tabular-nums font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:border-rose-500 hover:text-rose-500 cursor-pointer shadow-2xs group flex items-center gap-1"
                      >
                        <span>{kg} kg</span>
                        <span className="text-[10px] text-[var(--text-faint)] group-hover:text-rose-500">✕</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                  <span className="text-xs font-bold text-[var(--text-soft)]">Peso Total Resultante:</span>
                  <span className="tabular-nums text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {totalWeight} kg
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border)] bg-[var(--bg)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            Aplicar {totalWeight} kg
          </button>
        </div>
      </div>
    </div>
  );
};
