import React, { useState, useEffect, useRef } from 'react';
import { LifeOSState, DayKey } from '../types';
import { todayISO, fmtDate, DAYS } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { applyDayCheckout, inspectDayCheckout, type DayCheckoutInput } from '../lib/checkoutFlows';

interface CheckoutModalProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ state, onUpdateState, onClose }) => {
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const isConfirmingRef = useRef(false);
  const saveFailedRef = useRef(false);

  useEffect(() => {
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
  }, [onClose]);

  const iso = todayISO();
  const existingLog = state.checkoutLog[iso] || {};

  const [trainedSkipped, setTrainedSkipped] = useState(Boolean(existingLog.trainedSkipped ?? state.gym.restDays?.includes(iso)));
  const [trainedSkippedTouched, setTrainedSkippedTouched] = useState(false);
  const [studiedSkipped, setStudiedSkipped] = useState(Boolean(existingLog.studiedSkipped));
  const [expensesSkipped, setExpensesSkipped] = useState(Boolean(existingLog.expensesSkipped));
  const [sleepHours, setSleepHours] = useState<number | string>(
    existingLog.sleepHours !== undefined ? existingLog.sleepHours : ''
  );
  const [energyLevel, setEnergyLevel] = useState<number>(existingLog.energyLevel || 0);
  const [dailyNote, setDailyNote] = useState(existingLog.dailyNote || '');

  const hasGymToday = state.gym.sessions.some((s) => s.date === iso);
  const hasStudyToday = state.study.studyLog.some((l) => l.date === iso);
  const hasTxToday = state.finance.transactions.some((t) => t.date === iso);
  const todayContext = state.dailyContext.find((entry) => entry.date === iso);

  // Tomorrow preview calculation
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayIndex = (tomorrowDate.getDay() + 6) % 7; // Monday = 0
  const tomorrowDayKey = DAYS[tomorrowDayIndex] as DayKey;
  const tomorrowLabel = tomorrowDate.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
  const tomorrowAgenda = [...(state.agenda[tomorrowDayKey] || [])].sort((a, b) =>
    a.time.localeCompare(b.time)
  );
  const firstTomorrowBlock = tomorrowAgenda[0];

