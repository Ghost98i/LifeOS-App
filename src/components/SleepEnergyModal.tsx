import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { todayISO } from '../lib/storage';
import { playSound } from '../lib/audio';

interface SleepEnergyModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (fn: (draft: LifeOSState) => void) => void;
}

export const SleepEnergyModal: React.FC<SleepEnergyModalProps> = ({
  isOpen,
  onClose,
  state,
  onUpdateState,
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

  const todayIso = todayISO();
  const todayLog = state.checkoutLog[todayIso] || {};

  const [sleepHours, setSleepHours] = useState<number | string>(
    todayLog.sleepHours !== undefined ? todayLog.sleepHours : ''
  );
  const [energyLevel, setEnergyLevel] = useState<number>(todayLog.energyLevel || 0);

  if (!isOpen) return null;

  const handleSave = () => {
    playSound('click');
    onUpdateState((draft) => {
      if (!draft.checkoutLog[todayIso]) draft.checkoutLog[todayIso] = {};
      draft.checkoutLog[todayIso].sleepHours =
        sleepHours !== '' ? Number(sleepHours) : undefined;
      draft.checkoutLog[todayIso].energyLevel =
        energyLevel > 0 ? energyLevel : undefined;
    });
    onClose();
  };

  const energyLabels: Record<number, { icon: string; text: string }> = {
    1: { icon: '😴', text: 'Muy baja' },
    2: { icon: '🥱', text: 'Baja' },
    3: { icon: '🔋', text: 'Normal' },
    4: { icon: '⚡', text: 'Alta' },
    5: { icon: '🚀', text: 'Máxima' },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sleep-energy-title"
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-lg border border-blue-500/20">
              ⚡
            </div>
            <div>
              <h2 id="sleep-energy-title" className="text-base font-extrabold text-[var(--text)] tracking-tight">
                Estado Diario: Sueño & Energía
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                {new Date().toLocaleDateString('es-UY', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-lg rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Horas de sueño */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span>💤</span> Horas de sueño anoche
            </span>
            <span className="text-xs tabular-nums font-extrabold text-[var(--blue)]">
              {sleepHours !== '' ? `${sleepHours} hs` : 'Sin definir'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSleepHours(h)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  Number(sleepHours) === h
                    ? 'bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs'
                    : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)]'
                }`}
              >
                {h}h
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                placeholder="Otro..."
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="w-20 px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden text-center tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Nivel de energía */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span>🔋</span> Nivel de vitalidad / energía
            </span>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {energyLevel > 0
                ? `${energyLabels[energyLevel]?.icon} ${energyLevel} - ${energyLabels[energyLevel]?.text}`
                : 'Sin calificar'}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { lvl: 1, icon: '😴', label: 'Muy baja' },
              { lvl: 2, icon: '🥱', label: 'Baja' },
              { lvl: 3, icon: '🔋', label: 'Normal' },
              { lvl: 4, icon: '⚡', label: 'Alta' },
              { lvl: 5, icon: '🚀', label: 'Máxima' },
            ].map((item) => (
              <button
                key={item.lvl}
                type="button"
                onClick={() => setEnergyLevel(item.lvl)}
                className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  energyLevel === item.lvl
                    ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-extrabold shadow-xs'
                    : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] font-bold">{item.lvl}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
