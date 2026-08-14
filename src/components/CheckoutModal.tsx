import React, { useEffect, useState } from 'react';
import { LifeOSState } from '../types';
import { todayISO, fmtDate } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';

interface CheckoutModalProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ state, onUpdateState, onClose }) => {
  const iso = todayISO();
  const existingLog = state.checkoutLog[iso] || {};

  const [trainedSkipped, setTrainedSkipped] = useState(Boolean(existingLog.trainedSkipped));
  const [studiedSkipped, setStudiedSkipped] = useState(Boolean(existingLog.studiedSkipped));
  const [expensesSkipped, setExpensesSkipped] = useState(Boolean(existingLog.expensesSkipped));

  const hasGymToday = state.gym.sessions.some((s) => s.date === iso);
  const hasStudyToday = state.study.studyLog.some((l) => l.date === iso);
  const hasTxToday = state.finance.transactions.some((t) => t.date === iso);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const handleFinishCheckout = () => {
    playSound('night');
    onUpdateState((draft) => {
      draft.checkoutLog[iso] = {
        trainedSkipped,
        studiedSkipped,
        expensesSkipped,
        closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });
    showToast('Día cerrado. Lo importante ya quedó registrado. 🌙');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Cerrar el día" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-sm text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          ✕
        </button>

        <div>
          <h2 className="text-xl font-extrabold text-[var(--text)]">Check-out del Día 🌙</h2>
          <p className="text-xs text-[var(--text-soft)] mt-1">
            Resumen de tu jornada del {fmtDate(iso)}. Revisá tus registros antes de cerrar.
          </p>
        </div>

        <div className="space-y-4 text-xs">
          {/* Gym Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)]">🏋️ Entrenamiento</span>
              {hasGymToday ? (
                <span className="text-emerald-500 font-bold">✓ Sesión registrada</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={trainedSkipped}
                    onChange={(e) => setTrainedSkipped(e.target.checked)}
                    className="rounded-xs"
                  />
                  <span>Hoy fue día de descanso</span>
                </label>
              )}
            </div>
          </div>

          {/* Study Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)]">📚 Estudios</span>
              {hasStudyToday ? (
                <span className="text-emerald-500 font-bold">✓ Horas registradas</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={studiedSkipped}
                    onChange={(e) => setStudiedSkipped(e.target.checked)}
                    className="rounded-xs"
                  />
                  <span>Sin horas de estudio hoy</span>
                </label>
              )}
            </div>
          </div>

          {/* Expenses Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)]">💰 Gastos / Finanzas</span>
              {hasTxToday ? (
                <span className="text-emerald-500 font-bold">✓ Movimientos cargados</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={expensesSkipped}
                    onChange={(e) => setExpensesSkipped(e.target.checked)}
                    className="rounded-xs"
                  />
                  <span>Sin gastos hoy</span>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-soft)] text-xs font-semibold rounded-xl hover:text-[var(--text)] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleFinishCheckout}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold rounded-xl hover:opacity-90 cursor-pointer shadow-xs"
          >
            🌙 Confirmar y cerrar día
          </button>
        </div>
      </div>
    </div>
  );
};