  const handleFinishCheckout = () => {
    if (isConfirmingRef.current) return;
    const input: DayCheckoutInput = {
      date: iso,
      trainedSkipped,
      trainedSkippedTouched,
      studiedSkipped,
      expensesSkipped,
      sleepHours: sleepHours !== '' ? Number(sleepHours) : undefined,
      energyLevel: energyLevel > 0 ? energyLevel : undefined,
      dailyNote,
      closedAt: new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
    };
    if (input.sleepHours !== undefined && (!Number.isFinite(input.sleepHours) || input.sleepHours < 0 || input.sleepHours > 24)) {
      showToast('Las horas de sueño deben estar entre 0 y 24.', 'error');
      return;
    }
    const status = inspectDayCheckout(state, input);
    if (status === 'ambiguous-reflection') {
      showToast('Hay varias notas anteriores de este cierre. La reflexión no se modificó para protegerlas.', 'error');
      return;
    }
    if (status === 'unchanged' && !saveFailedRef.current) {
      onClose();
      return;
    }
    isConfirmingRef.current = true;
    const saved = onUpdateState((draft) => {
      applyDayCheckout(draft, input);
    });
    if (!saved) {
      saveFailedRef.current = true;
      isConfirmingRef.current = false;
      return;
    }
    saveFailedRef.current = false;
    showToast('¡Día cerrado con éxito! 🌙 Todo guardado en 30 segundos.', 'success');
    playSound('night');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
        className="today-checkout-modal bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-xl w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center text-sm text-[var(--text-faint)] hover:text-[var(--text)] rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
        >
          ✕
        </button>

        <div>
          <h2 id="checkout-modal-title" className="pr-10 text-[1.375rem] font-bold tracking-tight text-[var(--text)]">Cerrar el día</h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-soft)]">{fmtDate(iso)}</p>
        </div>

        <div className="text-[13px]">
          {/* Gym Check */}
          {isModuleEnabled(state, 'gimnasio') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/65 py-2.5">
              <span className="font-semibold text-sm text-[var(--text)]">Entrenamiento</span>
              {hasGymToday ? (
                <span className="font-semibold text-emerald-500">✓ Sesión registrada</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={trainedSkipped}
                    onChange={(e) => {
                      setTrainedSkipped(e.target.checked);
                      setTrainedSkippedTouched(true);
                    }}
                    className="rounded-xs cursor-pointer accent-[var(--blue)]"
                  />
                  <span>Hoy fue descanso</span>
                </label>
              )}
            </div>
          )}

          {/* Study Check */}
          {isModuleEnabled(state, 'estudios') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/65 py-2.5">
              <span className="font-semibold text-sm text-[var(--text)]">Estudios</span>
              {hasStudyToday ? (
                <span className="font-semibold text-emerald-500">✓ Horas registradas</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={studiedSkipped}
                    onChange={(e) => setStudiedSkipped(e.target.checked)}
                    className="rounded-xs cursor-pointer accent-[var(--blue)]"
                  />
                  <span>Sin estudio hoy</span>
                </label>
              )}
            </div>
          )}

          {/* Expenses Check */}
          {isModuleEnabled(state, 'finanzas') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/65 py-2.5">
              <span className="font-semibold text-sm text-[var(--text)]">Gastos</span>
              {hasTxToday ? (
                <span className="font-semibold text-emerald-500">✓ Movimientos registrados</span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={expensesSkipped}
                    onChange={(e) => setExpensesSkipped(e.target.checked)}
                    className="rounded-xs cursor-pointer accent-[var(--blue)]"
                  />
                  <span>Sin gastos hoy</span>
                </label>
              )}
            </div>
          )}

          {/* Sleep Hours Check */}
          <div className="space-y-2 border-b border-[var(--border)]/65 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-1.5">
              <span className="font-semibold text-sm text-[var(--text)]">Sueño <span className="font-normal text-[var(--text-soft)]">· opcional</span></span>
              <span className="tabular-nums text-[12px] font-medium text-[var(--text-soft)]">
                {sleepHours !== '' ? `${sleepHours} h` : todayContext?.sleepHours != null ? `${todayContext.sleepHours} h en Estado` : 'Sin registro'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setSleepHours(h)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    Number(sleepHours) === h
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  {h}h
                </button>
              ))}
              <input
                type="number"
                aria-label="Horas de sueño opcionales"
                step="0.5"
                min="0"
                max="24"
                placeholder="Otro..."
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="w-16 px-2 py-1 text-xs rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden text-center tabular-nums ml-auto"
              />
            </div>
          </div>

          {/* Energy Level Check */}
          <div className="space-y-2 border-b border-[var(--border)]/65 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-1.5">
              <span className="font-semibold text-sm text-[var(--text)]">Energía <span className="font-normal text-[var(--text-soft)]">· opcional</span></span>
              <span className="font-medium text-[12px] text-[var(--text-soft)]">
                {energyLevel === 1
                  ? '😴 1 - Muy baja'
                  : energyLevel === 2
                  ? '🥱 2 - Baja'
                  : energyLevel === 3
                  ? '🔋 3 - Normal'
                  : energyLevel === 4
                  ? '⚡ 4 - Alta'
                  : energyLevel === 5
                  ? '🚀 5 - Máxima'
                  : todayContext?.energy != null ? `${todayContext.energy}/5 en Estado` : 'Sin registro'}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
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
                  className={`py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    energyLevel === item.lvl
                      ? 'bg-[var(--blue-soft)] border-[var(--blue)] text-[var(--blue)] dark:text-violet-200 font-bold'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="text-[11px] font-bold">{item.lvl}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Daily Reflection */}
          <div className="space-y-1.5 border-b border-[var(--border)]/65 py-3">
            <label htmlFor="checkout-reflection" className="block text-sm font-semibold text-[var(--text)]">
              Reflexión <span className="font-normal text-[var(--text-soft)]">· opcional</span>
            </label>
            <input
              id="checkout-reflection"
              type="text"
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              placeholder="Algo que quieras recordar de hoy"
              className="w-full px-3 py-2 text-[13px] font-medium rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>

          {/* Tomorrow Preview */}
          <div className="space-y-1 py-3">
            <div>
              <span className="block text-[12px] font-semibold text-[var(--blue)] dark:text-violet-200">
                Mañana · {tomorrowLabel}
              </span>
              <span className="block mt-1 text-[13px] font-medium text-[var(--text)]">
                {firstTomorrowBlock
                  ? `${firstTomorrowBlock.time} · ${firstTomorrowBlock.activity}`
                  : 'Sin bloques en la agenda semanal'}
              </span>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-[var(--card-subtle)] border border-[var(--border)] text-[var(--text)] text-[13px] font-semibold rounded-xl hover:bg-[var(--surface-muted)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinishCheckout}
            className="px-4 py-2.5 bg-[#4F46E5] text-white text-[13px] font-bold rounded-xl hover:bg-[#4338CA] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            Confirmar cierre
          </button>
        </div>
      </div>
    </div>
  );
};
