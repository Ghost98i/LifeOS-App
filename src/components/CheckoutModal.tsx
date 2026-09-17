import React, { useState } from 'react';
import { LifeOSState, DayKey } from '../types';
import { todayISO, fmtDate, DAYS, DAY_LABELS, uid } from '../lib/storage';
import { playSound } from '../lib/audio';

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
  const [sleepHours, setSleepHours] = useState<number | string>(
    existingLog.sleepHours !== undefined ? existingLog.sleepHours : ''
  );
  const [energyLevel, setEnergyLevel] = useState<number>(existingLog.energyLevel || 0);
  const [dailyNote, setDailyNote] = useState(existingLog.dailyNote || '');

  const hasGymToday = state.gym.sessions.some((s) => s.date === iso);
  const hasStudyToday = state.study.studyLog.some((l) => l.date === iso);
  const hasTxToday = state.finance.transactions.some((t) => t.date === iso);

  // Tomorrow preview calculation
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayIndex = (tomorrowDate.getDay() + 6) % 7; // Monday = 0
  const tomorrowDayKey = DAYS[tomorrowDayIndex] as DayKey;
  const tomorrowAgenda = [...(state.agenda[tomorrowDayKey] || [])].sort((a, b) =>
    a.time.localeCompare(b.time)
  );
  const firstTomorrowBlock = tomorrowAgenda[0];

  const handleFinishCheckout = () => {
    playSound('night');
    onUpdateState((draft) => {
      draft.checkoutLog[iso] = {
        ...draft.checkoutLog[iso],
        trainedSkipped,
        studiedSkipped,
        expensesSkipped,
        sleepHours: sleepHours !== '' ? Number(sleepHours) : undefined,
        energyLevel: energyLevel > 0 ? energyLevel : undefined,
        closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dailyNote: dailyNote.trim() || undefined,
      };

      if (trainedSkipped) {
        if (!draft.gym.restDays) draft.gym.restDays = [];
        if (!draft.gym.restDays.includes(iso)) draft.gym.restDays.push(iso);
      } else if (!hasGymToday && draft.gym.restDays) {
        draft.gym.restDays = draft.gym.restDays.filter((d) => d !== iso);
      }

      // Save note as a postit if user wrote something
      if (dailyNote.trim()) {
        draft.notes.postits.unshift({
          id: uid(),
          text: `[Cierre del ${fmtDate(iso)}] ${dailyNote.trim()}`,
          date: iso,
        });
      }
    });
    alert('¡Día cerrado con éxito! 🌙 Todo guardado en 30 segundos.');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-sm text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          ✕
        </button>

        <div>
          <h2 className="text-xl font-extrabold text-[var(--text)] flex items-center gap-2">
            <span>🌙</span> Cierre Nocturno del Día
          </h2>
          <p className="text-xs text-[var(--text-soft)] mt-1">
            Resumen de tu jornada ({fmtDate(iso)}). Resolvelo en 30 segundos sin esfuerzo.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          {/* Gym Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--text)]">🏋️ Entrenamiento</span>
            {hasGymToday ? (
              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                ✓ Sesión cargada
              </span>
            ) : (
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                <input
                  type="checkbox"
                  checked={trainedSkipped}
                  onChange={(e) => setTrainedSkipped(e.target.checked)}
                  className="rounded-xs cursor-pointer"
                />
                <span>Hoy fue descanso</span>
              </label>
            )}
          </div>

          {/* Study Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--text)]">📚 Estudios</span>
            {hasStudyToday ? (
              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                ✓ Horas cargadas
              </span>
            ) : (
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                <input
                  type="checkbox"
                  checked={studiedSkipped}
                  onChange={(e) => setStudiedSkipped(e.target.checked)}
                  className="rounded-xs cursor-pointer"
                />
                <span>Sin estudio hoy</span>
              </label>
            )}
          </div>

          {/* Expenses Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--text)]">💰 Gastos</span>
            {hasTxToday ? (
              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                ✓ Movimientos cargados
              </span>
            ) : (
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-soft)]">
                <input
                  type="checkbox"
                  checked={expensesSkipped}
                  onChange={(e) => setExpensesSkipped(e.target.checked)}
                  className="rounded-xs cursor-pointer"
                />
                <span>Sin gastos hoy</span>
              </label>
            )}
          </div>

          {/* Sleep Hours Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)] flex items-center gap-1.5">
                <span>💤</span> Horas de sueño
              </span>
              <span className="font-mono text-xs font-bold text-[var(--blue)]">
                {sleepHours !== '' ? `${sleepHours} hs` : 'Sin definir'}
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
                step="0.5"
                min="0"
                max="24"
                placeholder="Otro..."
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="w-16 px-2 py-1 text-xs rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden text-center font-mono ml-auto"
              />
            </div>
          </div>

          {/* Energy Level Check */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text)] flex items-center gap-1.5">
                <span>⚡</span> Nivel de energía del día
              </span>
              <span className="font-bold text-xs text-amber-600 dark:text-amber-400">
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
                  : 'Sin calificar'}
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
                      ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-extrabold shadow-2xs'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="text-[10px] font-bold">{item.lvl}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Daily Reflection */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block">
              ✍️ Nota o reflexión rápida del día (Opcional)
            </label>
            <input
              type="text"
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              placeholder="Ej: Día productivo, cerré 2 trámites y envié postulaciones..."
              className="w-full px-3 py-2 text-xs font-medium rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>

          {/* Tomorrow Preview */}
          <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 block">
                👀 Mañana ({DAY_LABELS[tomorrowDayKey]}):
              </span>
              <span className="font-semibold text-[var(--text)]">
                {firstTomorrowBlock
                  ? `${firstTomorrowBlock.time} hs — ${firstTomorrowBlock.activity}`
                  : 'Sin bloques matutinos agendados'}
              </span>
            </div>
            <span className="text-xs text-[var(--text-faint)] font-mono">1º actividad</span>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-soft)] text-xs font-semibold rounded-xl hover:text-[var(--text)] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleFinishCheckout}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-xl hover:opacity-90 cursor-pointer shadow-xs"
          >
            🌙 Confirmar y cerrar día
          </button>
        </div>
      </div>
    </div>
  );
};
