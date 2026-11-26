import React, { useEffect, useState } from 'react';
import type { GymSettings } from '../types';
import { AppIcon } from './AppIcon';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  getRestNotificationPermission,
  isRestNotificationEnabled,
  isRestNotificationSupported,
  requestRestNotificationPermission,
  setRestNotificationEnabled,
} from '../lib/gymRestTimer';

interface GymRestSettingsModalProps {
  settings: Required<GymSettings>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nextSettings: GymSettings) => boolean | void;
}

const SET_PRESETS = [60, 90, 120, 180];
const EXERCISE_PRESETS = [120, 180, 240, 300];

export const GymRestSettingsModal: React.FC<GymRestSettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [autoTimer, setAutoTimer] = useState(settings.autoTimerEnabled);
  const [setRest, setSetRest] = useState(settings.restBetweenSetsSeconds);
  const [exerciseRest, setExerciseRest] = useState(settings.restBetweenExercisesSeconds);
  const [showQuickAdjustments, setShowQuickAdjustments] = useState(settings.showQuickRestAdjustments);
  const [allowManualEditing, setAllowManualEditing] = useState(settings.allowManualRestEditing);
  const [notifyOnRestEnd, setNotifyOnRestEnd] = useState(() =>
    isRestNotificationEnabled() && getRestNotificationPermission() === 'granted'
  );
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  const [requestingNotification, setRequestingNotification] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSaveError(false);
      setNotificationNotice(null);
      setAutoTimer(settings.autoTimerEnabled);
      setSetRest(settings.restBetweenSetsSeconds);
      setExerciseRest(settings.restBetweenExercisesSeconds);
      setShowQuickAdjustments(settings.showQuickRestAdjustments);
      setAllowManualEditing(settings.allowManualRestEditing);
      setNotifyOnRestEnd(isRestNotificationEnabled() && getRestNotificationPermission() === 'granted');
    }
  }, [isOpen, settings]);

  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef, onClose);

  if (!isOpen) return null;

  const handleToggleNotify = async () => {
    if (notifyOnRestEnd) {
      setNotifyOnRestEnd(false);
      setNotificationNotice(null);
      return;
    }

    if (!isRestNotificationSupported()) {
      setNotifyOnRestEnd(false);
      setNotificationNotice('Este navegador no soporta notificaciones nativas.');
      return;
    }

    const currentPermission = getRestNotificationPermission();
    if (currentPermission === 'granted') {
      setNotifyOnRestEnd(true);
      setNotificationNotice(null);
      return;
    }

    if (currentPermission === 'denied') {
      setNotifyOnRestEnd(false);
      setNotificationNotice('Permiso de notificaciones bloqueado en el navegador. Podés habilitarlo desde la configuración del sitio.');
      return;
    }

    setRequestingNotification(true);
    try {
      const permission = await requestRestNotificationPermission();
      if (permission === 'granted') {
        setNotifyOnRestEnd(true);
        setNotificationNotice(null);
      } else if (permission === 'denied') {
        setNotifyOnRestEnd(false);
        setNotificationNotice('Permiso de notificaciones denegado. El aviso sonoro y visual sigue activo.');
      } else if (permission === 'unsupported') {
        setNotifyOnRestEnd(false);
        setNotificationNotice('Este navegador no soporta notificaciones nativas.');
      } else {
        setNotifyOnRestEnd(false);
        setNotificationNotice('No se otorgó el permiso. Podés activarlo cuando quieras.');
      }
    } finally {
      setRequestingNotification(false);
    }
  };

  const handleSave = () => {
    const saved = onSave({
      autoTimerEnabled: autoTimer,
      restBetweenSetsSeconds: Math.min(600, Math.max(15, setRest || 120)),
      restBetweenExercisesSeconds: Math.min(600, Math.max(15, exerciseRest || 180)),
      showQuickRestAdjustments: showQuickAdjustments,
      allowManualRestEditing: allowManualEditing,
    });
    if (saved === false) { setSaveError(true); return; }
    setRestNotificationEnabled(notifyOnRestEnd);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gym-rest-settings-title"
        data-gym-rest-settings
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3.5 sm:pt-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-indigo-300">
              <AppIcon name="stopwatch" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="gym-rest-settings-title" className="text-base font-bold text-[var(--text)]">
                Temporizador de descanso
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                Configurá el inicio automático y duraciones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] active:scale-95 transition"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 px-5 py-4">

        {/* Auto Timer Toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
          <div className="min-w-0">
            <span className="text-sm font-bold text-[var(--text)] block">
              Descanso automático
            </span>
            <span className="text-xs text-[var(--text-soft)] block">
              Inicia la cuenta regresiva al completar cada serie
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoTimer}
            aria-label="Descanso automático"
            onClick={() => setAutoTimer((prev) => !prev)}
            className={`gym-rest-switch relative inline-flex h-11 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
              autoTimer ? 'bg-[#4F46E5]' : 'bg-[var(--border-strong)]'
            }`}
          >
            <span
              className={`pointer-events-none absolute top-3 inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                autoTimer ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Rest between sets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="rest-sets-input" className="text-xs font-bold text-[var(--text)]">
              Descanso entre series
            </label>
            <span className="tabular-nums text-xs font-semibold text-[var(--text-soft)]">
              {setRest} segundos ({Math.floor(setRest / 60)}m {setRest % 60 ? `${setRest % 60}s` : ''})
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {SET_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setSetRest(seconds)}
                className={`min-h-11 rounded-xl border text-xs font-bold transition-colors ${
                  setRest === seconds
                    ? 'border-[#4F46E5] bg-[#4F46E5] text-white shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <input
            id="rest-sets-input"
            type="number"
            inputMode="numeric"
            min={15}
            max={600}
            step={15}
            value={setRest}
            onChange={(e) => setSetRest(Math.max(15, Math.min(600, Number(e.target.value) || 120)))}
            className="celestian-clean-field focus-visible:outline-none min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold tabular-nums text-[var(--text)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Rest between exercises */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="rest-exercises-input" className="text-xs font-bold text-[var(--text)]">
              Descanso al terminar ejercicio
            </label>
            <span className="tabular-nums text-xs font-semibold text-[var(--text-soft)]">
              {exerciseRest} segundos ({Math.floor(exerciseRest / 60)}m {exerciseRest % 60 ? `${exerciseRest % 60}s` : ''})
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {EXERCISE_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setExerciseRest(seconds)}
                className={`min-h-11 rounded-xl border text-xs font-bold transition-colors ${
                  exerciseRest === seconds
                    ? 'border-[#4F46E5] bg-[#4F46E5] text-white shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <input
            id="rest-exercises-input"
            type="number"
            inputMode="numeric"
            min={15}
            max={600}
            step={15}
            value={exerciseRest}
            onChange={(e) => setExerciseRest(Math.max(15, Math.min(600, Number(e.target.value) || 180)))}
            className="celestian-clean-field focus-visible:outline-none min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold tabular-nums text-[var(--text)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-sm font-bold text-[var(--text)]">
                  Notificar al terminar el descanso
                </span>
                <span className="block text-xs text-[var(--text-soft)]">
                  Aviso del dispositivo al llegar a 00:00
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifyOnRestEnd}
                aria-label="Notificar al terminar el descanso"
                disabled={requestingNotification}
                onClick={() => void handleToggleNotify()}
                className={`gym-rest-switch relative inline-flex h-11 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:opacity-60 ${
                  notifyOnRestEnd ? 'bg-[#4F46E5]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-3 inline-block h-5 w-5 rounded-full bg-white shadow-md transition duration-200 ${
                    notifyOnRestEnd ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {notificationNotice && (
              <p role="status" className="text-[11px] leading-relaxed text-[var(--text-soft)]">
                {notificationNotice}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text)]">Mostrar ajustes rápidos</span>
              <span className="block text-xs text-[var(--text-soft)]">Muestra −30 s y +30 s mientras descansás</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showQuickAdjustments}
              aria-label="Mostrar ajustes rápidos de descanso"
              onClick={() => setShowQuickAdjustments((current) => !current)}
              className={`gym-rest-switch relative inline-flex h-11 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                showQuickAdjustments ? 'bg-[#4F46E5]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span className={`pointer-events-none absolute top-3 inline-block h-5 w-5 rounded-full bg-white shadow-md transition duration-200 ${
                showQuickAdjustments ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text)]">Permitir edición manual</span>
              <span className="block text-xs text-[var(--text-soft)]">Añade una acción secundaria para editar el descanso en curso</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowManualEditing}
              aria-label="Permitir edición manual del descanso"
              onClick={() => setAllowManualEditing((current) => !current)}
              className={`gym-rest-switch relative inline-flex h-11 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                allowManualEditing ? 'bg-[#4F46E5]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span className={`pointer-events-none absolute top-3 inline-block h-5 w-5 rounded-full bg-white shadow-md transition duration-200 ${
                allowManualEditing ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        {saveError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">No se guardaron los ajustes. Podés volver a intentarlo.</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-xs font-bold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 rounded-xl bg-[#4F46E5] px-5 text-xs font-bold text-white shadow-xs hover:bg-[#4338CA] dark:hover:bg-[#6366F1]"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};
