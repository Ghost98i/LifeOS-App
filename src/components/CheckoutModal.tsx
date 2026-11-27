import React, { useState, useRef } from 'react';
import { LifeOSState, DayKey } from '../types';
import { todayISO, fmtDate, formatMoney, DAYS } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { isModuleEnabled } from '../lib/moduleVisibility';
import {
  applyDayCheckout,
  deriveDayCheckoutSummary,
  inspectDayCheckout,
  rolloverPendingExtrasToTomorrow,
  undoRolloverPendingExtras,
  type DayCheckoutInput,
  type RolloverExtrasResult,
} from '../lib/checkoutFlows';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { AppIcon, type AppIconName } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface CheckoutModalProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ state, onUpdateState, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isConfirmingRef = useRef(false);
  const saveFailedRef = useRef(false);

  useDialogFocus(true, dialogRef, onClose);

  const iso = todayISO();
  const existingLog = state.checkoutLog[iso] || {};
  const summary = deriveDayCheckoutSummary(state, iso);

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
    showToast('¡Día cerrado con éxito! Todo guardado en 30 segundos.', 'success');
    playSound('night');
    onClose();
  };

  const handleRolloverPending = () => {
    if (summary.alreadyRolledOver || summary.tasks.pendingExtrasCount === 0) return;
    let rolloverOutcome: RolloverExtrasResult | null = null;
    const saved = onUpdateState((draft) => {
      rolloverOutcome = rolloverPendingExtrasToTomorrow(draft, iso);
    });
    if (!saved || !rolloverOutcome) return;
    const res = rolloverOutcome as RolloverExtrasResult;
    if (res.movedCount > 0) {
      showToast(
        res.movedCount === 1
          ? '1 tarea pendiente reprogramada para mañana.'
          : `${res.movedCount} tareas pendientes reprogramadas para mañana.`,
        'success',
        {
          actionLabel: 'Deshacer',
          onAction: () => {
            if (onUpdateState((draft) => {
              undoRolloverPendingExtras(draft, iso, res.movedSnapshots);
            })) {
              showToast('Reprogramación revertida.', 'info');
            }
          },
        },
      );
    }
  };

  return (
    <div
      className="celestian-modal-backdrop fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
        className="celestian-modal-panel today-checkout-modal bg-[var(--card)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[92dvh] overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 space-y-4 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center text-sm text-[var(--text-faint)] hover:text-[var(--text)] rounded-lg cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          <AppIcon name="x" className="h-4 w-4" />
        </button>

        <div>
          <h2 id="checkout-modal-title" className="pr-10 text-[1.375rem] font-bold tracking-tight text-[var(--text)]">Cerrar el día</h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-soft)]">{fmtDate(iso)}</p>
        </div>

        {/* Resumen automático del día (calculado en render, no persistido) */}
        <section
          aria-label="Resumen del día"
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2.5 text-xs"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--card)] px-2.5 py-2">
              <span className="block text-[11px] text-[var(--text-soft)]">Tareas de hoy</span>
              <strong className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--text)]">
                {summary.tasks.total > 0
                  ? `${summary.tasks.completed}/${summary.tasks.total} (${summary.tasks.completionPct}%)`
                  : 'Sin tareas'}
              </strong>
              {summary.tasks.pending > 0 && (
                <span className="block text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                  {summary.tasks.pending} {summary.tasks.pending === 1 ? 'pendiente' : 'pendientes'}
                </span>
              )}
            </div>

            {isModuleEnabled(state, 'estudios') && (
              <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--card)] px-2.5 py-2">
                <span className="block text-[11px] text-[var(--text-soft)]">Estudio</span>
                <strong className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--text)]">
                  {summary.study.minutesToday} min
                </strong>
                <span className="block text-[11px] text-[var(--text-faint)] tabular-nums">
                  {summary.study.plannedMinutes
                    ? `Meta activa: ${summary.study.plannedMinutes} min`
                    : 'Sin sesión planificada'}
                </span>
              </div>
            )}

            {isModuleEnabled(state, 'gimnasio') && (
              <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--card)] px-2.5 py-2">
                <span className="block text-[11px] text-[var(--text-soft)]">Entrenamiento</span>
                <strong className="mt-0.5 block text-sm font-bold text-[var(--text)]">
                  {summary.training.trained
                    ? 'Sesión completada'
                    : summary.training.restDay
                    ? 'Día de descanso'
                    : 'Sin registro'}
                </strong>
              </div>
            )}

            {isModuleEnabled(state, 'finanzas') && (
              <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--card)] px-2.5 py-2">
                <span className="block text-[11px] text-[var(--text-soft)]">Gasto de hoy</span>
                <strong className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--text)]">
                  <PrivacyAmount>
                    {formatMoney(summary.spending.spentToday, summary.spending.currency)}
                  </PrivacyAmount>
                </strong>
                <span className="block text-[11px] text-[var(--text-faint)] tabular-nums">
                  {summary.spending.dailyLimit !== null ? (
                    <>
                      Tope diario:{' '}
                      <PrivacyAmount>
                        {formatMoney(summary.spending.dailyLimit, summary.spending.currency)}
                      </PrivacyAmount>
                    </>
                  ) : (
                    'Sin tope definido'
                  )}
                </span>
              </div>
            )}
          </div>

          {(summary.tasks.pendingExtrasCount > 0 || summary.alreadyRolledOver) && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60">
              <span className="text-[11px] text-[var(--text-soft)]">
                {summary.alreadyRolledOver
                  ? 'Las tareas puntuales pendientes ya se pasaron a mañana.'
                  : `${summary.tasks.pendingExtrasCount} ${summary.tasks.pendingExtrasCount === 1 ? 'tarea puntual pendiente' : 'tareas puntuales pendientes'} para pasar a mañana.`}
              </span>
              <button
                type="button"
                disabled={summary.alreadyRolledOver}
                onClick={handleRolloverPending}
                className="shrink-0 min-h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {summary.alreadyRolledOver ? 'Ya reprogramadas' : 'Reprogramar pendientes a mañana'}
              </button>
            </div>
          )}
        </section>

        <div className="text-[13px]">
          {/* Gym Check */}
          {isModuleEnabled(state, 'gimnasio') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/65 py-2.5">
              <span className="font-semibold text-sm text-[var(--text)]">Entrenamiento</span>
              {hasGymToday ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-500"><AppIcon name="check" className="h-3.5 w-3.5" /><span>Sesión registrada</span></span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={trainedSkipped}
                    onChange={(e) => {
                      setTrainedSkipped(e.target.checked);
                      setTrainedSkippedTouched(true);
                    }}
                    className="rounded-xs cursor-pointer accent-[#4F46E5]"
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
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-500"><AppIcon name="check" className="h-3.5 w-3.5" /><span>Horas registradas</span></span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={studiedSkipped}
                    onChange={(e) => setStudiedSkipped(e.target.checked)}
                    className="rounded-xs cursor-pointer accent-[#4F46E5]"
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
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-500"><AppIcon name="check" className="h-3.5 w-3.5" /><span>Movimientos registrados</span></span>
              ) : (
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={expensesSkipped}
                    onChange={(e) => setExpensesSkipped(e.target.checked)}
                    className="rounded-xs cursor-pointer accent-[#4F46E5]"
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
                      ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
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
                className="celestian-clean-field w-16 px-2 py-1 text-xs rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-center tabular-nums ml-auto"
              />
            </div>
          </div>

          {/* Energy Level Check */}
          <div className="space-y-2 border-b border-[var(--border)]/65 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-1.5">
              <span className="font-semibold text-sm text-[var(--text)]">Energía <span className="font-normal text-[var(--text-soft)]">· opcional</span></span>
              <span className="inline-flex items-center gap-1 font-medium text-[12px] text-[var(--text-soft)]">
                {(() => {
                  const opts: { lvl: number; icon: AppIconName; label: string }[] = [
                    { lvl: 1, icon: 'moon', label: 'Muy baja' },
                    { lvl: 2, icon: 'clock', label: 'Baja' },
                    { lvl: 3, icon: 'activity', label: 'Normal' },
                    { lvl: 4, icon: 'zap', label: 'Alta' },
                    { lvl: 5, icon: 'trendingUp', label: 'Máxima' },
                  ];
                  const selected = opts.find((o) => o.lvl === energyLevel);
                  if (selected) {
                    return (
                      <>
                        <AppIcon name={selected.icon} className="h-3.5 w-3.5" />
                        <span>{`${selected.lvl} - ${selected.label}`}</span>
                      </>
                    );
                  }
                  return todayContext?.energy != null ? `${todayContext.energy}/5 en Estado` : 'Sin registro';
                })()}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { lvl: 1, icon: 'moon', label: 'Muy baja' },
                { lvl: 2, icon: 'clock', label: 'Baja' },
                { lvl: 3, icon: 'activity', label: 'Normal' },
                { lvl: 4, icon: 'zap', label: 'Alta' },
                { lvl: 5, icon: 'trendingUp', label: 'Máxima' },
              ] as { lvl: number; icon: AppIconName; label: string }[]).map((item) => (
                <button
                  key={item.lvl}
                  type="button"
                  onClick={() => setEnergyLevel(item.lvl)}
                  className={`py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    energyLevel === item.lvl
                      ? 'bg-indigo-500/12 border-[#4F46E5] text-[#4F46E5] dark:text-indigo-200 font-bold'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <AppIcon name={item.icon} className="h-4 w-4" />
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
              className="celestian-clean-field w-full px-3 py-2 text-[13px] font-medium rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
            />
          </div>

          {/* Tomorrow Preview */}
          <div className="space-y-1 py-3">
            <div>
              <span className="block text-[12px] font-semibold text-[#4F46E5] dark:text-indigo-300">
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
            className="px-4 py-2.5 bg-[var(--card-subtle)] border border-[var(--border)] text-[var(--text)] text-[13px] font-semibold rounded-xl hover:bg-[var(--surface-muted)] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinishCheckout}
            className="px-4 py-2.5 bg-[#4F46E5] text-white text-[13px] font-bold rounded-xl hover:bg-[#4338CA] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            Confirmar cierre
          </button>
        </div>
      </div>
    </div>
  );
};
